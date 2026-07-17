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

  it('komplet kolumn: punkt + A/B/Δ dla Ik", ip, Ith, Sk (13 kolumn)', () => {
    expect(KOLUMNY_PUNKTOW_ZWARCIOWYCH).toHaveLength(13);
    expect(KOLUMNY_PUNKTOW_ZWARCIOWYCH[0].klucz).toBe('punkt');
    expect(KOLUMNY_PUNKTOW_ZWARCIOWYCH.map((k) => k.klucz)).toContain('ikssD');
    expect(KOLUMNY_PUNKTOW_ZWARCIOWYCH.map((k) => k.klucz)).toContain('skD');
  });
});
