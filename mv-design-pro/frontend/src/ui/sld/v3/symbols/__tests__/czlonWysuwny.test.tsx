/**
 * Człon wysuwny wyłącznika — decyzja właściciela 2026-11-04 (odbiór B-02, synoptyka e²TANGO):
 * TRZY kafle w pionie stykające się krawędziami, ta sama szerokość — górny kafel członu
 * z szewronem ˄˄, kafel wyłącznika z „×", dolny kafel członu z szewronem ˅˅; tor przechodzi
 * przez wszystkie trzy. Kolor kafli członu = stan członu (położenie członu), kolor kafla
 * wyłącznika = stan wyłącznika — dwa niezależne stany. Napęd M zostaje w kaflu wyłącznika.
 * Na LOD0 trzy kafle zostają (kształt).
 *
 * Iloczyn cech: rodzaj wyłącznika {stały, stały z napędem, wysuwny, wysuwny z napędem} ×
 * położenie członu {zamknięty, otwarty, nieustalony, błędny, brak danych} × stan wyłącznika
 * {zamknięty, otwarty, nieustalony, uziemiony (nie jest położeniem wyłącznika ⇒ nieustalony),
 * błędny, brak stanu} × LOD {0, 1, 2} × motyw {ciemny, jasny}.
 * Wyrocznia: wysuwny ⇒ 3 kafle, niewysuwny ⇒ 1 kafel; kolor kafli członu z tabeli motywu dla
 * położenia członu (brak danych ⇒ nieustalony — model ENM nie niesie położenia członu), kolor
 * kafla wyłącznika z tabeli dla stanu wyłącznika; przy różnych stanach kolory różne.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { QET_BOK_KAFLA_STANU, QET_SYMBOLE_POLA_SN, type QetSymbolPolaSnId } from '../../cad/qet/qetPoleSn';
import { SYMBOL_GLYPHS, stanKaflaLacznika, type SwitchState } from '../glyphs';
import { DARK_SCADA_SLD_PALETTE, STANY_KAFLA, type StanKafla } from '../../theme/colorTokens';
import { LIGHT_TECHNICAL_SLD_PALETTE } from '../../theme/palette';

const MOTYWY = [
  ['ciemny', DARK_SCADA_SLD_PALETTE.state],
  ['jasny', LIGHT_TECHNICAL_SLD_PALETTE.state],
] as const;
const WYLACZNIKI: readonly [QetSymbolPolaSnId, boolean][] = [
  ['qetBreaker', false],
  ['qetBreakerZNapedem', false],
  ['qetBreakerWysuwny', true],
  ['qetBreakerWysuwnyZNapedem', true],
];
const STANY_WYLACZNIKA: readonly (SwitchState | undefined)[] = ['closed', 'open', 'unknown', 'earthed', 'bad', undefined];
const POLOZENIA_CZLONU: readonly (StanKafla | undefined)[] = [...STANY_KAFLA, undefined];

interface Kafel {
  readonly rola: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fill: string;
}

function kafle(markup: string): Kafel[] {
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, 'image/svg+xml');
  return [...doc.querySelectorAll('rect[data-kafel]')].map((r) => ({
    rola: r.getAttribute('data-kafel')!,
    x: Number(r.getAttribute('x')),
    y: Number(r.getAttribute('y')),
    width: Number(r.getAttribute('width')),
    height: Number(r.getAttribute('height')),
    fill: r.getAttribute('fill')!,
  }));
}

describe('człon wysuwny: trzy kafle, dwa niezależne stany (decyzja właściciela 2026-11-04)', () => {
  for (const [id, wysuwny] of WYLACZNIKI) {
    for (const [motyw, paleta] of MOTYWY) {
      for (const lod of [0, 1, 2] as const) {
        it(`${id} × ${motyw} × LOD${lod}: ${wysuwny ? '3 kafle' : '1 kafel'}, kolory członu i wyłącznika z własnych stanów`, () => {
          const Glyph = SYMBOL_GLYPHS[id];
          for (const stanW of STANY_WYLACZNIKA) {
            for (const polozenie of POLOZENIA_CZLONU) {
              const k = kafle(renderToStaticMarkup(<Glyph x={0} y={0} state={stanW} kafleStanu={paleta} lod={lod} stanCzlonu={polozenie} />));
              const opis = `${stanW ?? 'brak'} / człon ${polozenie ?? 'brak danych'}`;
              const tlo = k.filter((x) => x.rola === 'tlo');
              const gora = k.filter((x) => x.rola === 'czlon-gora');
              const dol = k.filter((x) => x.rola === 'czlon-dol');
              expect(tlo.length, opis).toBe(1);
              expect(tlo[0].fill, `${opis}: kafel wyłącznika = stan wyłącznika`).toBe(paleta[stanKaflaLacznika(id, stanW)!]);
              if (!wysuwny) {
                expect(gora.length + dol.length, `${opis}: niewysuwny — jeden kafel`).toBe(0);
                continue;
              }
              expect([gora.length, dol.length], opis).toEqual([1, 1]);
              const oczekiwanyCzlon = paleta[polozenie ?? 'nieustalony'];
              for (const c of [gora[0], dol[0]]) {
                expect(c.fill, `${opis}: kafel członu = położenie członu`).toBe(oczekiwanyCzlon);
                expect([c.x, c.width], `${opis}: ta sama szerokość`).toEqual([tlo[0].x, tlo[0].width]);
                expect(c.width, opis).toBe(QET_BOK_KAFLA_STANU);
              }
              // Kafle stykają się krawędziami: góra → wyłącznik → dół, cały gabaryt symbolu.
              expect(gora[0].y + gora[0].height, `${opis}: górny styka się z wyłącznikiem`).toBe(tlo[0].y);
              expect(tlo[0].y + tlo[0].height, `${opis}: wyłącznik styka się z dolnym`).toBe(dol[0].y);
              expect([gora[0].y, dol[0].y + dol[0].height], opis).toEqual([0, QET_SYMBOLE_POLA_SN[id].wysokosc]);
              // Dwa niezależne stany: inne położenie członu niż stan wyłącznika ⇒ inny kolor.
              if ((polozenie ?? 'nieustalony') !== stanKaflaLacznika(id, stanW)) {
                expect(oczekiwanyCzlon, `${opis}: stany rozróżnialne`).not.toBe(tlo[0].fill);
              }
            }
          }
        });
      }
    }
  }

  it('tor przechodzi przez trzy kafle: przewody symbolu wysuwnego pokrywają oś od portu górnego do dolnego', () => {
    for (const [id, wysuwny] of WYLACZNIKI) {
      if (!wysuwny) continue;
      const s = QET_SYMBOLE_POLA_SN[id];
      const os = s.szerokosc / 2;
      const odcinki = [...s.przewody, ...(s.czlon?.przewody ?? []), ...(s.noz?.prymitywy ?? [])]
        .filter((p): p is Extract<typeof p, { k: 'line' }> => p.k === 'line' && p.x1 === os && p.x2 === os)
        .map((p) => [Math.min(p.y1, p.y2), Math.max(p.y1, p.y2)] as const)
        .sort((a, b) => a[0] - b[0]);
      // Pasmo górne i dolne członu: przewód przez cały kafel członu.
      expect(odcinki.some(([a, b]) => a === 0 && b >= s.czlon!.pasmo), `${id}: przewód przez górny kafel`).toBe(true);
      expect(odcinki.some(([a, b]) => a <= s.wysokosc - s.czlon!.pasmo && b === s.wysokosc), `${id}: przewód przez dolny kafel`).toBe(true);
    }
  });

  it('warunek rozróżnialności: kolory pięciu stanów kafla parami różne w obu motywach', () => {
    // Iniekcja produkcyjna (zapisana w meldunku karty): kafle członu malowane kolorem stanu
    // wyłącznika (`kafle[stan]` zamiast `kafle[stanCzlonu]`) — 12 testów iloczynu wyżej czerwonych.
    for (const [motyw, paleta] of MOTYWY) {
      expect(new Set(STANY_KAFLA.map((s) => paleta[s])).size, motyw).toBe(STANY_KAFLA.length);
    }
  });
});
