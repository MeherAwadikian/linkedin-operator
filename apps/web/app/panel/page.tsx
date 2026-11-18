import { redirect } from 'next/navigation';
import { igniteRun } from './actions.ts';
import { PanelShell } from '../../components/panel/panel-shell.tsx';
import { StartButton } from '../../components/panel/start-button.tsx';
import { RealtimeRefresh } from '../../components/realtime-refresh.tsx';
import { createClient } from '../../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

const CAMPAIGN_TABLES = [
  { table: 'campaigns', label: 'Connect', href: '/panel/connect' },
  { table: 'message_campaigns', label: 'Message', href: '/panel/message' },
  { table: 'like_campaigns', label: 'Like', href: '/panel/like' },
  { table: 'post_campaigns', label: 'Posts', href: '/panel/posts' },
  { table: 'comment_campaigns', label: 'Comment', href: '/panel/comment' },
] as const;

export default async function PanelDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const app = supabase.schema('app');
  const [heartbeatRes, jobsRes, ...countRes] = await Promise.all([
    app
      .from('worker_heartbeats')
      .select('id,last_beat')
      .order('last_beat', { ascending: false })
      .limit(1)
      .maybeSingle(),
    app
      .from('jobs_queue')
      .select('id,type,status,created_at')
      .order('created_at', { ascending: false })
      .limit(8),
    ...CAMPAIGN_TABLES.map((t) =>
      app.from(t.table).select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    ),
  ]);

  const lastBeat = heartbeatRes.data?.last_beat as string | undefined;
  const workerFresh = lastBeat ? Date.now() - new Date(lastBeat).getTime() < 30_000 : false;
  const jobs = (jobsRes.data ?? []) as Array<{
    id: string;
    type: string;
    status: string;
  }>;
  const queuedTotal = countRes.reduce((sum, r) => sum + (r.count ?? 0), 0);

  return (
    <PanelShell email={user.email ?? 'signed in'} active="/panel">
      <RealtimeRefresh
        tables={[
          'jobs_queue',
          'campaigns',
          'message_campaigns',
          'like_campaigns',
          'post_campaigns',
          'comment_campaigns',
        ]}
      />
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-black uppercase italic tracking-widest">
          <span className="text-rod-500">Ignition</span>
        </h1>
        <p className="mt-2 text-sm text-chrome-400">
          Engine:{' '}
          <span className={workerFresh ? 'font-semibold text-green-400' : 'text-chrome-600'}>
            {workerFresh ? 'worker online' : 'worker offline'}
          </span>
          <span className="mx-2 text-chrome-600">|</span>
          <span className="font-semibold text-flame-400">{queuedTotal}</span> campaign
          {queuedTotal === 1 ? '' : 's'} staged for launch
        </p>
      </header>

      <StartButton action={igniteRun} />

      <section className="mt-12 grid gap-4 sm:grid-cols-5">
        {CAMPAIGN_TABLES.map((t, i) => (
          <a
            key={t.table}
            href={t.href}
            className="rounded-lg border border-chrome-600/30 bg-black/30 p-4 text-center hover:border-rod-500"
          >
            <p className="text-2xl font-black text-flame-500">{countRes[i]?.count ?? 0}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-chrome-400">
              {t.label} staged
            </p>
          </a>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-chrome-400">
          Pit lane (recent jobs)
        </h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-chrome-600">No jobs yet.</p>
        ) : (
          <ul className="divide-y divide-chrome-600/20 rounded-lg border border-chrome-600/30 bg-black/30">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="font-mono text-neutral-100">{j.type}</span>
                <span className="text-chrome-400">{j.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PanelShell>
  );
}
