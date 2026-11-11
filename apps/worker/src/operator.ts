import {
  createProvider,
  draftEmail,
  isLinkedInHost,
  isLinkedInProfileUrl,
  planCommand,
  type EmailRecipient,
} from '@lo/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendGmail } from './email.ts';
import {
  commentPost,
  connectProfile,
  likePost,
  postUpdate,
  sendMessage,
  type WriteResult,
} from './browser/actions-write.ts';
import { fetchSecret } from './browser/credentials.ts';
import { assertNotBlocked, CheckpointError, readPageSignal } from './browser/guard.ts';
import { loginToLinkedIn } from './browser/login.ts';
import { saveSessionBackup } from './browser/session-backup.ts';
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
        case 'campaign.start':
          return await this.doCampaign(job);
        case 'email_campaign.draft':
          return await this.doEmailCampaign(job);
        case 'email.send':
          return await this.doEmailSend(job);
        case 'linkedin.like':
        case 'linkedin.comment':
        case 'linkedin.post':
        case 'linkedin.message':
        case 'linkedin.connect':
          return await this.doWrite(job);
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
      await this.backupSession(userId);
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
   * Phase 3 write actions (like/comment/post/message/connect). By the time a
   * write job is claimed it has already passed the approval gate (it enqueued as
   * awaiting_approval → queued only after approval). Here we re-check dry-run,
   * the rate limit, and the checkpoint guard, fetch the APPROVED draft text, and
   * perform the (unverified-selector) action, logging the readback result.
   */
  private async doWrite(job: JobRow): Promise<JobResult> {
    const action = job.type.replace('linkedin.', '');

    // Execution-time dry-run re-check: never perform a write while dry-run is on.
    if (await this.isDryRun(job.user_id)) {
      return { status: 'blocked', error: `dry-run is on — ${action} not performed` };
    }
    const notReady = await this.ensureLoggedIn(job.user_id);
    if (notReady) return notReady;
    if (!(await this.withinRateLimit(job.user_id, action))) {
      return { status: 'blocked', error: `rate limit reached for ${action}` };
    }
    const { page } = await this.ensureSession();

    let target = '';
    let result: WriteResult;
    try {
      switch (action) {
        case 'like': {
          target = String(job.payload.post_url ?? '');
          if (!isLinkedInHost(target)) return this.badTarget('post_url');
          await this.gotoGuarded(page, target);
          result = await likePost(page);
          break;
        }
        case 'comment': {
          target = String(job.payload.post_url ?? '');
          if (!isLinkedInHost(target)) return this.badTarget('post_url');
          const body = await this.draftBody(job.user_id, job.payload.draft_id);
          if (!body)
            return { status: 'failed', error: 'comment needs an approved draft (draft_id)' };
          await this.gotoGuarded(page, target);
          result = await commentPost(page, body);
          break;
        }
        case 'post': {
          target = 'https://www.linkedin.com/feed/';
          const body = await this.draftBody(job.user_id, job.payload.draft_id);
          if (!body) return { status: 'failed', error: 'post needs an approved draft (draft_id)' };
          result = await postUpdate(page, body);
          break;
        }
        case 'message': {
          target = String(job.payload.thread_url ?? '');
          if (!isLinkedInHost(target)) return this.badTarget('thread_url');
          const body = await this.draftBody(job.user_id, job.payload.draft_id);
          if (!body)
            return { status: 'failed', error: 'message needs an approved draft (draft_id)' };
          await this.gotoGuarded(page, target);
          result = await sendMessage(page, body);
          break;
        }
        case 'connect': {
          target = String(job.payload.profile_url ?? '');
          if (!isLinkedInProfileUrl(target)) return this.badTarget('profile_url');
          const note = job.payload.note_draft_id
            ? await this.draftBody(job.user_id, job.payload.note_draft_id)
            : null;
          await this.gotoGuarded(page, target);
          result = await connectProfile(page, note ?? undefined);
          break;
        }
        default:
          return { status: 'failed', error: `unknown write action: ${action}` };
      }
    } catch (err) {
      if (err instanceof CheckpointError) throw err; // handled by handle()
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }

    await this.logAction(
      job.user_id,
      action,
      target,
      result.detail,
      job.id,
      result.ok ? 'done' : 'failed',
    );
    return result.ok
      ? { status: 'done', result: { detail: result.detail } }
      : { status: 'failed', error: result.detail };
  }

  private badTarget(field: string): JobResult {
    return { status: 'failed', error: `${field} is not a valid LinkedIn URL` };
  }

  private async gotoGuarded(page: import('playwright').Page, url: string): Promise<void> {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (!isLinkedInHost(page.url())) throw new Error(`navigation left LinkedIn: ${page.url()}`);
    await assertNotBlocked(page);
  }

  private async isDryRun(userId: string): Promise<boolean> {
    const { data } = await this.cfg.sb
      .from('settings')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'dry_run')
      .maybeSingle();
    return Boolean((data?.value as { enabled?: boolean } | undefined)?.enabled);
  }

  /** Fetch an APPROVED draft's body (the text the human signed off on). */
  private async draftBody(userId: string, draftId: unknown): Promise<string | null> {
    const id = String(draftId ?? '');
    if (!id) return null;
    const { data } = await this.cfg.sb
      .from('drafts')
      .select('body')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    const body = ((data?.body as string | undefined) ?? '').trim();
    return body || null;
  }

  private async logAction(
    userId: string,
    actionType: string,
    targetUrl: string,
    summary: string,
    jobId: string,
    outcome: string,
  ): Promise<void> {
    await this.cfg.sb.from('actions_log').insert({
      user_id: userId,
      action_type: actionType,
      target_url: targetUrl || null,
      summary,
      job_id: jobId,
      outcome,
    });
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
   * Run a campaign: search LinkedIn for the target, collect matching people, and
   * queue ONE personalized connection-with-note per person into the APPROVAL queue
   * (status awaiting_approval). Nothing is sent here — the operator approves each
   * in the UI, then the normal gated send path runs. No email, no contact scraping.
   */
  private async doCampaign(job: JobRow): Promise<JobResult> {
    const campaignId = String(job.payload.campaign_id ?? '');
    const query = String(job.payload.query ?? '').trim();
    const template = String(job.payload.message_template ?? '');
    const networkType = String(job.payload.network_type ?? 'any');
    const max = Math.min(Number(job.payload.max_targets ?? 10), 50);
    if (!campaignId || !query) {
      return { status: 'failed', error: 'campaign.start needs campaign_id + query' };
    }

    const notReady = await this.ensureLoggedIn(job.user_id);
    if (notReady) {
      await this.setCampaign(campaignId, job.user_id, 'failed', 0, notReady.error);
      return notReady;
    }
    if (!(await this.withinRateLimit(job.user_id, 'search'))) {
      await this.setCampaign(campaignId, job.user_id, 'failed', 0, 'rate limit reached for search');
      return { status: 'blocked', error: 'rate limit reached for search' };
    }

    // Optional network-degree filter (LinkedIn's people-search `network` param).
    const net =
      networkType === 'first'
        ? '&network=%5B%22F%22%5D'
        : networkType === 'second'
          ? '&network=%5B%22S%22%5D'
          : '';
    const url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}${net}`;
    if (!isLinkedInHost(url)) return { status: 'failed', error: 'search URL failed host check' };

    const { page } = await this.ensureSession();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (!isLinkedInHost(page.url())) {
      return { status: 'failed', error: `navigation left LinkedIn: ${page.url()}` };
    }
    await assertNotBlocked(page);

    const people = await this.collectAndStorePeople(page, job.user_id, max);

    let queued = 0;
    for (const p of people) {
      const body = this.personalize(template, p.display_name);
      const { data: draft, error: draftErr } = await this.cfg.sb
        .from('drafts')
        .insert({
          user_id: job.user_id,
          kind: 'connect_note',
          target: { profile_url: p.profile_url },
          body,
          status: 'approved',
        })
        .select('id')
        .single();
      if (draftErr || !draft) continue;
      const { error: jobErr } = await this.cfg.sb.from('jobs_queue').insert({
        user_id: job.user_id,
        type: 'linkedin.connect',
        status: 'awaiting_approval',
        payload: { profile_url: p.profile_url, note_draft_id: draft.id, campaign_id: campaignId },
      });
      if (!jobErr) queued += 1;
    }

    await this.setCampaign(campaignId, job.user_id, 'ready', queued, null);
    return { status: 'done', result: { collected: people.length, queued } };
  }

  /** Replace {name}/{first_name} with the person's first name; cap at the note limit. */
  private personalize(template: string, displayName: string | null): string {
    const first = (displayName ?? '').trim().split(/\s+/)[0] || 'there';
    const base = template || 'Hi {name}, would love to connect.';
    return base.replace(/\{(name|first_name)\}/gi, first).slice(0, 280);
  }

  private async setCampaign(
    id: string,
    userId: string,
    status: string,
    queued: number,
    err: string | null | undefined,
  ): Promise<void> {
    await this.cfg.sb
      .from('campaigns')
      .update({ status, queued_count: queued, last_error: err ?? null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
  }

  /**
   * Draft an email campaign: for each contact the operator provided, the AI writes
   * a personalized email from the operator's brief, and each is queued into the
   * APPROVAL queue (awaiting_approval). Nothing is sent here. No contact is scraped
   * — the recipient list is supplied by the operator.
   */
  private async doEmailCampaign(job: JobRow): Promise<JobResult> {
    const campaignId = String(job.payload.campaign_id ?? '');
    const brief = String(job.payload.brief ?? '').trim();
    const recipients = Array.isArray(job.payload.recipients)
      ? (job.payload.recipients as EmailRecipient[])
      : [];
    if (!campaignId || !brief || recipients.length === 0) {
      return { status: 'failed', error: 'email_campaign.draft needs campaign_id + brief + recipients' };
    }
    const apiKey = await fetchSecret(this.cfg.sb, this.cfg.masterKey, job.user_id, 'anthropic_key');
    if (!apiKey) {
      await this.setEmailCampaign(campaignId, job.user_id, 'failed', 0, 'no Anthropic key configured');
      return { status: 'failed', error: 'no Anthropic key configured' };
    }
    const provider = createProvider({ provider: 'anthropic', apiKey });

    let queued = 0;
    for (const r of recipients.slice(0, 50)) {
      if (!r?.email) continue;
      let drafted;
      try {
        drafted = await draftEmail(provider, { brief, recipient: r });
      } catch {
        continue; // skip one that failed to draft; keep going
      }
      const body = `${drafted.body}\n\n—\nIf you'd prefer not to hear from me, just reply and I'll remove you.`;
      const { error } = await this.cfg.sb.from('jobs_queue').insert({
        user_id: job.user_id,
        type: 'email.send',
        status: 'awaiting_approval',
        payload: {
          to: r.email,
          name: r.name ?? null,
          subject: drafted.subject,
          body,
          campaign_id: campaignId,
        },
      });
      if (!error) queued += 1;
    }
    await this.setEmailCampaign(campaignId, job.user_id, 'ready', queued, null);
    return { status: 'done', result: { queued } };
  }

  /** Send one approved email from the operator's Gmail. Re-checks dry-run + rate limit. */
  private async doEmailSend(job: JobRow): Promise<JobResult> {
    const to = String(job.payload.to ?? '');
    const subject = String(job.payload.subject ?? '');
    const body = String(job.payload.body ?? '');
    if (!to || !subject || !body) return { status: 'failed', error: 'email.send needs to/subject/body' };
    if (await this.isDryRun(job.user_id)) {
      return { status: 'blocked', error: 'dry-run is on — email not sent' };
    }
    if (!(await this.withinRateLimit(job.user_id, 'email_send'))) {
      return { status: 'blocked', error: 'rate limit reached for email_send' };
    }
    const [address, password] = await Promise.all([
      this.gmailAddress(job.user_id),
      fetchSecret(this.cfg.sb, this.cfg.masterKey, job.user_id, 'gmail_password'),
    ]);
    if (!address || !password) {
      return { status: 'failed', error: 'Gmail address and/or app password not configured' };
    }
    let result;
    try {
      result = await sendGmail({ user: address, pass: password, to, subject, body });
    } catch (err) {
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
    await this.logAction(job.user_id, 'email_send', `mailto:${to}`, result.detail, job.id, 'done');
    return { status: 'done', result: { to, detail: result.detail } };
  }

  private async gmailAddress(userId: string): Promise<string | null> {
    const { data } = await this.cfg.sb
      .from('settings')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'gmail_address')
      .maybeSingle();
    return ((data?.value as { address?: string } | undefined)?.address ?? null) || null;
  }

  private async setEmailCampaign(
    id: string,
    userId: string,
    status: string,
    queued: number,
    err: string | null | undefined,
  ): Promise<void> {
    await this.cfg.sb
      .from('email_campaigns')
      .update({ status, queued_count: queued, last_error: err ?? null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
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
    return { status: 'done', result: { query, stored: stored.length } };
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
    return { status: 'done', result: { stored: stored.length } };
  }

  /** Extract /in/ profile links on the current page and upsert them to `people`.
   * Returns the de-duped list that was stored (used by campaigns to queue notes). */
  private async collectAndStorePeople(
    page: import('playwright').Page,
    userId: string,
    max: number,
  ): Promise<Array<{ profile_url: string; display_name: string | null }>> {
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
    if (rows.length === 0) return [];
    const { error } = await this.cfg.sb
      .from('people')
      .upsert(rows, { onConflict: 'user_id,profile_url' });
    if (error) throw new Error(`store people failed: ${error.message}`);
    return rows.map((r) => ({
      profile_url: r.profile_url as string,
      display_name: (r.display_name as string | null) ?? null,
    }));
  }

  /** Best-effort encrypted backup of the browser session; never fails the login. */
  private async backupSession(userId: string): Promise<void> {
    try {
      if (!this.session) return;
      const { data: acct } = await this.cfg.sb
        .from('accounts')
        .select('id')
        .eq('user_id', userId)
        .eq('platform', 'linkedin')
        .maybeSingle();
      if (!acct?.id) return;
      const state = await this.session.context.storageState();
      await saveSessionBackup(
        this.cfg.sb,
        this.cfg.masterKey,
        acct.id as string,
        JSON.stringify(state),
      );
      this.cfg.log('worker.session_backed_up', { userId });
    } catch (err) {
      this.cfg.log('worker.session_backup_failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
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
