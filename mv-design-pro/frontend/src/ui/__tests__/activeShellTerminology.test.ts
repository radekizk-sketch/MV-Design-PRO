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

const ACTIVE_TOP_MENU_FILES = [
  ['shell', 'AppShellV12.tsx'],
  ['shell', 'TopBar.tsx'],
  ['shell', 'NavigationRail.tsx'],
] as const;

const FORBIDDEN_ACTIVE_LABELS = [
  'Aktywny przypadek',
  'Zmień przypadek',
  'Uruchomienie:',
  'Aktywna migawka',
  'Aktywny wariant',
  'Kontekst przypadku',
  'Warianty i uruchomienia',
  'Przebiegi obliczeń',
  'Historia uruchomień',
  'Stan uruchomienia',
  'Id migawki',
  'Porównanie wariantów',
];

const FORBIDDEN_LEGACY_TOP_MENU_LABELS = [
  'Plik',
  'Widok',
  'Obliczenia',
  'Narzedzia',
  'Narzędzia',
  'Pomoc',
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

  it('keeps the removed legacy top menu labels out of the active top shell', () => {
    const uiDir = join(__dirname, '..');

    for (const [dirName, fileName] of ACTIVE_TOP_MENU_FILES) {
      const source = readFileSync(join(uiDir, dirName, fileName), 'utf-8');
      for (const label of FORBIDDEN_LEGACY_TOP_MENU_LABELS) {
        expect(source).not.toContain(label);
      }
    }
  });
});
