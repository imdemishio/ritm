'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Flame,
  GripVertical,
  Leaf,
  Minus,
  MoreHorizontal,
  Plus,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  addDays,
  capitalize,
  dayStreak,
  formatDay,
  isDone,
  onAgenda,
  periodStats,
  plural,
  scheduled,
  streak,
  summary,
  weekOf,
  weekdays,
  type Habit,
  type Snapshot,
} from '@/lib/domain';
import { isGuestExample } from '@/lib/guest';
import { Avatar, Empty, HabitIcon, cssVars } from './ui';

export type HabitRowProps = {
  habit: Habit;
  day: string;
  today: string;
  edit: (habit: Habit) => void;
  mark: (habit: Habit, value: number) => void;
  manage?: boolean;
  number: (habit: Habit) => void;
  sort?: boolean;
};
export function HabitRow({ habit, day, today, edit, mark, number, manage, sort }: HabitRowProps) {
  const sortable = useSortable({ id: habit.id, disabled: !sort });
  const status = streak(habit, day);
  const done = isDone(habit, day);
  const current = habit.logs[day] ?? 0;
  const measured = habit.kind === 'count' || habit.kind === 'time';
  const days = Array.from({ length: 7 }, (_, index) => addDays(day, index - 6));
  const subtitle = measured
    ? `${habit.target} ${habit.unit || (habit.kind === 'time' ? 'мин' : 'раз')}${habit.description ? ` · ${habit.description}` : ''}`
    : habit.description || habit.category;
  return (
    <div
      className={`habit-row ${done ? 'habit-done' : ''}`}
      ref={sortable.setNodeRef}
      style={{
        ...cssVars({ '--habit': habit.color }),
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        zIndex: sortable.isDragging ? 2 : undefined,
      }}
    >
      {sort && (
        <button
          className="drag icon-button"
          aria-label={`Переместить ${habit.title}`}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical size={18} />
        </button>
      )}
      <button className="habit-title" onClick={() => edit(habit)}>
        <span className="habit-icon">
          <HabitIcon name={habit.icon} />
        </span>
        <span>
          <strong>{habit.title}</strong>
          <small>{isGuestExample(habit) ? `Пример · ${subtitle}` : subtitle}</small>
        </span>
      </button>
      <div className="habit-series" aria-label={`Серия ${status.current}`}>
        <Flame size={15} /> <span>{status.current}</span>
      </div>
      <div className="habit-mini" aria-label="Отметки за последние 7 дней">
        {days.map((date) => (
          <span
            key={date}
            title={`${formatDay(date, { day: 'numeric', month: 'short' })} · ${isDone(habit, date) ? 'выполнено' : scheduled(habit, date) ? 'запланировано' : 'нет цели'}`}
            className={isDone(habit, date) ? 'complete' : scheduled(habit, date) ? 'scheduled' : ''}
          />
        ))}
      </div>
      {manage ? (
        <button
          className="icon-button row-more"
          onClick={() => edit(habit)}
          aria-label={`Настроить ${habit.title}`}
        >
          <MoreHorizontal size={20} />
        </button>
      ) : measured && !done ? (
        <button
          className="mark-button measured"
          type="button"
          aria-label={`Записать прогресс — ${habit.title}`}
          onClick={() => number(habit)}
          disabled={day > today}
        >
          <span>
            {current}/{habit.target}
          </span>
          <Plus size={14} />
        </button>
      ) : (
        <motion.button
          whileTap={{ scale: 0.84 }}
          className={`mark-button ${done ? 'checked' : ''}`}
          type="button"
          aria-label={`${done ? 'Отменить отметку' : 'Отметить'} — ${habit.title}`}
          aria-pressed={done}
          disabled={day > today}
          onClick={() => mark(habit, done ? 0 : habit.target)}
        >
          {done ? <Check size={19} strokeWidth={2.6} /> : <Plus size={19} />}
        </motion.button>
      )}
    </div>
  );
}

export function HabitManager({
  state,
  today,
  edit,
  mark,
  number,
  create,
  reorder,
}: { state: Snapshot; today: string; create: () => void; reorder: (ids: string[]) => void } & Pick<
  HabitRowProps,
  'edit' | 'mark' | 'number'
>) {
  const [archive, setArchive] = useState(false);
  const habits = state.habits.filter((item) => Boolean(item.archived) === archive);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 170, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = habits.map((habit) => habit.id);
  return (
    <>
      <div className="section-toolbar">
        <div className="segment">
          <button className={!archive ? 'selected' : ''} onClick={() => setArchive(false)}>
            Активные
          </button>
          <button className={archive ? 'selected' : ''} onClick={() => setArchive(true)}>
            Архив
          </button>
        </div>
        <button className="primary" onClick={create}>
          <Plus size={17} /> Новая привычка
        </button>
      </div>
      {!habits.length ? (
        <Empty
          icon={Leaf}
          title={archive ? 'Архив пуст' : 'Здесь будут ваши привычки'}
          description={
            archive
              ? 'Завершённые привычки можно убрать с главного экрана.'
              : 'Создайте одну привычку, с которой удобно начать.'
          }
        >
          {!archive && (
            <button className="secondary" onClick={create}>
              Добавить привычку
            </button>
          )}
        </Empty>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={({ active, over }) => {
            if (over && active.id !== over.id)
              reorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
          }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="habit-list">
              {habits.map((habit) => (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  day={today}
                  today={today}
                  edit={edit}
                  mark={mark}
                  number={number}
                  manage
                  sort={!archive}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const circumference = 2 * Math.PI * 50;
  return (
    <div className="progress-ring" role="img" aria-label={`Выполнено ${percent}%`}>
      <svg viewBox="0 0 116 116" aria-hidden="true">
        <circle
          cx="58"
          cy="58"
          r="50"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="ring-track"
        />
        <motion.circle
          cx="58"
          cy="58"
          r="50"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: circumference * (1 - percent / 100), opacity: percent ? 1 : 0 }}
          transform="rotate(-90 58 58)"
          transition={{ duration: 0.56, ease: 'easeOut' }}
        />
      </svg>
      <span>
        <strong>
          {percent}
          <i>%</i>
        </strong>
        <small>выполнено</small>
      </span>
    </div>
  );
}

export function Dashboard({
  state,
  today,
  day,
  date,
  edit,
  mark,
  number,
  create,
  go,
}: {
  state: Snapshot;
  today: string;
  day: string;
  date: (day: string) => void;
  create: () => void;
  go: (view: 'stats' | 'friends' | 'awards') => void;
} & Pick<HabitRowProps, 'edit' | 'mark' | 'number'>) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');
  const progress = summary(state.habits, day);
  const dates = weekOf(day);
  const recent = weekOf(today);
  const selected = state.habits.filter((habit) => onAgenda(habit, day));
  const habits = selected.filter(
    (habit) => filter === 'all' || (filter === 'done' ? isDone(habit, day) : !isDone(habit, day)),
  );
  const currentStreak = useMemo(() => dayStreak(state.habits, today), [state.habits, today]);
  const currentWeek = periodStats(state.habits, recent[0], today);
  const prevWeek = periodStats(state.habits, addDays(recent[0], -7), addDays(today, -7));
  const delta = currentWeek.percent - prevWeek.percent;
  const isToday = day === today;
  const tabs = [
    ['all', 'Все'],
    ['pending', 'В процессе'],
    ['done', 'Выполнены'],
  ] as const;
  return (
    <div className="dashboard-grid">
      <section className="dashboard-main">
        <section className="calendar panel" aria-label="Календарь недели">
          <div className="calendar-head">
            <div>
              <CalendarDays size={17} />
              <strong>
                {capitalize(formatDay(day, { month: 'long', year: 'numeric' }).replace(/\s*г\.$/, ''))}
              </strong>
            </div>
            <div className="calendar-controls">
              {!isToday && (
                <button className="today-button" onClick={() => date(today)}>
                  Сегодня
                </button>
              )}
              <button
                className="icon-button"
                aria-label="Предыдущая неделя"
                onClick={() => date(addDays(day, -7))}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Следующая неделя"
                onClick={() => date(addDays(day, 7))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="calendar-days">
            {dates.map((value, index) => {
              const result = summary(state.habits, value);
              return (
                <button
                  key={value}
                  onClick={() => date(value)}
                  className={`calendar-day${value === day ? ' active' : ''}`}
                  aria-pressed={value === day}
                  aria-current={value === today ? 'date' : undefined}
                  aria-label={formatDay(value, { weekday: 'long', day: 'numeric', month: 'long' })}
                >
                  <small>{weekdays[index]}</small>
                  <strong>{Number(value.slice(-2))}</strong>
                  <span
                    className={
                      value === today
                        ? 'date-dot current'
                        : result.done > 0
                          ? 'date-dot recorded'
                          : 'date-dot'
                    }
                  />
                </button>
              );
            })}
          </div>
        </section>
        <section className="daily-panel">
          <div className="hero-lines" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="daily-copy">
            <div className="daily-label">
              <span>
                <TrendingUp size={16} />
              </span>{' '}
              ПРОГРЕСС ДНЯ
            </div>
            <h2>
              {progress.done}
              <span> / {progress.planned}</span>
            </h2>
            <p>{progress.percent === 100 ? 'Все привычки выполнены!' : 'Привычек выполнено'}</p>
            <div className="daily-segments" aria-hidden="true">
              {Array.from({ length: Math.min(12, Math.max(progress.planned, 4)) }, (_, index) => (
                <i
                  key={index}
                  className={
                    index <
                    Math.round((Math.min(12, Math.max(progress.planned, 4)) * progress.percent) / 100)
                      ? 'filled'
                      : ''
                  }
                />
              ))}
            </div>
          </div>
          <ProgressRing percent={progress.percent} />
          <AnimatePresence>
            {progress.percent === 100 && (
              <motion.div
                className="celebration"
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                aria-hidden="true"
              >
                <Sparkles size={23} />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
        <section className="habit-section">
          <div className="section-title">
            <div>
              <h2>Мои привычки</h2>
              <p>
                {plural(selected.length, ['привычка в плане', 'привычки в плане', 'привычек в плане'])}
              </p>
            </div>
            <button className="secondary new-inline" onClick={create}>
              <Plus size={18} /> Добавить
            </button>
          </div>
          {state.profile.id === 'guest' && habits.some(isGuestExample) && (
            <p className="guest-example-note">Стартовые примеры можно изменить или удалить.</p>
          )}
          <div className="segment habit-tabs" aria-label="Фильтр привычек">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                className={filter === id ? 'selected' : ''}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {habits.length ? (
            <div className="habit-list">
              {habits.map((habit) => (
                <HabitRow key={habit.id} {...{ habit, day, today, edit, mark, number }} />
              ))}
            </div>
          ) : (
            <Empty
              icon={filter === 'done' ? CircleCheck : Leaf}
              title={selected.length ? 'Здесь пока пусто' : 'На этот день нет привычек'}
              description={
                selected.length
                  ? 'Выберите другой фильтр, чтобы увидеть план.'
                  : 'Добавьте новую привычку или выберите другую дату.'
              }
            >
              {!selected.length && (
                <button className="secondary" onClick={create}>
                  <Plus size={16} /> Добавить привычку
                </button>
              )}
            </Empty>
          )}
        </section>
      </section>
      <aside className="dashboard-aside" aria-label="Обзор активности">
        <section className="panel side-panel streak-panel">
          <div className="side-heading">
            <span className="tile amber">
              <Flame size={20} />
            </span>
            <div>
              <h3>Серия дней</h3>
              <p>Дни с выполненным планом</p>
            </div>
          </div>
          <div className="streak-value">
            <strong>{currentStreak}</strong>
            <span>{plural(currentStreak, ['день', 'дня', 'дней']).split(' ')[1]}</span>
          </div>
          <div className="streak-week">
            {recent.map((date, index) => {
              const status = summary(state.habits, date);
              return (
                <div key={date} title={`${weekdays[index]} · ${status.done} из ${status.planned}`}>
                  <span
                    className={
                      status.percent === 100 ? 'streak-hit' : date === today ? 'streak-today' : ''
                    }
                  >
                    {status.percent === 100 ? <Check size={13} /> : <span />}
                  </span>
                  <small>{weekdays[index]}</small>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel side-panel weekly-panel">
          <div className="side-heading">
            <span className="tile green">
              <TrendingUp size={20} />
            </span>
            <div>
              <h3>Ритм недели</h3>
              <p>Выполнение по дням</p>
            </div>
            <button
              className="icon-button side-link"
              onClick={() => go('stats')}
              aria-label="Открыть статистику"
            >
              <ArrowUpRight size={19} />
            </button>
          </div>
          <div className="week-bars" aria-label="График выполнения за текущую неделю">
            {recent.map((value, index) => {
              const ratio = value <= today ? summary(state.habits, value).percent : 0;
              return (
                <button
                  key={value}
                  onClick={() => date(value)}
                  title={`${weekdays[index]} · ${ratio}%`}
                  aria-label={`${weekdays[index]} · ${ratio}%`}
                  aria-pressed={value === day}
                >
                  <span>
                    <motion.i
                      initial={false}
                      animate={{ height: `${Math.max(4, ratio)}%` }}
                      className={value === today ? 'today-bar' : ''}
                    />
                  </span>
                  <small>{weekdays[index]}</small>
                </button>
              );
            })}
          </div>
          <div className="weekly-footer">
            <span>
              <strong>{currentWeek.percent}%</strong> за неделю
            </span>
            <span className={delta < 0 ? 'down' : 'up'}>
              {delta < 0 ? (
                <ArrowDownRight size={14} />
              ) : delta > 0 ? (
                <ArrowUpRight size={14} />
              ) : (
                <Minus size={13} />
              )}{' '}
              {Math.abs(delta)} п. п.
            </span>
          </div>
        </section>
        <section className="panel side-panel friends-panel">
          <div className="side-heading">
            <span className="tile purple">
              <Users size={20} />
            </span>
            <div>
              <h3>Активность друзей</h3>
              <p>Последние достижения</p>
            </div>
            <button
              className="icon-button side-link"
              onClick={() => go('friends')}
              aria-label="Открыть друзей"
            >
              <ArrowUpRight size={19} />
            </button>
          </div>
          {state.feed.length ? (
            <div className="side-feed">
              {state.feed.slice(0, 3).map((item) => (
                <div key={item.id}>
                  <Avatar person={item.person} size={30} />
                  <div>
                    <strong>{item.person.name}</strong>
                    <small>{item.title}</small>
                  </div>
                  <HabitIcon name={item.icon} size={16} />
                </div>
              ))}
            </div>
          ) : (
            <div className="side-empty">
              <p>Добавьте друзей, чтобы видеть их прогресс и поддерживать друг друга.</p>
              <button className="text-button" onClick={() => go('friends')}>
                <Plus size={16} /> Найти друзей
              </button>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

export function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="panel metric">
      <div>
        <span className="tile green">
          <Icon size={19} />
        </span>
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
    </div>
  );
}
