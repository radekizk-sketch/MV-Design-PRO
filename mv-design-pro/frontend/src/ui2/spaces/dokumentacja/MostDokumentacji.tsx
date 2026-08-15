/**
 * MostDokumentacji — dostawca przestrzeni „Dokumentacja" (karta F-E8.1).
 * Wzorzec identyczny z `MostAnalizTechnicznych` (Opcja 1: ekrany-dostawcy
 * mostu pozostają; zmienia się WIDOK DOMYŚLNY przestrzeni na hub prowadzący).
 *
 * Reguła renderowania:
 *  - HUB (`HubDokumentacji`) — gdy brak aktywnej powierzchni dokumentu
 *    (domyślny widok przestrzeni). Foreign surface (z innej przestrzeni) NIE
 *    jest dublowany — przestrzeń dokumentacji pokazuje własny hub,
 *  - OKNO WŁASNE ui2 (KD-4, luka L-15): generator raportu — karta „Raport
 *    analizy technicznej" prowadzi do okna powłoki, nie do powierzchni mostu
 *    E-37 (ta zostaje osiągalna starym adresem),
 *  - ROUTER (`WorkspaceSurfaceRouter region="main"`) + pasek powrotu — gdy
 *    aktywna jest powierzchnia dokumentu otwarta z karty huba (E-36 pakiet
 *    dowodowy); powrót czyści powierzchnię trasową → wraca hub.
 *
 * ZERO fizyki — wyłącznie nawigacja i interpretacja stanu.
 */

import { useState } from 'react';

import './dokumentacja.css';

import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { WorkspaceSurfaceRouter } from '../../../ui/workspace';
import { GeneratorRaportu } from './generator';
import { HubDokumentacji } from './HubDokumentacji';
import type { OknoDokumentacji } from './model';
import { DOK_STRINGS as T } from './strings';

/** Kody ekranów-dostawców dokumentów otwieranych z kart huba (realne
 *  powierzchnie mostu: E-37 generator mostu, E-36 pakiet dowodowy). */
const DOKUMENT_SCREEN_CODES = new Set<string>(['E-37', 'E-36']);

export function MostDokumentacji() {
  const activeSurface = useNetworkBuildStore((s) => s.activeSurface);
  const clearRouteManagedSurface = useNetworkBuildStore((s) => s.clearRouteManagedSurface);
  const [okno, setOkno] = useState<OknoDokumentacji | null>(null);

  const jestDokument =
    activeSurface != null && DOKUMENT_SCREEN_CODES.has(activeSurface.screenCode);

  // Powierzchnia mostu (stary adres / deep-link) ma pierwszeństwo — inaczej
  // użytkownik nie zobaczyłby tego, co jawnie otworzył.
  if (!jestDokument && okno !== null) {
    return (
      <div data-testid="workspace-surface-main" className="mvd-legacy-host">
        <div className="mvd-dok-powrot">
          <button type="button" onClick={() => setOkno(null)} title={T.powrotOpis}>
            {T.powrot}
          </button>
        </div>
        <GeneratorRaportu />
      </div>
    );
  }

  if (!jestDokument) {
    return (
      <div data-testid="workspace-surface-main" className="mvd-legacy-host">
        <HubDokumentacji onOtworzOkno={setOkno} />
      </div>
    );
  }

  return (
    <div className="mvd-legacy-host" data-testid="mvd-dok-most-dziecko">
      <div className="mvd-dok-powrot">
        <button type="button" onClick={clearRouteManagedSurface} title={T.powrotOpis}>
          {T.powrot}
        </button>
      </div>
      <WorkspaceSurfaceRouter region="main" />
    </div>
  );
}
