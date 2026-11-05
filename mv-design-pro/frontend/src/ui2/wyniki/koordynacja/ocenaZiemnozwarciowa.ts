/**
 * Ocena zabezpieczeń ziemnozwarciowych i uziemień stacji — lustro pola `ziemnozwarciowe` wyniku
 * biegu oceny zabezpieczeń (`GET /api/protection-runs/{id}/results`) i wyniku koordynacji
 * (`CoordinationAnalysisResult.ziemnozwarciowe`). Backend:
 * `application/analyses/protection/ocena_ziemnozwarciowa.py` (`WynikOcenyZiemnozwarciowej
 * .to_dict`), fizyka — solver `network_model/solvers/doziemienie_sn.py`.
 *
 * Rekord niesie status maszynowy WYŁĄCZNIE razem z rekordem werdyktu wyjaśnialnego (`ocena`)
 * i zdaniem wyjaśnienia; nazwa kryterium (`kryterium_pl`) i funkcji (`etykieta_pl`) przychodzi
 * z backendu (jedno źródło dla ekranu, karty nastaw i raportu). ZERO fizyki i ZERO ocen
 * w UI — moduł wybiera i porządkuje rekordy, niczego nie liczy.
 */

import type { BrakNastaw } from '../../../ui/protection/nastawyModelu';
import type { Etykieta, OcenaKryterium, StanZrodla, StatusWerdyktu } from '../wzorzec/werdykt';

/** Jeden rekord kryterium funkcji ziemnozwarciowej, uziemienia stacji albo odmowy oceny. */
export interface RekordOcenyZiemnozwarciowej {
  urzadzenie_ref: string;
  nazwa_urzadzenia_pl: string;
  funkcja_ref: string | null;
  kod: string | null;
  etykieta_pl: string | null;
  /** Rodzaj kryterium (lista zamknięta backendu; stopniowanie z przyrostkiem pary). */
  kryterium: string;
  kryterium_pl: string;
  status: StatusWerdyktu;
  zdanie_pl: string;
  /** Wynik zapisem generatora werdyktu (liczba z jednostką; dla 67N z nazwanym rzutem). */
  wynik_pl: string | null;
  /** Wartość wymagana tym samym zapisem. */
  limit_pl: string | null;
  /** 67N: rzut 3I₀ względem kierunku działania; `null` — wynik nie jest rzutem. */
  kierunek_rzutu: 'ZGODNY' | 'PRZECIWNY' | null;
  /** Odmowa oceny: braki z akcją naprawczą. */
  braki?: BrakNastaw[];
  /** Odmowa oceny: braki złożone przez backend (podmiot raz, jedno wezwanie). */
  braki_pl?: string[];
  /** Kryterium bez danych do oceny (np. napięcie krokowe bez geometrii uziomu). */
  czego_brakuje_pl?: string | null;
  ocena: OcenaKryterium;
}

/** Kolumna tabeli rodziny (rejestr backendu `rodziny_eaz.py` — jedno źródło zestawu kolumn). */
export interface KolumnaRodziny {
  klucz: string;
  /** Nagłówek z jednostką, np. „I₀> [A]”. */
  naglowek_pl: string;
  opis_pl: string;
}

/** Rodzina zabezpieczeń ziemnozwarciowych z własnym zestawem kolumn i kodami funkcji. */
export interface RodzinaEaz {
  id: string;
  nazwa_pl: string;
  kody: string[];
  kolumny: KolumnaRodziny[];
}

/** Komórka wiersza rodziny — liczba policzona przez backend albo tekst; `spelnia === false`
 *  to jedyny powód koloru (liczba niespełniająca kryterium). */
export interface KomorkaRodziny {
  wartosc: number | null;
  jednostka: string;
  spelnia: boolean | null;
  tekst: string | null;
  powod_pl: string | null;
}

/** Wymagany współczynnik (k_b, k_c, k_c,opor) z podstawą i stanem źródła. */
export interface WymaganieWspolczynnika {
  symbol: string;
  wartosc: number;
  przyjete: boolean;
  stan_zrodla: StanZrodla;
  zrodlo_pl: string;
  uzasadnienie_pl: string;
}

/** Jeden warunek algorytmu 67N (rozruch U₀, sektor, próg rzutu) — wartość, nastawa, zapas. */
export interface WarunekAlgorytmu67N {
  klucz: 'U0' | 'SEKTOR' | 'PROG';
  opis_pl: string;
  wartosc: number;
  nastawa: number;
  zapas: number;
  jednostka: string;
  spelniony: boolean;
  warunek_latex: string;
}

export type RolaWskazu = 'W_POLU' | 'POZA_POLEM';

/** Wskaz 3I₀ w układzie odniesienia −U₀ (0°), w amperach — z algorytmu backendu. */
export interface WskazWykresu {
  rola: RolaWskazu;
  punkt_pl: string;
  modul_a: number;
  kat_deg: number;
  re_a: number;
  im_a: number;
  wielkosc_a: number;
  u0_proc: number;
  warunki: WarunekAlgorytmu67N[];
  rozstrzygajacy: WarunekAlgorytmu67N['klucz'];
  dziala: boolean;
}

type Punkt = [number, number];

/** Dane wykresu wskazowego 67N — ekran wyłącznie mnoży je przez skalę rysunku. */
export interface WykresWskazowy67N {
  os_deg: number;
  os: Punkt;
  granice: [Punkt, Punkt];
  polowa_sektora_deg: number;
  /** Sektor działania szerszy niż półpłaszczyzna — łuk sektora rysowany „dużym łukiem”. */
  sektor_duzy_luk: boolean;
  tryb: 'RZUT' | 'SEKTOR';
  tryb_pl: string;
  prog_a: number;
  prog_u0_proc: number;
  skala_a: number;
  prog_odcinek?: [Punkt, Punkt];
  prog_luk?: { promien_a: number; od: Punkt; do: Punkt; duzy_luk: boolean };
  wskazy: WskazWykresu[];
}

/** Wzór podstawiony (KaTeX) wiersza. */
export interface WzorWiersza {
  symbol_latex: string;
  wzor_latex: string;
}

/** Wiersz tabeli rodziny: pole · funkcja ANSI · stopień · grupa nastaw. */
export interface WierszRodziny {
  rodzina: string;
  urzadzenie_ref: string;
  sterownik_pl: string;
  pole_pl: string | null;
  funkcja_ref: string;
  kod: string;
  ansi: string;
  oznaczenie_pl: string;
  etykieta_pl: string;
  grupa: number | null;
  stan: StatusWerdyktu;
  /** Etykieta rekordu rozstrzygającego stan (tekst i semantyka z backendu). */
  etykieta: Etykieta;
  przyczyna_pl: string | null;
  wartosci: Record<string, KomorkaRodziny>;
  wymagania: Record<string, WymaganieWspolczynnika>;
  braki: BrakNastaw[];
  braki_pl: string[];
  /** Identyfikatory rekordów werdyktu (`ocena.kryterium_id`) składających się na wiersz. */
  kryteria: string[];
  wzory: WzorWiersza[];
  warunki_67n: Record<RolaWskazu, WarunekAlgorytmu67N[]> | null;
  wykres_wskazowy: WykresWskazowy67N | null;
}

/** Stałe dane sieci (pasek „Sieć”) — jedna pozycja na sieć doziemną. */
export interface SiecDoziemna {
  numer: number;
  sposob: string;
  sposob_pl: string;
  prad_pojemnosciowy_a: number | null;
  rozstrojenie_proc: number | null;
  prad_resztkowy_a: number | null;
  prad_dlawikow_a: number | null;
  awsc_prad_a: number | null;
  awsc_czas_s: number | null;
}

/** Parametry przypadku doziemienia (pasek „Przypadek doziemienia”). */
export interface PrzypadekDoziemienia {
  rodzaj: string;
  r_f_ohm: number;
  c_min: number;
  c_max: number;
  liczba_punktow: number;
  stany_awsc: string[];
  u0_min_proc: number | null;
  u0_max_proc: number | null;
  prad_doziemny_max_a: number | null;
}

/** Wiersz tabeli uziemień stacji (U_E i U_T w osobnych kolumnach). */
export interface WierszUziemienia {
  stacja_ref: string;
  stacja_pl: string;
  punkt_pl: string;
  sposob_pl: string;
  prad_uziomowy_a: number | null;
  rezystancja_uziomu_ohm: number | null;
  napiecie_uziomowe_v: number | null;
  napiecie_dotykowe_v: number | null;
  napiecie_dotykowe_dopuszczalne_v: number | null;
  rezystancja_maksymalna_ohm: number | null;
  napiecie_krokowe_v: number | null;
  t_f_s: number | null;
  wspolczynnik_r: number | null;
  wspolczynnik_r_przyjety: boolean;
  stan: StatusWerdyktu;
  etykieta: Etykieta;
  przyczyna_pl: string | null;
  /** Kolumna → klucz przypisu (`przypisy_uziemien`). */
  przypisy_kolumn: Record<string, string>;
  wzor_pradu_latex: string | null;
  r_e_max_latex: string | null;
  kryteria: string[];
}

/** Pole `ziemnozwarciowe` wyniku (rekordy; ślad obliczenia i wyniki uziemień — dane White Box). */
export interface WynikOcenyZiemnozwarciowej {
  oceny: RekordOcenyZiemnozwarciowej[];
  uziemienia: RekordOcenyZiemnozwarciowej[];
  odmowy: RekordOcenyZiemnozwarciowej[];
  doziemienie: Record<string, unknown>;
  wyniki_uziemien: Record<string, unknown>[];
  funkcje: Record<string, unknown>[];
  rodziny?: RodzinaEaz[];
  wiersze?: WierszRodziny[];
  siec?: SiecDoziemna[];
  przypadek?: PrzypadekDoziemienia | null;
  wiersze_uziemien?: WierszUziemienia[];
  przypisy_uziemien?: Record<string, string>;
}

/** Wiersze rodzin w kolejności backendu; `urzadzenieRef` zawęża do jednego sterownika. */
export function wierszeRodzin(
  wynik: WynikOcenyZiemnozwarciowej | null | undefined,
  urzadzenieRef?: string,
): WierszRodziny[] {
  const wiersze = wynik?.wiersze ?? [];
  return urzadzenieRef === undefined ? wiersze : wiersze.filter((w) => w.urzadzenie_ref === urzadzenieRef);
}

/** Rekordy werdyktu wiersza (po `kryterium_id`) — w kolejności `wiersz.kryteria`. */
export function rekordyWiersza(
  wynik: WynikOcenyZiemnozwarciowej | null | undefined,
  kryteria: readonly string[],
): OcenaKryterium[] {
  if (!wynik) return [];
  const wgId = new Map<string, OcenaKryterium>();
  for (const r of [...wynik.oceny, ...wynik.uziemienia, ...wynik.odmowy]) {
    if (r.ocena.kryterium_id) wgId.set(r.ocena.kryterium_id, r.ocena);
  }
  return kryteria.flatMap((k) => {
    const r = wgId.get(k);
    return r ? [r] : [];
  });
}
