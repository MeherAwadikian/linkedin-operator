'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server.ts';

async function decide(jobId: string, decision: 'approved' | 'rejected'): Promise<void> {
  if (!jobId) return;
  const supabase = await createClient();
  const app = supabase.schema('app');
  // Approve → back to 'queued' so the worker's claim loop picks it up.
  const status = decision === 'approved' ? 'queued' : 'cancelled';
  await app.from('jobs_queue').update({ status }).eq('id', jobId);
  await app
    .from('approvals')
    .insert({ job_id: jobId, decision, decided_at: new Date().toISOString(), decided_by: 'user' });
  revalidatePath('/approvals');
}

export async function approveJob(formData: FormData): Promise<void> {
  await decide(String(formData.get('job_id') ?? ''), 'approved');
}
export async function rejectJob(formData: FormData): Promise<void> {
  await decide(String(formData.get('job_id') ?? ''), 'rejected');
}
