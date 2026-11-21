import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError, db, rateLimit } from '@/lib/db';

declare module 'next-auth' {
  interface User {
    authVersion?: number;
  }
  interface Session {
    user: { id: string; sid: string } & DefaultSession['user'];
  }
}

const maxAge = 30 * 86_400;
const fallbackHash = '$2b$12$QINY7LAtXKhAxdSPG8pOFekD612XiI96dP3HZndUQnyhQHxCTNkvm';
const config = NextAuth({
  secret:
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV === 'development'
      ? 'ritm-local-development-only-change-this-for-deploy'
      : undefined),
  session: { strategy: 'jwt', maxAge },
  pages: { signIn: '/account' },
  providers: [
    Credentials({
      credentials: { login: {}, password: {} },
      async authorize(input) {
        if (!process.env.DATABASE_URL) return null;
        const parsed = z
          .object({
            login: z.string().trim().toLowerCase().min(3).max(254),
            password: z.string().max(72),
          })
          .safeParse(input);
        if (!parsed.success) return null;
        const { login, password } = parsed.data;
        const key = createHash('sha256').update(login).digest('hex');
        try {
          await rateLimit('login:global', 240, 60);
          await rateLimit(`login:${key}`, 12, 900);
        } catch {
          return null;
        }
        const user = await db.user.findFirst({ where: { OR: [{ username: login }, { email: login }] } });
        const matches = await bcrypt.compare(password, user?.passwordHash ?? fallbackHash);
        return user && matches ? { id: user.id, name: user.name, authVersion: user.authVersion } : null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        const userId = user.id;
        const sid = randomUUID();
        const created = await db.$transaction(async (tx) => {
          const [current] = await tx.$queryRaw<
            { authVersion: number }[]
          >`SELECT "authVersion" FROM "User" WHERE id = ${userId} FOR UPDATE`;
          if (!current || current.authVersion !== user.authVersion) return false;
          await tx.session.create({
            data: { sessionToken: sid, userId, expires: new Date(Date.now() + maxAge * 1000) },
          });
          return true;
        });
        if (!created) return null;
        token.sid = sid;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? '';
      session.user.sid = typeof token.sid === 'string' ? token.sid : '';
      return session;
    },
  },
  events: {
    async signOut(message) {
      if ('token' in message && typeof message.token?.sid === 'string')
        await db.session.deleteMany({ where: { sessionToken: message.token.sid } });
    },
  },
});
export const { auth, handlers } = config;

export async function sessionUser() {
  if (!process.env.DATABASE_URL || (process.env.NODE_ENV === 'production' && !process.env.AUTH_SECRET))
    return null;
  const session = await auth();
  if (!session?.user.sid || !session.user.id) return null;
  const valid = await db.session.findFirst({
    where: { sessionToken: session.user.sid, userId: session.user.id, expires: { gt: new Date() } },
  });
  return valid ? session.user.id : null;
}
export async function requireUser() {
  const userId = await sessionUser();
  if (!userId) throw new AppError('Войдите в аккаунт.', 401);
  return userId;
}
