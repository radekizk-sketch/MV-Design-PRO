/**
 * Bateria kondensatorów na końcu toru pola — relacja pola z modelu sieci wspólna dla OBU
 * adapterów kanwy (stacje `v2/canvas/enmToSldAdapter.ts` i rozdzielnia GPZ
 * `v2/canvas/enmToCanonicalGpzAdapter.ts`), karta UX-04/POLE-BKR-MODEL.
 *
 * Powiązanie baterii z polem jest JEDNO i to samo co w backendzie
 * (`backend/src/enm/bateria_kondensatorow.py::pole_baterii`): bateria stoi na zacisku końca
 * toru pola, `ShuntCapacitor.bus_ref === Bay.terminal_bus_ref`. Pole bez zacisku końca toru
 * nie niesie baterii (brak relacji ≠ domysł po szynie zbiorczej pola).
 *
 * Układ połączeń bierze się wyłącznie z modelu: wartość projektanta (`uklad_polaczen`
 * elementu), a bez niej — tabliczka typu katalogowego (`materialized_params.uklad_polaczen`).
 * Wartości roboczej rejestru (`catalog.wartosci_robocze`) front NIE powiela: bez danej
 * modelu układ jest `null` i glif rysuje znak „układ nieokreślony w modelu".
 */
import {
  UKLADY_POLACZEN_BATERII,
  type Bay,
  type EnergyNetworkModel,
  type ShuntCapacitor,
  type UkladPolaczenBaterii,
} from '../../../../types/enm';
import { RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA } from '../../v3/compose/rodzajeAparatuPola';

/** Dane baterii potrzebne rysunkowi (glif `capacitorBank`). */
export interface BateriaPolaView {
  /** `ShuntCapacitor.ref_id` — tożsamość elementu modelu. */
  readonly bateriaRef: string;
  /** Układ połączeń z modelu; `null` = model go nie deklaruje (ani element, ani typ). */
  readonly uklad: UkladPolaczenBaterii | null;
  /** Pole niesie rekord przekładnika niezrównoważenia (`BayPrimaryDevice.kind`
   *  `UNBALANCE_CT`) — glif rysuje go w połączeniu międzygwiazdowym (Zał. 16), bo
   *  przekładnik obejmuje to połączenie, a nie tor pola. */
  readonly przekladnikNiezrownowazenia: boolean;
}

function jestUkladem(value: unknown): value is UkladPolaczenBaterii {
  return typeof value === 'string' && (UKLADY_POLACZEN_BATERII as readonly string[]).includes(value);
}

/** Układ połączeń baterii z modelu: element > tabliczka typu; bez danej — `null`. */
export function ukladBateriiZModelu(bateria: ShuntCapacitor): UkladPolaczenBaterii | null {
  if (jestUkladem(bateria.uklad_polaczen)) return bateria.uklad_polaczen;
  const zTypu = bateria.materialized_params?.uklad_polaczen;
  return jestUkladem(zTypu) ? zTypu : null;
}

/** Bateria na zacisku końca toru pola (pierwsza wg `ref_id` — kolejność migawki nie zmienia
 *  wyniku) albo `null`. */
export function bateriaNaKoncuToruPola(
  bay: Pick<Bay, 'terminal_bus_ref' | 'primary_devices'>,
  snapshot: Pick<EnergyNetworkModel, 'shunt_capacitors'>,
): BateriaPolaView | null {
  const zacisk = bay.terminal_bus_ref;
  if (!zacisk) return null;
  const bateria = (snapshot.shunt_capacitors ?? [])
    .filter((b) => b.bus_ref === zacisk)
    .sort((a, b) => (a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0))[0];
  if (!bateria) return null;
  return {
    bateriaRef: bateria.ref_id,
    uklad: ukladBateriiZModelu(bateria),
    przekladnikNiezrownowazenia: (bay.primary_devices ?? []).some(
      (device) => device.kind === RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA,
    ),
  };
}

/** Pole widoku pola z baterią (`MiniBlockBayDescriptor.bateria`, `CanonicalGpzBay.bateria`) —
 *  JEDNA funkcja dla obu adapterów; brak baterii → brak pola w obiekcie. Rola pola nie jest
 *  warunkiem: bateria na końcu toru pola innej roli też jest rysowana, a walidator nazywa
 *  brak pola BKR (W045). */
export function bateriaWidokuPola(
  bay: Pick<Bay, 'terminal_bus_ref' | 'primary_devices'>,
  snapshot: Pick<EnergyNetworkModel, 'shunt_capacitors'>,
): { readonly bateria?: BateriaPolaView } {
  const bateria = bateriaNaKoncuToruPola(bay, snapshot);
  return bateria ? { bateria } : {};
}
