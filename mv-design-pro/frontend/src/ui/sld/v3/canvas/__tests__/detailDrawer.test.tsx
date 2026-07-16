/**
 * F8c pkt 2 — testy drawera szczegółów elementu na kanwie v3 (checklista
 * bramkująca §F8c, pozycja 2 „Drawer szczegółów elementu"). Wzorzec
 * fixture/setup identyczny jak `sldCanvasV3Workspace.test.tsx` (F8a) — TA
 * SAMA sieć testowa. Zakres v3 dziś: WYŁĄCZNIE `elementKind='station'`
 * (patrz `shared/detailDrawerData.ts` nagłówek dla udokumentowanej luki
 * pozostałych kind).
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

describe('SldCanvasV3Workspace — F8c pkt 2: drawer szczegółów (SldDetailDrawer)', () => {
  it('(a) klik w stację otwiera drawer z nazwą stacji (SldDetailDrawer label)', () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'station');
    expect(stationIndex).toBeGreaterThanOrEqual(0);

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    const stationGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[stationIndex];
    fireEvent.click(stationGroup!);

    const label = screen.getByTestId('sld-v2-detail-drawer-label');
    expect(label.textContent).toBeTruthy();
    expect(label.textContent).not.toBe('');
  });

  it('(b) Escape zamyka drawer (zachowanie wbudowane w SldDetailDrawer, K30-88, reużyte bez zmian)', () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'station');
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    const stationGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[stationIndex];
    fireEvent.click(stationGroup!);
    expect(screen.getByTestId('sld-v2-detail-drawer-label')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByTestId('sld-v2-detail-drawer-label')).toBeNull();
  });

  it('(c) klik w element bez danych drawera (np. odcinek "segment") NIE otwiera pustego drawera — uczciwy brak, nie crash', () => {
    const scene = buildSceneV3(enm, 0);
    const segmentIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'apparatus' || s.meta?.elementKind === 'transformer');
    expect(segmentIndex).toBeGreaterThanOrEqual(0);

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    const group = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[segmentIndex];
    expect(() => fireEvent.click(group!)).not.toThrow();

    expect(screen.queryByTestId('sld-v2-detail-drawer-label')).toBeNull();
  });
});
