import { defaultRules } from '@lo/core';
import { redirect } from 'next/navigation';
import { enqueueCollectFeed, enqueueLinkedInLogin, enqueueNoop, enqueueSearch } from './actions.ts';
import { NavShell } from '../components/nav-shell.tsx';
import { RealtimeRefresh } from '../components/realtime-refresh.tsx';
import { createClient } from '../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

interface JobSummary {
  id: string;
  type: string;
  status: string;
  created_at: string;
}
interface PersonSummary {
  id: string;
  profile_url: string;
  display_name: string | null;
  headline: string | null;
}

const btn =
  'rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const app = supabase.schema('app');
  const [jobsRes, accountRes, peopleRes, heartbeatRes] = await Promise.all([
    app
      .from('jobs_queue')
      .select('id,type,status,created_at')
      .order('created_at', { ascending: false })
      .limit(6),
    app
      .from('accounts')
      .select('status,checkpoint_reason')
      .eq('platform', 'linkedin')
      .maybeSingle(),
    app
      .from('people')
      .select('id,profile_url,display_name,headline')
      .order('collected_at', { ascending: false })
      .limit(10),
    app
      .from('worker_heartbeats')
      .select('id,last_beat')
      .order('last_beat', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const recentJobs = (jobsRes.data ?? []) as JobSummary[];
  const people = (peopleRes.data ?? []) as PersonSummary[];
  const accountStatus = (accountRes.data?.status as string | undefined) ?? 'unknown';
  const checkpointReason = accountRes.data?.checkpoint_reason as string | undefined;
  const lastBeat = heartbeatRes.data?.last_beat as string | undefined;
  const workerFresh = lastBeat ? Date.now() - new Date(lastBeat).getTime() < 30_000 : false;
  const rules = defaultRules();

  return (
    <NavShell email={user.email ?? 'signed in'}>
      <RealtimeRefresh />
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Phase 1 — read-only. Worker:{' '}
            <span
              className={workerFresh ? 'text-green-600 dark:text-green-400' : 'text-neutral-500'}
            >
              {workerFresh ? 'online' : 'offline'}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={enqueueLinkedInLogin}>
            <button type="submit" className={btn}>
              Connect / re-login LinkedIn
            </button>
          </form>
          <form action={enqueueCollectFeed}>
            <button type="submit" className={btn}>
              Collect feed
            </button>
          </form>
          <form action={enqueueNoop}>
            <button type="submit" className={btn}>
              Test job
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
          Find people
        </h2>
        <form action={enqueueSearch} className="flex max-w-md gap-2">
          <input
            name="query"
            placeholder="e.g. AI automation Beirut"
            className="flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <button type="submit" className={btn}>
            Search
          </button>
        </form>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Collected people ({people.length})
        </h2>
        {people.length === 0 ? (
          <p className="text-sm text-neutral-500">
            None yet. Search or collect the feed once the worker is online and logged in.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {people.map((p) => (
              <li key={p.id} className="px-4 py-2 text-sm">
                <a
                  href={p.profile_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium hover:underline"
                >
                  {p.display_name || p.profile_url}
                </a>
                {p.headline ? <span className="ml-2 text-neutral-500">{p.headline}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Recent jobs
        </h2>
        {recentJobs.length === 0 ? (
          <p className="text-sm text-neutral-500">No jobs yet.</p>
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
