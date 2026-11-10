import { redirect } from 'next/navigation';
import {
  saveGmailAccount,
  saveLinkedInAccount,
  saveSecret,
  setDryRun,
  updatePersona,
  updateRule,
} from './actions.ts';
import { NavShell } from '../../components/nav-shell.tsx';
import { createClient } from '../../lib/supabase/server.ts';

interface RuleRow {
  action_type: string;
  approval_level: number;
  daily_limit: number;
  version: number;
}

export const dynamic = 'force-dynamic';

const fieldClass =
  'w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700';
const btnClass =
  'rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200';

function ApiKeyForm({ kind, label }: { kind: string; label: string }) {
  return (
    <form action={saveSecret} className="flex items-end gap-2">
      <input type="hidden" name="kind" value={kind} />
      <label className="flex-1 text-sm">
        <span className="mb-1 block text-neutral-600 dark:text-neutral-400">{label}</span>
        <input type="password" name="value" autoComplete="off" className={fieldClass} />
      </label>
      <button type="submit" className={btnClass}>
        Save
      </button>
    </form>
  );
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const app = supabase.schema('app');
  const [accountRes, rulesRes, dryRunRes, personaRes, gmailRes, liUrlRes] = await Promise.all([
    app.from('accounts').select('login_email,status').eq('platform', 'linkedin').maybeSingle(),
    app.from('rules').select('action_type,approval_level,daily_limit,version').order('action_type'),
    app.from('settings').select('value').eq('key', 'dry_run').maybeSingle(),
    app
      .from('personas')
      .select('tone_instructions,banned_openers')
      .eq('active', true)
      .maybeSingle(),
    app.from('settings').select('value').eq('key', 'gmail_address').maybeSingle(),
    app.from('settings').select('value').eq('key', 'linkedin_profile_url').maybeSingle(),
  ]);
  const account = accountRes.data;
  const rules = (rulesRes.data ?? []) as RuleRow[];
  const dryRun = Boolean((dryRunRes.data?.value as { enabled?: boolean } | undefined)?.enabled);
  const gmailAddress = (gmailRes.data?.value as { address?: string } | undefined)?.address ?? '';
  const linkedinUrl = (liUrlRes.data?.value as { url?: string } | undefined)?.url ?? '';
  const personaTone = (personaRes.data?.tone_instructions as string | undefined) ?? '';
  const personaOpeners = ((personaRes.data?.banned_openers as string[] | undefined) ?? []).join(
    '\n',
  );

  return (
    <NavShell email={user.email ?? 'signed in'}>
      <h1 className="mb-1 text-2xl font-semibold">Settings</h1>
      <p className="mb-8 text-sm text-neutral-500">
        Secrets are sent to the local worker and encrypted there (AES-256-GCM). They are never
        stored in the browser and never readable by this UI.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          LinkedIn account
        </h2>
        <p className="mb-3 text-xs text-neutral-500">Status: {account?.status ?? 'unknown'}</p>
        <form action={saveLinkedInAccount} className="flex max-w-md flex-col gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">
              Email / login
            </span>
            <input
              type="email"
              name="email"
              defaultValue={account?.login_email ?? ''}
              autoComplete="off"
              className={fieldClass}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">
              Profile link (URL)
            </span>
            <input
              type="url"
              name="profile_url"
              defaultValue={linkedinUrl}
              placeholder="https://www.linkedin.com/in/your-handle"
              autoComplete="off"
              className={fieldClass}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">Password</span>
            <input type="password" name="password" autoComplete="off" className={fieldClass} />
          </label>
          <button type="submit" className={`${btnClass} self-start`}>
            Save LinkedIn credentials
          </button>
        </form>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Gmail account
        </h2>
        <p className="mb-3 text-xs text-neutral-500">
          Used by your worker to open Gmail in the browser (e.g. for verification steps). The
          password is sent to your local worker and encrypted there — never stored in this UI. Tip:
          if your Google account has 2-step verification, use an{' '}
          <span className="font-medium">app password</span> here.
        </p>
        <form action={saveGmailAccount} className="flex max-w-md flex-col gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">Gmail address</span>
            <input
              type="email"
              name="address"
              defaultValue={gmailAddress}
              autoComplete="off"
              className={fieldClass}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">Password</span>
            <input type="password" name="password" autoComplete="off" className={fieldClass} />
          </label>
          <button type="submit" className={`${btnClass} self-start`}>
            Save Gmail credentials
          </button>
        </form>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          API keys
        </h2>
        <div className="flex max-w-md flex-col gap-4">
          <ApiKeyForm kind="anthropic_key" label="Anthropic (Claude) API key" />
          <ApiKeyForm kind="openrouter_key" label="OpenRouter API key (optional)" />
          <ApiKeyForm kind="deepseek_key" label="DeepSeek API key (optional)" />
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Persona
        </h2>
        <p className="mb-3 text-xs text-neutral-500">
          How drafts are written. This shapes tone only — it never implies more history with a
          contact than is real, and it is not used to evade detection.
        </p>
        <form action={updatePersona} className="flex max-w-xl flex-col gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">
              Tone instructions
            </span>
            <textarea
              name="tone"
              rows={4}
              defaultValue={personaTone}
              className={`${fieldClass} font-sans`}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">
              Banned openers (one per line)
            </span>
            <textarea
              name="banned_openers"
              rows={4}
              defaultValue={personaOpeners}
              className={`${fieldClass} font-sans`}
            />
          </label>
          <button type="submit" className={`${btnClass} self-start`}>
            Save persona
          </button>
        </form>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Safety mode
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm">
            Dry-run:{' '}
            <span className={dryRun ? 'font-medium text-amber-600 dark:text-amber-400' : ''}>
              {dryRun ? 'ON — every write action waits for approval' : 'off'}
            </span>
          </span>
          <form action={setDryRun}>
            <input type="hidden" name="enabled" value={dryRun ? 'false' : 'true'} />
            <button type="submit" className={`${btnClass} px-3 py-1.5`}>
              {dryRun ? 'Turn off' : 'Turn on'}
            </button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Safety rules
        </h2>
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {rules.map((r) => (
            <li key={r.action_type} className="px-4 py-2">
              <form action={updateRule} className="flex flex-wrap items-center gap-3 text-sm">
                <input type="hidden" name="action_type" value={r.action_type} />
                <span className="w-40 font-mono">{r.action_type}</span>
                <label className="flex items-center gap-1">
                  <span className="text-neutral-500">approval</span>
                  <select
                    name="approval_level"
                    defaultValue={r.approval_level}
                    className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
                  >
                    <option value={0}>L0 auto</option>
                    <option value={1}>L1 standing</option>
                    <option value={2}>L2 ask</option>
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-neutral-500">daily</span>
                  <input
                    type="number"
                    name="daily_limit"
                    defaultValue={r.daily_limit}
                    min={0}
                    className="w-20 rounded-md border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                >
                  Save
                </button>
                <span className="text-xs text-neutral-400">v{r.version}</span>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </NavShell>
  );
}
