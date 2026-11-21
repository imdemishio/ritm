import type { Prisma } from '@/generated/prisma/client';
import { db } from './db';
import {
  defaultPreferences,
  defaultSettings,
  type Challenge,
  type Habit,
  type Person,
  type Settings,
  type Snapshot,
} from './domain';

export const personSelect = {
  id: true,
  name: true,
  username: true,
  avatar: true,
  bio: true,
  createdAt: true,
} as const;
export const habitInclude = { schedule: true, logs: true } as const;
export type Db = Prisma.TransactionClient;
export const person = (row: Omit<Person, 'createdAt'> & { createdAt: Date }): Person => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});
const brief = (row: Parameters<typeof person>[0]) => person({ ...row, bio: '' });
export function habit(row: Prisma.HabitGetPayload<{ include: typeof habitInclude }>): Habit {
  const { schedule, logs, userId: _userId, ...details } = row;
  return {
    ...details,
    kind: row.kind as Habit['kind'],
    visibility: row.visibility as Habit['visibility'],
    schedule: schedule
      ? {
          mode: schedule.mode as Habit['schedule']['mode'],
          days: schedule.days,
          quota: schedule.quota,
          dates: schedule.dates,
        }
      : { mode: 'daily', days: [], quota: 1, dates: [] },
    logs: Object.fromEntries(logs.map((log) => [log.day, log.value])),
  };
}
export async function habitsFor(client: Db, userId: string) {
  return (
    await client.habit.findMany({
      where: { userId },
      include: habitInclude,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    })
  ).map(habit);
}
export const pair = (first: string, second: string) => [first, second].sort().join(':');
export async function allowedActivities(
  userId: string,
  client: Db = db,
): Promise<Prisma.ActivityWhereInput> {
  const friends = await client.friendship.findMany({
    where: { status: 'accepted', OR: [{ senderId: userId }, { recipientId: userId }] },
    select: { senderId: true, recipientId: true },
  });
  const ids = friends.map((friend) =>
    friend.senderId === userId ? friend.recipientId : friend.senderId,
  );
  const sharedHabits = await client.habit.findMany({
    where: { userId: { in: ids }, visibility: 'friends' },
    select: { id: true },
  });
  return {
    userId: { in: ids },
    user: { settings: { is: { privacy: { not: 'private' } } } },
    OR: [
      { kind: { in: ['achievement', 'challenge'] } },
      {
        kind: { in: ['habit', 'streak', 'record'] },
        sourceId: { in: sharedHabits.map((item) => item.id) },
      },
    ],
  };
}

export async function snapshot(userId: string): Promise<Snapshot> {
  const feedWhere = await allowedActivities(userId);
  const [user, habits, friends, feed, challenges, notifications, invites, sentInvites, xp] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        ...personSelect,
        settings: true,
        preferences: true,
        achievements: { select: { achievementId: true } },
      },
    }),
    habitsFor(db, userId),
    db.friendship.findMany({
      where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      include: { sender: { select: personSelect }, recipient: { select: personSelect } },
      orderBy: { createdAt: 'desc' },
    }),
    db.activity.findMany({
      where: feedWhere,
      include: { user: { select: personSelect }, reactions: { select: { emoji: true, userId: true } } },
      take: 40,
      orderBy: { createdAt: 'desc' },
    }),
    db.challenge.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: {
          include: { user: { select: personSelect }, days: { select: { day: true, createdAt: true } } },
        },
      },
      orderBy: { start: 'desc' },
    }),
    db.notification.findMany({ where: { userId }, take: 50, orderBy: { createdAt: 'desc' } }),
    db.habitInvite.findMany({
      where: { userId, status: 'pending', habit: { archived: null } },
      include: { habit: { include: { user: { select: personSelect } } } },
    }),
    db.habitInvite.findMany({
      where: { habit: { userId } },
      select: { habitId: true, userId: true, status: true },
    }),
    db.xPTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
  ]);
  const { settings, preferences, achievements, ...identity } = user;
  return {
    profile: {
      ...person(identity),
      settings: settings
        ? {
            theme: settings.theme as Settings['theme'],
            accent: settings.accent,
            timezone: settings.timezone,
            privacy: settings.privacy as Settings['privacy'],
            onboarded: settings.onboarded,
          }
        : defaultSettings,
      preferences: preferences
        ? {
            reminders: preferences.reminders,
            social: preferences.social,
            achievements: preferences.achievements,
          }
        : defaultPreferences,
      xp: xp._sum.amount ?? 0,
      awards: achievements.map((item) => item.achievementId),
    },
    habits,
    friends: friends.map((item) => ({
      id: item.id,
      status: item.status,
      incoming: item.recipientId === userId,
      person: brief(item.senderId === userId ? item.recipient : item.sender),
    })),
    feed: feed.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      icon: item.icon,
      createdAt: item.createdAt.toISOString(),
      person: brief(item.user),
      reactions: item.reactions,
    })),
    challenges: challenges.map((item) => {
      const { members, ...challenge } = item;
      const active = members.some((member) => member.userId === userId && member.status === 'active');
      return {
        ...challenge,
        code: active ? challenge.code : '',
        mode: item.mode as Challenge['mode'],
        members: (active ? members : members.filter((member) => member.userId === userId)).map(
          (member) => ({
            person: brief(member.user),
            status: member.status,
            days: member.days.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
          }),
        ),
      };
    }),
    notifications: notifications.map(({ userId: _userId, dedupe: _dedupe, createdAt, ...note }) => ({
      ...note,
      createdAt: createdAt.toISOString(),
    })),
    invites: invites.map((item) => ({
      habitId: item.habitId,
      title: item.habit.title,
      icon: item.habit.icon,
      inviter: brief(item.habit.user),
    })),
    sentInvites,
  };
}
