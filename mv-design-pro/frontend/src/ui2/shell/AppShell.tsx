/*
 * Powłoka aplikacji MV-DESIGN-PRO — okno W-110 (clean-room, moduł ui2 na czas U1).
 *
 * Składa pasek tytułowy, pasek aktywnego przypadku, kontener trzech paneli
 * (nawigacja / warsztat / inspektor), opcjonalny panel dolny i pasek stanu.
 * Konsumuje istniejące store'y wyłącznie do odczytu (bez shadow-state); stan
 * prezentacji (układ, tryb zaawansowania, aktywna przestrzeń) trzyma useShellStore.
 *
 * ui2 NIE jest importowane z produkcyjnego wejścia aplikacji (App.tsx/main.tsx) —
 * przełączenie i usunięcie starej powłoki to karta E1.7.
 *
 * DEKLARACJA POWIĄZAŃ (SPEC_POWIAZANIA §5, karta §9): patrz SHELL_EVENT_CONTRACT.
 * Determinizm: brak Date.now()/Math.random() w renderze.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import '../theme/tokens.css';
import './shell.css';

import { TitleBar } from './TitleBar';
import { CaseBar } from './CaseBar';
import { PanelLayout } from './PanelLayout';
import { StatusBar } from './StatusBar';
import { SpaceNav } from './SpaceNav';
import { useShellStore, type BottomPanelTab } from './useShellStore';
import { useThemeModeStore, applyThemeMode } from '../theme/themeMode';
import { useShellCaseInfo, useShellStatusInfo, type BackendStatus } from './shellStatus';
import { SPACES, type SpaceId } from './spaces';
import { useAppStateStore } from '../../ui/app-state';
import { SHELL_STRINGS } from './strings';

/**
 * Kontrakt zdarzeń powłoki (deklaracja wymagana kartą §9). Magistrala zdarzeń to
 * karta E15.1 — do jej wpięcia emisja realizowana jest przez callbacki propsów,
 * a subskrypcja przez adapter read-only (shellStatus).
 */
export const SHELL_EVENT_CONTRACT = {
  subscribes: [
    'przypadek-aktywny',
    'gotowość-zmieniona',
    'model-zmieniony(rev)',
    'wyniki-nieaktualne/gotowe',
  ],
  emits: ['przestrzeń-aktywna', 'żądanie-otwarcia-panelu-dolnego'],
} as const;

export interface AppShellProps {
  /** Zawartość warsztatu (panel środkowy). */
  children?: ReactNode;
  /** Zawartość inspektora (panel prawy). */
  inspector?: ReactNode;
  /** Drzewo kontekstowe przestrzeni (dolna część lewego panelu; ukryte przy listwie ikon). */
  contextPanel?: ReactNode;
  /** Pełny dialog wyszukiwarki (E1.5) — zastępuje wbudowany szkielet, gdy podany. */
  renderSearchDialog?: (otwarta: boolean, zamknij: () => void) => ReactNode;
  /** Stan ładowania — renderuje szkielet powłoki. */
  loading?: boolean;
  /** Status połączenia z serwerem (klient health wpinany w E1.4 — TODO-KARTA). */
  backendStatus?: BackendStatus;
  /** Etykieta ostatniego przebiegu (kontrakt świeżości E15.2 — TODO-KARTA). */
  lastRunLabel?: string | null;
  /** Odcisk SHA-256 wyników (kontrakt świeżości E15.2 — TODO-KARTA). */
  resultsFingerprint?: string | null;
  /** Rewizja modelu (nadpisuje wartość z gotowości, gdy podana). */
  modelRevision?: number | null;
  onReconnect?: () => void;
  onSave?: () => void;
  onCalculate?: () => void;
  onOpenProject?: () => void;
  /** Otwiera stan wariantów/przebiegów aktywnego zakresu (chip paska przypadku). */
  onOpenVariants?: () => void;
  onActiveSpaceChange?: (space: SpaceId) => void;
  onOpenSearch?: () => void;
}

export function AppShell({
  children,
  inspector,
  contextPanel,
  renderSearchDialog,
  loading = false,
  backendStatus = 'connected',
  lastRunLabel = null,
  resultsFingerprint,
  modelRevision,
  onReconnect,
  onSave,
  onCalculate,
  onOpenProject,
  onOpenVariants,
  onActiveSpaceChange,
  onOpenSearch,
}: AppShellProps) {
  const activeSpace = useShellStore((s) => s.activeSpace);
  const advancementMode = useShellStore((s) => s.advancementMode);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const setAdvancementMode = useShellStore((s) => s.setAdvancementMode);
  const layout = useShellStore((s) => s.layoutBySpace[activeSpace] ?? undefined);
  const setLeftWidth = useShellStore((s) => s.setLeftWidth);
  const setRightWidth = useShellStore((s) => s.setRightWidth);
  const toggleLeftCollapsed = useShellStore((s) => s.toggleLeftCollapsed);
  const toggleRightCollapsed = useShellStore((s) => s.toggleRightCollapsed);
  const resetLayout = useShellStore((s) => s.resetLayout);
  const bottomPanelOpen = useShellStore((s) => s.bottomPanelOpen);
  const bottomPanelTab = useShellStore((s) => s.bottomPanelTab);
  const openBottomPanel = useShellStore((s) => s.openBottomPanel);
  const closeBottomPanel = useShellStore((s) => s.closeBottomPanel);

  const themeMode = useThemeModeStore((s) => s.mode);
  const toggleTheme = useThemeModeStore((s) => s.toggle);

  const projectName = useAppStateStore((s) => s.activeProjectName);
  const caseInfo = useShellCaseInfo();
  const statusInfo = useShellStatusInfo({
    backend: backendStatus,
    lastRunLabel,
    resultsFingerprint,
    modelRevision,
  });

  const leftWidth = layout?.leftWidth ?? 240;
  const rightWidth = layout?.rightWidth ?? 320;
  const leftCollapsed = layout?.leftCollapsed ?? false;
  const rightCollapsed = layout?.rightCollapsed ?? false;

  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    applyThemeMode(themeMode);
  }, [themeMode]);

  const selectSpace = useCallback(
    (space: SpaceId) => {
      setActiveSpace(space);
      onActiveSpaceChange?.(space);
    },
    [setActiveSpace, onActiveSpaceChange],
  );

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    onOpenSearch?.();
  }, [onOpenSearch]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const typing = target instanceof HTMLElement && !!target.closest('input, textarea, select');

      if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        openSearch();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'b' || event.key === 'B')) {
        event.preventDefault();
        toggleLeftCollapsed(activeSpace);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'i' || event.key === 'I')) {
        event.preventDefault();
        toggleRightCollapsed(activeSpace);
        return;
      }
      if (event.key === 'Escape') {
        if (searchOpen) {
          setSearchOpen(false);
          return;
        }
        if (bottomPanelOpen) {
          closeBottomPanel();
        }
        return;
      }
      if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const index = Number.parseInt(event.key, 10);
        if (index >= 1 && index <= SPACES.length) {
          selectSpace(SPACES[index - 1].id);
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeSpace,
    searchOpen,
    bottomPanelOpen,
    openSearch,
    toggleLeftCollapsed,
    toggleRightCollapsed,
    closeBottomPanel,
    selectSpace,
  ]);

  if (loading) {
    return (
      <div className="mvd-app" data-testid="mvd-app-shell">
        <div className="mvd-skeleton" role="status" aria-busy="true" data-testid="mvd-shell-skeleton">
          <span className="mvd-lbl">{SHELL_STRINGS.loadingShell}</span>
          <div className="mvd-skeleton-block" style={{ width: '40%', marginTop: '10px' }} />
          <div className="mvd-skeleton-block" style={{ width: '70%' }} />
          <div className="mvd-skeleton-block" style={{ width: '55%' }} />
        </div>
      </div>
    );
  }

  const bottomTabs: BottomPanelTab[] = ['problemy', 'przebiegi', 'dziennik'];
  const bottomTabLabels: Record<BottomPanelTab, string> = {
    problemy: SHELL_STRINGS.bottomProblemy,
    przebiegi: SHELL_STRINGS.bottomPrzebiegi,
    dziennik: SHELL_STRINGS.bottomDziennik,
  };

  return (
    <div className="mvd-app" data-testid="mvd-app-shell">
      <TitleBar
        projectName={projectName}
        advancementMode={advancementMode}
        onAdvancementModeChange={setAdvancementMode}
        themeMode={themeMode}
        onThemeToggle={toggleTheme}
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
        onToggleLeft={() => toggleLeftCollapsed(activeSpace)}
        onToggleRight={() => toggleRightCollapsed(activeSpace)}
        onResetLayout={() => resetLayout(activeSpace)}
        onSave={onSave}
        onCalculate={onCalculate}
      />

      {/* Kontrakt e2e (E1.7b): pasek aktywnego przypadku nosi testid starej powłoki. */}
      <div data-testid="active-case-bar">
        <CaseBar info={caseInfo} onOpenProject={onOpenProject} onOpenVariants={onOpenVariants} />
      </div>

      <div className="mvd-main-region">
        <div className="mvd-main-fill">
          <PanelLayout
            left={
              <div className="mvd-left-stack">
                <SpaceNav activeSpace={activeSpace} collapsed={leftCollapsed} onSelect={selectSpace} />
                {!leftCollapsed && contextPanel != null ? (
                  <div className="mvd-left-context" data-testid="mvd-left-context">
                    {contextPanel}
                  </div>
                ) : null}
              </div>
            }
            center={
              /* Kontrakt e2e (E1.7b): środkowy panel = main-content (jak w starej powłoce). */
              <div className="mvd-workspace-host" data-testid="main-content">
                {children ?? <p className="mvd-inspector-empty">{SHELL_STRINGS.workspaceHint}</p>}
              </div>
            }
            right={
              inspector ?? (
                <div>
                  <h2 style={{ margin: '0 0 6px', fontSize: '13px' }}>{SHELL_STRINGS.inspectorHeading}</h2>
                  <p className="mvd-inspector-empty">{SHELL_STRINGS.inspectorEmpty}</p>
                </div>
              )
            }
            leftWidth={leftWidth}
            rightWidth={rightWidth}
            leftCollapsed={leftCollapsed}
            rightCollapsed={rightCollapsed}
            onToggleLeft={() => toggleLeftCollapsed(activeSpace)}
            onToggleRight={() => toggleRightCollapsed(activeSpace)}
            onResizeLeft={(width) => setLeftWidth(activeSpace, width)}
            onResizeRight={(width) => setRightWidth(activeSpace, width)}
          />
        </div>

        {bottomPanelOpen && (
          <section className="mvd-bottom" aria-label={bottomTabLabels[bottomPanelTab]} data-testid="mvd-bottom-panel">
            <div className="mvd-bottom-tabs" role="tablist">
              {bottomTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={tab === bottomPanelTab}
                  className={tab === bottomPanelTab ? 'mvd-btn mvd-btn-primary' : 'mvd-btn'}
                  onClick={() => openBottomPanel(tab)}
                >
                  {bottomTabLabels[tab]}
                </button>
              ))}
              <span className="mvd-grow" />
              <button
                type="button"
                className="mvd-btn"
                aria-label={SHELL_STRINGS.closeBottom}
                onClick={closeBottomPanel}
                data-testid="mvd-bottom-close"
              >
                ✕
              </button>
            </div>
            <p className="mvd-inspector-empty">{SHELL_STRINGS.bottomHint}</p>
          </section>
        )}
      </div>

      <StatusBar
        status={statusInfo}
        onReconnect={onReconnect}
        onOpenBottomPanel={(tab) => openBottomPanel(tab)}
      />

      {renderSearchDialog != null && renderSearchDialog(searchOpen, () => setSearchOpen(false))}
      {renderSearchDialog == null && searchOpen && (
        <div
          className="mvd-search-scrim"
          data-testid="mvd-search-scrim"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="mvd-search-box"
            role="dialog"
            aria-modal="true"
            aria-label={SHELL_STRINGS.searchPlaceholder}
            onClick={(event) => event.stopPropagation()}
          >
            <input
              className="mvd-search-input"
              type="text"
              placeholder={SHELL_STRINGS.searchPlaceholder}
              aria-label={SHELL_STRINGS.searchPlaceholder}
              autoFocus
              data-testid="mvd-search-input"
            />
            <p className="mvd-search-hint">{SHELL_STRINGS.searchHint}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppShell;
