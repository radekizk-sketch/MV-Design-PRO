/**
 * App Root — CANONICAL_LAYOUT + UI_INTEGRATION_E2E + V12.5
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Layout narzędziowy ZAWSZE renderowany
 * - wizard_screens.md § 1.3: Active case bar (always visible)
 * - UI_CORE_ARCHITECTURE.md § 4.1: Navigation structure
 *
 * CANONICAL RULE:
 * > Layout narzędziowy ZAWSZE jest renderowany.
 * > Brak danych = komunikat w obszarze roboczym, a NIE brak UI.
 *
 * Main application entry with:
 * - CanonicalLayout with one active workspace, one inspector and one status bar
 * - Hash-based routing with Polish labels
 * - Mode-aware page rendering
 * - Empty state overlays (NOT empty screens)
 *
 * E1.7a: bezwizualna orkiestracja (hydracja store'ów z URL ?project/?case/?run,
 * deep-linki #analysis/#proof/#report/#catalog/#variants/#case-config/#switchgear,
 * handleCalculate/restoreAnalysisRunSnapshot, nakładka wyników, synchronizacja
 * trybu i obszaru, powierzchnie PV/BESS/FW z selekcji) została PRZENIESIONA do
 * headless hooka `ui2/legacy/useLegacyOrchestrator` — App renderuje powłokę
 * i woła hook (zero duplikacji logiki, te same store'y).
 *
 * Routes (Polish):
 * - "" bez aktywnego projektu → Pulpit projektu E-00
 * - "" z aktywnym projektem / "#sld" → Schemat jednokreskowy E-01
 * - "#sld-view" → Podglad schematu (SLD Read-Only Viewer)
 * - "#analysis" → Analizy techniczne (E-35)
 * - "#report" → Generator raportu (E-25)
 * - "#variants" / "#catalog" / "#case-config" → Helpery shell-a
 * - "#results" / "#proof" / "#protection-results" / "#power-flow-results" / "#compare"
 *   → aliasy prowadzące do E-24
 */

import { useEffect, useState, useCallback, useMemo } from 'react';

import { EnmInspectorPage } from './ui/enm-inspector';
import { FaultScenariosPanel, FaultScenarioModal } from './ui/fault-scenarios';
import { CanonicalLayout as CanonicalLayoutV12 } from './ui/layout';
import { CanonicalLayoutV3 } from './ui/layout/CanonicalLayoutV3';
import { StationWizardSurface } from './ui/network-build/station-wizard-v2/StationWizardSurface';
import { featureFlags } from './ui/config/featureFlags';

// Feature flag: VITE_USE_LAYOUT_V3=1 włącza shell V3 (chrome -48% per
// `docs/audit/DESIGN_IMPL_2026-05-19_KWranPTV.md` § 2). Domyślnie V12.
const CanonicalLayout = featureFlags.USE_LAYOUT_V3 ? CanonicalLayoutV3 : CanonicalLayoutV12;
import { SldWorkspaceContainer } from './ui/sld/v2/canvas/SldWorkspaceContainer';
import { ProjectDashboardSurface } from './ui/workspace/surfaces/ProjectDashboardSurface';
import { useAppStateStore } from './ui/app-state';
import { useSnapshotStore } from './ui/topology/snapshotStore';
import { useExecutionRunsStore } from './ui/study-cases/runStore';
import {
  ROUTES,
  getCurrentSearchParams,
  getRouteByHash,
  isAnalysisRouteAlias,
  navigateToAnalysis,
  navigateToCaseConfig,
  navigateToCatalog,
  navigateToCompare,
  navigateToNetworkBuild,
  navigateToProof,
  navigateToReport,
  navigateToResultsProtection,
  navigateToSwitchgear,
  navigateToVariants,
} from './ui/navigation';
import { NotificationToast } from './ui/notifications/NotificationToast';
import { HelpPanel } from './ui/help';
import { SettingsPanel } from './ui/settings';
import { installDialogKeyboardHandler } from './ui/shared/DialogManager';
import { OnboardingTour, isOnboardingCompleted } from './ui/onboarding/OnboardingTour';
import { useNetworkStats } from './ui/topology/useNetworkStats';
import { useNetworkBuildStore } from './ui/network-build/networkBuildStore';
import {
  ANALYSIS_SURFACE_SCREEN_CODE,
  ANALYSIS_ROUTE_DEFAULT_TAB,
  REPORT_SURFACE_SCREEN_CODE,
} from './ui/workspace/types';
import { useActiveProjectName, useLegacyOrchestrator } from './ui2/legacy/useLegacyOrchestrator';

/**
 * E2E_STABILIZATION: App ready indicator for tests.
 * Set after initial hydration and route sync.
 */
function useAppReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Mark app as ready after initial render cycle completes
    const timer = requestAnimationFrame(() => {
      setReady(true);
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  return ready;
}

function openSldOverlayFromCurrentContext(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const params = getCurrentSearchParams();
  params.set('overlay', '1');
  params.set('legend', '1');
  const query = params.toString();
  window.location.hash = query ? `${ROUTES.SLD.hash}?${query}` : ROUTES.SLD.hash;
}

function UnknownRoutePage({ route }: { route: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-slate-50">
      <div className="max-w-lg rounded-lg border border-amber-300 bg-amber-50 px-6 py-5 text-slate-900 shadow-sm">
        <h1 className="text-lg font-semibold">Nieznana trasa interfejsu</h1>
        <p className="mt-2 text-sm leading-6">
          Aktywna trasa <code>{route || '(pusta)'}</code> nie jest zmapowana do kanonicznego
          powierzchni. Przejdź do jednej z aktywnych sekcji albo popraw routing.
        </p>
      </div>
    </div>
  );
}

function App() {
  // Globalne panele UX (G7 Help, G8 Settings, G5 Onboarding)
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Onboarding nie otwiera się automatycznie jako modal na kanwie projektowej,
  // bo blokował kliknięcia w SLD/CAD i testy przepływu inżyniera. Można go
  // uruchomić jawnie przez parametr #...?tour=1.
  useEffect(() => {
    const syncTourState = () => {
      const shouldOpen = getCurrentSearchParams().get('tour') === '1' && !isOnboardingCompleted();
      setOnboardingOpen(shouldOpen);
    };
    syncTourState();
    window.addEventListener('hashchange', syncTourState);
    return () => window.removeEventListener('hashchange', syncTourState);
  }, []);

  // Globalny F1 → Help, Ctrl+, → Settings
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === ',' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // G3 dostawy: globalny dialog stack keyboard handler (ESC zamyka top dialog,
  // Cmd/Ctrl+ESC zamyka wszystkie dialogi z DialogManager).
  useEffect(() => installDialogKeyboardHandler(), []);
  const setActiveArea = useAppStateStore((state) => state.setActiveArea);
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const executionActiveRunId = useExecutionRunsStore((state) => state.activeRunId);
  const readiness = useSnapshotStore((state) => state.readiness);
  const appReady = useAppReady();
  const projectName = useActiveProjectName();
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const effectiveRunId = activeRunId ?? executionActiveRunId;

  // E1.7a: cała bezwizualna orkiestracja starej powłoki (patrz doc hooka).
  const { route, handleCalculate, handleViewResults } = useLegacyOrchestrator();

  const networkStats = useNetworkStats();

  // E2E_STABILIZATION: Wrapper with app-ready indicator
  const wrapWithReadyIndicator = (content: React.ReactNode) => (
    <div
      data-testid="app-root"
      data-ready={appReady}
      className="mv-dark-scada min-h-screen bg-chrome-900 text-chrome-100"
      data-ui-theme="dark-scada"
    >
      {appReady && <div data-testid="app-ready" style={{ display: 'none' }} />}
      <NotificationToast />
      {content}
      {/* Globalne panele UX dostępne z każdego ekranu */}
      <HelpPanel isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <OnboardingTour isOpen={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </div>
  );

  // Derive validation status from readiness
  const validationStatus = useMemo(() => {
    if (!readiness) return undefined;
    const blockerCount = readiness.blockers?.length ?? 0;
    const warningCount = readiness.warnings?.length ?? 0;
    if (blockerCount > 0) return 'errors' as const;
    if (warningCount > 0) return 'warnings' as const;
    return 'valid' as const;
  }, [readiness]);

  // Action handler for canonical top/workspace controls.
  const handleMenuAction = useCallback((actionId: string) => {
    switch (actionId) {
      case 'sld':
        navigateToNetworkBuild();
        break;
      case 'network-build':
        navigateToNetworkBuild();
        break;
      case 'overlay':
        setActiveArea('SCHEMAT_TOPOLOGIA');
        openSldOverlayFromCurrentContext();
        break;
      case 'switchgear':
        navigateToSwitchgear({ caseId: activeCaseId });
        break;
      case 'power-distribution':
        navigateToNetworkBuild();
        break;
      case 'case-manager':
        navigateToCaseConfig({ caseId: activeCaseId });
        break;
      case 'sld-view':
        window.location.hash = ROUTES.SLD_VIEW.hash;
        break;
      case 'catalog':
        navigateToCatalog();
        break;
      case 'results':
      case 'analysis':
        openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
          titlePl: 'Analizy techniczne',
          tabId: ANALYSIS_ROUTE_DEFAULT_TAB,
          entityRef: getCurrentSearchParams().get('sel'),
          subjectKind: 'analysis_run',
          subjectRef: effectiveRunId,
          payload: {
            runId: effectiveRunId,
            legacyRoute: ROUTES.ANALYSIS.hash,
            selectedName: getCurrentSearchParams().get('name'),
            selectedType: getCurrentSearchParams().get('type'),
          },
        });
        navigateToAnalysis({ runId: effectiveRunId });
        break;
      case 'compare':
        navigateToCompare({ runId: effectiveRunId });
        break;
      case 'report':
      case 'export':
        setActiveArea('RAPORTY_UZASADNIENIA');
        openRouteSurface(REPORT_SURFACE_SCREEN_CODE, {
          entityRef: getCurrentSearchParams().get('sel'),
          subjectKind: 'report',
          subjectRef: effectiveRunId,
          payload: {
            runId: effectiveRunId,
            selectedName: getCurrentSearchParams().get('name'),
            selectedType: getCurrentSearchParams().get('type'),
          },
        });
        navigateToReport({ runId: effectiveRunId });
        break;
      case 'variants':
        navigateToVariants({ caseId: activeCaseId });
        break;
      case 'readiness':
      case 'show-readiness':
        setActiveArea('WYNIKI_ANALIZY');
        openRouteSurface('E-04', {
          titlePl: 'Konfiguracja techniczna układu',
          tabId: 'kontrola',
          subjectKind: 'analysis_case',
          subjectRef: activeCaseId,
          route: 'analysis',
          openMode: 'replace_right_panel',
        });
        navigateToAnalysis({ caseId: activeCaseId, runId: effectiveRunId });
        break;
      case 'proof':
      case 'whitebox':
        navigateToProof({ runId: effectiveRunId });
        break;
      case 'protection':
        navigateToResultsProtection({ runId: effectiveRunId });
        break;
      case 'run-sc-3f':
      case 'run-sc-1f':
      case 'run-power-flow':
        handleCalculate();
        break;
      case 'navigator':
      case 'inspector':
        // Toggle panels — handled by layout
        break;
      default:
        if (import.meta.env.DEV) {
          console.debug(`[handleMenuAction] Unhandled action: ${actionId}`);
        }
    }
  }, [
    activeCaseId,
    handleCalculate,
    effectiveRunId,
    navigateToAnalysis,
    navigateToCaseConfig,
    navigateToCatalog,
    navigateToCompare,
    navigateToNetworkBuild,
    openRouteSurface,
    navigateToProof,
    navigateToReport,
    navigateToResultsProtection,
    navigateToSwitchgear,
    navigateToVariants,
  ]);

  // Common layout props for CanonicalLayout
  const layoutProps = {
    onCalculate: handleCalculate,
    onViewResults: handleViewResults,
    projectName: projectName ?? undefined,
    validationStatus: validationStatus,
    validationWarnings: readiness?.warnings?.length ?? 0,
    validationErrors: readiness?.blockers?.length ?? 0,
    onMenuAction: handleMenuAction,
    networkStats: networkStats,
  };

  // Inspektor modelu ENM (v4.2 — diagnostyka inżynierska)
  // Zadanie 11 planu UI/UX 100%: dev tool ukryty domyślnie za feature flag.
  if (route === '#enm-inspector' && featureFlags.ENM_INSPECTOR_VISIBLE) {
    return wrapWithReadyIndicator(
      <CanonicalLayout {...layoutProps}>
        <EnmInspectorPage />
      </CanonicalLayout>
    );
  }

  // Kreator Stacji KOMPLETNY v2 — 17-krokowy flow inżynierski
  // (UI/UX 100% Zadanie 9 — wpięcie StationWizardSurface).
  if (route === '#kreator-stacji-v2') {
    return wrapWithReadyIndicator(
      <CanonicalLayout {...layoutProps}>
        <StationWizardSurface />
      </CanonicalLayout>
    );
  }

  // PR-24: Scenariusze zwarciowe (Fault Scenarios)
  if (route === '#fault-scenarios') {
    return wrapWithReadyIndicator(
      <CanonicalLayout {...layoutProps}>
        <div className="flex flex-col h-full">
          <FaultScenariosPanel studyCaseId={null} />
          <FaultScenarioModal />
        </div>
      </CanonicalLayout>
    );
  }

  // E-00: Pulpit projektu (Dashboard) — renderowany dla #dashboard ORAZ
  // domyślnie gdy brak aktywnego projektu (etap 2 dostawy).
  if (route === '#dashboard' || (route === '' && !activeProjectId)) {
    return wrapWithReadyIndicator(
      <CanonicalLayout {...layoutProps}>
        <ProjectDashboardSurface />
      </CanonicalLayout>
    );
  }

  // SLD_READ_ONLY_UI: Podglad schematu jednokreskowego (tylko odczyt)
  if (route === '#sld-view') {
    return wrapWithReadyIndicator(
      <CanonicalLayout {...layoutProps}>
        <SldWorkspaceContainer readOnly />
      </CanonicalLayout>
    );
  }

  const isKnownRoute = getRouteByHash(route) !== null || isAnalysisRouteAlias(route);

  if (!isKnownRoute) {
    return wrapWithReadyIndicator(
      <CanonicalLayout {...layoutProps}>
        <UnknownRoutePage route={route} />
      </CanonicalLayout>
    );
  }
  // CANONICAL_LAYOUT: domyślna trasa "" / "#sld" → środowisko SLD (E-01).
  // Etap 1 dostawy: SldWorkspaceContainer renderuje SldCanvasV2 z menu
  // kontekstowym i drill-downem stacji. Adapter danych snapshot → propsy
  // rendererów dostarcza Etap 3 roadmapy.
  return wrapWithReadyIndicator(
    <CanonicalLayout {...layoutProps}>
      <SldWorkspaceContainer />
    </CanonicalLayout>
  );
}

export default App;
