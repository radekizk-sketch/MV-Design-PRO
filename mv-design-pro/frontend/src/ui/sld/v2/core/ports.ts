/**
 * SLD v2 PortResolver — kontrakt portów technicznych frontend (PR-4 rebuild SLD).
 *
 * Mostek między ENM (Port + PortRef) a SLD (anchor coordinates).
 *
 * @see backend/src/enm/models.py — Port, PortRef, ConnectionNode
 * @see docs/sld/SLD_PORTS_AND_ENDPOINTS.md
 */

/**
 * 15 typów portów (mirror enum z `backend/src/enm/models.py::PortKind`).
 *
 * Inwariant: lista jest synchronizowana z backendem. Test `port-kinds-parity.test.ts`
 * sprawdza zgodność listy frontend ↔ backend.
 */
export type PortKind =
  | 'sn_input'
  | 'sn_output'
  | 'sn_branch'
  | 'sn_transformer'
  | 'sn_measurement'
  | 'sn_der_pv'
  | 'sn_der_bess'
  | 'sn_der_fw'
  | 'sn_coupler'
  | 'sn_reserve'
  | 'nn_feeder'
  | 'nn_load'
  | 'nn_der_pv'
  | 'nn_der_bess'
  | 'nn_der_fw';

/** Wszystkie 15 PortKind — runtime list dla testów parity. */
export const ALL_PORT_KINDS: readonly PortKind[] = [
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
] as const;

/** Polskie etykiety portów dla UI. */
export const PORT_KIND_LABELS_PL: Readonly<Record<PortKind, string>> = {
  sn_input: 'Wejście SN',
  sn_output: 'Wyjście SN',
  sn_branch: 'Odgałęzienie SN',
  sn_transformer: 'Transformator SN',
  sn_measurement: 'Pomiar SN',
  sn_der_pv: 'Źródło PV (SN)',
  sn_der_bess: 'Magazyn BESS (SN)',
  sn_der_fw: 'Farma wiatrowa (SN)',
  sn_coupler: 'Sprzęgło SN',
  sn_reserve: 'Pole rezerwowe SN',
  nn_feeder: 'Odpływ nN',
  nn_load: 'Odbiór nN',
  nn_der_pv: 'PV po stronie nN',
  nn_der_bess: 'BESS po stronie nN',
  nn_der_fw: 'FW po stronie nN',
};

/** Czy port jest po stronie SN (vs nN). */
export function isSnPort(kind: PortKind): boolean {
  return kind.startsWith('sn_');
}

/** Czy port jest po stronie nN. */
export function isNnPort(kind: PortKind): boolean {
  return kind.startsWith('nn_');
}

/** Czy port jest portem DER (PV/BESS/FW). */
export function isDerPort(kind: PortKind): boolean {
  return kind.includes('_der_');
}

/**
 * Mapowanie ENM Bay.bay_role → kanoniczne PortKind.
 *
 * Identyczne z `backend/src/enm/migrations/v_ports_001.py::BAY_ROLE_TO_PORT_KIND`.
 */
export const BAY_ROLE_TO_PORT_KIND: Readonly<Record<string, PortKind>> = {
  IN: 'sn_input',
  OUT: 'sn_output',
  TR: 'sn_transformer',
  COUPLER: 'sn_coupler',
  FEEDER: 'sn_output',
  MEASUREMENT: 'sn_measurement',
  OZE: 'sn_der_pv',
};

/** SLD reprezentacja portu — z anchor coordinates. */
export interface SldPort {
  readonly id: string;
  readonly kind: PortKind;
  readonly nominalVoltageKv: number;
  readonly bayRef: string | null;
  readonly substationRef: string;
  readonly occupiedBy: string | null;
  /** Współrzędne anchor w world space (deterministyczne, ustawione przez layout). */
  readonly anchor: { x: number; y: number };
}

/** Referencja do portu (mirror ENM PortRef). */
export interface SldPortRef {
  readonly portId: string;
}

/** Element domenowy do którego port należy. */
export type ElementRefForPort =
  | { readonly kind: 'bay'; readonly bayRef: string }
  | { readonly kind: 'substation'; readonly substationRef: string }
  | { readonly kind: 'der'; readonly generatorRef: string };

export interface SldPortResolver {
  /** Lista portów dla obiektu domenowego (Bay / Substation / DER). */
  getPorts(element: ElementRefForPort): readonly SldPort[];
  /** Rozwiązuje PortRef → SldPort (z anchor). null jeśli port nie istnieje. */
  resolve(portRef: SldPortRef): SldPort | null;
  /** Wszystkie porty w modelu (do testów spójności). */
  allPorts(): readonly SldPort[];
}

/** Walidacja: czy port może łączyć się z innym portem. */
export interface PortConnectionRule {
  readonly fromKind: PortKind;
  readonly toKind: PortKind;
  readonly allowed: boolean;
  readonly reasonPl?: string;
}

/**
 * Reguły kompatybilności portów dla łączenia kabli/linii.
 *
 * Reguły walidacyjne (BINDING):
 * 1. sn_output łączy się z sn_input (kabel/linia od pola wyjściowego do pola wejściowego)
 * 2. sn_branch łączy się z sn_input (odgałęzienie do stacji)
 * 3. sn_coupler łączy się z sn_coupler (sprzęgło między sekcjami)
 * 4. sn_der_* łączy się z sn_input (DER do pola źródłowego stacji)
 * 5. sn_transformer łączy się z sn_transformer (między polem trafo SN a transformatorem)
 * 6. nn_der_* łączy się z nn_feeder (DER po nN do odpływu nN)
 * 7. nn_load łączy się z nn_feeder (odbiór do odpływu nN)
 * 8. Połączenie portów o różnym napięciu wymaga transformatora.
 */
export const PORT_CONNECTION_RULES: readonly PortConnectionRule[] = [
  { fromKind: 'sn_output', toKind: 'sn_input', allowed: true },
  { fromKind: 'sn_input', toKind: 'sn_output', allowed: true },
  { fromKind: 'sn_branch', toKind: 'sn_input', allowed: true },
  { fromKind: 'sn_input', toKind: 'sn_branch', allowed: true },
  { fromKind: 'sn_coupler', toKind: 'sn_coupler', allowed: true },
  { fromKind: 'sn_der_pv', toKind: 'sn_input', allowed: true },
  { fromKind: 'sn_der_bess', toKind: 'sn_input', allowed: true },
  { fromKind: 'sn_der_fw', toKind: 'sn_input', allowed: true },
  { fromKind: 'sn_transformer', toKind: 'sn_transformer', allowed: true },
  { fromKind: 'nn_der_pv', toKind: 'nn_feeder', allowed: true },
  { fromKind: 'nn_der_bess', toKind: 'nn_feeder', allowed: true },
  { fromKind: 'nn_der_fw', toKind: 'nn_feeder', allowed: true },
  { fromKind: 'nn_load', toKind: 'nn_feeder', allowed: true },
  { fromKind: 'nn_feeder', toKind: 'nn_load', allowed: true },
];

/**
 * Sprawdza czy dwa porty mogą się połączyć (kierunkowo lub w obie strony).
 */
export function canConnectPorts(fromKind: PortKind, toKind: PortKind): boolean {
  for (const rule of PORT_CONNECTION_RULES) {
    if (rule.fromKind === fromKind && rule.toKind === toKind && rule.allowed) {
      return true;
    }
  }
  return false;
}

/**
 * Walidacja spójności napięć między portami.
 *
 * Brief 2 §13. Niespójność napięć → potrzebny transformator dedykowany.
 */
export interface VoltageMismatchResult {
  readonly mismatch: boolean;
  readonly fromKv: number;
  readonly toKv: number;
  readonly suggestionPl?: string;
}

export function validatePortVoltages(
  fromPort: SldPort,
  toPort: SldPort,
  toleranceKv = 0.01,
): VoltageMismatchResult {
  const diff = Math.abs(fromPort.nominalVoltageKv - toPort.nominalVoltageKv);
  if (diff <= toleranceKv) {
    return {
      mismatch: false,
      fromKv: fromPort.nominalVoltageKv,
      toKv: toPort.nominalVoltageKv,
    };
  }
  return {
    mismatch: true,
    fromKv: fromPort.nominalVoltageKv,
    toKv: toPort.nominalVoltageKv,
    suggestionPl: `Niespójność napięć: ${fromPort.nominalVoltageKv} kV ↔ ${toPort.nominalVoltageKv} kV. Wymagany transformator dedykowany.`,
  };
}

/**
 * Wnioskowanie typu topologicznego stacji z portów zewnętrznych.
 *
 * Brief 2 §6 pkt 7 + STATION_INTERNAL_SLD §3 — typ stacji wynika z kombinacji portów.
 */
export type StationTopologicalType =
  | 'końcowa'
  | 'przelotowa'
  | 'odgałęźna'
  | 'sekcyjna';

export function classifyStationTopology(externalPorts: readonly SldPort[]): StationTopologicalType {
  const snInputs = externalPorts.filter((p) => p.kind === 'sn_input').length;
  const snOutputs = externalPorts.filter((p) => p.kind === 'sn_output').length;
  const snBranches = externalPorts.filter((p) => p.kind === 'sn_branch').length;
  const snCouplers = externalPorts.filter((p) => p.kind === 'sn_coupler').length;

  // Sekcyjna: ≥ 2 wejścia z aktywnym sprzęgłem
  if (snInputs >= 2 && snCouplers >= 1) {
    return 'sekcyjna';
  }
  // Odgałęźna: wejście + wyjście + ≥1 odgałęzienie
  if (snInputs >= 1 && snOutputs >= 1 && snBranches >= 1) {
    return 'odgałęźna';
  }
  // Przelotowa: wejście + wyjście
  if (snInputs >= 1 && snOutputs >= 1) {
    return 'przelotowa';
  }
  // Końcowa: tylko wejście (lub wejście + transformator/DER bez wyjścia ciągu)
  return 'końcowa';
}

/**
 * Walidacja spójności bay_role ↔ port kind.
 *
 * Reguła PR-3 walidatora ENM: typ portu pola musi być spójny z bay_role.
 */
export function isPortKindCompatibleWithBayRole(
  kind: PortKind,
  bayRole: string,
): boolean {
  const expectedKind = BAY_ROLE_TO_PORT_KIND[bayRole];
  if (!expectedKind) return false;
  // OZE bay_role może mieć dowolny DER port (PV/BESS/FW)
  if (bayRole === 'OZE') {
    return kind === 'sn_der_pv' || kind === 'sn_der_bess' || kind === 'sn_der_fw';
  }
  return kind === expectedKind;
}
