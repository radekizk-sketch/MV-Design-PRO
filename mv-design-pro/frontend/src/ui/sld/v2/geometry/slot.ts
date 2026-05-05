/**
 * SLD v2 Slot system — kanoniczna alokacja pozycji hierarchicznych (PR-5).
 *
 * Zastępuje generyczne phase4-coordinates.ts. Pozycja obiektu wynika z jego
 * miejsca w hierarchii (GPZ → Sekcja → Pole → Aparat / Ciąg → Stacja → DER),
 * NIE z minimalizacji skrzyżowań.
 */

import {
  BAY_WIDTH_PX,
  BRANCH_DROP_PX,
  DER_DROP_PX,
  DER_OFFSET_X_PX,
  DEVICE_OFFSET_TOP_PX,
  DEVICE_PITCH_PX,
  RUN_CHANNEL_PITCH_PX,
  SECTION_WIDTH_PX,
  STATION_PITCH_PX,
  X_GPZ_LEFT_PX,
  Y_BUSBAR_PX,
  Y_GPZ_TOP_PX,
  Y_RUN_START_PX,
  snapToGrid,
} from '../theme/tokens';

export interface Slot {
  readonly x: number;
  readonly y: number;
}

/** Slot dla GPZ (pojedynczy w projekcie, zawsze top-left). */
export function gpzSlot(): Slot {
  return { x: snapToGrid(X_GPZ_LEFT_PX), y: snapToGrid(Y_GPZ_TOP_PX) };
}

/**
 * Slot dla sekcji rozdzielni SN GPZ.
 *
 * `sectionIndex` 0-based. Sekcje pozycjonowane horyzontalnie wewnątrz GPZ.
 */
export function sectionSlot(sectionIndex: number): Slot {
  return {
    x: snapToGrid(X_GPZ_LEFT_PX + sectionIndex * SECTION_WIDTH_PX),
    y: snapToGrid(Y_BUSBAR_PX),
  };
}

/**
 * Slot dla pola SN w sekcji.
 *
 * `sectionIndex` 0-based, `bayIndex` 0-based wewnątrz sekcji.
 * Pola pozycjonowane horyzontalnie wewnątrz sekcji.
 */
export function bayHeadSlot(sectionIndex: number, bayIndex: number): Slot {
  const sectionX = X_GPZ_LEFT_PX + sectionIndex * SECTION_WIDTH_PX;
  return {
    x: snapToGrid(sectionX + bayIndex * BAY_WIDTH_PX),
    y: snapToGrid(Y_BUSBAR_PX),
  };
}

/**
 * Slot dla aparatu w polu.
 *
 * `devicePosition` 0-based kanoniczna pozycja w polu (0 = górny aparat tuż pod szyną).
 * Aparaty pozycjonowane wertykalnie pod szyną sekcji.
 */
export function deviceInBaySlot(
  sectionIndex: number,
  bayIndex: number,
  devicePosition: number,
): Slot {
  const head = bayHeadSlot(sectionIndex, bayIndex);
  return {
    x: head.x,
    y: snapToGrid(Y_BUSBAR_PX + DEVICE_OFFSET_TOP_PX + devicePosition * DEVICE_PITCH_PX),
  };
}

/**
 * Slot dla ciągu liniowego (kanał Y).
 *
 * `runIndex` 0-based — każdy ciąg ma swój kanał.
 * Ciągi pozycjonowane horyzontalnie od pola GPZ w prawo.
 */
export function runChannelY(runIndex: number): number {
  return snapToGrid(Y_RUN_START_PX + runIndex * RUN_CHANNEL_PITCH_PX);
}

/**
 * Slot dla stacji na ciągu.
 *
 * `runIndex` 0-based — kanał ciągu macierzystego.
 * `stationIndex` 0-based — kolejność wzdłuż X.
 */
export function stationOnRunSlot(
  runIndex: number,
  stationIndex: number,
): Slot {
  return {
    x: snapToGrid(X_GPZ_LEFT_PX + SECTION_WIDTH_PX + stationIndex * STATION_PITCH_PX),
    y: runChannelY(runIndex),
  };
}

/**
 * Slot dla odgałęzienia (sub-run podporządkowany ciągowi macierzystemu).
 *
 * `parentRunIndex` — kanał ciągu macierzystego.
 * `branchIndex` 0-based — kolejność odgałęzień.
 * `originStationIndex` — pozycja stacji macierzystej skąd wychodzi odgałęzienie.
 */
export function branchRunSlot(
  parentRunIndex: number,
  branchIndex: number,
  originStationIndex: number,
  segmentIndex: number,
): Slot {
  return {
    x: snapToGrid(
      X_GPZ_LEFT_PX
        + SECTION_WIDTH_PX
        + originStationIndex * STATION_PITCH_PX
        + (segmentIndex + 1) * STATION_PITCH_PX,
    ),
    y: snapToGrid(runChannelY(parentRunIndex) + (branchIndex + 1) * BRANCH_DROP_PX),
  };
}

/**
 * Slot dla DER (PV/BESS/FW) przy stacji macierzystej.
 *
 * Pozycjonuje DER po boku stacji (X+offset) i poniżej kanału ciągu (Y+drop).
 */
export function derAttachmentSlot(
  runIndex: number,
  parentStationIndex: number,
): Slot {
  return {
    x: snapToGrid(
      X_GPZ_LEFT_PX
        + SECTION_WIDTH_PX
        + parentStationIndex * STATION_PITCH_PX
        + DER_OFFSET_X_PX,
    ),
    y: snapToGrid(runChannelY(runIndex) + DER_DROP_PX),
  };
}

/**
 * Slot dla pola SN w wewnętrznym SLD stacji (PR-6 internal view).
 *
 * Stacje wewnętrzne mają własną hierarchię: bay-head → busbar → devices.
 */
export function internalBayHeadSlot(stationOriginX: number, stationOriginY: number, bayIndex: number): Slot {
  return {
    x: snapToGrid(stationOriginX + bayIndex * BAY_WIDTH_PX),
    y: snapToGrid(stationOriginY + Y_BUSBAR_PX),
  };
}

/* Inwarianty słotów (BINDING):
 *  1. Wszystkie X i Y są wielokrotnościami GRID_BASE_PX (snapToGrid wewnątrz każdego slotu).
 *  2. Slot dla danej krotki (sectionIndex, bayIndex, ...) jest stały — przy ponownym wywołaniu
 *     z tymi samymi argumentami zwraca identyczne {x, y} (deterministyczne).
 *  3. Sloty NIE zależą od liczby innych obiektów w hierarchii — przyrostowość jest
 *     gwarantowana przez fakt że dodanie nowego obiektu w slocie (sectionIndex, ...)
 *     nie zmienia slotów istniejących obiektów.
 */
