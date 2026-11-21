'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  Activity,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Flame,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  addDays,
  daySpan,
  daysBetween,
  formatDay,
  monday,
  periodStats,
  streak,
  type Snapshot,
} from '@/lib/domain';
import { Metric } from './dashboard';
import { HabitIcon, cssVars } from './ui';

const ranges = [
  [7, 'Неделя'],
  [30, 'Месяц'],
  [365, 'Год'],
] as const;
const grid = 'var(--border)';
const axis = { fill: 'var(--muted)', fontSize: 12 };
const tooltipStyle = {
  background: 'var(--surface-raised)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  color: 'var(--text)',
};
const compactQuery = '(max-width: 680px)';
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(compactQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};

export function Statistics({ state, today }: { state: Snapshot; today: string }) {
  const [range, setRange] = useState<number>(30);
  const [heatDay, setHeatDay] = useState(today);
  const [heatOffset, setHeatOffset] = useState(0);
  const [chart, setChart] = useState<'area' | 'bar'>('area');
  const compact = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(compactQuery).matches,
    () => false,
  );
  const start = addDays(today, 1 - range);
  const dateFormat: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    ...(range === 365 || start.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
  };
  const current = useMemo(() => periodStats(state.habits, start, today), [state.habits, start, today]);
  const previous = useMemo(
    () => periodStats(state.habits, addDays(start, -range), addDays(start, -1)),
    [state.habits, start, range],
  );
  const heat = useMemo(
    () => periodStats(state.habits, monday(addDays(today, -364)), today),
    [state.habits, today],
  );
  const heatMap = useMemo(() => new Map(heat.entries.map((entry) => [entry.day, entry])), [heat]);
  const active = heatMap.get(heatDay);
  const top = useMemo(
    () =>
      state.habits
        .map((habit) => ({
          habit,
          stats: periodStats([habit], start, today),
          streak: streak(habit, today),
        }))
        .sort((a, b) => b.stats.percent - a.stats.percent || b.stats.done - a.stats.done),
    [state.habits, start, today],
  );
  const best = Math.max(0, ...top.filter((item) => !item.streak.weekly).map((item) => item.streak.best));
  const delta = current.percent - previous.percent;
  const points = current.entries.map((entry) => ({
    ...entry,
    label: formatDay(entry.day, { day: 'numeric', month: 'short' }),
  }));
  const firstOfYear = heat.entries[0].day;
  const endOfWeek = addDays(monday(today), 6);
  const last = addDays(endOfWeek, compact ? -heatOffset * 91 : 0);
  const compactStart = addDays(last, -90);
  const first = compact && compactStart > firstOfYear ? compactStart : firstOfYear;
  const maxOffset = Math.floor((daySpan(firstOfYear, endOfWeek) - 1) / 91);
  const pageHeat = (offset: number) => {
    setHeatOffset(offset);
    setHeatDay(offset ? addDays(endOfWeek, -offset * 91) : today);
  };
  const completion = [
    { value: current.done, name: 'Выполнено', color: 'var(--accent)' },
    {
      value: current.planned - current.done || Number(!current.planned),
      name: 'Осталось',
      color: 'var(--surface-raised)',
    },
  ];
  return (
    <div className="view-stack">
      <div className="section-toolbar">
        <div className="segment">
          {ranges.map(([id, label]) => (
            <button
              key={id}
              className={range === id ? 'selected' : ''}
              aria-pressed={range === id}
              onClick={() => setRange(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="muted period-label">
          {formatDay(start, dateFormat)} — {formatDay(today, dateFormat)}
        </span>
      </div>
      <div className="metrics">
        <Metric
          icon={TrendingUp}
          label="Выполнение"
          value={`${current.percent}%`}
          detail={`${delta >= 0 ? '+' : ''}${delta} п. п. к прошлому периоду`}
        />
        <Metric
          icon={CircleCheck}
          label="Выполнено целей"
          value={current.done}
          detail={`Из ${current.planned} запланированных`}
        />
        <Metric icon={Flame} label="Лучшая серия" value={best} detail="Запланированных дней подряд" />
        <Metric icon={CalendarX2} label="Дни с пропусками" value={current.missed} />
      </div>
      <div className="chart-grid">
        <section className="panel chart-panel">
          <div className="section-title">
            <div>
              <h2>Динамика</h2>
              <p>Доля выполненных целей</p>
            </div>
            <div className="segment">
              <button
                aria-pressed={chart === 'area'}
                className={chart === 'area' ? 'selected' : ''}
                onClick={() => setChart('area')}
                aria-label="Линейный график"
              >
                <Activity size={17} />
              </button>
              <button
                aria-pressed={chart === 'bar'}
                className={chart === 'bar' ? 'selected' : ''}
                onClick={() => setChart('bar')}
                aria-label="Столбчатый график"
              >
                <Target size={17} />
              </button>
            </div>
          </div>
          <div className="chart" aria-label="Выполнение целей по дням">
            <ResponsiveContainer width="100%" height="100%">
              {chart === 'area' ? (
                <AreaChart data={points} margin={{ left: -19, right: 12, top: 12 }}>
                  <defs>
                    <linearGradient id="progress-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={grid} vertical={false} />
                  <XAxis dataKey="label" tick={axis} minTickGap={23} tickLine={false} axisLine={false} />
                  <YAxis
                    domain={[0, 100]}
                    tick={axis}
                    tickFormatter={(value) => `${value}%`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [`${value}%`, 'Выполнено']}
                  />
                  <Area
                    type="monotone"
                    dataKey="percent"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    fill="url(#progress-fill)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              ) : (
                <BarChart data={points} margin={{ left: -19, right: 12, top: 12 }}>
                  <CartesianGrid stroke={grid} vertical={false} />
                  <XAxis dataKey="label" tick={axis} minTickGap={23} tickLine={false} axisLine={false} />
                  <YAxis
                    domain={[0, 100]}
                    tick={axis}
                    tickFormatter={(value) => `${value}%`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: 'var(--surface-raised)' }}
                    formatter={(value) => [`${value}%`, 'Выполнено']}
                  />
                  <Bar
                    dataKey="percent"
                    fill="var(--accent)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                    isAnimationActive={false}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel chart-panel">
          <div className="section-title">
            <div>
              <h2>Цели</h2>
              <p>Выполнено за период</p>
            </div>
          </div>
          <div className="donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={completion}
                  dataKey="value"
                  innerRadius="68%"
                  outerRadius="89%"
                  stroke="none"
                  isAnimationActive={false}
                  startAngle={90}
                  endAngle={-270}
                >
                  {completion.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <strong>{current.percent}%</strong>
          </div>
          <p className="chart-foot">
            {current.done} из {current.planned} целей
          </p>
        </section>
      </div>
      <section className="panel chart-panel">
        <div className="section-title">
          <div>
            <h2>Календарь активности</h2>
            <p>
              {formatDay(heatDay, { day: 'numeric', month: 'long', year: 'numeric' })} ·{' '}
              {active?.done ?? 0} из {active?.planned ?? 0} целей
            </p>
          </div>
          {compact && (
            <div className="calendar-controls">
              <button
                className="icon-button"
                aria-label="Более ранние недели"
                disabled={heatOffset >= maxOffset}
                onClick={() => pageHeat(heatOffset + 1)}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Более поздние недели"
                disabled={!heatOffset}
                onClick={() => pageHeat(heatOffset - 1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          )}
        </div>
        <div className="heatmap" style={cssVars({ '--weeks': Math.ceil(daySpan(first, last) / 7) })}>
          {daysBetween(first, last).map((date) => {
            const entry = heatMap.get(date);
            return date > today ? (
              <span key={date} />
            ) : (
              <button
                key={date}
                type="button"
                title={`${formatDay(date, { day: 'numeric', month: 'short' })} · ${entry?.done ?? 0}/${entry?.planned ?? 0}`}
                aria-label={`${formatDay(date, { day: 'numeric', month: 'long' })} · ${entry?.done ?? 0} из ${entry?.planned ?? 0}`}
                aria-pressed={date === heatDay}
                onFocus={() => setHeatDay(date)}
                onMouseEnter={() => setHeatDay(date)}
                onClick={() => setHeatDay(date)}
                className={`heat-cell heat-${entry?.done ? Math.max(1, Math.ceil(entry.percent / 25)) : 0}`}
              />
            );
          })}
        </div>
        <div className="heat-legend">
          <span>Меньше</span>
          {[0, 1, 2, 3, 4].map((value) => (
            <i className={`heat-cell heat-${value}`} key={value} />
          ))}
          <span>Больше</span>
        </div>
      </section>
      <section className="panel chart-panel">
        <div className="section-title">
          <div>
            <h2>Успешные привычки</h2>
            <p>Текущие и рекордные серии</p>
          </div>
        </div>
        {!top.length && (
          <p className="muted">Создайте свою первую привычку, чтобы начать отслеживать прогресс.</p>
        )}
        <div className="ranking">
          {top.map(({ habit, stats, streak }) => (
            <div key={habit.id} style={cssVars({ '--habit': habit.color })}>
              <span className="habit-icon">
                <HabitIcon name={habit.icon} size={18} />
              </span>
              <div>
                <strong>{habit.title}</strong>
                <small>
                  Серия {streak.current} · рекорд {streak.best}
                  {streak.weekly ? ' нед.' : ''}
                </small>
              </div>
              <div className="meter">
                <i style={{ width: `${stats.percent}%` }} />
              </div>
              <b>{stats.percent}%</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
