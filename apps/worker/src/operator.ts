import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSecret } from './browser/credentials.ts';
import { assertNotBlocked, CheckpointError, readPageSignal } from './browser/guard.ts';
import { loginToLinkedIn } from './browser/login.ts';
import { launchSession, type Session } from './browser/session.ts';
import type { JobResult, JobRow } from './queue.ts';

type Log = (event: string, data?: Record<string, unknown>) => void;

export interface OperatorConfig {
  sb: SupabaseClient;
  masterKey: Buffer;
  userDataDir: string;
  headless: boolean;
  log: Log;
}

/**
 * Owns the single logged-in LinkedIn session and executes `linkedin.*` jobs.
 * Phase 1 is READ-ONLY: login + gather. Any CheckpointError halts the account
 * (status=checkpoint) and the job returns `blocked` — the human resolves it in
 * the headful window; the worker never bypasses.
 */
export class LinkedInOperator {
  private session: Session | null = null;
  private loggedIn = false;

  constructor(private readonly cfg: OperatorConfig) {}

  async handle(job: JobRow): Promise<JobResult> {
    try {
      switch (job.type) {
        case 'linkedin.login':
          return await this.doLogin(job.user_id);
        case 'linkedin.gather_profile':
          return await this.doGatherProfile(job);
        default:
          return { status: 'done', result: { skipped: job.type } };
      }
    } catch (err) {
      if (err instanceof CheckpointError) {
        await this.markCheckpoint(job.user_id, err.reason);
        return { status: 'blocked', error: err.message };
      }
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async ensureSession(): Promise<Session> {
    if (!this.session) {
      this.session = await launchSession({
        userDataDir: this.cfg.userDataDir,
        headless: this.cfg.headless,
      });
    }
    return this.session;
  }

  private async doLogin(userId: string): Promise<JobResult> {
    const [email, password] = await Promise.all([
      this.loginEmail(userId),
      fetchSecret(this.cfg.sb, this.cfg.masterKey, userId, 'linkedin_password'),
    ]);
    if (!email || !password) {
      return { status: 'failed', error: 'LinkedIn email and/or password not configured' };
    }

    const { page } = await this.ensureSession();
    const result = await loginToLinkedIn(page, email, password);

    if (result.status === 'active') {
      this.loggedIn = true;
      await this.setStatus(userId, 'active', null);
      return { status: 'done', result: { login: 'active', detail: result.detail } };
    }
    if (result.status === 'checkpoint') {
      await this.markCheckpoint(userId, result.detail);
      return { status: 'blocked', error: `checkpoint: ${result.detail}` };
    }
    await this.setStatus(userId, 'logged_out', result.detail);
    return { status: 'failed', error: result.detail };
  }

  private async doGatherProfile(job: JobRow): Promise<JobResult> {
    const profileUrl = String(job.payload.profile_url ?? '');
    if (!profileUrl) return { status: 'failed', error: 'gather_profile needs payload.profile_url' };
    if (!this.loggedIn) {
      const login = await this.doLogin(job.user_id);
      if (login.status !== 'done') return login;
    }

    const { page } = await this.ensureSession();
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
    await assertNotBlocked(page); // hard-stop if LinkedIn challenged us

    const signal = await readPageSignal(page);
    const displayName = (
      await page
        .locator('h1')
        .first()
        .innerText()
        .catch(() => '')
    ).trim();
    const headline = (signal.title ?? '').replace(/\s*\|\s*LinkedIn.*$/i, '').trim();

    await this.cfg.sb.from('people').upsert(
      {
        user_id: job.user_id,
        profile_url: profileUrl,
        display_name: displayName || null,
        headline: headline || null,
        collected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,profile_url' },
    );
    return { status: 'done', result: { profile_url: profileUrl, displayName } };
  }

  private async loginEmail(userId: string): Promise<string | null> {
    const { data } = await this.cfg.sb
      .from('accounts')
      .select('login_email')
      .eq('user_id', userId)
      .eq('platform', 'linkedin')
      .maybeSingle();
    return (data?.login_email as string | undefined) ?? null;
  }

  private async setStatus(userId: string, status: string, reason: string | null): Promise<void> {
    await this.cfg.sb
      .from('accounts')
      .update({ status, checkpoint_reason: reason, last_login_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('platform', 'linkedin');
  }

  private async markCheckpoint(userId: string, reason: string): Promise<void> {
    this.loggedIn = false;
    this.cfg.log('worker.checkpoint', { userId, reason });
    await this.setStatus(userId, 'checkpoint', reason);
  }

  async close(): Promise<void> {
    await this.session?.close();
    this.session = null;
  }
}
