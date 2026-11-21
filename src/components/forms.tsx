'use client';

import { useEffect, useState } from 'react';
import { Archive, Bell, CalendarDays, Check, Minus, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  accentColors,
  addDays,
  blankHabit,
  categories,
  icons,
  kinds,
  scheduleLabels,
  weekdays,
  type ChallengeInput,
  type Friend,
  type Habit,
  type HabitInput,
  type SentHabitInvitation,
  type SharedResult,
} from '@/lib/domain';
import { challengeInput, habitInput, type Action } from '@/lib/validation';
import { Avatar, HabitIcon, Modal, cssVars } from './ui';

export type Submit = (action: Action, message?: string) => Promise<boolean>;
export function Swatches({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="swatches">
      {accentColors.map((color) => (
        <button
          className={color.toLowerCase() === value.toLowerCase() ? 'swatch chosen' : 'swatch'}
          type="button"
          key={color}
          aria-label={`Цвет ${color}`}
          aria-pressed={color.toLowerCase() === value.toLowerCase()}
          style={cssVars({ '--swatch': color })}
          onClick={() => onChange(color)}
        >
          {color.toLowerCase() === value.toLowerCase() && <Check size={16} />}
        </button>
      ))}
      <label className="custom-swatch" title="Выбрать свой цвет">
        <Plus size={17} />
        <input
          type="color"
          aria-label="Свой цвет"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}
export function IconChoices({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const names = [
    'Вода',
    'Книга',
    'Ходьба',
    'Медитация',
    'Сон',
    'Солнце',
    'Лист',
    'Кофе',
    'Сердце',
    'Код',
    'Музыка',
    'Еда',
    'Кубок',
    'Цель',
    'Росток',
    'Сила',
    'Искры',
    'Мозг',
  ];
  return (
    <div className="icon-choices">
      {icons.map((icon, index) => (
        <button
          type="button"
          className={value === icon ? 'selected' : ''}
          key={icon}
          aria-label={names[index]}
          aria-pressed={value === icon}
          onClick={() => onChange(icon)}
        >
          <HabitIcon name={icon} size={19} />
        </button>
      ))}
      <input
        className="emoji-input"
        aria-label="Свой эмодзи"
        placeholder="😊"
        maxLength={24}
        value={icons.includes(value) ? '' : value}
        onChange={(event) => onChange(event.target.value || 'leaf')}
      />
    </div>
  );
}
function InviteChoices({
  friends,
  selected,
  set,
  statuses,
}: {
  friends: Friend[];
  selected: string[];
  set: (ids: string[]) => void;
  statuses?: SentHabitInvitation[];
}) {
  const candidates = friends.filter((friend) => friend.status === 'accepted');
  if (!candidates.length) return null;
  const byFriend = new Map(statuses?.map((invite) => [invite.userId, invite.status]));
  const labels: Record<string, string> = {
    pending: 'Ожидает ответа',
    accepted: 'Принято',
    declined: 'Отклонено',
  };
  return (
    <fieldset>
      <legend>Пригласить друзей</legend>
      <div className="choice-list invite-choices">
        {candidates.map(({ person }) => {
          const status = byFriend.get(person.id);
          return (
            <label className="check-label" key={person.id}>
              <input
                type="checkbox"
                checked={!status && selected.includes(person.id)}
                disabled={Boolean(status)}
                onChange={(event) =>
                  set(
                    event.target.checked
                      ? [...selected, person.id]
                      : selected.filter((id) => id !== person.id),
                  )
                }
              />
              <span>
                {person.name} <span className="muted">@{person.username}</span>
              </span>
              {status && <span className="invite-status">{labels[status] ?? 'Приглашение отправлялось'}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function HabitForm({
  habit,
  today,
  friends,
  sentInvites,
  account,
  close,
  submit,
}: {
  habit?: Habit;
  today: string;
  friends: Friend[];
  sentInvites?: SentHabitInvitation[];
  account: boolean;
  close: () => void;
  submit: Submit;
}) {
  const [data, set] = useState<HabitInput>(habit ?? blankHabit(today));
  const [invites, setInvites] = useState<string[]>([]);
  const [customDate, setCustomDate] = useState(today);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shared, setShared] = useState<SharedResult[]>([]);
  useEffect(() => {
    if (!account || !habit) return;
    const controller = new AbortController();
    void fetch(`/api/shared?habit=${encodeURIComponent(habit.id)}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.ok) setShared((await response.json()) as SharedResult[]);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [account, habit]);
  const change = <K extends keyof HabitInput>(key: K, value: HabitInput[K]) =>
    set((previous) => ({ ...previous, [key]: value }));
  const schedule = (patch: Partial<HabitInput['schedule']>) =>
    change('schedule', { ...data.schedule, ...patch });
  const save = async (input: Action, message: string) => {
    setPending(true);
    if (await submit(input, message)) close();
    setPending(false);
  };
  return (
    <Modal
      title={habit ? 'Настроить привычку' : 'Новая привычка'}
      subtitle="Выберите цель и удобный график."
      close={close}
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const input = habitInput.safeParse(data);
          if (!input.success) {
            setError(input.error.issues[0].message);
            return;
          }
          void save(
            {
              type: 'saveHabit',
              id: habit?.id,
              habit: input.data,
              invites: invites.filter((userId) => !sentInvites?.some((invite) => invite.userId === userId)),
            },
            habit ? 'Изменения сохранены' : 'Привычка создана',
          );
        }}
      >
        <label>
          Название
          <input
            autoFocus
            required
            maxLength={80}
            value={data.title}
            onChange={(event) => change('title', event.target.value)}
            placeholder="Например, больше гулять"
          />
        </label>
        <label>
          Описание
          <textarea
            maxLength={1000}
            value={data.description}
            onChange={(event) => change('description', event.target.value)}
            placeholder="Что нужно сделать?"
            rows={2}
          />
        </label>
        <div className="form-pair">
          <label>
            Тип цели
            <select
              value={data.kind}
              onChange={(event) => {
                const kind = event.target.value as HabitInput['kind'];
                set({
                  ...data,
                  kind,
                  target: kind === 'time' ? 20 : kind === 'count' ? 8 : 1,
                  unit: kind === 'time' ? 'мин' : '',
                });
              }}
            >
              {Object.entries(kinds).map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Категория
            <select value={data.category} onChange={(event) => change('category', event.target.value)}>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        {(data.kind === 'time' || data.kind === 'count') && (
          <div className="form-pair">
            <label>
              Цель
              <input
                type="number"
                min={1}
                max={10000}
                required
                value={data.target || ''}
                onChange={(event) => change('target', Number(event.target.value))}
              />
            </label>
            <label>
              Единица
              <input
                maxLength={24}
                value={data.unit}
                onChange={(event) => change('unit', event.target.value)}
                placeholder="Стаканы, минуты…"
              />
            </label>
          </div>
        )}
        <fieldset>
          <legend>Иконка</legend>
          <IconChoices value={data.icon} onChange={(value) => change('icon', value)} />
        </fieldset>
        <fieldset>
          <legend>Цвет</legend>
          <Swatches value={data.color} onChange={(value) => change('color', value)} />
        </fieldset>
        <fieldset>
          <legend>
            <CalendarDays size={16} /> Расписание
          </legend>
          <select
            aria-label="Расписание"
            value={data.schedule.mode}
            onChange={(event) =>
              schedule({ mode: event.target.value as HabitInput['schedule']['mode'] })
            }
          >
            {Object.entries(scheduleLabels).map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
          {data.schedule.mode === 'weekdays' && (
            <div className="weekday-choices">
              {weekdays.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={data.schedule.days.includes(index) ? 'selected' : ''}
                  aria-pressed={data.schedule.days.includes(index)}
                  onClick={() =>
                    schedule({
                      days: data.schedule.days.includes(index)
                        ? data.schedule.days.filter((day) => day !== index)
                        : [...data.schedule.days, index],
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {data.schedule.mode === 'weekly' && (
            <label>
              Количество дней в неделю
              <input
                type="number"
                min={1}
                max={7}
                value={data.schedule.quota || ''}
                onChange={(event) => schedule({ quota: Number(event.target.value) })}
              />
            </label>
          )}
          {data.schedule.mode === 'custom' && (
            <>
              <div className="inline-form">
                <input
                  type="date"
                  aria-label="Дата выполнения"
                  min={data.start}
                  max={data.end ?? undefined}
                  value={customDate}
                  onChange={(event) => setCustomDate(event.target.value)}
                />
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    if (customDate && !data.schedule.dates.includes(customDate))
                      schedule({ dates: [...data.schedule.dates, customDate].sort() });
                  }}
                >
                  Добавить дату
                </button>
              </div>
              <div className="date-chips">
                {data.schedule.dates.map((date) => (
                  <button
                    type="button"
                    key={date}
                    className="secondary"
                    onClick={() =>
                      schedule({ dates: data.schedule.dates.filter((item) => item !== date) })
                    }
                  >
                    {date} ×
                  </button>
                ))}
              </div>
            </>
          )}
        </fieldset>
        <div className="form-pair">
          <label>
            Начало
            <input
              type="date"
              required
              value={data.start}
              onChange={(event) => change('start', event.target.value)}
            />
          </label>
          <label>
            Окончание
            <input
              type="date"
              min={data.start}
              value={data.end ?? ''}
              onChange={(event) => change('end', event.target.value || null)}
            />
          </label>
        </div>
        <div className="form-pair">
          <label>
            <span className="inline-label">
              <Bell size={15} /> Напоминание
            </span>
            <input
              type="time"
              value={data.reminder ?? ''}
              onChange={(event) => change('reminder', event.target.value || null)}
            />
          </label>
          <label>
            Кто видит
            <select
              value={data.visibility}
              onChange={(event) => change('visibility', event.target.value as HabitInput['visibility'])}
            >
              <option value="private">Только я</option>
              <option value="friends">Мои друзья</option>
            </select>
          </label>
        </div>
        {!habit?.linkedHabitId && (
          <InviteChoices friends={friends} selected={invites} set={setInvites} statuses={sentInvites} />
        )}
        {shared.length > 0 && (
          <fieldset>
            <legend>Участники · на этой неделе</legend>
            <div className="people-list">
              {shared.map((item) => (
                <div key={item.person.id} className="people-row">
                  <Avatar person={item.person} size={30} />
                  <span className="grow">{item.person.name}</span>
                  <span className="muted">
                    {item.done} из {item.planned}
                  </span>
                </div>
              ))}
            </div>
          </fieldset>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {deleting && habit && (
          <div className="danger-confirm">
            <p>Удалить привычку и всю историю отметок?</p>
            <div>
              <button className="secondary" type="button" onClick={() => setDeleting(false)}>
                Оставить
              </button>
              <button
                className="danger"
                disabled={pending}
                type="button"
                onClick={() => void save({ type: 'deleteHabit', id: habit.id }, 'Привычка удалена')}
              >
                Удалить
              </button>
            </div>
          </div>
        )}
        <div className="modal-actions">
          {habit && (
            <div className="row-actions">
              <button
                className="icon-button"
                type="button"
                aria-label={habit.archived ? 'Восстановить' : 'Архивировать'}
                title={habit.archived ? 'Восстановить' : 'Архивировать'}
                disabled={pending}
                onClick={() =>
                  void save(
                    { type: 'archive', id: habit.id, archived: !habit.archived },
                    habit.archived ? 'Привычка восстановлена' : 'Привычка перенесена в архив',
                  )
                }
              >
                {habit.archived ? <RotateCcw size={19} /> : <Archive size={19} />}
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Удалить привычку"
                title="Удалить привычку"
                onClick={() => setDeleting(true)}
              >
                <Trash2 size={19} />
              </button>
            </div>
          )}
          <button className="secondary" type="button" onClick={close}>
            Отмена
          </button>
          <button className="primary" disabled={pending}>
            {pending ? 'Сохраняем…' : habit ? 'Сохранить' : 'Создать привычку'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function NumberForm({
  habit,
  day,
  close,
  save,
}: {
  habit: Habit;
  day: string;
  close: () => void;
  save: (value: number) => Promise<boolean>;
}) {
  const [value, set] = useState(habit.logs[day] ?? 0);
  const [pending, setPending] = useState(false);
  const step = habit.kind === 'time' ? 5 : 1;
  const unit = habit.unit || (habit.kind === 'time' ? 'мин' : 'раз');
  return (
    <Modal title={habit.title} subtitle={`Цель на день — ${habit.target} ${unit}`} close={close}>
      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          if (await save(value)) close();
          setPending(false);
        }}
      >
        <div className="number-stepper" style={cssVars({ '--habit': habit.color })}>
          <button
            type="button"
            className="icon-button"
            aria-label={`Уменьшить на ${step}`}
            onClick={() => set(Math.max(0, value - step))}
          >
            <Minus size={23} />
          </button>
          <label>
            <input
              aria-label="Выполненное количество"
              type="number"
              min={0}
              max={habit.target}
              value={value}
              onChange={(event) => set(Number(event.target.value))}
            />
            <small>{unit}</small>
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label={`Увеличить на ${step}`}
            onClick={() => set(Math.min(habit.target, value + step))}
          >
            <Plus size={23} />
          </button>
        </div>
        <div className="meter">
          <i style={{ width: `${Math.min(100, (value * 100) / habit.target)}%` }} />
        </div>
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={() => set(habit.target)}>
            Заполнить цель
          </button>
          <button className="primary" disabled={pending}>
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ChallengeForm({
  today,
  friends,
  account,
  close,
  submit,
}: {
  today: string;
  friends: Friend[];
  account: boolean;
  close: () => void;
  submit: Submit;
}) {
  const [data, set] = useState<ChallengeInput>({
    title: '',
    description: '',
    icon: '🎯',
    start: today,
    end: addDays(today, 13),
    rules: '',
    mode: 'solo',
  });
  const [invites, setInvites] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const change = <K extends keyof ChallengeInput>(key: K, value: ChallengeInput[K]) =>
    set((previous) => ({ ...previous, [key]: value }));
  return (
    <Modal
      title="Новый челлендж"
      subtitle="Выберите цель и срок, за который хотите её достичь."
      close={close}
    >
      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          const parsed = challengeInput.safeParse(data);
          if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
          }
          setPending(true);
          if (
            await submit({ type: 'createChallenge', challenge: parsed.data, invites }, 'Челлендж создан')
          )
            close();
          setPending(false);
        }}
      >
        <label>
          Название
          <input
            autoFocus
            required
            maxLength={80}
            value={data.title}
            placeholder="Например, 14 дней раннего подъёма"
            onChange={(event) => change('title', event.target.value)}
          />
        </label>
        <label>
          Описание
          <textarea
            rows={2}
            maxLength={1000}
            value={data.description}
            onChange={(event) => change('description', event.target.value)}
          />
        </label>
        <label>
          Правила
          <textarea
            rows={2}
            maxLength={1000}
            value={data.rules}
            onChange={(event) => change('rules', event.target.value)}
          />
        </label>
        <fieldset>
          <legend>Иконка</legend>
          <IconChoices value={data.icon} onChange={(value) => change('icon', value)} />
        </fieldset>
        <div className="form-pair">
          <label>
            Начало
            <input
              type="date"
              required
              value={data.start}
              onChange={(event) => change('start', event.target.value)}
            />
          </label>
          <label>
            Окончание
            <input
              type="date"
              required
              min={data.start}
              max={data.start ? addDays(data.start, 365) : undefined}
              value={data.end}
              onChange={(event) => change('end', event.target.value)}
            />
          </label>
        </div>
        {account && (
          <label>
            Участники
            <select
              value={data.mode}
              onChange={(event) => change('mode', event.target.value as ChallengeInput['mode'])}
            >
              <option value="solo">Только я</option>
              <option value="team">С друзьями</option>
            </select>
          </label>
        )}
        {data.mode === 'team' && <InviteChoices friends={friends} selected={invites} set={setInvites} />}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={close}>
            Отмена
          </button>
          <button className="primary" disabled={pending}>
            Создать
          </button>
        </div>
      </form>
    </Modal>
  );
}
