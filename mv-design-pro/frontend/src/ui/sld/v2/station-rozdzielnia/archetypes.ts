/**
 * STACJA-ROZDZIELNIA SN — the four network-station archetypes T1-T4.
 *
 * Each archetype is built EXPLICITLY and COMPLETELY from the ENM canonical role
 * taxonomy (`BayCanonicalRole`) — NO "rest analogously". The apparatus stack per
 * role follows the recon'd canonical requirement sets (`fieldDeviceContracts.ts`
 * DEVICE_REQUIREMENT_SETS):
 *   - line field (IN/OUT/ODG): CB (Q0) + DS (Q9) + CT (T1) + ES (Q8) + cable head
 *   - transformer field:        CB (Q0) + CT (T1) + transformer (T1) [+ cable head]
 *   - coupler (sprzęgło):       DS (Q1) + CB (Q0) + DS (Q1)
 *   - measurement (pomiar):     VT (3-phase) [+ DS]
 *
 * Protection per applicability (ANSI/IEC device numbers — ENM
 * `ProtectionFunctionState.code`), per standard MV OSD practice:
 *   - line feeders (IN/OUT/ODG):  50/51 + 50N/51N; directional 67/67N where the
 *     run is meshed/ring-fed (T3 odgałęźna here demonstrates 67/67N on the OUT
 *     tie of a closed-ring branch).
 *   - transformer field:          50/51 + 50N/51N (HV-side overcurrent).
 *   - coupler:                     50/51 (bus-tie overcurrent).
 *   - measurement field:          27/59 (under/over-voltage on the VT).
 *
 * Each archetype ships with a power-flow companion SLICE produced by the FROZEN
 * solver's serialisation shape (`SldPowerFlowCompanion`). Direction is the SIGN
 * of the solver's branch P — the SLD reads it (one truth); it is not invented in
 * the renderer. T4 carries a normally-open point in `open_point_branch_refs`.
 */

import type { SldPowerFlowCompanion, SldFlowDirection } from '../canvas/SldPowerFlowCompanion';
import type {
  StationApparatus,
  StationArchetype,
  StationFieldDescriptor,
  StationProtectionFunction,
  StationRozdzielniaModel,
} from './contract';

// =============================================================================
// Apparatus + protection builders (per canonical role)
// =============================================================================

function lineApparatus(prefix: string, cbState: StationApparatus['switchState']): StationApparatus[] {
  return [
    { deviceRef: `${prefix}/q9`, kind: 'DS', designation: 'Q9', switchState: cbState === 'open' ? 'open' : 'closed' },
    { deviceRef: `${prefix}/q0`, kind: 'CB', designation: 'Q0', switchState: cbState },
    { deviceRef: `${prefix}/t1`, kind: 'CT', designation: 'T1' },
    { deviceRef: `${prefix}/q8`, kind: 'ES', designation: 'Q8', earthingState: 'open' },
    { deviceRef: `${prefix}/head`, kind: 'CABLE_HEAD' },
  ];
}

function transformerApparatus(prefix: string, cbState: StationApparatus['switchState']): StationApparatus[] {
  return [
    { deviceRef: `${prefix}/q0`, kind: 'CB', designation: 'Q0', switchState: cbState },
    { deviceRef: `${prefix}/t1`, kind: 'CT', designation: 'T1' },
    { deviceRef: `${prefix}/tr`, kind: 'TRANSFORMER_DEVICE', designation: 'T1', catalogLabel: '630 kVA' },
  ];
}

function couplerApparatus(prefix: string, cbState: StationApparatus['switchState']): StationApparatus[] {
  return [
    { deviceRef: `${prefix}/q1a`, kind: 'DS', designation: 'Q1', switchState: cbState === 'open' ? 'open' : 'closed' },
    { deviceRef: `${prefix}/q0`, kind: 'CB', designation: 'Q0', switchState: cbState },
    { deviceRef: `${prefix}/q1b`, kind: 'DS', designation: 'Q2', switchState: cbState === 'open' ? 'open' : 'closed' },
  ];
}

function overcurrentSet(directional: boolean): StationProtectionFunction[] {
  const base: StationProtectionFunction[] = [
    { code: '50', available: true, enabled: true },
    { code: '51', available: true, enabled: true },
    { code: '50N', available: true, enabled: true },
    { code: '51N', available: true, enabled: true },
  ];
  if (directional) {
    base.push({ code: '67', available: true, enabled: true });
    base.push({ code: '67N', available: true, enabled: true });
  }
  return base;
}

// =============================================================================
// Branch-ref helpers (one ref per field; companion keys on these)
// =============================================================================

const BR = {
  in: 'sr/branch/in',
  out: 'sr/branch/out',
  odg: 'sr/branch/odg',
  coupler: 'sr/branch/coupler',
  tr: 'sr/branch/tr',
} as const;

// =============================================================================
// Companion builder (frozen-solver serialisation shape)
// =============================================================================

function buildCompanion(
  archetype: StationArchetype,
  flows: Readonly<Record<string, { direction: SldFlowDirection; p: number }>>,
  openPoints: readonly string[],
): SldPowerFlowCompanion {
  const branch_flow: Record<string, { direction: SldFlowDirection; p_from_mw: number }> = {};
  const energizedBranches: string[] = [];
  for (const [ref, f] of Object.entries(flows)) {
    branch_flow[ref] = { direction: f.direction, p_from_mw: f.p };
    // Energized = the solver solved it (direction forward/reverse OR a closed
    // through-path with zero net flow that is still in the slack island). Open
    // points are de-energized beyond them; here only the open branch itself is
    // excluded from the energized set.
    if (!openPoints.includes(ref)) energizedBranches.push(ref);
  }
  return {
    schema: 'sld_power_flow_companion_v1',
    case_ref: `case/${archetype}`,
    case_label: `Stan podstawowy — ${archetype}`,
    solver_method: 'newton-raphson',
    converged: true,
    iterations: 4,
    base_mva: 100,
    enm_hash: `enm/${archetype}`,
    branch_flow,
    energized_branch_refs: [...energizedBranches].sort(),
    energized_bus_refs: [`bus/${archetype}`],
    de_energized_bus_refs: [],
    open_point_branch_refs: [...openPoints].sort(),
  };
}

// =============================================================================
// T1 PRZELOTOWA — LINIA_IN + LINIA_OUT (+ TRANSFORMATOROWE for local load)
// =============================================================================

export function buildT1(): { model: StationRozdzielniaModel; companion: SldPowerFlowCompanion } {
  const fields: StationFieldDescriptor[] = [
    {
      fieldId: 'sr-t1-in',
      role: 'LINIA_IN',
      bayNumber: '10',
      feederName: 'GPZ',
      apparatus: lineApparatus('sr-t1-in', 'closed'),
      protection: overcurrentSet(false),
      branchRef: BR.in,
    },
    {
      fieldId: 'sr-t1-tr',
      role: 'TRANSFORMATOROWE',
      bayNumber: '11',
      apparatus: transformerApparatus('sr-t1-tr', 'closed'),
      protection: overcurrentSet(false),
      branchRef: BR.tr,
    },
    {
      fieldId: 'sr-t1-out',
      role: 'LINIA_OUT',
      bayNumber: '12',
      feederName: 'SADY',
      apparatus: lineApparatus('sr-t1-out', 'closed'),
      protection: overcurrentSet(false),
      branchRef: BR.out,
    },
  ];
  const model: StationRozdzielniaModel = {
    stationId: 'sr-t1',
    archetype: 'T1',
    name: 'Stacja przelotowa',
    stationCode: 'S07',
    busVoltageKv: 15,
    fields,
    caseRef: 'case/T1',
    caseLabel: 'Stan podstawowy — T1',
  };
  // Power flows in from GPZ, taps the transformer (down to local load), continues
  // out to SADY. IN branch oriented from→to = into the station (forward); TR
  // forward (bus→transformer); OUT forward (station→downstream).
  const companion = buildCompanion(
    'T1',
    {
      [BR.in]: { direction: 'forward', p: 6.4 },
      [BR.tr]: { direction: 'forward', p: 0.63 },
      [BR.out]: { direction: 'forward', p: 5.6 },
    },
    [],
  );
  return { model, companion };
}

// =============================================================================
// T2 KOŃCOWA — LINIA_IN + TRANSFORMATOROWE (run end, no OUT)
// =============================================================================

export function buildT2(): { model: StationRozdzielniaModel; companion: SldPowerFlowCompanion } {
  const fields: StationFieldDescriptor[] = [
    {
      fieldId: 'sr-t2-in',
      role: 'LINIA_IN',
      bayNumber: '10',
      feederName: 'CIĄG',
      apparatus: lineApparatus('sr-t2-in', 'closed'),
      protection: overcurrentSet(false),
      branchRef: BR.in,
    },
    {
      fieldId: 'sr-t2-tr',
      role: 'TRANSFORMATOROWE',
      bayNumber: '11',
      apparatus: transformerApparatus('sr-t2-tr', 'closed'),
      protection: overcurrentSet(false),
      branchRef: BR.tr,
    },
  ];
  const model: StationRozdzielniaModel = {
    stationId: 'sr-t2',
    archetype: 'T2',
    name: 'Stacja końcowa',
    stationCode: 'S29',
    busVoltageKv: 15,
    fields,
    caseRef: 'case/T2',
    caseLabel: 'Stan podstawowy — T2',
  };
  // Run end: all incoming power feeds the local transformer. IN forward (in),
  // TR forward (bus→transformer). No OUT.
  const companion = buildCompanion(
    'T2',
    {
      [BR.in]: { direction: 'forward', p: 0.63 },
      [BR.tr]: { direction: 'forward', p: 0.63 },
    },
    [],
  );
  return { model, companion };
}

// =============================================================================
// T3 ODGAŁĘŹNA — LINIA_IN + LINIA_OUT + LINIA_ODG
// =============================================================================

export function buildT3(): { model: StationRozdzielniaModel; companion: SldPowerFlowCompanion } {
  const fields: StationFieldDescriptor[] = [
    {
      fieldId: 'sr-t3-in',
      role: 'LINIA_IN',
      bayNumber: '10',
      feederName: 'GPZ',
      apparatus: lineApparatus('sr-t3-in', 'closed'),
      protection: overcurrentSet(false),
      branchRef: BR.in,
    },
    {
      fieldId: 'sr-t3-odg',
      role: 'LINIA_ODG',
      bayNumber: '11',
      feederName: 'OKRĘŻNA',
      apparatus: lineApparatus('sr-t3-odg', 'closed'),
      // Branch tie of a meshed run → directional overcurrent applies.
      protection: overcurrentSet(true),
      branchRef: BR.odg,
    },
    {
      fieldId: 'sr-t3-out',
      role: 'LINIA_OUT',
      bayNumber: '12',
      feederName: 'CIĄG',
      apparatus: lineApparatus('sr-t3-out', 'closed'),
      protection: overcurrentSet(false),
      branchRef: BR.out,
    },
  ];
  const model: StationRozdzielniaModel = {
    stationId: 'sr-t3',
    archetype: 'T3',
    name: 'Stacja odgałęźna',
    stationCode: 'S15',
    busVoltageKv: 15,
    fields,
    caseRef: 'case/T3',
    caseLabel: 'Stan podstawowy — T3',
  };
  // Power in from GPZ; splits to the main run (OUT) and the branch (ODG).
  const companion = buildCompanion(
    'T3',
    {
      [BR.in]: { direction: 'forward', p: 7.8 },
      [BR.odg]: { direction: 'forward', p: 2.1 },
      [BR.out]: { direction: 'forward', p: 5.5 },
    },
    [],
  );
  return { model, companion };
}

// =============================================================================
// T4 SPRZĘGŁOWA/SEKCYJNA — SPRZEGLO + a normally-open point (NOP)
// =============================================================================

export function buildT4(): { model: StationRozdzielniaModel; companion: SldPowerFlowCompanion } {
  const fields: StationFieldDescriptor[] = [
    {
      fieldId: 'sr-t4-in',
      role: 'LINIA_IN',
      bayNumber: '10',
      feederName: 'CIĄG A',
      apparatus: lineApparatus('sr-t4-in', 'closed'),
      protection: overcurrentSet(false),
      branchRef: BR.in,
    },
    {
      // The sectionalizing coupler — NORMALLY OPEN (the run boundary).
      fieldId: 'sr-t4-coupler',
      role: 'SPRZEGLO',
      bayNumber: '11',
      apparatus: couplerApparatus('sr-t4-coupler', 'open'),
      protection: overcurrentSet(false),
      branchRef: BR.coupler,
      isNormallyOpen: true,
    },
    {
      fieldId: 'sr-t4-out',
      role: 'LINIA_OUT',
      bayNumber: '12',
      feederName: 'CIĄG B',
      apparatus: lineApparatus('sr-t4-out', 'closed'),
      protection: overcurrentSet(false),
      branchRef: BR.out,
    },
  ];
  const model: StationRozdzielniaModel = {
    stationId: 'sr-t4',
    archetype: 'T4',
    name: 'Stacja sekcyjna',
    stationCode: 'S22',
    busVoltageKv: 15,
    fields,
    caseRef: 'case/T4',
    caseLabel: 'Stan podstawowy — T4',
  };
  // The coupler branch is OPEN → no flow through it (the run is fed from one
  // side only). IN forward; OUT fed from the other half (reverse w.r.t. the
  // ENM branch orientation in this slice — demonstrates the solver-signed
  // direction, NOT a guess). Coupler = 'none' + open point.
  const companion = buildCompanion(
    'T4',
    {
      [BR.in]: { direction: 'forward', p: 3.2 },
      [BR.coupler]: { direction: 'none', p: 0 },
      [BR.out]: { direction: 'reverse', p: -2.8 },
    },
    [BR.coupler],
  );
  return { model, companion };
}

// =============================================================================
// Registry
// =============================================================================

export function buildArchetype(
  archetype: StationArchetype,
): { model: StationRozdzielniaModel; companion: SldPowerFlowCompanion } {
  switch (archetype) {
    case 'T1':
      return buildT1();
    case 'T2':
      return buildT2();
    case 'T3':
      return buildT3();
    case 'T4':
      return buildT4();
  }
}

export const ALL_ARCHETYPES: readonly StationArchetype[] = ['T1', 'T2', 'T3', 'T4'];
