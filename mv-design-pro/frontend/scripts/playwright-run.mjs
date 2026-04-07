import { spawnSync } from 'node:child_process';
import { getPlaywrightEnv, resolveChromiumExecutable } from './playwright-env.mjs';

const env = getPlaywrightEnv();
const executable = resolveChromiumExecutable();
if (!executable) {
  console.error('[playwright-run] Brak wykrytej przeglądarki. Uruchom: npm run test:e2e:setup');
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
const runnerCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  runnerCommand,
  ['playwright', 'test', ...extraArgs],
  {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  },
);

if (result.error) {
  console.error('[playwright-run] Nie udalo sie uruchomic Playwright:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
