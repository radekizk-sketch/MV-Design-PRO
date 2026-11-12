/**
 * SLD V3 — warstwa liczbowych etykiet wynikowych na kanwie (W4, R2). Wydzielone
 * z `sldCanvasV3.test.tsx` (karta SLD-SKALA-I-NAWIGACJA): testy treści etykiet
 * wyników rysują całą sieć referencyjną przy skali czytania, a jeden proces
 * jsdom z kompletem testów kanwy przekraczał limit pamięci. Pozostała część
 * nagłówka opisuje wspólną fixturę.
 *
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
import { describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { SldCanvasV3, computeResultLabelPlacements, layoutResultLabels } from '../SldCanvasV3';
import { buildResultLabelsFromScene, resultRefForSegment } from '../resultLabels';
import type { RawOverlayElement, RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import { orientedSegmentRefs, type SldV3Overlay } from '../overlay';
import { SKALA_CZYTANIA } from '../camera';

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
 *  (`SKALA_CZYTANIA`) — testy treści napisów (wyniki) na całej sieci naraz. */
const KANWA_CZYTANIA = { width: 30000, height: 20000 } as const;

// ---------------------------------------------------------------------------
describe('SldCanvasV3 — W4 warstwa liczbowych etykiet wynikowych (§8/§9/§16)', () => {
  const sceneL2 = buildSceneV3(enm);
  const singleHop = new Set(orientedSegmentRefs(enm).keys());

  function el(refId: string, kind: string, metrics: RawOverlayElement['metrics']): RawOverlayElement {
    return { ref_id: refId, kind, badges: [], metrics, severity: 'INFO' };
  }
  it('kanwa czytania pokazuje całą sieć przy skali, w której pismo wyników jest czytelne (założenie bloku)', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} />);
    expect(Number(container.querySelector('[data-testid="sld-canvas-v3"]')!.getAttribute('data-skala-kamery'))).toBeGreaterThanOrEqual(SKALA_CZYTANIA);
  });
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
      <SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} />,
    );
    const { container: withLabels } = render(
      <SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} overlay={overlayWithLabels} />,
    );
    for (const testId of ['sld-v3-segments', 'sld-v3-symbols', 'sld-v3-labels']) {
      expect(withLabels.querySelector(`[data-testid="${testId}"]`)!.innerHTML).toBe(
        without.querySelector(`[data-testid="${testId}"]`)!.innerHTML,
      );
    }
    // A jednak warstwa liczb JEST obecna (dowód, że test nie jest pusty).
    expect(withLabels.querySelectorAll('[data-testid^="sld-v3-result-label-"]').length).toBeGreaterThan(0);
  });

  // R1 §11 — inwariancja geometrii ON/OFF na iloczynie skali {widok całej sieci na
  // małej kanwie, skala czytania}: warstwa liczb nie zmienia sceny przy żadnej skali.
  it.each([
    ['widok całej sieci (mała kanwa)', CANVAS_WIDTH, CANVAS_HEIGHT],
    ['skala czytania', KANWA_CZYTANIA.width, KANWA_CZYTANIA.height],
  ] as const)('R1 §11 inwariancja geometrii ON/OFF — %s: warstwa liczb nie zmienia sceny', (_opis, w, h) => {
    const { container: without } = render(<SldCanvasV3 snapshot={enm} width={w} height={h} />);
    const { container: withLabels } = render(<SldCanvasV3 snapshot={enm} width={w} height={h} overlay={overlayWithLabels} />);
    for (const testId of ['sld-v3-segments', 'sld-v3-symbols', 'sld-v3-labels']) {
      expect(withLabels.querySelector(`[data-testid="${testId}"]`)!.innerHTML).toBe(
        without.querySelector(`[data-testid="${testId}"]`)!.innerHTML,
      );
    }
  });

  // S9-2 (gęstość etykiety wyniku) — INTENCJA po karcie SLD-SKALA-I-NAWIGACJA (R3):
  // liczba linii etykiety nie zależy od „poziomu", tylko od czytelności pisma klasy
  // `wyniki`. Przy widoku całej sieci pismo ma ~1 px ⇒ żadnej linii; o tym, że bieg
  // się odbył, mówią groty przepływu i znaczniki przekroczeń (rysowane przy każdej
  // skali — audyt 2026-08 W-1: rysunek po biegu różni się od rysunku przed biegiem).
  // Przy skali czytania etykieta ma pełną treść (do trzech linii).
  it('S9-2 gęstość: widok całej sieci — zero linii; skala czytania — pełna treść (źródło P/Q)', () => {
    const linie = (w: number, h: number): readonly string[] => {
      const { container } = render(<SldCanvasV3 snapshot={enm} width={w} height={h} overlay={overlayWithLabels} />);
      const group = container.querySelector(`[data-result-owner-ref="${CSS.escape(sourceRef)}"]`);
      if (!group) return [];
      return Array.from(group.querySelectorAll('text')).map((t) => t.textContent ?? '');
    };
    expect(linie(CANVAS_WIDTH, CANVAS_HEIGHT)).toEqual([]);
    expect(linie(KANWA_CZYTANIA.width, KANWA_CZYTANIA.height)).toEqual(['P +6,5468 MW', 'Q -0,3000 Mvar']);
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
      <SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} overlay={overlayWithLabels} />,
    );
    const sourceGroup = container.querySelector(`[data-result-owner-ref="${CSS.escape(sourceRef)}"]`)!;
    const texts = Array.from(sourceGroup.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toContain('P +6,5468 MW');
    expect(texts).toContain('Q -0,3000 Mvar');
  });

  it('§0 wartość 1:1: obciążenie przęsła renderuje dokładnie wartość payloadu', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} overlay={overlayWithLabels} />,
    );
    const branchGroup = container.querySelector(`[data-result-owner-ref="${CSS.escape(branchRef)}"]`)!;
    expect(Array.from(branchGroup.querySelectorAll('text')).map((t) => t.textContent)).toEqual(['obc. 72,5 %']);
  });

  it('determinizm: dwa rendery tych samych propsów ⇒ identyczny innerHTML warstwy liczb', () => {
    const { container: a } = render(
      <SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} overlay={overlayWithLabels} />,
    );
    const { container: b } = render(
      <SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} overlay={overlayWithLabels} />,
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
      <SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} />,
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
  const sceneL2 = buildSceneV3(enm);
  const singleHop = new Set(orientedSegmentRefs(enm).keys());

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
      <SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} overlay={overlay} />,
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
      <SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} overlay={overlay} />,
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
      <SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} overlay={overlay} />,
    );
    expect(container.querySelector('[data-testid="sld-v3-result-stale-badge"]')).toBeNull();
  });

  it('§11 inwariancja geometrii w stanie NIEAKTUALNYM: bazowe grupy sceny bajt-identyczne z i bez warstwy', () => {
    const overlay: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: smallByRef, resultsStale: true };
    const { container: without } = render(
      <SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} />,
    );
    const { container: withStale } = render(
      <SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} overlay={overlay} />,
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
    const layout = layoutResultLabels(sceneL2, fullByRef, [], true);
    expect(layout.aggregates.length).toBeGreaterThan(0);
    const overlay: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: fullByRef };
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} overlay={overlay} />,
    );
    const toggle = container.querySelector('[data-testid="sld-v3-result-aggregate-toggle-0"]');
    expect(toggle).toBeTruthy();
    // Karta S9-4: marker skupiska jest rysunkiem, a jego uchwyt (rozwijanie
    // popovera) siedzi w warstwie trafień pod tym samym `testId` — klikamy
    // węzeł, który w przeglądarce faktycznie łapie zdarzenie.
    const toggleHit = container.querySelector('[data-hit-for="sld-v3-result-aggregate-0"]');
    expect(toggleHit, 'marker skupiska ma uchwyt trafienia').toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v3-result-aggregate-0"]')!.textContent).toContain('wyniki');
    // Popover domyślnie zwinięty.
    expect(container.querySelector('[data-testid="sld-v3-result-aggregate-popover-0"]')).toBeNull();
    // Klik → rozwinięty, lista członków obecna.
    fireEvent.click(toggleHit!);
    const popover = container.querySelector('[data-testid="sld-v3-result-aggregate-popover-0"]');
    expect(popover).toBeTruthy();
    expect(container.querySelectorAll('[data-testid^="sld-v3-result-aggregate-member-0-"]').length).toBe(layout.aggregates[0].count);
    // Ponowny klik → zwinięty.
    fireEvent.click(toggleHit!);
    expect(container.querySelector('[data-testid="sld-v3-result-aggregate-popover-0"]')).toBeNull();
  });

  it('§11 inwariancja geometrii przy AGREGACJI: bazowe grupy sceny bajt-identyczne z i bez warstwy', () => {
    const fullByRef = buildFullByRef();
    const overlay: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: fullByRef };
    const { container: without } = render(
      <SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} />,
    );
    const { container: withAgg } = render(
      <SldCanvasV3 snapshot={enm} width={KANWA_CZYTANIA.width} height={KANWA_CZYTANIA.height} overlay={overlay} />,
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
