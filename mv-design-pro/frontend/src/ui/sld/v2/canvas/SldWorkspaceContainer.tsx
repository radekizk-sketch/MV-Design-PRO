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
import { SldContextMenuController } from '../../../context-menu/SldContextMenuController';
import type { SldContextMenuRequest } from '../../../context-menu/SldContextMenuController';
import { useNetworkBuildStore } from '../../../network-build/networkBuildStore';
import { notify } from '../../../notifications/store';
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import type { Bay, EnergyNetworkModel, LogicalViewsV1, Substation, Transformer } from '../../../../types/enm';
import type { ElementType, SelectedElement } from '../../../types';
import { buildOperationContext } from '../../../network-build/operationContext';
import type { NetworkBuildOperationName } from '../../../network-build/internal/legacySurfaceTypes';
import {
  COMMAND_FEEDBACK_PL,
  toastBus,
  type SldElementKindForMenu,
} from '../command/SldCommandService';
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
  // Etap 5: źródła OZE (PV/BESS/FW):
  'open-pv-config': 'E-21',
  'open-bess-config': 'E-22',
  'open-fw-config': 'E-23',
  'show-frt-hvrt': 'E-26',
  'show-ncrfg': 'E-26',
};

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
  'add-source': 'Wybór rodzaju DER (PV/BESS/FW) odbywa się w karcie "Źródła i magazyny" konfiguratora stacji E-13.',
  'add-load': 'Dodawanie obciążenia nN: Etap 4 roadmapy.',
  'continue-trunk': 'Kontynuacja ciągu głównego: Etap 4 roadmapy.',
  'set-switch-state': 'Zmiana stanu łącznika: Etap 6 roadmapy.',
  'show-measurements': 'Podgląd pomiarów pola: Etap 7 roadmapy.',
  'show-sc-source': 'Dane zwarciowe źródła GPZ: dostępne w karcie "Strona 110 kV" konfiguratora GPZ (E-10).',
  'show-sc-data': 'Dane zwarciowe sekcji: dostępne w konfiguratorze GPZ (E-10) → "Strona 110 kV".',
  'change-family-to-overhead': 'Zmiana rodziny: użyj konfiguratora odcinka (E-12) → karta "Identyfikacja & rodzina".',
  'change-family-to-cable': 'Zmiana rodziny: użyj konfiguratora odcinka (E-12) → karta "Identyfikacja & rodzina".',
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
  const { readOnly = false, width: widthOverride, height: heightOverride } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const measured = useMeasuredSize(containerRef, 1024, 640, {
    width: widthOverride,
    height: heightOverride,
  });

  const snapshot = useSnapshotStore((state) => state.snapshot);
  const readiness = useSnapshotStore((state) => state.readiness);
  const logicalViews = useSnapshotStore((state) => state.logicalViews);
  const activeMode = useAppStateStore((state) => state.activeMode);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const collapseSurfaceStackTo = useNetworkBuildStore((state) => state.collapseSurfaceStackTo);
  const selectElement = useSelectionStore((state) => state.selectElement);

  const [contextRequest, setContextRequest] = useState<SldContextMenuRequest | null>(null);
  const [internalStationId, setInternalStationId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewportTransform, setViewportTransform] = useState<ViewportTransform>(IDENTITY_TRANSFORM);
  // Iteracja 12: lasso multi-select state.
  const [lassoRect, setLassoRect] = useState<LassoRect | null>(null);
  const lassoStartRef = useRef<{ x: number; y: number } | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PaletteDragPayload | null>(null);

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

  const handleSelectElement = useCallback((id: string | null, kind: string) => {
    setSelectedId(id);
    if (!id) {
      selectElement(null);
      return;
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
      selected = {
        id,
        type: 'Station',
        name: station?.name ?? findSubstationByRef(snapshot, id)?.name ?? id,
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
      selected = {
        id,
        type: 'BaySN',
        name: bay?.name ?? bay?.ref_id ?? id,
      };
    } else if (kind === 'apparatus') {
      selected = describeGpzApparatus(snapshot, id);
    } else if (kind === 'lv_breaker') {
      selected = {
        id,
        type: 'SwitchNN',
        name: id.includes('/pv/') ? 'Wyłącznik nN PV' : 'Wyłącznik nN',
      };
    } else if (kind === 'protection') {
      selected = {
        id,
        type: 'ProtectionNN',
        name: id.includes('e2tango') ? 'Zabezpieczenie PV e2TANGO-400' : 'Zabezpieczenie nN',
      };
    } else if (kind === 'pv_inverter') {
      selected = {
        id,
        type: 'PVInverter',
        name: 'Falownik PV',
        semanticHash: `source:${id}`,
        semanticElementKind: 'SOURCE',
        semanticEngineeringRole: 'PV_INVERTER',
      };
    } else if (kind === 'pcc') {
      selected = {
        id,
        type: 'ConnectionPoint',
        name: 'Punkt przyłączenia PV po stronie nN',
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
      selected = {
        id,
        type: 'TransformerBranch',
        name: transformer?.name ?? transformer?.ref_id ?? id,
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
  }, [collapseSurfaceStackTo, selectElement, snapshot, sldData]);

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
        notify('Tryb podglądu schematu — wstawianie elementów zablokowane.', 'warning');
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
        notify('Tryb podglądu schematu — operacje budowy są zablokowane.', 'warning');
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
        toastBus.publish('info', `Przeniesiono do ekranu ${screenCode}.`);
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
          'Otwarto kartę "Źródła i magazyny" stacji. Użyj przycisków "Dodaj PV/BESS/FW" aby uruchomić kreator.',
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
      name: station?.name || stationVisual?.name || internalStationId,
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
        designation: `Rozdzielnica nN ${voltage} kV`,
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
  const contextElementName = contextRequest?.kind === 'apparatus' && contextRequest.elementId
    ? describeGpzApparatus(snapshot, contextRequest.elementId).name
    : contextRequest?.elementId ?? undefined;
  const apparatusOverlayTargets = useMemo(
    () => canonicalGpzs.flatMap((gpz) => buildGpzApparatusOverlayTargets(gpz, viewportTransform)),
    [canonicalGpzs, viewportTransform],
  );

  return (
    <div
      ref={containerRef}
      data-testid="sld-workspace-container"
      data-readonly={readOnly}
      data-pending-drop={pendingDrop?.kind ?? ''}
      className="sld-canvas-grid relative flex h-full w-full overflow-hidden bg-scada-bg"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <SldCanvasV2
        width={measured.width}
        height={measured.height}
        gpzs={sldData.gpzs}
        canonicalGpzs={canonicalGpzs}
        sections={sldData.sections}
        cableRuns={sldData.cableRuns}
        stations={sldData.stations}
        ders={sldData.ders}
        connections={[]}
        selectedId={selectedId}
        onSelectElement={handleSelectElement}
        onDoubleClickStation={handleDoubleClickStation}
        onDoubleClickDer={handleDoubleClickDer}
        onContextMenu={handleContextMenu}
        onViewportTransformChange={setViewportTransform}
      />

      <section
        data-testid="sld-readiness-stack"
        className="pointer-events-auto absolute right-3 top-3 z-20 w-[min(360px,calc(100%-1.5rem))] rounded border border-scada-border bg-scada-panel/92 px-3 py-2 text-[11px] text-scada-text shadow-xl"
        aria-label="Gotowość obliczeń na schemacie"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">Gotowość obliczeń</span>
          <span className={readinessReady ? 'text-emerald-300' : readinessBlockerCount > 0 ? 'text-red-300' : 'text-amber-300'}>
            {readinessReady ? 'gotowe' : readinessBlockerCount > 0 ? 'zablokowane' : 'wynik częściowy'}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-2 text-scada-muted">
          <span>Blokady: {readinessBlockerCount}</span>
          <span>Ostrzeżenia: {readinessWarningCount}</span>
        </div>
      </section>

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

      {/* Pusty stan — kanoniczny komunikat polski. */}
      {isEmpty && (
        <div
          data-testid="sld-empty-state"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          onContextMenu={handleEmptyStateContextMenu}
        >
          <div className="pointer-events-none max-w-md rounded border border-scada-border bg-scada-panel/95 p-6 text-center text-scada-text shadow-xl">
            <div className="mb-2 text-sm font-bold uppercase tracking-widest text-scada-muted">
              Schemat jednokreskowy
            </div>
            <h2 className="mb-3 text-lg font-semibold text-scada-text">
              Schemat oczekuje na dane modelu sieci
            </h2>
            <p className="text-sm leading-6 text-scada-muted">
              Rozpocznij budowę od wstawienia Głównego Punktu Zasilającego.
              Kliknij prawym przyciskiem myszy na kanwie, aby otworzyć menu
              kontekstowe budowy modelu.
            </p>
            <p className="mt-3 text-xs text-scada-muted">
              Pomoc inżynierska: prawy klik na elementach modelu otwiera akcje
              właściwe dla danego obiektu (pole, stacja, kabel, źródło OZE).
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
  );
}

// Re-eksport typów do użycia w testach.
export type { SldContextMenuRequest, SldElementKindForMenu };
export { COMMAND_FEEDBACK_PL };

export default SldWorkspaceContainer;
