import { describe, it, expect } from 'vitest';

import {
  KOLUMNY_PUNKTOW_ZWARCIOWYCH,
  etykietaPrzebieguZwarciowego,
  czyPrzebiegZwarciowy,
  naWierszePunktowZwarciowych,
  przebiegiZwarciowe,
} from '../zwarciePorownanieModel';
import { ZWARCIA_POROWNANIE_STRINGS as SZ } from '../strings';
import { przebiegFixture, wierszSc } from './zwarcieFixtures';

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

describe('zwarciePorownanieModel — tabela delt per punkt (prezentacyjna różnica)', () => {
  it('wspólny punkt: A, B i Δ z procentem (format PL — przecinek)', () => {
    const wiersze = naWierszePunktowZwarciowych(
      [wierszSc({ target_id: 'B1', target_name: 'Szyna 1', ikss_ka: 10, sk_mva: 200 })],
      [wierszSc({ target_id: 'B1', target_name: 'Szyna 1', ikss_ka: 12, sk_mva: 250 })],
    );
    expect(wiersze).toHaveLength(1);
    const w = wiersze[0];
    expect(w.punkt.wartosc).toBe('Szyna 1');
    expect(w.ikssA.wartosc).toBe('10,000');
    expect(w.ikssB.wartosc).toBe('12,000');
    // Δ = 12 - 10 = +2,000; procent = +20,0%
    expect(w.ikssD.wartosc).toBe('+2,000 (+20,0%)');
    expect(w.ikssD.sortKey).toBe(2);
    // Sk w MVA (1 miejsce): 200 → 250, Δ +50,0 (+25,0%)
    expect(w.skA.wartosc).toBe('200,0');
    expect(w.skD.wartosc).toBe('+50,0 (+25,0%)');
  });

  it('punkt tylko w przebiegu A → sufiks „(tylko A)" i puste Δ', () => {
    const wiersze = naWierszePunktowZwarciowych(
      [wierszSc({ target_id: 'ONLYA', target_name: 'Szyna A' })],
      [wierszSc({ target_id: 'B1', target_name: 'Szyna 1' })],
    );
    const wa = wiersze.find((w) => String(w.punkt.wartosc).includes('Szyna A'));
    expect(wa?.punkt.wartosc).toBe(`Szyna A${SZ.tylkoA}`);
    expect(wa?.ikssB.wartosc).toBe(SZ.kreska);
    expect(wa?.ikssD.wartosc).toBe(SZ.kreska);
  });

  it('punkt tylko w przebiegu B → sufiks „(tylko B)"', () => {
    const wiersze = naWierszePunktowZwarciowych(
      [wierszSc({ target_id: 'B1', target_name: 'Szyna 1' })],
      [wierszSc({ target_id: 'ONLYB', target_name: 'Szyna B' })],
    );
    const wb = wiersze.find((w) => String(w.punkt.wartosc).includes('Szyna B'));
    expect(wb?.punkt.wartosc).toBe(`Szyna B${SZ.tylkoB}`);
    expect(wb?.ikssA.wartosc).toBe(SZ.kreska);
  });

  it('null w kontrakcie (brak wielkości) → komórka „—" bez delty', () => {
    const wiersze = naWierszePunktowZwarciowych(
      [wierszSc({ target_id: 'B1', ip_ka: null })],
      [wierszSc({ target_id: 'B1', ip_ka: 30 })],
    );
    expect(wiersze[0].ipA.wartosc).toBe(SZ.kreska);
    expect(wiersze[0].ipD.wartosc).toBe(SZ.kreska);
  });

  it('brak odniesienia (A = 0) → Δ bez procentu (bez zgadywania)', () => {
    const wiersze = naWierszePunktowZwarciowych(
      [wierszSc({ target_id: 'B1', ikss_ka: 0 })],
      [wierszSc({ target_id: 'B1', ikss_ka: 5 })],
    );
    expect(wiersze[0].ikssD.wartosc).toBe('+5,000');
  });

  it('R3-C: komórki A/B niosą dowodRef strony (A:punkt / B:punkt), Δ bez dowodu', () => {
    const w = naWierszePunktowZwarciowych(
      [wierszSc({ target_id: 'B1' })],
      [wierszSc({ target_id: 'B1' })],
    )[0];
    expect(w.ikssA.dowodRef).toBe('A:B1');
    expect(w.ikssB.dowodRef).toBe('B:B1');
    expect(w.skA.dowodRef).toBe('A:B1');
    expect(w.skB.dowodRef).toBe('B:B1');
    // Różnica B−A nie ma pojedynczego wywodu WHITE BOX — delta bez dowodu.
    expect(w.ikssD.dowodRef).toBeUndefined();
    expect(w.skD.dowodRef).toBeUndefined();
  });

  it('R3-C: kreska (brak wartości / punkt bez odpowiednika) nie niesie dowodRef', () => {
    const wiersze = naWierszePunktowZwarciowych(
      [wierszSc({ target_id: 'B1', ip_ka: null })],
      [wierszSc({ target_id: 'B1' }), wierszSc({ target_id: 'ONLYB' })],
    );
    const wspolny = wiersze.find((w) => String(w.punkt.wartosc) === 'Szyna GPZ');
    expect(wspolny?.ipA.dowodRef).toBeUndefined(); // null w kontrakcie
    const tylkoB = wiersze.find((w) => String(w.punkt.wartosc).includes(SZ.tylkoB));
    expect(tylkoB?.ikssA.dowodRef).toBeUndefined(); // strona A bez danych
    expect(tylkoB?.ikssB.dowodRef).toBe('B:ONLYB');
  });

  it('kolejność wierszy deterministyczna — unia identyfikatorów sortowana', () => {
    const wiersze = naWierszePunktowZwarciowych(
      [wierszSc({ target_id: 'Z', target_name: 'Z' }), wierszSc({ target_id: 'A', target_name: 'A' })],
      [wierszSc({ target_id: 'M', target_name: 'M' })],
    );
    expect(wiersze.map((w) => String(w.punkt.wartosc).replace(SZ.tylkoA, '').replace(SZ.tylkoB, ''))).toEqual([
      'A',
      'M',
      'Z',
    ]);
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

describe('zwarciePorownanieModel — pełny bilans IEC 60909 (karta S-C, tryb ekspercki)', () => {
  const bilansA = {
    rk_ohm: 0.3,
    xk_ohm: 0.4,
    zk_ohm: 0.5,
    xr_ratio: 4,
    i2t_ka2s: 121,
  };
  const bilansB = {
    rk_ohm: 0.6,
    xk_ohm: 0.8,
    zk_ohm: 1.0,
    xr_ratio: 2,
    i2t_ka2s: 484,
  };

  it('oba przebiegi z bilansem → trójki A · B · Δ (format PL, jednostki wg kolumn)', () => {
    const w = naWierszePunktowZwarciowych(
      [wierszSc({ target_id: 'B1', ...bilansA })],
      [wierszSc({ target_id: 'B1', ...bilansB })],
    )[0];
    expect(w.rkA.wartosc).toBe('0,3000');
    expect(w.rkB.wartosc).toBe('0,6000');
    expect(w.rkD.wartosc).toBe('+0,3000 (+100,0%)');
    expect(w.xkD.wartosc).toBe('+0,4000 (+100,0%)');
    expect(w.zkD.wartosc).toBe('+0,5000 (+100,0%)');
    expect(w.xrD.wartosc).toBe('-2,000 (-50,0%)');
    expect(w.i2tA.wartosc).toBe('121,000');
    expect(w.i2tD.wartosc).toBe('+363,000 (+300,0%)');
    // Delta bez dowodu (różnica nie ma pojedynczego wywodu WHITE BOX).
    expect(w.rkD.dowodRef).toBeUndefined();
    expect(w.i2tD.dowodRef).toBeUndefined();
    // Wartości A/B niosą dowód właściwego przebiegu (R3-C).
    expect(w.rkA.dowodRef).toBe('A:B1');
    expect(w.i2tB.dowodRef).toBe('B:B1');
  });

  it('starszy wynik bez pól bilansu → uczciwe kreski bez Δ (kontrakt addytywny)', () => {
    const w = naWierszePunktowZwarciowych(
      [wierszSc({ target_id: 'B1' })], // fixture bez pól bilansu (starszy wynik)
      [wierszSc({ target_id: 'B1', ...bilansB })],
    )[0];
    expect(w.rkA.wartosc).toBe(SZ.kreska);
    expect(w.rkB.wartosc).toBe('0,6000');
    expect(w.rkD.wartosc).toBe(SZ.kreska);
    expect(w.xrD.wartosc).toBe(SZ.kreska);
    expect(w.i2tD.wartosc).toBe(SZ.kreska);
    expect(w.rkA.dowodRef).toBeUndefined();
  });
});
