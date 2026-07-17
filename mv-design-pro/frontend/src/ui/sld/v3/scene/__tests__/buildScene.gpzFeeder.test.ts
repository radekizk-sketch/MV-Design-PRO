/**
 * Feedery z pól GPZ (2026-07-17, odbiór „100% klasy przemysłowej"):
 * odgałęzienie startujące z pola GPZ (`start_branch_segment_sn` z `field_ref`
 * GPZ) — dotąd NIEWIDOCZNE (stopNote „poza zakresem F6a"), mimo że GPZ z N
 * feederami to STANDARDOWA topologia sieci SN.
 *
 * Fixtury z REALNEGO backendu (te same domain-ops co e2e flex):
 *  - `gpzFeeder.enm.json` — magistrala (stacja) + feeder z pola GPZ (stacja);
 *    model niesie JEDNO pole liniowe GPZ (`gpz_line_fields_count: 1`) —
 *    feeder dzieli pole z magistralą ⇒ T-zaczep na trasie magistrali z
 *    KROPKĄ węzłową §22.1 (realny węzeł ENM: wspólna szyna `from_bus_ref`).
 *  - `openBranch.enm.json` — feeder z pola GPZ BEZ stacji (bieg otwarty
 *    §16-v3 do słupka terminalnego).
 *
 * Kontrakt:
 *  a) KAŻDY segment ENM KAŻDEGO korytarza (magistrala + feedery) obecny w
 *     scenie własnym `ownerRef` — to jest wprost asercja „zero niewidocznych
 *     elementów modelu"; regresja (powrót stopNote) obcina ją natychmiast.
 *  b) T-zaczep wspólnego pola niesie kropkę `junction` (§22.1 — bez niej
 *     `junction_dot_probe` zgłasza `rozgalezienie-bez-kropki`, pomiar
 *     w trakcie implementacji: 1 luka przed dodaniem kropki).
 *  c) Wyrocznie sceny zielone (§11.3 port_probe, §16-v3 openTerminal,
 *     §11.2 grid, §22.1 junction_dot) na wszystkich LOD; determinizm.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  allSceneGeometryOnGrid,
  buildSceneV3,
  openTerminalGaps,
  sceneSegmentEndpointGaps,
  type SceneLod,
  type SceneV3,
} from '../buildScene';
import { junctionDotGaps } from '../crossings';
import { SYMBOL_DEFS } from '../../symbols/defs';

const here = dirname(fileURLToPath(import.meta.url));

function loadEnm(name: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(resolve(here, 'fixtures', name), 'utf8')) as {
    readonly enm: EnergyNetworkModel;
  }).enm;
}

const feederEnm = loadEnm('gpzFeeder.enm.json');
const openBranchEnm = loadEnm('openBranch.enm.json');

const LODS: readonly SceneLod[] = [0, 1, 2];

function allCorridorSegmentRefs(enm: EnergyNetworkModel): readonly string[] {
  const corridors = (enm as {
    corridors?: ReadonlyArray<{ ordered_segment_refs?: readonly string[] }>;
  }).corridors ?? [];
  return corridors.flatMap((c) => c.ordered_segment_refs ?? []);
}

function sceneSegmentOwnerRefs(scene: SceneV3): readonly string[] {
  return scene.segments
    .map((s) => s.meta?.ownerRef)
    .filter((r): r is string => r != null && r.startsWith('seg/'));
}

describe('feedery z pól GPZ — gpzFeeder.enm (wspólne pole, stacje na obu ciągach)', () => {
  const refs = allCorridorSegmentRefs(feederEnm);

  it('fixtura: 2 korytarze × 2 segmenty (kontrola wejścia)', () => {
    expect(refs).toHaveLength(4);
    expect(refs.some((r) => r.includes('branch_segment'))).toBe(true);
  });

  for (const lod of LODS) {
    it(`LOD ${lod}: KAŻDY segment ENM obu korytarzy w scenie własnym ownerRef + wyrocznie zielone`, () => {
      const scene = buildSceneV3(feederEnm, lod);
      const sceneRefs = sceneSegmentOwnerRefs(scene);
      for (const ref of refs) expect(sceneRefs, `brak ${ref}`).toContain(ref);
      expect(sceneSegmentEndpointGaps(scene)).toHaveLength(0);
      expect(openTerminalGaps(scene)).toHaveLength(0);
      expect(allSceneGeometryOnGrid(scene)).toBe(true);
      expect(junctionDotGaps(scene, SYMBOL_DEFS)).toHaveLength(0);
      // Obie stacje (magistrali i feederu) narysowane.
      expect(scene.meta.stationCount).toBe(2);
    });
  }

  it('T-zaczep wspólnego pola: DOKŁADNIE jedna kropka węzłowa junction (§22.1)', () => {
    const scene = buildSceneV3(feederEnm, 2);
    const dots = scene.symbols.filter((s) => s.symbolId === 'junction');
    expect(dots).toHaveLength(1);
    // NEGATYW (wyrocznia gryzie): zdjęcie kropki ⇒ junction_dot_probe czerwone
    // (T-zaczep feederu na trasie magistrali to realny węzeł rozgałęzienia).
    const sabotaged: SceneV3 = {
      ...scene,
      symbols: scene.symbols.filter((s) => s.symbolId !== 'junction'),
    };
    const gaps = junctionDotGaps(sabotaged, SYMBOL_DEFS);
    expect(gaps.some((g) => g.reason === 'rozgalezienie-bez-kropki')).toBe(true);
  });

  it('determinizm: dwa wywołania ⇒ identyczny JSON (każdy LOD)', () => {
    for (const lod of LODS) {
      expect(JSON.stringify(buildSceneV3(feederEnm, lod))).toBe(JSON.stringify(buildSceneV3(feederEnm, lod)));
    }
  });
});

describe('feedery z pól GPZ — openBranch.enm (feeder otwarty, bez stacji)', () => {
  for (const lod of LODS) {
    it(`LOD ${lod}: feeder otwarty z pola GPZ widoczny (segment + słupek), wyrocznie zielone`, () => {
      const scene = buildSceneV3(openBranchEnm, lod);
      const sceneRefs = sceneSegmentOwnerRefs(scene);
      const feederRef = allCorridorSegmentRefs(openBranchEnm).find((r) => r.includes('branch_segment'))!;
      expect(feederRef).toBeTruthy();
      expect(sceneRefs).toContain(feederRef);
      const feederRun = scene.segments.find((s) => s.meta?.ownerRef === feederRef);
      expect(feederRun?.meta?.openTerminal).toBe(true);
      expect(sceneSegmentEndpointGaps(scene)).toHaveLength(0);
      expect(openTerminalGaps(scene)).toHaveLength(0);
      expect(junctionDotGaps(scene, SYMBOL_DEFS)).toHaveLength(0);
    });
  }
});
