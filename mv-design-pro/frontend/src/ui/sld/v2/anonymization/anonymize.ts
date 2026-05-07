/**
 * Anonymize — Phase 5 (operator-grade SLD plan v2).
 *
 * Stable, deterministyczny pseudonim dla etykiet SLD.
 *  - Same salt + same label → same pseudonim.
 *  - Different salts → różne pseudonimy.
 *  - Toggle on/off zmienia view_hash, NIE topology_hash ani layout_hash.
 *
 * Pseudonim format per kind:
 *   gpz       → "GPZ-A1", "GPZ-B2", ...
 *   station   → "ST-001", "ST-002", ...
 *   feeder    → "FDR-A1"
 *   substation → "SUB-001"
 *   bus       → "BUS-001"
 *   line      → "LIN-A1"
 *   cable     → "KAB-A1"
 *   der       → "DER-001"
 *   custom    → "X-001"
 *
 * Implementacja: deterministyczny FNV-1a 32-bit nad `label+salt`,
 * mapowany na index. Nie używamy SHA-256 (potrzebny SubtleCrypto.digest,
 * async; tutaj sygnatura sync wymagana dla render-time użycia).
 */

export type AnonymizableKind =
  | 'gpz'
  | 'station'
  | 'feeder'
  | 'substation'
  | 'bus'
  | 'line'
  | 'cable'
  | 'der'
  | 'custom';

export interface AnonymizationConfig {
  /**
   * Salt na poziomie workspace — zmiana salt resetuje wszystkie pseudonimy.
   * Operator może rotować salt aby pozyskać nowy zestaw pseudonimów (np.
   * przy eksporcie do innego klienta).
   */
  readonly salt: string;
  /** Czy anonimizacja jest aktywna (master toggle). */
  readonly enabled: boolean;
  /** Sub-toggles — granularna kontrola co jest anonimizowane. */
  readonly toggles: AnonymizationToggles;
}

export interface AnonymizationToggles {
  /** Ukryj nazwy stacji/GPZ/feedrów. */
  readonly hideNames: boolean;
  /** Ukryj adresy / lokalizacje. */
  readonly hideAddresses: boolean;
  /** Ukryj numery ewidencyjne kabli/linii. */
  readonly hideCadastral: boolean;
  /** Ukryj wartości mocy. */
  readonly hidePower: boolean;
  /** Ukryj wartości wyników (P, Q, U, I, ...). */
  readonly hideResults: boolean;
  /** Zachowaj typy (PV/BESS/FW pozostają widoczne nawet pod anonimizacją). */
  readonly preserveTypes: boolean;
}

export const DEFAULT_TOGGLES: AnonymizationToggles = {
  hideNames: true,
  hideAddresses: true,
  hideCadastral: true,
  hidePower: false,
  hideResults: false,
  preserveTypes: true,
};

export const DEFAULT_CONFIG: AnonymizationConfig = {
  salt: 'mv-design-pro-default-salt',
  enabled: false,
  toggles: DEFAULT_TOGGLES,
};

const KIND_PREFIX: Record<AnonymizableKind, string> = {
  gpz: 'GPZ',
  station: 'ST',
  feeder: 'FDR',
  substation: 'SUB',
  bus: 'BUS',
  line: 'LIN',
  cable: 'KAB',
  der: 'DER',
  custom: 'X',
};

/** FNV-1a 32-bit hash — pure, deterministyczny. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0; // unsigned 32-bit
}

/**
 * Stable pseudonim na podstawie label + salt + kind.
 * Format: PREFIX + 3-cyfrowy index (zero-padded) lub PREFIX + LITERA + 1-cyfra
 * (dla GPZ/feeder/line/cable, gdzie operator preferuje krótkie kody).
 */
export function generatePseudonym(
  label: string,
  kind: AnonymizableKind,
  salt: string,
): string {
  const seed = `${label}|${kind}|${salt}`;
  const h = fnv1a(seed);
  const prefix = KIND_PREFIX[kind];

  // Krótki format dla GPZ/feeder/line/cable: PREFIX-LITERA + cyfra (np. GPZ-A1).
  if (kind === 'gpz' || kind === 'feeder' || kind === 'line' || kind === 'cable') {
    const letter = String.fromCharCode(65 + (h % 26)); // A-Z
    const digit = (h >>> 8) % 10; // 0-9
    return `${prefix}-${letter}${digit}`;
  }

  // Standardowy format: PREFIX-NNN (zero-padded 3 cyfry).
  const index = (h % 1000).toString().padStart(3, '0');
  return `${prefix}-${index}`;
}

/**
 * Anonimizuje label zgodnie z config. Zwraca oryginał gdy:
 *  - !config.enabled (master off).
 *  - Toggle dla kind nie jest aktywny (np. hideNames=false → name pozostaje).
 *  - preserveTypes + kind='der' (nie anonimizujemy typu DER).
 */
export function anonymizeLabel(
  rawLabel: string,
  kind: AnonymizableKind,
  config: AnonymizationConfig,
): string {
  if (!config.enabled) return rawLabel;
  // preserveTypes: zachowaj DER kind jako kategorię (PV/BESS/FW pozostają).
  if (config.toggles.preserveTypes && kind === 'der') {
    return rawLabel;
  }
  // Toggle per kind:
  const isNameKind = kind === 'station' || kind === 'gpz' || kind === 'substation' || kind === 'feeder' || kind === 'bus';
  if (isNameKind && !config.toggles.hideNames) return rawLabel;
  const isCadastralKind = kind === 'line' || kind === 'cable';
  if (isCadastralKind && !config.toggles.hideCadastral) return rawLabel;
  return generatePseudonym(rawLabel, kind, config.salt);
}

/**
 * Anonimizuje wartość liczbową (moc / wynik):
 *  - hidePower true → "—" gdy kind='power'.
 *  - hideResults true → "—" gdy kind='result'.
 *  - inaczej → wartość bez zmian.
 */
export function anonymizeNumeric(
  value: number | null | undefined,
  kind: 'power' | 'result',
  config: AnonymizationConfig,
): number | null | string {
  if (!config.enabled) return value ?? null;
  if (kind === 'power' && config.toggles.hidePower) return '—';
  if (kind === 'result' && config.toggles.hideResults) return '—';
  return value ?? null;
}

/**
 * Helper: czy kind label powinien być anonimizowany dla danego config.
 * Używane przez renderery do uniknięcia niepotrzebnej re-kalkulacji.
 */
export function shouldAnonymize(kind: AnonymizableKind, config: AnonymizationConfig): boolean {
  if (!config.enabled) return false;
  if (config.toggles.preserveTypes && kind === 'der') return false;
  switch (kind) {
    case 'gpz':
    case 'station':
    case 'substation':
    case 'feeder':
    case 'bus':
      return config.toggles.hideNames;
    case 'line':
    case 'cable':
      return config.toggles.hideCadastral;
    case 'der':
      return config.toggles.hideNames; // gdy preserveTypes=false
    case 'custom':
      return true;
  }
}
