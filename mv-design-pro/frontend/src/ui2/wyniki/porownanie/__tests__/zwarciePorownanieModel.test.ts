import { describe, it, expect } from 'vitest';

import {
  KOLUMNY_PUNKTOW_ZWARCIOWYCH,
  etykietaPrzebieguZwarciowego,
  czyPrzebiegZwarciowy,
  naWierszePunktowZwarciowych,
  przebiegiZwarciowe,
} from '../zwarciePorownanieModel';
import { ZWARCIA_POROWNANIE_STRINGS as SZ } from '../strings';
import { przebiegFixture, punktPorownania } from './zwarcieFixtures';

describe('zwarciePorownanieModel — selekcja przebiegów (runStore, SC_*/DONE)', () => {
  it('przyjmuje przebieg zwarciowy zakończony (SC_3F/DONE), odrzuca inne', () => {
    expect(czyPrzebiegZwarciowy(przebiegFixture())).toBe(true);
    expect(czyPrzebiegZwarciowy(przebiegFixture({ analysis_type: 'LOAD_FLOW' }))).toBe(false);
    expect(czyPrzebiegZwarciowy(przebiegFixture({ status: 'RUNNING' }))).toBe(false);
    expect(czyPrzebiegZwarciowy(przebiegFixture({ analysis_type: 'SC_1F' }))).toBe(true);
  });

  it('filtruje do SC/DONE i sortuje najnowsze pierwsze (po dacie)', () => {
    const runs = [
      przebiegFixture({ id: 'stary', finished_at: '2026-07-01T08:00:00Z' }),
      przebiegFixture({ id: 'lf', analysis_type: 'LOAD_FLOW' }),
      przebiegFixture({ id: 'niezakonczony', status: 'FAILED' }),
      przebiegFixture({ id: 'nowy', finished_at: '2026-07-20T08:00:00Z' }),
    ];
    const wynik = przebiegiZwarciowe(runs);
    expect(wynik.map((r) => r.id)).toEqual(['nowy', 'stary']);
  });
});

describe('zwarciePorownanieModel — etykieta przebiegu (PL)', () => {
  it('rodzaj zwarcia + data + nazwa przypadku (gdy znana)', () => {
    const etyk = etykietaPrzebieguZwarciowego(przebiegFixture(), false, 'Wariant letni');
    expect(etyk).toBe('Zwarcie trójfazowe (3F) · 2026-07-10 08:15 · Wariant letni');
  });

  it('brak nazwy przypadku → etykieta bez niej (zero zgadywania)', () => {
    const etyk = etykietaPrzebieguZwarciowego(przebiegFixture(), false, null);
    expect(etyk).toBe('Zwarcie trójfazowe (3F) · 2026-07-10 08:15');
    expect(etyk).not.toContain('case-1');
  });

  it('tryb ekspercki dopisuje identyfikatory przypadku i przebiegu', () => {
    const etyk = etykietaPrzebieguZwarciowego(przebiegFixture(), true, null);
    expect(etyk).toContain('case-1');
    expect(etyk).toContain('sc-run-a');
  });
});

describe('zwarciePorownanieModel — tabela punktów (delty Z BACKENDU)', () => {
  // KARTA KD-3 poz. 11 (dług V12K-290): delty liczy backend. Testy podają je
  // jako POLA odpowiedzi — w kilku przypadkach CELOWO NIEZGODNE z ilorazem
  // wartości A i B. Gdyby prezentacja liczyła różnicę sama, te testy byłyby
  // czerwone (wzorzec przypięcia kontraktu z L-13, karta KD-2).

  it('wspólny punkt: A, B i Δ z procentem (format PL — przecinek)', () => {
    const wiersze = naWierszePunktowZwarciowych([
      punktPorownania({
        target_id: 'B1',
        target_name: 'Szyna 1',
        ikss_ka_a: 10,
        ikss_ka_b: 12,
        delta_ikss_ka: 2,
        delta_ikss_percent: 20,
        sk_mva_a: 200,
        sk_mva_b: 250,
        delta_sk_mva: 50,
        delta_sk_percent: 25,
      }),
    ]);
    expect(wiersze).toHaveLength(1);
    const w = wiersze[0];
    expect(w.punkt.wartosc).toBe('Szyna 1');
    expect(w.ikssA.wartosc).toBe('10,000');
    expect(w.ikssB.wartosc).toBe('12,000');
    expect(w.ikssD.wartosc).toBe('+2,000 (+20,0%)');
    expect(w.ikssD.sortKey).toBe(2);
    expect(w.skA.wartosc).toBe('200,0');
    expect(w.skD.wartosc).toBe('+50,0 (+25,0%)');
  });

  it('KONTRAKT: Δ pochodzi z pola backendu, nie z odejmowania w UI', () => {
    // Wartości A i B dałyby Δ = +2,000 (+20,0%). Backend zwraca liczby
    // CELOWO inne — readout musi pokazać JE, nie własny rachunek.
    const w = naWierszePunktowZwarciowych([
      punktPorownania({
        target_id: 'B1',
        target_name: 'Szyna 1',
        ikss_ka_a: 10,
        ikss_ka_b: 12,
        delta_ikss_ka: 7.5,
        delta_ikss_percent: 99.9,
      }),
    ])[0];
    expect(w.ikssD.wartosc).toBe('+7,500 (+99,9%)');
    expect(w.ikssD.sortKey).toBe(7.5);
  });

  it('punkt tylko w przebiegu A → sufiks „(tylko A)" i puste Δ', () => {
    const wiersze = naWierszePunktowZwarciowych([
      punktPorownania({
        target_id: 'ONLYA',
        target_name: 'Szyna A',
        obecny_w: 'A',
        ikss_ka_a: 10,
      }),
      punktPorownania({ target_id: 'B1', target_name: 'Szyna 1', ikss_ka_a: 10, ikss_ka_b: 10 }),
    ]);
    const wa = wiersze.find((w) => String(w.punkt.wartosc).includes('Szyna A'));
    expect(wa?.punkt.wartosc).toBe(`Szyna A${SZ.tylkoA}`);
    expect(wa?.ikssB.wartosc).toBe(SZ.kreska);
    expect(wa?.ikssD.wartosc).toBe(SZ.kreska);
  });

  it('punkt tylko w przebiegu B → sufiks „(tylko B)"', () => {
    const wiersze = naWierszePunktowZwarciowych([
      punktPorownania({
        target_id: 'ONLYB',
        target_name: 'Szyna B',
        obecny_w: 'B',
        ikss_ka_b: 10,
      }),
    ]);
    const wb = wiersze.find((w) => String(w.punkt.wartosc).includes('Szyna B'));
    expect(wb?.punkt.wartosc).toBe(`Szyna B${SZ.tylkoB}`);
    expect(wb?.ikssA.wartosc).toBe(SZ.kreska);
  });

  it('pole nieobecne w odpowiedzi (brak wielkości) → komórka „—" bez delty', () => {
    const wiersze = naWierszePunktowZwarciowych([
      punktPorownania({ target_id: 'B1', ip_ka_b: 30 }),
    ]);
    expect(wiersze[0].ipA.wartosc).toBe(SZ.kreska);
    expect(wiersze[0].ipD.wartosc).toBe(SZ.kreska);
  });

  it('brak odniesienia (A = 0) → Δ bez procentu (pole procentowe pominięte)', () => {
    // Backend nie zwraca `delta_ikss_percent`, bo różnica względna nie istnieje.
    const wiersze = naWierszePunktowZwarciowych([
      punktPorownania({ target_id: 'B1', ikss_ka_a: 0, ikss_ka_b: 5, delta_ikss_ka: 5 }),
    ]);
    expect(wiersze[0].ikssD.wartosc).toBe('+5,000');
  });

  it('R3-C: komórki A/B niosą dowodRef strony (A:punkt / B:punkt), Δ bez dowodu', () => {
    const w = naWierszePunktowZwarciowych([
      punktPorownania({
        target_id: 'B1',
        ikss_ka_a: 10,
        ikss_ka_b: 10,
        delta_ikss_ka: 0,
        sk_mva_a: 200,
        sk_mva_b: 200,
        delta_sk_mva: 0,
      }),
    ])[0];
    expect(w.ikssA.dowodRef).toBe('A:B1');
    expect(w.ikssB.dowodRef).toBe('B:B1');
    expect(w.skA.dowodRef).toBe('A:B1');
    expect(w.skB.dowodRef).toBe('B:B1');
    // Różnica B−A nie ma pojedynczego wywodu WHITE BOX — delta bez dowodu.
    expect(w.ikssD.dowodRef).toBeUndefined();
    expect(w.skD.dowodRef).toBeUndefined();
  });

  it('R3-C: kreska (brak wartości / punkt bez odpowiednika) nie niesie dowodRef', () => {
    const wiersze = naWierszePunktowZwarciowych([
      punktPorownania({ target_id: 'B1', ikss_ka_a: 10, ikss_ka_b: 10, delta_ikss_ka: 0 }),
      punktPorownania({
        target_id: 'ONLYB',
        target_name: 'Szyna B',
        obecny_w: 'B',
        ikss_ka_b: 10,
      }),
    ]);
    const wspolny = wiersze.find((w) => String(w.punkt.wartosc) === 'Szyna GPZ');
    expect(wspolny?.ipA.dowodRef).toBeUndefined(); // pole nieobecne w odpowiedzi
    const tylkoB = wiersze.find((w) => String(w.punkt.wartosc).includes(SZ.tylkoB));
    expect(tylkoB?.ikssA.dowodRef).toBeUndefined(); // strona A bez danych
    expect(tylkoB?.ikssB.dowodRef).toBe('B:ONLYB');
  });

  it('kolejność wierszy pochodzi z odpowiedzi (backend sortuje deterministycznie)', () => {
    const wiersze = naWierszePunktowZwarciowych([
      punktPorownania({ target_id: 'A', target_name: 'A' }),
      punktPorownania({ target_id: 'M', target_name: 'M' }),
      punktPorownania({ target_id: 'Z', target_name: 'Z' }),
    ]);
    expect(wiersze.map((w) => String(w.punkt.wartosc))).toEqual(['A', 'M', 'Z']);
  });

  it('komplet kolumn: punkt + A/B/Δ dla Ik", ip, Ith, Sk + pełny bilans ekspercki (28 kolumn)', () => {
    // 1 (punkt) + 4×3 (podstawowe) + 5×3 (bilans: Rk, Xk, |Zk|, X/R, I²t — karta S-C)
    expect(KOLUMNY_PUNKTOW_ZWARCIOWYCH).toHaveLength(28);
    expect(KOLUMNY_PUNKTOW_ZWARCIOWYCH[0].klucz).toBe('punkt');
    expect(KOLUMNY_PUNKTOW_ZWARCIOWYCH.map((k) => k.klucz)).toContain('ikssD');
    expect(KOLUMNY_PUNKTOW_ZWARCIOWYCH.map((k) => k.klucz)).toContain('skD');
    expect(KOLUMNY_PUNKTOW_ZWARCIOWYCH.map((k) => k.klucz)).toContain('rkD');
    expect(KOLUMNY_PUNKTOW_ZWARCIOWYCH.map((k) => k.klucz)).toContain('i2tD');
  });

  it('kolumny pełnego bilansu są WYŁĄCZNIE eksperckie; podstawowe bez flagi', () => {
    const bilansowe = KOLUMNY_PUNKTOW_ZWARCIOWYCH.filter((k) =>
      /^(rk|xk|zk|xr|i2t)[ABD]$/.test(k.klucz),
    );
    expect(bilansowe).toHaveLength(15);
    for (const kol of bilansowe) expect(kol.tylkoEkspercki).toBe(true);
    const podstawowe = KOLUMNY_PUNKTOW_ZWARCIOWYCH.filter(
      (k) => !/^(rk|xk|zk|xr|i2t)[ABD]$/.test(k.klucz),
    );
    for (const kol of podstawowe) expect(kol.tylkoEkspercki).toBeUndefined();
  });
});

describe('zwarciePorownanieModel — pełny bilans IEC 60909 (tryb ekspercki)', () => {
  it('oba przebiegi z bilansem → trójki A · B · Δ (format PL, jednostki wg kolumn)', () => {
    const w = naWierszePunktowZwarciowych([
      punktPorownania({
        target_id: 'B1',
        rk_ohm_a: 0.3,
        rk_ohm_b: 0.6,
        delta_rk_ohm: 0.3,
        delta_rk_percent: 100,
        xk_ohm_a: 0.4,
        xk_ohm_b: 0.8,
        delta_xk_ohm: 0.4,
        delta_xk_percent: 100,
        zk_ohm_a: 0.5,
        zk_ohm_b: 1.0,
        delta_zk_ohm: 0.5,
        delta_zk_percent: 100,
        xr_ratio_a: 4,
        xr_ratio_b: 2,
        delta_xr_ratio: -2,
        delta_xr_percent: -50,
        i2t_ka2s_a: 121,
        i2t_ka2s_b: 484,
        delta_i2t_ka2s: 363,
        delta_i2t_percent: 300,
      }),
    ])[0];
    expect(w.rkA.wartosc).toBe('0,3000');
    expect(w.rkB.wartosc).toBe('0,6000');
    expect(w.rkD.wartosc).toBe('+0,3000 (+100,0%)');
    expect(w.xkD.wartosc).toBe('+0,4000 (+100,0%)');
    expect(w.zkD.wartosc).toBe('+0,5000 (+100,0%)');
    expect(w.xrD.wartosc).toBe('-2,000 (-50,0%)');
    expect(w.i2tA.wartosc).toBe('121,000');
    expect(w.i2tD.wartosc).toBe('+363,000 (+300,0%)');
    expect(w.rkD.dowodRef).toBeUndefined();
    expect(w.i2tD.dowodRef).toBeUndefined();
    expect(w.rkA.dowodRef).toBe('A:B1');
    expect(w.i2tB.dowodRef).toBe('B:B1');
  });

  it('starszy wynik bez pól bilansu → uczciwe kreski bez Δ (kontrakt addytywny)', () => {
    const w = naWierszePunktowZwarciowych([
      punktPorownania({ target_id: 'B1', rk_ohm_b: 0.6 }),
    ])[0];
    expect(w.rkA.wartosc).toBe(SZ.kreska);
    expect(w.rkB.wartosc).toBe('0,6000');
    expect(w.rkD.wartosc).toBe(SZ.kreska);
    expect(w.xrD.wartosc).toBe(SZ.kreska);
    expect(w.i2tD.wartosc).toBe(SZ.kreska);
    expect(w.rkA.dowodRef).toBeUndefined();
  });
});
