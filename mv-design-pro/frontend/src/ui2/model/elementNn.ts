/**
 * Tożsamość elementu sieci nN — JEDNO źródło klasyfikacji dla drzewa układu, inspektora,
 * karty technicznej i wyszukiwarki (karta OBIEKT-KABEL-NN).
 *
 * Dotąd każde z tych miejsc rozstrzygało rodzaj elementu po swojemu, a każde zakładało SN:
 * kabel nN był w drzewie „odcinkiem SN", w inspektorze „Kablem SN" z akcjami ciągu SN
 * i katalogiem kabli SN, a rozdzielnica nN (złącze kablowe ZK) — „stacją SN/nN". Ta sama
 * klasa defektu (tożsamość elementu nN) w czterech miejscach, więc jeden predykat dla
 * wszystkich.
 *
 * Reguła gałęzi (PARAMI z backendem — `application/analyses/kabel_nn.lokalizuj_obwod_kabla_nn`):
 * gałąź jest gałęzią nN ⇔ OBA jej końce leżą na szynach w paśmie nN (`wPasmieNn`). Szyna
 * nieznana albo bez napięcia NIE jest nN (brak danej ≠ nN) — taka gałąź zostaje w klasie
 * ogólnej, a nie przechodzi po cichu do nN.
 *
 * Reguła stacji: rozdzielnica nN to `station_type === 'rozdzielnica_nn'` (deklaracja modelu
 * tworzona operacją `add_nn_distribution_board`) — złącze kablowe, rozdzielnica odbiorcza,
 * podrozdzielnica.
 */

import { pasmoNapieciowe, wPasmieNn } from './pasmaNapieciowe';

/** Szyna w minimalnym kształcie potrzebnym do klasyfikacji (rekord ENM albo migawki). */
export interface SzynaDoKlasyfikacji {
  readonly ref_id?: unknown;
  readonly id?: unknown;
  readonly voltage_kv?: unknown;
}

/** Model w minimalnym kształcie: tylko szyny. */
export interface ModelDoKlasyfikacji {
  readonly buses?: readonly SzynaDoKlasyfikacji[] | null;
}

/** Gałąź w minimalnym kształcie: rodzaj i końce. */
export interface GalazDoKlasyfikacji {
  readonly type?: unknown;
  readonly from_bus_ref?: unknown;
  readonly to_bus_ref?: unknown;
}

/** Stacja w minimalnym kształcie: deklarowana funkcja. */
export interface StacjaDoKlasyfikacji {
  readonly station_type?: unknown;
}

/** Przestrzeń katalogu kabli nN (`KABEL_NN`) — ta sama, którą wiąże operacja wyboru typu. */
export const PRZESTRZEN_KABLI_NN = 'KABEL_NN' as const;

function napiecieSzyny(model: ModelDoKlasyfikacji | null | undefined, ref: unknown): number | null {
  if (typeof ref !== 'string' || ref.length === 0) return null;
  const szyna = model?.buses?.find((b) => b.ref_id === ref || b.id === ref);
  return typeof szyna?.voltage_kv === 'number' ? szyna.voltage_kv : null;
}

/** Czy szyna o tym odnośniku NA PEWNO leży w paśmie nN. */
export function szynaNn(model: ModelDoKlasyfikacji | null | undefined, ref: unknown): boolean {
  return wPasmieNn(napiecieSzyny(model, ref));
}

/** Czy gałąź NA PEWNO jest gałęzią nN (oba końce w paśmie nN). */
export function jestGaleziaNn(
  model: ModelDoKlasyfikacji | null | undefined,
  galaz: GalazDoKlasyfikacji | null | undefined,
): boolean {
  if (!galaz) return false;
  return szynaNn(model, galaz.from_bus_ref) && szynaNn(model, galaz.to_bus_ref);
}

/** Czy gałąź jest kablem nN — obiekt projektowy z obliczeniami i doborem przekroju. */
export function jestKablemNn(
  model: ModelDoKlasyfikacji | null | undefined,
  galaz: GalazDoKlasyfikacji | null | undefined,
): boolean {
  return galaz?.type === 'cable' && jestGaleziaNn(model, galaz);
}

/** Czy stacja jest rozdzielnicą nN (złącze kablowe, rozdzielnica odbiorcza, podrozdzielnica). */
export function jestRozdzielnicaNn(stacja: StacjaDoKlasyfikacji | null | undefined): boolean {
  return stacja?.station_type === 'rozdzielnica_nn';
}

/**
 * Podpis rodzaju gałęzi przewodowej dla projektanta: „Kabel nN", „Kabel SN",
 * „Linia napowietrzna nN", „Linia napowietrzna SN". Pasmo w podpisie tylko wtedy, gdy oba
 * końce leżą w TYM SAMYM paśmie; gałąź, której pasma nie da się rozstrzygnąć z modelu
 * (szyna nieznana, bez napięcia, końce w różnych pasmach), dostaje podpis bez pasma
 * („Kabel") — nie zgadujemy SN.
 */
export function rodzajGaleziPrzewodowejPl(
  model: ModelDoKlasyfikacji | null | undefined,
  galaz: GalazDoKlasyfikacji | null | undefined,
): string {
  const rdzen = galaz?.type === 'line_overhead' ? 'Linia napowietrzna' : 'Kabel';
  const pasmoOd = pasmoNapieciowe(napiecieSzyny(model, galaz?.from_bus_ref));
  const pasmoDo = pasmoNapieciowe(napiecieSzyny(model, galaz?.to_bus_ref));
  return pasmoOd !== null && pasmoOd === pasmoDo ? `${rdzen} ${pasmoOd}` : rdzen;
}
