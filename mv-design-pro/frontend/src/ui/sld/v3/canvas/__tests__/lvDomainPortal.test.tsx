/** Portal SN -> nN: dwuklik stacji otwiera atomowy LvDomainProjectionV1. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { useAppStateStore } from '../../../../app-state';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';
import { useSelectionStore } from '../../../../selection';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { MULTI_SOURCE_PROJECTION } from '../../lv-domain/fixtures/multiSourceDomain';
import { buildSceneV3 } from '../../scene/buildScene';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';

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
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  readonly enm: EnergyNetworkModel;
}).enm;

function uchwyt(
  container: HTMLElement,
  scene: { symbols: readonly { meta?: { testId?: string } }[] },
  index: number,
): Element | null {
  const testId = scene.symbols[index]?.meta?.testId ?? `sld-v3-symbol-${index}`;
  return container.querySelector(`[data-hit-for="${testId}"][data-hit-role="obrys"]`);
}

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useSnapshotStore.setState({ snapshot: enm });
  useAppStateStore.setState({ activeCaseId: 'case-lv-domain-test' });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MULTI_SOURCE_PROJECTION), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useRawResultOverlayStore.getState().clear();
});

describe('SldCanvasV3Workspace — portal domeny nN', () => {
  it('dwuklik stacji otwiera portal i pobiera dokładnie atomową projekcję v1', async () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((symbol) => symbol.meta?.elementKind === 'station');
    const stationRef = scene.symbols[stationIndex].meta?.ownerRef;
    expect(stationIndex).toBeGreaterThanOrEqual(0);
    expect(stationRef).toBeTruthy();

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    fireEvent.doubleClick(uchwyt(container, scene, stationIndex)!);

    expect(screen.getByTestId('lv-domain-portal-drawer')).toBeInTheDocument();
    expect(await screen.findByTestId('lv-domain-view-root')).toHaveAttribute(
      'data-projection-hash',
      MULTI_SOURCE_PROJECTION.projection_hash,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        `/api/cases/case-lv-domain-test/enm/lv-domain/${encodeURIComponent(stationRef!)}/projection/v1`,
      ),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('pojedynczy klik stacji nie otwiera portalu', () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((symbol) => symbol.meta?.elementKind === 'station');
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);

    fireEvent.click(uchwyt(container, scene, stationIndex)!);

    expect(screen.queryByTestId('lv-domain-portal-drawer')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('dwuklik aparatury nie otwiera domeny stacji', () => {
    const scene = buildSceneV3(enm, 0);
    const apparatusIndex = scene.symbols.findIndex(
      (symbol) => symbol.meta?.elementKind === 'apparatus',
    );
    expect(apparatusIndex).toBeGreaterThanOrEqual(0);
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);

    fireEvent.doubleClick(uchwyt(container, scene, apparatusIndex)!);

    expect(screen.queryByTestId('lv-domain-portal-drawer')).toBeNull();
  });

  it('przycisk Zamknij usuwa portal i przerywa jego cykl życia', async () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((symbol) => symbol.meta?.elementKind === 'station');
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    fireEvent.doubleClick(uchwyt(container, scene, stationIndex)!);
    await screen.findByTestId('lv-domain-portal');

    fireEvent.click(screen.getByTestId('lv-domain-portal-close'));

    await waitFor(() => expect(screen.queryByTestId('lv-domain-portal-drawer')).toBeNull());
  });
});
