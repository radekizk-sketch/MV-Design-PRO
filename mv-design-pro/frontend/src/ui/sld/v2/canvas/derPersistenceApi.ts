import type { DomainOpResponseV1 } from '../../../../types/enm';

export type DerKind = 'PV' | 'BESS' | 'FW';
export type DerConnectionVariant = 'nn_side' | 'sn_side' | 'dedicated';
export type NcRfgModule = 'A' | 'B' | 'C' | 'D';

export interface DerGeneratorConfigRequest {
  readonly station_ref: string;
  readonly der_kind: DerKind;
  readonly power_mw: number;
  readonly connection_variant: DerConnectionVariant;
  readonly catalog_ref: string;
  readonly block_transformer_catalog_ref?: string | null;
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
