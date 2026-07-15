import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SHELL_DIR = join(process.cwd(), 'src', 'ui2', 'shell');
const THEME_DIR = join(process.cwd(), 'src', 'ui2', 'theme');

const TOKENS_CSS = readFileSync(join(THEME_DIR, 'tokens.css'), 'utf8');

const SHELL_TSX_FILES = [
  'AppShell.tsx',
  'TitleBar.tsx',
  'CaseBar.tsx',
  'PanelLayout.tsx',
  'StatusBar.tsx',
  'ModeSwitch.tsx',
  'SpaceNav.tsx',
];

function themeBlock(theme: string): string {
  const match = TOKENS_CSS.match(new RegExp(`\\[data-theme="${theme}"\\][^{]*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Brak bloku motywu: ${theme}`);
  return match[1];
}

function tokenKeys(body: string): Set<string> {
  return new Set([...body.matchAll(/(--mvd-[\w-]+)\s*:/g)].map((m) => m[1]));
}

function tokenValue(theme: string, name: string): string {
  const match = themeBlock(theme).match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (!match) throw new Error(`Brak tokenu ${name} w motywie ${theme}`);
  return match[1].trim();
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe('tokens.css — parytet motywów', () => {
  it('oba motywy definiują identyczny zbiór kluczy --mvd-*', () => {
    const light = tokenKeys(themeBlock('light_technical'));
    const dark = tokenKeys(themeBlock('dark_scada'));
    expect(light.size).toBeGreaterThan(10);
    expect([...light].sort()).toEqual([...dark].sort());
  });

  it('każdy motyw definiuje kluczowe tokeny powłoki', () => {
    const required = ['--mvd-bg', '--mvd-panel', '--mvd-ink', '--mvd-accent', '--mvd-accent-ink', '--mvd-focus'];
    const light = tokenKeys(themeBlock('light_technical'));
    const dark = tokenKeys(themeBlock('dark_scada'));
    for (const token of required) {
      expect(light.has(token)).toBe(true);
      expect(dark.has(token)).toBe(true);
    }
  });
});

describe('tokens — kontrast par tło/tekst ≥ AA', () => {
  for (const theme of ['light_technical', 'dark_scada']) {
    it(`${theme}: tekst podstawowy na tle i panelu ≥ 4.5`, () => {
      const bg = tokenValue(theme, '--mvd-bg');
      const panel = tokenValue(theme, '--mvd-panel');
      const ink = tokenValue(theme, '--mvd-ink');
      const muted = tokenValue(theme, '--mvd-muted');
      expect(contrastRatio(bg, ink)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(panel, ink)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(bg, muted)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${theme}: etykieta akcentu (przycisk główny) ≥ 3.0`, () => {
      const accent = tokenValue(theme, '--mvd-accent');
      const accentInk = tokenValue(theme, '--mvd-accent-ink');
      // Próg dla tekstu pogrubionego/komponentów UI (WCAG large text / non-text 3.0).
      expect(contrastRatio(accent, accentInk)).toBeGreaterThanOrEqual(3.0);
    });
  }
});

describe('komponenty powłoki — brak literałów hex w .tsx (tylko var(--mvd-*))', () => {
  for (const file of SHELL_TSX_FILES) {
    it(`${file} nie zawiera koloru hex`, () => {
      const source = readFileSync(join(SHELL_DIR, file), 'utf8');
      const hexMatches = source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(hexMatches).toEqual([]);
    });
  }
});
