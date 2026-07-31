/*
 * Model ogniwa „wynik zwarciowy → weryfikacja wytrzymałości aparatury"
 * (karta KD-4; dług nazwany w V12K-287: „brak przejścia z wyniku zwarciowego
 * do weryfikacji aparatu — ogniwo łańcucha nadal nie istnieje").
 *
 * SKĄD DANE (zero zgadywania, zero fizyki w prezentacji):
 *  - PRĄDY: z wiersza WYNIKU biegu zwarciowego wybranego punktu —
 *    `ShortCircuitRow.ip_ka` (prąd udarowy → kryterium dynamiczne I_dyn) i
 *    `ShortCircuitRow.ith_ka` (prąd cieplny zastępczy → kryterium cieplne
 *    I_th). Tak samo nazywa je pakiet dowodowy SC3F
 *    (`_build_short_circuit_proof_currents`: I_dyn ← ip_a, I_th ← ith_a).
 *  - APARAT I CZAS WYŁĄCZENIA: z zapisanej konfiguracji stacji
 *    (`bay_device_withstand` w `GET /api/v1/projects/{id}/audit2-station-config/
 *    {station_id}`) — dokładnie ten sam zapis, który wypełnia kartę
 *    zabezpieczeń konfiguratora stacji.
 *  - ZNAMIONA I WERDYKT: z backendu
 *    (`POST /api/v1/catalog/audit2/validate-device-withstand`, IEC 60909) —
 *    ta sama końcówka, którą karta K7-B wpięła w konfigurator.
 *
 * Ten plik NIE LICZY nic poza wyborem pól; wszystkie porównania i komunikaty
 * należą do backendu (reguła NOT-A-SOLVER).
 */

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { ShortCircuitRow } from '../../../../ui/results-inspector/types';
import type { BayDeviceWithstandSpec } from '../../../../ui/network-build/station-der/audit2-api';

/** Pole stacji z aparatem do sprawdzenia (wejście końcówki walidacji). */
export interface PoleDoSprawdzenia {
  /** Stacja, w której leży pole (ref modelu) — potrzebna do pobrania konfiguracji. */
  readonly stationRef: string;
  /** Oznaczenie pola z konfiguracji stacji (klucz `bay_device_withstand`). */
  readonly bayDesignation: string;
  /** Identyfikator aparatu w katalogu wytrzymałości. */
  readonly deviceCatalogRef: string;
  /** Prąd udarowy z WYNIKU biegu [kA] (kryterium dynamiczne). */
  readonly i_peak_calculated_ka: number;
  /** Prąd cieplny zastępczy z WYNIKU biegu [kA] (kryterium cieplne). */
  readonly i_thermal_calculated_ka: number;
  /** Czas wyłączenia [s] z konfiguracji zabezpieczeń pola. */
  readonly t_clearing_s: number;
}

/**
 * Stacje, w których leży punkt zwarcia. Punkt zwarcia to węzeł (szyna) —
 * dopasowanie idzie po `bus_refs` stacji, a zapasowo po polach rozdzielczych
 * (`bays[].bus_ref` → `substation_ref`), bo starsze snapshoty nie zawsze
 * wypełniały `bus_refs`. Kolejność deterministyczna (rosnąco po ref).
 *
 * Pusta lista = punkt nie należy do żadnej stacji z modelu — to UCZCIWY BRAK
 * PODSTAWY do sprawdzenia, nie werdykt negatywny.
 */
export function stacjeDlaPunktu(
  snapshot: EnergyNetworkModel | null,
  row: Pick<ShortCircuitRow, 'target_id' | 'element_id'>,
): readonly string[] {
  if (!snapshot) return [];
  const refy = new Set<string>(
    [row.element_id, row.target_id].filter((v): v is string => Boolean(v)),
  );
  const znalezione = new Set<string>();

  for (const stacja of snapshot.substations ?? []) {
    const ref = stacja.ref_id ?? stacja.id;
    if (!ref) continue;
    if ((stacja.bus_refs ?? []).some((busRef) => refy.has(busRef))) znalezione.add(ref);
  }
  for (const pole of snapshot.bays ?? []) {
    if (pole.bus_ref && refy.has(pole.bus_ref) && pole.substation_ref) {
      znalezione.add(pole.substation_ref);
    }
  }
  return [...znalezione].sort((a, b) => a.localeCompare(b));
}

/**
 * Pola do sprawdzenia dla JEDNEJ stacji: aparat i czas wyłączenia z zapisanej
 * konfiguracji, prądy z wyniku biegu. Kolejność po oznaczeniu pola.
 *
 * `null` prądu (starszy wynik bez pola) → pusta lista: bez prądu nie ma czego
 * porównywać, a podstawienie zera byłoby fabrykacją bezpiecznego werdyktu.
 */
export function polaDoSprawdzenia(args: {
  readonly stationRef: string;
  readonly bayDeviceWithstand: Readonly<Record<string, BayDeviceWithstandSpec>> | undefined;
  readonly ipKA: number | null;
  readonly ithKA: number | null;
}): readonly PoleDoSprawdzenia[] {
  const { stationRef, bayDeviceWithstand, ipKA, ithKA } = args;
  if (ipKA === null || ithKA === null) return [];
  return Object.entries(bayDeviceWithstand ?? {})
    .map(([bayDesignation, spec]) => ({
      stationRef,
      bayDesignation,
      deviceCatalogRef: spec.device_id,
      // PRĄDY Z BIEGU — nie z zapisu konfiguracji (tam siedzą liczby, którymi
      // konfigurator dobierał aparat; tutaj sprawdzamy je wynikiem solvera).
      i_peak_calculated_ka: ipKA,
      i_thermal_calculated_ka: ithKA,
      t_clearing_s: spec.t_clearing_s,
    }))
    .sort((a, b) => a.bayDesignation.localeCompare(b.bayDesignation));
}

/** Powód, dla którego weryfikacji NIE DA SIĘ przeprowadzić (uczciwy stan zerowy). */
export type PowodBrakuPodstawy =
  | 'brak-pradow'
  | 'punkt-poza-stacja'
  | 'brak-aparatury-w-konfiguracji';

/**
 * Czy da się sprawdzić aparaturę w tym punkcie — i jeśli nie, DLACZEGO.
 * `null` = da się (są prądy, jest stacja, jest choć jeden aparat).
 */
export function powodBrakuPodstawy(args: {
  readonly ipKA: number | null;
  readonly ithKA: number | null;
  readonly stacje: readonly string[];
  readonly liczbaPol: number;
}): PowodBrakuPodstawy | null {
  if (args.ipKA === null || args.ithKA === null) return 'brak-pradow';
  if (args.stacje.length === 0) return 'punkt-poza-stacja';
  if (args.liczbaPol === 0) return 'brak-aparatury-w-konfiguracji';
  return null;
}
