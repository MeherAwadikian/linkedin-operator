import { redirect } from 'next/navigation';
import { NavShell } from '../../components/nav-shell.tsx';
import { RealtimeRefresh } from '../../components/realtime-refresh.tsx';
import { createClient } from '../../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function tally<T extends string>(rows: Row[], key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String((r[key] as T | undefined) ?? 'unknown');
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

const ACTION_LABEL: Record<string, string> = {
  connect: 'Connection requests',
  message: 'Messages',
  post: 'Posts',
  like: 'Likes',
  comment: 'Comments',
  email_send: 'Emails',
  gather_profile: 'Profiles gathered',
};

function Card({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className={`text-2xl font-semibold ${tone ?? ''}`}>{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">{label}</p>
    </div>
  );
}

export default async function StatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const app = supabase.schema('app');

  const [actionsRes, jobsRes, campRes, emailRes, postRes, likeRes] = await Promise.all([
    app.from('actions_log').select('action_type,outcome').limit(1000),
    app.from('jobs_queue').select('status,type').limit(1000),
    app.from('campaigns').select('status,queued_count'),
    app.from('email_campaigns').select('status,queued_count'),
    app.from('post_campaigns').select('status'),
    app.from('like_campaigns').select('status,queued_count'),
  ]);

  const actions = (actionsRes.data ?? []) as Row[];
  const jobs = (jobsRes.data ?? []) as Row[];
  const byAction = tally(actions, 'action_type');
  const byOutcome = tally(actions, 'outcome');
  const byJobStatus = tally(jobs, 'status');

  const sum = (rows: { queued_count?: number }[] | null) =>
    (rows ?? []).reduce((n, r) => n + (r.queued_count ?? 0), 0);

  const campaignBlocks = [
    { label: 'LinkedIn campaigns', rows: campRes.data ?? [], queued: sum(campRes.data) },
    { label: 'Email campaigns', rows: emailRes.data ?? [], queued: sum(emailRes.data) },
    { label: 'Post campaigns', rows: postRes.data ?? [], queued: 0 },
    { label: 'Like campaigns', rows: likeRes.data ?? [], queued: sum(likeRes.data) },
  ];

  const actionRows = Object.keys({ ...ACTION_LABEL, ...byAction }).filter((k) => byAction[k]);

  return (
    <NavShell email={user.email ?? 'signed in'}>
      <RealtimeRefresh />
      <h1 className="mb-1 text-2xl font-semibold">Statistics</h1>
      <p className="mb-8 text-sm text-neutral-500">
        Activity across all campaigns. Counts reflect what has actually run and what is queued.
      </p>

      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Actions completed" value={byOutcome.done ?? 0} tone="text-green-600 dark:text-green-400" />
        <Card label="Awaiting approval" value={byJobStatus.awaiting_approval ?? 0} tone="text-amber-600 dark:text-amber-400" />
        <Card label="Queued to run" value={byJobStatus.queued ?? 0} />
        <Card label="Failed / blocked" value={(byOutcome.failed ?? 0) + (byOutcome.blocked ?? 0)} tone="text-neutral-500" />
      </div>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Actions performed
        </h2>
        {actionRows.length === 0 ? (
          <p className="text-sm text-neutral-500">No actions have run yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {actionRows.map((k) => (
              <li key={k} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{ACTION_LABEL[k] ?? k}</span>
                <span className="font-mono text-neutral-600 dark:text-neutral-300">{byAction[k]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Campaigns
        </h2>
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {campaignBlocks.map((b) => {
            const statuses = tally(b.rows as Row[], 'status');
            const statusStr =
              Object.entries(statuses)
                .map(([s, n]) => `${n} ${s}`)
                .join(', ') || 'none';
            return (
              <li key={b.label} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span>{b.label}</span>
                <span className="text-right text-xs text-neutral-500">
                  {b.rows.length} total · {statusStr}
                  {b.queued > 0 ? (
                    <span className="ml-1 text-green-600 dark:text-green-400">
                      · {b.queued} queued
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Job queue
        </h2>
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {Object.keys(byJobStatus).length === 0 ? (
            <li className="px-4 py-2 text-sm text-neutral-500">Empty.</li>
          ) : (
            Object.entries(byJobStatus).map(([s, n]) => (
              <li key={s} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="font-mono">{s}</span>
                <span className="text-neutral-600 dark:text-neutral-300">{n}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </NavShell>
  );
}
