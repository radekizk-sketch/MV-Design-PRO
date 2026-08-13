/**
 * R4 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.10/13/15/18; program WYNIKI-SLD R4)
 * — testy WORKSPACE trybu porównawczego (bramkowanie dostępności/OUTDATED, wym.
 * 10), przełączania analiz na WSPÓLNYM rejestrze (LF↔SC ⇒ inne etykiety, wym.
 * 13), EKSPORTU warstwy wynikowej bez utraty pozycji (wym. 18, ta sama
 * serializacja co ekran) oraz INWARIANTU geometrii przy porównaniu (§6).
 *
 * Ścieżka NATYWNA (dyrektywa Zero-Debt pkt 5): interakcje przez realne kliki
 * (panel warstw → panel filtrów → radio trybu), store karmiony jak w produkcji.
 * Fixtura REALNA (`sldSubstrate52s`); refy ze sceny (zero fabrykacji).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { useAppStateStore } from '../../../../app-state';
import { SldCanvasV3, layoutResultLabels } from '../SldCanvasV3';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import {
  buildResultLabelsFromScene,
  orientedSegmentRefs,
  type ResultLabelComparison,
} from '../resultLabels';
import {
  useRawResultOverlayStore,
  type RawOverlayElement,
  type RawOverlayPayload,
} from '../../../../sld-overlay/rawResultOverlayStore';
import { useOverlayStore } from '../../../../sld-overlay/overlayStore';
import type { SldV3Overlay } from '../overlay';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const CANVAS_W = 1024;
const CANVAS_H = 640;
const sceneL2 = buildSceneV3(enm, 2);
const singleHop = new Set(orientedSegmentRefs(enm).keys());

const branchRef = sceneL2.segments.find(
  (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#') && singleHop.has(s.meta.ownerRef),
)!.meta!.ownerRef!;

function el(refId: string, kind: string, metrics: RawOverlayElement['metrics']): RawOverlayElement {
  return { ref_id: refId, kind, badges: [], metrics, severity: 'INFO' };
}
function branchLoadingPayload(value: number, runId: string, analysisType = 'load_flow'): RawOverlayPayload {
  return {
    run_id: runId,
    analysis_type: analysisType,
    elements: { [branchRef]: el(branchRef, 'branch', { LOADING_PCT: { code: 'LOADING_PCT', value, unit: '%', format_hint: 'fixed1' } }) },
  };
}

/**
 * KD-8 poz. 2: pas narzędzi kanwy jest JEDNYM rzędem — przy wąskiej kanwie
 * (te testy renderują 800 px) grupy o niższej randze są ZWINIĘTE do menu
 * „Narzędzia", zamiast nachodzić na sąsiadów. Użytkownik sięga po nie jednym
 * klikiem w to menu i test idzie DOKŁADNIE tą samą drogą — nie zakłada, że
 * kontrolka jest zawsze w pasie (założenie, które maskowałoby zwinięcie).
 */
function rozwinZwinieteNarzedzia(): void {
  const menu = screen.queryByTestId('sld-v3-toolbar-menu-toggle');
  if (menu && screen.queryByTestId('sld-v3-toolbar-menu') === null) {
    fireEvent.click(menu);
  }
}

beforeEach(() => {
  // jsdom shim (jak workspacePanels.test.tsx).
  // @ts-expect-error jsdom shim
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
  // @ts-expect-error jsdom shim
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useOverlayStore.getState().clearOverlay();
  useAppStateStore.getState().reset();
  useSnapshotStore.setState({ snapshot: enm });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useRawResultOverlayStore.getState().clear();
  useAppStateStore.getState().reset();
});

/** Otwiera panel warstw (który zawiera panel filtrów z sekcją porównawczą). */
function openFilterPanel(): void {
  fireEvent.click(screen.getByTestId('sld-v3-layer-panel-toggle'));
}

describe('R4 — tryb porównawczy: bramkowanie dostępności (wym. 10)', () => {
  it('brak poprzedniego biegu ⇒ tryb zablokowany z wyjaśnieniem', () => {
    useRawResultOverlayStore.getState().setPayload(branchLoadingPayload(72.5, 'r1'));
    render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);
    openFilterPanel();
    const box = screen.getByTestId('sld-v3-result-comparison');
    expect(box.getAttribute('data-comparison-available')).toBe('false');
    expect(screen.getByTestId('sld-v3-result-comparison-blocked').textContent).toContain('Brak poprzedniego biegu');
    expect(screen.getByTestId('sld-v3-result-comparison-mode-delta')).toBeDisabled();
  });

  it('drugi bieg TEJ analizy ⇒ tryb dostępny; wybór Δ ⇒ etykieta niesie „Δ" + trend', () => {
    useRawResultOverlayStore.getState().setPayload(branchLoadingPayload(68.0, 'r1'));
    useRawResultOverlayStore.getState().setPayload(branchLoadingPayload(72.5, 'r2'));
    const { container } = render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);
    openFilterPanel();
    expect(screen.getByTestId('sld-v3-result-comparison').getAttribute('data-comparison-available')).toBe('true');
    fireEvent.click(screen.getByTestId('sld-v3-result-comparison-mode-delta'));
    // Etykieta przęsła pokazuje różnicę Δ +4,5 % + strzałkę trendu (↑).
    const branchGroup = container.querySelector(`[data-result-owner-ref="${CSS.escape(branchRef)}"]`);
    expect(branchGroup).toBeTruthy();
    expect(branchGroup!.textContent).toContain('Δ');
    expect(branchGroup!.textContent).toContain('↑');
  });

  it('wyniki OUTDATED ⇒ tryb zablokowany z wyjaśnieniem (zero mylących delt)', () => {
    useRawResultOverlayStore.getState().setPayload(branchLoadingPayload(68.0, 'r1'));
    useRawResultOverlayStore.getState().setPayload(branchLoadingPayload(72.5, 'r2'));
    useAppStateStore.setState({ activeCaseResultStatus: 'OUTDATED' });
    render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);
    openFilterPanel();
    expect(screen.getByTestId('sld-v3-result-comparison').getAttribute('data-comparison-available')).toBe('false');
    expect(screen.getByTestId('sld-v3-result-comparison-blocked').textContent).toContain('nieaktualne');
    expect(screen.getByTestId('sld-v3-result-comparison-mode-delta')).toBeDisabled();
  });
});

describe('R4 — przełączanie analiz na WSPÓLNYM rejestrze (wym. 13)', () => {
  it('LF ⇒ etykieta obciążenia; SC na tej samej szynie ⇒ etykieta prądu zwarciowego (jeden rejestr, różne treści)', () => {
    // Szyna: kotwica + kanoniczny ref.
    const busSeg = sceneL2.segments.find((s) => s.meta?.elementKind === 'bus' && s.meta?.ownerRef)!;
    const busOwnerRef = busSeg.meta!.ownerRef!;
    const busRef = busSeg.meta!.busResultRef ?? busOwnerRef;
    const lf: RawOverlayPayload = {
      run_id: 'lf', analysis_type: 'load_flow',
      elements: { [busRef]: el(busRef, 'bus', { U_kV: { code: 'U_kV', value: 15.02, unit: 'kV', format_hint: 'fixed2' } }) },
    };
    const sc: RawOverlayPayload = {
      run_id: 'sc', analysis_type: 'short_circuit_3f',
      elements: { [busRef]: el(busRef, 'bus', { IK_3F_A: { code: 'IK_3F_A', value: 12.5, unit: 'kA', format_hint: 'fixed2' } }) },
    };
    const lfEntries = buildResultLabelsFromScene(sceneL2, lf, singleHop);
    const scEntries = buildResultLabelsFromScene(sceneL2, sc, singleHop);
    // Ta sama kotwica, INNE treści z tego samego rejestru (przełączenie payloadu).
    expect(lfEntries[busOwnerRef].lines[0]).toEqual({ prefix: 'U', text: '15,02 kV' });
    expect(scEntries[busOwnerRef].lines[0]).toEqual({ prefix: 'Ik″', text: '12,5 kA' });
  });
});

describe('R4 — eksport warstwy wynikowej bez utraty pozycji (wym. 18)', () => {
  it('eksport SVG (ta sama serializacja co ekran) zawiera etykiety wynikowe na POZYCJACH ekranowych', () => {
    useRawResultOverlayStore.getState().setPayload(branchLoadingPayload(72.5, 'r1'));
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);

    // Etykieta obecna na EKRANIE — pobierz jej tekst i pozycję (x/y) z żywego DOM.
    const onScreenLine = container.querySelector('[data-testid^="sld-v3-result-line-"]') as SVGTextElement | null;
    expect(onScreenLine).toBeTruthy();
    const x = onScreenLine!.getAttribute('x')!;
    const y = onScreenLine!.getAttribute('y')!;
    expect(onScreenLine!.textContent).toContain('72,5');
    // Warstwa wynikowa jest DESCENDANTEM kanwy eksportowanej (klon obejmie ją).
    const canvasSvg = container.querySelector('svg[data-testid="sld-canvas-v3"]')!;
    expect(canvasSvg.querySelector('[data-testid="sld-v3-result-labels"]')).toBeTruthy();

    // Przechwyć markup eksportu przez TĘ SAMĄ ścieżkę co produkcja (Blob w
    // handleExportSvg) — dowód, że eksport NIE jest drugim rendererem.
    const RealBlob = globalThis.Blob;
    const blobCtorSpy = vi.fn((parts: BlobPart[], options?: BlobPropertyBag) => new RealBlob(parts, options));
    vi.stubGlobal('Blob', blobCtorSpy);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    rozwinZwinieteNarzedzia();
    fireEvent.click(screen.getByTestId('sld-v3-export-svg'));
    const svgStr = String(blobCtorSpy.mock.calls[0][0][0]);
    vi.unstubAllGlobals();

    // Warstwa + treść obecne w eksporcie; POZYCJA (x/y) identyczna jak na ekranie.
    expect(svgStr).toContain('sld-v3-result-labels');
    expect(svgStr).toContain('72,5');
    expect(svgStr).toContain(`x="${x}"`);
    expect(svgStr).toContain(`y="${y}"`);
  });
});

describe('R4 — inwariant geometrii przy trybie porównawczym (§6)', () => {
  it('scena (segmenty/symbole/etykiety) BAJT-identyczna: warstwa bazowa vs porównawcza', () => {
    const current = branchLoadingPayload(72.5, 'r2');
    const previous = branchLoadingPayload(68.0, 'r1');
    const base = buildResultLabelsFromScene(sceneL2, current, singleHop);
    const comparison: ResultLabelComparison = { previousPayload: previous, mode: 'delta' };
    const compared = buildResultLabelsFromScene(sceneL2, current, singleHop, comparison);

    const overlayBase: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: base };
    const overlayCmp: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: compared };
    const a = render(<SldCanvasV3 snapshot={enm} width={CANVAS_W} height={CANVAS_H} lodOverride={2} overlay={overlayBase} />);
    const b = render(<SldCanvasV3 snapshot={enm} width={CANVAS_W} height={CANVAS_H} lodOverride={2} overlay={overlayCmp} />);
    for (const testId of ['sld-v3-segments', 'sld-v3-symbols', 'sld-v3-labels']) {
      expect(b.container.querySelector(`[data-testid="${testId}"]`)!.innerHTML).toBe(
        a.container.querySelector(`[data-testid="${testId}"]`)!.innerHTML,
      );
    }
    // Warstwa wynikowa MUSI się różnić (dowód, że test nie jest pusty): tryb
    // porównawczy dokłada „Δ" do etykiety, bazowy nie.
    const layout = layoutResultLabels(sceneL2, compared, [], 2);
    expect(layout.placements.some((p) => p.lines.some((l) => l.text.includes('Δ')))).toBe(true);
  });
});
