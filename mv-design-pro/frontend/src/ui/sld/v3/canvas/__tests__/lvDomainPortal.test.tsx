/**
 * PORTAL DOMENY nN — wejście do projekcji nN z kanwy SN (architektura LV
 * Domain Projection po B-02, `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md`):
 *  · od L1: JEDYNYM wejściem jest klik w symbol portalu (`lvPortal`) na
 *    zacisku nN transformatora — klik/dwuklik w transformator NIE otwiera
 *    projekcji;
 *  · L0: blok stacji jest jednym zwiniętym obiektem (zacisk i portal nie mają
 *    geometrii) — wejściem jest dwuklik w blok; pojedynczy klik NIE otwiera;
 *  · portal pobiera DOKŁADNIE jedno żądanie atomowej projekcji v1 stacji
 *    wskazanej przez `lvPortalStationRef` symbolu (tożsamość z meta, nie z
 *    parsowania refu);
 *  · „Zamknij" usuwa portal i przerywa jego cykl życia.
 *
 * Ścieżka NATYWNA (Zero-Debt §5): klik/dwuklik przez `fireEvent` na REALNYM
 * obszarze trafienia (`data-hit-for`), nie przez wymuszenie stanu store.
 */
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
import { scenariusz } from '../../lv-domain/fixtures/scenariusze';
import { buildSceneV3, type SceneV3 } from '../../scene/buildScene';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';

/** Projekcja z backendu (kontrakt 3.0.0) — atrapa odpowiada NIĄ z tożsamością żądania. */
const MULTI_SOURCE_PROJECTION = scenariusz('02_two_tr_qbc_open');

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

function uchwyt(container: HTMLElement, scene: SceneV3, index: number): Element {
  const testId = scene.symbols[index]?.meta?.testId ?? `sld-v3-symbol-${index}`;
  const el = container.querySelector(`[data-hit-for="${testId}"][data-hit-role="obrys"]`);
  if (!el) throw new Error(`brak obszaru trafienia dla ${testId}`);
  return el;
}

function indexOf(scene: SceneV3, predicate: (s: SceneV3['symbols'][number]) => boolean): number {
  const index = scene.symbols.findIndex(predicate);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useSnapshotStore.setState({ snapshot: enm });
  useAppStateStore.setState({ activeCaseId: 'case-lv-domain-test' });
  // Atrapa backendu odpowiada z TOŻSAMOŚCIĄ żądania (kontrakt 2.0.0:
  // `projectionApi.ts` odrzuca odpowiedź dla innego przypadku/stacji) —
  // dokładnie tak, jak robi to realny endpoint dla tego, o co pytano.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      const [, caseId, stationRef] =
        url.pathname.match(/\/api\/cases\/([^/]+)\/enm\/lv-domain\/([^/]+)\//) ?? [];
      const identity = {
        case_id: decodeURIComponent(caseId ?? ''),
        station_ref: decodeURIComponent(stationRef ?? ''),
      };
      const projection = {
        ...MULTI_SOURCE_PROJECTION,
        ...identity,
        model_snapshot: { ...MULTI_SOURCE_PROJECTION.model_snapshot, ...identity },
      };
      return new Response(JSON.stringify(projection), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useRawResultOverlayStore.getState().clear();
});

describe('SldCanvasV3Workspace — portal domeny nN na zacisku nN (L1/L2)', () => {
  it('klik w symbol portalu otwiera portal stacji z `lvPortalStationRef` i pobiera DOKŁADNIE jedną atomową projekcję v1', async () => {
    const scene = buildSceneV3(enm, 2);
    const portalIndex = indexOf(scene, (s) => s.meta?.elementKind === 'lvPortal');
    const stationRef = scene.symbols[portalIndex].meta?.lvPortalStationRef;
    expect(stationRef).toBeTruthy();

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    fireEvent.click(uchwyt(container, scene, portalIndex));

    expect(screen.getByTestId('lv-domain-portal-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('lv-domain-portal')).toHaveAttribute('data-station-ref', stationRef!);
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

  it('klik w portal NIE zaznacza obiektu modelu (portal to przejście, nie element ENM)', () => {
    const scene = buildSceneV3(enm, 2);
    const portalIndex = indexOf(scene, (s) => s.meta?.elementKind === 'lvPortal');
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    fireEvent.click(uchwyt(container, scene, portalIndex));
    expect(useSelectionStore.getState().selectedElements).toHaveLength(0);
  });

  it('klik ani dwuklik w TRANSFORMATOR (L2) NIE otwiera projekcji nN — jedynym wejściem od L1 jest portal', () => {
    const scene = buildSceneV3(enm, 2);
    const trIndex = indexOf(scene, (s) => s.meta?.elementKind === 'transformer');
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);

    fireEvent.click(uchwyt(container, scene, trIndex));
    expect(screen.queryByTestId('lv-domain-portal-drawer')).toBeNull();
    fireEvent.doubleClick(uchwyt(container, scene, trIndex));
    expect(screen.queryByTestId('lv-domain-portal-drawer')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('dwuklik w aparat pola (L2) NIE otwiera projekcji nN', () => {
    const scene = buildSceneV3(enm, 2);
    const apparatusIndex = indexOf(scene, (s) => s.meta?.elementKind === 'apparatus');
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    fireEvent.doubleClick(uchwyt(container, scene, apparatusIndex));
    expect(screen.queryByTestId('lv-domain-portal-drawer')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('przycisk Zamknij usuwa portal i przerywa jego cykl życia', async () => {
    const scene = buildSceneV3(enm, 2);
    const portalIndex = indexOf(scene, (s) => s.meta?.elementKind === 'lvPortal');
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    fireEvent.click(uchwyt(container, scene, portalIndex));
    await screen.findByTestId('lv-domain-portal');

    fireEvent.click(screen.getByTestId('lv-domain-portal-close'));

    await waitFor(() => expect(screen.queryByTestId('lv-domain-portal-drawer')).toBeNull());
  });
});

describe('SldCanvasV3Workspace — L0: blok zwinięty stacji jako wejście do projekcji nN', () => {
  it('dwuklik w blok stacji (L0) otwiera portal tej stacji', async () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = indexOf(scene, (s) => s.meta?.elementKind === 'station');
    const stationRef = scene.symbols[stationIndex].meta?.ownerRef;
    expect(stationRef).toBeTruthy();

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={0} />);
    fireEvent.doubleClick(uchwyt(container, scene, stationIndex));

    expect(screen.getByTestId('lv-domain-portal')).toHaveAttribute('data-station-ref', stationRef!);
    expect(await screen.findByTestId('lv-domain-view-root')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('pojedynczy klik w blok stacji (L0) NIE otwiera portalu', () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = indexOf(scene, (s) => s.meta?.elementKind === 'station');
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={0} />);
    fireEvent.click(uchwyt(container, scene, stationIndex));
    expect(screen.queryByTestId('lv-domain-portal-drawer')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
