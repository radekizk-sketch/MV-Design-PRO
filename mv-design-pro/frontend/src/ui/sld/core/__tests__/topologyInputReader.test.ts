/**
 * topologyInputReader.test.ts — Tests for ENM → TopologyInput reading,
 * focusing on PV/BESS connection variant validation (KROK 4).
 */
import { describe, it, expect } from 'vitest';
import { readTopologyFromENM } from '../topologyInputReader';
import type { EnergyNetworkModel, Generator as ENMGenerator } from '../../../../types/enm';

// =============================================================================
// HELPERS
// =============================================================================

function minimalENM(overrides?: {
  generators?: ENMGenerator[];
  transformers?: EnergyNetworkModel['transformers'];
  substations?: EnergyNetworkModel['substations'];
}): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'Test ENM',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      revision: 1,
      hash_sha256: 'abc123',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: [
      { id: 'uuid-bus-sn', ref_id: 'bus_sn', name: 'Szyna SN', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} },
    ],
    branches: [],
    transformers: overrides?.transformers ?? [],
    sources: [],
    loads: [],
    generators: overrides?.generators ?? [],
    substations: overrides?.substations ?? [],
    bays: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  };
}

function pvGen(overrides?: Partial<ENMGenerator>): ENMGenerator {
  return {
    id: 'uuid-gen-pv',
    ref_id: 'gen_pv_1',
    name: 'PV Farma',
    tags: [],
    meta: {},
    bus_ref: 'bus_sn',
    p_mw: 5,
    gen_type: 'pv_inverter',
    connection_variant: null,
    blocking_transformer_ref: null,
    station_ref: null,
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('readTopologyFromENM — PV/BESS connection variant validation', () => {
  it('PV without connection_variant → fixAction generator.connection_variant_missing', () => {
    const enm = minimalENM({ generators: [pvGen()] });
    const result = readTopologyFromENM(enm);
    const fix = result.fixActions.find(f => f.code === 'generator.connection_variant_missing');
    expect(fix).toBeDefined();
    expect(fix!.elementRef).toBe('gen_pv_1');
  });

  it('PV with nn_side + valid station_ref → no variant FixAction', () => {
    const enm = minimalENM({
      generators: [pvGen({ connection_variant: 'nn_side', station_ref: 'sta_1' })],
      substations: [{
        id: 'uuid-sta', ref_id: 'sta_1', name: 'Stacja SN/nN', tags: [], meta: {},
        station_type: 'mv_lv', bus_refs: ['bus_sn'], transformer_refs: [],
      }],
    });
    const result = readTopologyFromENM(enm);
    const variantFix = result.fixActions.find(f => f.code === 'generator.connection_variant_missing');
    expect(variantFix).toBeUndefined();
  });

  it('PV with nn_side but missing station_ref → fixAction generator.station_ref_missing', () => {
    const enm = minimalENM({
      generators: [pvGen({ connection_variant: 'nn_side', station_ref: null })],
    });
    const result = readTopologyFromENM(enm);
    const fix = result.fixActions.find(f => f.code === 'generator.station_ref_missing');
    expect(fix).toBeDefined();
  });

  it('PV with nn_side but invalid station_ref → fixAction generator.station_ref_invalid', () => {
    const enm = minimalENM({
      generators: [pvGen({ connection_variant: 'nn_side', station_ref: 'nonexistent' })],
      substations: [{
        id: 'uuid-sta', ref_id: 'sta_other', name: 'Inna Stacja', tags: [], meta: {},
        station_type: 'mv_lv', bus_refs: [], transformer_refs: [],
      }],
    });
    const result = readTopologyFromENM(enm);
    const fix = result.fixActions.find(f => f.code === 'generator.station_ref_invalid');
    expect(fix).toBeDefined();
  });

  it('PV with block_transformer + valid ref → no FixAction', () => {
    const enm = minimalENM({
      generators: [pvGen({ connection_variant: 'block_transformer', blocking_transformer_ref: 'tr_block_1' })],
      transformers: [{
        id: 'uuid-tr', ref_id: 'tr_block_1', name: 'TR blokowy', tags: [], meta: {},
        hv_bus_ref: 'bus_sn', lv_bus_ref: 'bus_sn',
        sn_mva: 1, uhv_kv: 15, ulv_kv: 0.4, uk_percent: 6, pk_kw: 10,
      }],
    });
    const result = readTopologyFromENM(enm);
    const blockTrFix = result.fixActions.find(f => f.code === 'generator.block_transformer_missing');
    expect(blockTrFix).toBeUndefined();
    const invalidFix = result.fixActions.find(f => f.code === 'generator.block_transformer_invalid');
    expect(invalidFix).toBeUndefined();
  });

  it('PV with block_transformer but missing ref → fixAction generator.block_transformer_missing', () => {
    const enm = minimalENM({
      generators: [pvGen({ connection_variant: 'block_transformer', blocking_transformer_ref: null })],
    });
    const result = readTopologyFromENM(enm);
    const fix = result.fixActions.find(f => f.code === 'generator.block_transformer_missing');
    expect(fix).toBeDefined();
  });

  it('PV with block_transformer but invalid ref → fixAction generator.block_transformer_invalid', () => {
    const enm = minimalENM({
      generators: [pvGen({ connection_variant: 'block_transformer', blocking_transformer_ref: 'nonexistent' })],
      transformers: [{
        id: 'uuid-tr', ref_id: 'tr_other', name: 'Inny TR', tags: [], meta: {},
        hv_bus_ref: 'bus_sn', lv_bus_ref: 'bus_sn',
        sn_mva: 1, uhv_kv: 15, ulv_kv: 0.4, uk_percent: 6, pk_kw: 10,
      }],
    });
    const result = readTopologyFromENM(enm);
    const fix = result.fixActions.find(f => f.code === 'generator.block_transformer_invalid');
    expect(fix).toBeDefined();
  });

  it('BESS without connection_variant → fixAction', () => {
    const enm = minimalENM({
      generators: [pvGen({ ref_id: 'gen_bess_1', name: 'BESS', gen_type: 'bess' })],
    });
    const result = readTopologyFromENM(enm);
    const fix = result.fixActions.find(f => f.code === 'generator.connection_variant_missing');
    expect(fix).toBeDefined();
  });

  it('FW DFIG without connection_variant → fixAction', () => {
    const enm = minimalENM({
      generators: [pvGen({ ref_id: 'gen_fw_dfig_1', name: 'FW DFIG', gen_type: 'fw_dfig' })],
    });
    const result = readTopologyFromENM(enm);
    const fix = result.fixActions.find(f => f.code === 'generator.connection_variant_missing');
    expect(fix).toBeDefined();
    expect(fix!.elementRef).toBe('gen_fw_dfig_1');
  });

  it('FW PMSG propagates precise generator kind', () => {
    const enm = minimalENM({
      generators: [pvGen({
        ref_id: 'gen_fw_pmsg_1',
        name: 'FW PMSG',
        gen_type: 'fw_pmsg',
        connection_variant: 'block_transformer',
        blocking_transformer_ref: 'tr_blk',
      })],
      transformers: [{
        id: 'uuid-tr', ref_id: 'tr_blk', name: 'TR blk', tags: [], meta: {},
        hv_bus_ref: 'bus_sn', lv_bus_ref: 'bus_sn',
        sn_mva: 1, uhv_kv: 15, ulv_kv: 0.4, uk_percent: 6, pk_kw: 10,
      }],
    });
    const result = readTopologyFromENM(enm);
    const gen = result.generators.find(g => g.id === 'gen_fw_pmsg_1');
    expect(gen).toBeDefined();
    expect(gen!.kind).toBe('FW_PMSG');
  });

  it('synchronous generator without connection_variant → no variant FixAction', () => {
    const enm = minimalENM({
      generators: [pvGen({ ref_id: 'gen_sync', name: 'Generator synchroniczny', gen_type: 'synchronous' })],
    });
    const result = readTopologyFromENM(enm);
    const variantFix = result.fixActions.find(f =>
      f.code === 'generator.connection_variant_missing' && f.elementRef === 'gen_sync',
    );
    expect(variantFix).toBeUndefined();
  });

  it('connectionVariant and stationRef propagated to TopologyGeneratorV1', () => {
    const enm = minimalENM({
      generators: [pvGen({ connection_variant: 'nn_side', station_ref: 'sta_1' })],
      substations: [{
        id: 'uuid-sta', ref_id: 'sta_1', name: 'Stacja', tags: [], meta: {},
        station_type: 'mv_lv', bus_refs: ['bus_sn'], transformer_refs: [],
      }],
    });
    const result = readTopologyFromENM(enm);
    const gen = result.generators.find(g => g.id === 'gen_pv_1');
    expect(gen).toBeDefined();
    expect(gen!.connectionVariant).toBe('nn_side');
    expect(gen!.stationRef).toBe('sta_1');
  });

  it('blockingTransformerId propagated from ENM', () => {
    const enm = minimalENM({
      generators: [pvGen({ connection_variant: 'block_transformer', blocking_transformer_ref: 'tr_blk' })],
      transformers: [{
        id: 'uuid-tr', ref_id: 'tr_blk', name: 'TR blk', tags: [], meta: {},
        hv_bus_ref: 'bus_sn', lv_bus_ref: 'bus_sn',
        sn_mva: 1, uhv_kv: 15, ulv_kv: 0.4, uk_percent: 6, pk_kw: 10,
      }],
    });
    const result = readTopologyFromENM(enm);
    const gen = result.generators.find(g => g.id === 'gen_pv_1');
    expect(gen!.blockingTransformerId).toBe('tr_blk');
  });

  it('fixActions sorted deterministically', () => {
    const enm = minimalENM({
      generators: [
        pvGen({ ref_id: 'gen_c', name: 'PV C' }),
        pvGen({ ref_id: 'gen_a', name: 'PV A' }),
        pvGen({ ref_id: 'gen_b', name: 'PV B' }),
      ],
    });
    const result = readTopologyFromENM(enm);
    const variantFixes = result.fixActions.filter(f => f.code === 'generator.connection_variant_missing');
    const refs = variantFixes.map(f => f.elementRef);
    expect(refs).toEqual(['gen_a', 'gen_b', 'gen_c']);
  });

  it('generators sorted by id deterministically', () => {
    const enm = minimalENM({
      generators: [
        pvGen({ ref_id: 'gen_z', name: 'PV Z' }),
        pvGen({ ref_id: 'gen_a', name: 'PV A' }),
        pvGen({ ref_id: 'gen_m', name: 'PV M' }),
      ],
    });
    const result = readTopologyFromENM(enm);
    const ids = result.generators.map(g => g.id);
    expect(ids).toEqual(['gen_a', 'gen_m', 'gen_z']);
  });
});
