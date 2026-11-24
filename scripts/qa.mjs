#!/usr/bin/env node
/**
 * `pnpm qa` - the whole-product QA gate.
 *
 * Runs, in order:
 *   1. pnpm typecheck      (all workspaces)
 *   2. pnpm test           (all unit tests)
 *   3. Playwright e2e      (apps/web, against a local dev server)
 * then prints a per-control PASS/FAIL summary parsed from the Playwright JSON
 * report. Exit code is non-zero if any stage fails.
 *
 * The e2e stage needs env for the dev server (Supabase URL/anon key and the
 * operator login; see apps/web/QA.md). When that env is missing the stage is
 * reported as SKIP with the reason, and qa still fails typecheck/unit errors.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const RESULTS = join(ROOT, 'apps', 'web', 'test-results', 'e2e-results.json');

const bold = (s) => `[1m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const red = (s) => `[31m${s}[0m`;
const yellow = (s) => `[33m${s}[0m`;

function run(label, cmd, args, opts = {}) {
  console.log(`\n${bold(`=== ${label} ===`)}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true, ...opts });
  return r.status === 0;
}

function parseEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function e2eEnvReady() {
  const merged = {
    ...parseEnvFile(join(ROOT, '.env.operator-login')),
    ...parseEnvFile(join(ROOT, 'apps', 'worker', '.env')),
    ...parseEnvFile(join(ROOT, 'apps', 'web', '.env.local')),
    ...process.env,
  };
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'OPERATOR_EMAIL',
    'OPERATOR_PASSWORD',
  ];
  const missing = required.filter((k) => !merged[k]);
  return { ok: missing.length === 0, missing };
}

/** Flatten the Playwright JSON report into [{title, status}]. */
function collectControls(node, out = []) {
  for (const suite of node.suites ?? []) collectControls(suite, out);
  for (const spec of node.specs ?? []) {
    const results = (spec.tests ?? []).flatMap((t) => t.results ?? []);
    const statuses = (spec.tests ?? []).map((t) => t.status);
    const skipped =
      statuses.every((s) => s === 'skipped') || results.every((r) => r.status === 'skipped');
    out.push({ title: spec.title, status: spec.ok ? (skipped ? 'SKIP' : 'PASS') : 'FAIL' });
  }
  return out;
}

const summary = [];
let failed = false;

// 1 + 2: typecheck and unit tests across the workspace.
for (const [label, args] of [
  ['Typecheck (pnpm typecheck)', ['typecheck']],
  ['Unit tests (pnpm test)', ['test']],
]) {
  const ok = run(label, PNPM, args);
  summary.push({ title: label, status: ok ? 'PASS' : 'FAIL' });
  if (!ok) failed = true;
}

// 3: e2e.
const envCheck = e2eEnvReady();
if (!envCheck.ok) {
  console.log(`\n${bold('=== E2E (Playwright) ===')}`);
  console.log(
    yellow(
      `SKIP: missing env for the dev server: ${envCheck.missing.join(', ')}\n` +
        'See apps/web/QA.md ("Environment") to enable the e2e stage.',
    ),
  );
  summary.push({ title: 'E2E suite (dev server env missing)', status: 'SKIP' });
} else {
  // The suite drives the installed Google Chrome by default (no download).
  // Only when E2E_BROWSER_CHANNEL="" (bundled Chromium) is an install needed.
  if (process.env.E2E_BROWSER_CHANNEL === '') {
    run('E2E browsers (playwright install chromium)', PNPM, [
      '--filter',
      '@lo/web',
      'exec',
      'playwright',
      'install',
      'chromium',
    ]);
  }
  const ok = run('E2E (Playwright)', PNPM, ['--filter', '@lo/web', 'test:e2e']);
  if (!ok) failed = true;
  try {
    const report = JSON.parse(readFileSync(RESULTS, 'utf8'));
    summary.push(...collectControls(report));
  } catch {
    summary.push({ title: 'E2E suite (no JSON report produced)', status: ok ? 'PASS' : 'FAIL' });
  }
}

// Per-control summary.
console.log(`\n${bold('=== QA summary (per control) ===')}`);
const width = Math.min(Math.max(...summary.map((s) => s.title.length)) + 2, 76);
for (const s of summary) {
  const mark =
    s.status === 'PASS' ? green('PASS') : s.status === 'SKIP' ? yellow('SKIP') : red('FAIL');
  console.log(`  ${s.title.slice(0, 74).padEnd(width)} ${mark}`);
}
const counts = summary.reduce((acc, s) => ((acc[s.status] = (acc[s.status] ?? 0) + 1), acc), {});
console.log(
  `\n  ${green(`${counts.PASS ?? 0} passed`)}, ${red(`${counts.FAIL ?? 0} failed`)}, ${yellow(
    `${counts.SKIP ?? 0} skipped`,
  )}\n`,
);
process.exit(failed ? 1 : 0);
