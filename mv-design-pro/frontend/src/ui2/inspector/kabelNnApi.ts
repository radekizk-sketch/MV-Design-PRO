/**
 * Klient obiektu kabla nN (karta OBIEKT-KABEL-NN) — kontrakt `backend/src/api/kabel_nn.py`.
 *
 * Trzy odczyty, wszystkie liczone przez backend na BIEŻĄCYM modelu przypadku (biegi
 * rozpływu i zwarć liczone w pamięci z opcjami ostatniego zakończonego biegu przypadku):
 *  - `GET /api/cases/{case}/enm/nn-cable?cable_ref=` — wielkości odcinka i osiem kryteriów
 *    (rekordy werdyktu wyjaśnialnego) ze szczegółem kroków dowodu na żądanie,
 *  - `GET …/nn-cable/warianty-przekroju` — kandydaci z katalogu kabli nN tej samej rodziny,
 *  - `GET …/nn-cable/dowod` (+ `/pakiet` ZIP) — dowód obwodu nN z modelu i biegu.
 * Odnośnik kabla idzie parametrem zapytania (identyfikatory gałęzi bywają ścieżkami z „/").
 * Zero fizyki tutaj — klient tylko przenosi kontrakt.
 */

import type { OcenaKryterium } from '../wyniki/wzorzec/werdykt';

/** Semantyka odczytu technicznego (jedna mapa kolorów: `SEMANTYKA_KOLOR`). */
export type SemantykaOceny = 'pozytywna' | 'negatywna' | 'ostrzegawcza' | 'neutralna';

/** Parametr kroku dowodu: symbol, opis, wartość liczbowa albo tekstowa, jednostka. */
export interface ParametrKroku {
  readonly symbol_latex: string;
  readonly opis_pl: string | null;
  readonly wartosc: number | null;
  readonly wartosc_pl: string | null;
  readonly jednostka: string;
}

/** Krok dowodu: wzór → parametry → podstawienie → wynik. */
export interface KrokSzczegolu {
  readonly tytul_pl: string;
  readonly nazwa_wzoru_pl: string;
  readonly podstawa_pl: string;
  readonly wzor_latex: string;
  readonly parametry: readonly ParametrKroku[];
  readonly podstawienie_latex: string;
  readonly wynik: ParametrKroku & { readonly opis_pl?: string | null };
}

/** Wielkość odcinka (wartość albo powód braku). */
export interface WielkoscKabla {
  readonly kod: string;
  readonly nazwa_pl: string;
  readonly symbol_latex: string;
  readonly wartosc: number | null;
  readonly jednostka: string;
  readonly powod_braku_pl: string | null;
  readonly szczegoly: readonly KrokSzczegolu[];
}

/** Wiersz kryterium: odczyt techniczny pierwszego planu + rekord + kroki na żądanie. */
export interface WierszKryterium {
  readonly kryterium_id: string;
  /** Pełny rekord werdyktu wyjaśnialnego (kontrakt `werdykt`) — szczegół na żądanie. */
  readonly rekord: OcenaKryterium;
  readonly norma_pl: string;
  readonly ocena_techniczna_pl: string;
  readonly ocena_semantyka: SemantykaOceny;
  readonly sprawdzenie_latex: string | null;
  readonly szczegoly: readonly KrokSzczegolu[];
}

/** Warunki ułożenia zapisane w modelu (`meta.cable_laying_conditions`). */
export interface WarunkiUlozenia {
  readonly environment: 'powietrze' | 'grunt';
  readonly insulation: 'PVC' | 'XLPE';
  readonly ambient_temperature_c: number;
  readonly circuit_count: number;
  readonly soil_thermal_resistivity_km_w?: number | null;
}

/** Wartości warunków, dla których rejestr tablic ma wpis (kontrolka = wybór, nie wpis). */
export interface OpcjeUlozenia {
  readonly srodowiska: readonly ('powietrze' | 'grunt')[];
  readonly izolacje: readonly ('PVC' | 'XLPE')[];
  readonly temperatury: Readonly<Record<'powietrze' | 'grunt', Readonly<Record<string, readonly number[]>>>>;
  readonly liczby_obwodow: Readonly<Record<'powietrze' | 'grunt', readonly number[]>>;
  readonly rezystywnosci_gruntu: readonly number[];
}

export interface OpisKabla {
  readonly ref_id: string;
  readonly nazwa: string;
  readonly catalog_ref: string | null;
  readonly catalog_namespace: string;
  readonly typ_nazwa: string | null;
  readonly material: string | null;
  readonly izolacja: string | null;
  readonly przekroj_mm2: number | null;
  readonly dlugosc_m: number;
  readonly warunki_ulozenia: WarunkiUlozenia | null;
  readonly warunki_ulozenia_opis_pl: string;
}

export interface OpisObwodu {
  readonly station_ref: string;
  readonly stacja_nazwa: string;
  readonly transformator_ref: string;
  readonly transformator_nazwa: string;
  readonly szyna_poczatku: string;
  readonly szyna_konca: string;
  readonly aparat_ref: string | null;
  readonly aparat_nazwa: string | null;
  readonly aparat_rodzaj_pl: string | null;
}

/** Rodzaj biegu, którego przypadek nie ma (akcja „Uruchom" w inspektorze). */
export type BrakujacyBieg = 'LOAD_FLOW' | 'SC_3F';

export interface ObliczeniaKablaOk {
  readonly status: 'OK';
  readonly cable_ref: string;
  readonly kabel: OpisKabla;
  readonly obwod: OpisObwodu;
  readonly brakujace_biegi: readonly BrakujacyBieg[];
  readonly wielkosci: readonly WielkoscKabla[];
  readonly kryteria: readonly WierszKryterium[];
  readonly opcje_ulozenia: OpcjeUlozenia;
  readonly audyt: {
    readonly rewizja_modelu: string;
    readonly bieg_bazowy_rozplywu: string | null;
    readonly bieg_bazowy_zwarcia: string | null;
    readonly wersja_obliczen: string;
  };
}

/** Odmowa nazwana (kabel poza pasmem nN, brak stacji zasilającej, brak danych). */
export interface OdmowaKabla {
  readonly status: string;
  readonly cable_ref: string;
  readonly reason_pl: string | null;
  readonly missing_data?: readonly string[];
}

export type ObliczeniaKabla = ObliczeniaKablaOk | OdmowaKabla;

export interface KryteriumWariantu {
  readonly kryterium_id: string;
  readonly ocena_semantyka: SemantykaOceny;
  readonly ocena_techniczna_pl: string;
  readonly status_maszynowy: string;
  readonly zalezne_od_przekroju: boolean;
}

export interface WiazanieKatalogu {
  readonly catalog_namespace: string;
  readonly catalog_item_id: string;
  readonly catalog_item_version: string | null;
}

export interface WariantPrzekroju {
  readonly catalog_item_id: string;
  readonly catalog_binding: WiazanieKatalogu;
  readonly nazwa: string;
  readonly przekroj_mm2: number | null;
  readonly material: string | null;
  readonly izolacja: string | null;
  readonly biezacy: boolean;
  readonly iz_prime_a: number | null;
  readonly ib_a: number | null;
  readonly du_konca_procent: number | null;
  readonly du_konca_v: number | null;
  readonly straty_w: number | null;
  readonly ik1_min_a: number | null;
  readonly kryteria: readonly KryteriumWariantu[];
  readonly bez_przekroczen: boolean;
  readonly nieobliczone: readonly string[];
}

export interface WariantyPrzekroju {
  readonly status: string;
  readonly cable_ref: string;
  readonly brakujace_biegi: readonly BrakujacyBieg[];
  readonly kolejnosc_kryteriow: readonly string[];
  readonly warianty: readonly WariantPrzekroju[];
  readonly rekomendacja: string | null;
  readonly reason_pl?: string | null;
}

/** Dowód obwodu nN (kroki w kontrakcie inspektora + nagłówek i podsumowanie pakietu). */
export interface DowodObwoduNn {
  readonly kroki: readonly KrokSzczegolu[];
  readonly [klucz: string]: unknown;
}

function adres(caseId: string, sciezka: string, cableRef: string): string {
  return (
    `/api/cases/${encodeURIComponent(caseId)}/enm/nn-cable${sciezka}`
    + `?cable_ref=${encodeURIComponent(cableRef)}`
  );
}

async function odczyt<T>(url: string, signal?: AbortSignal): Promise<T> {
  const odpowiedz = await fetch(url, { signal });
  if (!odpowiedz.ok) {
    let szczegol = '';
    try {
      const tresc = (await odpowiedz.json()) as { detail?: unknown };
      if (typeof tresc.detail === 'string') szczegol = tresc.detail;
    } catch {
      szczegol = '';
    }
    throw new Error(szczegol || `Odczyt nie powiódł się (HTTP ${odpowiedz.status}).`);
  }
  return (await odpowiedz.json()) as T;
}

export function pobierzObliczeniaKablaNn(
  caseId: string,
  cableRef: string,
  signal?: AbortSignal,
): Promise<ObliczeniaKabla> {
  return odczyt<ObliczeniaKabla>(adres(caseId, '', cableRef), signal);
}

export function pobierzWariantyPrzekroju(
  caseId: string,
  cableRef: string,
  signal?: AbortSignal,
): Promise<WariantyPrzekroju> {
  return odczyt<WariantyPrzekroju>(adres(caseId, '/warianty-przekroju', cableRef), signal);
}

export function pobierzDowodObwoduNn(
  caseId: string,
  cableRef: string,
  signal?: AbortSignal,
): Promise<DowodObwoduNn> {
  return odczyt<DowodObwoduNn>(adres(caseId, '/dowod', cableRef), signal);
}

/** Adres pakietu dowodowego ZIP (pobranie przez odnośnik — bajty liczy backend). */
export function adresPakietuDowoduObwoduNn(caseId: string, cableRef: string): string {
  return adres(caseId, '/dowod/pakiet', cableRef);
}

export function czyObliczeniaOk(wynik: ObliczeniaKabla): wynik is ObliczeniaKablaOk {
  return wynik.status === 'OK';
}
