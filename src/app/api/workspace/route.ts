import { requireUser } from '@/auth';
import { AppError, errorResponse, rateLimit, readJson, sameOrigin } from '@/lib/db';
import { snapshot } from '@/lib/data';
import { mutate } from '@/lib/mutations';
import { action } from '@/lib/validation';

export async function GET() {
  try {
    const userId = await requireUser();
    await rateLimit(`read:${userId}`, 180, 60);
    return Response.json(await snapshot(userId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const userId = await requireUser();
    await rateLimit(`write:${userId}`, 120, 60);
    const input = action.safeParse(await readJson(request));
    if (!input.success) throw new AppError(input.error.issues[0].message);
    if (input.data.type === 'testReminder') await rateLimit(`test-reminder:${userId}`, 3, 60);
    const { habitInvitesCreated } = await mutate(userId, input.data);
    const data = await snapshot(userId);
    return Response.json(
      input.data.type === 'saveHabit' && input.data.invites.length ? { ...data, habitInvitesCreated } : data,
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
