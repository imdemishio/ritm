import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

const globalDb = globalThis as typeof globalThis & { ritmPrisma?: PrismaClient };
export const db =
  globalDb.ritmPrisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }),
  });
if (process.env.NODE_ENV !== 'production') globalDb.ritmPrisma = db;

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function rateLimit(key: string, limit: number, seconds: number) {
  const now = new Date();
  const expires = new Date(now.getTime() + seconds * 1000);
  const result = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "expires") VALUES (${key}, 1, ${expires})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."expires" <= ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "expires" = CASE WHEN "RateLimit"."expires" <= ${now} THEN ${expires} ELSE "RateLimit"."expires" END
    RETURNING "count"
  `;
  if (result[0].count > limit) throw new AppError('Слишком много запросов. Попробуйте позже.', 429);
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const base = new URL(process.env.AUTH_URL ?? request.url);
  let expected = base.origin;
  const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];
  if (loopbackHosts.includes(base.hostname)) {
    const host = request.headers.get('host')?.toLowerCase();
    const port = base.port ? `:${base.port}` : '';
    // Next.js can normalize the URL to localhost even when the browser used an IP address.
    if (loopbackHosts.some((hostname) => host === `${hostname}${port}`)) {
      expected = `${base.protocol}//${host}`;
    }
  }
  if (origin !== expected) throw new AppError('Запрос запрещён.', 403);
}

export async function readJson(request: Request, limit = 200_000): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new AppError('Неверный формат запроса.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('Пустой запрос.');
  const decoder = new TextDecoder();
  let body = '';
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new AppError('Запрос слишком большой.', 413);
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Не удалось прочитать запрос.');
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return Response.json({ error: error.message }, { status: error.status });
  if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002')
    return Response.json({ error: 'Такие данные уже используются.' }, { status: 409 });
  console.error('Ritm server error:', error instanceof Error ? error.name : typeof error);
  return Response.json({ error: 'Сервис временно недоступен.' }, { status: 503 });
}
