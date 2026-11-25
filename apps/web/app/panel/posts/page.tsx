import { stagePostCampaign } from './actions.ts';
import { CampaignForm } from '../../../components/panel/campaign-form.tsx';
import { CampaignList } from '../../../components/panel/campaign-list.tsx';
import { PanelShell } from '../../../components/panel/panel-shell.tsx';
import { RealtimeRefresh } from '../../../components/realtime-refresh.tsx';
import { createClient } from '../../../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  brief: string;
  body: string;
  status: string;
  last_error: string | null;
}

export default async function PostsCampaignPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .schema('app')
    .from('post_campaigns')
    .select('id,brief,body,status,last_error')
    .order('created_at', { ascending: false })
    .limit(20);
  const rows = (data ?? []) as Row[];

  return (
    <PanelShell active="/panel/posts">
      <RealtimeRefresh tables={['post_campaigns']} />
      <h1 className="mb-1 text-2xl font-black uppercase italic tracking-widest text-rod-500">
        Posts campaign
      </h1>
      <p className="mb-8 max-w-2xl text-sm text-chrome-400">
        Describe the post you want. The worker drafts it with your own LLM key and queues it into
        the Approval Queue; nothing publishes until you approve the drafted text.
      </p>
      <CampaignForm
        action={stagePostCampaign}
        submitLabel="Stage for launch"
        fields={[
          {
            name: 'brief',
            label: 'The post content',
            kind: 'textarea',
            required: true,
            placeholder: 'A short post about what we learned automating LinkedIn outreach safely.',
          },
          {
            name: 'post_count',
            label: 'Number of posts',
            kind: 'number',
            min: 1,
            max: 10,
            defaultValue: 1,
            limitAction: 'post',
          },
        ]}
      />
      <CampaignList
        heading="Post campaigns"
        items={rows.map((r) => ({
          id: r.id,
          title: r.brief.slice(0, 100),
          subtitle: r.body ? `draft: ${r.body.slice(0, 90)}` : 'not drafted yet',
          status: r.status,
          lastError: r.last_error,
        }))}
      />
    </PanelShell>
  );
}
