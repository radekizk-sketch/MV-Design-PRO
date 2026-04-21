import { describe, expect, it } from 'vitest';

import {
  FUNCTION_CODE_LABELS_PL,
  PROTECTION_DEVICE_KIND_LABELS,
  SANITY_CHECK_CODE_LABELS_PL,
  SEVERITY_LABELS_PL,
  SETPOINT_BASIS_LABELS_PL,
  SETPOINT_OPERATOR_LABELS_PL,
} from '..';
import {
  OC_CHARACTERISTIC_LABELS_PL,
  VERIFICATION_STATUS_LABELS_PL,
} from '../../sld/protection';

describe('protection polish labels', () => {
  it('keeps canonical device labels with Polish diacritics', () => {
    expect(PROTECTION_DEVICE_KIND_LABELS.RELAY_OVERCURRENT).toBe(
      'Przekaźnik nadprądowy',
    );
    expect(PROTECTION_DEVICE_KIND_LABELS.RELAY_DISTANCE).toBe(
      'Przekaźnik odległościowy',
    );
    expect(PROTECTION_DEVICE_KIND_LABELS.RELAY_DIFFERENTIAL).toBe(
      'Przekaźnik różnicowy',
    );
  });

  it('keeps protection function labels with Polish diacritics', () => {
    expect(FUNCTION_CODE_LABELS_PL.OVERCURRENT_TIME).toBe(
      'Nadprądowa czasowa (I>)',
    );
    expect(FUNCTION_CODE_LABELS_PL.UNDERVOLTAGE).toBe('Podnapięciowa (U<)');
    expect(FUNCTION_CODE_LABELS_PL.OVERVOLTAGE).toBe('Nadnapięciowa (U>)');
  });

  it('keeps setpoint labels with Polish diacritics', () => {
    expect(SETPOINT_BASIS_LABELS_PL.IN).toBe('Prąd znamionowy (In)');
    expect(SETPOINT_BASIS_LABELS_PL.UN).toBe('Napięcie znamionowe (Un)');
    expect(SETPOINT_OPERATOR_LABELS_PL.GT).toBe('większy niż (>)');
    expect(SETPOINT_OPERATOR_LABELS_PL.LE).toBe('mniejszy lub równy (<=)');
  });

  it('keeps sanity-check labels with Polish diacritics', () => {
    expect(SEVERITY_LABELS_PL.ERROR).toBe('Błąd');
    expect(SEVERITY_LABELS_PL.WARN).toBe('Ostrzeżenie');
    expect(SANITY_CHECK_CODE_LABELS_PL.OC_MISSING_IN).toBe(
      'Brak wartości In dla nastawy prądowej',
    );
    expect(SANITY_CHECK_CODE_LABELS_PL.GEN_PARTIAL_ANALYSIS).toBe(
      'Brak danych bazowych — analiza częściowa',
    );
  });

  it('keeps SLD protection labels with Polish diacritics', () => {
    expect(VERIFICATION_STATUS_LABELS_PL.SPELNIONE).toBe('Spełnione');
    expect(VERIFICATION_STATUS_LABELS_PL.NIESPELNIONE).toBe('Niespełnione');
    expect(OC_CHARACTERISTIC_LABELS_PL.DT).toBe('Stałoczasowa');
    expect(OC_CHARACTERISTIC_LABELS_PL.LTI).toBe('Długoczasowa odwrotna (LTI)');
  });
});
