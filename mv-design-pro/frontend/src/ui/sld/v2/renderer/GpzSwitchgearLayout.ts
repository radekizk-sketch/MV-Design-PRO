/**
 * SLD V2 — GpzSwitchgear layout calculation and SCADA helpers.
 *
 * Extracted from GpzSwitchgearRenderer.tsx for modularization.
 * Contains: computeSwitchgearLayout, energizationColor, normalizeCouplerState,
 * describeCouplerStatePl, bayRoleFillColor, describeEnergizationPl,
 * badge/measurement/format helpers, and Cell/SwitchgearLayout types.
 */

import {
  COLOR_BAY_COUPLER,
  COLOR_BAY_LINE,
  COLOR_BAY_MEASUREMENT,
  COLOR_BAY_TR,
  COLOR_BADGE_BG_LIGHT,
  COLOR_BADGE_BG_RED,
  COLOR_BADGE_BG_YELLOW,
  COLOR_BADGE_STATUS_BLOCKED,
  COLOR_BADGE_STATUS_NEUTRAL,
  COLOR_BADGE_STATUS_OK,
  COLOR_BADGE_TEXT_DARK,
  COLOR_DEVICE_CLOSED,
  COLOR_DEVICE_OPEN,
  COLOR_NODE,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  GPZ_GEOMETRY,
} from '../theme/tokens';
import type { FieldRole } from '../domain/apparatusContracts';
import { FIELD_ROLE } from '../domain/apparatusContracts';
import type {
  GpzBayDescriptor,
  GpzBayEnergization,
  GpzCouplerDescriptor,
  GpzSectionDescriptor,
  BaySecondaryFlags,
  BayMeasurements,
  SecondaryFlagState,
} from './GpzSwitchgearTypes';

// =============================================================================
// Geometry constants (needed by computeMaxFooterDepth)
// =============================================================================

const BAY_COLUMN_WIDTH = GPZ_GEOMETRY.bayColumnWidth;
const BAY_GAP = GPZ_GEOMETRY.bayGap;
const COUPLER_BAY_WIDTH = GPZ_GEOMETRY.couplerBayWidth;
const SECTION_INTER_GAP = GPZ_GEOMETRY.sectionInterGap;
const KAS_ROW_HEIGHT = GPZ_GEOMETRY.kasRowHeight;
const MEASUREMENT_ROW_HEIGHT = GPZ_GEOMETRY.measurementRowHeight;
const MEASUREMENT_PANEL_HEADER_HEIGHT = GPZ_GEOMETRY.measurementPanelHeaderHeight;

// =============================================================================
// Cell / SwitchgearLayout types
// =============================================================================

export interface BayCell {
  readonly kind: 'bay';
  readonly x: number;
  readonly bay: GpzBayDescriptor;
  readonly sectionId: string;
  readonly busVoltageKv: number;
}

export interface CouplerCell {
  readonly kind: 'coupler';
  readonly x: number;
  readonly coupler: GpzCouplerDescriptor;
}

export type Cell = BayCell | CouplerCell;

export interface SwitchgearLayout {
  readonly cells: readonly Cell[];
  readonly sectionLabels: readonly { sectionId: string; x: number; text: string }[];
  readonly totalBayCount: number;
  readonly totalWidth: number;
}

// =============================================================================
// Layout calculation
// =============================================================================

export function computeSwitchgearLayout(
  sections: readonly GpzSectionDescriptor[],
  couplers: readonly GpzCouplerDescriptor[],
): SwitchgearLayout {
  const cells: Cell[] = [];
  const labels: { sectionId: string; x: number; text: string }[] = [];

  let cursor = 0;
  let totalBayCount = 0;

  // Mapa sprzęgieł indeksowana po lewej sekcji (po prawej będzie obsłużona przy iteracji).
  const couplersByLeft = new Map<string, GpzCouplerDescriptor>();
  for (const c of couplers) {
    couplersByLeft.set(c.leftSectionId, c);
  }

  sections.forEach((section, sIdx) => {
    if (sIdx > 0) {
      cursor += SECTION_INTER_GAP;
    }

    // Etykieta sekcji nad pierwszym polem.
    labels.push({
      sectionId: section.sectionId,
      x: cursor,
      text: section.sectionLabel ?? `S${section.order}`,
    });

    section.bays.forEach((bay) => {
      cells.push({ kind: 'bay', x: cursor, bay, sectionId: section.sectionId, busVoltageKv: section.busVoltageKv });
      cursor += BAY_COLUMN_WIDTH + BAY_GAP;
      totalBayCount += 1;
    });

    // Sprzęgło na prawym końcu sekcji (jeśli istnieje połączenie do następnej sekcji).
    const coupler = couplersByLeft.get(section.sectionId);
    if (coupler && sIdx < sections.length - 1) {
      cells.push({ kind: 'coupler', x: cursor, coupler });
      cursor += COUPLER_BAY_WIDTH + BAY_GAP;
    }
  });

  return {
    cells,
    sectionLabels: labels,
    totalBayCount,
    totalWidth: Math.max(0, cursor - BAY_GAP),
  };
}

// =============================================================================
// Energization and coupler helpers
// =============================================================================

export function energizationColor(state: GpzBayEnergization): string {
  switch (state) {
    case 'energized':
      return COLOR_DEVICE_CLOSED;
    case 'deenergized':
      return COLOR_TEXT_MUTED;
    case 'tripped':
      return COLOR_DEVICE_OPEN;
    case 'unknown':
      return COLOR_NODE;
  }
}

/**
 * Normalizuje stan sprzęgła z backwards-compatible API (boolean | string)
 * do kanonicznej trojki 'closed' | 'open' | 'unknown'.
 *
 * - `true`  → 'closed'
 * - `false` → 'open'
 * - 'closed'/'open'/'unknown' → przekazywane bez zmian.
 */
export function normalizeCouplerState(
  raw: boolean | 'closed' | 'open' | 'unknown',
): 'closed' | 'open' | 'unknown' {
  if (raw === true) return 'closed';
  if (raw === false) return 'open';
  return raw;
}

export function describeCouplerStatePl(state: 'closed' | 'open' | 'unknown'): string {
  switch (state) {
    case 'closed':
      return 'zamknięte';
    case 'open':
      return 'otwarte';
    case 'unknown':
      return 'stan nieznany';
  }
}

/**
 * Per-role color tła kolumny pola — kanon polskich OSD (audyt SLD §D.3).
 * Operator z fotela dyspozytora odróżnia klasę pola po kolorze tła:
 *  - Liniowe (LINE/GPZ_LINE/RMU_LINE) → ciemny neutralny (#171B20)
 *  - Transformator (TR/RMU_TR) → ciemnoniebieski (#1A2438)
 *  - Pomiarowe (MEASUREMENT) → żółtawy (#2A2616)
 *  - Sprzęgło (COUPLER) → szary (#1F2226)
 */
export function bayRoleFillColor(role: FieldRole): string {
  switch (role) {
    case FIELD_ROLE.TRANSFORMER:
    case FIELD_ROLE.RMU_TRANSFORMER:
      return COLOR_BAY_TR;
    case FIELD_ROLE.MEASUREMENT:
      return COLOR_BAY_MEASUREMENT;
    case FIELD_ROLE.COUPLER:
      return COLOR_BAY_COUPLER;
    case FIELD_ROLE.LINE_IN:
    case FIELD_ROLE.LINE_OUT:
    case FIELD_ROLE.LINE_BRANCH:
    case FIELD_ROLE.GPZ_LINE_BAY:
    case FIELD_ROLE.RMU_LINE:
      return COLOR_BAY_LINE;
    default:
      return COLOR_BAY_LINE;
  }
}

export function describeEnergizationPl(state: GpzBayEnergization): string {
  switch (state) {
    case 'energized':
      return 'pod napięciem';
    case 'deenergized':
      return 'bez napięcia';
    case 'tripped':
      return 'wyłączony / zwarcie';
    case 'unknown':
      return 'stan nieznany';
  }
}

// =============================================================================
// Badge helpers
// =============================================================================

export interface BadgeItem {
  readonly code: string;
  readonly state: SecondaryFlagState;
  readonly order: number;
}

/**
 * Kanoniczne uporządkowanie badge'y SCADA — zgodne z wzorcem operatorskim:
 * SPZ → SCO → OWG → NZ → LRW → ARN → BKR → STYCZ. → AWSC → ZS → SZR.
 */
const BADGE_ORDER: ReadonlyArray<{ key: keyof BaySecondaryFlags; code: string }> = [
  { key: 'spz', code: 'SPZ' },
  { key: 'sco', code: 'SCO' },
  { key: 'owg', code: 'OWG' },
  { key: 'nz', code: 'NZ' },
  { key: 'lrw', code: 'LRW' },
  { key: 'arn', code: 'ARN' },
  { key: 'bkr', code: 'BKR' },
  { key: 'stycz', code: 'STYCZ' },
  { key: 'awsc', code: 'AWSC' },
  { key: 'zs', code: 'ZS' },
  { key: 'szr', code: 'SZR' },
];

const BADGE_MAX_VISIBLE = 5;

export function collectBadges(flags: BaySecondaryFlags): readonly BadgeItem[] {
  const items: BadgeItem[] = [];
  BADGE_ORDER.forEach((entry, idx) => {
    const state = flags[entry.key];
    if (state) {
      items.push({ code: entry.code, state, order: idx });
    }
  });
  return items.slice(0, BADGE_MAX_VISIBLE);
}

export interface BadgeVisual {
  readonly labelBg: string;
  readonly labelFg: string;
  readonly labelBorder: string;
  readonly statusColor: string;
}

/** Mapa code → kolor tła. SPZ/ARN/SZR = żółty, SCO/NZ/LRW/AWSC/ZS = czerwony, reszta = jasny. */
export function badgeVisual(code: string, state: SecondaryFlagState): BadgeVisual {
  const yellow = code === 'SPZ' || code === 'ARN' || code === 'SZR';
  const red = code === 'SCO' || code === 'NZ' || code === 'LRW' || code === 'AWSC' || code === 'ZS';
  const labelBg = yellow ? COLOR_BADGE_BG_YELLOW : red ? COLOR_BADGE_BG_RED : COLOR_BADGE_BG_LIGHT;
  const labelFg = red ? COLOR_TEXT_PRIMARY : COLOR_BADGE_TEXT_DARK;
  const labelBorder = red ? COLOR_BADGE_STATUS_BLOCKED : COLOR_TEXT_MUTED;
  const statusColor = statusColorFor(state);
  return { labelBg, labelFg, labelBorder, statusColor };
}

export function statusColorFor(state: SecondaryFlagState): string {
  switch (state) {
    case 'enabled':
      return COLOR_BADGE_STATUS_OK;
    case 'disabled':
      return COLOR_BADGE_STATUS_NEUTRAL;
    case 'restricted':
    case 'blocked':
      return COLOR_BADGE_STATUS_BLOCKED;
  }
}

export function statusLabel(state: SecondaryFlagState): string {
  switch (state) {
    case 'enabled':
      return 'Zal.';
    case 'disabled':
      return 'Odbl.';
    case 'restricted':
      return 'Odst.';
    case 'blocked':
      return 'Zabl.';
  }
}

// =============================================================================
// Measurement helpers
// =============================================================================

export interface MeasurementRow {
  readonly label: string;
  readonly value: string;
}

/**
 * Buduje wiersze panelu pomiarowego w kanonicznej kolejności SCADA:
 *   1. Napięcia fazowe (U1, U2, U3)
 *   2. Napięcia międzyfazowe (U12, U23, U31)
 *   3. Napięcie zerowe (U0)
 *   4. Częstotliwość (f)
 *   5. Moce (P, Q, Idł)
 *   6. Prądy (I1, I2, I3)
 *
 * Każdy wiersz pojawia się tylko gdy dostarczona wartość.
 */
export function collectMeasurementRows(m: BayMeasurements): readonly MeasurementRow[] {
  const rows: MeasurementRow[] = [];
  if (m.u1 !== undefined) rows.push({ label: 'U1', value: formatVoltage(m.u1) });
  if (m.u2 !== undefined) rows.push({ label: 'U2', value: formatVoltage(m.u2) });
  if (m.u3 !== undefined) rows.push({ label: 'U3', value: formatVoltage(m.u3) });
  if (m.u12 !== undefined) rows.push({ label: 'U12', value: formatVoltage(m.u12) });
  if (m.u23 !== undefined) rows.push({ label: 'U23', value: formatVoltage(m.u23) });
  if (m.u31 !== undefined) rows.push({ label: 'U31', value: formatVoltage(m.u31) });
  if (m.u0 !== undefined) rows.push({ label: 'U0', value: formatVoltage(m.u0) });
  if (m.f !== undefined) rows.push({ label: 'f', value: formatFrequency(m.f) });
  if (m.p !== undefined) rows.push({ label: 'P', value: formatNumber(m.p) });
  if (m.q !== undefined) rows.push({ label: 'Q', value: formatNumber(m.q) });
  if (m.idl !== undefined) rows.push({ label: 'Idł', value: formatNumber(m.idl) });
  if (m.i1 !== undefined) rows.push({ label: 'I1', value: formatInteger(m.i1) });
  if (m.i2 !== undefined) rows.push({ label: 'I2', value: formatInteger(m.i2) });
  if (m.i3 !== undefined) rows.push({ label: 'I3', value: formatInteger(m.i3) });
  return rows;
}

export function hasAnyMeasurement(m: BayMeasurements): boolean {
  return (
    m.p !== undefined ||
    m.q !== undefined ||
    m.idl !== undefined ||
    m.i1 !== undefined ||
    m.i2 !== undefined ||
    m.i3 !== undefined ||
    m.f !== undefined ||
    m.u1 !== undefined ||
    m.u2 !== undefined ||
    m.u3 !== undefined ||
    m.u12 !== undefined ||
    m.u23 !== undefined ||
    m.u31 !== undefined ||
    m.u0 !== undefined
  );
}

export function formatNumber(value: number): string {
  if (Number.isNaN(value)) return '—';
  return value.toFixed(1);
}

export function formatInteger(value: number): string {
  if (Number.isNaN(value)) return '—';
  return Math.round(value).toString();
}

/** Napięcia zawsze 1 dec (kanon SCADA — np. "15.4"). */
export function formatVoltage(value: number): string {
  if (Number.isNaN(value)) return '—';
  return value.toFixed(1);
}

/** Częstotliwość zawsze 2 dec (kanon SCADA — np. "49.94"). */
export function formatFrequency(value: number): string {
  if (Number.isNaN(value)) return '—';
  return value.toFixed(2);
}

/**
 * Przycina etykietę do dostępnej szerokości w pikselach z wielokropkiem.
 *
 * Anti-pattern §15.4 (silent slice) + audyt anty-kolizji D1/D2: w wąskich
 * kolumnach (np. 64 px) char-count truncation pozwala długiej nazwie wylać się
 * do sąsiedniej kolumny. Tu liczymy ile glifów mieści się w `maxWidthPx` przy
 * danym `fontSizePx` (advance ≈ fontSize × labelCharWidthFactor) i ucinamy z "…".
 *
 * Deterministyczne (czysta arytmetyka, brak pomiaru DOM).
 */
export function fitTextToWidth(
  text: string,
  maxWidthPx: number,
  fontSizePx: number,
): string {
  if (maxWidthPx <= 0) return '';
  const charW = fontSizePx * GPZ_GEOMETRY.labelCharWidthFactor;
  const maxChars = Math.max(1, Math.floor(maxWidthPx / charW));
  if (text.length <= maxChars) return text;
  // Zostaw miejsce na "…" (też ~1 glif).
  return text.slice(0, Math.max(1, maxChars - 1)) + '…';
}

/** Wysokość wiersza badge'a kodów zabezpieczeniowych (mono stack na polu). */
export const PROTECTION_BADGE_ROW_HEIGHT = 7;
/** Liczba kodów w wierszu (mirror OzeSourceArchetype: do 4 połączonych "·"). */
export const PROTECTION_BADGE_CODES_PER_ROW = 4;

/** Liczba wierszy badge'y kodów zabezpieczeń (do 4 kodów / wiersz). */
function protectionBadgeRowCount(codes: readonly string[] | undefined): number {
  if (!codes || codes.length === 0) return 0;
  return Math.ceil(codes.length / PROTECTION_BADGE_CODES_PER_ROW);
}

/** Głębokość stosu badge'y kodów zabezpieczeń (0 gdy brak kodów). */
export function protectionBadgeDepth(codes: readonly string[] | undefined): number {
  const rows = protectionBadgeRowCount(codes);
  return rows === 0 ? 0 : rows * PROTECTION_BADGE_ROW_HEIGHT + 4;
}

export function computeMaxFooterDepth(sections: readonly GpzSectionDescriptor[]): number {
  let kasDepth = 0;
  let measurementDepth = 0;
  let protectionDepth = 0;
  for (const section of sections) {
    for (const bay of section.bays) {
      if (bay.hasKasButton) {
        kasDepth = Math.max(kasDepth, KAS_ROW_HEIGHT);
      }
      if (bay.measurements && hasAnyMeasurement(bay.measurements)) {
        const rowCount = collectMeasurementRows(bay.measurements).length;
        const depth =
          MEASUREMENT_PANEL_HEADER_HEIGHT + rowCount * MEASUREMENT_ROW_HEIGHT + 4;
        measurementDepth = Math.max(measurementDepth, depth);
      }
      protectionDepth = Math.max(protectionDepth, protectionBadgeDepth(bay.protectionCodes));
    }
  }
  return kasDepth + measurementDepth + protectionDepth;
}

