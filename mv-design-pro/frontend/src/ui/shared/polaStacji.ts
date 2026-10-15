/**
 * KARTA W5-B — JEDNO lustro reguł pól rozdzielnicy we froncie (SN, nN, ZKSN).
 *
 * Lustro backendu `enm/pola.py`. Do karty W5-B pole żyło w trzech nietypowanych słownikach
 * migawki (lista pól stacji SN w `meta` stacji, lista pól nN w `meta` stacji, lista pól ZKSN
 * w parametrach punktu rozgałęzienia) i w kolekcji `bays` naraz; siedemnastu czytelników
 * frontu składało je po swojemu, z różnym pierwszeństwem kanałów i własnymi kluczami. Od
 * karty W5-B pole ma JEDEN nośnik — rekord `EnergyNetworkModel.bays` (`types/enm.ts::Bay`),
 * a ten moduł jest jedynym miejscem frontu, które zna jego reguły:
 *  - właściciel pola: `substation_ref` (pole stacji SN/nN) ALBO `branch_point_ref` (pole ZKSN);
 *  - poziom pola (SN/nN) z napięcia szyny `bus_ref` (`czyPoleNn`, pasmo z
 *    `ui2/model/pasmaNapieciowe.ts` — ta sama granica co backend, nie nowa liczba);
 *  - zacisk pola: WYŁĄCZNIE `terminal_bus_ref` (`zaciskPola`); punkt przyłączenia: zacisk,
 *    a bez zacisku szyna pola (`punktPrzylaczeniaPola`);
 *  - pola wg szyny w kolejności wyboru pola startu ciągu: OUT < FEEDER < IN < pozostałe, w
 *    obrębie roli po `ref_id` (`polaWgSzyny`).
 *
 * Brak rekordu = brak pola (żadnej syntezy z innych danych). Parytet z backendem przypina
 * `__tests__/polaStacji.parytet.test.ts` na każdym modelu ENM z fikstur generowanych (plik
 * oczekiwań wytwarza backend, `tests/reference_networks/szyny_stacji_parytet.py`, sekcja
 * `pola`).
 */
import type { Bay, BayCanonicalRole } from '../../types/enm';
import { wPasmieNn } from '../../ui2/model/pasmaNapieciowe';
import { canonicalFieldRole } from '../sld/v2/station-rozdzielnia/contract';

/** Minimalny kształt rekordu pola czytany przez reguły (pełny rekord to `Bay`; wyrocznie
 *  i drzewa hierarchii niosą zwężone projekcje tego samego rekordu). */
export interface RekordPola {
  readonly ref_id: string;
  readonly bus_ref: string;
  readonly bay_role: Bay['bay_role'];
  readonly substation_ref?: string | null;
  readonly branch_point_ref?: string | null;
  readonly terminal_bus_ref?: string | null;
  readonly equipment_refs?: readonly string[];
}

/** Wycinek migawki czytany przez reguły pól (wyrocznie i szuflady niosą tylko część pól). */
export interface ModelPol<B extends RekordPola = Bay> {
  readonly bays?: readonly B[] | null;
  readonly buses?: readonly { readonly ref_id: string; readonly voltage_kv?: number | null }[] | null;
  readonly substations?: readonly { readonly ref_id: string }[] | null;
}

/** Kolejność ról przy grupowaniu pól po szynie — lustro `_RANGA_ROLI_NA_SZYNIE` backendu. */
const RANGA_ROLI_NA_SZYNIE: Readonly<Record<string, number>> = { OUT: 0, FEEDER: 1, IN: 2 };

function napis(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Porównanie napisów jak `str` w Pythonie (punkty kodowe, nie reguły językowe). */
function porownajNapisy(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Wszystkie rekordy pól modelu w kolejności zapisu — lustro `enm.pola.pola`. */
export function pola<B extends RekordPola>(model: ModelPol<B> | null | undefined): readonly B[] {
  const lista = model?.bays;
  if (!Array.isArray(lista)) return [];
  return lista.filter((rekord): rekord is B => rekord !== null && typeof rekord === 'object' && !Array.isArray(rekord));
}

/** Rekord pola o identyfikatorze `ref` (`null`, gdy nie ma) — lustro `enm.pola.pole`. */
export function pole<B extends RekordPola>(model: ModelPol<B> | null | undefined, ref: unknown): B | null {
  const szukany = napis(ref);
  if (!szukany) return null;
  return pola(model).find((rekord) => rekord.ref_id === szukany) ?? null;
}

/** Pola stacji (SN i nN) w kolejności zapisu — lustro `enm.pola.pola_stacji`. */
export function polaStacji<B extends RekordPola>(model: ModelPol<B> | null | undefined, stationRef: unknown): readonly B[] {
  const stacja = napis(stationRef);
  if (!stacja) return [];
  return pola(model).filter((rekord) => rekord.substation_ref === stacja);
}

/** Pola rozdzielnicy odgałęźnej ZKSN punktu rozgałęzienia — lustro `enm.pola.pola_zksn`. */
export function polaZksn<B extends RekordPola>(model: ModelPol<B> | null | undefined, branchPointRef: unknown): readonly B[] {
  const punkt = napis(branchPointRef);
  if (!punkt) return [];
  return pola(model).filter((rekord) => rekord.branch_point_ref === punkt);
}

/** `bus_ref` → napięcie znamionowe szyny [kV] (`null` = brak danej) — lustro `napiecia_szyn`. */
export function napieciaSzyn(model: Pick<ModelPol<RekordPola>, 'buses'> | null | undefined): ReadonlyMap<string, number | null> {
  const wynik = new Map<string, number | null>();
  for (const szyna of model?.buses ?? []) {
    const ref = napis(szyna?.ref_id);
    if (!ref) continue;
    const napiecie = szyna.voltage_kv;
    wynik.set(ref, typeof napiecie === 'number' ? napiecie : null);
  }
  return wynik;
}

/**
 * Czy pole leży na szynie nN — JEDYNY predykat poziomu pola we froncie (lustro
 * `enm.pola.czy_pole_nn`). Rozstrzyga pasmo napięcia szyny `bus_ref` (`wPasmieNn`:
 * 0 < Uₙ ≤ 1 kV); szyna nieznana albo bez napięcia = NIE nN.
 */
export function czyPoleNn(
  model: Pick<ModelPol<RekordPola>, 'buses'> | null | undefined,
  rekord: Pick<Bay, 'bus_ref'>,
  napiecia: ReadonlyMap<string, number | null> = napieciaSzyn(model),
): boolean {
  const szyna = napis(rekord.bus_ref);
  if (!szyna) return false;
  return wPasmieNn(napiecia.get(szyna));
}

/** Pola SN stacji (kolejność zapisu) — lustro `enm.pola.pola_sn_stacji`. */
export function polaSnStacji<B extends RekordPola>(model: ModelPol<B> | null | undefined, stationRef: unknown): readonly B[] {
  const napiecia = napieciaSzyn(model);
  return polaStacji(model, stationRef).filter((rekord) => !czyPoleNn(model, rekord, napiecia));
}

/** Pola nN stacji (kolejność zapisu) — lustro `enm.pola.pola_nn_stacji`. */
export function polaNnStacji<B extends RekordPola>(model: ModelPol<B> | null | undefined, stationRef: unknown): readonly B[] {
  const napiecia = napieciaSzyn(model);
  return polaStacji(model, stationRef).filter((rekord) => czyPoleNn(model, rekord, napiecia));
}

/** Wszystkie pola nN modelu (kolejność zapisu) — lustro `enm.pola.pola_nn`. */
export function polaNn<B extends RekordPola>(model: ModelPol<B> | null | undefined): readonly B[] {
  const napiecia = napieciaSzyn(model);
  return pola(model).filter((rekord) => czyPoleNn(model, rekord, napiecia));
}

/**
 * Stacja pola — `ref_id` stacji właściciela (`null` dla pola ZKSN, pola nieznanego albo
 * stacji, której nie ma w modelu). Lustro `enm.pola.stacja_pola` (backend zwraca rekord
 * stacji; konsumenci frontu pytają o jej identyfikator).
 */
export function stacjaPola<B extends RekordPola>(model: ModelPol<B> | null | undefined, ref: unknown): string | null {
  const wlasciciel = napis(pole(model, ref)?.substation_ref);
  if (!wlasciciel) return null;
  return (model?.substations ?? []).some((stacja) => stacja?.ref_id === wlasciciel) ? wlasciciel : null;
}

/** Własny zacisk pola (szyna za aparatem pola) — `terminal_bus_ref`, jedyny nośnik
 *  (lustro `enm.pola.zacisk_pola`). */
export function zaciskPola(rekord: Pick<Bay, 'terminal_bus_ref'> | null | undefined): string | null {
  return rekord ? napis(rekord.terminal_bus_ref) : null;
}

/** WŁASNY zacisk pola — zacisk różny od szyny pola; `null` dla pola bez własnego zacisku. */
export function wlasnyZaciskPola(rekord: Pick<Bay, 'terminal_bus_ref' | 'bus_ref'> | null | undefined): string | null {
  const zacisk = zaciskPola(rekord);
  return zacisk && zacisk !== napis(rekord?.bus_ref) ? zacisk : null;
}

/** Szyna, na której pole przyłącza element, któremu służy: własny zacisk, a bez zacisku —
 *  szyna pola (lustro `enm.pola.punkt_przylaczenia_pola`, POLA-W-TORZE). */
export function punktPrzylaczeniaPola(rekord: Pick<Bay, 'terminal_bus_ref' | 'bus_ref'> | null | undefined): string | null {
  return zaciskPola(rekord) ?? napis(rekord?.bus_ref);
}

/**
 * Pola stacji pogrupowane po szynie `bus_ref`, w kolejności wyboru pola startu ciągu (OUT,
 * FEEDER, IN, pozostałe; w obrębie roli po `ref_id`) — lustro `enm.pola.pola_wg_szyny`.
 * Pola ZKSN nie wchodzą — obsługuje je punkt rozgałęzienia, nie stacja.
 */
export function polaWgSzyny<B extends RekordPola>(model: ModelPol<B> | null | undefined): ReadonlyMap<string, readonly B[]> {
  const wgSzyny = new Map<string, B[]>();
  for (const rekord of pola(model)) {
    if (!napis(rekord.substation_ref)) continue;
    const szyna = napis(rekord.bus_ref);
    if (!szyna) continue;
    wgSzyny.set(szyna, [...(wgSzyny.get(szyna) ?? []), rekord]);
  }
  const ranga = (rekord: B): number => RANGA_ROLI_NA_SZYNIE[String(rekord.bay_role ?? '').toUpperCase()] ?? 99;
  for (const lista of wgSzyny.values()) {
    lista.sort((a, b) => ranga(a) - ranga(b) || porownajNapisy(String(a.ref_id ?? ''), String(b.ref_id ?? '')));
  }
  return wgSzyny;
}

/** Rola kanoniczna pola: `field_role`, a bez niej alias `bay_role` przez kanon — lustro
 *  `enm.pola.rola_kanoniczna_pola` (`null` dla roli spoza kanonu, np. pola źródłowego `OZE`
 *  bez technologii). */
export function rolaKanonicznaPola(
  rekord: Pick<Bay, 'bay_role'> & Partial<Pick<Bay, 'field_role'>>,
): BayCanonicalRole | null {
  return canonicalFieldRole(rekord.field_role || rekord.bay_role);
}
