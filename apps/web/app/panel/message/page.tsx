import { redirect } from 'next/navigation';
import { stageMessageCampaign } from './actions.ts';
import { CampaignForm } from '../../../components/panel/campaign-form.tsx';
import { CampaignList } from '../../../components/panel/campaign-list.tsx';
import { PanelShell } from '../../../components/panel/panel-shell.tsx';
import { RealtimeRefresh } from '../../../components/realtime-refresh.tsx';
import { createClient } from '../../../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  brief: string;
  audience: string;
  max_targets: number;
  status: string;
  queued_count: number;
  last_error: string | null;
}

export default async function MessageCampaignPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .schema('app')
    .from('message_campaigns')
    .select('id,brief,audience,max_targets,status,queued_count,last_error')
    .order('created_at', { ascending: false })
    .limit(20);
  const rows = (data ?? []) as Row[];

  return (
    <PanelShell email={user.email ?? 'signed in'} active="/panel/message">
      <RealtimeRefresh tables={['message_campaigns']} />
      <h1 className="mb-1 text-2xl font-black uppercase italic tracking-widest text-rod-500">
        Message campaign
      </h1>
      <p className="mb-8 max-w-2xl text-sm text-chrome-400">
        Describe the message and the audience. The worker finds matching 1st-degree connections, the
        AI drafts one personalized message per person, and every draft waits in the Approval Queue.
        Nothing is sent until you approve it.
      </p>
      <CampaignForm
        action={stageMessageCampaign}
        submitLabel="Stage for launch"
        fields={[
          {
            name: 'brief',
            label: 'What kind of message to send',
            kind: 'textarea',
            required: true,
            placeholder: 'Check in about their Q4 hiring plans and offer a quick intro call.',
          },
          {
            name: 'audience',
            label: 'To whom the message is sent',
            kind: 'textarea',
            required: true,
            placeholder: 'Founders I am connected with in the UAE fintech scene',
            help: 'Used as a LinkedIn people search over your 1st-degree connections.',
          },
          {
            name: 'max_targets',
            label: 'Messages',
            kind: 'number',
            min: 1,
            max: 25,
            defaultValue: 5,
            limitAction: 'message',
          },
        ]}
      />
      <CampaignList
        heading="Message campaigns"
        items={rows.map((r) => ({
          id: r.id,
          title: r.brief.slice(0, 100),
          subtitle: `to: ${r.audience.slice(0, 80)} · up to ${r.max_targets}`,
          status: r.status,
          queued: r.queued_count,
          lastError: r.last_error,
        }))}
      />
    </PanelShell>
  );
}
