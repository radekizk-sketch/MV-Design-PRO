/**
 * KARTA SZYNY-STACJI-LUSTRO — JEDNA reguła przynależności szyny do stacji we froncie.
 *
 * Lustro backendu `enm/tor_pola.py::szyny_stacji` (karta POLA-W-TORZE), które odpowiada na
 * pytanie „do której stacji należy ta szyna" dla rozpływu, generatorów, compliance, topologii,
 * pakietu dowodów i widoku nN. Front pyta o to samo na migawce ENM (adapter SLD, kreatory,
 * inspektory), więc potrzebuje tego samego zbioru — nie połówki.
 *
 * Zbiór szyn stacji (identyczny z backendem, niezależny od kolejności gałęzi):
 *  1. szyny główne `Substation.bus_refs` (niepuste napisy, wartość bez przycinania — jak
 *     `_napis(s)` jako filtr w backendzie);
 *  2. WŁASNE zaciski pól SN — rekordy `bays` stacji z niepustym `ref_id` na szynie poza pasmem
 *     nN (`polaStacji.ts`), których `terminal_bus_ref` jest różny od szyny pola;
 *  3. OBA końce aparatów pól nN — gałęzie wskazane przez `equipment_refs` rekordów pól nN
 *     TEJ stacji (karta W5-B: rekord pola jest jedynym źródłem przynależności aparatu).
 *
 * Parytet z backendem jest przypięty testem `__tests__/szynyStacji.parytet.test.ts` na każdej
 * stacji każdego modelu ENM z fikstur generowanych (plik oczekiwań wytwarza backend,
 * `tests/reference_networks/szyny_stacji_parytet.py`).
 */
import { czyPoleNn, napieciaSzyn, polaStacji, wlasnyZaciskPola, type ModelPol, type RekordPola } from './polaStacji';

export interface StacjaDlaSzyn {
  readonly ref_id?: unknown;
  readonly bus_refs?: readonly unknown[] | null;
}

export interface GalazDlaSzyn {
  readonly ref_id?: unknown;
  readonly from_bus_ref?: unknown;
  readonly to_bus_ref?: unknown;
  readonly meta?: unknown;
}

/** Wycinek migawki czytany przez regułę szyn stacji: pola (rekordy `bays` i napięcia szyn)
 *  oraz gałęzie (aparaty pól nN). */
export interface ModelSzyn extends ModelPol<RekordPola> {
  readonly branches?: readonly GalazDlaSzyn[] | null;
}

function napis(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function lista(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Szyny główne stacji (`bus_refs`, niepuste napisy) — jak `glowne` w backendzie. */
function szynyGlowne(stacja: StacjaDlaSzyn): readonly string[] {
  return lista(stacja.bus_refs).filter((szyna): szyna is string => napis(szyna) !== null);
}

/** Pola SN stacji z WŁASNYM zaciskiem pogrupowane po szynie pola, w kolejności zapisu
 *  rekordów — lustro `enm.tor_pola._pola_z_zaciskiem_wg_szyny` (szyna pola → zaciski pól).
 *  Pola nN nie wchodzą: szyny za aparatami pól nN daje `aparatyPolNn`. */
function zaciskiWgSzynyPola(model: ModelSzyn, stacja: StacjaDlaSzyn): ReadonlyMap<string, readonly string[]> {
  const wynik = new Map<string, string[]>();
  const napiecia = napieciaSzyn(model);
  for (const rekord of polaStacji(model, stacja.ref_id)) {
    // Rekord bez identyfikatora nie jest polem (jak backend: `_napis(ref_id)`).
    if (!napis(rekord.ref_id) || czyPoleNn(model, rekord, napiecia)) continue;
    const szynaPola = napis(rekord.bus_ref);
    const zacisk = wlasnyZaciskPola(rekord);
    if (szynaPola && zacisk) wynik.set(szynaPola, [...(wynik.get(szynaPola) ?? []), zacisk]);
  }
  return wynik;
}

/**
 * Indeks gałęzi migawki: `ref_id` → pozycje w tablicy `branches` (w kolejności tablicy).
 * Migawka jest niemutowalna, więc indeks żyje tyle, co tablica gałęzi (dopisanie gałęzi do tej
 * samej tablicy w teście unieważnia go po zmianie długości) — jak indeks pól w `polaStacji.ts`.
 * Bez niego pytanie o aparaty pól nN każdej stacji przeglądało wszystkie gałęzie (O(stacje ×
 * gałęzie) w `stacjaSzyn` i w każdej pętli po stacjach; karta PARTIA-6-FRONT — budowa sceny
 * SLD liniowa w liczbie stacji).
 */
const INDEKSY_GALEZI = new WeakMap<readonly unknown[], { readonly dlugosc: number; readonly wgRefu: ReadonlyMap<string, readonly number[]> }>();

function indeksGalezi(galezie: readonly GalazDlaSzyn[]): ReadonlyMap<string, readonly number[]> {
  const zapisany = INDEKSY_GALEZI.get(galezie);
  if (zapisany && zapisany.dlugosc === galezie.length) return zapisany.wgRefu;
  const wgRefu = new Map<string, number[]>();
  galezie.forEach((galaz, pozycja) => {
    const ref = galaz?.ref_id;
    if (typeof ref !== 'string') return;
    const lista = wgRefu.get(ref);
    if (lista) lista.push(pozycja);
    else wgRefu.set(ref, [pozycja]);
  });
  INDEKSY_GALEZI.set(galezie, { dlugosc: galezie.length, wgRefu });
  return wgRefu;
}

/** Aparaty pól nN stacji — lustro `enm.tor_pola._aparaty_pol_nn_stacji`: gałęzie wskazane
 *  przez `equipment_refs` rekordów pól nN TEJ stacji, w KOLEJNOŚCI TABLICY `branches`. */
function aparatyPolNn(model: ModelSzyn, stacja: StacjaDlaSzyn): readonly GalazDlaSzyn[] {
  const napiecia = napieciaSzyn(model);
  const aparaty = new Set<string>();
  for (const rekord of polaStacji(model, stacja.ref_id)) {
    if (!czyPoleNn(model, rekord, napiecia)) continue;
    for (const ref of rekord.equipment_refs ?? []) aparaty.add(String(ref));
  }
  if (aparaty.size === 0) return [];
  const galezie = model.branches ?? [];
  const wgRefu = indeksGalezi(galezie);
  const pozycje = [...new Set([...aparaty].flatMap((ref) => wgRefu.get(ref) ?? []))].sort((a, b) => a - b);
  return pozycje.map((pozycja) => galezie[pozycja]);
}

/** Szyny NALEŻĄCE do stacji — lustro `enm.tor_pola.szyny_stacji(enm, stacja)` (opis reguły:
 *  nagłówek). */
export function szynyStacji(model: ModelSzyn, stacja: StacjaDlaSzyn): ReadonlySet<string> {
  const wynik = new Set<string>(szynyGlowne(stacja));
  for (const zaciski of zaciskiWgSzynyPola(model, stacja).values()) {
    for (const zacisk of zaciski) wynik.add(zacisk);
  }
  for (const galaz of aparatyPolNn(model, stacja)) {
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
export function szynaGlownaStacji(model: ModelSzyn, stacja: StacjaDlaSzyn, szynaRef: string): string | null {
  const glowne = szynyGlowne(stacja);
  if (glowne.includes(szynaRef)) return szynaRef;
  for (const [szynaPola, zaciski] of zaciskiWgSzynyPola(model, stacja)) {
    if (zaciski.includes(szynaRef)) return szynaPola;
  }
  for (const aparat of aparatyPolNn(model, stacja)) {
    const poczatek = aparat.from_bus_ref;
    if (aparat.to_bus_ref === szynaRef && typeof poczatek === 'string' && glowne.includes(poczatek)) {
      return poczatek;
    }
  }
  return null;
}

/**
 * Szyna → stacja dla stacji modelu (domyślnie wszystkich; `stacje` zawęża zbiór pytanych
 * stacji). Szyna deklarowana przez więcej niż jedną stację należy do PIERWSZEJ w kolejności
 * — ta sama reguła co mapa szyn stacji topologii backendu (`enm.topology.build_topology_graph`:
 * `bus_to_sub.setdefault`).
 */
export function stacjaSzyn(
  model: ModelSzyn & { readonly substations?: readonly StacjaDlaSzyn[] | null },
  stacje: readonly StacjaDlaSzyn[] = model.substations ?? [],
): ReadonlyMap<string, string> {
  const wynik = new Map<string, string>();
  for (const stacja of stacje) {
    const ref = napis(stacja.ref_id);
    if (!ref) continue;
    for (const szyna of szynyStacji(model, stacja)) {
      if (!wynik.has(szyna)) wynik.set(szyna, stacja.ref_id as string);
    }
  }
  return wynik;
}
