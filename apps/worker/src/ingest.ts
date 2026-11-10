import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Redactor, secretsEqual, type SecretKind } from '@lo/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { storeSecret } from './secrets-store.ts';

const ALLOWED_KINDS: readonly SecretKind[] = [
  'linkedin_password',
  'gmail_password',
  'anthropic_key',
  'openrouter_key',
  'deepseek_key',
];
const MAX_BODY = 64 * 1024;

export interface IngestConfig {
  sb: SupabaseClient;
  masterKey: Buffer;
  /** Shared token the web tier must present (compared in constant time). */
  token: string;
  port: number;
  redactor: Redactor;
  log: (event: string, data?: Record<string, unknown>) => void;
}

/**
 * Localhost-only ingest endpoint. The web tier POSTs a just-entered secret here;
 * the worker (the only holder of the master key) encrypts it and stores it. The
 * plaintext value is registered with the redactor and never logged. Bound to
 * 127.0.0.1 so nothing off-machine can reach it; still token-gated.
 */
export function startIngestServer(cfg: IngestConfig): Server {
  const server = createServer((req, res) => {
    void handle(req, res, cfg).catch((err: unknown) => {
      cfg.log('worker.ingest_error', {
        message: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  server.listen(cfg.port, '127.0.0.1', () => {
    cfg.log('worker.ingest_listening', { port: cfg.port, host: '127.0.0.1' });
  });
  return server;
}

async function handle(req: IncomingMessage, res: ServerResponse, cfg: IngestConfig): Promise<void> {
  if (req.method !== 'POST' || req.url !== '/store-secret') {
    res.writeHead(404);
    res.end();
    return;
  }

  const presented = req.headers['x-ingest-token'];
  if (typeof presented !== 'string' || !secretsEqual(presented, cfg.token)) {
    res.writeHead(401);
    res.end();
    return;
  }

  const body = await readBody(req);
  const parsed = JSON.parse(body) as { userId?: string; kind?: string; value?: string };
  const { userId, kind, value } = parsed;

  if (!userId || !value || !kind || !ALLOWED_KINDS.includes(kind as SecretKind)) {
    res.writeHead(400);
    res.end('bad request');
    return;
  }

  cfg.redactor.register(value); // never let the plaintext reach a log
  await storeSecret(cfg.sb, cfg.masterKey, userId, kind as SecretKind, value);
  cfg.log('worker.secret_stored', { userId, kind }); // value is NOT logged

  res.writeHead(204);
  res.end();
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
