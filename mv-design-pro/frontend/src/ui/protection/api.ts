/**
 * Protection Library API Client (P14a - READ-ONLY, P14b - GOVERNANCE)
 *
 * Provides functions to fetch protection library types from backend.
 * P14a: READ-ONLY endpoints (list/get)
 * P14b: GOVERNANCE endpoints (export/import with manifest+fingerprint)
 */

import type {
  ProtectionCategory,
  ProtectionDeviceType,
  ProtectionCurve,
  ProtectionSettingTemplate,
} from './types';

const API_BASE = '/api/catalog/protection';

const NETWORK_ERROR_MESSAGE =
  'Nie mozna polaczyc sie z API katalogu zabezpieczen. Uruchom backend i odswiez widok.';

function getParams(item: Record<string, unknown>): Record<string, unknown> {
  return typeof item.params === 'object' && item.params !== null
    ? (item.params as Record<string, unknown>)
    : item;
}

function normalizeProtectionDeviceType(item: Record<string, unknown>): ProtectionDeviceType {
  const params = getParams(item);
  return {
    id: String(item.id ?? ''),
    name_pl: String(item.name_pl ?? params.name_pl ?? item.name ?? params.name ?? item.id ?? ''),
    vendor:
      typeof params.vendor === 'string'
        ? params.vendor
        : typeof item.vendor === 'string'
          ? item.vendor
          : undefined,
    model:
      typeof params.model === 'string'
        ? params.model
        : typeof item.model === 'string'
          ? item.model
          : undefined,
    series:
      typeof params.series === 'string'
        ? params.series
        : typeof item.series === 'string'
          ? item.series
          : undefined,
    revision:
      typeof params.revision === 'string'
        ? params.revision
        : typeof item.revision === 'string'
          ? item.revision
          : undefined,
    rated_current_a:
      typeof params.rated_current_a === 'number'
        ? params.rated_current_a
        : typeof item.rated_current_a === 'number'
          ? item.rated_current_a
          : undefined,
    notes_pl:
      typeof params.notes_pl === 'string'
        ? params.notes_pl
        : typeof item.notes_pl === 'string'
          ? item.notes_pl
          : undefined,
    source_catalog:
      typeof params.source_catalog === 'string'
        ? params.source_catalog
        : typeof item.source_catalog === 'string'
          ? item.source_catalog
          : undefined,
    unverified:
      typeof params.unverified === 'boolean'
        ? params.unverified
        : typeof item.unverified === 'boolean'
          ? item.unverified
          : undefined,
    unverified_ranges:
      typeof params.unverified_ranges === 'boolean'
        ? params.unverified_ranges
        : typeof item.unverified_ranges === 'boolean'
          ? item.unverified_ranges
          : undefined,
    functions_supported: Array.isArray(params.functions_supported)
      ? params.functions_supported.filter((value): value is string => typeof value === 'string')
      : undefined,
    curves_supported: Array.isArray(params.curves_supported)
      ? params.curves_supported.filter((value): value is string => typeof value === 'string')
      : undefined,
    i_pickup_51_a_min:
      typeof params.i_pickup_51_a_min === 'number' ? params.i_pickup_51_a_min : undefined,
    i_pickup_51_a_max:
      typeof params.i_pickup_51_a_max === 'number' ? params.i_pickup_51_a_max : undefined,
    tms_51_min: typeof params.tms_51_min === 'number' ? params.tms_51_min : undefined,
    tms_51_max: typeof params.tms_51_max === 'number' ? params.tms_51_max : undefined,
    i_inst_50_a_min:
      typeof params.i_inst_50_a_min === 'number' ? params.i_inst_50_a_min : undefined,
    i_inst_50_a_max:
      typeof params.i_inst_50_a_max === 'number' ? params.i_inst_50_a_max : undefined,
    i_pickup_51n_a_min:
      typeof params.i_pickup_51n_a_min === 'number' ? params.i_pickup_51n_a_min : undefined,
    i_pickup_51n_a_max:
      typeof params.i_pickup_51n_a_max === 'number' ? params.i_pickup_51n_a_max : undefined,
    tms_51n_min: typeof params.tms_51n_min === 'number' ? params.tms_51n_min : undefined,
    tms_51n_max: typeof params.tms_51n_max === 'number' ? params.tms_51n_max : undefined,
    i_inst_50n_a_min:
      typeof params.i_inst_50n_a_min === 'number' ? params.i_inst_50n_a_min : undefined,
    i_inst_50n_a_max:
      typeof params.i_inst_50n_a_max === 'number' ? params.i_inst_50n_a_max : undefined,
  };
}

function normalizeProtectionCurve(item: Record<string, unknown>): ProtectionCurve {
  const params = getParams(item);
  return {
    id: String(item.id ?? ''),
    name_pl: String(item.name_pl ?? params.name_pl ?? item.name ?? params.name ?? item.id ?? ''),
    standard:
      typeof params.standard === 'string'
        ? params.standard
        : typeof item.standard === 'string'
          ? item.standard
          : undefined,
    curve_kind:
      typeof params.curve_kind === 'string'
        ? params.curve_kind
        : typeof item.curve_kind === 'string'
          ? item.curve_kind
          : undefined,
    parameters:
      typeof params.parameters === 'object' && params.parameters !== null
        ? (params.parameters as Record<string, any>)
        : undefined,
  };
}

function normalizeProtectionTemplate(item: Record<string, unknown>): ProtectionSettingTemplate {
  const params = getParams(item);
  return {
    id: String(item.id ?? ''),
    name_pl: String(item.name_pl ?? params.name_pl ?? item.name ?? params.name ?? item.id ?? ''),
    device_type_ref:
      typeof params.device_type_ref === 'string'
        ? params.device_type_ref
        : typeof item.device_type_ref === 'string'
          ? item.device_type_ref
          : undefined,
    curve_ref:
      typeof params.curve_ref === 'string'
        ? params.curve_ref
        : typeof item.curve_ref === 'string'
          ? item.curve_ref
          : undefined,
    setting_fields: Array.isArray(params.setting_fields)
      ? params.setting_fields.map((field) => ({
          name: String((field as Record<string, unknown>).name ?? ''),
          unit:
            typeof (field as Record<string, unknown>).unit === 'string'
              ? String((field as Record<string, unknown>).unit)
              : undefined,
          jednostka_status:
            (field as Record<string, unknown>).jednostka_status === 'NIEUSTALONA'
              ? ('NIEUSTALONA' as const)
              : undefined,
          min:
            typeof (field as Record<string, unknown>).min === 'number'
              ? Number((field as Record<string, unknown>).min)
              : undefined,
          max:
            typeof (field as Record<string, unknown>).max === 'number'
              ? Number((field as Record<string, unknown>).max)
              : undefined,
        }))
      : undefined,
  };
}

async function fetchProtectionJson<T>(endpoint: string): Promise<T> {
  try {
    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error(
        `Nie udalo sie pobrac danych katalogu zabezpieczen: ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }
    throw error;
  }
}

/**
 * Fetch protection types by category
 */
export async function fetchProtectionTypesByCategory(
  category: ProtectionCategory
): Promise<ProtectionDeviceType[] | ProtectionCurve[] | ProtectionSettingTemplate[]> {
  let endpoint: string;

  switch (category) {
    case 'DEVICE':
      endpoint = `${API_BASE}/device-types`;
      break;
    case 'CURVE':
      endpoint = `${API_BASE}/curves`;
      break;
    case 'TEMPLATE':
      endpoint = `${API_BASE}/templates`;
      break;
    default:
      throw new Error(`Nieznana kategoria katalogu zabezpieczen: ${category}`);
  }

  const data = await fetchProtectionJson<Array<Record<string, unknown>>>(endpoint);

  switch (category) {
    case 'DEVICE':
      return data.map(normalizeProtectionDeviceType);
    case 'CURVE':
      return data.map(normalizeProtectionCurve);
    case 'TEMPLATE':
      return data.map(normalizeProtectionTemplate);
    default:
      return [];
  }
}

/**
 * Fetch single protection device type by ID
 */
export async function fetchProtectionDeviceType(
  deviceTypeId: string
): Promise<ProtectionDeviceType | null> {
  const response = await fetch(`${API_BASE}/device-types/${deviceTypeId}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Nie udalo sie pobrac typu urzadzenia zabezpieczeniowego: ${response.statusText}`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  return normalizeProtectionDeviceType(data);
}

/**
 * Fetch single protection curve by ID
 */
export async function fetchProtectionCurve(curveId: string): Promise<ProtectionCurve | null> {
  const response = await fetch(`${API_BASE}/curves/${curveId}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Nie udalo sie pobrac krzywej zabezpieczenia: ${response.statusText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return normalizeProtectionCurve(data);
}

/**
 * Fetch single protection setting template by ID
 */
export async function fetchProtectionSettingTemplate(
  templateId: string
): Promise<ProtectionSettingTemplate | null> {
  const response = await fetch(`${API_BASE}/templates/${templateId}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Nie udalo sie pobrac szablonu nastaw zabezpieczenia: ${response.statusText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return normalizeProtectionTemplate(data);
}

// ============================================================================
// Protection Library Governance (P14b)
// ============================================================================

export interface ProtectionLibraryManifest {
  library_id: string;
  name_pl: string;
  vendor: string;
  series: string;
  revision: string;
  schema_version: string;
  created_at: string;
  fingerprint: string;
  description_pl?: string;
}

export interface ProtectionLibraryExport {
  manifest: ProtectionLibraryManifest;
  device_types: any[];
  curves: any[];
  templates: any[];
}

export interface ProtectionImportReportItem {
  kind: string;
  id: string;
  name_pl: string;
  reason_code: string;
}

export interface ProtectionImportReport {
  mode: string;
  added: ProtectionImportReportItem[];
  skipped: ProtectionImportReportItem[];
  conflicts: ProtectionImportReportItem[];
  blocked: ProtectionImportReportItem[];
  success: boolean;
}

/**
 * Export protection library with manifest and fingerprint (P14b)
 */
export async function exportProtectionLibrary(params?: {
  library_name_pl?: string;
  vendor?: string;
  series?: string;
  revision?: string;
  description_pl?: string;
}): Promise<ProtectionLibraryExport> {
  const queryParams = new URLSearchParams();
  if (params?.library_name_pl) queryParams.set('library_name_pl', params.library_name_pl);
  if (params?.vendor) queryParams.set('vendor', params.vendor);
  if (params?.series) queryParams.set('series', params.series);
  if (params?.revision) queryParams.set('revision', params.revision);
  if (params?.description_pl) queryParams.set('description_pl', params.description_pl);

  const url = `${API_BASE}/export?${queryParams.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Nie udalo sie wyeksportowac biblioteki zabezpieczen: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Import protection library with conflict detection (P14b)
 */
export async function importProtectionLibrary(
  data: ProtectionLibraryExport,
  mode: 'merge' | 'replace' = 'merge'
): Promise<ProtectionImportReport> {
  const response = await fetch(`${API_BASE}/import?mode=${mode}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    // Try to parse error details
    let errorMessage = `Import biblioteki zabezpieczen nie udal sie: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMessage = errorData.detail;
      }
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(errorMessage);
  }

  return await response.json();
}
