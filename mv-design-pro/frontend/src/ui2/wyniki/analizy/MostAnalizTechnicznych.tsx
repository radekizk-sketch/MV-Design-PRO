/**
 * MostAnalizTechnicznych — dostawca zakładki „Widoki klasyczne" warsztatu
 * Wyników (dawna zakładka „Pozostałe analizy" / hub „Analizy techniczne").
 *
 * Reguła renderowania (bez zmian klas powierzchni mostu):
 *  - REJESTR WIDOKÓW KLASYCZNYCH (`WIDOKI_KLASYCZNE`) — gdy brak aktywnej
 *    powierzchni trasowej ALBO aktywna jest domyślna powierzchnia analiz E-35 z
 *    domyślną zakładką „results" (dawny hub — dokładnie ten widok zastępujemy),
 *  - ROUTER (WorkspaceSurfaceRouter region="main") + pasek powrotu — dla
 *    powierzchni klasy C (openMode 'expand_workspace', np. E-28, taby
 *    compare/trace/ncrfg-tests); powrót czyści powierzchnię trasową,
 *  - REJESTR + pasek „Zamknij panel analizy" — dla powierzchni klasy B (openMode
 *    'replace_right_panel', np. E-31): powierzchnia żyje w PRAWYM panelu powłoki,
 *    więc środek zakładki nie dubluje routera panelu (karta F-E5c §0).
 *
 * Deep-linki (#analysis?tab=trace itd.) działają bez zmian — orkiestrator
 * otwiera powierzchnię z jawnym tabId, a warsztat przełącza się na tę zakładkę.
 */

import './analizy.css';

import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { WorkspaceSurfaceRouter } from '../../../ui/workspace';
import { WIDOKI_KLASYCZNE, jestDawnymHubem, type WidokKlasyczny } from './model';
import { ANALIZY_STRINGS as T } from './strings';

function KartaWidoku({ widok, onOtworz }: { widok: WidokKlasyczny; onOtworz: () => void }) {
  return (
    <article className="mvd-analizy-karta" data-testid={widok.testid}>
      <div className="mvd-analizy-karta-glowa">
        <h5>{widok.tytul}</h5>
      </div>
      <p className="mvd-analizy-karta-opis">{widok.opis}</p>
      <div className="mvd-analizy-karta-stopka">
        <button type="button" className="mvd-analizy-otworz" onClick={onOtworz}>
          {T.otworz}
        </button>
      </div>
    </article>
  );
}

/** Rejestr widoków klasycznych — widok domyślny zakładki. */
export function WidokiKlasyczne() {
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  return (
    <div className="mvd-analizy" data-testid="mvd-analizy-widoki-klasyczne">
      <header className="mvd-analizy-head">
        <h2>{T.tytul}</h2>
        <p>{T.cel}</p>
      </header>
      <div className="mvd-analizy-karty">
        {WIDOKI_KLASYCZNE.map((widok) => (
          <KartaWidoku
            key={widok.testid}
            widok={widok}
            onOtworz={() =>
              widok.tabId ? openRouteSurface(widok.ekran, { tabId: widok.tabId }) : openRouteSurface(widok.ekran)
            }
          />
        ))}
      </div>
    </div>
  );
}

export function MostAnalizTechnicznych() {
  const activeSurface = useNetworkBuildStore((s) => s.activeSurface);
  const clearRouteManagedSurface = useNetworkBuildStore((s) => s.clearRouteManagedSurface);

  if (jestDawnymHubem(activeSurface)) {
    return (
      <div data-testid="workspace-surface-main" className="mvd-legacy-host">
        <WidokiKlasyczne />
      </div>
    );
  }

  // Powierzchnia klasy B (panel prawy) — środek pokazuje rejestr, nie router.
  if (activeSurface?.openMode === 'replace_right_panel') {
    return (
      <div className="mvd-legacy-host" data-testid="mvd-analizy-most-panel">
        <div className="mvd-analizy-powrot">
          <button type="button" onClick={clearRouteManagedSurface} title={T.zamknijPanelOpis}>
            {T.zamknijPanel}
          </button>
        </div>
        <div data-testid="workspace-surface-main">
          <WidokiKlasyczne />
        </div>
      </div>
    );
  }

  // Powierzchnia klasy C (rozszerzenie warsztatu) — router w środku.
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
