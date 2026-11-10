'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server.ts';

async function decide(jobId: string, decision: 'approved' | 'rejected'): Promise<void> {
  if (!jobId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const app = supabase.schema('app');

  // Approve → back to 'queued' so the worker's claim loop picks it up.
  const status = decision === 'approved' ? 'queued' : 'cancelled';

  // Guard the transition: only a job that is still awaiting_approval (and owned
  // by this user) may be decided. This blocks double-decisions and re-running a
  // job that is already running/done. RLS also scopes to the owner.
  const { data: updated } = await app
    .from('jobs_queue')
    .update({ status })
    .eq('id', jobId)
    .eq('user_id', user.id)
    .eq('status', 'awaiting_approval')
    .select('id')
    .maybeSingle();
  if (!updated) return; // nothing transitioned → don't record an approval

  await app.from('approvals').insert({
    job_id: jobId,
    decision,
    decided_at: new Date().toISOString(),
    decided_by: user.id,
  });
  revalidatePath('/approvals');
}

export async function approveJob(formData: FormData): Promise<void> {
  await decide(String(formData.get('job_id') ?? ''), 'approved');
}
export async function rejectJob(formData: FormData): Promise<void> {
  await decide(String(formData.get('job_id') ?? ''), 'rejected');
}
