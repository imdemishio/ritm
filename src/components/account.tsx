'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, Leaf } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { locale } from '@/lib/locale';
import { Logo } from './ui';

type Mode = 'login' | 'register' | 'recover' | 'reset';
const labels = locale.account;

export function Account({ reset, join }: { reset?: string; join?: string }) {
  const [mode, setMode] = useState<Mode>(reset ? 'reset' : 'login');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const to = (mode: Mode) => {
    setMode(mode);
    setError('');
    setNotice('');
  };
  const destination = join ? `/?join=${encodeURIComponent(join)}` : '/';
  const send = async (data: Record<string, string>) => {
    const response = await fetch('/api/account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error);
    }
  };
  return (
    <main className="account-page">
      <a href={destination}>
        <Logo />
      </a>
      <div className="panel account-card">
        <span className="tile green">
          <Leaf size={22} />
        </span>
        <h1>{labels[mode]}</h1>
        <p>
          {mode === 'login'
            ? 'Войдите, чтобы синхронизировать привычки.'
            : mode === 'register'
              ? 'Следите за привычками на всех устройствах.'
              : mode === 'recover'
                ? 'Отправим ссылку для смены пароля.'
                : 'Используйте минимум 10 символов.'}
        </p>
        <form
          className="form-stack"
          key={mode}
          method="post"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!ready || pending) return;
            setError('');
            setNotice('');
            setPending(true);
            const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<
              string,
              string
            >;
            try {
              if (mode === 'register')
                await send({
                  type: 'register',
                  ...values,
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                });
              if (mode === 'login' || mode === 'register') {
                const response = await signIn('credentials', {
                  login: values.login ?? values.email,
                  password: values.password,
                  redirect: false,
                });
                if (!response?.ok || response.error)
                  throw new Error('Войти не удалось. Проверьте имя и пароль.');
                location.assign(destination);
              } else if (mode === 'recover') {
                await send({ type: 'recover', email: values.email });
                setNotice('Если аккаунт с таким адресом существует, на него отправлено письмо.');
              } else {
                await send({ type: 'reset', token: reset ?? '', password: values.password });
                history.replaceState(null, '', '/account');
                to('login');
                setNotice('Пароль обновлён. Теперь можно войти.');
              }
            } catch (error) {
              setError(error instanceof Error ? error.message : 'Не удалось выполнить запрос.');
            } finally {
              setPending(false);
            }
          }}
        >
          {mode === 'register' && (
            <>
              <label>
                Имя
                <input name="name" required maxLength={60} autoComplete="name" />
              </label>
              <label>
                Имя пользователя
                <input
                  name="username"
                  required
                  minLength={3}
                  maxLength={24}
                  pattern="[a-zA-Z0-9_]+"
                  autoComplete="username"
                />
              </label>
            </>
          )}
          {mode === 'login' && (
            <label>
              Почта или имя пользователя
              <input name="login" required autoComplete="username" maxLength={254} />
            </label>
          )}
          {(mode === 'register' || mode === 'recover') && (
            <label>
              Почта
              <input name="email" type="email" required maxLength={254} autoComplete="email" />
            </label>
          )}
          {mode !== 'recover' && (
            <label>
              Пароль
              <span className="password-box">
                <input
                  name="password"
                  type={visible ? 'text' : 'password'}
                  minLength={mode === 'login' ? undefined : 10}
                  maxLength={72}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="form-notice" role="status">
              {notice}
            </p>
          )}
          <button className="primary" type="submit" disabled={!ready || pending}>
            {pending
              ? 'Подождите…'
              : mode === 'login'
                ? 'Войти'
                : mode === 'register'
                  ? 'Зарегистрироваться'
                  : mode === 'recover'
                    ? 'Отправить ссылку'
                    : 'Обновить пароль'}
          </button>
        </form>
        <div className="account-links">
          {mode === 'login' ? (
            <>
              <button
                className="text-button"
                type="button"
                disabled={!ready || pending}
                onClick={() => to('register')}
              >
                Создать аккаунт
              </button>
              <button
                className="text-button"
                type="button"
                disabled={!ready || pending}
                onClick={() => to('recover')}
              >
                Забыли пароль?
              </button>
            </>
          ) : (
            <button
              className="text-button"
              type="button"
              disabled={!ready || pending}
              onClick={() => to('login')}
            >
              Вернуться ко входу
            </button>
          )}
        </div>
      </div>
      <a href={destination} className="text-button account-back">
        Открыть гостевой режим
      </a>
    </main>
  );
}
