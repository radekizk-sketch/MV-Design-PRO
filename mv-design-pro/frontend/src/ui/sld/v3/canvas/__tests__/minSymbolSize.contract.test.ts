// @vitest-environment node
/**
 * K11-B §0.2 — TEST KONTRAKTOWY MINIMALNEGO ROZMIARU RENDEROWANIA (jedna scena).
 *
 * Dyrektywa właściciela z oceny ekranu 2/10, wymóg 2: „czytelność bez ręcznego
 * zoomu — symbole/etykiety nigdy nie są rysowane poniżej progu czytelności".
 *
 * Karta SLD-SKALA-I-NAWIGACJA (R1) zastąpiła przełączanie REPREZENTACJI (dawne
 * poziomy szczegółu L0/L1/L2 z progami kamery) jedną sceną `buildSceneV3(snapshot)`
 * — kamera jest czystym przekształceniem. Intencja K11-B zostaje, mechanizm się
 * zmienia: o tym, CO jest czytelne, rozstrzyga rozmiar ekranowy pisma (klasy
 * informacji, `canvas/gestoscInformacji.ts`), a nie wybór innej sceny. Dawne testy
 * „próg l0Max wyprowadzony z aparatu" i „L0 kupuje 3× czytelności nośnika" opisywały
 * progi, które nie istnieją — zostały zastąpione dowodami poniżej:
 *   1. najmniejszy gabaryt biblioteki symboli (odniesienie podłóg R5/R8);
 *   2. żadna etykieta uznana za czytelną nie ma mniej niż `MIN_READABLE_LABEL_SCREEN_PX`
 *      w PEŁNYM zakresie zoomu (reguła bez dziury);
 *   3. scena nie zależy od skali — ta sama treść przy każdym powiększeniu.
 *
 * Sieć: fixtura REFERENCYJNA `sldSubstrate52s`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneV3 } from '../../scene/buildScene';
import { MIN_SYMBOL_SCREEN_PX, smallestSymbolExtent } from '../../symbols/defs';
import { LABEL_TYPOGRAPHY, MIN_READABLE_LABEL_SCREEN_PX, isLabelReadableAtScale } from '../../core/text';
import { MAX_SCALE, MIN_SCALE } from '../camera';

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

const scena: SceneV3 = buildSceneV3(enm);

/** Gęsta, deterministyczna siatka skal pokrywająca CAŁY zakres zoomu
 *  (geometrycznie — zoom jest multiplikatywny). */
function scaleSweep(): readonly number[] {
  const steps = 600;
  const values: number[] = [];
  for (let i = 0; i <= steps; i++) {
    values.push(MIN_SCALE * Math.pow(MAX_SCALE / MIN_SCALE, i / steps));
  }
  return values;
}

describe('K11-B — minimalny rozmiar renderowania w jednej scenie', () => {
  it('najmniejszy gabaryt biblioteki symboli to 16 px świata (odniesienie podłóg)', () => {
    // Zmiana tej liczby (nowy, mniejszy symbol w bibliotece) unieważnia podłogi
    // ekranowe znaczników stanu i pomijania wnętrza symbolu — dlatego jest asercją.
    expect(smallestSymbolExtent(scena.symbols.map((s) => s.symbolId))).toBe(16);
    expect(MIN_SYMBOL_SCREEN_PX).toBeGreaterThan(0);
  });

  it('ŻADNA etykieta nie jest rysowana poniżej progu czytelności — pełny zakres zoomu', () => {
    // Render ukrywa etykietę W CAŁOŚCI poniżej progu (V12K-218) — tu dowodzimy, że
    // reguła nie ma dziury: dla każdej skali etykieta uznana za czytelną FAKTYCZNIE
    // ma co najmniej `MIN_READABLE_LABEL_SCREEN_PX`.
    const naruszenia: string[] = [];
    for (const scale of scaleSweep()) {
      for (const label of scena.labels) {
        if (!isLabelReadableAtScale(label.labelClass, scale)) continue;
        const px = LABEL_TYPOGRAPHY[label.labelClass].fontSize * scale;
        if (px < MIN_READABLE_LABEL_SCREEN_PX) {
          naruszenia.push(`${label.labelClass} ${px.toFixed(2)} px @ ${scale.toFixed(4)}`);
        }
      }
    }
    expect(naruszenia.slice(0, 5)).toEqual([]);
  });

  it('scena nie zależy od skali: dwie budowy dają identyczne symbole i etykiety', () => {
    // Budowa sceny nie przyjmuje skali — powtórna budowa jest tym samym rysunkiem.
    const druga = buildSceneV3(enm);
    expect(JSON.stringify(druga.symbols)).toBe(JSON.stringify(scena.symbols));
    expect(JSON.stringify(druga.labels)).toBe(JSON.stringify(scena.labels));
    // Zero glifów form zwiniętych (dawny symbol zwiniętej stacji i bloku GPZ).
    expect(scena.symbols.some((s) => /Collapsed$/.test(s.symbolId))).toBe(false);
  });
});
