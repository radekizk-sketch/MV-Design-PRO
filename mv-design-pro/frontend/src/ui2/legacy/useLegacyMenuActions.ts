/**
 * Akcje menu starej powłoki (karta E1.7c) — PRZENIESIONE z `App.tsx`
 * (handleMenuAction + openSldOverlayFromCurrentContext) po kasacji starej ramy.
 *
 * Funkcja zachowana: te same identyfikatory akcji i te same efekty (nawigacja
 * tras legacy, otwieranie powierzchni, uruchamianie obliczeń). W nowej powłoce
 * akcje są osiągalne przez wyszukiwarkę poleceń (Ctrl+K) — pozycje
 * `POZYCJE_MENU_LEGACY` — oraz przycisk „Przelicz" paska tytułowego.
 */

import { useCallback } from 'react';

import { useAppStateStore } from '../../ui/app-state';
import { useExecutionRunsStore } from '../../ui/study-cases/runStore';
import {
  ROUTES,
  getCurrentSearchParams,
  navigateToAnalysis,
  navigateToCaseConfig,
  navigateToCatalog,
  navigateToNetworkBuild,
  navigateToReport,
  navigateToVariants,
} from '../../ui/navigation';
import { useNetworkBuildStore } from '../../ui/network-build/networkBuildStore';
import { useShellStore } from '../shell/useShellStore';
import { REPORT_SURFACE_SCREEN_CODE } from '../../ui/workspace/types';

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

export interface PozycjaMenuLegacy {
  /** Identyfikator akcji starego menu (kontrakt handleMenuAction). */
  akcjaId: string;
  /** Polska etykieta pozycji w wyszukiwarce poleceń. */
  etykietaPL: string;
}

/** Pozycje wyszukiwarki poleceń pokrywające akcje starego menu (zero utraty funkcji). */
export const POZYCJE_MENU_LEGACY: readonly PozycjaMenuLegacy[] = [
  { akcjaId: 'sld', etykietaPL: 'Budowa sieci (schemat)' },
  { akcjaId: 'sld-view', etykietaPL: 'Podgląd schematu (tylko odczyt)' },
  { akcjaId: 'overlay', etykietaPL: 'Nakładka wyników na schemacie' },
  { akcjaId: 'case-manager', etykietaPL: 'Konfiguracja zakresu obliczeń' },
  { akcjaId: 'catalog', etykietaPL: 'Katalogi techniczne' },
  { akcjaId: 'analysis', etykietaPL: 'Analizy techniczne' },
  { akcjaId: 'compare', etykietaPL: 'Porównanie przebiegów' },
  { akcjaId: 'report', etykietaPL: 'Generator raportu' },
  { akcjaId: 'variants', etykietaPL: 'Warianty i przebiegi' },
  { akcjaId: 'readiness', etykietaPL: 'Kontrola gotowości układu' },
  { akcjaId: 'proof', etykietaPL: 'Dowód obliczeniowy' },
  { akcjaId: 'protection', etykietaPL: 'Wyniki zabezpieczeń' },
];

/**
 * Hook akcji menu legacy — sygnatura i zachowanie identyczne z dawnym
 * `App.handleMenuAction(actionId)`.
 */
export function useLegacyMenuActions(handleCalculate: () => Promise<void>) {
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const executionActiveRunId = useExecutionRunsStore((state) => state.activeRunId);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  // K3-A2: akcje z zakładkowym dostawcą ui2 (wyniki/porównanie/dowód) prowadzą
  // do warsztatu przestrzeni „Wyniki" zamiast powierzchni trasowych mostu.
  const setActiveSpace = useShellStore((state) => state.setActiveSpace);
  const setWynikiTab = useShellStore((state) => state.setWynikiTab);
  const effectiveRunId = activeRunId ?? executionActiveRunId;

  return useCallback((actionId: string) => {
    switch (actionId) {
      case 'sld':
        navigateToNetworkBuild();
        break;
      case 'network-build':
        navigateToNetworkBuild();
        break;
      case 'overlay':
        // D1: `setActiveArea('SCHEMAT_TOPOLOGIA')` bylo REDUNDANTNE — ta sama
        // wartosc wynika z trasy `#sld` ustawianej linijke nizej (most obszarow).
        openSldOverlayFromCurrentContext();
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
        // K3-A2: lądowisko = warsztat ui2 (activeSpace 'wyniki'); trasa
        // #analysis pozostaje (deep-link + powierzchnia mostu w zakładce
        // „Pozostałe analizy" — otwiera ją orkiestrator z hasha, bez
        // dublowania openRouteSurface tutaj).
        setActiveSpace('wyniki');
        navigateToAnalysis({ runId: effectiveRunId });
        break;
      case 'compare':
        // K3-A2: zakładka ui2 „Porównanie A/B" zamiast trasy mostu #compare.
        setWynikiTab('porownanie');
        setActiveSpace('wyniki');
        break;
      case 'report':
      case 'export':
        // D1: obszar RAPORTY_UZASADNIENIA wynika z trasy `#report` (most obszarow),
        // ktora ustawia `navigateToReport` na koncu tej galezi.
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
        // D1: obszar WYNIKI_ANALIZY wynika z trasy `#analysis` (most obszarow).
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
        // K3-A2: zakładka ui2 „Dowód obliczeń" (kontekst = aktywny przebieg,
        // gdy jest) zamiast trasy mostu #proof.
        setWynikiTab('dowod', effectiveRunId);
        setActiveSpace('wyniki');
        break;
      case 'protection':
        // K8 (domknięcie długu K3 §A pkt 4): warsztat Wyników ma zakładkę
        // „Koordynacja zabezpieczeń" (EkranKoordynacji — dostawca ui2 ekranu
        // E-28), więc akcja prowadzi do niej zamiast do wygaszonej trasy
        // mostu #protection-results (ta renderowała generyczną tabelę E-35).
        setWynikiTab('koordynacja');
        setActiveSpace('wyniki');
        break;
      case 'run-sc-3f':
      case 'run-sc-1f':
      case 'run-power-flow':
        void handleCalculate();
        break;
      case 'navigator':
      case 'inspector':
        // Przełączanie paneli — obsługiwane przez powłokę.
        break;
      default:
        if (import.meta.env.DEV) {
          console.debug(`[useLegacyMenuActions] Nieobsłużona akcja: ${actionId}`);
        }
    }
  }, [
    activeCaseId,
    handleCalculate,
    effectiveRunId,
    openRouteSurface,
    setActiveSpace,
    setWynikiTab,
  ]);
}
