/**
 * Inspector Types (READ-ONLY Property Grid)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Property grid jako read-only inspector
 * - wizard_screens.md § 2.4: Inspector wyświetla właściwości wybranego elementu
 *
 * 100% POLISH UI
 */

import type { ElementType, ValidationMessage } from '../types';

/**
 * Sekcja właściwości w inspektorze.
 */
export interface InspectorSection {
  id: string;
  label: string;
  fields: InspectorField[];
  collapsed?: boolean;
}

/**
 * Pole właściwości w inspektorze (read-only).
 */
export interface InspectorField {
  key: string;
  label: string;
  value: unknown;
  unit?: string;
  source?: 'instance' | 'type' | 'calculated' | 'audit';
  highlight?: 'primary' | 'warning' | 'error';
}

/**
 * Dane elementu do wyświetlenia w inspektorze.
 */
export interface InspectorElementData {
  id: string;
  type: ElementType;
  name: string;
  sections: InspectorSection[];
  validationMessages?: ValidationMessage[];
}

/**
 * Typ wyniku do wyświetlenia w inspektorze.
 */
export type InspectorResultType = 'bus' | 'branch' | 'short_circuit';

/**
 * Wynik szyny (Bus) do inspektora.
 */
export interface BusResultData {
  bus_id: string;
  name: string;
  un_kv: number | null;
  u_kv: number | null;
  u_pu: number | null;
  angle_deg: number | null;
  flags: string[];
}

/**
 * Wynik gałęzi (Branch) do inspektora.
 */
export interface BranchResultData {
  branch_id: string;
  name: string;
  from_bus: string;
  to_bus: string;
  i_a: number | null;
  p_mw: number | null;
  q_mvar: number | null;
  s_mva: number | null;
  loading_pct: number | null;
  flags: string[];
}

/**
 * Wynik zwarcia (Short-Circuit) do inspektora.
 */
export interface ShortCircuitResultData {
  target_id: string;
  target_name: string | null;
  fault_type: string | null;
  ikss_ka: number | null;
  ip_ka: number | null;
  ith_ka: number | null;
  sk_mva: number | null;
}

/**
 * Etykiety sekcji (Polish).
 */
export const INSPECTOR_SECTION_LABELS: Record<string, string> = {
  identification: 'Identyfikacja',
  topology: 'Topologia',
  electrical: 'Parametry elektryczne',
  results: 'Wyniki obliczen',
  power_flow: 'Rozplyw mocy',
  short_circuit: 'Prady zwarciowe',
  protection: 'Zabezpieczenia',
  diagnostics: 'Diagnostyka',
  flags: 'Flagi i ostrzezenia',
};

/**
 * Etykiety flag (Polish).
 */
export const FLAG_LABELS: Record<string, string> = {
  VOLTAGE_VIOLATION: 'Przekroczenie napięcia',
  OVERLOAD: 'Przeciążenie',
  SLACK: 'Węzeł bilansujący',
  UNDERVOLTAGE: 'Zbyt niskie napięcie',
  OVERVOLTAGE: 'Zbyt wysokie napięcie',
};
