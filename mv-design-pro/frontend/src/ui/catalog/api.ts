import { buildCatalogBinding } from './catalogBinding';
import type { BayKind, CompleteMvBayTemplateSummary } from './BayTemplatePicker';
import type { Manufacturer } from './manufacturer';
import type { SwitchgearFamily } from './SwitchgearFamilyPicker';
import { executeDomainOp } from '../topology/domainApi';
import type {
  BranchPointCatalogType,
  BESSInverterCatalogType,
  CableType,
  CatalogNamespace,
  ConverterType,
  CTCatalogType,
  LineType,
  LoadCatalogType,
  LVApparatusType,
  LVCableType,
  MVApparatusCatalogType,
  PVInverterCatalogType,
  PtpireeGeneratorCertificateCatalogType,
  ProtectionDeviceType,
  SourceSystemCatalogType,
  SwitchEquipmentType,
  ShuntCapacitorCatalogType,
  SurgeArresterCatalogType,
  TapChangerCatalogType,
  TransformerType,
  TypeCategory,
  VTCatalogType,
} from './types';

export class CatalogApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly detail: string | null,
    public readonly endpoint: string,
  ) {
    super(`${status} ${statusText}: ${detail ?? 'No detail'}`);
    this.name = 'CatalogApiError';
  }
}

export function getCatalogErrorMessage(error: unknown): string {
  if (error instanceof CatalogApiError) {
    if (error.status >= 500 && !error.detail) {
      return BACKEND_UNAVAILABLE_MESSAGE;
    }
    if (error.detail) {
      return error.detail;
    }
    return `Błąd API katalogów (${error.status}).`;
  }
  if (error instanceof Error && error.message === NETWORK_ERROR_MESSAGE) {
    return error.message;
  }
  if (error instanceof Error && error.message.includes('500 Internal Server Error: No detail')) {
    return BACKEND_UNAVAILABLE_MESSAGE;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Błąd pobierania typów katalogowych.';
}

export type CatalogListItem =
  | LineType
  | CableType
  | TransformerType
  | SwitchEquipmentType
  | MVApparatusCatalogType
  | LVApparatusType
  | LVCableType
  | LoadCatalogType
  | CTCatalogType
  | VTCatalogType
  | PVInverterCatalogType
  | BESSInverterCatalogType
  | ProtectionDeviceType
  | SourceSystemCatalogType
  | BranchPointCatalogType
  | SurgeArresterCatalogType
  | ShuntCapacitorCatalogType
  | PtpireeGeneratorCertificateCatalogType;

const DECATALOGING_BLOCKED_MESSAGE =
  'Odkatalogowanie elementów technicznych jest niedostępne w trybie katalog-first.';
const NETWORK_ERROR_MESSAGE =
  'Nie można połączyć się z API katalogów. Uruchom backend i odśwież widok.';
const CATALOG_OPERATION_ERROR_MESSAGE =
  'Nie udało się wykonać operacji katalogowej. Spróbuj ponownie.';
const BACKEND_UNAVAILABLE_MESSAGE =
  'Backend katalogów nie odpowiada. Uruchom API i spróbuj ponownie.';

async function handleResponse<T>(response: Response, endpoint: string): Promise<T> {
  if (!response.ok) {
    let detail: string | null = null;
    try {
      const body = await response.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      detail = null;
    }
    throw new CatalogApiError(response.status, response.statusText, detail, endpoint);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

function normalizeCatalogRequestError(error: unknown): Error {
  if (error instanceof CatalogApiError) {
    return error;
  }
  if (error instanceof Error && error.message === NETWORK_ERROR_MESSAGE) {
    return error;
  }
  if (error instanceof TypeError || (error instanceof Error && error.message === 'Failed to fetch')) {
    return new Error(NETWORK_ERROR_MESSAGE);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(CATALOG_OPERATION_ERROR_MESSAGE);
}

async function requestCatalog<T>(endpoint: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(endpoint, init);
    return await handleResponse<T>(response, endpoint);
  } catch (error) {
    throw normalizeCatalogRequestError(error);
  }
}

async function fetchCatalogJson<T>(endpoint: string): Promise<T> {
  return requestCatalog<T>(endpoint);
}

async function postCatalogJson<T>(endpoint: string, body: unknown): Promise<T> {
  return requestCatalog<T>(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchLineTypes(): Promise<LineType[]> {
  return fetchCatalogJson<LineType[]>('/api/catalog/line-types');
}

/** Lista producentów rozdzielnic SN (goal §11A). */
export async function fetchManufacturers(): Promise<Manufacturer[]> {
  return fetchCatalogJson<Manufacturer[]>('/api/catalog/manufacturers');
}

/** Lista rodzin rozdzielnic SN — opcjonalnie filtrowana per producent. */
export async function fetchSwitchgearFamilies(
  manufacturerRef?: string,
): Promise<SwitchgearFamily[]> {
  const query = manufacturerRef
    ? `?manufacturer_ref=${encodeURIComponent(manufacturerRef)}`
    : '';
  return fetchCatalogJson<SwitchgearFamily[]>(`/api/catalog/switchgear-families${query}`);
}

/** Lista kompletnych szablonów pól SN per producent/rodzina/funkcja pola. */
export async function fetchCompleteBayTemplates(
  manufacturerRef?: string | null,
  bayKind?: BayKind | null,
): Promise<CompleteMvBayTemplateSummary[]> {
  const params = new URLSearchParams();
  if (manufacturerRef) params.set('manufacturer_ref', manufacturerRef);
  if (bayKind) params.set('bay_kind', bayKind);
  const query = params.toString();
  return fetchCatalogJson<CompleteMvBayTemplateSummary[]>(
    `/api/catalog/complete-bay-templates${query ? `?${query}` : ''}`,
  );
}

export async function fetchCableTypes(): Promise<CableType[]> {
  return fetchCatalogJson<CableType[]>('/api/catalog/cable-types');
}

export async function fetchTransformerTypes(): Promise<TransformerType[]> {
  return fetchCatalogJson<TransformerType[]>('/api/catalog/transformer-types');
}

export async function fetchTapChangers(): Promise<TapChangerCatalogType[]> {
  return fetchCatalogJson<TapChangerCatalogType[]>('/api/v1/catalog/audit2/tap-changers');
}

export async function fetchSwitchEquipmentTypes(): Promise<SwitchEquipmentType[]> {
  return fetchCatalogJson<SwitchEquipmentType[]>('/api/catalog/switch-equipment-types');
}

export async function fetchMvApparatusTypes(): Promise<MVApparatusCatalogType[]> {
  return fetchCatalogJson<MVApparatusCatalogType[]>('/api/catalog/mv-apparatus-types');
}

export async function fetchLvApparatusTypes(): Promise<LVApparatusType[]> {
  return fetchCatalogJson<LVApparatusType[]>('/api/catalog/lv-apparatus-types');
}

export async function fetchLvCableTypes(): Promise<LVCableType[]> {
  return fetchCatalogJson<LVCableType[]>('/api/catalog/lv-cable-types');
}

export async function fetchLoadTypes(): Promise<LoadCatalogType[]> {
  return fetchCatalogJson<LoadCatalogType[]>('/api/catalog/load-types');
}

export async function fetchCtTypes(): Promise<CTCatalogType[]> {
  return fetchCatalogJson<CTCatalogType[]>('/api/catalog/ct-types');
}

export async function fetchVtTypes(): Promise<VTCatalogType[]> {
  return fetchCatalogJson<VTCatalogType[]>('/api/catalog/vt-types');
}

export async function fetchSurgeArresterTypes(): Promise<SurgeArresterCatalogType[]> {
  return fetchCatalogJson<SurgeArresterCatalogType[]>('/api/catalog/surge-arrester-types');
}

export async function fetchShuntCapacitorTypes(): Promise<ShuntCapacitorCatalogType[]> {
  return fetchCatalogJson<ShuntCapacitorCatalogType[]>('/api/catalog/shunt-capacitor-types');
}

export async function fetchPtpireeGeneratorCertificates(): Promise<PtpireeGeneratorCertificateCatalogType[]> {
  return fetchCatalogJson<PtpireeGeneratorCertificateCatalogType[]>(
    '/api/catalog/ptpiree/generator-certificates',
  );
}

export async function fetchPvInverterTypes(): Promise<PVInverterCatalogType[]> {
  return fetchCatalogJson<PVInverterCatalogType[]>('/api/catalog/pv-inverter-types');
}

export async function fetchBessInverterTypes(): Promise<BESSInverterCatalogType[]> {
  return fetchCatalogJson<BESSInverterCatalogType[]>('/api/catalog/bess-inverter-types');
}

export async function fetchWindInverterTypes(): Promise<ConverterType[]> {
  return fetchCatalogJson<ConverterType[]>('/api/catalog/wind-inverter-types');
}

export async function fetchDerConverterTypes(
  kind?: ConverterType['kind'],
): Promise<ConverterType[]> {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  return fetchCatalogJson<ConverterType[]>(`/api/catalog/converter-types${query}`);
}

function resolveConverterVoltageKv(
  item: Pick<PVInverterCatalogType | BESSInverterCatalogType, 'un_kv' | 'u_n_kv' | 'voltage_kv' | 'voltage_lv_kv'>,
): number | null {
  const voltage =
    item.un_kv ?? item.u_n_kv ?? item.voltage_lv_kv ?? item.voltage_kv;
  return typeof voltage === 'number' && Number.isFinite(voltage) && voltage > 0
    ? voltage
    : null;
}

export async function fetchConverterTypes(): Promise<ConverterType[]> {
  const [pvTypes, bessTypes, windTypes] = await Promise.all([
    fetchPvInverterTypes(),
    fetchBessInverterTypes(),
    fetchWindInverterTypes(),
  ]);

  const pvConverters: ConverterType[] = pvTypes.flatMap((item) => {
    const voltageKv = resolveConverterVoltageKv(item);
    if (voltageKv === null) return [];
    return [{
      id: item.id,
      name: item.name,
      manufacturer: item.manufacturer,
      kind: 'PV',
      un_kv: voltageKv,
      sn_mva: item.s_n_kva / 1000,
      pmax_mw: item.p_max_kw / 1000,
      cosphi_min: item.cos_phi_min,
      cosphi_max: item.cos_phi_max,
      // Certyfikat PTPiREE — z rekordu katalogowego (backend annotate_with_ptpiree_status)
      // → materialized_params + ocena zgodności NC RfG. Bez tego link certyfikatu ginął.
      ptpiree_status: item.ptpiree_status,
      ptpiree_certificate_ref: item.ptpiree_certificate_ref ?? null,
      ptpiree_document_number: item.ptpiree_document_number ?? null,
      ptpiree_wos_version: item.ptpiree_wos_version ?? null,
      ptpiree_source_url: item.ptpiree_source_url ?? null,
    }];
  });
  const bessConverters: ConverterType[] = bessTypes.flatMap((item) => {
    const voltageKv = resolveConverterVoltageKv(item);
    if (voltageKv === null) return [];
    return [{
      id: item.id,
      name: item.name,
      manufacturer: item.manufacturer,
      kind: 'BESS',
      un_kv: voltageKv,
      sn_mva: (item.s_n_kva ?? Math.max(item.p_charge_kw, item.p_discharge_kw)) / 1000,
      pmax_mw: item.p_discharge_kw / 1000,
      e_kwh: item.e_kwh,
      ptpiree_status: item.ptpiree_status,
      ptpiree_certificate_ref: item.ptpiree_certificate_ref ?? null,
      ptpiree_document_number: item.ptpiree_document_number ?? null,
      ptpiree_wos_version: item.ptpiree_wos_version ?? null,
      ptpiree_source_url: item.ptpiree_source_url ?? null,
    }];
  });

  const windConverters = windTypes.filter(
    (item) =>
      item.kind === 'WIND'
      && typeof item.un_kv === 'number'
      && Number.isFinite(item.un_kv)
      && item.un_kv > 0,
  );

  return [...pvConverters, ...bessConverters, ...windConverters];
}

export async function fetchSourceSystemTypes(): Promise<SourceSystemCatalogType[]> {
  return fetchCatalogJson<SourceSystemCatalogType[]>('/api/catalog/source-system-types');
}

export async function fetchBranchPointTypes(
  kind?: 'BRANCH_POLE' | 'ZKSN',
): Promise<BranchPointCatalogType[]> {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  return fetchCatalogJson<BranchPointCatalogType[]>(`/api/catalog/branch-point-types${query}`);
}

export async function fetchProtectionDeviceTypes(): Promise<ProtectionDeviceType[]> {
  const raw = await fetchCatalogJson<Array<Record<string, unknown>>>('/api/catalog/protection/device-types');
  return raw.map((item) => {
    const params =
      typeof item.params === 'object' && item.params !== null
        ? (item.params as Record<string, unknown>)
        : item;
    const vendor =
      typeof params.vendor === 'string'
        ? params.vendor
        : typeof item.vendor === 'string'
          ? item.vendor
          : undefined;
    return {
      id: String(item.id ?? ''),
      name: String(item.name_pl ?? item.name ?? params.name_pl ?? params.name ?? item.id ?? ''),
      manufacturer: vendor,
      vendor,
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
    };
  });
}

function sortCatalogItems(items: CatalogListItem[]): CatalogListItem[] {
  return [...items].sort((a, b) => {
    const recordA = a as unknown as Record<string, unknown>;
    const recordB = b as unknown as Record<string, unknown>;
    const manufacturerA =
      typeof recordA.manufacturer === 'string'
        ? recordA.manufacturer
        : typeof recordA.vendor === 'string'
          ? recordA.vendor
          : null;
    const manufacturerB =
      typeof recordB.manufacturer === 'string'
        ? recordB.manufacturer
        : typeof recordB.vendor === 'string'
          ? recordB.vendor
          : null;

    if (manufacturerA == null && manufacturerB != null) return 1;
    if (manufacturerA != null && manufacturerB == null) return -1;
    if (manufacturerA != null && manufacturerB != null) {
      if (manufacturerA < manufacturerB) return -1;
      if (manufacturerA > manufacturerB) return 1;
    }

    const nameA = typeof recordA.name === 'string' ? recordA.name : String(recordA.id ?? '');
    const nameB = typeof recordB.name === 'string' ? recordB.name : String(recordB.id ?? '');
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;

    const idA = String(recordA.id ?? '');
    const idB = String(recordB.id ?? '');
    if (idA < idB) return -1;
    if (idA > idB) return 1;

    return 0;
  });
}

export async function fetchTypesByCategory(category: TypeCategory): Promise<CatalogListItem[]> {
  let types: CatalogListItem[];

  switch (category) {
    case 'LINE':
      types = await fetchLineTypes();
      break;
    case 'CABLE':
      types = await fetchCableTypes();
      break;
    case 'TRANSFORMER':
      types = await fetchTransformerTypes();
      break;
    case 'SWITCH_EQUIPMENT':
      types = await fetchSwitchEquipmentTypes();
      break;
    case 'MV_APPARATUS':
      types = await fetchMvApparatusTypes();
      break;
    case 'LV_APPARATUS':
      types = await fetchLvApparatusTypes();
      break;
    case 'LV_CABLE':
      types = await fetchLvCableTypes();
      break;
    case 'LOAD':
      types = await fetchLoadTypes();
      break;
    case 'CT':
      types = await fetchCtTypes();
      break;
    case 'VT':
      types = await fetchVtTypes();
      break;
    case 'SURGE_ARRESTER':
      types = await fetchSurgeArresterTypes();
      break;
    case 'SHUNT_CAPACITOR':
      types = await fetchShuntCapacitorTypes();
      break;
    case 'PTPIREE_CERTIFICATE':
      types = await fetchPtpireeGeneratorCertificates();
      break;
    case 'MEASUREMENT_TRANSFORMER':
      types = [...(await fetchCtTypes()), ...(await fetchVtTypes())];
      break;
    case 'PV_INVERTER':
      types = await fetchPvInverterTypes();
      break;
    case 'BESS_INVERTER':
      types = await fetchBessInverterTypes();
      break;
    case 'CONVERTER':
      types = [...(await fetchPvInverterTypes()), ...(await fetchBessInverterTypes())];
      break;
    case 'PROTECTION_DEVICE':
      types = await fetchProtectionDeviceTypes();
      break;
    case 'SYSTEM_SOURCE':
      types = await fetchSourceSystemTypes();
      break;
    case 'BRANCH_POLE':
      types = await fetchBranchPointTypes('BRANCH_POLE');
      break;
    case 'ZKSN':
      types = await fetchBranchPointTypes('ZKSN');
      break;
    default:
      throw new Error(`Unknown category: ${category}`);
  }

  return sortCatalogItems(types);
}

export async function assignTypeToBranch(
  projectId: string,
  branchId: string,
  typeId: string,
  catalogNamespace: CatalogNamespace = 'KABEL_SN',
): Promise<void> {
  await executeDomainOp(projectId, 'assign_catalog_to_element', {
    element_ref: branchId,
    catalog_binding: buildCatalogBinding(catalogNamespace, typeId),
    source_mode: 'KATALOG',
  });
}

export async function assignTypeToTransformer(
  projectId: string,
  transformerId: string,
  typeId: string,
): Promise<void> {
  await executeDomainOp(projectId, 'assign_catalog_to_element', {
    element_ref: transformerId,
    catalog_binding: buildCatalogBinding('TRAFO_SN_NN', typeId),
    source_mode: 'KATALOG',
  });
}

export async function assignEquipmentTypeToSwitch(
  projectId: string,
  switchId: string,
  typeId: string,
  catalogNamespace: CatalogNamespace = 'APARAT_SN',
): Promise<void> {
  await executeDomainOp(projectId, 'assign_catalog_to_element', {
    element_ref: switchId,
    catalog_binding: buildCatalogBinding(catalogNamespace, typeId),
    source_mode: 'KATALOG',
  });
}

export async function clearTypeFromBranch(_projectId: string, _branchId: string): Promise<void> {
  throw new Error(DECATALOGING_BLOCKED_MESSAGE);
}

export async function clearTypeFromTransformer(
  _projectId: string,
  _transformerId: string,
): Promise<void> {
  throw new Error(DECATALOGING_BLOCKED_MESSAGE);
}

export async function clearEquipmentTypeFromSwitch(
  _projectId: string,
  _switchId: string,
): Promise<void> {
  throw new Error(DECATALOGING_BLOCKED_MESSAGE);
}

export async function exportTypeLibrary(params?: {
  library_name_pl?: string;
  vendor?: string;
  series?: string;
  revision?: string;
  description_pl?: string;
}): Promise<any> {
  const queryParams = new URLSearchParams();
  if (params?.library_name_pl) queryParams.set('library_name_pl', params.library_name_pl);
  if (params?.vendor) queryParams.set('vendor', params.vendor);
  if (params?.series) queryParams.set('series', params.series);
  if (params?.revision) queryParams.set('revision', params.revision);
  if (params?.description_pl) queryParams.set('description_pl', params.description_pl);

  const queryString = queryParams.toString();
  const endpoint = `/api/catalog/export${queryString ? `?${queryString}` : ''}`;
  return fetchCatalogJson<any>(endpoint);
}

export async function importTypeLibrary(
  data: any,
  mode: 'merge' | 'replace' = 'merge',
): Promise<any> {
  const endpoint = `/api/catalog/import?mode=${mode}`;
  return postCatalogJson<any>(endpoint, data);
}
