'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createClient } from '../lib/supabase/client.ts';

/**
 * Live dashboard refresh (plan §2). Subscribes to Realtime changes on the
 * tables the dashboard shows and re-fetches the server component on any change,
 * so job status / collected people / account status update without a reload.
 * RLS applies to Realtime, so only the owner's rows are received.
 */
export function RealtimeRefresh() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel('dashboard');
    for (const table of ['jobs_queue', 'accounts', 'people']) {
      channel.on('postgres_changes', { event: '*', schema: 'app', table }, () => router.refresh());
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);
  return null;
}
