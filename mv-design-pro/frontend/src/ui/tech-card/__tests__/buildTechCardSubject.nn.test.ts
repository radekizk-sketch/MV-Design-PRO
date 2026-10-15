/**
 * Karta techniczna — tożsamość elementów nN (karta OBIEKT-KABEL-NN). Iloczyn: rodzaj
 * (kabel nN / kabel SN / rozdzielnica nN / stacja SN/nN) × podmiot karty (rodzaj, etykieta,
 * akcje, kontekst akcji). Kabel nN i rozdzielnica nN nie dostają akcji ciągu SN.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { buildTechCardSubject } from '../buildTechCardSubject';

const MODEL = {
  buses: [
    { ref_id: 'sn-1', name: 'Szyna SN', voltage_kv: 15 },
    { ref_id: 'sn-2', name: 'Szyna SN 2', voltage_kv: 15 },
    { ref_id: 'nn-rg', name: 'RG nN', voltage_kv: 0.4 },
    { ref_id: 'nn-zk', name: 'Szyna ZK', voltage_kv: 0.4 },
  ],
  branches: [
    { id: 'kab-sn', ref_id: 'kab-sn', type: 'cable', name: 'Odcinek SN', length_km: 0.5, from_bus_ref: 'sn-1', to_bus_ref: 'sn-2', catalog_ref: null },
    { id: 'kab-nn', ref_id: 'kab-nn', type: 'cable', name: 'Kabel nN 1', length_km: 0.15, from_bus_ref: 'nn-rg', to_bus_ref: 'nn-zk', catalog_ref: 'kab_nn_4x120_al' },
  ],
  substations: [
    { id: 'st', ref_id: 'st', name: 'Stacja 1', station_type: 'mv_lv', bus_refs: ['sn-2', 'nn-rg'], transformer_refs: [] },
    { id: 'zk', ref_id: 'zk', name: 'ZK-1', station_type: 'rozdzielnica_nn', bus_refs: ['nn-zk'], transformer_refs: [] },
  ],
  bays: [],
  branch_points: [],
  generators: [],
  transformers: [],
  loads: [],
  sources: [],
} as unknown as EnergyNetworkModel;

const AKCJE_CIAGU_SN = /continue_trunk_segment_sn|insert_station_on_segment_sn|start_branch_segment_sn|insert_zksn_on_segment_sn|insert_section_switch_sn/;

function podmiot(id: string, type: string) {
  const s = buildTechCardSubject(MODEL, { id, type: type as never, name: id });
  expect(s).not.toBeNull();
  return s!;
}

describe('buildTechCardSubject — elementy nN', () => {
  it('kabel nN: rodzaj „kabel_nn", etykieta „Kabel nN", przedłużenie z szyny końca, bez akcji SN', () => {
    const s = podmiot('kab-nn', 'LineBranch');
    expect(s.kind).toBe('kabel_nn');
    expect(s.typeLabelPl).toBe('Kabel nN');
    expect(s.actions?.map((a) => a.id)).toEqual(['open_operation:add_nn_cable_segment']);
    expect(s.actions?.some((a) => AKCJE_CIAGU_SN.test(a.id))).toBe(false);
    expect(s.actionContexts?.['open_operation:add_nn_cable_segment']).toEqual({ bus_nn_ref: 'nn-zk' });
    expect(JSON.stringify(s.sections)).not.toMatch(/Kabel SN|SN\b/);
  });

  it('kabel SN: dotychczasowy podmiot odcinka SN z akcjami ciągu SN', () => {
    const s = podmiot('kab-sn', 'LineBranch');
    expect(s.kind).toBe('line_segment');
    expect(s.actions?.some((a) => a.id === 'open_operation:continue_trunk_segment_sn')).toBe(true);
  });

  it('rozdzielnica nN: rodzaj „rozdzielnica_nn", akcje strony nN z kontekstem szyny, bez rozdzielni SN', () => {
    const s = podmiot('zk', 'Station');
    expect(s.kind).toBe('rozdzielnica_nn');
    expect(s.typeLabelPl).toBe('Rozdzielnica nN');
    expect(s.actions?.map((a) => a.id)).toEqual([
      'open_operation:add_nn_outgoing_field',
      'open_operation:add_nn_cable_segment',
    ]);
    expect(s.actionContexts?.['open_operation:add_nn_outgoing_field']).toEqual({ station_ref: 'zk', bus_nn_ref: 'nn-zk' });
    expect(JSON.stringify(s.sections)).not.toMatch(/rozdzielni SN|Pola rozdzielni SN/);
    expect(JSON.stringify(s.sections)).toContain('Kabel nN 1');
  });

  it('stacja SN/nN: dotychczasowy podmiot stacji z akcjami ciągu SN', () => {
    const s = podmiot('st', 'Station');
    expect(s.kind).toBe('station');
    expect(s.actions?.some((a) => a.id === 'open_operation:continue_trunk_segment_sn')).toBe(true);
  });
});
