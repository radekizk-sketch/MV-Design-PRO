/**
 * ENM TypeScript types — structural & type guard tests.
 *
 * Verifies that:
 * 1. ENM interfaces are structurally correct
 * 2. Type guards (isOverheadLine, isCable, etc.) work
 * 3. Discriminated union on Branch.type is exhaustive
 * 4. Default ENM construction matches backend contract
 */

import { describe, it, expect } from 'vitest';
import type {
  EnergyNetworkModel,
  Bus,
  Branch,
  OverheadLine,
  Cable,
  SwitchBranch,
  FuseBranch,
  ValidationResult,
} from '../enm';
import {
  isOverheadLine,
  isCable,
  isSwitchBranch,
  isFuseBranch,
} from '../enm';


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(overrides: Partial<Bus> = {}): Bus {
  return {
    id: crypto.randomUUID(),
    ref_id: 'bus_1',
    name: 'Szyna SN',
    tags: [],
    meta: {},
    voltage_kv: 15,
    phase_system: '3ph',
    ...overrides,
  };
}

function makeENM(overrides: Partial<EnergyNetworkModel> = {}): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'Test',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      revision: 1,
      hash_sha256: '',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: [],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    // Pola WYMAGANE kontraktem `EnergyNetworkModel` — bez nich atrapa nie
    // spełniała typu, który sama deklarowała (błąd zgłaszany na całym zwrocie,
    // po jednej brakującej kolekcji naraz).
    substations: [],
    bays: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ENM Types: structural correctness', () => {
  it('empty ENM matches backend default shape', () => {
    const enm = makeENM();
    expect(enm.header.enm_version).toBe('1.0');
    expect(enm.buses).toHaveLength(0);
    expect(enm.branches).toHaveLength(0);
    expect(enm.transformers).toHaveLength(0);
    expect(enm.sources).toHaveLength(0);
    expect(enm.loads).toHaveLength(0);
    expect(enm.generators).toHaveLength(0);
  });

  it('Bus has required fields', () => {
    const bus = makeElement();
    expect(bus.voltage_kv).toBe(15);
    expect(bus.phase_system).toBe('3ph');
    expect(bus.ref_id).toBe('bus_1');
  });

  it('ENM with full topology is structurally valid', () => {
    const enm = makeENM({
      buses: [
        makeElement({ ref_id: 'b1', name: 'HV', voltage_kv: 110 }),
        makeElement({ ref_id: 'b2', name: 'LV', voltage_kv: 15 }),
      ],
      branches: [
        {
          id: crypto.randomUUID(), ref_id: 'ln_1', name: 'L1',
          tags: [], meta: {}, type: 'line_overhead',
          from_bus_ref: 'b1', to_bus_ref: 'b2', status: 'closed',
          length_km: 5, r_ohm_per_km: 0.4, x_ohm_per_km: 0.3,
        } as OverheadLine,
      ],
      sources: [{
        id: crypto.randomUUID(), ref_id: 's1', name: 'Grid',
        tags: [], meta: {}, bus_ref: 'b1',
        model: 'short_circuit_power', sk3_mva: 220, rx_ratio: 0.1,
      }],
    });

    expect(enm.buses).toHaveLength(2);
    expect(enm.branches).toHaveLength(1);
    expect(enm.sources).toHaveLength(1);
  });
});


describe('ENM Types: Branch type guards', () => {
  const overhead: OverheadLine = {
    id: '1', ref_id: 'ln1', name: 'L1', tags: [], meta: {},
    type: 'line_overhead', from_bus_ref: 'b1', to_bus_ref: 'b2',
    status: 'closed', length_km: 5, r_ohm_per_km: 0.4, x_ohm_per_km: 0.3,
  };

  const cable: Cable = {
    id: '2', ref_id: 'cb1', name: 'C1', tags: [], meta: {},
    type: 'cable', from_bus_ref: 'b1', to_bus_ref: 'b2',
    status: 'closed', length_km: 2, r_ohm_per_km: 0.2, x_ohm_per_km: 0.1,
  };

  const sw: SwitchBranch = {
    id: '3', ref_id: 'sw1', name: 'Q1', tags: [], meta: {},
    type: 'breaker', from_bus_ref: 'b1', to_bus_ref: 'b2', status: 'closed',
  };

  const fuse: FuseBranch = {
    id: '4', ref_id: 'fuse1', name: 'F1', tags: [], meta: {},
    type: 'fuse', from_bus_ref: 'b1', to_bus_ref: 'b2', status: 'closed',
  };

  it('isOverheadLine returns true for line_overhead', () => {
    expect(isOverheadLine(overhead)).toBe(true);
    expect(isOverheadLine(cable)).toBe(false);
    expect(isOverheadLine(sw)).toBe(false);
    expect(isOverheadLine(fuse)).toBe(false);
  });

  it('isCable returns true for cable', () => {
    expect(isCable(cable)).toBe(true);
    expect(isCable(overhead)).toBe(false);
  });

  it('isSwitchBranch returns true for switch types', () => {
    expect(isSwitchBranch(sw)).toBe(true);
    expect(isSwitchBranch(overhead)).toBe(false);

    const disconnector: SwitchBranch = { ...sw, type: 'disconnector' };
    expect(isSwitchBranch(disconnector)).toBe(true);

    const coupler: SwitchBranch = { ...sw, type: 'bus_coupler' };
    expect(isSwitchBranch(coupler)).toBe(true);
  });

  it('isFuseBranch returns true for fuse', () => {
    expect(isFuseBranch(fuse)).toBe(true);
    expect(isFuseBranch(overhead)).toBe(false);
  });

  it('type guards are mutually exclusive for each branch', () => {
    const branches: Branch[] = [overhead, cable, sw, fuse];
    for (const b of branches) {
      const matches = [
        isOverheadLine(b),
        isCable(b),
        isSwitchBranch(b),
        isFuseBranch(b),
      ].filter(Boolean);
      expect(matches).toHaveLength(1);
    }
  });
});


describe('ENM Types: ValidationResult shape', () => {
  it('OK result has expected fields', () => {
    const result: ValidationResult = {
      status: 'OK',
      issues: [],
      analysis_available: {
        short_circuit_3f: true,
        short_circuit_1f: false,
        load_flow: false,
      },
    };
    expect(result.status).toBe('OK');
    expect(result.analysis_available.short_circuit_3f).toBe(true);
  });

  it('FAIL result with blockers', () => {
    const result: ValidationResult = {
      status: 'FAIL',
      issues: [
        {
          code: 'E001',
          severity: 'BLOCKER',
          message_pl: 'Brak zrodla zasilania w modelu sieci.',
          element_refs: [],
          wizard_step_hint: 'K2',
        },
      ],
      analysis_available: {
        short_circuit_3f: false,
        short_circuit_1f: false,
        load_flow: false,
      },
    };
    expect(result.status).toBe('FAIL');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe('E001');
    expect(result.issues[0].severity).toBe('BLOCKER');
  });
});
