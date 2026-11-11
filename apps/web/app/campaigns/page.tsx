import { redirect } from 'next/navigation';
import { createCampaign } from './actions.ts';
import { NavShell } from '../../components/nav-shell.tsx';
import { RealtimeRefresh } from '../../components/realtime-refresh.tsx';
import { createClient } from '../../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

interface CampaignRow {
  id: string;
  name: string;
  network_type: string;
  query: string;
  message_template: string;
  max_targets: number;
  status: string;
  queued_count: number;
  last_error: string | null;
  created_at: string;
}

const field =
  'w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700';
const btn =
  'rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900';

const NETWORK_LABEL: Record<string, string> = {
  any: 'Anyone',
  first: '1st-degree',
  second: '2nd-degree',
};

export default async function CampaignsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .schema('app')
    .from('campaigns')
    .select('id,name,network_type,query,message_template,max_targets,status,queued_count,last_error,created_at')
    .order('created_at', { ascending: false })
    .limit(25);
  const campaigns = (data ?? []) as CampaignRow[];

  return (
    <NavShell email={user.email ?? 'signed in'}>
      <RealtimeRefresh />
      <h1 className="mb-1 text-2xl font-semibold">Campaigns</h1>
      <p className="mb-8 max-w-2xl text-sm text-neutral-500">
        Pick who to reach and what to say. The worker searches LinkedIn, collects matching people,
        and queues a personalized connection request for each into the{' '}
        <a href="/approvals" className="underline">
          Approval Queue
        </a>
        . Nothing is sent until you approve it, and sends are rate-limited. No emails are collected
        or sent.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          New campaign
        </h2>
        <form action={createCampaign} className="flex max-w-xl flex-col gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">Campaign name</span>
            <input name="name" className={field} placeholder="AI founders — UAE" />
          </label>
          <div className="flex gap-3">
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-neutral-600 dark:text-neutral-400">Network</span>
              <select name="network_type" defaultValue="any" className={field}>
                <option value="any">Anyone</option>
                <option value="first">1st-degree connections</option>
                <option value="second">2nd-degree</option>
              </select>
            </label>
            <label className="w-32 text-sm">
              <span className="mb-1 block text-neutral-600 dark:text-neutral-400">Max targets</span>
              <input name="max_targets" type="number" min={1} max={50} defaultValue={10} className={field} />
            </label>
          </div>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">
              Search (keywords / title / location)
            </span>
            <input name="query" className={field} placeholder="AI automation founder Dubai" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">
              Message — use <span className="font-mono">{'{name}'}</span> for their first name (max
              280 chars)
            </span>
            <textarea
              name="message_template"
              rows={3}
              className={`${field} font-sans`}
              placeholder="Hi {name}, I help teams automate outreach — would love to connect."
            />
          </label>
          <button type="submit" className={`${btn} self-start`}>
            Create &amp; collect
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Your campaigns ({campaigns.length})
        </h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-neutral-500">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {campaigns.map((c) => (
              <li key={c.id} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-neutral-500">
                      {NETWORK_LABEL[c.network_type] ?? c.network_type} · “{c.query}” · up to{' '}
                      {c.max_targets}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {c.status}
                    {c.status === 'ready' || c.queued_count > 0 ? (
                      <span className="ml-1 text-green-600 dark:text-green-400">
                        · {c.queued_count} queued for approval
                      </span>
                    ) : null}
                  </span>
                </div>
                {c.last_error ? (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{c.last_error}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </NavShell>
  );
}
