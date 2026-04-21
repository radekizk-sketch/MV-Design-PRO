import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);

if (argv.length === 0) {
  console.error('Brak ścieżki do skryptu Pythona.');
  process.exit(1);
}

const candidates = [];

if (process.env.PYTHON) {
  candidates.push([process.env.PYTHON]);
}

candidates.push(
  ['py', '-3.11'],
  ['py'],
  ['python'],
  ['python3'],
);

let lastError = null;

for (const [command, ...prefixArgs] of candidates) {
  const result = spawnSync(command, [...prefixArgs, ...argv], {
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
    },
  });
  if (!result.error) {
    process.exit(result.status ?? 0);
  }
  lastError = result.error;
}

console.error('Nie znaleziono interpretera Python do uruchomienia strażnika repo.');
if (lastError) {
  console.error(lastError.message);
}
process.exit(1);
