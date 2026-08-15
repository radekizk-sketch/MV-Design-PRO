/**
 * S9-1 — ŁAMANIE ARKUSZA, warstwa planera (`layout/sheetRows.ts`).
 * Karta S9-1, decyzja `docs/sld/DECYZJA_LAMANIE_ARKUSZA.md`, audyt C-1.
 *
 * Testy są ILOCZYNEM CECH, nie przykładem z karty (reguła KLASA §2):
 * {ciąg bez odgałęzień × ciąg z odgałęzieniami} ×
 * {arkusz mieszczący się w proporcji × arkusz wymagający łamania} ×
 * {stacje równej szerokości × stacja szersza od budżetu}.
 */
import { describe, expect, it } from 'vitest';

import {
  planSheetRows,
  SHEET_MAX_ASPECT,
  SHEET_TARGET_ASPECT,
  SHEET_WIDTH_QUANTUM,
  type PlanSheetRowsInput,
} from '../sheetRows';

/** Wysokość pasm proporcjonalna do liczby stacji podciągu — imituje
 *  `computeBands` (max po stacjach + stała), zachowując monotoniczność. */
const stalaWysokosc = (h: number) => (): number => h;

function wejscie(over: Partial<PlanSheetRowsInput> = {}): PlanSheetRowsInput {
  return {
    columnWidths: Array.from({ length: 40 }, () => 1000),
    columnGap: 32,
    rowBandHeight: stalaWysokosc(700),
    rowGap: 32,
    laterals: [],
    ...over,
  };
}

describe('S9-1 planSheetRows — łamanie na wiersze arkusza', () => {
  it('ciąg pusty: zero wierszy, zero proporcji (bez wyjątku)', () => {
    const plan = planSheetRows(wejscie({ columnWidths: [] }));
    expect(plan.rowCount).toBe(0);
    expect(plan.rows).toEqual([]);
    expect(plan.rowOfStation).toEqual([]);
  });

  it('krótki ciąg mieszczący się w proporcji NIE jest łamany (jeden wiersz)', () => {
    // 2 stacje × 1000 px przy WYSOKIM paśmie (2000 px) → proporcja ≈ 1 : 1,
    // czyli arkusz i tak jest normowy — łamanie byłoby szkodą, nie naprawą.
    const plan = planSheetRows(
      wejscie({ columnWidths: [1000, 1000], rowBandHeight: stalaWysokosc(2000) }),
    );
    expect(plan.rowCount).toBe(1);
    expect(plan.rows).toEqual([{ start: 0, endExclusive: 2 }]);
  });

  it('ciąg o proporcji POWYŻEJ progu odbioru JEST łamany, choćby był krótki (2 stacje w pasie 2,8 : 1)', () => {
    const plan = planSheetRows(wejscie({ columnWidths: [1000, 1000] }));
    expect(plan.rowCount).toBeGreaterThan(1);
  });

  it('długi ciąg JEST łamany i proporcja przewidziana mieści się w progu odbioru', () => {
    const plan = planSheetRows(wejscie());
    expect(plan.rowCount).toBeGreaterThan(1);
    expect(plan.predictedAspect).toBeLessThanOrEqual(SHEET_TARGET_ASPECT);
    expect(plan.predictedAspect).toBeLessThanOrEqual(SHEET_MAX_ASPECT);
  });

  it('podział POKRYWA cały ciąg, wiersze są niepuste i rozłączne (żadna stacja nie ginie i nie dubluje się)', () => {
    for (const n of [1, 2, 7, 13, 40, 97]) {
      const plan = planSheetRows(wejscie({ columnWidths: Array.from({ length: n }, (_, i) => 400 + (i % 5) * 300) }));
      const odtworzone = plan.rows.flatMap((r) => Array.from({ length: r.endExclusive - r.start }, (_, i) => r.start + i));
      expect(odtworzone).toEqual(Array.from({ length: n }, (_, i) => i));
      for (const r of plan.rows) expect(r.endExclusive).toBeGreaterThan(r.start);
      expect(plan.rowOfStation).toHaveLength(n);
    }
  });

  it('PUNKT ŁAMANIA leży na przęśle — nigdy „wewnątrz" stacji (granice wiersza to zawsze indeksy stacji)', () => {
    const plan = planSheetRows(wejscie());
    // Granice są liczbami CAŁKOWITYMI z zakresu indeksów stacji, a każda stacja
    // należy do DOKŁADNIE jednego wiersza — czyli podział przecina ciąg między
    // stacjami (na segmencie magistrali), nigdy w środku bloku stacji.
    for (const r of plan.rows) {
      expect(Number.isInteger(r.start)).toBe(true);
      expect(Number.isInteger(r.endExclusive)).toBe(true);
    }
    const przypisania = new Map<number, number>();
    plan.rows.forEach((r, i) => {
      for (let s = r.start; s < r.endExclusive; s++) {
        expect(przypisania.has(s)).toBe(false);
        przypisania.set(s, i);
      }
    });
    expect(przypisania.size).toBe(plan.rowOfStation.length);
    plan.rowOfStation.forEach((row, s) => expect(przypisania.get(s)).toBe(row));
  });

  it('stacja SZERSZA od budżetu stoi w wierszu sama (stacji nie wolno dzielić)', () => {
    const plan = planSheetRows(
      wejscie({ columnWidths: [500, 40000, 500, 500], rowBandHeight: stalaWysokosc(700) }),
    );
    const wierszSzerokiej = plan.rows.find((r) => r.start <= 1 && 1 < r.endExclusive)!;
    expect(wierszSzerokiej.endExclusive - wierszSzerokiej.start).toBe(1);
  });

  it('PREFIKSOWOŚĆ: dopisanie stacji na końcu nie rusza wierszy sprzed miejsca zmiany (ten sam format arkusza)', () => {
    const base = Array.from({ length: 40 }, () => 1000);
    const przed = planSheetRows(wejscie({ columnWidths: base }));
    const po = planSheetRows(wejscie({ columnWidths: [...base, 1000] }));
    // Format (kwant) się nie zmienił, więc wiersze przed ostatnim są identyczne.
    expect(po.rowCount).toBe(przed.rowCount);
    for (let i = 0; i < przed.rowCount - 1; i++) expect(po.rows[i]).toEqual(przed.rows[i]);
  });

  it('KWANTOWANIE FORMATU gryzie: budżet jest wielokrotnością kwantu, więc drobna zmiana treści nie przelewa arkusza', () => {
    const base = Array.from({ length: 40 }, () => 1000);
    const przed = planSheetRows(wejscie({ columnWidths: base }));
    // Zmiana jednej kolumny o mniej niż kwant NIE zmienia podziału.
    const drobna = [...base];
    drobna[7] += SHEET_WIDTH_QUANTUM / 8;
    expect(planSheetRows(wejscie({ columnWidths: drobna })).rows).toEqual(przed.rows);
  });

  it('ODGAŁĘZIENIA wchodzą do miary: to samo drzewo magistrali, ale z odgałęzieniami, daje arkusz NIE WĘŻSZY i NIE NIŻSZY', () => {
    const bez = planSheetRows(wejscie());
    const z = planSheetRows(
      wejscie({
        laterals: [
          { stationIndex: 3, width: 6000, height: 400 },
          { stationIndex: 21, width: 6000, height: 400 },
        ],
      }),
    );
    expect(z.predictedWidth).toBeGreaterThanOrEqual(bez.predictedWidth);
    expect(z.predictedHeight).toBeGreaterThanOrEqual(bez.predictedHeight);
    expect(z.predictedAspect).toBeLessThanOrEqual(SHEET_MAX_ASPECT);
  });

  it('BLOK ZASILANIA (leadWidth) obciąża TYLKO wiersz 0 — nie zawęża pozostałych', () => {
    const bez = planSheetRows(wejscie({ columnWidths: Array.from({ length: 12 }, () => 1000) }));
    const z = planSheetRows(wejscie({ columnWidths: Array.from({ length: 12 }, () => 1000), leadWidth: 4000 }));
    expect(z.rows[0].endExclusive).toBeLessThanOrEqual(bez.rows[0].endExclusive);
  });

  it('DETERMINIZM: dwa wywołania na tym samym wejściu dają identyczny plan', () => {
    const input = wejscie({ laterals: [{ stationIndex: 5, width: 3000, height: 500 }] });
    expect(planSheetRows(input)).toEqual(planSheetRows(input));
  });

  it('kolejność `laterals` na wejściu NIE zmienia planu (grupowanie po indeksie stacji, nie po pozycji w tablicy)', () => {
    const laterals = [
      { stationIndex: 5, width: 3000, height: 500 },
      { stationIndex: 2, width: 1500, height: 300 },
      { stationIndex: 30, width: 2000, height: 700 },
    ];
    const a = planSheetRows(wejscie({ laterals }));
    const b = planSheetRows(wejscie({ laterals: [...laterals].reverse() }));
    expect(b).toEqual(a);
  });
});
