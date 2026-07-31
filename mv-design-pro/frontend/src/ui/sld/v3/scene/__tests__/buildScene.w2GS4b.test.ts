/**
 * W2 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §3/§4; GS-4b / audyt Z2,
 * `AUDYT_POWYKONAWCZY_SLD_2026-07.md`) — poziom sceny (`buildSceneV3`).
 *
 * Domyka lukę lustrzaną Z2 na L1/L2: przed W2 kompozycja zaczepiała KAŻDE
 * źródło DER do punktu nN (`nnBusPoint ?? lvPorts[0]`), ignorując
 * `connectionSide` — źródło na szynie SN stacji byłoby narysowane ZA
 * transformatorem (kłamstwo topologiczne w drugą stronę niż to, które GS-4
 * naprawił na L0). Ten plik przybija DWA warunki na REALNEJ fixturze
 * referencyjnej (53 stacje, 20/20 DER na nN):
 *  - L1/L2: ZERO pól źródłowych SN (`#sn-source-descent`) — wszystkie DER na
 *    szynach nN (rząd nN `#der-row-bus`), zgodnie z pomiarem bazowym GS-4;
 *  - kotwica stacji IDENTYCZNA L0/L1/L2 (środek pasma nazw) — zmiana W2 jest
 *    NO-OP na sieci bez źródeł SN, więc nie może przesunąć kotwic.
 * Syntetyczne warianty A/B (`connectionSide` 'nn'/'sn') ćwiczy bezpośrednio
 * `compose/__tests__/station.test.ts` (tor kompozycji), gdzie źródło SN jest
 * fixturą wejścia.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneV3 } from '../buildScene';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

function segmentsEndingWith(scene: SceneV3, suffix: string): number {
  return scene.segments.filter((s) => (s.meta?.ownerRef ?? '').endsWith(suffix)).length;
}

describe('W2 (GS-4b/Z2) — pole źródłowe SN vs rząd nN na scenie referencyjnej', () => {
  for (const lod of [1, 2] as const) {
    it(`L${lod}: fixtura referencyjna (20/20 DER na nN) ⇒ ZERO pól źródłowych SN, rząd nN obecny`, () => {
      const scene = buildSceneV3(enm, lod);
      // Wszystkie DER referencyjne są na szynach nN (klasyfikacja adaptera
      // `bus_ref`→`voltage_kv` ≤ 0,5 kV ⇒ 'nn') — zero źródeł na SN, więc
      // zero pól źródłowych SN.
      expect(segmentsEndingWith(scene, '#sn-source-descent')).toBe(0);
      // Rząd nN obecny (DER referencyjne widoczne za TR na szynie nN).
      expect(segmentsEndingWith(scene, '#der-row-bus')).toBeGreaterThan(0);
    });
  }

  it('kotwica stacji IDENTYCZNA L0/L1/L2 (środek pasma nazw) — zmiana W2 nie przesuwa kotwic', () => {
    const nameAnchors = (lod: 0 | 1 | 2): Map<string, string> => {
      const scene = buildSceneV3(enm, lod);
      const m = new Map<string, string>();
      for (const label of scene.labels) {
        if (label.ownerKind === 'station-name' && label.ownerRef.endsWith('#name-row-0')) {
          const stationRef = label.ownerRef.slice(0, -'#name-row-0'.length);
          m.set(stationRef, `${label.rect.x},${label.rect.y},${label.rect.width}`);
        }
      }
      return m;
    };
    const a0 = nameAnchors(0);
    const a1 = nameAnchors(1);
    const a2 = nameAnchors(2);
    // KD-5: pasma nazw ELEMENTÓW WEWNĘTRZNYCH bloku GPZ (tabliczka TR/źródła)
    // na L0 nie istnieją — blok jest zwinięty. Liczność porównujemy więc na
    // STACJACH (intencja testu: kotwica STACJI nie dryfuje), a zbiór L0 musi
    // pozostać podzbiorem L1/L2 (zwinięcie nie dodaje kotwic).
    const stationsOnly = (m: Map<string, string>): Map<string, string> =>
      new Map([...m].filter(([ref]) => ref.startsWith('stn/')));
    expect(a0.size).toBeGreaterThan(0);
    expect(stationsOnly(a1).size).toBe(stationsOnly(a0).size);
    expect(stationsOnly(a2).size).toBe(stationsOnly(a0).size);
    for (const ref of a0.keys()) {
      expect(a1.has(ref) && a2.has(ref), `kotwica ${ref} obecna na L0, brak na L1/L2`).toBe(true);
    }
    const drift: string[] = [];
    for (const [ref, pos0] of a0) {
      if (a1.get(ref) !== pos0 || a2.get(ref) !== pos0) {
        drift.push(`${ref}: L0=${pos0} L1=${a1.get(ref)} L2=${a2.get(ref)}`);
      }
    }
    expect(drift, `kotwice dryfują:\n${drift.slice(0, 8).join('\n')}`).toEqual([]);
  });
});
