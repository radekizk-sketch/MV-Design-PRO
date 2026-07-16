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
} from 'react';

import { useAppStateStore } from '../../../app-state';
import { LayerTogglePanel } from '../lod/LayerTogglePanel';
import {
  SldDetailDrawer,
  type SldDetailDrawerAction,
  type SldDetailDrawerData,
  type SldDetailDrawerSavePayload,
} from './SldDetailDrawer';
import { DerPersistenceApiError, postDerGeneratorConfig } from './derPersistenceApi';
import { useDerDragDrop, DerPaletteButton, type DerDragKind } from './useDerDragDrop';
import { SldExportFormatMenu } from '../export/SldExportFormatMenu';
import { useRawResultOverlayStore } from '../../../sld-overlay/rawResultOverlayStore';
import {
  createInitialLayerState,
  toggleLayer,
  type LayerId,
  type LayerState,
} from '../lod/layerToggle';
import { inferLodFromScale, type LodLevel } from '../lod/LodPolicy';
import { mapLayerStateToRenderVisibility } from '../lod/layerMapping';
import { ProofPacksPanel } from '../proof/ProofPacksPanel';
import { NetworkHierarchyTree } from '../domain/NetworkHierarchyTree';
import { buildNetworkHierarchyFromSnapshot } from '../../shared/networkHierarchyFromSnapshot';
import { SldContextMenuController } from '../../../context-menu/SldContextMenuController';
import type { SldContextMenuRequest } from '../../../context-menu/SldContextMenuController';
import { useNetworkBuildStore } from '../../../network-build/networkBuildStore';
import { notify } from '../../../notifications/store';
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import type { EnergyNetworkModel } from '../../../../types/enm';
import type { ElementType, SelectedElement } from '../../../types';
import { stationPublicIdentity } from '../../../shared/publicTechnicalLabels';
import {
  COMMAND_FEEDBACK_PL,
  getMenuActions,
  toastBus,
  type SldElementKindForMenu,
} from '../command/SldCommandService';
import { SldThemeProvider } from '../theme/themeContext';
import { SplitPreviewPanel } from '../workflow/SplitPreviewPanel';
import type { SplitStatePreviewReady } from '../workflow/ConsciousSplitController';
import { SldCanvasV2, type SldCanvasContextMenuRequest } from './SldCanvasV2';
import { StationInternalView } from './StationInternalView';
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
import { useMeasuredSize } from '../../shared/useMeasuredSize';
import {
  buildCableRunDetailDrawerData,
  buildDerDropDetailDrawerData,
  buildDetailDrawerDataForKind,
  buildNodeDetailDrawerData,
  describeStationInternalElement,
  findBayByRef,
  findSubstationByRef,
  mapKindToMenuKind,
  stationRefForTransformerSelection,
  stationRefFromInternalElement,
} from '../../shared/detailDrawerData';
import { buildStationInternalViewData } from '../../shared/stationInternalViewData';
import {
  DRAWER_ACTION_LABEL_PL,
  parseGpzApparatusSelectionId,
  useSldActionExecutor,
} from '../../shared/sldActionExecutor';

const MIN_CANVAS_WIDTH_PX = 360;
const MIN_CANVAS_HEIGHT_PX = 240;
// F8c pkt 7: `useMeasuredSize` wyciągnięty do `../shared/useMeasuredSize.ts`
// (była tu funkcja modułowa duplikująca v3, patrz docstring modułu
// współdzielonego dla pełnego porównania linia-po-linii).
// E16: safe rect = element minus chrome nakładek (toolbar u góry, chipy kontroli
// u dołu, marginesy boczne). Kamera startowa i „Dopasuj całą sieć" liczą fit/
// centrowanie względem tego prostokąta, więc treść nie chowa się pod nakładkami.
// Rezerwy chrome — NIE zmieniają geometrii świata, tylko obszar docelowy kamery.
const SLD_CANVAS_SAFE_INSETS = { top: 52, right: 16, bottom: 44, left: 16 } as const;
// F12-B (spec §10.1 ARCH-4, plan §F12): STATION_INTERNAL_WIDTH_PX/HEIGHT_PX
// przeniesione do `shared/stationInternalViewData.ts` (używane WYŁĄCZNIE
// przez `internalStationProps`, patrz import poniżej).
const GPZ_LV_SECTION_COUPLER_GAP = 72;
const GPZ_LV_SECTION_MIN_WIDTH = 260;
const GPZ_BAY_WIDTH = 74;
const GPZ_BAY_PITCH = 82;
const GPZ_SECTION_LABEL_WIDTH = 30;
const GPZ_PAGE_PADDING = 24;
const GPZ_TR_AREA_Y = 280;
// F12-B: `formatTechnicalNumberPl`/`formatKvPl` przeniesione do
// `shared/stationInternalViewData.ts` (jedyne użycie — `nnSwitchgears`
// designation w `internalStationProps`).
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

// F12-B: `inferStationTopologicalType`/`uniqueSortedVoltages` przeniesione do
// `shared/stationInternalViewData.ts` (jedyne użycie — `internalStationProps`).

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

function readUrlSearchParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name)?.trim() || null;
}

function readRouteRefreshToken(): string {
  const parts = [
    readUrlSearchParam('boot'),
    readHashParam('nocache'),
    readHashParam('case') ?? readHashParam('caseId'),
    readHashParam('run'),
  ].filter((value): value is string => Boolean(value));
  return parts.join(':');
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
  const measured = useMeasuredSize(
    containerRef,
    1024,
    640,
    { width: widthOverride, height: heightOverride },
    MIN_CANVAS_WIDTH_PX,
    MIN_CANVAS_HEIGHT_PX,
  );

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
  const collapseSurfaceStackTo = useNetworkBuildStore((state) => state.collapseSurfaceStackTo);
  const activeRouteSurface = useNetworkBuildStore((state) => state.activeSurface);
  const selectElement = useSelectionStore((state) => state.selectElement);
  const selectedElement = useSelectionStore((state) => state.selectedElement);
  const centerSldOnElement = useSelectionStore((state) => state.centerSldOnElement);
  const centerOnElementId = useSelectionStore((state) => state.sldCenterOnElement);

  const [contextRequest, setContextRequest] = useState<SldContextMenuRequest | null>(null);
  const [internalStationId, setInternalStationId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    const nextSelectedId = selectedElement?.id ?? null;
    setSelectedId((current) => (current === nextSelectedId ? current : nextSelectedId));
    if (nextSelectedId) {
      centerSldOnElement(nextSelectedId);
    }
  }, [centerSldOnElement, selectedElement?.id]);
  // K30-72: detail drawer state (SldDetailDrawer K30-71)
  const [detailDrawerData, setDetailDrawerData] = useState<SldDetailDrawerData | null>(null);
  // K30-78: DER drag-drop palette → station → drawer DER tab pre-filled.
  const derDrag = useDerDragDrop();
  // K30-84: subscribe to LF/SC overlay payload dla inline metric chips
  const overlayPayload = useRawResultOverlayStore((s) => s.payload);
  const [viewportTransform, setViewportTransform] = useState<ViewportTransform>(IDENTITY_TRANSFORM);
  const refreshAttemptedCaseRef = useRef<string | null>(null);
  const routeRefreshHydratedRef = useRef<string | null>(null);
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
  // F12-B (spec §10.1 ARCH-4, plan §F12): budowa hierarchii wyciągnięta do
  // `shared/networkHierarchyFromSnapshot.ts` — v2 i v3 czytają JEDNĄ
  // implementację (zero duplikacji, zero zmiany zachowania — funkcja
  // przeniesiona 1:1, patrz docstring modułu współdzielonego).
  const networkHierarchy = useMemo(() => buildNetworkHierarchyFromSnapshot(snapshot), [snapshot]);

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
        const canonical = buildCanonicalGpzProps(snapshot, g.id, { x: g.x, y: g.y }, overlayPayload);
        out.push(canonical);
      } catch {
        // Substation nie jest typu 'gpz' lub nie istnieje — legacy fallback.
      }
    }
    return out;
  }, [snapshot, sldData.gpzs, overlayPayload]);

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
    const routeRefreshToken = readRouteRefreshToken();
    const routeRefreshKey = routeRefreshToken ? `${activeCaseId}:${routeRefreshToken}` : '';
    const routeRefreshRequiresHydration =
      routeCaseRef.current === activeCaseId
      && routeRefreshKey.length > 0
      && routeRefreshHydratedRef.current !== routeRefreshKey;
    if (routeRunRef.current && snapshot && !routeRefreshRequiresHydration) return;

    const routeCaseRequiresHydration =
      routeCaseRef.current === activeCaseId
      && snapshotCaseId === activeCaseId
      && snapshot !== null
      && !hasTopologicalContent(snapshot);
    if (snapshot && snapshotCaseId === activeCaseId && !routeCaseRequiresHydration && !routeRefreshRequiresHydration) return;

    const refreshKey = [
      activeCaseId,
      snapshotCaseId ?? 'bez-zakresu',
      snapshot?.header?.hash_sha256 ?? 'bez-migawki',
      routeCaseRequiresHydration ? 'adres-pusty' : 'standard',
      routeRefreshRequiresHydration ? routeRefreshToken : 'bez-tokena',
    ].join(':');
    if (refreshAttemptedCaseRef.current === refreshKey) return;
    refreshAttemptedCaseRef.current = refreshKey;
    if (routeRefreshRequiresHydration) {
      routeRefreshHydratedRef.current = routeRefreshKey;
    }
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
      centerSldOnElement(null);
      setDetailDrawerData(null);
      return;
    }

    centerSldOnElement(id);

    // F11.4-B / ARCH-4 (spec §10.1, plan F8c pkt 1a/2): budowa danych drawera
    // wyciągnięta do WSPÓŁDZIELONEGO `shared/detailDrawerData.ts` — v2 woła
    // czyste budowniczące (`buildCableRunDetailDrawerData`/
    // `buildNodeDetailDrawerData`/`buildDerDropDetailDrawerData`/
    // `buildDetailDrawerDataForKind`), a lokalne efekty uboczne
    // (`selectElement`/`collapseSurfaceStackTo`/przechwycenie `derDrag`)
    // ZOSTAJĄ tutaj — patrz nagłówek modułu współdzielonego dla pełnego
    // uzasadnienia i mapowania linia-po-linii na poprzednią wersję.
    if (kind === 'cable_run' || kind === 'cable_segment_sn' || kind === 'overhead_line_sn') {
      const cableRunDrawerData = buildCableRunDetailDrawerData(snapshot, sldData, overlayPayload, kind, id);
      setDetailDrawerData(cableRunDrawerData);
      selectElement({
        id: cableRunDrawerData.elementId ?? id,
        type: 'LineBranch',
        name: cableRunDrawerData.label ?? cableRunDrawerData.elementId ?? id,
      });
      collapseSurfaceStackTo(null);
      return;
    }

    if (kind === 'zksn' || kind === 'branch_pole') {
      const nodeDrawerData = buildNodeDetailDrawerData(snapshot, overlayPayload, kind, id);
      const elementType: ElementType = kind === 'zksn' ? 'ZKSN' : 'BranchPole';
      setDetailDrawerData(nodeDrawerData);
      selectElement({
        id: nodeDrawerData.elementId ?? id,
        type: elementType,
        name: nodeDrawerData.label ?? nodeDrawerData.elementId ?? id,
      });
      collapseSurfaceStackTo(null);
      return;
    }

    // K30-78: intercept station click when DER drag active → drop+open DER tab.
    if (kind === 'station' && derDrag.state) {
      const dropResult = derDrag.dropOnStation(id);
      if (dropResult) {
        setDetailDrawerData(buildDerDropDetailDrawerData(sldData, id, dropResult.kind));
        return;
      }
    }

    // K30-72: open SldDetailDrawer per element kind
    const drawerData = buildDetailDrawerDataForKind(kind, id, { snapshot, sldData, overlayPayload });
    if (drawerData) {
      setDetailDrawerData(drawerData);
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
    } else if (kind === 'der_block_transformer') {
      const transformer = (snapshot?.transformers ?? []).find((item) => item.ref_id === id || item.id === id);
      selected = {
        id,
        type: 'TransformerBranch',
        name: transformer?.name ?? 'Transformator blokowy DER',
      };
    } else if (kind === 'der_pcc_bay') {
      const derRef = id.endsWith('/pcc') ? id.slice(0, -'/pcc'.length) : id;
      const generator = (snapshot?.generators ?? []).find((item) => item.ref_id === derRef || item.id === derRef);
      selected = {
        id,
        type: 'ConnectionPoint',
        name: generator?.name ? `Pole/PCC źródła ${generator.name}` : 'Pole/PCC źródła DER',
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
  }, [
    centerSldOnElement,
    collapseSurfaceStackTo,
    openRouteSurface,
    selectElement,
    snapshot,
    sldData,
    derDrag,
    overlayPayload,
  ]);

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

  // ARCH-3 (spec §10.1, plan F8c pkt 1a/2): wykonawca akcji domenowych
  // wyciągnięty do modułu współdzielonego `shared/sldActionExecutor.ts` —
  // v2 i v3 czytają JEDNĄ implementację (zero duplikacji, zero zmiany
  // zachowania — patrz docstring modułu dla pełnego uzasadnienia i mapowania
  // linia-po-linii na dawne ciało tego `useCallback`).
  const handleAction = useSldActionExecutor({ readOnly });

  const detailDrawerActions = useMemo<SldDetailDrawerAction[]>(() => {
    if (!detailDrawerData?.elementId) return [];
    const menuKind = mapKindToMenuKind(detailDrawerData.menuKind ?? detailDrawerData.kind ?? '');
    if (!menuKind) return [];
    const apparatusKind = parseGpzApparatusSelectionId(detailDrawerData.elementId)?.apparatusKind;
    return getMenuActions(menuKind, {
      hasResults: activeCaseResultStatus === 'FRESH',
      apparatusKind,
    }).map((action) => ({
      id: action.id,
      labelPl: DRAWER_ACTION_LABEL_PL[action.id] ?? action.labelPl,
      group: action.group,
      disabledReasonPl: action.disabled ? action.disabledReasonPl ?? 'Akcja niedostępna dla bieżącego obiektu.' : undefined,
      onClick: () => handleAction(action.id, menuKind, detailDrawerData.elementId),
    }));
  }, [activeCaseResultStatus, detailDrawerData, handleAction]);

  const canOpenDetailFullView = Boolean(
    detailDrawerData?.elementId
    && (
      detailDrawerData.kind === 'station'
      || detailDrawerData.kind === 'transformer'
      || detailDrawerData.kind === 'cable_run'
      || detailDrawerData.kind === 'node'
    ),
  );

  const openDetailFullView = useCallback(() => {
    if (!detailDrawerData?.elementId) return;
    if (detailDrawerData.kind === 'station') {
      setInternalStationId(detailDrawerData.elementId);
      setDetailDrawerData(null);
      return;
    }
    if (detailDrawerData.kind === 'transformer') {
      const stationRef = stationRefForTransformerSelection(snapshot, detailDrawerData.elementId);
      if (!stationRef) {
        notify('Nie znaleziono stacji powiązanej z transformatorem.', 'warning');
        return;
      }
      setInternalStationId(stationRef);
      setDetailDrawerData(null);
      return;
    }
    if (detailDrawerData.kind === 'cable_run') {
      openRouteSurface('E-12', {
        entityRef: detailDrawerData.elementId,
        entityType: 'segment',
        subjectKind: 'helper_context',
        payload: { defaultCard: 'trasa' },
      });
      setDetailDrawerData(null);
      return;
    }
    if (detailDrawerData.kind === 'node') {
      const screenCode = detailDrawerData.nodeSpec?.nodeKind === 'branch_pole' ? 'E-15' : 'E-14';
      openRouteSurface(screenCode, {
        entityRef: detailDrawerData.elementId,
        entityType: detailDrawerData.nodeSpec?.nodeKind === 'branch_pole' ? 'branch_pole' : 'zksn',
        subjectKind: 'helper_context',
      });
      setDetailDrawerData(null);
    }
  }, [detailDrawerData, openRouteSurface, snapshot]);

  const canOpenDetailConfiguration = Boolean(detailDrawerData?.elementId && detailDrawerData.kind);

  const openDetailConfiguration = useCallback(() => {
    if (!detailDrawerData?.elementId || !detailDrawerData.kind) return;
    if (detailDrawerData.kind === 'station') {
      openRouteSurface('E-13', {
        entityRef: detailDrawerData.elementId,
        entityType: 'station',
        subjectKind: 'helper_context',
        payload: { defaultCard: 'overview' },
      });
      setDetailDrawerData(null);
      toastBus.publish('info', 'Otwarto konfigurator stacji.');
      return;
    }
    if (detailDrawerData.kind === 'transformer') {
      const stationRef = stationRefForTransformerSelection(snapshot, detailDrawerData.elementId);
      if (!stationRef) {
        notify('Nie znaleziono stacji powiązanej z transformatorem.', 'warning');
        return;
      }
      openRouteSurface('E-13', {
        entityRef: stationRef,
        entityType: 'station',
        subjectKind: 'helper_context',
        payload: { defaultCard: 'transformer' },
      });
      setDetailDrawerData(null);
      toastBus.publish('info', 'Otwarto kartę transformatora stacji.');
      return;
    }
    if (detailDrawerData.kind === 'cable_run') {
      openRouteSurface('E-12', {
        entityRef: detailDrawerData.elementId,
        entityType: 'segment',
        subjectKind: 'helper_context',
        payload: { defaultCard: 'parametry' },
      });
      setDetailDrawerData(null);
      toastBus.publish('info', 'Otwarto konfigurację odcinka SN.');
      return;
    }
    if (detailDrawerData.kind === 'node') {
      const screenCode = detailDrawerData.nodeSpec?.nodeKind === 'branch_pole' ? 'E-15' : 'E-14';
      openRouteSurface(screenCode, {
        entityRef: detailDrawerData.elementId,
        entityType: detailDrawerData.nodeSpec?.nodeKind === 'branch_pole' ? 'branch_pole' : 'zksn',
        subjectKind: 'helper_context',
      });
      setDetailDrawerData(null);
      toastBus.publish('info', 'Otwarto kartę węzła sieci SN.');
      return;
    }
    const menuKind = mapKindToMenuKind(detailDrawerData.menuKind ?? detailDrawerData.kind);
    if (menuKind) {
      const primaryAction = menuKind === 'bay'
        ? 'open-bay'
        : menuKind === 'apparatus'
          ? 'configure-equipment'
          : menuKind === 'der_pv'
            ? 'open-pv-config'
            : menuKind === 'der_bess'
              ? 'open-bess-config'
              : menuKind === 'der_fw'
                ? 'open-fw-config'
                : null;
      if (primaryAction) {
        handleAction(primaryAction, menuKind, detailDrawerData.elementId);
      }
    }
  }, [detailDrawerData, handleAction, openRouteSurface, snapshot]);

  // Toast feedback z bus'a (informacja zwrotna z poziomu menu).
  useEffect(() => {
    const unsubscribe = toastBus.subscribe((event) => {
      notify(event.messagePl, event.severity);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // F12-B (spec §10.1 ARCH-4, plan §F12): budowa danych wyciągnięta do
  // `shared/stationInternalViewData.ts` (czysta funkcja, zero callbacków —
  // patrz DECYZJA w nagłówku modułu) — v2 i v3 czytają JEDNĄ implementację.
  // Callbacki (`onClose`/`onSelectBay`/`onSelectTransformer`) ZOSTAJĄ tu,
  // bo zależą od stanu/dyspozytora lokalnego kontenera (`handleSelectElement`).
  const internalStationData = useMemo(
    () => buildStationInternalViewData(snapshot, sldData, internalStationId, measured),
    [internalStationId, measured, snapshot, sldData],
  );
  const internalStationProps = useMemo(() => {
    if (!internalStationData) return null;
    return {
      ...internalStationData,
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
  }, [internalStationData, closeInternalStation, handleSelectElement]);

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

  const selectedStationRefForDer = useMemo(() => {
    const stationRefs = new Set(sldData.stations.map((station) => station.id));
    if (
      activeRouteSurface?.screenCode === 'E-13'
      && activeRouteSurface.entityRef
      && stationRefs.has(activeRouteSurface.entityRef)
    ) {
      return activeRouteSurface.entityRef;
    }
    if (selectedId && stationRefs.has(selectedId)) return selectedId;
    const internalStationRef = selectedId ? stationRefFromInternalElement(selectedId) : null;
    if (selectedElement?.type === 'Station' && stationRefs.has(selectedElement.id)) {
      return selectedElement.id;
    }
    return internalStationRef && stationRefs.has(internalStationRef) ? internalStationRef : null;
  }, [
    activeRouteSurface?.entityRef,
    activeRouteSurface?.screenCode,
    selectedElement?.id,
    selectedElement?.type,
    selectedId,
    sldData.stations,
  ]);

  const startDerConfiguration = useCallback(
    (kind: DerDragKind) => {
      if (readOnly) {
        notify('Tryb podgl?du schematu - prze??cz na edycj?, aby doda? uk?ad PV/BESS/FW.', 'warning');
        return;
      }
      if (!selectedStationRefForDer) {
        derDrag.startDrag(kind);
        return;
      }
      derDrag.cancel();
      openRouteSurface('E-13', {
        entityRef: selectedStationRefForDer,
        entityType: 'station',
        subjectKind: 'helper_context',
        payload: {
          defaultCard: 'der-sources',
          addDerKind: kind,
          addDerRequestId: `${kind}:${Date.now()}`,
        },
      });
      notify(`Otwieram kreator ${kind} dla wybranej stacji.`, 'info');
    },
    [derDrag, openRouteSurface, readOnly, selectedStationRefForDer],
  );

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

    const effectiveDerCaseId = snapshot && snapshotCaseId ? snapshotCaseId : activeCaseId;
    if (!activeProjectId || !effectiveDerCaseId) {
      notify('Nie można zapisać DER: wybierz aktywny projekt i przypadek.', 'error');
      return;
    }
    if (!payload.elementId || !payload.derConfig) {
      notify('Nie można zapisać DER: wskaż stację i dane formularza.', 'error');
      return;
    }

    try {
      const response = await postDerGeneratorConfig(activeProjectId, effectiveDerCaseId, {
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
  }, [
    activeCaseId,
    activeProjectId,
    closeDetailDrawer,
    detailDrawerData,
    setSnapshot,
    snapshot,
    snapshotCaseId,
  ]);

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
        safeInsets={SLD_CANVAS_SAFE_INSETS}
        gpzs={sldData.gpzs}
        canonicalGpzs={canonicalGpzs}
        sections={sldData.sections}
        cableRuns={sldData.cableRuns}
        stations={sldData.stations}
        branchPoints={sldData.branchPoints}
        ders={sldData.ders}
        connections={sldData.derConnections}
        topologyCorridors={sldData.topologyCorridors}
        topologyRuns={sldData.topologyRuns}
        terminalBindings={sldData.terminalBindings}
        labelSpecs={sldData.labelSpecs}
        readabilityReport={sldData.readabilityReport}
        selectedId={selectedId}
        centerOnElementId={centerOnElementId}
        layerVisibility={mapLayerStateToRenderVisibility(layerState, currentLod)}
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
        onOpenFullView={canOpenDetailFullView ? openDetailFullView : undefined}
        onOpenConfiguration={canOpenDetailConfiguration ? openDetailConfiguration : undefined}
        actions={detailDrawerActions}
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
            onStart={startDerConfiguration}
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
          <SldExportFormatMenu
            svgSelector='svg[data-testid="sld-canvas-v2"]'
            projectName={undefined}
            caseLabel={undefined}
          />
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
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="pointer-events-none max-w-md rounded border border-scada-border bg-scada-panel/95 p-6 text-center text-scada-text shadow-xl">
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
                className="pointer-events-auto rounded border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="pointer-events-auto rounded border border-scada-border bg-scada-surface px-4 py-2 text-sm text-scada-text hover:bg-scada-hover-nav focus:outline-none focus:ring-2 focus:ring-scada-border"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleAction('open-catalogs', 'background', null);
                }}
              >
                Przeglądaj katalogi techniczne
              </button>
              {/* Konfiguracja stacji v2 - 17 krokow per /goal */}
              <a
                href="#kreator-stacji-v2"
                data-testid="sld-empty-state-open-station-wizard"
                className="pointer-events-auto rounded border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-center text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                Otwórz konfigurację stacji (17 kroków)
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
          data-view-mode="side-drawer"
          className="pointer-events-none absolute bottom-3 right-3 top-3 z-30 flex max-w-[min(760px,calc(100%-1.5rem))] items-start justify-end"
        >
          <div
            className="pointer-events-auto max-h-full overflow-auto rounded border border-scada-border bg-scada-panel shadow-2xl"
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
