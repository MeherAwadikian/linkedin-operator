import { redirect } from 'next/navigation';
import { saveLinkedInAccount, saveSecret } from './actions.ts';
import { NavShell } from '../../components/nav-shell.tsx';
import { createClient } from '../../lib/supabase/server.ts';

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

  const { data: account } = await supabase
    .schema('app')
    .from('accounts')
    .select('login_email,status')
    .eq('platform', 'linkedin')
    .maybeSingle();

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
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">Email</span>
            <input
              type="email"
              name="email"
              defaultValue={account?.login_email ?? ''}
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

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          API keys
        </h2>
        <div className="flex max-w-md flex-col gap-4">
          <ApiKeyForm kind="anthropic_key" label="Anthropic (Claude) API key" />
          <ApiKeyForm kind="openrouter_key" label="OpenRouter API key (optional)" />
          <ApiKeyForm kind="deepseek_key" label="DeepSeek API key (optional)" />
        </div>
      </section>
    </NavShell>
  );
}
