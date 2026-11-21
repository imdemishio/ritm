import { Account } from '@/components/account';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; join?: string }>;
}) {
  const { reset, join } = await searchParams;
  return (
    <Account
      reset={typeof reset === 'string' && /^[a-f0-9]{64}$/.test(reset) ? reset : undefined}
      join={typeof join === 'string' && /^[a-f0-9-]{36}$/i.test(join) ? join : undefined}
    />
  );
}
