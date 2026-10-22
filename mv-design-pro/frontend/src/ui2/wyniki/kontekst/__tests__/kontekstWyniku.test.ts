/**
 * Karta K8 KONTEKST-WYNIKU — magazyn kontekstu wyniku jako ILOCZYN CECH
 * (reguła KLASA-NIE-INSTANCJA §2): rodzina analizy × świeżość biegu × źródło wyboru
 * (panel dolny, ekran pełny, pasek stanu, adres URL — i pozostałe źródła słownika).
 *
 * Dla KAŻDEJ kombinacji sprawdzamy to samo zdanie kontraktu: wybór biegu z dowolnego
 * źródła czyni go aktywnym biegiem SWOJEJ rodziny i rodzinę — oglądaną; pozostałe
 * rodziny zostają przy swoim biegu; świeżość pochodzi z jednego predykatu
 * (`swiezoscBiegu`: rewizja biegu ≠ rewizja modelu ⇒ nieaktualny).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import type { ExecutionAnalysisType, ExecutionRun } from '../../../../ui/study-cases/types';
import {
  RODZINY_ANALIZ,
  STAN_WYBORU_PUSTY,
  aktywnyBiegRodziny,
  aktywnyBiegTeraz,
  biegOgladany,
  biegiRodziny,
  kontekstyRodzin,
  poWyborze,
  rodzinaAnalizy,
  rodzinaOgladana,
  rozstrzygnijOczekujacy,
  runIdOgladany,
  runIdOgladanyTeraz,
  swiezoscBiegu,
  uporzadkujBiegi,
  useKontekstWynikuStore,
  zdanieSwiezosci,
  type RodzinaAnalizy,
  type StanSwiezosciBiegu,
  type ZrodloWyboru,
} from '../kontekstWyniku';

/** Reprezentatywny rodzaj biegu rodziny (każda rodzina ma co najmniej jeden). */
const RODZAJ: Readonly<Record<RodzinaAnalizy, ExecutionAnalysisType>> = {
  rozplyw: 'LOAD_FLOW',
  zwarcie: 'SC_3F',
  fazowy: 'PHASE_STATE_SN',
  zabezpieczenia: 'PROTECTION',
  dynamika: 'DYNAMIKA_RMS',
  akademickie: 'V126_SC_MIN_MAX' as ExecutionAnalysisType,
};

const ZRODLA: readonly ZrodloWyboru[] = ['panel', 'ekran', 'pasek', 'url', 'bieg', 'dowody', 'przebiegi', 'schemat'];

/** Bieżąca rewizja modelu w testach. */
const REWIZJA_MODELU = 7;

/** Rewizja biegu dla żądanej świeżości (jeden predykat: ≠ ⇒ nieaktualny, brak ⇒ nieznany). */
const REWIZJA_DLA: Readonly<Record<StanSwiezosciBiegu, number | null>> = {
  aktualny: REWIZJA_MODELU,
  nieaktualny: REWIZJA_MODELU - 3,
  nieznany: null,
};

function bieg(
  id: string,
  analysis_type: ExecutionAnalysisType,
  minuta: number,
  model_revision: number | null = REWIZJA_MODELU,
  status: ExecutionRun['status'] = 'DONE',
): ExecutionRun {
  const czas = `2026-10-21T10:${String(minuta).padStart(2, '0')}:00Z`;
  return {
    id,
    study_case_id: 'case-1',
    analysis_type,
    solver_input_hash: `hash-${id}`,
    status,
    started_at: czas,
    finished_at: czas,
    error_message: null,
    model_revision,
  };
}

/**
 * Rejestr: w każdej rodzinie bieg STARSZY (o wskazanej świeżości) i NOWSZY (aktualny),
 * plus bieg w toku i bieg nieudany (nigdy nie mogą zostać aktywne).
 */
function rejestr(swiezoscStarszego: StanSwiezosciBiegu): ExecutionRun[] {
  const runs: ExecutionRun[] = [];
  RODZINY_ANALIZ.forEach((rodzina, i) => {
    runs.push(bieg(`${rodzina}-starszy`, RODZAJ[rodzina], i, REWIZJA_DLA[swiezoscStarszego]));
    runs.push(bieg(`${rodzina}-nowszy`, RODZAJ[rodzina], 20 + i));
    runs.push(bieg(`${rodzina}-w-toku`, RODZAJ[rodzina], 40 + i, REWIZJA_MODELU, 'RUNNING'));
    runs.push(bieg(`${rodzina}-nieudany`, RODZAJ[rodzina], 50 + i, REWIZJA_MODELU, 'FAILED'));
  });
  return runs;
}

beforeEach(() => {
  useExecutionRunsStore.setState({ runs: [] });
  useKontekstWynikuStore.setState({ ...STAN_WYBORU_PUSTY, wyniki: {} });
});

describe('iloczyn: rodzina × świeżość × źródło wyboru', () => {
  const swiezosci: readonly StanSwiezosciBiegu[] = ['aktualny', 'nieaktualny', 'nieznany'];
  for (const rodzina of RODZINY_ANALIZ) {
    for (const swiezosc of swiezosci) {
      for (const zrodlo of ZRODLA) {
        it(`${rodzina} × ${swiezosc} × ${zrodlo}`, () => {
          const runs = rejestr(swiezosc);
          useExecutionRunsStore.setState({ runs });
          const wybrany = `${rodzina}-starszy`;

          useKontekstWynikuStore.getState().wybierzBieg(wybrany, zrodlo);
          const stan = useKontekstWynikuStore.getState();

          // Wybrany bieg jest aktywnym biegiem SWOJEJ rodziny i rodzina jest oglądana.
          expect(aktywnyBiegRodziny(runs, stan, rodzina)?.id).toBe(wybrany);
          expect(stan.zrodla[rodzina]).toBe(zrodlo);
          expect(rodzinaOgladana(runs, stan)).toBe(rodzina);
          expect(biegOgladany(runs, stan)?.id).toBe(wybrany);
          expect(runIdOgladanyTeraz()).toBe(wybrany);
          expect(aktywnyBiegTeraz(rodzina)?.id).toBe(wybrany);

          // Pozostałe rodziny: najnowszy ZAKOŃCZONY bieg (nie w toku, nie nieudany).
          for (const inna of RODZINY_ANALIZ.filter((r) => r !== rodzina)) {
            expect(aktywnyBiegRodziny(runs, stan, inna)?.id).toBe(`${inna}-nowszy`);
          }

          // Świeżość z jednego predykatu — ta sama na pasku stanu (kontekstyRodzin).
          const run = runs.find((r) => r.id === wybrany)!;
          const ocena = swiezoscBiegu(run, REWIZJA_MODELU, null);
          expect(ocena.stan).toBe(swiezosc);
          const pasek = kontekstyRodzin(runs, stan, REWIZJA_MODELU, null);
          const wierszRodziny = pasek.find((k) => k.rodzina === rodzina)!;
          expect(wierszRodziny.bieg.id).toBe(wybrany);
          expect(wierszRodziny.swiezosc.stan).toBe(swiezosc);
          expect(wierszRodziny.ogladana).toBe(true);
          expect(pasek.filter((k) => k.ogladana)).toHaveLength(1);
          expect(zdanieSwiezosci(ocena)).not.toBe('');
        });
      }
    }
  }
});

describe('wybór biegu niezakończonego albo spoza rodzin', () => {
  it('bieg w toku nie staje się aktywnym (rodzina zostaje przy najnowszym zakończonym)', () => {
    const runs = rejestr('aktualny');
    useExecutionRunsStore.setState({ runs });
    useKontekstWynikuStore.getState().wybierzBieg('zwarcie-w-toku', 'panel');
    const stan = useKontekstWynikuStore.getState();
    expect(aktywnyBiegRodziny(runs, stan, 'zwarcie')?.id).toBe('zwarcie-nowszy');
  });

  it('bieg nieudany nie staje się aktywnym', () => {
    const runs = rejestr('aktualny');
    useExecutionRunsStore.setState({ runs });
    useKontekstWynikuStore.getState().wybierzBieg('rozplyw-nieudany', 'pasek');
    expect(aktywnyBiegRodziny(runs, useKontekstWynikuStore.getState(), 'rozplyw')?.id).toBe(
      'rozplyw-nowszy',
    );
  });

  it('rodzaj spoza słownika rodzin nie zmienia stanu (nie zgadujemy rodziny)', () => {
    const obcy = bieg('obcy', 'NIEZNANY' as ExecutionAnalysisType, 59);
    const runs = [...rejestr('aktualny'), obcy];
    expect(rodzinaAnalizy('NIEZNANY')).toBeNull();
    const przed = { ...STAN_WYBORU_PUSTY };
    expect(poWyborze(przed, runs, 'obcy', 'panel')).toBe(przed);
  });
});

describe('adres URL przy zimnym starcie (bieg oczekujący)', () => {
  for (const rodzina of RODZINY_ANALIZ) {
    it(`?run= biegu ${rodzina} nieznanego rejestrowi rozstrzyga się po wczytaniu rejestru`, () => {
      const wskazany = `${rodzina}-starszy`;
      useKontekstWynikuStore.getState().wybierzBieg(wskazany, 'url');
      let stan = useKontekstWynikuStore.getState();
      expect(stan.oczekujacy).toEqual({ runId: wskazany, zrodlo: 'url' });
      // Bieg oglądany = oczekujący: konsument pobiera jego wynik od razu.
      expect(runIdOgladany([], stan)).toBe(wskazany);

      useExecutionRunsStore.setState({ runs: rejestr('nieaktualny') });
      stan = useKontekstWynikuStore.getState();
      expect(stan.oczekujacy).toBeNull();
      expect(stan.wybrane[rodzina]).toBe(wskazany);
      expect(stan.zrodla[rodzina]).toBe('url');
      expect(stan.ogladana).toBe(rodzina);
    });
  }

  it('porzucenie oczekującego (404) czyści wskazanie tylko tego biegu', () => {
    const magazyn = useKontekstWynikuStore.getState();
    magazyn.wybierzBieg('nie-ma-go', 'url');
    useKontekstWynikuStore.getState().porzucOczekujacy('inny');
    expect(useKontekstWynikuStore.getState().oczekujacy?.runId).toBe('nie-ma-go');
    useKontekstWynikuStore.getState().porzucOczekujacy('nie-ma-go');
    expect(useKontekstWynikuStore.getState().oczekujacy).toBeNull();
  });

  it('rozstrzygnięcie bez biegu w rejestrze zostawia stan bez zmian (ta sama referencja)', () => {
    const stan = { ...STAN_WYBORU_PUSTY, oczekujacy: { runId: 'x', zrodlo: 'url' as const } };
    expect(rozstrzygnijOczekujacy(stan, rejestr('aktualny'))).toBe(stan);
  });
});

describe('idempotencja, czyszczenie i porządek', () => {
  it('ponowny wybór tego samego biegu z tego samego źródła nie zmienia referencji stanu', () => {
    const runs = rejestr('aktualny');
    const raz = poWyborze(STAN_WYBORU_PUSTY, runs, 'zwarcie-starszy', 'pasek');
    expect(poWyborze(raz, runs, 'zwarcie-starszy', 'pasek')).toBe(raz);
  });

  it('wyczyść (zmiana przypadku/projektu) wraca do domyślnych: najnowszy bieg rodziny', () => {
    const runs = rejestr('aktualny');
    useExecutionRunsStore.setState({ runs });
    useKontekstWynikuStore.getState().wybierzBieg('rozplyw-starszy', 'panel');
    useKontekstWynikuStore.getState().wyczysc();
    const stan = useKontekstWynikuStore.getState();
    expect(stan.wybrane).toEqual({});
    expect(aktywnyBiegRodziny(runs, stan, 'rozplyw')?.id).toBe('rozplyw-nowszy');
  });

  it('bez jawnego wyboru oglądana jest rodzina NAJNOWSZEGO zakończonego biegu', () => {
    const runs = rejestr('aktualny');
    // Najnowszy zakończony: akademickie-nowszy (minuta 25).
    expect(rodzinaOgladana(runs, STAN_WYBORU_PUSTY)).toBe('akademickie');
  });

  it('porządek biegów: znacznik czasu malejąco, remis rozstrzyga identyfikator — niezależnie od kolejności źródła', () => {
    const a = bieg('a', 'LOAD_FLOW', 5);
    const b = bieg('b', 'LOAD_FLOW', 5);
    const c = bieg('c', 'LOAD_FLOW', 9);
    expect(uporzadkujBiegi([a, b, c]).map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(uporzadkujBiegi([c, b, a]).map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(biegiRodziny([a, c, b], 'rozplyw').map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('jeden predykat świeżości — werdykt serwera jako dana wejściowa', () => {
  const run = bieg('r', 'LOAD_FLOW', 1, 5);

  it('rewizje różne ⇒ nieaktualny (także gdy bieg ma rewizję NOWSZĄ niż model)', () => {
    expect(swiezoscBiegu(run, 6, null).stan).toBe('nieaktualny');
    expect(swiezoscBiegu(run, 4, null).stan).toBe('nieaktualny');
  });

  it('rewizje równe, serwer: przypadek nieaktualny na rewizji TEGO biegu ⇒ nieaktualny z przyczyną serwera', () => {
    const ocena = swiezoscBiegu(run, 5, {
      result_status: 'OUTDATED',
      rewizja_biegu: 5,
      result_status_reason_pl: 'Zmieniono bibliotekę typów.',
    });
    expect(ocena).toMatchObject({ stan: 'nieaktualny', przyczyna: 'werdykt-serwera' });
    expect(zdanieSwiezosci(ocena)).toBe('Zmieniono bibliotekę typów.');
  });

  it('werdykt serwera o INNYM biegu nie unieważnia tego biegu', () => {
    const ocena = swiezoscBiegu(run, 5, {
      result_status: 'OUTDATED',
      rewizja_biegu: 4,
      result_status_reason_pl: 'x',
    });
    expect(ocena.stan).toBe('aktualny');
  });

  it('rewizja modelu nieznana ⇒ nieznany, nie „aktualny"', () => {
    expect(swiezoscBiegu(run, null, null).stan).toBe('nieznany');
  });
});
