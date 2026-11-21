'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { MotionConfig, motion } from 'framer-motion';
import {
  Bell,
  CalendarCheck,
  ChartNoAxesColumnIncreasing,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Flag,
  Home,
  LogIn,
  Plus,
  Settings2,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import {
  achievements,
  capitalize,
  dateInZone,
  formatDay,
  isDone,
  plural,
  summary,
  type Habit,
  type Snapshot,
} from '@/lib/domain';
import { applyGuest, guestSnapshot } from '@/lib/guest';
import { locale } from '@/lib/locale';
import type { Action } from '@/lib/validation';
import { Dashboard, HabitManager } from './dashboard';
import { ChallengeForm, HabitForm, NumberForm } from './forms';
import { Awards, PreferencesView } from './settings';
import { Challenges, Friends } from './social';
import { Avatar, Empty, Logo, Modal, Toasts, cssVars } from './ui';

const Statistics = dynamic(() => import('./statistics').then((module) => module.Statistics), {
  loading: () => <div className="panel skeleton chart-skeleton" aria-label="Загрузка статистики" />,
});
const nav = [
  { id: 'home', icon: Home, ...locale.navigation.home },
  { id: 'habits', icon: CalendarCheck, ...locale.navigation.habits },
  { id: 'stats', icon: ChartNoAxesCombined, ...locale.navigation.stats },
  { id: 'friends', icon: Users, ...locale.navigation.friends },
  { id: 'challenges', icon: Flag, ...locale.navigation.challenges },
  { id: 'awards', icon: Trophy, ...locale.navigation.awards },
  { id: 'settings', icon: Settings2, ...locale.navigation.settings },
] as const;
type View = (typeof nav)[number]['id'];
const mobileTabs = [
  { id: 'home', icon: Home, title: locale.navigation.home.title },
  { id: 'habits', icon: CircleCheck, title: locale.navigation.habits.title },
  { id: 'stats', icon: ChartNoAxesColumnIncreasing, title: locale.navigation.stats.title },
  { id: 'settings', icon: UserRound, title: 'Профиль' },
] as const;
const profileSections = nav.filter(({ id }) => id === 'friends' || id === 'challenges' || id === 'awards');
type Dialog =
  | { kind: 'habit'; habit?: Habit }
  | { kind: 'number'; habit: Habit; day: string }
  | { kind: 'challenge' }
  | { kind: 'notes' }
  | { kind: 'welcome' }
  | { kind: 'join'; code: string }
  | null;
type LogAction = Extract<Action, { type: 'log' }>;
type AwardNotice = { id: string; log?: Pick<LogAction, 'id' | 'day'> };
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const guestKey = 'ritm.guest.workspace';
const accountKey = 'ritm.tab.workspace';
const outboxKey = 'ritm.tab.log-outbox';
const signOutKey = 'ritm.account.sign-out';

function stored<T>(key: string, storage: Storage): T | null {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}
function initialView(): View {
  const view = new URLSearchParams(location.search).get('view');
  return nav.find((item) => item.id === view)?.id ?? 'home';
}
function applyLog(state: Snapshot, input: LogAction): Snapshot {
  return {
    ...state,
    habits: state.habits.map((habit) =>
      habit.id === input.id ? { ...habit, logs: { ...habit.logs, [input.day]: input.value } } : habit,
    ),
  };
}
function accentStyle(accent: string, theme: 'dark' | 'light') {
  const [red, green, blue] = [1, 3, 5]
    .map((offset) => parseInt(accent.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return {
    '--accent': accent,
    '--green-ink': luminance > 0.19 ? '#152107' : '#fff',
    '--accent-text':
      theme === 'light'
        ? 'color-mix(in srgb, var(--accent) 32%, #253a16)'
        : `color-mix(in srgb, var(--accent) ${luminance < 0.2 ? 42 : 87}%, white)`,
  } as const;
}
async function request(input?: Action) {
  const response = await fetch(
    '/api/workspace',
    input
      ? {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
          cache: 'no-store',
        }
      : { cache: 'no-store' },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new WorkspaceError(body.error ?? 'Не удалось сохранить изменения.', response.status);
  }
  return (await response.json()) as Snapshot & { habitInvitesCreated?: number };
}
class WorkspaceError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function WorkspaceSkeleton() {
  return (
    <div className="shell shell-loading" aria-busy="true">
      <aside className="sidebar">
        <Logo />
        <div className="skeleton nav-skeleton" />
      </aside>
      <main className="workspace">
        <div className="skeleton heading-skeleton" />
        <div className="dashboard-grid">
          <div className="view-stack">
            <div className="skeleton calendar-skeleton" />
            <div className="skeleton chart-skeleton" />
            <div className="skeleton list-skeleton" />
          </div>
          <div className="dashboard-aside">
            <div className="skeleton calendar-skeleton" />
            <div className="skeleton chart-skeleton" />
          </div>
        </div>
      </main>
    </div>
  );
}

export function Workspace({
  initial,
  offlinePage = false,
  publicKey,
  unavailable = false,
}: {
  initial: Snapshot | null;
  offlinePage?: boolean;
  publicKey: string;
  unavailable?: boolean;
}) {
  const [state, setState] = useState(initial);
  const [view, setView] = useState<View>('home');
  const [selected, setSelected] = useState('');
  const [clock, setClock] = useState(() => new Date());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [award, setAward] = useState<AwardNotice>();
  const [online, setOnline] = useState(true);
  const [install, setInstall] = useState<InstallEvent>();
  const [pushSupported, setPushSupported] = useState(false);
  const dataRef = useRef(initial);
  const remoteBusy = useRef(false);
  const queueRef = useRef<LogAction[]>([]);
  const joinShown = useRef(false);
  const tell = useCallback((text: string, error = false) => setToast({ text, error }), []);
  const update = useCallback(
    (data: Snapshot) => {
      dataRef.current = data;
      setState(data);
      try {
        if (data.profile.id === 'guest') localStorage.setItem(guestKey, JSON.stringify(data));
        else sessionStorage.setItem(accountKey, JSON.stringify(data));
      } catch {
        tell('Хранилище браузера заполнено. Изменения доступны в текущей вкладке.', true);
      }
    },
    [tell],
  );

  const saveQueue = useCallback(
    (queue: LogAction[]) => {
      queueRef.current = queue;
      const user = dataRef.current?.profile.id;
      try {
        if (user) sessionStorage.setItem(outboxKey, JSON.stringify({ user, queue }));
      } catch {
        tell('Очередь отметок сохранена только до перезагрузки страницы.', true);
      }
    },
    [tell],
  );

  const finish = useCallback(
    (before: Snapshot, after: Snapshot, message?: string, input?: Action) => {
      update(after);
      const unlocked = after.profile.awards.find((id) => !before.profile.awards.includes(id));
      if (unlocked) {
        const log = input?.type === 'log' ? { id: input.id, day: input.day } : undefined;
        setAward({ id: unlocked, log });
      }
      if (message) tell(message);
    },
    [tell, update],
  );

  const refresh = useCallback(async () => {
    const current = dataRef.current;
    if (!current || current.profile.id === 'guest' || remoteBusy.current || !navigator.onLine) return;
    remoteBusy.current = true;
    try {
      let data: Snapshot | undefined;
      while (queueRef.current.length) {
        const [next, ...rest] = queueRef.current;
        try {
          data = await request(next);
        } catch (error) {
          if (
            error instanceof TypeError ||
            !navigator.onLine ||
            (error instanceof WorkspaceError && (error.status === 429 || error.status >= 500))
          )
            return;
          if (error instanceof WorkspaceError && error.status === 401) throw error;
          tell(error instanceof Error ? error.message : 'Не удалось синхронизировать отметку.', true);
        }
        saveQueue(rest);
      }
      finish(current, data ?? (await request()));
    } catch (error) {
      if (error instanceof WorkspaceError && error.status === 401) {
        sessionStorage.removeItem(accountKey);
        location.assign('/account');
      }
    } finally {
      remoteBusy.current = false;
    }
  }, [finish, saveQueue, tell]);

  useEffect(() => {
    setView(initialView());
    setOnline(!offlinePage && navigator.onLine);
    const cached = offlinePage || unavailable ? stored<Snapshot>(accountKey, sessionStorage) : null;
    const data = initial ?? cached ?? stored<Snapshot>(guestKey, localStorage) ?? guestSnapshot();
    const outbox = stored<{ user: string; queue: LogAction[] }>(outboxKey, sessionStorage);
    if (outbox?.user === data.profile.id) queueRef.current = outbox.queue;
    update(queueRef.current.reduce(applyLog, data));
    if (queueRef.current.length && !offlinePage) void refresh();
    if (!data.profile.settings.onboarded && data.profile.id !== 'guest') setDialog({ kind: 'welcome' });
    const onPop = () => setView(initialView());
    const onOnline = () => {
      setOnline(true);
      if (offlinePage) location.reload();
      else void refresh();
    };
    const onOffline = () => setOnline(false);
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    const onInstalled = () => setInstall(undefined);
    const onSignOut = (event: StorageEvent) => {
      if (event.key !== signOutKey || !event.newValue?.startsWith(`${dataRef.current?.profile.id}:`))
        return;
      sessionStorage.removeItem(accountKey);
      sessionStorage.removeItem(outboxKey);
      location.assign('/');
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', refresh);
    window.addEventListener('beforeinstallprompt', onInstall);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('storage', onSignOut);
    const interval = setInterval(() => {
      setClock(new Date());
      if (document.visibilityState === 'visible') void refresh();
    }, 45_000);
    if ('serviceWorker' in navigator) {
      setPushSupported('PushManager' in window && 'Notification' in window);
      if (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))
        void navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    return () => {
      clearInterval(interval);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('beforeinstallprompt', onInstall);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('storage', onSignOut);
    };
  }, [initial, offlinePage, refresh, unavailable, update]);

  useEffect(() => {
    if (!state || !state.profile.settings.onboarded || joinShown.current) return;
    joinShown.current = true;
    const code = new URLSearchParams(location.search).get('join');
    if (code && /^[a-f0-9-]{36}$/i.test(code)) setDialog({ kind: 'join', code });
  }, [state]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    if (!award) return;
    const timeout = setTimeout(() => setAward(undefined), 5300);
    return () => clearTimeout(timeout);
  }, [award]);
  useEffect(() => {
    if (!state) return;
    const { accent, theme } = state.profile.settings;
    document.documentElement.dataset.theme = theme;
    for (const [property, value] of Object.entries(accentStyle(accent, theme)))
      document.documentElement.style.setProperty(property, value);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0D0D0F' : '#F6F7F4');
  }, [state]);

  const submit = async (input: Action, message?: string): Promise<boolean> => {
    const current = dataRef.current;
    if (!current) return false;
    if (current.profile.id === 'guest') {
      try {
        finish(current, applyGuest(current, input), message, input);
        return true;
      } catch (error) {
        tell(error instanceof Error ? error.message : 'Не удалось применить изменение.', true);
        return false;
      }
    }
    if (remoteBusy.current) {
      tell('Подождите, пока сохранится предыдущее изменение.');
      return false;
    }
    const queueLog = () => {
      if (input.type !== 'log') {
        tell('Подключитесь к интернету для этого действия.', true);
        return false;
      }
      saveQueue([
        ...queueRef.current.filter((item) => item.id !== input.id || item.day !== input.day),
        input,
      ]);
      update(applyLog(current, input));
      tell('Отметка сохранена в этой вкладке. Синхронизируем её после подключения.');
      return true;
    };
    if (!navigator.onLine || offlinePage) return queueLog();
    if (queueRef.current.length) {
      void refresh();
      tell('Синхронизируем сохранённые отметки.');
      return false;
    }
    remoteBusy.current = true;
    if (input.type === 'log') setState(applyLog(current, input));
    try {
      const { habitInvitesCreated, ...data } = await request(input);
      const receipt = habitInvitesCreated === undefined
        ? undefined
        : habitInvitesCreated === 0
          ? 'Эти приглашения уже отправлялись'
          : habitInvitesCreated === 1
            ? 'Приглашение отправлено'
            : `Отправлено ${plural(habitInvitesCreated, ['приглашение', 'приглашения', 'приглашений'])}`;
      const confirmation = receipt ? [message, receipt].filter(Boolean).join('. ') : message;
      finish(current, data, confirmation, input);
      return true;
    } catch (error) {
      setState(current);
      if (error instanceof TypeError) return queueLog();
      if (error instanceof WorkspaceError && error.status === 401) {
        sessionStorage.removeItem(accountKey);
        location.assign('/account');
        return false;
      }
      tell(error instanceof Error ? error.message : 'Не удалось сохранить изменения.', true);
      return false;
    } finally {
      remoteBusy.current = false;
    }
  };

  const go = (next: View) => {
    setView(next);
    const url = new URL(location.href);
    if (next === 'home') url.searchParams.delete('view');
    else url.searchParams.set('view', next);
    if (url.href !== location.href) history.pushState(null, '', url);
    window.scrollTo(0, 0);
  };
  const close = () => setDialog(null);
  if (!state) return <WorkspaceSkeleton />;
  const account = state.profile.id !== 'guest';
  const today = dateInZone(state.profile.settings.timezone, clock);
  const day = selected || today;
  const unread = state.notifications.filter((note) => !note.read).length;
  const navItem = nav.find((item) => item.id === view) ?? nav[0];
  const firstName = state.profile.name.split(' ')[0];
  const level = Math.floor(state.profile.xp / 100) + 1;
  const unlocked = achievements.find((item) => item.id === award?.id);
  const create = () => setDialog({ kind: 'habit' });
  const edit = (habit: Habit) => setDialog({ kind: 'habit', habit });
  const mark = async (habit: Habit, value: number, date = day) => {
    const wasDone = isDone(habit, date);
    const completed = value >= habit.target && !wasDone;
    const undone = value < habit.target && wasDone;
    const next =
      completed &&
      summary(applyLog(state, { type: 'log', id: habit.id, day: date, value }).habits, date).percent ===
        100;
    const message = next
      ? 'План дня выполнен!'
      : undone && state.profile.xp > 0
        ? 'Отметка отменена. Начисленный опыт сохраняется.'
        : undefined;
    const saved = await submit({ type: 'log', id: habit.id, day: date, value }, message);
    if (undone && saved)
      setAward((notice) => (notice?.log?.id === habit.id && notice.log.day === date ? undefined : notice));
    return saved;
  };
  const number = (habit: Habit) => setDialog({ kind: 'number', habit, day });
  const onboard = async (start: boolean) => {
    if (await submit({ type: 'settings', settings: { ...state.profile.settings, onboarded: true } })) {
      if (start) create();
      else close();
    }
  };
  const managePush =
    account && publicKey && pushSupported
      ? async () => {
          try {
            const worker = await navigator.serviceWorker.getRegistration();
            if (!worker?.active)
              throw new Error('Служба уведомлений готовится. Откройте настройки ещё раз.');
            const existing = await worker.pushManager.getSubscription();
            if (existing) {
              if (
                await submit(
                  { type: 'unpush', endpoint: existing.endpoint },
                  'Push на этом устройстве отключены',
                )
              )
                await existing.unsubscribe();
              return;
            }
            if ((await Notification.requestPermission()) !== 'granted')
              throw new Error('Разрешите уведомления в настройках браузера.');
            const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (char) =>
              char.charCodeAt(0),
            );
            const subscription = await worker.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: key,
            });
            const { endpoint, keys } = subscription.toJSON();
            if (!endpoint || !keys?.p256dh || !keys.auth)
              throw new Error('Браузер не передал данные для подписки.');
            if (
              !(await submit(
                { type: 'push', endpoint, p256dh: keys.p256dh, auth: keys.auth },
                'Push-уведомления включены',
              ))
            )
              await subscription.unsubscribe();
          } catch (error) {
            tell(error instanceof Error ? error.message : 'Уведомления недоступны.', true);
          }
        }
      : undefined;

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="shell"
        style={cssVars(accentStyle(state.profile.settings.accent, state.profile.settings.theme))}
      >
        <aside className="sidebar">
          <button className="brand-button" onClick={() => go('home')} aria-label="Ритм — главная">
            <Logo />
          </button>
          <nav className="desktop-nav" aria-label="Основная навигация">
            <span>ПРОСТРАНСТВО</span>
            {nav.map((item) => (
              <button
                key={item.id}
                className={view === item.id ? 'active' : ''}
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => go(item.id)}
              >
                <item.icon size={19} strokeWidth={1.8} />
                <span>{item.title}</span>
                {view === item.id && <i />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <button className="sidebar-level" onClick={() => go('awards')}>
              <span className="tile green">
                <Sparkles size={17} />
              </span>
              <span>
                <strong>Уровень {level}</strong>
                <small>{state.profile.xp % 100} / 100 XP</small>
                <span className="meter">
                  <i style={{ width: `${state.profile.xp % 100}%` }} />
                </span>
              </span>
            </button>
            {account ? (
              <button className="sidebar-profile" onClick={() => go('settings')}>
                <Avatar person={state.profile} />
                <span>
                  <strong>{state.profile.name}</strong>
                  <small>@{state.profile.username}</small>
                </span>
                <ChevronDown size={16} />
              </button>
            ) : (
              <a className="sidebar-profile" href="/account">
                <Avatar person={state.profile} />
                <span>
                  <strong>Гостевой режим</strong>
                  <small>Войти в аккаунт</small>
                </span>
                <LogIn size={16} />
              </a>
            )}
          </div>
        </aside>
        <main className="workspace">
          <div className="mobile-brand">
            <button className="brand-button" onClick={() => go('home')}>
              <Logo />
            </button>
          </div>
          <header className="workspace-header">
            <div className="heading-content">
              <div className="eyebrow">
                <i />{' '}
                {view === 'home'
                  ? capitalize(formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' }))
                  : 'Моё пространство'}
              </div>
              <h1>
                {view === 'home' ? (
                  <>
                    {day === today ? 'Сегодня' : capitalize(formatDay(day, { day: 'numeric', month: 'long' }))}
                    <span className="heading-accent">.</span>
                  </>
                ) : view === 'settings' ? (
                  <>
                    <span className="settings-title">{navItem.title}</span>
                    <span className="mobile-profile-title">Профиль</span>
                  </>
                ) : (
                  navItem.title
                )}
              </h1>
              <p>
                {view === 'home'
                  ? account
                    ? `Привет, ${firstName}! Какая привычка сегодня в приоритете?`
                    : 'Привет! Что в плане на сегодня?'
                  : navItem.description}
              </p>
            </div>
            <div className="header-actions">
              <button
                className="icon-button header-bell"
                aria-label={unread ? `Уведомления, непрочитанных ${unread}` : 'Уведомления'}
                onClick={() => setDialog({ kind: 'notes' })}
              >
                <Bell size={20} />
                {unread > 0 && <i />}
              </button>
              <button
                className="header-avatar"
                aria-label="Открыть профиль"
                onClick={() => go('settings')}
              >
                <Avatar person={state.profile} size={41} />
              </button>
              {view === 'home' && (
                <button className="primary header-create" aria-label="Новая привычка" onClick={create}>
                  <Plus size={19} /> <span>Новая привычка</span>
                </button>
              )}
            </div>
          </header>
          {(!online || unavailable) && (
            <div className="offline-banner" role="status">
              <WifiOff size={17} />
              {!online
                ? 'Нет соединения. Отметки можно сохранить в этой вкладке.'
                : 'Сервер временно недоступен. Показаны данные на этом устройстве.'}
            </div>
          )}
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {view === 'home' && (
              <Dashboard
                state={state}
                today={today}
                day={day}
                date={setSelected}
                edit={edit}
                mark={(habit, value) => void mark(habit, value)}
                number={number}
                create={create}
                go={go}
              />
            )}
            {view === 'habits' && (
              <HabitManager
                state={state}
                today={today}
                create={create}
                edit={edit}
                mark={(habit, value) => void mark(habit, value, today)}
                number={number}
                reorder={(ids) => void submit({ type: 'reorder', ids }, 'Порядок сохранён')}
              />
            )}
            {view === 'stats' && <Statistics state={state} today={today} />}
            {view === 'friends' && (
              <Friends state={state} account={account} submit={submit} tell={tell} />
            )}
            {view === 'challenges' && (
              <Challenges
                state={state}
                today={today}
                submit={submit}
                tell={tell}
                create={() => setDialog({ kind: 'challenge' })}
              />
            )}
            {view === 'awards' && <Awards state={state} />}
            {view === 'settings' && (
              <>
                <nav className="mobile-profile-links panel" aria-label="Другие разделы Ритма">
                  {profileSections.map((item) => (
                    <button key={item.id} onClick={() => go(item.id)}>
                      <item.icon size={19} aria-hidden="true" />
                      <span>{item.title}</span>
                      <ChevronRight size={17} aria-hidden="true" />
                    </button>
                  ))}
                </nav>
                <PreferencesView
                  state={state}
                  today={today}
                  now={clock}
                  account={account}
                  submit={submit}
                  tell={tell}
                  push={managePush}
                  testReminder={async () => {
                    if (await submit({ type: 'testReminder' })) setDialog({ kind: 'notes' });
                  }}
                  install={
                    install
                      ? () => {
                          void install
                            .prompt()
                            .then(() => install.userChoice)
                            .then(() => setInstall(undefined))
                            .catch(() => tell('Установка недоступна.', true));
                        }
                      : undefined
                  }
                  signOut={async () => {
                    if (queueRef.current.length) {
                      tell('Сначала синхронизируйте отметки.', true);
                      return;
                    }
                    try {
                      await signOut({ redirect: false });
                      sessionStorage.removeItem(accountKey);
                      sessionStorage.removeItem(outboxKey);
                      localStorage.setItem(signOutKey, `${state.profile.id}:${Date.now()}`);
                      location.assign('/');
                    } catch {
                      tell('Не удалось выйти. Проверьте соединение.', true);
                    }
                  }}
                />
              </>
            )}
          </motion.div>
        </main>
        <nav className="mobile-nav" aria-label="Навигация на телефоне">
          {mobileTabs.map((tab) => {
            const active = view === tab.id;
            const parent = tab.id === 'settings' && profileSections.some((item) => item.id === view);
            return (
              <button
                key={tab.id}
                aria-current={active ? 'page' : parent ? 'location' : undefined}
                onClick={() => go(tab.id)}
              >
                <tab.icon
                  size={23}
                  strokeWidth={active || parent ? 2.35 : 1.8}
                  fill={tab.id === 'home' && active ? 'currentColor' : 'none'}
                  aria-hidden="true"
                />
                <span>{tab.title}</span>
              </button>
            );
          })}
        </nav>
        {dialog?.kind === 'habit' && (
          <HabitForm
            habit={dialog.habit}
            today={today}
            friends={state.friends}
            sentInvites={state.sentInvites?.filter((invite) => invite.habitId === dialog.habit?.id)}
            account={account}
            close={close}
            submit={submit}
          />
        )}
        {dialog?.kind === 'number' && (
          <NumberForm
            habit={dialog.habit}
            day={dialog.day}
            close={close}
            save={(value) => mark(dialog.habit, value, dialog.day)}
          />
        )}
        {dialog?.kind === 'challenge' && (
          <ChallengeForm
            today={today}
            friends={state.friends}
            account={account}
            close={close}
            submit={submit}
          />
        )}
        {dialog?.kind === 'notes' && (
          <Modal title="Уведомления" close={close}>
            {state.notifications.length ? (
              <>
                <div className="notification-list">
                  {state.notifications.map((note) => (
                    <button
                      type="button"
                      key={note.id}
                      className={note.read ? '' : 'unread'}
                      onClick={async () => {
                        if (!note.read) await submit({ type: 'read', id: note.id });
                        const next = new URL(note.href, location.origin).searchParams.get('view');
                        const item = nav.find((item) => item.id === next);
                        if (item) go(item.id);
                        close();
                      }}
                    >
                      <Bell size={17} />
                      <span>
                        <strong>{note.text}</strong>
                        <small>
                          {new Date(note.createdAt).toLocaleString('ru', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                {unread > 0 && (
                  <div className="modal-actions">
                    <button
                      className="secondary"
                      onClick={() => void submit({ type: 'read' }, 'Уведомления прочитаны')}
                    >
                      Отметить все прочитанными
                    </button>
                  </div>
                )}
              </>
            ) : (
              <Empty
                icon={Bell}
                title="Уведомлений пока нет"
                description="Здесь появятся напоминания, приглашения и достижения."
              />
            )}
          </Modal>
        )}
        {dialog?.kind === 'welcome' && (
          <Modal
            title={`Добро пожаловать, ${firstName}!`}
            subtitle="Начните с одной привычки. Выберите, что хотите делать регулярно, а мы поможем следить за прогрессом."
            close={() => void onboard(false)}
          >
            <div className="onboarding-icon">
              <Sparkles size={36} />
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={() => void onboard(false)}>
                Позже
              </button>
              <button className="primary" onClick={() => void onboard(true)}>
                <Plus size={17} /> Создать первую привычку
              </button>
            </div>
          </Modal>
        )}
        {dialog?.kind === 'join' && (
          <Modal
            title="Приглашение в челлендж"
            close={() => {
              const url = new URL(location.href);
              url.searchParams.delete('join');
              history.replaceState(null, '', url);
              close();
            }}
          >
            <Empty
              icon={CircleHelp}
              title={account ? 'Присоединиться к команде?' : 'Войдите, чтобы присоединиться'}
              description="Ссылка открывает доступ к командному челленджу и таблице участников."
            >
              {account ? (
                <button
                  className="primary"
                  onClick={async () => {
                    if (
                      await submit({ type: 'join', code: dialog.code }, 'Вы присоединились к челленджу')
                    ) {
                      const url = new URL(location.href);
                      url.searchParams.delete('join');
                      history.replaceState(null, '', url);
                      close();
                      go('challenges');
                    }
                  }}
                >
                  Присоединиться
                </button>
              ) : (
                <a className="primary" href={`/account?join=${encodeURIComponent(dialog.code)}`}>
                  Войти
                </a>
              )}
            </Empty>
          </Modal>
        )}
        <Toasts message={toast} close={() => setToast(null)} />
        {unlocked && (
          <motion.div
            className="award-popup panel"
            role="status"
            initial={{ scale: 0.82, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: 'spring', bounce: 0.32 }}
          >
            <span>{unlocked.icon}</span>
            <div>
              <small>Новое достижение</small>
              <strong>{unlocked.title}</strong>
            </div>
            <button
              className="icon-button"
              aria-label="Закрыть достижение"
              onClick={() => setAward(undefined)}
            >
              <X size={17} />
            </button>
          </motion.div>
        )}
      </div>
    </MotionConfig>
  );
}
