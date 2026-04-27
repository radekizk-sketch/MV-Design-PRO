import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ACTIVE_SHELL_FILES = [
  ['active-case-bar', 'ActiveCaseBar.tsx'],
  ['workspace', 'WorkspaceOperationalBar.tsx'],
  ['workspace', 'WorkspaceSurfaceRouter.tsx'],
  ['workspace', 'types.ts'],
  ['navigation', 'routes.ts'],
  ['shell', 'AppShellV12.tsx'],
] as const;

const FORBIDDEN_ACTIVE_LABELS = [
  'Aktywny przypadek',
  'Zmien przypadek',
  'Uruchomienie:',
  'Aktywna migawka',
  'Aktywny wariant',
  'Kontekst przypadku',
  'Warianty i uruchomienia',
  'Historia uruchomien',
  'Porownanie wariantow',
];

describe('active shell terminology', () => {
  it('keeps forbidden legacy labels out of the active shell files', () => {
    const uiDir = join(__dirname, '..');

    for (const [dirName, fileName] of ACTIVE_SHELL_FILES) {
      const source = readFileSync(join(uiDir, dirName, fileName), 'utf-8');
      for (const label of FORBIDDEN_ACTIVE_LABELS) {
        expect(source).not.toContain(label);
      }
    }
  });
});
