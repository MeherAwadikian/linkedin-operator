-- Store encrypted blobs as base64 TEXT rather than bytea. The vault
-- (packages/core/vault.ts) already emits base64 strings, and TEXT round-trips
-- cleanly through PostgREST/supabase-js, whereas bytea does not. The ciphertext
-- is equally opaque either way. Tables are empty at this point, so the USING
-- conversions are no-ops.

alter table app.secrets
  alter column ciphertext type text using encode(ciphertext, 'base64'),
  alter column iv         type text using encode(iv, 'base64'),
  alter column auth_tag   type text using encode(auth_tag, 'base64');

alter table app.browser_sessions
  alter column storage_state_ciphertext type text using encode(storage_state_ciphertext, 'base64'),
  alter column iv         type text using encode(iv, 'base64'),
  alter column auth_tag   type text using encode(auth_tag, 'base64');
