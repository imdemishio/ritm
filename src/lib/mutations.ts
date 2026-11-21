import { Prisma } from '@/generated/prisma/client';
import { allowedActivities, habit, habitInclude, habitsFor, pair, type Db } from './data';
import { AppError, db } from './db';
import { achievements, dateInZone, daySpan, earnedAwards, isDone, scheduled, streak, testReminderText } from './domain';
import { allowedPushEndpoint, deliverPush } from './push';
import type { ValidAction } from './validation';

type Delivery = { userId: string; text: string; href: string; tag: string };
export async function notify(
  tx: Db,
  queue: Delivery[],
  userId: string,
  kind: 'social' | 'achievements' | 'reminders',
  text: string,
  href: string,
  dedupe: string,
) {
  const preferences = await tx.notificationPreference.findUnique({ where: { userId } });
  if (preferences?.[kind] === false) return;
  const result = await tx.notification.createMany({
    data: [{ userId, kind, text, href, dedupe }],
    skipDuplicates: true,
  });
  if (result.count) queue.push({ userId, text, href, tag: dedupe });
}
async function event(
  tx: Db,
  userId: string,
  kind: string,
  title: string,
  icon: string,
  eventKey: string,
  sourceId?: string,
) {
  await tx.activity.createMany({
    data: [{ userId, kind, title, icon, eventKey, sourceId }],
    skipDuplicates: true,
  });
}
async function xp(tx: Db, userId: string, amount: number, eventKey: string) {
  await tx.xPTransaction.createMany({ data: [{ userId, amount, eventKey }], skipDuplicates: true });
}
async function award(tx: Db, queue: Delivery[], userId: string, today: string, team = false) {
  const ids = earnedAwards(await habitsFor(tx, userId), today, team);
  for (const item of achievements.filter((achievement) => ids.includes(achievement.id))) {
    await tx.achievement.upsert({ where: { id: item.id }, create: item, update: {} });
    const result = await tx.userAchievement.createMany({
      data: [{ userId, achievementId: item.id }],
      skipDuplicates: true,
    });
    if (!result.count) continue;
    await event(tx, userId, 'achievement', item.title, item.icon, `award:${item.id}`);
    await notify(
      tx,
      queue,
      userId,
      'achievements',
      `Новое достижение — ${item.title}`,
      '/?view=awards',
      `award:${item.id}`,
    );
  }
}
async function ownedHabit(tx: Db, userId: string, id: string) {
  const row = await tx.habit.findFirst({ where: { id, userId }, include: habitInclude });
  if (!row) throw new AppError('Привычка не найдена.', 404);
  return row;
}
async function requireFriend(tx: Db, userId: string, friendId: string) {
  const friend = await tx.friendship.findUnique({ where: { pair: pair(userId, friendId) } });
  if (friend?.status !== 'accepted') throw new AppError('Приглашать можно друзей.', 403);
}

export async function mutate(userId: string, input: ValidAction) {
  const { queue, habitInvitesCreated } = await db.$transaction(
    async (tx) => {
      // Serialize changes for a single account, including check-in and award calculations.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { name: true, settings: true },
      });
      const today = dateInZone(user.settings?.timezone ?? 'UTC');
      const queue: Delivery[] = [];
      let habitInvitesCreated = 0;
      switch (input.type) {
        case 'saveHabit': {
          const { schedule, ...details } = input.habit;
          if (
            daySpan(
              details.start < today ? details.start : today,
              details.start < today ? today : details.start,
            ) > 3660
          )
            throw new AppError('Дата начала слишком далеко от текущей.');
          if (input.id) await ownedHabit(tx, userId, input.id);
          const position = input.id
            ? 0
            : ((await tx.habit.aggregate({ where: { userId }, _max: { position: true } }))._max
                .position ?? -1);
          const row = input.id
            ? await tx.habit.update({
                where: { id: input.id },
                data: { ...details, schedule: { upsert: { create: schedule, update: schedule } } },
              })
            : await tx.habit.create({
                data: { ...details, userId, position: position + 1, schedule: { create: schedule } },
              });
          if (row.linkedHabitId && input.invites.length)
            throw new AppError('Приглашения отправляет автор совместной привычки.');
          for (const friendId of new Set(input.invites)) {
            await requireFriend(tx, userId, friendId);
            const inserted = await tx.habitInvite.createMany({
              data: [{ userId: friendId, habitId: row.id }],
              skipDuplicates: true,
            });
            habitInvitesCreated += inserted.count;
            if (inserted.count)
              await notify(
                tx,
                queue,
                friendId,
                'social',
                `${user.name} приглашает в привычку «${row.title}»`,
                '/?view=friends',
                `habit:${row.id}`,
              );
          }
          break;
        }
        case 'log': {
          const row = habit(await ownedHabit(tx, userId, input.id));
          if (input.day > today || !scheduled(row, input.day))
            throw new AppError('В этот день привычка недоступна.');
          const key = { habitId: input.id, day: input.day };
          const value = Math.min(input.value, row.target);
          if (value)
            await tx.habitLog.upsert({
              where: { habitId_day: key },
              create: { ...key, value },
              update: { value },
            });
          else await tx.habitLog.deleteMany({ where: key });
          const logKey = `log:${input.id}:${input.day}`;
          if (value < row.target) {
            await tx.activity.deleteMany({
              where: { userId, eventKey: { in: [logKey, `streak:${logKey}`, `record:${logKey}`] } },
            });
          } else if (!isDone(row, input.day)) {
            await xp(tx, userId, 10, logKey);
            await event(tx, userId, 'habit', row.title, row.icon, logKey, row.id);
            const previous = streak(row, today);
            const next = streak({ ...row, logs: { ...row.logs, [input.day]: value } }, today);
            if ([7, 14, 30, 50, 100].includes(next.current) && next.current > previous.current)
              await event(
                tx,
                userId,
                'streak',
                `${row.title} · новая серия`,
                '🔥',
                `streak:${logKey}`,
                row.id,
              );
            if (next.best >= 3 && next.best > previous.best)
              await event(
                tx,
                userId,
                'record',
                `${row.title} · личный рекорд`,
                '⚡',
                `record:${logKey}`,
                row.id,
              );
            await award(tx, queue, userId, today);
          }
          break;
        }
        case 'archive':
          await ownedHabit(tx, userId, input.id);
          await tx.habit.update({
            where: { id: input.id },
            data: { archived: input.archived ? today : null },
          });
          break;
        case 'deleteHabit':
          await ownedHabit(tx, userId, input.id);
          await tx.activity.deleteMany({ where: { userId, sourceId: input.id } });
          await tx.habit.delete({ where: { id: input.id } });
          break;
        case 'reorder': {
          const own = await tx.habit.findMany({ where: { userId }, select: { id: true } });
          const available = new Set(own.map((item) => item.id));
          if (input.ids.some((id) => !available.has(id)) || new Set(input.ids).size !== input.ids.length)
            throw new AppError('Неверный порядок привычек.');
          await Promise.all(
            [
              ...input.ids,
              ...own.filter((item) => !input.ids.includes(item.id)).map((item) => item.id),
            ].map((id, position) => tx.habit.update({ where: { id }, data: { position } })),
          );
          break;
        }
        case 'profile':
          await tx.user.update({ where: { id: userId }, data: input.profile });
          break;
        case 'settings':
          await tx.userSettings.upsert({
            where: { userId },
            create: { userId, ...input.settings },
            update: input.settings,
          });
          break;
        case 'preferences':
          await tx.notificationPreference.upsert({
            where: { userId },
            create: { userId, ...input.preferences },
            update: input.preferences,
          });
          break;
        case 'sendFriend': {
          if (
            input.id === userId ||
            !(await tx.user.findUnique({ where: { id: input.id }, select: { id: true } }))
          )
            throw new AppError('Пользователь не найден.', 404);
          const key = pair(userId, input.id);
          if (await tx.friendship.findUnique({ where: { pair: key } }))
            throw new AppError('Заявка уже существует.', 409);
          const row = await tx.friendship.create({
            data: { pair: key, senderId: userId, recipientId: input.id },
          });
          await notify(
            tx,
            queue,
            input.id,
            'social',
            `${user.name} отправил заявку в друзья`,
            '/?view=friends',
            `friend:${row.id}`,
          );
          break;
        }
        case 'friend': {
          const row = await tx.friendship.findFirst({
            where: { id: input.id, OR: [{ senderId: userId }, { recipientId: userId }] },
          });
          if (!row) throw new AppError('Заявка не найдена.', 404);
          if (input.decision === 'accept') {
            if (row.recipientId !== userId || row.status !== 'pending')
              throw new AppError('Заявку нельзя принять.', 403);
            await tx.friendship.update({ where: { id: row.id }, data: { status: 'accepted' } });
          } else await tx.friendship.delete({ where: { id: row.id } });
          break;
        }
        case 'react': {
          const visible = await tx.activity.findFirst({
            where: { id: input.id, ...(await allowedActivities(userId, tx)) },
            select: { id: true },
          });
          if (!visible) throw new AppError('Публикация недоступна.', 404);
          const key = { activityId: input.id, userId, emoji: input.emoji };
          if ((await tx.reaction.deleteMany({ where: key })).count === 0)
            await tx.reaction.create({ data: key });
          break;
        }
        case 'habitInvite': {
          const invite = await tx.habitInvite.findFirst({
            where: { habitId: input.id, userId, status: 'pending', habit: { archived: null } },
            include: { habit: { include: { schedule: true } } },
          });
          if (!invite) throw new AppError('Приглашение недоступно.', 404);
          if (input.accept) {
            await requireFriend(tx, userId, invite.habit.userId);
            const { id: _id, userId: _owner, schedule, linkedHabitId: _link, ...habit } = invite.habit;
            const details = schedule
              ? {
                  mode: schedule.mode,
                  dates: schedule.dates,
                  days: schedule.days,
                  quota: schedule.quota,
                }
              : undefined;
            const position =
              (await tx.habit.aggregate({ where: { userId }, _max: { position: true } }))._max
                .position ?? -1;
            await tx.habit.create({
              data: {
                ...habit,
                userId,
                linkedHabitId: invite.habitId,
                position: position + 1,
                visibility: 'friends',
                schedule: details ? { create: details } : undefined,
              },
            });
          }
          await tx.habitInvite.update({
            where: { habitId_userId: { habitId: input.id, userId } },
            data: { status: input.accept ? 'accepted' : 'declined' },
          });
          break;
        }
        case 'createChallenge': {
          const item = await tx.challenge.create({
            data: { ...input.challenge, ownerId: userId, members: { create: { userId } } },
          });
          if (item.mode === 'team')
            for (const friendId of new Set(input.invites)) {
              await requireFriend(tx, userId, friendId);
              await tx.challengeMember.create({
                data: { challengeId: item.id, userId: friendId, status: 'pending' },
              });
              await notify(
                tx,
                queue,
                friendId,
                'social',
                `${user.name} приглашает в челлендж «${item.title}»`,
                '/?view=challenges',
                `challenge:${item.id}`,
              );
            }
          break;
        }
        case 'join': {
          const item = await tx.challenge.findFirst({
            where: { code: input.code, mode: 'team', end: { gte: today } },
          });
          if (!item) throw new AppError('Ссылка недействительна или срок челленджа истёк.', 404);
          await tx.challengeMember.upsert({
            where: { challengeId_userId: { challengeId: item.id, userId } },
            create: { challengeId: item.id, userId },
            update: { status: 'active' },
          });
          break;
        }
        case 'challengeInvite': {
          const key = { challengeId: input.id, userId, status: 'pending' };
          const result = input.accept
            ? await tx.challengeMember.updateMany({
                where: { ...key, challenge: { end: { gte: today } } },
                data: { status: 'active' },
              })
            : await tx.challengeMember.deleteMany({ where: key });
          if (!result.count) throw new AppError('Приглашение недоступно.', 404);
          break;
        }
        case 'challengeDay': {
          const member = await tx.challengeMember.findFirst({
            where: { userId, challengeId: input.id, status: 'active' },
            include: { challenge: true },
          });
          if (
            !member ||
            input.day < member.challenge.start ||
            input.day > member.challenge.end ||
            input.day > today
          )
            throw new AppError('Отметка недоступна.', 403);
          const key = { challengeId: input.id, userId, day: input.day };
          if (input.marked) await tx.challengeCheck.createMany({ data: [key], skipDuplicates: true });
          else await tx.challengeCheck.deleteMany({ where: key });
          const count = await tx.challengeCheck.count({ where: { challengeId: input.id, userId } });
          if (count >= daySpan(member.challenge.start, member.challenge.end)) {
            await xp(tx, userId, 100, `challenge:${input.id}`);
            await event(
              tx,
              userId,
              'challenge',
              member.challenge.title,
              member.challenge.icon,
              `challenge:${input.id}`,
            );
            const size = await tx.challengeMember.count({
              where: { challengeId: input.id, status: 'active' },
            });
            await award(tx, queue, userId, today, size > 1);
            await notify(
              tx,
              queue,
              userId,
              'achievements',
              `Челлендж завершён — ${member.challenge.title}`,
              '/?view=challenges',
              `challenge-done:${input.id}`,
            );
          }
          break;
        }
        case 'read':
          await tx.notification.updateMany({ where: { userId, id: input.id }, data: { read: true } });
          break;
        case 'testReminder':
          await notify(
            tx, queue, userId, 'reminders', testReminderText, '/?view=settings',
            `test-reminder:${crypto.randomUUID()}`,
          );
          if (!queue.length) throw new AppError('Включите напоминания, чтобы отправить пробное уведомление.');
          break;
        case 'push': {
          if (!allowedPushEndpoint(input.endpoint))
            throw new AppError('Служба уведомлений браузера не поддерживается.');
          const { endpoint, p256dh, auth } = input;
          const existing = await tx.pushSubscription.findUnique({ where: { endpoint } });
          if (existing && (existing.p256dh !== p256dh || existing.auth !== auth))
            throw new AppError('Подписка недоступна.', 403);
          await tx.pushSubscription.upsert({
            where: { endpoint },
            create: { endpoint, userId, p256dh, auth },
            update: { userId },
          });
          break;
        }
        case 'unpush':
          await tx.pushSubscription.deleteMany({ where: { userId, endpoint: input.endpoint } });
          break;
      }
      return { queue, habitInvitesCreated };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 12_000 },
  );
  await Promise.allSettled(
    queue.map((item) => deliverPush(item.userId, item.text, item.href, item.tag)),
  );
  return { habitInvitesCreated };
}
