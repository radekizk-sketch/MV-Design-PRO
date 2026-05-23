/**
 * faultLocationSelector — pure helpers do wyboru lokalizacji zwarcia (Etap 10 z planu).
 *
 * "Short Circuit Run Dialog: location selector na SLD"
 *
 * Możliwe lokalizacje:
 * - bus: szyna SN/nN
 * - branch: linia/kabel (przy końcu lub w środku)
 * - terminal: terminal pola
 * - station: stacja (cały blok)
 */

export type FaultLocationKind = 'bus' | 'branch_far' | 'branch_near' | 'branch_middle' | 'terminal' | 'station';

export interface FaultLocation {
  kind: FaultLocationKind;
  elementRef: string;
  elementName: string;
  positionAlongBranch?: number;
  description: string;
}

export interface FaultLocationOption {
  ref: string;
  label: string;
  kind: FaultLocationKind;
  systemVoltageKv: number;
}

const KIND_LABELS: Record<FaultLocationKind, string> = {
  bus: 'Szyna',
  branch_near: 'Linia/kabel - początek (przy źródle)',
  branch_far: 'Linia/kabel - koniec (najdalszy od źródła)',
  branch_middle: 'Linia/kabel - środek',
  terminal: 'Terminal pola',
  station: 'Stacja (całość)',
};

const KIND_DESCRIPTIONS: Record<FaultLocationKind, string> = {
  bus: 'Zwarcie na szynie zbiorczej. Daje I_k_max na danym poziomie napięcia.',
  branch_near: 'Zwarcie przy początku linii. Wyższy I_k niż na końcu (bliżej źródła).',
  branch_far: 'Zwarcie na końcu linii. Najniższy I_k (najwyższa impedancja).',
  branch_middle: 'Zwarcie w środku linii (50%). Typowo dla analizy strefy zasięgu zabezpieczeń.',
  terminal: 'Zwarcie na terminalu pola. Granice strefy zabezpieczeń.',
  station: 'Zwarcie hipotetyczne w obrębie całej stacji.',
};

export function describeFaultLocationKind(kind: FaultLocationKind): string {
  return KIND_LABELS[kind];
}

export function describeFaultLocation(location: FaultLocation): string {
  return `${KIND_LABELS[location.kind]} (${location.elementName})`;
}

export function getFaultLocationContext(kind: FaultLocationKind): string {
  return KIND_DESCRIPTIONS[kind];
}

export function buildFaultLocationOptions(input: {
  buses: Array<{ ref: string; name: string; voltageKv: number }>;
  branches: Array<{ ref: string; name: string; voltageKv: number }>;
  terminals: Array<{ ref: string; name: string; voltageKv: number }>;
}): FaultLocationOption[] {
  const options: FaultLocationOption[] = [];

  for (const bus of input.buses) {
    options.push({
      ref: bus.ref,
      label: `${KIND_LABELS.bus}: ${bus.name}`,
      kind: 'bus',
      systemVoltageKv: bus.voltageKv,
    });
  }

  for (const line of input.branches) {
    options.push({
      ref: line.ref,
      label: `${KIND_LABELS.branch_far}: ${line.name}`,
      kind: 'branch_far',
      systemVoltageKv: line.voltageKv,
    });
    options.push({
      ref: line.ref,
      label: `${KIND_LABELS.branch_middle}: ${line.name}`,
      kind: 'branch_middle',
      systemVoltageKv: line.voltageKv,
    });
    options.push({
      ref: line.ref,
      label: `${KIND_LABELS.branch_near}: ${line.name}`,
      kind: 'branch_near',
      systemVoltageKv: line.voltageKv,
    });
  }

  for (const terminal of input.terminals) {
    options.push({
      ref: terminal.ref,
      label: `${KIND_LABELS.terminal}: ${terminal.name}`,
      kind: 'terminal',
      systemVoltageKv: terminal.voltageKv,
    });
  }

  return options;
}

export function calculatePositionAlongBranchPct(kind: FaultLocationKind): number {
  switch (kind) {
    case 'branch_near': return 0.05;
    case 'branch_middle': return 0.50;
    case 'branch_far': return 0.95;
    default: return 1.00;
  }
}
