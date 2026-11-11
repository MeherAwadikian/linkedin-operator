// Publish the worker's current public tunnel URL into app.worker_endpoints so the
// web app can reach it without any Cloudflare dashboard edit.
// Run: node --env-file=apps/worker/.env setup/publish-endpoint.mjs <public_url>
import { createClient } from '@supabase/supabase-js';

const url = process.argv[2];
if (!url) {
  console.error('usage: publish-endpoint.mjs <public_url>');
  process.exit(1);
}
const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supaUrl || !key) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in apps/worker/.env');
  process.exit(1);
}
const sb = createClient(supaUrl, key, { auth: { persistSession: false }, db: { schema: 'app' } });
const workerId = process.env.WORKER_ID || 'worker-local';
const { error } = await sb
  .from('worker_endpoints')
  .upsert({ worker_id: workerId, public_url: url, updated_at: new Date().toISOString() });
if (error) {
  console.error('publish failed:', error.message);
  process.exit(1);
}
console.log('published worker endpoint:', workerId, '->', url);
