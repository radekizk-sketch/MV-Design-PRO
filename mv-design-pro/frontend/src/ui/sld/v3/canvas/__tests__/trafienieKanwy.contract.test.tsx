/**
 * KARTA S9-4 — TRAFIENIE I TOŻSAMOŚĆ ZAZNACZENIA (audyt
 * `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` §3.2: P-1, P-2, P-3, P-6).
 *
 * Ten plik PRZYPINA deklaracje z nagłówka `canvas/hitAreas.ts` do realnego
 * drzewa DOM (reguła KLASA, NIE INSTANCJA pkt 4: „deklaracja bez testu =
 * fałszywa pewność"). Sonda odbioru w `scripts/sld_v3_acceptance.mjs` mierzy
 * SKUTECZNOŚĆ na całej sieci referencyjnej; tutaj sprawdzamy KONTRAKT:
 *
 *  1. render buduje uchwyty TĄ SAMĄ funkcją, którą czyta sonda
 *     (`buildCanvasHitAreas`) — geometria co do bajta, nie „mniej więcej";
 *  2. każdy RODZAJ obiektu kanwy ma uchwyt (iloczyn cech {rodzaj} × {LOD});
 *  3. rysunek jest BIERNY — żaden napis/nakładka nie łapie kliku;
 *  4. klik NATYWNY (`userEvent`, pełna sekwencja pointer/mouse/click przez DOM
 *     — nie `dispatchEvent` na handlerze) niesie `ownerRef` KLIKNIĘTEGO
 *     obiektu, także dla aparatu pola i dla etykiety;
 *  5. klik w tło (poza uchwytami) melduje TŁO, nie obiekt.
 *
 * Zero-Debt pkt 5: wszystkie kliki idą przez `userEvent` na węźle, który w
 * przeglądarce faktycznie byłby celem zdarzenia (węzeł warstwy trafień) —
 * precedens „martwego lewego kliku" (capture-on-pointerdown) był latami
 * niewidoczny właśnie dlatego, że specy klikały syntetycznie w węzeł rysunku.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, sceneObstacleRects, type SceneLod } from '../../scene/buildScene';
import { planSceneLabels } from '../labelLegibility';
import { SldCanvasV3 } from '../SldCanvasV3';
import {
  HIT_ATTR,
  MIN_HIT_SCREEN_PX,
  buildCanvasHitAreas,
  hitAreasFromDom,
  hitLayerOrderingInDom,
  pointerBlockersInDom,
  type HitDomNode,
  type HitObjectClass,
} from '../hitAreas';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const CANVAS_WIDTH = 1322;
const CANVAS_HEIGHT = 696;

function svgOf(container: HTMLElement): SVGSVGElement {
  return container.querySelector('[data-testid="sld-canvas-v3"]') as SVGSVGElement;
}

/** Skala kamery odczytana z kadru — ta sama wielkość, którą liczy render. */
function scaleOf(container: HTMLElement): number {
  const viewBox = svgOf(container).getAttribute('viewBox')!.split(' ').map(Number);
  return CANVAS_WIDTH / viewBox[2];
}

function hitNode(container: HTMLElement, testId: string, rola: 'obrys' | 'obszar'): Element | null {
  return container.querySelector(`[${HIT_ATTR.for}="${CSS.escape(testId)}"][${HIT_ATTR.role}="${rola}"]`);
}

describe('S9-4 — nazwy atrybutów kanału trafień', () => {
  it('stałe `HIT_ATTR` są DOKŁADNIE tymi atrybutami, które renderuje kanwa (jedno źródło nazw)', () => {
    expect(HIT_ATTR).toEqual({
      for: 'data-hit-for',
      role: 'data-hit-role',
      klasa: 'data-hit-klasa',
      ownerRef: 'data-hit-owner-ref',
    });
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} onElementClick={() => {}} />,
    );
    const dowolny = container.querySelector(`[${HIT_ATTR.for}]`);
    expect(dowolny, 'warstwa trafień renderuje węzły z kanałem audytu').toBeTruthy();
    expect(dowolny!.getAttribute(HIT_ATTR.role)).toMatch(/^(obrys|obszar)$/);
    expect(dowolny!.getAttribute(HIT_ATTR.klasa)).toBeTruthy();
  });
});

describe('S9-4 — render buduje uchwyty tą samą funkcją, którą czyta sonda', () => {
  it.each([0, 1, 2] as SceneLod[])(
    'LOD %s: geometria uchwytów w DOM == `buildCanvasHitAreas` (co do wartości, nie „mniej więcej")',
    (lod) => {
      const { container } = render(
        <SldCanvasV3
          snapshot={enm}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          lodOverride={lod}
          onElementClick={() => {}}
        />,
      );
      const scene = buildSceneV3(enm, lod);
      const scale = scaleOf(container);
      const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale);
      const oczekiwane = buildCanvasHitAreas({
        symbols: scene.symbols,
        segments: scene.segments,
        labels: plan.drawn,
        resultMarkers: [],
        scale,
      });
      const zDrzewa = hitAreasFromDom(svgOf(container) as unknown as HitDomNode);
      expect(zDrzewa.length).toBe(oczekiwane.length);
      const wgTestId = new Map(zDrzewa.map((a) => [a.testId, a]));
      for (const area of oczekiwane) {
        const wDom = wgTestId.get(area.testId);
        expect(wDom, `obiekt ${area.testId} ma uchwyt w drzewie`).toBeTruthy();
        expect(wDom!.klasa).toBe(area.klasa);
        expect(wDom!.ownerRef ?? undefined).toBe(area.ownerRef);
        // Geometria: prostokąt co do współrzędnych, łamana co do grubości i
        // liczby wierzchołków (wartości przechodzą przez atrybut `d`).
        //
        // Tolerancja 1e-6, nie równość bitowa: skalę kamery test odzyskuje z
        // ZAPISANEGO `viewBox` (tekst), więc różni się od tej, którą render miał
        // w pamięci, o ostatni bit mantysy — a plan etykiet jest od skali
        // zależny. Porównujemy geometrię, nie zaokrąglenie IEEE 754.
        if (area.obszar.ksztalt === 'prostokat') {
          expect(wDom!.obszar.ksztalt).toBe('prostokat');
          const wDomProstokat = wDom!.obszar as { x: number; y: number; width: number; height: number };
          expect(wDomProstokat.x).toBeCloseTo(area.obszar.x, 6);
          expect(wDomProstokat.y).toBeCloseTo(area.obszar.y, 6);
          expect(wDomProstokat.width).toBeCloseTo(area.obszar.width, 6);
          expect(wDomProstokat.height).toBeCloseTo(area.obszar.height, 6);
        } else {
          expect(wDom!.obszar.ksztalt).toBe('lamana');
          expect((wDom!.obszar as { halfWidth: number }).halfWidth).toBeCloseTo(area.obszar.halfWidth, 6);
        }
      }
    },
  );
});

describe('S9-4 — inwentarz klasy: KAŻDY rodzaj obiektu kanwy ma uchwyt ≥ 24 px ekranu', () => {
  /** Iloczyn cech {rodzaj obiektu} × {LOD}: na L0 są bloki stacji i łączniki
   *  wierszy arkusza (S9-1), na L1/L2 aparaty pól, transformatory, szyny i
   *  układy DER. Rodzaj nieobecny na danym poziomie nie jest błędem —
   *  błędem jest rodzaj OBECNY na scenie i BEZ uchwytu. */
  it.each([0, 1, 2] as SceneLod[])('LOD %s: żaden rodzaj obiektu sceny nie zostaje bez uchwytu', (lod) => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={lod} onElementClick={() => {}} />,
    );
    const scene = buildSceneV3(enm, lod);
    const scale = scaleOf(container);
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale);
    const oczekiwane = buildCanvasHitAreas({
      symbols: scene.symbols,
      segments: scene.segments,
      labels: plan.drawn,
      resultMarkers: [],
      scale,
    });
    const obecneRodzaje = new Set<HitObjectClass>(oczekiwane.map((a) => a.klasa));
    // Sanity: scena referencyjna niesie WIĘCEJ NIŻ JEDEN rodzaj (inaczej test
    // przechodziłby na pustym zbiorze cech).
    expect(obecneRodzaje.size).toBeGreaterThan(3);
    const zDrzewa = hitAreasFromDom(svgOf(container) as unknown as HitDomNode);
    const rodzajeWDrzewie = new Set<HitObjectClass>(zDrzewa.map((a) => a.klasa));
    for (const rodzaj of obecneRodzaje) {
      expect(rodzajeWDrzewie.has(rodzaj), `rodzaj „${rodzaj}" ma uchwyt w drzewie`).toBe(true);
    }
    // Minimum ekranowe — na KAŻDYM obiekcie, nie na wybranym przykładzie.
    for (const area of zDrzewa) {
      const najmniejszy =
        area.obszar.ksztalt === 'prostokat'
          ? Math.min(area.obszar.width, area.obszar.height) * scale
          : 2 * area.obszar.halfWidth * scale;
      expect(najmniejszy + 1e-9, `obiekt ${area.testId}`).toBeGreaterThanOrEqual(MIN_HIT_SCREEN_PX);
    }
  });

  it('L0 niesie łączniki wierszy arkusza (S9-1) i bloki stacji — oba z uchwytem', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} onElementClick={() => {}} />,
    );
    const zDrzewa = hitAreasFromDom(svgOf(container) as unknown as HitDomNode);
    expect(zDrzewa.filter((a) => a.klasa === 'lacznik-wiersza').length).toBeGreaterThan(0);
    expect(zDrzewa.filter((a) => a.klasa === 'stacja').length).toBeGreaterThan(0);
    expect(zDrzewa.filter((a) => a.klasa === 'etykieta').length).toBeGreaterThan(0);
  });
});

describe('S9-4 — rysunek jest bierny (nic poza uchwytami nie łapie kliku)', () => {
  it.each([0, 1, 2] as SceneLod[])('LOD %s: 0 węzłów rysunku łapiących zdarzenia wskaźnika', (lod) => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={lod} onElementClick={() => {}} />,
    );
    expect(pointerBlockersInDom(svgOf(container) as unknown as HitDomNode)).toEqual([]);
  });

  it('obszary rozszerzone leżą POD obrysami — rozszerzenie nie kradnie kliku obrysowi sąsiada', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} onElementClick={() => {}} />,
    );
    const porzadek = hitLayerOrderingInDom(svgOf(container) as unknown as HitDomNode);
    expect(porzadek).not.toBeNull();
    expect(porzadek!.poprawna).toBe(true);
  });

  it('REGRESJA WSTRZYKNIĘTA: zdjęcie bierności z warstwy rysunku MUSI dać blokery', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} onElementClick={() => {}} />,
    );
    const rysunek = container.querySelector('[data-testid="sld-v3-rysunek"]')!;
    expect(rysunek.getAttribute('pointer-events')).toBe('none');
    rysunek.removeAttribute('pointer-events');
    expect(pointerBlockersInDom(svgOf(container) as unknown as HitDomNode).length).toBeGreaterThan(0);
  });
});

describe('S9-4 — tożsamość zaznaczenia niesiona klikiem NATYWNYM', () => {
  it('klik w APARAT POLA zaznacza TEN aparat (ownerRef aparatu, elementKind=apparatus)', async () => {
    const user = userEvent.setup();
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} onElementClick={onElementClick} />,
    );
    const scene = buildSceneV3(enm, 2);
    const aparat = scene.symbols.find(
      (s) => s.meta?.elementKind === 'apparatus' && s.meta?.ownerRef && s.meta?.testId,
    )!;
    expect(aparat, 'scena L2 zawiera aparat pola z realnym refem').toBeTruthy();
    const wezel = hitNode(container, aparat.meta!.testId!, 'obrys');
    expect(wezel, 'aparat ma uchwyt obrysu').toBeTruthy();
    await user.click(wezel!);
    expect(onElementClick).toHaveBeenCalledTimes(1);
    expect(onElementClick).toHaveBeenCalledWith(aparat.meta!.testId, {
      ownerRef: aparat.meta!.ownerRef,
      elementKind: 'apparatus',
      derKind: undefined,
    });
  });

  it('klik w TOR zaznacza TEN odcinek (ownerRef odcinka, elementKind=segment)', async () => {
    const user = userEvent.setup();
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} onElementClick={onElementClick} />,
    );
    const scene = buildSceneV3(enm, 2);
    const index = scene.segments.findIndex((s) => s.meta?.elementKind === 'segment' && s.meta?.ownerRef);
    const odcinek = scene.segments[index];
    const testId = odcinek.meta?.testId ?? `sld-v3-segment-${index}`;
    const wezel = hitNode(container, testId, 'obrys');
    expect(wezel, 'odcinek ma uchwyt obrysu').toBeTruthy();
    await user.click(wezel!);
    expect(onElementClick).toHaveBeenCalledTimes(1);
    expect(onElementClick.mock.calls[0][0]).toBe(testId);
    expect(onElementClick.mock.calls[0][1].ownerRef).toBe(odcinek.meta!.ownerRef);
    expect(onElementClick.mock.calls[0][1].elementKind).toBe('segment');
  });

  it('klik w SZYNĘ niesie kanoniczny ref szyny (busRef) obok refu sceny', async () => {
    const user = userEvent.setup();
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} onElementClick={onElementClick} />,
    );
    const scene = buildSceneV3(enm, 2);
    const index = scene.segments.findIndex((s) => s.meta?.elementKind === 'bus');
    const szyna = scene.segments[index];
    const testId = szyna.meta?.testId ?? `sld-v3-segment-${index}`;
    await user.click(hitNode(container, testId, 'obrys')!);
    expect(onElementClick.mock.calls[0][1]).toEqual({
      ownerRef: szyna.meta!.ownerRef,
      elementKind: 'bus',
      busRef: szyna.meta!.busResultRef,
    });
  });

  it('klik w ETYKIETĘ zaznacza JEJ WŁAŚCICIELA (napis jest uchwytem elementu, nie tłem)', async () => {
    const user = userEvent.setup();
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} onElementClick={onElementClick} />,
    );
    const scene = buildSceneV3(enm, 2);
    const scale = scaleOf(container);
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale);
    const etykieta = plan.drawn.find((p) => p.label.ownerKind === 'apparatus')
      ?? plan.drawn.find((p) => p.label.ownerKind === 'station-name')!;
    await user.click(hitNode(container, `sld-v3-label-${etykieta.index}`, 'obrys')!);
    expect(onElementClick).toHaveBeenCalledTimes(1);
    expect(onElementClick.mock.calls[0][1].ownerRef).toBe(etykieta.label.ownerRef);
    expect(onElementClick.mock.calls[0][1].elementKind).toBeTruthy();
  });

  it('dwa aparaty tego samego rodzaju w JEDNYM polu mają RÓŻNE tożsamości (odłącznik szynowy vs liniowy)', () => {
    const scene = buildSceneV3(enm, 2);
    const wgTestId = new Map<string, number>();
    for (const [i, s] of scene.symbols.entries()) {
      const t = s.meta?.testId ?? `sld-v3-symbol-${i}`;
      wgTestId.set(t, (wgTestId.get(t) ?? 0) + 1);
    }
    const powtorzone = [...wgTestId.entries()].filter(([, n]) => n > 1);
    expect(powtorzone, 'żaden testId nie powtarza się na scenie').toEqual([]);
    // Dowód pozytywny: pole z DWOMA odłącznikami faktycznie istnieje na tej
    // sieci (inaczej asercja wyżej byłaby pusta).
    const wgPola = new Map<string, number>();
    for (const s of scene.symbols) {
      if (s.symbolId !== 'disconnector' || !s.meta?.ownerRef) continue;
      wgPola.set(s.meta.ownerRef, (wgPola.get(s.meta.ownerRef) ?? 0) + 1);
    }
    expect([...wgPola.values()].some((n) => n > 1)).toBe(true);
  });
});

describe('S9-4 — klik w tło (audyt P-6)', () => {
  it('klik NATYWNY poza uchwytami melduje TŁO, nie obiekt', async () => {
    const user = userEvent.setup();
    const onBackgroundClick = vi.fn();
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={0}
        onElementClick={onElementClick}
        onBackgroundClick={onBackgroundClick}
      />,
    );
    // Cel: sam korzeń `<svg>`. W przeglądarce jest nim każdy punkt, pod którym
    // nie ma uchwytu (rysunek jest bierny) — jsdom nie robi hit-testu, więc
    // klikamy DOKŁADNIE ten węzeł, który przeglądarka wskazałaby jako cel.
    await user.click(svgOf(container));
    expect(onBackgroundClick).toHaveBeenCalledTimes(1);
    expect(onElementClick).not.toHaveBeenCalled();
  });

  it('klik w obiekt NIE jest klikiem w tło (zdarzenie zatrzymane na uchwycie)', async () => {
    const user = userEvent.setup();
    const onBackgroundClick = vi.fn();
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={0}
        onElementClick={onElementClick}
        onBackgroundClick={onBackgroundClick}
      />,
    );
    const scene = buildSceneV3(enm, 0);
    const stacja = scene.symbols.find((s) => s.symbolId === 'stationCollapsed')!;
    await user.click(hitNode(container, stacja.meta!.testId!, 'obrys')!);
    expect(onElementClick).toHaveBeenCalledTimes(1);
    expect(onBackgroundClick).not.toHaveBeenCalled();
  });
});
