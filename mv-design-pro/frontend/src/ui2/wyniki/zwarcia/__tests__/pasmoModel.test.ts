/*
 * Model sekcji „Pasmo MIN/MAX" (karta W3-G3, aneks D7, mapa domknięcia 3 #12).
 * Testy jako ILOCZYN CECH (KLASA, NIE INSTANCJA §2): parowanie wierszy
 * {oba punkty wspólne / punkt WYŁĄCZNIE w MAX / punkt WYŁĄCZNIE w MIN} ×
 * {wartość obecna / null}; świeżość pary {zgodna / różna / nieznana (brak
 * jednej rewizji)}; mapowanie typu zwarcia na rodzaj biegu — pełna pula
 * tokenów kontraktu + token nierozpoznany.
 */
import { describe, it, expect } from 'vitest';

import {
  naWierszePasma,
  sparujWierszePasma,
  swiezoscParyPasma,
  typZwarciaNaAnalysisType,
  KLUCZ_PASMO,
} from '../pasmoModel';
import { ZWARCIA_STRINGS } from '../strings';
import { shortCircuitRowFixture } from './fixtures';

/** Most nazw w testach (karta #145): nazwa z wyniku, a bez niej — prefiks nad referencją. */
const NAZWA = (ref: string, nazwaZWyniku?: string | null): string =>
  nazwaZWyniku ?? `nazwa ${ref}`;

describe('sparujWierszePasma — parowanie wierszy MAX/MIN po target_id', () => {
  it('punkt wspólny obu stron: para niesie OBA wiersze', () => {
    const max = [shortCircuitRowFixture({ target_id: 'BUS-A', ikss_ka: 10 })];
    const min = [shortCircuitRowFixture({ target_id: 'BUS-A', ikss_ka: 6 })];
    const pary = sparujWierszePasma(max, min, NAZWA);
    expect(pary).toHaveLength(1);
    expect(pary[0].max?.ikss_ka).toBe(10);
    expect(pary[0].min?.ikss_ka).toBe(6);
  });

  it('punkt WYŁĄCZNIE w MAX: para z min=null (żaden punkt nie ginie)', () => {
    const max = [shortCircuitRowFixture({ target_id: 'BUS-TYLKO-MAX' })];
    const pary = sparujWierszePasma(max, [], NAZWA);
    expect(pary).toHaveLength(1);
    expect(pary[0].targetId).toBe('BUS-TYLKO-MAX');
    expect(pary[0].max).not.toBeNull();
    expect(pary[0].min).toBeNull();
  });

  it('punkt WYŁĄCZNIE w MIN: para z max=null', () => {
    const min = [shortCircuitRowFixture({ target_id: 'BUS-TYLKO-MIN' })];
    const pary = sparujWierszePasma(undefined, min, NAZWA);
    expect(pary).toHaveLength(1);
    expect(pary[0].max).toBeNull();
    expect(pary[0].min).not.toBeNull();
  });

  it('kolejność deterministyczna: sort po target_id, niezależnie od kolejności wejścia', () => {
    const max = [
      shortCircuitRowFixture({ target_id: 'BUS-Z' }),
      shortCircuitRowFixture({ target_id: 'BUS-A' }),
    ];
    const pary = sparujWierszePasma(max, [], NAZWA);
    expect(pary.map((p) => p.targetId)).toEqual(['BUS-A', 'BUS-Z']);
  });

  it('obie strony puste/nieobecne → pusta lista (uczciwy brak, nie wyjątek)', () => {
    expect(sparujWierszePasma(undefined, undefined, NAZWA)).toEqual([]);
  });

  it('targetName i faultType: MAX ma pierwszeństwo, MIN jako zapasowe źródło', () => {
    const max = [shortCircuitRowFixture({ target_id: 'BUS-A', target_name: 'Szyna A (MAX)', fault_type: '3F' })];
    const min = [shortCircuitRowFixture({ target_id: 'BUS-A', target_name: 'Szyna A (MIN)', fault_type: '3F' })];
    const [para] = sparujWierszePasma(max, min, NAZWA);
    expect(para.targetName).toBe('Szyna A (MAX)');
    // Punkt wyłącznie w MIN: targetName spada na MIN (jedyne źródło).
    const [paraTylkoMin] = sparujWierszePasma(
      [],
      [shortCircuitRowFixture({ target_id: 'BUS-B', target_name: 'Szyna B (MIN)' })], NAZWA
    );
    expect(paraTylkoMin.targetName).toBe('Szyna B (MIN)');
  });
});

describe('naWierszePasma — komórki tabeli (wartość obecna / null → kreska)', () => {
  it('para z obiema stronami: kolumny max/min niosą sformatowane wartości ORAZ sortKey liczbowy', () => {
    const pary = sparujWierszePasma(
      [shortCircuitRowFixture({ target_id: 'BUS-A', ikss_ka: 12.345, ip_ka: 31.2 })],
      [shortCircuitRowFixture({ target_id: 'BUS-A', ikss_ka: 6.111, ip_ka: 15.6 })], NAZWA
    );
    const [wiersz] = naWierszePasma(pary);
    expect(wiersz.ikssMax).toEqual({ wartosc: '12,345', sortKey: 12.345 });
    expect(wiersz.ikssMin).toEqual({ wartosc: '6,111', sortKey: 6.111 });
    expect(wiersz[KLUCZ_PASMO]).toEqual({ wartosc: 'BUS-A' });
  });

  it('strona brakująca (null): każda komórka tej strony = kreska, sortKey -Infinity', () => {
    const pary = sparujWierszePasma([shortCircuitRowFixture({ target_id: 'BUS-A' })], [], NAZWA);
    const [wiersz] = naWierszePasma(pary);
    expect(wiersz.ikssMin).toEqual({ wartosc: ZWARCIA_STRINGS.kreska, sortKey: Number.NEGATIVE_INFINITY });
    expect(wiersz.skMin).toEqual({ wartosc: ZWARCIA_STRINGS.kreska, sortKey: Number.NEGATIVE_INFINITY });
  });

  it('wartość null wewnątrz obecnej strony (starszy wynik bez bilansu) → kreska', () => {
    const pary = sparujWierszePasma(
      [shortCircuitRowFixture({ target_id: 'BUS-A', kappa: null, rk_ohm: null })],
      [shortCircuitRowFixture({ target_id: 'BUS-A' })], NAZWA
    );
    const [wiersz] = naWierszePasma(pary);
    expect(wiersz.kappaMax).toEqual({ wartosc: ZWARCIA_STRINGS.kreska, sortKey: Number.NEGATIVE_INFINITY });
    expect(wiersz.rkMax).toEqual({ wartosc: ZWARCIA_STRINGS.kreska, sortKey: Number.NEGATIVE_INFINITY });
  });

  it('rodzaj zwarcia mapowany na PL z którejkolwiek dostępnej strony', () => {
    const pary = sparujWierszePasma(
      [shortCircuitRowFixture({ target_id: 'BUS-A', fault_type: '2F' })],
      [shortCircuitRowFixture({ target_id: 'BUS-A', fault_type: '2F' })], NAZWA
    );
    const [wiersz] = naWierszePasma(pary);
    expect(wiersz.rodzaj).toEqual({ wartosc: 'zwarcie dwufazowe' });
  });
});

describe('swiezoscParyPasma — porównanie DWÓCH rewizji (symetryczne, nie ukierunkowane)', () => {
  it('ta sama rewizja obu stron → zgodne: true', () => {
    expect(swiezoscParyPasma(5, 5)).toEqual({ zgodne: true, starsza: 5, nowsza: 5 });
  });

  it('różne rewizje → zgodne: false, starsza/nowsza wyznaczone niezależnie od tego, KTÓRA strona jest MAX', () => {
    // MAX starszy niż MIN.
    expect(swiezoscParyPasma(5, 7)).toEqual({ zgodne: false, starsza: 5, nowsza: 7 });
    // MIN starszy niż MAX (symetria — ta sama funkcja, odwrócone argumenty).
    expect(swiezoscParyPasma(7, 5)).toEqual({ zgodne: false, starsza: 5, nowsza: 7 });
  });

  it('którakolwiek rewizja nieznana (undefined/null) → null (uczciwy brak, nie fałszywe "zgodne")', () => {
    expect(swiezoscParyPasma(undefined, 5)).toBeNull();
    expect(swiezoscParyPasma(5, null)).toBeNull();
    expect(swiezoscParyPasma(undefined, undefined)).toBeNull();
  });
});

describe('typZwarciaNaAnalysisType — mapowanie typu zwarcia biegu na rodzaj analizy', () => {
  it.each([
    ['3F', 'SC_3F'],
    ['1F', 'SC_1F'],
    ['2F', 'SC_2F'],
    ['2F+Z', 'SC_2F_G'],
  ] as const)('%s -> %s', (typ, oczekiwany) => {
    expect(typZwarciaNaAnalysisType(typ)).toBe(oczekiwany);
  });

  it('token nierozpoznany spada na SC_3F (jak domyślny fallback backendu)', () => {
    expect(typZwarciaNaAnalysisType('NIEZNANY')).toBe('SC_3F');
  });

  it('normalizacja wielkości liter (małe litery z opcji biegu)', () => {
    expect(typZwarciaNaAnalysisType('1f')).toBe('SC_1F');
  });
});
