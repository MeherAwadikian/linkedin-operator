import { createProvider, isLinkedInHost, isLinkedInProfileUrl, planCommand } from '@lo/core';
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
        case 'linkedin.search':
          return await this.doSearch(job);
        case 'linkedin.collect_feed':
          return await this.doCollectFeed(job);
        case 'command.plan':
          return await this.doPlan(job);
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
    // SSRF guard: the logged-in browser only ever navigates to vetted LinkedIn
    // profile URLs. Never goto() a raw payload value.
    if (!isLinkedInProfileUrl(profileUrl)) {
      return {
        status: 'failed',
        error: 'profile_url must be an https://www.linkedin.com/in/… URL',
      };
    }
    if (!this.loggedIn) {
      const login = await this.doLogin(job.user_id);
      if (login.status !== 'done') return login;
    }
    if (!(await this.withinRateLimit(job.user_id, 'gather_profile'))) {
      return { status: 'blocked', error: 'rate limit reached for gather_profile' };
    }

    const { page } = await this.ensureSession();
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
    // A redirect could have taken us off LinkedIn — verify before reading/storing.
    if (!isLinkedInHost(page.url())) {
      return { status: 'failed', error: `navigation left LinkedIn: ${page.url()}` };
    }
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

  /**
   * Command-console planning: fetch the user's Claude key, turn the instruction
   * into a validated plan, and write it back to command_sessions for the UI to
   * preview. No LinkedIn session needed — this only produces a plan.
   */
  private async doPlan(job: JobRow): Promise<JobResult> {
    const sessionId = String(job.payload.session_id ?? '');
    const instruction = String(job.payload.instruction ?? '');
    if (!sessionId || !instruction) {
      return { status: 'failed', error: 'command.plan needs session_id + instruction' };
    }
    // The worker uses the service_role key (bypasses RLS), so scope every write
    // to the job's owner explicitly — never trust a payload id alone.
    const { data: owned } = await this.cfg.sb
      .from('command_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', job.user_id)
      .maybeSingle();
    if (!owned) return { status: 'failed', error: 'command session not found for this user' };

    const apiKey = await fetchSecret(this.cfg.sb, this.cfg.masterKey, job.user_id, 'anthropic_key');
    if (!apiKey) {
      await this.cfg.sb
        .from('command_sessions')
        .update({ status: 'error', plan: { error: 'no Anthropic key configured' } })
        .eq('id', sessionId)
        .eq('user_id', job.user_id);
      return { status: 'failed', error: 'no Anthropic key configured' };
    }
    const provider = createProvider({ provider: 'anthropic', apiKey });
    const { plan } = await planCommand(provider, instruction);
    await this.cfg.sb
      .from('command_sessions')
      .update({ plan, status: 'planned' })
      .eq('id', sessionId)
      .eq('user_id', job.user_id);
    return { status: 'done', result: { steps: plan.steps.length } };
  }

  /**
   * Consume one unit of the rate budget for an action (plan §6). Returns false
   * when the hour or day window is at its configured limit — the action is then
   * skipped (blocked), protecting the account from over-activity.
   */
  private async withinRateLimit(userId: string, action: string): Promise<boolean> {
    const { data: rule } = await this.cfg.sb
      .from('rules')
      .select('hourly_limit,daily_limit')
      .eq('user_id', userId)
      .eq('action_type', action)
      .maybeSingle();
    if (!rule) return true;
    const { data: ok, error } = await this.cfg.sb.rpc('consume_rate_limit', {
      p_user: userId,
      p_action: action,
      p_hourly: rule.hourly_limit as number,
      p_daily: rule.daily_limit as number,
    });
    if (error) throw new Error(`consume_rate_limit failed: ${error.message}`);
    return ok === true;
  }

  /** Ensure we're logged in; returns a non-done JobResult to short-circuit on failure. */
  private async ensureLoggedIn(userId: string): Promise<JobResult | null> {
    if (this.loggedIn) return null;
    const login = await this.doLogin(userId);
    return login.status === 'done' ? null : login;
  }

  private async doSearch(job: JobRow): Promise<JobResult> {
    const query = String(job.payload.query ?? '').trim();
    if (!query) return { status: 'failed', error: 'search needs payload.query' };
    const max = Math.min(Number(job.payload.max_results ?? 10), 50);

    const notReady = await this.ensureLoggedIn(job.user_id);
    if (notReady) return notReady;
    if (!(await this.withinRateLimit(job.user_id, 'search'))) {
      return { status: 'blocked', error: 'rate limit reached for search' };
    }

    const url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
    if (!isLinkedInHost(url)) return { status: 'failed', error: 'search URL failed host check' };

    const { page } = await this.ensureSession();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (!isLinkedInHost(page.url())) {
      return { status: 'failed', error: `navigation left LinkedIn: ${page.url()}` };
    }
    await assertNotBlocked(page);

    const stored = await this.collectAndStorePeople(page, job.user_id, max);
    return { status: 'done', result: { query, stored } };
  }

  private async doCollectFeed(job: JobRow): Promise<JobResult> {
    const max = Math.min(Number(job.payload.max_items ?? 20), 60);
    const notReady = await this.ensureLoggedIn(job.user_id);
    if (notReady) return notReady;
    if (!(await this.withinRateLimit(job.user_id, 'collect_feed'))) {
      return { status: 'blocked', error: 'rate limit reached for collect_feed' };
    }

    const { page } = await this.ensureSession();
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
    if (!isLinkedInHost(page.url())) {
      return { status: 'failed', error: `navigation left LinkedIn: ${page.url()}` };
    }
    await assertNotBlocked(page);

    // Polite, fixed-delay scrolling (not randomized-to-deceive) — just enough to
    // load more of the feed. Re-check for a checkpoint after each scroll.
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 2200);
      await page.waitForTimeout(1200);
      await assertNotBlocked(page);
    }

    const stored = await this.collectAndStorePeople(page, job.user_id, max);
    return { status: 'done', result: { stored } };
  }

  /** Extract /in/ profile links on the current page and upsert them to `people`. */
  private async collectAndStorePeople(
    page: import('playwright').Page,
    userId: string,
    max: number,
  ): Promise<number> {
    // page.$$eval is Playwright's DOM-query helper — it runs the STATIC function
    // below in the page context to read anchors. It is not JavaScript eval() and
    // takes no dynamic/user-supplied code.
    const anchors = await page.$$eval('a[href*="/in/"]', (els) =>
      els.map((a) => ({ href: (a as HTMLAnchorElement).href, text: a.textContent?.trim() ?? '' })),
    );

    const seen = new Set<string>();
    const rows: Array<Record<string, unknown>> = [];
    for (const a of anchors) {
      if (!isLinkedInProfileUrl(a.href)) continue;
      const canonical = new URL(a.href);
      const url = `${canonical.origin}${canonical.pathname.replace(/\/$/, '')}`;
      if (seen.has(url)) continue;
      seen.add(url);
      rows.push({
        user_id: userId,
        profile_url: url,
        display_name: a.text || null,
        collected_at: new Date().toISOString(),
      });
      if (rows.length >= max) break;
    }
    if (rows.length === 0) return 0;
    const { error } = await this.cfg.sb
      .from('people')
      .upsert(rows, { onConflict: 'user_id,profile_url' });
    if (error) throw new Error(`store people failed: ${error.message}`);
    return rows.length;
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
