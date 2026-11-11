// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { CANONICAL_OPERATION_NAMES } from '../../../types/domainOps';
import {
  OPERATION_SUCCESS_MESSAGES,
  SILENT_OPERATIONS,
  getOperationSuccessMessage,
} from '../operationSuccessMessages';

/**
 * Każda operacja kanoniczna (poza cichymi) ma WŁASNE potwierdzenie sukcesu — komunikat
 * zastępczy „Operacja zakończona powodzeniem" nie mówi projektantowi, CO się zmieniło
 * (V12K-263). Dopisanie operacji do `CANONICAL_OPERATION_NAMES` bez komunikatu czerwieni
 * ten test (pomiar W5-E-TTIT: `add_nn_rcd` nie miał komunikatu).
 */
describe('operationSuccessMessages — kompletność względem operacji kanonicznych', () => {
  it('każda niecicha operacja kanoniczna ma własny komunikat sukcesu', () => {
    const brakujace = CANONICAL_OPERATION_NAMES.filter(
      (op) => !SILENT_OPERATIONS.has(op) && !(op in OPERATION_SUCCESS_MESSAGES),
    );
    expect(brakujace).toEqual([]);
  });

  it('add_nn_rcd: potwierdzenie nazywa wyłącznik różnicowoprądowy', () => {
    expect(getOperationSuccessMessage('add_nn_rcd')).toBe('Dodano wyłącznik różnicowoprądowy nN');
  });
});
