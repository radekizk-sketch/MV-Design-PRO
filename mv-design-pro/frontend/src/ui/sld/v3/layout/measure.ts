/**
 * SLD V3 — measure (SLD_CAD_SPEC_V3 §5.1, potok measure → bands → columns).
 *
 * Pierwszy krok potoku: dla każdego elementu wyznacza wymiary WYMAGANE z
 * treści (P1 — "przestrzeń z treści, nie treść w przestrzeń"), zanim
 * cokolwiek jest rysowane. Czysta arytmetyka, zero DOM — pomiar tekstu to
 * `measureLabelWidth` z `core/text.ts` (formuła deterministyczna, F1: DOM
 * measure ZREZYGNOWANY całkowicie).
 *
 * UWAGA (odczyt wejścia v2): pola `x`/`y` z `StationOnRunRendererProps` /
 * `CableRunRendererProps` w v2 to STARA geometria slotowa (PITCH) — v3 jej
 * NIE używa i NIE czyta. Stąd `StationMeasureInput` niżej to podzbiór
 * WYŁĄCZNIE pól semantycznych (nazwa, kod, moc, role pól), zgodny z typami
 * v2 (import typu `MiniBlockBayDescriptor`, bez duplikowania modelu danych).
 */

import { GRID } from '../core/grid';
import { labelLineHeight, measureLabelWidth } from '../core/text';
import { SYMBOL_DEFS } from '../symbols/defs';
import { FIELD_ROLE, type FieldRole } from '../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../v2/renderer/MiniBlockRmuRenderer';

const LABEL_LINE_HEIGHT_T1 = labelLineHeight('t1');
const LABEL_LINE_HEIGHT_T2 = labelLineHeight('t2');
const LABEL_LINE_HEIGHT_T4 = labelLineHeight('t4');

/** Przyciągnięcie W GÓRĘ do siatki (P1: przestrzeń nie może być węższa/niższa
 *  niż wymaga treść — zaokrąglenie w dół obcięłoby ostatni piksel etykiety). */
export function snapUp(value: number): number {
  return Math.ceil(value / GRID) * GRID;
}

/**
 * Podzbiór semantyczny stacji potrzebny do pomiaru (spec §4 pasmo NAZW,
 * §5.1). Odpowiednik pól z `StationOnRunRendererProps` (v2) — bez x/y.
 */
export interface StationMeasureInput {
  readonly id: string;
  readonly name: string;
  readonly stationCode?: string | null;
  readonly transformerRatedKva?: number | null;
  /** Typ stacji wg §9 nomenklatury (np. „stacja przelotowa") — slot t4. */
  readonly stationTypeLabel?: string | null;
  readonly snBays: readonly MiniBlockBayDescriptor[];
}

/** Format mocy transformatora — spójny z `StationOnRunRenderer` (v2), żeby
 *  pomiar szerokości etykiety odpowiadał realnie rysowanemu tekstowi. */
export function formatTransformerRatedPower(kva: number): string {
  return kva >= 1000
    ? `${(kva / 1000).toFixed(1).replace('.', ',')} MVA`
    : `${kva} kVA`;
}

/**
 * Gabaryt kolumny pola (jedna pionowa kolumna aparatów, spec §3 "Stacja
 * SN/nN"). DECYZJA (F2, patrz raport końcowy): dokładna kompozycja aparatów
 * per rola to zakres F5 (`compose/station.ts`) — tu używamy reprezentatywnego
 * stosu aparatów per klasę roli, wyłącznie do REZERWACJI miejsca:
 *  - pole liniowe/sprzęgło/pomiar: DS + CB (spec §3: „WE: DS+CB; WY: DS+CB");
 *  - pole transformatorowe: DS + rozłącznik z bezpiecznikiem + TR2W
 *    (spec §3: „TR: DS+bezpiecznik/CB + TR2W + szyna nN + odpływy nN" —
 *    szyna nN/odpływy pomijane w wysokości kolumny, doliczane jako margines
 *    stałej wysokości bloku w `stationBlockHeight`);
 *  - pole DER: symbol DER (PV/BESS/generator wg `MiniBlockDerBadge.kind`).
 */
function bayColumnFootprint(role: FieldRole): { readonly width: number; readonly height: number } {
  if (role === FIELD_ROLE.TRANSFORMER || role === FIELD_ROLE.RMU_TRANSFORMER) {
    const ds = SYMBOL_DEFS.disconnector;
    const fuse = SYMBOL_DEFS.fuseSwitch;
    const tr = SYMBOL_DEFS.transformer2W;
    return {
      width: Math.max(ds.width, fuse.width, tr.width),
      height: ds.height + GRID + fuse.height + GRID + tr.height,
    };
  }
  if (role === FIELD_ROLE.DER_PV) return { width: SYMBOL_DEFS.derPv.width, height: SYMBOL_DEFS.derPv.height };
  if (role === FIELD_ROLE.DER_BESS) return { width: SYMBOL_DEFS.derBess.width, height: SYMBOL_DEFS.derBess.height };
  if (role === FIELD_ROLE.DER_FW) return { width: SYMBOL_DEFS.derGenerator.width, height: SYMBOL_DEFS.derGenerator.height };
  // Domyślnie: pole liniowe / sprzęgło / pomiar — DS + CB w kolumnie.
  const ds = SYMBOL_DEFS.disconnector;
  const cb = SYMBOL_DEFS.breaker;
  return { width: Math.max(ds.width, cb.width), height: ds.height + GRID + cb.height };
}

/** Margines stały bloku stacji: prześwit na szynę SN (nad kolumnami) i szynę
 *  nN (pod kolumnami) — spec §3 "szyna SN + kolumny pól + TR + szyna nN". */
const STATION_BLOCK_BUS_CLEARANCE = 2 * GRID;

/** Szerokość bloku stacji z liczby pól: suma szerokości kolumn + odstępy GRID
 *  między kolumnami (spec §5.1, §5.3 "blok stacji z liczby pól"). */
function stationBlockWidth(snBays: readonly MiniBlockBayDescriptor[]): number {
  if (snBays.length === 0) return 0;
  const columnsWidth = snBays.reduce((sum, bay) => sum + bayColumnFootprint(bay.fieldRole).width, 0);
  return columnsWidth + GRID * Math.max(snBays.length - 1, 0);
}

/** Wysokość bloku stacji (B4, spec §5.2): kolumny stoją OBOK siebie, więc
 *  wysokość = najwyższa kolumna + prześwit szyn SN/nN. */
export function stationBlockHeight(station: StationMeasureInput): number {
  if (station.snBays.length === 0) return STATION_BLOCK_BUS_CLEARANCE;
  const tallest = Math.max(...station.snBays.map((bay) => bayColumnFootprint(bay.fieldRole).height));
  return tallest + STATION_BLOCK_BUS_CLEARANCE;
}

/**
 * Wysokość pasma NAZW stacji (B5, spec §4/§5.2): suma wierszy obecnych w
 * kolejności stałej — nazwa (t1), kod (t1), moc TR (t2), typ stacji (t4).
 * Wiersz pomijany, gdy dana nieobecna (np. brak transformatora → brak
 * wiersza kVA), zgodnie z §4 "kolejność pionowa stała" (stała KOLEJNOŚĆ, nie
 * stała LICZBA wierszy — pusty wiersz nie rezerwowałby miejsca na nic).
 */
export function stationNameBandHeight(station: StationMeasureInput): number {
  // Wysokości wierszy różnią się klasą (t1 vs t2 vs t4) — sumujemy realne
  // wysokości wierszy zamiast mnożyć przez jedną klasę, żeby pasmo miało
  // dokładnie tyle miejsca ile potrzebują wszystkie obecne wiersze.
  let height = LABEL_LINE_HEIGHT_T1; // nazwa (zawsze obecna)
  if (station.stationCode) height += LABEL_LINE_HEIGHT_T1;
  if (station.transformerRatedKva != null) height += LABEL_LINE_HEIGHT_T2;
  if (station.stationTypeLabel) height += LABEL_LINE_HEIGHT_T4;
  return height;
}

/**
 * Szerokość wymagana kolumny stacji (spec §5.1, §5.3):
 * `max(blok stacji z liczby pól, najszersza etykieta pasma nazw) + 2×GRID`,
 * przyciągnięte do siatki W GÓRĘ.
 */
export function requiredStationWidth(station: StationMeasureInput): number {
  const blockWidth = stationBlockWidth(station.snBays);

  const nameWidths: number[] = [measureLabelWidth(station.name, 't1')];
  if (station.stationCode) nameWidths.push(measureLabelWidth(station.stationCode, 't1'));
  if (station.transformerRatedKva != null) {
    nameWidths.push(measureLabelWidth(formatTransformerRatedPower(station.transformerRatedKva), 't2'));
  }
  if (station.stationTypeLabel) nameWidths.push(measureLabelWidth(station.stationTypeLabel, 't4'));
  const nameBandWidth = Math.max(...nameWidths);

  return snapUp(Math.max(blockWidth, nameBandWidth) + 2 * GRID);
}

/**
 * Szerokość wymagana slotu etykiety segmentu magistrali wchodzącego do
 * stacji (spec §5.1, §4: typ·przekrój·długość, klasa t2).
 */
export function requiredSegmentLabelWidth(text: string): number {
  return measureLabelWidth(text, 't2') + 2 * GRID;
}
