import { createClient } from '@supabase/supabase-js';
import { collectEnv } from './env.ts';

const E2E_PREFIX = '[E2E]';

/**
 * Best-effort cleanup: delete every campaign row the suite created (anything
 * whose user-entered text starts with "[E2E]") plus any jobs it queued, so
 * repeated runs never pile up drafts that a later real START would launch.
 * Uses the worker's service key (local file, never committed); if it is not
 * available the cleanup is skipped with a warning.
 */
export default async function globalTeardown(): Promise<void> {
  const env = collectEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.warn('[e2e teardown] no service key available; skipping [E2E] row cleanup');
    return;
  }
  const app = createClient(url, serviceKey, { db: { schema: 'app' } });
  const targets: Array<{ table: string; column: string }> = [
    { table: 'campaigns', column: 'query' },
    { table: 'message_campaigns', column: 'brief' },
    { table: 'like_campaigns', column: 'criteria' },
    { table: 'post_campaigns', column: 'brief' },
    { table: 'comment_campaigns', column: 'brief' },
  ];
  for (const t of targets) {
    const { error, count } = await app
      .from(t.table)
      .delete({ count: 'exact' })
      .like(t.column, `${E2E_PREFIX}%`);
    if (error) console.warn(`[e2e teardown] ${t.table}: ${error.message}`);
    else if (count) console.log(`[e2e teardown] ${t.table}: removed ${count} [E2E] row(s)`);
  }
}
