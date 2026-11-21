import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { AppError, db, errorResponse, rateLimit, readJson, sameOrigin } from '@/lib/db';
import { email, password, timezone, username } from '@/lib/validation';

const input = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('register'),
    email,
    username,
    password,
    timezone,
    name: z.string().trim().min(1).max(60),
  }),
  z.object({ type: z.literal('recover'), email }),
  z.object({ type: z.literal('reset'), token: z.string().regex(/^[a-f\d]{64}$/), password }),
]);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!process.env.DATABASE_URL)
      throw new AppError('Подключите базу данных для использования аккаунтов.', 503);
    const parsed = input.safeParse(await readJson(request, 4096));
    if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
    const data = parsed.data;
    await rateLimit(`account:global:${data.type}`, 100, 60);
    await rateLimit(`account:${data.type}:${hash('email' in data ? data.email : data.token)}`, 6, 3600);
    if (data.type === 'register') {
      const passwordHash = await bcrypt.hash(data.password, 12);
      await db.user.create({
        data: {
          email: data.email,
          username: data.username,
          name: data.name,
          passwordHash,
          settings: { create: { timezone: data.timezone } },
          preferences: { create: {} },
        },
      });
    } else if (data.type === 'recover') {
      const smtp = process.env.SMTP_URL;
      const from = process.env.SMTP_FROM;
      const authUrl = process.env.AUTH_URL;
      if (!smtp || !from || !authUrl) throw new AppError('Отправка писем пока недоступна.', 503);
      const user = await db.user.findUnique({ where: { email: data.email }, select: { id: true } });
      if (user) {
        const token = randomBytes(32).toString('hex');
        const tokenHash = hash(token);
        await db.passwordReset.create({
          data: { userId: user.id, tokenHash, expires: new Date(Date.now() + 30 * 60_000) },
        });
        const link = new URL('/account', authUrl);
        link.searchParams.set('reset', token);
        try {
          await nodemailer
            .createTransport(smtp)
            .sendMail({
              from,
              to: data.email,
              subject: 'Смена пароля · Ритм',
              text: `Ссылка действует 30 минут.\n${link}\nЕсли вы не запрашивали смену пароля, проигнорируйте письмо.`,
            });
        } catch {
          await db.passwordReset.deleteMany({ where: { tokenHash } });
          console.error('Ritm password reset delivery failed');
        }
      }
    } else {
      const tokenHash = hash(data.token);
      const row = await db.passwordReset.findFirst({
        where: { tokenHash, expires: { gt: new Date() } },
      });
      if (!row) throw new AppError('Ссылка недействительна или устарела.');
      const passwordHash = await bcrypt.hash(data.password, 12);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${row.userId} FOR UPDATE`;
        if (
          !(await tx.passwordReset.deleteMany({ where: { tokenHash, expires: { gt: new Date() } } }))
            .count
        )
          throw new AppError('Ссылка недействительна или устарела.');
        await tx.user.update({
          where: { id: row.userId },
          data: { passwordHash, authVersion: { increment: 1 } },
        });
        await tx.session.deleteMany({ where: { userId: row.userId } });
        await tx.passwordReset.deleteMany({ where: { userId: row.userId } });
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
