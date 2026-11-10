/**
 * Worker ops CLI (stub). Future commands (plan §5, §10):
 *   rotate-key   — re-encrypt all `secrets` rows under a new master key
 *   force-logout — clear the browser session and mark the account logged_out
 *   run-connector <name> — run one job-board connector once
 */
const [, , cmd] = process.argv;

switch (cmd) {
  case 'rotate-key':
  case 'force-logout':
  case 'run-connector':
    console.log(`[worker-cli] "${cmd}" is not implemented yet (scaffold).`);
    break;
  default:
    console.log('Usage: worker-cli <rotate-key|force-logout|run-connector>');
}
