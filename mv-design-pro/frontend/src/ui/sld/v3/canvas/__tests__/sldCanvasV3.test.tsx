/**
 * SLD V3 F6b — testy `canvas/SldCanvasV3.tsx` (SLD_CAD_SPEC_V3 §6/§7;
 * REBUILD_PLAN_V3 F6b). Renderowane na REALNEJ fixturze `sldSubstrate52s`
 * (ta sama fixtura co `scene/__tests__/buildScene.test.ts`, F6a) — nie
 * syntetyki, zgodnie z zadaniem.
 *
 * Zakres (DoD zadania):
 *  A. Montaż: liczba symboli w DOM = `scene.symbols.length`.
 *  B. Jedna scena niezależna od skali (karta SLD-SKALA-I-NAWIGACJA R1): ten
 *     sam rysunek toru przy każdej skali kamery; skala wystawiona atrybutem
 *     `data-skala-kamery` (dawne „przełączenie LOD" nie istnieje).
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
import { buildSceneV3 } from '../../scene/buildScene';
import { SldCanvasV3, computeFaultFlowPlacements, computeFaultPointMarkerPlacement, computeFlowOverlayPlacements, computeOltcBadgePlacements, contentBoundingBoxOf, sceneBoxToCameraWorld, flowOverlayGeometry, formatFlowLabelPl, formatOltcBadgeLabel } from '../SldCanvasV3';
import {
  orientedSegmentRefs,
  type SegmentFaultFlowOverlay,
  type SegmentFlowOverlay,
  type SldV3Overlay,
  type TransformerOltcOverlay,
} from '../overlay';
import { formatMagnitudeKa } from '../../../../sld-overlay/FaultContributionArrow';
import { boundingBoxOfRect, cameraViewBox, computeInitialCameraState, type CameraState } from '../camera';
import { kameraNaPunkcieSceny } from './kameraTestowa';
import { SLD_CANVAS_DOCK_INSETS } from '../toolbarLayout';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { LABEL_ROLE_BY_OWNER_KIND } from '../../layout/labels';
import { HIGHLIGHT_COLOR, STATE_COLOR, VOLTAGE_COLOR } from '../../theme/colorTokens';
import { zPunktemPodzialuWStacji } from '../../../../../test/punktPodzialu';

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
/** Kanwa, na której CAŁA sieć referencyjna mieści się przy skali czytania
 *  (`SKALA_CZYTANIA`, przypięte w `sldCanvasV3.wyniki.test.tsx`). */
const KANWA_CZYTANIA = { width: 30000, height: 20000 } as const;
// Testy warstwy liczb wynikowych (W4, R2) — `sldCanvasV3.wyniki.test.tsx`.
/** BLOK-PUSTY: długość grota nakładki przepływu [j.św.] — LUSTRO stałej
 *  `FLOW_ARROW_LENGTH` z `SldCanvasV3.tsx` (tam prywatna). Przęsło krótsze od
 *  grota nie może go ponieść (`flowOverlayGeometry` zwraca `null`). */
const FLOW_ARROW_LENGTH_JSW = 12;

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
/** Grubość kreski jest jedyną cechą rysunku zależną od skali: podłoga grubości
 *  (karta SLD-SKALA-I-NAWIGACJA R5) trzyma linię toru co najmniej na progu
 *  ekranowym, więc w jednostkach świata grubieje przy oddaleniu. Geometria
 *  (położenie, kształt, kolejność) nie zależy od skali — to porównanie ją izoluje. */
function bezGruboscKreski(html: string): string {
  return html.replace(/stroke-width="[^"]*"/g, 'stroke-width="_"');
}

function stripColorAttrs(html: string): string {
  return html
    .replace(/stroke="[^"]*"/g, 'stroke="_"')
    .replace(/fill="[^"]*"/g, 'fill="_"')
    .replace(/ data-(?:energized|flow-direction|flow-source)="[^"]*"/g, '');
}

describe('SldCanvasV3 — montaż na realnej fixturze (53 stacje)', () => {
  it('liczba symboli w DOM = scene.symbols.length (pełny widok sieci)', () => {
    const scene = buildSceneV3(enm);
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);
    const symbolGroup = container.querySelector('[data-testid="sld-v3-symbols"]');
    expect(symbolGroup?.children.length).toBe(scene.symbols.length);
  });

  // INTENCJA (zachowana z wersji sprzed V12K-218): render NIE GUBI elementów
  // sceny. Od declutteru ekranowego etykieta poniżej progu czytelności nie
  // trafia do DOM, więc równość „węzły = scene.labels.length" przestała być
  // prawdziwa przy pełnym widoku sieci (kadr 1200×800 na 53 stacje daje skalę,
  // przy której CAŁE pismo ma ~2 px). Intencja zostaje wyrażona mocniej: nic nie
  // ginie PO CICHU — każda etykieta jest albo w DOM, albo policzona jako ukryta.
  //
  // KD-11: kubełki są TRZY, nie dwa — ukryte DANE SZCZEGÓŁOWE
  // (`data-hidden-unreadable`) ORAZ tożsamości bez miejsca
  // (`data-dropped-identity`).
  it('symbole w DOM = scene.symbols.length; etykiety w DOM + ukryte dane + porzucone tożsamości = scene.labels.length', () => {
    const scene = buildSceneV3(enm);
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);
    const symbolGroup = container.querySelector('[data-testid="sld-v3-symbols"]');
    const labelGroup = container.querySelector('[data-testid="sld-v3-labels"]');
    expect(symbolGroup?.children.length).toBe(scene.symbols.length);
    const ukryte = Number(labelGroup?.getAttribute('data-hidden-unreadable') ?? '0');
    const porzucone = Number(labelGroup?.getAttribute('data-dropped-identity') ?? '0');
    expect((labelGroup?.children.length ?? 0) + ukryte + porzucone).toBe(scene.labels.length);
  });

  // Dowód, że próg NAPRAWDĘ gryzie na tym kadrze, i że ukrycie jest JAWNE.
  // Bez tego poprzedni test przechodziłby także wtedy, gdyby declutter przestał
  // działać (0 ukrytych + wszystkie w DOM też daje sumę).
  it('pełny widok sieci: opisy nieczytelne są ukryte i zameldowane w warstwie ekranu', () => {
    const scene = buildSceneV3(enm);
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);
    const labelGroup = container.querySelector('[data-testid="sld-v3-labels"]');
    const ukryte = Number(labelGroup?.getAttribute('data-hidden-unreadable') ?? '0');
    const porzucone = Number(labelGroup?.getAttribute('data-dropped-identity') ?? '0');
    expect(ukryte).toBeGreaterThan(0);
    expect(ukryte + porzucone).toBeLessThanOrEqual(scene.labels.length);
    // V12K-222: komunikat przeniesiony z ramki ARKUSZA do warstwy EKRANU. Pierwsza
    // wersja wpadała w pułapkę, którą sama opisuje — przy skali ukrywającej etykiety
    // sam komunikat miał ~2 px i był nieczytelny.
    const komunikat = container.querySelector('[data-testid="sld-v3-hidden-labels-hint"]');
    expect(komunikat?.textContent).toContain('przybliż, aby zobaczyć');
    // S9-7 (audyt C-4): komunikat liczy OBA rodzaje niewidocznych opisów —
    // ukryte dane szczegółowe ORAZ tożsamości, dla których zabrakło miejsca w
    // rozmiarze czytelnym. Kanały audytu w DOM zostają ROZDZIELONE (żeby
    // bilans „narysowane + ukryte + porzucone == etykiety sceny" dało się
    // sprawdzić bez podwójnego liczenia), ale użytkownik musi zobaczyć sumę:
    // napis, którego nie ma, nie może być niepoliczony.
    expect(komunikat?.getAttribute('data-hidden-count')).toBe(String(ukryte + porzucone));
    // Dowód kompensacji skali: pismo w jednostkach ŚWIATA musi być tym większe, im
    // mniejsza skala kamery — tylko wtedy na ekranie ma stały rozmiar. Przy pełnym
    // widoku sieci (skala ≪ 1) fontSize w świecie jest wyraźnie większy od nominału.
    const fontSize = Number(komunikat?.getAttribute('font-size') ?? '0');
    expect(fontSize).toBeGreaterThan(12);
  });

  it('kanwa niesie ramkę arkusza (SheetFrame) i tło SCADA', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);
    expect(container.querySelector('[data-testid="sld-sheet-frame"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-sheet-border"]')).toBeTruthy();
  });
});

describe('SldCanvasV3 — jedna scena niezależna od skali (karta SLD-SKALA-I-NAWIGACJA, R1)', () => {
  // INTENCJA dawnego testu „L0 vs L2 daje różną zawartość" zmieniona kanonem: skala
  // kamery steruje wyłącznie gęstością napisów, więc rysunek toru (symbole, odcinki)
  // jest TEN SAM przy każdej skali. Iloczyn: szerokość kanwy (skala dopasowania)
  // {mała, duża} × warstwa {symbole, odcinki}.
  it('ta sama migawka na kanwie małej i dużej: identyczne symbole i odcinki, różna skala kamery', () => {
    const { container: maly } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);
    const { container: duzy } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH * 6} height={CANVAS_HEIGHT * 6} />);
    const skala = (c: ParentNode) => Number(c.querySelector('[data-testid="sld-canvas-v3"]')?.getAttribute('data-skala-kamery'));
    expect(skala(duzy)).toBeGreaterThan(skala(maly) * 3);
    for (const warstwa of ['sld-v3-symbols', 'sld-v3-segments']) {
      const a = maly.querySelector(`[data-testid="${warstwa}"]`);
      const b = duzy.querySelector(`[data-testid="${warstwa}"]`);
      expect(a, warstwa).toBeTruthy();
      expect(bezGruboscKreski(a!.innerHTML), warstwa).toBe(bezGruboscKreski(b!.innerHTML));
    }
  });

  it('kanwa nie niesie atrybutu poziomu szczegółu — jedynym parametrem widoku jest skala kamery', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);
    const kanwa = container.querySelector('[data-testid="sld-canvas-v3"]')!;
    expect(kanwa.hasAttribute('data-scene-' + 'lod')).toBe(false);
    expect(Number(kanwa.getAttribute('data-skala-kamery'))).toBeGreaterThan(0);
  });
});

describe('SldCanvasV3 — klik w symbol', () => {
  it('klik w pierwszy symbol woła onElementClick z jego testId', () => {
    const scene = buildSceneV3(enm);
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onElementClick={onElementClick} />,
    );
    const firstSymbolGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.firstElementChild;
    expect(firstSymbolGroup).toBeTruthy();
    const expectedTestId = firstSymbolGroup!.getAttribute('data-testid');
    expect(expectedTestId).toBe(scene.symbols[0].meta?.testId ?? 'sld-v3-symbol-0');

    // Karta S9-4: celem kliku jest UCHWYT obiektu (warstwa `sld-v3-trafienia`),
    // bo cały rysunek jest bierny (`pointer-events="none"`). Klikamy dokładnie
    // ten węzeł, który w przeglądarce byłby celem zdarzenia — intencja testu
    // („klik w pierwszy symbol woła onElementClick z jego testId") bez zmian.
    const firstSymbolHit = container.querySelector(
      `[data-hit-for="${expectedTestId}"][data-hit-role="obrys"]`,
    );
    expect(firstSymbolHit, 'pierwszy symbol ma uchwyt trafienia').toBeTruthy();
    fireEvent.click(firstSymbolHit!);
    expect(onElementClick).toHaveBeenCalledTimes(1);
    expect(onElementClick).toHaveBeenCalledWith(expectedTestId, {
      ownerRef: scene.symbols[0].meta?.ownerRef,
      elementKind: scene.symbols[0].meta?.elementKind,
      // S9-10: lewy klik niesie też KLASĘ trafienia (wspólny `metaZTrafienia`
      // z prawym klikiem) — ta sama, którą niesie uchwyt trafienia.
      klasa: firstSymbolHit!.getAttribute('data-hit-klasa'),
      // Rodzaj trafionego symbolu sceny (`SymbolId`) — tożsamość aparatu pola dla menu.
      symbolId: scene.symbols[0].symbolId,
    });
  });

  // F8b-1 — INTENCJA zachowana po R1: klik w obiekt STACJI przekazuje tożsamość
  // stacji. Dawniej celem był zwinięty blok stacji L0; na jednej scenie stację
  // reprezentuje jej napis nazwy (uchwyt kompozytu `#name-row`).
  it('F8b-1: klik w napis nazwy stacji przekazuje ownerRef = ref stacji', () => {
    const scene = buildSceneV3(enm);
    const stacja = scene.meta.stationTraversalOrder.find((r) => r !== scene.meta.gpzId)!;
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH * 4} height={CANVAS_HEIGHT * 4} onElementClick={onElementClick} />,
    );
    const uchwyt = [...container.querySelectorAll('[data-hit-role="obrys"][data-hit-klasa="etykieta"]')].find(
      (n) => (n.getAttribute('data-hit-owner-ref') ?? '').startsWith(stacja),
    );
    expect(uchwyt, 'napis nazwy stacji ma uchwyt trafienia').toBeTruthy();
    fireEvent.click(uchwyt!);
    expect(onElementClick).toHaveBeenCalledTimes(1);
    const [, meta] = onElementClick.mock.calls[0] as [string, { ownerRef?: string }];
    expect(meta.ownerRef?.startsWith(stacja)).toBe(true);
  });

  it('bez onElementClick klik nie rzuca (brak handlera to no-op bezpieczny)', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);
    const firstHit = container.querySelector('[data-hit-role="obrys"]');
    expect(firstHit).toBeTruthy();
    expect(() => fireEvent.click(firstHit!)).not.toThrow();
  });
});

describe('SldCanvasV3 — nakładka energizacji (spec §6: KOLOR, nie geometria)', () => {
  it('overlay zmienia WYŁĄCZNIE atrybuty koloru (stroke/fill) — geometria identyczna', () => {
    const scene = buildSceneV3(enm);
    const testId = scene.symbols[0].meta?.testId ?? 'sld-v3-symbol-0';
    const overlay: SldV3Overlay = { energizedByTestId: { [testId]: true } };

    const { container: without } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);
    const { container: withOverlay } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} overlay={overlay} />,
    );

    const symbolsWithout = without.querySelector('[data-testid="sld-v3-symbols"]')!;
    const symbolsWith = withOverlay.querySelector('[data-testid="sld-v3-symbols"]')!;

    // Geometria (kolejność i atrybuty pozycyjne) identyczna po usunięciu
    // WARTOŚCI stroke/fill — dowód strukturalny, nie tylko dla jednego symbolu.
    expect(stripColorAttrs(symbolsWith.innerHTML)).toBe(stripColorAttrs(symbolsWithout.innerHTML));

    // A kolor FAKTYCZNIE się różni na oznaczonym symbolu (nakładka działa).
    const targetWithout = without.querySelector(`[data-testid="${testId}"]`)!;
    const targetWith = withOverlay.querySelector(`[data-testid="${testId}"]`)!;
    // Karta S9-4: grupa symbolu jest czystym rysunkiem (uchwyt kliku przeniesiony
    // do warstwy `sld-v3-trafienia`), więc pierwszy descendant ze `stroke` to
    // wprost rysunek glifu — dawniej trzeba było przeskoczyć transparentny hit-rect.
    const glyphStrokeOf = (el: Element) => el.querySelector('[stroke]')?.getAttribute('stroke');
    expect(glyphStrokeOf(targetWith)).not.toBe(glyphStrokeOf(targetWithout));
  });

  it('bez overlay (undefined) rysunek jest bazowy mono (brak nakładki) — brak wpisu = brak zmiany koloru', () => {
    const { container: a } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);
    const { container: b } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} overlay={{ energizedByTestId: {} }} />,
    );
    expect(a.querySelector('[data-testid="sld-v3-symbols"]')!.innerHTML).toBe(
      b.querySelector('[data-testid="sld-v3-symbols"]')!.innerHTML,
    );
  });
});

describe('SldCanvasV3 — determinizm', () => {
  it('dwa rendery tych samych propsów dają identyczny innerHTML', () => {
    const { container: a } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);
    const { container: b } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);
    expect(a.innerHTML).toBe(b.innerHTML);
  });
});

describe('SldCanvasV3 — F9.5: nakładka przepływu mocy (spec §14.2, warstwa sld-v3-flow-overlay)', () => {
  /** Realny odcinek (segmentRef bez `#`) + jego indeks w scenie — testId
   *  nakładki jest indeksowy (`sld-v3-flow-${index}`). `kamera` = stan
   *  początkowy kamery nad środkiem odcinka przy skali czytania (napis wartości
   *  jest klasy `wyniki`: przy widoku całej sieci jego pismo ma ~1 px i nie
   *  trafia do rysunku — `canvas/gestoscInformacji.ts`). */
  function flowTargetOnScene(): { readonly ownerRef: string; readonly index: number; readonly kamera: CameraState } {
    const scene = buildSceneV3(enm);
    const index = scene.segments.findIndex(
      (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#'),
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const pts = scene.segments[index].points;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const srodek = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    const kamera = kameraNaPunkcieSceny(scene, srodek, 1.4, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
    return { ownerRef: scene.segments[index].meta!.ownerRef!, index, kamera };
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
    const { ownerRef, index, kamera } = flowTargetOnScene();
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        cameraOverride={kamera}
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
    const { ownerRef } = flowTargetOnScene();
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        overlay={overlayWithFlow({ [ownerRef]: FULL_FLOW(ownerRef) })}
      />,
    );
    // Dokładnie JEDEN wpis → dokładnie JEDNA grupa nakładki w warstwie.
    expect(container.querySelector('[data-testid="sld-v3-flow-overlay"]')!.children.length).toBe(1);

    const { container: noOverlay } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    expect(noOverlay.querySelector('[data-testid="sld-v3-flow-overlay"]')!.children.length).toBe(0);
  });

  it('(c) forward=false → grot obrócony: polygon.points = flowOverlayGeometry(points, false), tip lustrzany względem forward=true', () => {
    const { ownerRef, index } = flowTargetOnScene();
    const points = buildSceneV3(enm).segments[index].points;
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
        overlay={overlayWithFlow({ [ownerRef]: FULL_FLOW(ownerRef, false) })}
      />,
    );
    const arrow = container.querySelector(`[data-testid="sld-v3-flow-arrow-${index}"]`);
    expect(arrow!.getAttribute('points')).toBe(reversedGeom.arrowPoints);
    expect(container.querySelector(`[data-testid="sld-v3-flow-${index}"]`)!.getAttribute('data-flow-forward')).toBe('false');
  });

  it('(d) determinizm renderu nakładki: dwa rendery tych samych propsów → identyczny innerHTML warstwy przepływu', () => {
    const { ownerRef } = flowTargetOnScene();
    const overlay = overlayWithFlow({ [ownerRef]: FULL_FLOW(ownerRef) });
    const { container: a } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} overlay={overlay} />,
    );
    const { container: b } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} overlay={overlay} />,
    );
    expect(a.querySelector('[data-testid="sld-v3-flow-overlay"]')!.innerHTML).toBe(
      b.querySelector('[data-testid="sld-v3-flow-overlay"]')!.innerHTML,
    );
  });

  // (e) INTENCJA zachowana po R1/R3: skala steruje napisami, nigdy kierunkiem — przy
  // widoku całej sieci pismo wartości jest nieczytelne, więc znika, a grot zostaje.
  it('(e) widok całej sieci: grot obecny, tekst wartości NIEOBECNY (skala steruje napisami, nie ukrywa kierunku)', () => {
    const { ownerRef, index } = flowTargetOnScene();
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        overlay={overlayWithFlow({ [ownerRef]: FULL_FLOW(ownerRef) })}
      />,
    );
    expect(container.querySelector(`[data-testid="sld-v3-flow-arrow-${index}"]`)).toBeTruthy();
    expect(container.querySelector(`[data-testid="sld-v3-flow-label-${index}"]`)).toBeNull();
  });

  it('formatFlowLabelPl: człony TYLKO dla metryk obecnych (brak metryki = brak członu, zero atrap); znak Q zachowany; |P| bo znak P niesie strzałka', () => {
    expect(formatFlowLabelPl({ ownerRef: 'x', forward: false, p: { value: -3.456, unit: 'MW' } })).toBe('3,46 MW');
    expect(
      formatFlowLabelPl({ ownerRef: 'x', forward: true, p: { value: 1, unit: 'MW' }, q: { value: -0.45, unit: 'Mvar' } }),
    ).toBe('1,00 MW · -0,45 Mvar');
    expect(formatFlowLabelPl({ ownerRef: 'x', forward: true, i: { value: 87.6, unit: 'A' } })).toBe('88 A');
  });

  // Dawny test „L1: etykieta skrócona do P" (adaptacyjne etykiety poziomu L1)
  // skasowany kartą SLD-SKALA-I-NAWIGACJA (R3): napis wartości przepływu jest
  // jednej klasy informacji (`wyniki`) — widoczny w pełnym brzmieniu, gdy jego
  // pismo jest czytelne, albo nieobecny. Skrócona postać „pośrednia" była
  // artefaktem poziomów szczegółu.

  // F-2 + V-1 + V-2 (recenzja Opusa): rozłączność DLA WSZYSTKICH odcinków z
  // nakładką, względem WSZYSTKICH klas etykiet sceny (w tym tytuły stacji
  // `station-name` — V-1), WSZYSTKICH bboxów symboli (ikony DER — V-2) oraz
  // innych etykiet przepływu (stack — V-2). Payload syntetyczny na KAŻDYM
  // odcinku jednokawałkowym naraz (jak harness renderowy nadzorcy).
  {
    it(`czytelność: KAŻDA etykieta przepływu ma bbox rozłączny z każdą etykietą sceny, każdym symbolem i innymi etykietami przepływu`, () => {
      const scene = buildSceneV3(enm);
      const singleHop = new Set(orientedSegmentRefs(enm).keys());
      const entries: Record<string, SegmentFlowOverlay> = {};
      for (const s of scene.segments) {
        const ref = s.meta?.ownerRef;
        if (ref && s.meta?.elementKind === 'segment' && singleHop.has(ref)) entries[ref] = FULL_FLOW(ref);
      }
      // S9-2: bramka orientacji obejmuje KAZDY narysowany kawalek galeziowy
      // fixtury (88); dawna bramka F-1 obejmowala 45 — rozlacznosc etykiet jest
      // teraz sprawdzana na PELNYM zbiorze przeslow, nie na polowie.
      expect(Object.keys(entries).length).toBe(88);
      const placements = computeFlowOverlayPlacements(scene, entries, true);
      // BLOK-PUSTY: liczba placementów liczona z GEOMETRII, nie wpisana z
      // fixtury. Grot ma stałą długość (`FLOW_ARROW_LENGTH` = 12 j.św.), więc
      // przęsło KRÓTSZE od grota nie może go ponieść — `flowOverlayGeometry`
      // zwraca dla niego `null` i placement nie powstaje. Do tej karty stała
      // `88` maskowała ten warunek: liczba zgadzała się przypadkiem, bo żadne
      // przęsło fixtury nie było krótsze od grota. Po skróceniu bloku stacji
      // (rezerwacja strony nN liczona `max` zamiast sumą) packer lateralny
      // przestawił jeden kanał zejścia na KONTRAKTOWE minimum
      // (`MIN_ROUTE_CLEARANCE` = 8 j.św.) od krawędzi kolumny, więc kawałek
      // magistrali między zaczepem stacji a trójnikiem ma dokładnie 8 j.św.
      // Rysunek jest zgodny z kontraktem — to GROT jest dłuższy niż
      // najkrótszy legalny kawałek. Asercja mówi teraz DLACZEGO placement nie
      // powstał, zamiast pilnować liczby z fixtury.
      const zaKrotkieNaGrot = scene.segments.filter((s) => {
        const ref = s.meta?.ownerRef;
        if (!ref || s.meta?.elementKind !== 'segment' || !singleHop.has(ref)) return false;
        let best = 0;
        for (let i = 1; i < s.points.length; i += 1) {
          best = Math.max(
            best,
            Math.abs(s.points[i].x - s.points[i - 1].x) + Math.abs(s.points[i].y - s.points[i - 1].y),
          );
        }
        return best < FLOW_ARROW_LENGTH_JSW;
      });
      expect(placements.length).toBe(88 - zaKrotkieNaGrot.length);
      // Zapadka: brak grota wolno tłumaczyć WYŁĄCZNIE długością przęsła —
      // gdyby placement zniknął z innego powodu, ta równość pęknie.
      expect(placements.map((p) => p.ownerRef).sort()).toEqual(
        Object.keys(entries)
          .filter((ref) => !zaKrotkieNaGrot.some((s) => s.meta?.ownerRef === ref))
          .sort(),
      );
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
    const baseScene = buildSceneV3(enm);
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
      labelRole: LABEL_ROLE_BY_OWNER_KIND['segment-span'],
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

    const placements = computeFlowOverlayPlacements(syntheticScene, { [ownerRef]: flow }, true);

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
    const { ownerRef: realOwnerRef, index } = flowTargetOnScene();
    expect(() =>
      render(
        <SldCanvasV3
          snapshot={enm}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          overlay={overlayWithFlow({ [realOwnerRef]: FULL_FLOW(realOwnerRef) })}
        />,
      ),
    ).not.toThrow();
    expect(index).toBeGreaterThanOrEqual(0);
  });
});

describe('SldCanvasV3 — V12K-092: badge wynikowy OLTC (spec §14.2/§3.5, warstwa sld-v3-oltc-overlay)', () => {
  /** Realny transformator (symbol `elementKind==='transformer'`) sceny + jego
   *  `meta.ownerRef` = `transformerRef`. */
  function transformerRefOnScene(): string {
    const scene = buildSceneV3(enm);
    const sym = scene.symbols.find((s) => s.meta?.elementKind === 'transformer' && s.meta.ownerRef);
    expect(sym).toBeTruthy();
    return sym!.meta!.ownerRef!;
  }

  function overlayWithOltc(entries: Record<string, TransformerOltcOverlay>): SldV3Overlay {
    return { energizedByTestId: {}, oltcByOwnerRef: entries };
  }

  it('(a) transformator z wpisem oltcByOwnerRef → badge (rect + tekst "poz. +N · M×") w warstwie sld-v3-oltc-overlay', () => {
    const ref = transformerRefOnScene();
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        overlay={overlayWithOltc({ [ref]: { ownerRef: ref, tapPosition: 3, switchCount: 4 } })}
      />,
    );
    const badge = container.querySelector(`[data-oltc-owner-ref="${ref}"]`);
    expect(badge).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v3-oltc-label-0"]')?.textContent).toBe('poz. +3 · 4×');
  });

  it('(b) bez overlay OLTC → warstwa pusta (zero atrap)', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    expect(container.querySelector('[data-testid="sld-v3-oltc-overlay"]')!.children.length).toBe(0);
  });

  it('(c) determinizm renderu: dwa rendery tych samych propsów → identyczny innerHTML warstwy OLTC', () => {
    const ref = transformerRefOnScene();
    const overlay = overlayWithOltc({ [ref]: { ownerRef: ref, tapPosition: -2 } });
    const { container: a } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} overlay={overlay} />,
    );
    const { container: b } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} overlay={overlay} />,
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
    const scene = buildSceneV3(enm);
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

describe('SldCanvasV3 — F8a k4.1: fit startowy celuje w treść sieci', () => {
  // K11-A (dyrektywa SLD-first 2026-07-30): domyślny CEL fitu to bbox TREŚCI
  // sieci (`contentBoundingBoxOf` — elementy z ownerRef WRAZ Z ETYKIETAMI),
  // nie pełny bbox sceny z meblami arkusza. KD-7: cel fitu przeliczony do
  // ŚWIATA KAMERY (`sceneBoxToCameraWorld`) — `viewBox` opisuje układ arkusza,
  // w którym treść sceny jest przesunięta o margines ramki. Dawny wariant
  // „fit do świata wymuszonego poziomu L0 ≠ L2" zniknął z poziomami (R1).
  it('viewBox startowy = dopasowanie treści sieci w prostokącie bezpiecznym (nie bbox arkusza)', () => {
    const scena = buildSceneV3(enm);
    const tresc = sceneBoxToCameraWorld(contentBoundingBoxOf(scena) ?? boundingBoxOfRect(scena.bbox));
    const arkusz = sceneBoxToCameraWorld(boundingBoxOfRect(scena.bbox));
    const viewportSize = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    // S9-8 („obszar bezpieczny pod dokami UI"): kamera produkcyjna liczy kadr w
    // PROSTOKĄCIE BEZPIECZNYM (kanwa minus pasy doków, `SLD_CANVAS_DOCK_INSETS`),
    // więc oczekiwanie testu MUSI przejść tą samą drogą.
    const oczekiwany = cameraViewBox(
      computeInitialCameraState(tresc, viewportSize, null, SLD_CANVAS_DOCK_INSETS).transform,
      viewportSize,
    );
    const zlyDoArkusza = cameraViewBox(
      computeInitialCameraState(arkusz, viewportSize, null, SLD_CANVAS_DOCK_INSETS).transform,
      viewportSize,
    );
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);
    expect(viewBoxOf(container)).toBe(oczekiwany);
    expect(oczekiwany).not.toBe(zlyDoArkusza);
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
  const WHEEL_DELTA_Y = -50; // mały zoom-in

  /**
   * INTENCJA (bez zmian od F8a): zmiana świata BEZ wskazania obiektu odrzuca
   * pan/zoom użytkownika i wraca do fitu.
   *
   * KANON ZAKTUALIZOWANY kartą B-2 (2026-08-07): warunkiem refitu jest ZMIANA
   * MODELU, nie sama zmiana referencji obiektu migawki. Nowy obiekt o TYM
   * SAMYM haszu (odświeżenie `refresh_snapshot`, hydratacja po reconnect —
   * pomiar: hasz identyczny) nie jest powodem, żeby wyrzucić projektanta z
   * jego widoku; osobny kontrakt tego pilnuje
   * (`kotwicaWidoku.contract.test.tsx`). Test przeszedł więc z pary
   * „ta sama treść, inny obiekt" na parę REALNIE RÓŻNYCH sieci — dokładnie
   * ten scenariusz, który intencja opisuje.
   */
  it('zmiana snapshotu na INNĄ sieć (bez wskazania obiektu) odrzuca zoom użytkownika i wraca do fitu — pełny refit', () => {
    const innaSiec = (
      JSON.parse(
        readFileSync(resolve(here, 'fixtures', 'b2MalaPo.enm.json'), 'utf8'),
      ) as { readonly enm: EnergyNetworkModel }
    ).enm;
    const viewportSize = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    const scenaInnej = buildSceneV3(innaSiec);
    const oczekiwanyFitInnej = cameraViewBox(
      computeInitialCameraState(
        sceneBoxToCameraWorld(contentBoundingBoxOf(scenaInnej) ?? boundingBoxOfRect(scenaInnej.bbox)),
        viewportSize,
        null,
        SLD_CANVAS_DOCK_INSETS,
      ).transform,
      viewportSize,
    );

    const { container, rerender } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
    const initialViewBox = viewBoxOf(container);

    // Zoom (scale + translate) — kamera oddala się od fitu startowego.
    fireEvent.wheel(svg, { clientX: 200, clientY: 150, deltaY: WHEEL_DELTA_Y });
    expect(viewBoxOf(container)).not.toBe(initialViewBox);

    // Inna sieć BEZ wskazania obiektu ⇒ pełny refit, zoom odrzucony.
    rerender(<SldCanvasV3 snapshot={innaSiec} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} viewAnchor={null} />);
    expect(viewBoxOf(container)).toBe(oczekiwanyFitInnej);
  });

  it('zmiana width/height (bez zmiany snapshot) ZACHOWUJE skalę i zoom użytkownika — tylko viewport się dostosowuje', () => {
    const { container, rerender } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
    const bbox2 = boundingBoxOfRect(buildSceneV3(enm).bbox);
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

    // Skala NIETKNIĘTA przez resize (k3) — zmienia ją wyłącznie zoom.
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
   *  + jego indeks w scenie (testId nakładki jest indeksowy). */
  function faultTargetOnScene(): { readonly ownerRef: string; readonly index: number } {
    const scene = buildSceneV3(enm);
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
    const { ownerRef, index } = faultTargetOnScene();
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
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
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    expect(container.querySelector('[data-testid="sld-v3-fault-flow-overlay"]')!.children.length).toBe(0);

    const { ownerRef } = faultTargetOnScene();
    const { container: withEntry } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        overlay={overlayWithFault({ [ownerRef]: FAULT_ENTRY(ownerRef) })}
      />,
    );
    // Dokładnie JEDEN wpis → dokładnie JEDNA grupa strzałki w warstwie.
    expect(withEntry.querySelector('[data-testid="sld-v3-fault-flow-overlay"]')!.children.length).toBe(1);
  });

  it('(c) orientacja: forward=false ⇒ końce strzałki ZAMIENIONE względem forward=true (zwrot z tokenu kierunku solvera)', () => {
    const { ownerRef, index } = faultTargetOnScene();
    const scene = buildSceneV3(enm);
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
    const { ownerRef } = faultTargetOnScene();
    const { container: without } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    const { container: withFault } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
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
    const { ownerRef } = faultTargetOnScene();
    const overlay = overlayWithFault({ [ownerRef]: FAULT_ENTRY(ownerRef) });
    const { container: a } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} overlay={overlay} />,
    );
    const { container: b } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} overlay={overlay} />,
    );
    expect(a.querySelector('[data-testid="sld-v3-fault-flow-overlay"]')!.innerHTML).toBe(
      b.querySelector('[data-testid="sld-v3-fault-flow-overlay"]')!.innerHTML,
    );
  });

  it('computeFaultFlowPlacements: brak overlay ⇒ zero placementów; ref spoza sceny ⇒ ignorowany (nie fabrykuje)', () => {
    const scene = buildSceneV3(enm);
    expect(computeFaultFlowPlacements(scene, undefined)).toEqual([]);
    expect(
      computeFaultFlowPlacements(scene, { 'nieznany-ref': FAULT_ENTRY('nieznany-ref') }),
    ).toEqual([]);
  });
});

describe('SldCanvasV3 — karta SLD-P: znacznik pulse punktu zwarcia (GAP V12K-120/121, warstwa sld-v3-fault-flow-overlay)', () => {
  /** Symbol, którego `ownerRef` nie dzieli żaden inny symbol ani odcinek sceny —
   *  wtedy znacznik zwarcia jednoznacznie należy do NIEGO (dawniej: zwinięty blok
   *  stacji L0; po karcie SLD-SKALA-I-NAWIGACJA scena ma jedną postać — pierwszy
   *  aparat z własnym refem modelu). */
  function symbolJednoznacznyNaScenie(scene: ReturnType<typeof buildSceneV3>): number {
    const licznik = new Map<string, number>();
    for (const el of [...scene.symbols.map((x) => x.meta?.ownerRef), ...scene.segments.map((x) => x.meta?.ownerRef)]) {
      if (el) licznik.set(el, (licznik.get(el) ?? 0) + 1);
    }
    return scene.symbols.findIndex(
      (x) => x.meta?.ownerRef != null && !x.meta.ownerRef.includes('#') && licznik.get(x.meta.ownerRef) === 1,
    );
  }

  function overlayWithFaultPoint(faultPointMarkerRef: string): SldV3Overlay {
    return { energizedByTestId: {}, faultPointMarkerRef };
  }

  it('(a) ref dopasowany do SYMBOLU → znacznik w środku bboxa tego symbolu', () => {
    const scene = buildSceneV3(enm);
    const stationIndex = symbolJednoznacznyNaScenie(scene);
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
    const scene = buildSceneV3(enm);
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
        overlay={overlayWithFaultPoint(ownerRef)}
      />,
    );
    const dot = container.querySelector('[data-testid="sld-v3-fault-point-marker-dot"]')!;
    expect(Number(dot.getAttribute('cx'))).toBe(placement!.x);
    expect(Number(dot.getAttribute('cy'))).toBe(placement!.y);
  });

  it('(c) brak overlay / brak faultPointMarkerRef → warstwa bez znacznika (zero atrap — „overlay wyłączony bez wyniku")', () => {
    const { container: without } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    expect(without.querySelector('[data-testid="sld-v3-fault-point-marker"]')).toBeNull();

    const { container: withEmptyOverlay } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        overlay={{ energizedByTestId: {} }}
      />,
    );
    expect(withEmptyOverlay.querySelector('[data-testid="sld-v3-fault-point-marker"]')).toBeNull();
  });

  it('(d) znacznik jest WARSTWĄ nakładki, nie zmianą layoutu: geometria segmentów/symboli IDENTYCZNA z i bez znacznika', () => {
    const scene = buildSceneV3(enm);
    const stationIndex = symbolJednoznacznyNaScenie(scene);
    const ownerRef = scene.symbols[stationIndex].meta!.ownerRef!;

    const { container: without } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    const { container: withMarker } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
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
    const scene = buildSceneV3(enm);
    const stationIndex = symbolJednoznacznyNaScenie(scene);
    const ownerRef = scene.symbols[stationIndex].meta!.ownerRef!;
    const overlay = overlayWithFaultPoint(ownerRef);

    const { container: a } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} overlay={overlay} />,
    );
    const { container: b } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} overlay={overlay} />,
    );
    expect(a.querySelector('[data-testid="sld-v3-fault-flow-overlay"]')!.innerHTML).toBe(
      b.querySelector('[data-testid="sld-v3-fault-flow-overlay"]')!.innerHTML,
    );
  });

  it('computeFaultPointMarkerPlacement: brak ref ⇒ null; ref spoza sceny ⇒ null (nie fabrykuje pozycji)', () => {
    const scene = buildSceneV3(enm);
    expect(computeFaultPointMarkerPlacement(scene, undefined)).toBeNull();
    expect(computeFaultPointMarkerPlacement(scene, 'nieznany-ref-spoza-sceny')).toBeNull();
  });

  it('computeFaultPointMarkerPlacement: pomija odcinki elementKind==="protectionAnnotation" (adnotacja, nie geometria toru)', () => {
    const scene = buildSceneV3(enm);
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
    const scene = buildSceneV3(enm);
    const snBus = scene.segments.find((s) => s.meta?.ownerRef?.endsWith('#sn-bus'));
    expect(snBus).toBeTruthy();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
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
    const scene = buildSceneV3(enm);
    const hvBus = scene.segments.find(
      (s) => s.meta?.ownerRef != null && s.meta.ownerRef.includes('#hv-bus') && !s.meta.ownerRef.includes('label'),
    );
    if (!hvBus) return; // fixtura może nie mieć treści WN wprost jako odcinek na tym LOD — bez fabrykacji.
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    const path = container.querySelector(`[data-owner-ref="${hvBus.meta!.ownerRef}"]`);
    expect(path?.getAttribute('stroke')).toBe(VOLTAGE_COLOR.hv);
  });

  it('nakładka energizacji WCIĄŻ WYGRYWA nad kolorem napięcia (precedencja niezmieniona: wyróżnienie > napięcie)', () => {
    const scene = buildSceneV3(enm);
    const snBus = scene.segments.find((s) => s.meta?.ownerRef?.endsWith('#sn-bus'));
    expect(snBus).toBeTruthy();
    const ownerRef = snBus!.meta!.ownerRef!;
    const overlay: SldV3Overlay = { energizedByTestId: {}, energizedByOwnerRef: { [ownerRef]: false } };
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} overlay={overlay} />,
    );
    const path = container.querySelector(`[data-owner-ref="${ownerRef}"]`);
    // De-energizacja (szary) nadpisuje kolor napięcia (zielony SN) — precedencja z nagłówka `theme/colorTokens.ts`.
    expect(path?.getAttribute('stroke')).toBe(HIGHLIGHT_COLOR.deenergized);
    expect(path?.getAttribute('stroke')).not.toBe(VOLTAGE_COLOR.sn);
  });
});

// Rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC (referencja HMI 2026-10-29): NOP jest FUNKCJĄ
// łącznika, nie osobnym kolorem stanu. INTENCJA dawnego testu D7 („NOP wyróżniony, nie zlewa się
// z napięciem") zostaje: wyróżnia go ZNACZNIK `noPoint` (okrąg + podpis „NO"), a stan
// niesie kafel łącznika z jednej tabeli `STATE_COLOR`. Punkt NO stacji nie ma rekordu położenia
// łącznika — rysuje się sam znacznik w kolorze napięcia toru, bez kafla (brak danej ≠ stan).
describe('SldCanvasV3 — NOP: znacznik funkcji, stan z kafla łącznika (bez osobnego koloru NOP)', () => {
  it('symbol noPoint: znacznik w kolorze napięcia toru, żadna barwa kafla stanu bez rekordu położenia', () => {
    // Fixtura bazowa nie niesie żadnego NOP (patrz `buildScene.test.ts`
    // `enmWithSyntheticNop` — ten sam GAP udokumentowany tam). Syntetyzujemy
    // lokalnie: punkt podziału w pierwszej stacji ciągu głównego — pozycja normalna
    // łącznika pola (karta W5-C; dawna kopia `LineRun.nop_station_ref` skasowana).
    // GS-1 (V12K-137, GAP §10.4): symbol `noPoint` jest jedyną reprezentacją punktu
    // rozcięcia na jednej scenie — przy każdej skali (karta SLD-SKALA-I-NAWIGACJA).
    const scene2 = buildSceneV3(enm);
    const targetStationRef = scene2.meta.mainTrunkStationIds[0];
    const enmWithNop = zPunktemPodzialuWStacji(enm, targetStationRef);

    for (const [w, h] of [[CANVAS_WIDTH, CANVAS_HEIGHT], [KANWA_CZYTANIA.width, KANWA_CZYTANIA.height]] as const) {
      const scene = buildSceneV3(enmWithNop);
      const nopIndex = scene.symbols.findIndex((s) => s.symbolId === 'noPoint');
      expect(nopIndex).toBeGreaterThanOrEqual(0);
      const { container } = render(
        <SldCanvasV3 snapshot={enmWithNop} width={w} height={h} />,
      );
      const nopGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[nopIndex];
      // Karta S9-4: patrz wyżej — grupa symbolu nie niesie już transparentnego
      // hit-rectu, więc pierwszy descendant ze `stroke` to rysunek glifu.
      const strokedDescendant = nopGroup?.querySelector('[stroke]');
      expect(strokedDescendant?.getAttribute('stroke')).toBe(VOLTAGE_COLOR.sn);
      expect(Object.values(STATE_COLOR)).not.toContain(strokedDescendant?.getAttribute('stroke'));
      expect(nopGroup?.querySelector('circle')).not.toBeNull();
      expect(nopGroup?.querySelectorAll('[data-kafel-stanu]')).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Karta S8 (ciągłość widoku przy zmianie skali) — po karcie SLD-SKALA-I-NAWIGACJA
// (R1/R8): jedna scena, jedna grupa przekształcenia, bez przenikania poziomów.
// Ciągłość jest teraz własnością z konstrukcji: natywny gest kółka zmienia
// WYŁĄCZNIE skalę kamery — rysunek toru i nakładka zostają te same.
// ---------------------------------------------------------------------------
describe('SldCanvasV3 — S8: ciągłość widoku przy zmianie skali', () => {
  const detailLayerOf = (c: HTMLElement) =>
    c.querySelector('[data-testid="sld-v3-detail-layer"]');
  const skalaOf = (c: HTMLElement) =>
    Number(c.querySelector('[data-testid="sld-canvas-v3"]')?.getAttribute('data-skala-kamery'));

  it('warstwa detalu (segmenty/symbole/etykiety) jest JEDNĄ grupą; nakładka wyników poza nią', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    const detail = detailLayerOf(container);
    expect(detail).toBeTruthy();
    expect(detail?.querySelector('[data-testid="sld-v3-segments"]')).toBeTruthy();
    expect(detail?.querySelector('[data-testid="sld-v3-symbols"]')).toBeTruthy();
    expect(detail?.querySelector('[data-testid="sld-v3-labels"]')).toBeTruthy();
    expect(detail?.querySelector('[data-testid="sld-v3-flow-overlay"]')).toBeNull();
  });

  it('brak przenikania poziomów: warstwa detalu bez animacji przezroczystości (R1 — nie ma czego przenikać)', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    expect(detailLayerOf(container)?.querySelector('animate')).toBeNull();
    expect(detailLayerOf(container)?.getAttribute('opacity') ?? '1').toBe('1');
  });

  it('przesuwanie rysunku to gest KAMERY, nie zaznaczanie tekstu (V12K-235)', () => {
    // Znalezisko z oględzin materiału audytowego V12K-234: przeciągnięcie po kanwie
    // zaznaczało napisy schematu (przeglądarka traktuje `<text>` jak treść do
    // selekcji) i zostawiało niebieskie prostokąty podświetlenia NA RYSUNKU — na
    // zrzucie objęły całą tabliczkę stacji. `touchAction: 'none'` chronił tylko dotyk.
    // Tu pilnujemy DEKLARACJI (jsdom nie ma zaznaczania tekstu); dowód na realnej
    // ścieżce — pusty `window.getSelection()` po natywnym przeciągnięciu — jest w
    // e2e `sld-audyt-powykonawczy-screenshot.spec.ts`.
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]') as SVGSVGElement;
    expect(svg.style.userSelect).toBe('none');
  });

  it('REALNA ścieżka: natywny wheel zoom-in zmienia WYŁĄCZNIE skalę — rysunek toru i nakładka te same', () => {
    const energizedByOwnerRef: Record<string, boolean> = {};
    for (const sym of buildSceneV3(enm).symbols) {
      if (sym.meta?.ownerRef) energizedByOwnerRef[sym.meta.ownerRef] = true;
    }
    const overlay: SldV3Overlay = { energizedByTestId: {}, energizedByOwnerRef };
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} overlay={overlay} />,
    );
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
    const symbole = () => bezGruboscKreski(container.querySelector('[data-testid="sld-v3-symbols"]')!.innerHTML);
    const odcinki = () => bezGruboscKreski(container.querySelector('[data-testid="sld-v3-segments"]')!.innerHTML);
    const energizedCount = () =>
      container.querySelectorAll('[data-testid="sld-v3-symbols"] [data-energized="true"]').length;
    const przed = { skala: skalaOf(container), symbole: symbole(), odcinki: odcinki(), zasilone: energizedCount() };
    expect(przed.zasilone).toBeGreaterThan(0);
    for (let i = 0; i < 20; i += 1) {
      fireEvent.wheel(svg, { clientX: CANVAS_WIDTH / 2, clientY: CANVAS_HEIGHT / 2, deltaY: -140 });
    }
    expect(skalaOf(container)).toBeGreaterThan(przed.skala * 2);
    expect(symbole()).toBe(przed.symbole);
    expect(odcinki()).toBe(przed.odcinki);
    expect(energizedCount()).toBe(przed.zasilone);
  });

  it('REALNA ścieżka: oddalenie zatrzymuje się na dopasowaniu całej sieci (R2 — dolna granica kamery)', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
    const start = skalaOf(container);
    for (let i = 0; i < 20; i += 1) {
      fireEvent.wheel(svg, { clientX: CANVAS_WIDTH / 2, clientY: CANVAS_HEIGHT / 2, deltaY: -140 });
    }
    expect(skalaOf(container)).toBeGreaterThan(start);
    for (let i = 0; i < 120; i += 1) {
      fireEvent.wheel(svg, { clientX: CANVAS_WIDTH / 2, clientY: CANVAS_HEIGHT / 2, deltaY: 140 });
    }
    // Start = dopasowanie treści w prostokącie bezpiecznym; dolna granica = dopasowanie
    // całego świata kamery — oddalenie nie schodzi poniżej niej i nie ucieka w zero.
    expect(skalaOf(container)).toBeGreaterThan(0);
    expect(skalaOf(container)).toBeLessThanOrEqual(start + 1e-9);
    const poKolejnych = skalaOf(container);
    fireEvent.wheel(svg, { clientX: CANVAS_WIDTH / 2, clientY: CANVAS_HEIGHT / 2, deltaY: 140 });
    expect(skalaOf(container)).toBe(poKolejnych);
  });
});

