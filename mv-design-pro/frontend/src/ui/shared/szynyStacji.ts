/**
 * KARTA SZYNY-STACJI-LUSTRO — JEDNA reguła przynależności szyny do stacji we froncie.
 *
 * Lustro backendu `enm/tor_pola.py::szyny_stacji` (karta POLA-W-TORZE), które odpowiada na
 * pytanie „do której stacji należy ta szyna" dla rozpływu, generatorów, compliance, topologii,
 * pakietu dowodów i widoku nN. Front pyta o to samo na migawce ENM (adapter SLD, kreatory,
 * inspektory), więc potrzebuje tego samego zbioru — nie połówki. Do tej karty istniały tu
 * DWIE połówki: `szynaNalezyDoStacji` (szyny główne + zaciski pól SN, bez szyn za aparatami
 * pól nN) i `stationLoadBusRefs` (szyny główne + `to_bus_ref` aparatów pól nN wychodzących
 * z szyny już zaliczonej, zależne od kolejności gałęzi, bez zacisków pól SN). Rozjechałyby
 * się na pierwszej stacji z zaciskiem pola SN i odbiorem nN jednocześnie.
 *
 * Zbiór szyn stacji (identyczny z backendem, niezależny od kolejności gałęzi):
 *  1. szyny główne `Substation.bus_refs` (niepuste napisy, wartość bez przycinania — jak
 *     `_napis(s)` jako filtr w backendzie);
 *  2. WŁASNE zaciski pól SN — `meta.field_specs[i]` z niepustym `field_ref` i `bus_ref`,
 *     którego zacisk (kolejność kluczy `zaciskPola`, lustro `enm.zajetosc_pol.zacisk_pola`)
 *     jest różny od szyny pola;
 *  3. OBA końce aparatów pól nN — gałąź, której `meta.nn_field_migrowany_z` wskazuje
 *     `field_ref` z `meta.nn_field_specs` TEJ stacji (deklaracja modelu z automigracji
 *     `enm/migrations/nn_field_specs_promocja.py`, nie wędrówka po grafie).
 *
 * Parytet z backendem jest przypięty testem `__tests__/szynyStacji.parytet.test.ts` na każdej
 * stacji każdego modelu ENM z fikstur generowanych (plik oczekiwań wytwarza backend,
 * `tests/reference_networks/szyny_stacji_parytet.py`).
 */
import { zaciskPola } from './zaciskPola';

/** Klucz meta gałęzi aparatu pola nN (backend `META_KLUCZ_GALAZ_ZRODLO_FIELD_REF`). */
const META_POLE_NN_ZRODLOWE = 'nn_field_migrowany_z';

export interface StacjaDlaSzyn {
  readonly ref_id?: unknown;
  readonly bus_refs?: readonly unknown[] | null;
  readonly meta?: unknown;
}

export interface GalazDlaSzyn {
  readonly from_bus_ref?: unknown;
  readonly to_bus_ref?: unknown;
  readonly meta?: unknown;
}

function napis(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function rekord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function lista(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Indeks gałęzi aparatów pól nN: `field_ref` pola nN (wartość `meta.nn_field_migrowany_z`)
 * → indeksy gałęzi w kolejności tablicy `galezie`. Budowany RAZ na tablicę gałęzi, żeby
 * pytanie o szyny wielu stacji nie przeglądało wszystkich gałęzi dla każdej stacji (koszt
 * O(stacje × gałęzie) → O(stacje × pola + gałęzie)). Wołający, który pyta o wiele stacji
 * tej samej migawki, buduje indeks raz i podaje go do `szynyStacji`.
 */
export interface IndeksGaleziPolNn {
  readonly galezie: readonly GalazDlaSzyn[];
  readonly wgPola: ReadonlyMap<string, readonly number[]>;
}

export function indeksGaleziPolNn(galezie: readonly GalazDlaSzyn[]): IndeksGaleziPolNn {
  const wgPola = new Map<string, number[]>();
  galezie.forEach((galaz, indeks) => {
    const pole = rekord(galaz.meta)?.[META_POLE_NN_ZRODLOWE];
    if (typeof pole !== 'string') return;
    const lista = wgPola.get(pole);
    if (lista) lista.push(indeks);
    else wgPola.set(pole, [indeks]);
  });
  return { galezie, wgPola };
}

/** Szyny NALEŻĄCE do stacji — lustro `enm.tor_pola.szyny_stacji` (opis reguły: nagłówek).
 *  `indeks` — indeks gałęzi pól nN TEJ SAMEJ tablicy `galezie` (wołający pytający o wiele
 *  stacji buduje go raz); bez niego budowany tutaj. Wynik (także kolejność) identyczny. */
export function szynyStacji(
  stacja: StacjaDlaSzyn,
  galezie: readonly GalazDlaSzyn[],
  indeks?: IndeksGaleziPolNn,
): ReadonlySet<string> {
  const wynik = new Set<string>();
  for (const szyna of lista(stacja.bus_refs)) {
    if (napis(szyna) !== null) wynik.add(szyna as string);
  }
  const meta = rekord(stacja.meta);
  for (const raw of lista(meta?.field_specs)) {
    const spec = rekord(raw);
    if (!spec) continue;
    const szynaPola = napis(spec.bus_ref);
    const zacisk = zaciskPola(spec);
    if (szynaPola && zacisk && zacisk !== szynaPola && napis(spec.field_ref)) wynik.add(zacisk);
  }
  const polaNn = new Set<string>();
  for (const raw of lista(meta?.nn_field_specs)) {
    const spec = rekord(raw);
    if (spec && napis(spec.field_ref)) polaNn.add(String(spec.field_ref));
  }
  if (polaNn.size === 0) return wynik;
  if (indeks && indeks.galezie !== galezie) {
    throw new Error('szynyStacji: indeks gałęzi pól nN zbudowany dla innej tablicy gałęzi');
  }
  const { wgPola } = indeks ?? indeksGaleziPolNn(galezie);
  // Gałęzie pól tej stacji w KOLEJNOŚCI TABLICY (jak pełny przegląd) — kolejność szyn
  // w zbiorze wyniku nie zależy od tego, czy indeks był podany.
  const indeksy = [...new Set([...polaNn].flatMap((pole) => wgPola.get(pole) ?? []))].sort((a, b) => a - b);
  for (const i of indeksy) {
    const galaz = galezie[i];
    for (const koniec of [galaz.from_bus_ref, galaz.to_bus_ref]) {
      const szyna = napis(koniec);
      if (szyna) wynik.add(szyna);
    }
  }
  return wynik;
}

/**
 * Szyna → stacja dla wszystkich stacji modelu. Szyna deklarowana przez więcej niż jedną
 * stację należy do PIERWSZEJ w kolejności `substations` — ta sama reguła co mapa szyn stacji
 * topologii backendu (`enm.topology.build_topology_graph`: `bus_to_sub.setdefault`).
 */
export function stacjaSzyn(
  stacje: readonly StacjaDlaSzyn[],
  galezie: readonly GalazDlaSzyn[],
): ReadonlyMap<string, string> {
  const wynik = new Map<string, string>();
  const indeks = indeksGaleziPolNn(galezie);
  for (const stacja of stacje) {
    const ref = napis(stacja.ref_id);
    if (!ref) continue;
    for (const szyna of szynyStacji(stacja, galezie, indeks)) {
      if (!wynik.has(szyna)) wynik.set(szyna, stacja.ref_id as string);
    }
  }
  return wynik;
}
