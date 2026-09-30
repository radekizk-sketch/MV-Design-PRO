/*
 * Testy czystego helpera znacznika świeżości (karta K4/D1) — fixture'ami, bez
 * Reacta. Pilnują też spójności etykiet powłoki ze STATUS_WYNIKOW_LABEL
 * (brak/aktualne/nieaktualne — §0 karty K4).
 *
 * CO ZMIENIŁA KARTA CV-2-W. Wcześniej chip liczył świeżość SAM: brał serwerowy
 * `result_status` i nadpisywał go własnym porównaniem pary rewizji, bo status na
 * serwerze zmieniał się dopiero, gdy KTOŚ unieważnił przypadek (dług V12K-309
 * poz. 2: model rew. 9, wynik z rew. 8, chip „aktualne"). Defekt naprawiono U
 * ŹRÓDŁA: backend WYPROWADZA status przypadku z jego biegów i koperty rewizji,
 * więc druga derywacja w powłoce zniknęła — razem ze stanem „nieustalone",
 * którego backend nigdy nie orzekał.
 *
 * INTENCJA POPRZEDNICH TESTÓW ŻYJE DALEJ, ale tam, gdzie teraz zapada werdykt:
 * `backend/tests/api/test_status_wynikow_przypadku.py` (mutacja modelu po biegu →
 * OUTDATED bez pisarza; inny odcisk katalogu → OUTDATED; jeden świeży bieg wśród
 * starych → FRESH). Tutaj sprawdzamy JEDYNIE to, co należy do powłoki: wierne
 * pokazanie werdyktu i akcję przy wyniku nieaktualnym.
 */

import { describe, it, expect } from 'vitest';
import { znacznikSwiezosci } from '../znacznikSwiezosci';
import { SHELL_STRINGS } from '../strings';
import { STATUS_WYNIKOW_LABEL } from '../../spaces/projekt/strings';
import { studyCaseFixture } from '../../spaces/obliczenia/__tests__/fixtures';
import type { StudyCase, StudyCaseResultStatus } from '../../../ui/study-cases/types';

const ZMIANA = {
  rewizja: 9,
  operacja: 'continue_trunk_segment_sn',
  opis_pl: 'Dołożono odcinek magistrali',
  elementy: ['bus-3', 'branch-2'],
};

function przypadek(status: StudyCaseResultStatus, over: Partial<StudyCase> = {}): StudyCase {
  return studyCaseFixture('K-1', 'Zwarcia maks.', {
    result_status: status,
    results_valid: status === 'FRESH',
    result_status_reason: status === 'OUTDATED' ? 'model-zmieniony' : 'model-niezmieniony',
    result_status_reason_pl:
      status === 'OUTDATED'
        ? 'Model zmienił się po obliczeniu — wynik opisuje poprzedni stan sieci.'
        : 'Model nie zmienił się od chwili obliczenia.',
    rewizja_biegu: status === 'NONE' ? null : 8,
    rewizja_biezaca: 9,
    zmiany_od_biegu: status === 'OUTDATED' ? [ZMIANA] : [],
    is_active: true,
    ...over,
  });
}

describe('znacznikSwiezosci — mapowanie werdyktu serwera na model znacznika', () => {
  it('null (brak aktywnego przypadku) → NONE, „Wyniki: brak", bez akcji i bez przyczyny', () => {
    const model = znacznikSwiezosci(null);
    expect(model.status).toBe('NONE');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsNone);
    expect(model.klikalny).toBe(false);
    // Nie ma przypadku — nie ma czego tłumaczyć; chrom nie wymyśla zdania.
    expect(model.przyczynaPl).toBeNull();
    expect(model.zmiany).toEqual([]);
  });

  it('NONE → „Wyniki: brak", bez akcji', () => {
    const model = znacznikSwiezosci(przypadek('NONE'));
    expect(model.status).toBe('NONE');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsNone);
    expect(model.klikalny).toBe(false);
  });

  it('FRESH → „Wyniki: aktualne", bez akcji, z przyczyną z backendu', () => {
    const model = znacznikSwiezosci(przypadek('FRESH'));
    expect(model.status).toBe('FRESH');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsFresh);
    expect(model.klikalny).toBe(false);
    expect(model.przyczynaPl).toBe('Model nie zmienił się od chwili obliczenia.');
    expect(model.zmiany).toEqual([]);
  });

  it('OUTDATED → „Wyniki: nieaktualne", klikalny, z przyczyną i LISTĄ ZMIAN', () => {
    const model = znacznikSwiezosci(przypadek('OUTDATED'));
    expect(model.status).toBe('OUTDATED');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsOutdated);
    expect(model.klikalny).toBe(true);
    expect(model.przyczynaPl).toContain('Model zmienił się');
    // „Która zmiana unieważniła wynik" — prosto z werdyktu, bez drugiego zapytania.
    expect(model.zmiany).toEqual([ZMIANA]);
  });

  it('para rewizji pochodzi Z WERDYKTU, nie z porównania po stronie chromu', () => {
    const model = znacznikSwiezosci(przypadek('OUTDATED'));
    expect(model.rewizjaBiegu).toBe(8);
    expect(model.rewizjaModelu).toBe(9);
  });

  it('chrom NIE nadpisuje werdyktu serwera własnym porównaniem rewizji', () => {
    // Rewizje rozjechane, ale serwer mówi FRESH (np. bieg policzony na tej samej
    // treści modelu). Dwa niezależne warunki „dziś zgodne" były defektem czekającym
    // na dane brzegowe — chrom pokazuje werdykt, którego nie liczył.
    const model = znacznikSwiezosci(
      przypadek('FRESH', { rewizja_biegu: 8, rewizja_biezaca: 9 }),
    );
    expect(model.status).toBe('FRESH');
    expect(model.etykieta).toBe(SHELL_STRINGS.resultsFresh);
  });

  it('ILOCZYN CECH: etykieta i klikalność zależą WYŁĄCZNIE od statusu', () => {
    const statusy: StudyCaseResultStatus[] = ['NONE', 'FRESH', 'OUTDATED'];
    const pary: Array<[number | null, number | null]> = [
      [8, 9],
      [9, 9],
      [null, 9],
      [8, null],
    ];
    for (const status of statusy) {
      for (const [biegu, biezaca] of pary) {
        const model = znacznikSwiezosci(
          przypadek(status, { rewizja_biegu: biegu, rewizja_biezaca: biezaca }),
        );
        expect(model.status).toBe(status);
        expect(model.klikalny).toBe(status === 'OUTDATED');
      }
    }
  });
});

describe('spójność etykiet chromu', () => {
  it('etykiety powłoki są spójne ze STATUS_WYNIKOW_LABEL (brak/aktualne/nieaktualne)', () => {
    const statusy: StudyCaseResultStatus[] = ['NONE', 'FRESH', 'OUTDATED'];
    for (const status of statusy) {
      const model = znacznikSwiezosci(przypadek(status));
      expect(model.status).toBe(status);
      expect(model.etykieta).toBe(`Wyniki: ${STATUS_WYNIKOW_LABEL[status]}`);
    }
  });

  it('chrom nie ma stanu spoza słownika serwerowego (koniec „nieustalone")', () => {
    expect(Object.keys(STATUS_WYNIKOW_LABEL).sort()).toEqual(['FRESH', 'NONE', 'OUTDATED']);
    expect(SHELL_STRINGS).not.toHaveProperty('resultsUnknown');
  });
});
