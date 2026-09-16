/*
 * Filtry przeglądarki szablonów (karta §3: „moc, napięcie, liczba pól SN").
 * Funkcje czyste (`pasujeFraza`, `pasujeLiczbaPol`, `pasujeMoc`,
 * `pasujeZastosowanie`, `filtrujSzablony`) + mały komponent kontrolowany
 * propsami (bez stanu wewnętrznego poza tym, co dostał).
 *
 * Moc, napięcie i zastosowanie mają pola STRUKTURALNE (`rated_power_kva`,
 * `voltage_hv_kv`, `category`/`category_label_pl` —
 * `backend/src/application/station_templates/schema.py::structural_fields`,
 * `StationTemplateSummary.rated_power_kva`/`voltage_hv_kv`/`category_label_pl`),
 * z KATALOGU (token `catalog_ref` domyślnej opcji transformatora), NIE z
 * parsowania `name_pl`/`label_pl`. Filtr mocy jest zakresem liczbowym (jak
 * „liczba pól SN" — moc jest wielkością ciągłą); filtr napięcia i zastosowania
 * są listami wyboru zbudowanymi z wartości FAKTYCZNIE obecnych w bieżącej
 * liście szablonów (napięcie SN jest wielkością dyskretną/znormalizowaną —
 * lista wyboru, nie zakres; zero fabrykowania wartości, których przeglądarka
 * nie widzi). `rated_power_kva`/`voltage_hv_kv === null` (katalog niedostępny
 * dla domyślnej opcji transformatora szablonu) NIE pasuje do żadnego
 * ustawionego filtra — uczciwe wykluczenie, nie zgadywanie.
 *
 * Pole wyszukiwania tekstowego POZOSTAJE (słowa kluczowe, `tags`,
 * `description_pl`, `use_case_pl`) — to inny wymiar niż moc/zastosowanie,
 * ustrukturyzowanie go nie było przedmiotem tej karty.
 *
 * „Liczba pól SN" pozostaje w pełni ustrukturyzowana (`schema.sn_bays_count.default`,
 * liczba całkowita) — filtrowana zakresem min/max bez żadnego parsowania tekstu.
 */

import { useMemo } from 'react';
import type { StationTemplateFull } from './szablonyClient';
import { SZABLONY_STRINGS } from './strings';

/** Stan filtrów przeglądarki (kontrolowany przez rodzica). */
export interface FiltrySzablonowStan {
  fraza: string;
  liczbaPolMin: number | null;
  liczbaPolMax: number | null;
  mocMinKva: number | null;
  mocMaxKva: number | null;
  /** `null` = wszystkie napięcia SN (górne napięcie transformatora, `voltage_hv_kv`). */
  napiecieHvKv: number | null;
  /** `null` = wszystkie zastosowania (kategorie). */
  kategoria: string | null;
}

export const FILTRY_PUSTE: FiltrySzablonowStan = {
  fraza: '',
  liczbaPolMin: null,
  liczbaPolMax: null,
  mocMinKva: null,
  mocMaxKva: null,
  napiecieHvKv: null,
  kategoria: null,
};

/** Czy dowolny filtr różni się od stanu pustego. */
export function filtryAktywne(filtry: FiltrySzablonowStan): boolean {
  return (
    filtry.fraza.trim() !== '' ||
    filtry.liczbaPolMin != null ||
    filtry.liczbaPolMax != null ||
    filtry.mocMinKva != null ||
    filtry.mocMaxKva != null ||
    filtry.napiecieHvKv != null ||
    filtry.kategoria != null
  );
}

/** Liczba pól SN (wartość domyślna edytowalnego parametru) — pole ustrukturyzowane. */
export function liczbaPolSN(szablon: StationTemplateFull): number {
  return szablon.schema.sn_bays_count.default;
}

/**
 * Dopasowanie frazy wyszukiwania (case-insensitive) po polach TEKSTOWYCH —
 * moc i zastosowanie mają własne filtry ustrukturyzowane niżej. Pusta fraza
 * dopasowuje wszystko.
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

/**
 * Dopasowanie zakresu mocy [kVA] (pole strukturalne `rated_power_kva`).
 * `moc === null` (katalog niedostępny) NIE pasuje do żadnego ustawionego
 * zakresu — uczciwe wykluczenie zamiast fabrykowania dopasowania.
 */
export function pasujeMoc(moc: number | null, min: number | null, max: number | null): boolean {
  if (min == null && max == null) return true;
  if (moc == null) return false;
  if (min != null && moc < min) return false;
  if (max != null && moc > max) return false;
  return true;
}

/** Dopasowanie zastosowania (kategorii) — `null` = wszystkie. */
export function pasujeZastosowanie(kategoriaSzablonu: string, kategoriaFiltru: string | null): boolean {
  return kategoriaFiltru == null || kategoriaSzablonu === kategoriaFiltru;
}

/**
 * Dopasowanie napięcia górnego (SN) transformatora — pole strukturalne
 * `voltage_hv_kv`. Wielkość DYSKRETNA (poziomy znormalizowane, nie zakres
 * ciągły jak moc) — dopasowanie równościowe, `null` filtru = wszystkie.
 * `napiecie === null` (katalog niedostępny) nie pasuje do ustawionego filtra.
 */
export function pasujeNapiecie(napiecie: number | null, napiecieFiltru: number | null): boolean {
  if (napiecieFiltru == null) return true;
  return napiecie === napiecieFiltru;
}

/** Filtrowanie listy pełnych szablonów wg stanu filtrów — funkcja czysta. */
export function filtrujSzablony(
  szablony: readonly StationTemplateFull[],
  filtry: FiltrySzablonowStan,
): StationTemplateFull[] {
  return szablony.filter(
    (s) =>
      pasujeFraza(s, filtry.fraza) &&
      pasujeLiczbaPol(liczbaPolSN(s), filtry.liczbaPolMin, filtry.liczbaPolMax) &&
      pasujeMoc(s.rated_power_kva, filtry.mocMinKva, filtry.mocMaxKva) &&
      pasujeNapiecie(s.voltage_hv_kv, filtry.napiecieHvKv) &&
      pasujeZastosowanie(s.category, filtry.kategoria),
  );
}

/** Kategorie (zastosowania) FAKTYCZNIE obecne w liście, posortowane wg etykiety PL. */
function kategorieObecne(
  szablony: readonly StationTemplateFull[],
): ReadonlyArray<{ id: string; label_pl: string }> {
  const mapa = new Map<string, string>();
  for (const s of szablony) mapa.set(s.category, s.category_label_pl);
  return [...mapa.entries()]
    .map(([id, label_pl]) => ({ id, label_pl }))
    .sort((a, b) => a.label_pl.localeCompare(b.label_pl, 'pl'));
}

/** Napięcia górne (SN) FAKTYCZNIE obecne w liście (bez `null`), rosnąco. */
function napieciaObecne(szablony: readonly StationTemplateFull[]): readonly number[] {
  const zbior = new Set<number>();
  for (const s of szablony) if (s.voltage_hv_kv != null) zbior.add(s.voltage_hv_kv);
  return [...zbior].sort((a, b) => a - b);
}

function liczbaZWejscia(wartosc: string): number | null {
  if (wartosc.trim() === '') return null;
  const n = Number(wartosc);
  return Number.isFinite(n) ? n : null;
}

export interface FiltrySzablonowProps {
  /** Pełna (nieprzefiltrowana) lista szablonów — źródło opcji kategorii. */
  szablony: readonly StationTemplateFull[];
  filtry: FiltrySzablonowStan;
  onZmiana: (filtry: FiltrySzablonowStan) => void;
}

/** Panel kontrolek filtrów — w pełni sterowany propsami (bez stanu wewnętrznego). */
export function FiltrySzablonow({ szablony, filtry, onZmiana }: FiltrySzablonowProps) {
  const kategorie = useMemo(() => kategorieObecne(szablony), [szablony]);
  const napiecia = useMemo(() => napieciaObecne(szablony), [szablony]);

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

      <label className="mvd-szablony-filtr-pole">
        <span>{SZABLONY_STRINGS.filtrZastosowanie}</span>
        <select
          className="mvd-input"
          value={filtry.kategoria ?? ''}
          onChange={(event) => onZmiana({ ...filtry, kategoria: event.target.value || null })}
          data-testid="mvd-szablony-filtr-zastosowanie"
        >
          <option value="">{SZABLONY_STRINGS.filtrZastosowanieWszystkie}</option>
          {kategorie.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label_pl}
            </option>
          ))}
        </select>
      </label>

      {napiecia.length > 0 && (
        <label className="mvd-szablony-filtr-pole">
          <span>{SZABLONY_STRINGS.filtrNapiecie}</span>
          <select
            className="mvd-input"
            value={filtry.napiecieHvKv ?? ''}
            onChange={(event) =>
              onZmiana({
                ...filtry,
                napiecieHvKv: event.target.value === '' ? null : Number(event.target.value),
              })
            }
            data-testid="mvd-szablony-filtr-napiecie"
          >
            <option value="">{SZABLONY_STRINGS.filtrZastosowanieWszystkie}</option>
            {napiecia.map((n) => (
              <option key={n} value={n}>
                {n} kV
              </option>
            ))}
          </select>
        </label>
      )}

      <span className="mvd-szablony-filtr-grupa-etykieta">{SZABLONY_STRINGS.filtrMoc}</span>
      <label className="mvd-szablony-filtr-pole mvd-szablony-filtr-pole-krotkie">
        <span>{SZABLONY_STRINGS.filtrMocOd}</span>
        <input
          type="number"
          min={0}
          className="mvd-input mvd-num"
          value={filtry.mocMinKva ?? ''}
          onChange={(event) => onZmiana({ ...filtry, mocMinKva: liczbaZWejscia(event.target.value) })}
          data-testid="mvd-szablony-filtr-moc-od"
        />
      </label>
      <label className="mvd-szablony-filtr-pole mvd-szablony-filtr-pole-krotkie">
        <span>{SZABLONY_STRINGS.filtrMocDo}</span>
        <input
          type="number"
          min={0}
          className="mvd-input mvd-num"
          value={filtry.mocMaxKva ?? ''}
          onChange={(event) => onZmiana({ ...filtry, mocMaxKva: liczbaZWejscia(event.target.value) })}
          data-testid="mvd-szablony-filtr-moc-do"
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
