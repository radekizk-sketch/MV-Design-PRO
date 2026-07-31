/**
 * F8c pkt 2 / F11.4-B (ARCH-4, spec §10.1 „pełna migracja budowniczych
 * danych drawera") — testy drawera szczegółów elementu na kanwie v3.
 * Wzorzec fixture/setup identyczny jak `sldCanvasV3Workspace.test.tsx`
 * (F8a) — TA SAMA sieć testowa. Zakres v3 dziś: `station`/`transformer`/
 * `apparatus` (patrz `shared/detailDrawerData.ts` i
 * `SldCanvasV3Workspace.tsx::elementKindForDrawer` dla udokumentowanego
 * zakresu i luk pozostałych `elementKind`).
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

describe('SldCanvasV3Workspace — F8c pkt 2 / F11.4-B: drawer szczegółów (SldDetailDrawer)', () => {
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

  it('(c) klik w transformator otwiera drawer transformatora (F11.4-B: resolveTransformerRefForBayOwner)', () => {
    // KD-5: symbol transformatora istnieje od L1 — na L0 stacje są zwinięte do
    // mini-RMU, a blok GPZ do sylwetki zbiorczej (TR niesie sylwetka). LOD2
    // wymuszony `lodOverride` — TEN SAM wzorzec co przypadek (e) niżej. Węzeł
    // szukany po realnym `data-testid` sceny (nie po indeksie dzieci DOM),
    // żeby test nie zależał od kolejności symboli.
    const scene = buildSceneV3(enm, 2);
    const transformer = scene.symbols.find((s) => s.meta?.elementKind === 'transformer');
    expect(transformer, 'symbol transformatora obecny na L2').toBeTruthy();

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    const group = container.querySelector(`[data-testid="${transformer!.meta!.testId}"]`);
    expect(group).toBeTruthy();
    fireEvent.click(group!);

    const label = screen.getByTestId('sld-v2-detail-drawer-label');
    expect(label.textContent).toBeTruthy();
    expect(label.textContent).not.toBe('');
  });

  it('(d) klik w aparat otwiera drawer aparatu (F11.4-B: buildDetailDrawerDataForKind(\'apparatus\', bayRef, ...))', () => {
    const scene = buildSceneV3(enm, 0);
    const apparatusIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'apparatus');
    expect(apparatusIndex).toBeGreaterThanOrEqual(0);

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    const group = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[apparatusIndex];
    fireEvent.click(group!);

    const label = screen.getByTestId('sld-v2-detail-drawer-label');
    expect(label.textContent).toBeTruthy();
    expect(label.textContent).not.toBe('');
  });

  it('(e) budowniczy zwracający null nie otwiera drawera — klik w DER (elementKind=\'der\', UDOKUMENTOWANA LUKA) nie crashuje i nie otwiera pustego drawera', () => {
    // LOD2 wymuszony przez `lodOverride` (escape hatch testowy, patrz
    // `SldCanvasV3WorkspaceProps.lodOverride` docstring) — symbole `der` są
    // widoczne dopiero na L1/L2 (rozwinięte pole stacji), LOD0 renderuje
    // WYŁĄCZNIE skolapsowane stacje/GPZ.
    const scene = buildSceneV3(enm, 2);
    const derIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'der');
    expect(derIndex).toBeGreaterThanOrEqual(0);

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    const group = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[derIndex];
    expect(() => fireEvent.click(group!)).not.toThrow();

    expect(screen.queryByTestId('sld-v2-detail-drawer-label')).toBeNull();
  });
});
