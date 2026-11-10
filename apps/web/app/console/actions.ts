'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server.ts';

const WRITE_ACTIONS = new Set([
  'like',
  'comment',
  'post',
  'message',
  'connect',
  'apply_easy_apply',
]);

/** Submit an instruction: create a session row + enqueue a command.plan job. */
export async function createCommandSession(formData: FormData): Promise<void> {
  const instruction = String(formData.get('instruction') ?? '').trim();
  if (!instruction) return;
  const supabase = await createClient();
  const app = supabase.schema('app');
  const { data: session } = await app
    .from('command_sessions')
    .insert({ prompt: instruction, status: 'planning' })
    .select('id')
    .single();
  if (!session) return;
  await app
    .from('jobs_queue')
    .insert({ type: 'command.plan', payload: { session_id: session.id, instruction } });
  revalidatePath('/console');
}

/**
 * Enqueue the steps of a planned session. Read-only steps go straight to the
 * queue; write steps start at awaiting_approval so they flow through the
 * approval gate (nothing is sent without approval).
 */
export async function runPlan(formData: FormData): Promise<void> {
  const sessionId = String(formData.get('session_id') ?? '');
  if (!sessionId) return;
  const supabase = await createClient();
  const app = supabase.schema('app');

  const { data: session } = await app
    .from('command_sessions')
    .select('plan,status')
    .eq('id', sessionId)
    .eq('status', 'planned') // only run a plan that is ready, once
    .maybeSingle();
  const steps = (session?.plan as { steps?: Array<{ action: string; inputs?: unknown }> } | null)
    ?.steps;
  if (!steps?.length) return;

  const rows = steps.map((s) => ({
    type: `linkedin.${s.action}`,
    payload: (s.inputs as Record<string, unknown> | undefined) ?? {},
    status: WRITE_ACTIONS.has(s.action) ? 'awaiting_approval' : 'queued',
  }));
  await app.from('jobs_queue').insert(rows);
  await app.from('command_sessions').update({ status: 'run' }).eq('id', sessionId);
  revalidatePath('/console');
}
