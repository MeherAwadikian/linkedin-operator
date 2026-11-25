import { stageConnectCampaign } from './actions.ts';
import { CampaignForm } from '../../../components/panel/campaign-form.tsx';
import { CampaignList } from '../../../components/panel/campaign-list.tsx';
import { PanelShell } from '../../../components/panel/panel-shell.tsx';
import { RealtimeRefresh } from '../../../components/realtime-refresh.tsx';
import { createClient } from '../../../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  query: string;
  message_template: string;
  max_targets: number;
  status: string;
  queued_count: number;
  last_error: string | null;
}

export default async function ConnectCampaignPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .schema('app')
    .from('campaigns')
    .select('id,query,message_template,max_targets,status,queued_count,last_error')
    .order('created_at', { ascending: false })
    .limit(20);
  const rows = (data ?? []) as Row[];

  return (
    <PanelShell active="/panel/connect">
      <RealtimeRefresh tables={['campaigns']} />
      <h1 className="mb-1 text-2xl font-black uppercase italic tracking-widest text-rod-500">
        Connect campaign
      </h1>
      <p className="mb-8 max-w-2xl text-sm text-chrome-400">
        Say who you want to connect with. The worker searches LinkedIn, collects matching people,
        and queues one personalized connection request per person into the Approval Queue. Nothing
        is sent until you approve it.
      </p>
      <CampaignForm
        action={stageConnectCampaign}
        submitLabel="Stage for launch"
        fields={[
          {
            name: 'audience',
            label: 'To whom to connect',
            kind: 'textarea',
            required: true,
            placeholder: 'AI automation founders in Dubai',
            help: 'Used as the LinkedIn people search.',
          },
          {
            name: 'notes',
            label: 'Notes (connection-request message, optional)',
            kind: 'textarea',
            placeholder: 'Hi {name}, I help teams automate outreach, would love to connect.',
            help: 'Use {name} for their first name. Max 280 chars per request.',
          },
          {
            name: 'max_targets',
            label: 'Connection requests',
            kind: 'number',
            min: 1,
            max: 50,
            defaultValue: 10,
            limitAction: 'connect',
          },
        ]}
      />
      <CampaignList
        heading="Connect campaigns"
        items={rows.map((r) => ({
          id: r.id,
          title: r.query,
          subtitle: r.message_template
            ? `"${r.message_template.slice(0, 80)}" · up to ${r.max_targets}`
            : `no note · up to ${r.max_targets}`,
          status: r.status,
          queued: r.queued_count,
          lastError: r.last_error,
        }))}
      />
    </PanelShell>
  );
}
