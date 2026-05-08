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

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';

import { useAppStateStore } from '../../../app-state';
import { SldContextMenuController } from '../../../context-menu/SldContextMenuController';
import type { SldContextMenuRequest } from '../../../context-menu/SldContextMenuController';
import { useNetworkBuildStore } from '../../../network-build/networkBuildStore';
import { notify } from '../../../notifications/store';
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import type { Bay, EnergyNetworkModel, Substation, Transformer } from '../../../../types/enm';
import type { ElementType, SelectedElement } from '../../../types';
import {
  COMMAND_FEEDBACK_PL,
  toastBus,
  type SldElementKindForMenu,
} from '../command/SldCommandService';
import { SldCanvasV2, type SldCanvasContextMenuRequest } from './SldCanvasV2';
import { StationInternalView, type StationInternalViewProps } from './StationInternalView';
import { buildSldDataFromSnapshot } from './enmToSldAdapter';
import { buildCanonicalGpzProps } from './enmToCanonicalGpzAdapter';
import { buildNetworkTerrain } from './buildNetworkTerrain';
import type { GpzCanonicalRendererProps } from '../renderer/GpzCanonicalRenderer';
import type { NetworkTerrainRendererProps } from '../renderer/NetworkTerrainRenderer';
import { BayConfigModal, type BayConfigData } from '../modals/BayConfigModal';
import { TransformerEditModal, type TransformerData } from '../modals/TransformerEditModal';
import { CouplerEditModal, type CouplerData } from '../modals/CouplerEditModal';
import { ApparatusStateModal, type ApparatusStateData } from '../modals/ApparatusStateModal';
import { AddApparatusModal, type AddApparatusData, type ApparatusKind } from '../modals/AddApparatusModal';
import {
  AppendStationModal,
  type AppendStationFormData,
  type AppendStationModalContext,
} from '../modals/AppendStationModal';
import {
  ConsciousSplitModal,
  type ConsciousSplitFormData,
  type ConsciousSplitModalContext,
} from '../modals/ConsciousSplitModal';
import type { SplitElectricalImpact } from '../workflow/ConsciousSplitController';
import {
  DeleteConfirmModal,
  type DeletableKind,
  type DeleteConfirmModalContext,
} from '../modals/DeleteConfirmModal';
import {
  SegmentInsertModal,
  type SegmentInsertFormData,
  type SegmentInsertModalContext,
  type SegmentInsertObjectKind,
  SEGMENT_INSERT_BACKEND_OPS,
  SEGMENT_INSERT_LABELS_PL,
} from '../modals/SegmentInsertModal';
import { AnonymizationProvider } from '../anonymization/AnonymizationProvider';
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
 * R20: Mapowanie ENM `Bay.bay_role` → canonical `BayFieldRole` używany
 * w `BayConfigModal`. Symetryczna wersja do `mapBayRoleToFieldRole`
 * z `enmToCanonicalGpzAdapter`.
 */
function mapBayRoleToCanonicalFieldRole(role: Bay['bay_role']):
  'LINE_OUT' | 'LINE_IN' | 'LINE_BRANCH' | 'TRANSFORMER' | 'COUPLER' | 'MEASUREMENT' {
  switch (role) {
    case 'IN': return 'LINE_IN';
    case 'OUT': return 'LINE_OUT';
    case 'TR': return 'TRANSFORMER';
    case 'COUPLER': return 'COUPLER';
    case 'FEEDER': return 'LINE_OUT';
    case 'MEASUREMENT': return 'MEASUREMENT';
    case 'OZE': return 'TRANSFORMER';
    default: return 'LINE_OUT';
  }
}

/**
 * R22: Odwrotne mapowanie canonical fieldRole → ENM Bay.bay_role.
 * Używane gdy modal BayConfigModal mutuje bay przez patchSnapshot.
 */
function mapCanonicalRoleToBayRole(
  fieldRole: 'LINE_OUT' | 'LINE_IN' | 'LINE_BRANCH' | 'TRANSFORMER' | 'COUPLER' | 'MEASUREMENT',
): Bay['bay_role'] {
  switch (fieldRole) {
    case 'LINE_IN': return 'IN';
    case 'LINE_OUT': return 'OUT';
    case 'LINE_BRANCH': return 'OUT';
    case 'TRANSFORMER': return 'TR';
    case 'COUPLER': return 'COUPLER';
    case 'MEASUREMENT': return 'MEASUREMENT';
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
  'open-bay': 'E-11',
  'configure-equipment': 'E-11',
  'configure-cts-vts': 'E-11',
  'configure-protection': 'E-11',
  'open-station-config': 'E-13',
  // R51 (Zasada 13): akcje kontekstowe SLD "Edytuj X" otwierają nowe wizard/editor
  'edit-station-wizard': 'E-13',  // prawy klik na stację → StationWizard mode='edit'
  'edit-bay-editor': 'E-11',      // prawy klik na pole → BayEditorStandalone mode='edit'
  'edit-segment-inline': 'E-12',  // prawy klik na odcinek → LineSegmentInline mode='edit'
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
  // R61: pozostałe akcje menu → konfiguratory (operacje wykonywane w ich UI):
  'insert-gpz': 'E-10',          // Konfigurator GPZ (mode=create) → add_grid_source_sn
  'add-section': 'E-10',         // GPZ Konfigurator → karta "Sekcje" → add_gpz_section
  'add-bay': 'E-13',             // Stacja Konfigurator → kreator pól → add_sn_bay
  'extend-trunk': 'E-12',        // Konfigurator odcinka — kontynuacja ciągu z bay endpoint
  'continue-trunk': 'E-12',      // Konfigurator odcinka — kontynuacja ciągu ze stacji
  'start-branch': 'E-12',        // Konfigurator odcinka — start odgałęzienia
  'add-load': 'E-13',            // Stacja Konfigurator → karta "Strona nN" → add_nn_load
  'show-measurements': 'E-29',   // Pomiary i telemetria pola
};

/** Akcje z odsyłaczem do innego ekranu / konfiguratora — toast informacyjny.
 *  Te akcje SĄ dostępne, ale nie z menu kontekstowego — wymagają nawigacji
 *  do konkretnego konfiguratora. Hint kieruje operatora gdzie iść. */
const ACTION_ROADMAP_HINT_PL: Readonly<Record<string, string>> = {
  'add-source': 'Wybór rodzaju DER (PV/BESS/FW) odbywa się w karcie "Źródła i magazyny" konfiguratora stacji E-13.',
  'show-sc-source': 'Dane zwarciowe źródła GPZ: dostępne w karcie "Strona 110 kV" konfiguratora GPZ (E-10).',
  'show-sc-data': 'Dane zwarciowe sekcji: dostępne w konfiguratorze GPZ (E-10) → "Strona 110 kV".',
  'change-family-to-overhead': 'Zmiana rodziny: użyj konfiguratora odcinka (E-12) → karta "Identyfikacja & rodzina".',
  'change-family-to-cable': 'Zmiana rodziny: użyj konfiguratora odcinka (E-12) → karta "Identyfikacja & rodzina".',
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

/**
 * R33: Public export wraps SldWorkspaceContainer w AnonymizationProvider
 * żeby renderery v2 (kanoniczne + mini-RMU + network terrain) miały dostęp
 * do `useAnonymizedLabel` hook. Brak provider = no-op (raw labels).
 */
export function SldWorkspaceContainer(
  props: SldWorkspaceContainerProps = {},
): JSX.Element {
  return (
    <AnonymizationProvider>
      <SldWorkspaceContainerInner {...props} />
    </AnonymizationProvider>
  );
}

function SldWorkspaceContainerInner(
  props: SldWorkspaceContainerProps = {},
): JSX.Element {
  const { readOnly = false, width: widthOverride, height: heightOverride } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const measured = useMeasuredSize(containerRef, 1024, 640, {
    width: widthOverride,
    height: heightOverride,
  });

  const snapshot = useSnapshotStore((state) => state.snapshot);
  const logicalViews = useSnapshotStore((state) => state.logicalViews);
  /* R22: patchSnapshot dla live-edit z modali — natychmiastowa propagacja
   * zmian z BayConfigModal/TransformerEditModal/CouplerEditModal do SLD
   * canvas + inspector + property grids. */
  const patchSnapshot = useSnapshotStore((state) => state.patchSnapshot);
  /* R27: executeDomainOperation dla pełnej propagacji backend → ENM →
   * recalculate proof packs. Hierarchia: gdy activeCaseId obecny →
   * executeDomainOperation, fallback patchSnapshot (offline live-edit). */
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeMode = useAppStateStore((state) => state.activeMode);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const selectElement = useSelectionStore((state) => state.selectElement);

  const [contextRequest, setContextRequest] = useState<SldContextMenuRequest | null>(null);
  const [internalStationId, setInternalStationId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /* R20: modale edycji per element kind (bay/transformer/coupler).
   * Otwierane przez context menu actions. State trzymany w containerze. */
  const [bayModalState, setBayModalState] = useState<{ open: boolean; data: BayConfigData | null }>(
    { open: false, data: null },
  );
  const [transformerModalState, setTransformerModalState] = useState<{ open: boolean; data: TransformerData | null }>(
    { open: false, data: null },
  );
  const [couplerModalState, setCouplerModalState] = useState<{ open: boolean; data: CouplerData | null }>(
    { open: false, data: null },
  );
  /* R30: ApparatusStateModal — sterowanie łącznikami (CB/DS/ES) per pole.
   * Otwierany przez context menu action 'set-switch-state'. */
  const [apparatusStateModalState, setApparatusStateModalState] = useState<{ open: boolean; data: ApparatusStateData | null }>(
    { open: false, data: null },
  );
  /* R31: AddApparatusModal — dodawanie pojedynczego aparatu (CT/VT/SA/Fuse) do pola.
   * Otwierany przez context menu pola → 'configure-cts-vts'. */
  const [addApparatusModalState, setAddApparatusModalState] = useState<{ open: boolean; data: AddApparatusData | null }>(
    { open: false, data: null },
  );
  /* R61 Phase 0B: AppendStationModal — zakończ ciąg w stacji.
   * Otwierany przez context menu pola na free endpoint → 'append-station-on-endpoint'. */
  const [appendModalState, setAppendModalState] = useState<{ open: boolean; context: AppendStationModalContext | null }>(
    { open: false, context: null },
  );
  /* R61 Phase 0C: ConsciousSplitModal — świadomy podział odcinka SN.
   * Otwierany przez context menu odcinka → 'conscious-split-on-segment'. */
  const [splitModalState, setSplitModalState] = useState<{ open: boolean; context: ConsciousSplitModalContext | null }>(
    { open: false, context: null },
  );
  /* R61: DeleteConfirmModal — potwierdzenie usunięcia obiektu.
   * Otwierany przez delete-bay/segment/station/pv/bess/fw. */
  const [deleteModalState, setDeleteModalState] = useState<{ open: boolean; context: DeleteConfirmModalContext | null }>(
    { open: false, context: null },
  );
  /* R61: SegmentInsertModal — wstawia ZKSN/łącznik/mufę/słup na odcinku SN.
   * Otwierany przez insert-zksn/sectional/joint/pole. */
  const [segmentInsertModalState, setSegmentInsertModalState] = useState<{ open: boolean; context: SegmentInsertModalContext | null }>(
    { open: false, context: null },
  );
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

  /* R17/R18: Pełna sieć terenowa — stacje + cable runs przez porty IN/OUT.
   * Budujemy gdy snapshot ma substations (poza GPZ) i line_runs.
   * NetworkTerrainRenderer ZASTĘPUJE legacy stations[]+cableRuns[] gdy
   * networkTerrain jest podane (architektura kanwy SldCanvasV2). */
  const networkTerrain = useMemo<NetworkTerrainRendererProps | null>(() => {
    if (!snapshot) return null;
    const fieldStations = (snapshot.substations ?? []).filter((s) => s.station_type !== 'gpz');
    if (fieldStations.length === 0) return null;
    const built = buildNetworkTerrain(snapshot);
    return {
      ...built,
      overlayMode: 'none', // hookpoint dla R19 calculation overlays
    };
  }, [snapshot]);

  const isEmpty = useMemo(() => {
    return (
      sldData.gpzs.length === 0 &&
      sldData.stations.length === 0 &&
      sldData.cableRuns.length === 0 &&
      sldData.ders.length === 0
    );
  }, [sldData]);

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
    } else if (kind === 'cable_run') {
      const run = sldData.cableRuns.find((item) => item.id === id);
      selected = {
        id,
        type: 'LineBranch',
        name: run?.id ?? id,
      };
    } else if (kind === 'section') {
      selected = {
        id,
        type: 'Bus',
        name: `Sekcja SN ${id}`,
      };
    }

    selectElement(selected ?? { id, type: 'DescriptiveElement', name: id });
  }, [selectElement, snapshot, sldData]);

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
          || actionId === 'continue-trunk')) {
        notify('Tryb podglądu schematu — operacje budowy są zablokowane.', 'warning');
        return;
      }

      // 1) Akcje nawigacyjne — otwórz istniejącą powierzchnię.
      const screenCode = ACTION_TO_SCREEN[actionId];
      if (screenCode) {
        openRouteSurface(screenCode as Parameters<typeof openRouteSurface>[0], {
          entityRef: elementId ?? null,
          subjectKind: 'helper_context',
        });
        toastBus.publish('info', `Przeniesiono do ekranu ${screenCode}.`);
        return;
      }

      /* R20: 'open-bay' → otwiera BayConfigModal z danymi z ENM bay */
      if (actionId === 'open-bay' && kind === 'bay' && elementId && snapshot) {
        const bay = (snapshot.bays ?? []).find((b) => b.ref_id === elementId);
        if (bay) {
          setBayModalState({
            open: true,
            data: {
              bayRef: bay.ref_id,
              bayNumber: bay.bay_number ?? '',
              feederName: bay.feeder_short_name ?? '',
              fieldRole: mapBayRoleToCanonicalFieldRole(bay.bay_role),
              destinationLabel: bay.outgoing_destination_ref ?? '',
              controlMode: 'remote',
            },
          });
          return;
        }
      }

      /* R31: 'configure-cts-vts' lub 'configure-equipment' (kind=bay) → AddApparatusModal */
      if ((actionId === 'configure-cts-vts' || actionId === 'configure-equipment')
          && kind === 'bay' && elementId && snapshot) {
        const bay = (snapshot.bays ?? []).find((b) => b.ref_id === elementId);
        if (bay) {
          const fieldRoleMap: Record<string, AddApparatusData['fieldRole']> = {
            IN: 'LINE_IN', OUT: 'LINE_OUT', TR: 'TRANSFORMER',
            COUPLER: 'COUPLER', FEEDER: 'LINE_OUT', MEASUREMENT: 'MEASUREMENT', OZE: 'TRANSFORMER',
          };
          const defaultKind: ApparatusKind = actionId === 'configure-cts-vts' ? 'ct' : 'cable_head';
          setAddApparatusModalState({
            open: true,
            data: {
              bayRef: bay.ref_id,
              bayNumber: bay.bay_number ?? '',
              fieldRole: fieldRoleMap[bay.bay_role] ?? 'LINE_OUT',
              apparatusKind: defaultKind,
              designation: defaultKind === 'ct' ? 'T1' : '',
              ratioPrimary: defaultKind === 'ct' ? 200 : null,
              ratioSecondary: defaultKind === 'ct' ? 5 : null,
              accuracyClass: defaultKind === 'ct' ? '0.5' : '',
              ratedVoltageKv: null,
              ratedCurrentA: defaultKind === 'ct' ? 200 : null,
              catalogRef: null,
            },
          });
          return;
        }
      }

      /* R30: 'set-switch-state' (kind=bay) → otwiera ApparatusStateModal
       * dla sterowania łącznikami CB/DS/ES per pole. Operacyjnie krytyczna
       * akcja dyspozytora — używana 100+ razy dziennie. */
      if (actionId === 'set-switch-state' && kind === 'bay' && elementId && snapshot) {
        const bay = (snapshot.bays ?? []).find((b) => b.ref_id === elementId);
        if (bay) {
          /* Ekstraktujemy aktualne stany z runtime_state albo defaultujemy do unknown.
           * BayDeviceState (PL) → SwitchState (UI):
           *   zamkniety → closed, otwarty → open, nieznany/awaria → unknown,
           *   _naped_rozbrojony → closed/open (uproszczenie). */
          const runtime = bay.runtime_state ?? null;
          const mapDevState = (raw: string | undefined): 'closed' | 'open' | 'unknown' => {
            if (!raw) return 'unknown';
            if (raw === 'zamkniety' || raw === 'zamkniety_naped_rozbrojony') return 'closed';
            if (raw === 'otwarty' || raw === 'otwarty_naped_rozbrojony') return 'open';
            return 'unknown';
          };
          const cbState = mapDevState(runtime?.primary_device_states?.cb?.actual_state);
          const dsBusState = mapDevState(runtime?.primary_device_states?.ds_bus?.actual_state);
          const dsLinState = mapDevState(runtime?.primary_device_states?.ds_lin?.actual_state);
          const esRaw = runtime?.primary_device_states?.es?.actual_state;
          const esState: 'closed' | 'open' | 'absent' | 'unknown' = esRaw === 'zamkniety'
            ? 'closed'
            : esRaw === 'otwarty'
              ? 'open'
              : 'unknown';
          /* Tryb sterowania — z first device's control_mode */
          const firstDevState = Object.values(runtime?.primary_device_states ?? {})[0];
          const ctrlMode: 'remote' | 'local' | 'unknown' = firstDevState?.control_mode === 'zdalne'
            ? 'remote'
            : firstDevState?.control_mode === 'miejscowe' || firstDevState?.control_mode === 'lokalne_zablokowane'
              ? 'local'
              : 'unknown';
          setApparatusStateModalState({
            open: true,
            data: {
              bayRef: bay.ref_id,
              bayNumber: bay.bay_number ?? '',
              feederName: bay.feeder_short_name ?? '',
              cbState,
              dsBusState,
              dsLinState,
              esState,
              cbQ: 'Q0',
              dsBusQ: 'Q1',
              dsLinQ: 'Q9',
              esQ: 'Q8',
              controlMode: ctrlMode,
            },
          });
          return;
        }
      }

      /* R20: 'open-source' z menu GPZ → otwiera TransformerEditModal dla GPZ trafa */
      if (actionId === 'open-source' && kind === 'gpz' && elementId && snapshot) {
        const gpz = (snapshot.substations ?? []).find((s) => s.ref_id === elementId);
        const firstTrRef = gpz?.transformer_refs?.[0];
        const tr = (snapshot.transformers ?? []).find((t) => t.ref_id === firstTrRef);
        if (tr) {
          setTransformerModalState({
            open: true,
            data: {
              transformerRef: tr.ref_id,
              designation: tr.name ?? `T${tr.ref_id.slice(-1)}`,
              snMva: tr.sn_mva,
              uhvKv: tr.uhv_kv,
              ulvKv: tr.ulv_kv,
              vectorGroup: tr.vector_group ?? null,
              catalogRef: tr.catalog_ref ?? null,
            },
          });
          return;
        }
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

      /* R61 Phase 0B: 'append-station-on-endpoint' z menu pola SN
       * (free endpoint) → otwiera AppendStationModal.
       * Modal po submit wywołuje executeDomainOperation('append_station_on_endpoint', payload). */
      if (actionId === 'append-station-on-endpoint' && kind === 'bay' && elementId && snapshot) {
        const bay = (snapshot.bays ?? []).find((b) => b.ref_id === elementId);
        if (!bay) {
          notify(`Pole '${elementId}' nie znalezione w modelu.`, 'warning');
          return;
        }
        /* Endpoint bus = bus_ref pola (szyna na której kończy się ciąg). */
        const endpointBusRef = bay.bus_ref ?? '';
        if (!endpointBusRef) {
          notify(`Pole '${bay.bay_number ?? elementId}' nie ma szyny — nie można dodać stacji.`, 'warning');
          return;
        }
        const snVoltageKv = findBusVoltage(snapshot, endpointBusRef) ?? 15;
        setAppendModalState({
          open: true,
          context: {
            endpointBusRef,
            bayRef: bay.ref_id,
            snVoltageKv,
            /* run_ref nie jest first-class polem Bay; backend wnioskuje
               z endpoint_bus_ref + topologii. Pole opcjonalne. */
            runRef: null,
          },
        });
        return;
      }

      /* R61: DELETE actions (6 menu items) — wszystkie wywołują delete_element. */
      if (
        (actionId === 'delete-bay' && kind === 'bay')
        || (actionId === 'delete-segment' && (kind === 'cable_segment_sn' || kind === 'overhead_line_sn'))
        || (actionId === 'delete-station' && kind === 'station')
        || (actionId === 'delete-pv' && kind === 'der_pv')
        || (actionId === 'delete-bess' && kind === 'der_bess')
        || (actionId === 'delete-fw' && kind === 'der_fw')
      ) {
        if (!elementId || !snapshot) {
          notify(`Brak ref obiektu do usunięcia.`, 'warning');
          return;
        }
        const deleteKindMap: Record<string, DeletableKind> = {
          'delete-bay': 'bay',
          'delete-segment': 'segment',
          'delete-station': 'station',
          'delete-pv': 'der_pv',
          'delete-bess': 'der_bess',
          'delete-fw': 'der_fw',
        };
        const deletableKind = deleteKindMap[actionId];
        /* Określ display name z snapshotu. */
        let displayName = elementId;
        let cascadeRefs: string[] = [];
        if (deletableKind === 'bay') {
          const bay = (snapshot.bays ?? []).find((b) => b.ref_id === elementId);
          displayName = bay?.bay_number ?? bay?.feeder_short_name ?? bay?.name ?? elementId;
        } else if (deletableKind === 'segment') {
          const branch = (snapshot.branches ?? []).find((b) => b.ref_id === elementId);
          displayName = branch?.name ?? elementId;
        } else if (deletableKind === 'station') {
          const station = (snapshot.substations ?? []).find((s) => s.ref_id === elementId);
          displayName = station?.name ?? elementId;
          /* Cascade dla stacji: wszystkie pola + transformatory + szyny.
           * bays NIE są first-class polem Substation — discoverujemy po substation_ref. */
          if (station) {
            const stationBayRefs = (snapshot.bays ?? [])
              .filter((b) => b.substation_ref === station.ref_id)
              .map((b) => b.ref_id);
            cascadeRefs = [
              ...stationBayRefs,
              ...(station.transformer_refs ?? []),
              ...(station.bus_refs ?? []),
            ];
          }
        } else {
          /* DER. */
          const gen = (snapshot.generators ?? []).find((g) => g.ref_id === elementId);
          displayName = gen?.name ?? elementId;
        }
        setDeleteModalState({
          open: true,
          context: {
            elementRef: elementId,
            elementKind: deletableKind,
            displayName,
            cascadeRefs,
          },
        });
        return;
      }

      /* R61: INSERT-ON-SEGMENT actions (4 menu items) — open SegmentInsertModal.
       * Wszystkie wywołują _insert_branch_point_on_segment_sn (lub similar) backend op. */
      if (
        (actionId === 'insert-zksn' && kind === 'cable_segment_sn')
        || (actionId === 'insert-joint' && kind === 'cable_segment_sn')
        || (actionId === 'insert-sectional' && (kind === 'cable_segment_sn' || kind === 'overhead_line_sn'))
        || (actionId === 'insert-pole' && kind === 'overhead_line_sn')
      ) {
        if (!elementId || !snapshot) {
          notify(`Brak referencji odcinka.`, 'warning');
          return;
        }
        const branch = (snapshot.branches ?? []).find((b) => b.ref_id === elementId);
        if (!branch) {
          notify(`Odcinek '${elementId}' nie znaleziony.`, 'warning');
          return;
        }
        const isLineOrCable = branch.type === 'line_overhead' || branch.type === 'cable';
        if (!isLineOrCable) {
          notify(`Odcinek '${elementId}' nie jest typu liniowego.`, 'warning');
          return;
        }
        const lineBranch = branch as { length_km: number; from_bus_ref?: string; to_bus_ref?: string; ref_id: string };
        if ((lineBranch.length_km ?? 0) <= 0) {
          notify(`Odcinek '${elementId}' ma zerową długość.`, 'warning');
          return;
        }
        const objectKindMap: Record<string, SegmentInsertObjectKind> = {
          'insert-zksn': 'zksn',
          'insert-sectional': 'sectional',
          'insert-joint': 'joint',
          'insert-pole': 'pole',
        };
        setSegmentInsertModalState({
          open: true,
          context: {
            segmentRef: lineBranch.ref_id,
            fromBusRef: lineBranch.from_bus_ref ?? '',
            toBusRef: lineBranch.to_bus_ref ?? '',
            lengthKm: lineBranch.length_km,
            objectKind: objectKindMap[actionId],
          },
        });
        return;
      }

      /* R61 Phase 0C: 'conscious-split-on-segment' i legacy 'insert-station' z menu
       * odcinka SN (cable lub overhead line) → otwiera ConsciousSplitModal.
       * Oba akcje wywołują ten sam backend operation insert_station_on_segment_sn.
       * Modal po preview wywołuje executeDomainOperation z dry_run=true,
       * po commit z dry_run=false. */
      if ((actionId === 'conscious-split-on-segment' || actionId === 'insert-station')
          && elementId && snapshot
          && (kind === 'cable_segment_sn' || kind === 'overhead_line_sn')) {
        const branch = (snapshot.branches ?? []).find((b) => b.ref_id === elementId);
        if (!branch) {
          notify(`Odcinek '${elementId}' nie znaleziony w modelu.`, 'warning');
          return;
        }
        /* length_km jest tylko na OverheadLine i Cable (nie na SwitchBranch/FuseBranch). */
        const isLineOrCable = branch.type === 'line_overhead' || branch.type === 'cable';
        if (!isLineOrCable) {
          notify(`Odcinek '${elementId}' nie jest typu liniowego (kabel/napowietrzny) — podział niemożliwy.`, 'warning');
          return;
        }
        const lineBranch = branch as { length_km: number; from_bus_ref?: string; to_bus_ref?: string; ref_id: string };
        const lengthKm = lineBranch.length_km ?? 0;
        if (lengthKm <= 0) {
          notify(`Odcinek '${elementId}' ma zerową długość — podział niemożliwy.`, 'warning');
          return;
        }
        const fromBusRef = lineBranch.from_bus_ref ?? '';
        const toBusRef = lineBranch.to_bus_ref ?? '';
        const snVoltageKv = findBusVoltage(snapshot, fromBusRef) ?? findBusVoltage(snapshot, toBusRef) ?? 15;
        setSplitModalState({
          open: true,
          context: {
            segmentRef: lineBranch.ref_id,
            segmentType: kind === 'cable_segment_sn' ? 'cable' : 'line_overhead',
            fromBusRef,
            toBusRef,
            lengthKm,
            snVoltageKv,
          },
        });
        return;
      }

      // 2) Akcje z odsyłaczem do innego ekranu — informacja gdzie iść.
      const hint = ACTION_ROADMAP_HINT_PL[actionId];
      if (hint) {
        notify(hint, 'info');
        return;
      }

      // 3) Fallback — generic dead-click guard (nie powinien się zdarzyć dla
      //    akcji z SLD_MENU_REGISTRY; jeśli się zdarzy, oznacza brak handlera
      //    dla nowo dodanej akcji menu — bug do naprawy).
      notify(`Akcja "${actionId}" (${kind}) nie ma przypisanego handlera.`, 'warning');
    },
    [openRouteSurface, readOnly, snapshot, activeCaseId, executeDomainOperation, patchSnapshot],
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
      width: overlayWidth,
      height: overlayHeight,
      onClose: closeInternalStation,
    };
  }, [internalStationId, closeInternalStation, measured.height, measured.width, snapshot, sldData.stations]);

  return (
    <div
      ref={containerRef}
      data-testid="sld-workspace-container"
      data-readonly={readOnly}
      data-pending-drop={pendingDrop?.kind ?? ''}
      className="relative flex h-full w-full overflow-hidden bg-scada-bg"
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
        networkTerrain={networkTerrain}
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
      />

      {/* Pusty stan — kanoniczny komunikat polski. */}
      {isEmpty && (
        <div
          data-testid="sld-empty-state"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="pointer-events-auto max-w-md rounded border border-scada-border bg-scada-panel/95 p-6 text-center text-scada-text shadow-xl">
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
        elementName={contextRequest?.elementId ?? undefined}
        mode={activeMode}
        context={{}}
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

      {/* R22+R27: BayConfigModal — edycja pola SN z LIVE PROPAGATION + backend.
       * Hierarchia:
       *   1. activeCaseId obecny → executeDomainOperation('update_element_parameters')
       *      → backend mutuje ENM, response.snapshot zastępuje store, wszelkie
       *        wyniki obliczeń są INVALIDOWANE przez analysis_dispatch
       *   2. fallback (offline) → patchSnapshot(local) z lastChanges (Inv 4)
       *
       * Inv 4 zachowane w obu ścieżkach. */}
      {bayModalState.open && bayModalState.data && (
        <BayConfigModal
          isOpen={bayModalState.open}
          initial={bayModalState.data}
          onClose={() => setBayModalState({ open: false, data: null })}
          onSubmit={async (updated) => {
            if (activeCaseId) {
              try {
                await executeDomainOperation(activeCaseId, 'update_element_parameters', {
                  element_ref: updated.bayRef,
                  updates: {
                    bay_number: updated.bayNumber || null,
                    feeder_short_name: updated.feederName || null,
                    bay_role: mapCanonicalRoleToBayRole(updated.fieldRole),
                    outgoing_destination_ref: updated.destinationLabel || null,
                  },
                });
                notify(
                  `Zapisano konfigurację pola ${updated.bayNumber || updated.bayRef}. Wyniki obliczeń pola unieważnione.`,
                  'success',
                );
              } catch (e) {
                notify(
                  `Błąd zapisu pola — fallback do live-edit (snapshot lokalny): ${(e as Error).message}`,
                  'warning',
                );
                /* Fallback do patchSnapshot gdy backend niedostępny */
                patchSnapshot(
                  (snap) => ({
                    ...snap,
                    bays: (snap.bays ?? []).map((b) =>
                      b.ref_id === updated.bayRef
                        ? {
                            ...b,
                            bay_number: updated.bayNumber || null,
                            feeder_short_name: updated.feederName || null,
                            bay_role: mapCanonicalRoleToBayRole(updated.fieldRole),
                            outgoing_destination_ref: updated.destinationLabel || null,
                          }
                        : b,
                    ),
                  }),
                  [updated.bayRef],
                );
              }
            } else {
              /* Brak activeCaseId — local-only live-edit */
              patchSnapshot(
                (snap) => ({
                  ...snap,
                  bays: (snap.bays ?? []).map((b) =>
                    b.ref_id === updated.bayRef
                      ? {
                          ...b,
                          bay_number: updated.bayNumber || null,
                          feeder_short_name: updated.feederName || null,
                          bay_role: mapCanonicalRoleToBayRole(updated.fieldRole),
                          outgoing_destination_ref: updated.destinationLabel || null,
                        }
                      : b,
                  ),
                }),
                [updated.bayRef],
              );
              notify(
                `Zapisano konfigurację pola ${updated.bayNumber || updated.bayRef} (live-edit, brak active case).`,
                'info',
              );
            }
            setBayModalState({ open: false, data: null });
          }}
        />
      )}

      {/* R22+R27: TransformerEditModal — edycja transformatora z LIVE PROPAGATION + backend. */}
      {transformerModalState.open && transformerModalState.data && (
        <TransformerEditModal
          isOpen={transformerModalState.open}
          initial={transformerModalState.data}
          onClose={() => setTransformerModalState({ open: false, data: null })}
          onSubmit={async (updated) => {
            const updates = {
              name: updated.designation,
              sn_mva: updated.snMva,
              uhv_kv: updated.uhvKv,
              ulv_kv: updated.ulvKv,
              vector_group: updated.vectorGroup,
              catalog_ref: updated.catalogRef,
            };
            if (activeCaseId) {
              try {
                await executeDomainOperation(activeCaseId, 'update_element_parameters', {
                  element_ref: updated.transformerRef,
                  updates,
                });
                notify(
                  `Zapisano konfigurację transformatora ${updated.designation}. Wyniki SC i load flow unieważnione.`,
                  'success',
                );
              } catch (e) {
                notify(
                  `Błąd zapisu transformatora — fallback do live-edit: ${(e as Error).message}`,
                  'warning',
                );
                patchSnapshot(
                  (snap) => ({
                    ...snap,
                    transformers: (snap.transformers ?? []).map((t) =>
                      t.ref_id === updated.transformerRef ? { ...t, ...updates, name: updated.designation || t.name } : t,
                    ),
                  }),
                  [updated.transformerRef],
                );
              }
            } else {
              patchSnapshot(
                (snap) => ({
                  ...snap,
                  transformers: (snap.transformers ?? []).map((t) =>
                    t.ref_id === updated.transformerRef ? { ...t, ...updates, name: updated.designation || t.name } : t,
                  ),
                }),
                [updated.transformerRef],
              );
              notify(
                `Zapisano konfigurację transformatora ${updated.designation} (live-edit, brak active case).`,
                'info',
              );
            }
            setTransformerModalState({ open: false, data: null });
          }}
        />
      )}

      {/* R31: AddApparatusModal — dodawanie aparatu (CT/VT/SA/Fuse) do pola.
       * Backend: add_sn_bay można rozszerzyć ale dla MVP — patchSnapshot dodaje
       * apparatus_ref do bay.equipment_refs. */}
      {addApparatusModalState.open && addApparatusModalState.data && (
        <AddApparatusModal
          isOpen={addApparatusModalState.open}
          initial={addApparatusModalState.data}
          onClose={() => setAddApparatusModalState({ open: false, data: null })}
          onSubmit={(updated) => {
            const apparatusRef = `${updated.bayRef}__${updated.apparatusKind}__${updated.designation}`;
            patchSnapshot(
              (snap) => ({
                ...snap,
                bays: (snap.bays ?? []).map((b) =>
                  b.ref_id === updated.bayRef
                    ? {
                        ...b,
                        equipment_refs: [...(b.equipment_refs ?? []), apparatusRef],
                        meta: {
                          ...b.meta,
                          [`apparatus_${apparatusRef}`]: {
                            kind: updated.apparatusKind,
                            designation: updated.designation,
                            ratio_primary: updated.ratioPrimary,
                            ratio_secondary: updated.ratioSecondary,
                            accuracy_class: updated.accuracyClass,
                            rated_voltage_kv: updated.ratedVoltageKv,
                            rated_current_a: updated.ratedCurrentA,
                            catalog_ref: updated.catalogRef,
                          },
                        },
                      }
                    : b,
                ),
              }),
              [updated.bayRef],
            );
            notify(
              `Dodano aparat ${updated.designation} (${updated.apparatusKind}) do pola ${updated.bayNumber || updated.bayRef}.`,
              'success',
            );
            setAddApparatusModalState({ open: false, data: null });
          }}
        />
      )}

      {/* R30: ApparatusStateModal — sterowanie łącznikami CB/DS/ES per pole.
       * Operacyjnie krytyczne: dyspozytor klika 100+ razy dziennie. Backend
       * pipeline z fallback do live-edit (3-stopniowa hierarchia jak inne modale). */}
      {apparatusStateModalState.open && apparatusStateModalState.data && (
        <ApparatusStateModal
          isOpen={apparatusStateModalState.open}
          initial={apparatusStateModalState.data}
          onClose={() => setApparatusStateModalState({ open: false, data: null })}
          onSubmit={async (delta) => {
            /* Mapowanie odwrotne: SwitchState (UI) → BayDeviceState (PL) */
            const toEnmState = (s: 'closed' | 'open' | 'unknown'): string =>
              s === 'closed' ? 'zamkniety' : s === 'open' ? 'otwarty' : 'nieznany';
            const updates: Record<string, unknown> = {
              operator_comment: delta.operatorComment,
            };
            if (delta.cbState) updates['runtime_state.primary_device_states.cb.actual_state'] = toEnmState(delta.cbState);
            if (delta.dsBusState) updates['runtime_state.primary_device_states.ds_bus.actual_state'] = toEnmState(delta.dsBusState);
            if (delta.dsLinState) updates['runtime_state.primary_device_states.ds_lin.actual_state'] = toEnmState(delta.dsLinState);
            if (delta.esState) {
              const esEnm = delta.esState === 'closed' ? 'zamkniety' : delta.esState === 'open' ? 'otwarty' : 'nieznany';
              updates['runtime_state.primary_device_states.es.actual_state'] = esEnm;
            }
            if (activeCaseId) {
              try {
                await executeDomainOperation(activeCaseId, 'update_element_parameters', {
                  element_ref: delta.bayRef,
                  updates,
                });
                notify(
                  `Wykonano sterowanie pola ${delta.bayRef}. Wyniki obliczeń pola unieważnione.`,
                  'success',
                );
              } catch (e) {
                notify(
                  `Błąd sterowania — fallback do live-edit: ${(e as Error).message}`,
                  'warning',
                );
                /* Fallback patchSnapshot — mutuj runtime_state lokalnie.
                 * Uwaga: tylko gdy bay.runtime_state istnieje (zachowujemy
                 * pełną strukturę BayRuntimeState — Inv typesafe). */
                patchSnapshot(
                  (snap) => ({
                    ...snap,
                    bays: (snap.bays ?? []).map((b) => {
                      if (b.ref_id !== delta.bayRef) return b;
                      if (!b.runtime_state) return b; // brak runtime → no-op (Inv 9)
                      const newDevices = { ...b.runtime_state.primary_device_states };
                      const setDev = (key: string, raw: string): void => {
                        const oldDev = newDevices[key];
                        if (!oldDev) return;
                        newDevices[key] = { ...oldDev, actual_state: raw as never };
                      };
                      if (delta.cbState) setDev('cb', toEnmState(delta.cbState));
                      if (delta.dsBusState) setDev('ds_bus', toEnmState(delta.dsBusState));
                      if (delta.dsLinState) setDev('ds_lin', toEnmState(delta.dsLinState));
                      if (delta.esState) setDev('es', delta.esState === 'closed' ? 'zamkniety' : delta.esState === 'open' ? 'otwarty' : 'nieznany');
                      return {
                        ...b,
                        runtime_state: { ...b.runtime_state, primary_device_states: newDevices },
                      };
                    }),
                  }),
                  [delta.bayRef],
                );
              }
            } else {
              /* Brak activeCaseId — local-only */
              notify(
                `Sterowanie pola ${delta.bayRef} (live-edit, brak active case).`,
                'info',
              );
            }
            setApparatusStateModalState({ open: false, data: null });
          }}
        />
      )}

      {/* R61 Phase 0B: AppendStationModal — zakończ ciąg w stacji.
       * Backend operation: append_station_on_endpoint. Tworzy nową stację +
       * pin port wejściowy SN do endpoint busa. Invaliduje run + powiązane wyniki. */}
      {appendModalState.open && appendModalState.context && (
        <AppendStationModal
          isOpen={appendModalState.open}
          context={appendModalState.context}
          onClose={() => setAppendModalState({ open: false, context: null })}
          onSubmit={async (form: AppendStationFormData) => {
            const ctx = appendModalState.context;
            if (!ctx) return;
            if (!activeCaseId) {
              notify('Brak aktywnego zakresu obliczeń (case). Ustaw aktywny case w kontekście projektu.', 'warning');
              return;
            }
            const payload: Record<string, unknown> = {
              endpoint_bus_ref: ctx.endpointBusRef,
              station: {
                name: form.stationName,
                station_type: form.stationType,
                nn_voltage_kv: form.nnVoltageKv,
              },
              nn_voltage_kv: form.nnVoltageKv,
            };
            if (ctx.runRef) payload.run_ref = ctx.runRef;
            if (form.transformerCatalogRef.trim()) {
              payload.transformer = {
                transformer_catalog_ref: form.transformerCatalogRef.trim(),
              };
            }
            try {
              await executeDomainOperation(activeCaseId, 'append_station_on_endpoint', payload);
              notify(
                `Utworzono stację '${form.stationName}' na końcu ciągu (port wejściowy SN przypięty do ${ctx.endpointBusRef}). Wyniki obliczeń ciągu unieważnione.`,
                'success',
              );
              setAppendModalState({ open: false, context: null });
            } catch (e) {
              notify(
                `Błąd tworzenia stacji: ${(e as Error).message}`,
                'error',
              );
              /* Pozostaw modal otwarty — operator może poprawić dane lub anulować. */
            }
          }}
        />
      )}

      {/* R61 Phase 0C: ConsciousSplitModal — świadomy podział odcinka SN.
       * 2-stage flow: form → preview (dry_run=true z electrical_impact) → commit (dry_run=false).
       * Backend operation: insert_station_on_segment_sn. */}
      {splitModalState.open && splitModalState.context && (
        <ConsciousSplitModal
          isOpen={splitModalState.open}
          context={splitModalState.context}
          onClose={() => setSplitModalState({ open: false, context: null })}
          onPreview={async (form: ConsciousSplitFormData): Promise<SplitElectricalImpact> => {
            const ctx = splitModalState.context;
            if (!ctx) throw new Error('Brak kontekstu modala podziału.');
            if (!activeCaseId) throw new Error('Brak aktywnego zakresu obliczeń (case).');
            const payload: Record<string, unknown> = {
              segment_id: ctx.segmentRef,
              insert_at: { mode: 'RATIO', value: form.insertAtRatio },
              dry_run: true,
            };
            if (form.insertedKind === 'station') {
              payload.station = {
                name: form.stationName,
                station_type: form.stationType,
                nn_voltage_kv: form.nnVoltageKv,
              };
              payload.nn_voltage_kv = form.nnVoltageKv;
              if (form.transformerCatalogRef.trim()) {
                payload.transformer = {
                  transformer_catalog_ref: form.transformerCatalogRef.trim(),
                };
              }
            }
            const response = await executeDomainOperation(activeCaseId, 'insert_station_on_segment_sn', payload);
            /* Backend zwraca preview { halves, electrical_impact } w response.
             * DomainOpResponseV1 nie zawiera tego w typie — używamy structural cast. */
            const preview = (response as unknown as {
              preview?: {
                halves?: { length_km: number }[];
                electrical_impact?: {
                  topology_type_changed: boolean;
                  affected_object_refs: string[];
                  catalog_inheritance: {
                    source_segment_ref?: string | null;
                    source_catalog_ref?: string | null;
                    first_inherits?: boolean;
                    second_inherits?: boolean;
                    rule?: string;
                  };
                  invalidated_results: { run_ref: string; run_kind: string; reason: string }[];
                  affected_proof_packs: { proof_ref: string; proof_kind: string; reason: string }[];
                  missing_data_after: string[];
                  affected_buses: string[];
                };
              };
            })?.preview;
            if (!preview?.electrical_impact) {
              throw new Error('Backend nie zwrócił electrical_impact w preview.');
            }
            const ei = preview.electrical_impact;
            const halves = preview.halves ?? [];
            const firstLengthKm = halves[0]?.length_km ?? form.insertAtRatio * ctx.lengthKm;
            const secondLengthKm = halves[1]?.length_km ?? (1 - form.insertAtRatio) * ctx.lengthKm;
            /* Mapowanie snake_case (backend) → camelCase (controller contract). */
            return {
              topologyTypeChanged: ei.topology_type_changed,
              affectedObjectRefs: ei.affected_object_refs,
              halves: {
                firstSegmentId: null,
                secondSegmentId: null,
                firstLengthKm,
                secondLengthKm,
                splitRatio: form.insertAtRatio,
              },
              catalogInheritance: {
                sourceSegmentRef: ei.catalog_inheritance.source_segment_ref ?? null,
                sourceCatalogRef: ei.catalog_inheritance.source_catalog_ref ?? null,
                firstInherits: ei.catalog_inheritance.first_inherits ?? false,
                secondInherits: ei.catalog_inheritance.second_inherits ?? false,
                rule: ei.catalog_inheritance.rule ?? '',
              },
              invalidatedResults: ei.invalidated_results.map((r) => ({
                runRef: r.run_ref,
                runKind: r.run_kind,
                reason: r.reason,
              })),
              affectedProofPacks: ei.affected_proof_packs.map((p) => ({
                proofRef: p.proof_ref,
                proofKind: p.proof_kind,
                reason: p.reason,
              })),
              missingDataAfter: ei.missing_data_after,
              affectedBuses: ei.affected_buses,
            };
          }}
          onCommit={async (form: ConsciousSplitFormData) => {
            const ctx = splitModalState.context;
            if (!ctx) return;
            if (!activeCaseId) {
              notify('Brak aktywnego zakresu obliczeń (case).', 'warning');
              return;
            }
            const payload: Record<string, unknown> = {
              segment_id: ctx.segmentRef,
              insert_at: { mode: 'RATIO', value: form.insertAtRatio },
            };
            if (form.insertedKind === 'station') {
              payload.station = {
                name: form.stationName,
                station_type: form.stationType,
                nn_voltage_kv: form.nnVoltageKv,
              };
              payload.nn_voltage_kv = form.nnVoltageKv;
              if (form.transformerCatalogRef.trim()) {
                payload.transformer = {
                  transformer_catalog_ref: form.transformerCatalogRef.trim(),
                };
              }
            }
            try {
              await executeDomainOperation(activeCaseId, 'insert_station_on_segment_sn', payload);
              notify(
                `Podzielono odcinek '${ctx.segmentRef}' i wstawiono ${form.insertedKind === 'station' ? `stację '${form.stationName}'` : form.insertedKind}. Wyniki obliczeń odcinka unieważnione.`,
                'success',
              );
              setSplitModalState({ open: false, context: null });
            } catch (e) {
              notify(
                `Błąd podziału odcinka: ${(e as Error).message}`,
                'error',
              );
            }
          }}
        />
      )}

      {/* R61: DeleteConfirmModal — uniwersalny modal potwierdzenia usunięcia.
       * Backend: delete_element. Cascade delete + Inv 4 invalidate. */}
      {deleteModalState.open && deleteModalState.context && (
        <DeleteConfirmModal
          isOpen={deleteModalState.open}
          context={deleteModalState.context}
          onClose={() => setDeleteModalState({ open: false, context: null })}
          onConfirm={async (elementRef: string) => {
            if (!activeCaseId) {
              notify('Brak aktywnego zakresu obliczeń (case).', 'warning');
              return;
            }
            const ctx = deleteModalState.context;
            if (!ctx) return;
            try {
              await executeDomainOperation(activeCaseId, 'delete_element', {
                element_ref: elementRef,
              });
              notify(
                `Usunięto ${ctx.displayName} (${ctx.elementRef}). Wyniki obliczeń unieważnione.`,
                'success',
              );
              setDeleteModalState({ open: false, context: null });
            } catch (e) {
              notify(`Błąd usunięcia: ${(e as Error).message}`, 'error');
            }
          }}
        />
      )}

      {/* R61: SegmentInsertModal — wstawia ZKSN/łącznik/mufę/słup na odcinku.
       * Backend: insert_zksn/_section_switch/_joint/_branch_pole_on_segment_sn. */}
      {segmentInsertModalState.open && segmentInsertModalState.context && (
        <SegmentInsertModal
          isOpen={segmentInsertModalState.open}
          context={segmentInsertModalState.context}
          onClose={() => setSegmentInsertModalState({ open: false, context: null })}
          onSubmit={async (form: SegmentInsertFormData) => {
            const ctx = segmentInsertModalState.context;
            if (!ctx) return;
            if (!activeCaseId) {
              notify('Brak aktywnego zakresu obliczeń (case).', 'warning');
              return;
            }
            const opName = SEGMENT_INSERT_BACKEND_OPS[ctx.objectKind];
            const objectLabel = SEGMENT_INSERT_LABELS_PL[ctx.objectKind];
            try {
              await executeDomainOperation(activeCaseId, opName, {
                segment_id: ctx.segmentRef,
                insert_at: { mode: 'RATIO', value: form.insertAtRatio },
                name: form.objectName,
              });
              notify(
                `Wstawiono ${objectLabel} '${form.objectName}' na odcinku '${ctx.segmentRef}'. Odcinek podzielony, wyniki unieważnione.`,
                'success',
              );
              setSegmentInsertModalState({ open: false, context: null });
            } catch (e) {
              notify(`Błąd wstawienia ${objectLabel}: ${(e as Error).message}`, 'error');
            }
          }}
        />
      )}

      {/* R22+R27: CouplerEditModal — edycja sprzęgła z LIVE PROPAGATION + backend.
       * Stan sprzęgła wpływa na topologię — invaliduje WSZYSTKIE wyniki sekcji
       * powiązanych (left + right). */}
      {couplerModalState.open && couplerModalState.data && (
        <CouplerEditModal
          isOpen={couplerModalState.open}
          initial={couplerModalState.data}
          onClose={() => setCouplerModalState({ open: false, data: null })}
          onSubmit={async (updated) => {
            const metaUpdates = {
              coupler_state: updated.closedState,
              coupler_auto_mode: updated.autoMode,
              coupler_comment: updated.comment,
            };
            if (activeCaseId) {
              try {
                await executeDomainOperation(activeCaseId, 'update_element_parameters', {
                  element_ref: updated.couplerId,
                  updates: { meta: metaUpdates },
                });
                notify(
                  `Zapisano konfigurację sprzęgła ${updated.designation}: stan ${updated.closedState}. Wyniki sekcji ${updated.leftSectionId} i ${updated.rightSectionId} unieważnione.`,
                  'success',
                );
              } catch (e) {
                notify(
                  `Błąd zapisu sprzęgła — fallback do live-edit: ${(e as Error).message}`,
                  'warning',
                );
                patchSnapshot(
                  (snap) => ({
                    ...snap,
                    bays: (snap.bays ?? []).map((b) =>
                      b.ref_id === updated.couplerId
                        ? { ...b, meta: { ...b.meta, ...metaUpdates } }
                        : b,
                    ),
                  }),
                  [updated.couplerId, updated.leftSectionId, updated.rightSectionId],
                );
              }
            } else {
              patchSnapshot(
                (snap) => ({
                  ...snap,
                  bays: (snap.bays ?? []).map((b) =>
                    b.ref_id === updated.couplerId
                      ? { ...b, meta: { ...b.meta, ...metaUpdates } }
                      : b,
                  ),
                }),
                [updated.couplerId, updated.leftSectionId, updated.rightSectionId],
              );
              notify(
                `Zapisano konfigurację sprzęgła ${updated.designation} (live-edit, brak active case).`,
                'info',
              );
            }
            setCouplerModalState({ open: false, data: null });
          }}
        />
      )}
    </div>
  );
}

// Re-eksport typów do użycia w testach.
export type { SldContextMenuRequest, SldElementKindForMenu };
export { COMMAND_FEEDBACK_PL };

export default SldWorkspaceContainer;
