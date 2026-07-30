import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { canonicalizeSelectedElement, resolveSelectedElementFromSnapshot } from '../selectionResolution';

const snapshot = {
  header: {} as never,
  buses: [
    {
      id: 'bus-operational',
      ref_id: 'bus-operational',
      name: 'Szyna GPZ 15 kV',
      tags: [],
      meta: {},
      voltage_kv: 15,
      phase_system: '3ph',
    },
    {
      id: 'bus-helper',
      ref_id: 'bus/st-1/downstream',
      name: 'Szyna wnstream',
      tags: [],
      meta: {},
      voltage_kv: 15,
      phase_system: '3ph',
    },
  ],
  branches: [
    {
      id: 'seg-1',
      ref_id: 'seg/st-1/segment',
      name: 'Odcinek W-01',
      tags: [],
      meta: {},
      from_bus_ref: 'bus-operational',
      to_bus_ref: 'bus-operational',
      status: 'closed',
      type: 'cable',
      length_km: 0.15,
      r_ohm_per_km: 0.1,
      x_ohm_per_km: 0.1,
    },
    {
      id: 'brk-1',
      ref_id: 'stn/1/sn_field_breaker/000',
      name: 'Wyłącznik pola SN 1',
      tags: [],
      meta: {},
      from_bus_ref: 'bus-operational',
      to_bus_ref: 'bus-operational',
      status: 'closed',
      type: 'breaker',
    },
  ],
  transformers: [],
  sources: [
    {
      id: 'src-1',
      ref_id: 'gpz/source',
      name: 'Poznań',
      tags: [],
      meta: {},
      bus_ref: 'bus-operational',
      model: 'short_circuit_power',
      sk3_mva: 200,
    },
  ],
  loads: [],
  generators: [],
  substations: [
    {
      id: 'stn/abc/station',
      ref_id: 'stn/abc/station',
      name: 'Stacja inline',
      tags: [],
      meta: {},
      station_type: 'inline',
      bus_refs: [],
      transformer_refs: [],
    },
  ],
  bays: [],
  junctions: [],
  branch_points: [],
  corridors: [],
  measurements: [],
  protection_assignments: [],
} as unknown as EnergyNetworkModel;

describe('selectionResolution', () => {
  it('resolves a segment ref to LineBranch instead of Bus', () => {
    expect(
      resolveSelectedElementFromSnapshot(snapshot, 'seg/st-1/segment', 'Element schematu'),
    ).toEqual({
      id: 'seg/st-1/segment',
      type: 'LineBranch',
      name: 'Odcinek W-01',
    });
  });

  it('resolves a station field breaker branch to Switch', () => {
    expect(
      resolveSelectedElementFromSnapshot(snapshot, 'stn/1/sn_field_breaker/000', 'Element schematu'),
    ).toEqual({
      id: 'stn/1/sn_field_breaker/000',
      type: 'Switch',
      name: 'Wyłącznik pola SN 1',
    });
  });

  it('resolves a source ref to Source', () => {
    expect(
      resolveSelectedElementFromSnapshot(snapshot, 'gpz/source', 'Element schematu'),
    ).toEqual({
      id: 'gpz/source',
      type: 'Source',
      name: 'Poznań',
    });
  });

  it('drops helper buses during canonicalization', () => {
    expect(
      canonicalizeSelectedElement(snapshot, {
        id: 'bus/st-1/downstream',
        type: 'Bus',
        name: 'Szyna wnstream',
      }),
    ).toBeNull();
  });

  it('canonicalizes a stale LineBranch URL selection for a station breaker to Switch', () => {
    expect(
      canonicalizeSelectedElement(snapshot, {
        id: 'stn/1/sn_field_breaker/000',
        type: 'LineBranch',
        name: 'Wyłącznik pola SN 1',
      }),
    ).toEqual({
      id: 'stn/1/sn_field_breaker/000',
      type: 'Switch',
      name: 'Wyłącznik pola SN 1',
    });
  });
  it('hides raw station-scoped apparatus paths behind public technical labels', () => {
    const resolved = resolveSelectedElementFromSnapshot(
      snapshot,
      'stn/abc/station/pv/nn-breaker/Q2',
      'stn/abc/station/pv/nn-breaker/Q2',
      'Station',
    );

    expect(resolved).toMatchObject({
      id: 'stn/abc/station/pv/nn-breaker/Q2',
      type: 'Station',
    });
    expect(resolved?.name).toContain('Stacja przelotowa');
    expect(resolved?.name).toContain('PV Q2');
    expect(resolved?.name).not.toContain('stn/');
  });

  it('resolves GPZ namespace children (bay/transformer refs SIBLING to .../substation) instead of dropping selection', () => {
    // K11-A (naprawa u źródła w tej samej sesji — zasada bezwzględna
    // właściciela 2026-07-30): dzieci GPZ żyją OBOK refu stacji
    // (`gpz/⟨skrót⟩/bay/…` vs `gpz/⟨skrót⟩/substation`), więc dopasowanie
    // wyłącznie po pełnym prefiksie refu stacji zerowało selekcję aparatów
    // pól GPZ tuż po kliknięciu (inspektor nigdy się nie otwierał).
    const zGpz = {
      ...(snapshot as unknown as Record<string, unknown>),
      substations: [
        {
          id: 'gpz/abc123/substation',
          ref_id: 'gpz/abc123/substation',
          name: 'GPZ Poznań',
          tags: [],
          meta: {},
          station_type: 'gpz',
          bus_refs: [],
          transformer_refs: [],
        },
      ],
    } as unknown as EnergyNetworkModel;

    const resolved = resolveSelectedElementFromSnapshot(
      zGpz,
      'gpz/abc123/bay/001/001',
      null,
      'BaySN',
    );

    expect(resolved).not.toBeNull();
    expect(resolved).toMatchObject({ id: 'gpz/abc123/bay/001/001', type: 'BaySN' });
    expect(resolved?.name).toContain('GPZ');
    expect(resolved?.name).not.toContain('gpz/');
  });
});
