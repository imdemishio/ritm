'use client';

import { CircleAlert, RotateCcw } from 'lucide-react';
import { Empty, Logo } from '@/components/ui';

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <main className="account-page">
      <a href="/">
        <Logo />
      </a>
      <Empty
        icon={CircleAlert}
        title="Не удалось открыть раздел"
        description="Попробуйте загрузить его снова."
      >
        <button className="primary" onClick={reset}>
          <RotateCcw size={17} /> Повторить
        </button>
      </Empty>
    </main>
  );
}
