import fs from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);

const WINDOWS_CHROMIUM_BINARIES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const POSIX_CHROMIUM_BINARIES = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
];

const CANDIDATE_BINARIES = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  process.env.PW_CHROMIUM_EXECUTABLE,
  ...(process.platform === 'win32' ? WINDOWS_CHROMIUM_BINARIES : POSIX_CHROMIUM_BINARIES),
].filter(Boolean);

const CHROMIUM_VERSION_TIMEOUT_MS = Number.parseInt(
  process.env.PLAYWRIGHT_CHROMIUM_VERSION_TIMEOUT_MS ?? '5000',
  10,
);

function resolveBundledPlaywrightChromium() {
  try {
    const playwright = require('playwright');
    return playwright.chromium?.executablePath?.() ?? null;
  } catch {
    return null;
  }
}

function commandExists(cmd) {
  if (process.platform === 'win32') {
    const result = spawnSync('where', [cmd], {
      encoding: 'utf-8',
      timeout: CHROMIUM_VERSION_TIMEOUT_MS,
      windowsHide: true,
    });
    return result.status === 0 ? result.stdout.split(/\r?\n/).find(Boolean)?.trim() ?? null : null;
  }

  const result = spawnSync('bash', ['-lc', `command -v ${cmd}`], {
    encoding: 'utf-8',
    timeout: CHROMIUM_VERSION_TIMEOUT_MS,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function isUsableExecutable(path) {
  if (!path) return false;
  if (!fs.existsSync(path)) return false;
  try {
    fs.accessSync(path, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
    const output = spawnSync(path, ['--version'], {
      encoding: 'utf-8',
      timeout: CHROMIUM_VERSION_TIMEOUT_MS,
      windowsHide: true,
    });
    return output.status === 0;
  } catch {
    return false;
  }
}

function isExistingExecutable(path) {
  if (!path) return false;
  if (!fs.existsSync(path)) return false;
  try {
    fs.accessSync(path, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveChromiumExecutable() {
  const bundled = resolveBundledPlaywrightChromium();
  if (isExistingExecutable(bundled)) {
    return bundled;
  }

  for (const candidate of CANDIDATE_BINARIES) {
    if (isUsableExecutable(candidate)) {
      return candidate;
    }
  }

  const discovered = [
    commandExists('google-chrome-stable'),
    commandExists('google-chrome'),
    commandExists('chromium'),
    commandExists('chromium-browser'),
    commandExists('chrome'),
    commandExists('msedge'),
  ];

  for (const candidate of discovered) {
    if (isUsableExecutable(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function getPlaywrightEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  const executablePath = resolveChromiumExecutable();
  if (executablePath) {
    env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = executablePath;
  }
  return env;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const executablePath = resolveChromiumExecutable();
  if (executablePath) {
    console.log(executablePath);
    process.exit(0);
  }
  process.exit(1);
}
