import { locale } from './locale';

export const accentColors = ['#B6F36B', '#7DB8FF', '#BE9CF9', '#FF9B89', '#F3CC73', '#68DEC2'];
export const icons = [
  'water',
  'book',
  'run',
  'meditate',
  'sleep',
  'sun',
  'leaf',
  'coffee',
  'heart',
  'code',
  'music',
  'food',
  '🏆',
  '🎯',
  '🌱',
  '💪',
  '✨',
  '🧠',
];
export const categories = ['Здоровье', 'Спорт', 'Саморазвитие', 'Осознанность', 'Работа', 'Другое'];
export const kinds = { check: 'Отметка', count: 'Количество', time: 'Время', avoid: 'Отказ' } as const;
export const scheduleLabels = {
  daily: 'Каждый день',
  weekdays: 'Дни недели',
  weekly: 'Раз в неделю',
  custom: 'Свои даты',
} as const;
export const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const achievements = [
  { id: 'first', title: 'Первый шаг', description: 'Выполнить первую привычку', icon: '🌱' },
  { id: 'week', title: 'Неделя дисциплины', description: 'Поддерживать серию из 7 дней', icon: '🔥' },
  { id: 'month', title: 'Месяц стабильности', description: 'Поддерживать серию из 30 дней', icon: '🌙' },
  { id: 'iron', title: 'Железная воля', description: 'Поддерживать серию из 100 дней', icon: '⚡' },
  {
    id: 'team',
    title: 'Командный игрок',
    description: 'Завершить челлендж с другим участником',
    icon: '🤝',
  },
  {
    id: 'perfect',
    title: 'Идеальная неделя',
    description: 'Выполнить все цели календарной недели',
    icon: '🏅',
  },
];

export type Kind = keyof typeof kinds;
export type Schedule = {
  mode: keyof typeof scheduleLabels;
  days: number[];
  quota: number;
  dates: string[];
};
export type HabitInput = {
  title: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  kind: Kind;
  target: number;
  unit: string;
  start: string;
  end: string | null;
  reminder: string | null;
  visibility: 'private' | 'friends';
  schedule: Schedule;
};
export type Habit = HabitInput & {
  id: string;
  archived: string | null;
  position: number;
  logs: Record<string, number>;
  linkedHabitId?: string | null;
};
export type SharedResult = { person: Person; done: number; planned: number };
export type Person = {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  bio: string;
  createdAt: string;
};
export type Preferences = { reminders: boolean; social: boolean; achievements: boolean };
export type Settings = {
  theme: 'dark' | 'light';
  accent: string;
  timezone: string;
  privacy: 'private' | 'friends' | 'public';
  onboarded: boolean;
};
export type Profile = Person & {
  settings: Settings;
  preferences: Preferences;
  xp: number;
  awards: string[];
};
export type Friend = { id: string; status: string; incoming: boolean; person: Person };
export type FeedItem = {
  id: string;
  kind: string;
  title: string;
  icon: string;
  createdAt: string;
  person: Person;
  reactions: { emoji: string; userId: string }[];
};
export type Note = {
  id: string;
  kind: string;
  text: string;
  href: string;
  read: boolean;
  createdAt: string;
};
export type ChallengeInput = {
  title: string;
  description: string;
  icon: string;
  start: string;
  end: string;
  rules: string;
  mode: 'solo' | 'team';
};
export type Challenge = ChallengeInput & {
  id: string;
  ownerId: string;
  code: string;
  members: { person: Person; status: string; days: { day: string; createdAt: string }[] }[];
};
export type HabitInvitation = { habitId: string; title: string; icon: string; inviter: Person };
export type SentHabitInvitation = { habitId: string; userId: string; status: string };
export type Snapshot = {
  profile: Profile;
  habits: Habit[];
  friends: Friend[];
  feed: FeedItem[];
  challenges: Challenge[];
  notifications: Note[];
  invites: HabitInvitation[];
  sentInvites?: SentHabitInvitation[];
};

export const defaultSettings: Settings = {
  theme: 'dark',
  accent: accentColors[0],
  timezone: 'UTC',
  privacy: 'friends',
  onboarded: false,
};
export const defaultPreferences: Preferences = { reminders: true, social: true, achievements: true };
export const testReminderText = 'Пробное напоминание. Уведомления в ленте работают.';
const dayMs = 86_400_000;
const civilDates = new Map<string, Intl.DateTimeFormat>();
const localTimes = new Map<string, Intl.DateTimeFormat>();
const displayDates = new Map<string, Intl.DateTimeFormat>();
export const asDate = (day: string) => new Date(`${day}T12:00:00Z`);
export function dateInZone(timezone: string, time = new Date()) {
  let formatter = civilDates.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    civilDates.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(time);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function reminderTimeInZone(timezone: string, time: Date) {
  let formatter = localTimes.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    localTimes.set(timezone, formatter);
  }
  return formatter.format(time);
}
export function addDays(day: string, amount: number) {
  return new Date(asDate(day).getTime() + dayMs * amount).toISOString().slice(0, 10);
}
export const weekday = (day: string) => (asDate(day).getUTCDay() + 6) % 7;
export const monday = (day: string) => addDays(day, -weekday(day));
export const daySpan = (start: string, end: string) =>
  Math.max(0, Math.round((asDate(end).getTime() - asDate(start).getTime()) / dayMs) + 1);
export const daysBetween = (start: string, end: string) =>
  Array.from({ length: daySpan(start, end) }, (_, index) => addDays(start, index));
export const weekOf = (day: string) => daysBetween(monday(day), addDays(monday(day), 6));
export function formatDay(day: string, options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(options);
  let formatter = displayDates.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale.region, { ...options, timeZone: 'UTC' });
    displayDates.set(key, formatter);
  }
  return formatter.format(asDate(day));
}
export const capitalize = (label: string) => label.charAt(0).toUpperCase() + label.slice(1);
export function plural(value: number, words: [string, string, string]) {
  const lastTwo = value % 100;
  const last = value % 10;
  return `${value} ${words[lastTwo > 10 && lastTwo < 15 ? 2 : last === 1 ? 0 : last > 1 && last < 5 ? 1 : 2]}`;
}
export const isDone = (habit: Habit, day: string) => (habit.logs[day] ?? 0) >= habit.target;
export function scheduled(habit: Habit, day: string) {
  if (day < habit.start || (habit.end && day > habit.end) || (habit.archived && day >= habit.archived))
    return false;
  if (habit.schedule.mode === 'weekdays') return habit.schedule.days.includes(weekday(day));
  if (habit.schedule.mode === 'custom') return habit.schedule.dates.includes(day);
  return true;
}
export function onAgenda(habit: Habit, day: string) {
  if (!scheduled(habit, day)) return false;
  if (habit.schedule.mode !== 'weekly' || isDone(habit, day)) return true;
  return (
    daysBetween(monday(day), addDays(day, -1)).filter(
      (date) => scheduled(habit, date) && isDone(habit, date),
    ).length < habit.schedule.quota
  );
}
export function nextReminder(habits: Habit[], timezone: string, now: Date) {
  const today = dateInZone(timezone, now);
  const currentTime = reminderTimeInZone(timezone, now);
  let next: { title: string; day: string; time: string } | undefined;
  for (const habit of habits) {
    const time = habit.reminder;
    if (!time || habit.archived) continue;
    const start = habit.start > today ? habit.start : today;
    // A recurring schedule repeats within a week. Custom schedules can have longer gaps.
    const days = habit.schedule.mode === 'custom' ? habit.schedule.dates : daysBetween(start, addDays(start, 7));
    for (const day of days) {
      if (day < start || (day === today && time < currentTime)) continue;
      if (!onAgenda(habit, day) || isDone(habit, day)) continue;
      if (!next || day < next.day || (day === next.day && time < next.time)) {
        next = { title: habit.title, day, time };
      }
    }
  }
  return next;
}
export function summary(habits: Habit[], day: string) {
  const planned = habits.filter((habit) => onAgenda(habit, day));
  const done = planned.filter((habit) => isDone(habit, day)).length;
  return {
    planned: planned.length,
    done,
    percent: planned.length ? Math.round((done * 100) / planned.length) : 0,
  };
}
export function streak(habit: Habit, until: string) {
  let current = 0;
  let best = 0;
  if (habit.schedule.mode === 'weekly') {
    const quota = habit.schedule.quota;
    for (let start = monday(habit.start); start <= until; start = addDays(start, 7)) {
      const week = weekOf(start).filter((day) => scheduled(habit, day));
      if (!week.length) continue;
      const done = week.filter((day) => day <= until && isDone(habit, day)).length;
      if (done >= Math.min(week.length, quota)) current += 1;
      else if (addDays(start, 6) < until || week[week.length - 1] < until) current = 0;
      best = Math.max(current, best);
    }
    return { current, best, weekly: true };
  }
  for (const day of daysBetween(habit.start, until)) {
    if (!scheduled(habit, day)) continue;
    if (isDone(habit, day)) current += 1;
    else if (day < until) current = 0;
    best = Math.max(current, best);
  }
  return { current, best, weekly: false };
}
export function dayStreak(habits: Habit[], until: string) {
  if (!habits.length) return 0;
  const start = habits.reduce(
    (earliest, habit) => (habit.start < earliest ? habit.start : earliest),
    until,
  );
  let count = 0;
  for (let end = until; end >= start; end = addDays(monday(end), -1)) {
    const { entries } = periodStats(habits, monday(end), end);
    for (const result of entries.reverse()) {
      if (!result.planned) continue;
      if (result.percent === 100) count += 1;
      else if (result.day !== until) return count;
    }
  }
  return count;
}
export function periodStats(habits: Habit[], start: string, end: string) {
  const dates = daysBetween(start, end);
  const fixed = habits.filter((habit) => habit.schedule.mode !== 'weekly');
  const entries = dates.map((day) => ({ day, ...summary(fixed, day) }));
  const byDay = new Map(entries.map((entry) => [entry.day, entry]));
  const flexible = habits.filter((habit) => habit.schedule.mode === 'weekly');
  for (const habit of flexible) {
    for (let week = monday(start); week <= end; week = addDays(week, 7)) {
      const eligible = weekOf(week).filter((day) => scheduled(habit, day));
      const recorded = eligible.filter((day) => isDone(habit, day));
      const missing = Math.max(0, Math.min(eligible.length, habit.schedule.quota) - recorded.length);
      const missed = missing ? eligible.filter((day) => !isDone(habit, day)).slice(-missing) : [];
      for (const day of recorded) {
        const entry = byDay.get(day);
        if (entry) {
          entry.planned++;
          entry.done++;
        }
      }
      for (const day of missed) {
        const entry = byDay.get(day);
        if (entry) entry.planned++;
      }
    }
  }
  const planned = entries.reduce((sum, entry) => sum + entry.planned, 0);
  const done = entries.reduce((sum, entry) => sum + entry.done, 0);
  return {
    entries: entries.map((entry) => ({
      ...entry,
      percent: entry.planned ? Math.round((entry.done * 100) / entry.planned) : 0,
    })),
    planned,
    done,
    percent: planned ? Math.round((done * 100) / planned) : 0,
    missed: entries.filter((entry) => entry.done < entry.planned).length,
  };
}
export function earnedAwards(habits: Habit[], today: string, team = false) {
  const earned = new Set<string>();
  if (habits.some((habit) => Object.keys(habit.logs).some((day) => isDone(habit, day))))
    earned.add('first');
  const best = Math.max(
    0,
    ...habits
      .filter((habit) => habit.schedule.mode !== 'weekly')
      .map((habit) => streak(habit, today).best),
  );
  if (best >= 7) earned.add('week');
  if (best >= 30) earned.add('month');
  if (best >= 100) earned.add('iron');
  if (team) earned.add('team');
  if (habits.length) {
    const earliest = habits.reduce((start, habit) => (habit.start < start ? habit.start : start), today);
    for (let day = monday(today); day >= monday(earliest); day = addDays(day, -7)) {
      const last = addDays(day, 6);
      if (last > today) continue;
      const result = periodStats(habits, day, last);
      if (result.planned && result.done === result.planned) {
        earned.add('perfect');
        break;
      }
    }
  }
  return [...earned];
}

export function blankHabit(day: string): HabitInput {
  return {
    title: '',
    description: '',
    icon: 'leaf',
    color: accentColors[0],
    category: categories[0],
    kind: 'check',
    target: 1,
    unit: '',
    start: day,
    end: null,
    reminder: null,
    visibility: 'private',
    schedule: { mode: 'daily', days: [0, 2, 4], quota: 3, dates: [] },
  };
}
