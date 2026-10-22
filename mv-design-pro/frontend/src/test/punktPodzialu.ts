/**
 * Pomocnik testów i skryptów dowodowych SLD (karta W5-C): punkt normalnie otwarty w
 * stacji ustawiony TAK, jak robi to model — pozycją normalną łącznika pola stacji
 * (`SwitchBranch.normal_state = 'open'`), nie skasowaną kopią `LineRun.nop_station_ref`.
 *
 * Zmienia WYŁĄCZNIE pozycję normalną (bieżące położenie `status` bez zmian), więc
 * topologia i rozpływ fixtury zostają te same — test porównuje sam znacznik NOP.
 */
import type { EnergyNetworkModel } from '../types/enm';
import { czyLacznikZPozycjaNormalna } from '../ui/shared/stanLacznika';

export function zPunktemPodzialuWStacji(
  enm: EnergyNetworkModel,
  stationRef: string,
): EnergyNetworkModel {
  const kopia = structuredClone(enm);
  const galezie = new Map(kopia.branches.map((galaz) => [galaz.ref_id, galaz]));
  const pola = [...(kopia.bays ?? [])]
    .filter((pole) => pole.substation_ref === stationRef)
    .sort((a, b) => (a.ref_id < b.ref_id ? -1 : 1));
  for (const pole of pola) {
    for (const ref of [...(pole.equipment_refs ?? [])].sort()) {
      const galaz = galezie.get(ref);
      if (czyLacznikZPozycjaNormalna(galaz)) {
        galaz.normal_state = 'open';
        return kopia;
      }
    }
  }
  throw new Error(`stacja ${stationRef} nie ma łącznika z pozycją normalną w polach — brak NOP`);
}
