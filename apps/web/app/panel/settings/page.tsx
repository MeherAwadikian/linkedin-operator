import { KeyRound, Link2 } from 'lucide-react';
import { redirect } from 'next/navigation';
import { savePanelUrls } from './actions.ts';
import { ActionForm } from '../../../components/panel/action-form.tsx';
import { Reveal } from '../../../components/panel/motion.tsx';
import { PanelShell } from '../../../components/panel/panel-shell.tsx';
import { createClient } from '../../../lib/supabase/server.ts';
import { saveSecret } from '../../settings/actions.ts';

export const dynamic = 'force-dynamic';

const field =
  'w-full rounded-md border border-chrome-600/40 bg-black/40 px-3 py-2 text-sm text-neutral-100 placeholder:text-chrome-600 transition-colors focus:border-rod-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rod-500/40';

function ApiKeyForm({ kind, label }: { kind: string; label: string }) {
  return (
    <ActionForm
      action={saveSecret}
      submitLabel="Save"
      successMessage={`${label} saved to the worker vault.`}
      resetOnSuccess
      className="flex items-end gap-2 [&>button]:shrink-0"
    >
      <input type="hidden" name="kind" value={kind} />
      <label className="flex-1 text-sm">
        <span className="mb-1 block font-semibold uppercase tracking-wide text-chrome-400">
          {label}
        </span>
        <input type="password" name="value" autoComplete="off" className={field} />
      </label>
    </ActionForm>
  );
}

export default async function PanelSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const app = supabase.schema('app');
  const [gmailRes, linkedinRes] = await Promise.all([
    app.from('settings').select('value').eq('key', 'gmail_url').maybeSingle(),
    app.from('settings').select('value').eq('key', 'linkedin_profile_url').maybeSingle(),
  ]);
  const gmailUrl = (gmailRes.data?.value as { url?: string } | undefined)?.url ?? '';
  const linkedinUrl = (linkedinRes.data?.value as { url?: string } | undefined)?.url ?? '';

  return (
    <PanelShell email={user.email ?? 'signed in'} active="/panel/settings">
      <Reveal>
        <h1 className="mb-1 text-2xl font-black uppercase italic tracking-widest text-rod-500">
          Settings
        </h1>
        <p className="mb-8 max-w-2xl text-sm text-chrome-400">
          API keys are sent to the local worker and encrypted there (AES-256-GCM). They are never
          stored in the browser and never readable by this UI. URLs live in your per-user settings.
        </p>
      </Reveal>

      <Reveal delay={0.08}>
        <section className="mb-10 rounded-xl border border-chrome-600/30 bg-white/[0.03] p-6 backdrop-blur">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-chrome-400">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            API keys
          </h2>
          <div className="flex max-w-xl flex-col gap-4">
            <ApiKeyForm kind="anthropic_key" label="Claude API key" />
            <ApiKeyForm kind="firecrawl_key" label="Firecrawl API key" />
          </div>
        </section>
      </Reveal>

      <Reveal delay={0.16}>
        <section className="rounded-xl border border-chrome-600/30 bg-white/[0.03] p-6 backdrop-blur">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-chrome-400">
            <Link2 className="h-4 w-4" aria-hidden="true" />
            URLs
          </h2>
          <ActionForm
            action={savePanelUrls}
            submitLabel="Save URLs"
            successMessage="URLs saved."
            className="flex max-w-xl flex-col gap-4"
          >
            <label className="text-sm">
              <span className="mb-1 block font-semibold uppercase tracking-wide text-chrome-400">
                Gmail URL
              </span>
              <input
                type="url"
                name="gmail_url"
                defaultValue={gmailUrl}
                placeholder="https://mail.google.com/mail/u/0/"
                autoComplete="off"
                className={field}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold uppercase tracking-wide text-chrome-400">
                LinkedIn URL
              </span>
              <input
                type="url"
                name="linkedin_url"
                defaultValue={linkedinUrl}
                placeholder="https://www.linkedin.com/in/your-handle"
                autoComplete="off"
                className={field}
              />
            </label>
          </ActionForm>
        </section>
      </Reveal>
    </PanelShell>
  );
}
