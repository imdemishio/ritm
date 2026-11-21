import { z } from 'zod';
import { addDays, asDate, daySpan } from './domain';

export const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[\w-]+$/);
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = asDate(value);
    return Number.isFinite(date.getTime()) && addDays(value, 0) === value;
  }, 'Укажите корректную дату');
export const color = z.string().regex(/^#[a-f\d]{6}$/i);
export const timezone = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('ru', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Неизвестный часовой пояс');
export const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const password = z
  .string()
  .min(10, 'Минимум 10 символов')
  .refine((value) => new TextEncoder().encode(value).length <= 72, 'Пароль слишком длинный');
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z\d_]{3,24}$/, 'От 3 до 24 латинских букв, цифр и знаков подчёркивания');
const title = z.string().trim().min(1, 'Введите название').max(80);
const icon = z.string().min(1).max(24);
const description = z.string().trim().max(1000);
const hour = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const validRange = (start: string, end: string) => end >= start && daySpan(start, end) <= 3660;
export const habitInput = z
  .object({
    title,
    description,
    icon,
    color,
    category: z.string().min(1).max(40),
    kind: z.enum(['check', 'count', 'time', 'avoid']),
    target: z.number().int().min(1).max(10000),
    unit: z.string().trim().max(24),
    start: day,
    end: day.nullable(),
    reminder: hour.nullable(),
    visibility: z.enum(['private', 'friends']),
    schedule: z.object({
      mode: z.enum(['daily', 'weekdays', 'weekly', 'custom']),
      days: z.array(z.number().int().min(0).max(6)).max(7),
      quota: z.number().int().min(1).max(7),
      dates: z.array(day).max(366),
    }),
  })
  .refine(
    (value) => !value.end || validRange(value.start, value.end),
    'Проверьте даты начала и окончания',
  )
  .refine(
    (value) => value.schedule.mode !== 'weekdays' || value.schedule.days.length > 0,
    'Выберите дни недели',
  )
  .refine(
    (value) =>
      value.schedule.mode !== 'custom' ||
      (value.schedule.dates.length > 0 &&
        value.schedule.dates.every((date) => date >= value.start && (!value.end || date <= value.end))),
    'Выберите даты в рамках действия привычки',
  )
  .transform((value) => ({
    ...value,
    target: value.kind === 'check' || value.kind === 'avoid' ? 1 : value.target,
  }));
export const challengeInput = z
  .object({
    title,
    description,
    icon,
    start: day,
    end: day,
    rules: description,
    mode: z.enum(['solo', 'team']),
  })
  .refine(
    (value) => value.end >= value.start && daySpan(value.start, value.end) <= 366,
    'Длительность челленджа — до 366 дней',
  );
const avatar = z
  .string()
  .max(180000)
  .regex(/^data:image\/(png|jpeg|webp);base64,[a-z\d+/]+=*$/i)
  .nullable();
export const profileInput = z.object({
  name: z.string().trim().min(1).max(60),
  username,
  bio: z.string().trim().max(420),
  avatar,
});
export const settingsInput = z.object({
  theme: z.enum(['dark', 'light']),
  accent: color,
  timezone,
  privacy: z.enum(['private', 'friends', 'public']),
  onboarded: z.boolean(),
});
export const preferencesInput = z.object({
  reminders: z.boolean(),
  social: z.boolean(),
  achievements: z.boolean(),
});

export const action = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('saveHabit'),
    id: id.optional(),
    habit: habitInput,
    invites: z.array(id).max(50).default([]),
  }),
  z.object({ type: z.literal('log'), id, day, value: z.number().int().min(0).max(10000) }),
  z.object({ type: z.literal('archive'), id, archived: z.boolean() }),
  z.object({ type: z.literal('deleteHabit'), id }),
  z.object({ type: z.literal('reorder'), ids: z.array(id).max(500) }),
  z.object({ type: z.literal('profile'), profile: profileInput }),
  z.object({ type: z.literal('settings'), settings: settingsInput }),
  z.object({ type: z.literal('preferences'), preferences: preferencesInput }),
  z.object({ type: z.literal('sendFriend'), id }),
  z.object({ type: z.literal('friend'), id, decision: z.enum(['accept', 'decline', 'remove']) }),
  z.object({ type: z.literal('react'), id, emoji: z.enum(['🔥', '👏', '💚']) }),
  z.object({ type: z.literal('habitInvite'), id, accept: z.boolean() }),
  z.object({
    type: z.literal('createChallenge'),
    challenge: challengeInput,
    invites: z.array(id).max(50).default([]),
  }),
  z.object({ type: z.literal('join'), code: z.uuid() }),
  z.object({ type: z.literal('challengeInvite'), id, accept: z.boolean() }),
  z.object({ type: z.literal('challengeDay'), id, day, marked: z.boolean() }),
  z.object({ type: z.literal('read'), id: id.optional() }),
  z.object({ type: z.literal('testReminder') }),
  z.object({
    type: z.literal('push'),
    endpoint: z.url().max(2048),
    p256dh: z.string().regex(/^[\w-]{86,90}$/),
    auth: z.string().regex(/^[\w-]{20,24}$/),
  }),
  z.object({ type: z.literal('unpush'), endpoint: z.url().max(2048) }),
]);
export type Action = z.input<typeof action>;
export type ValidAction = z.output<typeof action>;
