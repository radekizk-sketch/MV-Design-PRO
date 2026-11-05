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
import type { OcenaKryterium, StatusWerdyktu } from '../wzorzec/werdykt';

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

/** Pole `ziemnozwarciowe` wyniku (rekordy; ślad obliczenia i wyniki uziemień — dane White Box). */
export interface WynikOcenyZiemnozwarciowej {
  oceny: RekordOcenyZiemnozwarciowej[];
  uziemienia: RekordOcenyZiemnozwarciowej[];
  odmowy: RekordOcenyZiemnozwarciowej[];
  doziemienie: Record<string, unknown>;
  wyniki_uziemien: Record<string, unknown>[];
  funkcje: Record<string, unknown>[];
}

/** Rekordy w kolejności czytania (ta sama co raport PDF/DOCX): oceny funkcji, uziemienia
 *  stacji, odmowy. `urzadzenieRef` zawęża do jednego sterownika (karta nastaw E-27). */
export function rekordyZiemnozwarciowe(
  wynik: WynikOcenyZiemnozwarciowej | null | undefined,
  urzadzenieRef?: string,
): RekordOcenyZiemnozwarciowej[] {
  if (!wynik) return [];
  const wszystkie = [...wynik.oceny, ...wynik.uziemienia, ...wynik.odmowy];
  return urzadzenieRef === undefined
    ? wszystkie
    : wszystkie.filter((r) => r.urzadzenie_ref === urzadzenieRef);
}

/** Wielkość rekordu werdyktu z jednostką (liczba z backendu, format pl-PL) albo kreska. */
export function zapisWielkosci(wielkosc: { wartosc: number; jednostka: string } | null | undefined): string {
  if (!wielkosc) return '—';
  const liczba = wielkosc.wartosc.toLocaleString('pl-PL', { maximumSignificantDigits: 4 });
  return wielkosc.jednostka ? `${liczba} ${wielkosc.jednostka}` : liczba;
}

/** Zdanie braków odmowy albo kryterium bez danych (komunikat + akcja naprawcza). */
export function zdanieBrakow(rekord: RekordOcenyZiemnozwarciowej): string | null {
  const braki = (rekord.braki ?? []).map((b) => `${b.komunikat_pl} ${b.akcja_naprawcza_pl}`);
  if (rekord.czego_brakuje_pl) braki.push(rekord.czego_brakuje_pl);
  return braki.length > 0 ? braki.join(' ') : null;
}
