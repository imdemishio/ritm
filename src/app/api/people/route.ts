import { requireUser } from '@/auth';
import { habitsFor, pair, person, personSelect } from '@/lib/data';
import { AppError, db, errorResponse, rateLimit } from '@/lib/db';
import { addDays, dateInZone, periodStats, streak } from '@/lib/domain';
import { id } from '@/lib/validation';

export async function GET(request: Request) {
  try {
    const userId = await requireUser();
    await rateLimit(`people:${userId}`, 60, 60);
    const params = new URL(request.url).searchParams;
    const profileId = params.get('id');
    if (profileId) {
      if (!id.safeParse(profileId).success) throw new AppError('Профиль не найден.', 404);
      const profile = await db.user.findUnique({
        where: { id: profileId },
        select: { ...personSelect, settings: true },
      });
      if (!profile) throw new AppError('Профиль не найден.', 404);
      const { settings, ...identity } = profile;
      const relation = await db.friendship.findUnique({ where: { pair: pair(userId, profileId) } });
      const visible =
        settings?.privacy === 'public' ||
        (settings?.privacy === 'friends' && relation?.status === 'accepted');
      if (!visible) return Response.json({ person: { ...person(identity), bio: '' }, stats: null });
      const today = dateInZone(settings?.timezone ?? 'UTC');
      const habits = (await habitsFor(db, profileId)).filter((habit) => habit.visibility === 'friends');
      const { percent, done } = periodStats(habits, addDays(today, -29), today);
      return Response.json({
        person: person(identity),
        stats: {
          percent,
          done,
          best: Math.max(
            0,
            ...habits
              .filter((habit) => habit.schedule.mode !== 'weekly')
              .map((habit) => streak(habit, today).best),
          ),
        },
      });
    }
    const query = (params.get('q') ?? '').trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z\d_]{2,24}$/.test(query)) return Response.json([]);
    const users = await db.user.findMany({
      where: { username: { startsWith: query }, id: { not: userId } },
      orderBy: { username: 'asc' },
      select: personSelect,
      take: 15,
    });
    return Response.json(users.map(({ bio: _bio, ...row }) => person({ ...row, bio: '' })));
  } catch (error) {
    return errorResponse(error);
  }
}
