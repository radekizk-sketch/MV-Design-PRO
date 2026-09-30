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

/** Szyny główne stacji (`bus_refs`, niepuste napisy) — jak `glowne` w backendzie. */
function szynyGlowne(stacja: StacjaDlaSzyn): readonly string[] {
  return lista(stacja.bus_refs).filter((szyna): szyna is string => napis(szyna) !== null);
}

/** Pola z WŁASNYM zaciskiem pogrupowane po szynie pola, w kolejności pierwszego wystąpienia
 *  szyny — lustro `enm.tor_pola._pola_z_zaciskiem_wg_szyny` (szyna pola → zaciski pól). */
function zaciskiWgSzynyPola(stacja: StacjaDlaSzyn): ReadonlyMap<string, readonly string[]> {
  const wynik = new Map<string, string[]>();
  for (const raw of lista(rekord(stacja.meta)?.field_specs)) {
    const spec = rekord(raw);
    if (!spec) continue;
    const szynaPola = napis(spec.bus_ref);
    const zacisk = zaciskPola(spec);
    if (szynaPola && zacisk && zacisk !== szynaPola && napis(spec.field_ref)) {
      wynik.set(szynaPola, [...(wynik.get(szynaPola) ?? []), zacisk]);
    }
  }
  return wynik;
}

/** Aparaty pól nN stacji — lustro `enm.tor_pola._aparaty_pol_nn_stacji` (znacznik gałęzi
 *  `meta.nn_field_migrowany_z` wskazuje `field_ref` z `nn_field_specs` TEJ stacji). */
function aparatyPolNn(stacja: StacjaDlaSzyn, galezie: readonly GalazDlaSzyn[]): readonly GalazDlaSzyn[] {
  const polaNn = new Set<string>();
  for (const raw of lista(rekord(stacja.meta)?.nn_field_specs)) {
    const spec = rekord(raw);
    if (spec && napis(spec.field_ref)) polaNn.add(String(spec.field_ref));
  }
  if (polaNn.size === 0) return [];
  return galezie.filter((galaz) => {
    const pole = rekord(galaz.meta)?.[META_POLE_NN_ZRODLOWE];
    return typeof pole === 'string' && polaNn.has(pole);
  });
}

/** Szyny NALEŻĄCE do stacji — lustro `enm.tor_pola.szyny_stacji` (opis reguły: nagłówek). */
export function szynyStacji(
  stacja: StacjaDlaSzyn,
  galezie: readonly GalazDlaSzyn[],
): ReadonlySet<string> {
  const wynik = new Set<string>(szynyGlowne(stacja));
  for (const zaciski of zaciskiWgSzynyPola(stacja).values()) {
    for (const zacisk of zaciski) wynik.add(zacisk);
  }
  for (const galaz of aparatyPolNn(stacja, galezie)) {
    for (const koniec of [galaz.from_bus_ref, galaz.to_bus_ref]) {
      const szyna = napis(koniec);
      if (szyna) wynik.add(szyna);
    }
  }
  return wynik;
}

/**
 * Szyna GŁÓWNA stacji, na której stoi pole prowadzące do `szynaRef` — lustro
 * `enm.tor_pola.szyna_glowna_stacji`: sama `szynaRef`, gdy jest szyną główną; szyna pola,
 * gdy `szynaRef` jest własnym zaciskiem pola SN; szyna główna na początku aparatu pola nN,
 * gdy `szynaRef` leży na jego KOŃCU (`to_bus_ref`). `null` — szyna nie należy do stacji
 * albo leży za łańcuchem aparatów (początek aparatu nie jest szyną główną) — tak samo jak
 * w backendzie; parytet przypina `szynyStacji.parytet.test.ts`.
 */
export function szynaGlownaStacji(
  stacja: StacjaDlaSzyn,
  galezie: readonly GalazDlaSzyn[],
  szynaRef: string,
): string | null {
  const glowne = szynyGlowne(stacja);
  if (glowne.includes(szynaRef)) return szynaRef;
  for (const [szynaPola, zaciski] of zaciskiWgSzynyPola(stacja)) {
    if (zaciski.includes(szynaRef)) return szynaPola;
  }
  for (const aparat of aparatyPolNn(stacja, galezie)) {
    const poczatek = aparat.from_bus_ref;
    if (aparat.to_bus_ref === szynaRef && typeof poczatek === 'string' && glowne.includes(poczatek)) {
      return poczatek;
    }
  }
  return null;
}

/**
 * Stacja pola (SZYNY-STACJI-LUSTRO, ta sama klasa co przynależność szyny) — z DANYCH, nigdy
 * z wzorca nazwy refu. Kanały w kolejności backendu `enm.domain_operations_v2._field_record`:
 * rekord `bays` o tym `ref_id` (jego `substation_ref`), potem PIERWSZA stacja modelu, której
 * `meta.field_specs` albo `meta.nn_field_specs` deklaruje `field_ref`. `null` — pola nie
 * deklaruje nikt.
 */
export function stacjaPola(
  model: {
    readonly substations?: readonly StacjaDlaSzyn[] | null;
    readonly bays?: readonly { readonly ref_id?: unknown; readonly substation_ref?: unknown }[] | null;
  },
  fieldRef: string | null | undefined,
): string | null {
  const szukany = napis(fieldRef);
  if (!szukany) return null;
  for (const bay of model.bays ?? []) {
    if (napis(bay.ref_id) === szukany) return napis(bay.substation_ref);
  }
  for (const stacja of model.substations ?? []) {
    if (!napis(stacja.ref_id)) continue;
    const meta = rekord(stacja.meta);
    for (const klucz of ['field_specs', 'nn_field_specs'] as const) {
      for (const raw of lista(meta?.[klucz])) {
        if (napis(rekord(raw)?.field_ref) === szukany) return stacja.ref_id as string;
      }
    }
  }
  return null;
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
  for (const stacja of stacje) {
    const ref = napis(stacja.ref_id);
    if (!ref) continue;
    for (const szyna of szynyStacji(stacja, galezie)) {
      if (!wynik.has(szyna)) wynik.set(szyna, stacja.ref_id as string);
    }
  }
  return wynik;
}
