import { redirect } from 'next/navigation';
import { createCommandSession, runPlan } from './actions.ts';
import { NavShell } from '../../components/nav-shell.tsx';
import { RealtimeRefresh } from '../../components/realtime-refresh.tsx';
import { createClient } from '../../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

interface PlanStep {
  action: string;
  inputs?: Record<string, unknown>;
  rationale?: string;
}
interface CommandSession {
  id: string;
  prompt: string;
  status: string;
  plan: { steps?: PlanStep[]; error?: string } | null;
  created_at: string;
}

export default async function ConsolePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .schema('app')
    .from('command_sessions')
    .select('id,prompt,status,plan,created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  const sessions = (data ?? []) as CommandSession[];

  return (
    <NavShell email={user.email ?? 'signed in'}>
      <RealtimeRefresh />
      <h1 className="mb-1 text-2xl font-semibold">Command console</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Describe what you want in plain language. Claude turns it into a plan you review before
        anything runs. Write actions always wait for approval.
      </p>

      <form action={createCommandSession} className="mb-10 flex max-w-2xl gap-2">
        <input
          name="instruction"
          placeholder="e.g. find 10 AI-automation founders in the UAE and gather their profiles"
          className="flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        />
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
        >
          Plan
        </button>
      </form>

      {sessions.length === 0 ? (
        <p className="text-sm text-neutral-500">No commands yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{s.prompt}</p>
                <span className="shrink-0 text-xs text-neutral-500">{s.status}</span>
              </div>

              {s.status === 'planning' ? (
                <p className="text-sm text-neutral-500">Planning…</p>
              ) : s.plan?.error ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">{s.plan.error}</p>
              ) : s.plan?.steps?.length ? (
                <>
                  <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm">
                    {s.plan.steps.map((step, i) => (
                      <li key={i}>
                        <span className="font-mono">{step.action}</span>
                        {step.rationale ? (
                          <span className="text-neutral-500"> · {step.rationale}</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  {s.status === 'planned' ? (
                    <form action={runPlan}>
                      <input type="hidden" name="session_id" value={s.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                      >
                        Run plan
                      </button>
                    </form>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-neutral-500">No steps.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </NavShell>
  );
}
