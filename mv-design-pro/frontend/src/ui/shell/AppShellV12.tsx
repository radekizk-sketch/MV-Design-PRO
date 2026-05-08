/**
 * AppShellV12 — główny shell MV-DESIGN-PRO V12.xx
 *
 * Architektura 4-kolumnowa:
 *   Pasek obszarów roboczych
 *   Panel kontekstu obszaru
 *   Kanwa schematu jednokreskowego
 *   Inspektor techniczny
 *   [28px]  StatusBarV12    — dolny pasek statusu
 *
 * Tryby (TE/TW/TZ/TP/TA/TN) ZMIENIAJĄ nakładki i inspektor — geometria SLD stała.
 *
 * BACKWARD COMPATIBILITY:
 * - data-testid="canonical-layout" zachowany (App.routes.test.tsx)
 * - data-testid="main-content" zachowany (testy layoutu)
 * - data-testid="inspector-panel-sidebar" zachowany (testy layoutu)
 * - Propsinterface identyczny z CanonicalLayoutProps
 *
 * R55 CANONICAL TEST IDs (nowe):
 * - data-testid="workspace-shell"         — korzeń całego shella
 * - data-testid="workspace-topbar"        — pasek górny
 * - data-testid="left-panel"              — panel lewy (kontekst obszaru)
 * - data-testid="left-panel-collapse"     — przycisk zwijania lewego panelu
 * - data-testid="right-panel"             — panel prawy (inspektor techniczny)
 * - data-testid="right-panel-collapse"    — alias inspector-panel-toggle
 * - data-testid="right-panel-resize-handle" — uchwyt zmiany szerokości prawego panelu
 */

import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';

import { useActiveMode } from '../app-state';
import { EmptyInspectorPanel } from '../inspector-panel/EmptyInspectorPanel';
import { GlobalSearch } from '../network-build/GlobalSearch';
import { CommandPalette } from '../network-build/CommandPalette';
import { notify } from '../notifications/store';
import { ProjectMetadataModal } from '../network-build/ProjectMetadataModal';
import { SnapshotHistoryModal } from '../network-build/SnapshotHistoryModal';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import { useSelectionStore } from '../selection';
import { WorkspaceSurfaceRouter } from '../workspace';
import { useAppStateStore } from '../app-state/store';
import { useWorkspaceLayoutStore } from '../workspace/workspaceLayoutStore';
import type { AreaId } from '../navigation/areaRegistry';

import { NavigationRail } from './NavigationRail';
import { TopBar } from './TopBar';
import { StatusBarV12 } from './StatusBarV12';
import { V12OverlayModeController } from './V12OverlayModeController';
import { AreaContextPanel } from './context-panels';
import { WorkflowContextStrip } from './WorkflowContextStrip';

export interface AppShellV12Props {
  children?: ReactNode;
  onCalculate?: () => void;
  onViewResults?: () => void;
  projectName?: string;
  inspectorContent?: ReactNode;
  validationStatus?: 'valid' | 'warnings' | 'errors' | null;
  validationWarnings?: number;
  validationErrors?: number;
  hideInspector?: boolean;
  onMenuAction?: (actionId: string) => void;
  networkStats?: { nodeCount?: number; branchCount?: number };
}

function IconChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-4 w-4', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-4 w-4', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function IconClipboard({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-5 w-5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

/**
 * Wrapper panelu kontekstu obszaru.
 */
function ContextPanelShell({
  areaCode,
  collapsed,
  width,
  onCollapse,
}: {
  areaCode: AreaId;
  collapsed: boolean;
  width: number;
  onCollapse: () => void;
}) {
  return (
    <aside
      data-testid="left-panel"
      data-area={areaCode}
      data-collapsed={collapsed}
      className={clsx(
        'flex shrink-0 flex-col border-r border-scada-border bg-scada-panel transition-all duration-200 ease-in-out',
        collapsed ? 'w-10' : '',
      )}
      style={collapsed ? undefined : { width, minWidth: 220, maxWidth: 480 }}
    >
      {/* Nagłówek lewego panelu */}
      <div className="flex h-8 shrink-0 items-center border-b border-scada-border px-2">
        <button
          type="button"
          onClick={onCollapse}
          data-testid="left-panel-collapse"
          aria-label={collapsed ? 'Rozwiń panel kontekstu' : 'Zwiń panel kontekstu'}
          title={collapsed ? 'Rozwiń panel kontekstu' : 'Zwiń panel kontekstu'}
          className={clsx(
            'flex h-6 w-6 items-center justify-center rounded text-scada-muted transition-colors hover:bg-scada-active hover:text-scada-text',
            collapsed && 'mx-auto',
          )}
        >
          {collapsed ? (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          )}
        </button>
        {!collapsed && (
          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-scada-muted">
            Panel kontekstu
          </span>
        )}
      </div>

      {!collapsed && <AreaContextPanel areaCode={areaCode} />}
    </aside>
  );
}

export function AppShellV12({
  children,
  onCalculate,
  onViewResults,
  projectName,
  inspectorContent,
  validationStatus,
  validationWarnings = 0,
  validationErrors = 0,
  hideInspector = false,
  onMenuAction,
  networkStats,
}: AppShellV12Props) {
  const activeMode = useActiveMode();
  const selectedElement = useSelectionStore((state) => state.selectedElements[0] ?? null);
  const activeSurface = useNetworkBuildStore((state) => state.activeSurface);
  const activeArea = useAppStateStore((s) => s.activeArea);

  // R55: layout state z persystowanego store (leftCollapsed, rightCollapsed, rightWidth, leftWidth)
  const leftCollapsed = useWorkspaceLayoutStore((s) => s.leftCollapsed);
  const rightCollapsed = useWorkspaceLayoutStore((s) => s.rightCollapsed);
  const storedLeftWidth = useWorkspaceLayoutStore((s) => s.leftWidth);
  const storedRightWidth = useWorkspaceLayoutStore((s) => s.rightWidth);
  const setLeftCollapsed = useWorkspaceLayoutStore((s) => s.setLeftCollapsed);
  const setRightCollapsed = useWorkspaceLayoutStore((s) => s.setRightCollapsed);
  const setRightWidth = useWorkspaceLayoutStore((s) => s.setRightWidth);

  // Uchwyt resize prawego panelu (drag)
  const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [projectMetadataOpen, setProjectMetadataOpen] = useState(false);
  const [snapshotHistoryOpen, setSnapshotHistoryOpen] = useState(false);

  // Ctrl+K = globalne wyszukiwanie ENM
  // Ctrl+Shift+P = paleta komend (ekrany + akcje SLD + skróty)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.shiftKey && (event.key === 'P' || event.key === 'p')) {
        event.preventDefault();
        setCommandPaletteOpen((v) => !v);
        return;
      }
      if (meta && event.key === 'k') {
        event.preventDefault();
        setGlobalSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Komendy z palety publikują custom event z informacją (np. wymagany kontekst).
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === 'string' && detail.length > 0) {
        notify(detail, 'info');
      }
    };
    window.addEventListener('mvdesignpro:command-palette-info', listener);
    return () => window.removeEventListener('mvdesignpro:command-palette-info', listener);
  }, []);

  const isReadOnly = activeMode === 'RESULT_VIEW';
  // sizeClass C surfaces expand to full workspace automatically (avoids narrow-panel crush)
  const mainSurfaceExpanded =
    activeSurface?.openMode === 'expand_workspace' || activeSurface?.sizeClass === 'C';

  // Szerokość inspektora: sizeClass override gdy surface aktywny, inaczej store
  const inspectorWidthStyle = useMemo<CSSProperties>(() => {
    if (rightCollapsed) return { width: 40 };
    switch (activeSurface?.sizeClass) {
      case 'A': return { width: 420 };
      case 'B': return { width: 620 };
      case 'C': return { width: storedRightWidth }; // sizeClass C renders in main, not panel
      default:  return { width: storedRightWidth };
    }
  }, [activeSurface, rightCollapsed, storedRightWidth]);

  const toggleInspector = useCallback(() => setRightCollapsed(!rightCollapsed), [rightCollapsed, setRightCollapsed]);
  const toggleLeftPanel = useCallback(() => setLeftCollapsed(!leftCollapsed), [leftCollapsed, setLeftCollapsed]);

  // Drag resize prawego panelu — zmienia szerokość od lewej krawędzi
  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    resizeDragRef.current = { startX: e.clientX, startWidth: storedRightWidth };
    const onMove = (ev: PointerEvent) => {
      if (!resizeDragRef.current) return;
      const delta = resizeDragRef.current.startX - ev.clientX;
      setRightWidth(resizeDragRef.current.startWidth + delta);
    };
    const onUp = () => {
      resizeDragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [storedRightWidth, setRightWidth]);

  const resolvedInspectorContent = useMemo(() => {
    if (activeSurface && !mainSurfaceExpanded) {
      return <WorkspaceSurfaceRouter region="panel" />;
    }
    if (inspectorContent) return inspectorContent;
    return (
      <EmptyInspectorPanel selectedElement={selectedElement} isReadOnly={isReadOnly} />
    );
  }, [activeSurface, mainSurfaceExpanded, inspectorContent, isReadOnly, selectedElement]);


  return (
    <div
      data-testid="workspace-shell"
      data-testid-alias="canonical-layout"
      data-workspace-shell
      data-v12-shell
      className="flex h-screen flex-col overflow-hidden bg-scada-bg text-scada-text"
    >
      {/* === V12 — sync work-mode → overlay visibility (headless) === */}
      <V12OverlayModeController />

      {/* === TopBar V12 (70px) — kontekst + tryby + cofnij/ponów === */}
      <div data-testid="workspace-topbar">
        <TopBar
          projectName={projectName}
          onMenuAction={onMenuAction}
          onCalculate={onCalculate}
          onViewResults={onViewResults}
        />
      </div>

      {/* === Pasek metryk modelu (36px, tylko MODEL_EDIT) === */}
      {activeMode === 'MODEL_EDIT' && <WorkflowContextStrip />}

      {/* === Główny układ 4-kolumnowy === */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* NavigationRail (56px) */}
        <NavigationRail />

        {/* ContextPanel (lewy, zwijany) */}
        {!mainSurfaceExpanded && (
          <ContextPanelShell
            areaCode={activeArea}
            collapsed={leftCollapsed}
            width={storedLeftWidth}
            onCollapse={toggleLeftPanel}
          />
        )}

        {/* Kanwas SLD — elastyczny */}
        <section
          className={clsx(
            'flex min-w-0 flex-1 flex-col overflow-hidden',
            mainSurfaceExpanded
              ? 'border-0 bg-transparent'
              : 'border-r border-scada-border bg-scada-bg',
          )}
        >
          {/* Tryby wizualne SLD (MODEL_EDIT) */}
          {activeMode === 'MODEL_EDIT' && !mainSurfaceExpanded && (
            <div className="flex h-[40px] shrink-0 items-center border-b border-scada-border bg-[#0a151e] px-2">
            </div>
          )}

          {/* Obszar roboczy */}
          <div
            className="min-h-0 flex-1 overflow-auto"
            data-testid="main-content"
          >
            {mainSurfaceExpanded ? <WorkspaceSurfaceRouter region="main" /> : children}
          </div>
        </section>

        {/* Inspektor (prawy, zwijany, z uchwytem zmiany szerokości) */}
        {!hideInspector && (
          <aside
            data-testid="right-panel"
            data-testid-alias="inspector-panel-sidebar"
            data-collapsed={rightCollapsed}
            className="flex shrink-0 flex-col overflow-hidden border-l border-scada-border bg-scada-surface transition-all duration-200 ease-in-out"
            style={inspectorWidthStyle}
          >
            {/* Uchwyt zmiany szerokości (drag od lewej krawędzi) */}
            {!rightCollapsed && (
              <div
                data-testid="right-panel-resize-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label="Zmień szerokość inspektora"
                className="absolute -left-0.5 top-0 z-10 h-full w-1 cursor-col-resize opacity-0 hover:opacity-100 hover:bg-scada-accent/40"
                onPointerDown={handleResizePointerDown}
              />
            )}

            {/* Nagłówek inspektora */}
            <div className="flex h-8 shrink-0 items-center border-b border-scada-border px-2">
              <button
                type="button"
                onClick={toggleInspector}
                className={clsx(
                  'flex h-6 w-6 items-center justify-center rounded text-scada-muted transition-colors hover:bg-scada-active hover:text-scada-text',
                  rightCollapsed && 'mx-auto',
                )}
                aria-label={rightCollapsed ? 'Rozwiń Inspektor techniczny' : 'Zwiń Inspektor techniczny'}
                title={rightCollapsed ? 'Rozwiń Inspektor techniczny' : 'Zwiń Inspektor techniczny'}
                data-testid="right-panel-collapse"
              >
                {rightCollapsed ? <IconChevronLeft /> : <IconChevronRight />}
              </button>
              {!rightCollapsed && (
                <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-scada-muted">
                  Inspektor techniczny
                </span>
              )}
            </div>

            {/* Treść inspektora */}
            {!rightCollapsed && (
              <div className="min-h-0 flex-1 overflow-auto">
                {resolvedInspectorContent}
              </div>
            )}

            {/* Stan zwinięty */}
            {rightCollapsed && (
              <div
                className="flex flex-col items-center gap-2 pt-2"
                data-testid="inspector-collapsed-icon"
              >
                <button
                  type="button"
                  onClick={toggleInspector}
                  className="flex h-8 w-8 items-center justify-center rounded text-scada-muted transition-colors hover:bg-scada-active hover:text-scada-text"
                  title="Otwórz Inspektor techniczny"
                  aria-label="Otwórz Inspektor techniczny"
                >
                  <IconClipboard />
                </button>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* === StatusBarV12 (28px) === */}
      <StatusBarV12
        validationStatus={validationStatus}
        validationWarnings={validationWarnings}
        validationErrors={validationErrors}
        networkStats={networkStats}
      />

      {/* Modale */}
      <GlobalSearch isOpen={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        extraCommands={[
          {
            id: 'shortcut:open-enm-inspector',
            label: 'Otwórz Inspektor modelu ENM',
            description: 'Diagnostyka inżynierska modelu sieci.',
            keywords: 'enm inspektor diagnostyka modelu sieci',
            run: () => {
              window.location.hash = '#enm-inspector';
              setCommandPaletteOpen(false);
            },
          },
          {
            id: 'shortcut:open-fault-scenarios',
            label: 'Scenariusze zwarciowe',
            description: 'Zarządzaj scenariuszami zwarć i analiz.',
            keywords: 'fault scenariusze zwarciowe zwarcia analizy',
            run: () => {
              window.location.hash = '#fault-scenarios';
              setCommandPaletteOpen(false);
            },
          },
          {
            id: 'shortcut:open-dashboard',
            label: 'Pulpit projektu',
            description: 'Lista projektów + nowy projekt (E-00).',
            keywords: 'pulpit dashboard projekt lista nowy',
            run: () => {
              window.location.hash = '#dashboard';
              setCommandPaletteOpen(false);
            },
          },
          {
            id: 'shortcut:open-project-metadata',
            label: 'Metadane projektu',
            description: 'Edytuj metadane: nazwa, opis, klient, nr umowy.',
            keywords: 'metadane projekt opis klient umowa',
            run: () => {
              setCommandPaletteOpen(false);
              setProjectMetadataOpen(true);
            },
          },
          {
            id: 'shortcut:open-snapshot-history',
            label: 'Historia migawek modelu',
            description: 'Przeglądaj i przywracaj poprzednie wersje modelu ENM.',
            keywords: 'historia migawki wersje model enm cofnij przywróć',
            run: () => {
              setCommandPaletteOpen(false);
              setSnapshotHistoryOpen(true);
            },
          },
        ]}
      />
      <ProjectMetadataModal isOpen={projectMetadataOpen} onClose={() => setProjectMetadataOpen(false)} />
      <SnapshotHistoryModal isOpen={snapshotHistoryOpen} onClose={() => setSnapshotHistoryOpen(false)} />
    </div>
  );
}
