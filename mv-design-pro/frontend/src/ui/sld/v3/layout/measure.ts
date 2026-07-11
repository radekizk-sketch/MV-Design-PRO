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
 * WYŁĄCZNIE pól semantycznych (nazwa, kod, moc, role pól), wyprowadzony
 * przez `Pick` z `StationOnRunRendererProps` (v2) — zero duplikacji modelu
 * danych (recenzja F2, FIX-1): jeśli v2 doda/zmieni pole źródłowe, `Pick`
 * przechwyci to na etapie kompilacji zamiast cichego rozjazdu kopii.
 */

import { GRID, snapUp } from '../core/grid';
import { labelLineHeight, measureLabelWidth } from '../core/text';
import { SYMBOL_DEFS } from '../symbols/defs';
import { FIELD_ROLE, type FieldRole } from '../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../v2/renderer/MiniBlockRmuRenderer';
import {
  formatTransformerRatedPower,
  type StationOnRunRendererProps,
} from '../../v2/renderer/StationOnRunRenderer';
import { bayApparatusDesignation } from '../compose/directions';

const LABEL_LINE_HEIGHT_T1 = labelLineHeight('t1');
const LABEL_LINE_HEIGHT_T2 = labelLineHeight('t2');
const LABEL_LINE_HEIGHT_T3 = labelLineHeight('t3');
const LABEL_LINE_HEIGHT_T4 = labelLineHeight('t4');

/** FIX-5 (recenzja F2): `snapUp` mieszka teraz w `core/grid.ts` (obok
 *  `snapToGrid`) — re-eksport tutaj, żeby nie łamać istniejących importów
 *  (`columns.ts`, testy) odwołujących się do `./measure`. */
export { snapUp } from '../core/grid';

/**
 * Podzbiór semantyczny stacji potrzebny do pomiaru (spec §4 pasmo NAZW,
 * §5.1). Pola `id`/`name`/`stationCode`/`transformerRatedKva` pochodzą
 * WPROST z `StationOnRunRendererProps` (v2, `Pick`) — bez x/y (geometria
 * slotowa PITCH, patrz UWAGA na górze pliku).
 */
export interface StationMeasureInput
  extends Pick<StationOnRunRendererProps, 'id' | 'name' | 'stationCode' | 'transformerRatedKva'> {
  /** Typ stacji wg §9 nomenklatury (np. „stacja przelotowa") — slot t4.
   *  Pole WŁASNE v3: `StationOnRunRendererProps` (v2) NIE MA odpowiednika —
   *  to nie jest podzbiór v2, to rozszerzenie specyficzne dla pomiaru V3. */
  readonly stationTypeLabel?: string | null;
  readonly snBays: readonly MiniBlockBayDescriptor[];
  /** Podpisy kierunku pola (spec §9: `kier. S03` / `odg. S15`), index-aligned
   *  do `snBays`. Pole WŁASNE v3 (bez odpowiednika w `StationOnRunRendererProps`).
   *  F5 dostarczy realne wartości z topologii `line_runs`; nieobecność (dziś,
   *  przed F5) oznacza brak rezerwacji miejsca na ten podpis — nie ukryty
   *  dług, tylko jeszcze niedostarczone wejście (FIX-3, recenzja F2). */
  readonly bayDirectionCaptions?: readonly (string | null)[];
  /** F6e: indeks pola, do którego Z GÓRY wchodzi pion zejścia lateralnego
   *  (stacja 0 lateralu, pole „poprzednik" §9) — jego podpis kierunku musi
   *  zmieścić się W CAŁOŚCI na prawo od pionu (wycinek B2 zaczyna się za
   *  osią stosu + prześwit), więc kolumna rezerwuje dodatkowo
   *  `entryDescentCaptionInset`. Nieobecny/null = zwykła stacja (magistrala,
   *  dalsze stacje lateralu) — zero zmian względem stanu sprzed F6e. */
  readonly entryDescentBayIndex?: number | null;
}

/** FIX-2 (recenzja F2): re-eksport formatera mocy TR z `StationOnRunRenderer`
 *  (v2) — JEDNA prawda. Pomiar szerokości etykiety MUSI używać dokładnie tej
 *  samej funkcji, którą renderer rysuje, inaczej rezerwacja miejsca i realny
 *  tekst mogłyby się rozjechać przy zmianie formatu w jednym miejscu. */
export { formatTransformerRatedPower } from '../../v2/renderer/StationOnRunRenderer';

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
 *    (FIX-6, recenzja F2): DER jako pole w bloku stacji to dziś B4; relacja
 *    z pasmem B3 (DER przy magistrali, spec) do rozstrzygnięcia w F5 — NIE
 *    usuwać tej gałęzi bez decyzji kompozycji.
 *
 * FIX-3 (recenzja F2): to jest tylko gabaryt SYMBOLU aparatu — rezerwacja
 * szerokości kolumny pola w `stationBlockWidth` DOLICZA do tego jeszcze slot
 * na etykiety WŁASNE pola (oznacznik `bay.designation` i podpis kierunku
 * `bayDirectionCaptions`), zgodnie ze spec §5.1 „max(bbox, najszerszy slot
 * etykiet WŁASNYCH)" — rezerwacja jest teraz kompletna dla danych DOSTĘPNYCH
 * (podpisy kierunku wejdą, gdy F5 je dostarczy; brak wejścia dziś ≠ ukryty
 * dług, tylko jeszcze niedostarczone dane).
 *
 * EKSPORT (F5, `compose/station.ts`): kompozycja MUSI używać TEGO SAMEGO
 * gabarytu symbolu przy rozmieszczaniu aparatów w kolumnie pola, żeby bbox
 * kompozycji nigdy nie przekroczył rezerwacji measure — zero cienia modelu
 * (spec F5: „measure i compose MUSZĄ być spójne"). Gałęzie ról MUSZĄ
 * pozostać zsynchronizowane z `apparatusSymbolsForRole` w `compose/station.ts`
 * (test spójności w `compose/__tests__/station.test.ts` porównuje oba
 * niezależne wyliczenia).
 */
export function bayColumnFootprint(role: FieldRole): { readonly width: number; readonly height: number } {
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

/**
 * Szerokość wymagana kolumny pola `snBays[index]` (spec §5.1, FIX-3):
 * `max(footprint.width + GRID + szerokość_oznacznika, szerokość_podpisu_kierunku)`.
 *  - oznacznik aparatu (spec §4: „Q0/Q1/T1") = `bayApparatusDesignation`
 *    (`compose/directions.ts`, F6b — spłata długu §9: `bay.designation` bywa
 *    surowym tokenem roli „WE"/„WY"/„ODG", zastępowanym konwencją Q/T; ta
 *    funkcja NIGDY nie zwraca pustego stringa, więc sidecar jest ZAWSZE
 *    doliczany — patrz jej dokumentacja);
 *  - podpis kierunku = `bayDirectionCaptions?.[index]` (t3); gdy nieobecny
 *    lub pusty — wkład 0 (patrz nagłówek `bayColumnFootprint`).
 *
 * EKSPORT (F5, r7b): `compose/station.ts` używa TEJ SAMEJ funkcji do
 * rozmieszczania kolumn pól WEWNĄTRZ bloku stacji (prefix-sum identyczny z
 * `stationBlockWidth` niżej) — jedno źródło prawdy szerokości kolumny pola.
 * Przyjmuje CAŁE `snBays` (nie pojedynczy `bay`), bo `bayApparatusDesignation`
 * potrzebuje pozycji pola WŚRÓD pól tej samej kategorii (Q/T numeracja) —
 * zero cienia względem `compose/station.ts`, które renderuje ten sam tekst.
 */
export function bayColumnRequiredWidth(
  snBays: readonly MiniBlockBayDescriptor[],
  index: number,
  bayDirectionCaptions: readonly (string | null)[] | undefined,
  entryDescentBayIndex?: number | null,
): number {
  const bay = snBays[index];
  const footprint = bayColumnFootprint(bay.fieldRole);
  const designation = bayApparatusDesignation(snBays, index);
  const widthWithSidecar = designation
    ? footprint.width + GRID + measureLabelWidth(designation, 't3')
    : footprint.width;

  const caption = bayDirectionCaptions?.[index]?.trim();
  // F6e: pole z pionem zejścia z góry (patrz `StationMeasureInput.
  // entryDescentBayIndex`) — podpis kierunku musi zmieścić się na PRAWO od
  // osi stosu (wycinek B2 przycięty w `compose/station.ts` TĄ SAMĄ stałą
  // `entryDescentCaptionInset` — jedna prawda, wzór F6b-1).
  const captionInset = index === entryDescentBayIndex ? entryDescentCaptionInset(bay.fieldRole) : 0;
  const captionWidth = caption ? measureLabelWidth(caption, 't3') + captionInset : 0;

  return Math.max(widthWithSidecar, captionWidth);
}

/**
 * F6e: odsunięcie LEWEJ krawędzi wycinka podpisu kierunku (B2) od lewej
 * krawędzi kolumny pola, gdy do pola wchodzi Z GÓRY pion zejścia lateralnego:
 * oś pionu = oś stosu aparatów (stos flush-left w kolumnie ⇒ oś na
 * `footprint.width/2` od lewej), a wycinek ma zaczynać się ZA pionem z
 * prześwitem GRID. `snapUp` osi — lewa krawędź slotu na siatce (spec §2)
 * i nigdy na lewo od pionu. Używane w DWÓCH miejscach, które MUSZĄ się
 * zgadzać: rezerwacja szerokości (`bayColumnRequiredWidth` wyżej) i pozycja
 * wycinka (`compose/station.ts`).
 */
export function entryDescentCaptionInset(role: FieldRole): number {
  return snapUp(bayColumnFootprint(role).width / 2) + GRID;
}

/** Margines stały bloku stacji: prześwit na szynę SN (nad kolumnami) i szynę
 *  nN (pod kolumnami) — spec §3 "szyna SN + kolumny pól + TR + szyna nN". */
const STATION_BLOCK_BUS_CLEARANCE = 2 * GRID;

/** Szerokość bloku stacji z liczby pól: suma szerokości kolumn (z rezerwacją
 *  etykiet własnych, FIX-3) + odstępy GRID między kolumnami (spec §5.1,
 *  §5.3 "blok stacji z liczby pól").
 *
 * EKSPORT (F5, r7b): `columns.ts` (`ColumnResult.tapX` — zaczep magistrali =
 * środek BLOKU, nie środek całej, być może szerszej, kolumny) i
 * `compose/station.ts` (lewa krawędź bloku = `tapX - blockWidth/2`) MUSZĄ
 * używać dokładnie TEJ SAMEJ liczby — jedno źródło prawdy geometrii bloku. */
export function stationBlockWidth(
  snBays: readonly MiniBlockBayDescriptor[],
  bayDirectionCaptions: readonly (string | null)[] | undefined,
  entryDescentBayIndex?: number | null,
): number {
  if (snBays.length === 0) return 0;
  const columnsWidth = snBays.reduce(
    (sum, _bay, index) => sum + bayColumnRequiredWidth(snBays, index, bayDirectionCaptions, entryDescentBayIndex),
    0,
  );
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
  const blockWidth = stationBlockWidth(station.snBays, station.bayDirectionCaptions, station.entryDescentBayIndex);

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

/**
 * F6e (REBUILD_PLAN_V3 — residuum §11.1 `port-caption`): odstęp między DOLNĄ
 * krawędzią podpisu kierunku pola a osią magistrali (`busAxisY`,
 * `scene/buildScene.ts`). Bez niego `primaryRect` (`compose/station.ts`)
 * kończył się DOKŁADNIE na osi — zejście WŁASNEGO pola zaczyna się na osi i
 * idzie w dół, a sonda kolizji etykieta↔przewód (`labelWireCollisions`,
 * `scene/buildScene.ts`) traktuje odcinek jako prostokąt ±1px wokół osi, więc
 * dolny rząd pikseli podpisu zawsze nachodził na to zejście (i na samą oś).
 * Rezerwacja wysokości (ta funkcja) i pozycja `primaryRect` (`compose/
 * station.ts`) MUSZĄ liczyć tę samą stałą — jedna prawda, jak przy
 * `bayColumnRequiredWidth`/`compose/station.ts` (F6b-1).
 */
export const PORT_CAPTION_BUS_CLEARANCE = GRID;

/**
 * Wysokość dodatkowa pasma osi magistrali (B2, spec §5.2) na podpis
 * kierunku pola (t3, spec §9: „kier. Sxx" / „odg. Sxx") — F3 fix r1 (dług
 * zapisany w F2/recenzji Opusa): B2 była stałą 32px niezależną od treści,
 * choć podpisy portów muszą się w niej zmieścić. Zero, gdy ŻADNE pole tej
 * stacji nie ma podpisu kierunku (bez regresji względem stałej geometrii
 * osi/portu — `bands.ts` `BUS_AXIS_BAND_HEIGHT` — gdy podpisów brak).
 * F6e: doliczony `PORT_CAPTION_BUS_CLEARANCE` — sam wiersz t3 (`LABEL_LINE_
 * HEIGHT_T3`) rezerwował miejsce TYLKO na tekst, zero prześwitu do osi.
 */
export function stationPortCaptionHeight(station: StationMeasureInput): number {
  const hasCaption = (station.bayDirectionCaptions ?? []).some((caption) => caption?.trim());
  return hasCaption ? LABEL_LINE_HEIGHT_T3 + PORT_CAPTION_BUS_CLEARANCE : 0;
}
