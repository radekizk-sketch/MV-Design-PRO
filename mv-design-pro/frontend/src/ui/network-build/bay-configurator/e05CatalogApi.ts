/**
 * E05 — kontrakt odczytu istniejącego katalogu OEM.
 * Nie definiuje rodzin, pól ani aparatów; GET /api/catalog/* jest właścicielem danych.
 * Porażka HTTP lub błędny kształt odpowiedzi jest stanem błędu, bez lokalnego fallbacku.
 */
export interface E05SwitchgearFamily {
  readonly switchgear_family_ref: string;
  readonly manufacturer_ref: string;
  readonly family_name: string;
  readonly status: string;
  readonly tor_konfiguracji: 'MODULARNY' | 'BLOK_RMU' | null;
  readonly network_voltages_kv: readonly number[];
  readonly um_classes_kv: readonly number[];
  readonly source_refs: readonly string[];
  readonly source_version?: string | null;
}
export interface E05BayTemplate {
  readonly template_ref: string;
  readonly template_name_pl: string | null;
  readonly template_code: string | null;
  readonly manufacturer_ref: string | null;
  readonly switchgear_family_ref: string | null;
  readonly bay_kind: string;
  readonly bay_role: string;
  readonly source_status: string;
  readonly source_refs: readonly string[];
  readonly version: string;
  readonly device_instances: readonly Record<string, unknown>[];
  readonly port_definitions: readonly Record<string, unknown>[];
  readonly protection_requirements: readonly string[];
  readonly measurement_requirements: readonly string[];
}
export interface E05FactoryConfiguration {
  readonly configuration_ref: string;
  readonly switchgear_family_ref: string;
  readonly code: string;
  readonly name_pl: string;
  readonly total_width_mm: number | null;
  readonly units: readonly { readonly unit_code: string; readonly unit_name_pl: string; readonly bay_kind: string }[];
  readonly source_refs: readonly string[];
}
export interface E05CatalogSnapshot {
  readonly families: readonly E05SwitchgearFamily[];
  readonly templates: readonly E05BayTemplate[];
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Nieprawidłowa struktura odpowiedzi katalogu producenta.');
  }
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Brak wymaganego identyfikatora katalogowego.');
  return value;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new Error('Nieprawidłowa lista źródeł katalogowych.');
  }
  return value;
}
function numbers(value: unknown): number[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error('Nieprawidłowe wartości znamionowe katalogu.');
  }
  return value;
}
function objectList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Nieprawidłowy wykaz wyposażenia katalogowego.');
  return value.map(record);
}
function family(raw: unknown): E05SwitchgearFamily {
  const r = record(raw);
  const mode = r.tor_konfiguracji;
  if (mode !== null && mode !== 'MODULARNY' && mode !== 'BLOK_RMU') {
    throw new Error('Nieznany tor konfiguracji rozdzielnicy.');
  }
  return {
    switchgear_family_ref: text(r.switchgear_family_ref),
    manufacturer_ref: text(r.manufacturer_ref),
    family_name: text(r.family_name),
    status: text(r.status),
    tor_konfiguracji: mode,
    network_voltages_kv: numbers(r.network_voltages_kv),
    um_classes_kv: numbers(r.um_classes_kv),
    source_refs: strings(r.source_refs),
    source_version: typeof r.source_version === 'string' ? r.source_version : null,
  };
}
function template(raw: unknown): E05BayTemplate {
  const r = record(raw);
  return {
    template_ref: text(r.template_ref),
    template_name_pl: typeof r.template_name_pl === 'string' ? r.template_name_pl : null,
    template_code: typeof r.template_code === 'string' ? r.template_code : null,
    manufacturer_ref: typeof r.manufacturer_ref === 'string' ? r.manufacturer_ref : null,
    switchgear_family_ref: typeof r.switchgear_family_ref === 'string' ? r.switchgear_family_ref : null,
    bay_kind: text(r.bay_kind),
    bay_role: text(r.bay_role),
    source_status: text(r.source_status),
    source_refs: strings(r.source_refs),
    version: text(r.version),
    device_instances: objectList(r.device_instances),
    port_definitions: objectList(r.port_definitions),
    protection_requirements: strings(r.protection_requirements),
    measurement_requirements: strings(r.measurement_requirements),
  };
}
function factory(raw: unknown): E05FactoryConfiguration {
  const r = record(raw);
  const units = objectList(r.units).map((unit) => ({
    unit_code: text(unit.unit_code),
    unit_name_pl: text(unit.unit_name_pl),
    bay_kind: text(unit.bay_kind),
  }));
  const width = r.total_width_mm;
  if (width !== null && (typeof width !== 'number' || !Number.isFinite(width))) {
    throw new Error('Nieprawidłowa szerokość bloku RMU.');
  }
  return {
    configuration_ref: text(r.configuration_ref),
    switchgear_family_ref: text(r.switchgear_family_ref),
    code: text(r.code),
    name_pl: text(r.name_pl),
    total_width_mm: width,
    units,
    source_refs: strings(r.source_refs),
  };
}
async function jsonArray(path: string, signal?: AbortSignal): Promise<unknown[]> {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Katalog OEM: HTTP ${response.status} (${path}).`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error('Katalog OEM nie zwrócił listy rekordów.');
  return data;
}
export async function fetchE05Catalog(signal?: AbortSignal): Promise<E05CatalogSnapshot> {
  const [families, templates] = await Promise.all([
    jsonArray('/api/catalog/switchgear-families', signal),
    jsonArray('/api/catalog/complete-bay-templates', signal),
  ]);
  return { families: families.map(family), templates: templates.map(template) };
}
export async function fetchE05FactoryConfigurations(
  familyRef: string, signal?: AbortSignal,
): Promise<readonly E05FactoryConfiguration[]> {
  return (await jsonArray(
    `/api/catalog/switchgear-families/${encodeURIComponent(familyRef)}/factory-configurations`, signal,
  )).map(factory);
}
/** Prezentacja katalogu nie jest autoryzacją zapisu; walidator domenowy pozostaje obowiązkowy. */
export function isE05CatalogEligible(
  familyValue: E05SwitchgearFamily | undefined,
  templateValue: E05BayTemplate | undefined,
): boolean {
  return Boolean(
    familyValue && templateValue
    && (familyValue.status === 'verified' || familyValue.status === 'repo_verified')
    && familyValue.source_refs.length > 0
    && (templateValue.source_status === 'official_catalog' || templateValue.source_status === 'repo_verified')
    && templateValue.source_refs.length > 0
    && templateValue.switchgear_family_ref === familyValue.switchgear_family_ref,
  );
}
