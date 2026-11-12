// @vitest-environment node
/**
 * Karta SLD-SKALA-I-NAWIGACJA, R7 — kontrakt czystych funkcji PRZELOTU KAMERY (`przelotKamery.ts`).
 *
 * ILOCZYN CECH ścieżki: rodzaj ruchu {przybliżenie, oddalenie, czyste przesunięcie, przesunięcie
 * z przybliżeniem, przesunięcie z oddaleniem, czysty zoom (środek bez ruchu), skok daleki,
 * bez ruchu} × własność {punkty końcowe dokładne, ruch środka monotoniczny, szerokość ciągła
 * i jednomodalna, cel w kadrze przez cały przelot dla ruchu w obrębie kadru, czas w granicach
 * 120–500 ms}. Reduktor z zamiarem przelotu: {polecenie z przelotem, gest po poleceniu, gest
 * bez polecenia, polecenie bez zmiany kadru}. Dozwolenie przelotu: {brak zegara klatek, brak
 * `matchMedia`, `prefers-reduced-motion: reduce`, brak preferencji}.
 */
import { describe, expect, it } from 'vitest';

import { cameraReducer, type CameraState } from '../camera';
import {
  CZAS_PRZELOTU_MS,
  czasPrzelotu,
  kadrPrzelotu,
  przelotDozwolony,
  punktWidzenia,
  reduktorZPrzelotem,
  sciezkaPrzelotu,
  transformPunktu,
  type PunktWidzenia,
} from '../przelotKamery';

const WIDOK = { width: 1200, height: 800 } as const;

const RUCHY: readonly (readonly [string, PunktWidzenia, PunktWidzenia])[] = [
  ['przybliżenie w miejscu', { cx: 500, cy: 300, w: 4000 }, { cx: 500, cy: 300, w: 600 }],
  ['oddalenie w miejscu', { cx: 500, cy: 300, w: 600 }, { cx: 500, cy: 300, w: 4000 }],
  ['czyste przesunięcie', { cx: 0, cy: 0, w: 1200 }, { cx: 900, cy: -300, w: 1200 }],
  ['przesunięcie z przybliżeniem (kadr celu w kadrze startu)', { cx: 0, cy: 0, w: 6000 }, { cx: 1800, cy: 700, w: 900 }],
  ['przesunięcie z oddaleniem', { cx: 1800, cy: 700, w: 900 }, { cx: 0, cy: 0, w: 6000 }],
  ['skok daleki przy stałej skali', { cx: 0, cy: 0, w: 1000 }, { cx: 40000, cy: 0, w: 1000 }],
];

const PROBKI = 200;

describe('ścieżka przelotu (van Wijk–Nuij): własności × rodzaj ruchu', () => {
  for (const [nazwa, p0, p1] of RUCHY) {
    describe(nazwa, () => {
      const sciezka = sciezkaPrzelotu(p0, p1);

      it('punkty końcowe dokładne (t = 0 → start, t = 1 → cel, bit w bit)', () => {
        expect(sciezka.punkt(0)).toEqual(p0);
        expect(sciezka.punkt(1)).toEqual(p1);
        expect(sciezka.dlugosc).toBeGreaterThan(0);
        expect(Number.isFinite(sciezka.dlugosc)).toBe(true);
      });

      it('ruch środka monotoniczny: odległość od startu wzdłuż prostej środków nie maleje', () => {
        const dx = p1.cx - p0.cx;
        const dy = p1.cy - p0.cy;
        const d2 = dx * dx + dy * dy;
        let poprzedni = -Infinity;
        for (let i = 0; i <= PROBKI; i += 1) {
          const p = sciezka.punkt(i / PROBKI);
          // Środek leży na prostej środków (iloczyn wektorowy ≈ 0).
          expect(Math.abs((p.cx - p0.cx) * dy - (p.cy - p0.cy) * dx)).toBeLessThan(1e-6 * Math.max(1, d2));
          const f = d2 === 0 ? 0 : ((p.cx - p0.cx) * dx + (p.cy - p0.cy) * dy) / d2;
          expect(f).toBeGreaterThanOrEqual(poprzedni - 1e-12);
          expect(f).toBeGreaterThanOrEqual(-1e-12);
          expect(f).toBeLessThanOrEqual(1 + 1e-12);
          poprzedni = f;
        }
      });

      it('szerokość ciągła i jednomodalna: najmniejsza na końcach, bez skoków między próbkami', () => {
        const szer: number[] = [];
        for (let i = 0; i <= PROBKI; i += 1) szer.push(sciezka.punkt(i / PROBKI).w);
        const min = Math.min(p0.w, p1.w);
        const max = Math.max(...szer);
        for (const w of szer) expect(w).toBeGreaterThanOrEqual(min * (1 - 1e-9));
        // Jednomodalność: po maksimum szerokość już tylko maleje, przed nim — tylko rośnie.
        const iMax = szer.indexOf(max);
        for (let i = 1; i <= iMax; i += 1) expect(szer[i]).toBeGreaterThanOrEqual(szer[i - 1] * (1 - 1e-9));
        for (let i = iMax + 1; i < szer.length; i += 1) expect(szer[i]).toBeLessThanOrEqual(szer[i - 1] * (1 + 1e-9));
        // Ciągłość: sąsiednie próbki różnią się mniej niż 10 % szerokości.
        for (let i = 1; i < szer.length; i += 1) expect(Math.abs(Math.log(szer[i] / szer[i - 1]))).toBeLessThan(0.1);
      });

      it('czas przelotu z długości ścieżki w granicach 120–500 ms', () => {
        const ms = czasPrzelotu(sciezka.dlugosc);
        expect(ms).toBeGreaterThanOrEqual(CZAS_PRZELOTU_MS.min);
        expect(ms).toBeLessThanOrEqual(CZAS_PRZELOTU_MS.max);
      });
    });
  }

  it('czas: krótka ścieżka = dolna granica, długa = górna, pośrednia proporcjonalna do długości', () => {
    expect(czasPrzelotu(0)).toBe(CZAS_PRZELOTU_MS.min);
    expect(czasPrzelotu(100)).toBe(CZAS_PRZELOTU_MS.max);
    expect(czasPrzelotu(1)).toBe(CZAS_PRZELOTU_MS.naJednostke);
    expect(czasPrzelotu(1.5)).toBeCloseTo(1.5 * CZAS_PRZELOTU_MS.naJednostke, 9);
  });

  it('skok daleki trwa dłużej niż krótkie przesunięcie (stała odczuwalna prędkość)', () => {
    const krotki = sciezkaPrzelotu({ cx: 0, cy: 0, w: 1000 }, { cx: 300, cy: 0, w: 1000 });
    const daleki = sciezkaPrzelotu({ cx: 0, cy: 0, w: 1000 }, { cx: 40000, cy: 0, w: 1000 });
    expect(daleki.dlugosc).toBeGreaterThan(krotki.dlugosc);
    // Skok daleki ODDALA w połowie drogi (ścieżka optymalna, nie liniowa).
    expect(daleki.punkt(0.5).w).toBeGreaterThan(1000 * 5);
  });

  it('bez ruchu: długość zero, każdy punkt = start', () => {
    const p = { cx: 10, cy: 20, w: 300 };
    const s = sciezkaPrzelotu(p, p);
    expect(s.dlugosc).toBe(0);
    expect(s.punkt(0.5)).toEqual(p);
  });
});

describe('cel w kadrze przez cały przelot — ruch w obrębie kadru (kadr celu ⊂ kadr startu)', () => {
  // Kadry kanwy: start = przegląd sieci, cel = prostokąt obiektu wpasowany z marginesem. Cel
  // (prostokąt obiektu w świecie) jest widoczny w kadrze startu i w kadrze celu — ma być
  // widoczny w KAŻDEJ klatce przelotu.
  const PRZYPADKI: readonly (readonly [string, { minX: number; minY: number; maxX: number; maxY: number }])[] = [
    ['obiekt w środku', { minX: 1400, minY: 900, maxX: 1700, maxY: 1100 }],
    ['obiekt przy lewej krawędzi', { minX: 40, minY: 900, maxX: 300, maxY: 1100 }],
    ['obiekt w prawym dolnym rogu', { minX: 2700, minY: 1700, maxX: 2950, maxY: 1960 }],
    ['obiekt szeroki i niski', { minX: 200, minY: 1000, maxX: 2800, maxY: 1080 }],
    ['obiekt wąski i wysoki', { minX: 1500, minY: 100, maxX: 1540, maxY: 1900 }],
  ];
  const start = { scale: 0.4, translateX: 0, translateY: 0 }; // kadr 3000 × 2000 j.św.
  const wKadrze = (t: { scale: number; translateX: number; translateY: number }, r: (typeof PRZYPADKI)[number][1]) => {
    const x0 = r.minX * t.scale + t.translateX;
    const x1 = r.maxX * t.scale + t.translateX;
    const y0 = r.minY * t.scale + t.translateY;
    const y1 = r.maxY * t.scale + t.translateY;
    const eps = 1e-6;
    return x0 >= -eps && x1 <= WIDOK.width + eps && y0 >= -eps && y1 <= WIDOK.height + eps;
  };
  for (const [nazwa, r] of PRZYPADKI) {
    it(nazwa, () => {
      const skala = Math.min(WIDOK.width / ((r.maxX - r.minX) * 1.2), WIDOK.height / ((r.maxY - r.minY) * 1.2), 3);
      const cel = {
        scale: skala,
        translateX: WIDOK.width / 2 - ((r.minX + r.maxX) / 2) * skala,
        translateY: WIDOK.height / 2 - ((r.minY + r.maxY) / 2) * skala,
      };
      expect(wKadrze(start, r)).toBe(true);
      expect(wKadrze(cel, r)).toBe(true);
      for (let i = 0; i <= PROBKI; i += 1) {
        expect(wKadrze(kadrPrzelotu(start, cel, WIDOK, i / PROBKI), r), `klatka ${i}`).toBe(true);
      }
      expect(kadrPrzelotu(start, cel, WIDOK, 1)).toBe(cel);
      expect(kadrPrzelotu(start, cel, WIDOK, 0)).toBe(start);
    });
  }

  it('punkt widzenia i transform są wzajemnie odwrotne', () => {
    const t = { scale: 0.73, translateX: -123.5, translateY: 456.25 };
    const z = transformPunktu(punktWidzenia(t, WIDOK), WIDOK);
    expect(z.scale).toBeCloseTo(t.scale, 12);
    expect(z.translateX).toBeCloseTo(t.translateX, 9);
    expect(z.translateY).toBeCloseTo(t.translateY, 9);
  });
});

describe('reduktor z numerem przelotu — para „polecenie animowane / gest natychmiastowy” z jednego źródła', () => {
  const reduktor = reduktorZPrzelotem(cameraReducer);
  const stan0: CameraState = {
    transform: { scale: 0.5, translateX: 0, translateY: 0 },
    viewportSize: WIDOK,
    swiat: { minX: 0, minY: 0, maxX: 4000, maxY: 2000 },
  };
  const kadruj = {
    type: 'kadruj' as const,
    anchor: { minX: 1000, minY: 500, maxX: 1400, maxY: 800 },
    viewportSize: WIDOK,
  };

  it('polecenie z przelotem nadaje NOWY numer; kolejne — następny', () => {
    const s1 = reduktor(stan0, { ...kadruj, przelot: true });
    expect(s1.przelot).toBe(1);
    expect(s1.transform).not.toEqual(stan0.transform);
    const s2 = reduktor(s1, { type: 'refit', bbox: stan0.swiat!, viewportSize: WIDOK, przelot: true });
    expect(s2.przelot).toBe(2);
  });

  it('gest PO poleceniu (kółko, przeciągnięcie) przenosi numer bez zmiany — nie animuje się', () => {
    const s1 = reduktor(stan0, { ...kadruj, przelot: true });
    expect(reduktor(s1, { type: 'zoom', cursor: { x: 10, y: 10 }, factor: 1.1 }).przelot).toBe(s1.przelot);
    expect(reduktor(s1, { type: 'pan', delta: { x: 5, y: 0 } }).przelot).toBe(s1.przelot);
  });

  it('zmiana układu (resize) w tej samej partii co polecenie zachowuje numer polecenia', () => {
    const s1 = reduktor(stan0, { ...kadruj, przelot: true });
    const s2 = reduktor(s1, { type: 'resize', viewportSize: { width: 1000, height: 800 } });
    expect(s2.przelot).toBe(s1.przelot);
    expect(s2.transform).not.toEqual(s1.transform);
  });

  it('akcja odtwarzająca stan od zera (refit bez przelotu) też przenosi numer', () => {
    const s1 = reduktor(stan0, { ...kadruj, przelot: true });
    const s2 = reduktor(s1, { type: 'refit', bbox: stan0.swiat!, viewportSize: WIDOK });
    expect(s2.przelot).toBe(s1.przelot);
  });

  it('gest bez polecenia: brak numeru; wynik równy reduktorowi kamery', () => {
    const akcja = { type: 'zoom' as const, cursor: { x: 10, y: 10 }, factor: 1.1 };
    const s = reduktor(stan0, akcja);
    expect(s.przelot).toBeUndefined();
    expect(s).toEqual(cameraReducer(stan0, akcja));
  });
});

describe('dozwolenie przelotu: ILOCZYN {zegar klatek, matchMedia, preferencja ruchu}', () => {
  const okno = (raf: boolean, mm: boolean, reduce: boolean) =>
    ({
      ...(raf ? { requestAnimationFrame: () => 1 } : {}),
      ...(mm ? { matchMedia: (q: string) => ({ matches: reduce && q === '(prefers-reduced-motion: reduce)' }) } : {}),
    }) as unknown as Window & typeof globalThis;
  for (const raf of [true, false]) {
    for (const mm of [true, false]) {
      for (const reduce of [true, false]) {
        const oczekiwane = raf && mm && !reduce;
        it(`zegar klatek ${raf ? 'jest' : 'brak'} × matchMedia ${mm ? 'jest' : 'brak'} × reduce ${reduce ? 'tak' : 'nie'} → ${oczekiwane ? 'przelot' : 'cięcie'}`, () => {
          expect(przelotDozwolony(okno(raf, mm, reduce))).toBe(oczekiwane);
        });
      }
    }
  }
  it('brak okna (render poza przeglądarką) → cięcie', () => {
    expect(przelotDozwolony(undefined)).toBe(false);
  });
});
