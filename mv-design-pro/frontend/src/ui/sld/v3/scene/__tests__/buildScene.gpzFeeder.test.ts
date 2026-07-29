/**
 * Feedery z pól GPZ — KANON DEDYKOWANYCH PÓL (dyrektywa właściciela,
 * 2026-07-17): z jednego pola liniowego NIGDY nie wychodzą dwa kable —
 * każde wyprowadzenie na sieć (magistrala i każdy feeder) ma WŁASNE,
 * dedykowane pole liniowe GPZ.
 *
 * Fixtury z REALNEGO backendu (po naprawie domeny —
 * `_allocate_gpz_line_field_for_branch` w `start_branch_segment_sn`
 * przydziela wolne pole albo tworzy NOWE dedykowane; relacja
 * pierwszoklasowa `corridor.meta.gpz_field_ref`):
 *  - `gpzFeeder.enm.json` — magistrala (stacja, pole 001) + feeder z
 *    WŁASNEGO pola 002 (utworzonego przydziałem) ze stacją;
 *  - `openBranch.enm.json` — feeder z własnego pola BEZ stacji (bieg
 *    otwarty §16-v3 do słupka terminalnego).
 *
 * Kontrakt:
 *  a) KAŻDY segment ENM KAŻDEGO korytarza obecny w scenie własnym
 *     `ownerRef` (zero niewidocznych elementów modelu);
 *  b) feeder wychodzi z DEDYKOWANEGO pola — jego pion startuje w INNEJ
 *     kolumnie X niż port pola magistrali (dwa kable z jednego pola =
 *     herezja; scena bez przydziału pomija ciąg ze stopNote zamiast
 *     rysować błędny układ);
 *  c) wyrocznie sceny zielone (§11.3/§16-v3/§11.2/§22.1) na wszystkich
 *     LOD; determinizm; ZERO kropek `junction` (feeder z własnego pola
 *     nie tworzy węzła rozgałęzienia na trasie magistrali).
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

  it('kanon dedykowanych pól: feeder z WŁASNEGO pola (inna kolumna X niż magistrala); styk zejścia feederu z kablem magistrali = węzeł T z kropką (0 luk)', () => {
    const scene = buildSceneV3(feederEnm, 2);
    // SCHEMAT-10 S7-P2 (V12K-137): zejście feederu z własnego pola i tak
    // przecina poziomy kabel magistrali — S7-P2 zamienia to na węzeł T
    // (kabel magistrali rozcięty w punkcie styku, kropka `junction`), zamiast
    // dawnego przecięcia/mostka. Golden przepisany: intencja „feeder z własnego
    // pola" żyje w asercjach kolumn X niżej; tu dowodzimy, że kropka jest na
    // REALNYM węźle tras (junction_dot_probe: 0 luk), a nie fabrykowana.
    expect(junctionDotGaps(scene, SYMBOL_DEFS)).toHaveLength(0);
    expect(scene.symbols.filter((s) => s.symbolId === 'junction').length).toBeGreaterThan(0);
    // Pion feederu startuje w porcie pola 002 — X różny od portu pola 001
    // (magistrali). Porty odczytane z PIERWSZYCH wierzchołków tras obu
    // ciągów (kawałek 0 każdego ciągu zaczyna się w porcie jego pola).
    const trunkRef = allCorridorSegmentRefs(feederEnm).find((r) => !r.includes('branch_segment'))!;
    const feederRef = allCorridorSegmentRefs(feederEnm).find((r) => r.includes('branch_segment'))!;
    const trunkStart = scene.segments.find((s) => s.meta?.ownerRef === trunkRef)!.points[0];
    const feederStart = scene.segments.find((s) => s.meta?.ownerRef === feederRef)!.points[0];
    expect(feederStart.x).not.toBe(trunkStart.x);
    // Relacja pierwszoklasowa w modelu: korytarz feederu wskazuje pole 002.
    const corridors = (feederEnm as {
      corridors?: ReadonlyArray<{ ref_id?: string; meta?: Record<string, unknown> }>;
    }).corridors ?? [];
    const feederCorridor = corridors.find((c) => (c.meta ?? {})['gpz_field_ref'] != null)!;
    expect(feederCorridor).toBeTruthy();
    expect(String(feederCorridor.meta!['gpz_field_ref'])).toMatch(/\/bay\/001\/002$/);
  });

  it('NEGATYW (wyrocznia gryzie): snapshot BEZ przydziału i bez wolnego pola ⇒ feeder POMINIĘTY ze stopNote (nigdy dwa kable z jednego pola)', () => {
    // Sabotaż modelu: zdejmij przydział z korytarza feederu i USUŃ pole 002 —
    // scena nie ma prawa dorysować feederu z pola magistrali.
    const sabotaged = JSON.parse(JSON.stringify(feederEnm)) as typeof feederEnm & {
      corridors?: Array<{ meta?: Record<string, unknown> }>;
      substations?: Array<{ ref_id?: string; meta?: { field_specs?: Array<{ field_ref?: string }> } }>;
    };
    for (const corridor of sabotaged.corridors ?? []) {
      if (corridor.meta) delete corridor.meta['gpz_field_ref'];
    }
    const gpz = (sabotaged.substations ?? []).find((s) => String(s.ref_id).startsWith('gpz/'))!;
    gpz.meta!.field_specs = (gpz.meta!.field_specs ?? []).filter(
      (f) => !String(f.field_ref).endsWith('/002'),
    );
    const scene = buildSceneV3(sabotaged, 2);
    const feederRef = allCorridorSegmentRefs(feederEnm).find((r) => r.includes('branch_segment'))!;
    expect(sceneSegmentOwnerRefs(scene)).not.toContain(feederRef);
    expect(
      ((scene.meta as { stopNotes?: readonly string[] }).stopNotes ?? []).some((n) =>
        n.includes('DEDYKOWANEGO pola liniowego'),
      ),
    ).toBe(true);
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
