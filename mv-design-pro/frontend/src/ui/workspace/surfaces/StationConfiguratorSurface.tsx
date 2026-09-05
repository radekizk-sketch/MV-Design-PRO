/**
 * StationConfiguratorSurface — wrapper konfiguratora stacji SN/nN.
 *
 * Karta "Układy PV/BESS/FW" czyta `useStationDerStore`, aby pokazać układy
 * przyłączeniowe przypięte do tej stacji oraz otwiera właściwe powierzchnie
 * konfiguracji z zachowaniem kontekstu stacji.
 *
 * Punkt 3 Phase 4: konfiguracja audytu 2 (mvNeutralGroundingRef etc.)
 * pull-from-backend przez `useStationAudit2Config` + UPSERT przez
 * `useUpdateStationAudit2Config` (React Query, optimistic updates).
 */

import { atrybutRoliAkcji, klasaAkcji } from '../../shared/akcjeStanow';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStateStore } from '../../app-state';

import {
  StationConfigurator,
  type StationConfigCardId,
} from '../../network-build/station-configurator/StationConfigurator';
import type { StationConfigBayRow } from '../../network-build/station-configurator/cards/StationConfigBaysCard';
import type { StationConfigPortRow } from '../../network-build/station-configurator/cards/StationConfigTopologyCard';
import type { ProtectionRow } from '../../network-build/station-configurator/cards/StationConfigProtectionCard';
import type {
  StationConfigTransformerRow,
  StationTransformerCatalogOption,
} from '../../network-build/station-configurator/cards/StationConfigTransformerCard';
import {
  AddDerWizard,
  deryStacjiZModelu,
  mergeStationDers,
  useAudit2CatalogSnapshot,
  useNcRfgOperatorCatalog,
  useStationAudit2Config,
  useStationDerStore,
  useUpdateStationAudit2Config,
  selectDersOfStation,
  type StationDerConnection,
} from '../../network-build/station-der';
import type { AddDerKindRequest } from '../../network-build/station-configurator/cards/StationConfigDerSourcesCard';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { stationSnFieldSpecs, stationSnapshotBays } from '../../network-build/stationSnFields';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { notify } from '../../notifications/store';
import { navigateToAnalysis } from '../../navigation/routes';
import { stationPublicIdentity } from '../../shared/publicTechnicalLabels';
import { buildCatalogBinding, CANONICAL_CATALOG_VERSION } from '../../catalog/catalogBinding';
import { fetchTransformerTypes, getCatalogErrorMessage } from '../../catalog/api';
import type { TransformerType } from '../../catalog/types';
import type { WorkspaceSurfaceDescriptor } from '../types';
import { selectStationDistributionTransformers } from '../../network-build/stationTransformerSelection';
import type {
  Bay,
  EnergyNetworkModel,
  Substation,
  Transformer,
} from '../../../types/enm';
import { buildOperationContext } from '../../network-build/operationContext';
import { BAY_ROLE_TO_PORT_KIND, type PortKind } from '../../sld/v2/core/ports';

interface StationConfiguratorSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

/**
 * Konfiguracja stacji audytu 2 — projekcja na potrzeby Surface.
 *
 * Punkt 3: dane plyną przez React Query z backendu (`station_audit2_configs`).
 * Optimistic updates przez `useUpdateStationAudit2Config`.
 */
interface StationLocalConfig {
  readonly mvNeutralGroundingRef: string | null;
}

/** Minimalne propsy konfiguratora — używane gdy brak danych snapshot. */
function buildBaseStationProps(stationName: string, localConfig: StationLocalConfig) {
  return {
    basic: {
      stationName,
      topologicalType: 'końcowa' as const,
      constructionType: 'kontenerowa' as const,
      snVoltageKv: 15,
      nnVoltageLevels: [0.4],
      completeness: 'missing' as const,
      mvNeutralGroundingRef: localConfig.mvNeutralGroundingRef,
      // Karta FAB-L: nadpisane niżej danymi ze snapshotu audytu 2 — pusta
      // lista jest stanem PRZED pobraniem, nie brakiem katalogu.
      mvNeutralGroundings: [],
    },
    topology: {
      externalPorts: [],
      errors: [],
      endToEndConnectionsCount: 0,
      missingEndpointsCount: 0,
    },
    snSwitchgear: {
      layout: 'sectioned_busbar' as const,
      nominalVoltageKv: 15,
      nominalCurrentA: 630,
      nominalShortCircuitKa: 16,
      sectionsCount: 1,
      hasCoupler: false,
      baysCount: 0,
      reservesCount: 0,
      readinessLabelPl: 'do konfiguracji',
    },
    bays: { bays: [] },
    // Karta FAB-L: `tapChangers` nadpisane niżej danymi ze snapshotu audytu 2.
    transformer: { transformers: [], availableLvVoltages: [0.4], tapChangers: [] },
    // Krok "Strona nN" zawiera rozdzielnice nN i odbiory techniczne.
    nnSwitchgear: { switchgears: [], loads: [] },
    protection: {
      relays: [],
      automation: [],
      interlocksConfigured: false,
      controlMode: 'lokalne' as const,
      // Pakiet G: typ uziemienia synchronizowany z karty 1 (basic).
      mvNeutralGroundingType: mapGroundingRefToType(localConfig.mvNeutralGroundingRef),
      deviceWithstandRows: [],
    },
    measurements: { cts: [], vts: [], metersCount: 0, telemetryCount: 0 },
    readiness: { items: [] },
  };
}

/** Mapowanie catalog_ref do typu uziemienia (dla ProtectionCard validation). */
function mapGroundingRefToType(
  ref: string | null,
): 'isolated' | 'petersen_coil' | 'resistor_grounded' | 'directly_grounded' | undefined {
  if (!ref) return undefined;
  if (ref === 'mng_isolated') return 'isolated';
  if (ref === 'mng_petersen') return 'petersen_coil';
  if (ref.startsWith('mng_resistor')) return 'resistor_grounded';
  if (ref === 'mng_directly') return 'directly_grounded';
  return undefined;
}

/** Mapowanie rodzaju DER → screenCode konfiguratora. */
const DER_KIND_TO_SCREEN: Record<AddDerKindRequest, 'E-21' | 'E-22' | 'E-23'> = {
  PV: 'E-21',
  BESS: 'E-22',
  FW: 'E-23',
};

function readAddDerKindRequest(value: unknown): AddDerKindRequest | null {
  return value === 'PV' || value === 'BESS' || value === 'FW' ? value : null;
}

// ZERO DOMYSLNEGO OPERATORA I NAPIECIA (V12K-245, dokonczenie V12K-236).
// Ten ekran podstawial wytworcy BEZ profilu w modelu zestaw ENEA (`ncrfg_enea`) oraz
// poziom napiecia 0,4 kV. Kazdy z pieciu obslugiwanych OSD ma wlasne krzywe LVRT/HVRT
// i wlasne wymagania Q(U), wiec podstawienie fabrykowalo OPERATORA — dana, ktorej model
// nie niesie. Backend takiego domyslu nie robi (`load_nc_rfg_profile` odrzuca nieznanego
// operatora wyjatkiem). V12K-236 usunelo ten domysl z powierzchni E-2x, ale TU zostal —
// inwentarz miejsc byl niepelny. Brak zostaje BRAKIEM i nazywa go regula gotowosci.
const DEFAULT_BRANCH_CABLE_SEGMENT = {
  rodzaj: 'KABEL',
  dlugosc_m: 1000,
  catalog_binding: {
    catalog_namespace: 'KABEL_SN',
    catalog_item_id: 'cable-enea-operator-na2xs2y-1x150',
    catalog_item_version: CANONICAL_CATALOG_VERSION,
    materialize: true,
    snapshot_mapping_version: '1.0',
  },
  catalog_label: '3 × NA2XS2Y 1×150/25 mm²',
  type_designation: 'NA2XS2Y 1×150/25 mm²',
  trade_name: 'NA2XS2Y 1x150/25',
  cross_section_mm2: 150,
  return_conductor_cross_section_mm2: 25,
} as const;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const TRANSFORMER_SN_VOLTAGE_TOLERANCE_KV = 0.5;
const TRANSFORMER_NN_VOLTAGE_TOLERANCE_KV = 0.05;

function catalogItemIdFromRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? trimmed;
}

function voltageMatchesCatalog(
  left: number,
  right: number,
  toleranceKv: number,
): boolean {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= toleranceKv;
}

function transformerCatalogMatchesRef(type: TransformerType, ref: string | null | undefined): boolean {
  const itemId = catalogItemIdFromRef(ref);
  return Boolean(itemId && (type.id === itemId || type.id === ref));
}

function isTransformerCatalogVoltageCompatible(
  type: TransformerType,
  transformer: Pick<StationConfigTransformerRow, 'uhvKv' | 'ulvKv'>,
): boolean {
  return (
    voltageMatchesCatalog(type.voltage_hv_kv, transformer.uhvKv, TRANSFORMER_SN_VOLTAGE_TOLERANCE_KV)
    && voltageMatchesCatalog(type.voltage_lv_kv, transformer.ulvKv, TRANSFORMER_NN_VOLTAGE_TOLERANCE_KV)
  );
}

function formatMva(value: number): string {
  return value.toLocaleString('pl-PL', { maximumFractionDigits: 3 });
}

function buildTransformerCatalogSummary(
  type: TransformerType,
  transformer: StationConfigTransformerRow,
): string {
  const target = transformer.snMva;
  const powerStatus =
    target == null || target <= 0
      ? 'moc wg bilansu'
      : type.rated_power_mva >= target
        ? `zapas ${formatMva(type.rated_power_mva - target)} MVA`
        : `za mały o ${formatMva(target - type.rated_power_mva)} MVA`;
  return [
    `${formatMva(type.rated_power_mva)} MVA`,
    `${type.voltage_hv_kv}/${type.voltage_lv_kv} kV`,
    type.vector_group,
    `uk ${type.uk_percent}%`,
    `Pk ${type.pk_kw} kW`,
    powerStatus,
  ].join(' · ');
}

function compareTransformerCatalogTypes(
  transformer: StationConfigTransformerRow,
): (left: TransformerType, right: TransformerType) => number {
  const target = transformer.snMva;
  const expectedVector = transformer.vectorGroup?.trim().toUpperCase() ?? '';
  return (left, right) => {
    if (target != null && target > 0) {
      const leftAdequate = left.rated_power_mva >= target;
      const rightAdequate = right.rated_power_mva >= target;
      if (leftAdequate !== rightAdequate) return leftAdequate ? -1 : 1;
      const leftGap = Math.abs(left.rated_power_mva - target);
      const rightGap = Math.abs(right.rated_power_mva - target);
      if (leftGap !== rightGap) return leftGap - rightGap;
    }

    const leftVectorMatch = expectedVector && left.vector_group.toUpperCase() === expectedVector;
    const rightVectorMatch = expectedVector && right.vector_group.toUpperCase() === expectedVector;
    if (leftVectorMatch !== rightVectorMatch) return leftVectorMatch ? -1 : 1;

    const leftLosses = (left.pk_kw ?? 0) + (left.p0_kw ?? 0);
    const rightLosses = (right.pk_kw ?? 0) + (right.p0_kw ?? 0);
    if (leftLosses !== rightLosses) return leftLosses - rightLosses;

    return left.rated_power_mva - right.rated_power_mva
      || left.name.localeCompare(right.name, 'pl-PL')
      || left.id.localeCompare(right.id);
  };
}

function buildTransformerCatalogOptionsById(
  transformerTypes: readonly TransformerType[],
  transformers: readonly StationConfigTransformerRow[],
): Record<string, StationTransformerCatalogOption[]> {
  const optionsById: Record<string, StationTransformerCatalogOption[]> = {};
  for (const transformer of transformers) {
    const compatible = transformerTypes
      .filter((type) => isTransformerCatalogVoltageCompatible(type, transformer))
      .sort(compareTransformerCatalogTypes(transformer));
    const selected = transformerTypes.find((type) =>
      transformerCatalogMatchesRef(type, transformer.catalogRef),
    );
    const selectedOutsideCompatible =
      selected && !compatible.some((type) => type.id === selected.id) ? [selected] : [];
    const recommendedId = compatible[0]?.id ?? selected?.id ?? null;
    optionsById[transformer.transformerId] = [...compatible, ...selectedOutsideCompatible].map(
      (type) => ({
        id: type.id,
        name: type.name,
        manufacturer: type.manufacturer,
        summary: buildTransformerCatalogSummary(type, transformer),
        ratedPowerMva: type.rated_power_mva,
        voltageHvKv: type.voltage_hv_kv,
        voltageLvKv: type.voltage_lv_kv,
        ukPercent: type.uk_percent,
        pkKw: type.pk_kw,
        p0Kw: type.p0_kw,
        vectorGroup: type.vector_group,
        adequatePower:
          transformer.snMva == null
          || transformer.snMva <= 0
          || type.rated_power_mva >= transformer.snMva,
        recommended: type.id === recommendedId,
      }),
    );
  }
  return optionsById;
}

// Odwzorowanie generatorów migawki na rekordy warsztatu wytwórców przeniesione
// do `network-build/station-der/zModelu` — czyta je TAKŻE synchronizacja powłoki
// (ekrany strumienia OZE), więc nie może mieszkać w jednej powierzchni.

function findStation(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null,
): Substation | null {
  if (!snapshot || !stationRef) return null;
  return (snapshot.substations ?? []).find(
    (station) => station.ref_id === stationRef || station.id === stationRef,
  ) ?? null;
}

function stationTopologicalType(
  stationType: Substation['station_type'] | null | undefined,
): 'końcowa' | 'przelotowa' | 'odgałęźna' | 'sekcyjna' {
  switch (stationType) {
    case 'terminal':
      return 'końcowa';
    case 'branch':
      return 'odgałęźna';
    case 'sectional':
      return 'sekcyjna';
    case 'inline':
    case 'mv_lv':
    case 'customer':
    case 'switching':
    default:
      return 'przelotowa';
  }
}

function bayTypePlFromRole(role: string | null | undefined): StationConfigBayRow['bayTypePl'] {
  switch ((role ?? '').toUpperCase()) {
    case 'IN':
      return 'liniowe wejściowe';
    case 'OUT':
    case 'FEEDER':
      return 'liniowe wyjściowe';
    case 'TR':
      return 'transformatorowe';
    case 'COUPLER':
      return 'sprzęgłowe';
    case 'MEASUREMENT':
      return 'pomiarowe';
    case 'OZE':
      return 'PV/FV';
    default:
      return 'rezerwowe';
  }
}

function bayDesignation(bay: Bay, index: number): string {
  return bay.bay_number ?? bay.feeder_short_name ?? bay.name ?? `Pole ${index + 1}`;
}

function portKindFromBayRole(role: unknown): PortKind {
  const normalized = typeof role === 'string' ? role.toUpperCase() : '';
  if (normalized === 'BRANCH') return 'sn_branch';
  return BAY_ROLE_TO_PORT_KIND[normalized] ?? 'sn_reserve';
}

function publicPortId(kind: PortKind, index: number): string {
  switch (kind) {
    case 'sn_input':
      return `WE-${index}`;
    case 'sn_output':
      return `WY-${index}`;
    case 'sn_branch':
      return `ODG-${index}`;
    case 'sn_transformer':
      return `TR-${index}`;
    case 'sn_coupler':
      return `SPR-${index}`;
    case 'sn_measurement':
      return `POM-${index}`;
    case 'sn_der_pv':
      return `OZE-${index}`;
    case 'sn_der_bess':
      return `BESS-${index}`;
    case 'sn_der_fw':
      return `FW-${index}`;
    case 'nn_der_pv':
      return `nN-PV-${index}`;
    case 'nn_der_bess':
      return `nN-BESS-${index}`;
    case 'nn_der_fw':
      return `nN-FW-${index}`;
    default:
      return `REZ-${index}`;
  }
}

function occupiedLabelForPort(kind: PortKind, bay?: Bay): string | null {
  switch (kind) {
    case 'sn_input':
      return 'tor zasilający SN';
    case 'sn_output':
      return bay?.outgoing_destination_ref ? 'ciąg wyjściowy SN' : null;
    case 'sn_branch':
      return 'odgałęzienie SN';
    case 'sn_transformer':
      return 'transformator stacji';
    case 'sn_coupler':
      return 'sprzęgło sekcji';
    case 'sn_measurement':
      return 'układ pomiarowy';
    case 'sn_der_pv':
      return 'przyłącze PV';
    case 'sn_der_bess':
      return 'przyłącze BESS';
    case 'sn_der_fw':
      return 'przyłącze FW';
    default:
      return null;
  }
}

function transformerShortLabel(transformer: Transformer | null): string | null {
  if (!transformer) return null;
  const voltage = `${transformer.uhv_kv.toLocaleString('pl-PL')}/${transformer.ulv_kv.toLocaleString('pl-PL')} kV`;
  const power = `${Math.round(transformer.sn_mva * 1000).toLocaleString('pl-PL')} kVA`;
  const group = transformer.vector_group ? ` ${transformer.vector_group}` : '';
  return `${voltage} ${power}${group}`;
}

function derConnectionPortKind(der: StationDerConnection): PortKind {
  if (der.connection_side === 'nN') {
    return der.der_kind === 'BESS' ? 'nn_der_bess' : der.der_kind === 'FW' ? 'nn_der_fw' : 'nn_der_pv';
  }
  return der.der_kind === 'BESS' ? 'sn_der_bess' : der.der_kind === 'FW' ? 'sn_der_fw' : 'sn_der_pv';
}

function derConnectionPortLabel(
  der: StationDerConnection,
  snapshot: EnergyNetworkModel | null,
): string {
  const powerMw = typeof der.nominal_power_kw === 'number' ? der.nominal_power_kw / 1000 : 0;
  const power = `${powerMw.toLocaleString('pl-PL', { maximumFractionDigits: 3 })} MW`;
  if (der.connection_side === 'dedicated_transformer') {
    const transformer = (snapshot?.transformers ?? []).find(
      (candidate) => candidate.ref_id === der.transformer_ref || candidate.id === der.transformer_ref,
    ) ?? null;
    const transformerLabel = transformerShortLabel(transformer);
    return transformerLabel
      ? `${der.der_kind} ${power} przez transformator blokowy ${transformerLabel}`
      : `${der.der_kind} ${power} przez transformator blokowy`;
  }
  return `${der.der_kind} ${power}`;
}

function isPortExpectedToBeBound(kind: PortKind): boolean {
  return kind !== 'sn_reserve' && !kind.startsWith('nn_');
}

function deriveStationPortRows(
  snapshot: EnergyNetworkModel | null,
  station: Substation | null,
  nominalVoltageKv: number,
  stationDers: readonly StationDerConnection[] = [],
): StationConfigPortRow[] {
  if (!station) return [];

  const counters = new Map<PortKind, number>();
  const nextPortId = (kind: PortKind): string => {
    const next = (counters.get(kind) ?? 0) + 1;
    counters.set(kind, next);
    return publicPortId(kind, next);
  };

  const snapshotBays = stationSnapshotBays(snapshot?.bays ?? [], station);
  const derPorts = stationDers
    .map((der): StationConfigPortRow => {
      const kind = derConnectionPortKind(der);
      return {
        portId: nextPortId(kind),
        kind,
        nominalVoltageKv: kind.startsWith('nn_') ? inferDerBusVoltage(snapshot, der) ?? 0.4 : nominalVoltageKv,
        bayDesignation: der.name,
        occupiedByLabelPl: derConnectionPortLabel(der, snapshot),
      };
    })

  if (snapshotBays.length > 0) {
    const bayPorts = snapshotBays.map((bay, index) => {
      const kind = portKindFromBayRole(bay.bay_role);
      return {
        portId: nextPortId(kind),
        kind,
        nominalVoltageKv,
        bayDesignation: bayDesignation(bay, index),
        occupiedByLabelPl: occupiedLabelForPort(kind, bay),
      };
    });
    return [...bayPorts, ...derPorts];
  }

  const stationFieldPorts = stationSnFieldSpecs(station).map((field, index) => {
    const kind = portKindFromBayRole(field.bay_role);
    return {
      portId: nextPortId(kind),
      kind,
      nominalVoltageKv,
      bayDesignation: String(field.name ?? `Pole ${index + 1}`),
      occupiedByLabelPl: occupiedLabelForPort(kind),
    };
  });
  return [...stationFieldPorts, ...derPorts];
}

function inferDerBusVoltage(
  snapshot: EnergyNetworkModel | null,
  der: StationDerConnection,
): number | null {
  const busRef = der.lv_busbar_ref ?? der.bus_przylaczenia_ref;
  const bus = (snapshot?.buses ?? []).find((candidate) => candidate.ref_id === busRef);
  return typeof bus?.voltage_kv === 'number' ? bus.voltage_kv : null;
}

function deriveStationBayRows(
  snapshot: EnergyNetworkModel | null,
  station: Substation | null,
): StationConfigBayRow[] {
  if (!station) return [];
  const snapshotBays = stationSnapshotBays(snapshot?.bays ?? [], station);
  if (snapshotBays.length > 0) {
    return snapshotBays.map((bay, index) => ({
      bayId: bay.ref_id ?? bay.id ?? `bay-${index}`,
      designation: bayDesignation(bay, index),
      bayTypePl: bayTypePlFromRole(bay.bay_role),
      attachedObjectPl: bay.outgoing_destination_ref ?? undefined,
      hasEquipment: (bay.equipment_refs ?? []).length > 0,
      hasProtection: Boolean(bay.protection_ref),
      hasMeasurements: true,
      statusPl: 'kompletne',
      hvFuseCatalogRef: null,
    }));
  }

  return stationSnFieldSpecs(station).map((field, index) => ({
    bayId: String(field.ref_id ?? field.field_ref ?? field.id ?? `field-${index}`),
    designation: String(field.name ?? `Pole ${index + 1}`),
    bayTypePl: bayTypePlFromRole(String(field.bay_role ?? '')),
    hasEquipment: true,
    hasProtection: true,
    hasMeasurements: true,
    statusPl: 'kompletne',
    hvFuseCatalogRef: null,
  }));
}

function deriveStationTransformerRows(
  snapshot: EnergyNetworkModel | null,
  station: Substation | null,
): StationConfigTransformerRow[] {
  if (!snapshot || !station) return [];

  return selectStationDistributionTransformers(snapshot, station).map((transformer, index) => ({
    transformerId: transformer.ref_id ?? transformer.id ?? `tr-${index}`,
    designation: transformer.name ?? `TR ${index + 1}`,
    catalogRef: transformer.catalog_ref ?? null,
    snMva: transformer.sn_mva ?? null,
    uhvKv: transformer.uhv_kv,
    ulvKv: transformer.ulv_kv,
    vectorGroup: transformer.vector_group ?? null,
    ukPercent: transformer.uk_percent ?? null,
    pkKw: transformer.pk_kw ?? null,
    p0Kw: transformer.p0_kw ?? null,
    tapPosition: transformer.tap_position ?? null,
    tapMin: transformer.tap_min ?? null,
    tapMax: transformer.tap_max ?? null,
    tapChangerCatalogRef: null,
    hvNeutralLabelPl: transformer.hv_neutral?.type ?? null,
    lvNeutralLabelPl: transformer.lv_neutral?.type ?? null,
    statusForSc: transformer.uk_percent ? 'gotowe' : 'częściowe',
    statusForPf: transformer.sn_mva ? 'gotowe' : 'częściowe',
    statusForAsymmetry: transformer.vector_group ? 'gotowe' : 'częściowe',
  }));
}

function uniqueLvVoltages(transformers: readonly StationConfigTransformerRow[]): number[] {
  const values = transformers.map((transformer) => transformer.ulvKv).filter(Number.isFinite);
  return values.length > 0 ? Array.from(new Set(values)).sort((a, b) => a - b) : [0.4];
}

const SUPPORTED_STATION_DEFAULT_CARDS = new Set<StationConfigCardId>([
  'basic',
  'sn-switchgear',
  'bays',
  'apparatus',
  'ct',
  'vt',
  'measurements',
  'transformer',
  'earthing',
  'nn-switchgear',
  'der-sources',
  'power-quality',
  'protection',
  'nc-rfg',
  'infrastructure',
  'network-analysis',
  'readiness',
  'topology',
]);

function stationDefaultCard(surface: WorkspaceSurfaceDescriptor): StationConfigCardId {
  const payload = surface.routeState?.payload;
  const defaultCard = payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>).defaultCard
    : null;
  if (
    typeof defaultCard === 'string'
    && SUPPORTED_STATION_DEFAULT_CARDS.has(defaultCard as StationConfigCardId)
  ) {
    return defaultCard as StationConfigCardId;
  }
  return 'basic';
}

function hasContinuationStart(context: Record<string, unknown>): boolean {
  const keys = ['from_terminal_id', 'terminal_id', 'terminalId', 'field_ref'];
  return keys.some((key) => {
    const value = context[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function hasBranchStart(context: Record<string, unknown>): boolean {
  const fromRef = context.from_ref;
  const fromBusRef = context.from_bus_ref;
  return (
    typeof fromRef === 'string'
    && fromRef.trim().length > 0
    && typeof fromBusRef === 'string'
    && fromBusRef.trim().length > 0
  );
}

export function StationConfiguratorSurface(props: StationConfiguratorSurfaceProps): JSX.Element {
  const { surface } = props;
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const logicalViews = useSnapshotStore((state) => state.logicalViews);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const stationRef = surface.entityRef ?? null;
  const localDers = useStationDerStore((state) =>
    stationRef ? selectDersOfStation(state, stationRef) : [],
  );
  const detachDer = useStationDerStore((state) => state.detachDer);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const projectId = useAppStateStore((state) => state.activeProjectId);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const defaultCard = useMemo(() => stationDefaultCard(surface), [surface]);
  // Karta FAB-J: snapshot audytu 2 dla inferencji transformatora dedykowanego
  // (`inferBlockTransformerCatalogRef`) — bez niego wytwórcy legacy bez
  // `meta.block_transformer_catalog_ref` nie dostaną wywnioskowanej pozycji.
  // Karta FAB-L: TEN SAM snapshot niesie też `mv_neutral_groundings`/
  // `tap_changers` — zero drugiego zapytania sieciowego dla katalogów, które
  // konfigurator już potrzebuje (Karta 1/Uziemienie, Karta 5 transformatora).
  const audit2CatalogSnapshotQuery = useAudit2CatalogSnapshot();
  const blockTransformers = audit2CatalogSnapshotQuery.data?.block_transformers ?? [];
  const mvNeutralGroundings = audit2CatalogSnapshotQuery.data?.mv_neutral_groundings ?? [];
  const tapChangers = audit2CatalogSnapshotQuery.data?.tap_changers ?? [];
  const ncRfgOperators = useNcRfgOperatorCatalog().data ?? [];
  const snapshotDers = useMemo(
    () => deryStacjiZModelu(snapshot, stationRef, projectId, blockTransformers),
    [snapshot, stationRef, projectId, blockTransformers],
  );
  const ders = useMemo(
    () => mergeStationDers(snapshotDers, localDers),
    [snapshotDers, localDers],
  );

  const [pendingDetach, setPendingDetach] = useState<{ derId: string; name: string } | null>(null);
  const [wizardKind, setWizardKind] = useState<AddDerKindRequest | null>(null);
  const [wizardResetKey, setWizardResetKey] = useState(0);
  const [transformerTypes, setTransformerTypes] = useState<TransformerType[]>([]);
  const [transformerCatalogLoading, setTransformerCatalogLoading] = useState(false);
  const [transformerCatalogError, setTransformerCatalogError] = useState<string | null>(null);
  const requestedAddDerKind = readAddDerKindRequest(surface.routeState.payload?.addDerKind);
  const requestedAddDerToken = readString(surface.routeState.payload?.addDerRequestId);

  const openDerWizard = useCallback((kind: AddDerKindRequest) => {
    setWizardKind(kind);
    setWizardResetKey((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTransformerCatalogLoading(true);
    void fetchTransformerTypes()
      .then((types) => {
        if (cancelled) return;
        setTransformerTypes(types);
        setTransformerCatalogError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setTransformerTypes([]);
          setTransformerCatalogError(getCatalogErrorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTransformerCatalogLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Punkt 3 Phase 4: pull konfiguracji audytu 2 z backendu (React Query).
  const audit2Config = useStationAudit2Config(projectId, stationRef);
  const updateAudit2Config = useUpdateStationAudit2Config();
  const localConfig: StationLocalConfig = useMemo(
    () => ({
      mvNeutralGroundingRef: audit2Config.data?.mv_neutral_grounding_ref ?? null,
    }),
    [audit2Config.data?.mv_neutral_grounding_ref],
  );

  // Punkt 3 Phase 5: sync der_specs -> backend gdy DERs zmieniaja sie w lokalnym
  // Zustand store. Zustand pozostaje dla SLD rendering (kompatybilnosc z istniejacym
  // kodem); backend persystuje audit2-specific pola (BESS modes, transformator dedykowany, P(f)).
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('mvdesignpro:station-configurator-opened', {
        detail: { stationId: stationRef },
      }),
    );
  }, [stationRef]);

  useEffect(() => {
    if (!projectId || !stationRef || !audit2Config.data) return;
    const targetDerSpecs = ders.map((d) => ({
      der_id: d.id,
      der_kind: d.der_kind,
      bess_operation_mode_refs: d.profiles.bess_operation_mode_refs ?? [],
      block_transformer_catalog_ref: d.catalogs.block_transformer_catalog_ref ?? null,
      pf_curve_ref: d.profiles.pf_curve_ref ?? null,
      // Phase 23: real device + nominal power (z catalogu, projekcja deterministic).
      device_catalog_ref: d.catalogs.device_catalog_ref ?? null,
      nominal_power_kw: d.nominal_power_kw,
    }));
    const currentDerSpecs = audit2Config.data.der_specs;
    // Compare by serialization — proste i deterministyczne.
    if (JSON.stringify(targetDerSpecs) === JSON.stringify(currentDerSpecs)) return;
    updateAudit2Config.mutate({
      projectId,
      stationId: stationRef,
      body: {
        mv_neutral_grounding_ref: audit2Config.data.mv_neutral_grounding_ref,
        tap_changer_refs: audit2Config.data.tap_changer_refs,
        der_specs: targetDerSpecs,
      },
    });
  }, [ders, projectId, stationRef, audit2Config.data]);

  // Nasłuch event'a wystawianego przez DerSourcesCard.
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ stationId: string; kind: AddDerKindRequest }>).detail;
      if (detail?.stationId === stationRef && detail.kind) {
        openDerWizard(detail.kind);
      }
    };
    window.addEventListener('mvdesignpro:add-der-request', listener);
    return () => window.removeEventListener('mvdesignpro:add-der-request', listener);
  }, [openDerWizard, stationRef]);

  useEffect(() => {
    if (!stationRef || !requestedAddDerKind) return;
    openDerWizard(requestedAddDerKind);
  }, [openDerWizard, stationRef, requestedAddDerKind, requestedAddDerToken]);

  const station = useMemo(
    () => findStation(snapshot, stationRef),
    [snapshot, stationRef],
  );
  const stationBays = useMemo(
    () => deriveStationBayRows(snapshot, station),
    [snapshot, station],
  );
  const stationTransformers = useMemo(
    () => deriveStationTransformerRows(snapshot, station),
    [snapshot, station],
  );
  const stationLvVoltages = useMemo(
    () => uniqueLvVoltages(stationTransformers),
    [stationTransformers],
  );
  const stationTransformerCatalogOptions = useMemo(
    () => buildTransformerCatalogOptionsById(transformerTypes, stationTransformers),
    [stationTransformers, transformerTypes],
  );
  const stationSnVoltageKv = useMemo(() => {
    const busRefs = new Set(station?.bus_refs ?? []);
    const bus = (snapshot?.buses ?? []).find(
      (candidate) => busRefs.has(candidate.ref_id) && candidate.voltage_kv > 1,
    );
    return bus?.voltage_kv ?? stationTransformers[0]?.uhvKv ?? 15;
  }, [snapshot?.buses, station?.bus_refs, stationTransformers]);
  const stationPorts = useMemo(
    () => deriveStationPortRows(snapshot, station, stationSnVoltageKv, ders),
    [snapshot, station, stationSnVoltageKv, ders],
  );

  const stationName = useMemo(() => {
    if (!stationRef) return 'Stacja niewybrana';
    if (!snapshot) return 'Wybrana stacja';
    return station ? stationPublicIdentity(snapshot, station).displayName : 'Wybrana stacja';
  }, [station, stationRef, snapshot]);

  const continuationContext = useMemo(() => {
    if (!stationRef) return null;
    const context = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: stationRef,
      elementType: 'Station',
      snapshot,
      logicalViews,
      extraContext: {
        station_ref: stationRef,
        station_name: stationName,
      },
    });
    return hasContinuationStart(context) ? context : null;
  }, [logicalViews, snapshot, stationName, stationRef]);

  const handleOpenDer = useCallback(
    (derId: string, derKind: AddDerKindRequest) => {
      const screenCode = DER_KIND_TO_SCREEN[derKind];
      openRouteSurface(screenCode, {
        entityRef: derId,
        subjectKind: 'helper_context',
        payload: { stationId: stationRef ?? null },
      });
    },
    [openRouteSurface, stationRef],
  );

  const handleAddDer = useCallback(
    (kind: AddDerKindRequest) => {
      if (!stationRef) {
        notify('Wybierz stację, aby dodać źródło lub magazyn.', 'warning');
        return;
      }
      openDerWizard(kind);
    },
    [openDerWizard, stationRef],
  );

  const handleAddTransformer = useCallback(() => {
    if (!stationRef) {
      notify('Wybierz stację SN/nN, aby dodać transformator z katalogu.', 'warning');
      return;
    }
    const context = buildOperationContext({
      canonicalOp: 'add_transformer_sn_nn',
      elementId: stationRef,
      elementType: 'Station',
      snapshot,
      logicalViews,
      extraContext: {
        station_ref: stationRef,
        station_name: stationName,
      },
    });
    openOperationForm('add_transformer_sn_nn', context);
  }, [logicalViews, openOperationForm, snapshot, stationName, stationRef]);

  const handleContinueTrunk = useCallback(() => {
    if (!stationRef) {
      notify('Wybierz stację SN/nN osadzoną w ciągu, aby kontynuować magistralę.', 'warning');
      return;
    }
    if (!continuationContext) {
      notify(
        'Nie znaleziono wolnego portu wyjściowego SN dla tej stacji. Wybierz stację wpiętą w ciąg albo pole wyjściowe SN.',
        'warning',
      );
      return;
    }
    openOperationForm('continue_trunk_segment_sn', continuationContext);
  }, [continuationContext, openOperationForm, stationRef]);

  const branchStartContext = useMemo(() => {
    if (!stationRef) return null;
    const context = buildOperationContext({
      canonicalOp: 'start_branch_segment_sn',
      elementId: stationRef,
      elementType: 'Station',
      snapshot,
      logicalViews,
      extraContext: {
        station_ref: stationRef,
        station_name: stationName,
        segment: DEFAULT_BRANCH_CABLE_SEGMENT,
        segment_type: 'cable',
        segment_kind: 'KABEL',
      },
    });
    return hasBranchStart(context) ? context : null;
  }, [logicalViews, snapshot, stationName, stationRef]);

  const continuationBlockReason = continuationContext
    ? null
    : 'Brak wolnego portu wyjściowego SN. Dodaj pole WY/ODG albo wybierz stację przelotową z wolnym terminalem.';
  const branchBlockReason = branchStartContext
    ? null
    : 'Brak wolnego pola odgałęźnego SN. Dodaj pole ODG albo wybierz stację/ZKSN z takim portem.';

  const handleStartBranch = useCallback(() => {
    if (!stationRef) {
      notify('Wybierz stację z wolnym polem odgałęźnym SN.', 'warning');
      return;
    }
    if (!branchStartContext) {
      notify(
        'Ta stacja nie ma wolnego pola odgałęźnego SN. Odgałęzienie wyprowadź z pola ODG albo ZKSN.',
        'warning',
      );
      return;
    }
    openOperationForm('start_branch_segment_sn', branchStartContext);
  }, [branchStartContext, openOperationForm, stationRef]);

  const handleAssignTransformerCatalog = useCallback(
    async (transformerId: string, catalogRef: string | null | undefined) => {
      if (!catalogRef) return;
      if (!activeCaseId) {
        notify('Wybierz aktywny przypadek obliczeniowy.', 'warning');
        return;
      }
      const selectedType = transformerTypes.find((type) =>
        transformerCatalogMatchesRef(type, catalogRef),
      );
      if (!selectedType) {
        notify('Wybrana pozycja katalogowa transformatora nie jest dostępna.', 'error');
        return;
      }
      const transformer = stationTransformers.find((item) => item.transformerId === transformerId);
      if (transformer && !isTransformerCatalogVoltageCompatible(selectedType, transformer)) {
        notify('Transformator katalogowy nie pasuje do napięcia SN/nN tej stacji.', 'warning');
        return;
      }

      try {
        const response = await executeDomainOperation(activeCaseId, 'assign_catalog_to_element', {
          element_ref: transformerId,
          catalog_binding: buildCatalogBinding('TRAFO_SN_NN', selectedType.id),
          source_mode: 'KATALOG',
        });
        if (response?.error) {
          notify(response.error, 'error');
        }
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : 'Nie udało się przypisać katalogu transformatora.',
          'error',
        );
      }
    },
    [activeCaseId, executeDomainOperation, stationTransformers, transformerTypes],
  );

  const handleShowOnSld = useCallback(
    (derId: string) => {
      // Naprawa hmi.1: przekazujemy derId jako entityRef do SLD aby skupić
      // kamerę na DER (selection). SldWorkspaceContainer odczytuje
      // routeState.payload.focusElementRef.
      openRouteSurface('E-01', {
        entityRef: derId,
        subjectKind: 'helper_context',
        payload: { focusElementRef: derId, stationId: stationRef ?? null },
      });
    },
    [openRouteSurface, stationRef],
  );

  const handleOpenCalculations = useCallback(() => {
    navigateToAnalysis({
      caseId: activeCaseId,
      runId: activeRunId,
      selectionId: stationRef,
    });
  }, [activeCaseId, activeRunId, stationRef]);

  const requestDetach = useCallback(
    (derId: string) => {
      const der = localDers.find((d) => d.id === derId);
      if (!der) return;
      setPendingDetach({ derId, name: der.name });
    },
    [localDers],
  );

  const confirmDetach = useCallback(() => {
    if (!pendingDetach) return;
    detachDer(pendingDetach.derId);
    notify(`Odłączono "${pendingDetach.name}" od stacji.`, 'info');
    setPendingDetach(null);
  }, [pendingDetach, detachDer]);

  // Phase 8: helper do mutacji audit2 config (centralizuje budowe body).
  const mutateAudit2 = useCallback(
    (patch: Partial<{
      mv_neutral_grounding_ref: string | null;
      tap_changer_refs: readonly string[];
      transformer_tap_changers: Record<string, string>;
      bay_hv_fuses: Record<string, string>;
      bay_vts: Record<string, string>;
    }>) => {
      if (!projectId || !stationRef) {
        notify('Najpierw wybierz aktywny projekt i stację.', 'warning');
        return;
      }
      const current = audit2Config.data;
      updateAudit2Config.mutate({
        projectId,
        stationId: stationRef,
        body: {
          mv_neutral_grounding_ref:
            patch.mv_neutral_grounding_ref !== undefined
              ? patch.mv_neutral_grounding_ref
              : current?.mv_neutral_grounding_ref ?? null,
          tap_changer_refs: [...(patch.tap_changer_refs ?? current?.tap_changer_refs ?? [])],
          der_specs: current?.der_specs ?? [],
          transformer_tap_changers: {
            ...(current?.transformer_tap_changers ?? {}),
            ...(patch.transformer_tap_changers ?? {}),
          },
          bay_hv_fuses: {
            ...(current?.bay_hv_fuses ?? {}),
            ...(patch.bay_hv_fuses ?? {}),
          },
          bay_vts: {
            ...(current?.bay_vts ?? {}),
            ...(patch.bay_vts ?? {}),
          },
          bay_device_withstand: current?.bay_device_withstand ?? {},
        },
      });
    },
    [projectId, stationRef, audit2Config.data, updateAudit2Config],
  );

  const configuratorProps = useMemo(() => {
    const base = buildBaseStationProps(stationName, localConfig);
    // Phase 8: projektuj per-transformer / per-bay refs z audit2Config do propsow.
    const transformerTapChangers = audit2Config.data?.transformer_tap_changers ?? {};
    const bayFuses = audit2Config.data?.bay_hv_fuses ?? {};
    const bayVts = audit2Config.data?.bay_vts ?? {};
    const bayWithstand = audit2Config.data?.bay_device_withstand ?? {};
    return {
      ...base,
      basic: {
        ...base.basic,
        topologicalType: stationTopologicalType(station?.station_type),
        snVoltageKv: stationSnVoltageKv,
        nnVoltageLevels: stationLvVoltages,
        completeness:
          stationBays.length > 0 && stationTransformers.length > 0
            ? 'complete' as const
            : 'partial' as const,
        mvNeutralGroundings,
        onChange: (changes: { mvNeutralGroundingRef?: string | null }) => {
          if ('mvNeutralGroundingRef' in changes) {
            mutateAudit2({ mv_neutral_grounding_ref: changes.mvNeutralGroundingRef ?? null });
          }
        },
      },
      topology: {
        ...base.topology,
        externalPorts: stationPorts,
        endToEndConnectionsCount: stationPorts.filter((port) => Boolean(port.occupiedByLabelPl)).length,
        missingEndpointsCount: stationPorts.filter(
          (port) => isPortExpectedToBeBound(port.kind) && !port.occupiedByLabelPl,
        ).length,
      },
      snSwitchgear: {
        ...base.snSwitchgear,
        nominalVoltageKv: stationSnVoltageKv,
        layout: stationBays.some((bay) => bay.bayTypePl === 'sprzęgłowe')
          ? 'sectioned_busbar' as const
          : 'single_busbar' as const,
        sectionsCount: stationBays.some((bay) => bay.bayTypePl === 'sprzęgłowe') ? 2 : 1,
        hasCoupler: stationBays.some((bay) => bay.bayTypePl === 'sprzęgłowe'),
        baysCount: stationBays.length,
        readinessLabelPl: stationBays.length > 0 ? 'wariant katalogowy' : 'do konfiguracji',
      },
      transformer: {
        ...base.transformer,
        // Phase 8: rzutuj tapChangerCatalogRef per row + onChange przekazuje
        // patch transformer_tap_changers do mutateAudit2.
        transformers: stationTransformers.map((tr) => ({
          ...tr,
          tapChangerCatalogRef: transformerTapChangers[tr.transformerId] ?? null,
        })),
        availableLvVoltages: stationLvVoltages,
        transformerCatalogOptions: stationTransformerCatalogOptions,
        transformerCatalogLoading,
        transformerCatalogError,
        tapChangers,
        onAddTransformer: handleAddTransformer,
        onChange: (transformerId: string, changes: Partial<StationConfigTransformerRow>) => {
          if ('catalogRef' in changes) {
            void handleAssignTransformerCatalog(transformerId, changes.catalogRef);
          }
          if ('tapChangerCatalogRef' in changes) {
            mutateAudit2({
              transformer_tap_changers: {
                [transformerId]: changes.tapChangerCatalogRef ?? '',
              },
            });
          }
        },
      },
      bays: {
        ...base.bays,
        // Cast wymagany bo `base.bays.bays` w pustym stanie ma typ never[].
        // Mapowanie dziala poprawnie gdy snapshot dostarcza realne wpisy.
        bays: stationBays.map((b) => ({
          ...b,
          hvFuseCatalogRef: bayFuses[b.bayId] ?? null,
        })),
        // Phase 18: HV fuse onChange propaguje do mutateAudit2.
        onChangeHvFuse: (bayId: string, fuseId: string | null) => {
          mutateAudit2({
            bay_hv_fuses: { [bayId]: fuseId ?? '' },
          });
        },
      },
      protection: {
        ...base.protection,
        // Phase 8: VT per-bay z audit2Config.bay_vts.
        relays: (base.protection.relays as readonly ProtectionRow[]).map((r) => ({
          ...r,
          vtCatalogRef: bayVts[r.bayDesignation] ?? null,
        })),
        // Phase 8: device withstand per-bay z audit2Config.
        deviceWithstandRows: Object.entries(bayWithstand).map(([bayDesignation, spec]) => ({
          bayDesignation,
          deviceCatalogRef: (spec as { device_id: string }).device_id,
          i_peak_calculated_ka: (spec as { i_peak_calculated_ka: number }).i_peak_calculated_ka,
          i_thermal_calculated_ka: (spec as { i_thermal_calculated_ka: number }).i_thermal_calculated_ka,
          t_clearing_s: (spec as { t_clearing_s: number }).t_clearing_s,
        })),
        // Phase 18: VT onChange per bay (select propaguje do mutateAudit2).
        onChangeVt: (bayDesignation: string, vtId: string | null) => {
          mutateAudit2({
            bay_vts: { [bayDesignation]: vtId ?? '' },
          });
        },
      },
      derSources: {
        stationId: stationRef ?? 'unselected',
        stationLabel: stationName,
        ders,
        onOpenDer: handleOpenDer,
        onShowOnSld: handleShowOnSld,
        onAddDer: handleAddDer,
        onDetachDer: requestDetach,
        canDetachDer: (derId: string) => localDers.some((der) => der.id === derId),
        blockTransformers,
        ncRfgOperators,
      },
    };
  }, [
    station?.station_type,
    stationBays,
    stationTransformerCatalogOptions,
    stationLvVoltages,
    stationName,
    stationRef,
    stationPorts,
    stationSnVoltageKv,
    stationTransformers,
    ders,
    localDers,
    handleOpenDer,
    handleShowOnSld,
    handleAddDer,
    handleAddTransformer,
    handleAssignTransformerCatalog,
    requestDetach,
    localConfig,
    audit2Config.data,
    mutateAudit2,
    transformerCatalogError,
    transformerCatalogLoading,
    blockTransformers,
    mvNeutralGroundings,
    tapChangers,
    ncRfgOperators,
  ]);

  return (
    <div data-testid="station-configurator-surface" className="flex h-full w-full flex-col p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
            Konfigurator stacji SN/nN
          </div>
          <h2 className="mt-1 text-base font-semibold text-scada-text">{stationName}</h2>
        </div>
        {stationRef && (
          <div
            className="flex flex-col items-stretch gap-2 sm:items-end"
            data-testid="station-network-actions"
          >
            {/* KD-8 poz. 4: JEDEN system stanów akcji panelu (`shared/akcjeStanow.ts`).
                Dokładnie JEDNA akcja pierwszorzędna — kontynuacja ciągu SN, bo
                to nią prowadzi tor budowy sieci; pozostałe są drugorzędne i
                NIE niosą własnych barw (rodzaj układu rozróżnia etykieta, nie
                kolor obrysu). Stan nieaktywny ma zawsze tę samą klasę. */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleContinueTrunk}
                disabled={!continuationContext}
                title={continuationBlockReason ?? 'Kontynuuj ciąg główny z wolnego portu SN stacji.'}
                className={klasaAkcji('pierwszorzedna', !continuationContext)}
                {...atrybutRoliAkcji('pierwszorzedna')}
                data-testid="station-continue-trunk"
              >
                Kontynuuj ciąg SN ze stacji
              </button>
              <button
                type="button"
                onClick={handleStartBranch}
                disabled={!branchStartContext}
                title={branchBlockReason ?? 'Rozpocznij odgałęzienie z wolnego pola SN stacji.'}
                className={klasaAkcji('drugorzedna', !branchStartContext)}
                {...atrybutRoliAkcji('drugorzedna')}
                data-testid="station-start-branch"
              >
                Rozpocznij odgałęzienie
              </button>
              <button
                type="button"
                onClick={() => handleAddDer('PV')}
                title="Dodaj układ fotowoltaiczny do tej stacji."
                className={klasaAkcji('drugorzedna')}
                {...atrybutRoliAkcji('drugorzedna')}
                data-testid="station-add-pv-shortcut"
              >
                Dodaj PV
              </button>
              <button
                type="button"
                onClick={() => handleAddDer('BESS')}
                title="Dodaj magazyn energii do tej stacji."
                className={klasaAkcji('drugorzedna')}
                {...atrybutRoliAkcji('drugorzedna')}
                data-testid="station-add-bess-shortcut"
              >
                Dodaj BESS
              </button>
              <button
                type="button"
                onClick={() => handleAddDer('FW')}
                title="Dodaj farmę wiatrową do tej stacji."
                className={klasaAkcji('drugorzedna')}
                {...atrybutRoliAkcji('drugorzedna')}
                data-testid="station-add-fw-shortcut"
              >
                Dodaj FW
              </button>
            </div>
            {(continuationBlockReason || branchBlockReason) && (
              <div
                className="max-w-xl rounded border border-sygnal-blokada bg-sygnal-blokada-tlo px-3 py-2 text-[11px] leading-relaxed text-sygnal-blokada-tusz"
                data-testid="station-network-action-blockers"
              >
                {continuationBlockReason && (
                  <div data-testid="station-continue-trunk-reason">{continuationBlockReason}</div>
                )}
                {branchBlockReason && (
                  <div data-testid="station-start-branch-reason">{branchBlockReason}</div>
                )}
              </div>
            )}
          </div>
        )}
        {!stationRef && (
          <p className="mt-2 rounded border border-sygnal-uwaga bg-sygnal-uwaga-tlo p-3 text-xs text-sygnal-uwaga-tusz">
            Wybierz stację z drzewa układów albo kliknij stację w SLD i wybierz
            "Otwórz konfigurator stacji".
          </p>
        )}
      </div>
      <div className="flex-1 overflow-auto rounded border border-scada-border bg-scada-panel">
        <StationConfigurator
          {...configuratorProps}
          defaultCard={defaultCard}
          onOpenCalculations={handleOpenCalculations}
        />
      </div>

      {/* AddDerWizard — 5-krokowy kreator dodawania DER. */}
      <AddDerWizard
        key={`${wizardKind ?? 'closed'}:${wizardResetKey}`}
        isOpen={wizardKind !== null}
        stationId={stationRef}
        stationName={stationName}
        derKind={wizardKind ?? 'PV'}
        projectId={projectId ?? 'no-project'}
        onClose={() => setWizardKind(null)}
      />

      {/* Confirm detach modal */}
      {pendingDetach && (
        <div
          data-testid="der-detach-confirm"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        >
          <div className="w-[420px] max-w-[90vw] rounded-lg border border-scada-border bg-scada-panel p-5 shadow-2xl">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-scada-muted">
              Operacja nieodwracalna
            </div>
            <h3 className="text-base font-semibold text-scada-text">
              Odłączyć "{pendingDetach.name}" od stacji?
            </h3>
            <p className="mt-2 text-sm text-scada-muted">
              Spowoduje to usunięcie obiektu DER z modelu sieci wraz z relacją
              station_der_connection. Konfiguracja katalogu i profili NC RfG
              zostanie utracona.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDetach(null)}
                className="rounded border border-scada-border px-3 py-1.5 text-sm text-scada-text hover:bg-scada-hover-nav"
                data-testid="der-detach-cancel"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={confirmDetach}
                className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
                data-testid="der-detach-ok"
              >
                Odłącz
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StationConfiguratorSurface;
