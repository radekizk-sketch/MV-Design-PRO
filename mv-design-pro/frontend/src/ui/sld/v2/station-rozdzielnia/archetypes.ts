/**
 * STACJA-ROZDZIELNIA SN — the four network-station archetypes T1-T4 (v2).
 *
 * Each archetype is built EXPLICITLY from the ENM canonical role taxonomy
 * (`BayCanonicalRole`) and the ABB UniSwitch field-type library (catalog §4):
 *   - SDC  (line field):        rozłącznik 3-poł. + CT + cable head  → LINIA_IN/OUT
 *   - SDF  (transformer field): rozłącznik 3-poł. + bezpieczniki WN + uziemnik
 *                               + transformer SN/nN                  → TRANSFORMATOROWE
 *   - CBC  (breaker field):     wyłącznik + rozłącznik 3-poł. + CT   → protected tie/incomer
 *   - SMC  (coupler):           CBC cell + BRC cell across two bus sections → SPRZEGLO
 * The ABB cell type is NEVER hand-authored — it is derived from role + apparatus
 * by the single classifier (`classifyAbbCellType`).
 *
 * Protection is TYPE-CORRECT (owner v2: "SDF→bezpiecznik, CBC→przekaźnik"):
 *   - SDC line fields  → no relay (switch only; ring/line protected upstream).
 *   - SDF transformer  → HV fuses (the protection IS the fuse), no relay chips.
 *   - CBC fields       → 50/51(/50N/51N) overcurrent relay per applicability.
 *
 * POWER-FLOW (P-A, one truth): direction, energisation and the displayed power
 * values are READ from the FROZEN-solver companion committed in `./companions`
 * (produced by `station_archetype_substrate.py` running solve_power_flow_physics).
 * The renderer never re-derives them. Branch refs here match the companion keys
 * 1:1. T1/T2 carry an nN block (transformer → nN busbar → feeders + PV backfeed);
 * T3 is a ZKSN (BranchPointSN) cable-junction projection; T4 is a two-section bus
 * with an ABB SMC coupler at a normally-open point.
 */

import type { SldPowerFlowCompanion } from '../canvas/SldPowerFlowCompanion';
import type {
  StationApparatus,
  StationArchetype,
  StationFieldDescriptor,
  StationNNBlock,
  StationNNFeeder,
  StationProtectionFunction,
  StationRozdzielniaModel,
} from './contract';
import { classifyAbbCellType } from './abbFieldLibrary';
import { STATION_ARCHETYPE_COMPANIONS } from './companions';

// =============================================================================
// ABB cell-type stamping (single symbol↔type source)
// =============================================================================

/**
 * Stamp each field with its ABB UniSwitch cell type, derived deterministically
 * from role + apparatus via the single classifier. The ABB library is the only
 * symbol↔type source, so the cell type is never hand-authored here.
 */
function withCellTypes(fields: readonly StationFieldDescriptor[]): StationFieldDescriptor[] {
  return fields.map((f) => ({
    ...f,
    abbCellType: classifyAbbCellType(
      f.role,
      f.apparatus.map((a) => a.kind),
    ),
  }));
}

// =============================================================================
// ABB apparatus stacks (catalog §4 — bus → cable order)
// =============================================================================

/** SDC line field: rozłącznik 3-położeniowy (Q1) + CT + cable head. */
function sdcLineApparatus(
  prefix: string,
  swState: NonNullable<StationApparatus['switchState']>,
): StationApparatus[] {
  return [
    { deviceRef: `${prefix}/q1`, kind: 'LOAD_SWITCH', designation: 'Q1', switchState: swState },
    { deviceRef: `${prefix}/t1`, kind: 'CT', designation: 'T1' },
    { deviceRef: `${prefix}/head`, kind: 'CABLE_HEAD' },
  ];
}

/**
 * SDF transformer field: rozłącznik 3-poł. (Q1) + bezpieczniki WN (F1) + uziemnik
 * (Q9). The SN/nN transformer itself is NOT a field apparatus — it is the
 * transformation BOUNDARY between the SN tier and the nN tier, drawn once by the
 * nN block (`StationNNBlock.transformer`), so it is not duplicated here.
 */
function sdfTransformerApparatus(
  prefix: string,
  swState: NonNullable<StationApparatus['switchState']>,
): StationApparatus[] {
  return [
    { deviceRef: `${prefix}/q1`, kind: 'LOAD_SWITCH', designation: 'Q1', switchState: swState },
    { deviceRef: `${prefix}/f1`, kind: 'FUSE', designation: 'F1' },
    { deviceRef: `${prefix}/q9`, kind: 'ES', designation: 'Q9', earthingState: 'open' },
  ];
}

/** CBC breaker field: wyłącznik (Q1) + rozłącznik 3-poł. (Q2) + CT + cable head. */
function cbcLineApparatus(
  prefix: string,
  cbState: NonNullable<StationApparatus['switchState']>,
): StationApparatus[] {
  const isolatorState = cbState === 'open' ? 'open' : 'closed';
  return [
    { deviceRef: `${prefix}/q1`, kind: 'CB', designation: 'Q1', switchState: cbState },
    { deviceRef: `${prefix}/q2`, kind: 'LOAD_SWITCH', designation: 'Q2', switchState: isolatorState },
    { deviceRef: `${prefix}/t1`, kind: 'CT', designation: 'T1' },
    { deviceRef: `${prefix}/head`, kind: 'CABLE_HEAD' },
  ];
}

/**
 * SMC coupler (ABB catalog §4.9): the coupler "składa się z dwóch pól — pola z
 * wyłącznikiem typu CBC oraz pola wzniosu szynowego typu BRC". A genuine SMC is
 * therefore TWO cells joined across the bus split:
 *   - rozłącznik 3-poł. A (Q1) — closes section A onto the coupler,
 *   - WYŁĄCZNIK sprzęgła (Q0)  — the protected, sectionalising breaker (NOP here),
 *   - rozłącznik 3-poł. B (Q2) — closes section B onto the coupler.
 * = 2 rozłączniki + 1 wyłącznik. (A single switch would be only a SEC.) The two
 * 3-position switches isolate each section independently; the breaker between
 * them is the section-coupling point that carries the normally-open status.
 */
function smcCouplerApparatus(
  prefix: string,
  breakerState: NonNullable<StationApparatus['switchState']>,
): StationApparatus[] {
  // The section isolators follow the breaker's energisation intent: when the
  // coupler is open (NOP) they rest open too; closing the coupler closes them.
  const isolatorState = breakerState === 'open' ? 'open' : 'closed';
  return [
    { deviceRef: `${prefix}/q1`, kind: 'LOAD_SWITCH', designation: 'Q1', switchState: isolatorState },
    { deviceRef: `${prefix}/q0`, kind: 'CB', designation: 'Q0', switchState: breakerState },
    { deviceRef: `${prefix}/q2`, kind: 'LOAD_SWITCH', designation: 'Q2', switchState: isolatorState },
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
// Canonical branch refs (match the frozen-solver companion keys 1:1).
// =============================================================================

const BR = {
  in: 'sr/branch/in',
  out: 'sr/branch/out',
  tr: 'sr/branch/tr',
  nnF1: 'sr/branch/nn-f1',
  nnF2: 'sr/branch/nn-f2',
  nnPv: 'sr/branch/nn-pv',
  mainOut: 'sr/branch/main-out',
  branch: 'sr/branch/branch',
  coupler: 'sr/branch/coupler',
  lineB: 'sr/branch/line-b',
  outB: 'sr/branch/out-b',
} as const;

// =============================================================================
// nN block builder (transformer → nN busbar → feeders + PV; solver-read power)
// =============================================================================

function nnBlock(prefix: string, feeders: readonly StationNNFeeder[]): StationNNBlock {
  return {
    busVoltageKv: 0.4,
    transformer: {
      deviceRef: `${prefix}/tr`,
      vectorGroup: 'Dyn5',
      ratingLabel: '630 kVA',
      tapChanger: true,
    },
    transformerBranchRef: BR.tr,
    mainBreakerRef: `${prefix}/nn-main`,
    feeders,
  };
}

// =============================================================================
// T1 PRZELOTOWA — SN: LINIA_IN (SDC) + TRANSFORMATOROWE (SDF) + LINIA_OUT (SDC)
//                 nN: transformer Dyn5 → nN busbar → 2 odpływy + PV (backfeed)
// =============================================================================

export function buildT1(): { model: StationRozdzielniaModel; companion: SldPowerFlowCompanion } {
  const companion = STATION_ARCHETYPE_COMPANIONS.T1;
  const fields: StationFieldDescriptor[] = [
    {
      fieldId: 'sr-t1-in',
      role: 'LINIA_IN',
      bayNumber: '10',
      feederName: 'GPZ',
      apparatus: sdcLineApparatus('sr-t1-in', 'closed'),
      protection: [],
      branchRef: BR.in,
    },
    {
      fieldId: 'sr-t1-tr',
      role: 'TRANSFORMATOROWE',
      bayNumber: '11',
      apparatus: sdfTransformerApparatus('sr-t1-tr', 'closed'),
      protection: [],
      branchRef: BR.tr,
    },
    {
      fieldId: 'sr-t1-out',
      role: 'LINIA_OUT',
      bayNumber: '12',
      feederName: 'SADY',
      apparatus: sdcLineApparatus('sr-t1-out', 'closed'),
      protection: [],
      branchRef: BR.out,
    },
  ];
  const nn = nnBlock('sr-t1', [
    { feederId: 'sr-t1-nn-f1', role: 'ODPLYW_NN', feederName: 'ODPŁYW 1', branchRef: BR.nnF1 },
    { feederId: 'sr-t1-nn-f2', role: 'ODPLYW_NN', feederName: 'ODPŁYW 2', branchRef: BR.nnF2 },
    { feederId: 'sr-t1-nn-pv', role: 'ZRODLO_NN_PV', feederName: 'PV 150 kWp', branchRef: BR.nnPv },
  ]);
  const model: StationRozdzielniaModel = {
    stationId: 'sr-t1',
    archetype: 'T1',
    name: 'Stacja przelotowa',
    stationCode: 'S07',
    busVoltageKv: 15,
    fields: withCellTypes(fields),
    caseRef: companion.case_ref,
    caseLabel: companion.case_label,
    nnBlock: nn,
  };
  return { model, companion };
}

// =============================================================================
// T2 KOŃCOWA — SN: LINIA_IN (CBC, line-end protection) + TRANSFORMATOROWE (SDF)
//              nN: transformer Dyn5 → nN busbar → 2 odpływy + PV. No LINIA_OUT.
// =============================================================================

export function buildT2(): { model: StationRozdzielniaModel; companion: SldPowerFlowCompanion } {
  const companion = STATION_ARCHETYPE_COMPANIONS.T2;
  const fields: StationFieldDescriptor[] = [
    {
      fieldId: 'sr-t2-in',
      role: 'LINIA_IN',
      bayNumber: '10',
      feederName: 'CIĄG',
      // Radial feeder terminus → CBC incomer with line-end overcurrent protection.
      apparatus: cbcLineApparatus('sr-t2-in', 'closed'),
      protection: overcurrentSet(false),
      branchRef: BR.in,
    },
    {
      fieldId: 'sr-t2-tr',
      role: 'TRANSFORMATOROWE',
      bayNumber: '11',
      apparatus: sdfTransformerApparatus('sr-t2-tr', 'closed'),
      protection: [],
      branchRef: BR.tr,
    },
  ];
  const nn = nnBlock('sr-t2', [
    { feederId: 'sr-t2-nn-f1', role: 'ODPLYW_NN', feederName: 'ODPŁYW 1', branchRef: BR.nnF1 },
    { feederId: 'sr-t2-nn-f2', role: 'ODPLYW_NN', feederName: 'ODPŁYW 2', branchRef: BR.nnF2 },
    { feederId: 'sr-t2-nn-pv', role: 'ZRODLO_NN_PV', feederName: 'PV 120 kWp', branchRef: BR.nnPv },
  ]);
  const model: StationRozdzielniaModel = {
    stationId: 'sr-t2',
    archetype: 'T2',
    name: 'Stacja końcowa',
    stationCode: 'S29',
    busVoltageKv: 15,
    fields: withCellTypes(fields),
    caseRef: companion.case_ref,
    caseLabel: companion.case_label,
    nnBlock: nn,
  };
  return { model, companion };
}

// =============================================================================
// T3 — ZKSN (BranchPointSN, NOT a station): a cable junction = 1×WE (incomer)
//      + n×WY (outgoing). A "branch" is just MORE outgoing WY fields — there is
//      NO separate "ODG" role. All fields are SDC line fields; NO transformer,
//      NO nN, NO load (the junction stays on SN). BL-01: cable only.
// =============================================================================

/** Outgoing-WY branch refs of the ZKSN, in dispatcher order (n parametric). */
const T3_WY_BRANCH_REFS: readonly string[] = [BR.mainOut, BR.branch];
const T3_WY_FEEDER_NAMES: readonly string[] = ['CIĄG', 'OKRĘŻNA'];

export function buildT3(): { model: StationRozdzielniaModel; companion: SldPowerFlowCompanion } {
  const companion = STATION_ARCHETYPE_COMPANIONS.T3;
  // 1×WE incomer.
  const fields: StationFieldDescriptor[] = [
    {
      fieldId: 'sr-t3-in',
      role: 'LINIA_IN',
      bayNumber: '1',
      feederName: 'GPZ',
      apparatus: sdcLineApparatus('sr-t3-in', 'closed'),
      protection: [],
      branchRef: BR.in,
    },
  ];
  // n×WY outgoing — every outgoing cable is the SAME role (LINIA_OUT) and type
  // (SDC). A rozgałęzienie is simply more WY, never a distinct "ODG" field.
  T3_WY_BRANCH_REFS.forEach((branchRef, i) => {
    fields.push({
      fieldId: `sr-t3-wy${i + 1}`,
      role: 'LINIA_OUT',
      bayNumber: String(i + 2),
      feederName: T3_WY_FEEDER_NAMES[i] ?? `WY${i + 1}`,
      apparatus: sdcLineApparatus(`sr-t3-wy${i + 1}`, 'closed'),
      protection: [],
      branchRef,
    });
  });
  const model: StationRozdzielniaModel = {
    stationId: 'sr-t3',
    archetype: 'T3',
    name: 'ZKSN — złącze kablowe SN',
    stationCode: 'Z04',
    projection: 'zksn',
    branchPointType: 'zksn',
    busVoltageKv: 15,
    fields: withCellTypes(fields),
    caseRef: companion.case_ref,
    caseLabel: companion.case_label,
  };
  return { model, companion };
}

// =============================================================================
// T4 SEKCYJNA — two independently-energised bus sections (CIĄG A / CIĄG B)
//   joined by an ABB SMC coupler (CBC + BRC) at a NORMALLY-OPEN point.
//   Section A: WE-A (in) + WY-A (out);  Section B: WE-B (line-b) + WY-B (out-b).
// =============================================================================

export function buildT4(): { model: StationRozdzielniaModel; companion: SldPowerFlowCompanion } {
  const companion = STATION_ARCHETYPE_COMPANIONS.T4;
  const fields: StationFieldDescriptor[] = [
    {
      fieldId: 'sr-t4-in',
      role: 'LINIA_IN',
      bayNumber: '1',
      feederName: 'CIĄG A',
      apparatus: sdcLineApparatus('sr-t4-in', 'closed'),
      protection: [],
      branchRef: BR.in,
    },
    {
      fieldId: 'sr-t4-out',
      role: 'LINIA_OUT',
      bayNumber: '2',
      feederName: 'ODB. A',
      apparatus: sdcLineApparatus('sr-t4-out', 'closed'),
      protection: [],
      branchRef: BR.out,
    },
    {
      // The sectionalizing coupler — ABB SMC (CBC + BRC), NORMALLY OPEN.
      fieldId: 'sr-t4-coupler',
      role: 'SPRZEGLO',
      bayNumber: '3',
      feederName: 'SPRZĘGŁO',
      apparatus: smcCouplerApparatus('sr-t4-coupler', 'open'),
      protection: overcurrentSet(false),
      branchRef: BR.coupler,
      isNormallyOpen: true,
    },
    {
      fieldId: 'sr-t4-in-b',
      role: 'LINIA_IN',
      bayNumber: '4',
      feederName: 'CIĄG B',
      apparatus: sdcLineApparatus('sr-t4-in-b', 'closed'),
      protection: [],
      branchRef: BR.lineB,
    },
    {
      fieldId: 'sr-t4-out-b',
      role: 'LINIA_OUT',
      bayNumber: '5',
      feederName: 'ODB. B',
      apparatus: sdcLineApparatus('sr-t4-out-b', 'closed'),
      protection: [],
      branchRef: BR.outB,
    },
  ];
  const model: StationRozdzielniaModel = {
    stationId: 'sr-t4',
    archetype: 'T4',
    name: 'Stacja sekcyjna',
    stationCode: 'S22',
    busVoltageKv: 15,
    fields: withCellTypes(fields),
    caseRef: companion.case_ref,
    caseLabel: companion.case_label,
    sectionedBus: true,
    sectionABranchRef: BR.in,
    sectionBBranchRef: BR.lineB,
  };
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
