import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/manrope';
import './globals.css';
import { locale } from '@/lib/locale';

export const metadata: Metadata = {
  title: 'Ритм — трекер привычек',
  description: 'Дневной план, привычки и прогресс в одном месте.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Ритм', statusBarStyle: 'black-translucent' },
};
export const viewport: Viewport = { themeColor: '#0D0D0F', viewportFit: 'cover' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={locale.language} data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
