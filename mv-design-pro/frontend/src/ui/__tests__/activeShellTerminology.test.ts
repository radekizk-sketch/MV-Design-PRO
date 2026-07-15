import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// E1.7c: aktywna powłoka = ui2 (AppShell/CaseBar/strings) + aktywne
// powierzchnie legacy; stara rama (AppShellV12/TopBar/NavigationRail)
// została skasowana.
const ACTIVE_SHELL_FILES = [
  ['workspace', 'WorkspaceOperationalBar.tsx'],
  ['workspace', 'WorkspaceSurfaceRouter.tsx'],
  ['workspace', 'types.ts'],
  ['navigation', 'routes.ts'],
  ['../ui2/shell', 'AppShell.tsx'],
  ['../ui2/shell', 'CaseBar.tsx'],
  ['../ui2/shell', 'strings.ts'],
] as const;

// „Widok" (menu widoku powłoki, karta E1.1) i „Obliczenia" (nazwa przestrzeni
// roboczej) są kanonicznymi elementami nowej powłoki — zakaz dotyczy
// wskrzeszania okienkowego menu starego typu (Plik/Narzędzia/Pomoc).
const ACTIVE_TOP_MENU_FILES = [
  ['../ui2/shell', 'AppShell.tsx'],
  ['../ui2/shell', 'TitleBar.tsx'],
  ['../ui2/shell', 'SpaceNav.tsx'],
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
  'Wyniki nieuruchomione',
  'do uruchomienia',
  'Id migawki',
  'Porównanie wariantów',
];

const FORBIDDEN_LEGACY_TOP_MENU_LABELS = [
  'Plik',
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
