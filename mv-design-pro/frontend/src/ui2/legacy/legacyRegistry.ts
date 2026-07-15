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
    wygaszenie: 'U2: okna modelu sieci i przeglądarka katalogów w nowej powłoce',
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
    zrodlo: 'legacy',
    obszaryLegacy: ['gotowość rozproszona w MODEL_SIECI (panel kontroli technicznej)'],
    montaz: 'EngineeringReadinessPanel zasilany z useSnapshotStore.readiness (adapter)',
    wygaszenie: 'U2: przestrzeń Gotowość z pełną macierzą gotowości i akcjami naprawczymi',
  },
  obliczenia: {
    przestrzen: 'obliczenia',
    zrodlo: 'legacy',
    obszaryLegacy: ['STUDIA_OBLICZENIOWE (konfiguracja + przebiegi)'],
    montaz: 'CaseConfigPage + RunHistoryPanel (study-cases)',
    wygaszenie: 'U2/E7: nowe okna przypadków i kolejki przebiegów',
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
