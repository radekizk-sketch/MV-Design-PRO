/**
 * SLD V2 — Kontrakty aparatów (Phase 0A).
 *
 * Migracja z V1 `src/ui/sld/core/fieldDeviceContracts.ts`. V2 trzyma
 * minimalny operator-grade kontrakt potrzebny do rendererów; pełen
 * walidator wymagań pól przeniesie się do osobnego modułu wraz z
 * Phase 1 (visual canon expansion).
 *
 * Reguła Acceptance Invariant nr 2: każdy element wizualny aparatu ma
 * `domain_ref` i `apparatus_kind` jest zwrotne do ENM `BayPrimaryDevice`.
 *
 * UX-04/POLE-LINIOWE-WZORZEC: dawna sekcja „ApparatusKind V2" (12 typów, etykiety,
 * mapowanie z `BayPrimaryDeviceKind`, `ApparatusInstance`) skasowana — miała wyłącznie
 * konsumentów testowych, a była drugą tablicą rodzajów aparatu, którą każdy nowy rodzaj
 * ENM musiałby rozszerzać bez skutku dla rysunku. Rodzaj aparatu na schemacie wyznacza
 * `v3/compose/apparatusSequence.ts symbolIdForPrimaryDeviceKind`.
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
// 2. FieldRole — kanoniczne role pól (mirror ENM)
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
} as const;

export type FieldRole = (typeof FIELD_ROLE)[keyof typeof FIELD_ROLE];

export const ALL_FIELD_ROLES: readonly FieldRole[] = Object.values(FIELD_ROLE);

/** Czy pole leży na torze SN. */
export function isSnFieldRole(role: FieldRole): boolean {
  return (
    role === FIELD_ROLE.LINE_IN ||
    role === FIELD_ROLE.LINE_OUT ||
    role === FIELD_ROLE.LINE_BRANCH ||
    role === FIELD_ROLE.TRANSFORMER ||
    role === FIELD_ROLE.COUPLER ||
    role === FIELD_ROLE.MEASUREMENT ||
    role === FIELD_ROLE.GPZ_LINE_BAY ||
    role === FIELD_ROLE.RMU_LINE ||
    role === FIELD_ROLE.RMU_TRANSFORMER ||
    role === FIELD_ROLE.DER_PV ||
    role === FIELD_ROLE.DER_BESS ||
    role === FIELD_ROLE.DER_FW ||
    role === FIELD_ROLE.DER_UNKNOWN
  );
}
