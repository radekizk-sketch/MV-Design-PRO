/**
 * MostAnalizTechnicznych — dostawca zakładki „Pozostałe analizy" po przebudowie
 * (Opcja 1: ekran kanoniczny E-35 pozostaje; zmienia się dostawca WIDOKU
 * DOMYŚLNEGO zakładki, jak przy E-26 → EkranFrt).
 *
 * Reguła renderowania:
 *  - HUB (EkranAnalizTechnicznych) — gdy brak aktywnej powierzchni trasowej
 *    ALBO aktywna jest domyślna powierzchnia analiz E-35 z domyślną zakładką
 *    „results" (dawny hub — dokładnie ten widok zastępujemy),
 *  - ROUTER (WorkspaceSurfaceRouter) + pasek powrotu — dla powierzchni-dzieci
 *    (E-28…E-34, taby compare/trace/ncrfg-tests i inne trasy mostu); powrót
 *    czyści powierzchnię trasową (clearRouteManagedSurface) → wraca hub.
 *
 * Deep-linki (#analysis?tab=trace itd.) działają bez zmian — orkiestrator
 * otwiera powierzchnię z jawnym tabId, więc router ją renderuje.
 */

import './analizy.css';

import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { WorkspaceSurfaceRouter } from '../../../ui/workspace';
import { ANALYSIS_SURFACE_SCREEN_CODE } from '../../../ui/workspace/types';
import { EkranAnalizTechnicznych } from './EkranAnalizTechnicznych';
import { ANALIZY_STRINGS as T } from './strings';

/** Czy aktywna powierzchnia to dawny hub E-35 (widok domyślny zakładki). */
function jestDawnymHubem(
  surface: { screenCode: string; tabId: string | null } | null,
): boolean {
  if (!surface) return true;
  return (
    surface.screenCode === ANALYSIS_SURFACE_SCREEN_CODE
    && (surface.tabId == null || surface.tabId === 'results')
  );
}

export function MostAnalizTechnicznych() {
  const activeSurface = useNetworkBuildStore((s) => s.activeSurface);
  const clearRouteManagedSurface = useNetworkBuildStore((s) => s.clearRouteManagedSurface);

  if (jestDawnymHubem(activeSurface)) {
    return (
      <div data-testid="workspace-surface-main" className="mvd-legacy-host">
        <EkranAnalizTechnicznych />
      </div>
    );
  }

  return (
    <div className="mvd-legacy-host" data-testid="mvd-analizy-most-dziecko">
      <div className="mvd-analizy-powrot">
        <button type="button" onClick={clearRouteManagedSurface} title={T.powrotOpis}>
          {T.powrot}
        </button>
      </div>
      <WorkspaceSurfaceRouter region="main" />
    </div>
  );
}
