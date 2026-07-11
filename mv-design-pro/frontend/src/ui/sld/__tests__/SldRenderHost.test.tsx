/**
 * F8a — testy `SldRenderHost` (cutover): domyślnie v3 (data-testid
 * `sld-canvas-v3-workspace`), fallback v2 (`sld-workspace-container`) za
 * flagą localStorage — bez potrzeby rebuildu.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { SldRenderHost } from '../SldRenderHost';
import { SLD_RENDER_VERSION_STORAGE_KEY } from '../sldRenderVersion';
import { useSnapshotStore } from '../../topology/snapshotStore';

afterEach(() => {
  cleanup();
  localStorage.removeItem(SLD_RENDER_VERSION_STORAGE_KEY);
});

beforeEach(() => {
  useSnapshotStore.getState().reset();
});

describe('SldRenderHost — F8a cutover', () => {
  it('domyślnie (brak override) renderuje v3 (SldCanvasV3Workspace)', () => {
    const { container } = render(<SldRenderHost width={800} height={600} />);
    expect(container.querySelector('[data-testid="sld-canvas-v3-workspace"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-workspace-container"]')).toBeNull();
  });

  it('override localStorage="v2" renderuje fallback v2 (SldWorkspaceContainer)', () => {
    localStorage.setItem(SLD_RENDER_VERSION_STORAGE_KEY, 'v2');
    const { container } = render(<SldRenderHost width={800} height={600} />);
    expect(container.querySelector('[data-testid="sld-workspace-container"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-canvas-v3-workspace"]')).toBeNull();
  });

  it('override localStorage="v3" jest jawnym potwierdzeniem v3 (identycznie jak domyślne)', () => {
    localStorage.setItem(SLD_RENDER_VERSION_STORAGE_KEY, 'v3');
    const { container } = render(<SldRenderHost width={800} height={600} />);
    expect(container.querySelector('[data-testid="sld-canvas-v3-workspace"]')).toBeTruthy();
  });
});
