/**
 * Aparaty pola baterii kondensatorów (BKR) — lustro sekcji BKR listy rodzajów aparatury
 * backendu `network_model/catalog/rodzaje_aparatury.py` (karta UX-04/POLE-BKR-MODEL; równość
 * przypina `backend/tests/ci/test_parytet_rodzajow_aparatow_pola_bkr.py`).
 *
 * ENEA Operator, Stacje 110 kV, Zeszyt 1, §17 s. 32 i Zał. 16: przekładnik prądowy
 * niezrównoważenia obejmuje połączenie między punktami gwiazd baterii (port `obwod`),
 * a przekładnik napięciowy międzyfazowy ma dwa zaciski pierwotne A i B (PN-EN 61869-3).
 */

import type { BayPrimaryDeviceKind } from '../../../../types/enm';

export const RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA = 'UNBALANCE_CT' satisfies BayPrimaryDeviceKind;
export const RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO = 'PHASE_TO_PHASE_VT' satisfies BayPrimaryDeviceKind;

/** Porty aparatów pola BKR wg rodzaju — kolejność stała (lustro `PORTY_APARATOW_POLA_BKR`). */
export const PORTY_APARATOW_POLA_BKR: Readonly<Record<string, readonly string[]>> = {
  UNBALANCE_CT: ['obwod'],
  PHASE_TO_PHASE_VT: ['A', 'B'],
};

/** Liczba przekładników międzyfazowych rozładowujących baterię (Zeszyt 1 §17 s. 32). */
export const LICZBA_PRZEKLADNIKOW_ROZLADOWCZYCH_BATERII = 2;
