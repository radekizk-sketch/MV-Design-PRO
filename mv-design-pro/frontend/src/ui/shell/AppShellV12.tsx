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
 */

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import { useActiveMode, useIssuePanelOpen } from '../app-state';
import { EmptyInspectorPanel } from '../inspector-panel/EmptyInspectorPanel';
import { GlobalSearch } from '../network-build/GlobalSearch';
import { CommandPalette } from '../network-build/CommandPalette';
import { notify } from '../notifications/store';
import { ProjectMetadataModal } from '../network-build/ProjectMetadataModal';
import { SnapshotHistoryModal } from '../network-build/SnapshotHistoryModal';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import { navigateToCatalog } from '../navigation/routes';
import { useSelectionStore } from '../selection';
import { WorkspaceSurfaceRouter } from '../workspace';
import { useAppStateStore } from '../app-state/store';
import type { AreaId } from '../navigation/areaRegistry';

import { UndoRedoButtons } from '../history/UndoRedoButtons';
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
}: {
  areaCode: AreaId;
  collapsed: boolean;
}) {
  if (collapsed) return null;
  return (
    <aside
      data-testid="context-panel"
      data-area={areaCode}
      className="flex w-[280px] shrink-0 flex-col border-r border-scada-border bg-scada-panel"
      style={{ minWidth: 280, maxWidth: 280 }}
    >
      <AreaContextPanel areaCode={areaCode} />
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
  const issuePanelOpen = useIssuePanelOpen();
  const activeMode = useActiveMode();
  const selectedElement = useSelectionStore((state) => state.selectedElements[0] ?? null);
  const activeSurface = useNetworkBuildStore((state) => state.activeSurface);
  const activeArea = useAppStateStore((s) => s.activeArea);

  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [contextCollapsed] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [, setMassReviewOpen] = useState(false);
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
  const mainSurfaceExpanded = activeSurface?.openMode === 'expand_workspace';

  const inspectorWidthClass = useMemo(() => {
    if (inspectorCollapsed) return 'w-10';
    switch (activeSurface?.sizeClass) {
      case 'A': return 'w-[420px]';
      case 'B': return 'w-[620px]';
      case 'C': return 'w-[min(70vw,1100px)]';
      default:  return 'w-[360px]';
    }
  }, [activeSurface, inspectorCollapsed]);

  const toggleInspector = useCallback(() => setInspectorCollapsed((v) => !v), []);

  const resolvedInspectorContent = useMemo(() => {
    if (activeSurface && activeSurface.openMode !== 'expand_workspace') {
      return <WorkspaceSurfaceRouter region="panel" />;
    }
    if (inspectorContent) return inspectorContent;
    return (
      <EmptyInspectorPanel selectedElement={selectedElement} isReadOnly={isReadOnly} />
    );
  }, [activeSurface, inspectorContent, isReadOnly, selectedElement]);

  return (
    <div
      data-testid="canonical-layout"
      data-workspace-shell
      data-v12-shell
      className="flex h-screen flex-col overflow-hidden bg-scada-bg text-scada-text"
    >
      {/* === V12 — sync work-mode → overlay visibility (headless) === */}
      <V12OverlayModeController />
      {/* === Skróty cofnij/ponów (Ctrl+Z/Y) — bezgłowy === */}
      <div className="sr-only" aria-hidden="true"><UndoRedoButtons /></div>

      {/* === TopBar V12 (48px) — kontekst + tryby === */}
      <TopBar
        projectName={projectName}
        onMenuAction={onMenuAction}
        onCalculate={onCalculate}
        onViewResults={onViewResults}
      />

      {/* === Pasek przepływu pracy (48px, tylko MODEL_EDIT) === */}
      {activeMode === 'MODEL_EDIT' && (
        <WorkflowContextStrip
          onOpenGlobalSearch={() => setGlobalSearchOpen(true)}
          onOpenCatalogBrowser={navigateToCatalog}
          onOpenMassReview={() => setMassReviewOpen(true)}
          onOpenProjectMetadata={() => setProjectMetadataOpen(true)}
          onOpenSnapshotHistory={() => setSnapshotHistoryOpen(true)}
        />
      )}

      {/* === Główny układ 4-kolumnowy === */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* NavigationRail (56px) */}
        <NavigationRail />

        {/* ContextPanel (320px, zwijany) */}
        {!mainSurfaceExpanded && (
          <ContextPanelShell areaCode={activeArea} collapsed={contextCollapsed} />
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

        {/* Inspektor (360px, zwijany) */}
        {!hideInspector && (
          <aside
            data-testid="inspector-panel-sidebar"
            data-collapsed={inspectorCollapsed}
            className={clsx(
              'flex shrink-0 flex-col overflow-hidden border-l border-scada-border bg-scada-surface transition-all duration-200 ease-in-out',
              inspectorWidthClass,
            )}
          >
            {/* Nagłówek inspektora */}
            <div className="flex h-8 shrink-0 items-center border-b border-scada-border px-2">
              <button
                type="button"
                onClick={toggleInspector}
                className={clsx(
                  'flex h-6 w-6 items-center justify-center rounded text-scada-muted transition-colors hover:bg-scada-active hover:text-scada-text',
                  inspectorCollapsed && 'mx-auto',
                )}
                aria-label={inspectorCollapsed ? 'Rozwiń Inspektor techniczny' : 'Zwiń Inspektor techniczny'}
                title={inspectorCollapsed ? 'Rozwiń Inspektor techniczny' : 'Zwiń Inspektor techniczny'}
                data-testid="inspector-panel-toggle"
              >
                {inspectorCollapsed ? <IconChevronLeft /> : <IconChevronRight />}
              </button>
              {!inspectorCollapsed && (
                <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-scada-muted">
                  Inspektor techniczny
                </span>
              )}
            </div>

            {/* Treść inspektora */}
            {!inspectorCollapsed && (
              <div className="min-h-0 flex-1 overflow-auto">
                {resolvedInspectorContent}
              </div>
            )}

            {/* Stan zwinięty */}
            {inspectorCollapsed && (
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

        {/* Panel zgłoszeń (issue panel) */}
        {issuePanelOpen && (
          <aside className="w-[360px] shrink-0 overflow-hidden border-l border-scada-border bg-scada-surface">
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
        ]}
      />
      <ProjectMetadataModal isOpen={projectMetadataOpen} onClose={() => setProjectMetadataOpen(false)} />
      <SnapshotHistoryModal isOpen={snapshotHistoryOpen} onClose={() => setSnapshotHistoryOpen(false)} />
    </div>
  );
}
