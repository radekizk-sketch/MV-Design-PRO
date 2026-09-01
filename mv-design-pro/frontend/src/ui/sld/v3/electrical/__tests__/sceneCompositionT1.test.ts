/**
 * Scena SN na fixturze „Stacja B" (model z PEŁNĄ rozdzielnicą nN) —
 * architektura LV Domain Projection po B-02 (`docs/sld/
 * PROJEKCJA_SN_NN_PORTAL_V1.md`): JEDNA sieć obliczeniowa SN–TR–nN, DWIE
 * projekcje. Ten plik przypina, że:
 *  1. projekcja SN kończy tor na transformatorze T1 → zacisku nN (`#lv-bus`,
 *     kind='bus') → PORTALU; wnętrze rozdzielnicy nN (QF-TR1/QF-01/02/03/
 *     kable/odbiory/RGN-2) NIE jest elementem sceny SN;
 *  2. walidacja grafu elektrycznego obejmuje CAŁĄ sieć (SN + nN) niezależnie
 *     od projekcji: fixtura bazowa SLD_VALID; UNRESOLVED aparatu nN i mutacje
 *     topologiczne SN↔nN dają SLD_INVALID + ostrzeżenie w `stopNotes` — NIE
 *     cichy rysunek — mimo że aparat NIE jest rysowany w projekcji SN;
 *  3. DER za T1 (na szynie RGnN-1) POZOSTAJE widoczny — rząd DER na zacisku
 *     nN, za portalem (nigdy nie ukrywamy źródeł) — `sourceCoverageGaps` i
 *     `sourceConnectivityGaps` puste;
 *  4. determinizm SHA sceny Stacji B.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, Generator } from '../../../../types/enm';
import {
  allSourcesConnected,
  allSourcesVisible,
  buildSceneV3,
  sourceConnectivityGaps,
  sourceCoverageGaps,
  type SceneV3,
} from '../../scene/buildScene';
import { buildStacjaBFixture, STACJA_B_REFS } from './fixtures/stacjaB';

function withId(ref: string, rest: Record<string, unknown>): Record<string, unknown> {
  return { id: ref, ref_id: ref, tags: [], meta: {}, ...rest };
}

function branchByRef(enm: EnergyNetworkModel, ref: string): Record<string, unknown> {
  const branch = (enm.branches as unknown as Record<string, unknown>[]).find((b) => b.ref_id === ref);
  if (!branch) throw new Error(`gałąź ${ref} nie istnieje w fixturze — pomiar błędny`);
  return branch;
}

const NN_INTERIOR_REFS = [
  STACJA_B_REFS.qfTr1Ref,
  STACJA_B_REFS.qf01Ref,
  STACJA_B_REFS.qf02Ref,
  STACJA_B_REFS.qf03Ref,
  STACJA_B_REFS.cableQf01Ref,
  STACJA_B_REFS.cableQf02Ref,
  STACJA_B_REFS.cableQf03Ref,
  STACJA_B_REFS.rgn2StationRef,
] as const;

function ownerRefsOf(scene: SceneV3): ReadonlySet<string | undefined> {
  return new Set([...scene.symbols.map((s) => s.meta?.ownerRef), ...scene.segments.map((s) => s.meta?.ownerRef)]);
}

describe('Stacja B — projekcja SN: T1 → zacisk nN → portal; wnętrze nN NIE jest elementem sceny SN', () => {
  const enm = buildStacjaBFixture();
  const scene = buildSceneV3(enm, 2);

  it('transformator T1 jest symbolem sceny (elementKind="transformer", granica jawna domen SN/nN)', () => {
    const tr = scene.symbols.find((s) => s.symbolId === 'transformer2W' && s.meta?.elementKind === 'transformer');
    expect(tr).toBeTruthy();
  });

  it('zacisk nN (#lv-bus) jest kind="bus"/elementKind="bus" — pełnoprawna szyna nN stacji (punkt wyniku), nie artefakt layoutu', () => {
    const bus = scene.segments.find((s) => s.meta?.ownerRef === `${STACJA_B_REFS.stationRef}#lv-bus`);
    expect(bus?.meta?.kind).toBe('bus');
    expect(bus?.meta?.elementKind).toBe('bus');
  });

  it('DOKŁADNIE jeden portal stacji, z pionem kind="lv" od zacisku', () => {
    const portals = scene.symbols.filter(
      (s) => s.symbolId === 'lvPortal' && s.meta?.lvPortalStationRef === STACJA_B_REFS.stationRef,
    );
    expect(portals).toHaveLength(1);
    expect(portals[0].meta?.elementKind).toBe('lvPortal');
    const drop = scene.segments.find((s) => s.meta?.ownerRef === `${STACJA_B_REFS.stationRef}#lv-portal-drop`);
    expect(drop?.meta?.kind).toBe('lv');
  });

  it('ŻADEN element wnętrza nN (QF-TR1, QF-01/02/03, kable, RGN-2) nie jest symbolem ani segmentem sceny SN; zero aparatów nN', () => {
    const refs = ownerRefsOf(scene);
    for (const ref of NN_INTERIOR_REFS) expect(refs.has(ref), ref).toBe(false);
    expect(scene.symbols.filter((s) => s.symbolId === 'nnBreaker' || s.symbolId === 'nnFuseSwitch')).toHaveLength(0);
  });

  it('status walidacji grafu elektrycznego CAŁEJ sieci: SLD_VALID, zero naruszeń (fixtura bazowa poprawna)', () => {
    expect(scene.meta.electricalGraphStatus).toBe('SLD_VALID');
    expect(scene.meta.electricalGraphViolations).toEqual([]);
  });
});

describe('Stacja B — DER za T1 (na szynie RGnN-1): widoczny w rzędzie DER na zacisku nN (nigdy nie ukrywamy źródeł), nie „odcięty"', () => {
  function withDerOnRgnn1(): EnergyNetworkModel {
    const enm = buildStacjaBFixture();
    const generators = [...(enm.generators ?? [])] as Generator[];
    generators.push(
      withId(`gen/${STACJA_B_REFS.stationRef}/pv1`, {
        name: 'PV dachowe RGnN-1',
        bus_ref: STACJA_B_REFS.rgnn1BusRef,
        p_mw: 0.02,
        gen_type: 'pv_inverter',
        connection_variant: 'nn_side',
        station_ref: STACJA_B_REFS.stationRef,
      }) as unknown as Generator,
    );
    return { ...enm, generators };
  }

  it('kontrola: fixtura z DER produkuje DOKŁADNIE jeden symbol elementKind="der" w rzędzie na zacisku (za portalem)', () => {
    const scene = buildSceneV3(withDerOnRgnn1(), 2);
    const derSymbols = scene.symbols.filter((s) => s.meta?.elementKind === 'der');
    expect(derSymbols).toHaveLength(1);
    expect(scene.segments.some((s) => s.meta?.ownerRef === `${STACJA_B_REFS.stationRef}#der-row-bus`)).toBe(true);
    expect(sourceCoverageGaps(scene)).toEqual([]);
    expect(allSourcesVisible(scene)).toBe(true);
  });

  it('sourceConnectivityGaps([]) — DER na RGnN-1 (za T1) ma trasę do zacisku nN, NIE jest zgłoszony jako odcięty', () => {
    const scene = buildSceneV3(withDerOnRgnn1(), 2);
    expect(sourceConnectivityGaps(scene)).toEqual([]);
    expect(allSourcesConnected(scene)).toBe(true);
  });
});

describe('Stacja B — UNRESOLVED aparatu nN: walidacja grafu obejmuje domenę nN mimo że projekcja SN jej nie rysuje', () => {
  function withUnresolvedQf01(): EnergyNetworkModel {
    const enm = buildStacjaBFixture();
    const branch = branchByRef(enm, STACJA_B_REFS.qf01Ref);
    (branch as { catalog_namespace: string | null }).catalog_namespace = null;
    (branch as { materialized_params: Record<string, unknown> }).materialized_params = {};
    return enm;
  }

  it('status sceny SLD_INVALID z kodem UNRESOLVED_ACTIVE_APPARATUS (graf elektryczny CAŁEJ sieci)', () => {
    const scene = buildSceneV3(withUnresolvedQf01(), 2);
    expect(scene.meta.electricalGraphStatus).toBe('SLD_INVALID');
    expect(scene.meta.electricalGraphViolations.some((v) => v.code === 'UNRESOLVED_ACTIVE_APPARATUS')).toBe(true);
  });

  it('ostrzeżenie w stopNotes wskazuje ref aparatu (WHITE BOX, widoczne w audycie) — NIE cichy rysunek', () => {
    const scene = buildSceneV3(withUnresolvedQf01(), 2);
    expect(scene.meta.stopNotes.some((n) => n.includes(STACJA_B_REFS.qf01Ref))).toBe(true);
  });

  it('projekcja SN NADAL nie rysuje aparatu nN (ani rozpoznanego, ani nierozpoznanego) — portal jest niezmienny', () => {
    const scene = buildSceneV3(withUnresolvedQf01(), 2);
    expect(ownerRefsOf(scene).has(STACJA_B_REFS.qf01Ref)).toBe(false);
    expect(scene.symbols.filter((s) => s.symbolId === 'lvPortal')).toHaveLength(1);
  });
});

describe('Stacja B — mutacja topologiczna (QF-01 przepięty na szynę SN): SLD_INVALID + ostrzeżenie, NIE cichy rysunek', () => {
  function withQf01OnSnBus(): EnergyNetworkModel {
    const enm = buildStacjaBFixture();
    (branchByRef(enm, STACJA_B_REFS.qf01Ref).from_bus_ref as unknown) = STACJA_B_REFS.snBusRef;
    return enm;
  }

  it('scena NADAL się buduje (nie wyjątek/crash) — degradacja jawna, nie awaria cicha', () => {
    expect(() => buildSceneV3(withQf01OnSnBus(), 2)).not.toThrow();
  });

  it('status sceny SLD_INVALID z kodami EDGE_VOLTAGE_MISMATCH i LV_FEEDER_ON_MV_BUS', () => {
    const scene = buildSceneV3(withQf01OnSnBus(), 2);
    expect(scene.meta.electricalGraphStatus).toBe('SLD_INVALID');
    const codes = scene.meta.electricalGraphViolations.map((v) => v.code);
    expect(codes).toContain('EDGE_VOLTAGE_MISMATCH');
    expect(codes).toContain('LV_FEEDER_ON_MV_BUS');
  });

  it('ostrzeżenie widoczne w stopNotes', () => {
    const scene = buildSceneV3(withQf01OnSnBus(), 2);
    expect(scene.meta.stopNotes.some((n) => n.includes('EDGE_VOLTAGE_MISMATCH'))).toBe(true);
  });
});

describe('Stacja B — mutacja KIERUNEK ODWROTNY (aparat pola TRANSFORMATOROWE SN przepięty na szynę nN): SLD_INVALID (iloczyn: OBA kierunki pomyłki SN↔nN)', () => {
  function withSnFieldOnNnBus(): EnergyNetworkModel {
    const enm = buildStacjaBFixture();
    (branchByRef(enm, STACJA_B_REFS.snFieldBreakerTrRef).to_bus_ref as unknown) = STACJA_B_REFS.odbior1BusRef;
    return enm;
  }

  it('scena NADAL się buduje', () => {
    expect(() => buildSceneV3(withSnFieldOnNnBus(), 2)).not.toThrow();
  });

  it('status sceny SLD_INVALID z kodem MV_FIELD_ON_LV_BUS', () => {
    const scene = buildSceneV3(withSnFieldOnNnBus(), 2);
    expect(scene.meta.electricalGraphStatus).toBe('SLD_INVALID');
    expect(scene.meta.electricalGraphViolations.map((v) => v.code)).toContain('MV_FIELD_ON_LV_BUS');
  });

  it('ostrzeżenie widoczne w stopNotes', () => {
    const scene = buildSceneV3(withSnFieldOnNnBus(), 2);
    expect(scene.meta.stopNotes.some((n) => n.includes('MV_FIELD_ON_LV_BUS'))).toBe(true);
  });
});

describe('Stacja B — determinizm SHA sceny', () => {
  it('dwa biegi identycznego wejścia dają bajt-identyczną scenę (SHA + JSON pełny)', () => {
    const shaOf = (scene: SceneV3): string => createHash('sha256').update(JSON.stringify(scene)).digest('hex');
    const sceneA = buildSceneV3(buildStacjaBFixture(), 2);
    const sceneB = buildSceneV3(buildStacjaBFixture(), 2);
    expect(shaOf(sceneA)).toBe(shaOf(sceneB));
    expect(JSON.stringify(sceneA)).toBe(JSON.stringify(sceneB));
  });
});
