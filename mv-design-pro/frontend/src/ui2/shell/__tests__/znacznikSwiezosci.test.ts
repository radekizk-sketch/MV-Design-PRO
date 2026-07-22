/*
 * Testy czystego helpera znacznika świeżości (karta K4/D1) — fixture'ami,
 * bez Reacta. Pilnują też spójności etykiet powłoki ze STATUS_WYNIKOW_LABEL
 * (brak/aktualne/nieaktualne — §0 karty K4).
 */

import { describe, it, expect } from 'vitest';
import { znacznikSwiezosci } from '../znacznikSwiezosci';
import { SHELL_STRINGS } from '../strings';
import { STATUS_WYNIKOW_LABEL } from '../../spaces/projekt/strings';
import { studyCaseFixture } from '../../spaces/obliczenia/__tests__/fixtures';
import type { StudyCaseResultStatus } from '../../../ui/study-cases/types';

function przypadek(status: StudyCaseResultStatus, resultsValid = status === 'FRESH') {
  return studyCaseFixture('K-1', 'Zwarcia maks.', {
    result_status: status,
    results_valid: resultsValid,
    is_active: true,
  });
}

describe('znacznikSwiezosci — mapowanie StudyCase|null na model znacznika', () => {
  it('null (brak aktywnego przypadku) → NONE, „Wyniki: brak", bez akcji', () => {
    const model = znacznikSwiezosci(null);
    expect(model.status).toBe('NONE');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsNone);
    expect(model.klikalny).toBe(false);
  });

  it('NONE → „Wyniki: brak", bez akcji', () => {
    const model = znacznikSwiezosci(przypadek('NONE'));
    expect(model.status).toBe('NONE');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsNone);
    expect(model.klikalny).toBe(false);
  });

  it('FRESH (results_valid=true) → „Wyniki: aktualne", bez akcji', () => {
    const model = znacznikSwiezosci(przypadek('FRESH'));
    expect(model.status).toBe('FRESH');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsFresh);
    expect(model.klikalny).toBe(false);
  });

  it('OUTDATED → „Wyniki: nieaktualne", klikalny', () => {
    const model = znacznikSwiezosci(przypadek('OUTDATED'));
    expect(model.status).toBe('OUTDATED');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsOutdated);
    expect(model.klikalny).toBe(true);
  });

  it('niespójna para FRESH + results_valid=false → traktowana jako nieaktualne', () => {
    const model = znacznikSwiezosci(przypadek('FRESH', false));
    expect(model.status).toBe('OUTDATED');
    expect(model.klikalny).toBe(true);
  });

  it('etykiety powłoki są spójne ze STATUS_WYNIKOW_LABEL (brak/aktualne/nieaktualne)', () => {
    const statusy: StudyCaseResultStatus[] = ['NONE', 'FRESH', 'OUTDATED'];
    for (const status of statusy) {
      const model = znacznikSwiezosci(przypadek(status));
      expect(model.etykieta).toBe(`Wyniki: ${STATUS_WYNIKOW_LABEL[model.status]}`);
    }
  });
});
