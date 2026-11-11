/**
 * STYK CZŁONÓW NA OBCYM PRZEWODZIE (karta UX-04/POLE-LINIOWE-WZORZEC, decyzja architekta
 * §11.7 pkt 1: każde skrzyżowanie bez węzła modelu dostaje mostek §22.1).
 *
 * Klasa defektu: skrzyżowanie w WIERZCHOŁKU toru (styk dwóch członów przęsła albo wierzchołek
 * współliniowy jednej łamanej) nie jest wnętrzem żadnej krawędzi, więc `interiorCrossings` go
 * nie widzi, a kanwa nie rysuje mostka — rysunek czyta się jak połączenie. Pomiar przed
 * naprawą (fikstury × LOD + sieci syntetyczne): jeden styk na obcym przewodzie (sieć
 * referencyjna z odgałęzieniem stacji z odgałęzieniem, L2, z pierścieniem i bez) i 63
 * wierzchołki współliniowe (zejście źródła bloku GPZ na L0: 57 fikstur i 6 sieci
 * syntetycznych), żaden na obcym przewodzie.
 *
 * ILOCZYN CECH (funkcja czysta): oś styku {pion, poziom} × rodzaj obcego przewodu {kabel SN,
 * magistrala, nN, szyna, szyna GPZ, adnotacja} × kierunki rysowania członów {zgodne z łańcuchem,
 * oba kończą się w styku, oba zaczynają} × miejsce na przesunięcie {wolne za stykiem, zajęte
 * za stykiem, brak na obu członach}; do tego punkty, które stykiem NIE są (symbol w punkcie,
 * rozgałęzienie trzech końców, narożnik, człon szynowy). Scena realna: przypadek z pomiaru
 * z iniekcją (styk z powrotem na przecięciu — wyrocznie gryzą, naprawa przywraca).
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { PreviewSegment, PreviewSegmentKind } from '../../compose/preview';
import { GRID, type V3Rect } from '../../core/grid';
import type { RouteVertex } from '../../layout/route';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { buildSceneV3 } from '../buildScene';
import { BRIDGE_RADIUS, interiorCrossings, junctionDotGaps, przecieciaBezMostka, wezlyModeluEnm } from '../crossings';
import { odsunStykiCzlonow, stykiCzlonowNaObcychPrzewodach, wierzcholkiWspolliniowe } from '../stykiCzlonow';
import { appendLateralBranch, loadEnm, radialize } from './syntheticNetworks';

const P = (x: number, y: number): RouteVertex => ({ x, y });
const odcinek = (owner: string, points: RouteVertex[], kind: PreviewSegmentKind = 'sn'): PreviewSegment => ({
  points,
  meta: { kind, ownerRef: owner, elementKind: 'segment' },
});

/** Zbiór punktów (krok GRID/2) pokrytych przez odcinki — suma geometryczna toru. */
function pokrycie(segments: readonly PreviewSegment[]): string[] {
  const zbior = new Set<string>();
  for (const s of segments) {
    for (let i = 0; i + 1 < s.points.length; i++) {
      const a = s.points[i]!;
      const b = s.points[i + 1]!;
      const krok = GRID / 2;
      const n = (Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / krok;
      for (let k = 0; k <= n; k++) {
        zbior.add(`${a.x + Math.sign(b.x - a.x) * k * krok},${a.y + Math.sign(b.y - a.y) * k * krok}`);
      }
    }
  }
  return [...zbior].sort();
}

type Os = 'pion' | 'poziom';
/** Układ wzorcowy: człony A i B na jednej prostej, styk w (160, 160), obcy przewód przez styk. */
function uklad(os: Os, kierunki: 'zgodne' | 'oba-koncza' | 'oba-zaczynaja', obcyRodzaj: PreviewSegmentKind) {
  const naOsi = (t: number) => (os === 'pion' ? P(160, t) : P(t, 160));
  const poprzecznie = (t: number) => (os === 'pion' ? P(t, 160) : P(160, t));
  const a0 = naOsi(0);
  const styk = naOsi(160);
  const b1 = naOsi(320);
  const A = kierunki === 'oba-zaczynaja' ? [styk, a0] : [a0, styk];
  const B = kierunki === 'oba-koncza' ? [b1, styk] : [styk, b1];
  return [
    odcinek('seg/A', A),
    odcinek('seg/B', B),
    odcinek('seg/C', [poprzecznie(80), poprzecznie(240)], obcyRodzaj),
  ];
}

const OSIE: readonly Os[] = ['pion', 'poziom'];
const KIERUNKI = ['zgodne', 'oba-koncza', 'oba-zaczynaja'] as const;
const PRZEWODY: readonly PreviewSegmentKind[] = ['sn', 'snTrunk', 'lv'];
const NIE_PRZEWODY: readonly PreviewSegmentKind[] = ['bus', 'busGpz', 'leader', 'protectionTrip', 'measurementLink'];

describe('iloczyn: oś styku × rodzaj obcego przewodu × kierunki rysowania członów', () => {
  for (const os of OSIE) {
    for (const kierunki of KIERUNKI) {
      for (const rodzaj of PRZEWODY) {
        it(`${os} × ${rodzaj} × ${kierunki}: styk wykryty, przesunięty o raster, skrzyżowanie z rysowalnym mostkiem`, () => {
          const wejscie = uklad(os, kierunki, rodzaj);
          // Mechanizm defektu: skrzyżowanie w styku nie jest wnętrzem żadnej krawędzi.
          expect(interiorCrossings(wejscie)).toEqual([]);
          const styki = stykiCzlonowNaObcychPrzewodach(wejscie, []);
          expect(styki).toHaveLength(1);
          expect(styki[0]).toMatchObject({ punkt: P(160, 160), os, obcyPrzewod: 'seg/C' });

          const wynik = odsunStykiCzlonow(wejscie, []);
          expect(wynik.nierozwiazane).toEqual([]);
          expect(wynik.przesuniete).toHaveLength(1);
          const na = wynik.przesuniete[0]!.na;
          expect(Math.abs(na.x - 160) + Math.abs(na.y - 160)).toBe(GRID);
          // Suma geometryczna członów niezmieniona; oba człony kończą się w nowym styku.
          expect(pokrycie(wynik.segments)).toEqual(pokrycie(wejscie));
          for (const s of wynik.segments.slice(0, 2)) {
            const konce = [s.points[0]!, s.points[s.points.length - 1]!];
            expect(konce.some((k) => k.x === na.x && k.y === na.y)).toBe(true);
          }
          // Warunek wyjścia z tej samej funkcji co wejście + skrzyżowanie widoczne z mostkiem.
          expect(stykiCzlonowNaObcychPrzewodach(wynik.segments, [])).toEqual([]);
          expect(interiorCrossings(wynik.segments).map((c) => [c.x, c.y])).toEqual([[160, 160]]);
          expect(przecieciaBezMostka(wynik.segments)).toEqual([]);
          // Determinizm.
          expect(odsunStykiCzlonow(wejscie, [])).toEqual(wynik);
        });
      }
      for (const rodzaj of NIE_PRZEWODY) {
        it(`${os} × ${rodzaj} × ${kierunki}: obcy odcinek nie jest przewodem — brak styku do przesunięcia`, () => {
          const wejscie = uklad(os, kierunki, rodzaj);
          // Szyna przez styk = oba człony przyłączone do węzła szyny (§16); adnotacja nie jest torem.
          expect(stykiCzlonowNaObcychPrzewodach(wejscie, [])).toEqual([]);
          expect(odsunStykiCzlonow(wejscie, []).segments).toEqual(wejscie);
        });
      }
    }
  }
});

describe('miejsce na przesunięcie', () => {
  it('zajęte za stykiem (obcy przewód o raster dalej) — styk wchodzi w głąb członu „przed”', () => {
    const wejscie = [...uklad('pion', 'zgodne', 'sn'), odcinek('seg/D', [P(80, 160 + GRID), P(240, 160 + GRID)])];
    const wynik = odsunStykiCzlonow(wejscie, []);
    expect(wynik.przesuniete.map((p) => p.na)).toEqual([P(160, 160 - GRID)]);
    expect(stykiCzlonowNaObcychPrzewodach(wynik.segments, [])).toEqual([]);
    expect(przecieciaBezMostka(wynik.segments)).toEqual([]);
  });

  it('kandydat w symbolu jest pomijany — styk idzie na pierwszy wolny punkt rastru', () => {
    // Symbol obejmuje pierwszego kandydata (raster za stykiem), nie sam styk.
    const symbol: V3Rect = { x: 150, y: 160 + GRID - 2, width: 20, height: 4 };
    const wynik = odsunStykiCzlonow(uklad('pion', 'zgodne', 'sn'), [symbol]);
    expect(wynik.przesuniete.map((p) => p.na)).toEqual([P(160, 160 - GRID)]);
  });

  it('brak miejsca na obu członach (człony nie dłuższe niż raster) — styk zgłoszony jako nierozwiązany, geometria bez zmian', () => {
    const wejscie = [
      odcinek('seg/A', [P(160, 160 - GRID), P(160, 160)]),
      odcinek('seg/B', [P(160, 160), P(160, 160 + GRID)]),
      odcinek('seg/C', [P(80, 160), P(240, 160)]),
    ];
    const wynik = odsunStykiCzlonow(wejscie, []);
    expect(wynik.przesuniete).toEqual([]);
    expect(wynik.nierozwiazane.map((s) => s.punkt)).toEqual([P(160, 160)]);
    expect(wynik.segments).toEqual(wejscie);
  });

  it('przesunięty styk zostawia skrzyżowanie co najmniej BRIDGE_RADIUS od końca członu', () => {
    expect(GRID).toBeGreaterThanOrEqual(BRIDGE_RADIUS);
  });
});

describe('punkty, które stykiem członów NIE są', () => {
  it('symbol w punkcie (port aparatu, punkt odgałęźny, kropka) — kolizja symbol↔przewód, nie styk', () => {
    const symbol: V3Rect = { x: 160 - GRID, y: 160 - GRID, width: 2 * GRID, height: 2 * GRID };
    expect(stykiCzlonowNaObcychPrzewodach(uklad('pion', 'zgodne', 'sn'), [symbol])).toEqual([]);
  });

  it('rozgałęzienie (trzy końce w punkcie) — węzeł modelu z kropką, nie styk', () => {
    const wejscie = [...uklad('pion', 'zgodne', 'sn'), odcinek('seg/D', [P(320, 160), P(160, 160)])];
    expect(stykiCzlonowNaObcychPrzewodach(wejscie, [])).toEqual([]);
  });

  it('narożnik (człony prostopadłe) — nie styk', () => {
    const wejscie = [
      odcinek('seg/A', [P(160, 0), P(160, 160)]),
      odcinek('seg/B', [P(160, 160), P(320, 160)]),
      odcinek('seg/C', [P(160, 80), P(160, 240)]),
    ];
    expect(stykiCzlonowNaObcychPrzewodach(wejscie, [])).toEqual([]);
  });

  it('człony szynowe — nie styk przęsła', () => {
    const wejscie = [
      odcinek('bus/A', [P(160, 0), P(160, 160)], 'bus'),
      odcinek('bus/B', [P(160, 160), P(160, 320)], 'bus'),
      odcinek('seg/C', [P(80, 160), P(240, 160)]),
    ];
    expect(stykiCzlonowNaObcychPrzewodach(wejscie, [])).toEqual([]);
  });
});

describe('wierzchołki współliniowe jednej łamanej', () => {
  it('wykrywane w pionie i w poziomie, narożnik nie jest współliniowy', () => {
    const segs = [
      odcinek('a', [P(0, 0), P(0, 8), P(0, 16)]),
      odcinek('b', [P(0, 0), P(8, 0), P(16, 0), P(16, 16)]),
      odcinek('c', [P(0, 0), P(0, 16), P(16, 16)]),
    ];
    expect(wierzcholkiWspolliniowe(segs)).toEqual([
      { ownerRef: 'a', punkt: P(0, 8) },
      { ownerRef: 'b', punkt: P(8, 0) },
    ]);
  });
});

describe('scena realna: sieć referencyjna + odgałęzienie stacji z odgałęzieniem (przypadek z pomiaru), L2', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const substrat = loadEnm(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'));
  const lancuch = loadEnm(resolve(here, 'fixtures/openTrunkChain.enm.json'));
  const rozmiary = SYMBOL_DEFS;

  for (const [nazwa, siec] of [
    ['z pierścieniem', substrat],
    ['bez pierścieni', radialize(substrat)],
  ] as const) {
    it(`${nazwa}: zejście odgałęzienia przecina obcy kabel w swoim wnętrzu (z mostkiem); iniekcja styku na przecięciu — wyrocznie gryzą, naprawa przywraca`, () => {
      const model = appendLateralBranch(siec, lancuch);
      const scena = buildSceneV3(model, 2);
      const prostokaty = scena.symbols.map((s) => ({ x: s.x, y: s.y, width: rozmiary[s.symbolId].width, height: rozmiary[s.symbolId].height }));
      const wezly = wezlyModeluEnm(model);
      expect(stykiCzlonowNaObcychPrzewodach(scena.segments, prostokaty)).toEqual([]);
      expect(junctionDotGaps(scena, rozmiary, wezly)).toEqual([]);
      expect(przecieciaBezMostka(scena.segments)).toEqual([]);

      // Człony zejścia odgałęzienia i ich styk na scenie naprawionej.
      const iPrzed = scena.segments.findIndex((s) => (s.meta?.ownerRef ?? '').endsWith('p1branch/segment'));
      const iZa = scena.segments.findIndex((s) => (s.meta?.ownerRef ?? '').endsWith('p1branch/segment_L'));
      expect(iPrzed).toBeGreaterThanOrEqual(0);
      expect(iZa).toBeGreaterThanOrEqual(0);
      const przed = scena.segments[iPrzed]!;
      const za = scena.segments[iZa]!;
      const styk = przed.points[przed.points.length - 1]!;
      expect(za.points[0]).toEqual(styk);
      // Przecięcie zejścia z obcym kablem na prostej styku, w odległości rastru od styku.
      const przeciecie = interiorCrossings(scena.segments).find(
        (c) => c.x === styk.x && Math.abs(c.y - styk.y) === GRID && [przed.meta?.ownerRef, za.meta?.ownerRef].includes(c.vOwnerRef),
      );
      expect(przeciecie, 'skrzyżowanie zejścia z obcym kablem tuż przy styku (przypadek z pomiaru)').toBeDefined();

      // INIEKCJA: styk z powrotem na przecięciu (geometria sprzed naprawy).
      const naPrzecieciu = P(przeciecie!.x, przeciecie!.y);
      const zamien = (s: PreviewSegment): PreviewSegment => ({
        ...s,
        points: s.points.map((p, i) => ((i === 0 || i === s.points.length - 1) && p.x === styk.x && p.y === styk.y ? naPrzecieciu : p)),
      });
      const wstrzykniete = scena.segments.map((s, i) => (i === iPrzed || i === iZa ? zamien(s) : s));
      expect(stykiCzlonowNaObcychPrzewodach(wstrzykniete, prostokaty)).toHaveLength(1);
      expect(interiorCrossings(wstrzykniete).some((c) => c.x === naPrzecieciu.x && c.y === naPrzecieciu.y)).toBe(false);
      expect(junctionDotGaps({ ...scena, segments: wstrzykniete }, rozmiary, wezly).map((g) => g.reason)).toContain('rozgalezienie-bez-kropki');

      // Naprawa na wstrzykniętej geometrii przywraca skrzyżowanie z mostkiem.
      const naprawione = odsunStykiCzlonow(wstrzykniete, prostokaty);
      expect(naprawione.nierozwiazane).toEqual([]);
      expect(stykiCzlonowNaObcychPrzewodach(naprawione.segments, prostokaty)).toEqual([]);
      expect(junctionDotGaps({ ...scena, segments: naprawione.segments }, rozmiary, wezly)).toEqual([]);
      expect(przecieciaBezMostka(naprawione.segments)).toEqual([]);
    });
  }
});
