import { redirect } from 'next/navigation';
import { createPost } from './actions.ts';
import { NavShell } from '../../components/nav-shell.tsx';
import { RealtimeRefresh } from '../../components/realtime-refresh.tsx';
import { createClient } from '../../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

interface PostRow {
  id: string;
  brief: string;
  body: string;
  status: string;
  last_error: string | null;
  created_at: string;
}

const field =
  'w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700';
const btn =
  'rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900';

export default async function PostsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .schema('app')
    .from('post_campaigns')
    .select('id,brief,body,status,last_error,created_at')
    .order('created_at', { ascending: false })
    .limit(25);
  const posts = (data ?? []) as PostRow[];

  return (
    <NavShell email={user.email ?? 'signed in'}>
      <RealtimeRefresh />
      <h1 className="mb-1 text-2xl font-semibold">Posts</h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-500">
        Describe the post you want — the AI writes it, and the draft goes to the{' '}
        <a href="/approvals" className="underline">
          Approval Queue
        </a>{' '}
        for you to review and edit the wording in your head before it&apos;s published to your
        LinkedIn feed. Nothing posts until you approve it.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          New post
        </h2>
        <form action={createPost} className="flex max-w-2xl flex-col gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">
              What kind of post do you want to write?
            </span>
            <textarea
              name="brief"
              rows={4}
              className={`${field} font-sans`}
              placeholder="A post about why small logistics firms should automate outreach, with one concrete example and a soft CTA to DM me. Confident but not salesy."
            />
          </label>
          <button type="submit" className={`${btn} self-start`}>
            Draft post
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Your posts ({posts.length})
        </h2>
        {posts.length === 0 ? (
          <p className="text-sm text-neutral-500">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {posts.map((p) => (
              <li key={p.id} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <p className="text-sm text-neutral-500">{p.brief}</p>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {p.status}
                    {p.status === 'ready' ? (
                      <span className="ml-1 text-green-600 dark:text-green-400">
                        · awaiting approval
                      </span>
                    ) : null}
                  </span>
                </div>
                {p.body ? (
                  <pre className="whitespace-pre-wrap rounded bg-neutral-100 p-3 text-sm dark:bg-neutral-900">
                    {p.body}
                  </pre>
                ) : null}
                {p.last_error ? (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{p.last_error}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </NavShell>
  );
}
