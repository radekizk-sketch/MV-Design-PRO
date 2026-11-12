// @vitest-environment node
/**
 * SLD V3 — testy `canvas/camera.ts` (logika WŁASNA: zakres skali, reducer,
 * pinch geometry, viewBox pochodny). Matematyka pan/zoom/fit reużyta z v2
 * (`ViewportController.ts`) ma już pokrycie testowe w
 * `v2/__tests__/ViewportController.test.ts` — nie duplikujemy tu.
 *
 * Karta SLD-SKALA-I-NAWIGACJA (R1/R2): kamera jest CZYSTYM przekształceniem
 * jednego świata (jednej sceny). Dawne sekcje tego pliku — klasyfikacja i
 * histereza poziomów szczegółu, `refScaleFor`, mapowanie skali przy przejściu
 * poziomu, oscylacja L0↔L1 — badały mechanizm, którego już nie ma. Ich
 * intencje zostały tu w postaci, która ma sens dla jednego świata:
 *  - „brak skoku świata przy przełączeniu poziomu" → zoom zachowuje punkt
 *    świata pod kursorem dla KAŻDEJ skali (nie ma przełączeń, więc nie ma
 *    wyjątku od tej reguły);
 *  - „brak trzepotania na granicy" → monotonny zoom daje monotoniczną skalę
 *    i kończy się na granicy zakresu, bez nawrotów;
 *  - „nowe bboxy świata trafiają do stanu" → kotwica edycji niesie świat po
 *    zmianie modelu, więc dolna granica skali liczy się z aktualnej sieci.
 * Iloczyn cech zakresu skali: kierunek zoomu {przybliżenie, oddalenie} ×
 * świat {mieści się przy skali czytania, sieć rozległa (rodzina H)} × zasłony
 * {brak, panel z boku}.
 */
import { describe, expect, it } from 'vitest';

import { boundingBoxOfRect, cameraReducer, cameraViewBox, computeInitialCameraState, MIN_SCALE, pointerDistance, pointerMidpoint, SKALA_CZYTANIA, skalaMinimalna, zakresSkali, type BoundingBox, type CameraAction, type CameraState } from '../camera';
import { screenToWorld } from '../../../v2/viewport/ViewportController';

describe('boundingBoxOfRect', () => {
  it('konwersja x/y/width/height → minX/minY/maxX/maxY', () => {
    expect(boundingBoxOfRect({ x: 10, y: 20, width: 100, height: 50 })).toEqual({
      minX: 10,
      minY: 20,
      maxX: 110,
      maxY: 70,
    });
  });
});

describe('zakres skali (R2): dolna granica = dopasowanie CAŁEJ sieci, górna = MAX_SCALE', () => {
  const VIEWPORT = { width: 1600, height: 1000 } as const;
  const malySwiat: BoundingBox = { minX: 0, minY: 0, maxX: 800, maxY: 400 };
  // Rodzina H: ~530 stacji — świat dziesiątki tysięcy jednostek szeroki.
  const rozleglySwiat: BoundingBox = { minX: 0, minY: 0, maxX: 120000, maxY: 9000 };
  const panel = { top: 0, right: 400, bottom: 0, left: 0 } as const;

  it('świat mieszczący się przy skali czytania: dolna granica = skala czytania (oddalenie bez treści jest zakazane)', () => {
    expect(skalaMinimalna(malySwiat, VIEWPORT)).toBe(SKALA_CZYTANIA);
  });

  it('świat rozległy: dolna granica = skala, przy której CAŁA sieć mieści się w kadrze z oddechem', () => {
    const min = skalaMinimalna(rozleglySwiat, VIEWPORT);
    expect(min).toBeCloseTo((VIEWPORT.width - 80) / 120000, 12);
    expect(min).toBeGreaterThan(MIN_SCALE);
    expect(min).toBeLessThan(SKALA_CZYTANIA);
  });

  it('zasłona z boku zmniejsza prostokąt bezpieczny ⇒ dolna granica maleje (sieć nadal cała w odsłoniętej części)', () => {
    expect(skalaMinimalna(rozleglySwiat, VIEWPORT, panel)).toBeCloseTo((VIEWPORT.width - 400 - 80) / 120000, 12);
  });

  it('świat zdegenerowany (zerowa szerokość): granica = skala czytania, bez dzielenia przez zero', () => {
    expect(skalaMinimalna({ minX: 5, minY: 0, maxX: 5, maxY: 10 }, VIEWPORT)).toBe(SKALA_CZYTANIA);
  });

  for (const [nazwa, swiat] of [
    ['mały świat', malySwiat],
    ['świat rozległy', rozleglySwiat],
  ] as const) {
    for (const insets of [undefined, panel]) {
      const opis = `${nazwa} × ${insets ? 'z panelem' : 'bez zasłon'}`;
      it(`${opis}: monotonny zoom w obie strony kończy się na granicach zakresu, bez nawrotów`, () => {
        const start: CameraState = {
          transform: { scale: 1, translateX: 0, translateY: 0 },
          viewportSize: VIEWPORT,
          swiat,
          ...(insets ? { safeInsets: insets } : {}),
        };
        const { min, max } = zakresSkali(start);
        const cursor = { x: 700, y: 400 };
        let s = start;
        let poprzednia = s.transform.scale;
        for (let i = 0; i < 200; i += 1) {
          s = cameraReducer(s, { type: 'zoom', cursor, factor: 1.15 });
          expect(s.transform.scale).toBeGreaterThanOrEqual(poprzednia);
          poprzednia = s.transform.scale;
        }
        expect(s.transform.scale).toBe(max);
        for (let i = 0; i < 400; i += 1) {
          s = cameraReducer(s, { type: 'zoom', cursor, factor: 1 / 1.15 });
          expect(s.transform.scale).toBeLessThanOrEqual(poprzednia);
          poprzednia = s.transform.scale;
        }
        expect(s.transform.scale).toBeCloseTo(min, 12);
      });
    }
  }

  it('zoom zachowuje punkt świata pod KURSOREM dla każdej skali (brak „skoku świata")', () => {
    let s: CameraState = { transform: { scale: 0.05, translateX: 40, translateY: 20 }, viewportSize: VIEWPORT, swiat: rozleglySwiat };
    const cursor = { x: 1234, y: 321 };
    for (let i = 0; i < 40; i += 1) {
      const przed = screenToWorld(cursor, s.transform);
      const nastepny = cameraReducer(s, { type: 'zoom', cursor, factor: 1.2 });
      if (nastepny.transform.scale === s.transform.scale) break;
      const po = screenToWorld(cursor, nastepny.transform);
      expect(po.x).toBeCloseTo(przed.x, 6);
      expect(po.y).toBeCloseTo(przed.y, 6);
      s = nastepny;
    }
  });
});

describe('cameraReducer (czysty — bez DOM)', () => {
  const swiat: BoundingBox = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  const initial: CameraState = {
    transform: { scale: 1, translateX: 0, translateY: 0 },
    viewportSize: { width: 800, height: 600 },
    swiat,
  };

  it('pan przesuwa translateX/Y, NIE zmienia skali', () => {
    const next = cameraReducer(initial, { type: 'pan', delta: { x: 10, y: -5 } });
    expect(next.transform.translateX).toBe(10);
    expect(next.transform.translateY).toBe(-5);
    expect(next.transform.scale).toBe(1);
  });

  it('zoom (factor > 1) powiększa skalę', () => {
    const next = cameraReducer(initial, { type: 'zoom', cursor: { x: 0, y: 0 }, factor: 2 });
    expect(next.transform.scale).toBeGreaterThan(1);
  });

  it('resize (k3): zachowuje skalę, przelicza translate tak, by punkt świata pod starym środkiem viewportu został pod nowym środkiem', () => {
    const next = cameraReducer(initial, { type: 'resize', viewportSize: { width: 1000, height: 600 } });
    expect(next.transform.scale).toBe(1); // skala NIETKNIĘTA
    expect(next.viewportSize).toEqual({ width: 1000, height: 600 });
    // Nowy środek ekranu (500,300) musi nadal wskazywać świat (400,300):
    // translateX = 500 - 400*1 = 100.
    expect(next.transform.translateX).toBe(100);
    expect(next.transform.translateY).toBe(0);
  });

  it('refit (k3): pełny fit do nowego świata, NIE zachowuje pan/zoom użytkownika', () => {
    const panned = cameraReducer(initial, { type: 'pan', delta: { x: 999, y: 999 } });
    const newBbox: BoundingBox = { minX: 0, minY: 0, maxX: 2000, maxY: 1000 };
    const next = cameraReducer(panned, { type: 'refit', bbox: newBbox, viewportSize: { width: 800, height: 600 } });
    expect(next).toEqual(computeInitialCameraState(newBbox, { width: 800, height: 600 }));
    expect(next.swiat).toEqual(newBbox);
  });
});

describe('computeInitialCameraState', () => {
  it('dopasowuje świat do viewportu i zapamiętuje go jako źródło dolnej granicy skali', () => {
    const bbox = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };
    const state = computeInitialCameraState(bbox, { width: 800, height: 600 });
    expect(state.transform.scale).toBeCloseTo((800 - 80) / 1000, 12);
    expect(state.swiat).toEqual(bbox);
    expect(state.viewportSize).toEqual({ width: 800, height: 600 });
  });
});

describe('pointerDistance/pointerMidpoint (geometria pinch)', () => {
  it('dystans i środek dwóch punktów', () => {
    const points: readonly [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 0, y: 0 },
      { x: 6, y: 8 },
    ];
    expect(pointerDistance(points)).toBe(10);
    expect(pointerMidpoint(points)).toEqual({ x: 3, y: 4 });
  });
});

describe('cameraViewBox', () => {
  it('viewBox identyczny dla identycznego transformu (determinizm)', () => {
    const transform = { scale: 2, translateX: 10, translateY: 20 };
    const a = cameraViewBox(transform, { width: 800, height: 600 });
    const b = cameraViewBox(transform, { width: 800, height: 600 });
    expect(a).toBe(b);
  });

  it('viewBox przy scale=1, translate=0 pokrywa dokładnie viewport', () => {
    const transform = { scale: 1, translateX: 0, translateY: 0 };
    expect(cameraViewBox(transform, { width: 800, height: 600 })).toBe('0 0 800 600');
  });
});

describe('determinizm sekwencji kamery (2× ta sama sekwencja ⇒ identyczny stan)', () => {
  const initial: CameraState = {
    transform: { scale: 1, translateX: 0, translateY: 0 },
    viewportSize: { width: 800, height: 600 },
    swiat: { minX: 0, minY: 0, maxX: 10000, maxY: 10000 },
  };
  const sequence: readonly CameraAction[] = [
    { type: 'zoom', cursor: { x: 400, y: 300 }, factor: 1.5 },
    { type: 'pan', delta: { x: 12, y: -8 } },
    { type: 'zoom', cursor: { x: 100, y: 200 }, factor: 0.4 },
    { type: 'zoom', cursor: { x: 400, y: 300 }, factor: 3.0 },
    { type: 'pan', delta: { x: -30, y: 15 } },
    { type: 'zoom', cursor: { x: 600, y: 500 }, factor: 0.2 },
  ];

  it('dwa niezależne przebiegi TEJ SAMEJ sekwencji dają identyczny stan końcowy i ślad skali', () => {
    const slad = () => {
      const out: number[] = [];
      sequence.reduce((st, a) => {
        const nx = cameraReducer(st, a);
        out.push(nx.transform.scale);
        return nx;
      }, initial);
      return out;
    };
    expect(sequence.reduce(cameraReducer, initial)).toEqual(sequence.reduce(cameraReducer, initial));
    expect(slad()).toEqual(slad());
  });
});

// ---------------------------------------------------------------------------
// B-2 — akcja 'kotwicz' (kotwiczenie widoku na zmianie modelu)
// ---------------------------------------------------------------------------

describe("akcja 'kotwicz' — kamera zostaje przy obiekcie wskazanym przez operację (B-2)", () => {
  const VIEWPORT = { width: 1600, height: 1000 } as const;
  const swiat: BoundingBox = { minX: 0, minY: 0, maxX: 30000, maxY: 10000 };
  const kotwica = (szerokosc: number): BoundingBox => ({
    minX: 13500,
    minY: 5000,
    maxX: 13500 + szerokosc,
    maxY: 5000 + szerokosc / 2,
  });
  const stan = (scale: number): CameraState => ({
    transform: { scale, translateX: 0, translateY: 0 },
    viewportSize: VIEWPORT,
    swiat,
  });
  const srodek = (b: BoundingBox) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
  const naEkranie = (p: { x: number; y: number }, s: CameraState) => ({
    x: p.x * s.transform.scale + s.transform.translateX,
    y: p.y * s.transform.scale + s.transform.translateY,
  });

  it('obiekt mieszczący się w kadrze: skala NIETKNIĘTA, obiekt na środku', () => {
    const anchor = kotwica(200);
    const przed = stan(1.4);
    const po = cameraReducer(przed, { type: 'kotwicz', anchor, swiat, viewportSize: VIEWPORT });
    expect(po.transform.scale).toBe(przed.transform.scale);
    const ekran = naEkranie(srodek(anchor), po);
    expect(ekran.x).toBeCloseTo(VIEWPORT.width / 2, 6);
    expect(ekran.y).toBeCloseTo(VIEWPORT.height / 2, 6);
  });

  it('obiekt NIE mieszczący się przy obecnym zoomie: kamera oddala MINIMALNIE, aż obiekt jest cały w kadrze', () => {
    // Obiekt szerszy niż kadr przy skali 1,4 (1600/1,4 ≈ 1143 j. świata).
    const anchor = kotwica(4000);
    const po = cameraReducer(stan(1.4), { type: 'kotwicz', anchor, swiat, viewportSize: VIEWPORT });
    const lewo = naEkranie({ x: anchor.minX, y: anchor.minY }, po);
    const prawo = naEkranie({ x: anchor.maxX, y: anchor.maxY }, po);
    expect(lewo.x).toBeGreaterThanOrEqual(0);
    expect(prawo.x).toBeLessThanOrEqual(VIEWPORT.width);
    expect(lewo.y).toBeGreaterThanOrEqual(0);
    expect(prawo.y).toBeLessThanOrEqual(VIEWPORT.height);
    // Oddalenie było KONIECZNE (obiekt się nie mieścił) i nie większe niż trzeba.
    expect(po.transform.scale).toBeLessThan(1.4);
  });

  it('obiekt większy niż cała sieć: oddalenie zatrzymuje się na dopasowaniu całej sieci (R2)', () => {
    const po = cameraReducer(stan(1.4), { type: 'kotwicz', anchor: kotwica(200000), swiat, viewportSize: VIEWPORT });
    expect(po.transform.scale).toBeCloseTo(skalaMinimalna(swiat, VIEWPORT), 12);
  });

  it('kotwiczenie NIGDY nie przybliża — projektant oddalony zostaje oddalony', () => {
    const przed = stan(0.2);
    const po = cameraReducer(przed, { type: 'kotwicz', anchor: kotwica(50), swiat, viewportSize: VIEWPORT });
    expect(po.transform.scale).toBe(przed.transform.scale);
  });

  it('kotwiczenie jest deterministyczne (dwa niezależne przebiegi = identyczny stan)', () => {
    const akcja: CameraAction = { type: 'kotwicz', anchor: kotwica(4000), swiat, viewportSize: VIEWPORT };
    expect(cameraReducer(stan(1.4), akcja)).toEqual(cameraReducer(stan(1.4), akcja));
  });

  it('nowy świat trafia do stanu kamery — dolna granica kolejnego oddalenia liczy się z AKTUALNEJ sieci', () => {
    const wiekszySwiat: BoundingBox = { minX: 0, minY: 0, maxX: 90000, maxY: 10000 };
    const po = cameraReducer(stan(1.4), { type: 'kotwicz', anchor: kotwica(200), swiat: wiekszySwiat, viewportSize: VIEWPORT });
    expect(po.swiat).toEqual(wiekszySwiat);
    let s = po;
    for (let i = 0; i < 100; i += 1) s = cameraReducer(s, { type: 'zoom', cursor: { x: 800, y: 500 }, factor: 0.8 });
    expect(s.transform.scale).toBeCloseTo(skalaMinimalna(wiekszySwiat, VIEWPORT), 12);
    expect(s.transform.scale).toBeLessThan(skalaMinimalna(swiat, VIEWPORT));
  });
});
