/**
 * PORTAL DOMENY nN — poziom SCENY (`buildSceneV3`), architektura LV Domain
 * Projection po B-02 (`docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md`).
 *
 * Przypięte na REALNEJ fixturze referencyjnej (53 stacje, 20/20 DER na nN)
 * i na fixturze „Stacja B" z PEŁNĄ rozdzielnicą nN w modelu:
 *  (1) L1/L2: KAŻDA stacja z zaciskiem nN (`#lv-bus`) ma DOKŁADNIE jeden
 *      portal; pion `#lv-portal-drop` ma kind='lv' i dotyka zacisku;
 *  (2) portal niesie tożsamość stacji (`meta.lvPortalStationRef`,
 *      `ownerRef` = `${stationRef}#lv-portal`, `elementKind='lvPortal'`);
 *  (3) ZERO wnętrza nN w projekcji SN — także gdy MODEL niesie pełną
 *      rozdzielnicę nN (Stacja B: QF-TR1/QF-01/02/03/kable/odbiory NIE są
 *      elementami sceny SN; graf elektryczny nadal waliduje CAŁĄ sieć);
 *  (4) źródła strony nN (20/20 na fixturze) POZOSTAJĄ widoczne w rzędzie DER
 *      na zacisku (nigdy nie ukrywamy źródeł) — `sourceCoverageGaps` puste;
 *  (5) L0: zero portali (blok zwinięty), kotwice stacji identyczne L0/L1/L2;
 *  (6) multi-TR: druga jednostka transformatorowa tej samej stacji ⇒ dwa
 *      symbole TR, dwa zejścia LV, JEDEN portal;
 *  (7) determinizm.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, Generator, Transformer } from '../../../../../types/enm';
import { lvPortalOwnerRef } from '../../compose/station';
import { buildStacjaBFixture, STACJA_B_REFS } from '../../electrical/__tests__/fixtures/stacjaB';
import { buildSceneV3, sourceCoverageGaps, type PreviewSymbol, type SceneLod, type SceneV3 } from '../buildScene';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

function portals(scene: SceneV3): readonly PreviewSymbol[] {
  return scene.symbols.filter((s) => s.symbolId === 'lvPortal');
}

function segmentsEndingWith(scene: SceneV3, suffix: string) {
  return scene.segments.filter((s) => (s.meta?.ownerRef ?? '').endsWith(suffix));
}

const NN_INTERIOR_SYMBOLS = new Set(['nnBreaker', 'nnFuseSwitch']);

describe('PORTAL nN — scena referencyjna (53 stacje, 20/20 DER na nN)', () => {
  for (const lod of [1, 2] as const) {
    it(`L${lod}: liczba portali == liczba zacisków nN (#lv-bus); każdy portal z tożsamością stacji i pionem kind='lv' NA zacisku`, () => {
      const scene = buildSceneV3(enm, lod);
      const lvBuses = segmentsEndingWith(scene, '#lv-bus');
      expect(lvBuses.length).toBeGreaterThan(40);
      const portalSymbols = portals(scene);
      expect(portalSymbols).toHaveLength(lvBuses.length);
      const drops = segmentsEndingWith(scene, '#lv-portal-drop');
      expect(drops).toHaveLength(lvBuses.length);
      for (const drop of drops) expect(drop.meta?.kind).toBe('lv');

      for (const portal of portalSymbols) {
        expect(portal.meta?.elementKind).toBe('lvPortal');
        const stationRef = portal.meta?.lvPortalStationRef;
        expect(stationRef).toBeTruthy();
        expect(portal.meta?.ownerRef).toBe(lvPortalOwnerRef(stationRef!));
        expect(portal.meta?.testId).toBe(`${lvPortalOwnerRef(stationRef!)}#lvPortal`);
        const lvBus = scene.segments.find((s) => s.meta?.ownerRef === `${stationRef}#lv-bus`)!;
        const drop = scene.segments.find((s) => s.meta?.ownerRef === `${stationRef}#lv-portal-drop`)!;
        expect(lvBus).toBeDefined();
        expect(drop).toBeDefined();
        expect(drop.points[0].y).toBe(lvBus.points[0].y);
        // Port `top` portalu = koniec pionu (ciągłość geometryczna).
        expect(drop.points[1].x).toBe(portal.x + 16);
        expect(drop.points[1].y).toBe(portal.y);
      }
    });

    it(`L${lod}: ZERO wnętrza nN w projekcji SN (aparaty nN) — źródła nN (20/20) widoczne w rzędach DER na zaciskach, zero luk pokrycia`, () => {
      const scene = buildSceneV3(enm, lod);
      expect(scene.symbols.filter((s) => NN_INTERIOR_SYMBOLS.has(s.symbolId))).toHaveLength(0);
      const derSymbols = scene.symbols.filter((s) => s.meta?.elementKind === 'der');
      expect(derSymbols.length).toBeGreaterThanOrEqual(20);
      expect(segmentsEndingWith(scene, '#der-row-bus').length).toBeGreaterThan(0);
      expect(sourceCoverageGaps(scene)).toEqual([]);
      // Każdy rząd DER (trunk + szyna rzędu) leży CAŁY na prawo od portalu
      // swojej stacji — zero przecięć z pionem portalu (fałszywy węzeł T).
      for (const portal of portals(scene)) {
        const stationRef = portal.meta!.lvPortalStationRef!;
        const rowBus = scene.segments.find((s) => s.meta?.ownerRef === `${stationRef}#der-row-bus`);
        const trunk = scene.segments.find((s) => s.meta?.ownerRef === `${stationRef}#der-row-trunk`);
        if (!rowBus || !trunk) continue;
        expect(Math.min(rowBus.points[0].x, rowBus.points[1].x)).toBeGreaterThanOrEqual(portal.x + 32 + 8);
        expect(trunk.points[0].x).toBeGreaterThanOrEqual(portal.x + 32 + 8);
      }
      // Zero rozciętych szyn rzędu DER (rozcięcie = przecięcie z innym odcinkiem).
      expect(scene.segments.filter((s) => (s.meta?.ownerRef ?? '').includes('#der-row-bus#tee-'))).toHaveLength(0);
    });
  }

  it('L0: zero portali i zero zacisków (blok zwinięty) — wejściem jest dwuklik w blok stacji', () => {
    const scene = buildSceneV3(enm, 0);
    expect(portals(scene)).toHaveLength(0);
    expect(segmentsEndingWith(scene, '#lv-bus')).toHaveLength(0);
  });

  it('kotwica stacji IDENTYCZNA L0/L1/L2 (portal nie przesuwa kotwic — KD-5/S1 „jedna kotwica")', () => {
    const anchors = (lod: SceneLod): Map<string, string> => {
      const scene = buildSceneV3(enm, lod);
      const m = new Map<string, string>();
      for (const label of scene.labels) {
        if (label.ownerKind === 'station-name' && label.ownerRef.endsWith('#name-row-0') && label.ownerRef.startsWith('stn/')) {
          m.set(label.ownerRef, `${label.rect.x + label.rect.width / 2},${label.rect.y},${label.rezerwacjaSzerokosci}`);
        }
      }
      return m;
    };
    const a0 = anchors(0);
    const a1 = anchors(1);
    const a2 = anchors(2);
    expect(a0.size).toBeGreaterThan(50);
    for (const [ref, pos] of a0) {
      expect(a1.get(ref), ref).toBe(pos);
      expect(a2.get(ref), ref).toBe(pos);
    }
  });

  it('determinizm: scena 2× identyczna na L1 i L2', () => {
    for (const lod of [1, 2] as const) {
      expect(JSON.stringify(buildSceneV3(enm, lod))).toBe(JSON.stringify(buildSceneV3(enm, lod)));
    }
  });
});

describe('PORTAL nN — Stacja B (model z PEŁNĄ rozdzielnicą nN): wnętrze nN żyje w projekcji nN, nie w SN', () => {
  const stacjaB = buildStacjaBFixture();
  const scene = buildSceneV3(stacjaB, 2);
  const stationRef = STACJA_B_REFS.stationRef;

  it('scena SN niesie transformator T1, zacisk nN (kind=bus) i DOKŁADNIE jeden portal stacji', () => {
    expect(scene.symbols.some((s) => s.symbolId === 'transformer2W' && s.meta?.elementKind === 'transformer')).toBe(true);
    const lvBus = scene.segments.find((s) => s.meta?.ownerRef === `${stationRef}#lv-bus`);
    expect(lvBus?.meta?.kind).toBe('bus');
    expect(lvBus?.meta?.elementKind).toBe('bus');
    const stationPortals = portals(scene).filter((p) => p.meta?.lvPortalStationRef === stationRef);
    expect(stationPortals).toHaveLength(1);
  });

  it('ŻADEN element wnętrza nN modelu (QF-TR1, QF-01/02/03, kable, RGN-2) NIE jest elementem sceny SN', () => {
    const ownerRefs = new Set([
      ...scene.symbols.map((s) => s.meta?.ownerRef),
      ...scene.segments.map((s) => s.meta?.ownerRef),
    ]);
    for (const ref of [
      STACJA_B_REFS.qfTr1Ref,
      STACJA_B_REFS.qf01Ref,
      STACJA_B_REFS.qf02Ref,
      STACJA_B_REFS.qf03Ref,
      STACJA_B_REFS.cableQf01Ref,
      STACJA_B_REFS.cableQf02Ref,
      STACJA_B_REFS.cableQf03Ref,
      STACJA_B_REFS.rgn2StationRef,
    ]) {
      expect(ownerRefs.has(ref), `${ref} nie może być elementem projekcji SN`).toBe(false);
    }
    expect(scene.symbols.filter((s) => NN_INTERIOR_SYMBOLS.has(s.symbolId))).toHaveLength(0);
  });

  it('graf elektryczny CAŁEJ sieci (SN–TR–nN) nadal walidowany: SLD_VALID, zero naruszeń — jedna sieć obliczeniowa, dwie projekcje', () => {
    expect(scene.meta.electricalGraphStatus).toBe('SLD_VALID');
    expect(scene.meta.electricalGraphViolations).toEqual([]);
  });

  it('DER na szynie RGnN-1 (za T1) ⇒ symbol DER w rzędzie na zacisku (za portalem), sourceCoverageGaps puste', () => {
    const generators = [...(stacjaB.generators ?? [])] as Generator[];
    generators.push({
      id: `gen/${stationRef}/pv1`,
      ref_id: `gen/${stationRef}/pv1`,
      tags: [],
      meta: {},
      name: 'PV dachowe RGnN-1',
      bus_ref: STACJA_B_REFS.rgnn1BusRef,
      p_mw: 0.02,
      gen_type: 'pv_inverter',
      connection_variant: 'nn_side',
      station_ref: stationRef,
    } as unknown as Generator);
    const withDer = buildSceneV3({ ...stacjaB, generators }, 2);
    const der = withDer.symbols.filter((s) => s.meta?.elementKind === 'der');
    expect(der).toHaveLength(1);
    const portal = portals(withDer).find((p) => p.meta?.lvPortalStationRef === stationRef)!;
    expect(der[0].x).toBeGreaterThanOrEqual(portal.x + 32 + 8);
    expect(sourceCoverageGaps(withDer)).toEqual([]);
  });

  it('MULTI-TR (dwa transformatory bez pola TR): 2 symbole TR, 2 zejścia LV do JEDNEGO zacisku, JEDEN portal, SLD_VALID', () => {
    // Ścieżka TR2W-BEZ-POLA (`implicitStationTransformers`): stacja bez pola
    // roli TR rysuje KAŻDY rekord `Transformer` stacji jako własną kolumnę —
    // zdejmujemy pole TR z fixtury (jak `buildScene.tr2wBezPola.test.ts::
    // bezPolaTr`) i dokładamy drugą jednostkę o tych samych terminalach.
    const out = JSON.parse(JSON.stringify(stacjaB)) as EnergyNetworkModel;
    const station = (out.substations ?? []).find((s) => s.ref_id === stationRef)!;
    const specs = ((station.meta as Record<string, unknown>).field_specs ?? []) as Record<string, unknown>[];
    const trSpec = specs.find((sp) => sp.bay_role === 'TR');
    expect(trSpec, 'fixtura Stacja B ma pole roli TR').toBeDefined();
    const removed = new Set<string>(
      (trSpec!.equipment_refs as string[]).filter((ref) => !ref.endsWith('/transformer')),
    );
    (station.meta as Record<string, unknown>).field_specs = specs.filter((sp) => sp.bay_role !== 'TR');
    (out as { branches: unknown[] }).branches = (out.branches ?? []).filter((b) => !removed.has(b.ref_id));
    (out as { bays: unknown[] }).bays = (out.bays ?? []).filter((b) => !removed.has(b.ref_id));
    const base = (out.transformers ?? []).find((t) => t.ref_id === STACJA_B_REFS.transformerRef)!;
    expect(base).toBeDefined();
    const secondRef = `${STACJA_B_REFS.transformerRef}2`;
    (out as { transformers: Transformer[] }).transformers = [
      ...(out.transformers ?? []),
      { ...base, id: secondRef, ref_id: secondRef, name: 'T2' } as Transformer,
    ];
    station.transformer_refs = [...(station.transformer_refs ?? []), secondRef];

    const multi = buildSceneV3(out, 2);
    // Transformatory TEJ stacji (GPZ ma własny TR WN/SN — poza pomiarem).
    const trs = multi.symbols.filter(
      (s) => s.symbolId === 'transformer2W' && s.meta?.elementKind === 'transformer' && (s.meta?.ownerRef ?? '').startsWith('stn/'),
    );
    expect(trs.length).toBe(2);
    const drops = multi.segments.filter((s) => (s.meta?.ownerRef ?? '').startsWith(`${stationRef}#lv-drop-`));
    expect(drops).toHaveLength(2);
    const lvBus = multi.segments.find((s) => s.meta?.ownerRef === `${stationRef}#lv-bus`)!;
    expect(lvBus).toBeDefined();
    for (const d of drops) expect(d.points[1].y).toBe(lvBus.points[0].y);
    const stationPortals = portals(multi).filter((p) => p.meta?.lvPortalStationRef === stationRef);
    expect(stationPortals).toHaveLength(1);
    // Portal NA OSI rdzenia zacisku — między dwoma portami LV (zero
    // dodatkowej szerokości stacji; jedna domena nN = jeden portal).
    const portXs = drops.map((d) => d.points[0].x);
    const portalCenter = stationPortals[0].x + 16;
    expect(portalCenter).toBeGreaterThan(Math.min(...portXs));
    expect(portalCenter).toBeLessThan(Math.max(...portXs));
    expect(multi.meta.electricalGraphStatus).toBe('SLD_VALID');
  });
});
