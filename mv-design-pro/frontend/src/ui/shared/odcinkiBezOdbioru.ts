/**
 * Karta PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA — lustro predykatu „odcinek bez odbioru".
 *
 * Lustro backendu `enm/odcinki_bez_odbioru.py::konce_otwarte` — tego samego predykatu, który
 * zasila gotowość (walidator ENM W065 → `topology.segment_open_end`, w paśmie nN W066 →
 * `topology.lv_segment_open_end`). Schemat SLD pyta o to samo na migawce ENM (słupek końca
 * z podpisem „koniec otwarty · brak stacji odbiorczej"), więc potrzebuje tego samego zbioru:
 * rysunek i panel gotowości mówią o tych samych końcach. Parytet przypięty testem
 * `__tests__/odcinkiBezOdbioru.parytet.test.ts` na każdym modelu ENM z fikstur generowanych
 * (oczekiwania wytwarza backend: `tests/reference_networks/odcinki_bez_odbioru_parytet.py`).
 *
 * Odcinek = gałąź `cable` albo `line_overhead`. Jego szyna końcowa jest PRZYŁĄCZONA, gdy
 * wskazuje ją inny element modelu: inna gałąź (dowolnego rodzaju), transformator (WN, nN),
 * źródło, odbiór, generator, bateria kondensatorów, stacja (`bus_refs`), pole (`bus_ref`,
 * `terminal_bus_ref`), sekcja szyn stacji (GPZ SN, GPZ WN, nN) albo punkt odgałęźny. Pomiar
 * nie przyłącza (przekładnik nie jest odbiorem).
 */

export interface KoniecOtwarty {
  readonly odcinekRef: string;
  readonly szynaRef: string;
}

/** Rodzaje gałęzi, które są ODCINKAMI. */
export const RODZAJE_ODCINKA: ReadonlySet<string> = new Set(['cable', 'line_overhead']);

const PRZYLACZENIA_POJEDYNCZE: readonly (readonly [string, readonly string[]])[] = [
  ['transformers', ['hv_bus_ref', 'lv_bus_ref']],
  ['sources', ['bus_ref']],
  ['loads', ['bus_ref']],
  ['generators', ['bus_ref']],
  ['shunt_capacitors', ['bus_ref']],
  ['bays', ['bus_ref', 'terminal_bus_ref']],
  ['branch_points', ['bus_ref']],
];

const SEKCJE_STACJI: readonly string[] = ['gpz_sections', 'gpz_hv_sections', 'nn_sections'];

function napis(wartosc: unknown): string | null {
  return typeof wartosc === 'string' && wartosc.trim() ? wartosc.trim() : null;
}

function rekordy(model: unknown, klucz: string): readonly Record<string, unknown>[] {
  const wartosc = (model as Record<string, unknown> | null | undefined)?.[klucz];
  return Array.isArray(wartosc)
    ? wartosc.filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object')
    : [];
}

function porownaj(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Końce odcinków bez odbioru, posortowane (odcinek, szyna) — wynik deterministyczny. */
export function konceOtwarte(model: unknown): readonly KoniecOtwarty[] {
  const licznik = new Map<string, number>();
  const dolicz = (ref: unknown): void => {
    const s = napis(ref);
    if (s !== null) licznik.set(s, (licznik.get(s) ?? 0) + 1);
  };
  const galezie = rekordy(model, 'branches');
  for (const g of galezie) {
    dolicz(g.from_bus_ref);
    dolicz(g.to_bus_ref);
  }
  const przylaczone = new Set<string>();
  for (const [kolekcja, pola] of PRZYLACZENIA_POJEDYNCZE) {
    for (const r of rekordy(model, kolekcja)) {
      for (const pole of pola) {
        const s = napis(r[pole]);
        if (s !== null) przylaczone.add(s);
      }
    }
  }
  for (const stacja of rekordy(model, 'substations')) {
    const szyny = stacja.bus_refs;
    for (const szyna of Array.isArray(szyny) ? szyny : []) {
      const s = napis(szyna);
      if (s !== null) przylaczone.add(s);
    }
    for (const klucz of SEKCJE_STACJI) {
      for (const sekcja of rekordy(stacja, klucz)) {
        const s = napis(sekcja.bus_ref);
        if (s !== null) przylaczone.add(s);
      }
    }
  }

  const wynik = new Map<string, KoniecOtwarty>();
  for (const g of galezie) {
    if (typeof g.type !== 'string' || !RODZAJE_ODCINKA.has(g.type)) continue;
    const odcinek = napis(g.ref_id);
    if (odcinek === null) continue;
    const konce = [napis(g.from_bus_ref), napis(g.to_bus_ref)];
    for (const szyna of konce) {
      if (szyna === null || przylaczone.has(szyna)) continue;
      // Sam odcinek wskazuje szynę raz (pętla na jedną szynę — dwa razy); każde wskazanie
      // ponad to pochodzi od innej gałęzi.
      const wlasne = konce.filter((k) => k === szyna).length;
      if ((licznik.get(szyna) ?? 0) <= wlasne) {
        wynik.set(`${odcinek}\u0000${szyna}`, { odcinekRef: odcinek, szynaRef: szyna });
      }
    }
  }
  return [...wynik.values()].sort(
    (a, b) => porownaj(a.odcinekRef, b.odcinekRef) || porownaj(a.szynaRef, b.szynaRef),
  );
}

/** Odcinki, które mają co najmniej jeden koniec bez odbioru — zbiór wyliczany RAZ na model
 *  (scena SLD rysuje słupek z podpisem braku stacji odbiorczej wyłącznie dla tych odcinków). */
export function odcinkiBezOdbioru(model: unknown): ReadonlySet<string> {
  return new Set(konceOtwarte(model).map((k) => k.odcinekRef));
}
