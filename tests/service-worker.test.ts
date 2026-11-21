import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

type FetchHandler = (event: { request: Request; respondWith: (result: Promise<Response>) => void }) => void;

test('mutable client chunks are refreshed online and reused once offline', async () => {
  const origin = 'http://localhost:3110';
  const request = new Request(`${origin}/_next/static/chunks/app/account/page.js`);
  const handlers = new Map<string, FetchHandler>();
  const cache = new Map<string, Response>([[request.url, new Response('old bundle')]]);
  let online = true;
  let networkRequests = 0;
  runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    URL,
    self: {
      location: { origin },
      addEventListener: (name: string, handler: FetchHandler) => {
        handlers.set(name, handler);
      },
    },
    caches: {
      open: async () => ({
        match: async (resource: Request) => cache.get(resource.url)?.clone(),
        put: async (resource: Request, response: Response) => cache.set(resource.url, response),
      }),
    },
    fetch: async (_resource: Request, options: RequestInit) => {
      networkRequests++;
      assert.equal(options.cache, 'no-cache');
      if (!online) throw new TypeError('offline');
      return new Response('fresh bundle');
    },
  });
  const load = () => new Promise<Response>((resolve) => handlers.get('fetch')!({ request, respondWith: resolve }));

  assert.equal(await (await load()).text(), 'fresh bundle');
  online = false;
  assert.equal(await (await load()).text(), 'fresh bundle');
  assert.equal(networkRequests, 2);

  cache.set(request.url, new Response('immutable bundle', { headers: { 'Cache-Control': 'public, immutable' } }));
  assert.equal(await (await load()).text(), 'immutable bundle');
  assert.equal(networkRequests, 2);
});
