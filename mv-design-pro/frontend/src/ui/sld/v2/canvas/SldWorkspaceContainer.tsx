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
import { useSnapshotStore } from '../../../topology/snapshotStore';
import {
  COMMAND_FEEDBACK_PL,
  toastBus,
  type SldElementKindForMenu,
} from '../command/SldCommandService';
import { SldCanvasV2, type SldCanvasContextMenuRequest } from './SldCanvasV2';
import { StationInternalView } from './StationInternalView';
import { buildSldDataFromSnapshot } from './enmToSldAdapter';
import { LassoSelector, rectFromPoints, type LassoRect } from './LassoSelector';
import {
  hasPaletteDragData,
  readPaletteDragData,
  type PaletteDragPayload,
} from '../../../network-build/dragDropController';

const MIN_CANVAS_WIDTH_PX = 360;
const MIN_CANVAS_HEIGHT_PX = 240;
const STATION_INTERNAL_WIDTH_PX = 880;
const STATION_INTERNAL_HEIGHT_PX = 560;

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
  'add-source': 'Dodawanie źródła OZE (PV/BESS/FW): Etap 5 roadmapy.',
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
  const logicalViews = useSnapshotStore((state) => state.logicalViews);
  const activeMode = useAppStateStore((state) => state.activeMode);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);

  const [contextRequest, setContextRequest] = useState<SldContextMenuRequest | null>(null);
  const [internalStationId, setInternalStationId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Iteracja 12: lasso multi-select state.
  const [lassoRect, setLassoRect] = useState<LassoRect | null>(null);
  const lassoStartRef = useRef<{ x: number; y: number } | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PaletteDragPayload | null>(null);

  // Iteracja 11: real-data adapter snapshot → SLD renderers props.
  const sldData = useMemo(
    () => buildSldDataFromSnapshot(snapshot, logicalViews),
    [snapshot, logicalViews],
  );

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

  const handleSelectElement = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const handleDoubleClickStation = useCallback((id: string) => {
    setInternalStationId(id);
  }, []);

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
    [openRouteSurface, readOnly],
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
    // Etap 1: wybudowanie pełnego deskryptora wymaga adaptera ENM → InternalSldDTO
    // (Etap 3+). Tymczasowo prezentujemy minimalny deskryptor, który pozwala
    // sprawdzić, że overlay otwiera się poprawnie.
    return {
      substationId: internalStationId,
      name: internalStationId,
      topologicalType: 'końcowa' as const,
      snVoltageKv: 15,
      nnVoltageLevels: [0.4],
      bays: [] as const,
      transformers: [] as const,
      nnSwitchgears: [] as const,
      width: STATION_INTERNAL_WIDTH_PX,
      height: STATION_INTERNAL_HEIGHT_PX,
      onClose: closeInternalStation,
    };
  }, [internalStationId, closeInternalStation]);

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
        sections={sldData.sections}
        cableRuns={sldData.cableRuns}
        stations={sldData.stations}
        ders={sldData.ders}
        connections={[]}
        selectedId={selectedId}
        onSelectElement={handleSelectElement}
        onDoubleClickStation={handleDoubleClickStation}
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
    </div>
  );
}

// Re-eksport typów do użycia w testach.
export type { SldContextMenuRequest, SldElementKindForMenu };
export { COMMAND_FEEDBACK_PL };

export default SldWorkspaceContainer;
