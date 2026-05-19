/**
 * SldWorkspaceContainer — kontener kanwy SLD podpięty do shellu V12.
 *
 * Etap 1 — krytyczne wiring:
 *   - Renderowanie SldCanvasV2 jako body domyślnej powierzchni roboczej (E-01).
 *   - Right-click (na tle lub elemencie) → SldContextMenuController z menu z SLD_MENU_REGISTRY.
 *   - Dwuklik stacji → overlay StationInternalView (drill-down).
 *   - Pusty stan: polski komunikat z sugestią pierwszego kroku inżynierskiego.
 *
 * Adapter snapshot → propsy rendererów dostarcza Etap 3 (GPZ/Pole SN/Stacja
 * konfiguratory). W Etapie 1 kanwa renderuje się z pustymi tablicami; pusty
 * stan jest opisany komunikatem.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import { useAppStateStore } from '../../../app-state';
import { LayerTogglePanel } from '../lod/LayerTogglePanel';
import { SldDetailDrawer, type SldDetailDrawerData, type SldDetailDrawerSavePayload } from './SldDetailDrawer';
import { DerPersistenceApiError, postDerGeneratorConfig } from './derPersistenceApi';
import { useDerDragDrop, DerPaletteButton, type DerDragKind } from './useDerDragDrop';
import { useRawResultOverlayStore, getMetric, formatMetric } from '../../../sld-overlay/rawResultOverlayStore';
import { computeLfDerivedMetrics } from './lfDerivedMetrics';
import {
  createInitialLayerState,
  toggleLayer,
  type LayerId,
  type LayerState,
} from '../lod/layerToggle';
import { inferLodFromScale, type LodLevel } from '../lod/LodPolicy';
import { ProofPacksPanel } from '../proof/ProofPacksPanel';
import { NetworkHierarchyTree } from '../domain/NetworkHierarchyTree';
import { buildHierarchy, type EnmInputForHierarchy } from '../domain/HierarchyTree';
import { SldContextMenuController } from '../../../context-menu/SldContextMenuController';
import type { SldContextMenuRequest } from '../../../context-menu/SldContextMenuController';
import { useNetworkBuildStore } from '../../../network-build/networkBuildStore';
import { notify } from '../../../notifications/store';
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import type { Bay, EnergyNetworkModel, LogicalViewsV1, Substation, Transformer } from '../../../../types/enm';
import type { ElementType, SelectedElement } from '../../../types';
import { formatStationSwitchgearDescriptionPl } from '../../../shared/stationTypeLabels';
import { stationPublicIdentity } from '../../../shared/publicTechnicalLabels';
import { buildOperationContext } from '../../../network-build/operationContext';
import type { NetworkBuildOperationName } from '../../../network-build/internal/legacySurfaceTypes';
import {
  COMMAND_FEEDBACK_PL,
  toastBus,
  type SldElementKindForMenu,
} from '../command/SldCommandService';
import { SldThemeProvider } from '../theme/themeContext';
import { SplitPreviewPanel } from '../workflow/SplitPreviewPanel';
import type { SplitStatePreviewReady } from '../workflow/ConsciousSplitController';
import { SldCanvasV2, type SldCanvasContextMenuRequest } from './SldCanvasV2';
import { StationInternalView, type InternalDerDescriptor, type StationInternalViewProps } from './StationInternalView';
import { buildSldDataFromSnapshot } from './enmToSldAdapter';
import { buildCanonicalGpzProps } from './enmToCanonicalGpzAdapter';
import type {
  BayFieldRole,
  CanonicalGpzApparatusKind,
  GpzCanonicalRendererProps,
} from '../renderer/GpzCanonicalRenderer';
import { IDENTITY_TRANSFORM, type ViewportTransform } from '../viewport/ViewportController';
import { LassoSelector, rectFromPoints, type LassoRect } from './LassoSelector';
import {
  hasPaletteDragData,
  readPaletteDragData,
  type PaletteDragPayload,
} from '../../../network-build/dragDropController';
import { useStationDerStore as useStationDerStoreImport } from '../../../network-build/station-der';

const MIN_CANVAS_WIDTH_PX = 360;
const MIN_CANVAS_HEIGHT_PX = 240;
const STATION_INTERNAL_WIDTH_PX = 880;
const STATION_INTERNAL_HEIGHT_PX = 560;
const GPZ_LV_SECTION_COUPLER_GAP = 72;
const GPZ_LV_SECTION_MIN_WIDTH = 260;
const GPZ_BAY_WIDTH = 74;
const GPZ_BAY_PITCH = 82;
const GPZ_SECTION_LABEL_WIDTH = 30;
const GPZ_PAGE_PADDING = 24;
const GPZ_TR_AREA_Y = 280;
const TECHNICAL_NUMBER_FORMAT_PL = new Intl.NumberFormat('pl-PL', {
  maximumFractionDigits: 2,
});

function formatTechnicalNumberPl(value: number): string {
  return TECHNICAL_NUMBER_FORMAT_PL.format(value);
}

function formatKvPl(value: number): string {
  return `${formatTechnicalNumberPl(value)} kV`;
}
const GPZ_TR_HEIGHT = 80;
const GPZ_LV_BUS_GAP = 16;
const GPZ_LV_BAY_HEIGHT = 250;
const GPZ_TRACK_HEIGHT = GPZ_LV_BAY_HEIGHT - 30;

interface ApparatusOverlayTarget {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function getGpzLvSectionWidth(bayCount: number): number {
  const baySpan = (Math.max(bayCount, 1) - 1) * GPZ_BAY_PITCH + GPZ_BAY_WIDTH;
  return Math.max(GPZ_LV_SECTION_MIN_WIDTH, GPZ_SECTION_LABEL_WIDTH + 32 + baySpan + 32);
}

function gpzBayApparatusKinds(fieldRole: BayFieldRole): readonly CanonicalGpzApparatusKind[] {
  switch (fieldRole) {
    case 'LINE_IN':
    case 'LINE_OUT':
    case 'LINE_BRANCH':
      return ['disconnect_bus', 'breaker', 'ct', 'switch_disconnector', 'earthing_switch', 'cable_head'];
    case 'TRANSFORMER':
      return ['disconnect_bus', 'breaker', 'ct', 'fuse', 'earthing_switch'];
    case 'COUPLER':
      return ['disconnect_bus', 'breaker', 'ct'];
    case 'MEASUREMENT':
      return ['disconnect_bus', 'vt', 'earthing_switch'];
  }
}

function apparatusHitBox(kind: CanonicalGpzApparatusKind): { x: number; y: number; width: number; height: number } {
  switch (kind) {
    case 'disconnect_bus':
      return { x: -16, y: 20, width: 36, height: 24 };
    case 'breaker':
      return { x: -16, y: 44, width: 38, height: 24 };
    case 'ct':
      return { x: -16, y: 68, width: 36, height: 24 };
    case 'vt':
      return { x: -4, y: 58, width: 46, height: 36 };
    case 'switch_disconnector':
      return { x: -16, y: 92, width: 38, height: 24 };
    case 'fuse':
      return { x: -14, y: 92, width: 28, height: 46 };
    case 'earthing_switch':
      return { x: -4, y: 118, width: 36, height: 34 };
    case 'cable_head':
      return { x: -16, y: GPZ_TRACK_HEIGHT - 42, width: 32, height: 56 };
    case 'transformer_symbol':
      return { x: -20, y: 0, width: 64, height: 58 };
  }
}

function apparatusLabel(kind: CanonicalGpzApparatusKind): string {
  return GPZ_APPARATUS_LABELS_PL[kind]?.label ?? 'Aparat SN';
}

function buildGpzApparatusOverlayTargets(
  gpz: GpzCanonicalRendererProps,
  transform: ViewportTransform,
): ApparatusOverlayTarget[] {
  const sectionWidths = gpz.sections.map((section) => getGpzLvSectionWidth(section.bays.length));
  const lvSwitchgearWidth = sectionWidths.reduce((sum, width) => sum + width, 0)
    + Math.max(0, gpz.sections.length - 1) * GPZ_LV_SECTION_COUPLER_GAP;
  const totalLvWidth = lvSwitchgearWidth + GPZ_PAGE_PADDING * 2;
  const totalWidth = Math.max(totalLvWidth, 320 * 2 + GPZ_PAGE_PADDING);
  const lvStartX = Math.max(GPZ_PAGE_PADDING, (totalWidth - lvSwitchgearWidth) / 2);
  const sectionsBlockY = GPZ_TR_AREA_Y + GPZ_TR_HEIGHT + GPZ_LV_BUS_GAP;

  const targets: ApparatusOverlayTarget[] = [];
  let sectionCursorX = lvStartX;
  gpz.sections.forEach((section, sectionIndex) => {
    section.bays.forEach((bay, bayIndex) => {
      const bayOriginX = gpz.x + sectionCursorX + 32 + bayIndex * GPZ_BAY_PITCH;
      const bayOriginY = gpz.y + sectionsBlockY;
      for (const kind of gpzBayApparatusKinds(bay.fieldRole)) {
        if (kind === 'earthing_switch' && bay.esState === 'absent') continue;
        const box = apparatusHitBox(kind);
        targets.push({
          id: `${bay.bayRef}#${kind}`,
          label: apparatusLabel(kind),
          x: transform.translateX + (bayOriginX + box.x) * transform.scale,
          y: transform.translateY + (bayOriginY + box.y) * transform.scale,
          width: box.width * transform.scale,
          height: box.height * transform.scale,
        });
      }
    });
    sectionCursorX += sectionWidths[sectionIndex] + GPZ_LV_SECTION_COUPLER_GAP;
  });
  return targets;
}

function findSubstationByRef(
  snapshot: EnergyNetworkModel | null,
  substationRef: string,
): Substation | null {
  return (
    (snapshot?.substations ?? []).find(
      (substation) => substation.ref_id === substationRef || substation.id === substationRef,
    ) ?? null
  );
}

function findBusVoltage(snapshot: EnergyNetworkModel | null, busRef: string): number | null {
  return (snapshot?.buses ?? []).find((bus) => bus.ref_id === busRef || bus.id === busRef)?.voltage_kv ?? null;
}

function findBayByRef(snapshot: EnergyNetworkModel | null, bayRef: string): Bay | null {
  return (snapshot?.bays ?? []).find((bay) => bay.ref_id === bayRef || bay.id === bayRef) ?? null;
}

const GPZ_APPARATUS_LABELS_PL: Readonly<Record<string, { type: ElementType; label: string }>> = {
  disconnect_bus: { type: 'Switch', label: 'Odłącznik szynowy' },
  breaker: { type: 'Switch', label: 'Wyłącznik SN' },
  ct: { type: 'Measurement', label: 'Przekładnik prądowy' },
  vt: { type: 'Measurement', label: 'Przekładnik napięciowy' },
  switch_disconnector: { type: 'Switch', label: 'Rozłącznik' },
  earthing_switch: { type: 'Switch', label: 'Uziemnik' },
  fuse: { type: 'Switch', label: 'Bezpieczniki' },
  cable_head: { type: 'PortBranch', label: 'Głowica kablowa / port odpływu' },
  transformer_symbol: { type: 'TransformerBranch', label: 'Transformator WN/SN' },
};

function parseGpzApparatusSelectionId(id: string): { bayRef: string; apparatusKind: string } | null {
  const marker = id.lastIndexOf('#');
  if (marker <= 0 || marker === id.length - 1) return null;
  return { bayRef: id.slice(0, marker), apparatusKind: id.slice(marker + 1) };
}

function readNativeApparatusElementId(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  return target.closest('[data-element-kind="apparatus"][data-element-id]')?.getAttribute('data-element-id') ?? null;
}

function readNativeElementIdByKind(target: EventTarget | null, kind: string): string | null {
  if (!(target instanceof Element)) return null;
  return target.closest(`[data-element-kind="${kind}"][data-element-id]`)?.getAttribute('data-element-id') ?? null;
}

function describeGpzApparatus(
  snapshot: EnergyNetworkModel | null,
  apparatusIdValue: string,
): SelectedElement {
  const parsed = parseGpzApparatusSelectionId(apparatusIdValue);
  const descriptor = parsed ? GPZ_APPARATUS_LABELS_PL[parsed.apparatusKind] : null;
  const bay = parsed ? findBayByRef(snapshot, parsed.bayRef) : null;
  const bayName = bay?.name ?? bay?.bay_number ?? bay?.feeder_short_name ?? parsed?.bayRef ?? apparatusIdValue;
  return {
    id: apparatusIdValue,
    type: descriptor?.type ?? 'Switch',
    name: descriptor ? `${descriptor.label} — ${bayName}` : `Aparat pola — ${bayName}`,
  };
}

const INTERNAL_STATION_BAY_ROLE_LABELS_PL: Readonly<Record<string, string>> = {
  in: 'Pole wejściowe SN',
  out: 'Pole wyjściowe SN',
  feeder: 'Pole odgałęźne SN',
  tr: 'Pole transformatorowe SN',
  coupler: 'Pole sprzęgłowe SN',
  measurement: 'Pole pomiarowe SN',
  oze: 'Pole przyłączeniowe OZE',
};

const INTERNAL_STATION_DEVICE_LABELS_PL: Readonly<Record<string, string>> = {
  'switch-disconnector': 'Rozłącznik',
  fuse: 'Bezpiecznik',
  'earthing-switch': 'Uziemnik',
  'cable-head': 'Głowica kablowa',
  'transformer-device': 'Transformator SN/nN',
  breaker: 'Wyłącznik',
  disconnector: 'Odłącznik',
  vt: 'Przekładnik napięciowy',
};

function stationRefFromInternalElement(id: string): string | null {
  for (const marker of ['/internal-bay/', '/nn/', '/pv/', '/transformer/']) {
    const markerIndex = id.indexOf(marker);
    if (markerIndex > 0) return id.slice(0, markerIndex);
  }
  return null;
}

function stationDisplayNameForRef(snapshot: EnergyNetworkModel | null, stationRef: string): string {
  const station = findSubstationByRef(snapshot, stationRef);
  return station && snapshot
    ? stationPublicIdentity(snapshot, station).displayName
    : 'stacja SN/nN';
}

function describeStationInternalElement(
  snapshot: EnergyNetworkModel | null,
  id: string,
): SelectedElement | null {
  const stationRef = stationRefFromInternalElement(id);
  if (!stationRef) return null;
  const stationName = stationDisplayNameForRef(snapshot, stationRef);

  if (id.includes('/internal-bay/')) {
    const bayPath = id.slice(id.indexOf('/internal-bay/') + '/internal-bay/'.length);
    const [bayKey, deviceKey] = bayPath.split('/');
    const roleKey = bayKey?.split('-')[0] ?? '';
    const bayLabel = INTERNAL_STATION_BAY_ROLE_LABELS_PL[roleKey] ?? 'Pole SN';
    const deviceLabel = deviceKey ? INTERNAL_STATION_DEVICE_LABELS_PL[deviceKey] ?? 'Aparat pola SN' : null;
    return {
      id,
      type: deviceLabel ? 'Switch' : 'BaySN',
      name: deviceLabel
        ? `${deviceLabel} - ${bayLabel}, ${stationName}`
        : `${bayLabel} - ${stationName}`,
    };
  }

  if (id.includes('/nn/')) {
    return {
      id,
      type: 'SwitchNN',
      name: `Wyłącznik nN - ${stationName}`,
    };
  }

  if (id.includes('/pv/nn-pcc')) {
    return {
      id,
      type: 'ConnectionPoint',
      name: `Punkt przyłączenia PV po stronie nN - ${stationName}`,
    };
  }

  if (id.includes('/pv/nn-breaker/')) {
    return {
      id,
      type: 'SwitchNN',
      name: `Wyłącznik nN PV - ${stationName}`,
    };
  }

  if (id.includes('/pv/protection/')) {
    return {
      id,
      type: 'ProtectionNN',
      name: `Zabezpieczenie PV - ${stationName}`,
    };
  }

  if (id.includes('/pv/inverter/')) {
    return {
      id,
      type: 'PVInverter',
      name: `Falownik PV - ${stationName}`,
      semanticHash: `source:${id}`,
      semanticElementKind: 'SOURCE',
      semanticEngineeringRole: 'PV_INVERTER',
    };
  }

  if (id.includes('/transformer/')) {
    return {
      id,
      type: 'TransformerBranch',
      name: `Transformator SN/nN - ${stationName}`,
    };
  }

  return null;
}

interface SldOperationAction {
  readonly op: NetworkBuildOperationName;
  readonly context: Record<string, unknown>;
  readonly messagePl: string;
}

function elementTypeForSldKind(kind: SldElementKindForMenu): ElementType | null {
  switch (kind) {
    case 'gpz':
      return 'Source';
    case 'section':
      return 'Bus';
    case 'bay':
      return 'BaySN';
    case 'apparatus':
      return 'Switch';
    case 'cable_segment_sn':
    case 'overhead_line_sn':
      return 'LineBranch';
    case 'station':
      return 'Station';
    case 'der_pv':
      return 'PVInverter';
    case 'der_bess':
      return 'BESSInverter';
    case 'der_fw':
      return 'Generator';
    case 'background':
    default:
      return null;
  }
}

function buildSldOperationContext(
  actionId: string,
  kind: SldElementKindForMenu,
  elementId: string | null,
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
): SldOperationAction | null {
  if (actionId === 'insert-gpz') {
    return {
      op: 'add_grid_source_sn',
      context: { source: 'sld_context_menu' },
      messagePl: 'Otwieram formularz głównego punktu zasilania.',
    };
  }

  if (!elementId) return null;

  const apparatusSelection = kind === 'apparatus' ? parseGpzApparatusSelectionId(elementId) : null;
  const operationElementId = apparatusSelection ? apparatusSelection.bayRef : elementId;
  const operationKind: SldElementKindForMenu = apparatusSelection ? 'bay' : kind;
  if (kind === 'apparatus' && actionId === 'extend-trunk' && apparatusSelection?.apparatusKind !== 'cable_head') {
    return null;
  }

  const elementType = elementTypeForSldKind(operationKind);
  if (!elementType) return null;

  const opByAction: Partial<Record<string, NetworkBuildOperationName>> = {
    'add-bay': 'add_sn_bay',
    'extend-trunk': 'continue_trunk_segment_sn',
    'continue-trunk': 'continue_trunk_segment_sn',
    'continue-trunk-from-endpoint': 'continue_trunk_segment_sn',
    'append-station-on-endpoint': 'continue_trunk_segment_sn',
    'start-branch': 'start_branch_segment_sn',
    'insert-station': 'insert_station_on_segment_sn',
    'conscious-split-on-segment': 'insert_station_on_segment_sn',
    'insert-zksn': 'insert_zksn_on_segment_sn',
    'insert-pole': 'insert_branch_pole_on_segment_sn',
    'insert-sectional': 'insert_section_switch_sn',
    'add-load': 'add_nn_load',
    'set-switch-state': 'set_normal_open_point',
  };
  const op = opByAction[actionId];
  if (!op) return null;

  const extraContext: Record<string, unknown> = { source: 'sld_context_menu' };
  if (apparatusSelection) {
    extraContext.apparatus_ref = elementId;
    extraContext.apparatus_kind = apparatusSelection.apparatusKind;
    extraContext.bay_ref = apparatusSelection.bayRef;
  }
  if (actionId === 'append-station-on-endpoint') {
    extraContext.default_termination = 'station';
    extraContext.default_termination_label = 'Zakończ odcinek stacją';
  }
  if (actionId === 'continue-trunk-from-endpoint') {
    extraContext.default_termination = 'continue';
    extraContext.default_termination_label = 'Kontynuuj ciąg główny';
  }
  if (actionId === 'conscious-split-on-segment') {
    extraContext.split_mode = 'explicit_preview_required';
    extraContext.split_label = 'Świadomy podział odcinka';
  }

  return {
    op,
    context: buildOperationContext({
      canonicalOp: op,
      elementId: operationElementId,
      elementType,
      snapshot,
      logicalViews,
      extraContext,
    }),
    messagePl: operationOpenMessage(op, actionId),
  };
}

function operationOpenMessage(op: NetworkBuildOperationName, actionId: string): string {
  if (actionId === 'conscious-split-on-segment') {
    return 'Otwieram świadomy podział odcinka z podglądem skutków topologicznych.';
  }
  switch (op) {
    case 'continue_trunk_segment_sn':
      return 'Otwieram formularz wyprowadzenia ciągu SN z wybranego portu.';
    case 'insert_station_on_segment_sn':
      return 'Otwieram formularz wstawienia stacji SN/nN.';
    case 'insert_zksn_on_segment_sn':
      return 'Otwieram formularz wstawienia ZK SN.';
    case 'insert_branch_pole_on_segment_sn':
      return 'Otwieram formularz wstawienia słupa rozgałęźnego.';
    case 'insert_section_switch_sn':
      return 'Otwieram formularz wstawienia łącznika sekcyjnego.';
    case 'start_branch_segment_sn':
      return 'Otwieram formularz rozpoczęcia odgałęzienia SN.';
    case 'add_sn_bay':
      return 'Otwieram formularz dodania pola SN.';
    case 'add_nn_load':
      return 'Otwieram formularz dodania obciążenia nN.';
    case 'set_normal_open_point':
      return 'Otwieram formularz punktu normalnie otwartego.';
    default:
      return 'Otwieram formularz operacji domenowej.';
  }
}

function inferStationTopologicalType(
  station: Substation | null,
  fallback?: StationInternalViewProps['topologicalType'],
): StationInternalViewProps['topologicalType'] {
  if (fallback) return fallback;
  switch (station?.station_type) {
    case 'inline':
      return 'przelotowa';
    case 'branch':
      return 'odgałęźna';
    case 'sectional':
      return 'sekcyjna';
    case 'terminal':
    default:
      return 'końcowa';
  }
}

function selectStationTransformers(
  snapshot: EnergyNetworkModel | null,
  station: Substation | null,
): Transformer[] {
  if (!snapshot || !station) return [];
  const transformerRefs = new Set(station.transformer_refs ?? []);
  const busRefs = new Set(station.bus_refs ?? []);
  return (snapshot.transformers ?? []).filter(
    (transformer) =>
      transformerRefs.has(transformer.ref_id)
      || transformerRefs.has(transformer.id)
      || busRefs.has(transformer.hv_bus_ref)
      || busRefs.has(transformer.lv_bus_ref),
  );
}

function selectStationBays(
  snapshot: EnergyNetworkModel | null,
  station: Substation | null,
): Bay[] {
  if (!snapshot || !station) return [];
  return (snapshot.bays ?? []).filter((bay) => bay.substation_ref === station.ref_id);
}

function uniqueSortedVoltages(values: Array<number | null | undefined>): number[] {
  return Array.from(
    new Set(
      values
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        .map((value) => Number(value.toFixed(3))),
    ),
  ).sort((a, b) => a - b);
}

function mapDerKindToElementType(kind: 'PV' | 'BESS' | 'FW'): ElementType {
  switch (kind) {
    case 'PV':
      return 'PVInverter';
    case 'BESS':
      return 'BESSInverter';
    case 'FW':
      return 'Generator';
  }
}

/**
 * K30-72: map onSelectElement kind → SldDetailDrawer kind.
 * Pewne kind values (gpz, lv_breaker, cable_run, protection, pcc) mapped
 * to closest drawer category. null gdy element nie ma dedicated drawer.
 */
function readHashParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  const queryIndex = window.location.hash.indexOf('?');
  if (queryIndex < 0) return null;
  return new URLSearchParams(window.location.hash.slice(queryIndex + 1)).get(name)?.trim() || null;
}

function hasTopologicalContent(snapshot: EnergyNetworkModel | null): boolean {
  if (!snapshot) return false;
  return [
    snapshot.sources,
    snapshot.buses,
    snapshot.branches,
    snapshot.transformers,
    snapshot.loads,
    snapshot.generators,
    snapshot.substations,
    snapshot.bays,
    snapshot.junctions,
    snapshot.branch_points,
    snapshot.corridors,
    snapshot.line_runs,
  ].some((items) => Array.isArray(items) && items.length > 0);
}

function mapKindToDrawerKind(kind: string): SldDetailDrawerData['kind'] | null {
  if (kind === 'station' || kind === 'gpz') return 'station';
  if (kind === 'bay') return 'bay';
  if (kind === 'apparatus' || kind === 'lv_breaker' || kind === 'protection' || kind === 'pcc') return 'apparatus';
  if (kind === 'der' || kind === 'pv_inverter') return 'der';
  if (kind === 'cable_run') return 'cable_run';
  return null;
}

/**
 * K30-84: Build live metrics chips (V/U_pu/P/Q/I) for selected element z
 * RawOverlayPayload (LF/SC). Returns empty array gdy brak payload lub brak
 * matching element ref. Element id mapping: station → '{id}/sn_bus' za snBusRef.
 */
function buildLiveMetrics(
  payload: import('../../../sld-overlay/rawResultOverlayStore').RawOverlayPayload | null,
  drawerKind: SldDetailDrawerData['kind'],
  elementId: string,
  nominalKv: number | null,
): SldDetailDrawerData['liveMetrics'] {
  if (!payload) return undefined;
  // Station → check SN bus metrics (U_kV, U_pu)
  if (drawerKind === 'station') {
    const snBusRef = elementId.endsWith('/station')
      ? `${elementId.slice(0, -'/station'.length)}/sn_bus`
      : `${elementId}/sn_bus`;
    const uKv = getMetric(payload, snBusRef, 'U_kV');
    const uPu = getMetric(payload, snBusRef, 'U_pu');
    const chips: Array<{ label: string; value: string; color?: string }> = [];
    if (uKv) chips.push({ label: 'U', value: formatMetric(uKv) });
    if (uPu) {
      const dev = uPu.value != null ? (uPu.value - 1) * 100 : null;
      const color = dev == null ? undefined
        : Math.abs(dev) <= 5 ? '#13C45A'
        : Math.abs(dev) <= 10 ? '#FFD166'
        : '#F25F5F';
      chips.push({ label: 'U_pu', value: formatMetric(uPu), color });
    }
    if (chips.length === 0 && nominalKv != null) {
      return undefined;
    }
    return chips.length > 0 ? chips : undefined;
  }
  // DER/Bay/Apparatus → check payload direct element ref
  const el = payload.elements[elementId];
  if (!el) return undefined;
  const chips: Array<{ label: string; value: string }> = [];
  for (const code of ['P_MW', 'Q_Mvar', 'I_A', 'U_kV']) {
    const m = el.metrics?.[code];
    if (m) chips.push({ label: code.split('_')[0], value: formatMetric(m) });
  }
  return chips.length > 0 ? chips : undefined;
}

/** Mapowanie ID akcji na ekran kanoniczny (E-XX). Etapy 1-3 obsługują E-04/24/36/38, E-10/11/13. */
const ACTION_TO_SCREEN: Readonly<Record<string, string>> = {
  'show-readiness': 'E-04',
  'show-results': 'E-24',
  'show-rationale': 'E-36',
  'open-catalogs': 'E-38',
  // Etap 3:
  'open-source': 'E-10', // GPZ konfigurator
  'add-section': 'E-10',
  'open-bay': 'E-11',
  'configure-equipment': 'E-11',
  'configure-cts-vts': 'E-11',
  'configure-protection': 'E-11',
  'open-station-config': 'E-13',
  // Etap 4: sieć terenowa (odcinki SN, ZK SN, słupy, NOP, odgałęzienia):
  'edit-laying': 'E-12',
  'edit-line': 'E-12',
  'change-catalog': 'E-12',
  'show-thermal': 'E-12',
  // Etap 5: układy PV/BESS/FW:
  'open-pv-config': 'E-21',
  'open-bess-config': 'E-22',
  'open-fw-config': 'E-23',
  'show-frt-hvrt': 'E-26',
  'show-ncrfg': 'E-26',
};

function routeSurfaceLabelPl(screenCode: string): string {
  switch (screenCode) {
    case 'E-10':
      return 'konfigurację GPZ';
    case 'E-11':
      return 'konfigurację pola SN';
    case 'E-12':
      return 'konfigurację odcinka SN';
    case 'E-13':
      return 'konfigurację stacji SN/nN';
    case 'E-21':
      return 'konfigurację PV';
    case 'E-22':
      return 'konfigurację BESS';
    case 'E-23':
      return 'konfigurację farmy wiatrowej';
    case 'E-24':
      return 'wyniki obliczeń';
    case 'E-26':
      return 'wymagania przyłączeniowe NC RfG';
    case 'E-36':
      return 'dowody obliczeń';
    case 'E-38':
      return 'katalogi techniczne';
    default:
      return 'konfigurację układu';
  }
}

/** Akcje, które są zaplanowane w kolejnych etapach roadmapy — toast informacyjny. */
const ACTION_ROADMAP_HINT_PL: Readonly<Record<string, string>> = {
  'insert-gpz': 'Wstawianie Głównego Punktu Zasilającego: Etap 6 roadmapy (insert tool). Tymczasowo użyj operacji domenowej add_grid_source_sn z panelu ENM.',
  'add-section': 'Dodawanie sekcji rozdzielni SN: Etap 4 roadmapy (sieć terenowa).',
  'add-bay': 'Dodawanie pola SN: Etap 4 roadmapy.',
  'extend-trunk': 'Wyprowadzanie ciągu głównego: Etap 4 roadmapy.',
  'start-branch': 'Rozpoczynanie odgałęzienia: Etap 4 roadmapy.',
  'insert-station': 'Wstawianie stacji transformatorowej: Etap 4 roadmapy.',
  'insert-zksn': 'Wstawianie złącza kablowego SN: Etap 4 roadmapy.',
  'insert-sectional': 'Wstawianie łącznika sekcyjnego: Etap 4 roadmapy.',
  'insert-joint': 'Wstawianie mufy kablowej: Etap 4 roadmapy.',
  'insert-pole': 'Wstawianie słupa rozgałęźnego: Etap 4 roadmapy.',
  'add-source': 'Wybór PV, BESS albo farmy wiatrowej odbywa się w karcie "Układy PV/BESS/FW" konfiguratora stacji.',
  'add-load': 'Dodawanie obciążenia nN: Etap 4 roadmapy.',
  'continue-trunk': 'Kontynuacja ciągu głównego: Etap 4 roadmapy.',
  'set-switch-state': 'Zmiana stanu łącznika: Etap 6 roadmapy.',
  'show-measurements': 'Podgląd pomiarów pola: Etap 7 roadmapy.',
  'show-sc-source': 'Dane zwarciowe źródła GPZ są dostępne w karcie "Strona 110 kV" konfiguratora GPZ.',
  'show-sc-data': 'Dane zwarciowe sekcji są dostępne w konfiguratorze GPZ, w karcie "Strona 110 kV".',
  'change-family-to-overhead': 'Zmiana rodziny odbywa się w konfiguratorze odcinka, w karcie "Identyfikacja i rodzina".',
  'change-family-to-cable': 'Zmiana rodziny odbywa się w konfiguratorze odcinka, w karcie "Identyfikacja i rodzina".',
  'delete-bay': 'Usuwanie pola SN: Etap 4 roadmapy.',
  'delete-segment': 'Usuwanie odcinka: Etap 4 roadmapy.',
  'delete-station': 'Usuwanie stacji: Etap 4 roadmapy.',
  'delete-pv': 'Usuwanie źródła PV: Etap 5 roadmapy.',
  'delete-bess': 'Usuwanie BESS: Etap 5 roadmapy.',
  'delete-fw': 'Usuwanie farmy wiatrowej: Etap 5 roadmapy.',
};

export interface SldWorkspaceContainerProps {
  /** Tryb tylko-do-odczytu (np. ekran #sld-view). */
  readonly readOnly?: boolean;
  /** Override szerokości kanwy — używane w testach. */
  readonly width?: number;
  /** Override wysokości kanwy — używane w testach. */
  readonly height?: number;
  /** Gdy podany, pokazuje SplitPreviewPanel (Wizard K7 — conscious-split preview_ready). */
  readonly splitPreviewState?: SplitStatePreviewReady | null;
  readonly onSplitConfirm?: () => void;
  readonly onSplitCancel?: () => void;
}

/**
 * Hook obliczający faktyczne wymiary kanwy z elementu DOM. Pozwala SLD
 * dopasować się do kontenera shellu V12.
 */
function useMeasuredSize(
  ref: React.RefObject<HTMLDivElement>,
  fallbackWidth: number,
  fallbackHeight: number,
  override?: { width?: number; height?: number },
): { width: number; height: number } {
  const [size, setSize] = useState<{ width: number; height: number }>(() => ({
    width: override?.width ?? fallbackWidth,
    height: override?.height ?? fallbackHeight,
  }));

  useEffect(() => {
    if (override?.width !== undefined && override?.height !== undefined) {
      setSize({ width: override.width, height: override.height });
      return;
    }
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next = {
        width: Math.max(MIN_CANVAS_WIDTH_PX, entry.contentRect.width),
        height: Math.max(MIN_CANVAS_HEIGHT_PX, entry.contentRect.height),
      };
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [override?.width, override?.height, ref]);

  return size;
}

export function SldWorkspaceContainer(
  props: SldWorkspaceContainerProps = {},
): JSX.Element {
  const {
    readOnly = false,
    width: widthOverride,
    height: heightOverride,
    splitPreviewState = null,
    onSplitConfirm,
    onSplitCancel,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const measured = useMeasuredSize(containerRef, 1024, 640, {
    width: widthOverride,
    height: heightOverride,
  });

  const snapshot = useSnapshotStore((state) => state.snapshot);
  const snapshotLoading = useSnapshotStore((state) => state.loading);
  const readiness = useSnapshotStore((state) => state.readiness);
  const logicalViews = useSnapshotStore((state) => state.logicalViews);
  const snapshotCaseId = useSnapshotStore((state) => state.caseId);
  const setSnapshot = useSnapshotStore((state) => state.setSnapshot);
  const refreshFromBackend = useSnapshotStore((state) => state.refreshFromBackend);
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const activeCaseResultStatus = useAppStateStore((state) => state.activeCaseResultStatus);
  const setActiveCase = useAppStateStore((state) => state.setActiveCase);
  const activeMode = useAppStateStore((state) => state.activeMode);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const collapseSurfaceStackTo = useNetworkBuildStore((state) => state.collapseSurfaceStackTo);
  const activeRouteSurface = useNetworkBuildStore((state) => state.activeSurface);
  const selectElement = useSelectionStore((state) => state.selectElement);

  const [contextRequest, setContextRequest] = useState<SldContextMenuRequest | null>(null);
  const [internalStationId, setInternalStationId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // K30-72: detail drawer state (SldDetailDrawer K30-71)
  const [detailDrawerData, setDetailDrawerData] = useState<SldDetailDrawerData | null>(null);
  // K30-78: DER drag-drop palette → station → drawer DER tab pre-filled.
  const derDrag = useDerDragDrop();
  // K30-84: subscribe to LF/SC overlay payload dla inline metric chips
  const overlayPayload = useRawResultOverlayStore((s) => s.payload);
  const [viewportTransform, setViewportTransform] = useState<ViewportTransform>(IDENTITY_TRANSFORM);
  const refreshAttemptedCaseRef = useRef<string | null>(null);
  const routeCaseRef = useRef<string | null>(null);
  const routeRunRef = useRef<string | null>(null);
  // Iteracja 12: lasso multi-select state.
  const [lassoRect, setLassoRect] = useState<LassoRect | null>(null);
  const lassoStartRef = useRef<{ x: number; y: number } | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PaletteDragPayload | null>(null);

  // Warstwy i hotspoty aparatury podążają za realnym LOD kanwy.
  // LOD 0 zostawia topologię; aparatura pojawia się dopiero po zbliżeniu.
  const [layerState, setLayerState] = useState<LayerState>(() => createInitialLayerState());
  const currentLod: LodLevel = inferLodFromScale(viewportTransform.scale);
  const [layerPanelOpen, setLayerPanelOpen] = useState<boolean>(false);
  const [themeMode, setThemeMode] = useState<'dark_scada' | 'light_technical'>('dark_scada');
  const handleToggleLayer = useCallback(
    (layerId: LayerId) => {
      setLayerState((prev) => toggleLayer(prev, layerId, currentLod));
    },
    [currentLod],
  );
  // Iter 11 (per Projektant SN/WN blocker): buduj hierarchię z snapshot
  // dla drzewa GPZ→Sekcja→Pole. Memoized — przelicza tylko przy zmianie
  // snapshot. Brak modelu = pusta hierarchia (empty state w komponencie).
  const [hierarchyPanelOpen, setHierarchyPanelOpen] = useState<boolean>(false);
  const [proofPanelOpen, setProofPanelOpen] = useState<boolean>(false);
  const networkHierarchy = useMemo(() => {
    if (!snapshot) {
      return buildHierarchy({
        substations: [],
        bays: [],
        buses: [],
        sources: [],
        line_runs: [],
        generators: [],
      });
    }
    // Mapowanie snapshot → EnmInputForHierarchy w trybie defensywnym.
    // ENM snapshot types (z types/enm.ts) różnią się od HierarchyTree-input.
    // Używamy strukturalnego match'u z fallbackami dla brakujących pól.
    const enmInput = {
      substations: ((snapshot.substations ?? []) as readonly unknown[]).map(
        (raw): EnmInputForHierarchy['substations'][number] => {
          const s = raw as Record<string, unknown>;
          return {
            ref_id: String(s.ref_id ?? ''),
            name: String(s.name ?? s.ref_id ?? ''),
            station_type: String(s.station_type ?? 'mv_lv'),
            bus_refs: Array.isArray(s.bus_refs) ? (s.bus_refs as string[]) : [],
            gpz_sections: Array.isArray(s.gpz_sections)
              ? (s.gpz_sections as EnmInputForHierarchy['substations'][number]['gpz_sections'])
              : undefined,
          };
        },
      ),
      bays: ((snapshot.bays ?? []) as readonly unknown[]).map(
        (raw): EnmInputForHierarchy['bays'][number] => {
          const b = raw as Record<string, unknown>;
          return {
            ref_id: String(b.ref_id ?? ''),
            name: String(b.name ?? b.ref_id ?? ''),
            bay_role: (b.bay_role as EnmInputForHierarchy['bays'][number]['bay_role']) ?? 'OUT',
            substation_ref: String(b.substation_ref ?? ''),
            bus_ref: String(b.bus_ref ?? ''),
          };
        },
      ),
      buses: ((snapshot.buses ?? []) as readonly unknown[]).map(
        (raw): EnmInputForHierarchy['buses'][number] => {
          const b = raw as Record<string, unknown>;
          return {
            ref_id: String(b.ref_id ?? ''),
            voltage_kv: Number(b.voltage_kv ?? 15),
            name: String(b.name ?? b.ref_id ?? ''),
          };
        },
      ),
      sources: ((snapshot.sources ?? []) as readonly unknown[]).map(
        (raw): EnmInputForHierarchy['sources'][number] => {
          const s = raw as Record<string, unknown>;
          return {
            ref_id: String(s.ref_id ?? ''),
            bus_ref: String(s.bus_ref ?? ''),
            sk3_mva: typeof s.sk3_mva === 'number' ? s.sk3_mva : null,
          };
        },
      ),
      line_runs: [],
      generators: [],
    } satisfies EnmInputForHierarchy;
    return buildHierarchy(enmInput);
  }, [snapshot]);

  const handleResetLayers = useCallback(() => {
    setLayerState(createInitialLayerState());
  }, []);

  const handleExportSvg = useCallback(() => {
    const svgEl = containerRef.current?.querySelector<SVGSVGElement>('svg[data-testid="sld-canvas-v2"]');
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'schemat_sld.svg';
    link.click();
    URL.revokeObjectURL(url);
  }, [containerRef]);

  // Iteracja 11: real-data adapter snapshot → SLD renderers props.
  const sldData = useMemo(
    () => buildSldDataFromSnapshot(snapshot, logicalViews),
    [snapshot, logicalViews],
  );

  /* Phase R4 (operator-grade GPZ rebuild): dla każdego GPZ z legacy adaptera
   * budujemy canonical props z ENM. SldCanvasV2 renderuje GpzCanonicalRenderer
   * gdy canonical istnieje dla danego id; inaczej fallback do legacy renderera.
   * Adapter throwa gdy substation nie jest typu 'gpz' — wtedy pomijamy element. */
  const canonicalGpzs = useMemo<readonly GpzCanonicalRendererProps[]>(() => {
    if (!snapshot) return [];
    const out: GpzCanonicalRendererProps[] = [];
    for (const g of sldData.gpzs) {
      try {
        const canonical = buildCanonicalGpzProps(snapshot, g.id, { x: g.x, y: g.y });
        out.push(canonical);
      } catch {
        // Substation nie jest typu 'gpz' lub nie istnieje — legacy fallback.
      }
    }
    return out;
  }, [snapshot, sldData.gpzs]);

  const isEmpty = useMemo(() => {
    return (
      sldData.gpzs.length === 0 &&
      sldData.stations.length === 0 &&
      sldData.cableRuns.length === 0 &&
      sldData.ders.length === 0
    );
  }, [sldData]);
  const readinessBlockerCount = readiness?.blockers?.length ?? 0;
  const readinessWarningCount = readiness?.warnings?.length ?? 0;
  const readinessReady = Boolean(readiness?.ready);
  const showCalculationConfigurationStack = !isEmpty && !readinessReady && (readinessBlockerCount > 0 || readinessWarningCount > 0);

  const handleContextMenu = useCallback(
    (request: SldCanvasContextMenuRequest) => {
      setContextRequest({
        kind: request.kind,
        elementId: request.elementId,
        clientX: request.clientX,
        clientY: request.clientY,
      });
    },
    [],
  );

  const handleEmptyStateContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setContextRequest({
      kind: 'background',
      elementId: null,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }, []);

  const closeContextMenu = useCallback(() => setContextRequest(null), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const caseFromUrl = readHashParam('case') ?? readHashParam('caseId');
    routeCaseRef.current = caseFromUrl;
    routeRunRef.current = readHashParam('run');
    if (!caseFromUrl || activeCaseId === caseFromUrl) return;
    setActiveCase(
      caseFromUrl,
      activeCaseName ?? 'Zakres z adresu',
      null,
      activeCaseResultStatus,
    );
  }, [activeCaseId, activeCaseName, activeCaseResultStatus, setActiveCase]);

  useEffect(() => {
    refreshAttemptedCaseRef.current = null;
  }, [activeCaseId]);

  useEffect(() => {
    if (!activeCaseId || snapshotLoading) return;
    if (routeRunRef.current && snapshot) return;

    const routeCaseRequiresHydration =
      routeCaseRef.current === activeCaseId
      && snapshotCaseId === activeCaseId
      && snapshot !== null
      && !hasTopologicalContent(snapshot);
    if (snapshot && snapshotCaseId === activeCaseId && !routeCaseRequiresHydration) return;

    const refreshKey = [
      activeCaseId,
      snapshotCaseId ?? 'bez-zakresu',
      snapshot?.header?.hash_sha256 ?? 'bez-migawki',
      routeCaseRequiresHydration ? 'adres-pusty' : 'standard',
    ].join(':');
    if (refreshAttemptedCaseRef.current === refreshKey) return;
    refreshAttemptedCaseRef.current = refreshKey;
    void refreshFromBackend(activeCaseId);
  }, [activeCaseId, refreshFromBackend, snapshot, snapshotCaseId, snapshotLoading]);

  useEffect(() => {
    if (!derDrag.state) return;
    if (activeRouteSurface?.screenCode && activeRouteSurface.screenCode !== 'E-01') {
      derDrag.cancel();
    }
  }, [activeRouteSurface?.screenCode, derDrag]);

  useEffect(() => {
    const cancelDerInsertMode = () => derDrag.cancel();
    window.addEventListener('mvdesignpro:der-created', cancelDerInsertMode);
    window.addEventListener('mvdesignpro:station-configurator-opened', cancelDerInsertMode);
    return () => {
      window.removeEventListener('mvdesignpro:der-created', cancelDerInsertMode);
      window.removeEventListener('mvdesignpro:station-configurator-opened', cancelDerInsertMode);
    };
  }, [derDrag]);

  const handleSelectElement = useCallback((id: string | null, kind: string) => {
    setSelectedId(id);
    if (!id) {
      selectElement(null);
      setDetailDrawerData(null);
      return;
    }

    // K30-78: intercept station click when DER drag active → drop+open DER tab.
    if (kind === 'station' && derDrag.state) {
      const dropResult = derDrag.dropOnStation(id);
      if (dropResult) {
        const stationForDrop = sldData.stations.find((s) => s.id === id);
        setDetailDrawerData({
          kind: 'der',
          elementId: id,
          label: stationForDrop?.stationCode
            ?? stationForDrop?.name
            ?? id.split('/').pop()
            ?? id,
          voltageKv: stationForDrop?.busVoltageKv ?? null,
          stationCode: stationForDrop?.stationCode ?? null,
          accentColor: dropResult.kind === 'PV' ? '#FFD166' : dropResult.kind === 'BESS' ? '#7DD3FC' : '#7EE0B5',
          derKind: dropResult.kind,
          derConnectionVariant: 'nn_side',
        });
        return;
      }
    }

    // K30-72: open SldDetailDrawer per element kind
    const drawerKind = mapKindToDrawerKind(kind);
    if (drawerKind) {
      const stationForDrawer = sldData.stations.find((s) => s.id === id);
      const internalStationRef = stationRefFromInternalElement(id);
      const stationForInternalElement = internalStationRef
        ? sldData.stations.find((s) => s.id === internalStationRef)
        : undefined;
      const stationContext = kind === 'station'
        ? stationForDrawer
        : stationForInternalElement ?? sldData.stations[0];
      const internalElementDescription = describeStationInternalElement(snapshot, id);
      // K30-79: real transformer spec from snapshot (gdy station kind)
      let transformerSpec: SldDetailDrawerData['transformerSpec'] = null;
      // K30-80: bay list dla rozdzielnica tab
      let baysSpec: SldDetailDrawerData['baysSpec'] = undefined;
      let switchgearDescription: SldDetailDrawerData['switchgearDescription'] = null;
      // K30-81: nN side spec (LV bus + loads)
      let nnSpec: SldDetailDrawerData['nnSpec'] = null;
      // K30-82: existing DERs on station (snapshot.generators filter station_ref)
      let existingDers: SldDetailDrawerData['existingDers'] = undefined;
      // K30-83: bay apparatus list (from bay.equipment_refs + runtime_state)
      let apparatusSpec: SldDetailDrawerData['apparatusSpec'] = undefined;
      if (drawerKind === 'station' && snapshot) {
        const substation = findSubstationByRef(snapshot, id);
        switchgearDescription = formatStationSwitchgearDescriptionPl(substation?.station_type);
        const transformers = selectStationTransformers(snapshot, substation ?? null);
        const tr = transformers[0];
        if (tr) {
          transformerSpec = {
            vectorGroup: tr.vector_group ?? null,
            snMva: typeof tr.sn_mva === 'number' ? tr.sn_mva : null,
            uhvKv: typeof tr.uhv_kv === 'number' ? tr.uhv_kv : null,
            ulvKv: typeof tr.ulv_kv === 'number' ? tr.ulv_kv : null,
            ukPercent: typeof tr.uk_percent === 'number' ? tr.uk_percent : null,
          };
        }
        const bays = selectStationBays(snapshot, substation ?? null);
        baysSpec = bays.map((b) => ({
          id: b.ref_id ?? b.id,
          name: b.name ?? null,
          bayRole: b.bay_role ?? null,
          bayNumber: b.bay_number ?? null,
          feederShortName: b.feeder_short_name ?? null,
        }));
        // K30-81: find LV bus + loads na nim
        const lvBusRef = tr?.lv_bus_ref ?? null;
        const lvBus = lvBusRef
          ? (snapshot.buses ?? []).find((b) => b.ref_id === lvBusRef || b.id === lvBusRef)
          : null;
        const loadsOnLv = lvBusRef
          ? (snapshot.loads ?? []).filter((l) => l.bus_ref === lvBusRef)
          : [];
        nnSpec = {
          busVoltageKv: lvBus?.voltage_kv ?? tr?.ulv_kv ?? null,
          loads: loadsOnLv.map((l) => ({
            id: l.ref_id ?? l.id,
            name: l.name ?? null,
            pKw: typeof l.p_mw === 'number' ? l.p_mw * 1000 : null,
            qKvar: typeof l.q_mvar === 'number' ? l.q_mvar * 1000 : null,
          })),
        };
        // K30-82: existing DERs — generators with station_ref == substation
        const substationRef = substation?.ref_id ?? substation?.id ?? id;
        const dersOnStation = (snapshot.generators ?? []).filter(
          (g) => g.station_ref === substationRef,
        );
        const genTypeToKind = (t: string | null | undefined): 'PV' | 'BESS' | 'FW' | null => {
          if (!t) return null;
          if (t === 'pv_inverter') return 'PV';
          if (t === 'bess') return 'BESS';
          if (t === 'wind_inverter' || t === 'fw_pmsg' || t === 'fw_dfig' || t === 'fw_scig') return 'FW';
          return null;
        };
        existingDers = dersOnStation.map((g) => ({
          id: g.ref_id ?? g.id,
          kind: genTypeToKind(g.gen_type ?? null),
          name: g.name ?? null,
          pMw: typeof g.p_mw === 'number' ? g.p_mw : null,
        }));
      }
      // K30-89: cable run spec (gdy drawer kind='cable_run')
      // K30-93: + maxLoadingPct + maxVoltageDropPct z lfDerivedMetrics
      let cableRunSpec: SldDetailDrawerData['cableRunSpec'] = null;
      if (drawerKind === 'cable_run') {
        const run = sldData.cableRuns.find((r) => r.id === id);
        if (run) {
          let lengthKm: number | null = null;
          if (snapshot && run.segmentRefs && run.segmentRefs.length > 0) {
            let total = 0;
            let countWithLength = 0;
            for (const segRef of run.segmentRefs) {
              const seg = (snapshot.branches ?? []).find(
                (b: { ref_id?: string; id?: string }) => b.ref_id === segRef || b.id === segRef,
              );
              if (seg && 'length_km' in seg && typeof (seg as { length_km: number }).length_km === 'number') {
                total += (seg as { length_km: number }).length_km;
                countWithLength++;
              }
            }
            if (countWithLength > 0) lengthKm = total;
          }
          // K30-93: pull cable loading from LF derived metrics
          let maxLoadingPct: number | null = null;
          let maxVoltageDropPct: number | null = null;
          if (overlayPayload) {
            const lfMeta = computeLfDerivedMetrics(
              overlayPayload,
              sldData.stations.map((s) => ({ id: s.id, busVoltageKv: s.busVoltageKv })),
              sldData.cableRuns.map((r) => ({
                id: r.id,
                segmentRefs: r.segmentRefs,
                voltageKv: r.voltageKv,
              })),
            );
            const loading = lfMeta.cableLoadingPctByRunId.get(run.id);
            if (typeof loading === 'number') maxLoadingPct = loading;
            // Voltage drop = max |station deviation| on stations along this run
            const devs = Array.from(lfMeta.voltageDeviationPctByStationId.values());
            if (devs.length > 0) {
              maxVoltageDropPct = Math.max(...devs.map((d) => Math.abs(d)));
            }
          }
          cableRunSpec = {
            runKind: run.runKind ?? null,
            segmentCount: run.segmentRefs?.length ?? null,
            stationCount: null,
            lengthKm,
            segmentKind: run.segmentKind ?? null,
            maxLoadingPct,
            maxVoltageDropPct,
          };
        }
      }
      // K30-83: bay apparatus list (gdy drawer kind='bay')
      if (drawerKind === 'bay' && snapshot) {
        const bay = findBayByRef(snapshot, id);
        const states = bay?.runtime_state?.primary_device_states ?? {};
        const inferKind = (appId: string): 'CB' | 'DS' | 'ES' | 'CT' | 'VT' | 'OTHER' => {
          const lower = appId.toLowerCase();
          if (lower.includes('breaker') || lower.endsWith('#cb')) return 'CB';
          if (lower.includes('disconnector') || lower.endsWith('#ds')) return 'DS';
          if (lower.includes('earthing') || lower.endsWith('#es')) return 'ES';
          if (lower.includes('current_transformer') || lower.endsWith('#ct')) return 'CT';
          if (lower.includes('voltage_transformer') || lower.endsWith('#vt')) return 'VT';
          return 'OTHER';
        };
        const labelFor = (k: 'CB' | 'DS' | 'ES' | 'CT' | 'VT' | 'OTHER', appId: string): string => {
          if (k === 'CB') return 'Wyłącznik';
          if (k === 'DS') return appId.includes('out') ? 'Odłącznik odpływowy' : 'Odłącznik';
          if (k === 'ES') return 'Uziemnik';
          if (k === 'CT') return 'Przekładnik prądowy';
          if (k === 'VT') return 'Przekładnik napięciowy';
          return appId.split('#').pop() ?? appId;
        };
        const mapState = (raw: unknown): 'closed' | 'open' | 'unknown' => {
          if (raw && typeof raw === 'object' && 'actual_state' in raw) {
            const v = (raw as { actual_state: string }).actual_state;
            if (v === 'zamkniety') return 'closed';
            if (v === 'otwarty') return 'open';
          }
          return 'unknown';
        };
        apparatusSpec = (bay?.equipment_refs ?? []).map((eqId) => {
          const k = inferKind(eqId);
          return {
            id: eqId,
            kind: k,
            label: labelFor(k, eqId),
            state: mapState(states[eqId]),
          };
        });
      }
      // K30-97: apparatus state (gdy drawer kind='apparatus')
      let apparatusState: SldDetailDrawerData['apparatusState'] = null;
      if (drawerKind === 'apparatus' && snapshot) {
        // Look up state across all bays' primary_device_states
        let raw: unknown = null;
        for (const sub of (snapshot.substations ?? []) as Array<{ bays?: Array<{ runtime_state?: { primary_device_states?: Record<string, unknown> } }> }>) {
          for (const b of sub.bays ?? []) {
            const ds = b.runtime_state?.primary_device_states ?? {};
            if (id in ds) { raw = ds[id]; break; }
          }
          if (raw) break;
        }
        if (raw && typeof raw === 'object') {
          const r = raw as {
            actual_state?: string;
            control_mode?: string;
            communication_ok?: boolean;
            interlock_blocked?: boolean;
            last_state_change_at?: string;
          };
          const mapState = (v: string | undefined): 'closed' | 'open' | 'unknown' | null =>
            v === 'zamkniety' ? 'closed' : v === 'otwarty' ? 'open' : v === 'nieznany' ? 'unknown' : null;
          const mapMode = (v: string | undefined): 'LOKALNY' | 'ZDALNY' | 'AUTO' | 'BLOKADA' | null => {
            if (!v) return null;
            const up = v.toUpperCase();
            if (up === 'LOKALNY' || up === 'ZDALNY' || up === 'AUTO' || up === 'BLOKADA') return up;
            return null;
          };
          apparatusState = {
            actualState: mapState(r.actual_state),
            controlMode: mapMode(r.control_mode),
            communicationOk: r.communication_ok ?? null,
            interlockBlocked: r.interlock_blocked ?? null,
            lastChangeAt: r.last_state_change_at ?? null,
          };
        }
      }
      // K30-98: breadcrumb context dla bay/apparatus selections
      let parentStationLabel: string | null = null;
      let parentBayLabel: string | null = null;
      if ((drawerKind === 'bay' || drawerKind === 'apparatus') && stationContext) {
        parentStationLabel = stationContext.stationCode
          ?? stationContext.name
          ?? null;
      }
      if (drawerKind === 'apparatus' && snapshot) {
        for (const sub of (snapshot.substations ?? []) as Array<{ name?: string; bays?: Array<{ name?: string; ref_id?: string; equipment_refs?: string[] }> }>) {
          for (const b of sub.bays ?? []) {
            if (b.equipment_refs?.includes(id)) {
              parentBayLabel = b.name ?? b.ref_id ?? null;
              break;
            }
          }
          if (parentBayLabel) break;
        }
      }
      setDetailDrawerData({
        kind: drawerKind,
        elementId: id,
        label: stationForDrawer?.stationCode
          ?? stationForDrawer?.name
          ?? internalElementDescription?.name
          ?? id.split('/').pop()
          ?? id,
        voltageKv: stationForDrawer?.busVoltageKv ?? stationForInternalElement?.busVoltageKv ?? null,
        stationCode: stationContext?.stationCode ?? null,
        accentColor: '#7EC8FF',
        transformerSpec,
        baysSpec,
        switchgearDescription,
        nnSpec,
        existingDers,
        apparatusSpec,
        cableRunSpec,
        liveMetrics: buildLiveMetrics(overlayPayload, drawerKind, id, stationForDrawer?.busVoltageKv ?? null),
        alarmSeverity: stationForDrawer?.alarmSeverity ?? null,
        apparatusState,
        parentStationLabel,
        parentBayLabel,
      });
    }

    let selected: SelectedElement | null = null;
    if (kind === 'der') {
      const der = sldData.ders.find((item) => item.id === id);
      if (der) {
        selected = {
          id,
          type: mapDerKindToElementType(der.kind),
          name: der.name,
        };
      }
    } else if (kind === 'station') {
      const station = sldData.stations.find((item) => item.id === id);
      const enmStation = findSubstationByRef(snapshot, id);
      selected = {
        id,
        type: 'Station',
        name: enmStation && snapshot
          ? stationPublicIdentity(snapshot, enmStation).displayName
          : station?.name ?? id,
      };
    } else if (kind === 'gpz') {
      const gpz = sldData.gpzs.find((item) => item.id === id);
      selected = {
        id,
        type: 'Source',
        name: gpz?.name ?? findSubstationByRef(snapshot, id)?.name ?? id,
      };
    } else if (kind === 'bay') {
      const bay = findBayByRef(snapshot, id);
      const internalElement = describeStationInternalElement(snapshot, id);
      selected = {
        id,
        type: internalElement?.type ?? 'BaySN',
        name: internalElement?.name ?? bay?.name ?? bay?.ref_id ?? id,
      };
    } else if (kind === 'apparatus') {
      selected = describeGpzApparatus(snapshot, id);
    } else if (kind === 'lv_breaker') {
      const internalElement = describeStationInternalElement(snapshot, id);
      selected = {
        id,
        type: internalElement?.type ?? 'SwitchNN',
        name: internalElement?.name ?? (id.includes('/pv/') ? 'Wyłącznik nN PV' : 'Wyłącznik nN'),
      };
    } else if (kind === 'protection') {
      const internalElement = describeStationInternalElement(snapshot, id);
      selected = {
        id,
        type: internalElement?.type ?? 'ProtectionNN',
        name: internalElement?.name ?? (id.includes('e2tango') ? 'Zabezpieczenie PV e2TANGO-400' : 'Zabezpieczenie nN'),
      };
    } else if (kind === 'pv_inverter') {
      const internalElement = describeStationInternalElement(snapshot, id);
      selected = {
        id,
        type: internalElement?.type ?? 'PVInverter',
        name: internalElement?.name ?? 'Falownik PV',
        semanticHash: internalElement?.semanticHash ?? `source:${id}`,
        semanticElementKind: 'SOURCE',
        semanticEngineeringRole: 'PV_INVERTER',
      };
    } else if (kind === 'pcc') {
      const internalElement = describeStationInternalElement(snapshot, id);
      selected = {
        id,
        type: internalElement?.type ?? 'ConnectionPoint',
        name: internalElement?.name ?? 'Punkt przyłączenia PV po stronie nN',
      };
    } else if (kind === 'cable_run') {
      const run = sldData.cableRuns.find((item) => item.id === id);
      selected = {
        id,
        type: 'LineBranch',
        name: run?.id ?? id,
      };
    } else if (kind === 'transformer') {
      const transformer = (snapshot?.transformers ?? []).find((item) => item.ref_id === id || item.id === id);
      const internalElement = describeStationInternalElement(snapshot, id);
      selected = {
        id,
        type: 'TransformerBranch',
        name: transformer?.name ?? internalElement?.name ?? 'Transformator SN/nN',
      };
    } else if (kind === 'section') {
      selected = {
        id,
        type: 'Bus',
        name: `Sekcja SN ${id}`,
      };
    }

    collapseSurfaceStackTo(null);
    selectElement(selected ?? { id, type: 'DescriptiveElement', name: id });
  }, [collapseSurfaceStackTo, selectElement, snapshot, sldData, derDrag, overlayPayload]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return undefined;
    const handleNativeApparatusSelect = (event: Event) => {
      if (event instanceof MouseEvent && event.button !== 0) return;
      const apparatusId = readNativeApparatusElementId(event.target);
      if (!apparatusId) return;
      event.stopPropagation();
      handleSelectElement(apparatusId, 'apparatus');
    };
    const handleNativeGpzSelect = (event: Event) => {
      if (event instanceof MouseEvent && event.button !== 0) return;
      const gpzId = readNativeElementIdByKind(event.target, 'gpz');
      if (!gpzId) return;
      event.stopPropagation();
      handleSelectElement(gpzId, 'gpz');
    };
    root.addEventListener('mousedown', handleNativeGpzSelect, true);
    root.addEventListener('click', handleNativeGpzSelect, true);
    root.addEventListener('focusin', handleNativeGpzSelect, true);
    root.addEventListener('mousedown', handleNativeApparatusSelect, true);
    root.addEventListener('click', handleNativeApparatusSelect, true);
    root.addEventListener('focusin', handleNativeApparatusSelect, true);
    return () => {
      root.removeEventListener('mousedown', handleNativeGpzSelect, true);
      root.removeEventListener('click', handleNativeGpzSelect, true);
      root.removeEventListener('focusin', handleNativeGpzSelect, true);
      root.removeEventListener('mousedown', handleNativeApparatusSelect, true);
      root.removeEventListener('click', handleNativeApparatusSelect, true);
      root.removeEventListener('focusin', handleNativeApparatusSelect, true);
    };
  }, [handleSelectElement]);

  const handleDoubleClickStation = useCallback((id: string) => {
    setInternalStationId(id);
  }, []);

  // Faza G: dwuklik DER (PV/BESS/FW) na SLD → otwarcie konfiguratora E-21/E-22/E-23.
  // Rozpoznajemy rodzaj DER po prefixie id (`der_pv_*`, `der_bess_*`, `der_fw_*`)
  // wytwarzanym przez AddDerWizard. Naprawa hmi.2: przekazujemy stationId
  // przez payload aby DerConfigurator mógł zbudować breadcrumb.
  const handleDoubleClickDer = useCallback(
    (id: string) => {
      let screenCode: 'E-21' | 'E-22' | 'E-23' = 'E-21';
      if (id.includes('bess')) screenCode = 'E-22';
      else if (id.includes('fw')) screenCode = 'E-23';
      // Pobierz stationId z useStationDerStore — payload zawiera kontekst.
      // Adapter: zaimportujemy selektor by wczytać z store'a.
      const ders = useStationDerStoreImport.getState().ders;
      const der = ders[id] ?? null;
      openRouteSurface(screenCode, {
        entityRef: id,
        subjectKind: 'helper_context',
        payload: { stationId: der?.station_id ?? null },
      });
    },
    [openRouteSurface],
  );

  const closeInternalStation = useCallback(() => setInternalStationId(null), []);

  // Iteracja 12: drag&drop z palety (BuildSidebar) → kanwa.
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (hasPaletteDragData(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const payload = readPaletteDragData(e);
      if (!payload) return;
      e.preventDefault();
      if (readOnly) {
        notify('Tryb podglądu schematu — przełącz na edycję, aby wstawiać elementy.', 'warning');
        return;
      }
      // Etap 12: drop intent → notify + zapamiętanie. Realne wstawianie elementu
      // wymaga insert tool flow (insert mode + click pozycji); tutaj sygnał
      // intencji do dalszej obsługi (pełny flow dochodzi w kolejnych iteracjach
      // po podpięciu BuildSequence.tryApplyCommand do snapshotStore).
      setPendingDrop(payload);
      notify(
        `Przygotowano wstawienie: ${payload.labelPl}. Otwórz konfigurator z menu kontekstowego po wstawieniu elementu.`,
        'info',
      );
    },
    [readOnly],
  );

  // Iteracja 12: lasso (Shift+drag w tle) — wybierz wiele elementów.
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.shiftKey || e.button !== 0) return;
    if (e.target !== e.currentTarget) {
      // klik tła sygnalizuje pointer-events = none na dzieciach? Bezpiecznik:
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag !== 'svg' && tag !== 'rect' && tag !== 'div') return;
    }
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const start = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    lassoStartRef.current = start;
    setLassoRect({ x: start.x, y: start.y, width: 0, height: 0 });
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!lassoStartRef.current) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const end = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setLassoRect(rectFromPoints(lassoStartRef.current, end));
  }, []);

  const handlePointerUp = useCallback(() => {
    if (lassoStartRef.current) {
      lassoStartRef.current = null;
      // Zatrzymaj lasso po krótkim czasie (pozwól użytkownikowi zobaczyć wybór).
      setTimeout(() => setLassoRect(null), 150);
    }
  }, []);

  const handleAction = useCallback(
    (actionId: string, kind: SldElementKindForMenu, elementId: string | null) => {
      if (readOnly && (actionId.startsWith('delete-') || actionId.startsWith('insert-')
          || actionId.startsWith('add-') || actionId.startsWith('extend-')
          || actionId.startsWith('start-') || actionId === 'set-switch-state'
          || actionId === 'continue-trunk'
          || actionId === 'continue-trunk-from-endpoint')) {
        notify('Tryb podglądu schematu — przełącz na edycję, aby budować sieć.', 'warning');
        return;
      }

      // 1) Akcje nawigacyjne — otwórz istniejącą powierzchnię.
      const screenCode = ACTION_TO_SCREEN[actionId];
      if (screenCode) {
        const apparatusSelection = kind === 'apparatus' && elementId
          ? parseGpzApparatusSelectionId(elementId)
          : null;
        const navigationElementId = apparatusSelection?.bayRef ?? elementId;
        openRouteSurface(screenCode as Parameters<typeof openRouteSurface>[0], {
          entityRef: navigationElementId ?? null,
          subjectKind: 'helper_context',
        });
        toastBus.publish('info', `Otworzono ${routeSurfaceLabelPl(screenCode)}.`);
        return;
      }

      const operationContext = buildSldOperationContext(
        actionId,
        kind,
        elementId,
        snapshot,
        logicalViews,
      );
      if (operationContext) {
        openOperationForm(operationContext.op, operationContext.context);
        notify(operationContext.messagePl, 'info');
        return;
      }

      // 1b) Faza G: 'add-source' z menu stacji → otwiera E-13 Karta 7 i prosi
      //     o kreator DER. Stację identyfikuje elementId (kontekst SLD).
      if (actionId === 'add-source' && kind === 'station' && elementId) {
        openRouteSurface('E-13', {
          entityRef: elementId,
          subjectKind: 'helper_context',
        });
        // Wystawiamy intent — controller w E-13 (StationConfiguratorSurface)
        // pokaże menu wyboru kindu (PV/BESS/FW) lub bezpośrednio uruchomi
        // kreator. Domyślnie sugerujemy PV; user wybiera w E-13.
        notify(
          'Otwarto kartę "Układy PV/BESS/FW" stacji. Użyj przycisków "Dodaj PV/BESS/FW" aby uruchomić kreator.',
          'info',
        );
        return;
      }

      // 2) Akcje roadmapowe — toast informacyjny z dokładną etapowością.
      const hint = ACTION_ROADMAP_HINT_PL[actionId];
      if (hint) {
        notify(hint, 'info');
        return;
      }

      // 5) Fallback — komunikat ogólny (nie powinien wystąpić, ale gwarantuje brak dead click).
      notify(`Akcja "${actionId}" nie jest jeszcze dostępna w tej wersji.`, 'info');
      // Konsumujemy parametr kind, żeby spełnić noUnusedParameters w trybie strict.
      void kind;
    },
    [logicalViews, openOperationForm, openRouteSurface, readOnly, snapshot],
  );

  // Toast feedback z bus'a (informacja zwrotna z poziomu menu).
  useEffect(() => {
    const unsubscribe = toastBus.subscribe((event) => {
      notify(event.messagePl, event.severity);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const internalStationProps = useMemo(() => {
    if (!internalStationId) return null;
    const station = findSubstationByRef(snapshot, internalStationId);
    const stationVisual = sldData.stations.find((item) => item.id === internalStationId);
    const stationTransformers = selectStationTransformers(snapshot, station);
    const stationBays = selectStationBays(snapshot, station);
    const stationBusRefs = new Set(station?.bus_refs ?? []);

    const snVoltageKv =
      uniqueSortedVoltages([
        ...Array.from(stationBusRefs).map((busRef) => findBusVoltage(snapshot, busRef)),
        ...stationTransformers.map((transformer) => transformer.uhv_kv),
      ].filter((voltage): voltage is number => typeof voltage === 'number' && voltage >= 1))[0]
      ?? 15;

    const nnVoltageLevels = uniqueSortedVoltages([
      ...Array.from(stationBusRefs)
        .map((busRef) => findBusVoltage(snapshot, busRef))
        .filter((voltage): voltage is number => typeof voltage === 'number' && voltage < 1),
      ...stationTransformers
        .map((transformer) => transformer.ulv_kv)
        .filter((voltage) => voltage < 1),
    ]);

    const overlayWidth = Math.min(
      STATION_INTERNAL_WIDTH_PX,
      Math.max(360, measured.width - 24),
    );
    const overlayHeight = Math.min(
      STATION_INTERNAL_HEIGHT_PX,
      Math.max(300, measured.height - 24),
    );

    return {
      substationId: internalStationId,
      name: station && snapshot ? stationPublicIdentity(snapshot, station).displayName : stationVisual?.name || internalStationId,
      topologicalType: inferStationTopologicalType(station, stationVisual?.topologicalType),
      snVoltageKv,
      nnVoltageLevels,
      bays: stationBays.map((bay) => ({
        bayId: bay.ref_id,
        designation: bay.name || bay.ref_id,
        bayRole: bay.bay_role,
        devices: [],
      })),
      transformers: stationTransformers.map((transformer) => ({
        transformerId: transformer.ref_id,
        designation: transformer.name || transformer.ref_id,
        snMva: transformer.sn_mva,
        uhvKv: transformer.uhv_kv,
        ulvKv: transformer.ulv_kv,
      })),
      nnSwitchgears: nnVoltageLevels.map((voltage) => ({
        designation: `Rozdzielnica nN ${formatKvPl(voltage)}`,
        nnVoltageKv: voltage,
        feedersCount: (snapshot?.loads ?? []).filter((load) => {
          const loadVoltage = findBusVoltage(snapshot, load.bus_ref);
          return loadVoltage !== null && Math.abs(loadVoltage - voltage) < 0.001;
        }).length,
      })),
      ders: (snapshot?.generators ?? [])
        .filter((generator) => generator.station_ref === internalStationId
          || generator.meta?.station_ref === internalStationId)
        .map<InternalDerDescriptor>((generator) => ({
          derId: generator.ref_id,
          kind: generator.gen_type === 'bess'
            ? 'BESS'
            : generator.gen_type === 'wind_inverter' || generator.gen_type === 'fw_pmsg' || generator.gen_type === 'fw_dfig' || generator.gen_type === 'fw_scig'
              ? 'FW'
              : 'PV',
          connectionSide:
            generator.connection_variant === 'nn_side' || generator.connection_variant === 'LV_BEHIND_STATION_TRANSFORMER'
              ? 'nn'
              : generator.connection_variant === 'block_transformer' || generator.connection_variant === 'DEDICATED_MV_CONNECTION'
                ? 'dedicated'
                : 'sn',
          count: 1,
        })),
      width: overlayWidth,
      height: overlayHeight,
      onClose: closeInternalStation,
      onSelectBay: (elementId: string) => {
        if (elementId.includes('/pv/protection/')) {
          handleSelectElement(elementId, 'protection');
        } else if (elementId.includes('/pv/inverter/')) {
          handleSelectElement(elementId, 'pv_inverter');
        } else if (elementId.includes('/pv/nn-pcc')) {
          handleSelectElement(elementId, 'pcc');
        } else if (elementId.includes('/pv/nn-breaker/') || elementId.includes('/nn/')) {
          handleSelectElement(elementId, 'lv_breaker');
        } else {
          handleSelectElement(elementId, 'bay');
        }
      },
      onSelectTransformer: (elementId: string) => handleSelectElement(elementId, 'transformer'),
    };
  }, [internalStationId, closeInternalStation, handleSelectElement, measured.height, measured.width, snapshot, sldData.stations]);

  const contextApparatus = contextRequest?.kind === 'apparatus' && contextRequest.elementId
    ? parseGpzApparatusSelectionId(contextRequest.elementId)
    : null;
  const contextElementName = useMemo(() => {
    const elementId = contextRequest?.elementId;
    if (!elementId) return undefined;
    if (contextRequest.kind === 'apparatus') {
      return describeGpzApparatus(snapshot, elementId).name;
    }
    if (contextRequest.kind === 'station') {
      return sldData.stations.find((station) => station.id === elementId)?.name
        ?? snapshot?.substations?.find((station) => station.id === elementId || station.ref_id === elementId)?.name
        ?? elementId;
    }
    return elementId;
  }, [contextRequest?.elementId, contextRequest?.kind, snapshot, sldData.stations]);
  const apparatusOverlayTargets = useMemo(
    () =>
      currentLod >= 1
        ? canonicalGpzs.flatMap((gpz) => buildGpzApparatusOverlayTargets(gpz, viewportTransform))
        : [],
    [canonicalGpzs, currentLod, viewportTransform],
  );
  const canPlaceDerOnStation = sldData.stations.length > 0;
  const derPaletteBlockedReason = canPlaceDerOnStation
    ? undefined
    : 'Najpierw wstaw stację SN/nN w ciągu SN.';

  const closeDetailDrawer = useCallback(() => {
    setDetailDrawerData(null);
    setSelectedId(null);
    selectElement(null);
    derDrag.cancel();
  }, [derDrag, selectElement]);

  const handleDetailDrawerSave = useCallback(async (payload: SldDetailDrawerSavePayload) => {
    const label = detailDrawerData?.label ?? payload.elementId ?? '—';

    if (payload.kind !== 'der') {
      closeDetailDrawer();
      return;
    }

    if (!activeProjectId || !activeCaseId) {
      notify('Nie można zapisać DER: wybierz aktywny projekt i przypadek.', 'error');
      return;
    }
    if (!payload.elementId || !payload.derConfig) {
      notify('Nie można zapisać DER: wskaż stację i dane formularza.', 'error');
      return;
    }

    try {
      const response = await postDerGeneratorConfig(activeProjectId, activeCaseId, {
        station_ref: payload.elementId,
        der_kind: payload.derConfig.derKind,
        power_mw: payload.derConfig.powerMw,
        connection_variant: payload.derConfig.connectionVariant,
        catalog_ref: payload.derConfig.inverterCatalogRef,
        source_name: `${payload.derConfig.derKind} ${label}`,
        quantity: 1,
        nc_rfg_module: payload.derConfig.ncRfgModule,
      });
      setSnapshot(response);
      notify(`Zapisano konfigurację DER: ${label}.`, 'success');
      closeDetailDrawer();
    } catch (error) {
      const message = error instanceof DerPersistenceApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Nie udało się zapisać konfiguracji DER.';
      notify(message, 'error');
    }
  }, [activeCaseId, activeProjectId, closeDetailDrawer, detailDrawerData, setSnapshot]);

  return (
    <SldThemeProvider mode={themeMode}>
    <div
      ref={containerRef}
      data-testid="sld-workspace-container"
      data-readonly={readOnly}
      data-pending-drop={pendingDrop?.kind ?? ''}
      // K30-51 LAYOUT OVERHAUL: grid dots wyłączone w default view (były
      // distraktorem na schemacie). Włączyć via ?editGrid=1 dla CAD-style edit.
      className={`relative flex h-full w-full overflow-hidden bg-scada-bg${
        typeof window !== 'undefined' && window.location.search.includes('editGrid=1')
          ? ' sld-canvas-grid'
          : ''
      }`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Iter 7 CAD rulers — top (X) + left (Y) per CAD specjalista
          (iter 5 verify: "RULERS BRAK — górna/lewa linijka z podziałką").
          Static decorative overlay (pointer-events: none) — ETAP-grade visual cue. */}
      <div className="sld-canvas-ruler sld-canvas-ruler-top" aria-hidden="true" />
      <div className="sld-canvas-ruler sld-canvas-ruler-left" aria-hidden="true" />

      <SldCanvasV2
        width={measured.width}
        height={measured.height}
        gpzs={sldData.gpzs}
        canonicalGpzs={canonicalGpzs}
        sections={sldData.sections}
        cableRuns={sldData.cableRuns}
        stations={sldData.stations}
        ders={sldData.ders}
        connections={sldData.derConnections}
        selectedId={selectedId}
        onSelectElement={handleSelectElement}
        onDoubleClickStation={handleDoubleClickStation}
        onDoubleClickDer={handleDoubleClickDer}
        onContextMenu={handleContextMenu}
        onViewportTransformChange={setViewportTransform}
      />

      {/* K30-72: SldDetailDrawer right-side panel — opens onClick element.
          Tab interface adapts per kind (station/bay/apparatus/der/cable_run). */}
      <SldDetailDrawer
        open={detailDrawerData !== null}
        data={detailDrawerData}
        onClose={closeDetailDrawer}
        onSave={handleDetailDrawerSave}
        onOpenFullView={
          detailDrawerData?.kind === 'station' && detailDrawerData.elementId
            ? () => {
                if (detailDrawerData.elementId) {
                  setInternalStationId(detailDrawerData.elementId);
                  setDetailDrawerData(null);
                }
              }
            : undefined
        }
      />

      {/* K30-78: DER palette toolbar — kliknij ikonę DER (PV/BESS/FW)
          → następnie kliknij stację, by otworzyć drawer DER z pre-fillem. */}
      {canPlaceDerOnStation && (
      <div
        className="pointer-events-auto absolute top-3 z-30 flex items-center gap-1 rounded border border-scada-border bg-scada-panel/95 px-2 py-1 shadow-lg"
        data-testid="sld-v2-der-palette"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
      >
        <span style={{ fontSize: 9, color: '#7E8790', marginRight: 4, fontWeight: 700, letterSpacing: 0.5 }}>
          UKŁADY PV/BESS/FW:
        </span>
        {(['PV', 'BESS', 'FW'] as DerDragKind[]).map((kind) => (
          <DerPaletteButton
            key={kind}
            kind={kind}
            onStart={(k) => derDrag.startDrag(k)}
            disabled={derDrag.state !== null && derDrag.state.kind !== kind}
            disabledReason={
              derPaletteBlockedReason
              ?? (derDrag.state !== null && derDrag.state.kind !== kind
                ? 'Zakończ bieżące wskazanie układu.'
                : undefined)
            }
            active={derDrag.state?.kind === kind}
          />
        ))}
        {derDrag.state && (
          <span
            data-testid="sld-v2-der-palette-hint"
            style={{ fontSize: 9, color: '#FFD166', marginLeft: 8, fontStyle: 'italic' }}
          >
            ▸ Wskaż stację dla {derDrag.state.kind}
            <button
              type="button"
              onClick={derDrag.cancel}
              data-testid="sld-v2-der-palette-cancel"
              style={{
                marginLeft: 6,
                background: 'transparent',
                border: '1px solid #5A6878',
                color: '#DDF7FF',
                borderRadius: 2,
                padding: '1px 4px',
                fontSize: 9,
                cursor: 'pointer',
              }}
            >
              Anuluj
            </button>
          </span>
        )}
      </div>
      )}

      {/* Iter 9 (SCADA blocker): floating LayerTogglePanel dock w prawym dolnym
          rogu canvasu. Toggle CTA otwiera/zamyka pełen panel 13 warstw.
          F4: theme toggle + SVG export alongside layer toggle. */}
      <div className="pointer-events-auto absolute bottom-3 right-3 z-20 flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setThemeMode((m) => (m === 'dark_scada' ? 'light_technical' : 'dark_scada'))}
            data-testid="sld-theme-toggle"
            title={themeMode === 'dark_scada' ? 'Przełącz na motyw jasny (eksport)' : 'Przełącz na motyw ciemny (SCADA)'}
            className="h-7 rounded border border-scada-border bg-scada-panel/95 px-2 font-mono-eng text-[10px] font-semibold text-scada-text shadow-lg hover:bg-scada-hover-nav"
          >
            {themeMode === 'dark_scada' ? '☀ Jasny' : '◉ SCADA'}
          </button>
          <button
            type="button"
            onClick={handleExportSvg}
            data-testid="sld-export-svg"
            title="Eksportuj schemat SLD jako plik SVG"
            className="h-7 rounded border border-scada-border bg-scada-panel/95 px-2 font-mono-eng text-[10px] font-semibold text-scada-text shadow-lg hover:bg-scada-hover-nav"
          >
            ↓ SVG
          </button>
        </div>
        <button
          type="button"
          onClick={() => setLayerPanelOpen((prev) => !prev)}
          data-testid="sld-layer-panel-toggle"
          aria-label={layerPanelOpen ? 'Zamknij panel warstw' : 'Otwórz panel warstw (13)'}
          title={layerPanelOpen ? 'Zamknij panel warstw' : 'Warstwy (13)'}
          className="h-7 rounded border border-scada-border bg-scada-panel/95 px-2 font-mono-eng text-[10px] font-semibold text-scada-text shadow-lg hover:bg-scada-hover-nav"
        >
          {layerPanelOpen ? '▾ Warstwy' : '▴ Warstwy (13)'}
        </button>
        {layerPanelOpen && (
          <LayerTogglePanel
            state={layerState}
            currentLod={currentLod}
            onToggleLayer={handleToggleLayer}
            onResetAll={handleResetLayers}
            className="w-[240px]"
          />
        )}
      </div>

      {/* Iter 10 (Whitebox blocker): CTA do 8 proof packs bez zaslaniania
          widoku wielostacyjnego. Panel otwiera sie jawnie z przycisku. */}
      <div
        className="pointer-events-auto absolute bottom-3 left-3 z-20 flex flex-col items-start gap-1"
        data-testid="sld-proof-packs-dock"
      >
        <button
          type="button"
          onClick={() => setProofPanelOpen((prev) => !prev)}
          data-testid="sld-proof-packs-toggle"
          aria-expanded={proofPanelOpen}
          aria-label={proofPanelOpen ? 'Zamknij panel dowodów inżynierskich' : 'Otwórz panel dowodów inżynierskich'}
          title={proofPanelOpen ? 'Zamknij panel dowodów' : 'Dowody inżynierskie (8)'}
          className="h-7 rounded border border-scada-border bg-scada-panel/95 px-2 font-mono-eng text-[10px] font-semibold text-scada-text shadow-lg hover:bg-scada-hover-nav"
        >
          {proofPanelOpen ? '▾ Dowody (8)' : '▸ Dowody (8)'}
        </button>
        {proofPanelOpen && (
          <ProofPacksPanel
            hasNetworkModel={!isEmpty}
            className="max-h-[150px] w-[216px] overflow-y-auto"
          />
        )}
      </div>

      {/* Iter 11 (Projektant SN/WN blocker): NetworkHierarchyTree dock
          w lewym górnym rogu canvasu (z toggle CTA). Drzewo GPZ→Sekcja→Pole. */}
      <div
        className="pointer-events-auto absolute left-3 top-3 z-20 flex flex-col items-start gap-1"
        data-testid="sld-hierarchy-tree-dock"
      >
        <button
          type="button"
          onClick={() => setHierarchyPanelOpen((prev) => !prev)}
          data-testid="sld-hierarchy-tree-toggle"
          aria-label={hierarchyPanelOpen ? 'Zamknij drzewo układu' : 'Otwórz drzewo układu'}
          title={hierarchyPanelOpen ? 'Zamknij drzewo układu' : 'Drzewo układu sieci'}
          className="h-7 rounded border border-scada-border bg-scada-panel/95 px-2 font-mono-eng text-[10px] font-semibold text-scada-text shadow-lg hover:bg-scada-hover-nav"
        >
          {hierarchyPanelOpen ? '◂ Drzewo układu' : '▸ Drzewo układu'}
        </button>
        {hierarchyPanelOpen && (
          <NetworkHierarchyTree
            hierarchy={networkHierarchy}
            className="w-[240px]"
          />
        )}
      </div>

      {showCalculationConfigurationStack && (
        <section
          data-testid="sld-calculation-configuration-stack"
          className="pointer-events-auto absolute right-3 top-3 z-20 w-[min(320px,calc(100%-1.5rem))] rounded border border-amber-500/45 bg-scada-panel/92 px-3 py-2 text-[11px] text-scada-text shadow-xl"
          aria-label="Konfiguracja obliczeń na schemacie"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">Konfiguracja obliczeń</span>
            <span className={readinessBlockerCount > 0 ? 'text-red-300' : 'text-amber-300'}>
              w konfiguracji
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-scada-muted">
            {readinessBlockerCount > 0 && <span>Kroki techniczne: {readinessBlockerCount}</span>}
            {readinessWarningCount > 0 && <span>Uwagi projektowe: {readinessWarningCount}</span>}
          </div>
        </section>
      )}

      {apparatusOverlayTargets.map((target) => (
        <button
          key={`apparatus-overlay-${target.id}`}
          type="button"
          aria-label={target.label}
          data-testid={`sld-apparatus-overlay-${target.id}`}
          data-element-kind="apparatus"
          data-element-id={target.id}
          className="absolute z-10 border-0 bg-transparent p-0"
          style={{
            left: target.x,
            top: target.y,
            width: Math.max(8, target.width),
            height: Math.max(8, target.height),
            cursor: 'pointer',
          }}
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            handleSelectElement(target.id, 'apparatus');
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleSelectElement(target.id, 'apparatus');
          }}
          onFocus={() => {
            handleSelectElement(target.id, 'apparatus');
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleSelectElement(target.id, 'apparatus');
            setContextRequest({
              kind: 'apparatus',
              elementId: target.id,
              clientX: event.clientX,
              clientY: event.clientY,
            });
          }}
        />
      ))}

      {/* Stan wczytywania z backendu — nie pokazujemy fałszywie pustej kanwy. */}
      {isEmpty && snapshotLoading && (
        <div
          data-testid="sld-loading-state"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="pointer-events-none max-w-md rounded border border-cyan-500/40 bg-scada-panel/95 p-6 text-center text-scada-text shadow-xl">
            <div className="mb-2 text-sm font-bold uppercase tracking-widest text-cyan-300">
              Schemat jednokreskowy
            </div>
            <h2 className="mb-3 text-lg font-semibold text-scada-text">
              Wczytywanie układu sieci z serwera
            </h2>
            <p className="text-sm leading-6 text-scada-muted">
              Pobieram aktualną wersję układu, odcinki, stacje i powiązania wyników
              dla aktywnego zakresu obliczeń.
            </p>
          </div>
        </div>
      )}

      {/* Pusty stan — pierwszy krok projektowy z jawnym CTA GPZ i katalogami. */}
      {isEmpty && !snapshotLoading && (
        <div
          data-testid="sld-empty-state"
          className="absolute inset-0 flex items-center justify-center"
          onContextMenu={handleEmptyStateContextMenu}
        >
          <div className="pointer-events-auto max-w-md rounded border border-scada-border bg-scada-panel/95 p-6 text-center text-scada-text shadow-xl">
            <div className="mb-2 text-sm font-bold uppercase tracking-widest text-scada-muted">
              Schemat jednokreskowy
            </div>
            <h2 className="mb-3 text-lg font-semibold text-scada-text">
              Wybierz wariant GPZ i rozpocznij ciąg SN
            </h2>
            <p className="text-sm leading-6 text-scada-muted">
              Zacznij od kompletnego układu GPZ z rozdzielnią SN, sekcjami szyn
              i polami liniowymi. Potem wyprowadź odcinek katalogowy i zakończ
              go stacją, ZK SN, słupem rozgałęźnym albo kolejnym węzłem ciągu.
            </p>
            <div className="mt-4 flex flex-col items-stretch gap-2">
              <button
                type="button"
                data-testid="sld-empty-state-insert-gpz"
                className="rounded border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleAction('insert-gpz', 'background', null);
                }}
              >
                Wstaw Główny Punkt Zasilający
              </button>
              <button
                type="button"
                data-testid="sld-empty-state-open-catalogs"
                className="rounded border border-scada-border bg-scada-surface px-4 py-2 text-sm text-scada-text hover:bg-scada-hover-nav focus:outline-none focus:ring-2 focus:ring-scada-border"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleAction('open-catalogs', 'background', null);
                }}
              >
                Przeglądaj katalogi techniczne
              </button>
              {/* Kreator Stacji KOMPLETNY v2 — 17 kroków per /goal */}
              <a
                href="#kreator-stacji-v2"
                data-testid="sld-empty-state-open-station-wizard"
                className="rounded border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-center text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                Otwórz Kreator Stacji KOMPLETNY (17 kroków)
              </a>
            </div>
            <p className="mt-3 text-xs text-scada-muted">
              Po wstawieniu GPZ karta techniczna poprowadzi przez sekcje szyn,
              pola liniowe, odcinki, stacje i układy PV/BESS/FW.
            </p>
          </div>
        </div>
      )}

      {/* Menu kontekstowe — most do SLD_MENU_REGISTRY. */}
      <SldContextMenuController
        request={contextRequest}
        elementName={contextElementName}
        mode={activeMode}
        context={{ apparatusKind: contextApparatus?.apparatusKind }}
        onAction={handleAction}
        onClose={closeContextMenu}
      />

      {/* Wizard K7 — Conscious Split preview_ready panel. */}
      {splitPreviewState !== null && splitPreviewState !== undefined && (
        <SplitPreviewPanel
          preview={splitPreviewState.preview}
          onConfirm={onSplitConfirm ?? (() => {})}
          onCancel={onSplitCancel ?? (() => {})}
        />
      )}

      {/* Lasso multi-select overlay (warstwa screen-space). */}
      {lassoRect && (
        <svg
          className="pointer-events-none absolute inset-0 z-20"
          width="100%"
          height="100%"
        >
          <LassoSelector visible={true} rect={lassoRect} />
        </svg>
      )}

      {/* Drill-down stacji — overlay z wewnętrznym SLD. */}
      {internalStationProps && (
        <div
          data-testid="station-internal-view"
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/60"
          onClick={closeInternalStation}
        >
          <div
            className="rounded border border-scada-border bg-scada-panel shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <StationInternalView {...internalStationProps} />
            <div className="flex justify-end gap-2 border-t border-scada-border bg-scada-surface px-4 py-2">
              <button
                type="button"
                className="rounded border border-scada-border px-3 py-1 text-sm text-scada-text hover:bg-scada-hover-nav"
                onClick={closeInternalStation}
                data-testid="station-internal-close"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </SldThemeProvider>
  );
}

// Re-eksport typów do użycia w testach.
export type { SldContextMenuRequest, SldElementKindForMenu };
export { COMMAND_FEEDBACK_PL };

export default SldWorkspaceContainer;
