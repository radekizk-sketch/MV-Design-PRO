/** Odbiór zachowania: sterowanie CAD naprawdę zmienia widok istniejącej kanwy. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (JSON.parse(readFileSync(resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
), 'utf8')) as { enm: EnergyNetworkModel }).enm;

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
});
afterEach(() => cleanup());

describe('SldCanvasV3Workspace — nawigacja po rzeczywistych stacjach CAD', () => {
  it('Szczegóły CAD otwiera L2 i pozwala przechodzić przez rzeczywiste stacje', () => {
    useSnapshotStore.setState({ snapshot: enm });
    const { container } = render(<SldCanvasV3Workspace width={1600} height={900} />);
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]');
    const start = container.querySelector<HTMLButtonElement>('[data-testid="sld-v3-cad-station-start"]');
    expect(start).not.toBeNull();
    expect(start!.disabled).toBe(false);
    fireEvent.click(start!);
    const nav = container.querySelector('[data-testid="sld-v3-cad-station-nav"]');
    expect(nav).not.toBeNull();
    expect(svg?.getAttribute('data-scene-lod')).toBe('2');
    const select = container.querySelector<HTMLSelectElement>('[data-testid="sld-v3-cad-station-select"]')!;
    expect(select.options.length).toBeGreaterThan(10);
    const first = select.value;
    fireEvent.click(container.querySelector('[data-testid="sld-v3-cad-next"]')!);
    expect(select.value).not.toBe(first);
    expect(container.querySelector('[data-testid="sld-v3-cad-page-counter"]')?.textContent)
      .toContain('2/');
    fireEvent.click(container.querySelector('[data-testid="sld-v3-cad-exit"]')!);
    expect(container.querySelector('[data-testid="sld-v3-cad-station-nav"]')).toBeNull();
  });
});
