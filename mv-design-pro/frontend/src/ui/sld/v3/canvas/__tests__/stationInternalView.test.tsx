/**
 * F12-B pkt 6 (docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md §F12, spec §10.1
 * ARCH-4 — „StationInternalView — dwuklik stacji"): testy drill-down wnętrza
 * stacji na `SldCanvasV3Workspace`. Wzorzec fixture/setup identyczny jak
 * `sldCanvasV3Workspace.test.tsx` (F8a) — TA SAMA sieć testowa.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';

afterEach(() => {
  cleanup();
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

/** Karta S9-4: uchwyt trafienia symbolu o zadanym indeksie sceny — węzeł,
 *  który w przeglądarce faktycznie łapie zdarzenie (rysunek jest bierny). */
function uchwyt(container: HTMLElement, scene: { symbols: readonly { meta?: { testId?: string } }[] }, index: number): Element | null {
  const testId = scene.symbols[index]?.meta?.testId ?? `sld-v3-symbol-${index}`;
  return container.querySelector(`[data-hit-for="${testId}"][data-hit-role="obrys"]`);
}

describe('SldCanvasV3Workspace — F12-B pkt 6: StationInternalView (dwuklik stacji)', () => {
  it('(a) dwuklik symbolu stacji otwiera StationInternalView z nazwą stacji', () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'station');
    expect(stationIndex).toBeGreaterThanOrEqual(0);
    const stationOwnerRef = scene.symbols[stationIndex].meta?.ownerRef;
    expect(stationOwnerRef).toBeTruthy();

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    expect(screen.queryByTestId('station-internal-view')).toBeNull();

    // Karta S9-4: rysunek kanwy jest bierny — celem zdarzenia jest UCHWYT
    // obiektu w warstwie `sld-v3-trafienia`, ten sam węzeł, w który trafia
    // mysz użytkownika. Intencja testów (dwuklik stacji = drill-down) bez zmian.
    const stationGroup = uchwyt(container, scene, stationIndex);
    expect(stationGroup).toBeTruthy();
    fireEvent.doubleClick(stationGroup!);

    const overlay = screen.getByTestId('station-internal-view');
    expect(overlay).toBeInTheDocument();
    const internalSvg = overlay.querySelector(`[data-testid="sld-v2-station-internal-${stationOwnerRef}"]`);
    expect(internalSvg).toBeTruthy();
    expect(internalSvg!.getAttribute('data-station-id')).toBe(stationOwnerRef);
  });

  it('(b) pojedynczy klik w symbol stacji NIE otwiera StationInternalView (tylko selekcja/drawer, jak v2)', () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'station');

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    // Karta S9-4: rysunek kanwy jest bierny — celem zdarzenia jest UCHWYT
    // obiektu w warstwie `sld-v3-trafienia`, ten sam węzeł, w który trafia
    // mysz użytkownika. Intencja testów (dwuklik stacji = drill-down) bez zmian.
    const stationGroup = uchwyt(container, scene, stationIndex);
    fireEvent.click(stationGroup!);

    expect(screen.queryByTestId('station-internal-view')).toBeNull();
  });

  it('(c) dwuklik symbolu APARATURY (elementKind≠station) nie otwiera drill-down (bez zgadywania)', () => {
    const scene = buildSceneV3(enm, 0);
    const apparatusIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'apparatus');
    expect(apparatusIndex).toBeGreaterThanOrEqual(0);

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    const group = uchwyt(container, scene, apparatusIndex);
    expect(() => fireEvent.doubleClick(group!)).not.toThrow();

    expect(screen.queryByTestId('station-internal-view')).toBeNull();
  });

  it('(d) przycisk "Zamknij" zamyka StationInternalView', () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'station');

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    // Karta S9-4: rysunek kanwy jest bierny — celem zdarzenia jest UCHWYT
    // obiektu w warstwie `sld-v3-trafienia`, ten sam węzeł, w który trafia
    // mysz użytkownika. Intencja testów (dwuklik stacji = drill-down) bez zmian.
    const stationGroup = uchwyt(container, scene, stationIndex);
    fireEvent.doubleClick(stationGroup!);
    expect(screen.getByTestId('station-internal-view')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('station-internal-close'));

    expect(screen.queryByTestId('station-internal-view')).toBeNull();
  });

  it('(e) klik na pole wewnątrz StationInternalView otwiera drawer szczegółów pola (buildDetailDrawerDataForKind(\'bay\', …))', () => {
    // Fixtura `sldSubstrate52s` niesie `snapshot.bays` PUSTE (dane pól SN
    // żyją poza płaską listą ENM dla tej sieci) — `StationInternalView` ma
    // WŁASNY fallback syntetycznych pól per `topologicalType`
    // (`normalizeStationInternalBays`/`buildFallbackBays`, komponent
    // współdzielony, NIETKNIĘTY), więc pole ZAWSZE się renderuje niezależnie
    // od tego, czy `buildStationInternalViewData` znalazło realne `Bay`
    // ENM. Test celuje w PIERWSZE renderowane pole (realne albo fallback) —
    // dowodzi wiring `onSelectBay` → drawer, nie konkretnego źródła danych.
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'station');

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    // Karta S9-4: rysunek kanwy jest bierny — celem zdarzenia jest UCHWYT
    // obiektu w warstwie `sld-v3-trafienia`, ten sam węzeł, w który trafia
    // mysz użytkownika. Intencja testów (dwuklik stacji = drill-down) bez zmian.
    const stationGroup = uchwyt(container, scene, stationIndex);
    fireEvent.doubleClick(stationGroup!);

    const overlay = screen.getByTestId('station-internal-view');
    const bayNode = overlay.querySelector('[data-testid^="station-internal-field-"]');
    expect(bayNode).toBeTruthy();
    fireEvent.click(bayNode!);

    const label = screen.getByTestId('sld-v2-detail-drawer-label');
    expect(label.textContent).toBeTruthy();
  });
});
