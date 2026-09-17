/*
 * Mapowanie 15 kategorii backendu → 5 ról sieciowych A–E (taksonomia
 * `SZABLONY_STACJI_2026-07.md` §1, poziom 1 „rola w sieci"). Funkcje czyste,
 * bez React — budują drzewko przeglądarki (poziom 1 rola → poziom 2 kategoria)
 * z REALNYCH danych `/api/station-templates/categories` (etykiety `label_pl`
 * i liczniki `template_count` z backendu — `backend/src/api/station_templates.py`,
 * `_CATEGORY_ICONS`/`_CATEGORY_DESCRIPTIONS` tamże), zero zgadywania etykiet.
 *
 * Rozstrzygnięcie mapowania (SZABLONY_STACJI §1, tabela ról):
 *   A — gpz_110_sn, rozdzielnia_sieciowa („Zasilanie sieci" — V12T-016, zamknięte)
 *   B — typowa_sn_nn, slupowa, zksn_wnetrzowa („Dystrybucja SN/nn")
 *   C — przemyslowa, stacja_abonencka („Odbiorcze" — stacja_abonencka: V12T-016)
 *   D — prosument_pv, farma_pv, bess, hybrydowa, wiatrowa („Źródła i magazyny")
 *   E — sekcyjna, kompensacja, rezerwa_zasilania („Specjalne" — kompensacja/
 *       rezerwa_zasilania: V12T-016)
 *
 * V12T-016 (rejestr długu `docs/v12xx/REJESTR_DLUGU.md`, ZAMKNIĘTY tą kartą):
 * rola A miała licznik ZERO — zmierzone wprost z enumeracji `TemplateCategory`
 * (`backend/src/application/station_templates/schema.py`): 10 wartości, zero
 * do A. Karta dodała 5 kategorii (GPZ_110_SN/ROZDZIELNIA_SIECIOWA — rola A;
 * STACJA_ABONENCKA — rola C; KOMPENSACJA/REZERWA_ZASILANIA — rola E), 16
 * nowych szablonów (73 łącznie), pełen łańcuch backend → apply → ENM
 * walidujący się bez blokad. `rolaDlaKategorii` zachowuje jawny fallback do B
 * dla kategorii spoza mapy, żeby żaden PRZYSZŁY szablon nie zniknął z
 * przeglądarki, gdy backend doda kategorię przed aktualizacją tej mapy.
 */

import type { CategoryEntry } from './szablonyClient';

/** Identyfikator roli sieciowej (poziom 1 taksonomii). */
export type RolaId = 'A' | 'B' | 'C' | 'D' | 'E';

/** Kolejność wyświetlania ról w drzewku — zawsze A→E, niezależnie od liczności. */
export const KOLEJNOSC_ROL: readonly RolaId[] = ['A', 'B', 'C', 'D', 'E'];

/** Etykiety grup — dokładne brzmienie wg karty §3 (zamrożone, nie generować inaczej). */
export const ROLA_LABEL: Readonly<Record<RolaId, string>> = {
  A: 'A. Zasilanie sieci',
  B: 'B. Dystrybucja SN/nn',
  C: 'C. Odbiorcze',
  D: 'D. Źródła i magazyny',
  E: 'E. Specjalne',
};

/** Mapowanie id kategorii backendu (`TemplateCategory.value`) → rola A–E. */
const KATEGORIA_ROLA: Readonly<Record<string, RolaId>> = {
  gpz_110_sn: 'A',
  rozdzielnia_sieciowa: 'A',
  typowa_sn_nn: 'B',
  slupowa: 'B',
  zksn_wnetrzowa: 'B',
  przemyslowa: 'C',
  stacja_abonencka: 'C',
  prosument_pv: 'D',
  farma_pv: 'D',
  bess: 'D',
  hybrydowa: 'D',
  wiatrowa: 'D',
  sekcyjna: 'E',
  kompensacja: 'E',
  rezerwa_zasilania: 'E',
};

/**
 * Rola A–E dla kategorii backendu. Kategorie spoza `KATEGORIA_ROLA` (nowe,
 * jeszcze niewpisane do mapy) trafiają domyślnie do „B. Dystrybucja SN/nn" —
 * przeglądarka nigdy nie gubi szablonu, nawet gdy backend wyprzedzi tę mapę.
 */
export function rolaDlaKategorii(idKategorii: string): RolaId {
  return KATEGORIA_ROLA[idKategorii] ?? 'B';
}

/** Węzeł kategorii (poziom 2 — „typ konstrukcyjny") w drzewku przeglądarki. */
export interface WezelKategorii {
  id: string;
  etykieta: string;
  liczbaSzablonow: number;
}

/** Węzeł roli (poziom 1) — dzieci = kategorie przypisane do tej roli. */
export interface WezelRoli {
  id: RolaId;
  etykieta: string;
  liczbaSzablonow: number;
  kategorie: WezelKategorii[];
}

/**
 * Buduje drzewko ról A–E z realnej listy kategorii backendu (endpoint
 * `/api/station-templates/categories`). Zawiera WSZYSTKIE role z tabeli §3
 * (nawet z zerem szablonów — np. rola A dopóki „DO DODANIA" nie zostanie
 * zrealizowane), w stałej kolejności `KOLEJNOSC_ROL`; kategorie w obrębie roli
 * zachowują kolejność z odpowiedzi backendu.
 */
export function zbudujDrzewkoRol(kategorie: readonly CategoryEntry[]): WezelRoli[] {
  const kategorieWgRoli = new Map<RolaId, WezelKategorii[]>();
  for (const rola of KOLEJNOSC_ROL) kategorieWgRoli.set(rola, []);

  for (const kategoria of kategorie) {
    const rola = rolaDlaKategorii(kategoria.id);
    kategorieWgRoli.get(rola)!.push({
      id: kategoria.id,
      etykieta: kategoria.label_pl,
      liczbaSzablonow: kategoria.template_count,
    });
  }

  return KOLEJNOSC_ROL.map((rola) => {
    const dzieciKategorii = kategorieWgRoli.get(rola) ?? [];
    return {
      id: rola,
      etykieta: ROLA_LABEL[rola],
      liczbaSzablonow: dzieciKategorii.reduce((suma, k) => suma + k.liczbaSzablonow, 0),
      kategorie: dzieciKategorii,
    };
  });
}

/** Zwraca id wszystkich kategorii przypisanych do danej roli (do zapytań listy). */
export function kategorieRoli(drzewko: readonly WezelRoli[], rolaId: RolaId): string[] {
  const wezel = drzewko.find((w) => w.id === rolaId);
  return wezel ? wezel.kategorie.map((k) => k.id) : [];
}
