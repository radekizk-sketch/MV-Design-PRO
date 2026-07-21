/**
 * Audyt E, faza E-5 — klient i adapter widoku zabezpieczeń (`protection-view`).
 *
 * Read-only źródło danych dla inspektora zabezpieczeń. Pobiera read model
 * `GET /api/cases/{caseId}/enm/protection-view` (backend
 * `application/protection_read_model.build_protection_read_model`) i mapuje
 * pole `assignments[]` na kontrakt UI `ElementProtectionAssignment`.
 *
 * ZASADA (BINDING): ZERO fizyki w UI — wszystkie wartości (nastawy, wartości
 * computed, punkty krzywej I-t) pochodzą z backendu. Adapter jedynie filtruje
 * i przepisuje kształt, nic nie liczy i nic nie zmyśla. Brak danych dla
 * elementu ⇒ pusta lista (uczciwy stan zerowy), nigdy dane zastępcze.
 */

import type { ElementProtectionAssignment, ProtectionSettingsSummary } from './element-assignment';
import type { ElementType } from '../types';

// =============================================================================
// Kontrakt odpowiedzi backendu (tylko konsumowane pola)
// =============================================================================

/**
 * Status widoku zabezpieczeń z read modelu.
 */
export interface ProtectionViewStatus {
  data_source: string;
  result_state: 'NONE' | 'FRESH';
  has_protection_data: boolean;
}

/**
 * Pojedyncze przypisanie zabezpieczenia z read modelu (kształt backendu).
 * Struktura jest zgodna z `ElementProtectionAssignment` — pola nadmiarowe
 * (jeśli backend je doda) są ignorowane przez adapter.
 */
export interface ProtectionViewAssignment {
  element_id: string;
  element_type: string;
  device_id: string;
  device_name_pl: string;
  device_kind: ElementProtectionAssignment['device_kind'];
  status: ElementProtectionAssignment['status'];
  settings_summary?: ProtectionSettingsSummary;
}

/**
 * Pełna odpowiedź `protection-view`.
 */
export interface ProtectionViewResponse {
  case_id: string;
  enm_revision: number;
  view_status: ProtectionViewStatus;
  assignments: ProtectionViewAssignment[];
}

export const EMPTY_PROTECTION_VIEW: ProtectionViewResponse = {
  case_id: '',
  enm_revision: 0,
  view_status: {
    data_source: 'ENM_PROTECTION_READ_MODEL',
    result_state: 'NONE',
    has_protection_data: false,
  },
  assignments: [],
};

// =============================================================================
// Normalizacja + adapter
// =============================================================================

function normalizeProtectionViewResponse(
  payload: Partial<ProtectionViewResponse> | null | undefined,
): ProtectionViewResponse {
  return {
    ...EMPTY_PROTECTION_VIEW,
    ...payload,
    view_status: {
      ...EMPTY_PROTECTION_VIEW.view_status,
      ...(payload?.view_status ?? {}),
    },
    assignments: Array.isArray(payload?.assignments) ? payload.assignments : [],
  };
}

/**
 * Mapuje wpis read modelu na kontrakt UI `ElementProtectionAssignment`.
 * Wyłącznie przepisanie kształtu — bez obliczeń.
 */
function toElementAssignment(entry: ProtectionViewAssignment): ElementProtectionAssignment {
  return {
    element_id: entry.element_id,
    element_type: entry.element_type as ElementType,
    device_id: entry.device_id,
    device_name_pl: entry.device_name_pl,
    device_kind: entry.device_kind,
    status: entry.status,
    settings_summary: entry.settings_summary,
  };
}

/**
 * Zwraca przypisania zabezpieczeń dla wskazanego elementu.
 * Brak dopasowania ⇒ pusta lista (uczciwy stan zerowy).
 */
export function assignmentsForElement(
  response: ProtectionViewResponse,
  elementId: string | null | undefined,
): ElementProtectionAssignment[] {
  if (!elementId) return [];
  return response.assignments
    .filter((entry) => entry.element_id === elementId)
    .map(toElementAssignment);
}

// =============================================================================
// Klient HTTP
// =============================================================================

/**
 * Pobiera read model zabezpieczeń dla aktywnego case'u.
 *
 * @throws Error gdy odpowiedź HTTP jest błędna.
 */
export async function fetchProtectionView(caseId: string): Promise<ProtectionViewResponse> {
  const response = await fetch(`/api/cases/${caseId}/enm/protection-view`);
  if (!response.ok) {
    throw new Error(`Nie udało się pobrać widoku zabezpieczeń: ${response.statusText}`);
  }
  return normalizeProtectionViewResponse(
    (await response.json()) as Partial<ProtectionViewResponse>,
  );
}
