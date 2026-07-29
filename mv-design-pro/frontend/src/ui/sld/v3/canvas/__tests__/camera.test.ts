/**
 * SLD V3 F6b — testy `canvas/camera.ts` (logika WŁASNA: histereza LOD
 * 3-poziomowa, pinch geometry, viewBox pochodny). Matematyka pan/zoom/fit
 * reużyta z v2 (`ViewportController.ts`) ma już pokrycie testowe w
 * `v2/__tests__/ViewportController.test.ts` — nie duplikujemy tu.
 */
import { describe, expect, it } from 'vitest';

import {
  applyLodScaleMapping,
  boundingBoxOfRect,
  cameraReducer,
  cameraViewBox,
  computeInitialCameraState,
  DEFAULT_LOD_THRESHOLDS,
  LOD_HYSTERESIS_MARGIN,
  lodFromScale,
  lodFromScaleWithHysteresis,
  pointerDistance,
  pointerMidpoint,
  refScaleFor,
  type BoundingBox,
  type CameraAction,
  type CameraState,
} from '../camera';
import { screenToWorld } from '../../../v2/viewport/ViewportController';
import type { SceneLod } from '../../scene/buildScene';

describe('lodFromScale (bez histerezy — klasyfikacja czysta)', () => {
  it('poniżej l0Max: LOD 0', () => {
    expect(lodFromScale(0.1)).toBe(0);
    expect(lodFromScale(DEFAULT_LOD_THRESHOLDS.l0Max - 0.001)).toBe(0);
  });
  it('między l0Max i l1Max: LOD 1', () => {
    expect(lodFromScale(DEFAULT_LOD_THRESHOLDS.l0Max)).toBe(1);
    expect(lodFromScale(DEFAULT_LOD_THRESHOLDS.l1Max - 0.001)).toBe(1);
  });
  it('od l1Max: LOD 2', () => {
    expect(lodFromScale(DEFAULT_LOD_THRESHOLDS.l1Max)).toBe(2);
    expect(lodFromScale(10)).toBe(2);
  });
});

describe('lodFromScaleWithHysteresis (spec §7 — nie migocze na granicy; F8a-2: parametr jest refScale, patrz `refScaleFor` niżej — funkcja sama jest czystą arytmetyką progów, agnostyczna na jednostkę)', () => {
  it('scale drgający WOKÓŁ progu l0Max nie zmienia LOD (histereza)', () => {
    const { l0Max } = DEFAULT_LOD_THRESHOLDS;
    // Startujemy na LOD 0; scale tuż PONAD progiem (ale poniżej progu*(1+margin))
    // NIE wystarcza do przejścia — inaczej niż klasyfikacja bez histerezy.
    const justAbove = l0Max * 1.02;
    expect(lodFromScale(justAbove)).toBe(1); // klasyfikacja czysta BY zmieniła
    expect(lodFromScaleWithHysteresis(justAbove, 0)).toBe(0); // histereza: NIE
  });

  it('scale wystarczająco ponad próg (>= próg*(1+margin)) PRZEŁĄCZA LOD', () => {
    const { l0Max } = DEFAULT_LOD_THRESHOLDS;
    const wellAbove = l0Max * 1.2;
    expect(lodFromScaleWithHysteresis(wellAbove, 0)).toBe(1);
  });

  it('symetrycznie w dół: scale tuż PONIŻEJ progu nie wraca do niższego LOD', () => {
    const { l0Max } = DEFAULT_LOD_THRESHOLDS;
    const justBelow = l0Max * 0.98;
    expect(lodFromScaleWithHysteresis(justBelow, 1)).toBe(1);
    const wellBelow = l0Max * 0.8;
    expect(lodFromScaleWithHysteresis(wellBelow, 1)).toBe(0);
  });

  it('duży skok scale przechodzi przez POŚREDNI poziom (0→2 w jednym wywołaniu)', () => {
    const scale = DEFAULT_LOD_THRESHOLDS.l1Max * 2;
    expect(lodFromScaleWithHysteresis(scale, 0)).toBe(2);
  });

  it('brak zmiany LOD gdy scale pozostaje w tym samym przedziale', () => {
    expect(lodFromScaleWithHysteresis(0.6, 1)).toBe(1);
  });
});

describe('refScaleFor (F8a-2 — FIX-1: normalizacja skali do przestrzeni świata LOD2)', () => {
  const lodBboxes: Readonly<Record<SceneLod, BoundingBox>> = {
    0: { minX: 0, minY: 0, maxX: 1000, maxY: 500 },
    1: { minX: 0, minY: 0, maxX: 2000, maxY: 500 },
    2: { minX: 0, minY: 0, maxX: 4000, maxY: 500 },
  };

  it('lod=2: refScale === scale (świat odniesienia = sam siebie, ratio=1)', () => {
    expect(refScaleFor(0.7, 2, lodBboxes)).toBe(0.7);
  });

  it('lod=0 (świat 4x węższy niż LOD2) ⇒ refScale = scale/4', () => {
    expect(refScaleFor(1, 0, lodBboxes)).toBeCloseTo(0.25, 10);
  });

  it('inwariant: refScale ZACHOWANY w poprzek applyLodScaleMapping — dowód strukturalny, że mapowanie nie może retriggerować przejścia odwrotnego (FIX-1)', () => {
    // Proporcje realne z fixtury (raport recenzji, oscylacja 0↔1).
    const realLodBboxes: Readonly<Record<SceneLod, BoundingBox>> = {
      0: { minX: 0, minY: 0, maxX: 1344, maxY: 800 },
      1: { minX: 0, minY: 0, maxX: 3608, maxY: 2000 },
      2: { minX: 0, minY: 0, maxX: 4280, maxY: 2400 },
    };
    const viewportSize = { width: 1920, height: 1080 };
    const transform = { scale: 0.46, translateX: 12, translateY: -3 };
    const before = refScaleFor(transform.scale, 0, realLodBboxes);
    const mapped = applyLodScaleMapping(transform, realLodBboxes[0], realLodBboxes[1], viewportSize);
    const after = refScaleFor(mapped.scale, 1, realLodBboxes);
    expect(after).toBeCloseTo(before, 10);
  });

  it('bbox zdegenerowany (width<=0) ⇒ fallback = surowa skala (bez przeliczenia, dokumentowane w kodzie)', () => {
    const degenerate: Readonly<Record<SceneLod, BoundingBox>> = {
      0: { minX: 5, minY: 0, maxX: 5, maxY: 500 },
      1: { minX: 0, minY: 0, maxX: 2000, maxY: 500 },
      2: { minX: 0, minY: 0, maxX: 4000, maxY: 500 },
    };
    expect(refScaleFor(0.9, 0, degenerate)).toBe(0.9);
  });
});

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

describe('cameraReducer (czysty — bez DOM)', () => {
  const sameBboxForAllLod: BoundingBox = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  const initial: CameraState = {
    transform: { scale: 1, translateX: 0, translateY: 0 },
    lod: 1,
    viewportSize: { width: 800, height: 600 },
    lodBboxes: { 0: sameBboxForAllLod, 1: sameBboxForAllLod, 2: sameBboxForAllLod },
  };

  it('pan przesuwa translateX/Y, NIE zmienia scale/lod', () => {
    const next = cameraReducer(initial, { type: 'pan', delta: { x: 10, y: -5 } });
    expect(next.transform.translateX).toBe(10);
    expect(next.transform.translateY).toBe(-5);
    expect(next.transform.scale).toBe(1);
    expect(next.lod).toBe(1);
  });

  it('zoom (factor > 1) powiększa scale i może podnieść LOD (z histerezą)', () => {
    const next = cameraReducer(initial, { type: 'zoom', cursor: { x: 0, y: 0 }, factor: 2 });
    expect(next.transform.scale).toBeGreaterThan(1);
  });

  it('resize (k3): zachowuje scale, przelicza translate tak, by punkt świata pod starym środkiem viewportu został pod nowym środkiem', () => {
    // Kamera wycentrowana na (400,300) świata (scale=1, viewport 800x600 ⇒
    // środek ekranu = środek świata pod (400,300)).
    const centered: CameraState = {
      ...initial,
      transform: { scale: 1, translateX: 0, translateY: 0 },
    };
    const next = cameraReducer(centered, { type: 'resize', viewportSize: { width: 1000, height: 600 } });
    expect(next.transform.scale).toBe(1); // skala NIETKNIĘTA
    expect(next.viewportSize).toEqual({ width: 1000, height: 600 });
    // Nowy środek ekranu (500,300) musi nadal wskazywać świat (400,300):
    // translateX = 500 - 400*1 = 100.
    expect(next.transform.translateX).toBe(100);
    expect(next.transform.translateY).toBe(0);
  });

  it('refit (k3): pełny fit do nowego bboxa/lodBboxes, NIE zachowuje pan/zoom użytkownika', () => {
    const panned = cameraReducer(initial, { type: 'pan', delta: { x: 999, y: 999 } });
    const newBbox: BoundingBox = { minX: 0, minY: 0, maxX: 2000, maxY: 1000 };
    const next = cameraReducer(panned, {
      type: 'refit',
      bbox: newBbox,
      lodBboxes: { 0: newBbox, 1: newBbox, 2: newBbox },
      viewportSize: { width: 800, height: 600 },
    });
    // Refit ignoruje stan `panned` — wynik identyczny jak świeży fit.
    const freshFit = computeInitialCameraState(newBbox, { width: 800, height: 600 }, {
      0: newBbox,
      1: newBbox,
      2: newBbox,
    });
    expect(next).toEqual(freshFit);
  });

  it('duży skok scale przez histerezę (0→2 w jednym dispatchu) mapuje skalę RAZ, bbox0→bbox2 (nie przez bbox1)', () => {
    const bbox0: BoundingBox = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };
    const bbox1: BoundingBox = { minX: 0, minY: 0, maxX: 9999, maxY: 500 }; // nieużywany w mapowaniu tego skoku
    const bbox2: BoundingBox = { minX: 0, minY: 0, maxX: 2000, maxY: 500 };
    const state: CameraState = {
      transform: { scale: 1, translateX: 0, translateY: 0 },
      lod: 0,
      viewportSize: { width: 800, height: 600 },
      lodBboxes: { 0: bbox0, 1: bbox1, 2: bbox2 },
    };
    // F8a-2 — FIX-1: histereza porównuje `refScale = scale * widthOf(lod0)/widthOf(lod2)`
    // (ratio 1000/2000 = 0.5), NIE surową skalę — surowa skala musi więc być
    // 2x większa niż próg samego l1Max*(1+margin), żeby refScale przekroczyła
    // OBA progi w jednym dispatchu (dawniej, przed FIX-1, wystarczał
    // `l1Max*2` w surowej skali — patrz historia tego testu).
    const rawScale = (DEFAULT_LOD_THRESHOLDS.l1Max * (1 + LOD_HYSTERESIS_MARGIN) * 2) / 0.5;
    const next = cameraReducer(state, { type: 'zoom', cursor: { x: 400, y: 300 }, factor: rawScale });
    expect(next.lod).toBe(2);
    // Mapowanie bbox0→bbox2 (szerokość 1000→2000, ratio=0.5), NIE bbox0→bbox1.
    const expected = applyLodScaleMapping(
      { scale: rawScale, translateX: 0, translateY: 0 },
      bbox0,
      bbox2,
      { width: 800, height: 600 },
    );
    expect(next.transform.scale).toBeCloseTo(expected.scale, 10);
  });
});

describe('FIX-1 (recenzja Opusa) — regresja oscylacji LOD 0↔1 na zoomie produkcyjnym', () => {
  // Proporcje realne z fixtury (raport recenzji): światy L0/L1/L2 o różnych
  // szerokościach — ratio w0/w1 = 1344/3608 ≈ 0.3725, PONIŻEJ progu
  // stabilności dla histerezy w surowej skali `(1-margin)/(1+margin)` =
  // 0.85/1.15 ≈ 0.739. PRZED FIX-1 monotonny zoom-in przez próg 0→1
  // strobował 0↔1 przez kilka ticków (dowód w raporcie); PO FIX-1 (histereza
  // w przestrzeni `refScale`) to jest strukturalnie niemożliwe — patrz
  // `refScaleFor` w `camera.ts` i test inwariantu wyżej.
  const lodBboxes: Readonly<Record<SceneLod, BoundingBox>> = {
    0: { minX: 0, minY: 0, maxX: 1344, maxY: 800 },
    1: { minX: 0, minY: 0, maxX: 3608, maxY: 2000 },
    2: { minX: 0, minY: 0, maxX: 4280, maxY: 2400 },
  };
  const viewportSize = { width: 1920, height: 1080 };

  /** Symuluje ciąg ticków kółka myszy (scroll ciągły w jednym kierunku) od
   *  jawnie skonstruowanego stanu startowego — zwraca `lod` PO każdym ticku
   *  (łącznie ze stanem startowym na indeksie 0). */
  function zoomSequence(startState: CameraState, factorPerTick: number, ticks: number): SceneLod[] {
    let state = startState;
    const lods: SceneLod[] = [state.lod];
    for (let i = 0; i < ticks; i += 1) {
      state = cameraReducer(state, {
        type: 'zoom',
        cursor: { x: viewportSize.width / 2, y: viewportSize.height / 2 },
        factor: factorPerTick,
      });
      lods.push(state.lod);
    }
    return lods;
  }

  it('monotonny zoom-in od fit-startu L0: camera.lod NIEMALEJĄCY przez całą sekwencję (zero nawrotów)', () => {
    const start: CameraState = {
      transform: { scale: 0.1, translateX: 0, translateY: 0 }, // refScale ≈ 0.031, głęboko w L0
      lod: 0,
      viewportSize,
      lodBboxes,
    };
    const lods = zoomSequence(start, 1.08, 90);
    for (let i = 1; i < lods.length; i += 1) {
      expect(lods[i]).toBeGreaterThanOrEqual(lods[i - 1]);
    }
    // Sekwencja nietrywialna — faktycznie przechodzi przez oba przejścia,
    // inaczej monotoniczność byłaby prawdziwa trywialnie (LOD nigdy się nie
    // zmienia).
    expect(lods).toContain(1);
    expect(lods).toContain(2);
  });

  it('monotonny zoom-out od fit-startu L2: camera.lod NIEROSNĄCY przez całą sekwencję (zero nawrotów)', () => {
    const start: CameraState = {
      transform: { scale: 6, translateX: 0, translateY: 0 }, // refScale = 6 (lod=2 ⇒ ratio 1), głęboko w L2
      lod: 2,
      viewportSize,
      lodBboxes,
    };
    const lods = zoomSequence(start, 1 / 1.08, 90);
    for (let i = 1; i < lods.length; i += 1) {
      expect(lods[i]).toBeLessThanOrEqual(lods[i - 1]);
    }
    expect(lods).toContain(1);
    expect(lods).toContain(0);
  });
});

describe('applyLodScaleMapping (k4.2 — mapowanie skali przy przejściu LOD z kamery)', () => {
  const viewportSize = { width: 800, height: 600 };

  it('światy o RÓWNEJ szerokości ⇒ transform niezmieniony (ratio=1, brak skoku do skompensowania)', () => {
    const bbox: BoundingBox = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };
    const transform = { scale: 2, translateX: 10, translateY: 20 };
    expect(applyLodScaleMapping(transform, bbox, bbox, viewportSize)).toEqual(transform);
  });

  it('świat docelowy SZERSZY ⇒ skala się zmniejsza proporcjonalnie do szerokości (brak skoku wizualnego)', () => {
    const fromBbox: BoundingBox = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };
    const toBbox: BoundingBox = { minX: 0, minY: 0, maxX: 2000, maxY: 500 }; // 2x szerszy
    const transform = { scale: 1, translateX: 0, translateY: 0 };
    const next = applyLodScaleMapping(transform, fromBbox, toBbox, viewportSize);
    expect(next.scale).toBeCloseTo(0.5, 10); // ratio = 1000/2000 = 0.5
  });

  it('punkt świata pod środkiem viewportu zostaje pod środkiem po mapowaniu', () => {
    const fromBbox: BoundingBox = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };
    const toBbox: BoundingBox = { minX: 0, minY: 0, maxX: 4000, maxY: 500 };
    const transform = { scale: 1, translateX: -100, translateY: -50 };
    // Punkt świata pod środkiem (400,300) PRZED mapowaniem:
    const worldCenterBefore = { x: (400 - transform.translateX) / transform.scale, y: (300 - transform.translateY) / transform.scale };
    const next = applyLodScaleMapping(transform, fromBbox, toBbox, viewportSize);
    const worldCenterAfter = { x: (400 - next.translateX) / next.scale, y: (300 - next.translateY) / next.scale };
    expect(worldCenterAfter.x).toBeCloseTo(worldCenterBefore.x, 10);
    expect(worldCenterAfter.y).toBeCloseTo(worldCenterBefore.y, 10);
  });

  it('przejście a→b→a (round-trip) nie dryfuje — deterministyczne, czysta funkcja', () => {
    const bboxA: BoundingBox = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };
    const bboxB: BoundingBox = { minX: 0, minY: 0, maxX: 2000, maxY: 500 }; // 2x szerszy, liczby "okrągłe"
    const start = { scale: 1, translateX: 0, translateY: 0 };
    const afterUp = applyLodScaleMapping(start, bboxA, bboxB, viewportSize);
    const afterDown = applyLodScaleMapping(afterUp, bboxB, bboxA, viewportSize);
    expect(afterDown).toEqual(start);
    // Powtórzenie a→b→a jeszcze raz daje TEN SAM wynik (determinizm, brak
    // stanu skrytego/czasu).
    const afterUp2 = applyLodScaleMapping(afterDown, bboxA, bboxB, viewportSize);
    const afterDown2 = applyLodScaleMapping(afterUp2, bboxB, bboxA, viewportSize);
    expect(afterDown2).toEqual(afterDown);
  });

  it('bbox zdegenerowany (width<=0) ⇒ brak zmiany (fallback bezpieczny)', () => {
    const degenerate: BoundingBox = { minX: 5, minY: 0, maxX: 5, maxY: 500 };
    const other: BoundingBox = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };
    const transform = { scale: 1.5, translateX: 3, translateY: 4 };
    expect(applyLodScaleMapping(transform, degenerate, other, viewportSize)).toEqual(transform);
    expect(applyLodScaleMapping(transform, other, degenerate, viewportSize)).toEqual(transform);
  });
});

describe('computeInitialCameraState', () => {
  it('dopasowuje bbox do viewportu i klasyfikuje LOD startowy bez histerezy', () => {
    const bbox = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };
    const state = computeInitialCameraState(bbox, { width: 800, height: 600 });
    expect(state.transform.scale).toBeGreaterThan(0);
    expect(state.lod).toBe(lodFromScale(state.transform.scale));
  });

  it('bez lodBboxes: domyślnie ten sam bbox dla L0/L1/L2 (kompatybilność sprzed F8a)', () => {
    const bbox = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };
    const state = computeInitialCameraState(bbox, { width: 800, height: 600 });
    expect(state.lodBboxes).toEqual({ 0: bbox, 1: bbox, 2: bbox });
    expect(state.viewportSize).toEqual({ width: 800, height: 600 });
  });

  it('k4.1: lodBboxes jawnie przekazane (np. cel fitu = lodOverride) są zachowane w stanie', () => {
    const bbox0 = { minX: 0, minY: 0, maxX: 500, maxY: 500 };
    const bbox2 = { minX: 0, minY: 0, maxX: 2000, maxY: 500 };
    const state = computeInitialCameraState(bbox0, { width: 800, height: 600 }, { 0: bbox0, 1: bbox0, 2: bbox2 });
    expect(state.lodBboxes).toEqual({ 0: bbox0, 1: bbox0, 2: bbox2 });
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

// ---------------------------------------------------------------------------
// Karta S8 (płynność przejść LOD, P2) — dowody: brak trzepotania (liczbą
// przełączeń), zachowanie viewportu przy przełączeniu, determinizm sekwencji.
// ---------------------------------------------------------------------------

describe('histereza LOD — brak trzepotania na granicy (karta S8, dowód liczbą przełączeń)', () => {
  /** Przepuszcza sekwencję wartości `refScale` przez czystą histerezę, nosząc
   *  `currentLod`; zwraca liczbę faktycznych PRZEŁĄCZEŃ LOD i ślad poziomów.
   *  „Trzepotanie" = >0 przełączeń dla drgania, które NIE opuszcza martwej
   *  strefy granicy. */
  function threadHysteresis(scales: readonly number[], startLod: SceneLod) {
    let lod = startLod;
    let switches = 0;
    const trail: SceneLod[] = [lod];
    for (const s of scales) {
      const next = lodFromScaleWithHysteresis(s, lod);
      if (next !== lod) switches += 1;
      lod = next;
      trail.push(lod);
    }
    return { switches, finalLod: lod, trail };
  }

  it('drganie refScale WEWNĄTRZ martwej strefy granicy L1↔L2 ⇒ ZERO przełączeń', () => {
    const { l1Max } = DEFAULT_LOD_THRESHOLDS;
    const enter = l1Max * (1 + LOD_HYSTERESIS_MARGIN); // 1,38
    const exit = l1Max * (1 - LOD_HYSTERESIS_MARGIN); // 1,02
    const jitter = [1.1, 1.3, 1.05, 1.35, 1.15, 1.25, 1.1, 1.34];
    jitter.forEach((s) => expect(s > exit && s < enter).toBe(true));
    const { switches, finalLod } = threadHysteresis(jitter, 1);
    expect(switches).toBe(0);
    expect(finalLod).toBe(1);
  });

  it('drganie refScale WEWNĄTRZ martwej strefy granicy L0↔L1 ⇒ ZERO przełączeń', () => {
    const { l0Max } = DEFAULT_LOD_THRESHOLDS;
    const enter = l0Max * (1 + LOD_HYSTERESIS_MARGIN); // 0,46
    const exit = l0Max * (1 - LOD_HYSTERESIS_MARGIN); // 0,34
    const jitter = [0.36, 0.44, 0.35, 0.45, 0.4, 0.43, 0.37];
    jitter.forEach((s) => expect(s > exit && s < enter).toBe(true));
    const { switches, finalLod } = threadHysteresis(jitter, 0);
    expect(switches).toBe(0);
    expect(finalLod).toBe(0);
  });

  it('kontrast: TA SAMA sekwencja drgająca wokół surowego progu TRZEPOCZE bez histerezy, nie trzepocze z histerezą', () => {
    const { l0Max } = DEFAULT_LOD_THRESHOLDS; // 0,4
    const around = [l0Max - 0.02, l0Max + 0.02, l0Max - 0.02, l0Max + 0.02, l0Max - 0.02];
    let rawSwitches = 0;
    let prev = lodFromScale(around[0]);
    for (const s of around.slice(1)) {
      const cur = lodFromScale(s);
      if (cur !== prev) rawSwitches += 1;
      prev = cur;
    }
    expect(rawSwitches).toBeGreaterThan(0);
    expect(threadHysteresis(around, 0).switches).toBe(0);
  });

  it('pełne przekroczenie tam-i-z-powrotem ⇒ DOKŁADNIE 2 przełączenia (L1→L2→L1)', () => {
    const seq = [1.1, 1.4, 1.2, 1.0, 1.1];
    const { switches, trail } = threadHysteresis(seq, 1);
    expect(trail).toEqual([1, 1, 2, 2, 1, 1]);
    expect(switches).toBe(2);
  });

  it('progi wejścia i wyjścia są OSOBNE (wejście > wyjście) na obu granicach', () => {
    const { l0Max, l1Max } = DEFAULT_LOD_THRESHOLDS;
    expect(l0Max * (1 + LOD_HYSTERESIS_MARGIN)).toBeGreaterThan(l0Max * (1 - LOD_HYSTERESIS_MARGIN));
    expect(l1Max * (1 + LOD_HYSTERESIS_MARGIN)).toBeGreaterThan(l1Max * (1 - LOD_HYSTERESIS_MARGIN));
  });
});

describe('przełączenie LOD zachowuje viewport (karta S8 — brak „skoku świata")', () => {
  const bbox0: BoundingBox = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };
  const bbox1: BoundingBox = { minX: 0, minY: 0, maxX: 2000, maxY: 500 };
  const bbox2: BoundingBox = { minX: 0, minY: 0, maxX: 4000, maxY: 500 };
  const viewportSize = { width: 800, height: 600 };

  it('zoom przekraczający próg L0→L1 zachowuje punkt świata pod ŚRODKIEM viewportu', () => {
    const state: CameraState = {
      transform: { scale: 0.3, translateX: 40, translateY: 20 },
      lod: 0,
      viewportSize,
      lodBboxes: { 0: bbox0, 1: bbox1, 2: bbox2 },
    };
    const center = { x: viewportSize.width / 2, y: viewportSize.height / 2 };
    const worldBefore = screenToWorld(center, state.transform);
    // refScale = scale · w0/w2 = scale · 0,25; próg wejścia L0→L1 = 0,46 ⇒
    // scale ≥ 1,84. Zoom Z KURSOREM w środku (przejście LOD też recentruje na
    // środek — oba kroki zachowują punkt pod środkiem).
    const factor = 1.9 / 0.3;
    const next = cameraReducer(state, { type: 'zoom', cursor: center, factor });
    expect(next.lod).toBe(1);
    const worldAfter = screenToWorld(center, next.transform);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });
});

describe('determinizm sekwencji kamery (karta S8 — 2× ta sama sekwencja ⇒ identyczny stan)', () => {
  const sameBbox: BoundingBox = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  const initial: CameraState = {
    transform: { scale: 1, translateX: 0, translateY: 0 },
    lod: 1,
    viewportSize: { width: 800, height: 600 },
    lodBboxes: { 0: sameBbox, 1: sameBbox, 2: sameBbox },
  };
  const sequence: readonly CameraAction[] = [
    { type: 'zoom', cursor: { x: 400, y: 300 }, factor: 1.5 },
    { type: 'pan', delta: { x: 12, y: -8 } },
    { type: 'zoom', cursor: { x: 100, y: 200 }, factor: 0.4 },
    { type: 'zoom', cursor: { x: 400, y: 300 }, factor: 3.0 },
    { type: 'pan', delta: { x: -30, y: 15 } },
    { type: 'zoom', cursor: { x: 600, y: 500 }, factor: 0.2 },
  ];

  it('dwa niezależne przebiegi TEJ SAMEJ sekwencji dają identyczny stan końcowy', () => {
    const runA = sequence.reduce(cameraReducer, initial);
    const runB = sequence.reduce(cameraReducer, initial);
    expect(runA).toEqual(runB);
  });

  it('ślad LOD sekwencji jest deterministyczny (identyczny per krok)', () => {
    const traceOf = () => {
      const trace: SceneLod[] = [];
      sequence.reduce((st, a) => {
        const nx = cameraReducer(st, a);
        trace.push(nx.lod);
        return nx;
      }, initial);
      return trace;
    };
    expect(traceOf()).toEqual(traceOf());
  });
});
