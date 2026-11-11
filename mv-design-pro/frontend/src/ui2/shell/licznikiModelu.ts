/*
 * Liczniki modelu sieci (karta K1 POWLOKA) — czysta funkcja migawki modelu.
 *
 * Do karty K1 te liczby żyły w stałym, czwartym pasie powłoki (pasek metryk
 * `ui/shell/WorkflowContextStrip`), który dodatkowo powtarzał gotowość trzema
 * chipami („Faza projektu", „Kontrola", „Obliczenia/Następny krok"). Liczby
 * przeszły do panelu na żądanie paska narzędzi; powtórzenia gotowości
 * skasowano (jedyne miejsce gotowości w chromie: pasek stanu).
 *
 * Reguły zliczania przeniesione 1:1: odcinki SN = gałęzie terenowe
 * (`isTerrainSnSegment`), stacje = stacje inne niż GPZ, pola SN =
 * `selectSnFieldCount` (karta W5-B), długość = suma długości odcinków
 * terenowych o dodatniej długości z danych modelu (geometria z modelu, nie
 * obliczenie fizyczne). Brak modelu = brak liczb (`null`), nie zera.
 */

import type { EnergyNetworkModel } from '../../types/enm';
import { isTerrainSnSegment, terrainSegmentLengthKm } from '../../ui/shared/enmVisibility';
import { selectSnFieldCount } from '../../ui/network-build/networkBuildStore';

export interface LicznikiModelu {
  zrodla: number;
  szyny: number;
  odcinkiSn: number;
  polaSn: number;
  stacje: number;
  transformatory: number;
  generatory: number;
  odbiory: number;
  /** Suma długości odcinków SN z podaną długością [km]; `null` = żaden odcinek jej nie ma. */
  dlugoscKm: number | null;
}

export function policzLicznikiModelu(model: EnergyNetworkModel | null): LicznikiModelu | null {
  if (!model) return null;
  const odcinki = (model.branches ?? []).filter((galaz) => isTerrainSnSegment(galaz));
  let dlugoscKm: number | null = null;
  for (const odcinek of odcinki) {
    const dlugosc = terrainSegmentLengthKm(odcinek);
    if (dlugosc !== null) dlugoscKm = (dlugoscKm ?? 0) + dlugosc;
  }
  return {
    zrodla: (model.sources ?? []).length,
    szyny: (model.buses ?? []).length,
    odcinkiSn: odcinki.length,
    polaSn: selectSnFieldCount(model),
    stacje: (model.substations ?? []).filter(
      (stacja) => String(stacja.station_type ?? '').toLowerCase() !== 'gpz',
    ).length,
    transformatory: (model.transformers ?? []).length,
    generatory: (model.generators ?? []).length,
    odbiory: (model.loads ?? []).length,
    dlugoscKm,
  };
}
