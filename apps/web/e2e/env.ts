import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Minimal .env parser (KEY=VALUE lines, # comments). No dotenv dep needed. */
export function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const WEB_DIR = join(import.meta.dirname, '..');
const REPO_ROOT = join(WEB_DIR, '..', '..');

export const KEYS_REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'OPERATOR_EMAIL',
  'OPERATOR_PASSWORD',
] as const;

/**
 * Assemble the dev-server env for e2e runs. Priority: real process env, then
 * apps/web/.env.local, then apps/worker/.env (has the Supabase URL and the
 * service key used for [E2E] row cleanup), then the repo root
 * .env.operator-login (the no-login operator credentials).
 */
export function collectEnv(): Record<string, string> {
  const webLocal = parseEnvFile(join(WEB_DIR, '.env.local'));
  const worker = parseEnvFile(join(REPO_ROOT, 'apps', 'worker', '.env'));
  const operator = parseEnvFile(join(REPO_ROOT, '.env.operator-login'));

  const merged: Record<string, string> = { ...operator, ...worker, ...webLocal };
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string' && v) merged[k] = v;
  }
  return merged;
}

/** Names of required keys that are still missing (for a clear skip/fail message). */
export function missingEnv(env: Record<string, string>): string[] {
  return KEYS_REQUIRED.filter((k) => !env[k]);
}
