/**
 * SLD View — Read-Only Single Line Diagram Viewer
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md: SLD ↔ selection synchronization
 * - ui_canonical_parity.md: Canonical-like presentation
 *
 * FEATURES:
 * - Read-only rendering of network topology
 * - Zoom/Pan navigation
 * - Selection sync with URL / Inspector / Project Tree
 * - Fit-to-content
 * - 100% Polish UI
 *
 * NO EDITING: This is a presentation-only view.
 */

import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { SLDViewCanvas } from './SLDViewCanvas';
import { ResultsOverlay } from './ResultsOverlay';
import { DiagnosticsOverlay } from './DiagnosticsOverlay';
import { DiagnosticResultsLayer } from './DiagnosticResultsLayer';
import { ProtectionOverlayLayer } from './ProtectionOverlayLayer';
import { SwitchingStateLegend } from './SwitchingStateLegend';
import { useSldModeStore, SLD_MODE_LABELS_PL, type SldMode } from './sldModeStore';
import { useProtectionStatistics } from './protection';
import {
  DEFAULT_VIEWPORT,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  calculateSymbolsBounds,
  fitToContent,
  type InteractionPortRole,
  type ViewportState,
  type SLDViewProps,
} from './types';
import type { AnySldSymbol } from '../sld-editor/types';
import type { EnergyNetworkModel } from '../../types/enm';
import {
  buildSemanticElementMap,
  createSemanticContextMenuElement,
  createSemanticSelectedElement,
  mapSemanticElementKindToElementType,
  type EngineeringElementKind,
  type EngineeringSemanticModel,
} from '../engineering-semantic';
import type { ElementType, SelectedElement } from '../types';
import { useSelectionStore } from '../selection/store';
import { useResultsInspectorStore } from '../results-inspector/store';
import { useDiagnosticsStore } from './diagnosticsStore';
import { updateUrlWithSelection } from '../navigation/urlState';
import { SEVERITY_FILTER_LABELS_PL, type DiagnosticsSeverityFilter } from '../protection';
import { useSanityChecks } from '../protection';
import {
  SldSnapshotExportDialog,
  executeSldExport,
  getCurrentLayerState,
  createExportOptions,
  type ExportFormat,
  type ExportLayerOptions,
  type PngScale,
  type PdfPageSize,
  type PdfOrientation,
  type ExportScope,
} from './export';
import { useOverlayRuntime, OverlayLegend } from '../sld-overlay';
import { SldTechLabelsLayer } from './SldTechLabelsLayer';
import { useCanCalculate, useAppStateStore } from '../app-state';
import { useSnapshotStore } from '../topology/snapshotStore';
import {
  useNetworkBuildStore,
  type ActiveObjectCard,
  type NetworkBuildOperationName,
} from '../network-build/networkBuildStore';
import { supportsOperationForm } from '../network-build/OperationFormRouter';
import { useReadinessLiveStore } from '../engineering-readiness/readinessLiveStore';
import { buildOperationContext } from '../network-build/operationContext';
import { resolveObjectCardKind } from '../network-build/contextMenuIntegration';
import { resolveClickAction } from './SldModeInteractionHandler';
import { useOperationalModeStore } from './operationalModeStore';
import { EngineeringContextMenu } from '../context-menu/EngineeringContextMenu';
import type { EngineeringContextMenuState, CatalogGateRequest } from '../context-menu/EngineeringContextMenu';
import {
  CONTEXT_ACTION_TO_OPERATION,
  NAVIGATION_ACTIONS,
  TOGGLE_ACTIONS,
} from '../context-menu/actionRouting';
import { useLabelModeStore } from './labelModeStore';
import { notify } from '../notifications/store';
import { TypePicker } from '../catalog/TypePicker';
import { buildCatalogBinding } from '../catalog/catalogBinding';
import { NAMESPACE_TO_PICKER_CATEGORY } from '../catalog/elementCatalogRegistry';
import type { CatalogNamespace, TypeCategory } from '../catalog/types';
import {
  buildConverterSourceOperationContext,
  resolveConverterSourceTechnologyFromActionId,
} from '../shared/converterSourceContext';
import type { CanonicalAnnotationsV1 } from './core/layoutResult';
import {
  preserveViewportCenterOnResize,
  zoomViewportByStep,
} from './interactionMath';
import { SldSemanticMinimap } from './SldSemanticMinimap';
import { SldSemanticDiagnosticsPanel } from './SldSemanticDiagnosticsPanel';
import {
  collectGpzSwitchgearSuppressedSymbolIds,
  shouldSuppressForGpzSwitchgear,
} from './gpzSwitchgearVisibility';

/**
 * Default canvas dimensions.
 */
const DEFAULT_WIDTH = 1000;
const DEFAULT_HEIGHT = 600;

/**
 * Default (closed) state for the engineering context menu.
 */
const CONTEXT_MENU_CLOSED: EngineeringContextMenuState = {
  isOpen: false,
  x: 0,
  y: 0,
  elementId: '',
  elementType: 'Bus',
  elementName: '',
};

const CONTEXT_MENU_OP_MAP = CONTEXT_ACTION_TO_OPERATION;

interface SldFitBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

function mergeBounds(left: SldFitBounds | null, right: SldFitBounds | null): SldFitBounds | null {
  if (!left) return right;
  if (!right) return left;

  const minX = Math.min(left.minX, right.minX);
  const minY = Math.min(left.minY, right.minY);
  const maxX = Math.max(left.maxX, right.maxX);
  const maxY = Math.max(left.maxY, right.maxY);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function calculateGpzSwitchgearBounds(
  canonicalAnnotations: CanonicalAnnotationsV1 | null | undefined,
): SldFitBounds | null {
  if (
    (canonicalAnnotations?.gpzSections?.length ?? 0) === 0
    && (canonicalAnnotations?.gpzFeederFields?.length ?? 0) === 0
  ) {
    return null;
  }

  let bounds: SldFitBounds | null = null;

  const includeRect = (minX: number, minY: number, maxX: number, maxY: number) => {
    bounds = mergeBounds(bounds, {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    });
  };

  for (const section of canonicalAnnotations?.gpzSections ?? []) {
    includeRect(
      section.bounds.x - 32,
      section.bounds.y - 64,
      section.bounds.x + section.bounds.width + 32,
      section.bounds.y + section.bounds.height + 48,
    );
    includeRect(
      section.busbar.x - 48,
      section.busbar.y - 90,
      section.busbar.x + section.busbar.width + 48,
      section.busbar.y + 260,
    );
  }

  for (const field of canonicalAnnotations?.gpzFeederFields ?? []) {
    includeRect(
      field.axisX - 120,
      field.busTap.y - 96,
      field.axisX + 120,
      Math.max(field.segmentStart.y + 190, field.busTap.y + 360),
    );
  }

  return bounds;
}

function fitBoundsToViewport(
  bounds: SldFitBounds,
  canvasWidth: number,
  canvasHeight: number,
  padding: number,
  minZoom: number,
): ViewportState {
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);
  const scaleX = (canvasWidth - 2 * padding) / width;
  const scaleY = (canvasHeight - 2 * padding) / height;
  const zoom = Math.min(scaleX, scaleY, ZOOM_MAX);
  const clampedZoom = Math.max(zoom, minZoom);
  const roundedZoom = Math.round(clampedZoom * 100) / 100;
  const offsetX = padding - bounds.minX * roundedZoom + (canvasWidth - width * roundedZoom - 2 * padding) / 2;
  const offsetY = padding - bounds.minY * roundedZoom + (canvasHeight - height * roundedZoom - 2 * padding) / 2;

  return {
    offsetX: Math.round(offsetX),
    offsetY: Math.round(offsetY),
    zoom: roundedZoom,
  };
}

function fitSldOperationalContent(
  symbols: readonly AnySldSymbol[],
  canonicalAnnotations: CanonicalAnnotationsV1 | null | undefined,
  canvasWidth: number,
  canvasHeight: number,
  padding: number | undefined,
  minZoom: number,
): ViewportState {
  const effectivePadding = padding ?? 32;
  const suppressedIds = collectGpzSwitchgearSuppressedSymbolIds(symbols, canonicalAnnotations);
  const visibleSymbols = symbols.filter((symbol) => !shouldSuppressForGpzSwitchgear(symbol, suppressedIds));
  const symbolBounds = calculateSymbolsBounds(visibleSymbols);
  const gpzBounds = calculateGpzSwitchgearBounds(canonicalAnnotations);
  const mergedBounds = gpzBounds ?? symbolBounds;

  if (!mergedBounds) {
    return fitToContent([...symbols], canvasWidth, canvasHeight, effectivePadding, minZoom);
  }

  return fitBoundsToViewport(
    mergedBounds,
    canvasWidth,
    canvasHeight,
    effectivePadding,
    gpzBounds ? Math.max(minZoom, 0.85) : minZoom,
  );
}

function buildAutoFitSignature(
  symbols: readonly AnySldSymbol[],
  canonicalAnnotations: CanonicalAnnotationsV1 | null | undefined,
): string {
  const symbolSignature = symbols
    .map((symbol) => `${symbol.id}:${symbol.position.x}:${symbol.position.y}`)
    .join('|');
  const gpzSectionSignature = (canonicalAnnotations?.gpzSections ?? [])
    .map((section) => `${section.sectionId}:${section.busbar.x}:${section.busbar.y}:${section.busbar.width}`)
    .join('|');
  const gpzFieldSignature = (canonicalAnnotations?.gpzFeederFields ?? [])
    .map((field) => `${field.fieldId}:${field.axisX}:${field.busTap.y}:${field.segmentStart.y}`)
    .join('|');

  return `${symbolSignature}::${gpzSectionSignature}::${gpzFieldSignature}`;
}

function collectBusIdsFromSingleCanonicalGpzSection(
  canonicalAnnotations: CanonicalAnnotationsV1 | null | undefined,
): Set<string> {
  const sections = (canonicalAnnotations?.gpzSections ?? []).filter(
    (section) => typeof section.rootBusId === 'string' && section.rootBusId.length > 0,
  );
  if (sections.length === 1) {
    return new Set([sections[0].rootBusId]);
  }
  return new Set<string>();
}

export function resolveAttachedSystemSourceBusIds(
  snapshot: EnergyNetworkModel | null,
  symbols: AnySldSymbol[] = [],
  canonicalAnnotations: CanonicalAnnotationsV1 | null = null,
): Set<string> {
  const canonicalRootBusIds = collectBusIdsFromSingleCanonicalGpzSection(canonicalAnnotations);
  if (canonicalRootBusIds.size > 0) {
    return canonicalRootBusIds;
  }

  const busIds = new Set<string>();
  for (const source of snapshot?.sources ?? []) {
    if (typeof source.bus_ref === 'string' && source.bus_ref.length > 0) {
      busIds.add(source.bus_ref);
    }
  }

  if (busIds.size === 1) {
    return busIds;
  }

  if (busIds.size > 1) {
    return new Set<string>();
  }

  const renderedSourceBusIds = new Set(
    symbols
      .filter(
        (symbol) =>
          symbol.elementType === 'Source'
          && 'sourceType' in symbol
          && symbol.sourceType === 'SYSTEM_SOURCE'
          && 'connectedToNodeId' in symbol
          && typeof symbol.connectedToNodeId === 'string'
          && symbol.connectedToNodeId.length > 0,
      )
      .map((symbol) => ('connectedToNodeId' in symbol ? symbol.connectedToNodeId : null))
      .filter((busId): busId is string => typeof busId === 'string' && busId.length > 0),
  );

  if (renderedSourceBusIds.size === 1) {
    return renderedSourceBusIds;
  }

  return new Set<string>();
}

export function resolveOperationalRootBusContext(
  snapshot: EnergyNetworkModel | null,
  symbols: AnySldSymbol[] = [],
  canonicalAnnotations: CanonicalAnnotationsV1 | null = null,
): { rootBusId: string | null; rootBusName: string | null } {
  const sections = (canonicalAnnotations?.gpzSections ?? []).filter(
    (section) => typeof section.rootBusId === 'string' && section.rootBusId.length > 0,
  );

  if (sections.length === 1) {
    const [section] = sections;
    return {
      rootBusId: section.rootBusId,
      rootBusName: section.rootBusName ?? null,
    };
  }

  if (sections.length > 1) {
    return { rootBusId: null, rootBusName: null };
  }

  const attachedBusIds = [...resolveAttachedSystemSourceBusIds(snapshot, symbols, canonicalAnnotations)];
  if (attachedBusIds.length !== 1) {
    return { rootBusId: null, rootBusName: null };
  }

  const [rootBusId] = attachedBusIds;
  const rootBus = (snapshot?.buses ?? []).find((bus) => bus.ref_id === rootBusId || bus.id === rootBusId);
  return {
    rootBusId,
    rootBusName: rootBus?.name ?? null,
  };
}

function isPickerCatalogNamespace(
  value: string,
): value is CatalogNamespace {
  return value in NAMESPACE_TO_PICKER_CATEGORY;
}

function resolveAttachedSystemSourceBusIdsFromSemanticModel(
  semanticModel: EngineeringSemanticModel | null | undefined,
): Set<string> {
  if (!semanticModel) {
    return new Set<string>();
  }

  const elementsByRef = new Map(semanticModel.elements.map((element) => [element.refId, element]));
  const ownerByPort = new Map<string, string>();
  for (const element of semanticModel.elements) {
    for (const port of element.ports ?? []) {
      ownerByPort.set(port.portId, element.refId);
    }
  }

  const sourceRoles = new Set(['GPZ_SUPPLY_NODE']);
  const busElementKinds = new Set<EngineeringElementKind>(['BUSBAR_SYSTEM', 'BUSBAR_SECTION']);
  const busIds = new Set<string>();

  for (const connection of semanticModel.connections ?? []) {
    if (connection.connectionKind !== 'TOR_MOCY' || connection.voltageDomain !== 'SN') {
      continue;
    }

    const fromOwnerId = ownerByPort.get(connection.fromPortId);
    const toOwnerId = ownerByPort.get(connection.toPortId);
    const fromElement = fromOwnerId ? elementsByRef.get(fromOwnerId) : undefined;
    const toElement = toOwnerId ? elementsByRef.get(toOwnerId) : undefined;

    if (!fromElement || !toElement) {
      continue;
    }

    if (sourceRoles.has(fromElement.engineeringRole) && busElementKinds.has(toElement.elementKind)) {
      busIds.add(toElement.refId);
    }
    if (sourceRoles.has(toElement.engineeringRole) && busElementKinds.has(fromElement.elementKind)) {
      busIds.add(fromElement.refId);
    }
  }

  for (const element of semanticModel.elements) {
    const structure = 'structure' in element ? element.structure : undefined;
    if (element.elementKind === 'GPZ' && structure?.busbarSectionRefs?.length) {
      for (const busbarSectionRef of structure.busbarSectionRefs) {
        busIds.add(busbarSectionRef);
      }
    }
  }

  return busIds;
}

/**
 * Main SLD View component.
 */
export const SLDView: React.FC<SLDViewProps> = ({
  symbols,
  connections = [],
  semanticModel = null,
  selectedElement: externalSelectedElement,
  onElementClick,
  onCanvasClick,
  onElementHover,
  onPortClick,
  onPortHover,
  onSegmentClick,
  onSegmentHover,
  interactionPreview = null,
  showGrid = true,
  width,
  height,
  initialZoom = 1.0,
  fitOnMount = true,
  onCalculateClick,
  minFitZoom = ZOOM_MIN,
  fitPadding,
  canonicalAnnotations = null,
  semanticDiagnosticsReport = null,
}) => {
  const hasExplicitCanvasSize = typeof width === 'number' && typeof height === 'number';
  const fallbackCanvasWidth = width ?? DEFAULT_WIDTH;
  const fallbackCanvasHeight = height ?? DEFAULT_HEIGHT;
  const [viewport, setViewport] = useState<ViewportState>(() => ({
    ...DEFAULT_VIEWPORT,
    zoom: initialZoom,
  }));
  const [measuredCanvasSize, setMeasuredCanvasSize] = useState({
    width: fallbackCanvasWidth,
    height: fallbackCanvasHeight,
  });
  const [focusPulseElementId, setFocusPulseElementId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [techLabelsVisible, setTechLabelsVisible] = useState(false);
  const [contextMenuState, setContextMenuState] = useState<EngineeringContextMenuState>(
    CONTEXT_MENU_CLOSED,
  );
  const [catalogPickerState, setCatalogPickerState] = useState<{
    isOpen: boolean;
    category: TypeCategory | null;
    namespace: CatalogNamespace | null;
    pendingOp: CatalogGateRequest | null;
  }>({ isOpen: false, category: null, namespace: null, pendingOp: null });
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [legendVisible, setLegendVisible] = useState(false);
  const [cursorStyle, setCursorStyle] = useState<'default' | 'grabbing'>('default');

  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const pendingDeleteElementRef = useRef<string | null>(null);
  const previousCanvasSizeRef = useRef({
    width: fallbackCanvasWidth,
    height: fallbackCanvasHeight,
  });
  const autoFitSignatureRef = useRef<string>('');

  const labelModeVisible = useLabelModeStore((state) => state.visible);
  const effectiveTechLabelsVisible = techLabelsVisible || labelModeVisible;

  const operationalMode = useOperationalModeStore((state) => state.mode);

  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeProjectName = useAppStateStore((state) => state.activeProjectName);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);

  const { allowed: canCalculate, reason: calculateBlockedReason } = useCanCalculate();

  const selectElement = useSelectionStore((state) => state.selectElement);
  const storeSelectedElement = useSelectionStore((state) => state.selectedElements[0] ?? null);
  const centerSldOnElement = useSelectionStore((state) => state.centerSldOnElement);
  const sldCenterOnElement = useSelectionStore((state) => state.sldCenterOnElement);

  const overlayVisible = useResultsInspectorStore((state) => state.overlayVisible);
  const sldOverlay = useResultsInspectorStore((state) => state.sldOverlay);
  const toggleOverlay = useResultsInspectorStore((state) => state.toggleOverlay);
  const hasResults = sldOverlay !== null;

  const diagnosticsVisible = useDiagnosticsStore((state) => state.diagnosticsVisible);
  const diagnosticsFilter = useDiagnosticsStore((state) => state.diagnosticsFilter);
  const toggleDiagnostics = useDiagnosticsStore((state) => state.toggleDiagnostics);
  const setDiagnosticsFilter = useDiagnosticsStore((state) => state.setDiagnosticsFilter);

  const { hasResults: hasDiagnostics } = useSanityChecks(
    activeProjectId ?? 'aktywny-projekt',
    activeCaseId ?? 'aktywny-przypadek',
  );

  const sldMode = useSldModeStore((state) => state.mode);
  const diagnosticLayerVisible = useSldModeStore((state) => state.diagnosticLayerVisible);
  const protectionLayerVisible = useSldModeStore((state) => state.protectionLayerVisible);
  const setMode = useSldModeStore((state) => state.setMode);
  const toggleDiagnosticLayer = useSldModeStore((state) => state.toggleDiagnosticLayer);
  const toggleProtectionLayer = useSldModeStore((state) => state.toggleProtectionLayer);
  const isResultsMode = sldMode === 'WYNIKI';
  const isProtectionMode = sldMode === 'ZABEZPIECZENIA';
  const isReadOnlyMode = isResultsMode || isProtectionMode;

  const protectionStats = useProtectionStatistics();
  const hasProtectionData = protectionStats.total > 0;

  const overlayRuntime = useOverlayRuntime(symbols);

  const snapshot = useSnapshotStore((state) => state.snapshot);
  const logicalViews = useSnapshotStore((state) => state.logicalViews);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);

  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const openInspectorPanelInStore = useNetworkBuildStore((state) => state.openInspectorPanel);
  const openObjectCard = useNetworkBuildStore((state) => state.openObjectCard);

  const selectedElement =
    externalSelectedElement !== undefined ? externalSelectedElement : storeSelectedElement;
  const semanticElementByRef = useMemo(
    () => buildSemanticElementMap(semanticModel),
    [semanticModel],
  );

  const canvasWidth = hasExplicitCanvasSize ? fallbackCanvasWidth : measuredCanvasSize.width;
  const canvasHeight = hasExplicitCanvasSize ? fallbackCanvasHeight : measuredCanvasSize.height;

  useLayoutEffect(() => {
    if (hasExplicitCanvasSize) {
      setMeasuredCanvasSize({
        width: fallbackCanvasWidth,
        height: fallbackCanvasHeight,
      });
      previousCanvasSizeRef.current = {
        width: fallbackCanvasWidth,
        height: fallbackCanvasHeight,
      };
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const applyCanvasSize = (nextWidth: number, nextHeight: number) => {
      const previousSize = previousCanvasSizeRef.current;

      if (previousSize.width === nextWidth && previousSize.height === nextHeight) {
        return;
      }

      previousCanvasSizeRef.current = { width: nextWidth, height: nextHeight };
      setMeasuredCanvasSize({ width: nextWidth, height: nextHeight });
      setViewport((prev) => preserveViewportCenterOnResize(prev, previousSize, { width: nextWidth, height: nextHeight }));
    };

    const rect = container.getBoundingClientRect();
    applyCanvasSize(Math.max(Math.round(rect.width), 1), Math.max(Math.round(rect.height), 1));

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      applyCanvasSize(
        Math.max(Math.round(entry.contentRect.width), 1),
        Math.max(Math.round(entry.contentRect.height), 1),
      );
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [fallbackCanvasHeight, fallbackCanvasWidth, hasExplicitCanvasSize]);

  const resolveContainerAnchor = useCallback(
    (clientX?: number, clientY?: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return { x: canvasWidth / 2, y: canvasHeight / 2 };
      }

      if (typeof clientX === 'number' && typeof clientY === 'number') {
        return {
          x: clientX - rect.left,
          y: clientY - rect.top,
        };
      }

      return {
        x: rect.width / 2,
        y: rect.height / 2,
      };
    },
    [canvasHeight, canvasWidth],
  );

  const busIdsWithAttachedSources = useMemo(
    () => {
      if (semanticModel) {
        return resolveAttachedSystemSourceBusIdsFromSemanticModel(semanticModel);
      }
      return resolveAttachedSystemSourceBusIds(snapshot, symbols, canonicalAnnotations);
    },
    [canonicalAnnotations, semanticModel, snapshot, symbols],
  );

  const resolveCanvasContextMenuState = useCallback(
    (x: number, y: number): EngineeringContextMenuState => ({
      isOpen: true,
      x,
      y,
      elementId: '',
      elementType: 'Source',
      elementName: '',
      scope: 'canvas',
      canvasMode: 'NEUTRAL',
      headerText: 'Puste płótno schematu',
    }),
    [],
  );

  const openInspectorPanel = useCallback(
    (
      kind: Parameters<typeof openInspectorPanelInStore>[0],
      elementId: string,
      elementType: ElementType,
    ) => {
      selectElement(createSemanticSelectedElement(
        elementId,
        elementType,
        elementId,
        semanticModel,
        semanticElementByRef,
      ));
      openInspectorPanelInStore(kind, elementId, elementType);
    },
    [openInspectorPanelInStore, selectElement, semanticElementByRef, semanticModel],
  );

  const openInlineOperation = useCallback(
    (
      canonicalOp: NetworkBuildOperationName,
      elementId?: string,
      elementType?: ElementType,
      extraContext?: Record<string, unknown>,
    ) => {
      const context =
        elementId && elementType
          ? buildOperationContext({
              canonicalOp,
              elementId,
              elementType,
              snapshot,
              logicalViews,
              extraContext,
            })
          : (extraContext ?? {});

      if (elementId && elementType) {
        selectElement(createSemanticSelectedElement(
          elementId,
          elementType,
          elementId,
          semanticModel,
          semanticElementByRef,
        ));
      }

      openOperationForm(canonicalOp, context);
    },
    [logicalViews, openOperationForm, selectElement, semanticElementByRef, semanticModel, snapshot],
  );

  const openPrimarySurfaceForElement = useCallback(
    (elementId: string, elementType: ElementType, elementName: string) => {
      const element = createSemanticSelectedElement(
        elementId,
        elementType,
        elementName,
        semanticModel,
        semanticElementByRef,
      );

      setSelectedConnectionId(null);
      selectElement(element);
      updateUrlWithSelection(element);

      const cardKind = resolveObjectCardKind(elementType);
      if (cardKind) {
        const card = (
          cardKind === 'trunk'
            ? { kind: 'trunk', corridorRef: elementId }
            : { kind: cardKind, elementId }
        ) as Exclude<ActiveObjectCard, null>;
        openObjectCard(card);
        return;
      }

      openInlineOperation('update_element_parameters', elementId, elementType);
    },
    [openInlineOperation, openObjectCard, selectElement, semanticElementByRef, semanticModel],
  );

  const handleCatalogRequired = useCallback((request: CatalogGateRequest) => {
    setContextMenuState(CONTEXT_MENU_CLOSED);

    if (!isPickerCatalogNamespace(request.namespace)) {
      notify(
        `Namespace katalogu nie ma przypisanej przeglądarki typu: ${request.namespace}`,
        'error',
      );
      return;
    }

    const category = NAMESPACE_TO_PICKER_CATEGORY[request.namespace] ?? null;
    if (!category) {
      notify(`Nieznany namespace katalogu: ${request.namespace}`, 'error');
      return;
    }

    setCatalogPickerState({
      isOpen: true,
      category,
      namespace: request.namespace,
      pendingOp: request,
    });
  }, []);

  const handleCatalogTypeSelected = useCallback(
    (typeId: string, typeName: string) => {
      const pending = catalogPickerState.pendingOp;
      const namespace = catalogPickerState.namespace;
      if (!pending || !namespace) return;

      setCatalogPickerState({ isOpen: false, category: null, namespace: null, pendingOp: null });

      if (!supportsOperationForm(pending.operationId)) {
        throw new Error(`Brak formularza dla operacji katalogowej: ${pending.operationId}`);
      }

      openInlineOperation(
        pending.operationId,
        pending.elementId,
        pending.elementType,
        {
          ...(pending.initialFormData ?? {}),
          catalog_binding: buildCatalogBinding(namespace, typeId),
          catalog_name: typeName,
          source_mode: 'KATALOG',
        },
      );
    },
    [catalogPickerState, openInlineOperation],
  );

  const handleCatalogPickerClose = useCallback(() => {
    setCatalogPickerState({ isOpen: false, category: null, namespace: null, pendingOp: null });
  }, []);

  /**
   * Fit to content on mount if enabled.
   */
  useEffect(() => {
    if (!fitOnMount || symbols.length === 0 || canvasWidth <= 0 || canvasHeight <= 0) {
      return;
    }

    const signature = buildAutoFitSignature(symbols, canonicalAnnotations);

    if (autoFitSignatureRef.current !== signature) {
      autoFitSignatureRef.current = signature;
      const fittedViewport = fitSldOperationalContent(
        symbols,
        canonicalAnnotations,
        canvasWidth,
        canvasHeight,
        fitPadding,
        minFitZoom,
      );
      setViewport(fittedViewport);
    }
  }, [canonicalAnnotations, canvasHeight, canvasWidth, fitOnMount, fitPadding, minFitZoom, symbols]);

  /**
   * Center on element when requested by store.
   * Also triggers focus pulse for visual feedback.
   */
  useEffect(() => {
    if (sldCenterOnElement) {
      const symbol = symbols.find(
        (s) => s.id === sldCenterOnElement || s.elementId === sldCenterOnElement
      );
      if (symbol) {
        // Center viewport on symbol
        setViewport((prev) => ({
          ...prev,
          offsetX: canvasWidth / 2 - symbol.position.x * prev.zoom,
          offsetY: canvasHeight / 2 - symbol.position.y * prev.zoom,
        }));
        // Trigger focus pulse for visual feedback (no timeout - CSS handles duration)
        setFocusPulseElementId(sldCenterOnElement);
      }
      // Clear the center request
      centerSldOnElement(null);
    }
  }, [canvasHeight, canvasWidth, sldCenterOnElement, symbols, centerSldOnElement]);

  /**
   * Handle symbol click — mode-aware click handling via SldModeInteractionHandler.
   * If operationalMode !== 'NORMALNY', the click is intercepted by the mode handler.
   * Otherwise, standard selection logic applies.
   */
  const handleSymbolClick = useCallback(
    (symbolId: string, elementType: ElementType, elementName: string) => {
      // Find the element ID (may be different from symbol ID)
      const symbol = symbols.find((s) => s.id === symbolId);
      const elementId = symbol?.elementId || symbolId;

      // Check if the operational mode intercepts this click
      const clickResult = resolveClickAction(operationalMode, {
        elementId,
        elementType,
      });

      // If operational mode is NOT 'NORMALNY', use mode-specific handler
      if (operationalMode !== 'NORMALNY') {
        // Mode-specific actions (TOGGLE_SERVICE, SET_FAULT_BUS) are handled
        // by the caller via clickResult; selection still happens for feedback
        if (clickResult.action === 'NONE') {
          // Click was rejected by mode handler — no selection
          return;
        }
      }

      // Standard selection logic (NORMALNY mode, or SELECT action in other modes)
      const element = createSemanticSelectedElement(
        elementId,
        elementType,
        elementName,
        semanticModel,
        semanticElementByRef,
      );

      // Update selection store
      setSelectedConnectionId(null);
      selectElement(element);

      // Sync to URL
      updateUrlWithSelection(element);

      // Call external handler if provided
      if (onElementClick) {
        onElementClick(element);
      }
    },
    [symbols, selectElement, onElementClick, operationalMode, semanticElementByRef, semanticModel]
  );

  const handleSymbolDoubleClick = useCallback(
    (symbolId: string, elementType: ElementType, elementName: string) => {
      const symbol = symbols.find((candidate) => candidate.id === symbolId);
      const elementId = symbol?.elementId || symbolId;
      openPrimarySurfaceForElement(elementId, elementType, elementName);
    },
    [openPrimarySurfaceForElement, symbols],
  );

  const handleSymbolHover = useCallback(
    (symbolId: string | null, elementType?: ElementType, elementName?: string) => {
      if (!onElementHover) return;
      if (!symbolId || !elementType || !elementName) {
        onElementHover(null);
        return;
      }
      const symbol = symbols.find((candidate) => candidate.id === symbolId);
      const elementId = symbol?.elementId || symbolId;
      onElementHover(createSemanticSelectedElement(
        elementId,
        elementType,
        elementName,
        semanticModel,
        semanticElementByRef,
      ));
    },
    [onElementHover, semanticElementByRef, semanticModel, symbols],
  );

  const handleCanvasBackgroundClick = useCallback(() => {
    onCanvasClick?.();
  }, [onCanvasClick]);

  const handlePortClick = useCallback(
    (symbolId: string, elementType: ElementType, elementName: string, role: InteractionPortRole) => {
      const symbol = symbols.find((candidate) => candidate.id === symbolId);
      const elementId = symbol?.elementId || symbolId;
      const target = createSemanticSelectedElement(
        elementId,
        elementType,
        elementName,
        semanticModel,
        semanticElementByRef,
      );
      onPortClick?.(target, role);
    },
    [onPortClick, semanticElementByRef, semanticModel, symbols],
  );

  const handlePortHover = useCallback(
    (symbolId: string | null, elementType?: ElementType, elementName?: string, role?: InteractionPortRole) => {
      if (!onPortHover) return;
      if (!symbolId || !elementType || !elementName || !role) {
        onPortHover(null, null);
        return;
      }
      const symbol = symbols.find((candidate) => candidate.id === symbolId);
      const elementId = symbol?.elementId || symbolId;
      onPortHover(createSemanticSelectedElement(
        elementId,
        elementType,
        elementName,
        semanticModel,
        semanticElementByRef,
      ), role);
    },
    [onPortHover, semanticElementByRef, semanticModel, symbols],
  );

  const handleSegmentClick = useCallback((segment: { edge_id: string; segment_ref: string; from_ref: string; to_ref: string; segment_kind: 'TRUNK' | 'BRANCH' | 'RING' | 'SECONDARY' }) => {
    setSelectedConnectionId(segment.edge_id);
    onSegmentClick?.(segment);
  }, [onSegmentClick]);

  const handleSegmentHover = useCallback((segment: { edge_id: string; segment_ref: string; from_ref: string; to_ref: string; segment_kind: 'TRUNK' | 'BRANCH' | 'RING' | 'SECONDARY' } | null) => {
    onSegmentHover?.(segment);
  }, [onSegmentHover]);

  /**
   * Handle zoom in.
   */
  const handleZoomIn = useCallback(() => {
    const anchor = resolveContainerAnchor();
    setViewport((prev) => zoomViewportByStep(prev, ZOOM_STEP, anchor));
  }, [resolveContainerAnchor]);

  /**
   * Handle zoom out.
   */
  const handleZoomOut = useCallback(() => {
    const anchor = resolveContainerAnchor();
    setViewport((prev) => zoomViewportByStep(prev, -ZOOM_STEP, anchor));
  }, [resolveContainerAnchor]);

  /**
   * Handle fit to content.
   */
  const handleFitToContent = useCallback(() => {
    const fittedViewport = fitSldOperationalContent(
      symbols,
      canonicalAnnotations,
      canvasWidth,
      canvasHeight,
      fitPadding,
      minFitZoom,
    );
    setViewport(fittedViewport);
  }, [canonicalAnnotations, canvasHeight, canvasWidth, fitPadding, minFitZoom, symbols]);

  /**
   * Handle reset view (100%).
   */
  const handleResetView = useCallback(() => {
    setViewport({ ...DEFAULT_VIEWPORT, zoom: 1.0 });
  }, []);

  /**
   * Keyboard shortcuts (BLOK 10 — ekspert ergonomia):
   * F       = dopasuj do schematu (fit to content)
   * +/=     = powiększ
   * -       = pomniejsz
   * 0       = resetuj widok (100%)
   */
  useEffect(() => {
    const isInputTarget = (target: EventTarget | null): boolean =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isInputTarget(event.target)) return;

      switch (event.key) {
        case 'f':
        case 'F':
          event.preventDefault();
          handleFitToContent();
          break;
        case '+':
        case '=':
          event.preventDefault();
          handleZoomIn();
          break;
        case '-':
          event.preventDefault();
          handleZoomOut();
          break;
        case '0':
          event.preventDefault();
          handleResetView();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFitToContent, handleZoomIn, handleZoomOut, handleResetView]);

  /**
   * Handle mouse wheel (zoom).
   * Attached via useEffect with { passive: false } to allow preventDefault().
   * React synthetic onWheel uses passive listeners — calling preventDefault()
   * there throws "Unable to preventDefault inside passive event listener".
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const anchor = resolveContainerAnchor(e.clientX, e.clientY);
      setViewport((prev) => zoomViewportByStep(prev, delta, anchor));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [resolveContainerAnchor]);

  /**
   * Handle mouse down (start pan).
   */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      isPanning.current = true;
      setCursorStyle('grabbing');
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  /**
   * Handle mouse move (pan).
   */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning.current) {
      e.preventDefault();
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      setViewport((prev) => ({
        ...prev,
        offsetX: prev.offsetX + dx,
        offsetY: prev.offsetY + dy,
      }));
    }
  }, []);

  /**
   * Handle mouse up (end pan).
   */
  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
    setCursorStyle('default');
  }, []);

  const handleOperationalContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();

      if (isPanning.current) {
        return;
      }

      const target = e.target as HTMLElement;
      const symbolEl = target.closest<HTMLElement>('[data-element-id]');

      if (!symbolEl) {
        setContextMenuState(resolveCanvasContextMenuState(e.clientX, e.clientY));
        return;
      }

      const elementId = symbolEl.getAttribute('data-element-id') ?? '';
      const symbol = symbols.find((candidate) => candidate.id === elementId || candidate.elementId === elementId);
      const semanticElement = semanticElementByRef.get(symbol?.elementId ?? elementId);
      const elementType = semanticElement
        ? mapSemanticElementKindToElementType(semanticElement.elementKind)
        : symbol?.elementType ?? 'Bus';
      const elementName = symbol?.elementName ?? elementId;
      const semanticElementId = semanticElement?.refId ?? elementId;

      setContextMenuState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        elementId: semanticElementId,
        elementType,
        elementName,
        scope: 'element',
        semanticElement: createSemanticContextMenuElement(semanticElement, semanticModel),
        hasAttachedSource: semanticElement?.elementKind === 'BUSBAR_SECTION'
          && busIdsWithAttachedSources.has(semanticElementId),
      });
    },
    [busIdsWithAttachedSources, resolveCanvasContextMenuState, semanticElementByRef, semanticModel, symbols],
  );

  /**
   * Handle diagnostics marker click — select element + center + pulse.
   * Focus pulse is triggered via centerSldOnElement effect.
   */
  const handleDiagnosticsMarkerClick = useCallback(
    (element: SelectedElement) => {
      // Update selection store
      selectElement(element);

      // Sync to URL
      updateUrlWithSelection(element);

      // Center SLD on the element (this also triggers focus pulse via effect)
      centerSldOnElement(element.id);

      // Call external handler if provided
      if (onElementClick) {
        onElementClick(element);
      }
    },
    [selectElement, centerSldOnElement, onElementClick]
  );

  /**
   * Handle focus pulse animation end — clear pulse state.
   * Uses CSS animationend event for deterministic cleanup (no setTimeout flakiness).
   */
  const handleFocusPulseAnimationEnd = useCallback(() => {
    setFocusPulseElementId(null);
  }, []);

  /**
   * Handle diagnostics filter change.
   */
  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setDiagnosticsFilter(e.target.value as DiagnosticsSeverityFilter);
    },
    [setDiagnosticsFilter]
  );

  /**
   * Handle SLD mode change (PR-SLD-06, PR-SLD-09).
   * Cycles through: EDYCJA -> WYNIKI -> ZABEZPIECZENIA -> EDYCJA
   */
  const handleModeChange = useCallback((newMode: SldMode) => {
    setMode(newMode);
  }, [setMode]);

  /**
   * Handle diagnostic layer toggle (PR-SLD-06).
   */
  const handleDiagnosticLayerToggle = useCallback(() => {
    toggleDiagnosticLayer();
  }, [toggleDiagnosticLayer]);

  /**
   * Handle protection layer toggle (PR-SLD-09).
   */
  const handleProtectionLayerToggle = useCallback(() => {
    toggleProtectionLayer();
  }, [toggleProtectionLayer]);

  /**
   * Handle protection label click (PR-SLD-09).
   */
  const handleProtectionLabelClick = useCallback(
    (element: SelectedElement) => {
      // Update selection store
      selectElement(element);

      // Sync to URL
      updateUrlWithSelection(element);

      // Center SLD on the element
      centerSldOnElement(element.id);

      // Call external handler if provided
      if (onElementClick) {
        onElementClick(element);
      }
    },
    [selectElement, centerSldOnElement, onElementClick]
  );

  /**
   * Handle context menu close — reset state to closed.
   */
  const handleContextMenuClose = useCallback(() => {
    setContextMenuState(CONTEXT_MENU_CLOSED);
  }, []);

  /**
   * Handle context menu operation — dispatched from EngineeringContextMenu.
   * Closes the menu after the operation is dispatched.
   */
  const handleContextMenuOperation = useCallback(
    (
      operationId: string,
      elementId: string,
      elementType: ElementType,
      initialFormData?: Record<string, unknown>,
    ) => {
      const currentMenuScope = contextMenuState.scope ?? 'element';
      // Close menu immediately
      setContextMenuState(CONTEXT_MENU_CLOSED);

      if (operationId !== 'delete' && operationId !== 'delete_element') {
        pendingDeleteElementRef.current = null;
      }

      if (operationId === 'properties') {
        openPrimarySurfaceForElement(
          elementId,
          elementType,
          contextMenuState.elementName || elementId,
        );
        return;
      }

      if (operationId === 'open_gpz_fields') {
        selectElement(createSemanticSelectedElement(
          elementId,
          elementType,
          elementId,
          semanticModel,
          semanticElementByRef,
        ));
        openObjectCard({ kind: 'source', elementId });
        return;
      }

      if (currentMenuScope === 'canvas' && operationId === 'add_grid_source_sn') {
        openOperationForm('add_grid_source_sn');
        return;
      }

      // 1. Check for canonical domain operation → open canonical form in right panel
      const canonicalOp = CONTEXT_MENU_OP_MAP[operationId];
      if (canonicalOp) {
        if (supportsOperationForm(canonicalOp)) {
          const sourceTechnology = resolveConverterSourceTechnologyFromActionId(operationId);
          openInlineOperation(
            canonicalOp as NetworkBuildOperationName,
            elementId,
            elementType,
            {
              ...(sourceTechnology
                ? buildConverterSourceOperationContext(sourceTechnology)
                : {}),
              ...(initialFormData ?? {}),
            },
          );
          return;
        }

        throw new Error(`Brak formularza dla kanonicznej operacji: ${canonicalOp}`);
      }

      // 2. Navigation/info actions — select + notify + navigate
      if (
        operationId === 'show_results'
        || operationId === 'show_whitebox'
        || operationId === 'show_readiness'
        || operationId === 'export_report'
        || operationId === 'export_results'
        || operationId === 'export_whitebox'
        || operationId === 'fix_issues'
        || operationId === 'history'
      ) {
        selectElement(createSemanticSelectedElement(
          elementId,
          elementType,
          elementId,
          semanticModel,
          semanticElementByRef,
        ));
        const panelKind =
          operationId === 'show_results' || operationId === 'export_results'
            ? 'results'
            : operationId === 'show_whitebox' || operationId === 'export_whitebox'
              ? 'trace'
              : operationId === 'show_readiness' || operationId === 'fix_issues'
                ? 'readiness'
                : operationId === 'history'
                  ? 'history'
                  : 'report';
        openInspectorPanel(panelKind, elementId, elementType);
        return;
      }
      if (NAVIGATION_ACTIONS.has(operationId)) {
        selectElement(createSemanticSelectedElement(
          elementId,
          elementType,
          elementId,
          semanticModel,
          semanticElementByRef,
        ));

        if (operationId === 'show_diagram' || operationId === 'show_on_diagram') {
          centerSldOnElement(elementId);
          return;
        }

        if (operationId === 'show_tree') {
          return;
        }

        if (operationId === 'show_overlay') {
          if (!hasResults) {
            notify('Brak aktywnej nakładki wynikowej dla wybranego elementu.', 'warning');
            return;
          }
          toggleOverlay(true);
          return;
        }

        const panelKindByAction: Partial<Record<string, 'results' | 'trace' | 'readiness' | 'report' | 'history' | 'topology' | 'secondary_links' | 'coordination'>> = {
          show_topology: 'topology',
          show_secondary_links: 'secondary_links',
          show_coordination: 'coordination',
          show_summary: 'results',
          show_per_element: 'results',
          show_ik: 'results',
          show_ip: 'results',
          show_ith: 'results',
          show_idyn: 'results',
          show_voltages: 'results',
          show_currents: 'results',
          show_powers: 'results',
          show_losses: 'results',
          show_comparison: 'history',
          show_delta_overlay: 'history',
          check_ring: 'topology',
          check_nop: 'topology',
          check_selectivity: 'coordination',
          calc_tcc: 'coordination',
          validate_selectivity: 'coordination',
          compare_cases: 'history',
          compare_with: 'history',
          compare_snapshots: 'history',
          export_data: 'report',
          export_json: 'report',
          export_pdf: 'report',
          export_docx: 'report',
        };
        const panelKind = panelKindByAction[operationId];
        if (panelKind) {
          openInspectorPanel(panelKind, elementId, elementType);
          if (panelKind === 'results' && hasResults) {
            toggleOverlay(true);
          }
          return;
        }

        throw new Error(`Brak kanonicznej obslugi akcji w widoku SLD: ${operationId}`);
      }

      // 3. Toggle actions — direct state change + notify
      if (TOGGLE_ACTIONS.has(operationId)) {
        selectElement(createSemanticSelectedElement(
          elementId,
          elementType,
          elementId,
          semanticModel,
          semanticElementByRef,
        ));
        if (operationId === 'toggle_switch') {
          openInlineOperation('update_element_parameters', elementId, elementType, { field: 'state' });
          return;
        }

        if (
          operationId === 'toggle_service'
          || operationId === 'toggle_enabled'
          || operationId === 'disconnect'
          || operationId === 'disconnect_element'
        ) {
          openInlineOperation('update_element_parameters', elementId, elementType, {
            field: operationId === 'toggle_enabled' ? 'enabled' : 'in_service',
          });
          return;
        }

        if (operationId === 'delete' || operationId === 'delete_element') {
          if (!activeCaseId) {
            notify('Brak aktywnego Study Case - nie można usunąć elementu.', 'error');
            return;
          }

          if (pendingDeleteElementRef.current !== elementId) {
            pendingDeleteElementRef.current = elementId;
            notify(
              'Powtórz usunięcie tego samego elementu, aby potwierdzić operację.',
              'warning',
            );
            return;
          }

          pendingDeleteElementRef.current = null;

          void executeDomainOperation(activeCaseId, 'delete_element', {
            element_ref: elementId,
            source: 'sld_context_menu',
          })
            .then((response) => {
              if (!response || response.error) {
                notify(response?.error ?? 'Nie udało się usunąć elementu.', 'error');
                return;
              }
              notify('Element został usunięty z modelu.', 'success');
            })
            .catch((error) => {
              notify(error instanceof Error ? error.message : 'Nie udało się usunąć elementu.', 'error');
            });
          return;
        }
        const blockedToggleLabels: Partial<Record<string, string>> = {
          edit_geometry: 'edycja geometrii',
          snap_to_grid: 'wyrównanie do siatki',
          reset_geometry: 'reset geometrii',
          undo_snapshot: 'cofnięcie migawki',
        };
        if (blockedToggleLabels[operationId]) {
          notify(`Akcja "${blockedToggleLabels[operationId]}" nie jest obsługiwana z menu kontekstowego SLD. Użyj dedykowanego narzędzia geometrii.`, 'warning');
          return;
        }

        notify(`Akcja "${operationId}" nie ma przypisanego kanonicznego wykonania.`, 'warning');
        return;
      }

      // 4. Unknown operation — log warning + generic notification
      console.warn(`[SLDView] Nieznana operacja kontekstowa: ${operationId}`);
      notify(`Nieznana operacja kontekstowa: ${operationId}`, 'warning');
    },
    [
      activeCaseId,
      centerSldOnElement,
      contextMenuState.elementName,
      contextMenuState.scope,
      executeDomainOperation,
      openInlineOperation,
      openInspectorPanel,
      openPrimarySurfaceForElement,
      openOperationForm,
      openObjectCard,
      selectElement,
      semanticElementByRef,
      semanticModel,
    ],
  );

  /**
   * Handle export dialog open.
   */
  const handleExportClick = useCallback(() => {
    setExportDialogOpen(true);
  }, []);

  /**
   * Handle export dialog close.
   */
  const handleExportDialogClose = useCallback(() => {
    setExportDialogOpen(false);
  }, []);

  /**
   * Handle export.
   */
  const handleExport = useCallback(
    async (
      format: ExportFormat,
      options: {
        scale?: PngScale;
        pageSize?: PdfPageSize;
        orientation?: PdfOrientation;
        scope: ExportScope;
        layers: ExportLayerOptions;
      }
    ) => {
      const containerElement = containerRef.current?.closest('[data-testid="sld-view"]');
      if (!containerElement || !(containerElement instanceof HTMLElement)) {
        console.error('[SLDView] Nie znaleziono kontenera SLD do eksportu');
        return;
      }

      setIsExporting(true);

      try {
        const metadata = {
          projectName: activeProjectName ?? 'projekt',
          caseName: activeCaseName ?? 'wariant pracy',
          runId: sldOverlay?.run_id,
          zoomPercent: Math.round(viewport.zoom * 100),
          timestamp: new Date().toISOString(),
        };

        const exportOptions =
          format === 'png'
            ? createExportOptions('png', options, metadata)
            : createExportOptions('pdf', options, metadata);

        const result = await executeSldExport(
          {
            containerElement,
            symbols,
            currentViewport: viewport,
            canvasWidth,
            canvasHeight,
          },
          exportOptions
        );

        if (result.success) {
          setExportDialogOpen(false);
        } else {
          console.error('[SLDView] Błąd eksportu:', result.error);
        }
      } finally {
        setIsExporting(false);
      }
    },
    [symbols, viewport, canvasWidth, canvasHeight, sldOverlay, activeProjectName, activeCaseName]
  );

  /**
   * Current layer state for export dialog defaults.
   */
  const currentLayerState = useMemo(
    () => getCurrentLayerState(overlayVisible, diagnosticsVisible),
    [overlayVisible, diagnosticsVisible]
  );

  /**
   * Export metadata.
   */
  const exportMetadata = useMemo(
    () => ({
      projectName: activeProjectName ?? 'projekt',
      caseName: activeCaseName ?? 'wariant pracy',
      runId: sldOverlay?.run_id,
      zoomPercent: Math.round(viewport.zoom * 100),
      timestamp: new Date().toISOString(),
    }),
    [viewport.zoom, sldOverlay, activeProjectName, activeCaseName]
  );

  // ---------------------------------------------------------------------------
  // Wire D: Readiness blockers → SLD symbol highlighting
  // ---------------------------------------------------------------------------
  const readinessIssues = useReadinessLiveStore((state) => state.issues);
  const highlightedElements = useMemo(() => {
    const map = new Map<string, 'HIGH' | 'WARN' | 'INFO'>();
    if (readinessIssues.length === 0) return map;

    for (const issue of readinessIssues) {
      const refs = new Set<string>();
      if (issue.element_ref) {
        refs.add(issue.element_ref);
      }
      for (const ref of issue.element_refs) {
        refs.add(ref);
      }

      for (const ref of refs) {
        if (issue.severity === 'BLOCKER') {
          map.set(ref, 'HIGH');
        } else if (!map.has(ref)) {
          map.set(ref, 'WARN');
        }
      }
    }

    return map;
  }, [readinessIssues]);

  // Zoom percentage for display
  const zoomPercent = Math.round(viewport.zoom * 100);

  // Compute focus indicator position (for sld-focus-<element_id> testid)
  const focusIndicatorPosition = useMemo(() => {
    if (!focusPulseElementId) return null;
    const symbol = symbols.find(
      (s) => s.id === focusPulseElementId || s.elementId === focusPulseElementId
    );
    if (!symbol) return null;
    return {
      x: symbol.position.x * viewport.zoom + viewport.offsetX,
      y: symbol.position.y * viewport.zoom + viewport.offsetY,
      elementId: focusPulseElementId,
    };
  }, [focusPulseElementId, symbols, viewport]);

  return (
    <div
      data-testid="sld-view"
      className="flex h-full flex-col bg-[linear-gradient(180deg,#040b11_0%,#08131d_100%)]"
    >
      {/* Pasek narzędzi SLD — klasa przemysłowa */}
      <div
        data-testid="sld-view-toolbar"
        className="flex items-center justify-between border-b border-[#1a3040] bg-[linear-gradient(180deg,#08131d_0%,#07111a_100%)] px-4 py-2 shadow-[inset_0_1px_0_rgba(148,163,184,0.05)]"
      >
        <div className="flex items-center gap-3">
          {/* Logo/Icon */}
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            <h3 className="text-sm font-semibold tracking-wide text-slate-50">Schemat jednokreskowy</h3>
          </div>
          <span className="text-xs text-chrome-400 font-medium">
            Widok schematu
          </span>
          {/* PR-SLD-06: Mode indicator */}
          <span
            data-testid="sld-mode-indicator"
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${
              isResultsMode
                ? 'border-blue-500/35 bg-blue-500/14 text-white'
                : isProtectionMode
                ? 'border-emerald-500/35 bg-emerald-500/14 text-white'
                : 'border-[#274154] bg-[#0d1c29] text-[#dde8f2]'
            }`}
          >
            {SLD_MODE_LABELS_PL[sldMode]}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Zoom controls — CANONICAL-grade */}
          <div className="flex items-center bg-chrome-700 rounded overflow-hidden">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={viewport.zoom <= ZOOM_MIN}
              className="px-2.5 py-1.5 text-sm text-[#d7e5ef] transition-colors hover:bg-[#112433] disabled:cursor-not-allowed disabled:opacity-40"
              title="Pomniejsz"
              data-testid="sld-zoom-out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
            </button>
            <span
              className="w-12 bg-[#112433] py-1.5 text-center font-mono text-xs text-slate-50"
              data-testid="sld-zoom-level"
            >
              {zoomPercent}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={viewport.zoom >= ZOOM_MAX}
              className="px-2.5 py-1.5 text-sm text-[#d7e5ef] transition-colors hover:bg-[#112433] disabled:cursor-not-allowed disabled:opacity-40"
              title="Powiększ"
              data-testid="sld-zoom-in"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          <div className="w-px h-5 bg-chrome-600 mx-1" />

          {/* Fit & Reset — CANONICAL-grade buttons */}
          <button
            type="button"
            onClick={handleFitToContent}
            className="px-3 py-1.5 text-xs font-medium text-chrome-200 bg-chrome-700 hover:bg-chrome-600 rounded transition-colors"
            title="Dopasuj do schematu (F)"
            aria-label="Dopasuj do schematu"
            data-testid="sld-fit-content"
          >
            Dopasuj
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="px-3 py-1.5 text-xs font-medium text-chrome-300 hover:text-chrome-100 hover:bg-chrome-700 rounded transition-colors"
            title="Resetuj widok"
            data-testid="sld-reset-view"
          >
            Resetuj
          </button>

          {/* Results overlay toggle */}
          {hasResults && (
            <>
              <div className="w-px h-5 bg-chrome-600 mx-1" />
              <button
                type="button"
                onClick={() => toggleOverlay()}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  overlayVisible
                    ? 'bg-blue-600 text-white'
                    : 'text-chrome-300 hover:text-chrome-100 hover:bg-chrome-700'
                }`}
                title={overlayVisible ? 'Ukryj nakładkę wyników' : 'Pokaż nakładkę wyników'}
                data-testid="sld-overlay-toggle"
              >
                Wyniki
              </button>
            </>
          )}

          {/* Diagnostics overlay toggle and filter */}
          {hasDiagnostics && (
            <>
              <div className="w-px h-5 bg-chrome-600 mx-1" />
              <button
                type="button"
                onClick={() => toggleDiagnostics()}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  diagnosticsVisible
                    ? 'bg-rose-600 text-white'
                    : 'text-chrome-300 hover:text-chrome-100 hover:bg-chrome-700'
                }`}
                title={diagnosticsVisible ? 'Ukryj diagnostykę' : 'Pokaż diagnostykę'}
                data-testid="sld-diagnostics-toggle"
              >
                Diagnostyka
              </button>

              {/* Severity filter (visible only when diagnostics visible) */}
              {diagnosticsVisible && (
                <select
                  value={diagnosticsFilter}
                  onChange={handleFilterChange}
                  className="px-2 py-1.5 text-xs rounded bg-chrome-700 text-chrome-200 border border-chrome-600 hover:border-chrome-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  title="Filtr"
                  data-testid="sld-diagnostics-filter"
                >
                  {Object.entries(SEVERITY_FILTER_LABELS_PL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}

          {/* PR-SLD-06, PR-SLD-09: Mode selector — CANONICAL-grade tab bar */}
          <div className="w-px h-5 bg-chrome-600 mx-2" />
          <div className="flex items-center bg-chrome-700 rounded overflow-hidden" data-testid="sld-mode-selector">
            <button
              type="button"
              onClick={() => handleModeChange('EDYCJA')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                sldMode === 'EDYCJA'
                  ? 'bg-chrome-500 text-white'
                  : 'text-chrome-300 hover:bg-chrome-600 hover:text-chrome-100'
              }`}
              title="Tryb Edycja"
              data-testid="sld-mode-edit"
            >
              Edycja
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('WYNIKI')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                sldMode === 'WYNIKI'
                  ? 'bg-blue-600 text-white'
                  : 'text-chrome-300 hover:bg-chrome-600 hover:text-chrome-100'
              }`}
              title="Tryb Wyniki"
              data-testid="sld-mode-results"
            >
              Wyniki
            </button>
            {hasProtectionData && (
              <button
                type="button"
                onClick={() => handleModeChange('ZABEZPIECZENIA')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  sldMode === 'ZABEZPIECZENIA'
                    ? 'bg-emerald-600 text-white'
                    : 'text-chrome-300 hover:bg-chrome-600 hover:text-chrome-100'
                }`}
                title="Tryb Zabezpieczenia"
                data-testid="sld-mode-protection"
              >
                Zabezpieczenia
              </button>
            )}
          </div>

          {/* PR-SLD-06: Diagnostic layer toggle (only in WYNIKI mode) */}
          {isResultsMode && (
            <button
              type="button"
              onClick={handleDiagnosticLayerToggle}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                diagnosticLayerVisible
                  ? 'bg-blue-500 text-white'
                  : 'text-chrome-400 hover:text-chrome-200 hover:bg-chrome-700'
              }`}
              title={diagnosticLayerVisible ? 'Ukryj warstwę diagnostyczną' : 'Pokaż warstwę diagnostyczną'}
              data-testid="sld-diagnostic-layer-toggle"
            >
              Warstwa
            </button>
          )}

          {/* PR-SLD-09: Protection layer toggle (only in ZABEZPIECZENIA mode) */}
          {isProtectionMode && (
            <button
              type="button"
              onClick={handleProtectionLayerToggle}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                protectionLayerVisible
                  ? 'bg-emerald-500 text-white'
                  : 'text-chrome-400 hover:text-chrome-200 hover:bg-chrome-700'
              }`}
              title={protectionLayerVisible ? 'Ukryj warstwę zabezpieczeń' : 'Pokaż warstwę zabezpieczeń'}
              data-testid="sld-protection-layer-toggle"
            >
              Nastawy
            </button>
          )}

          {/* BLOK 7: Etykiety techniczne toggle */}
          <div className="w-px h-5 bg-chrome-600 mx-1" />
          <button
            type="button"
            onClick={() => setTechLabelsVisible((prev) => !prev)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              techLabelsVisible
                ? 'bg-teal-600 text-white'
                : 'text-chrome-300 hover:text-chrome-100 hover:bg-chrome-700'
            }`}
            title={techLabelsVisible ? 'Ukryj etykiety techniczne' : 'Pokaż etykiety techniczne (obciążenie, NOP, U)'}
            data-testid="sld-tech-labels-toggle"
          >
            Etykiety
          </button>

          {/* BLOK 8: Uruchom obliczenia */}
          {onCalculateClick && (
            <>
              <div className="w-px h-5 bg-chrome-600 mx-1" />
              <button
                type="button"
                onClick={onCalculateClick}
                disabled={!canCalculate}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                  canCalculate
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-chrome-600 text-chrome-400 cursor-not-allowed'
                }`}
                title={canCalculate ? 'Uruchom obliczenia' : calculateBlockedReason ?? 'Obliczenia są zablokowane'}
                data-testid="sld-calculate-btn"
              >
                ▶ Oblicz
              </button>
            </>
          )}

          {/* Export button */}
          <div className="w-px h-5 bg-chrome-600 mx-1" />
          <button
            type="button"
            onClick={handleExportClick}
            className="px-3 py-1.5 text-xs font-medium text-chrome-300 hover:text-chrome-100 hover:bg-chrome-700 rounded transition-colors"
            title="Eksportuj schemat"
            data-testid="sld-export-btn"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden border-t border-[#10202c] bg-[radial-gradient(circle_at_top,rgba(14,116,144,0.08),transparent_32%),linear-gradient(180deg,#07111a_0%,#08131d_100%)]"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleOperationalContextMenu}
        style={{ cursor: cursorStyle }}
      >
        <SLDViewCanvas
          symbols={symbols}
          connections={connections}
          semanticModel={semanticModel}
          selectedId={selectedElement?.id ?? null}
          onSymbolClick={handleSymbolClick}
          onSymbolDoubleClick={handleSymbolDoubleClick}
          onSymbolHover={handleSymbolHover}
          onCanvasClick={handleCanvasBackgroundClick}
          onPortClick={handlePortClick}
          onPortHover={handlePortHover}
          onSegmentClick={handleSegmentClick}
          onSegmentHover={handleSegmentHover}
          selectedConnectionId={selectedConnectionId}
          interactionPreview={interactionPreview}
          viewport={viewport}
          showGrid={showGrid}
          width={canvasWidth}
          height={canvasHeight}
          canonicalAnnotations={canonicalAnnotations}
          highlightedElements={highlightedElements}
        />

        {/* Results overlay layer */}
        <ResultsOverlay
          symbols={symbols}
          viewport={viewport}
          selectedElementId={selectedElement?.id}
        />

        {/* PR-SLD-UX-MAX: Mode indicator overlay (top-right corner of canvas) */}
        <div
          data-testid="sld-mode-overlay"
          className={`absolute top-4 right-4 z-10 flex items-center gap-2 rounded-[16px] border px-4 py-2.5 shadow-[0_18px_36px_rgba(2,8,23,0.38)] backdrop-blur-sm transition-all duration-200 ${
            isResultsMode
              ? 'border-blue-500/35 bg-blue-500/16 text-white'
              : isProtectionMode
              ? 'border-emerald-500/35 bg-emerald-500/16 text-white'
              : 'border-[#274154] bg-[rgba(7,19,28,0.9)] text-[#dde8f2]'
          }`}
        >
          {/* Mode icon */}
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            {isResultsMode ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            ) : isProtectionMode ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            )}
          </svg>
          {/* Mode label */}
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {SLD_MODE_LABELS_PL[sldMode]}
            </span>
            {isReadOnlyMode && (
              <span className="text-[10px] opacity-80">Tylko odczyt</span>
            )}
          </div>
        </div>

        {/* Focus indicator (for jump-to-element visual feedback) — CANONICAL-grade */}
        {focusIndicatorPosition && (
          <div
            data-testid={`sld-focus-${focusIndicatorPosition.elementId}`}
            className="pointer-events-none absolute z-20"
            style={{
              left: `${focusIndicatorPosition.x}px`,
              top: `${focusIndicatorPosition.y}px`,
              transform: 'translate(-50%, -50%)',
            }}
            onAnimationEnd={handleFocusPulseAnimationEnd}
          >
            {/* Professional pulsing ring — subtle, not distracting */}
            <div
              className="w-20 h-20 rounded-full border-2 border-blue-400 animate-ping opacity-60"
              style={{ animationIterationCount: 2, animationDuration: '1.5s' }}
              onAnimationEnd={handleFocusPulseAnimationEnd}
            />
            <div className="absolute inset-0 w-20 h-20 rounded-full border border-blue-300 opacity-40" />
            {/* Center dot */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500" />
          </div>
        )}

        {/* PR-16: Overlay Runtime Legend */}
        {overlayRuntime.isActive && (
          <OverlayLegend
            overlay={overlayRuntime.overlay}
            visible={overlayRuntime.isActive}
          />
        )}

        {/* Diagnostics overlay layer */}
        <DiagnosticsOverlay
          symbols={symbols}
          viewport={viewport}
          selectedElementId={selectedElement?.id}
          focusPulseElementId={focusPulseElementId}
          visible={diagnosticsVisible}
          filter={diagnosticsFilter}
          onMarkerClick={handleDiagnosticsMarkerClick}
          projectId={activeProjectId}
          diagramId={activeCaseId}
          showLegend={true}
        />

        {diagnosticsVisible && semanticDiagnosticsReport && (
          <SldSemanticDiagnosticsPanel report={semanticDiagnosticsReport} />
        )}

        {/* Switching state & energization legend (toggled via button) */}
        <SwitchingStateLegend visible={legendVisible} />

        {/* Legend toggle button (bottom-left corner) — CANONICAL-grade */}
        <button
          type="button"
          onClick={() => setLegendVisible((prev) => !prev)}
          className={`absolute bottom-4 left-4 z-10 flex items-center gap-1.5 rounded-[14px] border px-3 py-2 text-xs font-medium shadow-[0_16px_30px_rgba(2,8,23,0.34)] transition-all duration-150 ${
            legendVisible
              ? 'border-[#274154] bg-[rgba(7,19,28,0.92)] text-white hover:bg-[#0d1c29]'
              : 'border-[#274154] bg-[rgba(7,19,28,0.84)] text-[#d7e5ef] hover:bg-[#112433]'
          }`}
          title={legendVisible ? 'Ukryj legendę' : 'Pokaż legendę'}
          data-testid="sld-legend-toggle"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
          {legendVisible ? 'Ukryj legendę' : 'Legenda'}
        </button>

        {/* PR-SLD-06: Diagnostic results layer (only in WYNIKI mode) */}
        {isResultsMode && (
          <DiagnosticResultsLayer
            symbols={symbols}
            viewport={viewport}
            visible={diagnosticLayerVisible}
          />
        )}

        {/* PR-SLD-09: Protection overlay layer (only in ZABEZPIECZENIA mode) */}
        {isProtectionMode && (
          <ProtectionOverlayLayer
            symbols={symbols}
            viewport={viewport}
            selectedElementId={selectedElement?.id}
            visible={protectionLayerVisible}
            onLabelClick={handleProtectionLabelClick}
          />
        )}

        {/* BLOK 7: Etykiety techniczne — load%, NOP, napięcie */}
        <SldTechLabelsLayer
          symbols={symbols}
          viewport={viewport}
          width={canvasWidth}
          height={canvasHeight}
          visible={effectiveTechLabelsVisible}
        />

        {/* V12 § 5.7 — Semantyczna mini-mapa (prawy dolny narożnik) */}
        {symbols.length > 0 && (
          <div className="absolute bottom-4 right-4 z-20 pointer-events-auto">
            <SldSemanticMinimap
              symbols={symbols}
              viewport={viewport}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              onNavigate={(worldX, worldY) => {
                setViewport((prev) => ({
                  ...prev,
                  offsetX: canvasWidth / 2 - worldX * prev.zoom,
                  offsetY: canvasHeight / 2 - worldY * prev.zoom,
                }));
              }}
            />
          </div>
        )}
      </div>

      {/* Status bar — CANONICAL-grade professional */}
      <div
        data-testid="sld-view-status"
        className="flex items-center justify-between border-t border-[#1a3040] bg-[linear-gradient(180deg,#07111a_0%,#08131d_100%)] px-4 py-2 text-xs"
      >
        <div className="flex items-center gap-4 text-chrome-300">
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-chrome-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
            </svg>
            <span className="font-mono">{symbols.length}</span> elementów
          </span>
          {selectedElement && (
            <span className="flex items-center gap-1.5 border-l border-chrome-600 pl-4">
              <svg className="w-3.5 h-3.5 text-ind-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2z" />
              </svg>
              <span className="font-medium text-chrome-100">{selectedElement.name}</span>
              <span className="text-chrome-500">({selectedElement.type})</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-chrome-400">
          {/* PR-SLD-06, PR-SLD-09: Mode status in status bar */}
          {isReadOnlyMode && (
            <span
              data-testid={isResultsMode ? 'sld-status-results-mode' : 'sld-status-protection-mode'}
              className={`flex items-center gap-1.5 font-medium ${isResultsMode ? 'text-ind-400' : 'text-emerald-400'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              {isResultsMode ? 'Tylko odczyt' : 'Tylko odczyt'}
            </span>
          )}
          <span className="text-chrome-500">
            Srodkowy przycisk: przesuwanie | Prawy przycisk: menu | Kolko/+/-: powiekszenie | F: dopasuj | 0: reset widoku
          </span>
        </div>
      </div>

      {/* Export dialog */}
      <SldSnapshotExportDialog
        isOpen={exportDialogOpen}
        onClose={handleExportDialogClose}
        onExport={handleExport}
        currentLayerState={currentLayerState}
        metadata={exportMetadata}
        hasResultsOverlay={hasResults}
        hasDiagnosticsOverlay={hasDiagnostics}
        isExporting={isExporting}
      />

      {/* Engineering context menu — right-click on SLD elements */}
      <EngineeringContextMenu
        state={contextMenuState}
        mode={isResultsMode ? 'RESULT_VIEW' : isProtectionMode ? 'RESULT_VIEW' : 'MODEL_EDIT'}
        onClose={handleContextMenuClose}
        onOperation={handleContextMenuOperation}
        onCatalogRequired={handleCatalogRequired}
      />

      {/* Bramka katalogowa — TypePicker otwarty PRZED modalem operacji */}
      {catalogPickerState.isOpen && catalogPickerState.category && (
        <TypePicker
          category={catalogPickerState.category}
          onSelectType={handleCatalogTypeSelected}
          onClose={handleCatalogPickerClose}
          isOpen={catalogPickerState.isOpen}
        />
      )}
    </div>
  );
};
