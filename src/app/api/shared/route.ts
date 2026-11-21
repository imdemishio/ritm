import { requireUser } from '@/auth';
import { habit, habitInclude, person, personSelect } from '@/lib/data';
import { AppError, db, errorResponse, rateLimit } from '@/lib/db';
import { dateInZone, monday, periodStats, type SharedResult } from '@/lib/domain';
import { id } from '@/lib/validation';

export async function GET(request: Request) {
  try {
    const userId = await requireUser();
    await rateLimit(`shared:${userId}`, 60, 60);
    const parsed = id.safeParse(new URL(request.url).searchParams.get('habit'));
    if (!parsed.success) throw new AppError('Привычка не найдена.', 404);
    const own = await db.habit.findFirst({
      where: { id: parsed.data, userId },
      select: { id: true, linkedHabitId: true },
    });
    if (!own) throw new AppError('Привычка не найдена.', 404);
    const root = own.linkedHabitId ?? own.id;
    const friends = await db.friendship.findMany({
      where: { status: 'accepted', OR: [{ senderId: userId }, { recipientId: userId }] },
      select: { senderId: true, recipientId: true },
    });
    const friendsIds = friends.map((friend) =>
      friend.senderId === userId ? friend.recipientId : friend.senderId,
    );
    const rows = await db.habit.findMany({
      where: {
        OR: [{ id: root }, { linkedHabitId: root }],
        userId: { in: friendsIds },
        visibility: 'friends',
        user: { settings: { is: { privacy: { not: 'private' } } } },
      },
      include: {
        ...habitInclude,
        user: { select: { ...personSelect, settings: { select: { timezone: true } } } },
      },
    });
    const result: SharedResult[] = rows.map((row) => {
      const { settings, ...identity } = row.user;
      const today = dateInZone(settings?.timezone ?? 'UTC');
      const { done, planned } = periodStats([habit(row)], monday(today), today);
      return { person: person({ ...identity, bio: '' }), done, planned };
    });
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
