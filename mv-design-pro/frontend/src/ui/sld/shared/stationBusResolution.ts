/**
 * S9-2 (AUDYT_JAKOSCI_SLD_2026-08 W-1) — JEDNA reguła „która szyna stacji jest
 * szyną SN, a która nN".
 *
 * Powód wydzielenia (KLASA, NIE INSTANCJA, pkt 3 „predykaty parami"): tę samą
 * decyzję podejmowały dotąd DWA niezależne miejsca —
 *  * adapter v2 (`enmToCanonicalSldAdapter`/`enmToSldAdapter.ts`
 *    `buildStationMiniBlockDetails`) wyprowadzał NAPIĘCIE szyny SN/nN do opisu
 *    szyny na rysunku,
 *  * warstwa wynikowa potrzebuje REFU tej samej szyny, żeby dopasować punkt
 *    wyniku backendu do narysowanego odcinka szyny.
 * Dwa warunki, które „dziś się zgadzają", rozjechałyby się na danych brzegowych
 * (stacja z dwiema szynami SN): rysunek pokazywałby napięcie jednej szyny, a
 * etykieta wynikowa liczby drugiej. Reguła jest więc JEDNA, tutaj.
 *
 * ZERO fizyki: wyłącznie wybór rekordu `Bus` po zadeklarowanym `voltage_kv`
 * (dana modelu), bez żadnego przeliczania.
 */
import type { Bus, Substation } from '../../../types/enm';

/** Granica stron stacji [kV] — wartość rozdzielająca stronę SN od nN w rekordach
 *  `Bus`. Ta sama liczba, którą adapter v2 stosował od K30-37 („0.4 kV LV-side
 *  wykluczamy z main"); wydzielona, żeby obie strony czytały ją z jednego
 *  miejsca. */
export const STATION_LV_VOLTAGE_LIMIT_KV = 0.5;

/** Strona stacji: `sn` = szyna średniego napięcia (voltage_kv > granica),
 *  `nn` = szyna niskiego napięcia (0 < voltage_kv ≤ granica). */
export type StationBusSide = 'sn' | 'nn';

/**
 * Wynik wyboru szyny stacji dla jednej strony.
 * `voltageKv` — napięcie NAJWYŻSZEJ szyny tej strony (`null` = brak szyny);
 * `ref` — ref TEJ szyny, ale WYŁĄCZNIE gdy jest jednoznaczna: przy remisie
 * (dwie szyny o tym samym, najwyższym napięciu — np. stacja dwusekcyjna) ref
 * jest `null`, a `ambiguous` = `true`. Rysunek v3 ma dla stacji JEDEN odcinek
 * szyny SN i JEDEN nN, więc przy remisie nie da się wskazać, którą z nich
 * narysowano — odmowa zamiast zgadywania (etykieta wynikowa nie powstaje,
 * a punkt trafia do jawnego licznika „bez elementu rysunku").
 */
export interface StationBusPick {
  readonly ref: string | null;
  readonly voltageKv: number | null;
  readonly ambiguous: boolean;
}

const EMPTY_PICK: StationBusPick = { ref: null, voltageKv: null, ambiguous: false };

function belongsToSide(voltageKv: number, side: StationBusSide): boolean {
  return side === 'sn' ? voltageKv > STATION_LV_VOLTAGE_LIMIT_KV : voltageKv > 0 && voltageKv <= STATION_LV_VOLTAGE_LIMIT_KV;
}

/**
 * Wybierz szynę stacji danej strony spośród `Substation.bus_refs` (jedyny
 * poprawny klucz złączenia — `Bus` NIE ma pola `substation_ref`, patrz komentarz
 * F10.3 FIX w adapterze v2). Kryterium: NAJWYŻSZE `voltage_kv` w obrębie strony;
 * remis ⇒ `ambiguous` (patrz `StationBusPick`). Determinizm: wynik zależy
 * wyłącznie od zawartości rekordów, nie od kolejności iteracji.
 */
export function pickStationBus(
  substation: Pick<Substation, 'bus_refs'>,
  busByRef: ReadonlyMap<string, Pick<Bus, 'ref_id' | 'voltage_kv'>>,
  side: StationBusSide,
): StationBusPick {
  let bestVoltage: number | null = null;
  let bestRef: string | null = null;
  let tie = false;
  for (const busRef of substation.bus_refs ?? []) {
    const bus = busByRef.get(busRef);
    if (!bus) continue;
    const v = bus.voltage_kv;
    if (typeof v !== 'number' || !Number.isFinite(v) || !belongsToSide(v, side)) continue;
    if (bestVoltage === null || v > bestVoltage) {
      bestVoltage = v;
      bestRef = bus.ref_id;
      tie = false;
    } else if (v === bestVoltage && bus.ref_id !== bestRef) {
      tie = true;
    }
  }
  if (bestVoltage === null) return EMPTY_PICK;
  return { ref: tie ? null : bestRef, voltageKv: bestVoltage, ambiguous: tie };
}
