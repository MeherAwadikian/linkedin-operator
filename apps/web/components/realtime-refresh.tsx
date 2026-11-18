'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createClient } from '../lib/supabase/client.ts';

/** Tables exposed over Supabase Realtime (must stay in sync with the realtime publication). */
export type RealtimeTable =
  | 'jobs_queue'
  | 'accounts'
  | 'people'
  | 'command_sessions'
  | 'campaigns'
  | 'email_campaigns'
  | 'post_campaigns'
  | 'like_campaigns'
  | 'message_campaigns'
  | 'comment_campaigns';

const ALL_TABLES: RealtimeTable[] = [
  'jobs_queue',
  'accounts',
  'people',
  'command_sessions',
  'campaigns',
  'email_campaigns',
  'post_campaigns',
  'like_campaigns',
  'message_campaigns',
  'comment_campaigns',
];

/**
 * Live refresh (plan §2). Subscribes to Realtime changes on the given tables and
 * re-fetches the current route's server components when they change, so job
 * status / collected people / campaign status update without a reload. RLS
 * applies to Realtime, so only the owner's rows are received.
 *
 * Two deliberate constraints keep this from thrashing the page:
 * - `tables` scopes the subscription to only what the page renders. Subscribing
 *   every page to all 8 tables meant an unrelated change (e.g. a campaign the
 *   worker is drafting) refetched pages that don't show it, including while the
 *   operator was typing into a form on the Console.
 * - `router.refresh()` is debounced, so a burst of row changes (e.g. collecting
 *   50 people in one campaign) coalesces into a single refetch instead of firing
 *   one full server refetch per row.
 */
export function RealtimeRefresh({
  tables = ALL_TABLES,
  debounceMs = 600,
}: {
  tables?: RealtimeTable[];
  debounceMs?: number;
}) {
  const router = useRouter();
  // Derive a stable primitive key so a fresh array identity on each render does
  // not tear down and re-subscribe the channel every time.
  const tablesKey = Array.from(new Set(tables)).sort().join(',');

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`refresh:${tablesKey}`);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, debounceMs);
    };

    for (const table of tablesKey.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'app', table }, scheduleRefresh);
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [router, tablesKey, debounceMs]);

  return null;
}
