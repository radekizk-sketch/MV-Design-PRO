/**
 * Prądy wejściowe koordynacji zabezpieczeń — WYŁĄCZNIE z zakończonych biegów.
 *
 * NAPRAWA FABRYKACJI (karta F-K4 faza 3b, 2026-07-25). Strona koordynacji
 * tworzyła prądy zwarciowe i roboczy z `Math.random()` (komentarz w kodzie:
 * „Demo fault/operating currents"). Skutkiem były marginesy selektywności i
 * werdykty czułości policzone na LOSOWYCH danych — wynik wyglądał jak
 * obliczenie, a nie miał żadnego związku z siecią projektu. To gorsze niż brak
 * funkcji, bo projektant nie miał sygnału, że patrzy na atrapę.
 *
 * Zasady tego modułu:
 * 1. Prąd zwarciowy pochodzi z wiersza biegu zwarciowego (`ikss_ka` → A),
 *    prąd roboczy z wiersza gałęziowego rozpływu — prąd ZACISKU, przy którym stoi
 *    urządzenie (`i_a` — zacisk `od`, `i_do_a` — zacisk `do`), wskazanego przez
 *    rozstrzygnięcie backendu (`miejsceUrzadzenia.ts`, decyzja O-51 pkt 7). ZERO
 *    własnej arytmetyki poza przeliczeniem jednostki; brak rozstrzygnięcia zacisku
 *    = brak prądu roboczego z powodem z rekordu odmowy, nigdy `i_a` domyślnie.
 * 2. Dopasowanie prądu zwarciowego po szynie miejsca urządzenia — szynie zacisku
 *    gałęzi rozstrzygniętego przez backend albo szynie wskazanej wprost jako
 *    lokalizacja — najpierw `element_id` wiersza, potem `target_id`.
 * 3. Brak dopasowania albo brak wartości ⇒ pozycji NIE MA. Nigdy wartość
 *    zastępcza, nigdy zero, nigdy przepisanie Ik_max jako Ik_min.
 * 4. `Ik_min` wymaga OSOBNEGO biegu minimalnego. Bez niego pozycja prądowa
 *    powstaje tylko wtedy, gdy analiza może się na niej oprzeć — brak Ik_min
 *    jest raportowany jako brak danej, bo od niego zależy czułość zabezpieczeń.
 *
 * Czysty moduł (bez React) — testowalny wprost.
 */

import type { ShortCircuitRow, BranchResultRow } from '../results-inspector/types';
import type { MiejsceUrzadzenia } from './miejsceUrzadzenia';
import type { FaultCurrentData, OperatingCurrentData, ProtectionDevice } from './types';

/** Identyfikatory elementu, po których wolno dopasować wiersz do urządzenia. */
function identyfikatoryWiersza(wiersz: ShortCircuitRow): readonly string[] {
  return [wiersz.element_id, wiersz.target_id].filter((x): x is string => Boolean(x));
}

function kaNaA(wartosc: number | null | undefined): number | null {
  return typeof wartosc === 'number' && Number.isFinite(wartosc) ? wartosc * 1000 : null;
}

/** Prąd zwarciowy [A] per identyfikator elementu z wierszy biegu zwarciowego. */
export function pradyZwarcioweZBiegu(
  wiersze: readonly ShortCircuitRow[],
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const wiersz of wiersze) {
    const wartosc = kaNaA(wiersz.ikss_ka);
    if (wartosc === null) continue;
    for (const id of identyfikatoryWiersza(wiersz)) {
      // Pierwszy wiersz wygrywa — kolejność wyników jest deterministyczna.
      if (!mapa.has(id)) mapa.set(id, wartosc);
    }
  }
  return mapa;
}

/**
 * Prąd roboczy [A] urządzenia — prąd ZACISKU gałęzi rozstrzygniętego przez backend.
 *
 * UWAGA JEDNOSTKOWA: wiersz gałęziowy rozpływu niesie prąd w AMPERACH (`i_a`,
 * `i_do_a`), a wiersz zwarciowy w KILOAMPERACH (`ikss_ka`) — dlatego tylko ten drugi
 * przelicza się przez 1000. Pomyłka tutaj dawałaby błąd o trzy rzędy wielkości
 * w kryterium przeciążenia.
 *
 * Zwraca liczbę albo powód braku (`null` = brak bez powodu z backendu — lokalizacja
 * bez zacisków, np. szyna, albo wiersz bez prądu zacisku).
 */
export function pradRoboczyZWiersza(
  wiersze: readonly BranchResultRow[],
  miejsce: MiejsceUrzadzenia | undefined,
): { readonly wartosc: number } | { readonly powod: string | null } {
  if (!miejsce) return { powod: null };
  if (miejsce.odmowa_zacisku) return { powod: miejsce.odmowa_zacisku.powod_pl };
  if (!miejsce.galaz_ref || !miejsce.zacisk) return { powod: null };
  const wiersz = wiersze.find((w) => (w.element_id ?? w.branch_id) === miejsce.galaz_ref);
  const wartosc = miejsce.zacisk === 'od' ? wiersz?.i_a : wiersz?.i_do_a;
  return typeof wartosc === 'number' && Number.isFinite(wartosc) ? { wartosc } : { powod: null };
}

/** Pozycja braku danej wejściowej koordynacji (do uczciwego komunikatu w UI). */
export interface BrakDanejPradowej {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly locationElementId: string;
  readonly czegoBrakuje: 'prad_zwarciowy_max' | 'prad_zwarciowy_min' | 'prad_roboczy';
  /** Powód z rekordu backendu (odmowa zacisku), gdy brak ma nazwaną przyczynę. */
  readonly powod?: string;
}

export interface PradyKoordynacji {
  readonly faultCurrents: readonly FaultCurrentData[];
  readonly operatingCurrents: readonly OperatingCurrentData[];
  readonly braki: readonly BrakDanejPradowej[];
}

/**
 * Zestaw prądów wejściowych dla urządzeń, zbudowany z REALNYCH wyników biegów.
 *
 * `wierszeMin` to wiersze biegu zwarciowego minimalnego (osobny przypadek
 * obliczeniowy). Gdy go nie ma, pozycja prądowa nie powstaje i urządzenie
 * trafia na listę braków — bez Ik_min czułość zabezpieczenia jest
 * niesprawdzalna, a wpisanie tam Ik_max byłoby fałszem.
 */
export function zbudujPradyKoordynacji(params: {
  readonly urzadzenia: readonly ProtectionDevice[];
  readonly wierszeMax: readonly ShortCircuitRow[];
  readonly wierszeMin?: readonly ShortCircuitRow[];
  readonly wierszeGalezi?: readonly BranchResultRow[];
  /** Rozstrzygnięcie miejsca prądu per id urządzenia (backend, decyzja O-51 pkt 7). */
  readonly miejsca?: ReadonlyMap<string, MiejsceUrzadzenia>;
}): PradyKoordynacji {
  const { urzadzenia, wierszeMax, wierszeMin, wierszeGalezi, miejsca } = params;
  const mapaMax = pradyZwarcioweZBiegu(wierszeMax);
  const mapaMin = wierszeMin ? pradyZwarcioweZBiegu(wierszeMin) : new Map<string, number>();

  const faultCurrents: FaultCurrentData[] = [];
  const operatingCurrents: OperatingCurrentData[] = [];
  const braki: BrakDanejPradowej[] = [];

  for (const urzadzenie of urzadzenia) {
    const lokalizacja = urzadzenie.location_element_id;
    const miejsce = miejsca?.get(urzadzenie.id);
    // Prąd zwarciowy W MIEJSCU urządzenia: szyna ZACISKU gałęzi rozstrzygniętego przez
    // backend (ten sam zacisk co prąd roboczy) albo szyna wskazana wprost jako lokalizacja.
    // Wiersze biegu zwarciowego są per szyna — lokalizacja-gałąź bez zacisku nie ma
    // prądu zwarciowego (jawny brak), zamiast prądu „którejś" szyny.
    const szynaZwarcia =
      miejsce?.zacisk && miejsce.zaciski ? miejsce.zaciski[miejsce.zacisk].szyna_ref : lokalizacja;
    const ikMax = mapaMax.get(szynaZwarcia);
    const ikMin = mapaMin.get(szynaZwarcia);
    const robocze = wierszeGalezi ? pradRoboczyZWiersza(wierszeGalezi, miejsce) : { powod: null };

    const brak = (czego: BrakDanejPradowej['czegoBrakuje'], powod?: string | null): void => {
      braki.push({
        deviceId: urzadzenie.id,
        deviceName: urzadzenie.name,
        locationElementId: lokalizacja,
        czegoBrakuje: czego,
        ...(powod ? { powod } : {}),
      });
    };

    if (ikMax === undefined) {
      brak('prad_zwarciowy_max');
    } else if (ikMin === undefined) {
      // Ik_max jest, Ik_min nie — pozycji nie tworzymy, bo kontrakt analizy
      // wymaga obu, a przepisanie Ik_max byłoby fabrykacją czułości.
      brak('prad_zwarciowy_min');
    } else {
      faultCurrents.push({
        location_id: lokalizacja,
        ik_max_3f_a: ikMax,
        ik_min_3f_a: ikMin,
      });
    }

    if ('wartosc' in robocze) {
      operatingCurrents.push({ location_id: lokalizacja, i_operating_a: robocze.wartosc });
    } else {
      brak('prad_roboczy', robocze.powod);
    }
  }

  return { faultCurrents, operatingCurrents, braki };
}

/** Odpowiedź biegu zwarciowego w zakresie, którego potrzebuje klasyfikacja. */
export interface BiegZwarciowyDoPodzialu {
  readonly run_id: string;
  readonly rows: readonly ShortCircuitRow[];
  readonly konfiguracja_biegu?: { readonly scenariusz?: 'MAX' | 'MIN' | null } | null;
}

/**
 * Podział wyników zwarciowych na przypadek MAKSYMALNY i MINIMALNY po
 * SCENARIUSZU ZAPISANYM NA BIEGU (`konfiguracja_biegu.scenariusz`, projekcja
 * `raw_result["scenario"]` — to samo źródło, które czyta most autorytetu
 * koordynacji po stronie serwera). Kanoniczny bieg liczy JEDEN scenariusz, więc
 * pełna koordynacja wymaga dwóch biegów.
 *
 * JEDEN BIEG NA SCENARIUSZ. `biegi` przychodzą od NAJNOWSZEGO; z każdego scenariusza
 * brany jest wyłącznie pierwszy (najnowszy) bieg, a jego identyfikator wraca jako
 * `runIdMax` / `runIdMin` — te same identyfikatory idą w żądaniu analizy
 * (`sc_run_id` / `sc_run_id_min`), a backend potwierdza prądy żądania wobec DOKŁADNIE
 * tych dwóch biegów (`wejscie_koordynacji_z_biegow`). Scalanie wierszy kilku biegów
 * tego samego scenariusza dawało prądy, których żaden pojedynczy bieg nie potwierdza.
 * Starsze biegi tego scenariusza trafiają do `pominiete` (jawnie, nie cicho).
 *
 * NAPRAWA DOMYSŁU (karta HARNESS-RESZTA-2, 2026-09-17). Do tej karty klasyfikacja
 * szła po współczynniku `c` wiersza z progiem `c >= 1 → MAX`. Na sieci ŚREDNIEGO
 * napięcia ten próg jest zawsze fałszywy: IEC 60909-0 Tabela 1 daje c_min = 1,00
 * powyżej 1 kV (0,95 wyłącznie dla nN), więc wiersze biegu MINIMALNEGO na szynie
 * 15 kV wpadały do zbioru MAKSYMALNEGO. Zmierzone na realnych biegach magistrali
 * SN: 2 biegi (MAX i MIN), 9 wierszy każdy — po podziale po `c` zbiór MIN miał
 * WYŁĄCZNIE wiersze szyn nN (c = 0,95), więc żadne zabezpieczenie na szynie SN nie
 * dostawało Ik_min i ekran meldował „Brak biegu zwarciowego minimalnego" mimo
 * dwóch policzonych biegów. Domysł w warstwie prezentacji zastąpiony daną z
 * kontraktu — bieg bez zapisanego scenariusza trafia do `bezScenariusza` (uczciwy
 * brak), nigdy do „MAX z domyślki".
 */
export function podzielWierszeNaPrzypadki(biegi: readonly BiegZwarciowyDoPodzialu[]): {
  readonly max: readonly ShortCircuitRow[];
  readonly min: readonly ShortCircuitRow[];
  readonly bezScenariusza: readonly ShortCircuitRow[];
  readonly runIdMax: string | null;
  readonly runIdMin: string | null;
  readonly pominiete: readonly string[];
} {
  let max: readonly ShortCircuitRow[] = [];
  let min: readonly ShortCircuitRow[] = [];
  let runIdMax: string | null = null;
  let runIdMin: string | null = null;
  const bezScenariusza: ShortCircuitRow[] = [];
  const pominiete: string[] = [];
  for (const bieg of biegi) {
    const scenariusz = bieg.konfiguracja_biegu?.scenariusz ?? null;
    if (scenariusz === 'MAX') {
      if (runIdMax === null) {
        runIdMax = bieg.run_id;
        max = bieg.rows;
      } else {
        pominiete.push(bieg.run_id);
      }
    } else if (scenariusz === 'MIN') {
      if (runIdMin === null) {
        runIdMin = bieg.run_id;
        min = bieg.rows;
      } else {
        pominiete.push(bieg.run_id);
      }
    } else {
      bezScenariusza.push(...bieg.rows);
    }
  }
  return { max, min, bezScenariusza, runIdMax, runIdMin, pominiete };
}
