/**
 * NÓŻ ŁĄCZNIKA QET NA STYKU (karta UX-04/POLE-LINIOWE-WZORZEC, defekt z oględzin architekta
 * 2026-10-30: „glif Q1 (odłącznik) w Z.10, stan zamknięty — sam krzyżyk „+”, nieczytelny jako
 * odłącznik”).
 *
 * Przyczyna: importer obracał nóż źródła QET sztywno na kierunek styku stałego, a nóż odłącznika
 * (EN 60617 07-13-06) jest dłuższy od odległości przegub–styk — w położeniu zamkniętym przechodził
 * przez kreskę styku i dalej wzdłuż przewodu, więc styk stały wyglądał jak poprzeczka krzyżyka.
 * Ta sama klasa: wyłącznik (nóż dalej niż „×”), a nóż krótszy od odległości do styku
 * (łącznik trójpołożeniowy, uziemnik, rozłącznik z bezpiecznikami) nie dochodził do styku.
 *
 * Przypina na iloczynie KAŻDY łącznik QET z nożem × KAŻDE położenie (open, closed, earthed,
 * unknown, w tym stan „bad” rysowany jak nieustalony): (1) w położeniu stykowym (zamknięty,
 * uziemiony) koniec noża leży NA rysunku styku stałego (odcinek albo okrąg rysunku stałego,
 * tolerancja 0,01), a nóż nie przecina rysunku stałego nigdzie poza końcem — nie „przechodzi”
 * przez styk; (2) w położeniu otwartym koniec noża nie dotyka rysunku stałego; (3) render
 * (`SYMBOL_GLYPHS`, grupa `data-qet="noz"`) rysuje DOKŁADNIE nóż z `prymitywyNozaQet` — ta sama
 * reguła co importer (`noz_w_zasiegu`), który z niej liczy obwiednię i stopień glifu.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { CadPrimitive } from '../../cad/cadSymbolRegistry';
import { QET_SYMBOLE_POLA_SN, type QetPolozenieNoza, type QetSymbolPolaSnId } from '../../cad/qet/qetPoleSn';
import { SYMBOL_GLYPHS, polozenieNozaQet, prymitywyNozaQet, type SwitchState } from '../glyphs';

afterEach(cleanup);

type P = readonly [number, number];
type Linia = Extract<CadPrimitive, { k: 'line' }>;

const obroc = (p: P, c: P, stopnie: number): P => {
  const a = (stopnie * Math.PI) / 180;
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a)];
};

function odlPunktOdcinek(p: P, a: P, b: P): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dl = dx * dx + dy * dy;
  const t = dl === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / dl));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Punkt przecięcia odcinków (parametr t na pierwszym) albo null. */
function przeciecie(a: P, b: P, c: P, d: P): number | null {
  const r: P = [b[0] - a[0], b[1] - a[1]];
  const s: P = [d[0] - c[0], d[1] - c[1]];
  const mian = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(mian) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / mian;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / mian;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}

const LACZNIKI = (Object.keys(QET_SYMBOLE_POLA_SN) as QetSymbolPolaSnId[]).filter((id) => QET_SYMBOLE_POLA_SN[id].noz);
const STANY: readonly SwitchState[] = ['open', 'closed', 'earthed', 'unknown', 'bad'];

/** Nóż w położeniu: odcinek (przegub-bliższy → koniec) po zasięgu i obrocie. */
function nozWPolozeniu(id: QetSymbolPolaSnId, polozenie: QetPolozenieNoza): { a: P; b: P } {
  const noz = QET_SYMBOLE_POLA_SN[id].noz!;
  const linia = prymitywyNozaQet(noz, polozenie).find((p): p is Linia => p.k === 'line')!;
  const c: P = [noz.cx, noz.cy];
  const p1 = obroc([linia.x1, linia.y1], c, noz.katy[polozenie] ?? 0);
  const p2 = obroc([linia.x2, linia.y2], c, noz.katy[polozenie] ?? 0);
  return Math.hypot(p1[0] - c[0], p1[1] - c[1]) <= Math.hypot(p2[0] - c[0], p2[1] - c[1]) ? { a: p1, b: p2 } : { a: p2, b: p1 };
}

/** Rysunek stały aparatu (styki, znaki rodzaju) — bez przewodów i osprzętu. */
function rysunekStaly(id: QetSymbolPolaSnId): readonly CadPrimitive[] {
  return QET_SYMBOLE_POLA_SN[id].stale;
}

function odlegloscOdRysunku(p: P, prims: readonly CadPrimitive[]): number {
  let min = Infinity;
  for (const q of prims) {
    if (q.k === 'line') min = Math.min(min, odlPunktOdcinek(p, [q.x1, q.y1], [q.x2, q.y2]));
    else if (q.k === 'circle') min = Math.min(min, Math.abs(Math.hypot(p[0] - q.cx, p[1] - q.cy) - q.r));
  }
  return min;
}

describe('nóż łącznika QET — koniec na styku w położeniu stykowym, bez przejścia przez styk', () => {
  it('warunek wstępny: łączniki z nożem (odłącznik, wyłącznik, rozłącznik, uziemnik, trójpołożeniowy)', () => {
    expect(LACZNIKI).toEqual(
      expect.arrayContaining(['qetDisconnector', 'qetBreaker', 'qetBreakerZNapedem', 'qetLoadBreakSwitch', 'qetEarthSwitch', 'qetThreePositionSwitch', 'qetThreePositionSwitchZNapedem']),
    );
  });

  for (const id of LACZNIKI) {
    for (const stan of STANY) {
      const polozenie = polozenieNozaQet(id, stan);
      it(`${id} × ${stan} (położenie ${polozenie})`, () => {
        const { a, b } = nozWPolozeniu(id, polozenie);
        const stale = rysunekStaly(id);
        const naStyku = polozenie === 'closed' || polozenie === 'earthed';
        if (naStyku) {
          expect(odlegloscOdRysunku(b, stale), 'koniec noża na rysunku styku stałego').toBeLessThan(0.01);
          // Nóż nie przecina rysunku stałego między przegubem a końcem (nie „przechodzi” przez
          // styk); styk przy przegubie (doprowadzenie uziemnika do przegubu) nie jest przejściem.
          for (const q of stale) {
            if (q.k !== 'line') continue;
            const t = przeciecie(a, b, [q.x1, q.y1], [q.x2, q.y2]);
            if (t !== null && t > 0.005) expect(t, `przecięcie z (${q.x1}; ${q.y1})–(${q.x2}; ${q.y2})`).toBeGreaterThan(0.995);
          }
        }
        if (polozenie === 'open') {
          expect(odlegloscOdRysunku(b, stale), 'koniec noża otwartego z dala od styku').toBeGreaterThan(1);
        }
        // Render rysuje nóż z tej samej funkcji.
        const Glif = SYMBOL_GLYPHS[id];
        const { container } = render(
          <svg>
            <Glif x={0} y={0} state={stan} />
          </svg>,
        );
        const linia = container.querySelector('[data-qet="noz"] line')!;
        const oczekiwana = prymitywyNozaQet(QET_SYMBOLE_POLA_SN[id].noz!, polozenie).find((p): p is Linia => p.k === 'line')!;
        for (const atr of ['x1', 'y1', 'x2', 'y2'] as const) {
          expect(Number(linia.getAttribute(atr)), atr).toBeCloseTo(oczekiwana[atr], 9);
        }
      });
    }
  }

  it('odłącznik zamknięty: nóż kończy się na kresce styku, nad kreską zostaje sam przewód (zero krzyżyka)', () => {
    const s = QET_SYMBOLE_POLA_SN.qetDisconnector;
    const kreskaStyku = s.stale.find((p): p is Linia => p.k === 'line' && p.y1 === p.y2)!;
    const { b } = nozWPolozeniu('qetDisconnector', 'closed');
    // Współrzędne pliku TS zaokrąglone do 1e-4 (importer, `zaokr`).
    expect(b[1]).toBeCloseTo(kreskaStyku.y1, 3);
    expect(b[0]).toBeCloseTo((kreskaStyku.x1 + kreskaStyku.x2) / 2, 3);
  });
});
