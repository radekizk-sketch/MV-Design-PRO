/**
 * KRAWĘDŹ ZACZEPU slotu etykiety zakotwiczonej (karta UX-04/POLE-LINIOWE-WZORZEC, decyzja
 * §11.7 pkt 8; `prostokatEtykietyZakotwiczonej`).
 *
 * Iloczyn cech: strona {left, right, above, below} × wyrównanie wytwórcy {brak, początek,
 * koniec} × prześwit {domyślny, jawny} × treść o różnej szerokości (wąska, cyfry, wielkie
 * litery, długa) × położenie kotwicy {na siatce, poza siatką}. Dla każdej kombinacji:
 * prostokąt ma szerokość tuszu (`measureLabelWidth`, BLOK-PUSTY §1 — plan czytelności liczy
 * ten sam prostokąt), a krawędź zaczepu (ta, w której render kotwiczy tekst) leży na siatce
 * w punkcie wyznaczonym wyłącznie przez kotwicę (spec §2) — niezależnie od szerokości tekstu.
 * Konsekwencja przypięta osobno: kolumna podpisów o różnych szerokościach przy tej samej
 * kotwicy ma jedną krawędź zaczepu.
 */
import { describe, expect, it } from 'vitest';

import { GRID, snapDown, snapToGrid } from '../../core/grid';
import { measureLabelWidth } from '../../core/text';
import { prostokatEtykietyZakotwiczonej, type SimpleAnchorPlacement, type WyrownanieTekstu } from '../labels';

const STRONY: readonly SimpleAnchorPlacement[] = ['left', 'right', 'above', 'below'];
const WYROWNANIA: readonly (WyrownanieTekstu | undefined)[] = [undefined, 'poczatek', 'koniec'];
const PRZESWITY: readonly (number | undefined)[] = [undefined, 16];
const TRESCI = ['Q1', 'PF1', '79', 'WWM', 'Odłącznik szynowy Q1 · 630 A'];
const KOTWICE = [
  { x: 96, y: 200 },
  { x: 101, y: 203 },
];

describe('prostokatEtykietyZakotwiczonej — krawędź zaczepu na siatce z kotwicy, prostokąt = tusz', () => {
  it('iloczyn strona × wyrównanie × prześwit × treść × kotwica', () => {
    let przypadki = 0;
    for (const placement of STRONY) {
      for (const wyrownanieTekstu of WYROWNANIA) {
        for (const clearance of PRZESWITY) {
          for (const text of TRESCI) {
            for (const anchor of KOTWICE) {
              const r = prostokatEtykietyZakotwiczonej({ text, labelClass: 't3', anchor, placement, clearance, wyrownanieTekstu });
              const opis = `${placement}/${wyrownanieTekstu}/${clearance}/„${text}”/${anchor.x}`;
              const szerokosc = measureLabelWidth(text, 't3');
              const przeswit = clearance ?? GRID;
              expect(r.width, `${opis}: prostokąt = szerokość tuszu`).toBe(szerokosc);
              const naSiatce = (v: number): boolean => Math.abs(v % GRID) === 0;
              if (placement === 'left') {
                const prawa = (clearance === undefined ? snapToGrid : snapDown)(anchor.x - przeswit);
                expect(r.x + r.width, `${opis}: prawa krawędź = siatka(kotwica − prześwit)`).toBe(prawa);
                expect(r.x + r.width, `${opis}: prześwit od kotwicy ≥ zadeklarowany`).toBeLessThanOrEqual(clearance === undefined ? anchor.x - przeswit + GRID / 2 : anchor.x - przeswit);
                expect(naSiatce(r.x + r.width), `${opis}: krawędź zaczepu na siatce`).toBe(true);
              } else if (placement === 'right') {
                expect(r.x, `${opis}: lewa krawędź = siatka(kotwica + prześwit)`).toBe(snapToGrid(anchor.x + przeswit));
              } else if (wyrownanieTekstu === 'koniec') {
                expect(r.x + r.width, `${opis}: prawa krawędź = siatka(kotwica)`).toBe(snapToGrid(anchor.x));
                expect(naSiatce(r.x + r.width), `${opis}: krawędź zaczepu na siatce`).toBe(true);
              } else if (wyrownanieTekstu === 'poczatek') {
                expect(r.x, `${opis}: lewa krawędź = siatka(kotwica)`).toBe(snapToGrid(anchor.x));
              } else {
                expect(r.x, `${opis}: wyśrodkowany na kotwicy`).toBe(snapToGrid(anchor.x - szerokosc / 2));
              }
              przypadki += 1;
            }
          }
        }
      }
    }
    expect(przypadki).toBe(4 * 3 * 2 * 5 * 2);
  });

  it('kolumna podpisów po lewej (różne szerokości, ta sama kotwica) — jedna prawa krawędź', () => {
    const prawe = TRESCI.map((text) => {
      const r = prostokatEtykietyZakotwiczonej({ text, labelClass: 't3', anchor: { x: 96, y: 0 }, placement: 'left' });
      return r.x + r.width;
    });
    expect(new Set(prawe)).toEqual(new Set([96 - GRID]));
  });

  it('wiersze prawo-dosunięte pod okręgiem (below + koniec) — jedna prawa krawędź rezerwacji', () => {
    const prawe = TRESCI.map((text) => {
      const r = prostokatEtykietyZakotwiczonej({ text, labelClass: 't4', anchor: { x: 200, y: 0 }, placement: 'below', wyrownanieTekstu: 'koniec' });
      return r.x + r.width;
    });
    expect(new Set(prawe)).toEqual(new Set([200]));
  });
});
