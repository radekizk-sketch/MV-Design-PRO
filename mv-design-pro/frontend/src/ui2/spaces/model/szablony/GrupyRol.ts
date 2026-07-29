/*
 * Mapowanie 10 kategorii backendu → 5 ról sieciowych A–E (taksonomia
 * `SZABLONY_STACJI_2026-07.md` §1, poziom 1 „rola w sieci"). Funkcje czyste,
 * bez React — budują drzewko przeglądarki (poziom 1 rola → poziom 2 kategoria)
 * z REALNYCH danych `/api/station-templates/categories` (etykiety `label_pl`
 * i liczniki `template_count` z backendu — `backend/src/api/station_templates.py:210-226`,
 * `_CATEGORY_LABELS`/`_CATEGORY_DESCRIPTIONS` tamże), zero zgadywania etykiet.
 *
 * Rozstrzygnięcie mapowania (SZABLONY_STACJI §1, tabela ról):
 *   B — typowa_sn_nn, slupowa, zksn_wnetrzowa (istnieją, „Dystrybucja SN/nn")
 *   C — przemyslowa (istnieje częściowo — „Odbiorcze")
 *   D — prosument_pv, farma_pv, bess, hybrydowa, wiatrowa (istnieją — „Źródła i magazyny")
 *   E — sekcyjna (istnieje częściowo — „Specjalne")
 * Role A („Zasilanie sieci") i pozostała część C/E są wg dokumentu „DO DODANIA"
 * (delta backendowa, poza zakresem tej karty — §4 dokumentu) — obecnie żadna z
 * 10 kategorii nie ląduje w roli A. `rolaDlaKategorii` ma jawny fallback do B
 * dla kategorii spoza mapy (nowe kategorie dodane w backendzie zanim ta mapa
 * zostanie zaktualizowana) — TODO-KARTA: przy dodaniu kategorii ról A/C/E
 * (dokument §4) rozszerzyć `KATEGORIA_ROLA` o nowe wpisy zamiast polegać na
 * fallbacku.
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
  typowa_sn_nn: 'B',
  slupowa: 'B',
  zksn_wnetrzowa: 'B',
  przemyslowa: 'C',
  prosument_pv: 'D',
  farma_pv: 'D',
  bess: 'D',
  hybrydowa: 'D',
  wiatrowa: 'D',
  sekcyjna: 'E',
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
