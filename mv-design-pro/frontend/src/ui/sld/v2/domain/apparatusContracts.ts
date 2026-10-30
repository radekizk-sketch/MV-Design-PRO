/**
 * SLD — porządek aparatów pola i kanoniczne role pól.
 *
 * Rodzaj aparatu pola na kanwie to `SymbolId` biblioteki symboli v3
 * (`v3/symbols/defs.ts`; mapowanie z ENM `BayPrimaryDeviceKind` —
 * `v3/compose/apparatusSequence.ts::symbolIdForPrimaryDeviceKind`, tożsamość aparatu
 * `${bayRef}#${SymbolId}` — `shared/identyfikatorAparatu.ts`). Dawny słownik
 * `ApparatusKind` (snake_case, 12 typów) z etykietami i instancją aparatu nie miał
 * żadnego konsumenta poza własnym testem — skasowany jako trzeci, martwy słownik
 * rodzajów aparatu.
 */

import type { BayPrimaryPlacement } from '../../../../types/enm';

// =============================================================================
// 0. Porządek fizyczny aparatów pola wg `placement` (jedno źródło prawdy)
// =============================================================================

/**
 * Kolejność położeń aparatu pola: tor szeregowy od szyny (UPSTREAM →
 * MIDSTREAM → DOWNSTREAM), potem aparaty boczne (OFF_PATH, GROUND_BRANCH).
 *
 * W2C-PLAN-ETYKIET (reguła KLASA §3 „predykaty parami"): porządek ustalał
 * dotąd WYŁĄCZNIE adapter (`v2/canvas/enmToSldAdapter.ts`
 * `projectBayPrimaryDevices`), a kompozycja SLD v3 (`compose/apparatusSequence.ts`,
 * `compose/station.ts`) jedynie ZAKŁADAŁA w komentarzu, że dostaje sekwencję
 * już posortowaną. Sekwencja niesortowana (kolejność surowa backendu
 * [DS, CB, CT, VT, DS, ES, SA, głowica]) rozkładała aparaty boczne na RÓŻNE
 * kotwice toru, a te dzieliły jedną kolumnę X — identyfikator „TV1" spod
 * przekładnika lądował wtedy na symbolu uziemnika. Obie strony pary czytają
 * teraz TĘ funkcję, więc kolejność nie zależy od tego, kto zbudował deskryptor.
 */
export const PRIMARY_DEVICE_PLACEMENT_ORDER: Readonly<Record<BayPrimaryPlacement, number>> = {
  UPSTREAM: 0,
  MIDSTREAM: 1,
  DOWNSTREAM: 2,
  OFF_PATH: 3,
  GROUND_BRANCH: 4,
};

/**
 * Aparaty pola posortowane wg `placement` (`PRIMARY_DEVICE_PLACEMENT_ORDER`)
 * ze stabilnym rozstrzygnięciem remisu = kolejność źródłowa. Funkcja czysta,
 * idempotentna (sekwencja już posortowana wraca w tej samej kolejności).
 */
export function orderByPrimaryPlacement<T extends { readonly placement: BayPrimaryPlacement }>(
  devices: readonly T[],
): T[] {
  return devices
    .map((device, sourceIndex) => ({ device, sourceIndex }))
    .sort((a, b) => {
      const placementDelta =
        PRIMARY_DEVICE_PLACEMENT_ORDER[a.device.placement] - PRIMARY_DEVICE_PLACEMENT_ORDER[b.device.placement];
      return placementDelta !== 0 ? placementDelta : a.sourceIndex - b.sourceIndex;
    })
    .map(({ device }) => device);
}

// =============================================================================
// 1. FieldRole — kanoniczne role pól (mirror ENM)
// =============================================================================

/**
 * Rola pola rozdzielczego.
 *
 * Mirror `BayCanonicalRole` z ENM, ale wykluczamy DER role (`PV_SN`, `BESS_SN`,
 * `FW_SN`) bo DER ma własny renderer. Plus `GPZ_LINE_BAY` jako podtyp
 * `LINIA_OUT` dla GPZ-specific renderingu.
 */
export const FIELD_ROLE = {
  LINE_IN: 'LINE_IN',
  LINE_OUT: 'LINE_OUT',
  LINE_BRANCH: 'LINE_BRANCH',
  TRANSFORMER: 'TRANSFORMER',
  COUPLER: 'COUPLER',
  MEASUREMENT: 'MEASUREMENT',
  GPZ_LINE_BAY: 'GPZ_LINE_BAY',
  RMU_LINE: 'RMU_LINE',
  RMU_TRANSFORMER: 'RMU_TRANSFORMER',
  DER_PV: 'DER_PV',
  DER_BESS: 'DER_BESS',
  DER_FW: 'DER_FW',
  /** Pole źródłowe, którego rodzaju źródła model nie rozstrzyga (rola `OZE` bez
   *  przyłączonego wytwórcy albo z wytwórcami różnych rodzajów) — jawny symbol źródła
   *  nieokreślonego, nigdy PV z domysłu (karta GPZ-PARYTET cz. 2, pkt 3). */
  DER_UNKNOWN: 'DER_UNKNOWN',
  /** Pole baterii kondensatorów równoległych SN (rola modelu `BKR`, kanoniczna
   *  `BATERIA_KONDENSATOROW`; ENEA Operator, Stacje 110 kV, Zeszyt 1 §13 s. 23 i Zał. 16).
   *  Do karty UX-04/POLE-BKR-MODEL adapter stacji zamieniał `BKR` po cichu na pole
   *  odgałęźne, a adapter GPZ — na pole liniowe odpływowe (dobór feedera sieci). */
  CAPACITOR_BANK: 'CAPACITOR_BANK',
} as const;

export type FieldRole = (typeof FIELD_ROLE)[keyof typeof FIELD_ROLE];

export const ALL_FIELD_ROLES: readonly FieldRole[] = Object.values(FIELD_ROLE);
