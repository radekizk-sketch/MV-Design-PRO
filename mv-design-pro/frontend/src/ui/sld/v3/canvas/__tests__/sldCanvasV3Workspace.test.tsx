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
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';

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
    // id = prefiks testId przed '#' (dla aparatury) lub cały testId (L0/NOP).
    const expectedId = testId.includes('#') ? testId.split('#')[0] : testId;
    expect(selected?.id).toBe(expectedId);
    expect(selected?.type).toBe('DescriptiveElement');
  });
});
