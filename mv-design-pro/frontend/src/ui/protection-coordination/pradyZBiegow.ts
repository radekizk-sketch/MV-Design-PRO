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
 *    prąd roboczy z wiersza gałęziowego rozpływu (`i_ka` → A). ZERO własnej
 *    arytmetyki poza przeliczeniem jednostki.
 * 2. Dopasowanie po identyfikatorze elementu urządzenia
 *    (`location_element_id`) — najpierw `element_id` wiersza, potem `target_id`.
 * 3. Brak dopasowania albo brak wartości ⇒ pozycji NIE MA. Nigdy wartość
 *    zastępcza, nigdy zero, nigdy przepisanie Ik_max jako Ik_min.
 * 4. `Ik_min` wymaga OSOBNEGO biegu minimalnego. Bez niego pozycja prądowa
 *    powstaje tylko wtedy, gdy analiza może się na niej oprzeć — brak Ik_min
 *    jest raportowany jako brak danej, bo od niego zależy czułość zabezpieczeń.
 *
 * Czysty moduł (bez React) — testowalny wprost.
 */

import type { ShortCircuitRow, BranchResultRow } from '../results-inspector/types';
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
 * Prąd roboczy [A] per identyfikator gałęzi z wierszy rozpływu.
 *
 * UWAGA JEDNOSTKOWA: wiersz gałęziowy rozpływu niesie prąd w AMPERACH (`i_a`),
 * a wiersz zwarciowy w KILOAMPERACH (`ikss_ka`) — dlatego tylko ten drugi
 * przelicza się przez 1000. Pomyłka tutaj dawałaby błąd o trzy rzędy wielkości
 * w kryterium przeciążenia.
 */
export function pradyRoboczeZRozplywu(
  wiersze: readonly BranchResultRow[],
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const wiersz of wiersze) {
    const wartosc =
      typeof wiersz.i_a === 'number' && Number.isFinite(wiersz.i_a) ? wiersz.i_a : null;
    if (wartosc === null || !wiersz.branch_id) continue;
    const klucze = [wiersz.element_id, wiersz.branch_id].filter((x): x is string => Boolean(x));
    for (const klucz of klucze) {
      if (!mapa.has(klucz)) mapa.set(klucz, wartosc);
    }
  }
  return mapa;
}

/** Pozycja braku danej wejściowej koordynacji (do uczciwego komunikatu w UI). */
export interface BrakDanejPradowej {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly locationElementId: string;
  readonly czegoBrakuje: 'prad_zwarciowy_max' | 'prad_zwarciowy_min' | 'prad_roboczy';
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
}): PradyKoordynacji {
  const { urzadzenia, wierszeMax, wierszeMin, wierszeGalezi } = params;
  const mapaMax = pradyZwarcioweZBiegu(wierszeMax);
  const mapaMin = wierszeMin ? pradyZwarcioweZBiegu(wierszeMin) : new Map<string, number>();
  const mapaRobocze = wierszeGalezi
    ? pradyRoboczeZRozplywu(wierszeGalezi)
    : new Map<string, number>();

  const faultCurrents: FaultCurrentData[] = [];
  const operatingCurrents: OperatingCurrentData[] = [];
  const braki: BrakDanejPradowej[] = [];

  for (const urzadzenie of urzadzenia) {
    const lokalizacja = urzadzenie.location_element_id;
    const ikMax = mapaMax.get(lokalizacja);
    const ikMin = mapaMin.get(lokalizacja);
    const iRob = mapaRobocze.get(lokalizacja);

    const brak = (czego: BrakDanejPradowej['czegoBrakuje']): void => {
      braki.push({
        deviceId: urzadzenie.id,
        deviceName: urzadzenie.name,
        locationElementId: lokalizacja,
        czegoBrakuje: czego,
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

    if (iRob === undefined) {
      brak('prad_roboczy');
    } else {
      operatingCurrents.push({ location_id: lokalizacja, i_operating_a: iRob });
    }
  }

  return { faultCurrents, operatingCurrents, braki };
}

/**
 * Podział wierszy zwarciowych na przypadek MAKSYMALNY i MINIMALNY po REALNEJ
 * danej wyniku — współczynniku napięciowym `c` (IEC 60909: c_max ≈ 1,10,
 * c_min ≈ 0,95). Kanoniczny bieg liczy JEDEN scenariusz
 * (`canonical_analysis.py:895` — `options.c_factor`), więc pełna koordynacja
 * wymaga dwóch biegów; klasyfikacja po `c` nie wymaga zgadywania z metadanych.
 *
 * Wiersz bez `c_factor` nie trafia do żadnego zbioru — nie wiemy, którym
 * przypadkiem jest, a przypisanie go „na wyczucie" fałszowałoby albo
 * selektywność (za mały Ik_max), albo czułość (za duży Ik_min).
 */
export function podzielWierszeNaPrzypadki(wiersze: readonly ShortCircuitRow[]): {
  readonly max: readonly ShortCircuitRow[];
  readonly min: readonly ShortCircuitRow[];
  readonly bezWspolczynnika: readonly ShortCircuitRow[];
} {
  const max: ShortCircuitRow[] = [];
  const min: ShortCircuitRow[] = [];
  const bezWspolczynnika: ShortCircuitRow[] = [];
  for (const wiersz of wiersze) {
    const c = wiersz.c_factor;
    if (typeof c !== 'number' || !Number.isFinite(c)) {
      bezWspolczynnika.push(wiersz);
    } else if (c >= 1) {
      max.push(wiersz);
    } else {
      min.push(wiersz);
    }
  }
  return { max, min, bezWspolczynnika };
}
