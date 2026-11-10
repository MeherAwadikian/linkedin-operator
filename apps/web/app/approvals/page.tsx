import { redirect } from 'next/navigation';
import { approveJob, rejectJob } from './actions.ts';
import { NavShell } from '../../components/nav-shell.tsx';
import { RealtimeRefresh } from '../../components/realtime-refresh.tsx';
import { createClient } from '../../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

interface PendingJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .schema('app')
    .from('jobs_queue')
    .select('id,type,payload,created_at')
    .eq('status', 'awaiting_approval')
    .order('created_at', { ascending: true });
  const pending = (data ?? []) as PendingJob[];

  return (
    <NavShell email={user.email ?? 'signed in'}>
      <RealtimeRefresh />
      <h1 className="mb-1 text-2xl font-semibold">Approval queue</h1>
      <p className="mb-8 text-sm text-neutral-500">
        Nothing here is sent until you approve it. {pending.length} awaiting review.
      </p>

      {pending.length === 0 ? (
        <p className="text-sm text-neutral-500">No actions awaiting approval.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((job) => (
            <li
              key={job.id}
              className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-sm">{job.type}</span>
                <span className="text-xs text-neutral-500">
                  {new Date(job.created_at).toLocaleString()}
                </span>
              </div>
              <pre className="mb-3 overflow-x-auto rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-900">
                {JSON.stringify(job.payload, null, 2)}
              </pre>
              <div className="flex gap-2">
                <form action={approveJob}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <button
                    type="submit"
                    className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
                  >
                    Approve
                  </button>
                </form>
                <form action={rejectJob}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </NavShell>
  );
}
