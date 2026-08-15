/*
 * Testy czystego helpera znacznika świeżości (karta K4/D1 + dług V12K-309 poz. 2)
 * — fixture'ami, bez Reacta. Pilnują też spójności etykiet powłoki ze
 * STATUS_WYNIKOW_LABEL (brak/aktualne/nieaktualne — §0 karty K4).
 *
 * ILOCZYN CECH, nie przykład z karty. Defekt („Wyniki: aktualne" przy modelu
 * nowszym od wyniku) mógł się schować w KAŻDEJ kombinacji trzech niezależnych
 * cech, więc przechodzimy je krzyżowo:
 *   status serwerowy   × { NONE, FRESH, OUTDATED, FRESH+results_valid=false }
 *   rewizja wyniku     × { starsza, równa, nowsza, nieznana }
 *   rewizja modelu     × { znana, nieznana }
 * Pomiar audytu (model rew. 9, wynik z rew. 8) jest JEDNĄ komórką tej tabeli.
 */

import { describe, it, expect } from 'vitest';
import { znacznikSwiezosci, type RewizjeSwiezosci } from '../znacznikSwiezosci';
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

/** Rewizje zgodne — wynik policzony na bieżącym modelu. */
const ZGODNE: RewizjeSwiezosci = { rewizjaWyniku: 9, rewizjaModelu: 9 };
/** Pomiar audytu V12K-309 poz. 2: model pojechał dalej niż wynik. */
const MODEL_NOWSZY: RewizjeSwiezosci = { rewizjaWyniku: 8, rewizjaModelu: 9 };
const BEZ_REWIZJI_WYNIKU: RewizjeSwiezosci = { rewizjaWyniku: null, rewizjaModelu: 9 };
const BEZ_REWIZJI_MODELU: RewizjeSwiezosci = { rewizjaWyniku: 8, rewizjaModelu: null };

describe('znacznikSwiezosci — mapowanie StudyCase|null + para rewizji na model znacznika', () => {
  it('null (brak aktywnego przypadku) → NONE, „Wyniki: brak", bez akcji', () => {
    const model = znacznikSwiezosci(null, ZGODNE);
    expect(model.status).toBe('NONE');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsNone);
    expect(model.klikalny).toBe(false);
  });

  it('NONE → „Wyniki: brak", bez akcji (nie ma czego porównywać)', () => {
    const model = znacznikSwiezosci(przypadek('NONE'), MODEL_NOWSZY);
    expect(model.status).toBe('NONE');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsNone);
    expect(model.klikalny).toBe(false);
  });

  it('FRESH + rewizje ZGODNE → „Wyniki: aktualne", bez akcji', () => {
    const model = znacznikSwiezosci(przypadek('FRESH'), ZGODNE);
    expect(model.status).toBe('FRESH');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsFresh);
    expect(model.klikalny).toBe(false);
  });

  it('OUTDATED (serwer) → „Wyniki: nieaktualne", klikalny — nawet przy zgodnych rewizjach', () => {
    const model = znacznikSwiezosci(przypadek('OUTDATED'), ZGODNE);
    expect(model.status).toBe('OUTDATED');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsOutdated);
    expect(model.klikalny).toBe(true);
  });

  it('niespójna para FRESH + results_valid=false → traktowana jako nieaktualne', () => {
    const model = znacznikSwiezosci(przypadek('FRESH', false), ZGODNE);
    expect(model.status).toBe('OUTDATED');
    expect(model.klikalny).toBe(true);
  });
});

describe('świeżość liczona PORÓWNANIEM REWIZJI, nie samym statusem serwera (V12K-309 poz. 2)', () => {
  it('POMIAR AUDYTU: model rew. 9, wynik z rew. 8, serwer FRESH → „nieaktualne"', () => {
    const model = znacznikSwiezosci(przypadek('FRESH'), MODEL_NOWSZY);
    expect(model.status).toBe('OUTDATED');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsOutdated);
    // Kanon: zmiana modelu unieważnia wyniki przypadku ⇒ jest dokąd pójść.
    expect(model.klikalny).toBe(true);
  });

  it('rewizje równe → „aktualne"; różnica JEDNEJ rewizji już wywraca werdykt', () => {
    expect(znacznikSwiezosci(przypadek('FRESH'), { rewizjaWyniku: 4, rewizjaModelu: 4 }).status)
      .toBe('FRESH');
    expect(znacznikSwiezosci(przypadek('FRESH'), { rewizjaWyniku: 3, rewizjaModelu: 4 }).status)
      .toBe('OUTDATED');
  });

  it('brak rewizji WYNIKU → „nieustalone", NIGDY „aktualne" (brak kontraktu)', () => {
    const model = znacznikSwiezosci(przypadek('FRESH'), BEZ_REWIZJI_WYNIKU);
    expect(model.status).toBe('NIEUSTALONE');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsUnknown);
    expect(model.etykieta).not.toBe(SHELL_STRINGS.resultsFresh);
    expect(model.klikalny).toBe(false);
  });

  it('brak rewizji MODELU → „nieustalone" (druga strona porównania też jest wymagana)', () => {
    const model = znacznikSwiezosci(przypadek('FRESH'), BEZ_REWIZJI_MODELU);
    expect(model.status).toBe('NIEUSTALONE');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsUnknown);
  });

  it('stan bez wyniku NIE przechodzi w „nieustalone" mimo braku rewizji', () => {
    // NONE opisuje brak wyniku, a nie nierozstrzygniętą świeżość — inaczej
    // świeży projekt bez obliczeń straszyłby „nieustalone".
    expect(znacznikSwiezosci(przypadek('NONE'), BEZ_REWIZJI_WYNIKU).status).toBe('NONE');
    expect(znacznikSwiezosci(null, BEZ_REWIZJI_WYNIKU).status).toBe('NONE');
  });

  it('serwerowy OUTDATED zostaje OUTDATED także bez rewizji (brak fałszywego „nie wiem")', () => {
    expect(znacznikSwiezosci(przypadek('OUTDATED'), BEZ_REWIZJI_WYNIKU).status).toBe('OUTDATED');
    expect(znacznikSwiezosci(przypadek('FRESH', false), BEZ_REWIZJI_WYNIKU).status).toBe('OUTDATED');
  });

  it('ILOCZYN CECH: żadna kombinacja nie daje „aktualne" przy modelu nowszym od wyniku', () => {
    const statusy: Array<[StudyCaseResultStatus, boolean]> = [
      ['NONE', false],
      ['FRESH', true],
      ['FRESH', false],
      ['OUTDATED', false],
    ];
    const rewizje: RewizjeSwiezosci[] = [
      MODEL_NOWSZY,
      { rewizjaWyniku: 0, rewizjaModelu: 12 },
      { rewizjaWyniku: 11, rewizjaModelu: 12 },
    ];

    for (const [status, valid] of statusy) {
      for (const para of rewizje) {
        const model = znacznikSwiezosci(przypadek(status, valid), para);
        expect(model.status).not.toBe('FRESH');
        expect(model.etykieta).not.toBe(SHELL_STRINGS.resultsFresh);
      }
    }
  });
});

describe('spójność etykiet chromu', () => {
  it('etykiety powłoki są spójne ze STATUS_WYNIKOW_LABEL (brak/aktualne/nieaktualne)', () => {
    const statusy: StudyCaseResultStatus[] = ['NONE', 'FRESH', 'OUTDATED'];
    for (const status of statusy) {
      const model = znacznikSwiezosci(przypadek(status), ZGODNE);
      // Przy rewizjach zgodnych status chromu = status serwerowy 1:1.
      expect(model.status).toBe(status);
      expect(model.etykieta).toBe(`Wyniki: ${STATUS_WYNIKOW_LABEL[status]}`);
    }
  });

  it('„nieustalone" jest stanem WYŁĄCZNIE chromu — nie ma go w słowniku serwerowym', () => {
    expect(Object.keys(STATUS_WYNIKOW_LABEL)).not.toContain('NIEUSTALONE');
    expect(SHELL_STRINGS.resultsUnknown.startsWith('Wyniki: ')).toBe(true);
  });
});
