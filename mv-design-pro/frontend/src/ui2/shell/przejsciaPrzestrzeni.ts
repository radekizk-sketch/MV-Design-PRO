/*
 * Przejścia między przestrzeniami powłoki — WSPÓLNA prawda nawigacji: jawny
 * wybór przestrzeni w `AppShell`, przejścia „następnego kroku" (Schemat →
 * Gotowość) i akcje paneli kontekstu idą TĄ SAMĄ ścieżką. Zero drugiej logiki.
 *
 * D1 (kanon nawigacji): kierunek przestrzeń → trasa jest ODWROTNOŚCIĄ tabeli
 * `ui2/legacy/mostObszarow.TRASY_KANONICZNE`, która niesie kierunek trasa →
 * przestrzeń. Oba warunki pochodzą z JEDNEGO wiersza (reguła KLASA-NIE-INSTANCJA
 * §3 „predykaty parami"): wcześniej lista tras do wyczyszczenia była osobnym,
 * ręcznie utrzymywanym zbiorem pięciu napisów, więc każda trasa spoza tej listy
 * (np. `#report`) potrafiła po wyborze innej przestrzeni ODBIĆ użytkownika z
 * powrotem — trasa wymuszała swoją przestrzeń, a powłoka jej nie czyściła.
 *
 * Zero fizyki, zero mutacji modelu.
 */

import { useAppStateStore } from '../../ui/app-state';
import {
  getCurrentHashRoute,
  getCurrentSearchParams,
  navigateToAnalysis,
  navigateToCaseConfig,
  navigateToNetworkBuild,
} from '../../ui/navigation';
import { przestrzenDlaTrasy } from '../legacy/mostObszarow';
import type { SpaceId } from './spaces';
import { useShellStore } from './useShellStore';

/**
 * Czyści TRASĘ zachowując kontekst adresu. Deep-link (`?case&run&sel&snapshot`)
 * żyje w części zapytania hasha, więc `window.location.hash = ''` gubił go w
 * całości — a to jedyny nośnik kontekstu po odświeżeniu strony. Zostawiamy sam
 * kontekst (`#?run=…`), co `getCurrentHashRoute` czyta jako „brak trasy".
 */
function wyczyscTraseZachowujacKontekst(): void {
  const zapytanie = getCurrentSearchParams().toString();
  window.location.hash = zapytanie ? `?${zapytanie}` : '';
}

/**
 * Most tras: JAWNY wybór przestrzeni ustawia trasę legacy — jedna prawda
 * nawigacji (orkiestrator otwiera powierzchnie). Montaż zawartości NIE nawiguje,
 * aby nie nadpisywać deep-linków (#analysis?run=…, itd.).
 */
export function mostTrasyPrzestrzeni(space: SpaceId): void {
  const stan = useAppStateStore.getState();
  switch (space) {
    case 'schemat':
      navigateToNetworkBuild();
      return;
    case 'obliczenia':
      navigateToCaseConfig({ caseId: stan.activeCaseId });
      return;
    case 'wyniki':
      navigateToAnalysis({ runId: stan.activeRunId });
      return;
    case 'model':
    case 'dokumentacja':
    case 'gotowosc':
    case 'projekt':
      // Przestrzenie sterowane store'ami/zawartością — bez własnej trasy.
      // Trasa, która należy do INNEJ przestrzeni, musi zniknąć: w
      // `LegacyWarsztat` trasa nadrzędna nadpisuje zawartość przestrzeni, a
      // orkiestrator wymusza przestrzeń trasy — bez czyszczenia wybór „Model
      // sieci" przy trasie `#sld` (albo „Gotowość" przy `#report`) wracał na
      // poprzedni ekran. Trasę należącą do TEJ przestrzeni (np. `#catalog` w
      // „Model sieci", `#report` w „Dokumentacji") zostawiamy — niesie kontekst.
      if (typeof window === 'undefined') {
        return;
      }
      if (przestrzenDlaTrasy(getCurrentHashRoute()) !== space) {
        wyczyscTraseZachowujacKontekst();
      }
      return;
  }
}

/**
 * Pełne przejście do przestrzeni: aktywacja w powłoce + most tras — ta sama
 * para wywołań co `AppShell.selectSpace` → `AppRoot.onActiveSpaceChange`.
 */
export function przejdzDoPrzestrzeni(space: SpaceId): void {
  useShellStore.getState().setActiveSpace(space);
  mostTrasyPrzestrzeni(space);
}
