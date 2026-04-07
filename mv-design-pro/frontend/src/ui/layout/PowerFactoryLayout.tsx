/**
 * PowerFactory Layout — DIgSILENT PowerFactory/ETAP Style Persistent Layout
 *
 * CANONICAL ALIGNMENT:
 * - powerfactory_ui_parity.md: Layout narzędziowy ZAWSZE renderowany
 * - wizard_screens.md § 2.1: Struktura głównego okna
 *
 * POWERFACTORY/ETAP RULE:
 * > Layout narzędziowy ZAWSZE jest renderowany.
 * > Brak danych = komunikat w obszarze roboczym, a NIE brak UI.
 *
 * STRUCTURE (ALWAYS VISIBLE):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  Menu Bar (opcje nawigacji + skróty klawiaturowe)                │
 * ├──────────────────────────────────────────────────────────────────┤
 * │                    Active Case Bar (top)                         │
 * ├──────────┬───────────────────────────────────┬──────────────────┤
 * │          │                                   │                  │
 * │ Nawigator│       SLD Canvas / Content        │    Inspektor     │
 * │ projektu │       (with empty overlay         │    właściwości   │
 * │ (left)   │        if no model)               │    (right)       │
 * │          │                                   │                  │
 * ├──────────┴───────────────────────────────────┴──────────────────┤
 * │                    Pasek stanu (bottom)                          │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * INVARIANTS:
 * - Nawigator projektu: ZAWSZE widoczny (może być zwinięty, ale NIE ukryty)
 * - Obszar roboczy: ZAWSZE widoczny (z overlayem jeśli brak modelu)
 * - Inspektor: ZAWSZE widoczny (pokazuje "Brak zaznaczenia" jeśli nic nie wybrano)
 * - Pasek stanu: ZAWSZE widoczny na dole
 * - Brak "pustych ekranów" — UI ZAWSZE wygląda jak pełnoprawne narzędzie
 *
 * 100% POLISH UI
 */

import { type ReactNode, useCallback, useState, useMemo, useEffect } from 'react';
import { clsx } from 'clsx';
import { MainMenuBar } from '../main-menu';
import { ActiveCaseBar } from '../active-case-bar';
import { StatusBar } from '../status-bar';
import { CaseManager } from '../case-manager';
import { IssuePanelContainer } from '../issue-panel';
import { ProjectTree } from '../project-tree/ProjectTree';
import { EmptyInspectorPanel } from '../inspector-panel/EmptyInspectorPanel';
import { ProcessPanel } from '../network-build/ProcessPanel';
import { OperationFormRouter } from '../network-build/OperationFormRouter';
import { ReadinessBar } from '../network-build/ReadinessBar';
import { InspectorEngineeringView } from '../network-build/InspectorEngineeringView';
import { GlobalSearch } from '../network-build/GlobalSearch';
import { TopContextBar } from '../network-build/TopContextBar';
import { SldVisualModes } from '../network-build/SldVisualModes';
import { MassReviewPanel } from '../network-build/mass-review';
import { CatalogBrowser } from '../network-build/CatalogBrowser';
import { ProjectMetadataModal } from '../network-build/ProjectMetadataModal';
import { SnapshotHistoryModal } from '../network-build/SnapshotHistoryModal';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import {
  useAppStateStore,
  useCaseManagerOpen,
  useIssuePanelOpen,
  useActiveCaseId,
  useActiveMode,
} from '../app-state';
import { useSelectionStore } from '../selection';
import type { TreeNode, TreeNodeType, ElementType } from '../types';

// =============================================================================
// Types
// =============================================================================

interface NetworkElement {
  id: string;
  name: string;
  element_type: string;
  in_service?: boolean;
  branch_type?: 'LINE' | 'CABLE';
}

interface StudyCaseItem {
  id: string;
  name: string;
  result_status: 'NONE' | 'FRESH' | 'OUTDATED';
  is_active: boolean;
}

interface RunHistoryItem {
  run_id: string;
  case_id: string;
  case_name: string;
  snapshot_id: string | null;
  created_at: string;
  status: string;
  result_state: 'NONE' | 'FRESH' | 'OUTDATED';
  solver_kind: string;
  input_hash: string;
}

export interface PowerFactoryLayoutProps {
  children: ReactNode;
  onCalculate?: () => void;
  onViewResults?: () => void;
  projectName?: string;
  treeElements?: {
    buses: NetworkElement[];
    lines: NetworkElement[];
    cables: NetworkElement[];
    transformers: NetworkElement[];
    switches: NetworkElement[];
    sources: NetworkElement[];
    loads: NetworkElement[];
  };
  typeCounts?: {
    lineTypes: number;
    cableTypes: number;
    transformerTypes: number;
    switchEquipmentTypes: number;
  };
  studyCases?: StudyCaseItem[];
  runHistory?: RunHistoryItem[];
  onTreeNodeClick?: (node: TreeNode) => void;
  onTreeCategoryClick?: (nodeType: TreeNodeType, elementType?: ElementType) => void;
  onTreeStudyCaseClick?: (caseId: string) => void;
  onTreeStudyCaseActivate?: (caseId: string) => void;
  onTreeRunClick?: (runId: string) => void;
  inspectorContent?: ReactNode;
  validationStatus?: 'valid' | 'warnings' | 'errors' | null;
  validationWarnings?: number;
  validationErrors?: number;
  hideInspector?: boolean;
  onMenuAction?: (actionId: string) => void;
  networkStats?: { nodeCount?: number; branchCount?: number };
}

// =============================================================================
// Default Props
// =============================================================================

const DEFAULT_TREE_ELEMENTS = {
  buses: [],
  lines: [],
  cables: [],
  transformers: [],
  switches: [],
  sources: [],
  loads: [],
};

const DEFAULT_TYPE_COUNTS = {
  lineTypes: 0,
  cableTypes: 0,
  transformerTypes: 0,
  switchEquipmentTypes: 0,
};

// =============================================================================
// Icons (inline SVG for zero-dependency)
// =============================================================================

function IconChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={clsx('w-4 h-4', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg className={clsx('w-4 h-4', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function IconFolder({ className }: { className?: string }) {
  return (
    <svg className={clsx('w-5 h-5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

function IconClipboard({ className }: { className?: string }) {
  return (
    <svg className={clsx('w-5 h-5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

// =============================================================================
// Component
// =============================================================================

export function PowerFactoryLayout({
  children,
  onCalculate,
  onViewResults,
  projectName = 'Nowy projekt',
  treeElements = DEFAULT_TREE_ELEMENTS,
  typeCounts = DEFAULT_TYPE_COUNTS,
  studyCases = [],
  runHistory = [],
  onTreeNodeClick,
  onTreeCategoryClick,
  onTreeStudyCaseClick,
  onTreeStudyCaseActivate,
  onTreeRunClick,
  inspectorContent,
  validationStatus,
  validationWarnings = 0,
  validationErrors = 0,
  hideInspector = false,
  onMenuAction,
  networkStats,
}: PowerFactoryLayoutProps) {
  // App state
  const caseManagerOpen = useCaseManagerOpen();
  const issuePanelOpen = useIssuePanelOpen();
  const activeCaseId = useActiveCaseId();
  const activeMode = useActiveMode();
  const toggleCaseManager = useAppStateStore((state) => state.toggleCaseManager);
  const toggleIssuePanel = useAppStateStore((state) => state.toggleIssuePanel);
  const setActiveMode = useAppStateStore((state) => state.setActiveMode);

  // Selection state
  const selectedElement = useSelectionStore((state) => state.selectedElements[0] ?? null);

  // Panel states
  const [treeSidebarCollapsed, setTreeSidebarCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [leftPanelMode, setLeftPanelMode] = useState<'build' | 'catalog' | 'tree'>('catalog');

  // Network build store — active operation form
  const activeOperationForm = useNetworkBuildStore((s) => s.activeOperationForm);

  // Modal/overlay states
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [massReviewOpen, setMassReviewOpen] = useState(false);
  const [projectMetadataOpen, setProjectMetadataOpen] = useState(false);
  const [snapshotHistoryOpen, setSnapshotHistoryOpen] = useState(false);

  // Keyboard shortcut: Ctrl+K → Global Search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setGlobalSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Derived state
  const isReadOnly = activeMode === 'RESULT_VIEW';
  const showBuildPanel = activeMode === 'MODEL_EDIT' && leftPanelMode === 'build';
  const showCatalogPanel = activeMode === 'MODEL_EDIT' && leftPanelMode === 'catalog';
  const showTreePanel = activeMode !== 'MODEL_EDIT' || leftPanelMode === 'tree';

  // Toggle handlers
  const toggleTreeSidebar = useCallback(() => {
    setTreeSidebarCollapsed((prev) => !prev);
  }, []);

  const toggleInspector = useCallback(() => {
    setInspectorCollapsed((prev) => !prev);
  }, []);

  const handleOpenCatalogPanel = useCallback(() => {
    setTreeSidebarCollapsed(false);
    setLeftPanelMode('catalog');
  }, []);

  // Action handlers
  const handleChangeCaseClick = useCallback(() => {
    toggleCaseManager(true);
  }, [toggleCaseManager]);

  const handleConfigureClick = useCallback(() => {
    setActiveMode('CASE_CONFIG');
    toggleCaseManager(true);
  }, [setActiveMode, toggleCaseManager]);

  const handleCalculateClick = useCallback(() => {
    if (onCalculate) {
      onCalculate();
    }
  }, [onCalculate]);

  const handleResultsClick = useCallback(() => {
    setActiveMode('RESULT_VIEW');
    if (onViewResults) {
      onViewResults();
    }
  }, [setActiveMode, onViewResults]);

  const handleCaseManagerClose = useCallback(() => {
    toggleCaseManager(false);
  }, [toggleCaseManager]);

  const handleToggleIssuePanel = useCallback(() => {
    toggleIssuePanel();
  }, [toggleIssuePanel]);

  const handleOpenIssuePanel = useCallback(() => {
    toggleIssuePanel(true);
  }, [toggleIssuePanel]);

  // Inspector content - show operation form, engineering inspector, custom content, or empty state
  const resolvedInspectorContent = useMemo(() => {
    // When an operation form is active, show it in the inspector area
    if (activeOperationForm) {
      return <OperationFormRouter />;
    }
    // When element selected in MODEL_EDIT, show engineering inspector
    if (activeMode === 'MODEL_EDIT' && selectedElement) {
      return <InspectorEngineeringView />;
    }
    if (inspectorContent) {
      return inspectorContent;
    }
    return (
      <EmptyInspectorPanel
        selectedElement={selectedElement}
        isReadOnly={isReadOnly}
      />
    );
  }, [activeOperationForm, inspectorContent, selectedElement, isReadOnly]);

  return (
    <div
      className="flex flex-col h-screen bg-chrome-100"
      data-testid="powerfactory-layout"
    >
      {/* Menu główne (ALWAYS visible at top) */}
      <MainMenuBar onAction={onMenuAction} />

      {/* Pasek aktywnego przypadku (ALWAYS visible) */}
      <ActiveCaseBar
        onChangeCaseClick={handleChangeCaseClick}
        onConfigureClick={handleConfigureClick}
        onCalculateClick={handleCalculateClick}
        onResultsClick={handleResultsClick}
      />

      {/* TopContextBar — kontekstowy pasek z fazą budowy + quick actions */}
      {activeMode === 'MODEL_EDIT' && (
        <TopContextBar
          projectName={projectName}
          caseName={activeCaseId ?? undefined}
          onOpenGlobalSearch={() => setGlobalSearchOpen(true)}
          onOpenCatalogBrowser={handleOpenCatalogPanel}
          onOpenMassReview={() => setMassReviewOpen(true)}
          onOpenProjectMetadata={() => setProjectMetadataOpen(true)}
          onOpenSnapshotHistory={() => setSnapshotHistoryOpen(true)}
          onRunAnalysis={handleCalculateClick}
          onOpenResults={handleResultsClick}
          onToggleIssuePanel={handleToggleIssuePanel}
          issuePanelOpen={issuePanelOpen}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden flex">
        {/* ================================================================
         *  Nawigator projektu (ALWAYS visible, collapsible)
         * ================================================================ */}
        <div
          className={clsx(
            'flex-shrink-0 bg-white border-r border-chrome-200 shadow-panel',
            'transition-all duration-200 ease-in-out overflow-hidden flex flex-col',
            treeSidebarCollapsed ? 'w-11' : 'w-tree'
          )}
          data-testid="project-tree-sidebar"
          data-collapsed={treeSidebarCollapsed}
        >
          {/* Panel header with mode toggle */}
          <div className="ind-panel-header">
            {!treeSidebarCollapsed && (
              <div className="flex items-center gap-1">
                {activeMode === 'MODEL_EDIT' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setLeftPanelMode('build')}
                      className={clsx(
                        'px-2 py-0.5 text-[10px] rounded-sm transition-colors',
                        leftPanelMode === 'build'
                          ? 'bg-ind-100 text-ind-800 font-medium'
                          : 'text-chrome-500 hover:bg-chrome-100',
                      )}
                      data-testid="left-panel-mode-build"
                    >
                      Budowa
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeftPanelMode('catalog')}
                      className={clsx(
                        'px-2 py-0.5 text-[10px] rounded-sm transition-colors',
                        leftPanelMode === 'catalog'
                          ? 'bg-ind-100 text-ind-800 font-medium'
                          : 'text-chrome-500 hover:bg-chrome-100',
                      )}
                      data-testid="left-panel-mode-catalog"
                    >
                      Katalogi
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeftPanelMode('tree')}
                      className={clsx(
                        'px-2 py-0.5 text-[10px] rounded-sm transition-colors',
                        leftPanelMode === 'tree'
                          ? 'bg-ind-100 text-ind-800 font-medium'
                          : 'text-chrome-500 hover:bg-chrome-100',
                      )}
                      data-testid="left-panel-mode-tree"
                    >
                      Nawigator
                    </button>
                  </>
                )}
                {activeMode !== 'MODEL_EDIT' && (
                  <span>Nawigator projektu</span>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={toggleTreeSidebar}
              className={clsx(
                'flex h-6 w-6 items-center justify-center rounded-ind',
                'text-chrome-400 hover:bg-chrome-200 hover:text-chrome-700',
                'transition-colors',
                treeSidebarCollapsed && 'mx-auto'
              )}
              aria-label={treeSidebarCollapsed ? 'Rozwiń panel boczny' : 'Zwiń panel boczny'}
              title={treeSidebarCollapsed ? 'Rozwiń panel boczny' : 'Zwiń panel boczny'}
              data-testid="project-tree-sidebar-toggle"
            >
              {treeSidebarCollapsed ? <IconChevronRight /> : <IconChevronLeft />}
            </button>
          </div>

          {/* Panel content: ProcessPanel or ProjectTree (only when not collapsed) */}
          {!treeSidebarCollapsed && showBuildPanel && (
            <div className="flex-1 overflow-hidden">
              <ProcessPanel />
            </div>
          )}
          {!treeSidebarCollapsed && showCatalogPanel && (
            <div className="flex-1 overflow-hidden border-t border-chrome-100">
              <CatalogBrowser className="h-full" mode="browse" />
            </div>
          )}
          {!treeSidebarCollapsed && showTreePanel && (
            <div className="flex-1 overflow-hidden">
              <ProjectTree
                projectName={projectName}
                elements={treeElements}
                typeCounts={typeCounts}
                studyCases={studyCases}
                runHistory={runHistory}
                onCatalogBrowse={() => handleOpenCatalogPanel()}
                onNodeClick={onTreeNodeClick}
                onCategoryClick={onTreeCategoryClick}
                onStudyCaseClick={onTreeStudyCaseClick}
                onStudyCaseActivate={onTreeStudyCaseActivate}
                onRunClick={onTreeRunClick}
              />
            </div>
          )}

          {/* Collapsed state icons */}
          {treeSidebarCollapsed && (
            <div className="flex flex-col items-center gap-2 pt-2" data-testid="project-tree-collapsed-icons">
              <button
                type="button"
                onClick={toggleTreeSidebar}
                className="flex h-8 w-8 items-center justify-center rounded-ind text-chrome-400 hover:bg-chrome-100 hover:text-chrome-700 transition-colors"
                title={
                  showBuildPanel
                    ? 'Panel budowy sieci'
                    : showCatalogPanel
                    ? 'Panel katalogów'
                    : 'Nawigator projektu'
                }
                aria-label={
                  showBuildPanel
                    ? 'Otwórz panel budowy sieci'
                    : showCatalogPanel
                    ? 'Otwórz panel katalogów'
                    : 'Otwórz nawigator projektu'
                }
              >
                <IconFolder />
              </button>
            </div>
          )}
        </div>

        {/* ================================================================
         *  Obszar roboczy (SLD Canvas / Page Content)
         * ================================================================ */}
        <div className="flex-1 overflow-auto bg-canvas-bg flex flex-col" data-testid="main-content">
          {/* SLD Visual Modes toolbar */}
          {activeMode === 'MODEL_EDIT' && (
            <SldVisualModes className="flex-shrink-0 mx-2 mt-1" />
          )}
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </div>

        {/* ================================================================
         *  Inspektor właściwości (ALWAYS visible, collapsible)
         * ================================================================ */}
        {!hideInspector && (
          <div
            className={clsx(
              'flex-shrink-0 bg-white border-l border-chrome-200 shadow-panel',
              'transition-all duration-200 ease-in-out overflow-hidden flex flex-col',
              inspectorCollapsed ? 'w-10' : 'w-inspector'
            )}
            data-testid="inspector-panel-sidebar"
            data-collapsed={inspectorCollapsed}
          >
            {/* Inspector header */}
            <div className="ind-panel-header">
              <button
                type="button"
                onClick={toggleInspector}
                className={clsx(
                  'flex h-6 w-6 items-center justify-center rounded-ind',
                  'text-chrome-400 hover:bg-chrome-200 hover:text-chrome-700',
                  'transition-colors',
                  inspectorCollapsed && 'mx-auto'
                )}
                aria-label={inspectorCollapsed ? 'Rozwiń inspektor właściwości' : 'Zwiń inspektor właściwości'}
                title={inspectorCollapsed ? 'Rozwiń inspektor właściwości' : 'Zwiń inspektor właściwości'}
                data-testid="inspector-panel-toggle"
              >
                {inspectorCollapsed ? <IconChevronLeft /> : <IconChevronRight />}
              </button>
              {!inspectorCollapsed && (
                <span>Właściwości</span>
              )}
            </div>

            {/* Inspector content (only when not collapsed) */}
            {!inspectorCollapsed && (
              <div className="flex-1 overflow-auto">
                {resolvedInspectorContent}
              </div>
            )}

            {/* Collapsed state icon */}
            {inspectorCollapsed && (
              <div className="flex flex-col items-center gap-2 pt-2" data-testid="inspector-collapsed-icon">
                <button
                  type="button"
                  onClick={toggleInspector}
                  className="flex h-8 w-8 items-center justify-center rounded-ind text-chrome-400 hover:bg-chrome-100 hover:text-chrome-700 transition-colors"
                  title="Inspektor właściwości"
                  aria-label="Otwórz inspektor właściwości"
                >
                  <IconClipboard />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Issue Panel (right sidebar, conditional) */}
        {issuePanelOpen && (
          <div className="w-inspector border-l border-chrome-200 bg-white overflow-hidden flex-shrink-0 shadow-panel">
            <IssuePanelContainer caseId={activeCaseId} />
          </div>
        )}

        {/* Case Manager Panel (slide-in from right) */}
        <CaseManagerPanel
          open={caseManagerOpen}
          onClose={handleCaseManagerClose}
          onCalculate={onCalculate}
          onViewResults={onViewResults}
        />
      </div>

      {/* Pasek gotowości (MODEL_EDIT only) */}
      {activeMode === 'MODEL_EDIT' && (
        <ReadinessBar
          onRunAnalysis={handleCalculateClick}
          onOpenResults={handleResultsClick}
          onOpenIssuePanel={handleOpenIssuePanel}
        />
      )}

      {/* Pasek stanu (ALWAYS visible at bottom) */}
      <StatusBar
        validationStatus={validationStatus}
        validationWarnings={validationWarnings}
        validationErrors={validationErrors}
        networkStats={networkStats}
      />

      {/* Global Search overlay (Ctrl+K) */}
      <GlobalSearch
        isOpen={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
      />

      {/* Mass Review Panel */}
      <MassReviewPanel
        isOpen={massReviewOpen}
        onClose={() => setMassReviewOpen(false)}
      />

      {/* Project Metadata Modal */}
      <ProjectMetadataModal
        isOpen={projectMetadataOpen}
        onClose={() => setProjectMetadataOpen(false)}
      />

      {/* Snapshot History Modal */}
      <SnapshotHistoryModal
        isOpen={snapshotHistoryOpen}
        onClose={() => setSnapshotHistoryOpen(false)}
      />
    </div>
  );
}

// =============================================================================
// Case Manager Panel Sub-component
// =============================================================================

interface CaseManagerPanelProps {
  open: boolean;
  onClose: () => void;
  onCalculate?: () => void;
  onViewResults?: () => void;
}

function CaseManagerPanel({
  open,
  onClose,
  onCalculate,
  onViewResults,
}: CaseManagerPanelProps) {
  const handleCaseSelected = useCallback(
    (_caseId: string) => {
      // Case selection is handled in CaseManager
    },
    []
  );

  const handleCalculate = useCallback(
    (_caseId: string) => {
      onClose();
      if (onCalculate) {
        onCalculate();
      }
    },
    [onClose, onCalculate]
  );

  const handleViewResults = useCallback(
    (_caseId: string) => {
      onClose();
      if (onViewResults) {
        onViewResults();
      }
    },
    [onClose, onViewResults]
  );

  // ESC key closes Case Manager
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          data-testid="case-manager-backdrop"
          className="absolute inset-0 bg-black/25 z-20 backdrop-blur-[1px]"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        data-testid="case-manager-panel"
        data-open={open}
        className={clsx(
          'absolute top-0 right-0 h-full w-[480px] bg-white shadow-modal z-30',
          'transform transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {open && (
          <CaseManager
            onClose={onClose}
            onCaseSelected={handleCaseSelected}
            onCalculate={handleCalculate}
            onViewResults={handleViewResults}
          />
        )}
      </div>
    </>
  );
}

export default PowerFactoryLayout;
