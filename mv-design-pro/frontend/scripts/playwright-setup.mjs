import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolveChromiumExecutable } from './playwright-env.mjs';

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: 'inherit', encoding: 'utf-8' });
}

function ensureProjectDependenciesInstalled() {
  if (fs.existsSync('./node_modules/@playwright/test')) {
    return;
  }

  console.log('[playwright-setup] Brak node_modules/@playwright/test — instaluję zależności projektu (npm ci)...');
  const install = run('npm', ['ci']);
  if (install.status !== 0) {
    console.error('[playwright-setup] Nie udało się zainstalować zależności npm.');
    process.exit(install.status ?? 1);
  }
}

function installPlaywrightChromium() {
  const localPlaywright = process.platform === 'win32'
    ? '.\\node_modules\\.bin\\playwright.cmd'
    : './node_modules/.bin/playwright';
  if (!fs.existsSync(localPlaywright)) {
    return { status: 1 };
  }
  if (process.platform === 'win32') {
    return run('cmd', ['/d', '/s', '/c', localPlaywright, 'install', '--with-deps', 'chromium']);
  }
  return run(localPlaywright, ['install', '--with-deps', 'chromium']);
}

const existing = resolveChromiumExecutable();
if (existing) {
  console.log(`[playwright-setup] Wykryto lokalną przeglądarkę: ${existing}`);
  process.exit(0);
}

ensureProjectDependenciesInstalled();

console.log('[playwright-setup] Brak lokalnej przeglądarki — próba instalacji Playwright Chromium...');
const install = installPlaywrightChromium();
if (install.status === 0) {
  const resolved = resolveChromiumExecutable();
  if (resolved) {
    console.log(`[playwright-setup] Gotowe. Wykryta przeglądarka: ${resolved}`);
    process.exit(0);
  }
}

console.log('[playwright-setup] Instalacja z CDN nie powiodła się. Próba instalacji Google Chrome (APT)...');
if (process.platform === 'win32') {
  console.error('[playwright-setup] Nie udalo sie zainstalowac Playwright Chromium na Windows.');
  process.exit(install.status ?? 1);
}

const sudoPrefix = typeof process.getuid === 'function' && process.getuid() === 0 ? '' : 'sudo ';

const apt = run('bash', ['-lc', [
  'set -e',
  `if [ ! -f /usr/share/keyrings/google-linux.gpg ]; then wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor | ${sudoPrefix}tee /usr/share/keyrings/google-linux.gpg >/dev/null; fi`,
  `${sudoPrefix}bash -lc "echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main' > /etc/apt/sources.list.d/google-chrome.list"`,
  `${sudoPrefix}apt-get update -o Acquire::Retries=3`,
  `${sudoPrefix}apt-get install -y google-chrome-stable`,
].join(' && ')]);

if (apt.status !== 0) {
  console.error('[playwright-setup] Nie udało się zainstalować przeglądarki fallback.');
  process.exit(apt.status ?? 1);
}

const afterApt = resolveChromiumExecutable();
if (!afterApt) {
  console.error('[playwright-setup] Instalacja zakończona, ale brak wykrytej binarki browsera.');
  process.exit(1);
}

console.log(`[playwright-setup] Gotowe. Wykryta przeglądarka: ${afterApt}`);
