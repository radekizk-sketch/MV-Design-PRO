/**
 * Tożsamość wytwórcy na ekranie konfiguracji (karta E21-1, audyt E-21 pkt P2/P3/P4).
 *
 * TRZY PYTANIA, NA KTÓRE EKRAN NIE UMIAŁ ODPOWIEDZIEĆ:
 *
 *  1. CO jest konfigurowane — jednostka, blok czy cała instalacja? Model niesie
 *     `p_mw` (moc CAŁEJ grupy, bo operacja mnoży moc katalogową przez liczbę sztuk)
 *     oraz `quantity` (liczba sztuk), ale rekord warsztatu nie miał liczby sztuk
 *     WCALE, a ekran pokazywał jedną liczbę pod etykietą „Moc znamionowa AC" —
 *     raz grupową (rekord ze snapshotu), raz jednostkową (z katalogu urządzenia).
 *  2. KTÓRĘDY płynie moc — etykieta toru była STAŁYM łańcuchem per rodzaj
 *     przyłączenia, bez jednego elementu z modelu, więc nie dało się z niej odczytać,
 *     czy tor jest kompletny.
 *  3. CZY konfiguracja jest kompletna — słowo „kompletna" padało po spełnieniu
 *     TRZECH warunków, przy kilkunastu wymaganych przez reguły analiz.
 *
 * ZERO FIZYKI: moduł zestawia dane i wykrywa ich sprzeczność. Żadna wartość nie jest
 * tu liczona z parametrów sieci — wyniki pochodzą z solwera.
 */

import type { DerReadinessMatrix, ReadinessAxisStatus, StationDerConnection } from './types';

/** Względna tolerancja zgodności mocy grupy z iloczynem (jednostka × liczba sztuk). */
export const TOLERANCJA_MOCY = 0.02;

export interface IdentyfikacjaMocy {
  /** Moc CAŁEJ grupy [kW] — tyle wnosi ten rekord do modelu. `null` = brak danej. */
  readonly mocGrupyKw: number | null;
  /** Liczba jednostek. `null` = model nie niesie tej danej (NIE zakładamy jednej). */
  readonly liczbaJednostek: number | null;
  /** Moc pojedynczej jednostki [kW] z katalogu urządzenia. `null` = brak danej. */
  readonly mocJednostkiKw: number | null;
  /** Czy rekord opisuje więcej niż jedną jednostkę (wiadomo na pewno). */
  readonly grupaJednostek: boolean;
  /**
   * Sprzeczność mocy: iloczyn (jednostka × liczba) nie zgadza się z mocą grupy.
   * `null` = nie da się sprawdzić (brakuje którejś danej) — to NIE jest „zgodne".
   */
  readonly sprzecznosc: { readonly oczekiwanaKw: number; readonly wModeluKw: number } | null;
}

export function identyfikacjaMocy(
  der: Pick<StationDerConnection, 'nominal_power_kw' | 'unit_count'>,
  mocJednostkiZKatalogu: number | null,
): IdentyfikacjaMocy {
  const mocGrupyKw = der.nominal_power_kw;
  const liczbaJednostek = typeof der.unit_count === 'number' && der.unit_count > 0
    ? der.unit_count
    : null;
  const mocJednostkiKw = mocJednostkiZKatalogu;

  let sprzecznosc: IdentyfikacjaMocy['sprzecznosc'] = null;
  if (mocGrupyKw !== null && liczbaJednostek !== null && mocJednostkiKw !== null) {
    const oczekiwanaKw = mocJednostkiKw * liczbaJednostek;
    const odchylka = Math.abs(oczekiwanaKw - mocGrupyKw);
    const odniesienie = Math.max(Math.abs(oczekiwanaKw), Math.abs(mocGrupyKw), 1);
    if (odchylka / odniesienie > TOLERANCJA_MOCY) {
      sprzecznosc = { oczekiwanaKw, wModeluKw: mocGrupyKw };
    }
  }

  return {
    mocGrupyKw,
    liczbaJednostek,
    mocJednostkiKw,
    grupaJednostek: liczbaJednostek !== null && liczbaJednostek > 1,
    sprzecznosc,
  };
}

/** Ogniwo toru mocy — nazwane albo jawnie brakujące, nigdy domyślane. */
export interface OgniwoToru {
  readonly rola: string;
  readonly nazwa: string | null;
  /** Czy ogniwo jest w tym wariancie przyłączenia WYMAGANE. */
  readonly wymagane: boolean;
}

/**
 * Tor mocy od urządzenia do punktu przyłączenia — z ELEMENTÓW MODELU.
 *
 * Skład ogniw zależy od wariantu przyłączenia (inny tor ma falownik na szynie nN
 * stacji, inny wytwórca z transformatorem blokowym). Nazwę każdego ogniwa podaje
 * wołający z modelu; `null` znaczy „tego ogniwa w modelu nie ma" i jest pokazywane
 * jako brak, a nie pomijane — pominięcie ukrywałoby dziurę w torze.
 */
export function torMocy(
  der: StationDerConnection,
  nazwy: {
    readonly stacja: string | null;
    readonly szynaNn: string | null;
    readonly transformator: string | null;
    readonly poleSn: string | null;
    readonly pcc: string | null;
  },
): OgniwoToru[] {
  const dedykowany = der.connection_side === 'dedicated_transformer';
  const nn = der.connection_side === 'nN';
  const ogniwa: OgniwoToru[] = [
    { rola: 'Urządzenie wytwórcze', nazwa: der.name || null, wymagane: true },
  ];

  if (nn || dedykowany) {
    ogniwa.push({ rola: 'Szyna nN', nazwa: nazwy.szynaNn, wymagane: true });
    ogniwa.push({
      rola: dedykowany ? 'Transformator blokowy' : 'Transformator stacji SN/nN',
      nazwa: nazwy.transformator,
      wymagane: true,
    });
  }

  ogniwa.push({ rola: 'Pole SN', nazwa: nazwy.poleSn, wymagane: der.connection_side !== 'nN' || dedykowany });
  ogniwa.push({ rola: 'Stacja', nazwa: nazwy.stacja, wymagane: true });
  ogniwa.push({ rola: 'Punkt przyłączenia', nazwa: nazwy.pcc, wymagane: true });
  return ogniwa;
}

export interface StanKonfiguracji {
  /** Zdanie o stanie — nigdy nie mówi „kompletna", gdy jakakolwiek oś nie jest gotowa. */
  readonly zdanie: string;
  readonly osieGotowe: number;
  readonly osieCzesciowe: number;
  readonly osieZablokowane: number;
  readonly osieRazem: number;
  readonly kompletna: boolean;
}

/**
 * Stan konfiguracji liczony z TEJ SAMEJ macierzy, którą widzi reszta ekranu.
 *
 * DLACZEGO NIE `computeDerCompleteness`: tamta reguła odpowiada na inne pytanie
 * (czy da się w ogóle zapisać wytwórcę) i mówi „kompletna" po trzech polach —
 * a ekran pokazywał to słowo obok listy kilkunastu braków. Dwa słowniki na jednym
 * ekranie nie mogą używać tego samego słowa do dwóch różnych rzeczy.
 */
export function stanKonfiguracji(macierz: DerReadinessMatrix): StanKonfiguracji {
  const statusy = Object.values(macierz) as ReadinessAxisStatus[];
  const gotowe = statusy.filter((s) => s === 'ready').length;
  const czesciowe = statusy.filter((s) => s === 'partial').length;
  const zablokowane = statusy.filter((s) => s === 'blocked').length;
  const razem = statusy.length;
  const kompletna = gotowe === razem;

  const zdanie = kompletna
    ? `Konfiguracja kompletna — wszystkie ${razem} analiz ma komplet danych wejściowych.`
    : `Konfiguracja niekompletna — ${gotowe} z ${razem} analiz ma komplet danych; `
      + `${zablokowane} zablokowanych, ${czesciowe} z brakami uzupełniającymi.`;

  return {
    zdanie,
    osieGotowe: gotowe,
    osieCzesciowe: czesciowe,
    osieZablokowane: zablokowane,
    osieRazem: razem,
    kompletna,
  };
}
