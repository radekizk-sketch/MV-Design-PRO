import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { getPlaywrightEnv, resolveChromiumExecutable } from './playwright-env.mjs';

function withTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`;
}

const env = getPlaywrightEnv();
if (!env.PLAYWRIGHT_REAL_BACKEND) {
  env.PLAYWRIGHT_REAL_BACKEND = '1';
}
if (!env.PLAYWRIGHT_BACKEND_URL) {
  env.PLAYWRIGHT_BACKEND_URL = 'http://127.0.0.1:8000';
}
if (!env.PLAYWRIGHT_BACKEND_HEALTH_URL) {
  env.PLAYWRIGHT_BACKEND_HEALTH_URL = new URL('/ready', withTrailingSlash(env.PLAYWRIGHT_BACKEND_URL)).toString();
}
if (!env.PLAYWRIGHT_FRONTEND_URL) {
  env.PLAYWRIGHT_FRONTEND_URL = 'http://127.0.0.1:5173';
}
if (!env.VITE_API_URL_DEV) {
  env.VITE_API_URL_DEV = env.PLAYWRIGHT_BACKEND_URL;
}
if (!env.VITE_API_URL) {
  env.VITE_API_URL = env.PLAYWRIGHT_BACKEND_URL;
}

const executable = resolveChromiumExecutable();
if (!executable) {
  console.error('[playwright-run] Brak wykrytej przeglądarki. Uruchom: npm run test:e2e:setup');
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
const playwrightCliPath = resolve('./node_modules/playwright/cli.js');
const result = spawnSync(
  process.execPath,
  [playwrightCliPath, 'test', ...extraArgs],
  {
    stdio: 'inherit',
    env,
  },
);
if (result.error) {
  console.error('[playwright-run] Nie udało się uruchomić Playwrighta:', result.error.message);
}
process.exit(result.status ?? 1);
