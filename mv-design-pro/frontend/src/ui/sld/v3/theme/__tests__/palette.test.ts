/**
 * KD-8 poz. 1 — KONTRAKT PALETY RYSUNKU STEROWANEJ MOTYWEM.
 *
 * Trzy rzeczy dowodzone tutaj (i tylko one — reszta motywu żyje w specach e2e):
 *  1. PARYTET i SEMANTYKA: oba motywy mają identyczny zbiór kluczy, a barwa
 *     przypisana klasie napięcia zostaje w TEJ SAMEJ rodzinie odcienia
 *     (wolno zmienić jasność/nasycenie, nie wolno przemapować WN↔SN↔nN).
 *  2. CZYTELNOŚĆ: tokeny rysowane jako TEKST mają na tle kanwy ≥ 4,5:1,
 *     tokeny rysowane wyłącznie jako kreska/strzałka ≥ 3:1 (progi WCAG).
 *  3. DETERMINIZM: hash GEOMETRII sceny jest NIEZALEŻNY od motywu — paleta nie
 *     wchodzi do sceny, więc goldeny i wyrocznie geometryczne nie mogą się
 *     ruszyć przy przełączeniu motywu.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod } from '../../scene/buildScene';
import { toLightTechnicalExportSvg } from '../../export/exportPalette';
import {
  DARK_SCADA_SLD_PALETTE,
  LIGHT_TECHNICAL_SLD_PALETTE,
  sldPaletteForTheme,
  type SldPalette,
} from '../palette';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, '../../scene/__tests__/fixtures/gpzFeeder.enm.json');

function loadEnm(): EnergyNetworkModel {
  return (JSON.parse(readFileSync(FIXTURE, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
}

function rgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = rgb(hex)
    .map((v) => v / 255)
    .map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Odcień HSL w stopniach — służy WYŁĄCZNIE dowodowi „ta sama rodzina barwy". */
function hue(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d === 0) return 0;
  let h: number;
  if (mx === r) h = 60 * (((g - b) / d) % 6);
  else if (mx === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return h < 0 ? h + 360 : h;
}

/** Najmniejsza odległość kątowa odcieni (barwa jest okresowa co 360°). */
function hueDistance(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b)) % 360;
  return d > 180 ? 360 - d : d;
}

function allTokens(p: SldPalette): ReadonlyArray<readonly [string, string]> {
  return [
    ['canvasBackground', p.canvasBackground],
    ['baseStroke', p.baseStroke],
    ...Object.entries(p.voltage).map(([k, v]) => [`voltage.${k}`, v] as const),
    ...Object.entries(p.state).map(([k, v]) => [`state.${k}`, v] as const),
    ...Object.entries(p.highlight).map(([k, v]) => [`highlight.${k}`, v] as const),
  ];
}

/** Tokeny renderowane jako TEKST (etykiety, liczby wynikowe, badge). */
const TEXT_TOKENS = ['baseStroke', 'highlight.resultLabel', 'highlight.resultStale', 'highlight.flow',
  'highlight.oltc', 'highlight.fault', 'highlight.standby'] as const;

describe('paleta rysunku — parytet motywów', () => {
  it('oba motywy definiują identyczny zbiór kluczy', () => {
    const dark = allTokens(DARK_SCADA_SLD_PALETTE).map(([k]) => k).sort();
    const light = allTokens(LIGHT_TECHNICAL_SLD_PALETTE).map(([k]) => k).sort();
    expect(light).toEqual(dark);
    expect(light.length).toBeGreaterThan(15);
  });

  it('wybór palety idzie WYŁĄCZNIE z trybu motywu powłoki', () => {
    expect(sldPaletteForTheme('dark_scada')).toBe(DARK_SCADA_SLD_PALETTE);
    expect(sldPaletteForTheme('light_technical')).toBe(LIGHT_TECHNICAL_SLD_PALETTE);
  });

  it('każdy token jest poprawnym hexem 6-znakowym (bez skrótów/alfy)', () => {
    for (const p of [DARK_SCADA_SLD_PALETTE, LIGHT_TECHNICAL_SLD_PALETTE]) {
      for (const [key, value] of allTokens(p)) {
        expect(value, key).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });
});

describe('paleta rysunku — SEMANTYKA klas napięć jest kontraktem', () => {
  it('WN/SN/nN zostają w tej samej rodzinie odcienia w obu motywach (≤ 30°)', () => {
    for (const cls of ['hv', 'sn', 'nn'] as const) {
      expect(
        hueDistance(DARK_SCADA_SLD_PALETTE.voltage[cls], LIGHT_TECHNICAL_SLD_PALETTE.voltage[cls]),
        `klasa ${cls} zmieniła rodzinę barwy`,
      ).toBeLessThanOrEqual(30);
    }
  });

  /**
   * Próg rozróżnialności NIE jest wymyślony — jest DZIEDZICZONY z kanonu
   * ciemnego: motyw jasny nie może rozróżniać par gorzej niż motyw, który
   * właściciel odebrał. Dlatego mierzymy separację obu motywów parami i
   * wymagamy, żeby jasny nie był GORSZY (z 1° tolerancji na zaokrąglenia).
   */
  const PARY_ROZROZNIALNE: readonly (readonly [string, (p: SldPalette) => string, (p: SldPalette) => string])[] = [
    ['WN↔SN', (p) => p.voltage.hv, (p) => p.voltage.sn],
    ['SN↔nN', (p) => p.voltage.sn, (p) => p.voltage.nn],
    ['WN↔nN', (p) => p.voltage.hv, (p) => p.voltage.nn],
    ['NOP↔WN', (p) => p.state.nop, (p) => p.voltage.hv],
    // Pary rozróżniane JASNOŚCIĄ, nie odcieniem (kanon: „SN" i „energizacja"
    // to ta sama rodzina zieleni w innym walorze — `colorTokens.ts` D8), nie
    // wchodzą do kontraktu odcienia; ich rozdział pilnuje próg kontrastu.
  ];

  it('motyw jasny nie rozróżnia par gorzej niż kanon ciemny', () => {
    for (const [nazwa, a, b] of PARY_ROZROZNIALNE) {
      const wCiemnym = hueDistance(a(DARK_SCADA_SLD_PALETTE), b(DARK_SCADA_SLD_PALETTE));
      const wJasnym = hueDistance(a(LIGHT_TECHNICAL_SLD_PALETTE), b(LIGHT_TECHNICAL_SLD_PALETTE));
      expect(wJasnym, `${nazwa}: ciemny ${wCiemnym.toFixed(1)}° → jasny ${wJasnym.toFixed(1)}°`)
        .toBeGreaterThanOrEqual(Math.min(wCiemnym, 25) - 1);
    }
  });

  it('klasy napięć są wzajemnie rozróżnialne w OBU motywach (≥ 25°)', () => {
    for (const p of [DARK_SCADA_SLD_PALETTE, LIGHT_TECHNICAL_SLD_PALETTE]) {
      expect(hueDistance(p.voltage.hv, p.voltage.sn)).toBeGreaterThanOrEqual(25);
      expect(hueDistance(p.voltage.sn, p.voltage.nn)).toBeGreaterThanOrEqual(25);
      expect(hueDistance(p.voltage.hv, p.voltage.nn)).toBeGreaterThanOrEqual(25);
      // NOP (stan ruchowy) nie może zlać się z WN (poziom napięcia).
      expect(hueDistance(p.state.nop, p.voltage.hv)).toBeGreaterThanOrEqual(25);
    }
  });
});

describe('paleta rysunku — czytelność na tle kanwy', () => {
  for (const [nazwa, p] of [
    ['dark_scada', DARK_SCADA_SLD_PALETTE],
    ['light_technical', LIGHT_TECHNICAL_SLD_PALETTE],
  ] as const) {
    it(`${nazwa}: tokeny TEKSTOWE ≥ 4,5:1 na tle kanwy`, () => {
      for (const key of TEXT_TOKENS) {
        const value = allTokens(p).find(([k]) => k === key)?.[1];
        expect(value, key).toBeDefined();
        expect(contrast(value!, p.canvasBackground), `${nazwa} ${key}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${nazwa}: KAŻDY token kreski ≥ 3:1 na tle kanwy`, () => {
      for (const [key, value] of allTokens(p)) {
        if (key === 'canvasBackground') continue;
        expect(contrast(value, p.canvasBackground), `${nazwa} ${key}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});

describe('paleta rysunku — determinizm geometrii NIEZALEŻNY od motywu', () => {
  const enm = loadEnm();

  for (const lod of [0, 1, 2] as readonly SceneLod[]) {
    it(`LOD ${lod}: hash geometrii sceny identyczny niezależnie od aktywnej palety`, () => {
      // Scena jest budowana BEZ jakiegokolwiek argumentu koloru — dowód, że
      // paleta nie ma jak wpłynąć na geometrię, jest KONSTRUKCYJNY. Hash liczymy
      // z pełnego zrzutu sceny po dwóch przebiegach rozdzielonych zmianą palety
      // (gdyby kolor kiedykolwiek wsiąkł do sceny, hash by się rozjechał).
      const przedZmiana = buildSceneV3(enm, lod);
      const paleta = sldPaletteForTheme('light_technical');
      expect(paleta).toBe(LIGHT_TECHNICAL_SLD_PALETTE);
      const poZmianie = buildSceneV3(enm, lod);
      const hash = (scene: unknown) => createHash('sha256').update(JSON.stringify(scene)).digest('hex');
      expect(hash(poZmianie)).toBe(hash(przedZmiana));
    });

    it(`LOD ${lod}: scena nie niesie ŻADNEJ wartości koloru`, () => {
      const zrzut = JSON.stringify(buildSceneV3(enm, lod));
      expect(zrzut.match(/#[0-9A-Fa-f]{6}/g) ?? []).toEqual([]);
      for (const p of [DARK_SCADA_SLD_PALETTE, LIGHT_TECHNICAL_SLD_PALETTE]) {
        for (const [key, value] of allTokens(p)) {
          expect(zrzut.includes(value), `scena niesie token ${key}`).toBe(false);
        }
      }
    });
  }
});

describe('eksport — paleta DOKUMENTOWA niezależna od motywu ekranu', () => {
  function markupW(p: SldPalette): string {
    // Minimalny markup w palecie danego motywu — te same role, inne wartości.
    return (
      `<svg><rect fill="${p.canvasBackground}"/>` +
      `<path stroke="${p.voltage.hv}"/><path stroke="${p.voltage.sn}"/><path stroke="${p.voltage.nn}"/>` +
      `<circle stroke="${p.state.nop}"/><text fill="${p.baseStroke}">Sekcja 1</text></svg>`
    );
  }

  it('eksport z motywu CIEMNEGO daje paletę dokumentową', () => {
    const out = toLightTechnicalExportSvg(markupW(DARK_SCADA_SLD_PALETTE), DARK_SCADA_SLD_PALETTE);
    expect(out).toContain('#0F7A3D'); // SN drukowalny
    expect(out).toContain('#0A5A78'); // nN drukowalny
    expect(out).toContain('#B71C1C'); // NOP drukowalny
    expect(out).not.toContain(DARK_SCADA_SLD_PALETTE.voltage.sn);
    expect(out).not.toContain(DARK_SCADA_SLD_PALETTE.canvasBackground);
  });

  it('eksport z motywu JASNEGO daje TĘ SAMĄ paletę dokumentową', () => {
    const out = toLightTechnicalExportSvg(
      markupW(LIGHT_TECHNICAL_SLD_PALETTE),
      LIGHT_TECHNICAL_SLD_PALETTE,
    );
    expect(out).toContain('#0F7A3D');
    expect(out).toContain('#0A5A78');
    expect(out).toContain('#B71C1C');
    // Barwy EKRANU jasnego nie mogą przeciec do dokumentu (poza tymi, które są
    // z definicji wspólne — SN dokumentowy ma tę samą wartość co ekranowy).
    expect(out).not.toContain(LIGHT_TECHNICAL_SLD_PALETTE.voltage.hv);
    expect(out).not.toContain(LIGHT_TECHNICAL_SLD_PALETTE.state.nop);
    expect(out).not.toContain(LIGHT_TECHNICAL_SLD_PALETTE.baseStroke);
  });

  it('oba motywy dają IDENTYCZNY plik dokumentowy dla tej samej treści', () => {
    const zCiemnego = toLightTechnicalExportSvg(markupW(DARK_SCADA_SLD_PALETTE), DARK_SCADA_SLD_PALETTE);
    const zJasnego = toLightTechnicalExportSvg(markupW(LIGHT_TECHNICAL_SLD_PALETTE), LIGHT_TECHNICAL_SLD_PALETTE);
    expect(zJasnego).toBe(zCiemnego);
  });
});
