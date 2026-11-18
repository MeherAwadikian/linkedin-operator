import { redirect } from 'next/navigation';
import { stageLikeCampaign } from './actions.ts';
import { CampaignForm } from '../../../components/panel/campaign-form.tsx';
import { CampaignList } from '../../../components/panel/campaign-list.tsx';
import { PanelShell } from '../../../components/panel/panel-shell.tsx';
import { RealtimeRefresh } from '../../../components/realtime-refresh.tsx';
import { createClient } from '../../../lib/supabase/server.ts';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  criteria: string;
  max_likes: number;
  status: string;
  queued_count: number;
  last_error: string | null;
}

export default async function LikeCampaignPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .schema('app')
    .from('like_campaigns')
    .select('id,criteria,max_likes,status,queued_count,last_error')
    .order('created_at', { ascending: false })
    .limit(20);
  const rows = (data ?? []) as Row[];

  return (
    <PanelShell email={user.email ?? 'signed in'} active="/panel/like">
      <RealtimeRefresh tables={['like_campaigns']} />
      <h1 className="mb-1 text-2xl font-black uppercase italic tracking-widest text-rod-500">
        Like campaign
      </h1>
      <p className="mb-8 max-w-2xl text-sm text-chrome-400">
        Describe whose posts to like. The worker scans your feed, the AI judges each post against
        your criteria, and matching posts are liked under the standing rate limit.
      </p>
      <CampaignForm
        action={stageLikeCampaign}
        submitLabel="Stage for launch"
        fields={[
          {
            name: 'criteria',
            label: 'Whom to like',
            kind: 'textarea',
            required: true,
            placeholder: 'Posts from founders and operators about AI automation wins',
          },
          {
            name: 'max_likes',
            label: 'Number of likes',
            kind: 'number',
            min: 1,
            max: 30,
            defaultValue: 10,
            limitAction: 'like',
          },
        ]}
      />
      <CampaignList
        heading="Like campaigns"
        items={rows.map((r) => ({
          id: r.id,
          title: r.criteria.slice(0, 100),
          subtitle: `up to ${r.max_likes} likes`,
          status: r.status,
          queued: r.queued_count,
          lastError: r.last_error,
        }))}
      />
    </PanelShell>
  );
}
