import { describe, expect, it } from 'vitest';

import {
  ALL_PORT_KINDS,
  BAY_ROLE_TO_PORT_KIND,
  canConnectPorts,
  classifyStationTopology,
  isDerPort,
  isNnPort,
  isPortKindCompatibleWithBayRole,
  isSnPort,
  PORT_CONNECTION_RULES,
  PORT_KIND_LABELS_PL,
  validatePortVoltages,
  type PortKind,
  type SldPort,
} from '../ports';

describe('SLD v2 — PortKind contract (PR-4)', () => {
  it('15 PortKind values', () => {
    expect(ALL_PORT_KINDS.length).toBe(15);
  });

  it('parity z ENM PortKind enum (15 kinds, identyczne ID)', () => {
    expect([...ALL_PORT_KINDS].sort()).toEqual(
      [
        'sn_input',
        'sn_output',
        'sn_branch',
        'sn_transformer',
        'sn_measurement',
        'sn_der_pv',
        'sn_der_bess',
        'sn_der_fw',
        'sn_coupler',
        'sn_reserve',
        'nn_feeder',
        'nn_load',
        'nn_der_pv',
        'nn_der_bess',
        'nn_der_fw',
      ].sort(),
    );
  });

  it('każdy PortKind ma polską etykietę', () => {
    for (const kind of ALL_PORT_KINDS) {
      expect(PORT_KIND_LABELS_PL[kind]).toBeTruthy();
      // Etykieta nie zawiera tokenów zakazanych z briefa §2
      expect(PORT_KIND_LABELS_PL[kind]).not.toMatch(/\b(?:branch|case|run|snapshot|wizard|legacy|fallback)\b/i);
    }
  });
});

describe('SLD v2 — Port classification helpers', () => {
  it('isSnPort wykrywa porty SN', () => {
    expect(isSnPort('sn_input')).toBe(true);
    expect(isSnPort('sn_der_pv')).toBe(true);
    expect(isSnPort('nn_feeder')).toBe(false);
  });

  it('isNnPort wykrywa porty nN', () => {
    expect(isNnPort('nn_feeder')).toBe(true);
    expect(isNnPort('nn_der_bess')).toBe(true);
    expect(isNnPort('sn_input')).toBe(false);
  });

  it('isDerPort wykrywa porty DER', () => {
    expect(isDerPort('sn_der_pv')).toBe(true);
    expect(isDerPort('nn_der_bess')).toBe(true);
    expect(isDerPort('sn_der_fw')).toBe(true);
    expect(isDerPort('sn_input')).toBe(false);
    expect(isDerPort('nn_feeder')).toBe(false);
  });
});

describe('SLD v2 — Bay role → PortKind mapping', () => {
  it('BAY_ROLE_TO_PORT_KIND zgodne z ENM v_ports_001', () => {
    expect(BAY_ROLE_TO_PORT_KIND.IN).toBe('sn_input');
    expect(BAY_ROLE_TO_PORT_KIND.OUT).toBe('sn_output');
    expect(BAY_ROLE_TO_PORT_KIND.TR).toBe('sn_transformer');
    expect(BAY_ROLE_TO_PORT_KIND.COUPLER).toBe('sn_coupler');
    expect(BAY_ROLE_TO_PORT_KIND.MEASUREMENT).toBe('sn_measurement');
    expect(BAY_ROLE_TO_PORT_KIND.OZE).toBe('sn_der_pv');
    expect(BAY_ROLE_TO_PORT_KIND.FEEDER).toBe('sn_output');
  });
});

describe('SLD v2 — canConnectPorts', () => {
  it('dopuszcza sn_output ↔ sn_input', () => {
    expect(canConnectPorts('sn_output', 'sn_input')).toBe(true);
    expect(canConnectPorts('sn_input', 'sn_output')).toBe(true);
  });

  it('dopuszcza sn_branch → sn_input (odgałęzienie do stacji)', () => {
    expect(canConnectPorts('sn_branch', 'sn_input')).toBe(true);
  });

  it('dopuszcza sn_coupler ↔ sn_coupler (sprzęgło)', () => {
    expect(canConnectPorts('sn_coupler', 'sn_coupler')).toBe(true);
  });

  it('dopuszcza DER po SN → sn_input', () => {
    expect(canConnectPorts('sn_der_pv', 'sn_input')).toBe(true);
    expect(canConnectPorts('sn_der_bess', 'sn_input')).toBe(true);
    expect(canConnectPorts('sn_der_fw', 'sn_input')).toBe(true);
  });

  it('dopuszcza DER po nN → odpływ nN', () => {
    expect(canConnectPorts('nn_der_pv', 'nn_feeder')).toBe(true);
    expect(canConnectPorts('nn_der_bess', 'nn_feeder')).toBe(true);
  });

  it('dopuszcza odbiór nN → odpływ nN', () => {
    expect(canConnectPorts('nn_load', 'nn_feeder')).toBe(true);
    expect(canConnectPorts('nn_feeder', 'nn_load')).toBe(true);
  });

  it('odrzuca SN ↔ nN bez transformatora', () => {
    expect(canConnectPorts('sn_input', 'nn_load')).toBe(false);
    expect(canConnectPorts('sn_der_pv', 'nn_feeder')).toBe(false);
  });

  it('odrzuca sn_measurement (boczny tor) → sn_input (zakaz pola pomiarowego jako liniowego)', () => {
    expect(canConnectPorts('sn_measurement', 'sn_input')).toBe(false);
  });
});

describe('SLD v2 — validatePortVoltages', () => {
  function makePort(id: string, kind: PortKind, voltageKv: number): SldPort {
    return {
      id,
      kind,
      nominalVoltageKv: voltageKv,
      bayRef: null,
      substationRef: 's1',
      occupiedBy: null,
      anchor: { x: 0, y: 0 },
    };
  }

  it('15 kV ↔ 15 kV: brak niespójności', () => {
    const a = makePort('a', 'sn_output', 15.0);
    const b = makePort('b', 'sn_input', 15.0);
    const result = validatePortVoltages(a, b);
    expect(result.mismatch).toBe(false);
  });

  it('15 kV ↔ 0,4 kV: niespójność z propozycją transformatora', () => {
    const a = makePort('a', 'sn_output', 15.0);
    const b = makePort('b', 'nn_load', 0.4);
    const result = validatePortVoltages(a, b);
    expect(result.mismatch).toBe(true);
    expect(result.fromKv).toBe(15.0);
    expect(result.toKv).toBe(0.4);
    expect(result.suggestionPl).toContain('transformator');
  });

  it('15.005 kV ↔ 15.0 kV w tolerancji 0.01: brak niespójności', () => {
    const a = makePort('a', 'sn_output', 15.005);
    const b = makePort('b', 'sn_input', 15.0);
    expect(validatePortVoltages(a, b, 0.01).mismatch).toBe(false);
  });
});

describe('SLD v2 — classifyStationTopology', () => {
  function makePort(kind: PortKind): SldPort {
    return {
      id: `p_${kind}`,
      kind,
      nominalVoltageKv: 15.0,
      bayRef: 'b1',
      substationRef: 's1',
      occupiedBy: null,
      anchor: { x: 0, y: 0 },
    };
  }

  it('1× sn_input → końcowa', () => {
    expect(classifyStationTopology([makePort('sn_input')])).toBe('końcowa');
  });

  it('1× sn_input + 1× sn_output → przelotowa', () => {
    expect(
      classifyStationTopology([makePort('sn_input'), makePort('sn_output')]),
    ).toBe('przelotowa');
  });

  it('1× sn_input + 1× sn_output + 1× sn_branch → odgałęźna', () => {
    expect(
      classifyStationTopology([
        makePort('sn_input'),
        makePort('sn_output'),
        makePort('sn_branch'),
      ]),
    ).toBe('odgałęźna');
  });

  it('2× sn_input + 1× sn_coupler → sekcyjna', () => {
    expect(
      classifyStationTopology([
        makePort('sn_input'),
        makePort('sn_input'),
        makePort('sn_coupler'),
      ]),
    ).toBe('sekcyjna');
  });

  it('Stacja z PV po SN: sn_input + sn_der_pv → końcowa (DER nie tworzy wyjścia ciągu)', () => {
    expect(
      classifyStationTopology([makePort('sn_input'), makePort('sn_der_pv')]),
    ).toBe('końcowa');
  });
});

describe('SLD v2 — isPortKindCompatibleWithBayRole', () => {
  it('IN bay → sn_input port: spójne', () => {
    expect(isPortKindCompatibleWithBayRole('sn_input', 'IN')).toBe(true);
  });

  it('TR bay → sn_transformer port: spójne', () => {
    expect(isPortKindCompatibleWithBayRole('sn_transformer', 'TR')).toBe(true);
  });

  it('OZE bay → sn_der_pv: spójne', () => {
    expect(isPortKindCompatibleWithBayRole('sn_der_pv', 'OZE')).toBe(true);
    expect(isPortKindCompatibleWithBayRole('sn_der_bess', 'OZE')).toBe(true);
    expect(isPortKindCompatibleWithBayRole('sn_der_fw', 'OZE')).toBe(true);
  });

  it('IN bay → sn_output port: niespójne', () => {
    expect(isPortKindCompatibleWithBayRole('sn_output', 'IN')).toBe(false);
  });

  it('TR bay → sn_der_pv: niespójne (DER w polu transformatorowym = błąd)', () => {
    expect(isPortKindCompatibleWithBayRole('sn_der_pv', 'TR')).toBe(false);
  });
});

describe('SLD v2 — PORT_CONNECTION_RULES', () => {
  it('reguły są niepuste i poprawnie zdefiniowane', () => {
    expect(PORT_CONNECTION_RULES.length).toBeGreaterThan(0);
    for (const rule of PORT_CONNECTION_RULES) {
      expect(typeof rule.fromKind).toBe('string');
      expect(typeof rule.toKind).toBe('string');
      expect(typeof rule.allowed).toBe('boolean');
    }
  });
});
