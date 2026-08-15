/**
 * API client — diagnostyka ENM (v4.2).
 *
 * Read-only endpoints. Brak side-effects.
 */

import type {
  DiagnosticReport,
  PreflightReport,
  EnmDiffReport,
  ReferenceComplianceReport,
} from './types';
import type { EnergyNetworkModelV2Projection } from '../../types/enm';

const API_BASE = '/api';

/**
 * Pobierz raport diagnostyczny ENM dla danego przypadku.
 */
export async function fetchDiagnostics(caseId: string): Promise<DiagnosticReport> {
  const response = await fetch(`${API_BASE}/cases/${caseId}/diagnostics`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania diagnostyki: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Pobierz pre-flight checks — macierz dostępności analiz.
 */
export async function fetchPreflight(caseId: string): Promise<PreflightReport> {
  const response = await fetch(`${API_BASE}/cases/${caseId}/diagnostics/preflight`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania pre-flight: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Pobierz diff dwóch rewizji ENM.
 */
export async function fetchEnmDiff(
  caseId: string,
  fromSnapshotId: string,
  toSnapshotId: string,
): Promise<EnmDiffReport> {
  const params = new URLSearchParams({
    from: fromSnapshotId,
    to: toSnapshotId,
  });
  const response = await fetch(
    `${API_BASE}/cases/${caseId}/enm/diff?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(`Błąd pobierania diff ENM: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Pobierz read-only projekcje ENM v2.0 dla danego przypadku.
 */
export async function fetchEnmV2Projection(
  caseId: string,
): Promise<EnergyNetworkModelV2Projection> {
  const response = await fetch(`${API_BASE}/cases/${caseId}/enm/v2-projection`);
  if (!response.ok) {
    throw new Error(`Blad pobierania projekcji ENM v2: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Pobierz raport zgodności referencyjnej + Reference Score (Reference
 * Engine V1, spec §9).
 *
 * `packIds` — opcjonalne ZAWĘŻENIE oceny do wskazanych pakietów (parametr
 * `?packs=a,b` końcówki; pominięty ⇒ backend ocenia WSZYSTKIE pakiety
 * rejestru). Zawężenie jest wyborem projektanta („oceniam wg tego
 * standardu"), nie domysłem UI — identyfikatory pochodzą wyłącznie z listy
 * `GET /api/reference/packs`. Kolejność normalizowana (sort), żeby ten sam
 * wybór dawał ten sam adres — bez tego cache/porównania zapytań rozjeżdżają
 * się przy identycznym zbiorze w innej kolejności.
 */
export async function fetchReferenceCompliance(
  caseId: string,
  packIds?: readonly string[],
): Promise<ReferenceComplianceReport> {
  const zawezenie = packIds && packIds.length > 0 ? [...packIds].sort() : null;
  const query = zawezenie ? `?packs=${encodeURIComponent(zawezenie.join(','))}` : '';
  const response = await fetch(`${API_BASE}/cases/${caseId}/reference/compliance${query}`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania zgodności referencyjnej: ${response.statusText}`);
  }
  return response.json();
}
