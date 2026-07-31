/*
 * Przejścia między przestrzeniami powłoki (karta K4) — WSPÓLNA prawda mostu
 * tras (wyniesiona 1:1 z `AppRoot.mostTrasyPrzestrzeni`, E1.7c), aby przejścia
 * „następnego kroku" (np. Schemat → Gotowość, K4-E2) używały tej samej ścieżki
 * co jawny wybór przestrzeni w AppShell — zero drugiej logiki nawigacji.
 *
 * K4-E2 (naprawa u źródła — Zero-Debt): trasy legacy z listy `TRASY_NADRZEDNE`
 * NADPISUJĄ zawartość przestrzeni w `LegacyWarsztat.TrasaLubPrzestrzen`
 * (np. `#sld` renderuje kanwę SLD niezależnie od przestrzeni). Przestrzenie
 * sterowane store'ami (gotowość / projekt / dokumentacja) nie ustawiają
 * własnej trasy, więc wybór np. „Gotowość" przy trasie `#sld` zostawiał na
 * ekranie kanwę SLD — łańcuch E2→E3 był zerwany. Przy przejściu do takiej
 * przestrzeni czyścimy trasę nadrzędną (hash pusty = zawartość wg przestrzeni,
 * jak przy zimnym starcie `/`). Zero fizyki, zero mutacji modelu.
 */

import { useAppStateStore } from '../../ui/app-state';
import {
  getCurrentHashRoute,
  navigateToAnalysis,
  navigateToCaseConfig,
  navigateToNetworkBuild,
} from '../../ui/navigation';
import type { SpaceId } from './spaces';
import { useShellStore } from './useShellStore';

/**
 * Trasy legacy renderowane w `TrasaLubPrzestrzen` PRZED zawartością
 * przestrzeni (LegacyWarsztat.tsx) — muszą zostać wyczyszczone, aby
 * przestrzeń bez własnej trasy mogła pokazać swoją zawartość.
 */
const TRASY_NADRZEDNE: ReadonlySet<string> = new Set([
  '#sld',
  '#sld-view',
  '#dashboard',
  '#fault-scenarios',
  '#enm-inspector',
]);

/**
 * Most tras (E1.7c): JAWNY wybór przestrzeni ustawia trasę legacy — jedna
 * prawda nawigacji (orkiestrator otwiera powierzchnie). Montaż zawartości
 * NIE nawiguje, aby nie nadpisywać deep-linków (#analysis?run=..., itd.).
 */
export function mostTrasyPrzestrzeni(space: SpaceId): void {
  const stan = useAppStateStore.getState();
  switch (space) {
    case 'schemat':
      navigateToNetworkBuild();
      break;
    case 'obliczenia':
      navigateToCaseConfig({ caseId: stan.activeCaseId });
      break;
    case 'wyniki':
      navigateToAnalysis({ runId: stan.activeRunId });
      break;
    case 'model':
    case 'dokumentacja':
    case 'gotowosc':
    case 'projekt':
      // Zawartość sterowana store'ami/przestrzenią — bez własnej trasy.
      // F-E8.1: „Dokumentacja" ląduje na hubie prowadzącym (MostDokumentacji);
      // dostawcy raportu/dowodu (E-37/E-36) otwierają karty huba przez
      // openRouteSurface, nie auto-nawigacja do legacy generatora.
      // K4-E2: trasa nadrzędna (np. '#sld') nadpisałaby zawartość przestrzeni —
      // czyścimy ją, aby przestrzeń wygrała.
      //
      // KD-3 (Zero-Debt, naprawa u źródła): „Model sieci" NALEŻY do tej grupy.
      // Wcześniej dzielił gałąź ze „Schematem" i ustawiał trasę `#sld`, a ta w
      // `LegacyWarsztat.TrasaLubPrzestrzen` jest rozpatrywana PRZED zawartością
      // przestrzeni — więc jawny wybór „Model sieci" z nawigacji pokazywał kanwę
      // schematu, a WARSZTAT MODELU (właściwości · szablony · KATALOG) był
      // nieosiągalny kliknięciem. Widać go było wyłącznie przy zimnym starcie z
      // pustym hashem, dlatego defekt przetrwał: testy montowały `ModelWarsztat`
      // bezpośrednio, zamiast wchodzić realną ścieżką nawigacji.
      if (typeof window !== 'undefined' && TRASY_NADRZEDNE.has(getCurrentHashRoute())) {
        window.location.hash = '';
      }
      break;
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
