const CACHE = 'ritm-shell-v3';
const ASSETS = [
  '/offline',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(ASSETS);
      const offline = await cache.match('/offline');
      const markup = await offline.text();
      const urls = [
        ...new Set(
          [...markup.matchAll(/(?:src|href)="(\/_next\/static\/[^" ]+)"/g)].map((match) => match[1]),
        ),
      ];
      const assets = await Promise.all(
        urls.map(async (url) => {
          const response = await fetch(url);
          if (response.ok) await cache.put(url, response.clone());
          if (!response.ok || !url.endsWith('.css')) return [];
          const css = await response.text();
          return [...css.matchAll(/url\(["']?(\/\S+?\.(?:woff2?|ttf))["']?\)/g)].map(
            (match) => match[1],
          );
        }),
      );
      await Promise.allSettled([...new Set(assets.flat())].map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith('ritm-shell-') && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && !url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(async () => (await caches.open(CACHE)).match('/offline')));
  } else if (url.pathname.startsWith('/_next/static/') || ASSETS.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const saved = await cache.match(request);
        if (saved && /\bimmutable\b/i.test(saved.headers.get('cache-control') ?? '')) return saved;
        let response;
        try {
          // Mutable Next.js chunks can keep the same URL after a rebuild.
          response = await fetch(request, { cache: 'no-cache' });
        } catch (error) {
          if (saved) return saved;
          throw error;
        }
        if (response.ok && !url.pathname.includes('development') && !url.pathname.includes('hot-update'))
          await cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification('Ритм', {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: payload.tag,
      data: { href: payload.href },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.href ?? '/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === url.origin);
      if (open) {
        await open.navigate(url.href);
        await open.focus();
      } else await self.clients.openWindow(url.href);
    })(),
  );
});
