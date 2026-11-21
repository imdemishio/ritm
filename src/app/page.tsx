import { sessionUser } from '@/auth';
import { Workspace } from '@/components/workspace';
import { snapshot } from '@/lib/data';
import { pushPublicKey } from '@/lib/push';

export const dynamic = 'force-dynamic';

export default async function Home() {
  try {
    const user = await sessionUser();
    return <Workspace initial={user ? await snapshot(user) : null} publicKey={pushPublicKey()} />;
  } catch {
    return <Workspace initial={null} publicKey="" unavailable />;
  }
}
