/**
 * buildTechCardSubject — testy adaptera kontraktu karty technicznej.
 *
 * Pilnują, że adapter:
 *  - rozpoznaje wszystkie 5 podstawowych klas obiektów (line_segment,
 *    station, zksn, branch_pole, der),
 *  - nie publikuje surowych `seg/`, `ref_id`, ani UUID-like w nagłówku,
 *  - traktuje ZKSN jako rozdzielnię SN bez transformatora,
 *  - blokuje akcję „Wstaw słup rozgałęźny" na odcinku kablowym i
 *    akcję „Wstaw ZKSN" na odcinku napowietrznym.
 */

import { describe, it, expect } from 'vitest';

import { buildTechCardSubject } from '../buildTechCardSubject';
import type {
  BranchPointSN,
  Branch,
  EnergyNetworkModel,
  Generator,
  Substation,
} from '../../../types/enm';
import type { SelectedElement } from '../../types';

function snapshotWith(overrides: Partial<EnergyNetworkModel>): EnergyNetworkModel {
  return {
    header: { version: 'v1', case_id: 'case', generated_at: '2026-01-01T00:00:00Z' },
    buses: [],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    branch_points: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
    ...overrides,
  } as EnergyNetworkModel;
}

function selected(id: string, type: SelectedElement['type'], name = 'X'): SelectedElement {
  return { id, type, name };
}

describe('buildTechCardSubject', () => {
  it('zwraca null gdy snapshot lub selekcja są puste', () => {
    expect(buildTechCardSubject(null, selected('a', 'LineBranch'))).toBeNull();
    expect(buildTechCardSubject(snapshotWith({}), null)).toBeNull();
  });

  it('buduje subject dla odcinka kablowego SN i wystawia akcję wstawienia ZKSN', () => {
    const cable: Branch = {
      id: 'seg/abc123def456ZZZZ/cable_1',
      ref_id: 'seg/abc123def456ZZZZ/cable_1',
      type: 'cable',
      from_bus_ref: 'bus/1',
      to_bus_ref: 'bus/2',
      status: 'closed',
      length_km: 1.5,
      r_ohm_per_km: 0.2,
      x_ohm_per_km: 0.1,
      catalog_ref: 'XRUHAKXS-3x95',
    } as Branch;
    const snapshot = snapshotWith({
      branches: [cable],
      buses: [
        { id: 'bus/1', ref_id: 'bus/1', voltage_kv: 15, phase_system: '3ph', name: 'Szyna A' } as never,
        { id: 'bus/2', ref_id: 'bus/2', voltage_kv: 15, phase_system: '3ph', name: 'Szyna B' } as never,
      ],
    });

    const subject = buildTechCardSubject(snapshot, selected(cable.ref_id, 'LineBranch'));
    expect(subject).not.toBeNull();
    expect(subject!.kind).toBe('line_segment');
    expect(subject!.typeLabelPl).toBe('Odcinek kablowy SN');
    // Surowy identyfikator nie może wyciec do publicznego displayName.
    expect(subject!.displayName).not.toMatch(/seg\//);

    const insertZksn = subject!.actions?.find((action) => action.id.endsWith('insert_zksn_on_segment_sn'));
    expect(insertZksn).toBeTruthy();
    const insertPole = subject!.actions?.find((action) => action.id.endsWith('insert_branch_pole_on_segment_sn'));
    expect(insertPole).toBeUndefined();
  });

  it('na odcinku napowietrznym blokuje akcję wstawienia ZKSN', () => {
    const line: Branch = {
      id: 'seg/abc123def456ZZZZ/line_1',
      ref_id: 'seg/abc123def456ZZZZ/line_1',
      type: 'line_overhead',
      from_bus_ref: 'bus/1',
      to_bus_ref: 'bus/2',
      status: 'closed',
      length_km: 2,
      r_ohm_per_km: 0.3,
      x_ohm_per_km: 0.4,
    } as Branch;
    const snapshot = snapshotWith({ branches: [line] });
    const subject = buildTechCardSubject(snapshot, selected(line.ref_id, 'LineBranch'));
    expect(subject?.typeLabelPl).toBe('Odcinek linii napowietrznej SN');
    const insertZksn = subject!.actions?.find((action) => action.id.endsWith('insert_zksn_on_segment_sn'));
    expect(insertZksn).toBeUndefined();
    const insertPole = subject!.actions?.find((action) => action.id.endsWith('insert_branch_pole_on_segment_sn'));
    expect(insertPole).toBeTruthy();
  });

  it('buduje subject dla ZKSN bez transformatora i prezentuje porty', () => {
    const zksn: BranchPointSN = {
      id: 'bp/zksn/1',
      ref_id: 'bp/zksn/1',
      branch_point_type: 'zksn',
      parent_segment_id: 'seg/aaa/cable_1',
      bus_ref: 'bus/zksn',
      name: 'ZKSN-01',
      catalog_ref: 'ZPUE/ZKSN-15/630',
      source_mode: 'KATALOG',
      ports: {
        MAIN_IN: 'bus/in',
        MAIN_OUT: 'bus/out',
        BRANCH: ['bus/br/1', 'bus/br/2'], // ui-terminology-ignore
      },
      branch_occupied: { BRANCH_1: 'seg/branch1' },
      switch_state: 'closed',
      completeness_status: 'KOMPLETNY',
    } as BranchPointSN;
    const snapshot = snapshotWith({ branch_points: [zksn] });
    const subject = buildTechCardSubject(snapshot, selected(zksn.ref_id, 'ZKSN'));
    expect(subject?.kind).toBe('zksn');
    expect(subject?.typeLabelPl).toMatch(/ZKSN/);
    // Wszystkie sekcje karty NIE zawierają pola transformatorowego.
    const allFieldLabels = subject!.sections.flatMap((section) =>
      section.fields.map((field) => field.label.toLowerCase()),
    );
    expect(allFieldLabels.some((label) => label.includes('transformator'))).toBe(false);
    // Status mapowany z kompletności.
    expect(subject?.status).toBe('ok');
    // Wystawia jedną akcję wyprowadzenia odgałęzienia kablowego.
    const branchAction = subject!.actions?.find((action) => action.id.endsWith('start_branch_segment_sn'));
    expect(branchAction?.label).toMatch(/kablow/i);
  });

  it('buduje subject dla słupa rozgałęźnego z linii napowietrznej i wystawia akcję napowietrzną', () => {
    const pole: BranchPointSN = {
      id: 'bp/slup/1',
      ref_id: 'bp/slup/1',
      branch_point_type: 'branch_pole',
      parent_segment_id: 'seg/aaa/line_1',
      bus_ref: 'bus/slup',
      name: 'Słup rozgałęźny 12',
      ports: {
        MAIN_IN: 'bus/in',
        MAIN_OUT: 'bus/out',
        BRANCH: ['bus/br/1'], // ui-terminology-ignore
      },
      switch_state: 'closed',
      completeness_status: 'NIEKOMPLETNY',
    } as BranchPointSN;
    const snapshot = snapshotWith({ branch_points: [pole] });
    const subject = buildTechCardSubject(snapshot, selected(pole.ref_id, 'BranchPole'));
    expect(subject?.kind).toBe('branch_pole');
    expect(subject?.status).toBe('warning');
    const branchAction = subject!.actions?.find((action) => action.id.endsWith('start_branch_segment_sn'));
    expect(branchAction?.label).toMatch(/napowietrzn/i);
  });

  it('buduje subject dla stacji SN/nN z liczbą pól rozdzielni', () => {
    const station: Substation = {
      id: 'stn/1',
      ref_id: 'stn/1',
      name: 'Stacja przelotowa SN/nN',
      station_type: 'mv_lv',
      bus_refs: ['bus/sn', 'bus/nn'],
      transformer_refs: ['tr/1'],
    } as Substation;
    const snapshot = snapshotWith({
      substations: [station],
      bays: [
        { id: 'bay/in', ref_id: 'bay/in', bay_role: 'IN', substation_ref: 'stn/1', bus_ref: 'bus/sn', equipment_refs: [] } as never,
        { id: 'bay/out', ref_id: 'bay/out', bay_role: 'OUT', substation_ref: 'stn/1', bus_ref: 'bus/sn', equipment_refs: [] } as never,
        { id: 'bay/tr', ref_id: 'bay/tr', bay_role: 'TR', substation_ref: 'stn/1', bus_ref: 'bus/sn', equipment_refs: [] } as never,
      ],
    });

    const subject = buildTechCardSubject(snapshot, selected(station.ref_id, 'Station'));
    expect(subject?.kind).toBe('station');
    expect(subject?.typeLabelPl).toBe('Stacja SN/nN');
    const fields = subject!.sections.flatMap((section) => section.fields);
    expect(fields.find((field) => field.key === 'pole_we')?.value).toBe(1);
    expect(fields.find((field) => field.key === 'pole_wy')?.value).toBe(1);
    expect(fields.find((field) => field.key === 'pole_tr')?.value).toBe(1);
    expect(fields.find((field) => field.key === 'transformatory')?.value).toBe(1);
  });

  it('rozpoznaje GPZ jako kind=gpz', () => {
    const gpz: Substation = {
      id: 'gpz/main',
      ref_id: 'gpz/main',
      name: 'GPZ Główny',
      station_type: 'gpz',
      bus_refs: ['bus/110'],
      transformer_refs: [],
    } as Substation;
    const snapshot = snapshotWith({ substations: [gpz] });
    const subject = buildTechCardSubject(snapshot, selected(gpz.ref_id, 'Station'));
    expect(subject?.kind).toBe('gpz');
  });

  it('buduje subject DER (PV) z mocą znamionową', () => {
    const pv: Generator = {
      id: 'gen/pv/1',
      ref_id: 'gen/pv/1',
      name: 'Falownik PV ABB',
      bus_ref: 'bus/nn',
      p_mw: 0.5,
      gen_type: 'pv_inverter',
      connection_variant: 'nn_side',
      nc_rfg_module: 'A',
    } as Generator;
    const snapshot = snapshotWith({ generators: [pv] });
    const subject = buildTechCardSubject(snapshot, selected(pv.ref_id, 'PVInverter'));
    expect(subject?.kind).toBe('der');
    expect(subject?.typeLabelPl).toBe('Falownik PV');
    const fields = subject!.sections.flatMap((section) => section.fields);
    expect(fields.find((field) => field.key === 'p_mw')?.value).toBe(0.5);
    expect(fields.find((field) => field.key === 'modul_nc_rfg')?.value).toBe('A');
    // Bez `meta.control_mode` — brak sekcji regulacji Q (zero fantomu: nic do pokazania).
    expect(fields.find((field) => field.key === 'tryb_regulacji_q')).toBeUndefined();
  });

  it.each([
    ['STALY_COS_PHI', { control_mode: 'STALY_COS_PHI', cos_phi: 0.93 }, 'cos_phi_nastawa', 0.93],
    [
      'Q_OD_U',
      { control_mode: 'Q_OD_U', qu_slope_pu_per_pu: 4.5 },
      'nachylenie_regulacji',
      4.5,
    ],
    [
      'REGULACJA_NAPIECIA',
      { control_mode: 'REGULACJA_NAPIECIA', u_set_pu: 1.02 },
      'u_set_pu',
      1.02,
    ],
  ] as const)(
    'karta techniczna DER pokazuje tryb regulacji Q i jego nastawę — %s (karta CV-4.1b, A3-04)',
    (controlMode, meta, pomocniczyKlucz, pomocniczaWartosc) => {
      const pv: Generator = {
        id: 'gen/pv/2',
        ref_id: 'gen/pv/2',
        name: 'Falownik PV regulowany',
        bus_ref: 'bus/nn',
        p_mw: 0.5,
        gen_type: 'pv_inverter',
        connection_variant: 'nn_side',
        meta,
      } as Generator;
      const snapshot = snapshotWith({ generators: [pv] });
      const subject = buildTechCardSubject(snapshot, selected(pv.ref_id, 'PVInverter'));
      const fields = subject!.sections.flatMap((section) => section.fields);
      expect(fields.find((field) => field.key === 'tryb_regulacji_q')?.value).toBeTruthy();
      expect(fields.find((field) => field.key === pomocniczyKlucz)?.value).toBe(pomocniczaWartosc);
    },
  );

  it('karta techniczna DER: control_mode WYLACZONE nie pokazuje nastawy pomocniczej', () => {
    const pv: Generator = {
      id: 'gen/pv/3',
      ref_id: 'gen/pv/3',
      name: 'Falownik PV bez regulacji',
      bus_ref: 'bus/nn',
      p_mw: 0.5,
      gen_type: 'pv_inverter',
      connection_variant: 'nn_side',
      meta: { control_mode: 'WYLACZONE' },
    } as Generator;
    const snapshot = snapshotWith({ generators: [pv] });
    const subject = buildTechCardSubject(snapshot, selected(pv.ref_id, 'PVInverter'));
    const fields = subject!.sections.flatMap((section) => section.fields);
    expect(fields.find((field) => field.key === 'tryb_regulacji_q')?.value).toBe('Bez regulacji');
    expect(fields.find((field) => field.key === 'cos_phi_nastawa')).toBeUndefined();
    expect(fields.find((field) => field.key === 'nachylenie_regulacji')).toBeUndefined();
    expect(fields.find((field) => field.key === 'u_set_pu')).toBeUndefined();
  });

  it('semantyczna klasyfikacja MV_OVERHEAD_SEGMENT nadpisuje branch.type=cable', () => {
    const mismatchedBranch: Branch = {
      id: 'seg/migracja_test',
      ref_id: 'seg/migracja_test',
      // dane w branch.type = cable, ale semantyka selekcji mówi „napowietrzny"
      type: 'cable',
      from_bus_ref: 'bus/1',
      to_bus_ref: 'bus/2',
      status: 'closed',
      length_km: 1,
      r_ohm_per_km: 0.2,
      x_ohm_per_km: 0.1,
    } as Branch;
    const snapshot = snapshotWith({ branches: [mismatchedBranch] });
    const subject = buildTechCardSubject(snapshot, {
      ...selected(mismatchedBranch.ref_id, 'LineBranch'),
      semanticElementKind: 'MV_OVERHEAD_SEGMENT',
    });
    expect(subject?.typeLabelPl).toBe('Odcinek linii napowietrznej SN');
    // Akcja musi pasować do semantyki (słup), nie do branch.type.
    const insertPole = subject!.actions?.find((action) => action.id.endsWith('insert_branch_pole_on_segment_sn'));
    expect(insertPole).toBeTruthy();
    const insertZksn = subject!.actions?.find((action) => action.id.endsWith('insert_zksn_on_segment_sn'));
    expect(insertZksn).toBeUndefined();
  });

  it('nigdy nie publikuje surowego ref_id w publicznym displayName / typeLabel', () => {
    const noisySegment: Branch = {
      id: 'seg/9aa9bb88cc77dd66ee55ff44/line_1',
      ref_id: 'seg/9aa9bb88cc77dd66ee55ff44/line_1',
      type: 'cable',
      from_bus_ref: 'bus/1',
      to_bus_ref: 'bus/2',
      status: 'closed',
      length_km: 1,
      r_ohm_per_km: 0.2,
      x_ohm_per_km: 0.1,
    } as Branch;
    const snapshot = snapshotWith({ branches: [noisySegment] });
    const subject = buildTechCardSubject(snapshot, selected(noisySegment.ref_id, 'LineBranch'));
    expect(subject?.displayName).not.toMatch(/seg\//);
    expect(subject?.typeLabelPl).not.toMatch(/seg\//);
  });
});
