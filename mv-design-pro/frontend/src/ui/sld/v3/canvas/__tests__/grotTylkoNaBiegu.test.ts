/**
 * Karta R10-E2E-CZERWONE — grot przepływu i strzałka zwarciowa leżą WYŁĄCZNIE na biegu
 * gałęzi, nigdy na znaczniku toru (znak powiązania, słupek końca otwartego, kreska ciągu
 * dalszego).
 *
 * Defekt: harness P-A nadawał kierunek każdej gałęzi z towarzysza solvera bez bramki
 * orientacji produktu (S9-2), a rozmieszczenie grotów kładło grot na KAŻDYM odcinku sceny
 * o danym `ownerRef` — także na dwóch kreskach poprzecznych znaku powiązania rezerwy
 * pierścieniowej (`scene/elementyToru.ts`). Grot na kresce poprzecznej wskazywał kierunek
 * kreski, nie przepływu.
 *
 * Iloczyn cech: rodzaj odcinka sceny (każdy `PreviewSegmentKind`) × nakładka (przepływ mocy,
 * strzałka zwarciowa) × ten sam `ownerRef` na biegu i na znaczniku; reguła zwrotu
 * (przepływ from→to × orientacja rysunku); realny substrat 52 stacji na każdym LOD.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { PreviewSegment, PreviewSegmentKind } from '../../compose/preview';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../../scene/buildScene';
import { jestZnacznikiemToru, RODZAJE_ZNACZNIKOW_TORU } from '../../scene/znacznikiToru';
import {
  orientedSegmentRefs,
  zwrotGrotuWzdluzRysunku,
  type SegmentFaultFlowOverlay,
  type SegmentFlowOverlay,
} from '../overlay';
import { computeFaultFlowPlacements, computeFlowOverlayPlacements } from '../SldCanvasV3';

const WSZYSTKIE_RODZAJE: readonly PreviewSegmentKind[] = [
  'bus',
  'busGpz',
  'sn',
  'snTrunk',
  'lv',
  'leader',
  'protectionTrip',
  'measurementLink',
  'openTerminal',
  'sheetContinuation',
  'tieMarker',
];

const ZNACZNIKI: readonly PreviewSegmentKind[] = ['openTerminal', 'sheetContinuation', 'tieMarker'];

const REF = 'seg/r10/odcinek';

function przeplyw(ownerRef: string): SegmentFlowOverlay {
  return { ownerRef, forward: true, p: { value: 0.06, unit: 'MW' } };
}

function zwarcie(ownerRef: string): SegmentFaultFlowOverlay {
  return { ownerRef, forward: true, iKa: 1.2, payloadMaxKa: 1.2, colorToken: 'critical' };
}

function odcinek(kind: PreviewSegmentKind, y: number): PreviewSegment {
  return {
    points: [
      { x: 0, y },
      { x: 400, y },
    ],
    meta: { ownerRef: REF, elementKind: 'segment', kind },
  };
}

function scena(segments: readonly PreviewSegment[]): SceneV3 {
  return { segments, symbols: [], labels: [] } as unknown as SceneV3;
}

describe('znaczniki toru — jedna lista', () => {
  it('dokładnie trzy rodzaje odcinków są znacznikami toru', () => {
    expect([...RODZAJE_ZNACZNIKOW_TORU].sort()).toEqual([...ZNACZNIKI].sort());
    for (const kind of WSZYSTKIE_RODZAJE) {
      expect(jestZnacznikiemToru(odcinek(kind, 0)), kind).toBe(ZNACZNIKI.includes(kind));
    }
    expect(jestZnacznikiemToru({ points: [], meta: { ownerRef: REF } })).toBe(false);
    expect(jestZnacznikiemToru({ points: [] })).toBe(false);
  });
});

describe('grot tylko na biegu — rodzaj odcinka × nakładka', () => {
  for (const kind of WSZYSTKIE_RODZAJE) {
    const oczekiwane = ZNACZNIKI.includes(kind) ? 0 : 1;
    it(`${kind}: przepływ mocy → ${oczekiwane} grot(ów)`, () => {
      const wynik = computeFlowOverlayPlacements(scena([odcinek(kind, 0)]), { [REF]: przeplyw(REF) }, null);
      expect(wynik.length).toBe(oczekiwane);
    });
    it(`${kind}: strzałka zwarciowa → ${oczekiwane} strzałek`, () => {
      const wynik = computeFaultFlowPlacements(scena([odcinek(kind, 0)]), { [REF]: zwarcie(REF) });
      expect(wynik.length).toBe(oczekiwane);
    });
  }

  for (const znacznik of ZNACZNIKI) {
    it(`ten sam ownerRef na biegu i na znaczniku ${znacznik}: grot wyłącznie na biegu`, () => {
      const segmenty = [odcinek(znacznik, 0), odcinek('sn', 200), odcinek(znacznik, 400)];
      const groty = computeFlowOverlayPlacements(scena(segmenty), { [REF]: przeplyw(REF) }, null);
      expect(groty.map((g) => g.segmentIndex)).toEqual([1]);
      const strzalki = computeFaultFlowPlacements(scena(segmenty), { [REF]: zwarcie(REF) });
      expect(strzalki.map((s) => s.segmentIndex)).toEqual([1]);
    });
  }
});

describe('zwrot grota wzdłuż rysunku — przepływ from→to × orientacja rysunku', () => {
  it.each([
    [true, true, true],
    [true, false, false],
    [false, true, false],
    [false, false, true],
  ])('przepływ from→to=%s, rysunek od „from"=%s → zgodnie z rysunkiem=%s', (przeplywFromTo, zgodna, oczekiwany) => {
    expect(zwrotGrotuWzdluzRysunku(przeplywFromTo, zgodna)).toBe(oczekiwany);
  });
});

describe('substrat 52 stacji — rezerwa pierścieniowa narysowana znakami powiązania', () => {
  const sciezka = resolve(process.cwd(), 'public/test-fixtures/sldSubstrate52s.enm.json');
  const enm = (JSON.parse(readFileSync(sciezka, 'utf-8')) as { enm: EnergyNetworkModel }).enm;
  const PIERSCIEN = 'seg/f1301c98ab7632998c336fbf832b06cb/ring_closure';

  it('odcinek powiązania nie ma udowodnionej orientacji rysunku (brak biegu)', () => {
    expect(orientedSegmentRefs(enm).has(PIERSCIEN)).toBe(false);
  });

  for (const lod of [0, 1, 2] as const satisfies readonly SceneLod[]) {
    it(`LOD ${lod}: wpis przepływu dla KAŻDEJ gałęzi nie daje grota na żadnym znaczniku`, () => {
      const scene = buildSceneV3(enm, lod);
      const znaczniki = scene.segments.filter((s) => s.meta?.ownerRef === PIERSCIEN);
      expect(znaczniki.length).toBeGreaterThan(0);
      expect(znaczniki.every((s) => s.meta?.kind === 'tieMarker')).toBe(true);
      const wpisy: Record<string, SegmentFlowOverlay> = {};
      for (const galaz of enm.branches ?? []) wpisy[galaz.ref_id] = przeplyw(galaz.ref_id);
      const groty = computeFlowOverlayPlacements(scene, wpisy, null);
      expect(groty.length).toBeGreaterThan(0);
      for (const grot of groty) {
        expect(jestZnacznikiemToru(scene.segments[grot.segmentIndex]), grot.ownerRef).toBe(false);
      }
      expect(groty.some((g) => g.ownerRef === PIERSCIEN)).toBe(false);
    });
  }
});
