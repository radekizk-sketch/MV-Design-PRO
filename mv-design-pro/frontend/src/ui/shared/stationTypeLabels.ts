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
  stacja_koncowa: 'Stacja końcowa',
  stacja_przelotowa: 'Stacja przelotowa',
  stacja_odgalezna: 'Stacja odgałęźna',
  stacja_sekcyjna: 'Stacja sekcyjna',
  STACJA_KONCOWA: 'Stacja końcowa',
  STACJA_PRZELOTOWA: 'Stacja przelotowa',
  STACJA_ODGALEZNA: 'Stacja odgałęźna',
  STACJA_SEKCYJNA: 'Stacja sekcyjna',
  inline: 'Stacja przelotowa',
  branch: 'Stacja odgałęźna',
  terminal: 'Stacja końcowa',
  sectional: 'Stacja sekcyjna',
  a: 'Stacja końcowa',
  b: 'Stacja przelotowa',
  c: 'Stacja odgałęźna',
  d: 'Stacja sekcyjna',
  type_a: 'Stacja końcowa',
  type_b: 'Stacja przelotowa',
  type_c: 'Stacja odgałęźna',
  type_d: 'Stacja sekcyjna',
  A: 'Stacja końcowa',
  B: 'Stacja przelotowa',
  C: 'Stacja odgałęźna',
  D: 'Stacja sekcyjna',
  TYPE_A: 'Stacja końcowa',
  TYPE_B: 'Stacja przelotowa',
  TYPE_C: 'Stacja odgałęźna',
  TYPE_D: 'Stacja sekcyjna',
};

const SHORT_LABELS: Record<string, string> = {
  gpz: 'GPZ',
  mv_lv: 'SN/nN',
  switching: 'Rozdz.',
  customer: 'Odb.',
  stacja_koncowa: 'Końc.',
  stacja_przelotowa: 'Przelot.',
  stacja_odgalezna: 'Odgał.',
  stacja_sekcyjna: 'Sekcyj.',
  STACJA_KONCOWA: 'Końc.',
  STACJA_PRZELOTOWA: 'Przelot.',
  STACJA_ODGALEZNA: 'Odgał.',
  STACJA_SEKCYJNA: 'Sekcyj.',
  inline: 'Przelot.',
  branch: 'Odgał.',
  terminal: 'Końc.',
  sectional: 'Sekcyj.',
  a: 'Końc.',
  b: 'Przelot.',
  c: 'Odgał.',
  d: 'Sekcyj.',
  type_a: 'Końc.',
  type_b: 'Przelot.',
  type_c: 'Odgał.',
  type_d: 'Sekcyj.',
  A: 'Końc.',
  B: 'Przelot.',
  C: 'Odgał.',
  D: 'Sekcyj.',
  TYPE_A: 'Końc.',
  TYPE_B: 'Przelot.',
  TYPE_C: 'Odgał.',
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
    return 'Typ stacji do wyboru';
  }
  return FULL_LABELS[type] ?? 'Stacja SN/nN';
}

export function formatStationTypeShortLabelPl(type: string | null | undefined): string {
  if (!type) {
    return 'Do wyboru';
  }
  return SHORT_LABELS[type] ?? 'Stacja';
}

export function formatStationSwitchgearLayoutLabelPl(type: string | null | undefined): string {
  switch (normalizeTopologicalStationKind(type)) {
    case 'terminal':
      return 'Układ końcowy SN';
    case 'branch':
      return 'Układ odgałęźny SN';
    case 'sectional':
      return 'Układ sekcyjny SN';
    case 'inline':
    default:
      return 'Układ przelotowy SN';
  }
}

export function formatStationSwitchgearDescriptionPl(type: string | null | undefined): string {
  switch (normalizeTopologicalStationKind(type)) {
    case 'terminal':
      return 'Rozdzielnica SN: układ końcowy z polem zasilającym i polem transformatorowym.';
    case 'branch':
      return 'Rozdzielnica SN: układ odgałęźny z polem zasilającym, odpływowym, odgałęźnym i transformatorowym.';
    case 'sectional':
      return 'Rozdzielnica SN: układ sekcyjny z podziałem ciągu, polem sprzęgłowym i polem transformatorowym.';
    case 'inline':
    default:
      return 'Rozdzielnica SN: układ przelotowy z polem wejściowym, wyjściowym i transformatorowym.';
  }
}
