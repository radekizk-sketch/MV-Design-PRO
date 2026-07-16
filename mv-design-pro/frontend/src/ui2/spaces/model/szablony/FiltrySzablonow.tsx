/*
 * Filtry przeglądarki szablonów (karta §3: „moc, napięcie, liczba pól SN").
 * Funkcje czyste (`pasujeFraza`, `pasujeLiczbaPol`, `filtrujSzablony`) + mały
 * komponent kontrolowany propsami (bez stanu wewnętrznego poza tym, co dostał).
 *
 * TODO-KARTA (brak pól strukturalnych w kontrakcie backendu — zbadano
 * `backend/src/application/station_templates/schema.py:37-269`): `CatalogChoice`
 * (transformator) i `DerKindSpec` (DER) NIE wystawiają osobnych pól liczbowych
 * mocy/napięcia — moc i napięcie są wyłącznie częścią tekstu `label_pl`
 * (np. "TR 630 kVA SN/nN 15/0.4 kV Dyn11"), niespójnie sformatowanego między
 * szablonami (część wpisów pomija napięcie). Wartości `default_p_mw_each`
 * w `DerKindSpec` to STAŁE domyślne danego typu DER ze wspólnej biblioteki
 * (`_choices.py`), NIE realna moc nazwanego wariantu (np. warianty prosumenckie
 * 5/10/30/50/100/250 kW dzielą tę samą stałą `DER_PV_NN.default_p_mw_each`
 * mimo różnych nazw) — parsowanie ich jako liczby filtrowalnej wprowadzałoby
 * fałszywe rozróżnienie. Zamiast zgadywać liczbę z niespójnego tekstu, filtr
 * „moc/napięcie" jest świadomie polem wyszukiwania tekstowego po `name_pl` /
 * `description_pl` / `use_case_pl` / `tags` — polach, w których moc i napięcie
 * SĄ opisane przez autora szablonu (np. „630 kVA", „15/0.4 kV", „0.5 MW").
 * Wprowadzenie ustrukturyzowanych pól mocy/napięcia wymaga delty backendowej
 * (rozszerzenie `TemplateSchema`) — poza granicami tej karty (tylko frontend).
 *
 * „Liczba pól SN" jest w pełni ustrukturyzowana (`schema.sn_bays_count.default`,
 * liczba całkowita) — filtrowana zakresem min/max bez żadnego parsowania tekstu.
 */

import type { StationTemplateFull } from './szablonyClient';
import { SZABLONY_STRINGS } from './strings';

/** Stan filtrów przeglądarki (kontrolowany przez rodzica). */
export interface FiltrySzablonowStan {
  fraza: string;
  liczbaPolMin: number | null;
  liczbaPolMax: number | null;
}

export const FILTRY_PUSTE: FiltrySzablonowStan = {
  fraza: '',
  liczbaPolMin: null,
  liczbaPolMax: null,
};

/** Czy dowolny filtr różni się od stanu pustego. */
export function filtryAktywne(filtry: FiltrySzablonowStan): boolean {
  return filtry.fraza.trim() !== '' || filtry.liczbaPolMin != null || filtry.liczbaPolMax != null;
}

/** Liczba pól SN (wartość domyślna edytowalnego parametru) — pole ustrukturyzowane. */
export function liczbaPolSN(szablon: StationTemplateFull): number {
  return szablon.schema.sn_bays_count.default;
}

/**
 * Dopasowanie frazy wyszukiwania (case-insensitive) po polach tekstowych, w
 * których backend opisuje moc/napięcie/zastosowanie (patrz TODO-KARTA powyżej).
 * Pusta fraza dopasowuje wszystko.
 */
export function pasujeFraza(szablon: StationTemplateFull, fraza: string): boolean {
  const f = fraza.trim().toLowerCase();
  if (!f) return true;
  return (
    szablon.name_pl.toLowerCase().includes(f) ||
    szablon.description_pl.toLowerCase().includes(f) ||
    szablon.use_case_pl.toLowerCase().includes(f) ||
    szablon.tags.some((tag) => tag.toLowerCase().includes(f))
  );
}

/** Dopasowanie zakresu liczby pól SN (min/max niezależnie opcjonalne). */
export function pasujeLiczbaPol(liczbaPol: number, min: number | null, max: number | null): boolean {
  if (min != null && liczbaPol < min) return false;
  if (max != null && liczbaPol > max) return false;
  return true;
}

/** Filtrowanie listy pełnych szablonów wg stanu filtrów — funkcja czysta. */
export function filtrujSzablony(
  szablony: readonly StationTemplateFull[],
  filtry: FiltrySzablonowStan,
): StationTemplateFull[] {
  return szablony.filter(
    (s) => pasujeFraza(s, filtry.fraza) && pasujeLiczbaPol(liczbaPolSN(s), filtry.liczbaPolMin, filtry.liczbaPolMax),
  );
}

function liczbaZWejscia(wartosc: string): number | null {
  if (wartosc.trim() === '') return null;
  const n = Number(wartosc);
  return Number.isFinite(n) ? n : null;
}

export interface FiltrySzablonowProps {
  filtry: FiltrySzablonowStan;
  onZmiana: (filtry: FiltrySzablonowStan) => void;
}

/** Panel kontrolek filtrów — w pełni sterowany propsami (bez stanu wewnętrznego). */
export function FiltrySzablonow({ filtry, onZmiana }: FiltrySzablonowProps) {
  return (
    <div className="mvd-szablony-filtry" role="group" aria-label={SZABLONY_STRINGS.filtryTytul}>
      <label className="mvd-szablony-filtr-pole">
        <span>{SZABLONY_STRINGS.filtrSzukaj}</span>
        <input
          type="text"
          className="mvd-input"
          value={filtry.fraza}
          placeholder={SZABLONY_STRINGS.filtrSzukajPlaceholder}
          onChange={(event) => onZmiana({ ...filtry, fraza: event.target.value })}
        />
      </label>

      <span className="mvd-szablony-filtr-grupa-etykieta">{SZABLONY_STRINGS.filtrLiczbaPol}</span>
      <label className="mvd-szablony-filtr-pole mvd-szablony-filtr-pole-krotkie">
        <span>{SZABLONY_STRINGS.filtrLiczbaPolOd}</span>
        <input
          type="number"
          min={0}
          className="mvd-input mvd-num"
          value={filtry.liczbaPolMin ?? ''}
          onChange={(event) => onZmiana({ ...filtry, liczbaPolMin: liczbaZWejscia(event.target.value) })}
        />
      </label>
      <label className="mvd-szablony-filtr-pole mvd-szablony-filtr-pole-krotkie">
        <span>{SZABLONY_STRINGS.filtrLiczbaPolDo}</span>
        <input
          type="number"
          min={0}
          className="mvd-input mvd-num"
          value={filtry.liczbaPolMax ?? ''}
          onChange={(event) => onZmiana({ ...filtry, liczbaPolMax: liczbaZWejscia(event.target.value) })}
        />
      </label>

      {filtryAktywne(filtry) && (
        <button type="button" className="mvd-btn mvd-btn-ghost" onClick={() => onZmiana(FILTRY_PUSTE)}>
          {SZABLONY_STRINGS.filtrWyczysc}
        </button>
      )}
    </div>
  );
}
