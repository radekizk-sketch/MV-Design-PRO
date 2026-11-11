// @vitest-environment node
/**
 * Kolumny opisów pola przy lewej krawędzi (wzorzec właściciela 2026-11-05: „Opisy pól po lewej
 * dzięki temu pole robi się czytelniejsze i węższe”) — `pasyOpisowPola` i `wierszeOpisowPola`.
 *
 * Iloczyn cech wierszy: {wiersze rozłączne, zachodzące, równej wysokości, łańcuch łączący dwa
 * bloki} × {oznaczenie, same tabliczki, oznaczenie + kilka tabliczek} × {kolejność wejścia wprost,
 * odwrócona}. Przypięty defekt (dawny pas podpisów): Z.11 wykonanie stałe — głowica GK1
 * odgałęzienia i uziemnik Q51 obok niej dawały ten sam prostokąt podpisu, rozwiązywacz zdejmował
 * drugi (aparat bez oznaczenia na schemacie).
 */
import { describe, expect, it } from 'vitest';

import { GRID, snapUp } from '../../core/grid';
import { labelLineHeight, measureLabelWidth } from '../../core/text';
import { pasyOpisowPola, wierszeOpisowPola, type WierszOpisuWejscie } from '../kolumnaOpisowPola';

const H3 = labelLineHeight('t3');
const H4 = labelLineHeight('t4');

const w = (srodekY: number, symbolX = 0, zOznaczeniem = true, liczbaTabliczek = 0): WierszOpisuWejscie => ({
  srodekY,
  symbolX,
  zOznaczeniem,
  liczbaTabliczek,
});

/** Prostokąty pionowe wierszy (oznaczenie i tabliczki) — do sprawdzenia rozłączności. */
function przedzialy(wynik: ReturnType<typeof wierszeOpisowPola>): Array<[number, number]> {
  return wynik.flatMap((r) => [
    ...(r.oznaczenieY === null ? [] : [[r.oznaczenieY - H3 / 2, r.oznaczenieY + H3 / 2] as [number, number]]),
    ...r.tabliczkiY.map((y) => [y - H4 / 2, y + H4 / 2] as [number, number]),
  ]);
}

describe('pasyOpisowPola — szerokości kolumn', () => {
  it('kolumna = najszerszy tekst + oczko, w górę do siatki; kolumna bez treści = 0', () => {
    const pasy = pasyOpisowPola(
      [
        { oznaczenie: 'PF0', tabliczki: [] },
        { oznaczenie: 'GK1', tabliczki: ['1/100'] },
        { oznaczenie: null, tabliczki: ['200–400/5'] },
      ],
      't3',
      't4',
    );
    expect(pasy.oznaczenia).toBe(snapUp(Math.max(measureLabelWidth('PF0', 't3'), measureLabelWidth('GK1', 't3')) + GRID));
    expect(pasy.przekladnie).toBe(snapUp(Math.max(measureLabelWidth('1/100', 't4'), measureLabelWidth('200–400/5', 't4')) + GRID));
    expect(pasy.szerokosc).toBe(pasy.oznaczenia + pasy.przekladnie);
    expect(pasy.oznaczenia % GRID).toBe(0);
    expect(pasy.przekladnie % GRID).toBe(0);
    expect(pasyOpisowPola([{ oznaczenie: 'Q1', tabliczki: [] }], 't3', 't4').przekladnie).toBe(0);
    expect(pasyOpisowPola([], 't3', 't4')).toEqual({ oznaczenia: 0, przekladnie: 0, szerokosc: 0 });
  });
});

describe('wierszeOpisowPola — wiersze kolumn opisów', () => {
  it('wiersze rozłączne — każdy na wysokości swojego symbolu, górna krawędź na siatce', () => {
    const wynik = wierszeOpisowPola([w(100), w(160), w(240)], 't3', 't4');
    for (const [r, y] of [[wynik[0], 100], [wynik[1], 160], [wynik[2], 240]] as const) {
      expect(Math.abs(r.oznaczenieY! - y)).toBeLessThanOrEqual(GRID / 2);
      expect((r.oznaczenieY! - H3 / 2) % GRID).toBe(0);
    }
  });

  it.each([
    ['wprost', false],
    ['odwrócona', true],
  ])('wiersze zachodzące (Z.11 stałe: GK1 i Q51) — rozłączne, przy swoich symbolach (wejście %s)', (_n, odwroc) => {
    // Pomiar sceny Z.11 stałego: Q5 środek 632, GK1 676, Q51 680 (kafel 48 px), T3 712.
    const baza = [w(632, 1976), w(680, 2072), w(676, 1992), w(712, 2032, true, 1)];
    const wejscie = odwroc ? [...baza].reverse() : baza;
    const wynik = wierszeOpisowPola(wejscie, 't3', 't4');
    const wgSrodka = new Map(wejscie.map((x, i) => [x.srodekY, wynik[i]]));
    // Kolejność w bloku wg wysokości symbolu: GK1 (676) nad Q51 (680), oba nad T3 (712).
    expect(wgSrodka.get(676)!.oznaczenieY!).toBeLessThan(wgSrodka.get(680)!.oznaczenieY!);
    expect(wgSrodka.get(680)!.oznaczenieY!).toBeLessThan(wgSrodka.get(712)!.oznaczenieY!);
    // Każdy wiersz najwyżej o wiersz kolumny od środka symbolu.
    for (const [y, r] of wgSrodka) expect(Math.abs(r.oznaczenieY! - y)).toBeLessThanOrEqual(24 + 2 * GRID);
    // Tabliczka T3 w wierszu jego oznaczenia (ta sama górna krawędź).
    expect(wgSrodka.get(712)!.tabliczkiY[0] - H4 / 2).toBe(wgSrodka.get(712)!.oznaczenieY! - H3 / 2);
    // Oznaczenie i tabliczka jednego wiersza stoją w dwóch kolumnach — rozłączność sprawdzamy
    // w kolumnie oznaczeń (oznaczenia między sobą).
    const oznaczenia = wynik.map((r) => r.oznaczenieY!).sort((a, b) => a - b);
    for (let i = 1; i < oznaczenia.length; i += 1) expect(oznaczenia[i] - oznaczenia[i - 1]).toBeGreaterThanOrEqual(H3);
    // Determinizm względem kolejności wejścia.
    const odwrotnie = wierszeOpisowPola([...wejscie].reverse(), 't3', 't4').reverse();
    expect(odwrotnie).toEqual(wynik);
  });

  it('równa wysokość — kolejność wg położenia X symbolu, niezależnie od wejścia', () => {
    const a = w(300, 10);
    const b = w(300, 50);
    const wprost = wierszeOpisowPola([a, b], 't3', 't4');
    const odwrotnie = wierszeOpisowPola([b, a], 't3', 't4');
    expect(wprost[0]).toEqual(odwrotnie[1]);
    expect(wprost[1]).toEqual(odwrotnie[0]);
    expect(wprost[0].oznaczenieY!).toBeLessThan(wprost[1].oznaczenieY!);
    // Blok wyśrodkowany na wspólnym środku: jeden wiersz nad, drugi pod.
    expect(wprost[0].oznaczenieY!).toBeLessThan(300);
    expect(wprost[1].oznaczenieY!).toBeGreaterThan(300);
  });

  it('aparat z kilkoma tabliczkami — tabliczki od górnej krawędzi wiersza, krok w górę do siatki; następny wiersz pod stosem', () => {
    const wynik = wierszeOpisowPola([w(400, 0, true, 2), w(410, 0, true, 0)], 't3', 't4');
    const [t, nast] = wynik;
    expect(t.tabliczkiY).toHaveLength(2);
    expect(t.tabliczkiY[1] - t.tabliczkiY[0]).toBe(snapUp(H4));
    expect(t.tabliczkiY[0] - H4 / 2).toBe(t.oznaczenieY! - H3 / 2);
    // Wiersz następnego aparatu pod stosem tabliczek (nie nachodzi na drugą tabliczkę).
    expect(nast.oznaczenieY! - H3 / 2).toBeGreaterThanOrEqual(t.tabliczkiY[1] + H4 / 2);
  });

  it('aparat bez oznaczenia z tabliczką — wiersz z samą tabliczką; aparat bez opisu — wiersz pusty', () => {
    const wynik = wierszeOpisowPola([w(200, 0, false, 1), w(500, 0, false, 0)], 't3', 't4');
    expect(wynik[0].oznaczenieY).toBeNull();
    expect(wynik[0].tabliczkiY).toHaveLength(1);
    expect(Math.abs(wynik[0].tabliczkiY[0] - 200)).toBeLessThanOrEqual(GRID / 2);
    expect(wynik[1]).toEqual({ oznaczenieY: null, tabliczkiY: [] });
  });

  it('łańcuch: blok scalony dosięga wcześniejszego bloku — wszystkie łączą się w jeden bez nakładania', () => {
    const wynik = wierszeOpisowPola([w(100), w(116), w(120), w(124)], 't3', 't4');
    const p = przedzialy(wynik).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < p.length; i += 1) expect(p[i][0]).toBeGreaterThanOrEqual(p[i - 1][1]);
  });
});
