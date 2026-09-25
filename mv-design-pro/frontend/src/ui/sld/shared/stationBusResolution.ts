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
import { powyzejPasmaNn, wPasmieNn } from '../../../ui2/model/pasmaNapieciowe';

/* Granica stron stacji — jedno lustro granic pasm (`ui2/model/pasmaNapieciowe`).
 * Do karty PASMO-1KV strony dzieliła tu własna liczba 0,5 kV (od K30-37: „0.4 kV
 * LV-side wykluczamy z main"), więc szyna nN 0,69 kV albo 1 kV trafiała na stronę
 * SN stacji, podczas gdy walidator, analizy nN i operacje strony dolnej uznawały ją
 * za nN. Obie strony biorą teraz parę predykatów z jednego źródła. */

/** Strona stacji: `sn` = szyna powyżej pasma nN (`powyzejPasmaNn`),
 *  `nn` = szyna w paśmie nN (`wPasmieNn`, 0 < voltage_kv ≤ 1 kV). */
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
  return side === 'sn' ? powyzejPasmaNn(voltageKv) : wPasmieNn(voltageKv);
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

/** Klucz meta gałęzi aparatu pola nN promowanego do modelu przez automigrację backendu
 *  (`enm/migrations/nn_field_specs_promocja.py`, `META_KLUCZ_GALAZ_ZRODLO_FIELD_REF`):
 *  `field_ref` wpisu `Substation.meta.nn_field_specs`, z którego gałąź powstała. */
const META_POLE_NN_ZRODLOWE = 'nn_field_migrowany_z';

type BranchForStationBuses = {
  readonly from_bus_ref?: string | null;
  readonly to_bus_ref?: string | null;
  readonly meta?: Readonly<Record<string, unknown>> | null;
};

/**
 * Szyny, na których wiszą odbiory STACJI: `Substation.bus_refs` ORAZ szyny odpływów nN
 * utworzone przez promocję pól nN tej stacji do modelu (karta SLD-SUBSTRAT).
 *
 * DLACZEGO. Od automigracji promocji pól nN (P0.1, 2026-08-13) każdy odpływ nN stacji
 * zbudowanej operacjami domenowymi jest REALNYM aparatem (gałąź) między szyną nN stacji
 * a NOWĄ szyną odpływu, a odbiór dostaje `bus_ref` tej szyny odpływu — szyna odpływu nie
 * trafia do `Substation.bus_refs`. Agregat odbioru nN stacji (tabliczka „Odbiór ΣP",
 * strzałka odbioru), moc odbioru stacji i lista odbiorów szuflady szczegółów czytały
 * WYŁĄCZNIE `bus_refs`, więc na KAŻDEJ stacji z modelu produktu (API) odbiór znikał
 * z rysunku — ujawnione regeneracją fikstur z realnego API (`gpzFeeder`: „Odbiór ΣP"
 * 2 → 0). Przynależność szyny odpływu do stacji jest DEKLARACJĄ modelu (meta gałęzi
 * wskazuje pole z `nn_field_specs` tej stacji, a gałąź wychodzi z szyny tej stacji) —
 * nie wędrówką po grafie i nie zgadywaniem. Szyny podrozdzielnic (osobne
 * `Substation` typu `rozdzielnica_nn`) należą do nich samych, nie do stacji.
 */
export function stationLoadBusRefs(
  substation: Pick<Substation, 'bus_refs'> & { readonly meta?: unknown },
  branches: readonly BranchForStationBuses[],
): Set<string> {
  const szyny = new Set<string>(substation.bus_refs ?? []);
  const meta = (substation.meta ?? {}) as { nn_field_specs?: ReadonlyArray<{ field_ref?: unknown }> };
  const polaNn = new Set(
    (meta.nn_field_specs ?? [])
      .map((pole) => pole?.field_ref)
      .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0),
  );
  if (polaNn.size === 0) return szyny;
  for (const galaz of branches) {
    const pole = galaz.meta?.[META_POLE_NN_ZRODLOWE];
    if (typeof pole !== 'string' || !polaNn.has(pole)) continue;
    if (!galaz.from_bus_ref || !szyny.has(galaz.from_bus_ref) || !galaz.to_bus_ref) continue;
    szyny.add(galaz.to_bus_ref);
  }
  return szyny;
}
