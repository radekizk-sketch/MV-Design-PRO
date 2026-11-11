/**
 * Litera „M” napędu silnikowego (EN 60617 02-13-26) wyśrodkowana optycznie w okręgu —
 * uwaga właściciela 2026-11-04 (odbiór B-02): „Napęd M — wyśrodkuj literę M, teraz jest jakoś
 * krzywo”. Przyczyna: importer przenosił położenie litery ze źródła QET (0,7 j.św. w lewo i 1,3 j.św.
 * w dół od środka okręgu). Teraz środek TUSZU litery (krój schematu, `dominant-baseline: central`
 * i `text-anchor: middle` w `CadPrimitiveLayer`) = środek okręgu.
 *
 * Iloczyn: każdy symbol z literą w okręgu osprzętu (wyłącznik z napędem, wyłącznik wysuwny
 * z napędem) × LOD {0, 1, 2}: na LOD2 litera jest i leży w środku okręgu (≤ 0,5 j.św. w obu osiach),
 * na LOD1 i LOD0 napęd jest DETALEM zdjętym wg `DETALE_KAFLA_WG_LOD` (nie pomniejszonym). Iniekcja
 * przesunięcia litery o 1 j.św. — czerwona.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QET_SYMBOLE_POLA_SN, type QetSymbolPolaSnId } from '../../cad/qet/qetPoleSn';
import { WAGA_LITERY_SYMBOLU } from '../../cad/CadSymbol';
import { przesuniecieBazyCentralnej, zasiegPionowyTuszu } from '../../core/text';
import { DARK_SCADA_SLD_PALETTE } from '../../theme/colorTokens';
import { SYMBOL_GLYPHS } from '../glyphs';

const TOLERANCJA = 0.5;

/** Odchyłka środka tuszu litery od środka okręgu [j.św.] (x, y) — wyrocznia z metryk kroju. */
function odchylka(litera: { x: number; y: number; t: string; size: number }, okrag: { cx: number; cy: number }): [number, number] {
  const baza = litera.y + przesuniecieBazyCentralnej(litera.size);
  const tusz = zasiegPionowyTuszu(litera.t, litera.size, WAGA_LITERY_SYMBOLU);
  const srodekY = baza + (tusz.gora + tusz.dol) / 2;
  return [litera.x - okrag.cx, srodekY - okrag.cy];
}

const Z_LITERA = (Object.keys(QET_SYMBOLE_POLA_SN) as QetSymbolPolaSnId[]).filter((id) =>
  QET_SYMBOLE_POLA_SN[id].osprzet.some((p) => p.k === 'letter'),
);

describe('litera napędu „M” — środek okręgu, iloczyn rodzina × LOD', () => {
  it('warunek wstępny: wyłącznik z napędem i wyłącznik wysuwny z napędem niosą literę w okręgu', () => {
    expect(Z_LITERA).toEqual(expect.arrayContaining(['qetBreakerZNapedem', 'qetBreakerWysuwnyZNapedem']));
  });

  for (const id of Z_LITERA) {
    for (const lod of [0, 1, 2] as const) {
      it(`${id} · LOD${lod}`, () => {
        const Glyph = SYMBOL_GLYPHS[id];
        const markup = renderToStaticMarkup(
          <svg xmlns="http://www.w3.org/2000/svg">
            <Glyph x={0} y={0} state="closed" stroke="#123456" kafleStanu={DARK_SCADA_SLD_PALETTE.state} lod={lod} />
          </svg>,
        );
        const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
        const osprzet = doc.querySelector('[data-qet="osprzet"]');
        if (lod !== 2) {
          expect(osprzet, 'napęd zdjęty jako detal').toBeNull();
          return;
        }
        const t = osprzet!.querySelector('text')!;
        const c = osprzet!.querySelector('circle')!;
        expect(t.getAttribute('text-anchor')).toBe('middle');
        expect(t.getAttribute('dominant-baseline')).toBe('central');
        const [dx, dy] = odchylka(
          { x: Number(t.getAttribute('x')), y: Number(t.getAttribute('y')), t: t.textContent ?? '', size: Number(t.getAttribute('font-size')) },
          { cx: Number(c.getAttribute('cx')), cy: Number(c.getAttribute('cy')) },
        );
        expect(Math.abs(dx), 'poziom').toBeLessThanOrEqual(TOLERANCJA);
        expect(Math.abs(dy), 'pion').toBeLessThanOrEqual(TOLERANCJA);
        // Okrąg napędu cały w gabarycie symbolu (nie ucięty półokrąg).
        const r = Number(c.getAttribute('r'));
        const s = QET_SYMBOLE_POLA_SN[id];
        expect(Number(c.getAttribute('cx')) - r).toBeGreaterThanOrEqual(0);
        expect(Number(c.getAttribute('cy')) - r).toBeGreaterThanOrEqual(0);
        expect(Number(c.getAttribute('cy')) + r).toBeLessThanOrEqual(s.wysokosc);
      });
    }
  }

  it('iniekcja: litera przesunięta o 1 j.św. (dawne położenie ze źródła) — czerwona', () => {
    for (const id of Z_LITERA) {
      const s = QET_SYMBOLE_POLA_SN[id];
      const lit = s.osprzet.find((p) => p.k === 'letter')!;
      const okr = s.osprzet.find((p) => p.k === 'circle')!;
      if (lit.k !== 'letter' || okr.k !== 'circle') throw new Error('osprzęt bez litery w okręgu');
      const [dx0, dy0] = odchylka({ ...lit }, okr);
      expect(Math.max(Math.abs(dx0), Math.abs(dy0))).toBeLessThanOrEqual(TOLERANCJA);
      const [, dy1] = odchylka({ ...lit, y: lit.y + 1 }, okr);
      expect(Math.abs(dy1)).toBeGreaterThan(TOLERANCJA);
      const [dx2] = odchylka({ ...lit, x: lit.x - 0.7 }, okr);
      expect(Math.abs(dx2)).toBeGreaterThan(TOLERANCJA);
    }
  });
});
