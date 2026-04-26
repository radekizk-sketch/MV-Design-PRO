/**
 * profileTypes — typy profili PV/BESS/FW (Pakiet D).
 *
 * 4 kategorie profili:
 *   1. Q(U) — charakterystyka napięciowo-jałowa (regulacja Q od U_pu)
 *   2. cos φ(P) — charakterystyka mocy biernej od czynnej
 *   3. FRT — fault ride-through (U, t) wg EN 50549 / IEEE 1547
 *   4. Profil pracy — dobowy/sezonowy/8760h
 *
 * Każdy profil ma 2 warianty:
 *   A) Inline — punkty zdefiniowane bezpośrednio na elemencie ENM
 *   B) Catalog ref — link do profilu katalogowego (immutable template)
 *
 * INVARIANT: Walidacja musi zachodzić PRZED `canonicalizeProfile` —
 * serializer NIE wykrywa naruszeń logiki domenowej.
 */

// ============================================================================
// Q(U) Profile
// ============================================================================

export interface QofUPoint {
  /** Napięcie w jednostkach względnych [pu], strict ascending */
  u_pu: number;
  /** Moc bierna w [Mvar] (znak: + indukcyjny / − pojemnościowy) */
  q_mvar: number;
}

export interface QofUProfile {
  kind: 'qu';
  /** Punkty (U, Q) — strict ascending wg u_pu */
  points: ReadonlyArray<QofUPoint>;
  /** Hysteresis [pu] — zakres martwy regulatora (default 0.0) */
  hysteresis_pu?: number;
  /** Catalog reference (jeśli profile is linked to template) */
  catalog_ref?: string;
}

// ============================================================================
// cos φ(P) Profile
// ============================================================================

export interface CosPhiOfPPoint {
  /** Moc czynna w [pu] (P/Pn), strict ascending */
  p_pu: number;
  /** cos φ w zakresie [-1, 1] (znak konwencja: + ind, − cap) */
  cos_phi: number;
}

export interface CosPhiOfPProfile {
  kind: 'cosphi';
  points: ReadonlyArray<CosPhiOfPPoint>;
  catalog_ref?: string;
}

// ============================================================================
// FRT Profile
// ============================================================================

export type FrtPhase = 'undervoltage' | 'overvoltage';

export interface FrtPoint {
  /** Czas od początku zaburzenia [s], strict ascending */
  t_s: number;
  /** Próg napięcia [pu] (poniżej którego trzeba się utrzymać) */
  u_pu: number;
}

export interface FrtProfile {
  kind: 'frt';
  /** Fazy FRT (undervoltage + overvoltage osobno) */
  phases: ReadonlyArray<{
    phase: FrtPhase;
    points: ReadonlyArray<FrtPoint>;
  }>;
  /** Standard normatywny (informacyjnie) */
  standard?: 'EN_50549' | 'IEEE_1547' | 'PL_IRiESD' | 'CUSTOM';
  catalog_ref?: string;
}

// ============================================================================
// Work Profile (dobowy/sezonowy/8760h)
// ============================================================================

export type WorkProfileResolution = 'hourly_24' | 'hourly_168' | 'hourly_8760';

export interface WorkProfile {
  kind: 'work';
  resolution: WorkProfileResolution;
  /** Wartości P_pu (w pu od Pn) — długość MUSI odpowiadać resolution */
  values: ReadonlyArray<number>;
  /** Etykieta sezonowa (np. „lato_dzień_roboczy") — opcjonalna */
  season_label?: string;
  catalog_ref?: string;
}

/**
 * Oczekiwana długość tablicy values dla danej rozdzielczości.
 */
export const WORK_PROFILE_LENGTH: Readonly<Record<WorkProfileResolution, number>> = Object.freeze({
  hourly_24: 24,
  hourly_168: 168,
  hourly_8760: 8760,
});

/**
 * Walidacja: długość values zgodna z resolution.
 */
export function validateWorkProfileLength(profile: WorkProfile): string | null {
  const expected = WORK_PROFILE_LENGTH[profile.resolution];
  if (profile.values.length !== expected) {
    return `WorkProfile.values length=${profile.values.length}, expected=${expected} for resolution=${profile.resolution}`;
  }
  return null;
}

/**
 * Agregacja 8760h → 24h (średnia po godzinach doby).
 */
export function aggregateTo24h(values8760: ReadonlyArray<number>): number[] {
  if (values8760.length !== 8760) {
    throw new Error(`aggregateTo24h: expected 8760 values, got ${values8760.length}`);
  }
  const sums = new Array<number>(24).fill(0);
  const counts = new Array<number>(24).fill(0);
  for (let i = 0; i < 8760; i += 1) {
    const hour = i % 24;
    sums[hour] += values8760[i];
    counts[hour] += 1;
  }
  return sums.map((s, h) => s / counts[h]);
}

/**
 * Agregacja 8760h → 168h (średnia po godzinach tygodnia, 52 tygodnie).
 */
export function aggregateTo168h(values8760: ReadonlyArray<number>): number[] {
  if (values8760.length !== 8760) {
    throw new Error(`aggregateTo168h: expected 8760 values, got ${values8760.length}`);
  }
  const sums = new Array<number>(168).fill(0);
  const counts = new Array<number>(168).fill(0);
  for (let i = 0; i < 8760; i += 1) {
    const hourOfWeek = i % 168;
    sums[hourOfWeek] += values8760[i];
    counts[hourOfWeek] += 1;
  }
  return sums.map((s, h) => s / counts[h]);
}

/**
 * Agregacja 8760h → 12 (średnia miesięczna).
 * Używa kalendarza nieprzestępnego: Sty=744h, Lut=672h, Mar=744h, Kwi=720h,
 * Maj=744h, Cze=720h, Lip=744h, Sie=744h, Wrz=720h, Paź=744h, Lis=720h, Gru=744h.
 * Suma = 8760.
 */
const MONTH_HOURS: ReadonlyArray<number> = Object.freeze([
  744, 672, 744, 720, 744, 720, 744, 744, 720, 744, 720, 744,
]);

export function aggregateToMonthly(values8760: ReadonlyArray<number>): number[] {
  if (values8760.length !== 8760) {
    throw new Error(`aggregateToMonthly: expected 8760 values, got ${values8760.length}`);
  }
  const out: number[] = [];
  let cursor = 0;
  for (const hours of MONTH_HOURS) {
    let sum = 0;
    for (let i = 0; i < hours; i += 1) {
      sum += values8760[cursor + i];
    }
    out.push(sum / hours);
    cursor += hours;
  }
  return out;
}

/**
 * Parser CSV dla profilu pracy. Format:
 *   - jedna kolumna z liczbami (1 wartość per linia)
 *   - albo nagłówek + jedna kolumna
 * Liczby separowane kropką.
 */
export function parseWorkProfileCsv(csv: string): number[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  // Header detection: pierwsza KOLUMNA pierwszej linii musi być liczbą
  const firstCol = lines[0].split(',')[0]?.trim() ?? '';
  const startIdx = Number.isFinite(Number(firstCol)) && firstCol.length > 0 ? 0 : 1;
  const out: number[] = [];
  for (let i = startIdx; i < lines.length; i += 1) {
    const raw = lines[i].split(',')[0]?.trim() ?? '';
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      throw new Error(`parseWorkProfileCsv: non-numeric value at line ${i + 1}: "${raw}"`);
    }
    out.push(n);
  }
  return out;
}
