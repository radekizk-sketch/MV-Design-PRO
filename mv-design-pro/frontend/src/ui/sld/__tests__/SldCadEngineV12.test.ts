import { describe, expect, it } from 'vitest';

import {
  createSldCadEngineV12Graph,
  createSldPrintProfile,
  extractSldGeometrySignature,
  projectEnmToSldCadV12,
  validateSldCadGraph,
  voltageDomainFromKv,
} from '../SldCadEngineV12';

const baseSnapshot = {
  header: { hash_sha256: 'snap-cad-v12' },
  buses: [
    { ref_id: 'bus-gpz-sn', id: 'bus-gpz-sn', name: 'Szyna GPZ 15 kV', voltage_kv: 15 },
    { ref_id: 'bus-st-sn', id: 'bus-st-sn', name: 'Szyna stacji 15 kV', voltage_kv: 15 },
    { ref_id: 'bus-st-nn', id: 'bus-st-nn', name: 'Szyna nN 0,4 kV', voltage_kv: 0.4 },
  ],
  sources: [
    { ref_id: 'src-gpz', id: 'src-gpz', name: 'GPZ Konarzewo', bus_ref: 'bus-gpz-sn' },
  ],
  branches: [
    {
      ref_id: 'seg-sn-1',
      id: 'seg-sn-1',
      name: 'Odcinek kablowy SN',
      type: 'cable',
      from_bus_ref: 'bus-gpz-sn',
      to_bus_ref: 'bus-st-sn',
      status: 'closed',
      length_km: 1,
      r_ohm_per_km: 0.1,
      x_ohm_per_km: 0.08,
    },
  ],
  transformers: [
    {
      ref_id: 'tr-sn-nn-1',
      id: 'tr-sn-nn-1',
      name: 'Transformator SN/nN',
      hv_bus_ref: 'bus-st-sn',
      lv_bus_ref: 'bus-st-nn',
      sn_mva: 0.63,
      uhv_kv: 15,
      ulv_kv: 0.4,
      uk_percent: 6,
      pk_kw: 6,
    },
  ],
  loads: [
    { ref_id: 'load-nn-1', id: 'load-nn-1', name: 'Obciazenie nN', bus_ref: 'bus-st-nn', p_mw: 0.1, q_mvar: 0.02, model: 'pq' },
  ],
  generators: [],
  substations: [],
  bays: [
    { ref_id: 'bay-out-1', id: 'bay-out-1', name: 'Pole liniowe SN', bay_role: 'OUT', substation_ref: 'gpz-1', bus_ref: 'bus-gpz-sn', equipment_refs: [] },
  ],
  junctions: [],
  corridors: [],
  measurements: [],
  protection_assignments: [],
  branch_points: [],
  logical_views: { trunks: [], branches: [], secondary_connectors: [], terminals: [] },
} as any;

describe('SldCadEngineV12', () => {
  it('buduje graf CAD z refId i portami domen napieciowych dla GPZ, pola, odcinka i transformatora', () => {
    const graph = createSldCadEngineV12Graph(baseSnapshot);

    expect(graph.nodes.some((node) => node.refId === 'bus-gpz-sn' && node.kind === 'BUSBAR')).toBe(true);
    expect(graph.nodes.some((node) => node.refId === 'bay-out-1' && node.kind === 'BAY_SN')).toBe(true);
    expect(graph.nodes.some((node) => node.refId === 'seg-sn-1' && node.kind === 'SEGMENT_SN')).toBe(true);
    expect(graph.nodes.some((node) => node.refId === 'tr-sn-nn-1' && node.kind === 'TRANSFORMER')).toBe(true);
    expect(graph.ports.every((port) => Boolean(port.ownerRefId) && Boolean(port.voltageDomain))).toBe(true);
    expect(graph.ports.some((port) => port.id === 'bay-out-1:primary' && port.role === 'BAY_SN_OUT')).toBe(true);
    expect(validateSldCadGraph(graph).every((result) => result.allowed)).toBe(true);
  });

  it('blokuje krawedz SN-nN, jezeli odcinek probuje ominac transformator', () => {
    const graph = createSldCadEngineV12Graph({
      ...baseSnapshot,
      branches: [
        {
          ...baseSnapshot.branches[0],
          ref_id: 'seg-bledny-sn-nn',
          id: 'seg-bledny-sn-nn',
          from_bus_ref: 'bus-gpz-sn',
          to_bus_ref: 'bus-st-nn',
        },
      ],
      transformers: [],
    });

    const blocked = validateSldCadGraph(graph).find((result) => result.code === 'SLD-VOLTAGE-001');
    expect(blocked).toMatchObject({
      allowed: false,
      severity: 'blokada',
    });
  });

  it('obsluguje transformator WN-SN w pelnym GPZ jako jawne sprzezenie domen', () => {
    const graph = createSldCadEngineV12Graph({
      ...baseSnapshot,
      buses: [
        { ref_id: 'bus-wn', id: 'bus-wn', name: 'Siec WN 110 kV', voltage_kv: 110 },
        { ref_id: 'bus-sn', id: 'bus-sn', name: 'Szyna GPZ 15 kV', voltage_kv: 15 },
      ],
      branches: [],
      transformers: [
        {
          ...baseSnapshot.transformers[0],
          ref_id: 'tr-wn-sn-1',
          id: 'tr-wn-sn-1',
          name: 'Transformator WN/SN',
          hv_bus_ref: 'bus-wn',
          lv_bus_ref: 'bus-sn',
          uhv_kv: 110,
          ulv_kv: 15,
        },
      ],
      sources: [],
      loads: [],
      bays: [],
    });

    const coupling = graph.edges.find((edge) => edge.id === 'tr-wn-sn-1:coupling');
    expect(coupling?.validation).toMatchObject({
      allowed: true,
      code: 'SLD-VOLTAGE-OK',
    });
  });

  it('wyznacza LOD, profil wydruku i nie zmienia geometrii po wlaczeniu wynikow', () => {
    const normal = projectEnmToSldCadV12(baseSnapshot, baseSnapshot.logical_views, { zoom: 1 });
    const results = projectEnmToSldCadV12(baseSnapshot, baseSnapshot.logical_views, { zoom: 1, hasActiveResults: true });

    expect(normal.lodLevel).toBe('LOD-4');
    expect(results.lodLevel).toBe('LOD-6');
    expect(createSldPrintProfile()).toMatchObject({
      name: 'techniczny-jasny',
      background: '#ffffff',
    });
    expect(extractSldGeometrySignature(results)).toEqual(extractSldGeometrySignature(normal));
  });

  it('mapuje domeny napieciowe zgodnie z kanonem WN/SN/nN', () => {
    expect(voltageDomainFromKv(110)).toBe('WN');
    expect(voltageDomainFromKv(15)).toBe('SN');
    expect(voltageDomainFromKv(0.4)).toBe('NN');
  });
});
