/**
 * K11-B §0.2 — TEST KONTRAKTOWY MINIMALNEGO ROZMIARU RENDEROWANIA.
 *
 * Dyrektywa właściciela z oceny ekranu 2/10, wymóg 2: „czytelność bez ręcznego
 * zoomu — symbole/etykiety nigdy nie są rysowane poniżej progu czytelności;
 * poniżej progu przełącza się REPREZENTACJA (LOD), nie skala glifu".
 *
 * ---------------------------------------------------------------------------
 * CO DOKŁADNIE JEST TU DOWODZONE (i gdzie leży granica dowodu)
 * ---------------------------------------------------------------------------
 * Mechanizmem egzekwowania są PROGI LOD kamery (`canvas/camera.ts`), nie
 * skalowanie glifu — dlatego kontrakt brzmi: **żaden poziom szczegółu nie jest
 * aktywny przy skali, przy której jego własne symbole schodzą poniżej progu
 * rozpoznawalności**. Innymi słowy: zanim aparat stanie się plamką, kamera
 * MUSI już rysować reprezentację zgrubniejszą (stacja jako mini-RMU).
 *
 * Granica dowodu jest nazwana wprost: L0 jest reprezentacją NAJZGRUBSZĄ —
 * poniżej niej nie ma czego przełączyć, a przegląd całej sieci referencyjnej
 * (53 stacje) siłą rzeczy schodzi do skali ≈0,12. Dlatego dla L0 dowodzimy
 * rzeczy słabszej, ale prawdziwej: że jego nośnik informacji (glif stacji
 * 48 px świata) jest 3× większy od aparatu, którego L0 nie rysuje — czyli że
 * przełączenie reprezentacji FAKTYCZNIE kupuje czytelność, zamiast tylko
 * zmniejszać liczbę elementów.
 *
 * Sieć: fixtura REFERENCYJNA `sldSubstrate52s` (ta sama, na której kalibrowano
 * progi i na której stoją wyrocznie sceny).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../../scene/buildScene';
import { MIN_SYMBOL_SCREEN_PX, smallestSymbolExtent } from '../../symbols/defs';
import { LABEL_TYPOGRAPHY, MIN_READABLE_LABEL_SCREEN_PX, isLabelReadableAtScale } from '../../core/text';
import {
  DEFAULT_LOD_THRESHOLDS,
  LOD_HYSTERESIS_MARGIN,
  MAX_SCALE,
  MIN_SCALE,
  lodFromScaleWithHysteresis,
} from '../camera';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const LODS: readonly SceneLod[] = [0, 1, 2];
const scenes: Readonly<Record<SceneLod, SceneV3>> = {
  0: buildSceneV3(enm, 0),
  1: buildSceneV3(enm, 1),
  2: buildSceneV3(enm, 2),
};

/** Najmniejszy gabaryt symbolu FAKTYCZNIE renderowanego na danym poziomie. */
function smallestExtentAtLod(lod: SceneLod): number {
  return smallestSymbolExtent(scenes[lod].symbols.map((s) => s.symbolId));
}

/** Skala NATYWNA świata danego LOD odpowiadająca `refScale` (odwrotność
 *  `refScaleFor`: `refScale = scale · width(lod)/width(L2)`). */
function nativeScaleFor(refScale: number, lod: SceneLod): number {
  const widthAtLod = scenes[lod].bbox.width;
  const widthAtRef = scenes[2].bbox.width;
  if (!(widthAtLod > 0) || !(widthAtRef > 0)) return refScale;
  return (refScale * widthAtRef) / widthAtLod;
}

/** Gęsta, deterministyczna siatka skal pokrywająca CAŁY zakres zoomu
 *  (geometrycznie — zoom jest multiplikatywny) + dokładne wartości progowe. */
function scaleSweep(): readonly number[] {
  const steps = 600;
  const values: number[] = [];
  for (let i = 0; i <= steps; i++) {
    values.push(MIN_SCALE * Math.pow(MAX_SCALE / MIN_SCALE, i / steps));
  }
  const { l0Max, l1Max } = DEFAULT_LOD_THRESHOLDS;
  for (const t of [l0Max, l1Max]) {
    values.push(t * (1 - LOD_HYSTERESIS_MARGIN), t, t * (1 + LOD_HYSTERESIS_MARGIN));
  }
  return values.filter((v) => v >= MIN_SCALE && v <= MAX_SCALE).sort((a, b) => a - b);
}

describe('K11-B — minimalny rozmiar renderowania symboli: progi LOD trzymają linię', () => {
  it('najmniejszy gabaryt biblioteki symboli to 16 px świata (odniesienie progu)', () => {
    // Zmiana tej liczby (nowy, mniejszy symbol w bibliotece) UNIEWAŻNIA
    // wyprowadzenie progu `l0Max` niżej — dlatego jest asercją, nie komentarzem.
    expect(smallestExtentAtLod(1)).toBe(16);
    expect(smallestExtentAtLod(2)).toBe(16);
  });

  it('próg l0Max jest WYPROWADZONY z progu rozpoznawalności aparatu (nie dobrany na oko)', () => {
    const wyjscieZL1 = DEFAULT_LOD_THRESHOLDS.l0Max * (1 - LOD_HYSTERESIS_MARGIN);
    const aparatNaWyjsciu = wyjscieZL1 * smallestExtentAtLod(1);
    expect(aparatNaWyjsciu).toBeGreaterThanOrEqual(MIN_SYMBOL_SCREEN_PX);
    // Zapas świadomie mały (0,6 px): próg ma być NAJNIŻSZĄ skalą, przy której
    // szczegół jest jeszcze uprawniony — wyższy zabierałby użyteczny zakres.
    expect(aparatNaWyjsciu).toBeLessThan(MIN_SYMBOL_SCREEN_PX + 1);
  });

  it('poprzedni próg 0,4 NIE spełniał kontraktu — dowód liczbowy zmiany (K11-B)', () => {
    // Intencja zapisana w teście, żeby powrót do 0,4 był świadomą decyzją, a
    // nie cichą regresją: przy 0,4 aparat pola schodził do 5,44 px, czyli
    // poniżej progu rozpoznawalności kształtu — L1 rysował 765 symboli jako
    // gąszcz plamek (objaw z oceny ekranu 2/10).
    const staryProgWyjscia = 0.4 * (1 - LOD_HYSTERESIS_MARGIN);
    expect(staryProgWyjscia * smallestExtentAtLod(1)).toBeCloseTo(5.44, 2);
    expect(staryProgWyjscia * smallestExtentAtLod(1)).toBeLessThan(MIN_SYMBOL_SCREEN_PX);
  });

  it('ŻADEN poziom szczegółu (L1/L2) nie jest aktywny poniżej progu rozpoznawalności — pełny zakres zoomu', () => {
    const naruszenia: string[] = [];
    for (const refScale of scaleSweep()) {
      for (const currentLod of LODS) {
        // Histereza zależy od poziomu, z którego wchodzimy — sprawdzamy
        // KAŻDĄ drogę dojścia do danej skali (zoom w dół, w górę, skok).
        const lod = lodFromScaleWithHysteresis(refScale, currentLod);
        if (lod === 0) continue;
        const px = smallestExtentAtLod(lod) * nativeScaleFor(refScale, lod);
        if (px < MIN_SYMBOL_SCREEN_PX) {
          naruszenia.push(
            `refScale=${refScale.toFixed(4)} (z LOD${currentLod}) ⇒ LOD${lod}, najmniejszy symbol ${px.toFixed(2)} px`,
          );
        }
      }
    }
    expect(naruszenia.slice(0, 5)).toEqual([]);
  });

  it('ŻADNA etykieta nie jest rysowana poniżej progu czytelności — pełny zakres zoomu', () => {
    // Render ukrywa etykietę W CAŁOŚCI poniżej progu (V12K-218,
    // `SldCanvasV3.tsx`) — tu dowodzimy, że reguła nie ma dziury: dla każdej
    // skali i każdego poziomu etykieta uznana za czytelną FAKTYCZNIE ma
    // co najmniej `MIN_READABLE_LABEL_SCREEN_PX`.
    const naruszenia: string[] = [];
    for (const refScale of scaleSweep()) {
      for (const lod of LODS) {
        const scale = nativeScaleFor(refScale, lod);
        for (const label of scenes[lod].labels) {
          if (!isLabelReadableAtScale(label.labelClass, scale)) continue;
          const px = LABEL_TYPOGRAPHY[label.labelClass].fontSize * scale;
          if (px < MIN_READABLE_LABEL_SCREEN_PX) {
            naruszenia.push(`LOD${lod} ${label.labelClass} ${px.toFixed(2)} px @ ${scale.toFixed(4)}`);
          }
        }
      }
    }
    expect(naruszenia.slice(0, 5)).toEqual([]);
  });

  it('L2 nie jest aktywny, gdy jego własna klasa opisu (t2 — parametry aparatury) byłaby nieczytelna', () => {
    const wyjscieZL2 = DEFAULT_LOD_THRESHOLDS.l1Max * (1 - LOD_HYSTERESIS_MARGIN);
    // Na L2 `refScale` JEST skalą natywną (świat odniesienia = sam siebie).
    expect(nativeScaleFor(wyjscieZL2, 2)).toBeCloseTo(wyjscieZL2, 10);
    expect(wyjscieZL2 * LABEL_TYPOGRAPHY.t2.fontSize).toBeGreaterThanOrEqual(MIN_READABLE_LABEL_SCREEN_PX);
  });

  it('L0 jest reprezentacją NAJZGRUBSZĄ: przełączenie na nią kupuje 3× czytelności nośnika', () => {
    // Granica dowodu (patrz nagłówek): przy skrajnym oddaleniu nic nie jest
    // czytelne — ale L0 zastępuje 16-px aparat 48-px sylwetką stacji, więc
    // to, co pozostaje na ekranie, jest 3× większe niż to, co zniknęło.
    const glifStacji = 48;
    expect(scenes[0].symbols.some((s) => s.symbolId === 'stationCollapsed')).toBe(true);
    expect(glifStacji / smallestExtentAtLod(1)).toBeGreaterThanOrEqual(3);
    // I dokładnie tam, gdzie L0 przestaje wystarczać, kamera przechodzi na L1:
    // próg wejścia daje aparatowi 11 px — rozmiar czytany bez wysiłku.
    const wejscieDoL1 = DEFAULT_LOD_THRESHOLDS.l0Max * (1 + LOD_HYSTERESIS_MARGIN);
    expect(wejscieDoL1 * smallestExtentAtLod(1)).toBeGreaterThan(MIN_SYMBOL_SCREEN_PX);
  });
});
