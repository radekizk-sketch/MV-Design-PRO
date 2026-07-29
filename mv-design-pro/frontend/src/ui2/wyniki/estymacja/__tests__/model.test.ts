/*
 * Testy modelu okna „Estymacja stanu (WLS)" — serializacja i walidacja żądania
 * (`zbudujZadanie`) oraz adaptery wyniku na wspólny wzorzec tabeli (węzły +
 * rezydua pomiarów). Weryfikują: brak pomiarów → błąd PL bez fabrykacji,
 * wymuszenie węzła „do" dla przepływów, dodatniość σ, zakres α, oraz przeniesienie
 * flag podejrzenia (suspect) i wartości |V|/kąt WYŁĄCZNIE z backendu.
 */

import { describe, expect, it } from 'vitest';

import {
  mapujWierszPomiaru,
  mapujWierszWezla,
  naWierszeWezlow,
  naZalozeniaEstymacji,
  przebiegRozplywuEstymacji,
  wymagaWezlaJ,
  zbudujZadanie,
  type WierszEdytora,
} from '../model';
import { TYPY_POMIAROW, widokEstymacjiFixture } from './fixtures';
import type { ExecutionRun } from '../../../../ui/study-cases/types';

const RUN = 'run-lf-1';

function wiersz(nadpisz: Partial<WierszEdytora>): WierszEdytora {
  return { meas_type: 'V_MAGNITUDE', bus_ref: '', value: '', sigma: '', bus_j_ref: '', ...nadpisz };
}

function wejscie(wiersze: WierszEdytora[], nadpisz?: { alfa?: string; progLnr?: string }) {
  return {
    runId: RUN,
    wiersze,
    alfa: nadpisz?.alfa ?? '',
    progLnr: nadpisz?.progLnr ?? '',
    typy: TYPY_POMIAROW,
    includeTrace: false,
  };
}

describe('zbudujZadanie — walidacja i serializacja', () => {
  it('brak pomiarów → błąd PL, bez fabrykacji', () => {
    const wynik = zbudujZadanie(wejscie([wiersz({})]));
    expect(wynik.ok).toBe(false);
    if (!wynik.ok) {
      expect(wynik.bledy.join(' ')).toContain('wymaga pomiarów telemetrycznych');
    }
  });

  it('pomiar |V| kompletny → żądanie z domyślnymi parametrami detekcji', () => {
    const wynik = zbudujZadanie(
      wejscie([wiersz({ meas_type: 'V_MAGNITUDE', bus_ref: 'BUS-2', value: '1,0', sigma: '0,004' })]),
    );
    expect(wynik.ok).toBe(true);
    if (wynik.ok) {
      expect(wynik.zadanie).toEqual({
        run_id: RUN,
        pomiary: [{ meas_type: 'V_MAGNITUDE', bus_ref: 'BUS-2', value: 1.0, sigma: 0.004 }],
        alpha: 0.01,
        lnr_threshold: 3.0,
        include_trace: false,
      });
    }
  });

  it('pomiar przepływu bez węzła „do" → błąd PL', () => {
    const wynik = zbudujZadanie(
      wejscie([wiersz({ meas_type: 'P_FLOW', bus_ref: 'BUS-1', value: '0,3', sigma: '0,01' })]),
    );
    expect(wynik.ok).toBe(false);
    if (!wynik.ok) expect(wynik.bledy.join(' ')).toContain('węzła „do"');
  });

  it('pomiar przepływu z węzłem „do" → serializuje bus_j_ref', () => {
    const wynik = zbudujZadanie(
      wejscie([
        wiersz({
          meas_type: 'P_FLOW',
          bus_ref: 'BUS-1',
          value: '0,3',
          sigma: '0,01',
          bus_j_ref: 'BUS-2',
        }),
      ]),
    );
    expect(wynik.ok).toBe(true);
    if (wynik.ok) {
      expect(wynik.zadanie.pomiary[0]).toEqual({
        meas_type: 'P_FLOW',
        bus_ref: 'BUS-1',
        value: 0.3,
        sigma: 0.01,
        bus_j_ref: 'BUS-2',
      });
    }
  });

  it('σ niedodatnie → błąd PL', () => {
    const wynik = zbudujZadanie(
      wejscie([wiersz({ bus_ref: 'BUS-2', value: '1,0', sigma: '0' })]),
    );
    expect(wynik.ok).toBe(false);
    if (!wynik.ok) expect(wynik.bledy.join(' ')).toContain('σ musi być liczbą dodatnią');
  });

  it('α poza przedziałem (0;1) → błąd PL', () => {
    const wynik = zbudujZadanie(
      wejscie([wiersz({ bus_ref: 'BUS-2', value: '1,0', sigma: '0,004' })], { alfa: '1,5' }),
    );
    expect(wynik.ok).toBe(false);
    if (!wynik.ok) expect(wynik.bledy.join(' ')).toContain('α');
  });

  it('α i próg LNR jawne → przenoszone do żądania', () => {
    const wynik = zbudujZadanie(
      wejscie([wiersz({ bus_ref: 'BUS-2', value: '1,0', sigma: '0,004' })], {
        alfa: '0,05',
        progLnr: '4',
      }),
    );
    expect(wynik.ok).toBe(true);
    if (wynik.ok) {
      expect(wynik.zadanie.alpha).toBe(0.05);
      expect(wynik.zadanie.lnr_threshold).toBe(4);
    }
  });
});

describe('wymagaWezlaJ — z metadanych backendu', () => {
  it('typ węzłowy nie wymaga węzła „do"', () => {
    expect(wymagaWezlaJ('V_MAGNITUDE', TYPY_POMIAROW)).toBe(false);
  });
  it('typ przepływowy wymaga węzła „do"', () => {
    expect(wymagaWezlaJ('P_FLOW', TYPY_POMIAROW)).toBe(true);
  });
});

describe('adaptery wyniku — wartości wyłącznie z backendu', () => {
  it('estymowany stan węzła → wiersz z |V|/kątem', () => {
    const dane = widokEstymacjiFixture();
    const wiersze = naWierszeWezlow(dane.buses);
    expect(wiersze).toHaveLength(3);
    const wezel2 = mapujWierszWezla(dane.buses[1]);
    expect(wezel2.wezel.wartosc).toBe('Szyna SN');
    expect(wezel2.modul.wartosc).toBe('0,9912');
    expect(wezel2.kat.wartosc).toBe('-1,50');
  });

  it('rezyduum podejrzanego pomiaru → ostrzeżenie + flaga', () => {
    const dane = widokEstymacjiFixture();
    const podejrzany = mapujWierszPomiaru(dane.measurements[0], TYPY_POMIAROW);
    expect(podejrzany.flaga.wartosc).toBe('podejrzany');
    expect(podejrzany.rezyduumZnorm.ostrzezenie).toBe(true);
    const czysty = mapujWierszPomiaru(dane.measurements[1], TYPY_POMIAROW);
    expect(czysty.flaga.wartosc).toBe('—');
    expect(czysty.rezyduumZnorm.ostrzezenie).toBe(false);
  });

  it('założenia niosą bazę mocy i slack z backendu', () => {
    const dane = widokEstymacjiFixture();
    const zal = naZalozeniaEstymacji(dane);
    const slack = zal.find((z) => z.wartosc === 'BUS-1');
    expect(slack).toBeDefined();
  });
});

describe('przebiegRozplywuEstymacji — dobór przebiegu', () => {
  function run(nadpisz: Partial<ExecutionRun>): ExecutionRun {
    return {
      id: 'r1',
      study_case_id: 'c1',
      analysis_type: 'LOAD_FLOW',
      solver_input_hash: 'h',
      status: 'DONE',
      started_at: null,
      finished_at: null,
      error_message: null,
      ...nadpisz,
    };
  }

  it('brak zakończonego rozpływu → null', () => {
    expect(przebiegRozplywuEstymacji([run({ status: 'RUNNING' })], null)).toBeNull();
    expect(przebiegRozplywuEstymacji([run({ analysis_type: 'SC_3F' })], null)).toBeNull();
  });

  it('preferuje aktywny zakończony rozpływ', () => {
    const a = run({ id: 'a' });
    const b = run({ id: 'b' });
    expect(przebiegRozplywuEstymacji([a, b], 'b')?.id).toBe('b');
    expect(przebiegRozplywuEstymacji([a, b], null)?.id).toBe('b');
  });
});
