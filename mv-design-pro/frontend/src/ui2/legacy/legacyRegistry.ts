/**
 * Rejestr mostu legacy (karta E1.7b) — JAWNA lista długu do wygaszenia.
 *
 * Mapowanie przestrzeni nowej powłoki na obszary/powierzchnie starego UI
 * wg rekonesansu karty E1.7 §3a. Każda przestrzeń MUSI mieć wpis:
 * albo `nowa-powloka` (zawartość dostarczona przez ui2), albo `legacy`
 * (LegacySurface montuje istniejące powierzchnie z `ui/**` bez ich modyfikacji).
 *
 * Wygaszanie: karty U2–U4 przejmują funkcje okno po oknie; wpis zmienia
 * `zrodlo` na `nowa-powloka` dopiero, gdy nowe okna pokrywają funkcję
 * (macierz pokrycia, zero utraty funkcji).
 *
 * Stan po E1.7c: stara rama (App/AppShellV12/CanonicalLayout/TopBar/
 * NavigationRail/StatusBarV12/ActiveCaseBar) SKASOWANA. Mosty aktywne:
 * LegacyWarsztat (trasy legacy + powierzchnie), LegacyInspektor (panel prawy),
 * LegacyPasekNarzedzi (pasek przepływu + wyszukiwanie ENM/przegląd zbiorczy/
 * metadane/historia), LegacyChrome (powiadomienia/pomoc/nakładki/skróty),
 * SchematContextPanel (panel kontekstu schematu w lewym panelu),
 * AreaContextPanel i panele obszarów pozostają jako funkcje do przejęcia w U2.
 */

import { SPACE_IDS, type SpaceId } from '../shell/spaces';

export type ZrodloPrzestrzeni = 'nowa-powloka' | 'legacy';

export interface WpisRejestruLegacy {
  przestrzen: SpaceId;
  zrodlo: ZrodloPrzestrzeni;
  /** Obszary starej nawigacji (areaRegistry) pokrywane przez przestrzeń (§3a). */
  obszaryLegacy: readonly string[];
  /** Co jest zamontowane w warsztacie (komponent/powierzchnia). */
  montaz: string;
  /** Plan wygaszenia mostu (faza programu). */
  wygaszenie: string;
}

export const REJESTR_LEGACY: Readonly<Record<SpaceId, WpisRejestruLegacy>> = {
  projekt: {
    przestrzen: 'projekt',
    zrodlo: 'nowa-powloka',
    obszaryLegacy: ['pulpit projektu (E-00)'],
    montaz: 'PulpitProjektu (E2.1) + nowy/otwórz projekt (E2.2)',
    wygaszenie: 'zrealizowane w U1 (E2.x)',
  },
  model: {
    przestrzen: 'model',
    zrodlo: 'legacy',
    obszaryLegacy: ['MODEL_SIECI', 'KATALOGI_TECHNICZNE'],
    montaz: 'SldWorkspaceContainer (kanwa budowy sieci; katalogi przez akcje kanwy)',
    wygaszenie: 'U2: okna modelu sieci i przeglądarka katalogów w nowej powłoce (po E1.7c: kanwa + pasek przepływu pracy przez mosty)',
  },
  schemat: {
    przestrzen: 'schemat',
    zrodlo: 'legacy',
    obszaryLegacy: ['SCHEMAT_TOPOLOGIA'],
    montaz: 'SldWorkspaceContainer (schemat jednokreskowy — osobny wątek SLD)',
    wygaszenie: 'U3/wątek SLD: nowa rama edytora schematu (bez zmian wnętrza ui/sld)',
  },
  gotowosc: {
    przestrzen: 'gotowosc',
    zrodlo: 'nowa-powloka',
    obszaryLegacy: ['gotowość rozproszona w MODEL_SIECI (panel kontroli technicznej)'],
    montaz: 'PanelGotowosci (E6.1): braki wg celów, postęp per cel, akcje naprawcze',
    wygaszenie: 'zrealizowane w U2 (most EngineeringReadinessPanel usunięty)',
  },
  obliczenia: {
    przestrzen: 'obliczenia',
    zrodlo: 'nowa-powloka',
    obszaryLegacy: ['STUDIA_OBLICZENIOWE (konfiguracja + przebiegi)'],
    montaz:
      'MenedzerPrzypadkow (E7.1) + PrzebiegiPanel (E7.2: historia z parametrami, odcisk odtwarzalności, na żywo z magistrali)',
    wygaszenie: 'zrealizowane w U2 w całości (most RunHistoryPanel usunięty)',
  },
  wyniki: {
    przestrzen: 'wyniki',
    zrodlo: 'legacy',
    obszaryLegacy: [
      'STUDIA_OBLICZENIOWE (wyniki)',
      'WYNIKI_ANALIZY',
      'ZABEZPIECZENIA_AUTOMATYKA',
      'ZRODLA_PRZYLACZENIA',
      'V126Academic',
    ],
    montaz: 'WorkspaceSurfaceRouter (powierzchnia analiz przez trasę #analysis)',
    wygaszenie: 'U3/E9: nowe okna wyników i dowodów',
  },
  dokumentacja: {
    przestrzen: 'dokumentacja',
    zrodlo: 'legacy',
    obszaryLegacy: ['RAPORTY_UZASADNIENIA', 'HISTORIA_AUDYT'],
    montaz: 'WorkspaceSurfaceRouter (generator raportu przez trasę #report)',
    wygaszenie: 'U4: nowe okna dokumentacji i audytu',
  },
};

/** Wszystkie przestrzenie mają wpis — sprawdzane testem rejestru (E1.7b §4). */
export const PRZESTRZENIE_Z_WPISEM: readonly SpaceId[] = SPACE_IDS.filter(
  (space) => REJESTR_LEGACY[space] != null,
);
