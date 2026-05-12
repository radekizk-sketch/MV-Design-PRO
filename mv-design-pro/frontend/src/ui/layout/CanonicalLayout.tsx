/**
 * CanonicalLayout - aktywny shell V12.5.1.
 *
 * Twarda zasada:
 * - brak starego drzewa projektu w aktywnym shellu,
 * - jeden obszar roboczy,
 * - jeden prawy panel wlasciwosci i powierzchni,
 * - jeden pasek operacyjny.
 */

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import { ActiveCaseBar } from '../active-case-bar';
import { useActiveCaseId, useActiveMode, useIssuePanelOpen } from '../app-state';
import { EmptyInspectorPanel } from '../inspector-panel/EmptyInspectorPanel';
import { IssuePanelContainer } from '../issue-panel';
import { GuidedBuildActionPanel } from '../network-build/GuidedBuildActionPanel';
import { GlobalSearch } from '../network-build/GlobalSearch';
import { InspectorEngineeringView } from '../network-build/InspectorEngineeringView';
import { MassReviewPanel } from '../network-build/mass-review';
import { ProjectMetadataModal } from '../network-build/ProjectMetadataModal';
import { SldVisualModes } from '../network-build/SldVisualModes';
import { SnapshotHistoryModal } from '../network-build/SnapshotHistoryModal';
import { TopContextBar } from '../network-build/TopContextBar';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import { navigateToCaseConfig, navigateToCatalog, navigateToVariants } from '../navigation/routes';
import { useSelectionStore } from '../selection';
import { WorkspaceOperationalBar, WorkspaceSurfaceRouter } from '../workspace';

export interface CanonicalLayoutProps {
  children: ReactNode;
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

export function CanonicalLayout({
  children,
  onCalculate,
  onViewResults,
  projectName,
  inspectorContent,
  validationStatus,
  validationWarnings = 0,
  validationErrors = 0,
  hideInspector = false,
  networkStats,
}: CanonicalLayoutProps) {
  const issuePanelOpen = useIssuePanelOpen();
  const activeCaseId = useActiveCaseId();
  const activeMode = useActiveMode();
  const selectedElement = useSelectionStore((state) => state.selectedElements[0] ?? null);
  const activeSurface = useNetworkBuildStore((state) => state.activeSurface);
  const shouldHideInspector = hideInspector || activeSurface?.screenCode === 'E-37';

  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [massReviewOpen, setMassReviewOpen] = useState(false);
  const [projectMetadataOpen, setProjectMetadataOpen] = useState(false);
  const [snapshotHistoryOpen, setSnapshotHistoryOpen] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        setGlobalSearchOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const isReadOnly = activeMode === 'RESULT_VIEW';
  const mainSurfaceExpanded = activeSurface?.openMode === 'expand_workspace';
  const inspectorWidthClass = useMemo(() => {
    if (inspectorCollapsed) {
      return 'w-10';
    }
    switch (activeSurface?.sizeClass) {
      case 'A':
        return 'w-[420px]';
      case 'B':
        return 'w-[620px]';
      case 'C':
        return 'w-[min(70vw,1100px)]';
      default:
        return 'w-inspector';
    }
  }, [activeSurface, inspectorCollapsed]);

  const toggleInspector = useCallback(() => {
    setInspectorCollapsed((current) => !current);
  }, []);

  const handleChangeCaseClick = useCallback(() => {
    navigateToVariants();
  }, []);

  const handleConfigureClick = useCallback(() => {
    navigateToCaseConfig();
  }, []);

  const handleCalculateClick = useCallback(() => {
    onCalculate?.();
  }, [onCalculate]);

  const handleResultsClick = useCallback(() => {
    onViewResults?.();
  }, [onViewResults]);

  const resolvedInspectorContent = useMemo(() => {
    if (activeSurface && activeSurface.openMode !== 'expand_workspace') {
      return <WorkspaceSurfaceRouter region="panel" />;
    }
    if (activeMode === 'MODEL_EDIT' && !selectedElement) {
      return <GuidedBuildActionPanel />;
    }
    if (inspectorContent) {
      return inspectorContent;
    }
    if (selectedElement) {
      return <InspectorEngineeringView />;
    }
    return (
      <EmptyInspectorPanel
        selectedElement={selectedElement}
        isReadOnly={isReadOnly}
      />
    );
  }, [activeMode, activeSurface, inspectorContent, isReadOnly, selectedElement]);

  const stageClassName = clsx(
    'flex h-full min-h-0 flex-1 overflow-hidden bg-slate-100',
    mainSurfaceExpanded ? 'gap-0 p-0' : 'gap-3 p-3',
  );

  const mainPaneClassName = clsx(
    'flex min-w-0 flex-1 flex-col overflow-hidden',
    mainSurfaceExpanded
      ? 'border-0 bg-transparent shadow-none'
      : 'rounded-xl border border-slate-200 bg-white shadow-sm',
  );

  return (
    <div className="flex h-screen flex-col bg-chrome-100" data-testid="canonical-layout">
      <ActiveCaseBar
        onChangeCaseClick={handleChangeCaseClick}
        onConfigureClick={handleConfigureClick}
        onCalculateClick={handleCalculateClick}
        onResultsClick={handleResultsClick}
      />

      {activeMode === 'MODEL_EDIT' && (
        <TopContextBar
          projectName={projectName}
          caseName={activeCaseId ?? undefined}
          onOpenGlobalSearch={() => setGlobalSearchOpen(true)}
          onOpenCatalogBrowser={navigateToCatalog}
          onOpenMassReview={() => setMassReviewOpen(true)}
          onOpenProjectMetadata={() => setProjectMetadataOpen(true)}
          onOpenSnapshotHistory={() => setSnapshotHistoryOpen(true)}
        />
      )}

      <div className={stageClassName}>
        <section className={mainPaneClassName}>
          {activeMode === 'MODEL_EDIT' && !mainSurfaceExpanded && (
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
              <SldVisualModes />
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-auto" data-testid="main-content">
            {mainSurfaceExpanded ? <WorkspaceSurfaceRouter region="main" /> : children}
          </div>
        </section>

        {!shouldHideInspector && (
          <aside
            className={clsx(
              'flex shrink-0 flex-col overflow-hidden border border-slate-200 bg-white shadow-sm transition-all duration-200 ease-in-out',
              mainSurfaceExpanded ? 'rounded-none border-y-0 border-r-0 shadow-none' : 'rounded-xl',
              inspectorWidthClass,
            )}
            data-testid="inspector-panel-sidebar"
            data-collapsed={inspectorCollapsed}
          >
            <div className="ind-panel-header">
              <button
                type="button"
                onClick={toggleInspector}
                className={clsx(
                  'flex h-6 w-6 items-center justify-center rounded-ind text-chrome-400 transition-colors hover:bg-chrome-200 hover:text-chrome-700',
                  inspectorCollapsed && 'mx-auto',
                )}
                aria-label={inspectorCollapsed ? 'Rozwiń panel właściwości' : 'Zwiń panel właściwości'}
                title={inspectorCollapsed ? 'Rozwiń panel właściwości' : 'Zwiń panel właściwości'}
                data-testid="inspector-panel-toggle"
              >
                {inspectorCollapsed ? <IconChevronLeft /> : <IconChevronRight />}
              </button>
              {!inspectorCollapsed && <span>Inspektor techniczny</span>}
            </div>

            {!inspectorCollapsed && (
              <div className="flex-1 overflow-auto">
                {resolvedInspectorContent}
              </div>
            )}

            {inspectorCollapsed && (
              <div className="flex flex-col items-center gap-2 pt-2" data-testid="inspector-collapsed-icon">
                <button
                  type="button"
                  onClick={toggleInspector}
                  className="flex h-8 w-8 items-center justify-center rounded-ind text-chrome-400 transition-colors hover:bg-chrome-100 hover:text-chrome-700"
                  title="Otwórz panel właściwości"
                  aria-label="Otwórz panel właściwości"
                >
                  <IconClipboard />
                </button>
              </div>
            )}
          </aside>
        )}

        {issuePanelOpen && (
          <aside className="w-inspector shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <IssuePanelContainer caseId={activeCaseId} />
          </aside>
        )}
      </div>

      <WorkspaceOperationalBar
        validationStatus={validationStatus}
        validationWarnings={validationWarnings}
        validationErrors={validationErrors}
        networkStats={networkStats}
      />

      <GlobalSearch isOpen={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />

      <MassReviewPanel isOpen={massReviewOpen} onClose={() => setMassReviewOpen(false)} />

      <ProjectMetadataModal isOpen={projectMetadataOpen} onClose={() => setProjectMetadataOpen(false)} />

      <SnapshotHistoryModal isOpen={snapshotHistoryOpen} onClose={() => setSnapshotHistoryOpen(false)} />
    </div>
  );
}
