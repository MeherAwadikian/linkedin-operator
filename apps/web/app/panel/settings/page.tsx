import { redirect } from 'next/navigation';
import { savePanelUrls } from './actions.ts';
import { PanelShell } from '../../../components/panel/panel-shell.tsx';
import { createClient } from '../../../lib/supabase/server.ts';
import { saveSecret } from '../../settings/actions.ts';

export const dynamic = 'force-dynamic';

const field =
  'w-full rounded-md border border-chrome-600/40 bg-black/40 px-3 py-2 text-sm text-neutral-100 placeholder:text-chrome-600 focus:border-rod-500 focus:outline-none';
const btn =
  'self-start rounded-md bg-gradient-to-b from-rod-500 to-rod-700 px-5 py-2.5 text-sm font-bold uppercase tracking-widest text-white shadow-[0_0_18px_rgba(215,20,26,0.45)] hover:from-rod-300 hover:to-rod-600';

function ApiKeyForm({ kind, label }: { kind: string; label: string }) {
  return (
    <form action={saveSecret} className="flex items-end gap-2">
      <input type="hidden" name="kind" value={kind} />
      <label className="flex-1 text-sm">
        <span className="mb-1 block font-semibold uppercase tracking-wide text-chrome-400">
          {label}
        </span>
        <input type="password" name="value" autoComplete="off" className={field} />
      </label>
      <button type="submit" className={btn}>
        Save
      </button>
    </form>
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
      <h1 className="mb-1 text-2xl font-black uppercase italic tracking-widest text-rod-500">
        Settings
      </h1>
      <p className="mb-8 max-w-2xl text-sm text-chrome-400">
        API keys are sent to the local worker and encrypted there (AES-256-GCM). They are never
        stored in the browser and never readable by this UI. URLs live in your per-user settings.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-chrome-400">
          API keys
        </h2>
        <div className="flex max-w-xl flex-col gap-4">
          <ApiKeyForm kind="anthropic_key" label="Claude API key" />
          <ApiKeyForm kind="firecrawl_key" label="Firecrawl API key" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-chrome-400">URLs</h2>
        <form action={savePanelUrls} className="flex max-w-xl flex-col gap-4">
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
          <button type="submit" className={btn}>
            Save URLs
          </button>
        </form>
      </section>
    </PanelShell>
  );
}
