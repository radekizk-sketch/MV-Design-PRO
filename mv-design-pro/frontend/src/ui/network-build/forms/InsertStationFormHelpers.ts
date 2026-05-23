/**
 * InsertStationFormHelpers — pure utility functions wyekstraktowane z
 * InsertStationForm.tsx (Sprint Etap 4 decompose).
 *
 * Eliminacja monolitu: 47 funkcji w 2311 LOC pliku zmniejszone o 13 pure
 * funkcji + 2 stałe = ~150 LOC. Następne ekstrakcje (UI sub-components,
 * effects, state) wymagają osobnych sprintów.
 *
 * Wszystkie funkcje pure (bez side-effects, deterministyczne).
 */

import type {
  BayKind,
  CompleteMvBayTemplateSummary,
} from '../../catalog/BayTemplatePicker';
import type { Manufacturer } from '../../catalog/manufacturer';
import type { SwitchgearFamily } from '../../catalog/SwitchgearFamilyPicker';
import type { ConverterType, TransformerType } from '../../catalog/types';
import type { Substation } from '../../../types/enm';

export type SnFieldRole = 'LINIA_IN' | 'LINIA_OUT' | 'LINIA_ODG' | 'TRANSFORMATOROWE' | 'SPRZEGLO';

// Constants
export const SWITCHGEAR_MANUFACTURER_ORDER = [
  'ZPUE_WLOSZCZOWA',
  'ELEKTROMETAL',
  'SIEMENS',
  'ABB',
];

export const FIELD_ROLE_LABELS: Readonly<Record<string, string>> = {
  LINIA_IN: 'Pole liniowe wejściowe',
  LINIA_OUT: 'Pole liniowe wyjściowe',
  LINIA_ODG: 'Pole odgałęźne',
  TRANSFORMATOROWE: 'Pole transformatorowe',
  SPRZEGLO: 'Pole sprzęgłowe',
};

export const SOURCE_STATUS_LABEL_PL: Readonly<Record<CompleteMvBayTemplateSummary['source_status'], string>> = {
  official_catalog: 'pakiet katalogowy',
  repo_verified: 'pakiet katalogowy',
  user_defined: 'pakiet użytkownika',
  canonical_fallback: 'poza konfiguracją projektową',
  requires_catalog: 'poza konfiguracją projektową',
  incomplete_requires_review: 'poza konfiguracją projektową',
};

// Pure helpers - station
export function stationRef(station: Substation): string {
  return station.ref_id || station.id;
}

export function stationPublicName(station: Substation, fallbackName: string): string {
  return station.name?.trim() || fallbackName;
}

// Pure helpers - bay templates
export function sourceStatusRank(status: CompleteMvBayTemplateSummary['source_status']): number {
  switch (status) {
    case 'official_catalog':
      return 0;
    case 'repo_verified':
      return 1;
    case 'user_defined':
      return 2;
    case 'canonical_fallback':
      return 3;
    case 'incomplete_requires_review':
      return 4;
    case 'requires_catalog':
    default:
      return 5;
  }
}

export function isCompleteSourceStatus(status: CompleteMvBayTemplateSummary['source_status']): boolean {
  return (
    status === 'official_catalog'
    || status === 'repo_verified'
    || status === 'user_defined'
  );
}

export function isCompleteBayTemplate(template: CompleteMvBayTemplateSummary): boolean {
  return isCompleteSourceStatus(template.source_status);
}

export function compareBayTemplateOptions(
  left: CompleteMvBayTemplateSummary,
  right: CompleteMvBayTemplateSummary,
): number {
  return sourceStatusRank(left.source_status) - sourceStatusRank(right.source_status)
    || left.template_ref.localeCompare(right.template_ref, 'pl-PL');
}

export function bayKindLabel(kind: BayKind): string {
  switch (kind) {
    case 'liniowe_doplywowe':
      return 'Pole liniowe wejściowe';
    case 'liniowe_odplywowe':
      return 'Pole liniowe wyjściowe';
    case 'transformatorowe':
      return 'Pole transformatorowe';
    case 'sprzeglowe_poprzeczne':
    case 'sprzeglowe_podluzne':
      return 'Pole sprzęgłowe';
    case 'pomiarowe':
      return 'Pole pomiarowe';
    case 'pv':
      return 'Pole przyłączeniowe PV';
    case 'bess':
      return 'Pole przyłączeniowe BESS';
    case 'fw':
      return 'Pole przyłączeniowe FW';
    default:
      return 'Pole SN';
  }
}

export function templateOptionLabel(template: CompleteMvBayTemplateSummary, role?: SnFieldRole): string {
  const roleLabel = role ? FIELD_ROLE_LABELS[role] : null;
  return `${roleLabel ?? bayKindLabel(template.bay_kind)} · ${SOURCE_STATUS_LABEL_PL[template.source_status]}`;
}

// Pure helpers - manufacturers
export function orderManufacturers(manufacturers: Manufacturer[]): Manufacturer[] {
  const byRef = new Map(manufacturers.map((manufacturer) => [manufacturer.manufacturer_ref, manufacturer]));
  const ordered = SWITCHGEAR_MANUFACTURER_ORDER
    .map((ref) => byRef.get(ref))
    .filter((manufacturer): manufacturer is Manufacturer => Boolean(manufacturer));
  const rest = manufacturers
    .filter((manufacturer) => !SWITCHGEAR_MANUFACTURER_ORDER.includes(manufacturer.manufacturer_ref))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl-PL'));
  return [...ordered, ...rest];
}

export function isUsableManufacturer(manufacturer: Manufacturer): boolean {
  return (
    (manufacturer.status === 'verified' && manufacturer.source_refs.length > 0)
    || manufacturer.status === 'user_defined'
  );
}

export function isUsableSwitchgearFamily(family: SwitchgearFamily): boolean {
  return (
    (family.status === 'verified' && family.source_refs.length > 0)
    || family.status === 'user_defined'
  );
}

// Pure helpers - transformers
const MAX_STATION_NN_SOURCE_VOLTAGE_KV = 1.0;

export function isStationNnSourceConverter(type: ConverterType): boolean {
  return (
    typeof type.un_kv === 'number'
    && Number.isFinite(type.un_kv)
    && type.un_kv > 0
    && type.un_kv <= MAX_STATION_NN_SOURCE_VOLTAGE_KV
  );
}

export function hasEnoughTransformerPower(
  type: TransformerType,
  sourcePowerMva: number | null,
): boolean {
  if (sourcePowerMva === null || sourcePowerMva <= 0) return true;
  return (type.rated_power_mva ?? 0) >= sourcePowerMva;
}

// Pure helpers - voltage
export function voltageMatches(
  left: number | null | undefined,
  right: number | null | undefined,
  toleranceKv = 0.5,
): boolean {
  return (
    typeof left === 'number'
    && Number.isFinite(left)
    && typeof right === 'number'
    && Number.isFinite(right)
    && Math.abs(left - right) <= toleranceKv
  );
}

// Pure helpers - feeder count (clamp 1..8 per InsertStationForm constraint)
export function clampOutgoingFeederCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(8, Math.trunc(value)));
}

// Pure helpers - formatters (pl-PL locale per UX standard)
export function formatKv(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toLocaleString('pl-PL', { maximumFractionDigits: 3 });
}

export function formatMva(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toLocaleString('pl-PL', { maximumFractionDigits: 3 });
}

// Pure helpers - catalog refs (Sprint Etap 4 decompose - druga fala)
export function catalogItemIdFromRef(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed.includes('/')) return trimmed;
  const parts = trimmed.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : trimmed;
}

export function findTransformerByCatalogRef(
  types: TransformerType[],
  catalogRef: string,
): TransformerType | null {
  const itemId = catalogItemIdFromRef(catalogRef);
  return types.find((type) => type.id === itemId || type.id === catalogRef) ?? null;
}

// Pure helpers - NN configuration
export type NnConfiguration = 'LOAD_NN' | 'CUSTOM_NN' | 'PV_INVERTER' | 'BESS_INVERTER' | 'FW_INVERTER';
export type NnFeederRole = 'ZRODLO_NN_PV' | 'ZRODLO_NN_BESS' | 'ZRODLO_NN_FW';

export function sourceFeederRole(configuration: NnConfiguration): NnFeederRole | null {
  switch (configuration) {
    case 'PV_INVERTER':
      return 'ZRODLO_NN_PV';
    case 'BESS_INVERTER':
      return 'ZRODLO_NN_BESS';
    case 'FW_INVERTER':
      return 'ZRODLO_NN_FW';
    case 'LOAD_NN':
    case 'CUSTOM_NN':
    default:
      return null;
  }
}

// Pure helpers - comparators
export const DEFAULT_RECEIVER_NN_VOLTAGE_KV = 0.4;

export function compareStationNnSourceConverters(
  left: ConverterType,
  right: ConverterType,
): number {
  const leftDistance = Math.abs(left.un_kv - DEFAULT_RECEIVER_NN_VOLTAGE_KV);
  const rightDistance = Math.abs(right.un_kv - DEFAULT_RECEIVER_NN_VOLTAGE_KV);
  if (leftDistance !== rightDistance) return leftDistance - rightDistance;
  return left.name.localeCompare(right.name, 'pl-PL') || left.id.localeCompare(right.id);
}

export function compareTransformersForSourcePower(sourcePowerMva: number | null) {
  return (left: TransformerType, right: TransformerType): number => {
    if (sourcePowerMva != null) {
      const leftEnough = hasEnoughTransformerPower(left, sourcePowerMva);
      const rightEnough = hasEnoughTransformerPower(right, sourcePowerMva);
      if (leftEnough !== rightEnough) return leftEnough ? -1 : 1;
    }
    return left.rated_power_mva - right.rated_power_mva
      || left.name.localeCompare(right.name, 'pl-PL')
      || left.id.localeCompare(right.id);
  };
}

// Pure helpers - station kind + scope descriptions (Sprint Etap 4 - trzecia fala)
export type TopologicalStationKind = 'terminal' | 'inline' | 'branch' | 'sectional';

export function describeConfigurationScope(
  stationKind: TopologicalStationKind,
  nnConfiguration: NnConfiguration,
): string {
  const stationScope: Record<TopologicalStationKind, string> = {
    terminal: 'WE + TR + nN',
    inline: 'WE + WY + TR + nN',
    branch: 'WE + WY + ODG + TR + nN',
    sectional: 'sekcje SN + TR + nN',
  };
  const sourceScope: Record<NnConfiguration, string> = {
    LOAD_NN: 'odbiorcza',
    PV_INVERTER: 'PV',
    BESS_INVERTER: 'BESS',
    FW_INVERTER: 'FW',
    CUSTOM_NN: 'nN niestandardowe',
  };
  return `${stationScope[stationKind]} · ${sourceScope[nnConfiguration]}`;
}

export interface SourceProtectionIntent {
  breaker_role: string;
  device_catalog_ref: string;
  device_label: string;
  protected_object: string;
  analysis_scope: string;
}

export function sourceProtectionIntent(
  configuration: NnConfiguration,
): SourceProtectionIntent | undefined {
  if (configuration !== 'PV_INVERTER') return undefined;
  return {
    breaker_role: 'wyłącznik nN źródła PV',
    device_catalog_ref: 'EM_ETANGO_400_V0',
    device_label: 'Elektrometal e2TANGO-400',
    protected_object: 'falownik PV i kabel nN do PCC',
    analysis_scope: 'nadprądowe, ziemnozwarciowe i koordynacja z wyłącznikiem głównym nN',
  };
}

export function switchgearStatusLabel(manufacturer: Manufacturer | null): string {
  if (!manufacturer) return 'wybierz pakiet rozdzielnicy';
  if (manufacturer.status === 'verified' && manufacturer.source_refs.length > 0) return 'pakiet katalogowy';
  if (manufacturer.status === 'user_defined') return 'pakiet użytkownika';
  if (manufacturer.status === 'deprecated') return 'wycofany';
  return 'niedostępny w konfiguratorze';
}

export function stationNameFromData(data: { name: string; ref_id: string }): string | undefined {
  const name = data.name.trim();
  const refId = data.ref_id.trim();
  return name || refId || undefined;
}
