/*
 * Testy modelu prezentacji okna „Analizy akademickie" (ui2/wyniki/akademickie).
 *
 * Pilnują MOCNEJ DEKLARACJI modelu: spłaszczenie wyniku jest PEŁNE — liczba wierszy
 * równa się liczbie liści ładunku, niezależnie od rozmiaru, głębokości i długości
 * tablic. To jest strażnik trzech zaszytych limitów powierzchni zastanej
 * (`slice(0,18)` wierszy, `slice(0,8)` zagnieżdżeń, `slice(0,6)` pól pierwszego
 * elementu tablicy) — bez niego regresja „limit z powrotem w kodzie" byłaby
 * niewidzialna, bo dzisiejsze ładunki solvera mieszczą się poniżej części progów.
 *
 * Ładunki testowe są ILOCZYNEM CECH, nie przykładem z karty: płytki × głęboki,
 * krótka tablica × długa tablica, mało pól × dużo pól.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { at } from '../../../../test/arrayAt';

import {
  ETYKIETY_METRYK_RAPORTU,
  POLITYKI_EKSPORTU_RAPORTU,
  krokiDowoduDoWidoku,
  krokiSladuDoWidoku,
  liczbaKrokowSladuRaportu,
  splaszczWynik,
  wierszeAudytoweRaportu,
} from '../model';
import type { KrokDowodu, KrokSladu, RaportAnalizy } from '../api';

/** Liczy liście ładunku niezależnie od modelu (druga, prostsza implementacja). */
function policzLiscie(wartosc: unknown): number {
  if (Array.isArray(wartosc)) {
    return wartosc.length === 0 ? 1 : wartosc.reduce<number>((n, x) => n + policzLiscie(x), 0);
  }
  if (typeof wartosc === 'object' && wartosc !== null) {
    const klucze = Object.keys(wartosc as Record<string, unknown>);
    if (klucze.length === 0) return 1;
    return klucze.reduce<number>(
      (n, k) => n + policzLiscie((wartosc as Record<string, unknown>)[k]),
      0,
    );
  }
  return 1;
}

describe('splaszczWynik — pełne spłaszczenie (limit z danych, nie ze stałej)', () => {
  it('ładunek płaski: wiersz na każde pole', () => {
    const payload = { a: 1, b: 'x', c: true, d: null };
    const wiersze = splaszczWynik(payload);
    expect(wiersze).toHaveLength(4);
    expect(wiersze.map((w) => w.sciezka)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ponad 18 pól najwyższego poziomu — żaden wiersz nie ginie (próg 18 zastanej)', () => {
    const payload: Record<string, number> = {};
    for (let i = 0; i < 40; i += 1) payload[`pole_${i}`] = i;
    const wiersze = splaszczWynik(payload);
    expect(wiersze).toHaveLength(40);
    expect(at(wiersze, -1)?.sciezka).toBe('pole_39');
  });

  it('zagnieżdżenie głębsze niż 8 poziomów — komplet liści (próg 8 zastanej)', () => {
    let payload: Record<string, unknown> = { najglebszy: 42 };
    for (let i = 0; i < 12; i += 1) payload = { [`poziom_${i}`]: payload };
    const wiersze = splaszczWynik(payload);
    expect(wiersze).toHaveLength(1);
    expect(wiersze[0].sciezka.split('.')).toHaveLength(13);
    expect(wiersze[0].wartosc).toBe(42);
  });

  it('tablica obiektów: KAŻDY element i KAŻDE pole (próg 6 pól pierwszego elementu)', () => {
    const payload = {
      pozycje: [
        { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 },
        { a: 9, b: 10, c: 11, d: 12, e: 13, f: 14, g: 15, h: 16 },
        { a: 17, b: 18, c: 19, d: 20, e: 21, f: 22, g: 23, h: 24 },
      ],
    };
    const wiersze = splaszczWynik(payload);
    expect(wiersze).toHaveLength(24);
    expect(wiersze.map((w) => w.sciezka)).toContain('pozycje[2].h');
  });

  it('iloczyn cech: dużo pól × głębokie zagnieżdżenie × długa tablica', () => {
    const widmo = Array.from({ length: 50 }, (_, i) => ({
      harmonic: i + 1,
      magnitude_percent: i * 0.1,
      angle_deg: i,
    }));
    const payload = {
      podsumowanie: { thd_u_percent: 3.2, limit_percent: 8, spelnione: true },
      wezly: {
        szyna_1: { widmo, sanity: { ok: true, powody: [] } },
        szyna_2: { widmo, sanity: { ok: false, powody: ['brak danych', 'poza zakresem'] } },
      },
    };
    const wiersze = splaszczWynik(payload);
    expect(wiersze).toHaveLength(policzLiscie(payload));
    expect(wiersze.length).toBeGreaterThan(300);
  });

  it('puste kolekcje nie znikają — mają własny wiersz', () => {
    const wiersze = splaszczWynik({ pusta_lista: [], pusty_obiekt: {}, wartosc: 1 });
    expect(wiersze.map((w) => w.sciezka)).toEqual(['pusta_lista', 'pusty_obiekt', 'wartosc']);
  });

  it('brak ładunku → brak wierszy (bez fabrykacji „—")', () => {
    expect(splaszczWynik(null)).toEqual([]);
    expect(splaszczWynik(undefined)).toEqual([]);
  });
});

describe('ślad / dowód / raport — bez limitu po stronie okna', () => {
  function krokSladu(n: number): KrokSladu {
    return {
      step: n,
      key: `krok_${n}`,
      formula: 'a = b',
      data: {},
      substitution: `${n}`,
      result: { wartosc: n },
      unit_check: '-',
      proof_ref: `proof:v126:test:${n}`,
      proof_status: 'complete',
      reporting_status: 'reportable',
    };
  }

  function krokDowodu(n: number): KrokDowodu {
    return {
      ordinal: n,
      proof_ref: `proof:v126:test:${n}`,
      formula: 'a = b',
      data: {},
      substitution: `${n}`,
      result: { wartosc: n },
      unit_check: '-',
      proof_status: 'complete',
    };
  }

  it('ślad dłuższy niż 8 kroków przechodzi w całości (próg 8 zastanej)', () => {
    const kroki = Array.from({ length: 25 }, (_, i) => krokSladu(i + 1));
    expect(krokiSladuDoWidoku(kroki)).toHaveLength(25);
    expect(at(krokiSladuDoWidoku(kroki), -1)?.step).toBe(25);
  });

  it('dowód dłuższy niż 8 kroków przechodzi w całości', () => {
    const kroki = Array.from({ length: 17 }, (_, i) => krokDowodu(i + 1));
    expect(krokiDowoduDoWidoku(kroki)).toHaveLength(17);
  });

  // Zmiana kanonu (karta #145, `AcademicReportV2`): raport niesie tożsamość dowodu i audyt
  // deterministyczny. Intencja „bez limitu po stronie okna" zostaje: KAŻDA metryka KAŻDEJ
  // sekcji staje się wierszem „Informacji audytowych" (liczba wierszy = 2 + liczba metryk).
  it('raport: każda metryka każdej sekcji trafia do informacji audytowych, bez ucinania', () => {
    const raport: RaportAnalizy = {
      contract: 'AcademicReportV2',
      report_id: 'report:v126:test:abc',
      run_id: 'run',
      case_id: 'case',
      analysis_type: 'voltage_stability',
      source_result_hash: 'h1',
      source_proof_hash: 'h2',
      export_policy: 'frozen_result_and_proof_only',
      sections: [
        {
          section_id: 'dowod',
          title: 'Dowód obliczeń',
          metrics: [
            { label: 'proof_id', value: 'proof:x' },
            { label: 'proof_hash', value: 'h2' },
            { label: 'trace_step_count', value: 25 },
          ],
        },
        {
          section_id: 'audyt',
          title: 'Audyt deterministyczny',
          metrics: [
            { label: 'result_hash', value: 'h1' },
            { label: 'solver_version', value: 'v1' },
            { label: 'input_hash', value: null },
          ],
        },
      ],
      report_hash: 'h3',
    };
    const wiersze = wierszeAudytoweRaportu(raport);
    expect(wiersze).toHaveLength(2 + 6);
    wiersze.forEach((wiersz) => expect(wiersz.etykieta).not.toMatch(/\b[a-z]+_[a-z_]+\b/));
    expect(liczbaKrokowSladuRaportu(raport)).toBe(25);
    expect(liczbaKrokowSladuRaportu({ ...raport, sections: [] })).toBeNull();
  });
});

/**
 * Parytet słowników raportu z KODEM backendu (`application/v126_artifacts.py`): każdy
 * stały klucz metryki raportu i polityka eksportu mają polską etykietę — i odwrotnie.
 */
describe('słowniki raportu V12.6 — parytet z budowniczym raportu backendu', () => {
  const ZRODLO = readFileSync(
    join(process.cwd(), '..', 'backend', 'src', 'application', 'v126_artifacts.py'),
    'utf-8',
  );

  it('klucze metryk raportu = etykiety ETYKIETY_METRYK_RAPORTU', () => {
    const klucze = new Set([...ZRODLO.matchAll(/\{"label": "([a-z_]+)"/g)].map((m) => m[1]));
    expect([...klucze].sort()).toEqual(Object.keys(ETYKIETY_METRYK_RAPORTU).sort());
  });

  it('polityka eksportu raportu = POLITYKI_EKSPORTU_RAPORTU', () => {
    const polityki = new Set([...ZRODLO.matchAll(/"export_policy": "([a-z_]+)"/g)].map((m) => m[1]));
    expect([...polityki].sort()).toEqual(Object.keys(POLITYKI_EKSPORTU_RAPORTU).sort());
  });
});
