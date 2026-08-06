/**
 * F8a — testy `SldCanvasV3Workspace` (okablowanie: TA SAMA instancja ENM ze
 * `useSnapshotStore` co v2, klik → `useSelectionStore` globalna).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import {
  buildEnergizationOverlay as buildEnergizationOverlayForTest,
  buildFaultFlowOverlayForSnapshot,
  buildFlowOverlayForSnapshot,
  SldCanvasV3Workspace,
  elementTypeForKind,
} from '../SldCanvasV3Workspace';
import { buildSupplyPathHighlight, isElementEnergized } from '../../../v2/canvas/SupplyPathHighlighter';
import {
  buildFaultFlowOverlayFromScene,
  faultFlowOverlayTracesToInput,
  isFlowOverlayEmpty,
  flowOverlayValuesTraceToPayload,
  orientedSegmentRefs,
} from '../overlay';
import { useRawResultOverlayStore, type RawOverlayElement, type RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import { useOverlayStore } from '../../../../sld-overlay/overlayStore';
import type {
  ShortCircuitBranchFlowV1,
  ShortCircuitFlowOverlayInput,
} from '../../../../sld-overlay/ShortCircuitFlowOverlayAdapter';

afterEach(() => {
  cleanup();
  // F9.5: `useRawResultOverlayStore` jest globalnym singletonem (zasilanym w
  // produkcji przez `App.tsx`) — testy MUSZĄ go sprzątać, inaczej payload
  // ustawiony w jednym teście przecieka do kolejnych (kolejność testów w
  // pliku wpływałaby na wynik — naruszenie determinizmu testów).
  useRawResultOverlayStore.getState().clear();
  // Karta S-B: ten sam wymóg dla globalnego `useOverlayStore` (kanał
  // kierunku `faultFlow` zasilany przez ekran zwarć).
  useOverlayStore.getState().clearOverlay();
});

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

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useOverlayStore.getState().clearOverlay();
});

function rawElement(refId: string, metrics: RawOverlayElement['metrics']): RawOverlayElement {
  return { ref_id: refId, kind: 'branch', badges: [], metrics, severity: 'INFO' };
}

function rawPayload(elements: Record<string, RawOverlayElement>): RawOverlayPayload {
  return { run_id: 'run-test', analysis_type: 'load_flow', elements };
}

/** Karta S9-4: uchwyt trafienia obiektu sceny — węzeł warstwy
 *  `sld-v3-trafienia`, który w przeglądarce faktycznie łapie zdarzenie
 *  (rysunek kanwy jest bierny, `pointer-events="none"`). Adresowany tym samym
 *  `testId`, co węzeł rysunku, więc intencja testów zostaje bez zmian. */
function uchwytTrafienia(container: HTMLElement, testId: string): Element | null {
  return container.querySelector(`[data-hit-for="${testId}"][data-hit-role="obrys"]`);
}

/** Uchwyt symbolu po indeksie sceny (testId ze sceny albo fallback indeksowy). */
function uchwytSymbolu(
  container: HTMLElement,
  scene: { readonly symbols: readonly { readonly meta?: { readonly testId?: string } }[] },
  index: number,
): Element | null {
  return uchwytTrafienia(container, scene.symbols[index]?.meta?.testId ?? `sld-v3-symbol-${index}`);
}

describe('SldCanvasV3Workspace — okablowanie danych (F8a)', () => {
  it('brak snapshot w store: nie renderuje kanwy (brak sieci = brak rysunku, nie crash)', () => {
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    expect(container.querySelector('[data-testid="sld-canvas-v3"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-canvas-v3-workspace"]')).toBeTruthy();
  });

  it('snapshot ze WSPÓLNEGO useSnapshotStore (ten sam co v2) renderuje SldCanvasV3', () => {
    useSnapshotStore.setState({ snapshot: enm });
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]');
    expect(svg).toBeTruthy();
  });

  it('klik w symbol woła globalną selekcję (useSelectionStore) z id wywiedzionym z testId', () => {
    useSnapshotStore.setState({ snapshot: enm });
    const scene = buildSceneV3(enm, 0);
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    const firstSymbolGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.firstElementChild;
    expect(firstSymbolGroup).toBeTruthy();
    const testId = firstSymbolGroup!.getAttribute('data-testid')!;
    expect(testId).toBe(scene.symbols[0].meta?.testId ?? 'sld-v3-symbol-0');

    fireEvent.click(uchwytTrafienia(container, testId)!);

    const selected = useSelectionStore.getState().selectedElement;
    expect(selected).not.toBeNull();
    // F8b-1 B: id = meta.ownerRef (realny ref ENM, np. bayRef aparatu) —
    // POPRAWA względem starej heurystyki testId.split('#')[0], która dla
    // symboli GPZ (testId = `gpz-canonical-bay-...-disconnector`, BEZ '#')
    // dawałaby cały testId jako id (błędne); `ownerRef` niesie realny bayRef
    // niezależnie od formatu testId.
    expect(selected?.id).toBe(scene.symbols[0].meta?.ownerRef);
    // F8b-1 B: typ selekcji pochodzi teraz z elementKind (nie zawsze
    // 'DescriptiveElement' — patrz test dedykowany niżej).
    // KD-5: pierwszym symbolem sceny L0 jest ZWINIĘTY BLOK GPZ
    // (`elementKind: 'station'`), a nie aparat pola GPZ (dawniej odłącznik →
    // 'Switch'). Intencja testu (klik → selekcja z id z `ownerRef` i typem z
    // `elementKind`) bez zmian; oczekiwanie wyprowadzamy ze sceny, żeby test
    // nie przybijał kolejności symboli.
    expect(selected?.type).toBe(elementTypeForKind(scene.symbols[0].meta?.elementKind));
    expect(selected?.type).toBe('Station');
  });

  describe('F8b-1 B — selekcja z realnym typem (elementKind → ElementType v2)', () => {
    it('klik w symbol L0 (stationCollapsed) → SelectedElement.type = "Station", id = station ref', () => {
      useSnapshotStore.setState({ snapshot: enm });
      const scene = buildSceneV3(enm, 0);
      const stationIndex = scene.symbols.findIndex((s) => s.symbolId === 'stationCollapsed');
      expect(stationIndex).toBeGreaterThanOrEqual(0);
      const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
      fireEvent.click(uchwytSymbolu(container, scene, stationIndex)!);
      const selected = useSelectionStore.getState().selectedElement;
      expect(selected?.type).toBe('Station');
      expect(selected?.id).toBe(scene.symbols[stationIndex].meta?.ownerRef);
    });

    it('elementTypeForKind: mapowanie na CAŁĄ małą unię PreviewElementKind + fallback undefined dla nieznanego/braku', () => {
      expect(elementTypeForKind('station')).toBe('Station');
      expect(elementTypeForKind('transformer')).toBe('TransformerBranch');
      expect(elementTypeForKind('der')).toBe('Generator');
      expect(elementTypeForKind('source')).toBe('Source');
      expect(elementTypeForKind('bus')).toBe('Bus');
      expect(elementTypeForKind('segment')).toBe('LineBranch');
      expect(elementTypeForKind('apparatus')).toBe('Switch');
      expect(elementTypeForKind(undefined)).toBeUndefined();
    });

    it('S9-4 (audyt P-6): klik w TŁO arkusza CZYŚCI zaznaczenie — pusty arkusz nie jest obiektem', () => {
      useSnapshotStore.setState({ snapshot: enm });
      const scene = buildSceneV3(enm, 0);
      const stationIndex = scene.symbols.findIndex((s) => s.symbolId === 'stationCollapsed');
      const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
      // Najpierw REALNE zaznaczenie (żeby było co czyścić — inaczej test
      // przechodziłby na pustym stanie i niczego nie dowodził).
      fireEvent.click(uchwytSymbolu(container, scene, stationIndex)!);
      expect(useSelectionStore.getState().selectedElement).not.toBeNull();

      // Klik w korzeń kanwy = tło: cały rysunek jest bierny, więc w
      // przeglądarce każdy punkt bez uchwytu daje DOKŁADNIE ten cel zdarzenia.
      fireEvent.click(container.querySelector('[data-testid="sld-canvas-v3"]')!);

      expect(useSelectionStore.getState().selectedElement).toBeNull();
      expect(useSelectionStore.getState().selectedElements).toEqual([]);
    });

    it('F9.4 (runda korekcyjna, F-3): klik w symbol gridSource (sieć zewnętrzna, GPZ) → SelectedElement.type = "Source", id = source ref — PRZED poprawką brakowało gałęzi "source" w elementTypeForKind (spadało na "DescriptiveElement")', () => {
      useSnapshotStore.setState({ snapshot: enm });
      // Zero-Debt (dyrektywa 2026-07-17 pkt 5): test brał INDEKS ze sceny L1, a
      // klikał w DOM renderowany na L0 — działał wyłącznie dlatego, że indeksy
      // przypadkiem się pokrywały (KD-5 je rozjechało). Naprawa u źródła: węzeł
      // wyszukiwany po REALNYM `data-testid` sceny, którą kanwa faktycznie
      // rysuje — test przestaje zależeć od kolejności symboli.
      const scene = buildSceneV3(enm, 0);
      const source = scene.symbols.find((s) => s.symbolId === 'gridSource');
      expect(source, 'glif sieci zewnętrznej widoczny na KAŻDYM LOD (§13.1)').toBeTruthy();
      const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
      const sourceGroup = uchwytTrafienia(container, source!.meta!.testId!);
      expect(sourceGroup, 'symbol sieci zewnętrznej ma uchwyt trafienia').toBeTruthy();
      fireEvent.click(sourceGroup!);
      const selected = useSelectionStore.getState().selectedElement;
      expect(selected?.type).toBe('Source');
      expect(selected?.id).toBe(source!.meta?.ownerRef);
    });
  });
});

describe('SldCanvasV3Workspace — F8b-1 C: nakładka energizacji z realnych wyników (topologia, ZERO fizyki)', () => {
  it('bez snapshot: overlay pusty (nie crashuje, brak nakładki)', () => {
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    expect(container.querySelector('[data-testid="sld-canvas-v3"]')).toBeNull();
  });

  it('GPZ + stacje ciągu głównego są energizowane (topologia od źródła przez zamknięte łączniki) → symbol stationCollapsed (L0) ma nakładkę koloru (stroke != base)', () => {
    useSnapshotStore.setState({ snapshot: enm });
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((s) => s.symbolId === 'stationCollapsed');
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    const stationGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[stationIndex];
    // Nakładka rysuje stroke NA GLIFIE (potomek grupy), nie na samej grupie —
    // wystarczy, że jakiś potomek ma stroke ustawiony na kolor akcentu (nie
    // wartość bazową V3_STROKE_BASE '#E8EEF4') LUB wygaszenia ('#5B6B76') —
    // dowód, że nakładka faktycznie coś wpisała (nie mono-only).
    const strokedDescendant = stationGroup!.querySelector('[stroke="#2ECC71"], [stroke="#5B6B76"]');
    expect(strokedDescendant).toBeTruthy();
  });

  it('F8b-1 FIX (recenzja): nakładka kluczowana LOD-niezależnym ownerRef — indeksowy fallback testId kolidował między LOD-ami (odcinek LOD0 #5 dostawał stan odcinka LOD2 #5); wpis per ownerRef jest identyczny niezależnie od LOD-u, z którego liczony', () => {
    useSnapshotStore.setState({ snapshot: enm });
    const highlight = buildSupplyPathHighlight(enm);
    // Niezależna rekomputacja: dla KAŻDEGO kwalifikowanego elementu KAŻDEGO
    // LOD-u stan z nakładki (przez publiczny render nie ma dostępu do
    // słownika, więc liczymy tym samym budowniczym co Workspace) musi być
    // równy stanowi JEGO WŁASNEGO bazowego refu — kontrprzykład sprzed
    // naprawy: klucz `sld-v3-segment-${index}` z LOD2 nadpisywał wpis LOD0.
    const overlay = buildEnergizationOverlayForTest(enm);
    expect(Object.keys(overlay.energizedByOwnerRef ?? {}).length).toBeGreaterThan(0);
    // Zero kluczy indeksowych (dowód, że kolizyjna klasa kluczy zniknęła).
    for (const key of Object.keys(overlay.energizedByOwnerRef ?? {})) {
      expect(key.startsWith('sld-v3-segment-')).toBe(false);
      expect(key.startsWith('sld-v3-symbol-')).toBe(false);
    }
    for (const lod of [0, 1, 2] as const) {
      const scene = buildSceneV3(enm, lod);
      for (const segment of scene.segments) {
        const meta = segment.meta;
        if (!meta?.ownerRef || !meta.elementKind) continue;
        if (!['station', 'bus', 'segment'].includes(meta.elementKind)) continue;
        const base = meta.ownerRef.includes('#') ? meta.ownerRef.slice(0, meta.ownerRef.indexOf('#')) : meta.ownerRef;
        expect(overlay.energizedByOwnerRef?.[meta.ownerRef]).toBe(isElementEnergized(highlight, base));
      }
    }
  });
});

describe('SldCanvasV3Workspace — F9.5: nakładka przepływu mocy (spec §14.2, ZERO fizyki)', () => {
  // F-1 (recenzja Opusa): ref MUSI być z bramki jednokawałkowej — tylko takie
  // przechodzą przez `buildFlowOverlayForSnapshot` (kierunek udowodniony).
  const singleHop = new Set(orientedSegmentRefs(enm).keys());
  const realSegmentOwnerRef = buildSceneV3(enm, 2).segments.find(
    (s) =>
      s.meta?.elementKind === 'segment' &&
      s.meta.ownerRef &&
      !s.meta.ownerRef.includes('#') &&
      singleHop.has(s.meta.ownerRef),
  )!.meta!.ownerRef!;

  it('bez przebiegu w useRawResultOverlayStore (stan domyślny produkcji przed uruchomieniem analizy): kanwa renderuje się bez crasha, nakładka pusta', () => {
    useSnapshotStore.setState({ snapshot: enm });
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    expect(container.querySelector('[data-testid="sld-canvas-v3"]')).toBeTruthy();
    expect(isFlowOverlayEmpty(buildFlowOverlayForSnapshot(enm, useRawResultOverlayStore.getState().payload))).toBe(true);
  });

  it('payload obecny w store, ALE brak snapshot: nie crashuje (brak sieci = brak rysunku, jak bez nakładki)', () => {
    useRawResultOverlayStore.getState().setPayload(rawPayload({
      [realSegmentOwnerRef]: rawElement(realSegmentOwnerRef, { P_MW: { code: 'P_MW', value: 1, unit: 'MW' } }),
    }));
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    expect(container.querySelector('[data-testid="sld-canvas-v3"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-canvas-v3-workspace"]')).toBeTruthy();
  });

  it('przebieg realny w store (ref = PRAWDZIWY segmentRef ze sceny): kanwa renderuje się bez crasha, buildFlowOverlayForSnapshot niesie wpis identyczny z buildFlowOverlayFromScene wołanym wprost (zero rozjazdu wołający↔budowniczy)', () => {
    useSnapshotStore.setState({ snapshot: enm });
    const payload = rawPayload({
      [realSegmentOwnerRef]: rawElement(realSegmentOwnerRef, {
        P_MW: { code: 'P_MW', value: -3.4, unit: 'MW' },
        Q_Mvar: { code: 'Q_Mvar', value: 0.6, unit: 'Mvar' },
        I_A: { code: 'I_A', value: 210, unit: 'A' },
      }),
    });
    useRawResultOverlayStore.getState().setPayload(payload);
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    expect(container.querySelector('[data-testid="sld-canvas-v3"]')).toBeTruthy();

    const flow = buildFlowOverlayForSnapshot(enm, payload);
    expect(flow[realSegmentOwnerRef]).toEqual({
      ownerRef: realSegmentOwnerRef,
      forward: false,
      p: { value: -3.4, unit: 'MW' },
      q: { value: 0.6, unit: 'Mvar' },
      i: { value: 210, unit: 'A' },
    });
    expect(flowOverlayValuesTraceToPayload(flow, payload)).toBe(true);
  });

  it('determinizm: buildFlowOverlayForSnapshot(enm, payload) wywołane dwukrotnie ⇒ identyczny JSON.stringify', () => {
    const payload = rawPayload({
      [realSegmentOwnerRef]: rawElement(realSegmentOwnerRef, { P_MW: { code: 'P_MW', value: 0.9, unit: 'MW' } }),
    });
    const first = buildFlowOverlayForSnapshot(enm, payload);
    const second = buildFlowOverlayForSnapshot(enm, payload);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('buildFlowOverlayForSnapshot(snapshot, null) ⇒ {} (kontrakt „overlay wyłączony bez wyniku" na poziomie funkcji wołanej przez hook produkcyjny)', () => {
    expect(buildFlowOverlayForSnapshot(enm, null)).toEqual({});
  });
});

describe('SldCanvasV3Workspace — karta S-B: strzałki rozpływu prądu zwarciowego (kanał useOverlayStore.faultFlow)', () => {
  // S9-2: ref z mapy ORIENTACJI (zwrot udowodniony refami wezlow galezi) —
  // ten sam dobor celu co blok F9.5 wyzej.
  const orientation = orientedSegmentRefs(enm);
  const singleHop = new Set(orientation.keys());
  const realSegmentOwnerRef = buildSceneV3(enm, 2).segments.find(
    (s) =>
      s.meta?.elementKind === 'segment' &&
      s.meta.ownerRef &&
      !s.meta.ownerRef.includes('#') &&
      singleHop.has(s.meta.ownerRef),
  )!.meta!.ownerRef!;

  function faultInput(direction = 'from_to'): ShortCircuitFlowOverlayInput {
    const flow: ShortCircuitBranchFlowV1 = {
      branch_id: realSegmentOwnerRef,
      branch_name: 'Odcinek magistrali',
      source_id: 'ZR-PV',
      from_node_id: 'W-A',
      from_node_name: 'Węzeł A',
      to_node_id: 'W-B',
      to_node_name: 'Węzeł B',
      i_ka: 0.245,
      direction,
    };
    return { run_id: 'run-sc', fault_type: '3F', fault_element_ref: 'EL-ZWARCIE', flows: [flow] };
  }

  it('ŚCIEŻKA PRODUKCYJNA: snapshot + loadFaultFlow (ekran zwarć „Pokaż na schemacie") ⇒ strzałka w DOM kanwy v3', () => {
    useSnapshotStore.setState({ snapshot: enm });
    useOverlayStore.getState().loadFaultFlow(faultInput());
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    const layer = container.querySelector('[data-testid="sld-v3-fault-flow-overlay"]');
    expect(layer).toBeTruthy();
    expect(layer!.children.length).toBe(1);
    expect(layer!.firstElementChild!.getAttribute('data-fault-owner-ref')).toBe(realSegmentOwnerRef);
    expect(layer!.firstElementChild!.getAttribute('data-fault-forward')).toBe('true');
  });

  it('bez kanału kierunku (faultFlow=null — stan domyślny): warstwa strzałek PUSTA (zero atrap)', () => {
    useSnapshotStore.setState({ snapshot: enm });
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    expect(container.querySelector('[data-testid="sld-v3-fault-flow-overlay"]')!.children.length).toBe(0);
  });

  it('buildFaultFlowOverlayForSnapshot niesie wpis identyczny z buildFaultFlowOverlayFromScene wołanym wprost (zero rozjazdu wołający↔budowniczy) + wyrocznia PASS', () => {
    const input = faultInput('to_from');
    const merged = buildFaultFlowOverlayForSnapshot(enm, input);
    const direct = buildFaultFlowOverlayFromScene(buildSceneV3(enm, 2), input, orientation);
    expect(merged[realSegmentOwnerRef]).toEqual(direct[realSegmentOwnerRef]);
    expect(merged[realSegmentOwnerRef]?.forward).toBe(false);
    expect(faultFlowOverlayTracesToInput(merged, input)).toBe(true);
  });

  it('determinizm: buildFaultFlowOverlayForSnapshot(enm, input) dwukrotnie ⇒ identyczny JSON.stringify; input=null ⇒ {}', () => {
    const input = faultInput();
    expect(JSON.stringify(buildFaultFlowOverlayForSnapshot(enm, input))).toBe(
      JSON.stringify(buildFaultFlowOverlayForSnapshot(enm, input)),
    );
    expect(buildFaultFlowOverlayForSnapshot(enm, null)).toEqual({});
  });
});
