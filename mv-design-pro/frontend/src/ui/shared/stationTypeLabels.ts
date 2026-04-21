export type TopologicalStationKind = 'terminal' | 'inline' | 'branch' | 'sectional';

export type DomainStationTypeCode = 'A' | 'B' | 'C' | 'D';

const TOPOLOGICAL_TO_DOMAIN: Record<TopologicalStationKind, DomainStationTypeCode> = {
  terminal: 'A',
  inline: 'B',
  branch: 'C',
  sectional: 'D',
};

const FULL_LABELS: Record<string, string> = {
  gpz: 'GPZ',
  mv_lv: 'Stacja SN/nN',
  switching: 'Stacja rozdzielcza SN',
  customer: 'Stacja odbiorcza',
  stacja_koncowa: 'Stacja koncowa',
  stacja_przelotowa: 'Stacja przelotowa',
  stacja_odgalezna: 'Stacja odgalezna',
  stacja_sekcyjna: 'Stacja sekcyjna',
  STACJA_KONCOWA: 'Stacja koncowa',
  STACJA_PRZELOTOWA: 'Stacja przelotowa',
  STACJA_ODGALEZNA: 'Stacja odgalezna',
  STACJA_SEKCYJNA: 'Stacja sekcyjna',
  inline: 'Stacja przelotowa',
  branch: 'Stacja odgalezna',
  terminal: 'Stacja koncowa',
  sectional: 'Stacja sekcyjna',
  a: 'Stacja koncowa',
  b: 'Stacja przelotowa',
  c: 'Stacja odgalezna',
  d: 'Stacja sekcyjna',
  type_a: 'Stacja koncowa',
  type_b: 'Stacja przelotowa',
  type_c: 'Stacja odgalezna',
  type_d: 'Stacja sekcyjna',
  A: 'Stacja koncowa',
  B: 'Stacja przelotowa',
  C: 'Stacja odgalezna',
  D: 'Stacja sekcyjna',
  TYPE_A: 'Stacja koncowa',
  TYPE_B: 'Stacja przelotowa',
  TYPE_C: 'Stacja odgalezna',
  TYPE_D: 'Stacja sekcyjna',
};

const SHORT_LABELS: Record<string, string> = {
  gpz: 'GPZ',
  mv_lv: 'SN/nN',
  switching: 'Rozdz.',
  customer: 'Odb.',
  stacja_koncowa: 'Konc.',
  stacja_przelotowa: 'Przelot.',
  stacja_odgalezna: 'Odgal.',
  stacja_sekcyjna: 'Sekcyj.',
  STACJA_KONCOWA: 'Konc.',
  STACJA_PRZELOTOWA: 'Przelot.',
  STACJA_ODGALEZNA: 'Odgal.',
  STACJA_SEKCYJNA: 'Sekcyj.',
  inline: 'Przelot.',
  branch: 'Odgal.',
  terminal: 'Konc.',
  sectional: 'Sekcyj.',
  a: 'Konc.',
  b: 'Przelot.',
  c: 'Odgal.',
  d: 'Sekcyj.',
  type_a: 'Konc.',
  type_b: 'Przelot.',
  type_c: 'Odgal.',
  type_d: 'Sekcyj.',
  A: 'Konc.',
  B: 'Przelot.',
  C: 'Odgal.',
  D: 'Sekcyj.',
  TYPE_A: 'Konc.',
  TYPE_B: 'Przelot.',
  TYPE_C: 'Odgal.',
  TYPE_D: 'Sekcyj.',
};

export function normalizeTopologicalStationKind(value: unknown): TopologicalStationKind {
  if (typeof value !== 'string') {
    return 'inline';
  }

  switch (value.trim().toLowerCase()) {
    case 'a':
    case 'type_a':
    case 'terminal':
    case 'stacja_koncowa':
      return 'terminal';
    case 'c':
    case 'type_c':
    case 'branch':
    case 'stacja_odgalezna':
      return 'branch';
    case 'd':
    case 'type_d':
    case 'sectional':
    case 'stacja_sekcyjna':
      return 'sectional';
    case 'b':
    case 'type_b':
    case 'inline':
    case 'mv_lv':
    case 'stacja_przelotowa':
    default:
      return 'inline';
  }
}

export function mapTopologicalStationKindToDomainCode(
  stationKind: TopologicalStationKind,
): DomainStationTypeCode {
  return TOPOLOGICAL_TO_DOMAIN[stationKind];
}

export function formatStationTypeLabelPl(type: string | null | undefined): string {
  if (!type) {
    return 'Brak danych';
  }
  return FULL_LABELS[type] ?? 'Stacja SN/nN';
}

export function formatStationTypeShortLabelPl(type: string | null | undefined): string {
  if (!type) {
    return 'Brak';
  }
  return SHORT_LABELS[type] ?? 'Stacja';
}
