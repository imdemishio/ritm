'use client';

import { useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronRight,
  Flag,
  Link2,
  Plus,
  Search,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  addDays,
  daySpan,
  formatDay,
  type Challenge,
  type FeedItem,
  type Person,
  type Snapshot,
} from '@/lib/domain';
import { Avatar, Empty, HabitIcon, Modal } from './ui';
import type { Submit } from './forms';

const verbs: Record<string, string> = {
  habit: 'Отметка',
  achievement: 'Достижение',
  challenge: 'Челлендж завершён',
  streak: 'Новая серия',
  record: 'Новый рекорд',
};
const reactionIcons = ['🔥', '👏', '💚'] as const;
type PublicProfile = { person: Person; stats: { percent: number; done: number; best: number } | null };

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Не удалось загрузить данные.');
  return data;
}

function Feed({
  items,
  submit,
  userId,
  profile,
}: {
  items: FeedItem[];
  submit: Submit;
  userId: string;
  profile: (id: string) => void;
}) {
  return (
    <div className="feed-list">
      {items.map((item) => (
        <article className="panel feed-item" key={item.id}>
          <button className="person-button" onClick={() => profile(item.person.id)}>
            <Avatar person={item.person} />
            <span>
              <strong>{item.person.name}</strong>
              <small>
                {verbs[item.kind] ?? 'Активность'} ·{' '}
                {new Date(item.createdAt).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'short',
                })}
              </small>
            </span>
          </button>
          <div className="feed-content">
            <HabitIcon name={item.icon} />
            <strong>{item.title}</strong>
          </div>
          <div className="reactions">
            {reactionIcons.map((emoji) => {
              const reactions = item.reactions.filter((reaction) => reaction.emoji === emoji);
              const mine = reactions.some((reaction) => reaction.userId === userId);
              return (
                <button
                  key={emoji}
                  type="button"
                  aria-pressed={mine}
                  className={mine ? 'selected' : ''}
                  onClick={() => void submit({ type: 'react', id: item.id, emoji })}
                >
                  {emoji} {reactions.length || ''}
                </button>
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}

export function Friends({
  state,
  account,
  submit,
  tell,
}: {
  state: Snapshot;
  account: boolean;
  submit: Submit;
  tell: (message: string, error?: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Person[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [remove, setRemove] = useState<{ id: string; name: string } | null>(null);
  const show = async (id: string) => {
    try {
      setProfile(
        await readResponse<PublicProfile>(await fetch(`/api/people?id=${encodeURIComponent(id)}`)),
      );
    } catch (error) {
      tell(error instanceof Error ? error.message : 'Профиль недоступен.', true);
    }
  };
  if (!account)
    return (
      <Empty
        icon={Users}
        title="С друзьями легче держать ритм"
        description="Войдите, чтобы добавлять друзей, видеть их достижения и приглашать в совместные привычки."
      >
        <a className="primary" href="/account">
          Войти или зарегистрироваться
        </a>
      </Empty>
    );
  return (
    <div className="view-stack">
      <section className="panel list-panel">
        <div className="section-title">
          <div>
            <h2>Найти друзей</h2>
            <p>Поиск по имени пользователя</p>
          </div>
          <span className="tile purple">
            <UserPlus size={19} />
          </span>
        </div>
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setSearching(true);
            try {
              setMatches(
                await readResponse<Person[]>(await fetch(`/api/people?q=${encodeURIComponent(query)}`)),
              );
            } catch (error) {
              tell(error instanceof Error ? error.message : 'Поиск недоступен.', true);
            } finally {
              setSearching(false);
            }
          }}
        >
          <label className="search-box">
            <Search size={17} />
            <input
              aria-label="Имя пользователя"
              required
              minLength={2}
              maxLength={25}
              placeholder="@имя_пользователя"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setMatches(null);
              }}
            />
          </label>
          <button className="primary" disabled={searching}>
            {searching ? 'Ищем…' : 'Найти'}
          </button>
        </form>
        {matches?.length === 0 && <p className="muted">Пользователи с таким именем не найдены.</p>}
        {matches && (
          <div className="people-list">
            {matches.map((person) => {
              const friend = state.friends.find((item) => item.person.id === person.id);
              return (
                <div className="people-row" key={person.id}>
                  <button className="person-button" onClick={() => void show(person.id)}>
                    <Avatar person={person} />
                    <span>
                      <strong>{person.name}</strong>
                      <small>@{person.username}</small>
                    </span>
                  </button>
                  {friend ? (
                    <span className="muted">
                      {friend.status === 'accepted' ? 'В друзьях' : 'Заявка'}
                    </span>
                  ) : (
                    <button
                      className="secondary"
                      onClick={() =>
                        void submit({ type: 'sendFriend', id: person.id }, 'Заявка отправлена')
                      }
                    >
                      <UserPlus size={16} /> Добавить
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section className="panel list-panel">
        <div className="section-title">
          <div>
            <h2>Ваши друзья</h2>
            <p>{state.friends.filter((item) => item.status === 'accepted').length} в списке</p>
          </div>
        </div>
        {!state.friends.length && !state.invites.length && (
          <p className="muted">Найдите друга по имени пользователя, чтобы отправить заявку.</p>
        )}
        <div className="people-list">
          {state.friends.map((item) => (
            <div className="people-row" key={item.id}>
              <button className="person-button" onClick={() => void show(item.person.id)}>
                <Avatar person={item.person} />
                <span>
                  <strong>{item.person.name}</strong>
                  <small>
                    @{item.person.username}
                    {item.status === 'pending'
                      ? item.incoming
                        ? ' · Заявка'
                        : ' · Ожидает ответа'
                      : ''}
                  </small>
                </span>
              </button>
              <div className="row-actions">
                {item.status === 'pending' && item.incoming && (
                  <button
                    className="icon-button affirmative"
                    aria-label={`Принять заявку от ${item.person.name}`}
                    onClick={() =>
                      void submit({ type: 'friend', id: item.id, decision: 'accept' }, 'Друг добавлен')
                    }
                  >
                    <Check size={19} />
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label={
                    item.status === 'accepted'
                      ? `Удалить из друзей ${item.person.name}`
                      : 'Отменить заявку'
                  }
                  onClick={() =>
                    item.status === 'accepted'
                      ? setRemove({ id: item.id, name: item.person.name })
                      : void submit(
                          { type: 'friend', id: item.id, decision: 'decline' },
                          'Заявка отменена',
                        )
                  }
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {state.invites.map((invite) => (
          <div key={invite.habitId} className="people-row">
            <span className="tile green">
              <HabitIcon name={invite.icon} />
            </span>
            <div className="grow">
              <strong>{invite.title}</strong>
              <small>Приглашение от {invite.inviter.name}</small>
            </div>
            <button
              className="icon-button affirmative"
              aria-label="Принять приглашение"
              onClick={() =>
                void submit(
                  { type: 'habitInvite', id: invite.habitId, accept: true },
                  'Совместная привычка добавлена',
                )
              }
            >
              <Check size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Отклонить приглашение"
              onClick={() =>
                void submit(
                  { type: 'habitInvite', id: invite.habitId, accept: false },
                  'Приглашение отклонено',
                )
              }
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </section>
      <section>
        <div className="section-title standalone">
          <div>
            <h2>Лента активности</h2>
            <p>Отметки, серии и достижения друзей</p>
          </div>
        </div>
        {state.feed.length ? (
          <Feed
            items={state.feed}
            submit={submit}
            userId={state.profile.id}
            profile={(id) => void show(id)}
          />
        ) : (
          <Empty
            icon={Users}
            title="Лента пока пуста"
            description="Здесь появится активность, которой поделятся ваши друзья."
          />
        )}
      </section>
      {profile && (
        <Modal
          title={profile.person.name}
          subtitle={`@${profile.person.username}`}
          close={() => setProfile(null)}
        >
          <div className="public-profile">
            <Avatar person={profile.person} size={66} />
            {profile.person.bio && <p>{profile.person.bio}</p>}
            {profile.stats ? (
              <div className="public-stats">
                <div>
                  <strong>{profile.stats.percent}%</strong>
                  <small>Выполнение за месяц</small>
                </div>
                <div>
                  <strong>{profile.stats.done}</strong>
                  <small>Целей выполнено</small>
                </div>
                <div>
                  <strong>{profile.stats.best}</strong>
                  <small>Рекорд серии</small>
                </div>
              </div>
            ) : (
              <p className="muted">Статистика скрыта настройками приватности.</p>
            )}
          </div>
        </Modal>
      )}
      {remove && (
        <Modal title="Удалить из друзей?" subtitle={remove.name} close={() => setRemove(null)}>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setRemove(null)}>
              Отмена
            </button>
            <button
              className="danger"
              onClick={async () => {
                if (await submit({ type: 'friend', id: remove.id, decision: 'remove' }, 'Друг удалён'))
                  setRemove(null);
              }}
            >
              Удалить
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ChallengeDetail({
  item,
  state,
  today,
  close,
  submit,
  tell,
}: {
  item: Challenge;
  state: Snapshot;
  today: string;
  close: () => void;
  submit: Submit;
  tell: (text: string, error?: boolean) => void;
}) {
  const maxDay = item.end < today ? item.end : today;
  const [day, setDay] = useState(maxDay >= item.start ? maxDay : item.start);
  const member = item.members.find((member) => member.person.id === state.profile.id);
  const active = item.members
    .filter((person) => person.status === 'active')
    .sort((a, b) => b.days.length - a.days.length);
  const history = active
    .flatMap((person) => person.days.map((entry) => ({ ...entry, person: person.person })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
  const duration = daySpan(item.start, item.end);
  const marked = !!member?.days.some((entry) => entry.day === day);
  const progress = active.length
    ? Math.round(
        (active.reduce((count, person) => count + person.days.length, 0) * 100) /
          (duration * active.length),
      )
    : 0;
  return (
    <Modal
      title={item.title}
      subtitle={`${formatDay(item.start, { day: 'numeric', month: 'short' })} — ${formatDay(item.end, { day: 'numeric', month: 'short', year: 'numeric' })}`}
      close={close}
    >
      <div className="form-stack">
        <div className="challenge-intro">
          <span className="tile green">
            <HabitIcon name={item.icon} size={22} />
          </span>
          <p>
            {item.description ||
              (item.mode === 'team' ? 'Командный челлендж' : 'Индивидуальный челлендж')}
          </p>
        </div>
        {item.rules && (
          <div className="rules">
            <h3>Правила</h3>
            <p>{item.rules}</p>
          </div>
        )}
        {member?.status === 'pending' ? (
          <div className="modal-actions">
            <button
              className="secondary"
              onClick={async () => {
                if (
                  await submit(
                    { type: 'challengeInvite', id: item.id, accept: false },
                    'Приглашение отклонено',
                  )
                )
                  close();
              }}
            >
              Отклонить
            </button>
            <button
              className="primary"
              onClick={() =>
                void submit({ type: 'challengeInvite', id: item.id, accept: true }, 'Вы присоединились')
              }
            >
              Присоединиться
            </button>
          </div>
        ) : (
          <>
            <div className="challenge-progress">
              <strong>Общий прогресс</strong>
              <span>{progress}%</span>
              <div className="meter">
                <i style={{ width: `${progress}%` }} />
              </div>
            </div>
            {maxDay >= item.start && (
              <div className="inline-form challenge-check">
                <input
                  aria-label="Дата отметки"
                  type="date"
                  min={item.start}
                  max={maxDay}
                  value={day}
                  onChange={(event) => setDay(event.target.value)}
                />
                <button
                  className={marked ? 'secondary' : 'primary'}
                  disabled={!day || day < item.start || day > maxDay}
                  onClick={() =>
                    void submit(
                      { type: 'challengeDay', id: item.id, day, marked: !marked },
                      marked ? 'Отметка отменена' : 'День отмечен',
                    )
                  }
                >
                  <Check size={17} />
                  {marked ? 'Отменить отметку' : 'Отметить день'}
                </button>
              </div>
            )}
            <div className="ranking">
              <h3>
                <Trophy size={17} /> Таблица лидеров
              </h3>
              {active.map((row, index) => (
                <div key={row.person.id}>
                  <b>{index + 1}.</b>
                  <Avatar person={row.person} size={32} />
                  <div>
                    <strong>{row.person.name}</strong>
                    <small>@{row.person.username}</small>
                  </div>
                  <b>
                    {row.days.length}/{duration}
                  </b>
                </div>
              ))}
            </div>
            <div className="ranking">
              <h3>
                <CalendarDays size={17} /> История отметок
              </h3>
              {history.length ? (
                history.map((entry) => (
                  <div key={`${entry.person.id}-${entry.day}`}>
                    <Avatar person={entry.person} size={28} />
                    <div>
                      <strong>{entry.person.name}</strong>
                      <small>{formatDay(entry.day, { day: 'numeric', month: 'long' })}</small>
                    </div>
                    <Check size={17} />
                  </div>
                ))
              ) : (
                <p className="muted">Первая отметка появится здесь.</p>
              )}
            </div>
            {item.mode === 'team' && item.end >= today && (
              <div className="modal-actions">
                <button
                  className="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`${location.origin}/?join=${item.code}`);
                      tell('Ссылка на челлендж скопирована');
                    } catch {
                      tell('Не удалось скопировать ссылку.', true);
                    }
                  }}
                >
                  <Link2 size={17} /> Скопировать приглашение
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export function Challenges({
  state,
  today,
  create,
  submit,
  tell,
}: {
  state: Snapshot;
  today: string;
  create: () => void;
  submit: Submit;
  tell: (text: string, error?: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('active');
  const item = state.challenges.find((challenge) => challenge.id === selected);
  const rows = state.challenges.filter((challenge) => {
    const member = challenge.members.find((row) => row.person.id === state.profile.id);
    return filter === 'invites'
      ? member?.status === 'pending'
      : member?.status === 'active' &&
          (filter === 'finished'
            ? challenge.end < today || member.days.length >= daySpan(challenge.start, challenge.end)
            : challenge.end >= today && member.days.length < daySpan(challenge.start, challenge.end));
  });
  return (
    <div className="view-stack">
      <div className="section-toolbar">
        <div className="segment">
          {[
            ['active', 'Активные'],
            ['finished', 'Завершённые'],
            ['invites', 'Приглашения'],
          ].map(([id, label]) => (
            <button key={id} className={filter === id ? 'selected' : ''} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <button className="primary" onClick={create}>
          <Plus size={17} /> Создать челлендж
        </button>
      </div>
      {!rows.length ? (
        <Empty
          icon={Flag}
          title={
            filter === 'active'
              ? 'Начните свой первый челлендж'
              : filter === 'invites'
                ? 'Приглашений пока нет'
                : 'Завершённых челленджей пока нет'
          }
          description={
            filter === 'active'
              ? 'Выберите цель и отмечайте прогресс каждый день.'
              : filter === 'invites'
                ? 'Здесь появятся приглашения от друзей.'
                : 'Завершите активный челлендж, чтобы увидеть его здесь.'
          }
        >
          {filter === 'active' && (
            <button className="secondary" onClick={create}>
              Новый челлендж
            </button>
          )}
        </Empty>
      ) : (
        <div className="challenge-grid">
          {rows.map((challenge) => {
            const member = challenge.members.find((person) => person.person.id === state.profile.id);
            const total = daySpan(challenge.start, challenge.end);
            const done = member?.days.length ?? 0;
            return (
              <button
                key={challenge.id}
                className="panel challenge-card"
                onClick={() => setSelected(challenge.id)}
              >
                <div>
                  <span className="tile green">
                    <HabitIcon name={challenge.icon} size={22} />
                  </span>
                  <ChevronRight size={18} />
                </div>
                <strong>{challenge.title}</strong>
                <p>
                  {challenge.mode === 'team' ? 'С друзьями' : 'Индивидуальный'} ·{' '}
                  {formatDay(challenge.end, { day: 'numeric', month: 'long' })}
                </p>
                <span className="meter">
                  <i style={{ width: `${(done * 100) / total}%` }} />
                </span>
                <small>
                  {done} из {total} дней
                </small>
              </button>
            );
          })}
        </div>
      )}
      {item && (
        <ChallengeDetail
          key={item.id}
          item={item}
          state={state}
          today={today}
          close={() => setSelected(null)}
          submit={submit}
          tell={tell}
        />
      )}
    </div>
  );
}
