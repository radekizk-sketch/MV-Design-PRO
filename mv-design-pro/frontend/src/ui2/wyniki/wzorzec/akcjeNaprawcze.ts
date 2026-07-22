/*
 * Rejestr AKCJI NAPRAWCZYCH pętli decyzji (karta K1 / A3, F-E6.3).
 *
 * BÓL PERSONY (AUDYT_FLOW_INZYNIER_PROJEKTANT_2026-07 §2 A3): akcja „Popraw
 * w modelu" była zawsze OGÓLNA (selekcja + „Schemat"), a inżynier-ekspert
 * oczekuje akcji WŁAŚCIWEJ dla rodzaju przekroczenia. Ten moduł mapuje rodzaj
 * przekroczenia → opis akcji (etykieta PL + cel nawigacji), a `usePoprawWModelu`
 * wykonuje kroki. Czysty moduł (bez React, bez store'ów) — testowalny wprost.
 *
 * RODZAJE wyprowadzone z REALNYCH źródeł werdyktów (zero zgadywania):
 * - 'napiecie'                     — rozpływ `napiecePozaZakresem`
 *                                    (`rozplyw/strings.ts`), jakość
 *                                    `check_type=VOLTAGE_DEVIATION`, odbiór
 *                                    pomiar U (`odbior/api.ts`).
 * - 'obciazalnosc-galezi'          — jakość `check_type=BRANCH_LOADING`
 *                                    (element = gałąź liniowa).
 * - 'obciazalnosc-transformatora'  — jakość `check_type=TRANSFORMER_LOADING`.
 * - 'migotanie'                    — jakość, sekcja migotania (P37,
 *                                    `verdict_pl` per węzeł).
 * - 'bilans-biernej'               — jakość `check_type=REACTIVE_BALANCE`.
 * (LOSS_BUDGET nie ma rodzaju: agregat systemowy bez elementu modelu —
 *  przycisk decyzji w ogóle się nie renderuje, patrz `typElementuWalidacji`.)
 *
 * RECON POWIERZCHNI OSIĄGALNYCH PROGRAMOWO (§0.2 karty K1 — ZERO fabrykacji):
 * 1. Selekcja + zoom SLD + przestrzeń „Schemat" — `useSelectionStore.selectElement`
 *    + `centerSldOnElement` + `useShellStore.setActiveSpace('schemat')`
 *    (dzisiejsza akcja generyczna; property-grid z doborem katalogowym otwiera
 *    się z selekcji w przestrzeni „Schemat").
 * 2. Zakładka przestrzeni „Wyniki" — `useShellStore.setWynikiTab(...)`
 *    + `setActiveSpace('wyniki')` (deep-link konsumowany przez
 *    `spaces/wyniki/WynikiWarsztat.tsx`; ten sam mechanizm, którego używa
 *    `spaces/dokumentacja/HubDokumentacji.tsx`).
 * Programowego wejścia WPROST w konfigurator elementu (dobór odcinka/kabla/
 * transformatora) NIE ma — dobór odbywa się w property-gridzie po selekcji
 * (droga nr 1), więc te rodzaje pozostają przy akcji generycznej. Ekran nastaw
 * zabezpieczeń (E-27/E-28 przez `openRouteSurface`) istnieje, ale ŻADEN z
 * konsumentów pętli nie niesie werdyktu miskoordynacji — mapowanie byłoby
 * fabrykacją, więc go nie ma.
 */

import { WZORZEC_STRINGS } from './strings';

/** Rodzaj przekroczenia — wyprowadzony z realnych źródeł werdyktów (nagłówek). */
export type RodzajPrzekroczenia =
  | 'napiecie'
  | 'obciazalnosc-galezi'
  | 'obciazalnosc-transformatora'
  | 'migotanie'
  | 'bilans-biernej';

/** Cel nawigacji akcji naprawczej — wyłącznie powierzchnie osiągalne programowo. */
export type CelAkcjiNaprawczej =
  /** Selekcja + zoom SLD + przestrzeń „Schemat" (akcja generyczna, F-E6.1). */
  | { readonly rodzaj: 'schemat' }
  /** Selekcja + zakładka przestrzeni „Wyniki" (deep-link `setWynikiTab`). */
  | { readonly rodzaj: 'wyniki-zakladka'; readonly zakladka: string };

/** Opis akcji naprawczej: etykieta przycisku (PL) + opis (title) + cel nawigacji. */
export interface AkcjaNaprawcza {
  readonly etykieta: string;
  readonly opis: string;
  readonly cel: CelAkcjiNaprawczej;
}

/** Akcja generyczna (zachowanie F-E6.1 sprzed karty K1 — 1:1). */
export const AKCJA_GENERYCZNA: AkcjaNaprawcza = {
  etykieta: WZORZEC_STRINGS.poprawWModelu,
  opis: WZORZEC_STRINGS.poprawWModeluOpis,
  cel: { rodzaj: 'schemat' },
};

/**
 * Akcja kontekstowa bilansu mocy biernej: okno „Dobór kompensacji"
 * (`ui2/oze/kompensacja/EkranKompensacji`, zakładka `kompensacja` przestrzeni
 * „Wyniki" — realny ekran doboru kompensacji, karta U4 P42/D8). Etykieta
 * kontekstowa, bo akcja FAKTYCZNIE różni się od generycznej (§0.5 karty K1).
 */
const AKCJA_DOBOR_KOMPENSACJI: AkcjaNaprawcza = {
  etykieta: 'Popraw w modelu — dobór kompensacji',
  opis: 'Zaznacz węzeł i przejdź do okna „Dobór kompensacji" (przestrzeń Wyniki), aby dobrać kompensację mocy biernej.',
  cel: { rodzaj: 'wyniki-zakladka', zakladka: 'kompensacja' },
};

/**
 * Registry rodzaj → akcja. Rodzaje bez realnego, programowego wejścia
 * w dedykowany konfigurator zostają przy akcji generycznej (dobór odcinka/
 * kabla/transformatora/modułu OZE odbywa się w property-gridzie po selekcji
 * na schemacie — recon w nagłówku pliku).
 */
const REJESTR: Record<RodzajPrzekroczenia, AkcjaNaprawcza> = {
  napiecie: AKCJA_GENERYCZNA,
  'obciazalnosc-galezi': AKCJA_GENERYCZNA,
  'obciazalnosc-transformatora': AKCJA_GENERYCZNA,
  migotanie: AKCJA_GENERYCZNA,
  'bilans-biernej': AKCJA_DOBOR_KOMPENSACJI,
};

/**
 * Zwraca opis akcji naprawczej dla rodzaju przekroczenia.
 * Brak rodzaju (konsumenci sprzed K1) = akcja generyczna — zachowanie 1:1.
 */
export function akcjaNaprawcza(rodzaj?: RodzajPrzekroczenia): AkcjaNaprawcza {
  return rodzaj ? REJESTR[rodzaj] : AKCJA_GENERYCZNA;
}
