/**
 * AddDerWizard — guided 5-step flow dodawania PV/BESS/FW ze stacji.
 *
 * Przepływ:
 *  Krok 1: Wybór wariantu przyłączenia (SN / nN / transformator dedykowany).
 *  Krok 2: Wybór punktu przyłączenia (existing/new) — kontekstowy katalog.
 *  Krok 3: Wybór urządzenia z katalogu (falownik PV / PCS BESS / turbina FW).
 *  Krok 4: Wybór profilu NC RfG + krzywych LVRT/HVRT (zgodnie z operatorem).
 *  Krok 5: Review & Create — lista obiektów + przycisk "Utwórz".
 *
 * Zasady:
 *  - Każdy wybór ma catalog_ref. Custom value tylko jako pozycja katalogowa
 *    użytkownika (Faza H — out of MVP wizard, ale reguła zachowana).
 *  - Anulowanie w dowolnym kroku usuwa szkic — nie ma pół-obiektów.
 *  - Po Create: attachDer w useStationDerStore + zamknięcie modal'a.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../app-state';
import { fetchDerConverterTypes } from '../../catalog/api';
import type { ConverterType } from '../../catalog/types';
import { notify } from '../../notifications/store';
import {
  DerPersistenceApiError,
  postDerGeneratorConfig,
  type DerConnectionVariant,
  type NcRfgModule,
} from '../../sld/v2/canvas/derPersistenceApi';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useAudit2CatalogSnapshot } from './audit2-hooks';
import { generateDeterministicDerId, validateWizardSelections } from './wizard-validation';
import {
  BESS_BATTERY_CATALOG,
  BESS_PCS_CATALOG,
  HVRT_CURVE_CATALOG,
  LV_VOLTAGE_LEVEL_CATALOG,
  LVRT_CURVE_CATALOG,
  NC_RFG_PROFILE_CATALOG,
  PF_CURVE_CATALOG,
  PV_INVERTER_CATALOG,
  WIND_TURBINE_CATALOG,
  getBlockTransformer,
  selectBessModesForPcs,
  selectBlockTransformersForDer,
  selectConnectionVariantsForKind,
  selectHvrtCurvesForProfile,
  selectLvrtCurvesForProfile,
} from './catalogs';
import {
  PTPIREE_CERTIFIED_INVERTERS,
  loadPtpireeCertifiedInverters,
  type PtpireeCertifiedInverterItem,
} from './ptpireeCertifiedInverters';
import { useStationDerStore } from './store';
import type { ConnectionSide, DerKindUnified } from './types';
import { HelpTooltip } from '../../shared/HelpTooltip';
import { getTooltip } from '../../shared/engineerTooltips';

export interface AddDerWizardProps {
  readonly isOpen: boolean;
  readonly stationId: string | null;
  readonly stationName: string;
  readonly derKind: DerKindUnified;
  readonly projectId: string;
  readonly onClose: () => void;
  /** Override zegara dla testów (deterministyczne created_at). */
  readonly nowIso?: string;
}

type StepId = 'variant' | 'point' | 'device' | 'profile' | 'review';

type DerDeviceCatalogItem = {
  readonly id: string;
  readonly label_pl: string;
  readonly nominal_power_kw: number;
  readonly nominal_voltage_kv?: number;
  readonly catalog_source?: 'backend' | 'local';
  readonly catalog_kind?: 'PV' | 'BESS' | 'WIND';
  readonly manufacturer?: string | null;
  readonly model?: string | null;
  readonly s_n_kva?: number | null;
  readonly qmin_mvar?: number | null;
  readonly qmax_mvar?: number | null;
  readonly cosphi_min?: number | null;
  readonly cosphi_max?: number | null;
  readonly e_kwh?: number | null;
  readonly control_mode?: string | null;
  readonly grid_code?: string | null;
  readonly dynamic_profile_id?: string | null;
  readonly ptpiree_status?: string | null;
  readonly ptpiree_certificate_ref?: string | null;
  readonly ptpiree_document_number?: string | null;
  readonly ptpiree_document_acceptance_date?: string | null;
  readonly ptpiree_wos_version?: string | null;
  readonly ptpiree_wipwc_version?: string | null;
  readonly ptpiree_ppm_scope?: string | null;
  readonly source_reference?: string | null;
  readonly verification_status?: string | null;
  readonly catalog_status?: string | null;
  readonly fault_current_capability_pu?: number;
  readonly applicable_module_types?: readonly ('A' | 'B' | 'C' | 'D')[];
  readonly four_quadrant?: boolean;
  readonly grid_forming_capable?: boolean;
};

type StationTransformerInfo = {
  readonly ref: string;
  readonly name: string;
  readonly snMva: number;
  readonly hvKv: number | null;
  readonly lvKv: number | null;
};

type StationTransformerCatalogItem = {
  readonly id: string;
  readonly label_pl: string;
  readonly sn_mva: number;
  readonly hv_kv: number;
  readonly lv_kv: number;
};

const STEP_LABELS: Record<StepId, string> = {
  variant: '1 · Wariant przyłączenia',
  point: '2 · Punkt przyłączenia',
  device: '3 · Urządzenie z katalogu',
  profile: '4 · Profil NC RfG i krzywe',
  review: '5 · Podsumowanie',
};

const STEPS: readonly StepId[] = ['variant', 'point', 'device', 'profile', 'review'];

const DER_KIND_LABELS: Record<DerKindUnified, string> = {
  PV: 'PV / FV',
  BESS: 'BESS (magazyn energii)',
  FW: 'Farma wiatrowa',
};

function toBackendConnectionVariant(connectionSide: ConnectionSide): DerConnectionVariant {
  return connectionSide === 'nN' ? 'nn_side' : 'dedicated';
}

function resolveBackendCatalogRef(
  derKind: DerKindUnified,
  connectionSide: ConnectionSide,
  deviceCatalogRef: string | null,
): string {
  if (deviceCatalogRef) return deviceCatalogRef;
  if (derKind === 'PV') {
    return connectionSide === 'nN' ? 'conv-pv-nn-0p5mw-0p4kv' : 'conv-pv-0.5mw-15kv';
  }
  if (derKind === 'BESS') {
    return connectionSide === 'nN'
      ? 'conv-bess-nn-0p5mw-0p4kv'
      : 'conv-bess-0.5mw-1mwh-15kv';
  }
  return connectionSide === 'nN' ? 'conv-wind-nn-2mw-0p4kv' : 'conv-wind-2mw-15kv';
}

function resolveNcRfgModule(selections: WizardSelections): NcRfgModule {
  const curve = LVRT_CURVE_CATALOG.find((entry) => entry.id === selections.lvrtCurveRef);
  return curve?.module_type ?? 'B';
}

function formatConnectionSideForReview(
  connectionSide: ConnectionSide | null,
  variants: ReturnType<typeof selectConnectionVariantsForKind>,
): string {
  if (!connectionSide) return '';
  return variants.find((variant) => variant.side === connectionSide)?.label_pl ?? connectionSide;
}

interface WizardSelections {
  connectionSide: ConnectionSide | null;
  voltageLevelRef: string | null;
  pccLabel: string;
  bayName: string;
  deviceCatalogRef: string | null;
  batteryCatalogRef: string | null;
  ncRfgProfileRef: string | null;
  lvrtCurveRef: string | null;
  hvrtCurveRef: string | null;
  derName: string;
  /** Naprawa eng.10: tryby pracy BESS (multi-select). */
  bessOperationModeRefs: readonly string[];
  /** Pakiet H: katalog transformatora dedykowanego dla dedicated_transformer. */
  blockTransformerCatalogRef: string | null;
  /** Pakiet H: krzywa P(f) — regulacja częstotliwości. */
  pfCurveRef: string | null;
}

const EMPTY_SELECTIONS: WizardSelections = {
  connectionSide: null,
  voltageLevelRef: null,
  pccLabel: '',
  bayName: '',
  deviceCatalogRef: null,
  batteryCatalogRef: null,
  ncRfgProfileRef: null,
  lvrtCurveRef: null,
  hvrtCurveRef: null,
  derName: '',
  bessOperationModeRefs: [],
  blockTransformerCatalogRef: null,
  pfCurveRef: null,
};

const DEFAULT_LV_VOLTAGE_LEVEL_REF = 'lv_0_4kV';
const DEFAULT_NC_RFG_PROFILE_REF = 'ncrfg_enea';

const STATION_TRANSFORMER_CATALOG: readonly StationTransformerCatalogItem[] = [
  { id: 'tr-sn-nn-15-04-63kva-dyn11', label_pl: 'TR SN/nN 15/0,4 kV 63 kVA Dyn11', sn_mva: 0.063, hv_kv: 15, lv_kv: 0.4 },
  { id: 'tr-sn-nn-15-04-100kva-dyn11', label_pl: 'TR SN/nN 15/0,4 kV 100 kVA Dyn11', sn_mva: 0.1, hv_kv: 15, lv_kv: 0.4 },
  { id: 'tr-sn-nn-15-04-160kva-dyn11', label_pl: 'TR SN/nN 15/0,4 kV 160 kVA Dyn11', sn_mva: 0.16, hv_kv: 15, lv_kv: 0.4 },
  { id: 'tr-sn-nn-15-04-250kva-dyn11', label_pl: 'TR SN/nN 15/0,4 kV 250 kVA Dyn11', sn_mva: 0.25, hv_kv: 15, lv_kv: 0.4 },
  { id: 'tr-sn-nn-15-04-400kva-dyn11', label_pl: 'TR SN/nN 15/0,4 kV 400 kVA Dyn11', sn_mva: 0.4, hv_kv: 15, lv_kv: 0.4 },
  { id: 'tr-sn-nn-15-04-630kva-dyn11', label_pl: 'TR SN/nN 15/0,4 kV 630 kVA Dyn11', sn_mva: 0.63, hv_kv: 15, lv_kv: 0.4 },
  { id: 'tr-sn-nn-15-04-1000kva-dyn11', label_pl: 'TR SN/nN 15/0,4 kV 1000 kVA Dyn11', sn_mva: 1, hv_kv: 15, lv_kv: 0.4 },
  { id: 'tr-sn-nn-15-04-1250kva-dyn11', label_pl: 'TR SN/nN 15/0,4 kV 1250 kVA Dyn11', sn_mva: 1.25, hv_kv: 15, lv_kv: 0.4 },
  { id: 'tr-sn-nn-15-04-1600kva-dyn11', label_pl: 'TR SN/nN 15/0,4 kV 1600 kVA Dyn11', sn_mva: 1.6, hv_kv: 15, lv_kv: 0.4 },
  { id: 'tr-sn-nn-15-04-2000kva-dyn11', label_pl: 'TR SN/nN 15/0,4 kV 2000 kVA Dyn11', sn_mva: 2, hv_kv: 15, lv_kv: 0.4 },
  { id: 'tr-sn-nn-15-04-2500kva-dyn11', label_pl: 'TR SN/nN 15/0,4 kV 2500 kVA Dyn11', sn_mva: 2.5, hv_kv: 15, lv_kv: 0.4 },
];

function stationToken(stationName: string): string {
  const numeric = stationName.match(/(\d+)(?!.*\d)/)?.[1];
  if (numeric) return `S${numeric.padStart(2, '0')}`;
  const normalized = stationName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
    .slice(0, 12);
  return normalized || 'S01';
}

function defaultDerName(derKind: DerKindUnified, stationName: string): string {
  return `${derKind} ${stationToken(stationName)}`;
}

function defaultPccLabel(derKind: DerKindUnified, stationName: string): string {
  return `PCC-${derKind}-${stationToken(stationName)}`;
}

function defaultConnectionPointLabel(
  connectionSide: ConnectionSide,
  derKind: DerKindUnified,
  stationName: string,
): string {
  const token = stationToken(stationName);
  if (connectionSide === 'at_zksn') return `ZK-SN-${token}`;
  if (connectionSide === 'at_branch_pole') return `SLUP-${token}-${derKind}`;
  if (connectionSide === 'at_cable_joint') return `MUFA-T-${token}-${derKind}`;
  return `Pole-${derKind}-${token}`;
}

function applyPointDefaults(
  selections: WizardSelections,
  connectionSide: ConnectionSide,
  derKind: DerKindUnified,
  stationName: string,
): WizardSelections {
  const next: WizardSelections = {
    ...selections,
    connectionSide,
    derName: selections.derName.trim() || defaultDerName(derKind, stationName),
    pccLabel: selections.pccLabel.trim() || defaultPccLabel(derKind, stationName),
  };
  if (connectionSide === 'nN') {
    next.voltageLevelRef = selections.voltageLevelRef ?? DEFAULT_LV_VOLTAGE_LEVEL_REF;
  }
  if (connectionSide === 'SN' || connectionSide === 'at_zksn'
      || connectionSide === 'at_branch_pole' || connectionSide === 'at_cable_joint') {
    next.bayName = selections.bayName.trim()
      || defaultConnectionPointLabel(connectionSide, derKind, stationName);
  }
  if (connectionSide === 'dedicated_transformer' && !selections.blockTransformerCatalogRef) {
    next.blockTransformerCatalogRef = selectBlockTransformersForDer({ derKind })[0]?.id ?? null;
  }
  return next;
}

function applyProfileDefaults(selections: WizardSelections): WizardSelections {
  if (selections.ncRfgProfileRef && selections.lvrtCurveRef && selections.hvrtCurveRef) {
    return selections;
  }
  const profile = NC_RFG_PROFILE_CATALOG.find((entry) => entry.id === DEFAULT_NC_RFG_PROFILE_REF)
    ?? NC_RFG_PROFILE_CATALOG[0];
  if (!profile) return selections;
  const lvrtCurveRef = selectLvrtCurvesForProfile(profile.id)[0]?.id ?? null;
  const hvrtCurveRef = selectHvrtCurvesForProfile(profile.id)[0]?.id ?? null;
  const pfCurveRef = PF_CURVE_CATALOG.find(
    (curve) => curve.operator_code === profile.operator_code,
  )?.id ?? null;
  return {
    ...selections,
    ncRfgProfileRef: profile.id,
    lvrtCurveRef,
    hvrtCurveRef,
    pfCurveRef,
  };
}

function readRefList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function readStationTransformers(snapshot: unknown, stationId: string | null): StationTransformerInfo[] {
  if (!snapshot || typeof snapshot !== 'object' || !stationId) return [];
  const model = snapshot as {
    readonly substations?: readonly Record<string, unknown>[];
    readonly transformers?: readonly Record<string, unknown>[];
    readonly generators?: readonly Record<string, unknown>[];
  };
  const station = model.substations?.find((candidate) =>
    candidate.ref_id === stationId || candidate.id === stationId);
  if (!station) return [];

  const transformerRefs = new Set(readRefList(station.transformer_refs));
  const busRefs = new Set(readRefList(station.bus_refs));
  const blockTransformerRefs = new Set(
    (model.generators ?? [])
      .map((generator) => generator.blocking_transformer_ref)
      .filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0),
  );

  const isStationDistributionTransformer = (transformer: Record<string, unknown>): boolean => {
    const ref = transformer.ref_id ?? transformer.id;
    if (typeof ref === 'string' && blockTransformerRefs.has(ref)) return false;

    const catalogBinding = transformer.catalog_binding as Record<string, unknown> | undefined;
    const meta = transformer.meta as Record<string, unknown> | undefined;
    const tokens = [
      transformer.name,
      transformer.role,
      transformer.transformer_role,
      transformer.connection_variant,
      catalogBinding?.catalog_namespace,
      catalogBinding?.catalog_item_id,
      meta?.role,
      meta?.transformer_role,
      meta?.connection_variant,
      meta?.solution_kind,
    ]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();

    return !/(^|[\s_-])(block|blokowy|blok|dedicated|dedykowany|der|pv|bess|fw)([\s_-]|$)/u.test(tokens);
  };

  const related = model.transformers?.filter((transformer) => {
    const ref = transformer.ref_id ?? transformer.id;
    if (!isStationDistributionTransformer(transformer)) return false;
    if (typeof ref === 'string' && transformerRefs.has(ref)) return true;
    if (transformerRefs.size > 0) return false;
    return (
      (typeof transformer.hv_bus_ref === 'string' && busRefs.has(transformer.hv_bus_ref))
      || (typeof transformer.lv_bus_ref === 'string' && busRefs.has(transformer.lv_bus_ref))
    );
  }) ?? [];

  return related.flatMap((transformer) => {
    const ref = transformer.ref_id ?? transformer.id;
    const snMva = transformer.sn_mva;
    if (typeof ref !== 'string' || typeof snMva !== 'number' || !Number.isFinite(snMva)) {
      return [];
    }
    return [{
      ref,
      name: typeof transformer.name === 'string' ? transformer.name : 'Transformator SN/nN',
      snMva,
      hvKv: typeof transformer.uhv_kv === 'number' ? transformer.uhv_kv : null,
      lvKv: typeof transformer.ulv_kv === 'number' ? transformer.ulv_kv : null,
    }];
  });
}

function readStationTransformerCapacityKw(transformers: readonly StationTransformerInfo[]): number | null {
  const totalMva = transformers.reduce((sum, transformer) => sum + transformer.snMva, 0);
  return totalMva > 0 ? totalMva * 1000 : null;
}

function formatKw(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 2)} MW` : `${Math.round(value)} kW`;
}

function formatKva(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 2)} MVA` : `${Math.round(value)} kVA`;
}

function formatMvar(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} MVAr` : '-';
}

function formatKv(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} kV` : '-';
}

function toConverterKind(derKind: DerKindUnified): ConverterType['kind'] {
  return derKind === 'FW' ? 'WIND' : derKind;
}

function deriveModuleTypesForPowerKw(powerKw: number): readonly ('A' | 'B' | 'C' | 'D')[] {
  if (powerKw <= 200) return ['A'];
  if (powerKw < 10_000) return ['B'];
  if (powerKw < 50_000) return ['C'];
  return ['D'];
}

function mapBackendConverterToDerDevice(item: ConverterType): DerDeviceCatalogItem {
  const pmaxMw = Number.isFinite(item.pmax_mw) ? item.pmax_mw : 0;
  const snMva = Number.isFinite(item.sn_mva) ? item.sn_mva : pmaxMw;
  const nominalPowerKw = Math.max(0, pmaxMw * 1000);
  const manufacturer = item.manufacturer ?? null;
  const model = item.model ?? null;
  return {
    id: item.id,
    label_pl: item.name || [manufacturer, model].filter(Boolean).join(' ') || item.id,
    nominal_power_kw: nominalPowerKw,
    nominal_voltage_kv: item.un_kv,
    catalog_source: 'backend',
    catalog_kind: item.kind === 'WIND' ? 'WIND' : item.kind === 'BESS' ? 'BESS' : 'PV',
    manufacturer,
    model,
    s_n_kva: snMva * 1000,
    qmin_mvar: item.qmin_mvar ?? null,
    qmax_mvar: item.qmax_mvar ?? null,
    cosphi_min: item.cosphi_min ?? null,
    cosphi_max: item.cosphi_max ?? null,
    e_kwh: item.e_kwh ?? null,
    control_mode: item.control_mode ?? null,
    grid_code: item.grid_code ?? null,
    dynamic_profile_id: item.dynamic_profile_id ?? null,
    ptpiree_status: item.ptpiree_status ?? null,
    ptpiree_certificate_ref: item.ptpiree_certificate_ref ?? null,
    ptpiree_document_number: item.ptpiree_document_number ?? null,
    ptpiree_document_acceptance_date: item.ptpiree_document_acceptance_date ?? null,
    ptpiree_wos_version: item.ptpiree_wos_version ?? null,
    ptpiree_wipwc_version: item.ptpiree_wipwc_version ?? null,
    ptpiree_ppm_scope: item.ptpiree_ppm_scope ?? null,
    source_reference: item.source_reference ?? null,
    verification_status: item.verification_status ?? null,
    catalog_status: item.catalog_status ?? null,
    fault_current_capability_pu: item.kind === 'BESS' ? 1.2 : item.kind === 'WIND' ? 1.1 : 1.1,
    applicable_module_types: deriveModuleTypesForPowerKw(nominalPowerKw),
    four_quadrant: item.kind === 'BESS',
    grid_forming_capable: item.control_mode === 'GRID_FORMING',
  };
}

function normalizeLocalDerDevice(
  item: DerDeviceCatalogItem,
  derKind: DerKindUnified,
): DerDeviceCatalogItem {
  return {
    ...item,
    catalog_source: 'local',
    catalog_kind: toConverterKind(derKind) === 'WIND' ? 'WIND' : toConverterKind(derKind),
    applicable_module_types: item.applicable_module_types
      ?? deriveModuleTypesForPowerKw(item.nominal_power_kw),
  };
}

function deviceSearchHaystack(device: DerDeviceCatalogItem): string {
  return [
    device.id,
    device.label_pl,
    device.manufacturer,
    device.model,
    device.control_mode,
    device.grid_code,
    device.dynamic_profile_id,
    device.ptpiree_document_number,
    device.ptpiree_certificate_ref,
    device.ptpiree_wipwc_version,
    device.ptpiree_ppm_scope,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function deviceFourQuadrantCapable(device: DerDeviceCatalogItem | null): boolean {
  return device?.four_quadrant ?? device?.catalog_kind === 'BESS';
}

function deviceGridFormingCapable(device: DerDeviceCatalogItem | null): boolean {
  return device?.grid_forming_capable ?? device?.control_mode === 'GRID_FORMING';
}

function resolvePtpireeDocument(
  device: DerDeviceCatalogItem | null,
  fallback: PtpireeCertifiedInverterItem | null,
): string {
  return device?.ptpiree_document_number
    ?? device?.ptpiree_certificate_ref
    ?? fallback?.documentNumber
    ?? '-';
}

function requiredTransformerKvaForDerPowerKw(powerKw: number): number {
  return powerKw / 0.9;
}

function compactCatalogText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function findPtpireeCertificateForDevice(
  device: DerDeviceCatalogItem,
  registry: readonly PtpireeCertifiedInverterItem[],
): PtpireeCertifiedInverterItem | null {
  const label = compactCatalogText(device.label_pl);
  if (!label) return null;
  return registry.find((item) => {
    const manufacturer = compactCatalogText(item.manufacturer);
    const model = compactCatalogText(item.model);
    return (
      (manufacturer.length > 2 && label.includes(manufacturer)) ||
      (model.length > 2 && label.includes(model))
    );
  }) ?? null;
}

function getDeviceNominalVoltageKv(device: unknown): number | null {
  if (!device || typeof device !== 'object') return null;
  const value = (device as { nominal_voltage_kv?: unknown }).nominal_voltage_kv;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fitsStationTransformerCapacity(
  device: DerDeviceCatalogItem,
  connectionSide: ConnectionSide | null,
  transformerCapacityKw: number | null,
): boolean {
  if (connectionSide !== 'nN' || transformerCapacityKw === null) return true;
  return requiredTransformerKvaForDerPowerKw(device.nominal_power_kw) <= transformerCapacityKw + 1e-6;
}

function fitsSelectedLvVoltage(
  device: DerDeviceCatalogItem,
  connectionSide: ConnectionSide | null,
  voltageLevelRef: string | null,
): boolean {
  if (connectionSide !== 'nN' || !voltageLevelRef) return true;
  const deviceKv = getDeviceNominalVoltageKv(device);
  if (deviceKv === null) return true;
  const lvLevel = LV_VOLTAGE_LEVEL_CATALOG.find((l) => l.id === voltageLevelRef);
  return !lvLevel || Math.abs(deviceKv - lvLevel.nominal_kv) <= 0.01;
}

function selectTransformerUpgradeOptions(
  requiredTransformerKva: number | null,
  currentTransformer: StationTransformerInfo | null,
): StationTransformerCatalogItem[] {
  if (!currentTransformer || requiredTransformerKva === null) return [];
  const currentMva = currentTransformer.snMva;
  const hvKv = currentTransformer.hvKv ?? 15;
  const lvKv = currentTransformer.lvKv ?? 0.4;
  return STATION_TRANSFORMER_CATALOG.filter((item) =>
    item.sn_mva > currentMva + 1e-9
    && item.sn_mva * 1000 >= requiredTransformerKva - 1e-6
    && Math.abs(item.hv_kv - hvKv) <= 0.5
    && Math.abs(item.lv_kv - lvKv) <= 0.05);
}

function selectAutoBlockTransformerForDevice(
  derKind: DerKindUnified,
  device: DerDeviceCatalogItem | null,
  stationTransformer: StationTransformerInfo | null,
) {
  const deviceKv = getDeviceNominalVoltageKv(device);
  if (!device || deviceKv === null) return null;
  const hvKv = stationTransformer?.hvKv ?? 15;
  // DER musi zachować możliwość pracy z mocą bierną zgodnie z profilem NC RfG.
  // Dla automatycznego doboru przyjmujemy minimalny cosφ=0,90, więc PV 1000 kW
  // wymaga co najmniej 1111 kVA i dobiera 1250 kVA z typoszeregu, nie 2500 kVA.
  const requiredTransformerKva = requiredTransformerKvaForDerPowerKw(device.nominal_power_kw);
  const candidates = selectBlockTransformersForDer({
    derKind,
    hvKv,
    lvKv: deviceKv,
  })
    .filter((transformer) => transformer.sn_kva >= requiredTransformerKva - 1e-6)
    .sort((a, b) => a.sn_kva - b.sn_kva);
  return candidates[0] ?? null;
}

export function AddDerWizard(props: AddDerWizardProps): JSX.Element | null {
  const { isOpen, stationId, stationName, derKind, projectId, onClose, nowIso } = props;
  const attachDer = useStationDerStore((state) => state.attachDer);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const snapshotCaseId = useSnapshotStore((state) => state.caseId);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const setSnapshot = useSnapshotStore((state) => state.setSnapshot);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const [step, setStep] = useState<StepId>('variant');
  const [selections, setSelections] = useState<WizardSelections>(EMPTY_SELECTIONS);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTransformerUpgradeRef, setSelectedTransformerUpgradeRef] = useState('');
  const [isUpdatingTransformer, setIsUpdatingTransformer] = useState(false);
  const [ptpireeRegistry, setPtpireeRegistry] = useState(PTPIREE_CERTIFIED_INVERTERS);
  const [backendDeviceCatalog, setBackendDeviceCatalog] =
    useState<DerDeviceCatalogItem[] | null>(null);
  const [deviceCatalogStatus, setDeviceCatalogStatus] =
    useState<'fallback' | 'loading' | 'backend' | 'error'>('fallback');
  const [deviceCatalogError, setDeviceCatalogError] = useState<string | null>(null);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deviceVoltageFilter, setDeviceVoltageFilter] = useState('all');
  const [deviceModeFilter, setDeviceModeFilter] = useState('all');
  // Phase 9: pre-fetch backend catalog snapshot — lokalne staticki sluzą jako
  // fallback, ale snapshot z backendu warm-cache'uje React Query dla stations
  // pobierajacych je dalej. Hook sam zarzadza cache'em i refetch'em.
  useAudit2CatalogSnapshot();

  useEffect(() => {
    let active = true;
    void loadPtpireeCertifiedInverters()
      .then((registry) => {
        if (active) setPtpireeRegistry(registry);
      })
      .catch(() => {
        if (active) setPtpireeRegistry(PTPIREE_CERTIFIED_INVERTERS);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    let active = true;
    setDeviceCatalogStatus('loading');
    setDeviceCatalogError(null);
    void fetchDerConverterTypes(toConverterKind(derKind))
      .then((records) => {
        if (!active) return;
        if (!Array.isArray(records)) {
          throw new Error('Backend nie zwrócił listy konwerterów DER.');
        }
        const mapped = records
          .map(mapBackendConverterToDerDevice)
          .filter((device) => device.nominal_power_kw > 0);
        if (mapped.length === 0) {
          throw new Error('Katalog konwerterów nie zawiera pozycji dla wybranego typu DER.');
        }
        setBackendDeviceCatalog(mapped);
        setDeviceCatalogStatus('backend');
      })
      .catch((error) => {
        if (!active) return;
        setBackendDeviceCatalog(null);
        setDeviceCatalogStatus('error');
        setDeviceCatalogError(
          error instanceof Error
            ? error.message
            : 'Nie udało się pobrać katalogu konwerterów DER.',
        );
      });
    return () => {
      active = false;
    };
  }, [derKind, isOpen]);

  // Reset stanu kreatora przy każdym otwarciu.
  useEffect(() => {
    if (isOpen) {
      setStep('variant');
      setSelections({ ...EMPTY_SELECTIONS });
      setDeviceSearch('');
      setDeviceVoltageFilter('all');
      setDeviceModeFilter('all');
    }
  }, [isOpen, derKind]);

  // Naprawa hmi.11: reset stanu również przy zamknięciu, aby uniknąć
  // wycieku poprzednich selekcji do następnego otwarcia (np. innym DER).
  const handleClose = useCallback(() => {
    setStep('variant');
    setSelections({ ...EMPTY_SELECTIONS });
    setDeviceSearch('');
    setDeviceVoltageFilter('all');
    setDeviceModeFilter('all');
    onClose();
  }, [onClose]);

  const variants = useMemo(() => selectConnectionVariantsForKind(derKind), [derKind]);

  const stationBelongsToSnapshot = useMemo(() => {
    if (!snapshot || !stationId) return false;
    return (snapshot.substations ?? []).some(
      (station) => station.ref_id === stationId || station.id === stationId,
    );
  }, [snapshot, stationId]);

  const effectiveCaseId = stationBelongsToSnapshot && snapshotCaseId
    ? snapshotCaseId
    : activeCaseId;

  const lvrtCurves = useMemo(() =>
    selections.ncRfgProfileRef ? selectLvrtCurvesForProfile(selections.ncRfgProfileRef) : [],
  [selections.ncRfgProfileRef]);

  const hvrtCurves = useMemo(() =>
    selections.ncRfgProfileRef ? selectHvrtCurvesForProfile(selections.ncRfgProfileRef) : [],
  [selections.ncRfgProfileRef]);

  const fallbackDeviceCatalog = useMemo<readonly DerDeviceCatalogItem[]>(() => {
    const localCatalog =
      derKind === 'PV' ? PV_INVERTER_CATALOG
      : derKind === 'BESS' ? BESS_PCS_CATALOG
      : WIND_TURBINE_CATALOG;
    return localCatalog.map((device) => normalizeLocalDerDevice(device, derKind));
  }, [derKind]);

  const deviceCatalog = useMemo<readonly DerDeviceCatalogItem[]>(
    () => backendDeviceCatalog?.length ? backendDeviceCatalog : fallbackDeviceCatalog,
    [backendDeviceCatalog, fallbackDeviceCatalog],
  );

  const stationTransformers = useMemo(
    () => readStationTransformers(snapshot, stationId),
    [snapshot, stationId],
  );

  const stationTransformerCapacityKw = useMemo(
    () => readStationTransformerCapacityKw(stationTransformers),
    [stationTransformers],
  );

  const primaryStationTransformer = stationTransformers[0] ?? null;

  const compatibleDeviceCatalog = useMemo(
    () => deviceCatalog.filter((device) =>
      fitsSelectedLvVoltage(device, selections.connectionSide, selections.voltageLevelRef)
      && fitsStationTransformerCapacity(device, selections.connectionSide, stationTransformerCapacityKw)),
    [
      deviceCatalog,
      selections.connectionSide,
      selections.voltageLevelRef,
      stationTransformerCapacityKw,
    ],
  );

  const incompatibleDeviceCount = deviceCatalog.length - compatibleDeviceCatalog.length;

  const deviceVoltageOptions = useMemo(
    () => Array.from(new Set(
      deviceCatalog
        .map((device) => getDeviceNominalVoltageKv(device))
        .filter((value): value is number => value !== null),
    )).sort((a, b) => a - b),
    [deviceCatalog],
  );

  const filteredDeviceCatalog = useMemo(() => {
    const normalizedSearch = deviceSearch.trim().toLowerCase();
    return deviceCatalog.filter((device) => {
      if (normalizedSearch && !deviceSearchHaystack(device).includes(normalizedSearch)) {
        return false;
      }
      if (
        deviceVoltageFilter !== 'all'
        && getDeviceNominalVoltageKv(device)?.toFixed(2) !== deviceVoltageFilter
      ) {
        return false;
      }
      if (deviceModeFilter === 'ptpiree' && resolvePtpireeDocument(device, null) === '-') {
        return false;
      }
      if (deviceModeFilter === 'gfm' && !deviceGridFormingCapable(device)) {
        return false;
      }
      if (
        deviceModeFilter === 'q-control'
        && !device.control_mode
        && (device.qmin_mvar === null || device.qmin_mvar === undefined)
        && (device.qmax_mvar === null || device.qmax_mvar === undefined)
      ) {
        return false;
      }
      return true;
    });
  }, [deviceCatalog, deviceModeFilter, deviceSearch, deviceVoltageFilter]);

  const deviceCatalogCounters = useMemo(() => ({
    total: deviceCatalog.length,
    filtered: filteredDeviceCatalog.length,
    ptpiree: deviceCatalog.filter((device) => resolvePtpireeDocument(device, null) !== '-').length,
    gfm: deviceCatalog.filter(deviceGridFormingCapable).length,
    backend: deviceCatalog.filter((device) => device.catalog_source === 'backend').length,
  }), [deviceCatalog, filteredDeviceCatalog.length]);

  const deviceSelectOptions = useMemo(
    () => filteredDeviceCatalog.map((device) => {
      const voltageOk = fitsSelectedLvVoltage(
        device,
        selections.connectionSide,
        selections.voltageLevelRef,
      );
      const transformerOk = fitsStationTransformerCapacity(
        device,
        selections.connectionSide,
        stationTransformerCapacityKw,
      );
      const ptpireeCertificate = derKind === 'PV'
        ? findPtpireeCertificateForDevice(device, ptpireeRegistry)
        : null;
      const ptpireeSuffix = ptpireeCertificate
        ? ` · PTPiREE ${ptpireeCertificate.documentNumber}`
        : '';
      if (voltageOk && transformerOk) {
        return { id: device.id, label: `${device.label_pl}${ptpireeSuffix}` };
      }
      const reason = !voltageOk
        ? 'wymaga innego poziomu napięcia'
        : 'wymaga większego transformatora stacji';
      return { id: device.id, label: `${device.label_pl}${ptpireeSuffix} — ${reason}` };
    }),
    [
      derKind,
      filteredDeviceCatalog,
      ptpireeRegistry,
      selections.connectionSide,
      selections.voltageLevelRef,
      stationTransformerCapacityKw,
    ],
  );

  const selectedDevice = useMemo(
    () => deviceCatalog.find((d) => d.id === selections.deviceCatalogRef) ?? null,
    [deviceCatalog, selections.deviceCatalogRef],
  );

  const selectedDevicePtpireeCertificate = useMemo(
    () => selectedDevice ? findPtpireeCertificateForDevice(selectedDevice, ptpireeRegistry) : null,
    [ptpireeRegistry, selectedDevice],
  );

  const availableBessModes = useMemo(
    () => derKind === 'BESS' && selectedDevice
      ? selectBessModesForPcs({
        fourQuadrant: deviceFourQuadrantCapable(selectedDevice),
        gridFormingCapable: deviceGridFormingCapable(selectedDevice),
      })
      : [],
    [derKind, selectedDevice],
  );

  const availableBessModeIds = useMemo(
    () => availableBessModes.map((mode) => mode.id).join('|'),
    [availableBessModes],
  );

  const autoBlockTransformer = useMemo(
    () => selectAutoBlockTransformerForDevice(derKind, selectedDevice, primaryStationTransformer),
    [derKind, primaryStationTransformer, selectedDevice],
  );

  const effectiveBlockTransformerCatalogRef = useMemo(() => {
    if (selections.connectionSide !== 'dedicated_transformer') {
      return null;
    }
    return (
      autoBlockTransformer?.id
      ?? selections.blockTransformerCatalogRef
      ?? selectBlockTransformersForDer({ derKind })[0]?.id
      ?? null
    );
  }, [
    autoBlockTransformer,
    derKind,
    selections.blockTransformerCatalogRef,
    selections.connectionSide,
  ]);

  const transformerUpgradeOptions = useMemo(
    () => selectTransformerUpgradeOptions(
      selectedDevice ? requiredTransformerKvaForDerPowerKw(selectedDevice.nominal_power_kw) : null,
      primaryStationTransformer,
    ),
    [primaryStationTransformer, selectedDevice],
  );

  const voltageMismatchWarning = useMemo(() => {
    if (selections.connectionSide !== 'nN' || !selections.voltageLevelRef || !selectedDevice) {
      return null;
    }
    const lvLevel = LV_VOLTAGE_LEVEL_CATALOG.find((l) => l.id === selections.voltageLevelRef);
    if (!lvLevel || !('nominal_voltage_kv' in selectedDevice)) return null;
    const deviceKv = selectedDevice.nominal_voltage_kv as number;
    if (Math.abs(deviceKv - lvLevel.nominal_kv) > 0.01) {
      return (
        `Niezgodność napięcia: urządzenie ${deviceKv.toFixed(2)} kV vs `
        + `szyna nN ${lvLevel.nominal_kv.toFixed(2)} kV. `
        + 'Wymagany transformator dedykowany albo zmiana wariantu przyłączenia.'
      );
    }
    return null;
  }, [selections.connectionSide, selections.voltageLevelRef, selectedDevice]);

  const transformerPowerWarning = useMemo(() => {
    if (selections.connectionSide !== 'nN' || !selectedDevice || stationTransformerCapacityKw === null) {
      return null;
    }
    const requiredTransformerKva = requiredTransformerKvaForDerPowerKw(selectedDevice.nominal_power_kw);
    if (requiredTransformerKva <= stationTransformerCapacityKw + 1e-6) {
      return null;
    }
    return (
      `Moc katalogowa ${selectedDevice.label_pl} wynosi ${formatKw(selectedDevice.nominal_power_kw)}, `
      + `wymaga co najmniej ${formatKva(requiredTransformerKva)}, `
      + `a transformator stacji ma ${formatKva(stationTransformerCapacityKw)}. `
      + 'Dobierz większy transformator z katalogu, wybierz mniejszy wariant '
      + 'albo przejdź na przyłączenie po stronie SN.'
    );
  }, [selectedDevice, selections.connectionSide, stationTransformerCapacityKw]);

  const canGoNext = useMemo(() => {
    switch (step) {
      case 'variant':
        return selections.connectionSide !== null;
      case 'point':
        return (
          selections.derName.trim().length > 0 &&
          selections.pccLabel.trim().length > 0 &&
          // nN wymaga voltage_level z katalogu
          (selections.connectionSide !== 'nN' || selections.voltageLevelRef !== null) &&
          // SN wymaga oznaczenia pola SN
          (selections.connectionSide !== 'SN' || selections.bayName.trim().length > 0) &&
          // Naprawa B.2: pozastacjonarne warianty wymagają connection_node_ref
          (
            !['at_zksn', 'at_branch_pole', 'at_cable_joint'].includes(selections.connectionSide ?? '')
            || selections.bayName.trim().length > 0
          )
        );
      case 'device':
        return selections.deviceCatalogRef !== null
          && voltageMismatchWarning === null
          && transformerPowerWarning === null
          && (
            selections.connectionSide !== 'dedicated_transformer'
            || effectiveBlockTransformerCatalogRef !== null
          )
          && (
            derKind !== 'BESS'
            || (selections.batteryCatalogRef !== null && selections.bessOperationModeRefs.length > 0)
          );
      case 'profile':
        return (
          selections.ncRfgProfileRef !== null &&
          selections.lvrtCurveRef !== null &&
          selections.hvrtCurveRef !== null
        );
      case 'review':
        return true;
      default:
        return false;
    }
  }, [
    derKind,
    effectiveBlockTransformerCatalogRef,
    selections,
    step,
    transformerPowerWarning,
    voltageMismatchWarning,
  ]);

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      const nextStep = STEPS[idx + 1];
      if (nextStep === 'profile') {
        setSelections((current) => applyProfileDefaults(current));
      }
      setStep(nextStep);
    }
  }, [step]);

  const goPrev = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) {
      setStep(STEPS[idx - 1]);
    }
  }, [step]);

  const selectConnectionSide = useCallback(
    (connectionSide: ConnectionSide) => {
      setSelections((current) =>
        applyPointDefaults(current, connectionSide, derKind, stationName));
    },
    [derKind, stationName],
  );

  useEffect(() => {
    if (!transformerPowerWarning || transformerUpgradeOptions.length === 0) {
      setSelectedTransformerUpgradeRef('');
      return;
    }
    setSelectedTransformerUpgradeRef((current) =>
      transformerUpgradeOptions.some((option) => option.id === current)
        ? current
        : transformerUpgradeOptions[0].id);
  }, [transformerPowerWarning, transformerUpgradeOptions]);

  useEffect(() => {
    if (
      selections.connectionSide !== 'dedicated_transformer'
      || !autoBlockTransformer
      || selections.blockTransformerCatalogRef === autoBlockTransformer.id
    ) {
      return;
    }
    setSelections((current) => ({
      ...current,
      blockTransformerCatalogRef: autoBlockTransformer.id,
    }));
  }, [
    autoBlockTransformer,
    selections.blockTransformerCatalogRef,
    selections.connectionSide,
  ]);

  const handleSwitchToDedicatedTransformer = useCallback(() => {
    if (!autoBlockTransformer) {
      notify('Brak dopasowanego transformatora blokowego w katalogu dla wybranego urządzenia.', 'error');
      return;
    }
    setSelections((current) => ({
      ...applyPointDefaults(current, 'dedicated_transformer', derKind, stationName),
      blockTransformerCatalogRef: autoBlockTransformer.id,
    }));
    notify('Przełączono wariant przyłączenia na transformator dedykowany.', 'success');
  }, [autoBlockTransformer, derKind, notify, stationName]);

  const handleChooseOtherDevice = useCallback(() => {
    setSelections((current) => ({ ...current, deviceCatalogRef: null }));
  }, []);

  useEffect(() => {
    if (derKind !== 'BESS' || !selectedDevice || availableBessModes.length === 0) {
      return;
    }
    const validModeIds = new Set(availableBessModes.map((mode) => mode.id));
    setSelections((current) => {
      const stillValid = current.bessOperationModeRefs.filter((ref) => validModeIds.has(ref));
      return stillValid.length === current.bessOperationModeRefs.length
        ? current
        : { ...current, bessOperationModeRefs: stillValid };
    });
  }, [availableBessModeIds, availableBessModes, derKind, selectedDevice]);

  const handleUpgradeStationTransformer = useCallback(async () => {
    if (!effectiveCaseId || !primaryStationTransformer || !selectedTransformerUpgradeRef) {
      notify('Wybierz transformator stacji i wariant katalogowy większej mocy.', 'error');
      return;
    }
    const selectedUpgrade = transformerUpgradeOptions.find(
      (option) => option.id === selectedTransformerUpgradeRef,
    );
    if (!selectedUpgrade) {
      notify('Wybrany wariant transformatora nie jest dostępny w katalogu.', 'error');
      return;
    }
    setIsUpdatingTransformer(true);
    try {
      const response = await executeDomainOperation(effectiveCaseId, 'assign_catalog_to_element', {
        element_ref: primaryStationTransformer.ref,
        catalog_binding: {
          catalog_namespace: 'TRAFO_SN_NN',
          catalog_item_id: selectedUpgrade.id,
          catalog_item_version: '2024.1',
        },
      });
      if (response?.error) {
        notify(response.error, 'error');
        return;
      }
      notify(`Zmieniono transformator stacji na ${selectedUpgrade.label_pl}.`, 'success');
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : 'Nie udało się zmienić transformatora stacji.',
        'error',
      );
    } finally {
      setIsUpdatingTransformer(false);
    }
  }, [
    effectiveCaseId,
    executeDomainOperation,
    primaryStationTransformer,
    selectedTransformerUpgradeRef,
    transformerUpgradeOptions,
  ]);

  const handleCreate = useCallback(async () => {
    if (!stationId || !selections.connectionSide) return;
    if (!effectiveCaseId || !projectId || projectId === 'no-project') {
      notify('Wybierz aktywny projekt i zakres obliczeń przed utworzeniem układu przyłączeniowego.', 'error');
      return;
    }
    // Walidacja runtime: catalog_refs muszą istnieć w katalogach
    // (chroni przed manipulacją selections w devtools).
    const validation = validateWizardSelections(selections, derKind, {
      allowedDeviceCatalogIds: deviceCatalog.map((device) => device.id),
    });
    if (!validation.ok) {
      notify(
        `Walidacja kreatora DER nie powiodła się: ${validation.errors.join('; ')}`,
        'error',
      );
      return;
    }
    // Deterministyczne ID — fnv1a hash z (project + station + kind + name).
    // Dwa wywołania kreatora z identycznymi danymi → identyczne id.
    const id = generateDeterministicDerId({
      projectId,
      stationId,
      derKind,
      derName: selections.derName,
      pccLabel: selections.pccLabel,
    });
    const pccRef = `pcc_${stationId}_${selections.pccLabel.trim()}`;
    if (voltageMismatchWarning || transformerPowerWarning) {
      notify(voltageMismatchWarning ?? transformerPowerWarning ?? 'Konfiguracja DER wymaga korekty.', 'error');
      return;
    }
    if (selections.connectionSide === 'dedicated_transformer' && !effectiveBlockTransformerCatalogRef) {
      notify('Wybierz transformator dedykowany z katalogu.', 'error');
      return;
    }

    const device = deviceCatalog.find((d) => d.id === selections.deviceCatalogRef);
    const nominalPowerKw = device && 'nominal_power_kw' in device ? device.nominal_power_kw : null;
    const backendCatalogRef = resolveBackendCatalogRef(
      derKind,
      selections.connectionSide,
      selections.deviceCatalogRef,
    );

    // Naprawa B.2: connection_node_ref dla pozastacjonarnych wariantów.
    let connectionNodeRef: string | null = null;
    if (selections.connectionSide === 'at_zksn') {
      connectionNodeRef = `node_zksn_${selections.bayName}`;
    } else if (selections.connectionSide === 'at_branch_pole') {
      connectionNodeRef = `node_branch_pole_${selections.bayName}`;
    } else if (selections.connectionSide === 'at_cable_joint') {
      connectionNodeRef = `node_cable_joint_${selections.bayName}`;
    }

    setIsCreating(true);
    try {
      const response = await postDerGeneratorConfig(projectId, effectiveCaseId, {
        station_ref: stationId,
        der_kind: derKind,
        power_mw: (nominalPowerKw ?? 500) / 1000,
        connection_variant: toBackendConnectionVariant(selections.connectionSide),
        catalog_ref: backendCatalogRef,
        block_transformer_catalog_ref:
          selections.connectionSide === 'dedicated_transformer'
            ? effectiveBlockTransformerCatalogRef
            : null,
        source_name: selections.derName,
        quantity: 1,
        nc_rfg_module: resolveNcRfgModule(selections),
      });

      if (response.snapshot) {
        setSnapshot(response);
      }

      attachDer({
        id,
        project_id: projectId,
        station_id: stationId,
        der_kind: derKind,
        name: selections.derName,
        connection_side: selections.connectionSide,
        pcc_ref: pccRef,
        bay_ref:
          selections.connectionSide === 'SN' ? `bay_${stationId}_${selections.bayName}` : null,
        lv_busbar_ref:
          selections.connectionSide === 'nN' ? `busbar_${stationId}_main` : null,
        transformer_ref:
          selections.connectionSide === 'dedicated_transformer'
            ? `tr_dedicated_${id}`
            : null,
        connection_node_ref: connectionNodeRef,
        voltage_level_ref: selections.voltageLevelRef,
        nominal_power_kw: nominalPowerKw,
        catalogs: {
          device_catalog_ref: selections.deviceCatalogRef,
          battery_catalog_ref: selections.batteryCatalogRef,
          block_transformer_catalog_ref: effectiveBlockTransformerCatalogRef,
        },
        profiles: {
          nc_rfg_profile_ref: selections.ncRfgProfileRef,
          lvrt_curve_ref: selections.lvrtCurveRef,
          hvrt_curve_ref: selections.hvrtCurveRef,
          pf_curve_ref: selections.pfCurveRef,
          bess_operation_mode_refs: selections.bessOperationModeRefs,
        },
        created_at: nowIso,
      });

      notify(
        `Utworzono ${DER_KIND_LABELS[derKind]} "${selections.derName}" w stacji "${stationName}".`,
        'success',
      );
      window.dispatchEvent(
        new CustomEvent('mvdesignpro:der-created', {
          detail: { stationId, derKind, sourceId: id },
        }),
      );
      handleClose();
    } catch (error) {
      notify(
        error instanceof DerPersistenceApiError
          ? error.message
          : 'Nie udało się zapisać układu przyłączeniowego w modelu sieci.',
        'error',
      );
    } finally {
      setIsCreating(false);
    }
  }, [
    attachDer,
    deviceCatalog,
    derKind,
    effectiveBlockTransformerCatalogRef,
    effectiveCaseId,
    nowIso,
    handleClose,
    projectId,
    selections,
    setSnapshot,
    stationId,
    stationName,
    transformerPowerWarning,
    voltageMismatchWarning,
  ]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="add-der-wizard"
      data-der-kind={derKind}
      data-current-step={step}
      role="dialog"
      aria-modal="true"
      aria-label={`Dodaj ${DER_KIND_LABELS[derKind]}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="w-[980px] max-w-[95vw] rounded-lg border border-scada-border bg-scada-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-scada-border bg-scada-surface px-5 py-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-scada-muted">
              Dodaj układ przyłączeniowy
            </div>
            <h3 className="text-sm font-semibold text-scada-text">
              {DER_KIND_LABELS[derKind]} → {stationName}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            data-testid="add-der-wizard-close"
            className="rounded p-1 text-scada-muted hover:bg-scada-hover-nav hover:text-scada-text"
            aria-label="Zamknij konfigurację"
          >
            ✕
          </button>
        </div>

        {/* Stepper */}
        <div className="flex border-b border-scada-border bg-scada-surface px-5 py-2 text-[10px] font-medium">
          {STEPS.map((s, idx) => (
            <div
              key={s}
              data-testid={`add-der-step-${s}`}
              data-active={step === s}
              className={
                'flex-1 px-2 py-1 '
                + (step === s
                  ? 'text-scada-sn'
                  : idx < STEPS.indexOf(step)
                    ? 'text-status-ok'
                    : 'text-scada-muted')
              }
            >
              {STEP_LABELS[s]}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-5 text-xs">
          {step === 'variant' && (
            <div data-testid="add-der-step-content-variant" className="space-y-2">
              <p className="mb-2 text-scada-muted">
                Wybierz wariant przyłączenia. Opcje są filtrowane wg rodzaju DER
                (FW nie obsługuje "po stronie nN" zgodnie z modelem przyłączeń).
              </p>
              {variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  data-testid={`variant-${v.side}`}
                  data-active={selections.connectionSide === v.side}
                  onClick={() => selectConnectionSide(v.side)}
                  className={
                    'w-full rounded border p-3 text-left text-xs '
                    + (selections.connectionSide === v.side
                      ? 'border-scada-sn bg-scada-hover-nav text-scada-text'
                      : 'border-scada-border bg-scada-surface text-scada-muted hover:border-scada-sn')
                  }
                >
                  <div className="text-sm font-semibold text-scada-text">{v.label_pl}</div>
                  <div className="mt-1 text-[11px]">{v.description_pl}</div>
                  <div className="mt-2 text-[10px]">
                    Wymagane elementy:{' '}
                    {v.required_objects_pl.map((o, i) => (
                      <span key={i} className="mr-1 rounded bg-scada-panel px-1.5 py-0.5">
                        {o}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 'point' && (
            <div data-testid="add-der-step-content-point" className="space-y-3">
              <p className="text-scada-muted">
                Wybierz punkt przyłączenia (PCC) i podstawowe dane układu.
                Pola tekstowe to projektowe oznaczenia, niewybór z katalogu.
              </p>
              <Field
                label="Nazwa DER"
                required
                value={selections.derName}
                onChange={(v) => setSelections((s) => ({ ...s, derName: v }))}
                placeholder={`np. ${derKind === 'PV' ? 'PV Polna 1' : derKind === 'BESS' ? 'BESS-1' : 'FW Pomorze'}`}
                testId="add-der-name"
              />
              <Field
                label="Oznaczenie PCC (etykieta projektowa)"
                required
                value={selections.pccLabel}
                onChange={(v) => setSelections((s) => ({ ...s, pccLabel: v }))}
                placeholder="np. PCC-01"
                testId="add-der-pcc-label"
              />
              {selections.connectionSide === 'SN' && (
                <Field
                  label="Oznaczenie pola SN"
                  required
                  value={selections.bayName}
                  onChange={(v) => setSelections((s) => ({ ...s, bayName: v }))}
                  placeholder="np. Pole-PV-01"
                  testId="add-der-bay-name"
                />
              )}
              {selections.connectionSide === 'at_zksn' && (
                <Field
                  label="Oznaczenie ZK SN (węzeł połączenia)"
                  required
                  value={selections.bayName}
                  onChange={(v) => setSelections((s) => ({ ...s, bayName: v }))}
                  placeholder="np. ZK-SN-12"
                  testId="add-der-zksn-name"
                />
              )}
              {selections.connectionSide === 'at_branch_pole' && (
                <Field
                  label="Oznaczenie słupa rozgałęźnego"
                  required
                  value={selections.bayName}
                  onChange={(v) => setSelections((s) => ({ ...s, bayName: v }))}
                  placeholder="np. SLUP-W-12-3"
                  testId="add-der-pole-name"
                />
              )}
              {selections.connectionSide === 'at_cable_joint' && (
                <Field
                  label="Oznaczenie mufy kablowej (T-joint)"
                  required
                  value={selections.bayName}
                  onChange={(v) => setSelections((s) => ({ ...s, bayName: v }))}
                  placeholder="np. MUFA-T-08"
                  testId="add-der-joint-name"
                />
              )}
              {selections.connectionSide === 'nN' && (
                <Select
                  label="Poziom napięcia nN (z katalogu)"
                  required
                  value={selections.voltageLevelRef ?? ''}
                  onChange={(v) => setSelections((s) => ({ ...s, voltageLevelRef: v }))}
                  options={[
                    { id: '', label: '— wybierz —' },
                    ...LV_VOLTAGE_LEVEL_CATALOG.map((l) => ({ id: l.id, label: l.label_pl })),
                  ]}
                  testId="add-der-voltage-level"
                />
              )}
              {/* Pakiet H: transformator dedykowany dla dedicated_transformer. */}
              {selections.connectionSide === 'dedicated_transformer' && (() => {
                const candidates = selectBlockTransformersForDer({ derKind });
                return (
                  <Select
                    label="Transformator dedykowany z katalogu"
                    required
                    value={selections.blockTransformerCatalogRef ?? ''}
                    onChange={(v) =>
                      setSelections((s) => ({ ...s, blockTransformerCatalogRef: v || null }))
                    }
                    options={[
                      { id: '', label: '— wybierz transformator dedykowany —' },
                      ...candidates.map((b) => ({ id: b.id, label: b.label_pl })),
                    ]}
                    testId="add-der-block-transformer"
                  />
                );
              })()}
            </div>
          )}

          {step === 'device' && (
            <div data-testid="add-der-step-content-device" className="space-y-3">
              <div
                data-testid="add-der-catalog-source"
                className="rounded border border-scada-border bg-scada-bg p-2 text-[11px] text-scada-muted"
              >
                Lista urządzeń łączy katalog techniczny falowników z wykazem PTPiREE/NC RfG
                ({ptpireeRegistry.length} pozycji). Wybór falownika steruje napięciem układu
                i doborem transformatora.
              </div>
              {selections.connectionSide === 'dedicated_transformer'
                && selectedDevice
                && getDeviceNominalVoltageKv(selectedDevice) !== null
                && autoBlockTransformer && (
                <div
                  data-testid="add-der-auto-block-transformer"
                  className="rounded border border-emerald-700 bg-emerald-950/30 p-2 text-[11px] text-scada-text"
                >
                  Automatycznie dobrano transformator dedykowany:
                  {' '}
                  <span className="font-medium text-emerald-200">
                    {autoBlockTransformer.label_pl}
                  </span>
                  {' '}
                  dla urządzenia {getDeviceNominalVoltageKv(selectedDevice)?.toFixed(2)} kV
                  i mocy {formatKw(selectedDevice.nominal_power_kw)}.
                </div>
              )}
              <p className="text-scada-muted">
                Wybierz urządzenie z katalogu producenta. Wszystkie wartości
                techniczne (moc, napięcie, charakterystyki) pochodzą z katalogu.
              </p>
              <div
                data-testid="add-der-device-catalog-summary"
                className="grid grid-cols-2 gap-2 rounded border border-scada-border bg-scada-surface p-2 text-[11px] text-scada-muted md:grid-cols-5"
              >
                <CatalogMetric label="Katalog" value={deviceCatalogStatus === 'backend' ? 'backend' : deviceCatalogStatus} />
                <CatalogMetric label="Pozycje" value={`${deviceCatalogCounters.filtered}/${deviceCatalogCounters.total}`} />
                <CatalogMetric label="Backend" value={`${deviceCatalogCounters.backend}`} />
                <CatalogMetric label="PTPiREE" value={`${deviceCatalogCounters.ptpiree}`} />
                <CatalogMetric label="GFM" value={`${deviceCatalogCounters.gfm}`} />
              </div>
              {deviceCatalogStatus === 'error' && (
                <div
                  data-testid="add-der-device-catalog-error"
                  className="space-y-2 rounded border border-red-700 bg-red-950/30 p-3 text-[11px] text-red-100"
                >
                  Katalog backendowy jest niedostępny, używam awaryjnych pozycji lokalnych.
                  {deviceCatalogError ? ` Przyczyna: ${deviceCatalogError}` : ''}
                </div>
              )}
              <div
                data-testid="add-der-device-filters"
                className="grid grid-cols-1 gap-2 rounded border border-scada-border bg-scada-bg p-2 md:grid-cols-[1fr_160px_180px]"
              >
                <Field
                  label="Szukaj w katalogu DER"
                  value={deviceSearch}
                  onChange={setDeviceSearch}
                  placeholder="producent, model, certyfikat, napięcie, PTPiREE"
                  testId="add-der-device-search"
                />
                <Select
                  label="Napięcie"
                  value={deviceVoltageFilter}
                  onChange={setDeviceVoltageFilter}
                  options={[
                    { id: 'all', label: 'wszystkie' },
                    ...deviceVoltageOptions.map((voltageKv) => ({
                      id: voltageKv.toFixed(2),
                      label: `${voltageKv.toFixed(2)} kV`,
                    })),
                  ]}
                  testId="add-der-device-voltage-filter"
                />
                <Select
                  label="Cechy"
                  value={deviceModeFilter}
                  onChange={setDeviceModeFilter}
                  options={[
                    { id: 'all', label: 'wszystkie' },
                    { id: 'ptpiree', label: 'PTPiREE' },
                    { id: 'q-control', label: 'regulacja Q/U' },
                    { id: 'gfm', label: 'grid-forming' },
                  ]}
                  testId="add-der-device-mode-filter"
                />
              </div>
              {voltageMismatchWarning && (
                <div
                  data-testid="add-der-voltage-mismatch-warning"
                  className="rounded border border-amber-700 bg-amber-950/30 p-2 text-[11px] text-amber-200"
                >
                  <div className="font-semibold text-red-200">
                    Niezgodność napięciowa blokuje zapis wariantu nN.
                  </div>
                  <div>{voltageMismatchWarning}</div>
                  {autoBlockTransformer ? (
                    <div className="text-red-100/80">
                      Sugestia katalogowa: {autoBlockTransformer.label_pl}.
                    </div>
                  ) : (
                    <div className="text-red-100/80">
                      Katalog nie wskazał transformatora dedykowanego dla tego urządzenia.
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid="add-der-switch-dedicated-transformer"
                      onClick={handleSwitchToDedicatedTransformer}
                      disabled={!autoBlockTransformer}
                      className="rounded border border-red-300 px-3 py-1 text-[11px] font-semibold text-red-50 transition hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Przełącz na TR dedykowany
                    </button>
                    <button
                      type="button"
                      data-testid="add-der-clear-device-selection"
                      onClick={handleChooseOtherDevice}
                      className="rounded border border-scada-border px-3 py-1 text-[11px] font-semibold text-scada-text transition hover:bg-scada-hover-nav"
                    >
                      Wybierz inne urządzenie
                    </button>
                  </div>
                </div>
              )}
              {transformerPowerWarning && (
                <div
                  data-testid="add-der-transformer-power-warning"
                  className="rounded border border-red-700 bg-red-950/30 p-2 text-[11px] text-red-200"
                >
                  {transformerPowerWarning}
                </div>
              )}
              {transformerPowerWarning && transformerUpgradeOptions.length > 0 && (
                <div
                  data-testid="add-der-transformer-upgrade-panel"
                  className="space-y-2 rounded border border-scada-sn/70 bg-scada-sn/10 p-2 text-[11px] text-scada-text"
                >
                  <div>
                    <div className="font-medium text-scada-sn">
                      Dobierz większy transformator stacji z katalogu
                    </div>
                    <div className="text-scada-muted">
                      Aktualizowany jest istniejący transformator SN/nN stacji,
                      bez tworzenia źródła poza dopuszczalną mocą układu.
                    </div>
                  </div>
                  <Select
                    label="Nowy transformator SN/nN"
                    value={selectedTransformerUpgradeRef}
                    onChange={setSelectedTransformerUpgradeRef}
                    options={transformerUpgradeOptions.map((option) => ({
                      id: option.id,
                      label: `${option.label_pl} · ${formatKva(option.sn_mva * 1000)}`,
                    }))}
                    testId="add-der-transformer-upgrade"
                  />
                  <button
                    type="button"
                    data-testid="add-der-upgrade-transformer"
                    onClick={handleUpgradeStationTransformer}
                    disabled={isUpdatingTransformer || !selectedTransformerUpgradeRef}
                    className="rounded border border-scada-sn px-3 py-1.5 text-[11px] font-medium text-scada-sn hover:bg-scada-sn/10 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isUpdatingTransformer ? 'Zmieniam transformator...' : 'Zmień TR stacji'}
                  </button>
                </div>
              )}
              {transformerPowerWarning && transformerUpgradeOptions.length === 0 && (
                <div
                  data-testid="add-der-transformer-upgrade-empty"
                  className="rounded border border-amber-700 bg-amber-950/30 p-2 text-[11px] text-amber-200"
                >
                  Dla napięć tej stacji katalog nie wskazał większego transformatora.
                  Wybierz mniejszy wariant źródła albo przyłączenie po stronie SN.
                </div>
              )}
              {selections.connectionSide === 'nN' && stationTransformerCapacityKw !== null && (
                <div
                  data-testid="add-der-compatible-device-summary"
                  className="rounded border border-scada-border bg-scada-bg p-2 text-[11px] text-scada-muted"
                >
                  Wariant nN: pokazuję urządzenia zgodne z szyną nN i transformatorem stacji
                  {' '}
                  {formatKva(stationTransformerCapacityKw)}.
                  {incompatibleDeviceCount > 0 && (
                    <>
                      {' '}
                      {incompatibleDeviceCount} większych wariantów wymaga transformatora dedykowanego
                      albo przyłączenia po stronie SN.
                    </>
                  )}
                </div>
              )}
              <Select
                label={derKind === 'PV' ? 'Falownik PV' : derKind === 'BESS' ? 'PCS BESS' : 'Turbina wiatrowa'}
                required
                value={selections.deviceCatalogRef ?? ''}
                onChange={(v) => setSelections((s) => ({ ...s, deviceCatalogRef: v }))}
                options={[
                  { id: '', label: '— wybierz —' },
                  ...deviceSelectOptions,
                ]}
                testId="add-der-device"
              />
              <div
                data-testid="add-der-device-results"
                className="max-h-72 overflow-y-auto rounded border border-scada-border bg-scada-bg text-[11px]"
              >
                <div className="grid min-w-[760px] grid-cols-[minmax(220px,1.7fr)_120px_90px_90px_110px_minmax(170px,1fr)] gap-2 border-b border-scada-border bg-scada-surface px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-scada-muted">
                  <span>Urządzenie</span>
                  <span>Producent</span>
                  <span>Pmax</span>
                  <span>Un</span>
                  <span>NC RfG</span>
                  <span>Ocena doboru</span>
                </div>
                {filteredDeviceCatalog.slice(0, 80).map((device) => {
                  const isSelected = selections.deviceCatalogRef === device.id;
                  const ptpireeDocument = resolvePtpireeDocument(
                    device,
                    derKind === 'PV' ? findPtpireeCertificateForDevice(device, ptpireeRegistry) : null,
                  );
                  const voltageOk = fitsSelectedLvVoltage(
                    device,
                    selections.connectionSide,
                    selections.voltageLevelRef,
                  );
                  const transformerOk = fitsStationTransformerCapacity(
                    device,
                    selections.connectionSide,
                    stationTransformerCapacityKw,
                  );
                  const eligibilityText = voltageOk && transformerOk
                    ? 'zgodne z wariantem'
                    : !voltageOk
                      ? 'wymaga innego napięcia/TR'
                      : 'wymaga większego TR stacji';
                  const eligibilityClass = voltageOk && transformerOk
                    ? 'border-emerald-600 bg-emerald-950/40 text-emerald-200'
                    : 'border-amber-700 bg-amber-950/30 text-amber-200';
                  return (
                    <button
                      key={device.id}
                      type="button"
                      data-testid={`add-der-device-card-${device.id}`}
                      data-active={isSelected}
                      onClick={() => setSelections((s) => ({ ...s, deviceCatalogRef: device.id }))}
                      className={
                        'grid min-w-[760px] grid-cols-[minmax(220px,1.7fr)_120px_90px_90px_110px_minmax(170px,1fr)] items-center gap-2 border-b px-3 py-2 text-left transition last:border-b-0 '
                        + (isSelected
                          ? 'border-scada-sn bg-scada-sn/10 text-scada-text'
                          : 'border-scada-border text-scada-muted hover:bg-scada-hover-nav')
                      }
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-scada-text">{device.label_pl}</div>
                        <div className="truncate text-[10px] text-scada-muted">{device.model || device.id}</div>
                      </div>
                      <span className="truncate">{device.manufacturer || '-'}</span>
                      <span className="text-scada-text">{formatKw(device.nominal_power_kw)}</span>
                      <span>{formatKv(getDeviceNominalVoltageKv(device))}</span>
                      <span>{device.grid_code ?? device.applicable_module_types?.join('/') ?? 'NC RfG'}</span>
                      <span className="flex flex-wrap gap-1">
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${eligibilityClass}`}>
                          {eligibilityText}
                        </span>
                        {ptpireeDocument !== '-' && (
                          <span className="rounded bg-emerald-950/50 px-1.5 py-0.5 text-emerald-200">
                            PTPiREE {ptpireeDocument}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
                {filteredDeviceCatalog.length === 0 && (
                  <div
                    data-testid="add-der-device-results-empty"
                    className="rounded border border-amber-700 bg-amber-950/20 p-3 text-[11px] text-amber-200"
                  >
                    Brak pozycji dla aktualnych filtrów. Zmień tekst wyszukiwania, napięcie
                    albo cechy katalogowe.
                  </div>
                )}
              </div>
              {selectedDevice && (
                <div
                  data-testid="add-der-device-details"
                  className="rounded border border-scada-border bg-scada-surface p-3 text-[11px]"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
                        Wybrane urządzenie DER
                      </div>
                      <div className="text-sm font-semibold text-scada-text">{selectedDevice.label_pl}</div>
                    </div>
                    <span className="rounded border border-scada-border bg-scada-bg px-2 py-1 text-[10px] text-scada-muted">
                      {selectedDevice.catalog_source === 'backend' ? 'katalog backendowy' : 'fallback lokalny'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <CatalogMetric label="Pmax" value={formatKw(selectedDevice.nominal_power_kw)} />
                    <CatalogMetric label="Un" value={formatKv(getDeviceNominalVoltageKv(selectedDevice))} />
                    <CatalogMetric label="Sn" value={selectedDevice.s_n_kva ? formatKva(selectedDevice.s_n_kva) : '-'} />
                    <CatalogMetric label="Q min/max" value={`${formatMvar(selectedDevice.qmin_mvar)} / ${formatMvar(selectedDevice.qmax_mvar)}`} />
                    <CatalogMetric label="cos phi" value={`${selectedDevice.cosphi_min ?? '-'} / ${selectedDevice.cosphi_max ?? '-'}`} />
                    <CatalogMetric label="Sterowanie" value={selectedDevice.control_mode ?? '-'} />
                    <CatalogMetric label="NC RfG" value={selectedDevice.grid_code ?? selectedDevice.applicable_module_types?.join('/') ?? '-'} />
                    <CatalogMetric
                      label="PTPiREE"
                      value={resolvePtpireeDocument(selectedDevice, selectedDevicePtpireeCertificate)}
                    />
                    <CatalogMetric label="Model EMT/RMS" value={selectedDevice.dynamic_profile_id ?? '-'} />
                    <CatalogMetric label="Ik pu" value={selectedDevice.fault_current_capability_pu?.toFixed(2) ?? '-'} />
                    <CatalogMetric label="WOS/WiPWC" value={[selectedDevice.ptpiree_wos_version, selectedDevice.ptpiree_wipwc_version].filter(Boolean).join(' / ') || '-'} />
                    <CatalogMetric label="Źródło" value={selectedDevice.source_reference ?? selectedDevice.verification_status ?? '-'} />
                  </div>
                </div>
              )}
              {derKind === 'BESS' && (
                <Select
                  label="Bateria BESS"
                  required
                  value={selections.batteryCatalogRef ?? ''}
                  onChange={(v) => setSelections((s) => ({ ...s, batteryCatalogRef: v }))}
                  options={[
                    { id: '', label: '— wybierz —' },
                    ...BESS_BATTERY_CATALOG.map((b) => ({ id: b.id, label: b.label_pl })),
                  ]}
                  testId="add-der-battery"
                />
              )}

              {/* Naprawa eng.10: tryby pracy BESS — multi-select z katalogu. */}
              {derKind === 'BESS' && selections.deviceCatalogRef && selectedDevice && (() => {
                if (availableBessModes.length === 0) return null;
                return (
                  <div data-testid="add-der-bess-modes" className="space-y-1">
                    <label className="block text-[11px] text-scada-muted">
                      Tryby pracy BESS (NC RfG Art. 13/15) — wybierz min. 1
                    </label>
                    <div className="grid grid-cols-1 gap-1 rounded border border-scada-border bg-scada-bg p-2 text-[11px]">
                      {availableBessModes.map((m) => (
                        <label
                          key={m.id}
                          data-testid={`add-der-bess-mode-${m.mode_code}`}
                          className="flex items-start gap-2 hover:bg-scada-hover-nav"
                        >
                          <input
                            type="checkbox"
                            checked={selections.bessOperationModeRefs.includes(m.id)}
                            onChange={(e) => {
                              setSelections((s) => ({
                                ...s,
                                bessOperationModeRefs: e.target.checked
                                  ? [...s.bessOperationModeRefs, m.id]
                                  : s.bessOperationModeRefs.filter((r) => r !== m.id),
                              }));
                            }}
                            className="mt-0.5"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-scada-text">{m.label_pl}</div>
                            <div className="text-[10px] text-scada-muted">
                              t_resp ≤ {m.response_time_s}s · max {m.max_duration_h}h · rezerwa {m.reserved_capacity_percent}%
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {step === 'profile' && (
            <div data-testid="add-der-step-content-profile" className="space-y-3">
              <p className="flex flex-wrap items-center gap-1 text-scada-muted">
                Wybierz profil zgodności przyłączeniowej (NC RfG) operatora oraz
                krzywe LVRT i HVRT zgodnie z modułem typu A/B/C/D.
                {(() => {
                  const frt = getTooltip('oze_frt');
                  return frt ? <HelpTooltip text={frt.text} norm={frt.norm} inline /> : null;
                })()}
                {(() => {
                  const ai = getTooltip('oze_anti_islanding');
                  return ai ? <HelpTooltip text={ai.text} norm={ai.norm} inline /> : null;
                })()}
              </p>
              <Select
                label="Profil NC RfG (operator)"
                required
                value={selections.ncRfgProfileRef ?? ''}
                onChange={(v) =>
                  setSelections((s) => ({
                    ...s,
                    ncRfgProfileRef: v || null,
                    lvrtCurveRef: v ? selectLvrtCurvesForProfile(v)[0]?.id ?? null : null,
                    hvrtCurveRef: v ? selectHvrtCurvesForProfile(v)[0]?.id ?? null : null,
                    pfCurveRef: PF_CURVE_CATALOG.filter((c) => {
                      const profile = NC_RFG_PROFILE_CATALOG.find((p) => p.id === v);
                      return profile ? c.operator_code === profile.operator_code : false;
                    })[0]?.id ?? null,
                  }))
                }
                options={[
                  { id: '', label: '— wybierz —' },
                  ...NC_RFG_PROFILE_CATALOG.map((p) => ({ id: p.id, label: p.label_pl })),
                ]}
                testId="add-der-ncrfg"
              />
              <Select
                label="Krzywa LVRT"
                required
                disabled={!selections.ncRfgProfileRef}
                value={selections.lvrtCurveRef ?? ''}
                onChange={(v) => setSelections((s) => ({ ...s, lvrtCurveRef: v }))}
                options={[
                  { id: '', label: '— wybierz —' },
                  ...lvrtCurves.map((c) => ({ id: c.id, label: c.label_pl })),
                ]}
                testId="add-der-lvrt"
              />
              <Select
                label="Krzywa HVRT"
                required
                disabled={!selections.ncRfgProfileRef}
                value={selections.hvrtCurveRef ?? ''}
                onChange={(v) => setSelections((s) => ({ ...s, hvrtCurveRef: v }))}
                options={[
                  { id: '', label: '— wybierz —' },
                  ...hvrtCurves.map((c) => ({ id: c.id, label: c.label_pl })),
                ]}
                testId="add-der-hvrt"
              />
              {/* Pakiet H: P(f) krzywa regulacji częstotliwości (NC RfG Art. 13/15). */}
              <Select
                label="Krzywa P(f) — regulacja częstotliwości (NC RfG Art. 13/15)"
                disabled={!selections.ncRfgProfileRef}
                value={selections.pfCurveRef ?? ''}
                onChange={(v) => setSelections((s) => ({ ...s, pfCurveRef: v || null }))}
                options={[
                  { id: '', label: '— wybierz (opcjonalnie) —' },
                  ...PF_CURVE_CATALOG.filter((c) => {
                    const profile = NC_RFG_PROFILE_CATALOG.find(
                      (p) => p.id === selections.ncRfgProfileRef,
                    );
                    if (!profile) return false;
                    return c.operator_code === profile.operator_code;
                  }).map((c) => ({ id: c.id, label: c.label_pl })),
                ]}
                testId="add-der-pf-curve"
              />
            </div>
          )}

          {step === 'review' && (
            <div data-testid="add-der-step-content-review" className="space-y-2">
              <p className="text-scada-muted">
                Podsumowanie konfiguracji. Po zatwierdzeniu w modelu sieci zostaną
                utworzone następujące obiekty:
              </p>
              <ul className="space-y-1 rounded border border-scada-border bg-scada-surface p-3 text-[11px]">
                <ReviewRow label="Stacja" value={stationName} />
                <ReviewRow label="Rodzaj układu" value={DER_KIND_LABELS[derKind]} />
                <ReviewRow label="Nazwa układu" value={selections.derName} />
                <ReviewRow label="Wariant przyłączenia" value={formatConnectionSideForReview(selections.connectionSide, variants)} />
                <ReviewRow label="PCC" value={selections.pccLabel} />
                {selections.connectionSide === 'SN' && (
                  <ReviewRow label="Pole SN" value={selections.bayName} />
                )}
                {selections.connectionSide === 'nN' && (
                  <ReviewRow
                    label="Poziom napięcia nN"
                    value={
                      LV_VOLTAGE_LEVEL_CATALOG.find((l) => l.id === selections.voltageLevelRef)?.label_pl ?? ''
                    }
                  />
                )}
                <ReviewRow
                  label="Urządzenie (katalog)"
                  value={
                    deviceCatalog.find((d) => d.id === selections.deviceCatalogRef)?.label_pl ?? ''
                  }
                />
                {selections.connectionSide === 'dedicated_transformer' && (
                  <ReviewRow
                    label="Transformator blokowy"
                    value={getBlockTransformer(effectiveBlockTransformerCatalogRef ?? '')?.label_pl ?? ''}
                  />
                )}
                {derKind === 'BESS' && (
                  <ReviewRow
                    label="Bateria (katalog)"
                    value={
                      BESS_BATTERY_CATALOG.find((b) => b.id === selections.batteryCatalogRef)?.label_pl ?? ''
                    }
                  />
                )}
                <ReviewRow
                  label="Profil NC RfG"
                  value={
                    NC_RFG_PROFILE_CATALOG.find((p) => p.id === selections.ncRfgProfileRef)?.label_pl ?? ''
                  }
                />
                <ReviewRow
                  label="Krzywa LVRT"
                  value={
                    LVRT_CURVE_CATALOG.find((c) => c.id === selections.lvrtCurveRef)?.label_pl ?? ''
                  }
                />
                <ReviewRow
                  label="Krzywa HVRT"
                  value={
                    HVRT_CURVE_CATALOG.find((c) => c.id === selections.hvrtCurveRef)?.label_pl ?? ''
                  }
                />
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-scada-border bg-scada-surface px-5 py-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 'variant'}
            data-testid="add-der-prev"
            className="rounded border border-scada-border px-3 py-1.5 text-xs text-scada-text hover:bg-scada-hover-nav disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Wstecz
          </button>
          <div className="text-[11px] text-scada-muted">
            Krok {STEPS.indexOf(step) + 1} z {STEPS.length}
          </div>
          {step === 'review' ? (
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating}
              data-testid="add-der-create"
              className="rounded bg-scada-sn px-4 py-1.5 text-xs font-medium text-scada-bg hover:bg-yellow-300 disabled:cursor-wait disabled:opacity-60"
            >
              {isCreating ? 'Tworzenie w modelu sieci...' : `Utwórz ${DER_KIND_LABELS[derKind]}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              data-testid="add-der-next"
              className="rounded bg-scada-sn px-3 py-1.5 text-xs font-medium text-scada-bg hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Dalej →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  testId?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <input
        type="text"
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-scada-border bg-scada-panel px-2 py-1.5 text-xs text-scada-text placeholder:text-scada-muted focus:border-scada-sn focus:outline-none"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  required,
  disabled,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  required?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded border border-scada-border bg-scada-panel px-2 py-1.5 text-xs text-scada-text focus:border-scada-sn focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CatalogMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-scada-border bg-scada-bg px-2 py-1">
      <div className="truncate text-[10px] uppercase tracking-wide text-scada-muted">{label}</div>
      <div className="truncate text-[11px] font-medium text-scada-text">{value || '-'}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between gap-3">
      <span className="text-scada-muted">{label}:</span>
      <span className="text-right font-medium text-scada-text">{value || '—'}</span>
    </li>
  );
}

export default AddDerWizard;
