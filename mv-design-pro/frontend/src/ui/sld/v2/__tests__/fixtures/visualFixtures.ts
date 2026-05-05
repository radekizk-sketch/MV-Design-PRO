/**
 * 15 visual fixtures dla PR-14 — pełen zestaw scenariuszy briefa 1 §16 + briefa 2 §20.J.
 *
 * Każda fixture buduje BuildSequence + EffectiveLayout.
 * Used by visual regression tests + golden snapshot tests.
 */

import {
  appendCommand,
  emptyBuildSequence,
  type BuildCommand,
  type BuildSequence,
} from '../../builder/BuildSequence';

export interface VisualFixture {
  readonly id: string;
  readonly nameP: string;
  readonly description: string;
  readonly buildSequence: BuildSequence;
}

function fromCommands(...commands: BuildCommand[]): BuildSequence {
  let seq = emptyBuildSequence();
  for (const c of commands) {
    seq = appendCommand(seq, c);
  }
  return seq;
}

// ---------------------------------------------------------------------------
// Fixture 1: GPZ z rozdzielnią SN 12-polową
// ---------------------------------------------------------------------------

export const FIXTURE_GPZ_12_BAYS: VisualFixture = {
  id: 'gpz_12_bays',
  nameP: 'GPZ z 12-polową rozdzielnią',
  description:
    'GPZ + 2 sekcje × 6 pól (line_in, line_out, transformer, measurement, '
    + 'coupler, der_pv) + sprzęgło sekcyjne. 12 pól z różnymi stanami aparatów.',
  buildSequence: fromCommands(
    {
      type: 'InsertGpz',
      id: 'gpz_main',
      name: 'GPZ Główny 110/15 kV',
      voltageHighKv: 110,
      voltageLowKv: 15,
      scShortCircuitMva: 500,
    },
    { type: 'AddSection', id: 'section_1', gpzId: 'gpz_main', number: 1, busVoltageKv: 15 },
    { type: 'AddSection', id: 'section_2', gpzId: 'gpz_main', number: 2, busVoltageKv: 15 },
    // Sekcja I (6 pól)
    { type: 'AddBay', id: 'bay_1_F01', sectionId: 'section_1', designation: 'F-01', bayTemplateId: 'bay_template_line_out' },
    { type: 'AddBay', id: 'bay_1_F02', sectionId: 'section_1', designation: 'F-02', bayTemplateId: 'bay_template_line_out' },
    { type: 'AddBay', id: 'bay_1_TR1', sectionId: 'section_1', designation: 'TR-1', bayTemplateId: 'bay_template_transformer' },
    { type: 'AddBay', id: 'bay_1_PT', sectionId: 'section_1', designation: 'PT', bayTemplateId: 'bay_template_measurement' },
    { type: 'AddBay', id: 'bay_1_PV', sectionId: 'section_1', designation: 'PV-1', bayTemplateId: 'bay_template_der_pv' },
    { type: 'AddBay', id: 'bay_coupler', sectionId: 'section_1', designation: 'Sprzęgło', bayTemplateId: 'bay_template_coupler' },
    // Sekcja II (6 pól)
    { type: 'AddBay', id: 'bay_2_F03', sectionId: 'section_2', designation: 'F-03', bayTemplateId: 'bay_template_line_out' },
    { type: 'AddBay', id: 'bay_2_F04', sectionId: 'section_2', designation: 'F-04', bayTemplateId: 'bay_template_line_out' },
    { type: 'AddBay', id: 'bay_2_F05', sectionId: 'section_2', designation: 'F-05', bayTemplateId: 'bay_template_line_out' },
    { type: 'AddBay', id: 'bay_2_TR2', sectionId: 'section_2', designation: 'TR-2', bayTemplateId: 'bay_template_transformer' },
    { type: 'AddBay', id: 'bay_2_BESS', sectionId: 'section_2', designation: 'BESS-1', bayTemplateId: 'bay_template_der_bess' },
    { type: 'AddBay', id: 'bay_2_RES', sectionId: 'section_2', designation: 'Rezerwa', bayTemplateId: 'bay_template_reserve' },
  ),
};

// ---------------------------------------------------------------------------
// Fixture 2: Sieć terenowa pełna (GPZ + ciąg + 3 stacje + odgałęzienie + DER + NOP)
// ---------------------------------------------------------------------------

export const FIXTURE_TERRAIN_NETWORK: VisualFixture = {
  id: 'terrain_network',
  nameP: 'Sieć terenowa pełna',
  description:
    'GPZ + ciąg główny kablowy + odgałęzienie napowietrzne + 3 stacje + ZKSN + PV + BESS + NOP',
  buildSequence: fromCommands(
    {
      type: 'InsertGpz', id: 'gpz_t', name: 'GPZ Terenowy', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: 400,
    },
    { type: 'AddSection', id: 'sec_t', gpzId: 'gpz_t', number: 1, busVoltageKv: 15 },
    { type: 'AddBay', id: 'bay_t_F1', sectionId: 'sec_t', designation: 'F-01', bayTemplateId: 'bay_template_line_out' },
    {
      type: 'ExtendCableRun', id: 'run_t', fromBayId: 'bay_t_F1',
      fromPortId: 'gpz_t:bay_t_F1:sn_output', runKind: 'main_trunk',
      segmentKind: 'cable_sn', catalogRef: 'mv_cable_3x240', lengthKm: 2.5,
      parentRunId: null, branchOriginStationId: null,
    },
    { type: 'InsertStationOnRun', id: 'st_inline', runId: 'run_t', afterSegmentId: 's0', stationName: 'ST-Inline', stationTemplateId: 'station_template_inline' },
    { type: 'InsertStationOnRun', id: 'st_branch', runId: 'run_t', afterSegmentId: 's1', stationName: 'ST-Branch', stationTemplateId: 'station_template_branch' },
    { type: 'InsertStationOnRun', id: 'st_term', runId: 'run_t', afterSegmentId: 's2', stationName: 'ST-Końcowa', stationTemplateId: 'station_template_terminal' },
    {
      type: 'ExtendCableRun', id: 'branch_run', fromBayId: 'bay_t_F1',
      fromPortId: 'st_branch:branch_port:sn_branch', runKind: 'branch',
      segmentKind: 'overhead_line_sn', catalogRef: 'mv_overhead_AFL_70',
      lengthKm: 3.0, parentRunId: 'run_t', branchOriginStationId: 'st_branch',
    },
    {
      type: 'AttachDer', id: 'pv_t', derKind: 'PV',
      attachmentPortId: 'st_term:der_port:sn_der_pv', parentStationId: 'st_term',
      nominalPowerKw: 2000, portKind: 'sn_der_pv',
    },
    {
      type: 'AttachDer', id: 'bess_t', derKind: 'BESS',
      attachmentPortId: 'st_branch:der_port:sn_der_bess', parentStationId: 'st_branch',
      nominalPowerKw: 1000, portKind: 'sn_der_bess',
    },
    { type: 'SetNop', runId: 'run_t', stationId: 'st_term' },
  ),
};

// ---------------------------------------------------------------------------
// Fixtures 3-7: 4 typy topologiczne stacji + sectional
// ---------------------------------------------------------------------------

function singleStationFixture(id: string, namePl: string, templateId: string): VisualFixture {
  return {
    id,
    nameP: namePl,
    description: `Single ${namePl} attached to GPZ via cable_sn.`,
    buildSequence: fromCommands(
      { type: 'InsertGpz', id: 'g', name: 'GPZ', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: 300 },
      { type: 'AddSection', id: 's', gpzId: 'g', number: 1, busVoltageKv: 15 },
      { type: 'AddBay', id: 'b', sectionId: 's', designation: 'F1', bayTemplateId: 'bay_template_line_out' },
      {
        type: 'ExtendCableRun', id: 'r', fromBayId: 'b', fromPortId: 'g:b:sn_output',
        runKind: 'main_trunk', segmentKind: 'cable_sn', catalogRef: null, lengthKm: 1.5,
        parentRunId: null, branchOriginStationId: null,
      },
      { type: 'InsertStationOnRun', id: 'st', runId: 'r', afterSegmentId: 's0', stationName: namePl, stationTemplateId: templateId },
    ),
  };
}

export const FIXTURE_STATION_TERMINAL = singleStationFixture('station_terminal', 'Stacja końcowa', 'station_template_terminal');
export const FIXTURE_STATION_INLINE = singleStationFixture('station_inline', 'Stacja przelotowa', 'station_template_inline');
export const FIXTURE_STATION_BRANCH = singleStationFixture('station_branch', 'Stacja odgałęźna', 'station_template_branch');
export const FIXTURE_STATION_SECTIONAL = singleStationFixture('station_sectional', 'Stacja sekcyjna', 'station_template_sectional');

// ---------------------------------------------------------------------------
// Fixture 8: Wewnętrzny SLD stacji (multi-voltage industrial)
// ---------------------------------------------------------------------------

export const FIXTURE_INTERNAL_SLD_INDUSTRIAL: VisualFixture = {
  id: 'internal_sld_industrial',
  nameP: 'Wewnętrzny SLD stacji przemysłowej',
  description: 'Stacja przemysłowa z multi-voltage nN (6 kV + 0,4 kV) — 2 transformatory, 2 rozdzielnice nN.',
  buildSequence: fromCommands(
    { type: 'InsertGpz', id: 'g_ind', name: 'GPZ Przemysłowy', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: 600 },
    { type: 'AddSection', id: 's_ind', gpzId: 'g_ind', number: 1, busVoltageKv: 15 },
    { type: 'AddBay', id: 'b_ind', sectionId: 's_ind', designation: 'F-PI', bayTemplateId: 'bay_template_line_out' },
    {
      type: 'ExtendCableRun', id: 'r_ind', fromBayId: 'b_ind',
      fromPortId: 'g_ind:b_ind:sn_output', runKind: 'main_trunk',
      segmentKind: 'cable_sn', catalogRef: null, lengthKm: 1.0,
      parentRunId: null, branchOriginStationId: null,
    },
    { type: 'InsertStationOnRun', id: 'st_ind', runId: 'r_ind', afterSegmentId: 's0', stationName: 'Stacja przemysłowa ZPM', stationTemplateId: 'station_template_industrial_custom_nn' },
  ),
};

// ---------------------------------------------------------------------------
// Fixtures 9-12: DER variants (PV/BESS w SN/nN)
// ---------------------------------------------------------------------------

function derFixture(id: string, namePl: string, derKind: 'PV' | 'BESS', portKind: 'sn_der_pv' | 'sn_der_bess' | 'nn_der_pv' | 'nn_der_bess'): VisualFixture {
  return {
    id,
    nameP: namePl,
    description: `Single ${derKind} attached via ${portKind}.`,
    buildSequence: fromCommands(
      { type: 'InsertGpz', id: 'g', name: 'GPZ', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: 300 },
      { type: 'AddSection', id: 's', gpzId: 'g', number: 1, busVoltageKv: 15 },
      { type: 'AddBay', id: 'b', sectionId: 's', designation: 'F-DER', bayTemplateId: 'bay_template_der_pv' },
      {
        type: 'ExtendCableRun', id: 'r', fromBayId: 'b', fromPortId: 'g:b:sn_der_pv',
        runKind: 'main_trunk', segmentKind: 'cable_sn', catalogRef: null, lengthKm: 0.5,
        parentRunId: null, branchOriginStationId: null,
      },
      { type: 'InsertStationOnRun', id: 'st_der', runId: 'r', afterSegmentId: 's0', stationName: `Stacja ${derKind}`, stationTemplateId: derKind === 'PV' ? 'station_template_pv' : 'station_template_bess' },
      {
        type: 'AttachDer', id: 'der_x', derKind, attachmentPortId: `st_der:der_port:${portKind}`,
        parentStationId: 'st_der', nominalPowerKw: 2000, portKind,
      },
    ),
  };
}

export const FIXTURE_PV_SN = derFixture('pv_sn', 'PV po SN', 'PV', 'sn_der_pv');
export const FIXTURE_PV_NN = derFixture('pv_nn', 'PV po nN', 'PV', 'nn_der_pv');
export const FIXTURE_BESS_SN = derFixture('bess_sn', 'BESS po SN', 'BESS', 'sn_der_bess');
export const FIXTURE_BESS_NN = derFixture('bess_nn', 'BESS po nN', 'BESS', 'nn_der_bess');

// ---------------------------------------------------------------------------
// Fixture 13: FW (placeholder — czeka na PR-16 RMS solver dla NCRFG testbench)
// ---------------------------------------------------------------------------

export const FIXTURE_FW: VisualFixture = {
  id: 'fw_farm',
  nameP: 'Farma wiatrowa (placeholder)',
  description: 'FW z brakiem modułu obliczeniowego (no_module status). Schema kompletna do PR-16.',
  buildSequence: fromCommands(
    { type: 'InsertGpz', id: 'g_fw', name: 'GPZ FW', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: 800 },
    { type: 'AddSection', id: 's_fw', gpzId: 'g_fw', number: 1, busVoltageKv: 15 },
    { type: 'AddBay', id: 'b_fw', sectionId: 's_fw', designation: 'F-FW', bayTemplateId: 'bay_template_der_fw' },
    {
      type: 'ExtendCableRun', id: 'r_fw', fromBayId: 'b_fw',
      fromPortId: 'g_fw:b_fw:sn_der_fw', runKind: 'main_trunk',
      segmentKind: 'cable_sn', catalogRef: null, lengthKm: 5.0,
      parentRunId: null, branchOriginStationId: null,
    },
    { type: 'InsertStationOnRun', id: 'st_fw', runId: 'r_fw', afterSegmentId: 's0', stationName: 'FW Wiatropol', stationTemplateId: 'station_template_fw' },
    {
      type: 'AttachDer', id: 'fw_der', derKind: 'FW',
      attachmentPortId: 'st_fw:der_port:sn_der_fw', parentStationId: 'st_fw',
      nominalPowerKw: 30000, portKind: 'sn_der_fw',
    },
  ),
};

// ---------------------------------------------------------------------------
// Fixtures 14-15: Braki danych + wynik częściowy + zakaz 0.00
// ---------------------------------------------------------------------------

export const FIXTURE_MISSING_DATA: VisualFixture = {
  id: 'missing_data',
  nameP: 'Sieć z brakami danych',
  description: 'Pełna struktura ale braki w katalogu kabla → status partial w readiness.',
  buildSequence: fromCommands(
    { type: 'InsertGpz', id: 'g_md', name: 'GPZ', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: null },
    { type: 'AddSection', id: 's_md', gpzId: 'g_md', number: 1, busVoltageKv: 15 },
    { type: 'AddBay', id: 'b_md', sectionId: 's_md', designation: 'F-MD', bayTemplateId: 'bay_template_line_out' },
    {
      type: 'ExtendCableRun', id: 'r_md', fromBayId: 'b_md', fromPortId: 'g_md:b_md:sn_output',
      runKind: 'main_trunk', segmentKind: 'cable_sn', catalogRef: null, lengthKm: 1.0,
      parentRunId: null, branchOriginStationId: null,
    },
    { type: 'InsertStationOnRun', id: 'st_md', runId: 'r_md', afterSegmentId: 's0', stationName: 'ST-MD', stationTemplateId: 'station_template_terminal' },
  ),
};

export const FIXTURE_NO_CALCULATIONS: VisualFixture = {
  id: 'no_calculations',
  nameP: 'Sieć przed obliczeniami (zakaz 0.00 spam)',
  description: 'Pełna sieć ale brak uruchomionych obliczeń. Wszystkie wartości pomiarowe = "—" (formatPolishValue).',
  buildSequence: FIXTURE_TERRAIN_NETWORK.buildSequence,  // Reuse terrain network struct
};

// ---------------------------------------------------------------------------
// Pełen zestaw 15 fixtures
// ---------------------------------------------------------------------------

export const ALL_VISUAL_FIXTURES: readonly VisualFixture[] = [
  FIXTURE_GPZ_12_BAYS,
  FIXTURE_TERRAIN_NETWORK,
  FIXTURE_STATION_TERMINAL,
  FIXTURE_STATION_INLINE,
  FIXTURE_STATION_BRANCH,
  FIXTURE_STATION_SECTIONAL,
  FIXTURE_INTERNAL_SLD_INDUSTRIAL,
  FIXTURE_PV_SN,
  FIXTURE_PV_NN,
  FIXTURE_BESS_SN,
  FIXTURE_BESS_NN,
  FIXTURE_FW,
  FIXTURE_MISSING_DATA,
  FIXTURE_NO_CALCULATIONS,
  // Fixture 15: Edge case — pusty projekt (Scenariusz A briefa §15)
  {
    id: 'empty_project',
    nameP: 'Pusty projekt — pierwsza akcja',
    description: 'Pusty SLD pokazuje hint "Wstaw główny punkt zasilania" (Scenariusz A).',
    buildSequence: emptyBuildSequence(),
  },
];

export const FIXTURE_COUNT = ALL_VISUAL_FIXTURES.length;
