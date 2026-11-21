'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bell,
  Camera,
  Download,
  Lock,
  LogIn,
  LogOut,
  Moon,
  Settings2,
  Shield,
  Sun,
  Trophy,
} from 'lucide-react';
import {
  achievements,
  addDays,
  formatDay,
  nextReminder,
  periodStats,
  type Preferences,
  type Settings,
  type Snapshot,
} from '@/lib/domain';
import { profileInput, settingsInput } from '@/lib/validation';
import { Avatar, Modal } from './ui';
import { Swatches, type Submit } from './forms';

export function Awards({ state }: { state: Snapshot }) {
  const level = Math.floor(state.profile.xp / 100) + 1;
  return (
    <div className="view-stack">
      <section className="panel level-panel">
        <span className="tile green">
          <Trophy size={25} />
        </span>
        <div>
          <h2>Уровень {level}</h2>
          <p>
            {state.profile.xp} XP · {100 - (state.profile.xp % 100)} XP до следующего уровня
          </p>
          <div className="meter">
            <i style={{ width: `${state.profile.xp % 100}%` }} />
          </div>
        </div>
      </section>
      <div className="section-title">
        <div>
          <h2>Коллекция</h2>
          <p>
            {state.profile.awards.length} из {achievements.length} открыто
          </p>
        </div>
      </div>
      <div className="award-grid">
        {achievements.map((item) => {
          const active = state.profile.awards.includes(item.id);
          return (
            <motion.article
              layout
              className={`panel award ${active ? 'unlocked' : ''}`}
              key={item.id}
              whileHover={{ y: -2 }}
            >
              <span className="award-icon" aria-hidden="true">
                {item.icon}
              </span>
              {!active && <Lock className="award-lock" size={16} aria-label="Закрыто" />}
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}

async function makeAvatar(file: File) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8_000_000)
    throw new Error('Выберите JPEG, PNG или WebP размером до 8 МБ.');
  const image = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const side = Math.min(image.width, image.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не удалось обработать изображение.');
  context.drawImage(
    image,
    (image.width - side) / 2,
    (image.height - side) / 2,
    side,
    side,
    0,
    0,
    256,
    256,
  );
  image.close();
  return canvas.toDataURL('image/webp', 0.82);
}

export function PreferencesView({
  state,
  today,
  now,
  account,
  submit,
  tell,
  push,
  testReminder,
  install,
  signOut,
}: {
  state: Snapshot;
  today: string;
  now: Date;
  account: boolean;
  submit: Submit;
  tell: (message: string, error?: boolean) => void;
  push?: () => void;
  testReminder: () => Promise<void>;
  install?: () => void;
  signOut: () => void;
}) {
  const profile = state.profile;
  const [settings, setSettings] = useState(profile.settings);
  const [preferences, setPreferences] = useState(profile.preferences);
  const [draft, setDraft] = useState({
    name: profile.name,
    username: profile.username,
    bio: profile.bio,
    avatar: profile.avatar,
  });
  const [confirm, setConfirm] = useState(false);
  const [testingReminder, setTestingReminder] = useState(false);
  const timezone = profile.settings.timezone;
  const upcoming = account && preferences.reminders ? nextReminder(state.habits, timezone, now) : undefined;
  const period = periodStats(state.habits, addDays(today, -29), today);
  const friendCount = state.friends.filter((item) => item.status === 'accepted').length;
  const saveSettings = (data: Settings) => {
    const parsed = settingsInput.safeParse(data);
    if (!parsed.success) {
      tell(parsed.error.issues[0].message, true);
      return;
    }
    void submit({ type: 'settings', settings: parsed.data }, 'Настройки сохранены');
  };
  const changePreference = (key: keyof Preferences, value: boolean) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    void submit({ type: 'preferences', preferences: next }, 'Уведомления настроены').then((ok) => {
      if (!ok) setPreferences(profile.preferences);
    });
  };
  const settingsChange = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };
  return (
    <div className="view-stack settings-view">
      <section className="panel list-panel">
        <div className="section-title">
          <div>
            <h2>Профиль</h2>
            <p>{account ? 'Имя, аватар и личная информация' : 'Профиль на этом устройстве'}</p>
          </div>
          <span className="tile purple">
            <Settings2 size={19} />
          </span>
        </div>
        <div className="profile-summary">
          <Avatar person={draft} size={66} />
          <div>
            <strong>{profile.name}</strong>
            <small>
              @{profile.username} · Уровень {Math.floor(profile.xp / 100) + 1} · {profile.xp} XP
            </small>
            <small>
              С{' '}
              {formatDay(profile.createdAt.slice(0, 10), {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </small>
          </div>
        </div>
        {!account && (
          <a href="/account" className="secondary fit">
            <LogIn size={17} /> Войти или зарегистрироваться
          </a>
        )}
        <div className="public-stats">
          <div>
            <strong>{friendCount}</strong>
            <small>Друзей</small>
          </div>
          <div>
            <strong>{profile.awards.length}</strong>
            <small>Достижений</small>
          </div>
          <div>
            <strong>{period.percent}%</strong>
            <small>За последние 30 дней</small>
          </div>
        </div>
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = profileInput.safeParse(draft);
            if (!parsed.success) {
              tell(parsed.error.issues[0].message, true);
              return;
            }
            void submit({ type: 'profile', profile: parsed.data }, 'Профиль сохранён');
          }}
        >
          <div className="form-pair">
            <label>
              Имя
              <input
                required
                maxLength={60}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label>
              Имя пользователя
              <input
                required
                minLength={3}
                maxLength={24}
                value={draft.username}
                onChange={(event) => setDraft({ ...draft, username: event.target.value })}
              />
            </label>
          </div>
          <label>
            О себе
            <textarea
              rows={2}
              maxLength={420}
              value={draft.bio}
              onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
            />
          </label>
          <div className="profile-actions">
            <label className="secondary upload">
              <Camera size={17} /> Загрузить аватар
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const avatar = await makeAvatar(file);
                    setDraft((current) => ({ ...current, avatar }));
                  } catch (error) {
                    tell(error instanceof Error ? error.message : 'Не удалось загрузить аватар.', true);
                  }
                }}
              />
            </label>
            {draft.avatar && (
              <button
                className="text-button"
                type="button"
                onClick={() => setDraft({ ...draft, avatar: null })}
              >
                Убрать аватар
              </button>
            )}
            <button className="primary">Сохранить профиль</button>
          </div>
        </form>
      </section>
      <section className="panel list-panel">
        <div className="section-title">
          <div>
            <h2>Оформление</h2>
            <p>Тема и акцентный цвет</p>
          </div>
          <span className="tile green">
            <Sun size={19} />
          </span>
        </div>
        <div className="segment">
          <button
            className={settings.theme === 'dark' ? 'selected' : ''}
            onClick={() => settingsChange({ ...settings, theme: 'dark' })}
          >
            <Moon size={15} /> Тёмная
          </button>
          <button
            className={settings.theme === 'light' ? 'selected' : ''}
            onClick={() => settingsChange({ ...settings, theme: 'light' })}
          >
            <Sun size={15} /> Светлая
          </button>
        </div>
        <Swatches
          value={settings.accent}
          onChange={(accent) => {
            setSettings({ ...settings, accent });
          }}
        />
        {settings.accent !== profile.settings.accent && (
          <button className="secondary fit" onClick={() => saveSettings(settings)}>
            Применить цвет
          </button>
        )}
      </section>
      <section className="panel list-panel">
        <div className="section-title">
          <div>
            <h2>Приватность и время</h2>
            <p>Видимость статистики и границы дня</p>
          </div>
          <span className="tile purple">
            <Shield size={19} />
          </span>
        </div>
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            saveSettings(settings);
          }}
        >
          <div className="form-pair">
            <label>
              Кто может видеть статистику
              <select
                value={settings.privacy}
                onChange={(event) =>
                  setSettings({ ...settings, privacy: event.target.value as Settings['privacy'] })
                }
              >
                <option value="private">Только я</option>
                <option value="friends">Мои друзья</option>
                <option value="public">Все пользователи</option>
              </select>
            </label>
            <label>
              Часовой пояс
              <input
                required
                list="timezones"
                value={settings.timezone}
                onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}
              />
              <datalist id="timezones">
                {[
                  ...new Set([
                    'UTC',
                    'Europe/Moscow',
                    'Asia/Krasnoyarsk',
                    Intl.DateTimeFormat().resolvedOptions().timeZone,
                    ...Intl.supportedValuesOf('timeZone'),
                  ]),
                ].map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </label>
          </div>
          <button className="secondary fit">Сохранить настройки</button>
        </form>
      </section>
      <section className="panel list-panel">
        <div className="section-title">
          <div>
            <h2>Уведомления</h2>
            <p>Выберите, о чём хотите узнавать</p>
          </div>
          <span className="tile amber">
            <Bell size={19} />
          </span>
        </div>
        <div className="toggle-list">
          {(
            [
              ['reminders', 'Напоминания о привычках'],
              ['social', 'Заявки и приглашения'],
              ['achievements', 'Достижения и челленджи'],
            ] as const
          ).map(([id, label]) => (
            <label className="check-label toggle" key={id}>
              {label}
              <input
                type="checkbox"
                role="switch"
                checked={preferences[id]}
                onChange={(event) => changePreference(id, event.target.checked)}
              />
            </label>
          ))}
        </div>
        {account && preferences.reminders && (
          <div className="reminder-preview">
            <strong>Ближайшее напоминание</strong>
            {upcoming ? (
              <p className="muted">
                {upcoming.title} · {formatDay(upcoming.day, { day: 'numeric', month: 'long' })} в{' '}
                {upcoming.time} ({timezone})
              </p>
            ) : (
              <p className="muted">Назначьте время в редакторе привычки.</p>
            )}
          </div>
        )}
        <button
          className="secondary fit"
          disabled={!preferences.reminders || testingReminder}
          onClick={async () => {
            setTestingReminder(true);
            try {
              await testReminder();
            } finally {
              setTestingReminder(false);
            }
          }}
        >
          <Bell size={17} /> {testingReminder ? 'Отправляем…' : 'Пробное напоминание'}
        </button>
        {push ? (
          <button className="secondary fit" onClick={push}>
            <Bell size={17} /> Настроить push на устройстве
          </button>
        ) : (
          <p className="muted">
            Push-уведомления появятся, когда браузер и сервер будут готовы их отправлять.
          </p>
        )}
      </section>
      <section className="panel list-panel">
        <div className="section-title">
          <div>
            <h2>Приложение</h2>
            <p>Доступ с домашнего экрана</p>
          </div>
        </div>
        {install ? (
          <button className="secondary fit" onClick={install}>
            <Download size={17} /> Установить приложение
          </button>
        ) : (
          <p className="muted">
            Используйте меню браузера «Установить» или «На экран Домой», если оно доступно на вашем
            устройстве.
          </p>
        )}
        {account && (
          <button className="secondary fit" onClick={() => setConfirm(true)}>
            <LogOut size={17} /> Выйти из аккаунта
          </button>
        )}
      </section>
      {confirm && (
        <Modal title="Выйти из аккаунта?" close={() => setConfirm(false)}>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setConfirm(false)}>
              Отмена
            </button>
            <button className="danger" onClick={signOut}>
              Выйти
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
