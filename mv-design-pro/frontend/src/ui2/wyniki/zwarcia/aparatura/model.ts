/*
 * Model ogniwa „wynik zwarciowy → weryfikacja wytrzymałości aparatury"
 * (karta KD-4; most katalogowy i tor z MODELU — karta KD-6 poz. 2).
 *
 * SKĄD DANE (zero zgadywania, zero fizyki w prezentacji):
 *  - PRĄDY: z wiersza WYNIKU biegu zwarciowego wybranego punktu —
 *    `ShortCircuitRow.ip_ka` (prąd udarowy → kryterium dynamiczne I_dyn),
 *    `ShortCircuitRow.ith_ka` (prąd cieplny zastępczy → kryterium cieplne I_th)
 *    i `ShortCircuitRow.ik_ka` (prąd początkowy → czas z charakterystyki
 *    zabezpieczenia). Tak samo nazywa je pakiet dowodowy SC3F.
 *  - APARAT, ZNAMIONA, CZAS I WERDYKT: z JEDNEJ końcówki backendu
 *    (`POST /api/cases/{caseId}/enm/wytrzymalosc-aparatury`), która czyta pola
 *    stacji i pozycje katalogu APARAT_SN z MODELU, a zapisaną konfigurację
 *    stacji nakłada tam, gdzie istnieje. Do karty KD-6 ogniwo składało to samo
 *    z trzech wywołań w przeglądarce i działało WYŁĄCZNIE dla pól ręcznie
 *    skonfigurowanych.
 *
 * Ten plik NIE LICZY nic poza wyborem stacji punktu; wszystkie porównania i
 * komunikaty należą do backendu (reguła NOT-A-SOLVER).
 */

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { ShortCircuitRow } from '../../../../ui/results-inspector/types';

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
 * Nazwa stacji z modelu (strefa pierwszoplanowa mówi po polsku, nie
 * identyfikatorami). Brak nazwy w modelu → ref jako uczciwy zapasowy opis.
 */
export function nazwaStacji(
  snapshot: EnergyNetworkModel | null,
  stationRef: string,
): string {
  const stacja = (snapshot?.substations ?? []).find(
    (s) => (s.ref_id ?? s.id) === stationRef,
  );
  return stacja?.name || stationRef;
}

/** Powód, dla którego weryfikacji NIE DA SIĘ przeprowadzić (uczciwy stan zerowy). */
export type PowodBrakuPodstawy =
  | 'brak-pradow'
  | 'punkt-poza-stacja'
  | 'brak-aparatury';

/**
 * Czy da się sprawdzić aparaturę w tym punkcie — i jeśli nie, DLACZEGO.
 * `null` = da się (są prądy, jest stacja, jest choć jeden aparat).
 *
 * `brak-aparatury` znaczy od karty KD-6: ani jedno pole stacji nie ma aparatu
 * z katalogu w MODELU i nie ma zapisu w konfiguracji — wcześniej ten stan
 * mówił wyłącznie o konfiguracji, bo model nie był w ogóle czytany.
 */
export function powodBrakuPodstawy(args: {
  readonly ipKA: number | null;
  readonly ithKA: number | null;
  readonly stacje: readonly string[];
  readonly liczbaPol: number;
}): PowodBrakuPodstawy | null {
  if (args.ipKA === null || args.ithKA === null) return 'brak-pradow';
  if (args.stacje.length === 0) return 'punkt-poza-stacja';
  if (args.liczbaPol === 0) return 'brak-aparatury';
  return null;
}
