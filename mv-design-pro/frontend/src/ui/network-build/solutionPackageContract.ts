export type SolutionKind =
  | 'GPZ'
  | 'MV_LINE_SEGMENT'
  | 'MV_LV_STATION'
  | 'DER_STATION'
  | 'PROTECTION_SET'
  | 'REPORT_PROOF_BINDING';

export type MaterializedElementKind =
  | 'bus'
  | 'branch'
  | 'bay'
  | 'transformer'
  | 'load'
  | 'generator'
  | 'measurement'
  | 'protection'
  | 'corridor'
  | 'line_run';

export interface DesignerInputDef {
  readonly key: string;
  readonly labelPl: string;
  readonly unit?: string;
  readonly required: boolean;
}

export interface MaterializedElementDef {
  readonly kind: MaterializedElementKind;
  readonly role: string;
  readonly labelPl: string;
  readonly catalogRef?: string;
}

export interface SolutionAuditTraceEntry {
  readonly step: string;
  readonly labelPl: string;
  readonly sourceCatalogRef: string;
}

export interface ProofBindingDef {
  readonly proofKind:
    | 'SC3F'
    | 'VDROP'
    | 'APPARATUS_WITHSTAND'
    | 'POWER_FLOW'
    | 'ENERGY_LOSSES'
    | 'PROTECTION'
    | 'EARTH_FAULT'
    | 'VOLTAGE_PROFILE';
  readonly labelPl: string;
}

export interface SolutionPackage {
  readonly solution_ref: string;
  readonly solution_kind: SolutionKind;
  readonly catalog_version: string;
  readonly labelPl: string;
  readonly designer_inputs: readonly DesignerInputDef[];
  readonly materialized_elements: readonly MaterializedElementDef[];
  readonly audit_trace: readonly SolutionAuditTraceEntry[];
  readonly proof_bindings: readonly ProofBindingDef[];
  readonly fingerprint: string;
}

export interface SolutionMaterializationResult {
  readonly solution_ref: string;
  readonly solution_kind: SolutionKind;
  readonly materialized_elements: readonly MaterializedElementDef[];
  readonly audit_trace: readonly SolutionAuditTraceEntry[];
  readonly fingerprint: string;
}

export type GpzSolution = SolutionPackage & { readonly solution_kind: 'GPZ' };
export type MvLineSegmentSolution = SolutionPackage & { readonly solution_kind: 'MV_LINE_SEGMENT' };
export type MvLvStationSolution = SolutionPackage & { readonly solution_kind: 'MV_LV_STATION' };
export type DerConnectionSolution = SolutionPackage & { readonly solution_kind: 'DER_STATION' };
export type ProtectionSolution = SolutionPackage & { readonly solution_kind: 'PROTECTION_SET' };
export type ReportProofBindingSolution = SolutionPackage & {
  readonly solution_kind: 'REPORT_PROOF_BINDING';
};

export interface SolutionCompletenessReport {
  readonly solutionRef: string;
  readonly solutionKind: SolutionKind;
  readonly complete: boolean;
  readonly errors: readonly string[];
}

const REQUIRED_ELEMENT_KINDS_BY_SOLUTION_KIND: Readonly<
  Record<SolutionKind, readonly MaterializedElementKind[]>
> = {
  GPZ: ['bus', 'bay', 'transformer', 'generator', 'measurement', 'protection', 'corridor', 'line_run'],
  MV_LINE_SEGMENT: ['branch', 'corridor', 'line_run'],
  MV_LV_STATION: ['bus', 'bay', 'transformer', 'load', 'measurement', 'protection', 'line_run'],
  DER_STATION: ['bus', 'bay', 'transformer', 'generator', 'measurement', 'protection', 'line_run'],
  PROTECTION_SET: ['measurement', 'protection'],
  REPORT_PROOF_BINDING: ['measurement', 'protection'],
};

const REQUIRED_PROOFS_BY_SOLUTION_KIND: Readonly<Record<SolutionKind, readonly ProofBindingDef['proofKind'][]>> = {
  GPZ: ['SC3F', 'APPARATUS_WITHSTAND', 'PROTECTION'],
  MV_LINE_SEGMENT: ['VDROP', 'POWER_FLOW'],
  MV_LV_STATION: ['SC3F', 'VDROP', 'APPARATUS_WITHSTAND', 'POWER_FLOW', 'PROTECTION'],
  DER_STATION: ['POWER_FLOW', 'VOLTAGE_PROFILE', 'PROTECTION'],
  PROTECTION_SET: ['PROTECTION'],
  REPORT_PROOF_BINDING: [
    'SC3F',
    'VDROP',
    'APPARATUS_WITHSTAND',
    'POWER_FLOW',
    'ENERGY_LOSSES',
    'PROTECTION',
    'EARTH_FAULT',
    'VOLTAGE_PROFILE',
  ],
};

const TECHNICAL_LABEL_FORBIDDEN_PATTERNS = [
  /\b[0-9a-f]{12,}\b/i,
  /\bseg[/-]/i,
  /\bref[/-]/i,
  /\bstn[/-]/i,
  /\bgpz[/-][0-9a-f]/i,
] as const;

export function validateSolutionPackageCompleteness(
  solution: SolutionPackage,
): SolutionCompletenessReport {
  const errors: string[] = [];

  if (!solution.solution_ref.trim()) errors.push('Pakiet nie ma identyfikatora katalogowego.');
  if (!solution.catalog_version.trim()) errors.push('Pakiet nie ma wersji katalogu.');
  if (!solution.labelPl.trim()) errors.push('Pakiet nie ma nazwy technicznej.');
  if (!solution.fingerprint.trim()) errors.push('Pakiet nie ma deterministycznego fingerprintu.');
  if (solution.designer_inputs.length === 0) errors.push('Pakiet nie ma danych wejściowych projektanta.');
  if (solution.audit_trace.length === 0) errors.push('Pakiet nie ma śladu audytu materializacji.');

  const elementKinds = new Set(solution.materialized_elements.map((element) => element.kind));
  for (const kind of REQUIRED_ELEMENT_KINDS_BY_SOLUTION_KIND[solution.solution_kind]) {
    if (!elementKinds.has(kind)) {
      errors.push(`Pakiet ${solution.solution_kind} nie materializuje elementu ENM: ${kind}.`);
    }
  }

  const proofKinds = new Set(solution.proof_bindings.map((proof) => proof.proofKind));
  for (const proofKind of REQUIRED_PROOFS_BY_SOLUTION_KIND[solution.solution_kind]) {
    if (!proofKinds.has(proofKind)) {
      errors.push(`Pakiet ${solution.solution_kind} nie ma powiązania dowodu: ${proofKind}.`);
    }
  }

  for (const label of [
    solution.labelPl,
    ...solution.materialized_elements.map((element) => element.labelPl),
    ...solution.proof_bindings.map((proof) => proof.labelPl),
  ]) {
    if (TECHNICAL_LABEL_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(label))) {
      errors.push(`Etykieta techniczna nie może ujawniać identyfikatora wewnętrznego: ${label}.`);
    }
  }

  return {
    solutionRef: solution.solution_ref,
    solutionKind: solution.solution_kind,
    complete: errors.length === 0,
    errors,
  };
}

export function buildSolutionCompletenessReport(
  solutions: readonly SolutionPackage[],
): readonly SolutionCompletenessReport[] {
  return solutions.map(validateSolutionPackageCompleteness);
}

export const REFERENCE_SOLUTION_PACKAGES: readonly SolutionPackage[] = [
  {
    solution_ref: 'solution.gpz.110-15.two-section',
    solution_kind: 'GPZ',
    catalog_version: '2026.05',
    labelPl: 'GPZ 110/15 kV, dwie sekcje SN',
    designer_inputs: [
      { key: 'mvVoltageKv', labelPl: 'Napięcie rozdzielni SN', unit: 'kV', required: true },
      { key: 'sections', labelPl: 'Liczba sekcji szyn SN', required: true },
      { key: 'earthing', labelPl: 'Uziemienie punktu neutralnego', required: true },
    ],
    materialized_elements: [
      { kind: 'generator', role: 'system_source', labelPl: 'Źródło systemowe 110 kV' },
      { kind: 'transformer', role: 'hv_mv_transformer', labelPl: 'Transformator 110/15 kV' },
      { kind: 'bus', role: 'mv_busbar_section', labelPl: 'Sekcja szyn SN' },
      { kind: 'bay', role: 'line_bay', labelPl: 'Pole liniowe SN' },
      { kind: 'bay', role: 'coupler_bay', labelPl: 'Pole sprzęgłowe SN' },
      { kind: 'measurement', role: 'ct_vt_metering', labelPl: 'Pomiar rozliczeniowy SN' },
      { kind: 'protection', role: 'feeder_protection', labelPl: 'Zabezpieczenie pola liniowego' },
      { kind: 'corridor', role: 'outgoing_corridor', labelPl: 'Wyprowadzenie magistrali SN' },
      { kind: 'line_run', role: 'main_trunk', labelPl: 'Magistrala SN' },
    ],
    audit_trace: [
      {
        step: 'materialize_gpz_switchgear',
        labelPl: 'Materializacja rozdzielni SN z polami i sekcjami',
        sourceCatalogRef: 'gpz_solution_catalog:110-15-two-section',
      },
    ],
    proof_bindings: [
      { proofKind: 'SC3F', labelPl: 'Zwarcie 3-fazowe IEC 60909' },
      { proofKind: 'APPARATUS_WITHSTAND', labelPl: 'Wytrzymałość aparatury SN' },
      { proofKind: 'PROTECTION', labelPl: 'Koordynacja zabezpieczeń GPZ' },
    ],
    fingerprint: 'gpz-110-15-two-section-v2026-05',
  },
  {
    solution_ref: 'solution.mv-line.na2xs2y.3x1x150-25',
    solution_kind: 'MV_LINE_SEGMENT',
    catalog_version: '2026.05',
    labelPl: 'Odcinek kablowy SN 3×1×150/25 mm²',
    designer_inputs: [
      { key: 'lengthM', labelPl: 'Długość odcinka', unit: 'm', required: true },
      { key: 'installation', labelPl: 'Sposób ułożenia', required: true },
    ],
    materialized_elements: [
      { kind: 'branch', role: 'mv_cable_branch', labelPl: 'Odcinek kablowy SN' },
      { kind: 'corridor', role: 'main_trunk_lane', labelPl: 'Kanał magistrali SN' },
      { kind: 'line_run', role: 'main_trunk_order', labelPl: 'Ciąg magistrali SN' },
    ],
    audit_trace: [
      {
        step: 'materialize_mv_line_segment',
        labelPl: 'Materializacja odcinka z terminalami ciągu SN',
        sourceCatalogRef: 'mv_line_segment_catalog:na2xs2y-3x1x150-25',
      },
    ],
    proof_bindings: [
      { proofKind: 'VDROP', labelPl: 'Spadek napięcia odcinka SN' },
      { proofKind: 'POWER_FLOW', labelPl: 'Rozpływ mocy w odcinku SN' },
    ],
    fingerprint: 'mv-line-na2xs2y-3x1x150-25-v2026-05',
  },
  {
    solution_ref: 'solution.station.mv-lv.rmu-inline',
    solution_kind: 'MV_LV_STATION',
    catalog_version: '2026.05',
    labelPl: 'Stacja przelotowa SN/nN z rozdzielnią RMU',
    designer_inputs: [
      { key: 'stationName', labelPl: 'Nazwa stacji', required: true },
      { key: 'transformerRatingKva', labelPl: 'Moc transformatora', unit: 'kVA', required: true },
      { key: 'loadProfile', labelPl: 'Profil odbiorów nN', required: true },
    ],
    materialized_elements: [
      { kind: 'bus', role: 'mv_station_bus', labelPl: 'Szyna SN stacji' },
      { kind: 'bay', role: 'incoming_bay', labelPl: 'Pole wejściowe SN' },
      { kind: 'bay', role: 'outgoing_bay', labelPl: 'Pole wyjściowe SN' },
      { kind: 'bay', role: 'transformer_bay', labelPl: 'Pole transformatorowe SN' },
      { kind: 'transformer', role: 'mv_lv_transformer', labelPl: 'Transformator SN/nN' },
      { kind: 'bus', role: 'lv_busbar', labelPl: 'Rozdzielnia nN' },
      { kind: 'load', role: 'lv_load', labelPl: 'Odbiór nN' },
      { kind: 'measurement', role: 'billing_metering', labelPl: 'Pomiar rozliczeniowy' },
      { kind: 'protection', role: 'station_protection', labelPl: 'Zabezpieczenie stacji' },
      { kind: 'line_run', role: 'station_inserted_on_run', labelPl: 'Węzeł ciągu SN' },
    ],
    audit_trace: [
      {
        step: 'materialize_mv_lv_station',
        labelPl: 'Materializacja stacji jako węzła ciągu SN',
        sourceCatalogRef: 'mv_lv_station_solution_catalog:rmu-inline',
      },
    ],
    proof_bindings: [
      { proofKind: 'SC3F', labelPl: 'Zwarcie 3-fazowe w stacji' },
      { proofKind: 'VDROP', labelPl: 'Spadek napięcia do stacji' },
      { proofKind: 'APPARATUS_WITHSTAND', labelPl: 'Wytrzymałość aparatury stacji' },
      { proofKind: 'POWER_FLOW', labelPl: 'Rozpływ mocy stacji' },
      { proofKind: 'PROTECTION', labelPl: 'Zabezpieczenia stacji' },
    ],
    fingerprint: 'station-rmu-inline-v2026-05',
  },
  {
    solution_ref: 'solution.der.pv-bess-mv-pcc',
    solution_kind: 'DER_STATION',
    catalog_version: '2026.05',
    labelPl: 'Układ przyłączeniowy PV+BESS po stronie SN',
    designer_inputs: [
      { key: 'pccVoltageKv', labelPl: 'Napięcie PCC', unit: 'kV', required: true },
      { key: 'pvPowerKw', labelPl: 'Moc PV', unit: 'kW', required: true },
      { key: 'bessEnergyKwh', labelPl: 'Energia BESS', unit: 'kWh', required: true },
    ],
    materialized_elements: [
      { kind: 'bus', role: 'pcc_bus', labelPl: 'Punkt przyłączenia PCC' },
      { kind: 'bay', role: 'der_connection_bay', labelPl: 'Pole przyłączeniowe OZE' },
      { kind: 'transformer', role: 'block_transformer', labelPl: 'Transformator blokowy OZE' },
      { kind: 'generator', role: 'pv_generator', labelPl: 'Źródło PV' },
      { kind: 'generator', role: 'bess_converter', labelPl: 'Magazyn energii BESS' },
      { kind: 'measurement', role: 'pcc_metering', labelPl: 'Pomiar w PCC' },
      { kind: 'protection', role: 'der_protection', labelPl: 'Zabezpieczenie przyłączeniowe OZE' },
      { kind: 'line_run', role: 'der_connection_run', labelPl: 'Przyłącze OZE' },
    ],
    audit_trace: [
      {
        step: 'materialize_der_connection',
        labelPl: 'Materializacja układu przyłączeniowego OZE',
        sourceCatalogRef: 'der_connection_solution_catalog:pv-bess-mv-pcc',
      },
    ],
    proof_bindings: [
      { proofKind: 'POWER_FLOW', labelPl: 'Rozpływ mocy OZE' },
      { proofKind: 'VOLTAGE_PROFILE', labelPl: 'Profil napięciowy w PCC' },
      { proofKind: 'PROTECTION', labelPl: 'Zabezpieczenia przyłączeniowe OZE' },
    ],
    fingerprint: 'der-pv-bess-mv-pcc-v2026-05',
  },
  {
    solution_ref: 'solution.protection.mv-feeder',
    solution_kind: 'PROTECTION_SET',
    catalog_version: '2026.05',
    labelPl: 'Zestaw zabezpieczeń pola liniowego SN',
    designer_inputs: [
      { key: 'feederRole', labelPl: 'Rola pola SN', required: true },
      { key: 'ctRatio', labelPl: 'Przekładnia przekładnika prądowego', required: true },
    ],
    materialized_elements: [
      { kind: 'measurement', role: 'ct_vt_set', labelPl: 'Przekładniki pomiarowo-zabezpieczeniowe' },
      { kind: 'protection', role: 'mv_feeder_relay', labelPl: 'Przekaźnik zabezpieczeniowy pola SN' },
    ],
    audit_trace: [
      {
        step: 'materialize_protection_set',
        labelPl: 'Materializacja przekładników, funkcji i nastaw bazowych',
        sourceCatalogRef: 'protection_solution_catalog:mv-feeder',
      },
    ],
    proof_bindings: [{ proofKind: 'PROTECTION', labelPl: 'Selektywność zabezpieczeń SN' }],
    fingerprint: 'protection-mv-feeder-v2026-05',
  },
  {
    solution_ref: 'solution.report-proof.full-engineering',
    solution_kind: 'REPORT_PROOF_BINDING',
    catalog_version: '2026.05',
    labelPl: 'Pakiet dowodów i raportu technicznego',
    designer_inputs: [
      { key: 'reportScope', labelPl: 'Zakres raportu', required: true },
      { key: 'calculationScope', labelPl: 'Zakres obliczeń', required: true },
    ],
    materialized_elements: [
      { kind: 'measurement', role: 'calculation_trace_inputs', labelPl: 'Dane wejściowe obliczeń' },
      { kind: 'protection', role: 'protection_trace_inputs', labelPl: 'Dane wejściowe zabezpieczeń' },
    ],
    audit_trace: [
      {
        step: 'bind_report_proofs',
        labelPl: 'Powiązanie wyników backendowych z dowodami inżynierskimi',
        sourceCatalogRef: 'report_proof_binding_catalog:full-engineering',
      },
    ],
    proof_bindings: [
      { proofKind: 'SC3F', labelPl: 'Dowód zwarcia 3-fazowego' },
      { proofKind: 'VDROP', labelPl: 'Dowód spadku napięcia' },
      { proofKind: 'APPARATUS_WITHSTAND', labelPl: 'Dowód wytrzymałości aparatury' },
      { proofKind: 'POWER_FLOW', labelPl: 'Dowód rozpływu mocy' },
      { proofKind: 'ENERGY_LOSSES', labelPl: 'Dowód strat energii' },
      { proofKind: 'PROTECTION', labelPl: 'Dowód koordynacji zabezpieczeń' },
      { proofKind: 'EARTH_FAULT', labelPl: 'Dowód zwarć doziemnych SN' },
      { proofKind: 'VOLTAGE_PROFILE', labelPl: 'Dowód profili napięciowych' },
    ],
    fingerprint: 'report-proof-full-engineering-v2026-05',
  },
];
