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
import { interiorCrossings, junctionDotGaps } from '../crossings';
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

  it('kanon dedykowanych pól: feeder z WŁASNEGO pola (inna kolumna X niż magistrala); zejście feederu przez kabel magistrali = skrzyżowanie bez połączenia (mostek), zero kropek T', () => {
    const scene = buildSceneV3(feederEnm, 2);
    // Karta UX-04/POLE-LINIOWE-WZORZEC (korekta właściciela 2026-10-29 pkt 8: każde połączenie
    // na kanwie ma odpowiednik w modelu). Feeder z pola 002 i magistrala z pola 001 to dwa
    // RÓŻNE pola GPZ — w modelu nie mają wspólnego węzła, więc przecięcie pionu feederu
    // z poziomem magistrali jest skrzyżowaniem bez połączenia (mostek §22.1), a nie węzłem T.
    // Dawna wersja tego testu (S7-P2, V12K-137) wymagała tu kropki `junction` — fikcyjnego
    // połączenia dwóch pól; intencja „feeder z własnego pola" zostaje w asercjach kolumn X
    // niżej, intencja „0 luk kropek" — w `junctionDotGaps`.
    const trunkRef = allCorridorSegmentRefs(feederEnm).find((r) => !r.includes('branch_segment'))!;
    const feederRef = allCorridorSegmentRefs(feederEnm).find((r) => r.includes('branch_segment'))!;
    expect(junctionDotGaps(scene, SYMBOL_DEFS)).toHaveLength(0);
    expect(scene.symbols.filter((s) => s.symbolId === 'junction')).toEqual([]);
    const przeciecia = interiorCrossings(scene.segments);
    expect(
      przeciecia.some((c) => c.vOwnerRef === feederRef && c.hOwnerRef === trunkRef),
      'pion feederu krzyżuje kabel magistrali (mostek), bez rozcięcia magistrali',
    ).toBe(true);
    expect(scene.segments.some((s) => (s.meta?.ownerRef ?? '').startsWith(`${trunkRef}#tee-`))).toBe(false);
    // Pion feederu startuje w porcie pola 002 — X różny od portu pola 001
    // (magistrali). Porty odczytane z PIERWSZYCH wierzchołków tras obu
    // ciągów (kawałek 0 każdego ciągu zaczyna się w porcie jego pola).
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
    };
    for (const corridor of sabotaged.corridors ?? []) {
      if (corridor.meta) delete corridor.meta['gpz_field_ref'];
    }
    const gpz = (sabotaged.substations ?? []).find((s) => String(s.ref_id).startsWith('gpz/'))!;
    sabotaged.bays = (sabotaged.bays ?? []).filter(
      (f) => !(f.substation_ref === gpz.ref_id && String(f.ref_id).endsWith('/002')),
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

// GPZ-PARYTET (predykaty parami): wyrównanie magistrali do GPZ liczone jest z
// przebiegu „pass1", a świat — z kompozycji wyrównanej. Od szerokości treści
// bloku (symbol źródła sieci ją poszerza) zależy łamanie tabeli „Pola GPZ",
// więc wysokość ramy i translacja końcowa. Oba przebiegi MUSZĄ dostać to samo
// wejście; inaczej port zaczepu magistrali GPZ ląduje o różnicę wysokości tabel
// obok osi magistrali (pomiar wstrzyknięcia: 80 j.św. na tej fiksturze).
// Iloczyn: źródło sieci w modelu (jest / brak) × LOD rozwinięty (1, 2).
describe('feedery z pól GPZ — oś magistrali = port pól GPZ (pass1 i kompozycja z jednego wejścia)', () => {
  const bezZrodla = { ...feederEnm, sources: [] } as EnergyNetworkModel;
  for (const [nazwa, enm] of [['ze źródłem sieci', feederEnm], ['bez źródła sieci', bezZrodla]] as const) {
    for (const lod of [1, 2] as const) {
      it(`${nazwa}, LOD ${lod}: zejścia pól GPZ i pól stacji magistrali zaczynają się na tej samej osi`, () => {
        const scene = buildSceneV3(enm, lod);
        const startY = (prefiks: string): number[] =>
          scene.segments
            .filter((s) => (s.meta?.ownerRef ?? '').startsWith(prefiks) && (s.meta?.ownerRef ?? '').endsWith('#descent'))
            .map((s) => s.points[0].y);
        // Identyfikatory bloków („…/substation", „…/station") → przestrzeń nazw
        // ich elementów (pola GPZ „…/bay/…", pola stacji „…/sn_field/…").
        const przestrzen = (id: string): string => id.slice(0, id.lastIndexOf('/'));
        const gpz = startY(`${przestrzen(scene.meta.gpzId!)}/bay/`);
        const stacja = startY(`${przestrzen(scene.meta.mainTrunkStationIds[0])}/sn_field/`);
        expect(gpz.length).toBeGreaterThan(0);
        expect(stacja.length).toBeGreaterThan(0);
        expect(new Set([...gpz, ...stacja])).toEqual(new Set([gpz[0]]));
      });
    }
  }
});
