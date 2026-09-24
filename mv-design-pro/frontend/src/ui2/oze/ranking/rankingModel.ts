/*
 * Model i CZYSTE adaptery okna „Ranking punktów przyłączenia" (strumień OZE).
 * Read-only odwzorowanie odpowiedzi hosting-capacity (z polami D3a: straty i skrajne
 * napięcia) na kolumny/wiersze WSPÓLNEGO WZORCA EKRANU ANALIZY (`ui2/wyniki/wzorzec`).
 *
 * Granice (NOT-A-SOLVER): zero fizyki, zero ocen lokalnych. Jedyna arytmetyka to
 * PREZENTACJA: różnica dwóch strat scenariuszy z backendu (D3a) oraz konwersja
 * jednostek MW→kW — obie jawnie skomentowane. Typ modułu NC RfG pochodzi WYŁĄCZNIE
 * z klasyfikacji backendu (`GET /api/ncrfg-tests/modul`, `ncrfg/klasyfikacja.ts`) — dawne
 * mapowanie z progów katalogu po stronie klienta skasowane (karta AB-1a Pakiet D2).
 * Rodzaj kryterium i etykieta węzła reużyte importem z okna „Zdolność przyłączeniowa".
 */

import type { DefinicjaKolumny, WartoscKomorki, WierszTabeli } from '../../wyniki/wzorzec';
import type { ScenariuszZdolnosci, WezelZdolnosci } from '../api';
import {
  krotkiOpisKlasyfikacji,
  type StanKlasyfikacji,
  type ZapytanieKlasyfikacji,
} from '../ncrfg/klasyfikacja';
import { etykietaWezla, rodzajKryteriumPL } from '../zdolnosc/zdolnoscModel';
import { RANKING_STRINGS, fmtMocMW, fmtNapieciaPara, fmtStratyKw } from './strings';

// ---------------------------------------------------------------------------
// Przyrost strat przy mocy granicznej [kW]
// ---------------------------------------------------------------------------

/**
 * Przyrost strat czynnych przy mocy granicznej [kW] = (straty przy granicy − straty
 * bazowe) × 1000. ARYTMETYKA PREZENTACJI: różnica dwóch wartości D3a policzonych już
 * przez solver rozpływu (`losses_at_limit_p_mw`, `losses_baseline_p_mw`) i konwersja
 * jednostek MW→kW — NIE fizyka. Brak którejkolwiek składowej → `null` („—" w UI).
 */
export function przyrostStratKw(wezel: WezelZdolnosci): number | null {
  const bazowe = wezel.losses_baseline_p_mw;
  const graniczne = wezel.losses_at_limit_p_mw;
  if (bazowe === null || bazowe === undefined) return null;
  if (graniczne === null || graniczne === undefined) return null;
  return (graniczne - bazowe) * 1000;
}

// ---------------------------------------------------------------------------
// Scenariusz i skrajne napięcia przy mocy granicznej
// ---------------------------------------------------------------------------

/**
 * Scenariusz przy mocy granicznej = OSTATNI dopuszczalny scenariusz przeglądu
 * (kolejność źródłowa rosnąca mocy). Deterministyczny. Brak dopuszczalnego → `null`.
 */
export function scenariuszGraniczny(wezel: WezelZdolnosci): ScenariuszZdolnosci | null {
  for (let i = wezel.scenarios.length - 1; i >= 0; i -= 1) {
    if (wezel.scenarios[i].acceptable) return wezel.scenarios[i];
  }
  return null;
}

/** Skrajne napięcia węzłowe [p.u.] przy mocy granicznej (min/maks scenariusza D3a). */
export interface NapieciaGraniczne {
  readonly min: number;
  readonly max: number;
}

/** Min/maks napięcie scenariusza granicznego (D3a). Brak scenariusza lub danych → `null`. */
export function napieciaPrzyGranicy(wezel: WezelZdolnosci): NapieciaGraniczne | null {
  const scenariusz = scenariuszGraniczny(wezel);
  if (scenariusz === null) return null;
  const min = scenariusz.min_voltage_pu;
  const max = scenariusz.max_voltage_pu;
  if (min === null || min === undefined || max === null || max === undefined) return null;
  return { min, max };
}

// ---------------------------------------------------------------------------
// Typ modułu NC RfG — klasyfikacja backendu dla mocy granicznej węzła
// ---------------------------------------------------------------------------

/** Odczyt stanu klasyfikacji backendu dla pary (moc, napięcie) — `useKlasyfikacjeModulow`. */
export type OdczytKlasyfikacji = (zapytanie: ZapytanieKlasyfikacji) => StanKlasyfikacji;

/** Zapytanie o klasyfikację dla mocy granicznej węzła i napięcia węzła ze snapshotu. */
export function zapytanieKlasyfikacjiWezla(
  wezel: WezelZdolnosci,
  napiecieKv: number | null,
): ZapytanieKlasyfikacji {
  return { mocMw: wezel.max_hosting_capacity_mw, napiecieKv };
}

// ---------------------------------------------------------------------------
// Kolumny i wiersze tabeli (wzorzec EkranAnalizy / TabelaWynikow)
// ---------------------------------------------------------------------------

/** Klucz kolumny identyfikatora — stabilna tożsamość wiersza (bus_ref), tryb ekspercki. */
export const KLUCZ_WIERSZA_RANKINGU = 'identyfikator';

/** Deklaratywne kolumny rankingu (kolejność = układ tabeli wzorca). */
export function kolumnyRankingu(): DefinicjaKolumny[] {
  return [
    { klucz: 'wezel', etykieta: RANKING_STRINGS.kolWezel },
    {
      klucz: KLUCZ_WIERSZA_RANKINGU,
      etykieta: RANKING_STRINGS.kolIdentyfikator,
      mono: true,
      tylkoEkspercki: true,
    },
    { klucz: 'moc', etykieta: RANKING_STRINGS.kolMoc, jednostka: RANKING_STRINGS.jednMW, mono: true },
    { klucz: 'kryterium', etykieta: RANKING_STRINGS.kolKryterium },
    {
      klucz: 'straty',
      etykieta: RANKING_STRINGS.kolStraty,
      jednostka: RANKING_STRINGS.jednKW,
      mono: true,
    },
    {
      klucz: 'napiecia',
      etykieta: RANKING_STRINGS.kolNapiecia,
      jednostka: RANKING_STRINGS.jednPU,
      mono: true,
      sortowalna: false, // para min/maks — nie sortujemy pojedynczą liczbą
    },
    { klucz: 'klasa', etykieta: RANKING_STRINGS.kolKlasa },
  ];
}

function komorkaStrat(wezel: WezelZdolnosci): WartoscKomorki {
  const przyrost = przyrostStratKw(wezel);
  if (przyrost === null) return { wartosc: RANKING_STRINGS.kreska };
  return { wartosc: fmtStratyKw(przyrost), sortKey: przyrost };
}

function komorkaNapiec(wezel: WezelZdolnosci): WartoscKomorki {
  const napiecia = napieciaPrzyGranicy(wezel);
  if (napiecia === null) return { wartosc: RANKING_STRINGS.kreska };
  return { wartosc: fmtNapieciaPara(napiecia.min, napiecia.max) };
}

function wierszRankingu(
  wezel: WezelZdolnosci,
  napiecieKv: number | null,
  klasyfikacja: OdczytKlasyfikacji,
): WierszTabeli {
  const moc = wezel.max_hosting_capacity_mw;
  const stanKlasy = klasyfikacja(zapytanieKlasyfikacjiWezla(wezel, napiecieKv));
  return {
    wezel: { wartosc: etykietaWezla(wezel) },
    [KLUCZ_WIERSZA_RANKINGU]: { wartosc: wezel.bus_ref },
    moc: { wartosc: fmtMocMW(moc), sortKey: moc },
    kryterium: { wartosc: rodzajKryteriumPL(wezel.binding_criterion) },
    straty: komorkaStrat(wezel),
    napiecia: komorkaNapiec(wezel),
    klasa: { wartosc: krotkiOpisKlasyfikacji(stanKlasy, RANKING_STRINGS.kreska) },
  };
}

/**
 * Wiersze rankingu w kolejności domyślnej: MALEJĄCO po maksymalnej mocy przyłączalnej
 * (remis rozstrzyga nazwa węzła — stabilnie, PL). Kolejność źródłowa tabeli wzorca = ten
 * ranking; użytkownik może przesortować kolumny klikiem. `napiecieWezla` odwzorowuje
 * bus_ref → napięcie znamionowe [kV] (ze snapshotu) — wejście klasyfikacji backendu.
 */
export function wierszeRankingu(
  nodes: readonly WezelZdolnosci[],
  napiecieWezla: (busRef: string) => number | null,
  klasyfikacja: OdczytKlasyfikacji,
): WierszTabeli[] {
  const posortowane = [...nodes].sort((a, b) => {
    const cmp = b.max_hosting_capacity_mw - a.max_hosting_capacity_mw;
    return cmp !== 0 ? cmp : etykietaWezla(a).localeCompare(etykietaWezla(b), 'pl');
  });
  return posortowane.map((wezel) =>
    wierszRankingu(wezel, napiecieWezla(wezel.bus_ref), klasyfikacja),
  );
}
