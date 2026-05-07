import { afterEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useNetworkBuildDerived } from '../networkBuildStore';
import { useReadinessLiveStore } from '../../engineering-readiness/readinessLiveStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import type { DomainOpResponseV1, EnergyNetworkModel } from '../../../types/enm';

function buildSnapshot(): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'Model testowy',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      revision: 3,
      hash_sha256: 'hash-test',
      defaults: {
        frequency_hz: 50,
        unit_system: 'SI',
      },
    },
    buses: [],
    branches: [],
    transformers: [
      {
        id: 'tr-1',
        ref_id: 'tr-1',
        name: 'Transformator SN/nN',
        tags: [],
        meta: {},
        hv_bus_ref: 'bus-sn',
        lv_bus_ref: 'bus-nn',
        sn_mva: 0.63,
        uhv_kv: 15,
        ulv_kv: 0.4,
        uk_percent: 6,
        pk_kw: 6.5,
      },
    ],
    sources: [
      {
        id: 'src-1',
        ref_id: 'src-1',
        name: 'GPZ',
        tags: [],
        meta: {},
        bus_ref: 'bus-sn',
        model: 'external_grid',
      },
    ],
    loads: [
      {
        id: 'load-1',
        ref_id: 'load-1',
        name: 'Odbiór nN',
        tags: [],
        meta: {},
        bus_ref: 'bus-nn',
        p_mw: 0.12,
        q_mvar: 0.04,
        model: 'pq',
      },
    ],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    branch_points: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  };
}

function buildResponse(): DomainOpResponseV1 {
  return {
    snapshot: buildSnapshot(),
    logical_views: {
      trunks: [
        {
          corridor_ref: 'corridor-1',
          corridor_type: 'radial',
          segments: ['segment-1', 'segment-2'],
          no_point_ref: null,
          terminals: [],
        },
      ],
      branches: [],
      secondary_connectors: [],
      terminals: [],
    },
    readiness: {
      ready: true,
      blockers: [],
      warnings: [],
    },
    fix_actions: [],
    changes: {
      created_element_ids: [],
      updated_element_ids: [],
      deleted_element_ids: [],
    },
    selection_hint: null,
    audit_trail: [],
    domain_events: [],
    materialized_params: {
      lines_sn: {},
      transformers_sn_nn: {},
    },
    layout: {
      layout_hash: 'layout-test',
      layout_version: 'test',
    },
  };
}

afterEach(() => {
  useSnapshotStore.getState().reset();
  useReadinessLiveStore.getState().clear();
});

describe('useNetworkBuildDerived', () => {
  it('materializuje liczniki segmentów i odbiorów bez wartości nieokreślonej', () => {
    act(() => {
      useSnapshotStore.getState().setSnapshot(buildResponse());
      useReadinessLiveStore.getState().clear();
    });

    const { result } = renderHook(() => useNetworkBuildDerived());

    expect(result.current.trunkSegmentCount).toBe(2);
    expect(result.current.loadCount).toBe(1);
    expect(result.current.transformerCount).toBe(1);
  });
});
