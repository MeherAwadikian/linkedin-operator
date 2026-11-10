/**
 * Worker ops CLI. Commands:
 *   generate-key  — print a fresh base64 VAULT_MASTER_KEY for first-time setup
 *   rotate-key    — (todo) re-encrypt all `secrets` rows under a new master key
 *   force-logout  — (todo) clear the browser session, mark the account logged_out
 *   run-connector — (todo) run one job-board connector once
 */
import { generateMasterKey } from '@lo/core';

const [, , cmd] = process.argv;

switch (cmd) {
  case 'generate-key':
    // Printed, not logged — the operator copies this into the worker .env once.
    process.stdout.write(`${generateMasterKey()}\n`);
    break;
  case 'rotate-key':
  case 'force-logout':
  case 'run-connector':
    console.log(`[worker-cli] "${cmd}" is not implemented yet.`);
    break;
  default:
    console.log('Usage: worker-cli <generate-key|rotate-key|force-logout|run-connector>');
}
