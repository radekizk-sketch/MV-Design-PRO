/**
 * KD-8 poz. 1 + poz. 3 — KONTRAKT TOKENÓW POWIERZCHNI (`--scada-*`).
 *
 * Paleta Tailwinda `scada-*`/`sygnal-*` czyta WYŁĄCZNIE zmienne CSS deklarowane
 * per motyw w `src/index.css`. Ten test pilnuje trzech rzeczy naraz:
 *  1. PARYTET — oba motywy deklarują identyczny zbiór tokenów (brak tokenu w
 *     jednym motywie = powierzchnia, która przy przełączeniu zostaje w drugim);
 *  2. KONTRAST — pary tło/tekst i pary komunikatów ≥ 4,5:1 w OBU motywach;
 *  3. BRAK LITERAŁÓW — konfiguracja Tailwinda nie wraca do wartości hex,
 *     a arkusz globalny nie odtwarza lokalnych stałych koloru.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const INDEX_CSS = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');
const TAILWIND_CONFIG = readFileSync(join(process.cwd(), 'tailwind.config.js'), 'utf8');

function blokMotywu(theme: string): string {
  const match = INDEX_CSS.match(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([\\s\\S]*?)\\n  \\}`));
  if (!match) throw new Error(`Brak bloku motywu: ${theme}`);
  return match[1];
}

function tokeny(body: string): ReadonlyMap<string, string> {
  return new Map(
    [...body.matchAll(/(--scada-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

const DARK = tokeny(blokMotywu('dark_scada'));
const LIGHT = tokeny(blokMotywu('light_technical'));

function rgbTokenu(mapa: ReadonlyMap<string, string>, nazwa: string): [number, number, number] {
  const raw = mapa.get(nazwa);
  if (raw === undefined) throw new Error(`Brak tokenu ${nazwa}`);
  const parts = raw.split(/\s+/).map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`Token ${nazwa} nie jest trójką RGB: „${raw}"`);
  }
  return parts as [number, number, number];
}

function luminancja(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb
    .map((v) => v / 255)
    .map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function kontrast(mapa: ReadonlyMap<string, string>, a: string, b: string): number {
  const la = luminancja(rgbTokenu(mapa, a));
  const lb = luminancja(rgbTokenu(mapa, b));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const MOTYWY = [
  ['dark_scada', DARK],
  ['light_technical', LIGHT],
] as const;

describe('tokeny powierzchni — parytet motywów', () => {
  it('oba motywy deklarują identyczny zbiór tokenów --scada-*', () => {
    expect([...LIGHT.keys()].sort()).toEqual([...DARK.keys()].sort());
    expect(DARK.size).toBeGreaterThan(20);
  });

  it('każdy token koloru jest TRÓJKĄ RGB (wymóg modyfikatorów alfa Tailwinda)', () => {
    for (const [nazwa, mapa] of MOTYWY) {
      for (const [token, wartosc] of mapa) {
        if (token.startsWith('--scada-shadow')) continue;
        expect(wartosc, `${nazwa} ${token}`).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      }
    }
  });

  it('paleta Tailwinda czyta tokeny, nie literały hex', () => {
    const blok = TAILWIND_CONFIG.slice(
      TAILWIND_CONFIG.indexOf("'scada': {"),
      TAILWIND_CONFIG.indexOf("fontFamily"),
    );
    expect(blok.length).toBeGreaterThan(200);
    expect(blok.match(/#[0-9A-Fa-f]{3,8}/g) ?? []).toEqual([]);
    expect(blok).toContain('rgb(var(--scada-bg) / <alpha-value>)');
  });
});

describe('tokeny powierzchni — kontrast tekstu (≥ 4,5:1 w obu motywach)', () => {
  const PARY: readonly (readonly [string, string])[] = [
    ['--scada-text', '--scada-bg'],
    ['--scada-text', '--scada-surface'],
    ['--scada-text', '--scada-panel'],
    ['--scada-text', '--scada-panel-raised'],
    ['--scada-muted', '--scada-bg'],
    ['--scada-muted', '--scada-surface'],
    ['--scada-muted', '--scada-panel'],
    ['--scada-sn', '--scada-panel'],
    ['--scada-nn', '--scada-panel'],
    ['--scada-wn', '--scada-panel'],
    ['--scada-energized', '--scada-panel'],
    ['--scada-alarm', '--scada-panel'],
    ['--scada-grounded', '--scada-panel'],
    ['--scada-dead', '--scada-bg'],
  ];

  for (const [nazwa, mapa] of MOTYWY) {
    for (const [tekst, tlo] of PARY) {
      it(`${nazwa}: ${tekst} na ${tlo}`, () => {
        expect(kontrast(mapa, tekst, tlo)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe('komunikaty — hierarchia blokada > ostrzeżenie > informacja (KD-8 poz. 3)', () => {
  const POZIOMY = ['err', 'warn', 'ok', 'info'] as const;

  for (const [nazwa, mapa] of MOTYWY) {
    for (const poziom of POZIOMY) {
      it(`${nazwa}: tusz komunikatu „${poziom}" na własnym tle ≥ 4,5:1`, () => {
        expect(
          kontrast(mapa, `--scada-status-${poziom}-ink`, `--scada-status-${poziom}-bg`),
        ).toBeGreaterThanOrEqual(4.5);
      });

      it(`${nazwa}: tło komunikatu „${poziom}" odróżnia się od panelu`, () => {
        // Plama komunikatu musi być WIDOCZNA jako plama. Miarą jest różnica
        // KANAŁOWA, nie kontrast luminancji: w motywie ciemnym plama błędu
        // (ciemna czerwień) ma niemal tę samą jasność co panel (granat), a
        // mimo to jest wyraźna — różni ją odcień, który luminancja gubi.
        const tlo = rgbTokenu(mapa, `--scada-status-${poziom}-bg`);
        const panel = rgbTokenu(mapa, '--scada-panel');
        const roznica = Math.max(...tlo.map((v, i) => Math.abs(v - panel[i])));
        expect(roznica, `${nazwa} ${poziom}`).toBeGreaterThanOrEqual(12);
      });
    }

    it(`${nazwa}: akcent blokady odróżnia się od akcentu ostrzeżenia`, () => {
      const err = luminancja(rgbTokenu(mapa, '--scada-status-err'));
      const warn = luminancja(rgbTokenu(mapa, '--scada-status-warn'));
      expect(Math.abs(err - warn)).toBeGreaterThan(0.02);
    });
  }
});
