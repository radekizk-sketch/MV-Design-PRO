/**
 * §16-v3 — biegi OTWARTE (REBUILD_PLAN_V3 „Dług otwarty" pkt 1).
 *
 * Fixtury wygenerowane przez REALNY backend (te same domain-ops co e2e
 * `sld-editor-real-backend-flex` — jedna prawda kształtu ENM, zero
 * syntetycznego zgadywania):
 *  - `openTerminal.enm.json`   — GPZ + 1 segment do OTWARTEGO terminala
 *    (zero stacji SN; `add_grid_source_sn` + `continue_trunk_segment_sn`).
 *  - `openBranch.enm.json`     — GPZ + segment + stacja wstawiona w połowie
 *    (`insert_station_on_segment_sn`) ⇒ `segment_L` (wejście) + `segment_R`
 *    (OTWARTY ogon za stacją) + odgałęzienie z pola GPZ (poza F6a — stopNote).
 *  - `openTrunkChain.enm.json` — GPZ + 2 segmenty (`continue_trunk` ×2),
 *    stacja na DRUGIM ⇒ przęsło GPZ→S0 wieloczłonowe (F2 + segment_L) +
 *    otwarty ogon `segment_R`.
 *
 * Kontrakt (wyrocznie GRYZĄ — negatywy obowiązkowe):
 *  a) KAŻDY segment ENM ciągu jest reprezentowany w scenie własnym
 *     `meta.ownerRef` (tożsamość łańcucha — dotąd przęsło niosło wyłącznie
 *     ref ostatniego członu, a bieg do otwartego terminala nie istniał wcale).
 *  b) Ostatni kawałek biegu otwartego niesie `meta.openTerminal===true` i
 *     kończy się DOTYKIEM słupka terminalnego (`kind==='openTerminal'`).
 *  c) `port_probe` (§11.3) przechodzi — słupek jest legalnym zakończeniem;
 *     PO USUNIĘCIU słupka i `port_probe`, i `openTerminalGaps` gryzą.
 *  d) Etykieta „koniec otwarty" WYŁĄCZNIE na L2 (konwencja `terminationLabels`
 *     F10.1/§18.6).
 *  e) Determinizm: dwa wywołania ⇒ identyczny JSON.
 *  f) Fixtura referencyjna (substrate, wszystkie ciągi zakończone stacjami)
 *     nie dostaje ŻADNEGO słupka (zero fabrykacji znaku końca).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSldDataFromSnapshot } from '../../../v2/canvas/enmToSldAdapter';
import {
  allOpenTerminalsMarked,
  allSceneGeometryOnGrid,
  allSceneSegmentEndpointsAnchored,
  buildSceneV3,
  openTerminalGaps,
  sceneSegmentEndpointGaps,
  type SceneLod,
  type SceneV3,
} from '../buildScene';

const here = dirname(fileURLToPath(import.meta.url));

function loadEnm(name: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(resolve(here, 'fixtures', name), 'utf8')) as {
    readonly enm: EnergyNetworkModel;
  }).enm;
}

const openTerminalEnm = loadEnm('openTerminal.enm.json');
const openBranchEnm = loadEnm('openBranch.enm.json');
const chainEnm = loadEnm('openTrunkChain.enm.json');

const substratePath = resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const substrateEnm = (JSON.parse(readFileSync(substratePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const LODS: readonly SceneLod[] = [0, 1, 2];

function corridorSegmentRefs(enm: EnergyNetworkModel): readonly string[] {
  const corridors = (enm as { corridors?: ReadonlyArray<{ ordered_segment_refs?: readonly string[] }> }).corridors ?? [];
  return corridors[0]?.ordered_segment_refs ?? [];
}

function sceneSegmentOwnerRefs(scene: SceneV3): readonly string[] {
  return scene.segments
    .map((s) => s.meta?.ownerRef)
    .filter((r): r is string => r != null && r.startsWith('seg/'));
}

function ticksOf(scene: SceneV3) {
  return scene.segments.filter((s) => s.meta?.kind === 'openTerminal');
}

describe('§16-v3 bieg otwarty — ciąg główny bez stacji (openTerminal.enm)', () => {
  const trunkRefs = corridorSegmentRefs(openTerminalEnm);

  it('fixtura niesie dokładnie 1 segment magistrali (kontrola wejścia)', () => {
    expect(trunkRefs).toHaveLength(1);
  });

  for (const lod of LODS) {
    it(`LOD ${lod}: segment ENM widoczny własnym ownerRef + słupek terminalny + wyrocznie zielone`, () => {
      const scene = buildSceneV3(openTerminalEnm, lod);
      const refs = sceneSegmentOwnerRefs(scene);
      expect(refs).toContain(trunkRefs[0]);
      const openRun = scene.segments.find((s) => s.meta?.ownerRef === trunkRefs[0]);
      expect(openRun?.meta?.openTerminal).toBe(true);
      expect(ticksOf(scene)).toHaveLength(1);
      expect(openTerminalGaps(scene)).toHaveLength(0);
      expect(allOpenTerminalsMarked(scene)).toBe(true);
      expect(sceneSegmentEndpointGaps(scene)).toHaveLength(0);
      expect(allSceneSegmentEndpointsAnchored(scene)).toBe(true);
      expect(allSceneGeometryOnGrid(scene)).toBe(true);
    });
  }

  it('etykieta „koniec otwarty" WYŁĄCZNIE na L2 (konwencja §18.6/F10.1)', () => {
    const labelsAt = (lod: SceneLod) =>
      buildSceneV3(openTerminalEnm, lod).labels.filter((l) => l.text === 'koniec otwarty');
    expect(labelsAt(2)).toHaveLength(1);
    expect(labelsAt(1)).toHaveLength(0);
    expect(labelsAt(0)).toHaveLength(0);
  });

  it('determinizm: dwa wywołania ⇒ identyczny JSON (każdy LOD)', () => {
    for (const lod of LODS) {
      expect(JSON.stringify(buildSceneV3(openTerminalEnm, lod))).toBe(
        JSON.stringify(buildSceneV3(openTerminalEnm, lod)),
      );
    }
  });

  it('NEGATYW (wyrocznia gryzie): usunięcie słupka ⇒ openTerminalGaps ORAZ port_probe czerwone', () => {
    const scene = buildSceneV3(openTerminalEnm, 2);
    const sabotaged: SceneV3 = {
      ...scene,
      segments: scene.segments.filter((s) => s.meta?.kind !== 'openTerminal'),
    };
    const gaps = openTerminalGaps(sabotaged);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.some((g) => g.reason === 'koniec-bez-slupka')).toBe(true);
    // Ten sam wolny koniec obcina też generyczna wyrocznia §11.3.
    expect(sceneSegmentEndpointGaps(sabotaged).length).toBeGreaterThan(0);
  });

  it('NEGATYW (wyrocznia gryzie): słupek-sierota (bieg odznaczony) ⇒ gap slupek-sierota', () => {
    const scene = buildSceneV3(openTerminalEnm, 2);
    const sabotaged: SceneV3 = {
      ...scene,
      segments: scene.segments.map((s) =>
        s.meta?.openTerminal === true ? { ...s, meta: { ...s.meta, openTerminal: undefined } } : s,
      ),
    };
    expect(openTerminalGaps(sabotaged).some((g) => g.reason === 'slupek-sierota')).toBe(true);
  });
});

describe('§16-v3 otwarty ogon za stacją (openBranch.enm)', () => {
  const refs = corridorSegmentRefs(openBranchEnm);

  it('fixtura: stacja rozcięła segment na _L/_R (kontrola wejścia)', () => {
    expect(refs.some((r) => r.endsWith('segment_L'))).toBe(true);
    expect(refs.some((r) => r.endsWith('segment_R'))).toBe(true);
  });

  for (const lod of LODS) {
    it(`LOD ${lod}: wejście (_L) I otwarty ogon (_R) widoczne własnymi ownerRef, ogon ze słupkiem`, () => {
      const scene = buildSceneV3(openBranchEnm, lod);
      const sceneRefs = sceneSegmentOwnerRefs(scene);
      for (const ref of refs) expect(sceneRefs).toContain(ref);
      const tailRef = refs.find((r) => r.endsWith('segment_R'))!;
      const tail = scene.segments.find((s) => s.meta?.ownerRef === tailRef);
      expect(tail?.meta?.openTerminal).toBe(true);
      expect(ticksOf(scene).length).toBeGreaterThanOrEqual(1);
      expect(openTerminalGaps(scene)).toHaveLength(0);
      expect(sceneSegmentEndpointGaps(scene)).toHaveLength(0);
      expect(allSceneGeometryOnGrid(scene)).toBe(true);
    });
  }
});

describe('§16-v3 tożsamość łańcucha — przęsło GPZ→S0 wieloczłonowe (openTrunkChain.enm)', () => {
  const refs = corridorSegmentRefs(chainEnm);

  it('fixtura: 3 refy (F2, segment_L, segment_R) — kontrola wejścia', () => {
    expect(refs).toHaveLength(3);
  });

  for (const lod of LODS) {
    it(`LOD ${lod}: KAŻDY z 3 segmentów ENM ma własny kawałek sceny (ownerRef), wyrocznie zielone`, () => {
      const scene = buildSceneV3(chainEnm, lod);
      const sceneRefs = sceneSegmentOwnerRefs(scene);
      for (const ref of refs) expect(sceneRefs).toContain(ref);
      expect(openTerminalGaps(scene)).toHaveLength(0);
      expect(sceneSegmentEndpointGaps(scene)).toHaveLength(0);
      expect(allSceneGeometryOnGrid(scene)).toBe(true);
    });
  }

  it('kawałki łańcucha GPZ→S0 stykają się końcami (ciągłość rysunkowa przęsła)', () => {
    const scene = buildSceneV3(chainEnm, 2);
    const leading = refs[0];
    const middle = refs[1];
    const segA = scene.segments.find((s) => s.meta?.ownerRef === leading)!;
    const segB = scene.segments.find((s) => s.meta?.ownerRef === middle)!;
    const aLast = segA.points[segA.points.length - 1];
    const bFirst = segB.points[0];
    expect(aLast).toEqual(bFirst);
  });
});

describe('§16-v3 fixtura referencyjna (substrate) — ogony realne, zero fabrykacji', () => {
  // POMIAR (sonda 2026-07-17): substrate niesie 13 ciągów z OTWARTYM ogonem —
  // ostatni segment każdego kończy się w busie `…/branch_end`/`…/downstream`
  // NIE należącym do żadnej stacji (dokładnie zbiór szyn beznapięciowych
  // companion-a P-A). Te segmenty ENM były dotąd NIEWIDOCZNE w scenie.
  // Liczba oczekiwana liczona NIEZALEŻNIE z adaptera (nie zahardkodowana).
  const busToStation = new Set<string>();
  for (const st of substrateEnm.substations ?? []) {
    for (const b of (st as { bus_refs?: readonly string[] }).bus_refs ?? []) busToStation.add(b);
  }
  const sldData = buildSldDataFromSnapshot(substrateEnm, substrateEnm.logical_views ?? null, null);
  const expectedTailRuns = sldData.cableRuns.filter((cr) => {
    const paths = cr.segmentPaths ?? [];
    if (paths.length === 0) return false;
    let lastOwned = -1;
    paths.forEach((p, i) => {
      if ((p.toTerminal?.ownerRef ?? null) != null) lastOwned = i;
    });
    const tail = paths.slice(lastOwned + 1);
    return tail.length > 0 && tail.every((p) => (p.toTerminal?.ownerRef ?? null) == null);
  }).length;

  it('kontrola pomiaru: substrate ma >0 realnych ogonów otwartych (inaczej ten test nic nie dowodzi)', () => {
    expect(expectedTailRuns).toBeGreaterThan(0);
  });

  for (const lod of LODS) {
    it(`LOD ${lod}: dokładnie ${expectedTailRuns} słupków (1/ogon z ENM — zero fabrykacji), wyrocznie zielone`, () => {
      const scene = buildSceneV3(substrateEnm, lod);
      expect(ticksOf(scene)).toHaveLength(expectedTailRuns);
      expect(scene.segments.filter((s) => s.meta?.openTerminal === true)).toHaveLength(expectedTailRuns);
      expect(openTerminalGaps(scene)).toHaveLength(0);
      expect(sceneSegmentEndpointGaps(scene)).toHaveLength(0);
    });
  }
});
