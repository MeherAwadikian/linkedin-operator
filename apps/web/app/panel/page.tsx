import {
  CheckCircle2,
  CircleDashed,
  Heart,
  MessageSquareText,
  Newspaper,
  Send,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { igniteRun } from './actions.ts';
import { AnimatedCounter } from '../../components/panel/animated-counter.tsx';
import { HeroBackground } from '../../components/panel/hero-background.tsx';
import { Reveal, Stagger, StaggerItem } from '../../components/panel/motion.tsx';
import { PanelShell } from '../../components/panel/panel-shell.tsx';
import { StartButtonLazy } from '../../components/panel/start-button-lazy.tsx';
import { TiltCard } from '../../components/panel/tilt-card.tsx';
import { RealtimeRefresh } from '../../components/realtime-refresh.tsx';
import { createClient } from '../../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

const CAMPAIGN_TABLES = [
  { table: 'campaigns', label: 'Connect', href: '/panel/connect', icon: UserPlus },
  { table: 'message_campaigns', label: 'Message', href: '/panel/message', icon: Send },
  { table: 'like_campaigns', label: 'Like', href: '/panel/like', icon: Heart },
  { table: 'post_campaigns', label: 'Posts', href: '/panel/posts', icon: Newspaper },
  { table: 'comment_campaigns', label: 'Comment', href: '/panel/comment', icon: MessageSquareText },
] as const;

const JOB_STATUS_ICON: Record<string, React.ReactNode> = {
  done: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" aria-hidden="true" />,
  failed: <XCircle className="h-3.5 w-3.5 text-rod-300" aria-hidden="true" />,
};

export default async function PanelDashboardPage() {
  const supabase = await createClient();

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
      .select('id,type,status,error,created_at')
      .order('created_at', { ascending: false })
      .limit(8),
    ...CAMPAIGN_TABLES.map((t) =>
      app.from(t.table).select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    ),
  ]);

  const loadError = Boolean(heartbeatRes.error || jobsRes.error || countRes.some((r) => r.error));
  const lastBeat = heartbeatRes.data?.last_beat as string | undefined;
  const workerFresh = lastBeat ? Date.now() - new Date(lastBeat).getTime() < 30_000 : false;
  const jobs = (jobsRes.data ?? []) as Array<{
    id: string;
    type: string;
    status: string;
    error: string | null;
  }>;
  const queuedTotal = countRes.reduce((sum, r) => sum + (r.count ?? 0), 0);

  return (
    <PanelShell active="/panel">
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

      {/* Marketable hero: what the product does, above the live controls. */}
      <section className="relative -mx-6 -mt-10 mb-10 overflow-hidden px-6 pb-12 pt-14">
        <HeroBackground />
        <div className="relative mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-flame-600/40 bg-flame-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-flame-400">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              LinkedIn outreach, on your terms
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="text-4xl font-black uppercase italic tracking-widest sm:text-5xl">
              <span className="text-rod-500">Ignition</span>
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-chrome-400 sm:text-base">
              Stage connect, message, like, post, and comment campaigns, then fire them all with one
              button. A real browser does the driving; every outbound action parks in your Approval
              Queue until you wave it through.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <p className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-chrome-400">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-green-400" aria-hidden="true" />
                Human approval on every write
              </span>
              <span
                className="inline-flex items-center gap-1.5"
                data-testid="worker-status"
                data-online={workerFresh ? 'true' : 'false'}
              >
                {workerFresh ? (
                  <Wifi className="h-3.5 w-3.5 text-green-400" aria-hidden="true" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 text-chrome-600" aria-hidden="true" />
                )}
                <span className={workerFresh ? 'font-semibold text-green-400' : 'text-chrome-600'}>
                  {workerFresh ? 'Worker online' : 'Worker offline'}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CircleDashed className="h-3.5 w-3.5 text-flame-400" aria-hidden="true" />
                <span className="font-semibold text-flame-400">{queuedTotal}</span>
                campaign{queuedTotal === 1 ? '' : 's'} staged for launch
              </span>
            </p>
          </Reveal>
        </div>
      </section>

      {loadError ? (
        <div
          role="alert"
          className="mb-8 rounded-lg border border-rod-600/60 bg-rod-900/30 px-4 py-3 text-sm text-rod-300"
        >
          Some dashboard data failed to load. The database may be unreachable; the page will refresh
          automatically when it comes back.
        </div>
      ) : null}

      <Reveal delay={0.1}>
        <StartButtonLazy action={igniteRun} />
      </Reveal>

      <Stagger className="mt-12 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {CAMPAIGN_TABLES.map((t, i) => {
          const Icon = t.icon;
          return (
            <StaggerItem key={t.table}>
              <TiltCard className="rounded-xl border border-chrome-600/30 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur">
                <a
                  href={t.href}
                  data-testid={`stat-${t.label.toLowerCase()}`}
                  className="block rounded-xl p-4 text-center transition-colors hover:border-rod-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rod-500"
                >
                  <Icon className="mx-auto mb-2 h-4 w-4 text-chrome-400" aria-hidden="true" />
                  <AnimatedCounter
                    value={countRes[i]?.count ?? 0}
                    className="text-2xl font-black text-flame-500"
                  />
                  <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-chrome-400">
                    {t.label} staged
                  </p>
                </a>
              </TiltCard>
            </StaggerItem>
          );
        })}
      </Stagger>

      <Reveal delay={0.15} className="mt-12">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-chrome-400">
          Pit lane (recent jobs)
        </h2>
        {jobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-chrome-600/30 bg-black/20 px-4 py-8 text-center">
            <p className="text-sm text-chrome-600">
              No jobs yet. Stage a campaign, then push START.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-chrome-600/20 rounded-lg border border-chrome-600/30 bg-black/30 backdrop-blur">
            {jobs.map((j) => {
              const failed = j.status === 'failed' || j.status === 'blocked';
              return (
                <li key={j.id} className="px-4 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-neutral-100">{j.type}</span>
                    <span
                      className={`flex items-center gap-1.5 ${failed ? 'text-flame-400' : 'text-chrome-400'}`}
                    >
                      {JOB_STATUS_ICON[j.status] ?? (
                        <CircleDashed className="h-3.5 w-3.5 text-flame-400" aria-hidden="true" />
                      )}
                      {j.status}
                    </span>
                  </div>
                  {failed && j.error ? (
                    <p className="mt-1 break-words font-mono text-xs text-flame-400/80">
                      {j.error}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Reveal>
    </PanelShell>
  );
}
