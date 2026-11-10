import { defaultRules } from '@lo/core';
import { redirect } from 'next/navigation';
import { NavShell } from '../components/nav-shell.tsx';
import { createClient } from '../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already gates this, but guard here too (defense in depth).
  if (!user) redirect('/login');

  const rules = defaultRules();

  return (
    <NavShell email={user.email ?? 'signed in'}>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">
          No LinkedIn account connected yet. Read-only until the worker + credentials are wired.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Default safety rules ({rules.length})
        </h2>
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {rules.map((r) => (
            <li key={r.actionType} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="font-mono">{r.actionType}</span>
              <span className="text-neutral-500">
                L{r.approvalLevel} · {r.dailyLimit}/day
              </span>
            </li>
          ))}
        </ul>
      </section>
    </NavShell>
  );
}
