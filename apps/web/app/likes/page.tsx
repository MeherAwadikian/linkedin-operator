import { redirect } from 'next/navigation';
import { createLikeCampaign } from './actions.ts';
import { NavShell } from '../../components/nav-shell.tsx';
import { RealtimeRefresh } from '../../components/realtime-refresh.tsx';
import { createClient } from '../../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

interface LikeRow {
  id: string;
  criteria: string;
  source: string;
  query: string;
  max_likes: number;
  status: string;
  scanned_count: number;
  queued_count: number;
  last_error: string | null;
  created_at: string;
}

const field =
  'w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700';
const btn =
  'rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900';

export default async function LikesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .schema('app')
    .from('like_campaigns')
    .select('id,criteria,source,query,max_likes,status,scanned_count,queued_count,last_error,created_at')
    .order('created_at', { ascending: false })
    .limit(25);
  const campaigns = (data ?? []) as LikeRow[];

  return (
    <NavShell email={user.email ?? 'signed in'}>
      <RealtimeRefresh />
      <h1 className="mb-1 text-2xl font-semibold">Like campaigns</h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-500">
        Tell the AI what kinds of posts to like. The worker scans your feed (or a post search), the
        AI judges each post against your criteria, and matching posts are liked — conservatively,
        rate-limited, and skipped entirely while dry-run is on. The AI avoids political, sensitive,
        or spammy posts even if they match.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          New like campaign
        </h2>
        <form action={createLikeCampaign} className="flex max-w-2xl flex-col gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">
              What should the AI like?
            </span>
            <textarea
              name="criteria"
              rows={3}
              className={`${field} font-sans`}
              placeholder="Posts about AI automation, operations efficiency, or logistics tech — practical, non-promotional ones from founders and operators."
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-neutral-600 dark:text-neutral-400">Source</span>
              <select name="source" defaultValue="feed" className={field}>
                <option value="feed">My feed</option>
                <option value="search">Post search</option>
              </select>
            </label>
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-neutral-600 dark:text-neutral-400">
                Search keywords (only if source = Post search)
              </span>
              <input name="query" className={field} placeholder="AI automation logistics" />
            </label>
            <label className="w-28 text-sm">
              <span className="mb-1 block text-neutral-600 dark:text-neutral-400">Max likes</span>
              <input name="max_likes" type="number" min={1} max={30} defaultValue={10} className={field} />
            </label>
          </div>
          <button type="submit" className={`${btn} self-start`}>
            Scan &amp; like
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Your like campaigns ({campaigns.length})
        </h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-neutral-500">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {campaigns.map((c) => (
              <li key={c.id} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm">{c.criteria}</p>
                    <p className="text-xs text-neutral-500">
                      {c.source === 'search' ? `post search: “${c.query}”` : 'my feed'} · up to{' '}
                      {c.max_likes}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {c.status}
                    {c.queued_count > 0 ? (
                      <span className="ml-1 text-green-600 dark:text-green-400">
                        · {c.queued_count} liked of {c.scanned_count} scanned
                      </span>
                    ) : c.status === 'ready' ? (
                      <span className="ml-1 text-neutral-400">· {c.scanned_count} scanned, 0 matched</span>
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
