/**
 * Station Templates API client — K30-16 frontend integration.
 *
 * Wraps backend endpoints under `/api/station-templates/*` exposing 57
 * templates across 10 categories with fully editable schemas.
 */

const API_BASE = '/api/station-templates';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Błąd HTTP: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export interface CatalogChoice {
  catalog_ref: string;
  label_pl: string;
  namespace: string;
  default: boolean;
  badge_pl: string | null;
}

export interface TemplateParamInt {
  default: number;
  min_value: number;
  max_value: number;
  step: number;
  label_pl: string;
}

export interface TemplateParamFloat {
  default: number;
  min_value: number;
  max_value: number;
  step: number;
  unit: string;
  label_pl: string;
}

export interface BayRoleSpec {
  role: 'IN' | 'OUT' | 'TR' | 'MEASUREMENT' | 'COUPLER';
  label_pl: string;
  apparatus_options: readonly CatalogChoice[];
}

export interface DerKindSpec {
  kind: 'PV' | 'BESS' | 'FW';
  label_pl: string;
  catalog_options: readonly CatalogChoice[];
  default_count: number;
  default_p_mw_each: number;
  connection_variant_options: readonly string[];
}

export interface ProtectionRelaySpec {
  device_catalog_ref: string;
  label_pl: string;
  vendor: string;
  settings_template_id: string;
  badge_pl: string | null;
}

export interface TemplateSchema {
  transformer_options: readonly CatalogChoice[];
  transformer_count: TemplateParamInt;
  sn_switchgear_manufacturers: readonly string[];
  sn_switchgear_default: string;
  sn_bays_count: TemplateParamInt;
  sn_bay_roles: readonly BayRoleSpec[];
  sn_bay_protection_options: readonly ProtectionRelaySpec[];
  nn_feeders_count: TemplateParamInt;
  nn_feeder_cb_options: readonly CatalogChoice[];
  nn_load_default_kw: TemplateParamFloat;
  der_options: readonly DerKindSpec[];
  der_total_count: TemplateParamInt;
  protection_settings_default: string | null;
  ct_options: readonly CatalogChoice[];
  vt_options: readonly CatalogChoice[];
  energy_meter_options: readonly CatalogChoice[];
  manufacturer_profile_default: string;
}

export interface StationTemplateSummary {
  id: string;
  name_pl: string;
  category: string;
  description_pl: string;
  use_case_pl: string;
  nc_rfg_type: 'A' | 'B' | 'C' | 'D' | null;
  tags: readonly string[];
  icon: string;
}

export interface StationTemplateFull extends StationTemplateSummary {
  schema: TemplateSchema;
}

export interface CategoryEntry {
  id: string;
  label_pl: string;
  icon: string;
  description_pl: string;
  template_count: number;
}

export interface CategoriesResponse {
  categories: readonly CategoryEntry[];
  total_templates: number;
}

export interface ListResponse {
  templates: readonly StationTemplateSummary[];
  total: number;
}

export async function fetchStationTemplates(category?: string): Promise<ListResponse> {
  const url = category
    ? `${API_BASE}?category=${encodeURIComponent(category)}`
    : API_BASE;
  const response = await fetch(url);
  return handleResponse<ListResponse>(response);
}

export async function fetchStationTemplateCategories(): Promise<CategoriesResponse> {
  const response = await fetch(`${API_BASE}/categories`);
  return handleResponse<CategoriesResponse>(response);
}

export async function fetchStationTemplate(templateId: string): Promise<StationTemplateFull> {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(templateId)}`);
  return handleResponse<StationTemplateFull>(response);
}
