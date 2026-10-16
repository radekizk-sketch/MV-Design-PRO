/**
 * JEDEN zestaw tokenów aplikacji (karta K1 POWLOKA, kontrakt UIUX przemysłowy §8).
 *
 * Do karty K1 aplikacja miała dwa zestawy: `--mvd-*` (powłoka) i `--scada-*`
 * (trójki RGB w `src/index.css`, paleta Tailwinda `scada-*`/`sygnal-*`), które
 * dla tych samych ról niosły różne wartości. Ten plik przejmuje intencję
 * skasowanego `ui/__tests__/scadaTokens.test.ts` i pilnuje naraz:
 *  1. JEDNEGO ZESTAWU — nikt nie definiuje ani nie czyta `--scada-*`, a paleta
 *     Tailwinda czyta wyłącznie tokeny `--mvd-*` (funkcja `tokenMvd`);
 *  2. PARYTETU — oba motywy definiują identyczny zbiór kluczy;
 *  3. KONTRASTU WCAG 2.2 AA w OBU motywach — tekst ≥ 4,5:1 (także tusz
 *     komunikatu na własnym tle, kolory klas napięć, tekst akcentu), elementy
 *     nietekstowe (obrys kontrolki, fokus) ≥ 3:1;
 *  4. TYPOGRAFII powłoki — tekst ≥ 13 px, bez wersalików i rozstrzelenia liter,
 *     liczby `tabular-nums`;
 *  5. BRAKU LITERAŁÓW koloru w komponentach powłoki.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const SHELL_DIR = join(SRC, 'ui2', 'shell');
const THEME_DIR = join(SRC, 'ui2', 'theme');

const TOKENS_CSS = readFileSync(join(THEME_DIR, 'tokens.css'), 'utf8');
const KOMPONENTY_CSS = readFileSync(join(THEME_DIR, 'komponenty.css'), 'utf8');
const SHELL_CSS = readFileSync(join(SHELL_DIR, 'shell.css'), 'utf8');
const TAILWIND_CONFIG = readFileSync(join(process.cwd(), 'tailwind.config.js'), 'utf8');

const MOTYWY = ['dark_scada', 'light_technical'] as const;
type Motyw = (typeof MOTYWY)[number];

function blokMotywu(motyw: Motyw): string {
  const match = TOKENS_CSS.match(new RegExp(`\\[data-theme="${motyw}"\\][^{]*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Brak bloku motywu: ${motyw}`);
  return match[1];
}

function klucze(blok: string): Set<string> {
  return new Set([...blok.matchAll(/(--mvd-[\w-]+)\s*:/g)].map((m) => m[1]));
}

function wartosc(motyw: Motyw, nazwa: string): string {
  const match = blokMotywu(motyw).match(new RegExp(`${nazwa}\\s*:\\s*([^;]+);`));
  if (!match) throw new Error(`Brak tokenu ${nazwa} w motywie ${motyw}`);
  return match[1].trim();
}

function rgb(hex: string): [number, number, number] {
  const czysty = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(czysty)) throw new Error(`To nie jest kolor #RRGGBB: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(czysty.slice(i, i + 2), 16)) as [number, number, number];
}

function luminancja(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function kontrast(motyw: Motyw, a: string, b: string): number {
  const la = luminancja(wartosc(motyw, a));
  const lb = luminancja(wartosc(motyw, b));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function plikiZrodlowe(dir: string, rozszerzenia: readonly string[]): string[] {
  const wynik: string[] = [];
  for (const wpis of readdirSync(dir)) {
    const sciezka = join(dir, wpis);
    if (statSync(sciezka).isDirectory()) {
      if (wpis === '__tests__' || wpis === 'node_modules') continue;
      wynik.push(...plikiZrodlowe(sciezka, rozszerzenia));
    } else if (rozszerzenia.some((r) => wpis.endsWith(r))) {
      wynik.push(sciezka);
    }
  }
  return wynik;
}

describe('jeden zestaw tokenów', () => {
  it('żaden arkusz ani moduł nie definiuje ani nie czyta tokenu `--scada-*`', () => {
    const winni: string[] = [];
    for (const plik of plikiZrodlowe(SRC, ['.css', '.ts', '.tsx'])) {
      const tresc = readFileSync(plik, 'utf8');
      if (/var\(\s*--scada-|--scada-[\w-]+\s*:/.test(tresc)) winni.push(plik.replace(SRC, 'src'));
    }
    expect(winni).toEqual([]);
  });

  it('paleta Tailwinda `scada-*` i `sygnal-*` czyta wyłącznie tokeny `--mvd-*`', () => {
    const blok = TAILWIND_CONFIG.slice(
      TAILWIND_CONFIG.indexOf("'scada': {"),
      TAILWIND_CONFIG.indexOf('fontFamily'),
    );
    expect(blok.length).toBeGreaterThan(400);
    expect(blok.match(/#[0-9A-Fa-f]{3,8}/g) ?? []).toEqual([]);
    expect(blok).not.toContain('--scada');
    const wpisy = [...blok.matchAll(/^\s*'[\w-]+':\s*([^,\n]+),/gm)].map((m) => m[1].trim());
    expect(wpisy.length).toBeGreaterThan(30);
    const zdefiniowane = klucze(blokMotywu('dark_scada'));
    for (const wyrazenie of wpisy) {
      const token = wyrazenie.match(/^tokenMvd\('([\w-]+)'\)$/)?.[1];
      expect(token, `wpis palety bez tokenu: ${wyrazenie}`).toBeDefined();
      expect(zdefiniowane.has(`--mvd-${token}`), `token --mvd-${token}`).toBe(true);
    }
  });
});

describe('parytet motywów', () => {
  it('oba motywy definiują identyczny zbiór kluczy --mvd-*', () => {
    const jasny = klucze(blokMotywu('light_technical'));
    const ciemny = klucze(blokMotywu('dark_scada'));
    expect(ciemny.size).toBeGreaterThan(40);
    expect([...jasny].sort()).toEqual([...ciemny].sort());
  });

  it('motyw ciemny jest wartością domyślną `:root` (stan domyślny sterownika motywu)', () => {
    expect(TOKENS_CSS).toMatch(/:root,\s*:root\[data-theme="dark_scada"\]\s*\{/);
  });
});

/** Pary tekst/tło, które powłoka i paleta Tailwinda faktycznie zestawiają. */
const PARY_TEKSTU: readonly (readonly [string, string])[] = [
  ['--mvd-ink', '--mvd-bg'],
  ['--mvd-ink', '--mvd-surface'],
  ['--mvd-ink', '--mvd-panel'],
  ['--mvd-ink', '--mvd-panel-2'],
  ['--mvd-ink', '--mvd-panel-raised'],
  ['--mvd-ink', '--mvd-bg-hover'],
  ['--mvd-ink', '--mvd-sel'],
  ['--mvd-ink', '--mvd-active'],
  ['--mvd-ink', '--mvd-chip'],
  ['--mvd-muted', '--mvd-bg'],
  ['--mvd-muted', '--mvd-surface'],
  ['--mvd-muted', '--mvd-panel'],
  ['--mvd-muted', '--mvd-panel-2'],
  ['--mvd-muted', '--mvd-chip'],
  ['--mvd-accent-ink', '--mvd-accent'],
  ['--mvd-accent', '--mvd-panel'],
  ['--mvd-accent', '--mvd-panel-2'],
  ['--mvd-accent', '--mvd-chip'],
  ['--mvd-err', '--mvd-panel'],
  ['--mvd-warn', '--mvd-panel'],
  ['--mvd-ok', '--mvd-panel'],
  ['--mvd-info', '--mvd-panel'],
  ['--mvd-err', '--mvd-err-bg'],
  ['--mvd-warn', '--mvd-warn-bg'],
  ['--mvd-ok', '--mvd-ok-bg'],
  ['--mvd-err-ink', '--mvd-err-bg'],
  ['--mvd-warn-ink', '--mvd-warn-bg'],
  ['--mvd-ok-ink', '--mvd-ok-bg'],
  ['--mvd-info-ink', '--mvd-info-bg'],
  ['--mvd-sn', '--mvd-panel'],
  ['--mvd-nn', '--mvd-panel'],
  ['--mvd-wn', '--mvd-panel'],
  ['--mvd-energized', '--mvd-panel'],
  ['--mvd-alarm', '--mvd-panel'],
  ['--mvd-grounded', '--mvd-panel'],
  ['--mvd-dead', '--mvd-bg'],
];

/** Elementy nietekstowe (WCAG 1.4.11): obrys kontrolki, pierścień fokusu. */
const PARY_NIETEKSTOWE: readonly (readonly [string, string])[] = [
  ['--mvd-line-strong', '--mvd-panel'],
  ['--mvd-line-strong', '--mvd-panel-2'],
  ['--mvd-focus', '--mvd-bg'],
  ['--mvd-focus', '--mvd-panel'],
  ['--mvd-accent', '--mvd-bg'],
];

describe('kontrast WCAG 2.2 AA (oba motywy)', () => {
  for (const motyw of MOTYWY) {
    for (const [tekst, tlo] of PARY_TEKSTU) {
      it(`${motyw}: ${tekst} na ${tlo} ≥ 4,5:1`, () => {
        expect(kontrast(motyw, tekst, tlo)).toBeGreaterThanOrEqual(4.5);
      });
    }
    for (const [element, tlo] of PARY_NIETEKSTOWE) {
      it(`${motyw}: ${element} na ${tlo} ≥ 3:1`, () => {
        expect(kontrast(motyw, element, tlo)).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

describe('komunikaty — hierarchia blokada > ostrzeżenie > informacja', () => {
  for (const motyw of MOTYWY) {
    for (const poziom of ['err', 'warn', 'ok', 'info'] as const) {
      it(`${motyw}: tło komunikatu „${poziom}" odróżnia się od panelu`, () => {
        // Plama komunikatu ma być widoczna jako plama. Miarą jest różnica
        // KANAŁOWA, nie luminancja: w motywie ciemnym plama błędu ma niemal tę
        // samą jasność co panel, a różni ją odcień, który luminancja gubi.
        const tlo = rgb(wartosc(motyw, `--mvd-${poziom}-bg`));
        const panel = rgb(wartosc(motyw, '--mvd-panel'));
        const roznica = Math.max(...tlo.map((v, i) => Math.abs(v - panel[i])));
        expect(roznica).toBeGreaterThanOrEqual(12);
      });
    }

    it(`${motyw}: akcent blokady i akcent ostrzeżenia to różne barwy`, () => {
      const blokada = rgb(wartosc(motyw, '--mvd-err'));
      const uwaga = rgb(wartosc(motyw, '--mvd-warn'));
      const roznica = Math.max(...blokada.map((v, i) => Math.abs(v - uwaga[i])));
      expect(roznica).toBeGreaterThanOrEqual(40);
    });
  }
});

describe('typografia powłoki (§8)', () => {
  const ARKUSZE = [
    ['ui2/shell/shell.css', SHELL_CSS],
    ['ui2/theme/komponenty.css', KOMPONENTY_CSS],
  ] as const;

  it('token pisma danych ma co najmniej 13 px', () => {
    const match = TOKENS_CSS.match(/--mvd-font-size-data:\s*(\d+)px/);
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(13);
  });

  for (const [nazwa, arkusz] of ARKUSZE) {
    it(`${nazwa}: każdy rozmiar pisma ≥ 13 px`, () => {
      const rozmiary = [
        ...arkusz.matchAll(/font-size:\s*([\d.]+)px/g),
        ...arkusz.matchAll(/font:\s*\d{3}\s+([\d.]+)px/g),
      ].map((m) => Number(m[1]));
      for (const rozmiar of rozmiary) expect(rozmiar).toBeGreaterThanOrEqual(13);
    });

    it(`${nazwa}: bez wersalików i rozstrzelenia liter`, () => {
      expect(arkusz).not.toMatch(/text-transform:\s*uppercase/);
      expect(arkusz).not.toMatch(/letter-spacing/);
    });
  }

  it('liczby w kolumnach mają cyfry tabelaryczne', () => {
    const regula = KOMPONENTY_CSS.match(/\.mvd-num\s*\{([^}]*)\}/);
    expect(regula?.[1]).toContain('tabular-nums');
  });
});

describe('komponenty powłoki — brak literałów koloru w .tsx (tylko tokeny)', () => {
  const PLIKI = plikiZrodlowe(SHELL_DIR, ['.tsx']);

  it('lista plików powłoki obejmuje trzy pasy i panel dolny', () => {
    const nazwy = PLIKI.map((p) => p.replace(SHELL_DIR, ''));
    for (const oczekiwany of ['PasekProjektu.tsx', 'PasekNarzedzi.tsx', 'StatusBar.tsx', 'PanelDolny.tsx']) {
      expect(nazwy.some((n) => n.endsWith(oczekiwany)), oczekiwany).toBe(true);
    }
  });

  for (const plik of PLIKI) {
    it(`${plik.replace(SHELL_DIR, 'ui2/shell')} nie zawiera koloru hex ani rgb()`, () => {
      const zrodlo = readFileSync(plik, 'utf8');
      expect(zrodlo.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
      expect(zrodlo.match(/\brgba?\(/g) ?? []).toEqual([]);
    });
  }
});
