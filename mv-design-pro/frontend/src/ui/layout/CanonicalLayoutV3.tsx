/**
 * CanonicalLayoutV3 — Redesign v3 shella MV-DESIGN-PRO.
 *
 * ZMIANY WZGLEDEM V12.5.1 (CanonicalLayout):
 * ──────────────────────────────────────────────
 * 1. CHROME REDUCTION: 146px → 76px (-48%)
 *    - ActiveCaseBar + TopContextBar MERGED → single TopBarV3 (48px)
 *    - WorkflowContextStrip REMOVED — metryki przeniesione do TopBarV3
 *    - StatusBar: 28px (deduplicated — bez powtórzenia projektu/zakresu)
 *
 * 2. NAVIGATION:
 *    - NavigationRail: collapsible 56px → 220px on hover/pin
 *    - Grupowanie: Budowa | Analiza | Dokumenty (separatory)
 *    - Ctrl+B toggle context panel, Ctrl+Shift+B toggle inspector
 *
 * 3. CONTEXT PANEL:
 *    - Szerokość: 280px → 320px
 *    - Karta gotowości z sparkline metrykami
 *    - Przycisk dodawania w pustych sekcjach drzewa
 *
 * 4. INSPECTOR:
 *    - Empty state: GuidedBuildActionPanel (stepper) zamiast pustych "—"
 *    - Domyślna szerokość: 320px → 340px
 *
 * 5. HIERARCHY AKCJI:
 *    - Primary: Oblicz (#00ffaa, shadow glow)
 *    - Secondary: Analizy (outline #00d4ff)
 *    - Ghost: Eksport, Ustawienia (border only)
 *
 * BACKWARD COMPATIBILITY:
 * - data-testid="canonical-layout" zachowany
 * - data-testid="main-content" zachowany
 * - data-testid="inspector-panel-sidebar" zachowany
 * - PropsInterface identyczny (CanonicalLayoutProps)
 * - Fallback: CanonicalLayout exportowany jako alias
 */

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import { useActiveMode } from '../app-state';
import { useAppStateStore, useCanCalculate } from '../app-state/store';
import { EmptyInspectorPanel } from '../inspector-panel/EmptyInspectorPanel';
import { GuidedBuildActionPanel } from '../network-build/GuidedBuildActionPanel';
import { GlobalSearch } from '../network-build/GlobalSearch';
import { CommandPalette } from '../network-build/CommandPalette';
import { InspectorEngineeringView } from '../network-build/InspectorEngineeringView';
import { ProjectMetadataModal } from '../network-build/ProjectMetadataModal';
import { SnapshotHistoryModal } from '../network-build/SnapshotHistoryModal';
import { useNetworkBuildStore, useNetworkBuildDerived } from '../network-build/networkBuildStore';
import {
  navigateToAnalysis,
  navigateToCatalog,
  navigateToReport,
  navigateToSld,
  navigateToVariants,
} from '../navigation/routes';
import { useSelectionStore } from '../selection';
import { WorkspaceSurfaceRouter } from '../workspace';
import { UndoRedoButtons } from '../history/UndoRedoButtons';
import { V12OverlayModeController } from '../shell/V12OverlayModeController';
import { StatusBarV12 } from '../shell/StatusBarV12';
import { AreaContextPanel } from '../shell/context-panels';
import { AREA_DEFINITIONS, type AreaId } from '../navigation/areaRegistry';
import { TechnicalIcon } from '../icons/technicalIconRegistry';
import { useSnapshotStore } from '../topology/snapshotStore';
import type { ResultStatus } from '../types';
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconClipboard,
  IconPlay,
  IconSearch,
  IconGear,
} from '../icons/shellIcons';
import {
  projectDisplayName as sharedProjectDisplayName,
} from '../shell/displayHelpers';

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Constants
// =============================================================================

/** Navigation area groups for visual separation. */
const NAV_GROUPS = [
  { id: 'build' as const, label: 'Budowa', areas: ['MODEL_SIECI', 'SCHEMAT_TOPOLOGIA', 'ZRODLA_PRZYLACZENIA'] },
  { id: 'analyze' as const, label: 'Analiza', areas: ['STUDIA_OBLICZENIOWE', 'WYNIKI_ANALIZY', 'ZABEZPIECZENIA_AUTOMATYKA'] },
  { id: 'docs' as const, label: 'Dokumenty', areas: ['KATALOGI_TECHNICZNE', 'RAPORTY_UZASADNIENIA', 'HISTORIA_AUDYT'] },
] as const;

const RESULT_STATUS_CHIP: Record<ResultStatus, { label: string; className: string; dotClassName: string }> = {
  NONE: {
    label: 'Brak wyników',
    className: 'border-scada-border bg-scada-surface text-scada-muted',
    dotClassName: 'border border-scada-muted',
  },
  FRESH: {
    label: 'Aktualne',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    dotClassName: 'bg-emerald-400',
  },
  OUTDATED: {
    label: 'Nieaktualne',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    dotClassName: 'bg-amber-400',
  },
};

// =============================================================================
// Utility
// =============================================================================

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

// looksLikeTechnicalId + projectDisplayName promovane do `shell/displayHelpers.ts`.
const projectDisplayName = sharedProjectDisplayName;

// Icons imported from shared `../icons/shellIcons`

// =============================================================================
// TopBarV3 — Merged 48px header (replaces ActiveCaseBar + TopContextBar + WorkflowStrip)
// =============================================================================

interface TopBarV3Props {
  projectName?: string;
  onCalculate?: () => void;
  onViewResults?: () => void;
  onMenuAction?: (actionId: string) => void;
}

function TopBarV3({ projectName, onCalculate, onViewResults, onMenuAction }: TopBarV3Props) {
  const activeProjectName = useAppStateStore((s) => s.activeProjectName);
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const activeCaseName = useAppStateStore((s) => s.activeCaseName);
  const resultStatus = useAppStateStore((s) => s.activeCaseResultStatus);
  const { allowed: canCalculate, reason: blockedReason } = useCanCalculate();
  const { isReady } = useNetworkBuildDerived();

  const displayName = projectDisplayName(activeProjectName || projectName, activeProjectId);
  const scopeLabel = activeCaseName || '— skonfiguruj zakres —';
  const statusConfig = RESULT_STATUS_CHIP[resultStatus];

  const readinessChip = isReady
    ? { label: 'Gotowe', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' }
    : { label: 'Budowa', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-200', dot: 'bg-amber-400' };

  const handleCalculate = useCallback(() => {
    if (!canCalculate) {
      onMenuAction?.('readiness');
      return;
    }
    onCalculate?.();
  }, [canCalculate, onCalculate, onMenuAction]);

  return (
    <header
      data-testid="top-bar-v3"
      className="flex h-12 shrink-0 items-center border-b border-[#12202e] bg-[#060c16] px-3 gap-3 select-none"
    >
      {/* Brand + context block */}
      <button
        type="button"
        onClick={() => navigateToVariants()}
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-1 -ml-1 transition-colors hover:bg-[#0b1725]"
        data-testid="ctx-project"
      >
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#00d4ff10] border border-[#00d4ff20]">
          <span className="font-mono-eng text-sm font-extrabold text-[#00d4ff]">M</span>
        </div>
        <div className="text-left min-w-0">
          <div className="truncate text-xs font-semibold text-scada-text max-w-[160px]">{displayName}</div>
          <div className="truncate text-[10px] text-scada-muted max-w-[200px]">{scopeLabel}</div>
        </div>
        <IconChevronDown />
      </button>

      {/* Status chips */}
      <div className="flex items-center gap-1.5">
        <span className={clsx('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-semibold', readinessChip.cls)}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', readinessChip.dot)} />
          {readinessChip.label}
        </span>
        <span className={clsx('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-semibold', statusConfig.className)}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', statusConfig.dotClassName)} />
          {statusConfig.label}
        </span>
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-[#12202e]" />

      {/* Inline metrics (from WorkflowContextStrip — deduplicated) */}
      <InlineMetrics />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions — 3-level hierarchy */}
      <div className="flex items-center gap-1.5">
        {/* Primary: Oblicz */}
        <button
          type="button"
          data-testid="top-bar-calculate"
          title={canCalculate ? 'Wykonaj analizę' : blockedReason ?? 'Analiza zablokowana'}
          onClick={handleCalculate}
          className={clsx(
            'flex h-8 items-center gap-1.5 rounded-md px-3.5 font-mono-eng text-xs font-bold transition-colors',
            canCalculate
              ? 'bg-[#00ffaa] text-[#00110b] shadow-[0_0_16px_rgba(0,255,170,0.2)] hover:bg-[#31ffba]'
              : 'border border-amber-500/40 bg-[#172334] text-amber-200 hover:bg-[#203044]',
          )}
        >
          <IconPlay />
          <span>{canCalculate ? 'Oblicz' : 'Sprawdź braki'}</span>
        </button>

        {/* Secondary: Analizy */}
        <button
          type="button"
          onClick={() => { onViewResults?.(); }}
          className="flex h-8 items-center gap-1 rounded-md border border-[#00d4ff30] bg-[#00d4ff08] px-3 text-[11px] font-semibold text-[#00d4ff] transition-colors hover:bg-[#00d4ff15]"
          data-testid="top-bar-results"
        >
          Analizy →
        </button>

        {/* Ghost: Eksport */}
        <button
          type="button"
          onClick={() => onMenuAction?.('export')}
          className="flex h-8 items-center gap-1 rounded-md border border-[#1a2a3a] px-2.5 text-[11px] font-medium text-scada-muted transition-colors hover:bg-[#0b1725] hover:text-scada-text"
          data-testid="top-bar-export"
        >
          Eksport
        </button>

        {/* Ghost: Settings */}
        <button
          type="button"
          onClick={() => onMenuAction?.('settings')}
          className="grid h-8 w-8 place-items-center rounded-md border border-[#1a2a3a] text-scada-muted transition-colors hover:bg-[#0b1725] hover:text-scada-text"
          title="Ustawienia"
          data-testid="top-bar-settings"
        >
          <IconGear />
        </button>
      </div>
    </header>
  );
}

/** Compact inline metrics extracted from WorkflowContextStrip. */
function InlineMetrics() {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const hasModel = Boolean(snapshot);

  const stats = useMemo(() => {
    if (!snapshot) return { buses: 0, branches: 0, stations: 0, sources: 0 };
    const model = snapshot as unknown as Record<string, unknown>;
    const count = (key: string) => {
      const v = model[key];
      return Array.isArray(v) ? v.length : 0;
    };
    return {
      buses: count('buses'),
      branches: count('branches'),
      stations: count('substations'),
      sources: count('sources'),
    };
  }, [snapshot]);

  if (!hasModel) return null;

  return (
    <div className="flex items-center gap-1">
      <MetricTag label="El." value={stats.buses + stats.branches + stats.stations} />
      <MetricTag label="Pola" value={stats.branches} />
      <MetricTag label="Stacje" value={stats.stations} />
    </div>
  );
}

function MetricTag({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-[#0a1420] px-2 py-0.5 text-[10px]">
      <span className="text-[#4a6a8a]">{label}</span>
      <span className="font-mono-eng font-semibold text-scada-text">{value}</span>
    </span>
  );
}

// =============================================================================
// NavigationRailV3 — Collapsible with grouped sections
// =============================================================================

function NavigationRailV3() {
  const activeArea = useAppStateStore((s) => s.activeArea);
  const setActiveArea = useAppStateStore((s) => s.setActiveArea);
  const collapseSurfaceStackTo = useNetworkBuildStore((s) => s.collapseSurfaceStackTo);

  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const expanded = pinned || hovered;

  const navigateToArea = useCallback(
    (areaId: AreaId) => {
      setActiveArea(areaId);

      switch (areaId) {
        case 'SCHEMAT_TOPOLOGIA':
          collapseSurfaceStackTo(null);
          navigateToSld();
          break;
        case 'STUDIA_OBLICZENIOWE':
          navigateToVariants();
          break;
        case 'WYNIKI_ANALIZY':
          navigateToAnalysis();
          break;
        case 'KATALOGI_TECHNICZNE':
          navigateToCatalog();
          break;
        case 'RAPORTY_UZASADNIENIA':
          navigateToReport();
          break;
        default:
          break;
      }
    },
    [collapseSurfaceStackTo, setActiveArea],
  );

  // Keyboard shortcuts: Ctrl+1..9
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const idx = Number.parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < AREA_DEFINITIONS.length) {
        e.preventDefault();
        navigateToArea(AREA_DEFINITIONS[idx].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigateToArea]);

  return (
    <nav
      data-testid="navigation-rail"
      aria-label="Pasek obszarów roboczych"
      onMouseEnter={() => !pinned && setHovered(true)}
      onMouseLeave={() => !pinned && setHovered(false)}
      className={clsx(
        'flex shrink-0 flex-col border-r border-[#12202e] bg-[#080e18] transition-[width] duration-200 ease-in-out overflow-hidden',
        expanded ? 'w-[220px]' : 'w-14',
      )}
    >
      {/* Pin toggle */}
      <div className={clsx('flex shrink-0 px-2 pt-2 pb-1', expanded ? 'justify-end' : 'justify-center')}>
        <button
          type="button"
          onClick={() => setPinned((v) => !v)}
          className="grid h-7 w-7 place-items-center rounded-md border border-[#1a2a3a] text-scada-muted transition-colors hover:bg-[#0b1725] hover:text-scada-text"
          title={pinned ? 'Odepnij nawigację' : 'Przypnij nawigację'}
        >
          {expanded ? <IconChevronLeft className="h-3 w-3" /> : <IconChevronRight className="h-3 w-3" />}
        </button>
      </div>

      {/* Grouped nav items */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.id}>
            {gi > 0 && <div className="mx-2.5 my-1.5 h-px bg-[#12202e]" />}
            {expanded && (
              <div className="px-3.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#2a4a6a]">
                {group.label}
              </div>
            )}
            {AREA_DEFINITIONS.filter((a) => (group.areas as readonly string[]).includes(a.id)).map((area) => {
              const isActive = activeArea === area.id;
              return (
                <button
                  key={area.id}
                  type="button"
                  data-testid={area.testId}
                  data-area-id={area.id}
                  title={expanded ? undefined : area.tooltip}
                  aria-label={`${area.labelFull}. ${area.description}. ${area.shortcut}`}
                  onClick={() => navigateToArea(area.id)}
                  className={clsx(
                    'relative flex w-full items-center gap-2.5 rounded-lg px-3 transition-colors',
                    expanded ? 'mx-1.5 my-px py-2' : 'mx-1 my-0.5 justify-center py-2.5',
                    isActive
                      ? 'bg-[#00d4ff0a] text-[#00d4ff]'
                      : 'text-[#6a7a8a] hover:bg-[#0b1725] hover:text-scada-text',
                  )}
                  style={{ width: expanded ? 'calc(100% - 12px)' : 'calc(100% - 8px)' }}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-sm bg-[#00d4ff]" />
                  )}
                  <TechnicalIcon
                    name={area.icon}
                    size={20}
                    status={isActive ? 'active' : 'normal'}
                  />
                  {expanded && (
                    <div className="min-w-0 flex-1 text-left">
                      <div className={clsx(
                        'truncate text-xs',
                        isActive ? 'font-semibold text-scada-text' : 'font-medium text-[#8a9aaa]',
                      )}>
                        {area.labelFull}
                      </div>
                      <div className="text-[10px] text-[#3a5a6a]">{area.shortcut}</div>
                    </div>
                  )}
                  {!expanded && (
                    <span className={clsx(
                      'absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-semibold leading-none',
                      isActive ? 'text-[#00d4ff]' : 'text-[#4a5a6a]',
                    )}>
                      {area.labelShort}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Bottom: search shortcut */}
      <div className={clsx('shrink-0 border-t border-[#12202e] p-2', expanded ? '' : 'flex justify-center')}>
        {expanded ? (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md bg-[#0a1420] border border-[#1a2a3a] px-2.5 py-1.5 text-[11px] text-scada-muted transition-colors hover:border-[#2a3a4a]"
          >
            <IconSearch />
            <span className="flex-1 text-left">Szukaj…</span>
            <span className="text-[9px] text-[#3a5a6a]">⌘K</span>
          </button>
        ) : (
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg bg-[#0a1420] border border-[#1a2a3a] text-scada-muted"
            title="Szukaj (⌘K)"
          >
            <IconSearch />
          </button>
        )}
      </div>
    </nav>
  );
}

// =============================================================================
// ContextPanelV3 — 320px, collapsible, improved hierarchy
// =============================================================================

function ContextPanelV3({
  areaCode,
  collapsed,
  onToggle,
}: {
  areaCode: AreaId;
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (collapsed) {
    return (
      <aside
        data-testid="context-panel-collapsed-rail"
        data-collapsed="true"
        className="flex w-10 shrink-0 flex-col items-center border-r border-[#12202e] bg-[#080e18] pt-2"
      >
        <button
          type="button"
          onClick={onToggle}
          className="grid h-8 w-8 place-items-center rounded-md text-scada-muted transition-colors hover:bg-[#0b1725] hover:text-scada-text"
          title="Pokaż panel kontekstu"
          data-testid="context-panel-toggle"
        >
          <IconChevronRight />
        </button>
      </aside>
    );
  }

  return (
    <aside
      data-testid="context-panel"
      data-area={areaCode}
      data-collapsed="false"
      className="relative flex w-80 shrink-0 flex-col border-r border-[#12202e] bg-[#0a1018]"
      style={{ minWidth: 320, maxWidth: 320 }}
    >
      {/* Header with collapse toggle */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#12202e] px-3.5">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#4a6a8a]">
            Panel kontekstu
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="grid h-5 w-5 place-items-center rounded border border-[#1a2a3a] text-[#4a6a8a] transition-colors hover:text-scada-text"
          title="Ukryj panel kontekstu"
          data-testid="context-panel-toggle"
        >
          <IconChevronLeft className="h-2.5 w-2.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <AreaContextPanel areaCode={areaCode} />
      </div>
    </aside>
  );
}

// =============================================================================
// CanonicalLayoutV3 — Main export
// =============================================================================

export function CanonicalLayoutV3({
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
}: CanonicalLayoutProps) {
  const activeMode = useActiveMode();
  const selectedElement = useSelectionStore((state) => state.selectedElements[0] ?? null);
  const activeSurface = useNetworkBuildStore((state) => state.activeSurface);
  const activeArea = useAppStateStore((s) => s.activeArea);
  const shouldHideInspector = hideInspector || activeSurface?.screenCode === 'E-37';

  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [projectMetadataOpen, setProjectMetadataOpen] = useState(false);
  const [snapshotHistoryOpen, setSnapshotHistoryOpen] = useState(false);

  // Keyboard shortcuts:
  //   Ctrl+K       → Global search
  //   Ctrl+B       → Toggle context panel
  //   Ctrl+Shift+B → Toggle inspector
  //   Ctrl+Shift+P → Command palette
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      if (isEditableTarget(event.target) && event.key !== 'Escape') return;

      if (meta && !event.shiftKey && (event.key === 'b' || event.key === 'B')) {
        event.preventDefault();
        setContextCollapsed((v) => !v);
        return;
      }
      if (meta && event.shiftKey && (event.key === 'b' || event.key === 'B')) {
        event.preventDefault();
        setInspectorCollapsed((v) => !v);
        return;
      }
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

  // Auto-expand inspector when a surface opens in panel mode
  useEffect(() => {
    if (activeSurface && activeSurface.openMode !== 'expand_workspace') {
      setInspectorCollapsed(false);
    }
  }, [activeSurface?.openMode, activeSurface?.surfaceId]);

  const isReadOnly = activeMode === 'RESULT_VIEW';
  const mainSurfaceExpanded = activeSurface?.openMode === 'expand_workspace';

  // Inspector width: panel techniczny nie może zabierać kanwie SLD pola pracy.
  // Pełnoekranowe konfiguratory używają `expand_workspace`; panel boczny zostaje
  // kartą techniczną, więc nawet sizeClass C musi zostawić czytelny schemat.
  const inspectorWidthClass = useMemo(() => {
    if (inspectorCollapsed) return 'w-10';
    switch (activeSurface?.sizeClass) {
      case 'A': return 'w-[420px]';
      case 'B': return 'w-[620px]';
      case 'C': return 'w-[min(44vw,720px)]';
      default:  return 'w-[340px]';
    }
  }, [activeSurface, inspectorCollapsed]);

  const toggleContextPanel = useCallback(() => setContextCollapsed((v) => !v), []);
  const toggleInspector = useCallback(() => setInspectorCollapsed((v) => !v), []);

  // Inspector content resolution: surface > GuidedBuild > selected element > empty
  const resolvedInspectorContent = useMemo(() => {
    if (activeSurface && activeSurface.openMode !== 'expand_workspace') {
      return <WorkspaceSurfaceRouter region="panel" />;
    }
    if (activeMode === 'MODEL_EDIT' && !selectedElement) {
      return <GuidedBuildActionPanel />;
    }
    if (inspectorContent) return inspectorContent;
    if (selectedElement) {
      return <InspectorEngineeringView />;
    }
    return <EmptyInspectorPanel selectedElement={selectedElement} isReadOnly={isReadOnly} />;
  }, [activeMode, activeSurface, inspectorContent, isReadOnly, selectedElement]);

  return (
    <div
      data-testid="canonical-layout"
      data-v3-shell
      className="flex h-screen flex-col overflow-hidden bg-[#040810] text-scada-text"
    >
      {/* Headless controllers */}
      <V12OverlayModeController />
      <div className="sr-only" aria-hidden="true"><UndoRedoButtons /></div>

      {/* ═══ TopBarV3 (48px) — merged context + workflow + actions ═══ */}
      <TopBarV3
        projectName={projectName}
        onCalculate={onCalculate}
        onViewResults={onViewResults}
        onMenuAction={onMenuAction}
      />

      {/* ═══ Main 4-column layout ═══ */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* NavigationRailV3 (56–220px, collapsible) */}
        <NavigationRailV3 />

        {/* Context panel (320px, collapsible) */}
        {!mainSurfaceExpanded && (
          <ContextPanelV3
            areaCode={activeArea}
            collapsed={contextCollapsed}
            onToggle={toggleContextPanel}
          />
        )}

        {/* SLD Canvas — flexible center */}
        <section
          className={clsx(
            'flex min-w-0 flex-1 flex-col overflow-hidden',
            mainSurfaceExpanded
              ? 'border-0 bg-transparent'
              : 'border-r border-[#12202e] bg-[#040810]',
          )}
        >
          {/* Main content area */}
          <div className="min-h-0 flex-1 overflow-auto" data-testid="main-content">
            {mainSurfaceExpanded ? <WorkspaceSurfaceRouter region="main" /> : children}
          </div>
        </section>

        {/* Inspector (340px, collapsible) */}
        {!shouldHideInspector && (
          <aside
            data-testid="inspector-panel-sidebar"
            data-collapsed={inspectorCollapsed}
            className={clsx(
              'flex shrink-0 flex-col overflow-hidden border-l border-[#12202e] bg-[#080e18] transition-all duration-200 ease-in-out',
              inspectorWidthClass,
            )}
          >
            {/* Inspector header */}
            <div className="flex h-8 shrink-0 items-center border-b border-[#12202e] px-2">
              <button
                type="button"
                onClick={toggleInspector}
                className={clsx(
                  'grid h-6 w-6 place-items-center rounded text-scada-muted transition-colors hover:bg-[#0b1725] hover:text-scada-text',
                  inspectorCollapsed && 'mx-auto',
                )}
                aria-label={inspectorCollapsed ? 'Pokaż inspektor' : 'Ukryj inspektor'}
                title={inspectorCollapsed ? 'Pokaż inspektor' : 'Ukryj inspektor'}
                data-testid="inspector-panel-toggle"
              >
                {inspectorCollapsed ? <IconChevronLeft /> : <IconChevronRight />}
              </button>
              {!inspectorCollapsed && (
                <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#4a6a8a]">
                  Inspektor techniczny
                </span>
              )}
            </div>

            {/* Inspector body */}
            {!inspectorCollapsed && (
              <div className="min-h-0 flex-1 overflow-auto">
                {resolvedInspectorContent}
              </div>
            )}

            {/* Collapsed icon */}
            {inspectorCollapsed && (
              <div className="flex flex-col items-center gap-2 pt-2" data-testid="inspector-collapsed-icon">
                <span className="flex h-8 w-8 items-center justify-center text-scada-muted">
                  <IconClipboard />
                </span>
              </div>
            )}
          </aside>
        )}

        {/* Issue panel — IssuePanelContainer wpięty z pustą listą issues.
            Pełna integracja z dataloaderem (model/power_flow/protection
            issues) wymaga implementacji w osobnym module agregatora —
            container już akceptuje issues + onIssueClick props. */}
      </div>

      {/* ═══ StatusBarV12 (28px) — deduplicated ═══ */}
      <StatusBarV12
        validationStatus={validationStatus}
        validationWarnings={validationWarnings}
        validationErrors={validationErrors}
        networkStats={networkStats}
      />

      {/* ═══ Modals ═══ */}
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
            run: () => { window.location.hash = '#enm-inspector'; setCommandPaletteOpen(false); },
          },
          {
            id: 'shortcut:open-fault-scenarios',
            label: 'Scenariusze zwarciowe',
            description: 'Zarządzaj scenariuszami zwarć i analiz.',
            keywords: 'fault scenariusze zwarciowe zwarcia analizy',
            run: () => { window.location.hash = '#fault-scenarios'; setCommandPaletteOpen(false); },
          },
          {
            id: 'shortcut:open-dashboard',
            label: 'Pulpit projektu',
            description: 'Lista projektów + nowy projekt (E-00).',
            keywords: 'pulpit dashboard projekt lista nowy',
            run: () => { window.location.hash = '#dashboard'; setCommandPaletteOpen(false); },
          },
        ]}
      />
      <ProjectMetadataModal isOpen={projectMetadataOpen} onClose={() => setProjectMetadataOpen(false)} />
      <SnapshotHistoryModal isOpen={snapshotHistoryOpen} onClose={() => setSnapshotHistoryOpen(false)} />
    </div>
  );
}

/** Backward-compatible alias. */
export { CanonicalLayoutV3 as CanonicalLayout };
