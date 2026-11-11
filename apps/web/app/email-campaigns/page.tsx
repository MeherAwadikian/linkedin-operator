import { redirect } from 'next/navigation';
import { createEmailCampaign } from './actions.ts';
import { NavShell } from '../../components/nav-shell.tsx';
import { RealtimeRefresh } from '../../components/realtime-refresh.tsx';
import { createClient } from '../../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

interface EmailCampaignRow {
  id: string;
  name: string;
  brief: string;
  status: string;
  recipient_count: number;
  queued_count: number;
  last_error: string | null;
  created_at: string;
}

const field =
  'w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700';
const btn =
  'rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900';

export default async function EmailCampaignsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .schema('app')
    .from('email_campaigns')
    .select('id,name,brief,status,recipient_count,queued_count,last_error,created_at')
    .order('created_at', { ascending: false })
    .limit(25);
  const campaigns = (data ?? []) as EmailCampaignRow[];

  return (
    <NavShell email={user.email ?? 'signed in'}>
      <RealtimeRefresh />
      <h1 className="mb-1 text-2xl font-semibold">Email campaigns</h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-500">
        Give a brief and paste a list of contacts <strong>you already have a reason to email</strong>
        . The AI drafts a personalized email for each, and every one lands in the{' '}
        <a href="/approvals" className="underline">
          Approval Queue
        </a>{' '}
        for you to review before it sends from your Gmail. Sends are rate-limited and include an
        opt-out line. Don&apos;t paste addresses you scraped or bought without consent — that&apos;s
        spam and will get your account blocked.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          New email campaign
        </h2>
        <form action={createEmailCampaign} className="flex max-w-2xl flex-col gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">Campaign name</span>
            <input name="name" className={field} placeholder="Logistics intro — November" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">
              Your brief — what the email should say (the AI writes it per contact)
            </span>
            <textarea
              name="brief"
              rows={3}
              className={`${field} font-sans`}
              placeholder="Intro: we build AI automations for logistics firms; offer a free 20-min audit; ask for a quick reply."
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">
              Contacts — one per line as <span className="font-mono">email, name, company</span>{' '}
              (name &amp; company optional, up to 50)
            </span>
            <textarea
              name="recipients"
              rows={6}
              className={`${field} font-mono`}
              placeholder={'jane@acme.com, Jane, Acme Logistics\nsam@globex.com, Sam, Globex'}
            />
          </label>
          <button type="submit" className={`${btn} self-start`}>
            Draft emails
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Your email campaigns ({campaigns.length})
        </h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-neutral-500">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {campaigns.map((c) => (
              <li key={c.id} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-neutral-500">{c.recipient_count} contacts</p>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {c.status}
                    {c.queued_count > 0 ? (
                      <span className="ml-1 text-green-600 dark:text-green-400">
                        · {c.queued_count} drafted, awaiting approval
                      </span>
                    ) : null}
                  </span>
                </div>
                {c.last_error ? (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{c.last_error}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </NavShell>
  );
}
