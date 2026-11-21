import {
  achievements,
  blankHabit,
  dateInZone,
  defaultPreferences,
  defaultSettings,
  earnedAwards,
  isDone,
  testReminderText,
  type Habit,
  type Snapshot,
} from './domain';
import { action, type Action } from './validation';

export const isGuestExample = (habit: Habit) => /^starter-[0-3]$/.test(habit.id);

export function guestSnapshot(): Snapshot {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const today = dateInZone(timezone);
  const presets = [
    {
      title: 'Выпить воду',
      description: 'Пить воду в течение дня',
      icon: 'water',
      color: '#7DB8FF',
      category: 'Здоровье',
      kind: 'count',
      target: 8,
      unit: 'стак.',
    },
    {
      title: 'Читать 20 минут',
      description: 'Время для хорошей книги',
      icon: 'book',
      color: '#BE9CF9',
      category: 'Саморазвитие',
      kind: 'time',
      target: 20,
      unit: 'мин',
    },
    {
      title: 'Прогулка на свежем воздухе',
      description: '30 минут без телефона',
      icon: 'run',
      color: '#B6F36B',
      category: 'Здоровье',
      kind: 'check',
      target: 1,
      unit: '',
    },
    {
      title: 'Медитация',
      description: 'Начать утро с паузы',
      icon: 'meditate',
      color: '#FF9B89',
      category: 'Осознанность',
      kind: 'time',
      target: 10,
      unit: 'мин',
    },
  ] as const;
  const habits: Habit[] = presets.map((item, position) => ({
    ...blankHabit(today),
    ...item,
    position,
    id: `starter-${position}`,
    archived: null,
    logs: {},
  }));
  return {
    profile: {
      id: 'guest',
      name: 'Гость',
      username: 'guest',
      avatar: null,
      bio: '',
      createdAt: new Date().toISOString(),
      settings: { ...defaultSettings, timezone, onboarded: true },
      preferences: defaultPreferences,
      xp: 0,
      awards: [],
    },
    habits,
    friends: [],
    feed: [],
    challenges: [],
    invites: [],
    notifications: [],
  };
}

export function applyGuest(state: Snapshot, input: Action): Snapshot {
  const data = action.parse(input);
  const next = structuredClone(state);
  const today = dateInZone(next.profile.settings.timezone);
  const habit = 'id' in data ? next.habits.find((item) => item.id === data.id) : undefined;
  let savedKeys: string[] = [];
  try {
    savedKeys = JSON.parse(localStorage.getItem('ritm.guest.xp') ?? '[]');
  } catch {
    /* Browser storage may be unavailable. */
  }
  const xpKeys = new Set(savedKeys);
  const awardXp = (key: string, amount: number) => {
    if (!xpKeys.has(key)) {
      xpKeys.add(key);
      next.profile.xp += amount;
    }
  };
  switch (data.type) {
    case 'saveHabit':
      if (habit) Object.assign(habit, data.habit);
      else
        next.habits.push({
          ...data.habit,
          id: crypto.randomUUID(),
          archived: null,
          logs: {},
          position: next.habits.length,
        });
      break;
    case 'log':
      if (habit) {
        const before = isDone(habit, data.day);
        if (data.value) habit.logs[data.day] = data.value;
        else delete habit.logs[data.day];
        if (!before && isDone(habit, data.day)) awardXp(`${habit.id}:${data.day}`, 10);
      }
      break;
    case 'archive':
      if (habit) habit.archived = data.archived ? today : null;
      break;
    case 'deleteHabit':
      next.habits = next.habits.filter((item) => item.id !== data.id);
      break;
    case 'reorder': {
      const ordered = data.ids
        .map((id) => next.habits.find((item) => item.id === id))
        .filter((item) => item !== undefined);
      next.habits = [...ordered, ...next.habits.filter((item) => !data.ids.includes(item.id))].map(
        (item, position) => ({ ...item, position }),
      );
      break;
    }
    case 'profile':
      Object.assign(next.profile, data.profile);
      break;
    case 'settings':
      next.profile.settings = data.settings;
      break;
    case 'preferences':
      next.profile.preferences = data.preferences;
      break;
    case 'createChallenge': {
      if (data.challenge.mode === 'team') throw new Error('Войдите, чтобы создать командный челлендж.');
      const { id, name, username, avatar, bio, createdAt } = next.profile;
      next.challenges.unshift({
        ...data.challenge,
        id: crypto.randomUUID(),
        ownerId: id,
        code: '',
        members: [
          { status: 'active', person: { id, name, username, avatar, bio, createdAt }, days: [] },
        ],
      });
      break;
    }
    case 'challengeDay': {
      const challenge = next.challenges.find((item) => item.id === data.id);
      const member = challenge?.members[0];
      if (
        !challenge ||
        !member ||
        data.day < challenge.start ||
        data.day > challenge.end ||
        data.day > today
      )
        throw new Error('Отметка недоступна.');
      member.days = member.days.filter((item) => item.day !== data.day);
      if (data.marked) member.days.push({ day: data.day, createdAt: new Date().toISOString() });
      if (
        member.days.length >=
        (Date.parse(challenge.end) - Date.parse(challenge.start)) / 86_400_000 + 1
      )
        awardXp(`challenge:${challenge.id}`, 100);
      break;
    }
    case 'read':
      next.notifications = next.notifications.map((note) => ({
        ...note,
        read: !data.id || data.id === note.id || note.read,
      }));
      break;
    case 'testReminder':
      if (!next.profile.preferences.reminders) {
        throw new Error('Включите напоминания, чтобы отправить пробное уведомление.');
      }
      next.notifications.unshift({
        id: crypto.randomUUID(),
        kind: 'reminders',
        text: testReminderText,
        href: '/?view=settings',
        read: false,
        createdAt: new Date().toISOString(),
      });
      break;
    default:
      throw new Error('Для этого действия нужен аккаунт.');
  }
  const unlocked = earnedAwards(next.habits, today).filter((id) => !next.profile.awards.includes(id));
  next.profile.awards.push(...unlocked);
  for (const id of unlocked)
    if (next.profile.preferences.achievements)
      next.notifications.unshift({
        id,
        kind: 'achievements',
        text: `Новое достижение — ${achievements.find((item) => item.id === id)?.title}`,
        href: '/?view=awards',
        read: false,
        createdAt: new Date().toISOString(),
      });
  try {
    localStorage.setItem('ritm.guest.xp', JSON.stringify([...xpKeys]));
  } catch {
    /* Keep the in-memory workspace available. */
  }
  return next;
}
