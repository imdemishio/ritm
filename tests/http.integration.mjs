import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { promisify } from 'node:util';

const origin = process.env.RITM_TEST_ORIGIN ?? 'http://127.0.0.1:3000';
const day = new Date().toISOString().slice(0, 10);
const run = randomUUID().slice(0, 8);
const password = `test-password-${run}`;

test('Russian page and the installable offline shell are served', async () => {
  const [home, offline, manifest, worker] = await Promise.all(
    ['/', '/offline', '/manifest.webmanifest', '/sw.js'].map((path) => fetch(`${origin}${path}`)),
  );
  for (const response of [home, offline, manifest, worker]) assert.equal(response.status, 200);
  assert.match(await home.text(), /<html[^>]+lang="ru"/);
  const offlineShell = await offline.text();
  assert.match(offlineShell, /\/_next\/static\//);
  const pwa = await manifest.json();
  assert.equal(pwa.start_url, '/');
  assert.equal(pwa.display, 'standalone');
  assert.ok(pwa.icons.some((icon) => icon.purpose === 'maskable'));
  assert.match(await worker.text(), /addEventListener\('push'/);
});

test('Server-rendered account forms cannot send credentials in the URL', async () => {
  for (const path of ['/account', `/account?reset=${'0'.repeat(64)}`]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200);
    const markup = await response.text();
    const form = markup.match(/<form\b[^>]*>[\s\S]*?<\/form>/i)?.[0] ?? '';
    assert.match(form, /^<form\b[^>]*\bmethod="post"/i);
    assert.match(form, /<button\b(?=[^>]*\btype="submit")(?=[^>]*\bdisabled[=>\s])[^>]*>/i);
    const modeLinks = markup.match(/<div class="account-links">([\s\S]*?)<\/div>/)?.[1] ?? '';
    const switches = modeLinks.match(/<button\b[^>]*>/gi) ?? [];
    assert.equal(switches.length, path === '/account' ? 2 : 1);
    for (const button of switches) {
      assert.match(button, /\btype="button"/i);
      assert.match(button, /\bdisabled[=>\s]/i);
    }
  }
});

function browser() {
  const cookies = new Map();
  return async (path, body, format = 'json', expected = 200) => {
    const response = await fetch(`${origin}${path}`, {
      method: body ? 'POST' : 'GET',
      redirect: 'manual',
      headers: {
        origin,
        cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(body
          ? {
              'content-type':
                format === 'form' ? 'application/x-www-form-urlencoded' : 'application/json',
            }
          : {}),
        ...(format === 'form' ? { 'X-Auth-Return-Redirect': '1' } : {}),
      },
      body: body ? (format === 'form' ? new URLSearchParams(body) : JSON.stringify(body)) : undefined,
    });
    for (const cookie of response.headers.getSetCookie()) {
      const entry = cookie.slice(0, cookie.indexOf(';') > 0 ? cookie.indexOf(';') : undefined);
      const key = entry.slice(0, entry.indexOf('='));
      cookies.set(key, entry.slice(key.length + 1));
    }
    const data = await response.json();
    assert.equal(response.status, expected, `${path} ${body?.type ?? ''} ${JSON.stringify(data)}`);
    return data;
  };
}

async function register(request, letter) {
  const username = `ritm_${run}_${letter}`;
  await request('/api/account', {
    type: 'register',
    name: `Ритм ${letter.toUpperCase()}`,
    username,
    email: `${username}@example.test`,
    password,
    timezone: 'UTC',
  });
  const { csrfToken } = await request('/api/auth/csrf');
  await request(
    '/api/auth/callback/credentials',
    { csrfToken, login: username, password, redirectTo: origin },
    'form',
  );
  const state = await request('/api/workspace');
  assert.equal(state.profile.username, username);
  assert.equal(state.profile.settings.onboarded, false);
  return state.profile;
}

test('account isolation, friends, shared habits, repeat-safe XP and team challenges', async () => {
  const a = browser();
  const b = browser();
  const workspace = '/api/workspace';
  await a(workspace, undefined, 'json', 401);
  const alice = await register(a, 'a');
  const bob = await register(b, 'b');
  const search = await a(`/api/people?q=${bob.username}`);
  assert.equal(search[0].id, bob.id);
  assert.equal((await a(`/api/people?id=${bob.id}`)).stats, null);
  await a(workspace, { type: 'sendFriend', id: bob.id });
  const pending = await b(workspace);
  assert.equal(pending.notifications[0].kind, 'social');
  await b(workspace, { type: 'friend', id: pending.friends[0].id, decision: 'accept' });
  assert.ok((await a(`/api/people?id=${bob.id}`)).stats);

  const habit = {
    title: 'Читать',
    description: 'Читаем каждый день',
    color: '#B6F36B',
    icon: 'book',
    category: 'Саморазвитие',
    kind: 'count',
    target: 2,
    unit: 'стр.',
    start: day,
    end: null,
    reminder: null,
    visibility: 'friends',
    schedule: { mode: 'daily', days: [], quota: 1, dates: [] },
  };
  const saved = await a(workspace, { type: 'saveHabit', habit, invites: [bob.id] });
  assert.equal(saved.habitInvitesCreated, 1);
  const id = saved.habits[0].id;
  assert.deepEqual(saved.sentInvites, [{ habitId: id, userId: bob.id, status: 'pending' }]);
  const repeatedInvite = await a(workspace, { type: 'saveHabit', id, habit, invites: [bob.id] });
  assert.equal(repeatedInvite.habitInvitesCreated, 0);
  const incoming = await b(workspace);
  assert.equal(incoming.invites[0].habitId, id);
  assert.deepEqual(incoming.sentInvites, []);
  const shared = await b(workspace, { type: 'habitInvite', id, accept: true });
  assert.equal(shared.habits[0].linkedHabitId, id);
  assert.deepEqual((await a(workspace)).sentInvites, [{ habitId: id, userId: bob.id, status: 'accepted' }]);
  const otherHabit = await a(workspace, { type: 'saveHabit', habit: { ...habit, title: 'Другой план' }, invites: [bob.id] });
  const declined = otherHabit.sentInvites.find((entry) => entry.status === 'pending').habitId;
  await b(workspace, { type: 'habitInvite', id: declined, accept: false });
  assert.equal((await a(workspace)).sentInvites.find((entry) => entry.habitId === declined).status, 'declined');
  await b(workspace, { type: 'log', id, day, value: 2 }, 'json', 404);
  assert.equal((await a(workspace, { type: 'log', id, day, value: 1 })).profile.xp, 0);
  await Promise.all([
    a(workspace, { type: 'log', id, day, value: 2 }),
    a(workspace, { type: 'log', id, day, value: 2 }),
  ]);
  assert.equal((await a(workspace)).profile.xp, 10);
  await a(workspace, { type: 'log', id, day, value: 0 });
  assert.equal((await a(workspace, { type: 'log', id, day, value: 2 })).profile.xp, 10);
  const progress = await b(`/api/shared?habit=${shared.habits[0].id}`);
  assert.equal(progress[0].done, 1);
  const feed = (await b(workspace)).feed;
  const post = feed.find((item) => item.kind === 'habit');
  assert.ok(post);
  await b(workspace, { type: 'react', id: post.id, emoji: '👏' });
  assert.equal((await b(workspace)).feed.find((item) => item.id === post.id).reactions.length, 1);
  await a(workspace, {
    type: 'settings',
    settings: { ...alice.settings, privacy: 'private', onboarded: true },
  });
  assert.equal(
    (await b(workspace)).feed.some((item) => item.person.id === alice.id),
    false,
  );
  assert.equal((await b(`/api/shared?habit=${shared.habits[0].id}`)).length, 0);

  const created = await a(workspace, {
    type: 'createChallenge',
    challenge: {
      title: 'День чтения',
      description: '',
      icon: '🏆',
      start: day,
      end: day,
      rules: 'Две страницы',
      mode: 'team',
    },
  });
  const challenge = created.challenges[0];
  await b(workspace, { type: 'challengeDay', id: challenge.id, day, marked: true }, 'json', 403);
  await b(workspace, { type: 'join', code: challenge.code });
  const achieved = await b(workspace, { type: 'challengeDay', id: challenge.id, day, marked: true });
  assert.equal(achieved.profile.xp, 100);
  assert.ok(achieved.profile.awards.includes('team'));
  assert.equal(
    (await b(workspace, { type: 'challengeDay', id: challenge.id, day, marked: true })).profile.xp,
    100,
  );

  const { csrfToken } = await b('/api/auth/csrf');
  await b('/api/auth/signout', { csrfToken, redirectTo: origin }, 'form');
  await b(workspace, undefined, 'json', 401);
});

test('an account can send itself a sample reminder without changing habits or other accounts', async () => {
  const sender = browser();
  const other = browser();
  const profile = await register(sender, 'test_note');
  await register(other, 'other_note');
  const workspace = '/api/workspace';
  const result = await sender(workspace, { type: 'testReminder' });
  assert.equal(result.notifications[0].kind, 'reminders');
  assert.match(result.notifications[0].text, /Пробное напоминание/);
  assert.equal(result.notifications[0].read, false);
  assert.deepEqual(result.habits, []);
  assert.deepEqual((await other(workspace)).notifications, []);
  await sender(workspace, { type: 'preferences', preferences: { ...profile.preferences, reminders: false } });
  await sender(workspace, { type: 'testReminder' }, 'json', 400);
  assert.equal((await sender(workspace)).notifications.length, 1);
});

test(
  'password recovery email contains a one-use link and invalidates existing sessions',
  { skip: !process.env.RITM_TEST_SMTP_INBOX },
  async () => {
    const old = browser();
    const profile = await register(old, 'reset');
    await old('/api/account', { type: 'recover', email: `${profile.username}@example.test` });
    const raw = await readFile(process.env.RITM_TEST_SMTP_INBOX, 'utf8');
    const boundary = /\r?\n\r?\n/.exec(raw);
    assert.ok(boundary);
    const headers = raw.slice(0, boundary.index);
    const body = raw.slice(boundary.index + boundary[0].length);
    const mail = /Content-Transfer-Encoding: base64/i.test(headers)
      ? Buffer.from(body, 'base64').toString('utf8')
      : body.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
    const token = /\/account\?reset=([a-f\d]{64})/.exec(mail)?.[1];
    assert.ok(token);
    const newPassword = `${password}-updated`;
    await old('/api/account', { type: 'reset', token, password: newPassword });
    await old('/api/account', { type: 'reset', token, password: newPassword }, 'json', 400);
    await old('/api/workspace', undefined, 'json', 401);
    const fresh = browser();
    const { csrfToken } = await fresh('/api/auth/csrf');
    await fresh(
      '/api/auth/callback/credentials',
      { csrfToken, login: profile.username, password: newPassword, redirectTo: origin },
      'form',
    );
    assert.equal((await fresh('/api/workspace')).profile.id, profile.id);
  },
);

test(
  'a scheduled reminder creates one notification even when the job runs twice',
  { skip: !process.env.RITM_TEST_DATABASE_URL },
  async () => {
    const user = browser();
    await register(user, 'reminder');
    if (new Date().getUTCSeconds() >= 55) await new Promise((resolve) => setTimeout(resolve, 6500));
    const now = new Date().toISOString();
    await user('/api/workspace', {
      type: 'saveHabit',
      habit: {
        title: 'Встать и размяться',
        description: '',
        color: '#B6F36B',
        icon: 'run',
        category: 'Здоровье',
        kind: 'check',
        target: 1,
        unit: '',
        start: now.slice(0, 10),
        end: null,
        reminder: now.slice(11, 16),
        visibility: 'private',
        schedule: { mode: 'daily', days: [], quota: 1, dates: [] },
      },
    });
    const runReminders = () =>
      promisify(execFile)(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', 'scripts/reminders.ts', '--once'],
        { env: { ...process.env, DATABASE_URL: process.env.RITM_TEST_DATABASE_URL } },
      );
    await runReminders();
    await runReminders();
    const notes = (await user('/api/workspace')).notifications.filter(
      (note) => note.kind === 'reminders',
    );
    assert.equal(notes.length, 1);
    assert.match(notes[0].text, /Встать и размяться/);
  },
);
