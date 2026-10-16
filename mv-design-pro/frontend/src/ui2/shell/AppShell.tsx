/*
 * Powłoka aplikacji MV-DESIGN-PRO — okno W-110.
 *
 * TRZY PASY zamiast pięciu (karta K1 POWLOKA, kontrakt UIUX przemysłowy UI-01):
 * pasek projektu (`PasekProjektu`), pasek narzędzi bieżącej przestrzeni
 * (`PasekNarzedzi`) i pasek stanu (`StatusBar`); między nimi kontener trzech
 * paneli (nawigacja / warsztat / inspektor) i regulowany panel dolny z
 * rejestrem zakładek (`panelDolny/`). Konsumuje istniejące store'y wyłącznie do
 * odczytu (bez shadow-state); stan prezentacji (układ, „Szczegóły audytowe",
 * aktywna przestrzeń, panel dolny) trzyma useShellStore.
 *
 * DEKLARACJA POWIĄZAŃ (SPEC_POWIAZANIA §5, karta §9): patrz SHELL_EVENT_CONTRACT.
 * Determinizm: brak Date.now()/Math.random() w renderze.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import '../theme/tokens.css';
import '../theme/komponenty.css';
import './shell.css';

import { PasekProjektu } from './PasekProjektu';
import { PasekNarzedzi } from './PasekNarzedzi';
import { PanelLayout } from './PanelLayout';
import { StatusBar } from './StatusBar';
import { SpaceNav } from './SpaceNav';
import { PanelDolny } from './panelDolny/PanelDolny';
import { ZAKLADKI_PANELU_DOLNEGO, type ZakladkaPaneluDolnego } from './panelDolny/rejestrZakladek';
import { clampLeftWidth, clampRightWidth, DEFAULT_LAYOUT, useShellStore } from './useShellStore';
import { useThemeModeStore, applyThemeMode } from '../theme/themeMode';
import {
  useShellCaseInfo,
  useShellStatusInfo,
  useStanBiegu,
  type BackendStatus,
} from './shellStatus';
import { policzLicznikiModelu } from './licznikiModelu';
import { SPACES, type SpaceId } from './spaces';
import { SHELL_STRINGS } from './strings';
import { emituj } from '../events';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { usePodsumowanieGotowosci } from '../spaces/gotowosc/adapters/gotowoscAdapter';
import { usePrzyczynaBlokadyObliczen } from '../spaces/obliczenia/uruchomObliczenie';

/**
 * Kontrakt zdarzeń powłoki (deklaracja wymagana kartą §9). Emisja przez
 * callbacki propsów i szynę zdarzeń, subskrypcja przez adapter read-only.
 */
export const SHELL_EVENT_CONTRACT = {
  subscribes: [
    'przypadek-aktywny',
    'gotowość-zmieniona',
    'model-zmieniony(rev)',
    'wyniki-nieaktualne/gotowe',
  ],
  emits: ['przestrzeń-aktywna', 'żądanie-otwarcia-panelu-dolnego', 'selekcja'],
} as const;

/** Źródło selekcji emitowanej przez panel dolny, gdy wołający nie podał własnej akcji. */
const ZRODLO_PANEL_DOLNY = 'panel-dolny';

export interface AppShellProps {
  /** Zawartość warsztatu (panel środkowy). */
  children?: ReactNode;
  /** Zawartość inspektora (panel prawy). */
  inspector?: ReactNode;
  /** Drzewo kontekstowe przestrzeni (dolna część lewego panelu; ukryte przy listwie ikon). */
  contextPanel?: ReactNode;
  /** Jedyna wyszukiwarka (paleta poleceń, Ctrl+K). Brak = brak polecenia „Szukaj". */
  renderSearchDialog?: (otwarta: boolean, zamknij: () => void) => ReactNode;
  /** Stan ładowania — renderuje szkielet powłoki. */
  loading?: boolean;
  /** Status połączenia z serwerem (`useBackendHealth` w `AppRoot.tsx`). */
  backendStatus?: BackendStatus;
  /** Etykieta ostatniego zakończonego przebiegu (K6/H-6 R3 — z rejestru przebiegów). */
  lastRunLabel?: string | null;
  /** Odcisk SHA-256 migawki modelu — nadpisanie dla scen testowych (K6/H-6 R4). */
  wersjaModelu?: string | null;
  /** Rewizja modelu (nadpisuje wartość z gotowości, gdy podana). */
  modelRevision?: number | null;
  onReconnect?: () => void;
  onCalculate?: () => void;
  onOpenProject?: () => void;
  onOpenProjectMetadata?: () => void;
  /** Otwiera stan wariantów/przebiegów aktywnego zakresu (zakres w pasku projektu). */
  onOpenVariants?: () => void;
  onActiveSpaceChange?: (space: SpaceId) => void;
  onOpenSearch?: () => void;
  /** Pasek narzędzi: tryb pracy kanwy (tylko przestrzeń z kanwą schematu). */
  przelacznikPodgladu?: ReactNode;
  onKatalog?: () => void;
  onPrzegladZbiorczy?: () => void;
  onHistoria?: () => void;
  /** Akcja pustego modelu w panelu liczników (przejście do budowy sieci). */
  onZacznijBudowe?: () => void;
  /** Rejestr zakładek panelu dolnego (domyślnie: Problemy, Przebiegi, Dziennik). */
  zakladkiPaneluDolnego?: readonly ZakladkaPaneluDolnego[];
  /** Zaznaczenie elementu z panelu dolnego (domyślnie: zdarzenie `selekcja`). */
  onWybierzElement?: (ref: string) => void;
  /** Wejście w wyniki zakończonego biegu z zakładki „Przebiegi". */
  onPokazWynikiBiegu?: (runId: string) => void;
}

export function AppShell({
  children,
  inspector,
  contextPanel,
  renderSearchDialog,
  loading = false,
  backendStatus = 'connected',
  lastRunLabel = null,
  wersjaModelu,
  modelRevision,
  onReconnect,
  onCalculate,
  onOpenProject,
  onOpenProjectMetadata,
  onOpenVariants,
  onActiveSpaceChange,
  onOpenSearch,
  przelacznikPodgladu,
  onKatalog,
  onPrzegladZbiorczy,
  onHistoria,
  onZacznijBudowe,
  zakladkiPaneluDolnego = ZAKLADKI_PANELU_DOLNEGO,
  onWybierzElement,
  onPokazWynikiBiegu,
}: AppShellProps) {
  const activeSpace = useShellStore((s) => s.activeSpace);
  const szczegolyAudytowe = useShellStore((s) => s.szczegolyAudytowe);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const toggleSzczegolyAudytowe = useShellStore((s) => s.toggleSzczegolyAudytowe);
  const layout = useShellStore((s) => s.layoutBySpace[activeSpace] ?? undefined);
  const setLeftWidth = useShellStore((s) => s.setLeftWidth);
  const setRightWidth = useShellStore((s) => s.setRightWidth);
  const toggleLeftCollapsed = useShellStore((s) => s.toggleLeftCollapsed);
  const toggleRightCollapsed = useShellStore((s) => s.toggleRightCollapsed);
  const resetLayout = useShellStore((s) => s.resetLayout);
  const bottomPanelOpen = useShellStore((s) => s.bottomPanelOpen);
  const bottomPanelTab = useShellStore((s) => s.bottomPanelTab);
  const bottomPanelHeight = useShellStore((s) => s.bottomPanelHeight);
  const openBottomPanel = useShellStore((s) => s.openBottomPanel);
  const closeBottomPanel = useShellStore((s) => s.closeBottomPanel);
  const toggleBottomPanel = useShellStore((s) => s.toggleBottomPanel);
  const setBottomPanelHeight = useShellStore((s) => s.setBottomPanelHeight);

  const themeMode = useThemeModeStore((s) => s.mode);
  const toggleTheme = useThemeModeStore((s) => s.toggle);

  const caseInfo = useShellCaseInfo();
  const gotowosc = usePodsumowanieGotowosci();
  const bieg = useStanBiegu();
  const blokadaObliczen = usePrzyczynaBlokadyObliczen();
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const liczniki = useMemo(() => policzLicznikiModelu(snapshot), [snapshot]);
  const statusInfo = useShellStatusInfo({
    backend: backendStatus,
    lastRunLabel,
    wersjaModelu,
    modelRevision,
  });

  // K11-A: JEDNA prawda wartości domyślnych układu (DEFAULT_LAYOUT) — lokalne
  // fallbacki rozjeżdżały się z magazynem (inspektor „otwarty" mimo domyślnego
  // zwinięcia, bo brak wpisu przestrzeni omijał domyślne store'a). Karta K1:
  // szerokości zapisane przy dawnych granicach są przycinane do bieżących.
  const leftWidth = clampLeftWidth(layout?.leftWidth ?? DEFAULT_LAYOUT.leftWidth);
  const rightWidth = clampRightWidth(layout?.rightWidth ?? DEFAULT_LAYOUT.rightWidth);
  const leftCollapsed = layout?.leftCollapsed ?? DEFAULT_LAYOUT.leftCollapsed;
  const rightCollapsed = layout?.rightCollapsed ?? DEFAULT_LAYOUT.rightCollapsed;

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

  const wyszukiwarkaDostepna = renderSearchDialog != null;
  const openSearch = useCallback(() => {
    if (!wyszukiwarkaDostepna) return;
    setSearchOpen(true);
    onOpenSearch?.();
  }, [onOpenSearch, wyszukiwarkaDostepna]);

  const wybierzElement = useCallback(
    (ref: string) => {
      if (onWybierzElement) {
        onWybierzElement(ref);
        return;
      }
      emituj({ typ: 'selekcja', obiektId: ref, zrodlo: ZRODLO_PANEL_DOLNY });
    },
    [onWybierzElement],
  );

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

  return (
    <div className="mvd-app" data-testid="mvd-app-shell">
      <PasekProjektu
        info={caseInfo}
        themeMode={themeMode}
        onThemeToggle={toggleTheme}
        szczegolyAudytowe={szczegolyAudytowe}
        onToggleSzczegolyAudytowe={toggleSzczegolyAudytowe}
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
        bottomOpen={bottomPanelOpen}
        onToggleLeft={() => toggleLeftCollapsed(activeSpace)}
        onToggleRight={() => toggleRightCollapsed(activeSpace)}
        onToggleBottom={toggleBottomPanel}
        onResetLayout={() => resetLayout(activeSpace)}
        onOpenProject={onOpenProject}
        onOpenProjectMetadata={onOpenProjectMetadata}
        onOpenVariants={onOpenVariants}
        onOtworzWyniki={() => selectSpace('wyniki')}
        onPrzejdzDoObliczen={() => selectSpace('obliczenia')}
        onCalculate={onCalculate}
        blokadaObliczen={blokadaObliczen}
        biegTrwa={bieg.trwa}
        opisBiegu={bieg.stan}
      />

      <PasekNarzedzi
        przelacznikPodgladu={przelacznikPodgladu}
        onSzukaj={wyszukiwarkaDostepna ? openSearch : undefined}
        onKatalog={onKatalog}
        onPrzegladZbiorczy={onPrzegladZbiorczy}
        onHistoria={onHistoria}
        liczniki={liczniki}
        projektOtwarty={caseInfo.projectPresent}
        onZacznijBudowe={onZacznijBudowe}
      />

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
                {children}
              </div>
            }
            right={
              inspector ?? (
                <div>
                  <h2 className="mvd-inspector-naglowek">{SHELL_STRINGS.inspectorHeading}</h2>
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
          <PanelDolny
            zakladki={zakladkiPaneluDolnego}
            aktywna={bottomPanelTab}
            wysokosc={bottomPanelHeight}
            onWybierzZakladke={openBottomPanel}
            onZmienWysokosc={setBottomPanelHeight}
            onZamknij={closeBottomPanel}
            onWybierzElement={wybierzElement}
            onPokazWynikiBiegu={onPokazWynikiBiegu}
          />
        )}
      </div>

      <StatusBar
        status={statusInfo}
        gotowosc={gotowosc}
        projektOtwarty={caseInfo.projectPresent}
        bieg={bieg}
        onReconnect={onReconnect}
        onOpenBottomPanel={(tab) => openBottomPanel(tab)}
        onOtworzGotowosc={() => selectSpace('gotowosc')}
      />

      {renderSearchDialog != null && renderSearchDialog(searchOpen, () => setSearchOpen(false))}
    </div>
  );
}

export default AppShell;
