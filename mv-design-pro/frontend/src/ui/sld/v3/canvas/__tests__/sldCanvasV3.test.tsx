/**
 * SLD V3 F6b — testy `canvas/SldCanvasV3.tsx` (SLD_CAD_SPEC_V3 §6/§7;
 * REBUILD_PLAN_V3 F6b). Renderowane na REALNEJ fixturze `sldSubstrate52s`
 * (ta sama fixtura co `scene/__tests__/buildScene.test.ts`, F6a) — nie
 * syntetyki, zgodnie z zadaniem.
 *
 * Zakres (DoD zadania):
 *  A. Montaż: liczba symboli w DOM = `scene.symbols.length` dla danego LOD.
 *  B. Przełączenie LOD (`lodOverride`, escape hatch — patrz `SldCanvasV3Props`
 *     nagłówek) zmienia zawartość (L0 vs L2).
 *  C. Klik w symbol woła `onElementClick` z jego `testId`.
 *  D. Overlay energizacji zmienia WYŁĄCZNIE atrybuty koloru — geometria
 *     (x/y/width/height/d/points/transform) identyczna z i bez nakładki.
 *  E. Determinizm: dwa rendery tych samych propsów → identyczny innerHTML.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod } from '../../scene/buildScene';
import {
  SldCanvasV3,
  computeFaultFlowPlacements,
  computeFaultPointMarkerPlacement,
  computeFlowOverlayPlacements,
  computeOltcBadgePlacements,
  computeResultLabelPlacements,
  layoutResultLabels,
  flowOverlayGeometry,
  formatFlowLabelPl,
  formatOltcBadgeLabel,
} from '../SldCanvasV3';
import { buildResultLabelsFromScene, resultRefForSegment } from '../resultLabels';
import type { RawOverlayElement, RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import {
  singleHopSegmentRefs,
  type SegmentFaultFlowOverlay,
  type SegmentFlowOverlay,
  type SldV3Overlay,
  type TransformerOltcOverlay,
} from '../overlay';
import { formatMagnitudeKa } from '../../../../sld-overlay/FaultContributionArrow';
import { boundingBoxOfRect, cameraViewBox, computeInitialCameraState } from '../camera';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { HIGHLIGHT_COLOR, STATE_COLOR, VOLTAGE_COLOR } from '../../theme/colorTokens';

afterEach(() => cleanup());

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;

/** Strip stroke/fill VALUES only (not the attribute presence) so we can
 *  diff markup for pure-color changes without a full attribute-by-attribute
 *  walk. Geometry attributes (x/y/width/height/d/points/transform) are
 *  untouched by overlay coloring (spec §6 P5) — this proves it structurally.
 *
 *  P-A (2026-07-17): nakładka dopisuje też ATRYBUTY DIAGNOSTYCZNE
 *  `data-energized`/`data-flow-direction`/`data-flow-source` (czysty odczyt
 *  nakładki dla audytora DOM/e2e — `sld-pa-powerflow-tor.spec.ts`; zero
 *  geometrii). Diff geometrii usuwa je W CAŁOŚCI (nie tylko wartości —
 *  bez nakładki atrybut nie istnieje). */
function stripColorAttrs(html: string): string {
  return html
    .replace(/stroke="[^"]*"/g, 'stroke="_"')
    .replace(/fill="[^"]*"/g, 'fill="_"')
    .replace(/ data-(?:energized|flow-direction|flow-source)="[^"]*"/g, '');
}

describe('SldCanvasV3 — montaż na realnej fixturze (53 stacje)', () => {
  it('LOD 0: liczba symboli w DOM = scene.symbols.length', () => {
    const scene = buildSceneV3(enm, 0);
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} />);
    const symbolGroup = container.querySelector('[data-testid="sld-v3-symbols"]');
    expect(symbolGroup?.children.length).toBe(scene.symbols.length);
  });

  // INTENCJA (zachowana z wersji sprzed V12K-218): render NIE GUBI elementów
  // sceny. Od declutteru ekranowego etykieta poniżej progu czytelności nie
  // trafia do DOM, więc równość „węzły = scene.labels.length" przestała być
  // prawdziwa przy pełnym widoku sieci (kadr 1200×800 na 53 stacje daje skalę,
  // przy której CAŁE pismo ma ~2 px). Intencja zostaje wyrażona mocniej: nic nie
  // ginie PO CICHU — każda etykieta jest albo w DOM, albo policzona jako ukryta.
  it('LOD 2: symbole w DOM = scene.symbols.length; etykiety w DOM + ukryte = scene.labels.length', () => {
    const scene = buildSceneV3(enm, 2);
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />);
    const symbolGroup = container.querySelector('[data-testid="sld-v3-symbols"]');
    const labelGroup = container.querySelector('[data-testid="sld-v3-labels"]');
    expect(symbolGroup?.children.length).toBe(scene.symbols.length);
    const ukryte = Number(labelGroup?.getAttribute('data-hidden-unreadable') ?? '0');
    expect((labelGroup?.children.length ?? 0) + ukryte).toBe(scene.labels.length);
  });

  // Dowód, że próg NAPRAWDĘ gryzie na tym kadrze, i że ukrycie jest JAWNE.
  // Bez tego poprzedni test przechodziłby także wtedy, gdyby declutter przestał
  // działać (0 ukrytych + wszystkie w DOM też daje sumę).
  it('pełny widok sieci: opisy nieczytelne są ukryte i zameldowane w warstwie ekranu', () => {
    const scene = buildSceneV3(enm, 2);
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />);
    const labelGroup = container.querySelector('[data-testid="sld-v3-labels"]');
    const ukryte = Number(labelGroup?.getAttribute('data-hidden-unreadable') ?? '0');
    expect(ukryte).toBeGreaterThan(0);
    expect(ukryte).toBeLessThanOrEqual(scene.labels.length);
    // V12K-222: komunikat przeniesiony z ramki ARKUSZA do warstwy EKRANU. Pierwsza
    // wersja wpadała w pułapkę, którą sama opisuje — przy skali ukrywającej etykiety
    // sam komunikat miał ~2 px i był nieczytelny.
    const komunikat = container.querySelector('[data-testid="sld-v3-hidden-labels-hint"]');
    expect(komunikat?.textContent).toContain('przybliż, aby zobaczyć');
    expect(komunikat?.getAttribute('data-hidden-count')).toBe(String(ukryte));
    // Dowód kompensacji skali: pismo w jednostkach ŚWIATA musi być tym większe, im
    // mniejsza skala kamery — tylko wtedy na ekranie ma stały rozmiar. Przy pełnym
    // widoku sieci (skala ≪ 1) fontSize w świecie jest wyraźnie większy od nominału.
    const fontSize = Number(komunikat?.getAttribute('font-size') ?? '0');
    expect(fontSize).toBeGreaterThan(12);
  });

  it('kanwa niesie ramkę arkusza (SheetFrame) i tło SCADA', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} />);
    expect(container.querySelector('[data-testid="sld-sheet-frame"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-sheet-border"]')).toBeTruthy();
  });
});

describe('SldCanvasV3 — LOD (spec §7): L0 vs L2 daje różną zawartość', () => {
  it('data-scene-lod odzwierciedla lodOverride; L2 ma więcej węzłów DOM niż L0 (specyfikacje/podpisy)', () => {
    const { container: c0 } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} />);
    const { container: c2 } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />);
    expect(c0.querySelector('[data-testid="sld-canvas-v3"]')?.getAttribute('data-scene-lod')).toBe('0');
    expect(c2.querySelector('[data-testid="sld-canvas-v3"]')?.getAttribute('data-scene-lod')).toBe('2');

    // INTENCJA (zachowana): L2 niesie WIĘCEJ opisów niż L0. Od declutteru
    // ekranowego (V12K-218) sama liczba węzłów w DOM tego nie wyraża przy pełnym
    // widoku sieci — na tym kadrze próg czytelności ukrywa opisy na OBU
    // poziomach, więc porównywalibyśmy zero z zerem. Liczymy więc opisy, które
    // scena NA TYM POZIOMIE wystawiła: w DOM plus zameldowane jako ukryte.
    const opisyRazem = (c: ParentNode): number => {
      const g = c.querySelector('[data-testid="sld-v3-labels"]');
      return (g?.children.length ?? 0) + Number(g?.getAttribute('data-hidden-unreadable') ?? '0');
    };
    expect(opisyRazem(c2)).toBeGreaterThan(opisyRazem(c0));

    const symbols0 = c0.querySelector('[data-testid="sld-v3-symbols"]')?.children.length ?? 0;
    const symbols2 = c2.querySelector('[data-testid="sld-v3-symbols"]')?.children.length ?? 0;
    expect(symbols2).toBeGreaterThan(symbols0);
  });

  it('domyślnie (brak lodOverride) LOD wynika z kamery dopasowanej do sceny — startuje jako liczba 0|1|2 valid', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);
    const lod = container.querySelector('[data-testid="sld-canvas-v3"]')?.getAttribute('data-scene-lod');
    expect(['0', '1', '2']).toContain(lod);
  });
});

describe('SldCanvasV3 — klik w symbol', () => {
  it('klik w pierwszy symbol woła onElementClick z jego testId', () => {
    const scene = buildSceneV3(enm, 0);
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} onElementClick={onElementClick} />,
    );
    const firstSymbolGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.firstElementChild;
    expect(firstSymbolGroup).toBeTruthy();
    const expectedTestId = firstSymbolGroup!.getAttribute('data-testid');
    expect(expectedTestId).toBe(scene.symbols[0].meta?.testId ?? 'sld-v3-symbol-0');

    fireEvent.click(firstSymbolGroup!);
    expect(onElementClick).toHaveBeenCalledTimes(1);
    expect(onElementClick).toHaveBeenCalledWith(expectedTestId, {
      ownerRef: scene.symbols[0].meta?.ownerRef,
      elementKind: scene.symbols[0].meta?.elementKind,
    });
  });

  it('F8b-1: klik w symbol L0 (stationCollapsed) przekazuje ownerRef=station id + elementKind=station', () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((s) => s.symbolId === 'stationCollapsed');
    expect(stationIndex).toBeGreaterThanOrEqual(0);
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} onElementClick={onElementClick} />,
    );
    const stationGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[stationIndex];
    fireEvent.click(stationGroup!);
    expect(onElementClick).toHaveBeenCalledWith(expect.any(String), {
      ownerRef: scene.symbols[stationIndex].meta?.ownerRef,
      elementKind: 'station',
    });
  });

  it('bez onElementClick klik nie rzuca (brak handlera to no-op bezpieczny)', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} />);
    const firstSymbolGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.firstElementChild;
    expect(() => fireEvent.click(firstSymbolGroup!)).not.toThrow();
  });
});

describe('SldCanvasV3 — nakładka energizacji (spec §6: KOLOR, nie geometria)', () => {
  it('overlay zmienia WYŁĄCZNIE atrybuty koloru (stroke/fill) — geometria identyczna', () => {
    const scene = buildSceneV3(enm, 0);
    const testId = scene.symbols[0].meta?.testId ?? 'sld-v3-symbol-0';
    const overlay: SldV3Overlay = { energizedByTestId: { [testId]: true } };

    const { container: without } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} />);
    const { container: withOverlay } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} overlay={overlay} />,
    );

    const symbolsWithout = without.querySelector('[data-testid="sld-v3-symbols"]')!;
    const symbolsWith = withOverlay.querySelector('[data-testid="sld-v3-symbols"]')!;

    // Geometria (kolejność i atrybuty pozycyjne) identyczna po usunięciu
    // WARTOŚCI stroke/fill — dowód strukturalny, nie tylko dla jednego symbolu.
    expect(stripColorAttrs(symbolsWith.innerHTML)).toBe(stripColorAttrs(symbolsWithout.innerHTML));

    // A kolor FAKTYCZNIE się różni na oznaczonym symbolu (nakładka działa).
    const targetWithout = without.querySelector(`[data-testid="${testId}"]`)!;
    const targetWith = withOverlay.querySelector(`[data-testid="${testId}"]`)!;
    // `children[0]` = hit-rect (transparentny, bez stroke); `children[1]` =
    // `<g>` glifu — pierwszy descendant ze `stroke` tam to rysunek glifu.
    const glyphStrokeOf = (el: Element) => el.children[1]?.querySelector('[stroke]')?.getAttribute('stroke');
    expect(glyphStrokeOf(targetWith)).not.toBe(glyphStrokeOf(targetWithout));
  });

  it('bez overlay (undefined) rysunek jest bazowy mono (brak nakładki) — brak wpisu = brak zmiany koloru', () => {
    const { container: a } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} />);
    const { container: b } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} overlay={{ energizedByTestId: {} }} />,
    );
    expect(a.querySelector('[data-testid="sld-v3-symbols"]')!.innerHTML).toBe(
      b.querySelector('[data-testid="sld-v3-symbols"]')!.innerHTML,
    );
  });
});

describe('SldCanvasV3 — determinizm', () => {
  it('dwa rendery tych samych propsów dają identyczny innerHTML', () => {
    const { container: a } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />);
    const { container: b } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />);
    expect(a.innerHTML).toBe(b.innerHTML);
  });
});

describe('SldCanvasV3 — F9.5: nakładka przepływu mocy (spec §14.2, warstwa sld-v3-flow-overlay)', () => {
  /** Realny odcinek (segmentRef bez `#`) + jego indeks w scenie danego LOD —
   *  testId nakładki jest indeksowy per LOD (`sld-v3-flow-${index}`). */
  function flowTargetOnScene(lod: SceneLod): { readonly ownerRef: string; readonly index: number } {
    const scene = buildSceneV3(enm, lod);
    const index = scene.segments.findIndex(
      (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#'),
    );
    expect(index).toBeGreaterThanOrEqual(0);
    return { ownerRef: scene.segments[index].meta!.ownerRef!, index };
  }

  function overlayWithFlow(entries: Record<string, SegmentFlowOverlay>): SldV3Overlay {
    return { energizedByTestId: {}, flowByOwnerRef: entries };
  }

  const FULL_FLOW = (ownerRef: string, forward = true): SegmentFlowOverlay => ({
    ownerRef,
    forward,
    p: { value: 1.2, unit: 'MW' },
    q: { value: 0.3, unit: 'Mvar' },
    i: { value: 45, unit: 'A' },
  });

  it('(a) odcinek z wpisem w flowByOwnerRef → grot (polygon) + etykieta wartości w DOM (format polski, przecinek dziesiętny)', () => {
    const { ownerRef, index } = flowTargetOnScene(2);
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={2}
        overlay={overlayWithFlow({ [ownerRef]: FULL_FLOW(ownerRef) })}
      />,
    );
    const group = container.querySelector(`[data-testid="sld-v3-flow-${index}"]`);
    expect(group).toBeTruthy();
    expect(group!.getAttribute('data-flow-owner-ref')).toBe(ownerRef);
    expect(group!.getAttribute('data-flow-forward')).toBe('true');
    expect(container.querySelector(`[data-testid="sld-v3-flow-arrow-${index}"]`)).toBeTruthy();
    const label = container.querySelector(`[data-testid="sld-v3-flow-label-${index}"]`);
    expect(label?.textContent).toBe('1,20 MW · 0,30 Mvar · 45 A');
  });

  it('(b) odcinki BEZ wpisu → zero grota i etykiety (warstwa niesie WYŁĄCZNIE odcinki z wynikiem); bez overlay warstwa pusta', () => {
    const { ownerRef } = flowTargetOnScene(2);
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={2}
        overlay={overlayWithFlow({ [ownerRef]: FULL_FLOW(ownerRef) })}
      />,
    );
    // Dokładnie JEDEN wpis → dokładnie JEDNA grupa nakładki w warstwie.
    expect(container.querySelector('[data-testid="sld-v3-flow-overlay"]')!.children.length).toBe(1);

    const { container: noOverlay } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />,
    );
    expect(noOverlay.querySelector('[data-testid="sld-v3-flow-overlay"]')!.children.length).toBe(0);
  });

  it('(c) forward=false → grot obrócony: polygon.points = flowOverlayGeometry(points, false), tip lustrzany względem forward=true', () => {
    const { ownerRef, index } = flowTargetOnScene(2);
    const points = buildSceneV3(enm, 2).segments[index].points;
    const forwardGeom = flowOverlayGeometry(points, true)!;
    const reversedGeom = flowOverlayGeometry(points, false)!;
    expect(reversedGeom.arrowPoints).not.toBe(forwardGeom.arrowPoints);
    // Tip po przeciwnej stronie środka biegu (lustro względem mid): środek
    // odcinka tip_forward↔tip_reversed == mid biegu; oś biegu (runMid*)
    // identyczna dla obu zwrotów — obrót grota NIE przesuwa osi etykiety.
    expect(reversedGeom.tipX === forwardGeom.tipX && reversedGeom.tipY === forwardGeom.tipY).toBe(false);
    expect((reversedGeom.tipX + forwardGeom.tipX) / 2).toBe(forwardGeom.runMidX);
    expect((reversedGeom.tipY + forwardGeom.tipY) / 2).toBe(forwardGeom.runMidY);
    expect(reversedGeom.runMidX).toBe(forwardGeom.runMidX);
    expect(reversedGeom.runMidY).toBe(forwardGeom.runMidY);

    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={2}
        overlay={overlayWithFlow({ [ownerRef]: FULL_FLOW(ownerRef, false) })}
      />,
    );
    const arrow = container.querySelector(`[data-testid="sld-v3-flow-arrow-${index}"]`);
    expect(arrow!.getAttribute('points')).toBe(reversedGeom.arrowPoints);
    expect(container.querySelector(`[data-testid="sld-v3-flow-${index}"]`)!.getAttribute('data-flow-forward')).toBe('false');
  });

  it('(d) determinizm renderu nakładki: dwa rendery tych samych propsów → identyczny innerHTML warstwy przepływu', () => {
    const { ownerRef } = flowTargetOnScene(2);
    const overlay = overlayWithFlow({ [ownerRef]: FULL_FLOW(ownerRef) });
    const { container: a } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    const { container: b } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    expect(a.querySelector('[data-testid="sld-v3-flow-overlay"]')!.innerHTML).toBe(
      b.querySelector('[data-testid="sld-v3-flow-overlay"]')!.innerHTML,
    );
  });

  it('(e) L0 (plan sieci): grot obecny, tekst wartości NIEOBECNY (spec §15.2 — LOD steruje etykietami, nie ukrywa kierunku)', () => {
    const { ownerRef, index } = flowTargetOnScene(0);
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={0}
        overlay={overlayWithFlow({ [ownerRef]: FULL_FLOW(ownerRef) })}
      />,
    );
    expect(container.querySelector(`[data-testid="sld-v3-flow-arrow-${index}"]`)).toBeTruthy();
    expect(container.querySelector(`[data-testid="sld-v3-flow-label-${index}"]`)).toBeNull();
  });

  it('formatFlowLabelPl: człony TYLKO dla metryk obecnych (brak metryki = brak członu, zero atrap); znak Q zachowany; |P| bo znak P niesie strzałka; detail "p-only" (L1, spec §15.2) = samo P', () => {
    expect(formatFlowLabelPl({ ownerRef: 'x', forward: false, p: { value: -3.456, unit: 'MW' } })).toBe('3,46 MW');
    expect(
      formatFlowLabelPl({ ownerRef: 'x', forward: true, p: { value: 1, unit: 'MW' }, q: { value: -0.45, unit: 'Mvar' } }),
    ).toBe('1,00 MW · -0,45 Mvar');
    expect(formatFlowLabelPl({ ownerRef: 'x', forward: true, i: { value: 87.6, unit: 'A' } })).toBe('88 A');
    expect(
      formatFlowLabelPl(
        { ownerRef: 'x', forward: true, p: { value: 1.2, unit: 'MW' }, q: { value: 0.3, unit: 'Mvar' }, i: { value: 45, unit: 'A' } },
        'p-only',
      ),
    ).toBe('1,20 MW');
  });

  it('L1: etykieta przepływu skrócona do P (spec §15.2 adaptacyjne etykiety — „L1 skrócone, L2 pełne")', () => {
    const { ownerRef, index } = flowTargetOnScene(1);
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={1}
        overlay={overlayWithFlow({ [ownerRef]: FULL_FLOW(ownerRef) })}
      />,
    );
    expect(container.querySelector(`[data-testid="sld-v3-flow-label-${index}"]`)?.textContent).toBe('1,20 MW');
  });

  // F-2 + V-1 + V-2 (recenzja Opusa): rozłączność DLA WSZYSTKICH odcinków z
  // nakładką, względem WSZYSTKICH klas etykiet sceny (w tym tytuły stacji
  // `station-name` — V-1), WSZYSTKICH bboxów symboli (ikony DER — V-2) oraz
  // innych etykiet przepływu (stack — V-2). Payload syntetyczny na KAŻDYM
  // odcinku jednokawałkowym naraz (jak harness renderowy nadzorcy).
  for (const [lod, detail] of [[1, 'p-only'], [2, 'full']] as const) {
    it(`czytelność (LOD ${lod}, detail=${detail}): KAŻDA etykieta przepływu ma bbox rozłączny z każdą etykietą sceny, każdym symbolem i innymi etykietami przepływu`, () => {
      const scene = buildSceneV3(enm, lod);
      const singleHop = singleHopSegmentRefs(enm);
      const entries: Record<string, SegmentFlowOverlay> = {};
      for (const s of scene.segments) {
        const ref = s.meta?.ownerRef;
        if (ref && s.meta?.elementKind === 'segment' && singleHop.has(ref)) entries[ref] = FULL_FLOW(ref);
      }
      expect(Object.keys(entries).length).toBe(45);
      const placements = computeFlowOverlayPlacements(scene, entries, detail);
      expect(placements.length).toBe(45);
      // Wyrocznia wewnętrzna algorytmu: każdy kandydat znaleziony (zero
      // fallbacków na tej fixturze) …
      expect(placements.filter((p) => p.label && !p.labelPlaced)).toEqual([]);
      // … ORAZ niezależna weryfikacja rozłączności (nie ufamy fladze —
      // liczymy nachodzenia wprost, wyrocznia gryzłaby też błąd flagi).
      const obstacles = [
        ...scene.labels.map((l) => ({ ...l.rect, tag: `label:${l.ownerKind}:${l.text}` })),
        ...scene.symbols.map((s) => {
          const def = SYMBOL_DEFS[s.symbolId];
          return { x: s.x, y: s.y, width: def.width, height: def.height, tag: `symbol:${s.symbolId}` };
        }),
      ];
      const labelRects = placements.filter((p) => p.label).map((p) => ({ ...p.labelRect, tag: `flow:${p.ownerRef}` }));
      const overlapsOf = (a: { x: number; y: number; width: number; height: number }, list: typeof obstacles) =>
        list.filter(
          (r) => a.x < r.x + r.width && r.x < a.x + a.width && a.y < r.y + r.height && r.y < a.y + a.height,
        );
      for (const rect of labelRects) {
        expect(overlapsOf(rect, obstacles)).toEqual([]);
      }
      for (let i = 0; i < labelRects.length; i++) {
        for (let j = i + 1; j < labelRects.length; j++) {
          expect(overlapsOf(labelRects[i], [labelRects[j]])).toEqual([]);
        }
      }
    });
  }

  // r1 (F9.7, residuum LOW z werdyktu weryfikacji F9.5 — REBUILD_PLAN_V3
  // F9.5 „Rezydualne LOW…: (r1) brak jawnego testu ścieżki fallbacku
  // placementu (na fixturze nie zachodzi)"): fixtura realna `sldSubstrate52s`
  // NIGDY nie wymusza PEŁNEJ kolizji wszystkich 12 kandydatów
  // (`flowLabelCandidates`) — dowód gałęzi fallbacku (`candidates[0]` +
  // `labelPlaced=false`) wymaga SYNTETYCZNEJ sceny (odstępstwo od nagłówka
  // pliku „nie syntetyki" — jawnie autoryzowane przez zakres r1). Baza:
  // realna scena (`buildSceneV3`, poprawny `SceneV3` kształt), z
  // ZASTĄPIONYMI `segments`/`labels`/`symbols` — jeden syntetyczny odcinek
  // poziomy + JEDEN etykieta-przeszkoda na tyle duża, żeby pokryć WSZYSTKIE
  // kandydatów (dy∈{16,-16,32,-32}, dx∈{0,-shift,shift} wokół runMid, patrz
  // `flowLabelCandidates`) — cel: wymusić pełną kolizję, nie odtworzyć
  // dokładnie algorytm doboru kandydatów.
  it('r1: fallback placementu — WSZYSTKIE kandydaty kolidują ⇒ candidates[0] + labelPlaced=false, bez wyjątku/NaN', () => {
    const baseScene = buildSceneV3(enm, 2);
    const ownerRef = 'r1-synthetic-segment';
    const syntheticSegment = {
      points: [
        { x: 4000, y: 4000 },
        { x: 4200, y: 4000 },
      ],
      meta: { ownerRef, elementKind: 'segment' as const, kind: 'sn' as const },
    };
    const blockerLabel = {
      ownerRef: 'r1-blocker',
      ownerKind: 'segment-span' as const,
      labelClass: 't2' as const,
      text: 'r1-blocker',
      slotIndex: 1 as const,
      rect: { x: 3900, y: 3900, width: 400, height: 200 },
    };
    const syntheticScene = { ...baseScene, segments: [syntheticSegment], labels: [blockerLabel], symbols: [] };
    const flow: SegmentFlowOverlay = {
      ownerRef,
      forward: true,
      p: { value: 1.2, unit: 'MW' },
      q: { value: 0.3, unit: 'Mvar' },
      i: { value: 45, unit: 'A' },
    };

    const placements = computeFlowOverlayPlacements(syntheticScene, { [ownerRef]: flow }, 'full');

    expect(placements.length).toBe(1);
    expect(placements[0].label).not.toBe('');
    // Fallback: PIERWSZY kandydat wybrany mimo kolizji (dane > estetyka —
    // patrz `computeFlowOverlayPlacements`, `chosen = candidates[0]`), flaga
    // odzwierciedla to uczciwie (nie ukrywa etykiety, nie udaje sukcesu).
    expect(placements[0].labelPlaced).toBe(false);
    // Bez wyjątku/NaN — geometria fallbacku jest wciąż liczbami skończonymi
    // (render może ją bezpiecznie narysować, nawet kolidującą).
    expect(Number.isFinite(placements[0].labelX)).toBe(true);
    expect(Number.isFinite(placements[0].labelY)).toBe(true);
    expect(placements[0].labelRect.width).toBeGreaterThan(0);
    expect(placements[0].labelRect.height).toBeGreaterThan(0);

    // Render bez crasha (r1 „render bez crasha"): SldCanvasV3 realnej sceny
    // + overlay na TYM SAMYM ownerRef syntetycznym nie istnieje w scenie
    // realnej — r1 dowodzi brak crasha na poziomie budowniczego czystego
    // (`computeFlowOverlayPlacements`, powyżej) ORAZ na poziomie renderu
    // realnego komponentu z overlay NA PRAWDZIWYM odcinku (regresja: overlay
    // z dowolnym wpisem nigdy nie rzuca, niezależnie od `labelPlaced`).
    const { ownerRef: realOwnerRef, index } = flowTargetOnScene(2);
    expect(() =>
      render(
        <SldCanvasV3
          snapshot={enm}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          lodOverride={2}
          overlay={overlayWithFlow({ [realOwnerRef]: FULL_FLOW(realOwnerRef) })}
        />,
      ),
    ).not.toThrow();
    expect(index).toBeGreaterThanOrEqual(0);
  });
});

describe('SldCanvasV3 — V12K-092: badge wynikowy OLTC (spec §14.2/§3.5, warstwa sld-v3-oltc-overlay)', () => {
  /** Realny transformator (symbol `elementKind==='transformer'`) sceny danego
   *  LOD + jego `meta.ownerRef` = `transformerRef`. */
  function transformerRefOnScene(lod: SceneLod): string {
    const scene = buildSceneV3(enm, lod);
    const sym = scene.symbols.find((s) => s.meta?.elementKind === 'transformer' && s.meta.ownerRef);
    expect(sym).toBeTruthy();
    return sym!.meta!.ownerRef!;
  }

  function overlayWithOltc(entries: Record<string, TransformerOltcOverlay>): SldV3Overlay {
    return { energizedByTestId: {}, oltcByOwnerRef: entries };
  }

  it('(a) transformator z wpisem oltcByOwnerRef → badge (rect + tekst "poz. +N · M×") w warstwie sld-v3-oltc-overlay', () => {
    const ref = transformerRefOnScene(2);
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={2}
        overlay={overlayWithOltc({ [ref]: { ownerRef: ref, tapPosition: 3, switchCount: 4 } })}
      />,
    );
    const badge = container.querySelector(`[data-oltc-owner-ref="${ref}"]`);
    expect(badge).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v3-oltc-label-0"]')?.textContent).toBe('poz. +3 · 4×');
  });

  it('(b) bez overlay OLTC → warstwa pusta (zero atrap)', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />,
    );
    expect(container.querySelector('[data-testid="sld-v3-oltc-overlay"]')!.children.length).toBe(0);
  });

  it('(c) determinizm renderu: dwa rendery tych samych propsów → identyczny innerHTML warstwy OLTC', () => {
    const ref = transformerRefOnScene(2);
    const overlay = overlayWithOltc({ [ref]: { ownerRef: ref, tapPosition: -2 } });
    const { container: a } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    const { container: b } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    expect(a.querySelector('[data-testid="sld-v3-oltc-overlay"]')!.innerHTML).toBe(
      b.querySelector('[data-testid="sld-v3-oltc-overlay"]')!.innerHTML,
    );
  });

  it('formatOltcBadgeLabel: pozycja ze znakiem (minus typograficzny); człon "M×" TYLKO gdy switchCount niesiony', () => {
    expect(formatOltcBadgeLabel({ ownerRef: 'x', tapPosition: 0 })).toBe('poz. 0');
    expect(formatOltcBadgeLabel({ ownerRef: 'x', tapPosition: 3, switchCount: 4 })).toBe('poz. +3 · 4×');
    expect(formatOltcBadgeLabel({ ownerRef: 'x', tapPosition: -2 })).toBe('poz. −2');
  });

  it('computeOltcBadgePlacements: brak overlay ⇒ zero placementów; wpis dla nie-transformatora ⇒ ignorowany', () => {
    const scene = buildSceneV3(enm, 2);
    expect(computeOltcBadgePlacements(scene, undefined)).toEqual([]);
    // Ref spoza zbioru transformatorów sceny ⇒ brak placementu (nie fabrykuje).
    expect(
      computeOltcBadgePlacements(scene, { 'nieznany-ref': { ownerRef: 'nieznany-ref', tapPosition: 1 } }),
    ).toEqual([]);
  });
});

/** `viewBox="minX minY worldWidth worldHeight"` → skala = viewportWidthPx /
 *  worldWidth (odwrotność `cameraViewBox`, `canvas/camera.ts`). */
function scaleFromViewBox(viewBox: string, viewportWidthPx: number): number {
  const [, , worldWidth] = viewBox.split(' ').map(Number);
  return viewportWidthPx / worldWidth;
}

/** Środek świata pokazywany PRZEZ viewBox = środek prostokąta viewBox — SVG
 *  mapuje viewBox proporcjonalnie w width/height, więc środek ekranu ZAWSZE
 *  odpowiada środkowi viewBox, niezależnie od width/height. */
function worldCenterFromViewBox(viewBox: string): { x: number; y: number } {
  const [minX, minY, worldWidth, worldHeight] = viewBox.split(' ').map(Number);
  return { x: minX + worldWidth / 2, y: minY + worldHeight / 2 };
}

function viewBoxOf(container: HTMLElement): string {
  return container.querySelector('[data-testid="sld-canvas-v3"]')!.getAttribute('viewBox')!;
}

describe('SldCanvasV3 — F8a k4.1: lodOverride fituje do bboxa TEGO LOD (nie zawsze LOD2)', () => {
  it('lodOverride=0: viewBox startowy dopasowany do bboxa L0, RÓŻNY od dopasowania do L2 (dawny defekt „mały rysunek w rogu")', () => {
    const bbox0 = boundingBoxOfRect(buildSceneV3(enm, 0).bbox);
    const bbox2 = boundingBoxOfRect(buildSceneV3(enm, 2).bbox);
    const viewportSize = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    const expectedFitToL0 = cameraViewBox(computeInitialCameraState(bbox0, viewportSize).transform, viewportSize);
    const expectedWrongFitToL2 = cameraViewBox(computeInitialCameraState(bbox2, viewportSize).transform, viewportSize);

    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} />);
    const actual = viewBoxOf(container);

    expect(actual).toBe(expectedFitToL0);
    expect(actual).not.toBe(expectedWrongFitToL2);
  });

  it('lodOverride=2 (lub brak override — domyślny cel fitu = LOD2): viewBox dopasowany do bboxa L2, jak dawniej', () => {
    const bbox2 = boundingBoxOfRect(buildSceneV3(enm, 2).bbox);
    const viewportSize = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    const expectedFitToL2 = cameraViewBox(computeInitialCameraState(bbox2, viewportSize).transform, viewportSize);

    const { container: withOverride } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />);
    const { container: withoutOverride } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);

    expect(viewBoxOf(withOverride)).toBe(expectedFitToL2);
    expect(viewBoxOf(withoutOverride)).toBe(expectedFitToL2);
  });
});

describe('SldCanvasV3 — F8a k3: refit PEŁNY na zmianę snapshot; resize (width/height) zachowuje pan/zoom', () => {
  // Uwaga metodologiczna: jsdom w tym środowisku testowym NIE implementuje
  // `PointerEvent` (`globalThis.PointerEvent` nie jest konstruktorem —
  // zweryfikowane empirycznie), więc `fireEvent.pointerDown/Move/Up` na
  // realnej kanwie nie niesie `clientX/clientY/pointerId` (dochodzą jako
  // `undefined`, kanwa liczy NaN). Symulacja pan/zoom w tych testach używa
  // WHEEL (`fireEvent.wheel`, `MouseEvent`-owe `clientX/clientY` DZIAŁAJĄ w
  // jsdom — zweryfikowane) jako jedynej DOM-testowalnej ścieżki zmiany
  // kamery; pinch/pan pointer-based mają pokrycie WYŁĄCZNIE na poziomie
  // czystych funkcji (`camera.test.ts`), tak jak przed F8a (brak regresji
  // pokrycia — pointer/pinch nie miały testu DOM ani przed tą dostawą).
  const WHEEL_DELTA_Y = -50; // mały zoom-in, NIE przekracza progu LOD0 (0.4×1.15)

  it('zmiana referencji `snapshot` (nowa sieć) odrzuca zoom użytkownika i wraca do fitu — pełny refit', () => {
    const { container, rerender } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
    const initialViewBox = viewBoxOf(container);

    // Zoom (scale + translate) — kamera oddala się od fitu startowego.
    fireEvent.wheel(svg, { clientX: 200, clientY: 150, deltaY: WHEEL_DELTA_Y });
    const zoomedViewBox = viewBoxOf(container);
    expect(zoomedViewBox).not.toBe(initialViewBox);

    // Nowa referencja snapshot (ta sama treść, ale NOWY obiekt — jak przy
    // odświeżeniu ze store'a po EDYCJI modelu) ⇒ pełny refit, zoom odrzucony.
    rerender(<SldCanvasV3 snapshot={{ ...enm }} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);
    expect(viewBoxOf(container)).toBe(initialViewBox);
  });

  it('zmiana width/height (bez zmiany snapshot) ZACHOWUJE skalę i zoom użytkownika — tylko viewport się dostosowuje', () => {
    const { container, rerender } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
    const bbox2 = boundingBoxOfRect(buildSceneV3(enm, 2).bbox);
    const bboxCenter = { x: (bbox2.minX + bbox2.maxX) / 2, y: (bbox2.minY + bbox2.maxY) / 2 };

    // Zoom z kursorem POZA środkiem viewportu (200,150 ≠ środek 600,400) —
    // po zoomie punkt świata pod ŚRODKIEM viewportu przesuwa się poza
    // bboxCenter (inaczej zoom symetryczny względem środka nie odróżniałby
    // się od świeżego fitu, który też centruje bbox).
    fireEvent.wheel(svg, { clientX: 200, clientY: 150, deltaY: WHEEL_DELTA_Y });
    const viewBoxBeforeResize = viewBoxOf(container);
    const scaleBeforeResize = scaleFromViewBox(viewBoxBeforeResize, CANVAS_WIDTH);
    const worldCenterBeforeResize = worldCenterFromViewBox(viewBoxBeforeResize);
    // Kontrola założenia testu: zoom naprawdę przesunął środek świata z bbox
    // center (inaczej test niczego by nie odróżniał od świeżego fitu).
    expect(worldCenterBeforeResize.x).not.toBeCloseTo(bboxCenter.x, 3);

    const nextWidth = CANVAS_WIDTH + 300;
    rerender(<SldCanvasV3 snapshot={enm} width={nextWidth} height={CANVAS_HEIGHT} />);
    const viewBoxAfterResize = viewBoxOf(container);
    const scaleAfterResize = scaleFromViewBox(viewBoxAfterResize, nextWidth);
    const worldCenterAfterResize = worldCenterFromViewBox(viewBoxAfterResize);

    // Skala NIETKNIĘTA przez resize (k3) — tylko przez zoom/LOD-mapping.
    expect(scaleAfterResize).toBeCloseTo(scaleBeforeResize, 10);
    // Punkt świata pod środkiem viewportu PRZED resize (przesunięty zoomem,
    // NIE bbox center) pozostaje pod środkiem PO resize — dowód, że to
    // resize (zachowanie pan/zoom), nie świeży fit (który wycentrowałby bbox).
    expect(worldCenterAfterResize.x).toBeCloseTo(worldCenterBeforeResize.x, 6);
    expect(worldCenterAfterResize.y).toBeCloseTo(worldCenterBeforeResize.y, 6);
  });
});

describe('SldCanvasV3 — karta S-B: strzałki rozpływu prądu zwarciowego (warstwa sld-v3-fault-flow-overlay)', () => {
  /** Najdłuższy bieg polilinii (ta sama selekcja co placement) — do doboru
   *  celu testu (bieg ≥ 24 px świata, próg `FAULT_ARROW_MIN_RUN`). */
  function longestRunOf(points: readonly { x: number; y: number }[]): number {
    let best = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const len = Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
      if (len > best) best = len;
    }
    return best;
  }

  /** Realny odcinek (segmentRef bez `#`) z biegiem wystarczającym na strzałkę
   *  + jego indeks w scenie danego LOD (testId nakładki jest indeksowy). */
  function faultTargetOnScene(lod: SceneLod): { readonly ownerRef: string; readonly index: number } {
    const scene = buildSceneV3(enm, lod);
    const index = scene.segments.findIndex(
      (s) =>
        s.meta?.elementKind === 'segment' &&
        s.meta.ownerRef &&
        !s.meta.ownerRef.includes('#') &&
        longestRunOf(s.points) >= 24,
    );
    expect(index).toBeGreaterThanOrEqual(0);
    return { ownerRef: scene.segments[index].meta!.ownerRef!, index };
  }

  function overlayWithFault(entries: Record<string, SegmentFaultFlowOverlay>): SldV3Overlay {
    return { energizedByTestId: {}, faultFlowByOwnerRef: entries };
  }

  const FAULT_ENTRY = (ownerRef: string, forward = true): SegmentFaultFlowOverlay => ({
    ownerRef,
    forward,
    iKa: 0.245,
    payloadMaxKa: 0.245,
    colorToken: 'critical',
  });

  it('(a) odcinek z wpisem w faultFlowByOwnerRef → prymityw FaultContributionArrow (trzon+grot+etykieta kA) w warstwie', () => {
    const { ownerRef, index } = faultTargetOnScene(2);
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={2}
        overlay={overlayWithFault({ [ownerRef]: FAULT_ENTRY(ownerRef) })}
      />,
    );
    const group = container.querySelector(`[data-testid="sld-v3-fault-flow-${index}"]`);
    expect(group).toBeTruthy();
    expect(group!.getAttribute('data-fault-owner-ref')).toBe(ownerRef);
    expect(group!.getAttribute('data-fault-forward')).toBe('true');
    expect(group!.getAttribute('data-fault-color-token')).toBe('critical');
    // Części prymitywu (kontrakt `FaultContributionArrow` — testId wewnętrzne).
    expect(container.querySelector(`[data-testid="sld-v3-fault-flow-arrow-${index}-line"]`)).toBeTruthy();
    expect(container.querySelector(`[data-testid="sld-v3-fault-flow-arrow-${index}-head"]`)).toBeTruthy();
    const label = container.querySelector(`[data-testid="sld-v3-fault-flow-arrow-${index}-label"]`);
    expect(label?.textContent).toBe(formatMagnitudeKa(0.245)); // „0,2 kA" — format PL prymitywu
  });

  it('(b) bez wpisów / bez overlay → warstwa pusta (zero atrap — „overlay wyłączony bez wyniku")', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />,
    );
    expect(container.querySelector('[data-testid="sld-v3-fault-flow-overlay"]')!.children.length).toBe(0);

    const { ownerRef } = faultTargetOnScene(2);
    const { container: withEntry } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={2}
        overlay={overlayWithFault({ [ownerRef]: FAULT_ENTRY(ownerRef) })}
      />,
    );
    // Dokładnie JEDEN wpis → dokładnie JEDNA grupa strzałki w warstwie.
    expect(withEntry.querySelector('[data-testid="sld-v3-fault-flow-overlay"]')!.children.length).toBe(1);
  });

  it('(c) orientacja: forward=false ⇒ końce strzałki ZAMIENIONE względem forward=true (zwrot z tokenu kierunku solvera)', () => {
    const { ownerRef, index } = faultTargetOnScene(2);
    const scene = buildSceneV3(enm, 2);
    const placementForward = computeFaultFlowPlacements(scene, { [ownerRef]: FAULT_ENTRY(ownerRef, true) });
    const placementReversed = computeFaultFlowPlacements(scene, { [ownerRef]: FAULT_ENTRY(ownerRef, false) });
    expect(placementForward.length).toBeGreaterThanOrEqual(1);
    const pf = placementForward.find((p) => p.segmentIndex === index)!;
    const pr = placementReversed.find((p) => p.segmentIndex === index)!;
    expect(pf.fromXy).toEqual(pr.toXy);
    expect(pf.toXy).toEqual(pr.fromXy);

    // DOM: trzon zaczyna się od strony `fromXy` placementu (x1/y1 linii).
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={2}
        overlay={overlayWithFault({ [ownerRef]: FAULT_ENTRY(ownerRef, false) })}
      />,
    );
    const line = container.querySelector(`[data-testid="sld-v3-fault-flow-arrow-${index}-line"]`)!;
    expect(Number(line.getAttribute('x1'))).toBe(pr.fromXy[0]);
    expect(Number(line.getAttribute('y1'))).toBe(pr.fromXy[1]);
    expect(
      container.querySelector(`[data-testid="sld-v3-fault-flow-${index}"]`)!.getAttribute('data-fault-forward'),
    ).toBe('false');
  });

  it('(d) strzałki są WARSTWĄ nakładki, nie zmianą layoutu: geometria segmentów/symboli IDENTYCZNA z i bez wpisów', () => {
    const { ownerRef } = faultTargetOnScene(2);
    const { container: without } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />,
    );
    const { container: withFault } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={2}
        overlay={overlayWithFault({ [ownerRef]: FAULT_ENTRY(ownerRef) })}
      />,
    );
    expect(withFault.querySelector('[data-testid="sld-v3-segments"]')!.innerHTML).toBe(
      without.querySelector('[data-testid="sld-v3-segments"]')!.innerHTML,
    );
    expect(withFault.querySelector('[data-testid="sld-v3-symbols"]')!.innerHTML).toBe(
      without.querySelector('[data-testid="sld-v3-symbols"]')!.innerHTML,
    );
  });

  it('(e) determinizm renderu: dwa rendery tych samych propsów → identyczny innerHTML warstwy strzałek', () => {
    const { ownerRef } = faultTargetOnScene(2);
    const overlay = overlayWithFault({ [ownerRef]: FAULT_ENTRY(ownerRef) });
    const { container: a } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    const { container: b } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    expect(a.querySelector('[data-testid="sld-v3-fault-flow-overlay"]')!.innerHTML).toBe(
      b.querySelector('[data-testid="sld-v3-fault-flow-overlay"]')!.innerHTML,
    );
  });

  it('computeFaultFlowPlacements: brak overlay ⇒ zero placementów; ref spoza sceny ⇒ ignorowany (nie fabrykuje)', () => {
    const scene = buildSceneV3(enm, 2);
    expect(computeFaultFlowPlacements(scene, undefined)).toEqual([]);
    expect(
      computeFaultFlowPlacements(scene, { 'nieznany-ref': FAULT_ENTRY('nieznany-ref') }),
    ).toEqual([]);
  });
});

describe('SldCanvasV3 — karta SLD-P: znacznik pulse punktu zwarcia (GAP V12K-120/121, warstwa sld-v3-fault-flow-overlay)', () => {
  function overlayWithFaultPoint(faultPointMarkerRef: string): SldV3Overlay {
    return { energizedByTestId: {}, faultPointMarkerRef };
  }

  it('(a) ref dopasowany do SYMBOLU → znacznik w środku bboxa tego symbolu', () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'station');
    expect(stationIndex).toBeGreaterThanOrEqual(0);
    const symbol = scene.symbols[stationIndex];
    const ownerRef = symbol.meta!.ownerRef!;
    const def = SYMBOL_DEFS[symbol.symbolId];
    const expectedX = symbol.x + def.width / 2;
    const expectedY = symbol.y + def.height / 2;

    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={0}
        overlay={overlayWithFaultPoint(ownerRef)}
      />,
    );
    const marker = container.querySelector('[data-testid="sld-v3-fault-point-marker"]');
    expect(marker).toBeTruthy();
    expect(marker!.getAttribute('data-fault-point-owner-ref')).toBe(ownerRef);
    const dot = container.querySelector('[data-testid="sld-v3-fault-point-marker-dot"]')!;
    expect(Number(dot.getAttribute('cx'))).toBe(expectedX);
    expect(Number(dot.getAttribute('cy'))).toBe(expectedY);
    const pulse = container.querySelector('[data-testid="sld-v3-fault-point-marker-pulse"]')!;
    expect(Number(pulse.getAttribute('cx'))).toBe(expectedX);
    expect(Number(pulse.getAttribute('cy'))).toBe(expectedY);
  });

  it('(b) ref dopasowany do ODCINKA (nie protectionAnnotation) → znacznik w środku najdłuższego biegu', () => {
    const scene = buildSceneV3(enm, 2);
    const segIndex = scene.segments.findIndex(
      (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#'),
    );
    expect(segIndex).toBeGreaterThanOrEqual(0);
    const ownerRef = scene.segments[segIndex].meta!.ownerRef!;
    const placement = computeFaultPointMarkerPlacement(scene, ownerRef);
    expect(placement).not.toBeNull();
    expect(placement!.ownerRef).toBe(ownerRef);

    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={2}
        overlay={overlayWithFaultPoint(ownerRef)}
      />,
    );
    const dot = container.querySelector('[data-testid="sld-v3-fault-point-marker-dot"]')!;
    expect(Number(dot.getAttribute('cx'))).toBe(placement!.x);
    expect(Number(dot.getAttribute('cy'))).toBe(placement!.y);
  });

  it('(c) brak overlay / brak faultPointMarkerRef → warstwa bez znacznika (zero atrap — „overlay wyłączony bez wyniku")', () => {
    const { container: without } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />,
    );
    expect(without.querySelector('[data-testid="sld-v3-fault-point-marker"]')).toBeNull();

    const { container: withEmptyOverlay } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={2}
        overlay={{ energizedByTestId: {} }}
      />,
    );
    expect(withEmptyOverlay.querySelector('[data-testid="sld-v3-fault-point-marker"]')).toBeNull();
  });

  it('(d) znacznik jest WARSTWĄ nakładki, nie zmianą layoutu: geometria segmentów/symboli IDENTYCZNA z i bez znacznika', () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'station');
    const ownerRef = scene.symbols[stationIndex].meta!.ownerRef!;

    const { container: without } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} />,
    );
    const { container: withMarker } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={0}
        overlay={overlayWithFaultPoint(ownerRef)}
      />,
    );
    expect(withMarker.querySelector('[data-testid="sld-v3-segments"]')!.innerHTML).toBe(
      without.querySelector('[data-testid="sld-v3-segments"]')!.innerHTML,
    );
    expect(withMarker.querySelector('[data-testid="sld-v3-symbols"]')!.innerHTML).toBe(
      without.querySelector('[data-testid="sld-v3-symbols"]')!.innerHTML,
    );
  });

  it('(e) determinizm renderu: dwa rendery tych samych propsów → identyczny innerHTML warstwy', () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'station');
    const ownerRef = scene.symbols[stationIndex].meta!.ownerRef!;
    const overlay = overlayWithFaultPoint(ownerRef);

    const { container: a } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} overlay={overlay} />,
    );
    const { container: b } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} overlay={overlay} />,
    );
    expect(a.querySelector('[data-testid="sld-v3-fault-flow-overlay"]')!.innerHTML).toBe(
      b.querySelector('[data-testid="sld-v3-fault-flow-overlay"]')!.innerHTML,
    );
  });

  it('computeFaultPointMarkerPlacement: brak ref ⇒ null; ref spoza sceny ⇒ null (nie fabrykuje pozycji)', () => {
    const scene = buildSceneV3(enm, 2);
    expect(computeFaultPointMarkerPlacement(scene, undefined)).toBeNull();
    expect(computeFaultPointMarkerPlacement(scene, 'nieznany-ref-spoza-sceny')).toBeNull();
  });

  it('computeFaultPointMarkerPlacement: pomija odcinki elementKind==="protectionAnnotation" (adnotacja, nie geometria toru)', () => {
    const scene = buildSceneV3(enm, 2);
    const annotationSegment = scene.segments.find(
      (s) => s.meta?.elementKind === 'protectionAnnotation' && s.meta.ownerRef,
    );
    if (!annotationSegment) return; // fixtura może nie nieść adnotacji na tym LOD — bez fabrykacji.
    const ownerRef = annotationSegment.meta!.ownerRef!;
    const hasNonAnnotationMatch = scene.segments.some(
      (s) => s.meta?.elementKind !== 'protectionAnnotation' && s.meta?.ownerRef === ownerRef,
    ) || scene.symbols.some((s) => s.meta?.ownerRef === ownerRef);
    if (hasNonAnnotationMatch) return; // ref współdzielony z elementem realnym — test niejednoznaczny na tej fixturze.
    expect(computeFaultPointMarkerPlacement(scene, ownerRef)).toBeNull();
  });
});

describe('SldCanvasV3 — SCHEMAT-10 S3 (V12K-135, D8): kolor bazowy napięcia (tabela §3, BEZ nakładki wynikowej)', () => {
  it('szyna SN stacji (#sn-bus) ma stroke = VOLTAGE_COLOR.sn; szyna nN (#lv-bus, gdy fixtura ją niesie) ma stroke = VOLTAGE_COLOR.nn — dwa RÓŻNE kolory, nie jednolity V3_STROKE_BASE jak przed S3', () => {
    const scene = buildSceneV3(enm, 2);
    const snBus = scene.segments.find((s) => s.meta?.ownerRef?.endsWith('#sn-bus'));
    expect(snBus).toBeTruthy();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />,
    );
    const snPath = container.querySelector(`[data-owner-ref="${snBus!.meta!.ownerRef}"]`);
    expect(snPath?.getAttribute('stroke')).toBe(VOLTAGE_COLOR.sn);

    const lvBus = scene.segments.find((s) => s.meta?.ownerRef?.endsWith('#lv-bus'));
    if (lvBus) {
      const lvPath = container.querySelector(`[data-owner-ref="${lvBus.meta!.ownerRef}"]`);
      expect(lvPath?.getAttribute('stroke')).toBe(VOLTAGE_COLOR.nn);
      expect(lvPath?.getAttribute('stroke')).not.toBe(snPath?.getAttribute('stroke'));
    }
  });

  it('szyna WN GPZ (#hv-bus) ma stroke = VOLTAGE_COLOR.hv (matrix §3: „110 biały" = baza — zero zmiany wizualnej dla WN)', () => {
    const scene = buildSceneV3(enm, 2);
    const hvBus = scene.segments.find(
      (s) => s.meta?.ownerRef != null && s.meta.ownerRef.includes('#hv-bus') && !s.meta.ownerRef.includes('label'),
    );
    if (!hvBus) return; // fixtura może nie mieć treści WN wprost jako odcinek na tym LOD — bez fabrykacji.
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />,
    );
    const path = container.querySelector(`[data-owner-ref="${hvBus.meta!.ownerRef}"]`);
    expect(path?.getAttribute('stroke')).toBe(VOLTAGE_COLOR.hv);
  });

  it('nakładka energizacji WCIĄŻ WYGRYWA nad kolorem napięcia (precedencja niezmieniona: wyróżnienie > napięcie)', () => {
    const scene = buildSceneV3(enm, 2);
    const snBus = scene.segments.find((s) => s.meta?.ownerRef?.endsWith('#sn-bus'));
    expect(snBus).toBeTruthy();
    const ownerRef = snBus!.meta!.ownerRef!;
    const overlay: SldV3Overlay = { energizedByTestId: {}, energizedByOwnerRef: { [ownerRef]: false } };
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    const path = container.querySelector(`[data-owner-ref="${ownerRef}"]`);
    // De-energizacja (szary) nadpisuje kolor napięcia (zielony SN) — precedencja z nagłówka `theme/colorTokens.ts`.
    expect(path?.getAttribute('stroke')).toBe(HIGHLIGHT_COLOR.deenergized);
    expect(path?.getAttribute('stroke')).not.toBe(VOLTAGE_COLOR.sn);
  });
});

describe('SldCanvasV3 — SCHEMAT-10 S3 (V12K-135, D7): kolor NOP (wyróżniony wg tabeli stanów)', () => {
  it('symbol noPoint dostaje STATE_COLOR.nop — RÓŻNY od bazy/napięcia — na L1/L2 (GS-1: L0 = marker sylwetki)', () => {
    // Fixtura bazowa nie niesie żadnego NOP (patrz `buildScene.test.ts`
    // `enmWithSyntheticNop` — ten sam GAP udokumentowany tam). Syntetyzujemy
    // lokalnie: `nop_station_ref` ciągu głównego = ref pierwszej stacji ciągu.
    // GS-1 (V12K-137, GAP §10.4): symbol `noPoint` (kolorowany wg tabeli stanów)
    // to reprezentacja L1/L2; na L0 NOP niesie marker `noOpen` sylwetki mini-RMU
    // (bez osobnego symbolu — patrz `buildScene.test.ts`).
    const scene2 = buildSceneV3(enm, 2);
    const targetStationRef = scene2.meta.mainTrunkStationIds[0];
    const enmWithNop = structuredClone(enm);
    const mainRun = enmWithNop.line_runs?.find((r) => r.run_kind === 'main_trunk');
    expect(mainRun).toBeTruthy();
    (mainRun as { nop_station_ref: string | null }).nop_station_ref = targetStationRef;

    for (const lod of [1, 2] as const) {
      const scene = buildSceneV3(enmWithNop, lod);
      const nopIndex = scene.symbols.findIndex((s) => s.symbolId === 'noPoint');
      expect(nopIndex).toBeGreaterThanOrEqual(0);
      const { container } = render(
        <SldCanvasV3 snapshot={enmWithNop} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={lod} />,
      );
      const nopGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[nopIndex];
      const strokedDescendant = nopGroup?.children[1]?.querySelector('[stroke]');
      expect(strokedDescendant?.getAttribute('stroke')).toBe(STATE_COLOR.nop);
    }
  });
});

// ---------------------------------------------------------------------------
// Karta S8 (płynność przejść LOD, P2): crossfade warstwy detalu (DOM), tryb
// bez animacji dla eksportu, oraz CIĄGŁOŚĆ na REALNEJ ścieżce (natywny wheel
// zmienia LOD — nie syntetyczny dispatch stanu; ciągłość nakładki po zmianie).
// ---------------------------------------------------------------------------
describe('SldCanvasV3 — S8: crossfade detalu i ciągłość przejść LOD', () => {
  const detailLayerOf = (c: HTMLElement) =>
    c.querySelector('[data-testid="sld-v3-detail-layer"]');
  const lodOf = (c: HTMLElement) =>
    c.querySelector('[data-testid="sld-canvas-v3"]')?.getAttribute('data-scene-lod');

  it('warstwa detalu (segmenty/symbole/etykiety) jest owinięta w JEDNĄ grupę crossfade', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />,
    );
    const detail = detailLayerOf(container);
    expect(detail).toBeTruthy();
    // Trzy grupy bazowe są POTOMKAMI warstwy detalu (nie rodzeństwem overlayów).
    expect(detail?.querySelector('[data-testid="sld-v3-segments"]')).toBeTruthy();
    expect(detail?.querySelector('[data-testid="sld-v3-symbols"]')).toBeTruthy();
    expect(detail?.querySelector('[data-testid="sld-v3-labels"]')).toBeTruthy();
    // Overlay wyników jest POZA warstwą detalu (nie migocze przy zmianie LOD).
    expect(detail?.querySelector('[data-testid="sld-v3-flow-overlay"]')).toBeNull();
  });

  it('domyślnie (produkcja) warstwa detalu niesie węzeł <animate> opacity 0→1 (crossfade)', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />,
    );
    const anim = detailLayerOf(container)?.querySelector('animate');
    expect(anim).toBeTruthy();
    expect(anim?.getAttribute('attributeName')).toBe('opacity');
    expect(anim?.getAttribute('from')).toBe('0');
    expect(anim?.getAttribute('to')).toBe('1');
    // opacity BAZOWE = 1 (jsdom/SSR/eksport bez silnika SMIL widzą pełną treść).
    expect(detailLayerOf(container)?.getAttribute('opacity')).toBe('1');
  });

  it('animateLodTransitions=false (eksport/SSR/harness) ⇒ BRAK węzła <animate>, opacity bazowe 1', () => {
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={2}
        animateLodTransitions={false}
      />,
    );
    expect(detailLayerOf(container)?.querySelector('animate')).toBeNull();
    expect(detailLayerOf(container)?.getAttribute('opacity')).toBe('1');
  });

  it('REALNA ścieżka: natywny wheel zoom-in przekraczający próg PODNOSI LOD i ZACHOWUJE nakładkę (ciągłość, karta S8)', () => {
    // Nakładka energizacji kluczowana ownerRef (tożsamość LOD-niezależna) —
    // pokrywa symbole KAŻDEGO LOD; po zmianie LOD musi nadal kolorować.
    const energizedByOwnerRef: Record<string, boolean> = {};
    for (const lod of [0, 1, 2] as const) {
      for (const sym of buildSceneV3(enm, lod).symbols) {
        if (sym.meta?.ownerRef) energizedByOwnerRef[sym.meta.ownerRef] = true;
      }
    }
    const overlay: SldV3Overlay = { energizedByTestId: {}, energizedByOwnerRef };
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} overlay={overlay} />,
    );
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
    const startLod = Number(lodOf(container));
    const energizedCount = () =>
      container.querySelectorAll('[data-testid="sld-v3-symbols"] [data-energized="true"]').length;
    const energizedBefore = energizedCount();
    expect(energizedBefore).toBeGreaterThan(0);

    // Użytkownik kręci kółkiem w kierunku zoom-in (natywne zdarzenie wheel,
    // NIE syntetyczny dispatch stanu kamery) aż LOD wzrośnie.
    let guard = 0;
    while (Number(lodOf(container)) === startLod && guard < 60) {
      fireEvent.wheel(svg, { clientX: CANVAS_WIDTH / 2, clientY: CANVAS_HEIGHT / 2, deltaY: -140 });
      guard += 1;
    }
    const endLod = Number(lodOf(container));
    expect(endLod).toBeGreaterThan(startLod); // LOD podniesiony na realnej ścieżce
    // Warstwa detalu wciąż obecna (remontowana per LOD, key=effectiveLod).
    expect(detailLayerOf(container)).toBeTruthy();
    // Nakładka PRZEŻYŁA zmianę LOD — symbole nowego LOD dalej energizowane
    // (klucz ownerRef, brak ponownego wyliczania stanu użytkownika).
    expect(energizedCount()).toBeGreaterThan(0);
  });

  it('REALNA ścieżka: powrót zoom-out po zoom-in WRACA do LOD startowego (histereza domyka pętlę, karta S8)', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
    const startLod = Number(lodOf(container));
    let guard = 0;
    while (Number(lodOf(container)) === startLod && guard < 60) {
      fireEvent.wheel(svg, { clientX: CANVAS_WIDTH / 2, clientY: CANVAS_HEIGHT / 2, deltaY: -140 });
      guard += 1;
    }
    expect(Number(lodOf(container))).toBeGreaterThan(startLod);
    // Zoom-out symetryczny — wracamy poniżej progu wyjścia, LOD spada do startu.
    guard = 0;
    while (Number(lodOf(container)) > startLod && guard < 120) {
      fireEvent.wheel(svg, { clientX: CANVAS_WIDTH / 2, clientY: CANVAS_HEIGHT / 2, deltaY: 140 });
      guard += 1;
    }
    expect(Number(lodOf(container))).toBe(startLod);
  });
});

// ---------------------------------------------------------------------------
// W4 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §8/§9/§16): warstwa liczbowych
// etykiet wynikowych — inwariancja geometrii, kolizje=0, znak/kierunek,
// determinizm, bramkowanie layerem `resultLabels`.
// ---------------------------------------------------------------------------
describe('SldCanvasV3 — W4 warstwa liczbowych etykiet wynikowych (§8/§9/§16)', () => {
  const sceneL2 = buildSceneV3(enm, 2);
  const singleHop = singleHopSegmentRefs(enm);

  function el(refId: string, kind: string, metrics: RawOverlayElement['metrics']): RawOverlayElement {
    return { ref_id: refId, kind, badges: [], metrics, severity: 'INFO' };
  }
  function payloadOf(elements: Record<string, RawOverlayElement>, analysisType = 'load_flow'): RawOverlayPayload {
    return { run_id: 'run-w4', analysis_type: analysisType, elements };
  }

  const trRef = sceneL2.symbols.find((s) => s.meta?.elementKind === 'transformer' && s.meta?.ownerRef)!.meta!.ownerRef!;
  const sourceRef = sceneL2.symbols.find((s) => s.meta?.elementKind === 'source' && s.meta?.ownerRef)!.meta!.ownerRef!;
  const branchRef = sceneL2.segments.find(
    (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#') && singleHop.has(s.meta.ownerRef),
  )!.meta!.ownerRef!;

  // Wartości przepisane z realnych źródeł (patrz `resultLabels.test.ts` nagłówek):
  // loading 72,5 % (test_result_contract_v1.py); S 0,63 MVA; P 6,546769 MW
  // (sldSubstrate52s.powerflow.json branch_flow); Q -0,3 Mvar.
  const payload = payloadOf({
    [trRef]: el(trRef, 'transformer', { S_MVA: { code: 'S_MVA', value: 0.63, unit: 'MVA', format_hint: 'fixed2' } }),
    [sourceRef]: el(sourceRef, 'generator', {
      P_MW: { code: 'P_MW', value: 6.546769, unit: 'MW', format_hint: 'fixed4' },
      Q_Mvar: { code: 'Q_Mvar', value: -0.3, unit: 'Mvar', format_hint: 'fixed4' },
    }),
    [branchRef]: el(branchRef, 'branch', { LOADING_PCT: { code: 'LOADING_PCT', value: 72.5, unit: '%', format_hint: 'fixed1' } }),
  });
  const resultLabelsByOwnerRef = buildResultLabelsFromScene(sceneL2, payload, singleHop);
  const overlayWithLabels: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef };

  it('§9 inwariancja: geometria segmentów/symboli/etykiet BAJT-identyczna z i bez warstwy liczb', () => {
    const { container: without } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />,
    );
    const { container: withLabels } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlayWithLabels} />,
    );
    for (const testId of ['sld-v3-segments', 'sld-v3-symbols', 'sld-v3-labels']) {
      expect(withLabels.querySelector(`[data-testid="${testId}"]`)!.innerHTML).toBe(
        without.querySelector(`[data-testid="${testId}"]`)!.innerHTML,
      );
    }
    // A jednak warstwa liczb JEST obecna (dowód, że test nie jest pusty).
    expect(withLabels.querySelectorAll('[data-testid^="sld-v3-result-label-"]').length).toBeGreaterThan(0);
  });

  it('R1 §11 inwariancja geometrii ON/OFF × L0/L1/L2: żaden LOD nie zmienia sceny warstwą liczb', () => {
    for (const lod of [0, 1, 2] as const) {
      const { container: without } = render(
        <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={lod} />,
      );
      const { container: withLabels } = render(
        <SldCanvasV3
          snapshot={enm}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          lodOverride={lod}
          overlay={overlayWithLabels}
        />,
      );
      for (const testId of ['sld-v3-segments', 'sld-v3-symbols', 'sld-v3-labels']) {
        expect(withLabels.querySelector(`[data-testid="${testId}"]`)!.innerHTML).toBe(
          without.querySelector(`[data-testid="${testId}"]`)!.innerHTML,
        );
      }
    }
  });

  it('R1 §wym.5 zwijanie LOD: L0 bez etykiet; L1 jedna linia; L2 do trzech (źródło P/Q)', () => {
    // Źródło niesie 2 linie (P, Q). L0 ⇒ 0 etykiet; L1 ⇒ 1 linia (P); L2 ⇒ 2 (P, Q).
    const linesAtLod = (lod: 0 | 1 | 2): readonly string[] => {
      const { container } = render(
        <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={lod} overlay={overlayWithLabels} />,
      );
      const group = container.querySelector(`[data-result-owner-ref="${CSS.escape(sourceRef)}"]`);
      if (!group) return [];
      return Array.from(group.querySelectorAll('text')).map((t) => t.textContent ?? '');
    };
    expect(linesAtLod(0)).toEqual([]);
    expect(linesAtLod(1)).toEqual(['P +6,5468 MW']);
    expect(linesAtLod(2)).toEqual(['P +6,5468 MW', 'Q -0,3000 Mvar']);
  });

  it('§8 kolizje=0: etykiety wyników wzajemnie rozłączne (anty-dryf), każda ulokowana bezkolizyjnie', () => {
    const placements = computeResultLabelPlacements(sceneL2, resultLabelsByOwnerRef);
    expect(placements.length).toBe(3);
    // Każda ulokowana względem sceny bezkolizyjnie (nie fallback).
    for (const p of placements) expect(p.labelPlaced).toBe(true);
    // Parami rozłączne (warstwa się nie nakłada sama na siebie).
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const a = placements[i];
        const b = placements[j];
        const disjoint =
          a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(disjoint).toBe(true);
      }
    }
  });

  it('§16 znak/kierunek: P generacji dodatnie renderuje się z „+"; ujemne Q z „-"', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlayWithLabels} />,
    );
    const sourceGroup = container.querySelector(`[data-result-owner-ref="${CSS.escape(sourceRef)}"]`)!;
    const texts = Array.from(sourceGroup.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toContain('P +6,5468 MW');
    expect(texts).toContain('Q -0,3000 Mvar');
  });

  it('§0 wartość 1:1: obciążenie przęsła renderuje dokładnie wartość payloadu', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlayWithLabels} />,
    );
    const branchGroup = container.querySelector(`[data-result-owner-ref="${CSS.escape(branchRef)}"]`)!;
    expect(Array.from(branchGroup.querySelectorAll('text')).map((t) => t.textContent)).toEqual(['obc. 72,5 %']);
  });

  it('determinizm: dwa rendery tych samych propsów ⇒ identyczny innerHTML warstwy liczb', () => {
    const { container: a } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlayWithLabels} />,
    );
    const { container: b } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlayWithLabels} />,
    );
    expect(a.querySelector('[data-testid="sld-v3-result-labels"]')!.innerHTML).toBe(
      b.querySelector('[data-testid="sld-v3-result-labels"]')!.innerHTML,
    );
  });

  it('bramkowanie warstwą: layer `resultLabels` ukryty ⇒ warstwa liczb pusta (zero węzłów)', () => {
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={2}
        overlay={overlayWithLabels}
        layerVisibility={{ resultLabels: false }}
      />,
    );
    expect(container.querySelectorAll('[data-testid^="sld-v3-result-label-"]').length).toBe(0);
    // Kontener warstwy pozostaje (pusty) — filtr renderu, nie usunięcie węzła.
    expect(container.querySelector('[data-testid="sld-v3-result-labels"]')).toBeTruthy();
  });

  it('brak payloadu ⇒ warstwa liczb pusta (§8 „gdy wyniki są")', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />,
    );
    expect(container.querySelectorAll('[data-testid^="sld-v3-result-label-"]').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// R2 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.8/12/14): warstwa wynikowa —
// walidacja NIEAKTUALNYCH wyników (baner + wyszarzenie), markery agregatów
// „+N wyniki" (klik → popover), inwariancja geometrii w stanach stale/agregacja.
// ---------------------------------------------------------------------------
describe('SldCanvasV3 — R2 staleness + agregacja warstwy wynikowej', () => {
  const sceneL2 = buildSceneV3(enm, 2);
  const singleHop = singleHopSegmentRefs(enm);

  function el(refId: string, kind: string, metrics: RawOverlayElement['metrics']): RawOverlayElement {
    return { ref_id: refId, kind, badges: [], metrics, severity: 'INFO' };
  }

  const trRef = sceneL2.symbols.find((s) => s.meta?.elementKind === 'transformer' && s.meta?.ownerRef)!.meta!.ownerRef!;
  const sourceRef = sceneL2.symbols.find((s) => s.meta?.elementKind === 'source' && s.meta?.ownerRef)!.meta!.ownerRef!;
  const branchRef = sceneL2.segments.find(
    (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#') && singleHop.has(s.meta.ownerRef),
  )!.meta!.ownerRef!;

  // Payload MAŁY (3 rozłączne kotwice — patrz W4 blok): brak agregacji, do
  // testów staleness/inwariancji graying.
  const smallPayload: RawOverlayPayload = {
    run_id: 'run-r2',
    analysis_type: 'load_flow',
    elements: {
      [trRef]: el(trRef, 'transformer', { S_MVA: { code: 'S_MVA', value: 0.63, unit: 'MVA', format_hint: 'fixed2' } }),
      [sourceRef]: el(sourceRef, 'generator', { P_MW: { code: 'P_MW', value: 6.546769, unit: 'MW', format_hint: 'fixed4' } }),
      [branchRef]: el(branchRef, 'branch', { LOADING_PCT: { code: 'LOADING_PCT', value: 72.5, unit: '%', format_hint: 'fixed1' } }),
    },
  };
  const smallByRef = buildResultLabelsFromScene(sceneL2, smallPayload, singleHop);

  /** PEŁNY payload rozpływu z realnych refów (produkuje ≥1 agregat na fixturze). */
  function buildFullByRef(): Record<string, ReturnType<typeof buildResultLabelsFromScene>[string]> {
    const elements: Record<string, RawOverlayElement> = {};
    for (const s of sceneL2.symbols) {
      const k = s.meta?.elementKind;
      const ref = s.meta?.ownerRef;
      if (k === 'source' && ref && !elements[ref]) elements[ref] = el(ref, 'generator', { P_MW: { code: 'P_MW', value: 6.5, unit: 'MW', format_hint: 'fixed4' } });
      if (k === 'transformer' && ref && !elements[ref]) elements[ref] = el(ref, 'transformer', { S_MVA: { code: 'S_MVA', value: 0.63, unit: 'MVA', format_hint: 'fixed2' } });
    }
    for (const s of sceneL2.segments) {
      const k = s.meta?.elementKind;
      const ref = s.meta?.ownerRef;
      if (k === 'bus') {
        // ADAPTER-BUSREF: payload backendu kluczowany KANONICZNYM Bus.ref_id —
        // szyny GPZ kompozytowe po `busResultRef`, szyny stacji po ownerRef.
        const busRef = resultRefForSegment(s.meta);
        if (busRef && !elements[busRef]) elements[busRef] = el(busRef, 'bus', { U_kV: { code: 'U_kV', value: 15.02, unit: 'kV', format_hint: 'fixed2' } });
        continue;
      }
      if (k === 'segment' && ref && !ref.includes('#') && singleHop.has(ref) && !elements[ref]) {
        elements[ref] = el(ref, 'branch', { LOADING_PCT: { code: 'LOADING_PCT', value: 72.5, unit: '%', format_hint: 'fixed1' } });
      }
    }
    return buildResultLabelsFromScene(sceneL2, { run_id: 'r2-full', analysis_type: 'load_flow', elements }, singleHop);
  }

  it('wym.8 nieaktualne: baner „⚠ wyniki nieaktualne" + etykiety oznaczone data-result-stale/wyszarzone (nie znikają)', () => {
    const overlay: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: smallByRef, resultsStale: true };
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    // Baner obecny.
    const badge = container.querySelector('[data-testid="sld-v3-result-stale-badge"]');
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toContain('wyniki nieaktualne');
    // Etykiety NIE znikają, ale są oznaczone jako nieaktualne i wyszarzone.
    const labels = container.querySelectorAll('[data-testid^="sld-v3-result-label-"]');
    expect(labels.length).toBeGreaterThan(0);
    for (const g of Array.from(labels)) {
      expect(g.getAttribute('data-result-stale')).toBe('true');
      expect(g.getAttribute('opacity')).toBe('0.5');
    }
  });

  it('wym.8 aktualne: brak banera; etykiety data-result-stale="false", pełna widoczność', () => {
    const overlay: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: smallByRef };
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    expect(container.querySelector('[data-testid="sld-v3-result-stale-badge"]')).toBeNull();
    const labels = container.querySelectorAll('[data-testid^="sld-v3-result-label-"]');
    expect(labels.length).toBeGreaterThan(0);
    for (const g of Array.from(labels)) {
      expect(g.getAttribute('data-result-stale')).toBe('false');
      expect(g.getAttribute('opacity')).toBe('1');
    }
  });

  it('wym.8 baner NIE renderuje się, gdy warstwa liczb pusta (nawet przy resultsStale)', () => {
    const overlay: SldV3Overlay = { energizedByTestId: {}, resultsStale: true };
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    expect(container.querySelector('[data-testid="sld-v3-result-stale-badge"]')).toBeNull();
  });

  it('§11 inwariancja geometrii w stanie NIEAKTUALNYM: bazowe grupy sceny bajt-identyczne z i bez warstwy', () => {
    const overlay: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: smallByRef, resultsStale: true };
    const { container: without } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />,
    );
    const { container: withStale } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    for (const testId of ['sld-v3-segments', 'sld-v3-symbols', 'sld-v3-labels']) {
      expect(withStale.querySelector(`[data-testid="${testId}"]`)!.innerHTML).toBe(
        without.querySelector(`[data-testid="${testId}"]`)!.innerHTML,
      );
    }
  });

  it('wym.14 agregacja: marker „+N wyniki" renderuje się; klik rozwija popover z listą; ponowny klik zwija', () => {
    const fullByRef = buildFullByRef();
    // Bramka: layout produkuje ≥1 agregat na tej fixturze (skutek realny).
    const layout = layoutResultLabels(sceneL2, fullByRef, [], 2);
    expect(layout.aggregates.length).toBeGreaterThan(0);
    const overlay: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: fullByRef };
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    const toggle = container.querySelector('[data-testid="sld-v3-result-aggregate-toggle-0"]');
    expect(toggle).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v3-result-aggregate-0"]')!.textContent).toContain('wyniki');
    // Popover domyślnie zwinięty.
    expect(container.querySelector('[data-testid="sld-v3-result-aggregate-popover-0"]')).toBeNull();
    // Klik → rozwinięty, lista członków obecna.
    fireEvent.click(toggle!);
    const popover = container.querySelector('[data-testid="sld-v3-result-aggregate-popover-0"]');
    expect(popover).toBeTruthy();
    expect(container.querySelectorAll('[data-testid^="sld-v3-result-aggregate-member-0-"]').length).toBe(layout.aggregates[0].count);
    // Ponowny klik → zwinięty.
    fireEvent.click(toggle!);
    expect(container.querySelector('[data-testid="sld-v3-result-aggregate-popover-0"]')).toBeNull();
  });

  it('§11 inwariancja geometrii przy AGREGACJI: bazowe grupy sceny bajt-identyczne z i bez warstwy', () => {
    const fullByRef = buildFullByRef();
    const overlay: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: fullByRef };
    const { container: without } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />,
    );
    const { container: withAgg } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    for (const testId of ['sld-v3-segments', 'sld-v3-symbols', 'sld-v3-labels']) {
      expect(withAgg.querySelector(`[data-testid="${testId}"]`)!.innerHTML).toBe(
        without.querySelector(`[data-testid="${testId}"]`)!.innerHTML,
      );
    }
    // A jednak agregat JEST obecny (dowód, że test nie jest pusty).
    expect(withAgg.querySelectorAll('[data-testid^="sld-v3-result-aggregate-"]').length).toBeGreaterThan(0);
  });
});
