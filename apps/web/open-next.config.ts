import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Default OpenNext-on-Cloudflare config. Caching can be added later (R2/KV/D1);
// the app is fine with the in-memory default for a single-operator deployment.
export default defineCloudflareConfig();
