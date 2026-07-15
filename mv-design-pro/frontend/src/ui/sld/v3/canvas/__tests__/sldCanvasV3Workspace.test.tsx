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
import { buildEnergizationOverlay as buildEnergizationOverlayForTest, SldCanvasV3Workspace, elementTypeForKind } from '../SldCanvasV3Workspace';
import { buildSupplyPathHighlight, isElementEnergized } from '../../../v2/canvas/SupplyPathHighlighter';

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

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
});

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

    fireEvent.click(firstSymbolGroup!);

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
    expect(selected?.type).toBe('Switch');
  });

  describe('F8b-1 B — selekcja z realnym typem (elementKind → ElementType v2)', () => {
    it('klik w symbol L0 (stationCollapsed) → SelectedElement.type = "Station", id = station ref', () => {
      useSnapshotStore.setState({ snapshot: enm });
      const scene = buildSceneV3(enm, 0);
      const stationIndex = scene.symbols.findIndex((s) => s.symbolId === 'stationCollapsed');
      expect(stationIndex).toBeGreaterThanOrEqual(0);
      const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
      const stationGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[stationIndex];
      fireEvent.click(stationGroup!);
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

    it('F9.4 (runda korekcyjna, F-3): klik w symbol gridSource (sieć zewnętrzna, GPZ) → SelectedElement.type = "Source", id = source ref — PRZED poprawką brakowało gałęzi "source" w elementTypeForKind (spadało na "DescriptiveElement")', () => {
      useSnapshotStore.setState({ snapshot: enm });
      const scene = buildSceneV3(enm, 1);
      const sourceIndex = scene.symbols.findIndex((s) => s.symbolId === 'gridSource');
      expect(sourceIndex).toBeGreaterThanOrEqual(0);
      const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
      const sourceGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[sourceIndex];
      fireEvent.click(sourceGroup!);
      const selected = useSelectionStore.getState().selectedElement;
      expect(selected?.type).toBe('Source');
      expect(selected?.id).toBe(scene.symbols[sourceIndex].meta?.ownerRef);
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
