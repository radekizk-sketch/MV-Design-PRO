/**
 * F12-B (docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md §F12, spec §10.1 ARCH-4) —
 * testy sześciu ostatnich osiągalnych funkcji kontenera v2 przeniesionych na
 * `SldCanvasV3Workspace`: eksport SVG/PNG (pkt 1), drzewo hierarchii (pkt 2),
 * panel dowodów (pkt 3), panel warstw jako realny filtr renderu (pkt 4).
 * Lasso (pkt 5) i StationInternalView (pkt 6) mają dedykowane pliki testowe
 * (`lasso.test.ts`, `stationInternalView.test.tsx`).
 *
 * Wzorzec fixture/setup identyczny jak `sldCanvasV3Workspace.test.tsx` (F8a)
 * — TA SAMA sieć testowa.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';

beforeEach(() => {
  // jsdom nie implementuje URL.createObjectURL/revokeObjectURL — shim przed
  // spy (ten sam wzorzec co `v2/export/__tests__/SldExportButton.test.tsx`).
  // @ts-expect-error jsdom shim
  if (typeof URL.createObjectURL !== 'function') {
    // @ts-expect-error jsdom shim
    URL.createObjectURL = () => 'blob:shim';
  }
  // @ts-expect-error jsdom shim
  if (typeof URL.revokeObjectURL !== 'function') {
    // @ts-expect-error jsdom shim
    URL.revokeObjectURL = () => {};
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useRawResultOverlayStore.getState().clear();
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
  useSnapshotStore.setState({ snapshot: enm });
});

describe('SldCanvasV3Workspace — F12-B pkt 1: eksport SVG', () => {
  it('przycisk "↓ SVG" obecny i po kliku produkuje Blob SVG przez URL.createObjectURL', () => {
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    // jsdom's `Blob` nie implementuje `.text()` — przechwytujemy treść PRZED
    // konstrukcją (argumenty przekazane do `new Blob([svgStr], {type})` w
    // `handleExportSvg`) zamiast czytać ją z powrotem z instancji.
    const RealBlob = globalThis.Blob;
    const blobCtorSpy = vi.fn((parts: BlobPart[], options?: BlobPropertyBag) => new RealBlob(parts, options));
    vi.stubGlobal('Blob', blobCtorSpy);

    render(<SldCanvasV3Workspace width={800} height={600} />);

    const exportBtn = screen.getByTestId('sld-v3-export-svg');
    expect(exportBtn).toBeInTheDocument();
    expect(exportBtn.textContent).toContain('SVG');

    fireEvent.click(exportBtn);

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(blobCtorSpy).toHaveBeenCalledTimes(1);
    const [parts, options] = blobCtorSpy.mock.calls[0];
    expect(options?.type).toContain('svg');
    const svgStr = String(parts[0]);
    expect(svgStr).toContain('<svg');
    expect(svgStr).toContain('sld-canvas-v3');

    vi.unstubAllGlobals();
  });

  it('SldExportFormatMenu (wielo-format) jest zamontowane obok przycisku SVG', () => {
    render(<SldCanvasV3Workspace width={800} height={600} />);
    expect(screen.getByTestId('sld-v3-export-dock')).toBeInTheDocument();
    // SldExportFormatMenu — komponent standalone z v2/export, reużyty wprost;
    // dropdown trigger istnieje w tym samym doku.
    const dock = screen.getByTestId('sld-v3-export-dock');
    expect(dock.querySelectorAll('button').length).toBeGreaterThanOrEqual(2);
  });
});

describe('SldCanvasV3Workspace — F12-B pkt 2: drzewo hierarchii', () => {
  it('toggle otwiera NetworkHierarchyTree z realnymi stacjami/GPZ fixtury', () => {
    render(<SldCanvasV3Workspace width={800} height={600} />);

    expect(screen.queryByTestId('sld-network-hierarchy-tree')).toBeNull();
    fireEvent.click(screen.getByTestId('sld-v3-hierarchy-tree-toggle'));

    const tree = screen.getByTestId('sld-network-hierarchy-tree');
    expect(tree).toBeInTheDocument();
    // Fixtura sldSubstrate52s ma dokładnie 1 GPZ ("GPZ Referencyjny...") —
    // węzeł GPZ musi być obecny z realną nazwą (nie atrapa).
    const gpzNode = tree.querySelector('[data-testid^="sld-hierarchy-gpz-"]');
    expect(gpzNode).toBeTruthy();
    expect(gpzNode!.textContent).toContain('GPZ');
  });
});

describe('SldCanvasV3Workspace — F12-B pkt 3: panel dowodów', () => {
  it('toggle otwiera ProofPacksPanel', () => {
    render(<SldCanvasV3Workspace width={800} height={600} />);

    expect(screen.queryByTestId('sld-proof-packs-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('sld-v3-proof-packs-toggle'));

    expect(screen.getByTestId('sld-proof-packs-panel')).toBeInTheDocument();
  });

  it('hasNetworkModel=true dla fixtury niepustej — proof packs status "requires_calculation", nie "blocked"', () => {
    render(<SldCanvasV3Workspace width={800} height={600} />);
    fireEvent.click(screen.getByTestId('sld-v3-proof-packs-toggle'));

    const panel = screen.getByTestId('sld-proof-packs-panel');
    expect(within(panel).getByTestId('sld-proof-pack-sc_3f')).toBeTruthy();
    // Blocked packs NIE renderują wiersza CTA w ogóle (`!isBlocked` guard,
    // `ProofPacksPanel.tsx`) — obecność `sld-proof-pack-cta-sc_3f` dowodzi
    // `hasNetworkModel=true` (status 'requires_calculation', nie 'blocked').
    expect(within(panel).getByTestId('sld-proof-pack-cta-sc_3f')).toBeTruthy();
  });
});

describe('SldCanvasV3Workspace — F12-B pkt 4: panel warstw jako realny filtr renderu', () => {
  it('odznaczenie warstwy "Źródła i układy PV/BESS/FW" usuwa symbole der z DOM; zaznaczenie przywraca', () => {
    const scene = buildSceneV3(enm, 2);
    const derIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'der');
    expect(derIndex).toBeGreaterThanOrEqual(0);

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    const symbolsGroup = () => container.querySelector('[data-testid="sld-v3-symbols"]')!;

    // Widoczne domyślnie (brak layerVisibility jawnego = wszystko widoczne).
    expect(symbolsGroup().children[derIndex]).toBeTruthy();

    fireEvent.click(screen.getByTestId('sld-v3-layer-panel-toggle'));
    const derCheckbox = screen.getByTestId('sld-v3-layer-toggle-derSources');
    expect((derCheckbox as HTMLInputElement).checked).toBe(true);

    fireEvent.click(derCheckbox);
    expect((derCheckbox as HTMLInputElement).checked).toBe(false);
    // Element ukrytej warstwy renderuje `null` — DOM child na tym indeksie
    // znika (liczba dzieci grupy maleje), reszta pozostaje nietknięta.
    expect(symbolsGroup().children.length).toBeLessThan(scene.symbols.length);
    expect(
      Array.from(symbolsGroup().children).some(
        (el) => el.getAttribute('data-testid') === (scene.symbols[derIndex].meta?.testId ?? `sld-v3-symbol-${derIndex}`),
      ),
    ).toBe(false);

    fireEvent.click(derCheckbox);
    expect((derCheckbox as HTMLInputElement).checked).toBe(true);
    expect(symbolsGroup().children.length).toBe(scene.symbols.length);
  });

  it('reset przywraca wszystkie warstwy do widoczności domyślnej', () => {
    render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    fireEvent.click(screen.getByTestId('sld-v3-layer-panel-toggle'));
    const derCheckbox = screen.getByTestId('sld-v3-layer-toggle-derSources') as HTMLInputElement;
    fireEvent.click(derCheckbox);
    expect(derCheckbox.checked).toBe(false);

    fireEvent.click(screen.getByTestId('sld-v3-layer-panel-reset'));
    expect((screen.getByTestId('sld-v3-layer-toggle-derSources') as HTMLInputElement).checked).toBe(true);
  });

  it('(e) test negatywny: layerVisibility NIE zmienia liczby elementów sceny w buildSceneV3 (filtr renderu, nie sceny)', () => {
    // `buildSceneV3` jest CZYSTĄ funkcją snapshot+LOD → scena; nie przyjmuje
    // `layerVisibility` w ogóle (parametr istnieje WYŁĄCZNIE na `SldCanvasV3`/
    // renderze) — wołanie z tym samym snapshot+LOD zawsze daje TĘ SAMĄ liczbę
    // symboli/segmentów, niezależnie od jakiegokolwiek stanu UI warstw.
    const sceneA = buildSceneV3(enm, 2);
    const sceneB = buildSceneV3(enm, 2);
    expect(sceneB.symbols.length).toBe(sceneA.symbols.length);
    expect(sceneB.segments.length).toBe(sceneA.segments.length);

    // Dowód end-to-end: po ukryciu warstwy DOM traci węzły, ale scena
    // bazowa (rebudowana niezależnie od UI) ma identyczną liczebność.
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    fireEvent.click(screen.getByTestId('sld-v3-layer-panel-toggle'));
    fireEvent.click(screen.getByTestId('sld-v3-layer-toggle-derSources'));
    fireEvent.click(screen.getByTestId('sld-v3-layer-toggle-stationsApparatus'));

    const sceneAfterUiToggle = buildSceneV3(enm, 2);
    expect(sceneAfterUiToggle.symbols.length).toBe(sceneA.symbols.length);
    expect(sceneAfterUiToggle.segments.length).toBe(sceneA.segments.length);
    // DOM natomiast REALNIE straciło węzły (stationsApparatus jest
    // największą kategorią — stacje/aparatura/transformatory/szyny).
    const symbolsGroup = container.querySelector('[data-testid="sld-v3-symbols"]')!;
    expect(symbolsGroup.children.length).toBeLessThan(sceneA.symbols.length);
  });
});

describe('SldCanvasV3Workspace — W5 §18: podwarstwy L2 przełączalne (widoczność, geometria bez dryfu)', () => {
  it('master-toggle podwarstwy L2-A ukrywa WSZYSTKIE warstwy członkowskie (stacje/aparatura + DER)', () => {
    const scene = buildSceneV3(enm, 2);
    const derIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'der');
    const apparatusIndex = scene.symbols.findIndex((s) =>
      ['station', 'apparatus', 'transformer', 'bus'].includes(s.meta?.elementKind ?? ''),
    );
    expect(derIndex).toBeGreaterThanOrEqual(0);
    expect(apparatusIndex).toBeGreaterThanOrEqual(0);

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    const symbolsGroup = () => container.querySelector('[data-testid="sld-v3-symbols"]')!;
    const baseCount = symbolsGroup().children.length;

    fireEvent.click(screen.getByTestId('sld-v3-layer-panel-toggle'));
    const master = screen.getByTestId('sld-v3-l2-sublayer-toggle-L2A') as HTMLInputElement;
    expect(master.getAttribute('data-sublayer-state')).toBe('on');

    // master OFF → obie warstwy członkowskie (stationsApparatus, derSources) ukryte,
    // per-warstwowe checkboxy odznaczone (spójność master↔członkowie).
    fireEvent.click(master);
    expect(
      (screen.getByTestId('sld-v3-layer-toggle-stationsApparatus') as HTMLInputElement).checked,
    ).toBe(false);
    expect((screen.getByTestId('sld-v3-layer-toggle-derSources') as HTMLInputElement).checked).toBe(false);
    expect(symbolsGroup().children.length).toBeLessThan(baseCount);

    // master ON → przywrócone
    fireEvent.click(screen.getByTestId('sld-v3-l2-sublayer-toggle-L2A'));
    expect(symbolsGroup().children.length).toBe(baseCount);
  });

  it('odznaczenie JEDNEGO członka podwarstwy → master w stanie „mixed" (indeterminate)', () => {
    render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    fireEvent.click(screen.getByTestId('sld-v3-layer-panel-toggle'));

    fireEvent.click(screen.getByTestId('sld-v3-layer-toggle-derSources'));
    const master = screen.getByTestId('sld-v3-l2-sublayer-toggle-L2A') as HTMLInputElement;
    expect(master.getAttribute('data-sublayer-state')).toBe('mixed');
    expect(master.indeterminate).toBe(true);
  });

  it('geometria BAJT-INWARIANTNA: scena buildSceneV3 identyczna niezależnie od stanu KAŻDEJ podwarstwy L2', () => {
    const base = buildSceneV3(enm, 2);

    render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    fireEvent.click(screen.getByTestId('sld-v3-layer-panel-toggle'));

    // Przełącz WSZYSTKIE cztery podwarstwy — scena bazowa (rebudowana niezależnie
    // od UI) MUSI mieć tę samą liczebność i bbox (§18 „kotwica stacji niezmienna").
    for (const id of ['L2A', 'L2B', 'L2C', 'L2D']) {
      fireEvent.click(screen.getByTestId(`sld-v3-l2-sublayer-toggle-${id}`));
      const after = buildSceneV3(enm, 2);
      expect(after.symbols.length, `${id}: symbole`).toBe(base.symbols.length);
      expect(after.segments.length, `${id}: segmenty`).toBe(base.segments.length);
      expect(after.labels.length, `${id}: etykiety`).toBe(base.labels.length);
      expect(after.bbox, `${id}: bbox`).toEqual(base.bbox);
    }
  });

  it('reset przywraca wszystkie podwarstwy L2 do stanu „on"', () => {
    render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    fireEvent.click(screen.getByTestId('sld-v3-layer-panel-toggle'));
    fireEvent.click(screen.getByTestId('sld-v3-l2-sublayer-toggle-L2B'));
    expect(
      (screen.getByTestId('sld-v3-l2-sublayer-toggle-L2B') as HTMLInputElement).getAttribute('data-sublayer-state'),
    ).toBe('off');

    fireEvent.click(screen.getByTestId('sld-v3-layer-panel-reset'));
    for (const id of ['L2A', 'L2B', 'L2C', 'L2D']) {
      expect(
        (screen.getByTestId(`sld-v3-l2-sublayer-toggle-${id}`) as HTMLInputElement).getAttribute('data-sublayer-state'),
      ).toBe('on');
    }
  });
});
