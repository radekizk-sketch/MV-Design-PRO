/**
 * Domain API V1 — klient operacji domenowych ENM.
 *
 * Kanoniczny endpoint: POST /api/cases/{caseId}/enm/domain-ops
 * Zwraca DomainOpResponseV1 z pełnym snapshotem + logical_views + readiness.
 *
 * SLD odświeża się z odpowiedzi — brak konieczności osobnego reload.
 */

import type { DomainOpResponseV1 } from '../../types/enm';
import type { DomainOpResponse } from '../../types/domainOps';
import { assertCanonicalOpName } from '../../types/domainOps';
import { normalizeEnmFixAction } from '../shared/fixActionSurfaceNormalizer';

const API_BASE = '/api/cases';

class DomainApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public detail: unknown,
    public endpoint: string,
    message?: string,
    public code?: string | null,
  ) {
    super(message ?? `API ${status} ${statusText}: ${endpoint}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function extractApiError(detail: unknown, status: number, statusText: string, endpoint: string) {
  const root = isRecord(detail) && 'detail' in detail ? detail.detail : detail;
  const payload = isRecord(root) ? root : isRecord(detail) ? detail : null;
  const nestedErrors = Array.isArray(payload?.errors) ? payload.errors : [];
  const nestedMessages = nestedErrors
    .map((entry) => {
      if (!isRecord(entry)) return null;
      return readString(entry.message_pl)
        ?? readString(entry.message)
        ?? readString(entry.reason)
        ?? readString(entry.code);
    })
    .filter((entry): entry is string => Boolean(entry));

  const message = [
    readString(payload?.message_pl)
      ?? readString(payload?.message)
      ?? readString(payload?.error)
      ?? readString(root),
    ...nestedMessages,
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join(' ');

  return {
    code: readString(payload?.code) ?? readString(payload?.error_code),
    message: message
      ? `API ${status} ${statusText}: ${endpoint} - ${message}`
      : `API ${status} ${statusText}: ${endpoint}`,
  };
}

function resolveCanonicalName(name: string): string {
  return assertCanonicalOpName(name);
}

function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((key) => obj[key] !== undefined)
      .sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(obj[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(String(value));
}

function hashFNV1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildIdempotencyKey(opName: string, payload: Record<string, unknown>): string {
  const payloadHash = hashFNV1a32(canonicalStringify(payload));
  return `op:${opName}:root:${payloadHash}`;
}

function getNullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function getNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function normalizeSelectionHint(
  selectionHint: DomainOpResponse['selection_hint'],
): DomainOpResponseV1['selection_hint'] {
  if (!selectionHint?.element_id || !selectionHint.element_type) {
    return null;
  }

  return {
    element_id: selectionHint.element_id,
    element_type: selectionHint.element_type,
    zoom_to: Boolean(selectionHint.zoom_to),
  };
}

function normalizeMaterializedParams(
  materializedParams: DomainOpResponse['materialized_params'],
): DomainOpResponseV1['materialized_params'] {
  const normalizedNamespaces = Object.fromEntries(
    Object.entries(materializedParams ?? {}).map(([namespace, namespaceEntries]) => [
      namespace,
      Object.fromEntries(
        Object.entries(namespaceEntries ?? {}).map(([refId, params]) => [
          refId,
          {
            ...params,
            catalog_item_id:
              typeof params.catalog_item_id === 'string' ? params.catalog_item_id : '',
            catalog_item_version: getNullableString(params.catalog_item_version),
          },
        ]),
      ),
    ]),
  ) as DomainOpResponseV1['materialized_params'];

  normalizedNamespaces.lines_sn = Object.fromEntries(
    Object.entries(normalizedNamespaces.lines_sn ?? {}).map(([refId, params]) => [
      refId,
      {
        ...params,
        r_ohm_per_km: getNullableNumber(params.r_ohm_per_km),
        x_ohm_per_km: getNullableNumber(params.x_ohm_per_km),
        i_max_a: getNullableNumber(params.i_max_a),
      },
    ]),
  );

  normalizedNamespaces.transformers_sn_nn = Object.fromEntries(
    Object.entries(normalizedNamespaces.transformers_sn_nn ?? {}).map(([refId, params]) => [
      refId,
      {
        ...params,
        u_k_percent: getNullableNumber(params.u_k_percent),
        p0_kw: getNullableNumber(params.p0_kw),
        pk_kw: getNullableNumber(params.pk_kw),
        s_n_kva: getNullableNumber(params.s_n_kva),
      },
    ]),
  );

  return {
    ...normalizedNamespaces,
    lines_sn: normalizedNamespaces.lines_sn ?? {},
    transformers_sn_nn: normalizedNamespaces.transformers_sn_nn ?? {},
  };
}

function normalizeResponse(
  response: DomainOpResponse & { error?: string; error_code?: string },
): DomainOpResponseV1 {
  return {
    snapshot: (response.snapshot as unknown as DomainOpResponseV1['snapshot']) ?? null,
    logical_views: (response.logical_views as unknown as DomainOpResponseV1['logical_views']) ?? {
      trunks: [],
      branches: [],
      secondary_connectors: [],
      terminals: [],
    },
    readiness: response.readiness ?? { ready: false, blockers: [], warnings: [] },
    fix_actions: (response.fix_actions ?? []).map((action) =>
      normalizeEnmFixAction({
        ...action,
        modal_type: action.modal_type ?? action.panel ?? null,
      }),
    ),
    changes: response.changes ?? {
      created_element_ids: [],
      updated_element_ids: [],
      deleted_element_ids: [],
    },
    selection_hint: normalizeSelectionHint(response.selection_hint),
    audit_trail: response.audit_trail ?? [],
    domain_events: (response.domain_events as unknown as DomainOpResponseV1['domain_events']) ?? [],
    materialized_params: normalizeMaterializedParams(response.materialized_params),
    layout: (response.layout as DomainOpResponseV1['layout']) ?? {
      layout_hash: '',
      layout_version: 'unknown',
    },
    error: response.error,
    error_code: response.error_code,
  };
}

/**
 * Wykonaj operację domenową V1.
 *
 * @param caseId - ID studium przypadku
 * @param opName - kanonyczna nazwa operacji (np. "add_grid_source_sn")
 * @param payload - dane operacji
 * @returns DomainOpResponseV1 — pełna odpowiedź z snapshotem
 */
export async function executeDomainOp(
  caseId: string,
  opName: string,
  payload: Record<string, unknown>,
  snapshotBaseHash = '',
): Promise<DomainOpResponseV1> {
  const canonicalName = resolveCanonicalName(opName);
  const endpoint = `${API_BASE}/${caseId}/enm/domain-ops`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: caseId,
      snapshot_base_hash: snapshotBaseHash,
      operation: {
        name: canonicalName,
        idempotency_key: buildIdempotencyKey(canonicalName, payload),
        payload,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => res.statusText);
    const extracted = extractApiError(detail, res.status, res.statusText, endpoint);
    throw new DomainApiError(
      res.status,
      res.statusText,
      detail,
      endpoint,
      extracted.message,
      extracted.code,
    );
  }

  const response = (await res.json()) as DomainOpResponse & {
    error?: string;
    error_code?: string;
  };
  return normalizeResponse(response);
}
