/*
 * Model ekranu „Dynamika czasowa RMS" (karta AB-P1) — typy kontraktów backendu
 * i CZYSTE funkcje prezentacji. Zero fizyki: nic tu nie jest liczone, wszystkie
 * liczby, jednostki, opisy wielkości, nazwy elementów i zacisków pochodzą z odpowiedzi
 * backendu (`resultset_dynamic_v2` + blok `opis_wyniku`, `opis_scenariusza_dynamicznego_v1`,
 * odczyt gotowości `application/dynamika/gotowosc.py`).
 *
 * Kontrakty (plik:funkcja):
 *  - opis edytora: `backend/src/application/dynamika/opis_scenariusza.py::opis_scenariusza_dynamicznego`,
 *  - gotowość: `backend/src/application/dynamika/gotowosc.py::gotowosc_dynamiki`,
 *  - scenariusze nazwane: `backend/src/api/dynamika.py`,
 *  - wynik: `backend/src/api/canonical_run_views.py::build_dynamika_results_response`,
 *  - próbki: `backend/src/api/analysis_runs.py::get_dynamika_time_series`.
 */

import type { RekordOcenyNiewykonanej } from '../wzorzec/OcenaNiewykonana';

// ---------------------------------------------------------------------------
// Opis scenariusza (edytor harmonogramu z kontraktu)
// ---------------------------------------------------------------------------

export type TypPola =
  | 'wybor'
  | 'referencja'
  | 'obiekt'
  | 'lista'
  | 'unia'
  | 'logiczna'
  | 'calkowita'
  | 'liczba'
  | 'tekst';

/** Wariant pola `unia` (unia dyskryminowana kontraktu po `rodzaj`). */
export interface OpisWariantu {
  readonly rodzaj: string;
  readonly etykieta_pl: string;
  readonly pola: readonly OpisPola[];
}

export interface WartoscWyboru {
  readonly wartosc: string;
  readonly etykieta_pl: string;
  readonly wykonywana_przez_rdzen?: boolean;
}

export interface KolekcjaReferencji {
  readonly kolekcja: string;
  readonly etykieta_pl: string;
}

export interface OpisPola {
  readonly nazwa: string;
  readonly etykieta_pl: string;
  readonly jednostka: string | null;
  readonly wymagane: boolean;
  readonly dopuszcza_brak: boolean;
  readonly typ: TypPola;
  readonly minimum?: number;
  readonly minimum_wylaczne?: number;
  readonly maksimum?: number;
  readonly maksimum_wylaczne?: number;
  readonly wartosci?: readonly WartoscWyboru[];
  readonly kolekcje?: readonly KolekcjaReferencji[];
  /** Pola obiektu (`obiekt`) albo pola KAŻDEGO elementu listy (`lista`). */
  readonly pola?: readonly OpisPola[];
  readonly warianty?: readonly OpisWariantu[];
}

export interface OpisRodzajuZdarzenia {
  readonly rodzaj: string;
  readonly etykieta_pl: string;
  readonly wykonywany_przez_rdzen: boolean;
  readonly pola: readonly OpisPola[];
}

export interface OpisScenariusza {
  readonly kontrakt: string;
  readonly pola_scenariusza: readonly OpisPola[];
  readonly rodzaje_zdarzen: readonly OpisRodzajuZdarzenia[];
  readonly nastawy_solvera: readonly OpisPola[];
}

// ---------------------------------------------------------------------------
// Gotowość i modele dynamiczne źródeł
// ---------------------------------------------------------------------------

export interface ProfilZgodny {
  readonly profile_id: string;
  readonly nazwa: string;
  readonly rodzina_docelowa: string;
  readonly model_w_rdzeniu: boolean;
}

export interface AkcjaNaprawczaDynamiki {
  readonly kod: string;
  readonly komunikat_pl: string;
  readonly nawigacja: Record<string, string>;
}

export type StanModeluZrodla = 'z_katalogu' | 'wlasny' | 'brak' | 'odmowa' | 'nieaktualna';

export interface ZrodloDynamiki {
  readonly ref_id: string;
  readonly nazwa: string;
  readonly gen_type: string | null;
  readonly wiazanie: string | null;
  readonly stan: StanModeluZrodla;
  readonly rodzina: string | null;
  readonly zrodlo_proweniencji: string | null;
  readonly odniesienie_proweniencji: string | null;
  readonly odmowa_kod: string | null;
  readonly odmowa_komunikat: string | null;
  readonly profil_typu: string | null;
  readonly profile_zgodne: readonly ProfilZgodny[];
  readonly akcja_naprawcza: AkcjaNaprawczaDynamiki | null;
}

export interface BrakModelu {
  readonly kod: string;
  readonly komunikat_pl: string;
  readonly elementy: readonly { readonly ref_id: string; readonly nazwa: string | null }[];
}

export interface BiegRozplywu {
  readonly run_id: string;
  readonly created_at: string;
  readonly finished_at: string | null;
}

export interface GotowoscDynamiki {
  readonly gotowosc: {
    readonly status: 'ready' | 'partial' | 'blocked' | 'n_a' | string;
    readonly label_pl: string;
    readonly missing_fields_pl: readonly string[];
    readonly recommended_action_pl: string | null;
  };
  readonly braki_modelu: readonly BrakModelu[];
  readonly kopie_nieaktualne: readonly string[];
  readonly zrodla: readonly ZrodloDynamiki[];
  readonly biegi_rozplywu: readonly BiegRozplywu[];
}

// ---------------------------------------------------------------------------
// Scenariusze nazwane
// ---------------------------------------------------------------------------

export type WartoscZdarzenia =
  | string
  | number
  | boolean
  | null
  | readonly WartoscZdarzenia[]
  | { readonly [pole: string]: WartoscZdarzenia };

export interface ZdarzenieScenariusza {
  readonly rodzaj: string;
  readonly [pole: string]: WartoscZdarzenia;
}

export interface HarmonogramDynamiki {
  readonly zdarzenia: readonly ZdarzenieScenariusza[];
  readonly [pole: string]: WartoscZdarzenia | readonly ZdarzenieScenariusza[];
}

export interface ScenariuszDynamiki {
  readonly scenario_id: string;
  readonly name: string;
  readonly revision: number;
  readonly hash: string;
  readonly dynamika: HarmonogramDynamiki;
}

export interface BladPolaScenariusza {
  readonly pole: string;
  readonly komunikat: string;
}

// ---------------------------------------------------------------------------
// Wynik biegu
// ---------------------------------------------------------------------------

export interface KanalWyniku {
  readonly klucz: string;
  readonly przestrzen: string;
  readonly jednostka: string;
  readonly element_ref: string | null;
  readonly opis_pl: string;
}

export type GrupaKanalu = 'szyna' | 'urzadzenie' | 'galaz' | 'miejsce_zwarcia';

export interface OpisKanalu {
  readonly klucz: string;
  readonly wielkosc_pl: string;
  readonly jednostka: string;
  readonly przestrzen: string;
  readonly grupa: GrupaKanalu;
  readonly element_ref: string | null;
  readonly zacisk: 'od' | 'do' | null;
  readonly polozenie_zwarcia: number | null;
}

export interface ZaciskElementu {
  readonly szyna_ref: string | null;
  readonly szyna_nazwa: string | null;
}

export interface OpisElementu {
  readonly ref_id: string;
  readonly nazwa: string | null;
  readonly rodzaj_pl: string | null;
  readonly kolekcja: string | null;
  readonly typ: string | null;
  readonly zacisk_od?: ZaciskElementu;
  readonly zacisk_do?: ZaciskElementu;
}

export interface OdbiorOdciety {
  readonly ref: string;
  readonly p_pu: number;
  readonly q_pu: number;
}

export interface PrzypisanieWykonane {
  /** Adres stanu `urzadzenie.stan` (opis po polsku: `opis_wyniku.zdarzenia[i].przypisania`). */
  readonly adres: string;
  readonly przed: number;
  readonly po: number;
}

export interface ZdarzenieWykonane {
  readonly t_zaplanowany_s: number;
  readonly t_wykonany_s: number;
  readonly rodzaj: string;
  readonly ref: string | null;
  /** `harmonogram` albo `dozor:<ident>` (opis: `opis_wyniku.zdarzenia[i].przyczyna_pl`). */
  readonly przyczyna: string;
  readonly delta_x_nieprzypisane_max: number;
  readonly delta_y_max: number;
  readonly residuum_kcl_max: number;
  readonly obszary_odciete: readonly string[];
  readonly odbiory_odciete: readonly OdbiorOdciety[];
  readonly obszary_zasilone_ponownie: readonly string[];
  readonly przypisania: readonly PrzypisanieWykonane[];
  readonly t_zlokalizowany_s: number | null;
  readonly szerokosc_przedzialu_s: number | null;
  readonly iteracje_lokalizacji: number | null;
  readonly g_przed: number | null;
  readonly g_po: number | null;
}

/** Przekroczenie progu przez wielkość detektora scenariusza (bez działania na sieć). */
export interface Przekroczenie {
  readonly dozor: string;
  readonly wielkosc: string;
  readonly prog: number;
  readonly kierunek: 'w_dol' | 'w_gore';
  readonly t_s: number;
  readonly szerokosc_przedzialu_s: number;
  readonly iteracje: number;
}

export interface OpisZdarzeniaWykonanego {
  readonly rodzaj_pl: string;
  readonly przyczyna_pl: string;
  readonly przypisania: readonly {
    readonly element_ref: string;
    readonly stan_pl: string;
    readonly jednostka: string | null;
  }[];
}

export interface OpisPrzekroczenia {
  readonly wielkosc_pl: string;
  readonly jednostka: string | null;
  readonly element_ref: string | null;
  readonly zacisk: 'od' | 'do' | null;
  readonly kierunek_pl: string;
}

export interface MetrykaWyniku {
  readonly klucz: string;
  readonly wartosc: number;
  readonly jednostka: string;
  readonly wzor_ref: string | null;
  readonly element_ref: string | null;
}

export interface StopienDowodowy {
  readonly capability_id: string;
  readonly tier: string;
  readonly tier_pl: string;
  readonly claim_kind_pl: string;
  readonly regulatory_evidence_eligible: boolean;
  readonly rationale_pl: string;
}

export interface OpisWyniku {
  readonly kanaly: readonly OpisKanalu[];
  readonly metryki: readonly { readonly klucz: string; readonly opis_pl: string; readonly element_ref: string | null }[];
  readonly zdarzenia: readonly OpisZdarzeniaWykonanego[];
  readonly przekroczenia: readonly OpisPrzekroczenia[];
  readonly elementy: Readonly<Record<string, OpisElementu>>;
  readonly baza_mocy_mva: number | null;
  /** Założenia modelu wejścia biegu — zdania po polsku z nazwami elementów (pierwszy plan). */
  readonly zalozenia_modelu: readonly string[];
  /** Założenia zapisane przez rdzeń obliczeń (identyfikatory węzłów) — widok techniczny. */
  readonly zalozenia_rdzenia: readonly string[];
}

export interface WynikDynamiki {
  readonly run_id: string;
  readonly kontrakt: string;
  readonly kanaly: readonly KanalWyniku[];
  readonly zdarzenia_wykonane: readonly ZdarzenieWykonane[];
  /** `siec` — zakłócenia sieci; `stanowisko` — sieć zasilana źródłem testowym U/f/faza. */
  readonly tryb_scenariusza: 'siec' | 'stanowisko';
  readonly przekroczenia: readonly Przekroczenie[];
  readonly wlasnosci_biegu: {
    readonly zbiegl: boolean;
    readonly kroki: number;
    readonly kroki_odrzucone: number;
    readonly max_residuum_f: number;
    readonly max_residuum_g: number;
    readonly czas_obliczen_s: number;
    readonly integrator: string;
    readonly dt_s: number;
    readonly tolerancja: number;
  };
  readonly tozsamosc: Readonly<Record<string, string>>;
  readonly metryki: readonly MetrykaWyniku[];
  readonly stopien_dowodowy: readonly StopienDowodowy[];
  readonly zalozenia: readonly string[];
  readonly pf_run_id: string | null;
  readonly opis_wyniku: OpisWyniku;
  readonly oceny: readonly RekordOcenyNiewykonanej[];
}

/** Strona próbki w chwili zdarzenia: `C` ciągła, `L` tuż przed, `P` tuż po zdarzeniu. */
export type StronaProbki = 'C' | 'L' | 'P';

export interface PrzebiegiDynamiki {
  readonly run_id: string;
  readonly os_czasu_s: readonly number[];
  readonly strona_probki: readonly StronaProbki[];
  readonly probki: Readonly<Record<string, readonly (number | null)[]>>;
}

// ---------------------------------------------------------------------------
// Funkcje prezentacji (czyste)
// ---------------------------------------------------------------------------

/**
 * Nazwa elementu wyniku DO WYŚWIETLENIA — z migawki BIEGU (`opis_wyniku.elementy`).
 * Element bez nazwy w modelu dostaje jawny opis braku, nie identyfikator.
 */
export function nazwaElementu(opis: OpisWyniku, ref: string | null, brakNazwy: string): string {
  if (!ref) return brakNazwy;
  return opis.elementy[ref]?.nazwa ?? brakNazwy;
}

/** Symbol jednostki do wyświetlenia (pisownia symbolu; wartość i jednostka z backendu). */
export function symbolJednostki(jednostka: string | null | undefined): string {
  switch (jednostka) {
    case 'deg':
      return '°';
    case 'hz':
    case 'Hz':
      return 'Hz';
    default:
      return jednostka ?? '';
  }
}

export interface PozycjaKanalu {
  readonly klucz: string;
  /** Wielkość po polsku + zacisk z nazwą szyny (gałąź) albo miejsce zwarcia x. */
  readonly etykieta: string;
  readonly jednostka: string;
}

export interface GrupaElementu {
  /** Klucz grupy: `ref_id` elementu (albo klucz kanału dla elementu nieznanego). */
  readonly klucz: string;
  readonly elementRef: string | null;
  readonly nazwa: string;
  readonly rodzaj: string;
  readonly grupa: GrupaKanalu;
  readonly kanaly: readonly PozycjaKanalu[];
}

const KOLEJNOSC_GRUP: Record<GrupaKanalu, number> = {
  szyna: 0,
  galaz: 1,
  miejsce_zwarcia: 2,
  urzadzenie: 3,
};

export interface TekstyKanalow {
  readonly brakNazwy: string;
  readonly zaciskOd: string;
  readonly zaciskDo: string;
  readonly miejsceZwarcia: string;
  readonly rodzajMiejscaZwarcia: string;
}

/** Etykieta kanału: wielkość + zacisk od/do z NAZWĄ szyny zacisku, albo miejsce x·L. */
export function etykietaKanalu(opis: OpisWyniku, kanal: OpisKanalu, t: TekstyKanalow): string {
  if (kanal.zacisk !== null && kanal.element_ref) {
    const element = opis.elementy[kanal.element_ref];
    const zacisk = kanal.zacisk === 'od' ? element?.zacisk_od : element?.zacisk_do;
    const strona = kanal.zacisk === 'od' ? t.zaciskOd : t.zaciskDo;
    return `${kanal.wielkosc_pl} — ${strona}: ${zacisk?.szyna_nazwa ?? t.brakNazwy}`;
  }
  if (kanal.grupa === 'miejsce_zwarcia' && kanal.polozenie_zwarcia !== null) {
    return `${kanal.wielkosc_pl} — ${t.miejsceZwarcia} x = ${kanal.polozenie_zwarcia}`;
  }
  return kanal.wielkosc_pl;
}

/**
 * Kanały pogrupowane po ELEMENCIE (szyny, gałęzie, miejsca zwarcia, urządzenia),
 * w obrębie grupy w kolejności odpowiedzi backendu. Miejsce zwarcia jest osobną
 * grupą elementu gałęzi (inna wielkość fizyczna niż zaciski gałęzi).
 */
export function grupujKanaly(opis: OpisWyniku, t: TekstyKanalow): GrupaElementu[] {
  const grupy = new Map<string, { naglowek: Omit<GrupaElementu, 'kanaly'>; kanaly: PozycjaKanalu[] }>();
  for (const kanal of opis.kanaly) {
    const ref = kanal.element_ref;
    const klucz = `${kanal.grupa}|${ref ?? kanal.klucz}`;
    let wpis = grupy.get(klucz);
    if (!wpis) {
      const element = ref ? opis.elementy[ref] : undefined;
      wpis = {
        naglowek: {
          klucz,
          elementRef: ref,
          nazwa: nazwaElementu(opis, ref, t.brakNazwy),
          rodzaj:
            kanal.grupa === 'miejsce_zwarcia'
              ? t.rodzajMiejscaZwarcia
              : element?.rodzaj_pl ?? t.brakNazwy,
          grupa: kanal.grupa,
        },
        kanaly: [],
      };
      grupy.set(klucz, wpis);
    }
    wpis.kanaly.push({
      klucz: kanal.klucz,
      etykieta: etykietaKanalu(opis, kanal, t),
      jednostka: kanal.jednostka,
    });
  }
  return [...grupy.values()]
    .map(({ naglowek, kanaly }) => ({ ...naglowek, kanaly }))
    .sort(
      (a, b) =>
        KOLEJNOSC_GRUP[a.grupa] - KOLEJNOSC_GRUP[b.grupa] || a.nazwa.localeCompare(b.nazwa, 'pl'),
    );
}

/** Domyślny wybór kanałów: moduł napięcia każdej szyny (przegląd zapadu w sieci). */
export function domyslneKanaly(opis: OpisWyniku): string[] {
  return opis.kanaly.filter((k) => k.klucz.startsWith('u_pu@')).map((k) => k.klucz);
}

/** Klucze kanałów elementu (sprzężenie zaznaczenia na schemacie z przeglądarką). */
export function kanalyElementu(opis: OpisWyniku, ref: string): string[] {
  return opis.kanaly.filter((k) => k.element_ref === ref).map((k) => k.klucz);
}

export interface WierszWykresu {
  readonly t_s: number;
  readonly strona: StronaProbki;
  readonly [klucz: string]: number | null | string;
}

/**
 * Wiersze wykresu WPROST z próbek backendu: jedna próbka = jeden wiersz, w kolejności
 * osi czasu. W chwili zdarzenia są DWA wiersze o tym samym `t_s` (strona `L` i `P`) —
 * skok jest nieciągłością, nie interpolacją między chwilami. `null` zostaje `null`
 * (przerwa linii, `connectNulls=false`), nie zero.
 */
export function wierszeWykresu(
  przebiegi: PrzebiegiDynamiki,
  klucze: readonly string[],
): WierszWykresu[] {
  return przebiegi.os_czasu_s.map((t, i) => {
    const wiersz: Record<string, number | null | string> = {
      t_s: t,
      strona: przebiegi.strona_probki[i] ?? 'C',
    };
    for (const klucz of klucze) {
      const szereg = przebiegi.probki[klucz];
      wiersz[klucz] = szereg ? szereg[i] ?? null : null;
    }
    return wiersz as WierszWykresu;
  });
}

/** Kanały wybrane, rozdzielone na wykresy wg jednostki (wspólna oś czasu, osobna oś Y). */
export function podzialNaWykresy(
  opis: OpisWyniku,
  wybrane: readonly string[],
): { jednostka: string; klucze: string[] }[] {
  const wg = new Map<string, string[]>();
  for (const kanal of opis.kanaly) {
    if (!wybrane.includes(kanal.klucz)) continue;
    const lista = wg.get(kanal.jednostka) ?? [];
    lista.push(kanal.klucz);
    wg.set(kanal.jednostka, lista);
  }
  return [...wg.entries()].map(([jednostka, klucze]) => ({ jednostka, klucze }));
}

/** Chwile zdarzeń wykonanych (bez powtórzeń) — linie osi zdarzeń na wykresach. */
export function chwileZdarzen(zdarzenia: readonly ZdarzenieWykonane[]): number[] {
  return [...new Set(zdarzenia.map((z) => z.t_wykonany_s))].sort((a, b) => a - b);
}

/** Wartość liczbowa do wyświetlenia (bez zaokrąglania fizyki — formatowanie cyfr). */
export function fmtLiczba(n: number | null | undefined, cyfry = 4): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n.toPrecision(cyfry)).toString().replace('.', ',');
}

// ---------------------------------------------------------------------------
// Edytor scenariusza — wartości formularza <-> harmonogram kontraktu
// ---------------------------------------------------------------------------

/**
 * Wartość pola formularza: tekst (liczba, wybór, referencja, wartość logiczna `tak`/`nie`),
 * pola zagnieżdżone (obiekt; unia — z kluczem `rodzaj` wybranego wariantu) albo lista
 * obiektów (`lista`).
 */
export type WartoscFormularza =
  | string
  | WartoscFormularza[]
  | { [pole: string]: WartoscFormularza };

/** Wartości formularza pola logicznego (bez domyślnej: puste = nie wybrano). */
export const WARTOSC_TAK = 'tak';
export const WARTOSC_NIE = 'nie';
/** Klucz wariantu unii w wartości formularza (dyskryminator kontraktu). */
export const KLUCZ_WARIANTU = 'rodzaj';

export interface ZdarzenieFormularza {
  readonly rodzaj: string;
  readonly wartosci: { [pole: string]: WartoscFormularza };
}

function pustaWartosc(pole: OpisPola): WartoscFormularza {
  if (pole.typ === 'obiekt') return pusteWartosci(pole.pola ?? []);
  if (pole.typ === 'lista') return [];
  if (pole.typ === 'unia') return { [KLUCZ_WARIANTU]: '' };
  return '';
}

function pusteWartosci(pola: readonly OpisPola[]): { [pole: string]: WartoscFormularza } {
  const wynik: { [pole: string]: WartoscFormularza } = {};
  for (const pole of pola) wynik[pole.nazwa] = pustaWartosc(pole);
  return wynik;
}

/** Nowy element listy (np. detektor) — wszystkie pola puste. */
export function nowyElementListy(pole: OpisPola): { [pole: string]: WartoscFormularza } {
  return pusteWartosci(pole.pola ?? []);
}

/** Wariant unii po zmianie wyboru — pola wariantu puste (zero przenoszenia wartości). */
export function nowyWariant(pole: OpisPola, rodzaj: string): { [pole: string]: WartoscFormularza } {
  const wariant = (pole.warianty ?? []).find((w) => w.rodzaj === rodzaj);
  return { [KLUCZ_WARIANTU]: rodzaj, ...pusteWartosci(wariant?.pola ?? []) };
}

function obiektFormularza(wartosc: WartoscFormularza | undefined): { [p: string]: WartoscFormularza } {
  return wartosc && typeof wartosc === 'object' && !Array.isArray(wartosc) ? wartosc : {};
}

function rekordZdarzenia(wartosc: WartoscZdarzenia | undefined): Record<string, WartoscZdarzenia> {
  return wartosc && typeof wartosc === 'object' && !Array.isArray(wartosc)
    ? (wartosc as Record<string, WartoscZdarzenia>)
    : {};
}

/** Nowe zdarzenie rodzaju — wszystkie pola puste (zero wartości domyślnych w UI). */
export function noweZdarzenie(rodzaj: OpisRodzajuZdarzenia): ZdarzenieFormularza {
  return { rodzaj: rodzaj.rodzaj, wartosci: pusteWartosci(rodzaj.pola) };
}

function polaDoFormularza(
  pola: readonly OpisPola[],
  obiekt: Record<string, WartoscZdarzenia>,
): { [p: string]: WartoscFormularza } {
  const wynik: { [p: string]: WartoscFormularza } = {};
  for (const podpole of pola) wynik[podpole.nazwa] = wartoscDoFormularza(podpole, obiekt[podpole.nazwa]);
  return wynik;
}

function wartoscDoFormularza(pole: OpisPola, wartosc: WartoscZdarzenia | undefined): WartoscFormularza {
  if (pole.typ === 'obiekt') return polaDoFormularza(pole.pola ?? [], rekordZdarzenia(wartosc));
  if (pole.typ === 'lista') {
    return (Array.isArray(wartosc) ? wartosc : []).map((element) =>
      polaDoFormularza(pole.pola ?? [], rekordZdarzenia(element as WartoscZdarzenia)),
    );
  }
  if (pole.typ === 'unia') {
    const obiekt = rekordZdarzenia(wartosc);
    const rodzaj = typeof obiekt[KLUCZ_WARIANTU] === 'string' ? (obiekt[KLUCZ_WARIANTU] as string) : '';
    const wariant = (pole.warianty ?? []).find((w) => w.rodzaj === rodzaj);
    return { [KLUCZ_WARIANTU]: rodzaj, ...polaDoFormularza(wariant?.pola ?? [], obiekt) };
  }
  if (wartosc === null || wartosc === undefined) return '';
  if (pole.typ === 'logiczna') return wartosc === true ? WARTOSC_TAK : WARTOSC_NIE;
  return String(wartosc);
}

/** Zdarzenie zapisanego harmonogramu -> wartości formularza (rodzaj z opisu kontraktu). */
export function zdarzenieDoFormularza(
  opis: OpisScenariusza,
  zdarzenie: ZdarzenieScenariusza,
): ZdarzenieFormularza {
  const rodzaj = opis.rodzaje_zdarzen.find((r) => r.rodzaj === zdarzenie.rodzaj);
  const wartosci: { [pole: string]: WartoscFormularza } = {};
  for (const pole of rodzaj?.pola ?? []) wartosci[pole.nazwa] = wartoscDoFormularza(pole, zdarzenie[pole.nazwa]);
  return { rodzaj: zdarzenie.rodzaj, wartosci };
}

export interface BladFormularza {
  /** Ścieżka pola: `horyzont_s`, `zdarzenia.0.t_s`, `nastawy.dt_s`. */
  readonly sciezka: string;
  readonly komunikat: string;
}

function wartoscPola(
  pole: OpisPola,
  wartosc: WartoscFormularza | undefined,
  sciezka: string,
  bledy: BladFormularza[],
  teksty: TekstyWalidacji,
): WartoscZdarzenia | undefined {
  if (pole.typ === 'obiekt') {
    return wartosciPol(pole.pola ?? [], obiektFormularza(wartosc), sciezka, bledy, teksty);
  }
  if (pole.typ === 'lista') {
    const lista = Array.isArray(wartosc) ? wartosc : [];
    return lista.map((element, i) =>
      wartosciPol(pole.pola ?? [], obiektFormularza(element), `${sciezka}.${i}`, bledy, teksty),
    );
  }
  if (pole.typ === 'unia') {
    const obiekt = obiektFormularza(wartosc);
    const rodzaj = typeof obiekt[KLUCZ_WARIANTU] === 'string' ? (obiekt[KLUCZ_WARIANTU] as string) : '';
    const wariant = (pole.warianty ?? []).find((w) => w.rodzaj === rodzaj);
    if (!wariant) {
      if (pole.dopuszcza_brak) return null;
      if (pole.wymagane) bledy.push({ sciezka, komunikat: teksty.wymagane });
      return undefined;
    }
    return {
      [KLUCZ_WARIANTU]: rodzaj,
      ...wartosciPol(wariant.pola, obiekt, sciezka, bledy, teksty),
    };
  }
  const tekst = typeof wartosc === 'string' ? wartosc.trim() : '';
  if (tekst === '') {
    // Brak wartości dopuszczony kontraktem (`null`) nie jest błędem — także w polu
    // wymaganym: klucz jest wtedy obecny z wartością `null` (np. nastawa, którą adapter
    // przyjmuje pustą). Inaczej pole wymagane puste = błąd, niewymagane — pominięte.
    if (pole.dopuszcza_brak) return null;
    if (pole.wymagane) bledy.push({ sciezka, komunikat: teksty.wymagane });
    return undefined;
  }
  if (pole.typ === 'logiczna') return tekst === WARTOSC_TAK;
  if (pole.typ === 'liczba' || pole.typ === 'calkowita') {
    const liczba = Number(tekst.replace(',', '.'));
    if (!Number.isFinite(liczba) || (pole.typ === 'calkowita' && !Number.isInteger(liczba))) {
      bledy.push({ sciezka, komunikat: pole.typ === 'calkowita' ? teksty.calkowita : teksty.liczba });
      return undefined;
    }
    return liczba;
  }
  return tekst;
}

function wartosciPol(
  pola: readonly OpisPola[],
  obiekt: { [p: string]: WartoscFormularza },
  sciezka: string,
  bledy: BladFormularza[],
  teksty: TekstyWalidacji,
): Record<string, WartoscZdarzenia> {
  const wynik: Record<string, WartoscZdarzenia> = {};
  for (const podpole of pola) {
    const v = wartoscPola(podpole, obiekt[podpole.nazwa], `${sciezka}.${podpole.nazwa}`, bledy, teksty);
    if (v !== undefined) wynik[podpole.nazwa] = v;
  }
  return wynik;
}

export interface TekstyWalidacji {
  readonly wymagane: string;
  readonly liczba: string;
  readonly calkowita: string;
  readonly brakZdarzen: string;
}

/**
 * Formularz -> harmonogram kontraktu `ScenariuszDynamiczny` (bez granic liczbowych —
 * granice i spójność sprawdza backend i zwraca błąd z nazwą pola). UI sprawdza tylko
 * to, bez czego nie da się zbudować ładunku: wymagane pole i poprawny zapis liczby.
 */
export function zbudujHarmonogram(
  opis: OpisScenariusza,
  polaScenariusza: { [pole: string]: WartoscFormularza },
  zdarzenia: readonly ZdarzenieFormularza[],
  teksty: TekstyWalidacji,
): { harmonogram: HarmonogramDynamiki | null; bledy: BladFormularza[] } {
  const bledy: BladFormularza[] = [];
  const harmonogram: Record<string, WartoscZdarzenia | ZdarzenieScenariusza[]> = {};
  for (const pole of opis.pola_scenariusza) {
    const v = wartoscPola(pole, polaScenariusza[pole.nazwa], pole.nazwa, bledy, teksty);
    if (v !== undefined) harmonogram[pole.nazwa] = v;
  }
  if (zdarzenia.length === 0) bledy.push({ sciezka: 'zdarzenia', komunikat: teksty.brakZdarzen });
  const lista: ZdarzenieScenariusza[] = [];
  zdarzenia.forEach((zdarzenie, i) => {
    const rodzaj = opis.rodzaje_zdarzen.find((r) => r.rodzaj === zdarzenie.rodzaj);
    const wpis: Record<string, WartoscZdarzenia> = { rodzaj: zdarzenie.rodzaj };
    for (const pole of rodzaj?.pola ?? []) {
      const v = wartoscPola(pole, zdarzenie.wartosci[pole.nazwa], `zdarzenia.${i}.${pole.nazwa}`, bledy, teksty);
      if (v !== undefined) wpis[pole.nazwa] = v;
    }
    lista.push(wpis as ZdarzenieScenariusza);
  });
  harmonogram.zdarzenia = lista;
  return {
    harmonogram: bledy.length === 0 ? (harmonogram as unknown as HarmonogramDynamiki) : null,
    bledy,
  };
}

/** Nastawy solvera z formularza (komplet pól kontraktu, bez domyślnych). */
export function zbudujNastawy(
  opis: OpisScenariusza,
  wartosci: { [pole: string]: WartoscFormularza },
  teksty: TekstyWalidacji,
): { nastawy: Record<string, WartoscZdarzenia> | null; bledy: BladFormularza[] } {
  const bledy: BladFormularza[] = [];
  const nastawy: Record<string, WartoscZdarzenia> = {};
  for (const pole of opis.nastawy_solvera) {
    const v = wartoscPola(pole, wartosci[pole.nazwa], `nastawy.${pole.nazwa}`, bledy, teksty);
    if (v !== undefined) nastawy[pole.nazwa] = v;
  }
  return { nastawy: bledy.length === 0 ? nastawy : null, bledy };
}

/** Puste wartości formularza dla listy pól (pola scenariusza, nastawy solvera). */
export function pustyFormularz(pola: readonly OpisPola[]): { [pole: string]: WartoscFormularza } {
  return pusteWartosci(pola);
}

/** Harmonogram zapisany -> wartości pól scenariusza formularza. */
export function polaScenariuszaDoFormularza(
  opis: OpisScenariusza,
  harmonogram: HarmonogramDynamiki,
): { [pole: string]: WartoscFormularza } {
  const wynik: { [pole: string]: WartoscFormularza } = {};
  for (const pole of opis.pola_scenariusza) {
    wynik[pole.nazwa] = wartoscDoFormularza(pole, harmonogram[pole.nazwa] as WartoscZdarzenia);
  }
  return wynik;
}

/** Zakres dopuszczalny pola z kontraktu jako tekst podpowiedzi (np. „(0; 600]"). */
export function zakresPola(pole: OpisPola): string | null {
  const lewy =
    pole.minimum_wylaczne !== undefined
      ? `(${fmtLiczba(pole.minimum_wylaczne, 6)}`
      : pole.minimum !== undefined
        ? `[${fmtLiczba(pole.minimum, 6)}`
        : null;
  const prawy =
    pole.maksimum_wylaczne !== undefined
      ? `${fmtLiczba(pole.maksimum_wylaczne, 6)})`
      : pole.maksimum !== undefined
        ? `${fmtLiczba(pole.maksimum, 6)}]`
        : null;
  if (lewy === null && prawy === null) return null;
  return `${lewy ?? '(−∞'}; ${prawy ?? '∞)'}`;
}

/**
 * Typ elementu zaznaczenia na schemacie z kolekcji i dyskryminatora elementu w migawce
 * biegu (`opis_wyniku.elementy[ref].kolekcja/typ`). Łączniki leżą w kolekcji gałęzi.
 */
export function typZaznaczenia(
  element: OpisElementu | undefined,
):
  | 'Bus'
  | 'LineBranch'
  | 'Switch'
  | 'TransformerBranch'
  | 'Generator'
  | 'Source'
  | 'Load'
  | null {
  switch (element?.kolekcja) {
    case 'buses':
      return 'Bus';
    case 'branches':
      return element.typ === 'line_overhead' || element.typ === 'cable' ? 'LineBranch' : 'Switch';
    case 'transformers':
      return 'TransformerBranch';
    case 'generators':
      return 'Generator';
    case 'sources':
      return 'Source';
    case 'loads':
      return 'Load';
    default:
      return null;
  }
}
