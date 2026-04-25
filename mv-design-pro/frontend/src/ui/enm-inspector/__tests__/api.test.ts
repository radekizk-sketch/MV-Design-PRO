import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnergyNetworkModelV2Projection } from '../../../types/enm';
import { fetchEnmV2Projection } from '../api';

const V2_PROJECTION_RESPONSE: EnergyNetworkModelV2Projection = {
  header: {
    enm_version: '2.0',
    projection_version: 'v12xx.m1.1',
    source_enm_version: '1.0',
    name: 'Case ENM',
    revision: 4,
    source_hash_sha256: 'source-hash',
  },
  projection_hash_sha256: 'projection-hash',
  element_refs: [
    {
      id: 'bus-id',
      ref_id: 'bus-1',
      name: 'Bus 1',
      kind: 'bus',
      namespace: 'enm.buses',
      catalog_ref: null,
      catalog_namespace: null,
      quality_status: 'pelna',
      readiness_status: 'gotowy',
    },
  ],
  operating_variants: [
    {
      ref_id: 'variant.uklad_normalny',
      name: 'Uklad normalny',
      variant_type: 'uklad_normalny',
      switching_snapshot_ref: 'switching.uklad_normalny.base',
      source: 'migracja_m1',
    },
  ],
  switching_state_snapshots: [
    {
      ref_id: 'switching.uklad_normalny.base',
      name: 'Migawka lacznikowa ukladu normalnego',
      variant_ref: 'variant.uklad_normalny',
      source: 'enm_v1_status',
      switch_states: [
        {
          device_ref: 'sw-1',
          state: 'closed',
          device_type: 'breaker',
        },
      ],
    },
  ],
  zero_sequence_configs: [
    {
      element_ref: 'line-1',
      element_kind: 'branch',
      r0: 0.3,
      x0: 0.7,
      b0: null,
      grounding_type: null,
      quality_status: 'pelna',
    },
  ],
  operator_profiles: [],
  source_profiles: [],
  frt_profiles: [],
  q_u_profiles: [],
  cos_phi_p_profiles: [],
  load_profiles: [],
  automation_assets: [],
  migration_warnings: [
    {
      code: 'V12-MIG-GEN-002',
      severity: 'ostrzezenie',
      element_ref: 'gen-1',
      message_pl: 'Zrodlo przeksztaltnikowe nie ma referencji katalogowej.',
    },
  ],
  summary: {
    buses: 1,
    branches: 1,
    transformers: 0,
    sources: 0,
    loads: 0,
    generators: 1,
    substations: 0,
    bays: 0,
    measurements: 0,
    protection_assignments: 0,
    branch_points: 0,
    switching_devices: 1,
    zero_sequence_configs: 1,
    warnings: 1,
  },
};

describe('fetchEnmV2Projection', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the read-only v2 projection endpoint and returns the typed contract', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => V2_PROJECTION_RESPONSE,
    });

    const projection = await fetchEnmV2Projection('case-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/cases/case-1/enm/v2-projection');
    expect(projection.header.enm_version).toBe('2.0');
    expect(projection.header.projection_version).toBe('v12xx.m1.1');
    expect(projection.summary.switching_devices).toBe(1);
    expect(projection.element_refs[0].readiness_status).toBe('gotowy');
  });

  it('throws a readable error when the backend rejects the projection request', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      statusText: 'Not Found',
    });

    await expect(fetchEnmV2Projection('missing-case')).rejects.toThrow(
      'Blad pobierania projekcji ENM v2: Not Found',
    );
  });
});
