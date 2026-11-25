import { stageCommentCampaign } from './actions.ts';
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
  max_comments: number;
  status: string;
  queued_count: number;
  last_error: string | null;
}

export default async function CommentCampaignPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .schema('app')
    .from('comment_campaigns')
    .select('id,brief,audience,max_comments,status,queued_count,last_error')
    .order('created_at', { ascending: false })
    .limit(20);
  const rows = (data ?? []) as Row[];

  return (
    <PanelShell active="/panel/comment">
      <RealtimeRefresh tables={['comment_campaigns']} />
      <h1 className="mb-1 text-2xl font-black uppercase italic tracking-widest text-rod-500">
        Comment campaign
      </h1>
      <p className="mb-8 max-w-2xl text-sm text-chrome-400">
        Describe the comment style and whose posts to comment on. The worker scans matching posts,
        the AI drafts a comment per match, and every draft waits in the Approval Queue. Nothing
        posts until you approve it.
      </p>
      <CampaignForm
        action={stageCommentCampaign}
        submitLabel="Stage for launch"
        fields={[
          {
            name: 'brief',
            label: 'The type of comment',
            kind: 'textarea',
            required: true,
            placeholder: 'Short, supportive comments that add one concrete observation.',
          },
          {
            name: 'audience',
            label: 'To whom (whose posts)',
            kind: 'textarea',
            placeholder: 'Founders posting about AI agents and automation',
            help: 'Leave empty to scan your feed instead of a content search.',
          },
          {
            name: 'max_comments',
            label: 'Number of comments',
            kind: 'number',
            min: 1,
            max: 20,
            defaultValue: 5,
            limitAction: 'comment',
          },
        ]}
      />
      <CampaignList
        heading="Comment campaigns"
        items={rows.map((r) => ({
          id: r.id,
          title: r.brief.slice(0, 100),
          subtitle: `${r.audience ? `on: ${r.audience.slice(0, 70)}` : 'on: your feed'} · up to ${r.max_comments}`,
          status: r.status,
          queued: r.queued_count,
          lastError: r.last_error,
        }))}
      />
    </PanelShell>
  );
}
