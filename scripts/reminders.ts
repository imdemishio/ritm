import { db } from '../src/lib/db';
import { habit, habitInclude } from '../src/lib/data';
import { addDays, dateInZone, isDone, onAgenda, reminderTimeInZone } from '../src/lib/domain';
import { notify } from '../src/lib/mutations';
import { deliverPush } from '../src/lib/push';

const pollMs = 25_000;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    stopping = true;
  });

async function run() {
  const now = new Date();
  const recent = addDays(dateInZone('UTC', now), -8);
  const reminders = await db.habit.findMany({
    where: {
      reminder: { not: null },
      archived: null,
      user: { preferences: { is: { reminders: true } } },
    },
    include: {
      ...habitInclude,
      logs: { where: { day: { gte: recent } } },
      user: { select: { settings: { select: { timezone: true } } } },
    },
  });
  for (const row of reminders) {
    const timezone = row.user.settings?.timezone ?? 'UTC';
    const time = reminderTimeInZone(timezone, now);
    const day = dateInZone(timezone, now);
    const goal = habit(row);
    if (row.reminder !== time || !onAgenda(goal, day) || isDone(goal, day)) continue;
    const messages: { userId: string; text: string; href: string; tag: string }[] = [];
    await db.$transaction(async (tx) => {
      const latest = await tx.habitLog.findUnique({ where: { habitId_day: { habitId: row.id, day } } });
      if ((latest?.value ?? 0) < row.target)
        await notify(
          tx,
          messages,
          row.userId,
          'reminders',
          `Время для привычки «${row.title}»`,
          '/',
          `reminder:${row.id}:${day}`,
        );
    });
    await Promise.allSettled(
      messages.map((message) => deliverPush(message.userId, message.text, message.href, message.tag)),
    );
  }
}

let lastCleanup = 0;
async function loop() {
  while (!stopping) {
    try {
      await run();
      if (Date.now() - lastCleanup > 3_600_000) {
        const now = new Date();
        await Promise.all([
          db.rateLimit.deleteMany({ where: { expires: { lt: now } } }),
          db.session.deleteMany({ where: { expires: { lt: now } } }),
          db.passwordReset.deleteMany({ where: { expires: { lt: now } } }),
        ]);
        lastCleanup = Date.now();
      }
    } catch (error) {
      console.error('Ritm reminder loop:', error instanceof Error ? error.name : typeof error);
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  await db.$disconnect();
}

if (process.argv.includes('--once')) {
  void run()
    .catch((error) => {
      console.error('Ritm reminders:', error instanceof Error ? error.name : typeof error);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
} else void loop();
