/**
 * Pola SN stacji na kartach budowy sieci (karta stacji, konfigurator, karta techniczna,
 * inspektor) — JEDNA projekcja z rekordów `bays` (karta W5-B: jedyny nośnik pól).
 *
 * Do karty W5-B istniały tu dwa kanały (lista pól w `meta` stacji i rekordy `bays`) z własnym
 * pierwszeństwem w każdej karcie, a liczność pól brała pierwszy niepusty z trzech (lista,
 * rekordy, read-model pola). Teraz pole SN stacji = rekord `bays` ze `substation_ref` stacji na
 * szynie poza pasmem nN (`polaSnStacji`, lustro backendu `enm.pola.pola_sn_stacji`).
 */
import type { Bay, Substation } from '../../types/enm';
import { polaSnStacji, type ModelPol } from '../shared/polaStacji';

/** Pola SN stacji w kolejności zapisu (`[]` bez stacji). */
export function stationSnBays(
  snapshot: ModelPol | null | undefined,
  station: Pick<Substation, 'ref_id'> | null | undefined,
): readonly Bay[] {
  if (!station) return [];
  return polaSnStacji(snapshot, station.ref_id);
}

/** Liczba pól SN stacji — liczność tej samej projekcji (`stationSnBays`). */
export function stationSnFieldCount(
  snapshot: ModelPol | null | undefined,
  station: Pick<Substation, 'ref_id'> | null | undefined,
): number {
  return stationSnBays(snapshot, station).length;
}
