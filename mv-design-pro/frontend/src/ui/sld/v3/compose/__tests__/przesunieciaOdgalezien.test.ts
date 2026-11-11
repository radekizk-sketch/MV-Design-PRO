// @vitest-environment node
/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC — `przesunieciaOdgalezien`: JEDNA reguła położenia poziomego
 * odgałęzień bocznych pola (plan `bayApparatusPlanFootprint`, stacja, GPZ).
 *
 * ILOCZYN CECH: kotwice {wspólna, różne bez nachodzenia pasów, różne z nachodzeniem pasa
 * rysunku aparatu, wolna kolumna po lewej pasa przesuniętego w prawo} × kolejność danych
 * {od góry, od dołu} × liczba odgałęzień {1, 2, 3} × symbol {kanoniczny, QET z kaflem stanu
 * i zwisem pod węzłem odczepu}.
 * Wyrocznia niezależna: pas = zwis pod węzłem (QET z kaflem: 2·GRID) + dół rysunku (prostokąt
 * definicji `SYMBOL_DEFS`, obrys i kafel z manifestu QET — największy) + oczko GRID; odstęp
 * `LATERAL_BRANCH_GAP`; geometria sprawdzana wprost (pasy rozłączne, odczep wyższego
 * odgałęzienia nie przecina pasa niższego). Wzorzec właściciela 2026-11-05: pod aparatem
 * bocznym nie stoi podpis (oznaczenia w kolumnie oznaczeń pola), więc pas nie niesie wysokości
 * podpisu (dawniej `labelLineHeight('t4')`, który przy okazji pomijał zwis).
 */
import { describe, expect, it } from 'vitest';

import { GRID } from '../../core/grid';
import { QET_SYMBOLE_POLA_SN } from '../../cad/qet/qetPoleSn';
import { czySymbolQet, SYMBOL_DEFS, type SymbolId } from '../../symbols/defs';
import { LATERAL_BRANCH_GAP, przesunieciaOdgalezien } from '../apparatusSequence';

type Lat = { readonly symbolId: SymbolId; readonly afterMainIndex: number };

/** Wysokość pasa aparatu bocznego od kotwicy (wyrocznia z danych, nie z funkcji kodu). */
function wysokoscPasa(id: SymbolId): number {
  const qet = czySymbolQet(id) ? QET_SYMBOLE_POLA_SN[id] : null;
  const zwis = qet?.kafel ? 2 * GRID : 0;
  const dol = Math.max(
    SYMBOL_DEFS[id].height,
    qet ? qet.obrys.y + qet.obrys.height : 0,
    qet?.kafel ? qet.kafel.y + qet.kafel.height : 0,
  );
  return zwis + dol + GRID;
}

function pasy(laterals: readonly Lat[], kotwicaY: (i: number) => number) {
  const dx = przesunieciaOdgalezien(laterals, kotwicaY);
  return laterals.map((l, i) => {
    const d = SYMBOL_DEFS[l.symbolId];
    const y0 = kotwicaY(l.afterMainIndex);
    return { x0: dx[i], x1: dx[i] + d.width, y0, y1: y0 + wysokoscPasa(l.symbolId) };
  });
}

function rozlaczne(p: ReturnType<typeof pasy>): boolean {
  for (let i = 0; i < p.length; i++) {
    for (let j = i + 1; j < p.length; j++) {
      const a = p[i];
      const b = p[j];
      if (a.y0 < b.y1 && b.y0 < a.y1 && a.x0 < b.x1 && b.x0 < a.x1) return false;
    }
  }
  return true;
}

/** Odczep odgałęzienia biegnie poziomo na wysokości kotwicy od osi (x=0) do symbolu. */
function odczepyBezPrzeciec(p: ReturnType<typeof pasy>): boolean {
  return p.every((a) => p.every((b) => b === a || !(b.x1 <= a.x0 && b.y0 < a.y0 && a.y0 < b.y1)));
}

describe('przesunieciaOdgalezien — wspólna kotwica (dawna arytmetyka bez zmian)', () => {
  for (const n of [1, 2, 3]) {
    it(`${n} odgałęzienia na jednej kotwicy stoją obok siebie: kolejne GAP + szerokość`, () => {
      const lat: Lat[] = (['earthSwitch', 'voltageTransformer', 'surgeArrester'] as SymbolId[])
        .slice(0, n)
        .map((symbolId) => ({ symbolId, afterMainIndex: 2 }));
      const dx = przesunieciaOdgalezien(lat, () => 100);
      let oczekiwany = LATERAL_BRANCH_GAP;
      lat.forEach((l, i) => {
        expect(dx[i]).toBe(oczekiwany);
        oczekiwany += SYMBOL_DEFS[l.symbolId].width + LATERAL_BRANCH_GAP;
      });
    });
  }
});

describe('przesunieciaOdgalezien — różne kotwice', () => {
  for (const odGory of [true, false]) {
    const kolejnosc = (l: Lat[]) => (odGory ? l : [...l].reverse());
    it(`pasy rozłączne pionowo → obie w pierwszej kolumnie (${odGory ? 'dane od góry' : 'dane od dołu'})`, () => {
      const lat = kolejnosc([
        { symbolId: 'voltageTransformer', afterMainIndex: 0 },
        { symbolId: 'earthSwitch', afterMainIndex: 3 },
      ]);
      const y = (i: number) => i * 100;
      const dx = przesunieciaOdgalezien(lat, y);
      expect(dx).toEqual([LATERAL_BRANCH_GAP, LATERAL_BRANCH_GAP]);
      expect(rozlaczne(pasy(lat, y))).toBe(true);
    });

    it(`rysunek aparatu sięga do niższej kotwicy → wyższe odgałęzienie w prawo, odczep nad niższym (${odGory ? 'od góry' : 'od dołu'})`, () => {
      const lat = kolejnosc([
        { symbolId: 'voltageTransformer', afterMainIndex: 1 },
        { symbolId: 'earthSwitch', afterMainIndex: 2 },
      ]);
      // Kotwice 24 j. od siebie — mniej niż pas VT (rysunek + oczko).
      const y = (i: number) => i * 24;
      expect(wysokoscPasa('voltageTransformer')).toBeGreaterThan(24);
      const p = pasy(lat, y);
      expect(rozlaczne(p)).toBe(true);
      expect(odczepyBezPrzeciec(p)).toBe(true);
      const vt = p[lat.findIndex((l) => l.symbolId === 'voltageTransformer')];
      const es = p[lat.findIndex((l) => l.symbolId === 'earthSwitch')];
      expect(es.x0).toBe(LATERAL_BRANCH_GAP);
      expect(vt.x0).toBe(es.x1 + LATERAL_BRANCH_GAP);
    });
  }

  for (const odGory of [true, false]) {
    it(`wolna kolumna po lewej pasa przesuniętego w prawo: wyższe odgałęzienie nie staje na jego odczepie (${odGory ? 'od góry' : 'od dołu'})`, () => {
      // c (najniższa kotwica) zajmuje pierwszą kolumnę, a (środkowa) sięga pasem do c —
      // stoi na prawo od c; b (najwyższa) nie zachodzi prostokątem ani na a, ani na c, ale jej
      // pas obejmuje wysokość odczepu a: w pierwszej kolumnie przecięłaby ten odczep.
      const lat: Lat[] = [
        { symbolId: 'earthSwitch', afterMainIndex: 1 },
        { symbolId: 'voltageTransformer', afterMainIndex: 2 },
        { symbolId: 'earthSwitch', afterMainIndex: 3 },
      ];
      const wejscie = odGory ? lat : [...lat].reverse();
      const y = (i: number) => i * 24;
      const hEs = wysokoscPasa('earthSwitch');
      const hVt = wysokoscPasa('voltageTransformer');
      // Warunki scenariusza (wyrocznia gabarytów): b obejmuje odczep a (y=48), kończy się przed
      // pasem c (y=72); a zachodzi pionowo na c.
      expect(24 + hEs).toBeGreaterThan(48);
      expect(24 + hEs).toBeLessThanOrEqual(72);
      expect(48 + hVt).toBeGreaterThan(72);
      const p = pasy(wejscie, y);
      const pas = (kotwica: number) => p[wejscie.findIndex((l) => l.afterMainIndex === kotwica)];
      expect(pas(3).x0).toBe(LATERAL_BRANCH_GAP);
      expect(pas(2).x0).toBeGreaterThan(pas(3).x1);
      expect(rozlaczne(p)).toBe(true);
      expect(odczepyBezPrzeciec(p)).toBe(true);
      expect(pas(1).x0).toBeGreaterThanOrEqual(pas(2).x1);
    });
  }

  for (const odGory of [true, false]) {
    it(`symbol QET z kaflem: pas obejmuje zwis pod węzłem i kafel — kotwica niższa w zasięgu → w prawo, poza zasięgiem → ta sama kolumna (${odGory ? 'od góry' : 'od dołu'})`, () => {
      const h = wysokoscPasa('qetEarthSwitch');
      // Pas QET dłuższy niż sam prostokąt definicji o zwis i oczko (dawny pas „definicja +
      // podpis t4” kończył się nad dołem kafla).
      expect(h).toBeGreaterThanOrEqual(SYMBOL_DEFS.qetEarthSwitch.height + 2 * GRID + GRID);
      for (const [odstep, oczekiwanaKolumna] of [[h - GRID, 'prawo'], [h, 'ta sama']] as const) {
        const lat: Lat[] = [
          { symbolId: 'qetEarthSwitch', afterMainIndex: 1 },
          { symbolId: 'voltageTransformer', afterMainIndex: 2 },
        ];
        const wejscie = odGory ? lat : [...lat].reverse();
        const y = (i: number) => i * odstep;
        const p = pasy(wejscie, y);
        expect(rozlaczne(p)).toBe(true);
        expect(odczepyBezPrzeciec(p)).toBe(true);
        const es = p[wejscie.findIndex((l) => l.symbolId === 'qetEarthSwitch')];
        const vt = p[wejscie.findIndex((l) => l.symbolId === 'voltageTransformer')];
        if (oczekiwanaKolumna === 'prawo') expect(es.x0, `odstęp ${odstep}`).toBeGreaterThanOrEqual(vt.x1);
        else expect(es.x0, `odstęp ${odstep}`).toBe(vt.x0);
      }
    });
  }

  it('determinizm: to samo wejście → te same odstępy', () => {
    const lat: Lat[] = [
      { symbolId: 'voltageTransformer', afterMainIndex: 1 },
      { symbolId: 'earthSwitch', afterMainIndex: 2 },
      { symbolId: 'surgeArrester', afterMainIndex: 2 },
    ];
    const y = (i: number) => i * 24;
    expect(przesunieciaOdgalezien(lat, y)).toEqual(przesunieciaOdgalezien(lat, y));
    expect(rozlaczne(pasy(lat, y))).toBe(true);
    expect(odczepyBezPrzeciec(pasy(lat, y))).toBe(true);
  });
});
