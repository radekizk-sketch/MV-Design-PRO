/**
 * Orientacja toru glifu QET (decyzja architekta D1, karta UX-04/ROZDZIELNICA-SN-KOREKTA): pole
 * zasilające NAD szyną (pole TR nad szyną SN, pole liniowe WN nad szyną WN) liczy tor OD SZYNY
 * w górę. Glif łącznika z nożem i głowicy kablowej dostaje parametr `kierunekToru: 'w-gore'`
 * (bez kopiowania glifów): rysunek toru (przewody, styk stały, nóż, znaczniki rodzaju) w lustrze
 * osi poziomej gabarytu — styk stały od strony szyny (dół), przegub od strony odpływu (góra);
 * ziemia i napęd przesunięte razem z przegubem, NIE odbite (ziemia w dół — kierunekZiemi.test).
 *
 * Iloczyn: każdy glif QET × kierunek {brak, w-dol, w-gore} × stan łącznika. Glif spoza klasy
 * orientacji (np. przekładnik) ignoruje parametr (predykat `czyGlifZOrientacjaToru` — jedno
 * źródło dla rysunku i testu).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QET_SYMBOLE_POLA_SN, type QetSymbolPolaSnId } from '../../cad/qet/qetPoleSn';
import { SYMBOL_GLYPHS, czyGlifZOrientacjaToru, type SwitchState } from '../glyphs';

const STANY: readonly (SwitchState | undefined)[] = ['closed', 'open', 'earthed', 'unknown', undefined];
const IDS = Object.keys(QET_SYMBOLE_POLA_SN) as QetSymbolPolaSnId[];

function dom(id: QetSymbolPolaSnId, kierunek: 'w-dol' | 'w-gore' | undefined, stan: SwitchState | undefined): Element {
  const Glyph = SYMBOL_GLYPHS[id];
  const html = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg">
      <Glyph x={0} y={0} stroke="#000" state={stan} {...(kierunek ? { kierunekToru: kierunek } : {})} />
    </svg>,
  );
  return new DOMParser().parseFromString(html, 'image/svg+xml').documentElement;
}

/** Transformacje przodków elementu aż do korzenia glifu (bez korzenia). */
function przodkowie(el: Element): string[] {
  const t: string[] = [];
  for (let p = el.parentElement; p && p.tagName !== 'svg'; p = p.parentElement) {
    const tr = p.getAttribute('transform');
    if (tr) t.push(tr);
  }
  return t;
}

describe('orientacja toru glifu QET — klasa łączników z nożem i głowicy kablowej', () => {
  it('klasa orientacji = łączniki z nożem + głowica kablowa (inwentarz z danych QET)', () => {
    const klasa = IDS.filter((id) => czyGlifZOrientacjaToru(id)).sort();
    const oczekiwana = IDS.filter((id) => QET_SYMBOLE_POLA_SN[id].noz !== null || id === 'qetCableHead').sort();
    expect(klasa).toEqual(oczekiwana);
    expect(klasa.length).toBeGreaterThan(2);
  });

  for (const id of IDS) {
    it(`${id} × kierunek × stan`, () => {
      const sym = QET_SYMBOLE_POLA_SN[id];
      const lustro = `matrix(1 0 0 -1 0 ${sym.wysokosc})`;
      for (const stan of STANY) {
        for (const kierunek of [undefined, 'w-dol', 'w-gore'] as const) {
          const korzen = dom(id, kierunek, stan);
          const odwrocony = kierunek === 'w-gore' && czyGlifZOrientacjaToru(id);
          expect(korzen.querySelector('[data-kierunek-toru="w-gore"]') !== null, `${id} ${kierunek} ${stan}`).toBe(odwrocony);
          const przewody = korzen.querySelector('[data-qet="przewody"]')!;
          expect(przodkowie(przewody).includes(lustro), `${id} ${kierunek}: przewody w lustrze`).toBe(odwrocony);
          const noz = korzen.querySelector('[data-qet="noz"]');
          if (noz && sym.noz) {
            expect(przodkowie(noz).includes(lustro)).toBe(odwrocony);
            // Przegub noża w układzie gabarytu: w-gore — górna połowa (strona odpływu), styk stały
            // od strony szyny (dół); w-dol — przegub w dolnej połowie (styk stały od szyny u góry).
            const yPrzegubu = odwrocony ? sym.wysokosc - sym.noz.cy : sym.noz.cy;
            expect(yPrzegubu < sym.wysokosc / 2, `${id} ${kierunek}: przegub`).toBe(odwrocony);
          }
          for (const rola of ['ziemia', 'osprzet']) {
            const el = korzen.querySelector(`[data-qet="${rola}"]`);
            if (!el) continue;
            // Ziemia i napęd nigdy nie są odbijane (ziemia w dół, litera „M" prosto).
            expect(przodkowie(el).includes(lustro), `${id} ${rola}`).toBe(false);
            const oczekiwane = odwrocony && sym.noz ? `translate(0 ${sym.wysokosc - 2 * sym.noz.cy})` : null;
            expect(el.getAttribute('transform'), `${id} ${rola}`).toBe(oczekiwane);
          }
        }
      }
    });
  }
});
