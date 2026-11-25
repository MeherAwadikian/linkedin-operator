import { approveJob, rejectJob } from './actions.ts';
import { PanelShell } from '../../../components/panel/panel-shell.tsx';
import { RealtimeRefresh } from '../../../components/realtime-refresh.tsx';
import { createClient } from '../../../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

interface PendingJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export default async function PanelApprovalsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .schema('app')
    .from('jobs_queue')
    .select('id,type,payload,created_at')
    .eq('status', 'awaiting_approval')
    .order('created_at', { ascending: true });
  const pending = (data ?? []) as PendingJob[];

  return (
    <PanelShell active="/panel/approvals">
      <RealtimeRefresh tables={['jobs_queue']} />
      <h1 className="mb-1 text-2xl font-black uppercase italic tracking-wide text-rod-500">
        Approval queue
      </h1>
      <p className="mb-8 text-sm text-chrome-400">
        Nothing here is sent until you approve it. {pending.length} awaiting review.
      </p>

      {pending.length === 0 ? (
        <div className="rounded-lg border border-dashed border-chrome-600/30 bg-black/20 px-4 py-8 text-center">
          <p className="text-sm text-chrome-600">No actions awaiting approval.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((job) => (
            <li
              key={job.id}
              className="rounded-lg border border-rod-800/50 bg-black/30 p-4 backdrop-blur"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-sm text-neutral-100">{job.type}</span>
                <span className="text-xs text-chrome-600">
                  {new Date(job.created_at).toLocaleString()}
                </span>
              </div>
              <pre className="mb-3 overflow-x-auto rounded bg-black/50 p-2 text-xs text-chrome-300">
                {JSON.stringify(job.payload, null, 2)}
              </pre>
              <div className="flex gap-2">
                <form action={approveJob}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <button
                    type="submit"
                    className="rounded-md bg-rod-600 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_0_14px_rgba(215,20,26,0.5)] hover:bg-rod-500"
                  >
                    Approve
                  </button>
                </form>
                <form action={rejectJob}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-chrome-600/40 px-3 py-1.5 text-sm text-chrome-300 hover:bg-rod-900/60 hover:text-white"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}
