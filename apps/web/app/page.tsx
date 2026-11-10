import { defaultRules } from '@lo/core';
import { redirect } from 'next/navigation';
import { enqueueLinkedInLogin, enqueueNoop } from './actions.ts';
import { NavShell } from '../components/nav-shell.tsx';
import { createClient } from '../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

interface JobSummary {
  id: string;
  type: string;
  status: string;
  created_at: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already gates this, but guard here too (defense in depth).
  if (!user) redirect('/login');

  const { data: jobs } = await supabase
    .schema('app')
    .from('jobs_queue')
    .select('id,type,status,created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  const recentJobs = (jobs ?? []) as JobSummary[];

  const { data: account } = await supabase
    .schema('app')
    .from('accounts')
    .select('status,checkpoint_reason')
    .eq('platform', 'linkedin')
    .maybeSingle();
  const accountStatus = (account?.status as string | undefined) ?? 'unknown';
  const checkpointReason = account?.checkpoint_reason as string | undefined;

  const rules = defaultRules();

  return (
    <NavShell email={user.email ?? 'signed in'}>
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">
            No LinkedIn account connected yet. Read-only until the worker + credentials are wired.
          </p>
        </div>
        <div className="flex gap-2">
          <form action={enqueueLinkedInLogin}>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Connect / re-login LinkedIn
            </button>
          </form>
          <form action={enqueueNoop}>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Enqueue test job
            </button>
          </form>
        </div>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          LinkedIn account
        </h2>
        <p className="text-sm">
          Status: <span className="font-mono">{accountStatus}</span>
          {accountStatus === 'checkpoint' && checkpointReason ? (
            <span className="ml-2 text-amber-600 dark:text-amber-400">
              — LinkedIn needs you: {checkpointReason}. Resolve it in the worker&apos;s Chrome
              window, then re-login.
            </span>
          ) : null}
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Recent jobs
        </h2>
        {recentJobs.length === 0 ? (
          <p className="text-sm text-neutral-500">No jobs yet. Enqueue a test job above.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {recentJobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="font-mono">{j.type}</span>
                <span className="text-neutral-500">{j.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

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
