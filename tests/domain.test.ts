import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  blankHabit,
  dateInZone,
  dayStreak,
  earnedAwards,
  nextReminder,
  onAgenda,
  periodStats,
  scheduled,
  streak,
  summary,
  type Habit,
} from '../src/lib/domain';
import { challengeInput, day, habitInput } from '../src/lib/validation';

const monday = '2026-02-02';
const makeHabit = (patch: Partial<Habit> = {}): Habit => ({
  ...blankHabit(monday),
  title: 'Читать',
  id: 'test-habit',
  position: 0,
  archived: null,
  logs: {},
  ...patch,
});

test('the next reminder follows local time and skips completed, expired and unscheduled days', () => {
  const habits = [
    makeHabit({ title: 'Already completed', reminder: '19:00', logs: { [monday]: 1 } }),
    makeHabit({ title: 'Expired', reminder: '19:00', end: monday, archived: monday }),
    makeHabit({ title: 'Past daily slot', reminder: '18:00' }),
    makeHabit({
      title: 'Upcoming on a custom date',
      reminder: '08:00',
      schedule: { mode: 'custom', dates: ['2026-02-06', '2026-02-03'], days: [], quota: 1 },
    }),
  ];
  assert.deepEqual(nextReminder(habits, 'Asia/Krasnoyarsk', new Date(`${monday}T11:30:00Z`)), {
    title: 'Upcoming on a custom date',
    day: '2026-02-03',
    time: '08:00',
  });
});

test('civil dates follow the user timezone across midnight and DST', () => {
  const instant = new Date('2026-03-08T18:00:00Z');
  assert.equal(dateInZone('Asia/Krasnoyarsk', instant), '2026-03-09');
  assert.equal(dateInZone('America/Los_Angeles', instant), '2026-03-08');
  assert.equal(day.safeParse('2026-02-29').success, false);
  assert.equal(day.safeParse('2024-02-29').success, true);
});

test('unscheduled days and an unfinished current day preserve a streak', () => {
  const goal = makeHabit({
    schedule: { mode: 'weekdays', days: [0, 2, 4], quota: 3, dates: [] },
    logs: { [monday]: 1, '2026-02-04': 1 },
  });
  assert.equal(scheduled(goal, '2026-02-05'), false);
  assert.equal(streak(goal, '2026-02-06').current, 2);
  assert.equal(dayStreak([goal], '2026-02-06'), 2);
  assert.deepEqual(streak(goal, '2026-02-07'), { current: 0, best: 2, weekly: false });
  assert.equal(dayStreak([goal], '2026-02-07'), 0);
});

test('weekly schedules count quota instead of treating every day as a miss', () => {
  const goal = makeHabit({
    schedule: { mode: 'weekly', days: [], quota: 2, dates: [] },
    logs: { '2026-02-03': 1, '2026-02-06': 1 },
  });
  assert.equal(onAgenda(goal, '2026-02-07'), false);
  assert.equal(streak(goal, '2026-02-08').current, 1);
  const stats = periodStats([goal], monday, '2026-02-08');
  assert.deepEqual([stats.planned, stats.done, stats.missed, stats.percent], [2, 2, 0, 100]);
  const short = periodStats([goal], '2026-02-06', '2026-02-08');
  assert.deepEqual([short.planned, short.done], [1, 1]);
  assert.equal(dayStreak([goal], '2026-02-08'), 2);
  const flexible = { ...goal, logs: { '2026-02-03': 1 } };
  assert.equal(periodStats([flexible], monday, '2026-02-06').missed, 0);
  assert.equal(periodStats([flexible], monday, '2026-02-08').missed, 1);
});

test('quantitative goals require the full amount, dated and archived goals respect their boundaries', () => {
  const goal = makeHabit({
    kind: 'count',
    target: 8,
    archived: '2026-02-08',
    end: '2026-02-09',
    schedule: { mode: 'custom', days: [], quota: 1, dates: [monday, '2026-02-06', '2026-02-08'] },
    logs: { [monday]: 7, '2026-02-06': 8 },
  });
  assert.deepEqual(summary([goal], monday), { planned: 1, done: 0, percent: 0 });
  assert.deepEqual(summary([goal], '2026-02-06'), { planned: 1, done: 1, percent: 100 });
  assert.equal(summary([goal], '2026-02-08').planned, 0);
});

test('awards reflect a complete calendar week and challenge participation', () => {
  const logs = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [`2026-02-0${index + 2}`, 1]));
  assert.deepEqual(earnedAwards([makeHabit({ logs })], '2026-02-07'), ['first']);
  assert.deepEqual(earnedAwards([makeHabit({ logs })], '2026-02-08', true), [
    'first',
    'week',
    'team',
    'perfect',
  ]);
});

test('validation rejects impossible schedules and normalizes yes/no goals', () => {
  const goal = makeHabit();
  assert.equal(habitInput.safeParse({ ...goal, end: '2026-01-01' }).success, false);
  assert.equal(
    habitInput.safeParse({
      ...goal,
      schedule: { ...goal.schedule, mode: 'custom', dates: ['2026-01-01'] },
    }).success,
    false,
  );
  assert.equal(habitInput.parse({ ...goal, kind: 'avoid', target: 50 }).target, 1);
  assert.equal(
    challengeInput.safeParse({
      title: 'Цель',
      description: '',
      icon: '🌱',
      start: monday,
      end: '2028-01-01',
      rules: '',
      mode: 'solo',
    }).success,
    false,
  );
});
