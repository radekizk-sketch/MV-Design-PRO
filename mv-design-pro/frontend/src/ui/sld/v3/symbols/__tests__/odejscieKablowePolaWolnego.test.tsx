/**
 * Zakończenie toru pola wolnego `bayReserve` — „odejście kablowe poza modelem" (decyzja właściciela
 * 2026-10-30, karta UX-04/POLE-LINIOWE-WZORZEC §11.14: przekładnik Ferrantiego bez „dziwnej laski"
 * pod nim; tor wyjściowy kreskowanym kablem ze strzałką w dół).
 *
 * Wyrocznia (niezależna od importera): wyrenderowany glif ma DOKŁADNIE jedną linię kreskowaną
 * w osi toru od portu w dół i jeden grot otwarty (łamana bez „Z", bez łuku), którego wierzchołek
 * jest najniższym punktem rysunku, leży na końcu kabla, a ramiona są symetryczne względem osi
 * i wyżej od wierzchołka — strzałka W DÓŁ. Żadnego okręgu, łuku ani poprzeczki.
 *
 * Iloczyn cech: motyw {ciemny, jasny} × skala kamery {LOD1 dół 0,51, LOD1 0,69, LOD2 1,02, LOD2
 * 1,38}. Iniekcje: dawny znak końca kabla niepodłączonego (linia ciągła + łuk) oraz strzałka
 * w górę — wyrocznia czerwona.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { QET_SYMBOLE_POLA_SN } from '../../cad/qet/qetPoleSn';
import { strokeScaleFactor } from '../../compose/preview';
import { DARK_SCADA_SLD_PALETTE } from '../../theme/colorTokens';
import { LIGHT_TECHNICAL_SLD_PALETTE } from '../../theme/palette';
import { SYMBOL_GLYPHS } from '../glyphs';

const MOTYWY = [
  ['ciemny', DARK_SCADA_SLD_PALETTE],
  ['jasny', LIGHT_TECHNICAL_SLD_PALETTE],
] as const;
const SKALE = [0.51, 0.69, 1.02, 1.38] as const;

function dokument(el: ReactElement): Document {
  return new DOMParser().parseFromString(
    renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg">{el}</svg>),
    'image/svg+xml',
  );
}

function liczby(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/** Naruszenia wyroczni odejścia kablowego w dokumencie SVG (pusta lista = zgodny). */
function naruszeniaOdejscia(doc: Document, osX: number): string[] {
  const n: string[] = [];
  if (doc.querySelectorAll('circle, ellipse').length > 0) n.push('okrąg w znaku odejścia');
  const linie = Array.from(doc.querySelectorAll('line'));
  const sciezki = Array.from(doc.querySelectorAll('path'));
  const kreskowane = linie.filter((l) => l.getAttribute('stroke-dasharray'));
  if (linie.length !== 1 || kreskowane.length !== 1) n.push(`linie: ${linie.length}, kreskowane: ${kreskowane.length} (oczekiwano jednej kreskowanej)`);
  if (sciezki.length !== 1) {
    n.push(`ścieżki: ${sciezki.length} (oczekiwano jednego grotu)`);
    return n;
  }
  const d = sciezki[0].getAttribute('d') ?? '';
  if (/[AaZz]/.test(d)) n.push(`grot nie jest łamaną otwartą: ${d}`);
  const p = liczby(d);
  if (p.length !== 6) {
    n.push(`grot ma ${p.length / 2} punktów (oczekiwano 3)`);
    return n;
  }
  const [ax, ay, wx, wy, bx, by] = p;
  const kabel = kreskowane[0] ?? linie[0];
  if (kabel) {
    const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => Number(kabel.getAttribute(a)));
    if (Math.abs(x1 - osX) > 1e-6 || Math.abs(x2 - osX) > 1e-6) n.push('kabel poza osią toru');
    if (Math.abs(Math.max(y1, y2) - wy) > 1e-6 || Math.abs(wx - osX) > 1e-6) n.push('wierzchołek grotu nie na końcu kabla');
  }
  if (!(ay < wy && by < wy)) n.push('grot nie wskazuje w dół (ramiona nie nad wierzchołkiem)');
  if (Math.abs(ay - by) > 1e-6 || Math.abs(ax + bx - 2 * wx) > 1e-6) n.push('ramiona grotu niesymetryczne względem osi');
  if (Math.abs(ax - bx) < 5) n.push(`rozpiętość grotu ${Math.abs(ax - bx)} j.św. < 5 (nieczytelny)`);
  return n;
}

describe('bayReserve — odejście kablowe poza modelem (kabel kreskowany, strzałka w dół)', () => {
  const osX = QET_SYMBOLE_POLA_SN.bayReserve.porty[0].x;
  for (const [motyw, paleta] of MOTYWY) {
    for (const skala of SKALE) {
      it(`${motyw} · skala ${skala}`, () => {
        const Glyph = SYMBOL_GLYPHS.bayReserve;
        const doc = dokument(
          <Glyph x={0} y={0} stroke={paleta.baseStroke} kafleStanu={paleta.state} strokeScale={strokeScaleFactor(skala)} />,
        );
        expect(naruszeniaOdejscia(doc, osX)).toEqual([]);
      });
    }
  }

  it('iniekcja: dawny znak końca kabla niepodłączonego (linia ciągła + łuk) — wyrocznia czerwona', () => {
    const doc = dokument(
      <g>
        <line x1={8} y1={0} x2={8} y2={28} stroke="#000" />
        <path d="M 8 28 A 4 4 0 0 0 16 28" fill="none" stroke="#000" />
      </g>,
    );
    expect(naruszeniaOdejscia(doc, 8).length).toBeGreaterThan(0);
  });

  it('iniekcja: strzałka w górę — wyrocznia czerwona', () => {
    const doc = dokument(
      <g>
        <line x1={8} y1={0} x2={8} y2={32} stroke="#000" strokeDasharray="3 2" />
        <path d="M 11.5 39 L 8 32 L 4.5 39" fill="none" stroke="#000" />
      </g>,
    );
    expect(naruszeniaOdejscia(doc, 8)).toContain('grot nie wskazuje w dół (ramiona nie nad wierzchołkiem)');
  });
});
