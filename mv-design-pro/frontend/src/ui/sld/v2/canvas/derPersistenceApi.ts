import type { DomainOpResponseV1 } from '../../../../types/enm';

export type DerKind = 'PV' | 'BESS' | 'FW';
/**
 * Karta FAB-K (§0 R3): DOKŁADNIE dwa warianty backendu (`api/generators.py::
 * DerConnectionVariant`) — `sn_side`/`dedicated` USUNIĘTE bez kompatybilności
 * wstecznej (backendowa `_canonical_variant` też usunięta). Wybór POZIOMU
 * przyłączenia (nN vs SN przez transformator dedykowany); dla `block_transformer`
 * PUNKT przyłączenia SN to osobne pole `sn_connection_bus_ref`.
 */
export type DerConnectionVariant = 'nn_side' | 'block_transformer';
export type NcRfgModule = 'A' | 'B' | 'C' | 'D';

export interface DerGeneratorConfigRequest {
  readonly station_ref: string;
  readonly der_kind: DerKind;
  readonly power_mw: number;
  readonly connection_variant: DerConnectionVariant;
  readonly catalog_ref: string;
  readonly block_transformer_catalog_ref?: string | null;
  /**
   * Karta FAB-K (§0 R3): punkt przyłączenia SN — szyna ISTNIEJĄCA w modelu,
   * WYMAGANA gdy `connection_variant==='block_transformer'` i backend nie ma
   * jeszcze zapisanego `blocking_transformer_ref` (422 `generator.
   * sn_connection_bus_missing` bez tego pola).
   */
  readonly sn_connection_bus_ref?: string | null;
  /** Karta FAB-K (§0 R2): pakiet baterii BESS z katalogu `BATERIA_BESS`. */
  readonly battery_catalog_ref?: string | null;
  readonly source_name?: string;
  readonly quantity?: number;
  readonly nc_rfg_module?: NcRfgModule;
}

export class DerPersistenceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: unknown,
    public readonly endpoint: string,
    message: string,
    public readonly code?: string | null,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function sanitizeDerApiMessage(message: string, status: number): string {
  const withoutEndpoint = message
    .replace(/\s*\(\/api\/[^)]*\)\s*/g, ' ')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
    .replace(/\b(?:stn|gpz|seg)\/[^\s)]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (/przypadek obliczeniowy nie nale[żz]y do wskazanego projektu/i.test(withoutEndpoint)) {
    return 'Aktywny zakres obliczeń nie jest powiązany z wybranym projektem. Wybierz właściwy projekt albo zakres obliczeń.';
  }

  return withoutEndpoint || `Nie udało się zapisać konfiguracji DER. Kod odpowiedzi: ${status}.`;
}

function extractApiError(detail: unknown, status: number): { message: string; code: string | null } {
  const root = isRecord(detail) && 'detail' in detail ? detail.detail : detail;
  const payload = isRecord(root) ? root : isRecord(detail) ? detail : null;
  const message = readString(payload?.message_pl)
    ?? readString(payload?.message)
    ?? readString(payload?.error)
    ?? readString(root)
    ?? `Błąd API ${status}`;
  const code = readString(payload?.code) ?? readString(payload?.error_code);
  return {
    code,
    message: sanitizeDerApiMessage(message, status),
  };
}

export async function postDerGeneratorConfig(
  projectId: string,
  caseId: string,
  body: DerGeneratorConfigRequest,
): Promise<DomainOpResponseV1> {
  const endpoint = `/api/projects/${projectId}/cases/${caseId}/generators`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => response.statusText);
    const extracted = extractApiError(detail, response.status);
    throw new DerPersistenceApiError(
      response.status,
      detail,
      endpoint,
      extracted.message,
      extracted.code,
    );
  }

  return (await response.json()) as DomainOpResponseV1;
}

/**
 * Wiązania katalogowe i profile zgodności wytwórcy wybierane PO jego utworzeniu
 * (V12K-238, pomiar V12K-237).
 *
 * POMINIĘCIE ≠ `null`. Pole nieobecne w obiekcie zostawia wiązanie w modelu bez zmian,
 * a jawne `null` je USUWA (reguła gotowości znów widzi brak danej). Dlatego nie wolno
 * wysyłać tu pełnego obiektu z `null`-ami dla pól, których użytkownik nie dotknął —
 * skasowałoby to jego wcześniejsze wybory.
 */
export interface DerCatalogBindingsRequest {
  readonly protection_catalog_ref?: string | null;
  readonly ct_catalog_ref?: string | null;
  readonly vt_catalog_ref?: string | null;
  readonly fault_current_data_ref?: string | null;
  readonly dynamic_model_ref?: string | null;
  readonly nc_rfg_profile_ref?: string | null;
  readonly lvrt_curve_ref?: string | null;
  readonly hvrt_curve_ref?: string | null;
  readonly pf_curve_ref?: string | null;
}

/** Zapisz wiązania wytwórcy w modelu (kanoniczna operacja `set_der_catalog_bindings`). */
export async function patchDerCatalogBindings(
  projectId: string,
  caseId: string,
  generatorRef: string,
  body: DerCatalogBindingsRequest,
): Promise<DomainOpResponseV1> {
  const endpoint =
    `/api/projects/${projectId}/cases/${caseId}/generators/`
    + `${encodeURIComponent(generatorRef)}/bindings`;
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => response.statusText);
    const extracted = extractApiError(detail, response.status);
    throw new DerPersistenceApiError(
      response.status,
      detail,
      endpoint,
      extracted.message,
      extracted.code,
    );
  }

  return (await response.json()) as DomainOpResponseV1;
}
