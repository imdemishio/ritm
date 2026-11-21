import webpush from 'web-push';
import { db } from './db';

export const pushPublicKey = () =>
  process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
    ? process.env.VAPID_PUBLIC_KEY
    : '';

export function allowedPushEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  return (
    url.protocol === 'https:' &&
    !url.port &&
    !url.username &&
    !url.password &&
    ([
      'fcm.googleapis.com',
      'android.googleapis.com',
      'push.services.mozilla.com',
      'web.push.apple.com',
    ].includes(url.hostname) ||
      url.hostname.endsWith('.notify.windows.com') ||
      url.hostname.endsWith('.push.apple.com'))
  );
}

export async function deliverPush(userId: string, text: string, href: string, tag: string) {
  const publicKey = pushPublicKey();
  if (!publicKey) return;
  const subscriptions = await db.pushSubscription.findMany({ where: { userId } });
  await Promise.all(
    subscriptions.map(async (subscription) => {
      if (!allowedPushEndpoint(subscription.endpoint)) return;
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({ title: 'Ритм', body: text, href, tag }),
          {
            timeout: 3500,
            TTL: 3600,
            vapidDetails: {
              publicKey,
              subject: process.env.VAPID_SUBJECT!,
              privateKey: process.env.VAPID_PRIVATE_KEY!,
            },
          },
        );
      } catch (error) {
        if (
          typeof error === 'object' &&
          error &&
          'statusCode' in error &&
          [404, 410].includes(Number(error.statusCode))
        ) {
          await db.pushSubscription.deleteMany({ where: { endpoint: subscription.endpoint, userId } });
        }
      }
    }),
  );
}
