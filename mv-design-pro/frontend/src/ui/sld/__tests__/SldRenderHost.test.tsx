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

describe('SldRenderHost — F8b-1 D: pomost split-preview (polityka zero regresji)', () => {
  const mockPreviewState = {
    kind: 'preview_ready' as const,
    segment: { segmentRef: 'SEG-1', segmentType: 'cable' as const, lengthKm: 3.8, busFromRef: 'B1', busToRef: 'B2' },
    insertAt: { mode: 'RATIO' as const, value: 0.4 },
    insertedKind: 'station' as const,
    preview: {
      insertedStationId: 'STA-NEW',
      stationType: 'ZKSN',
      electricalImpact: {
        topologyTypeChanged: false,
        affectedObjectRefs: [],
        halves: { firstSegmentId: null, secondSegmentId: null, firstLengthKm: 1.52, secondLengthKm: 2.28, splitRatio: 0.4 },
        catalogInheritance: { sourceSegmentRef: null, sourceCatalogRef: null, firstInherits: true, secondInherits: true, rule: 'inherit_both' },
        invalidatedResults: [],
        affectedProofPacks: [],
        missingDataAfter: [],
        affectedBuses: [],
      },
    },
  };

  it('splitPreviewState AKTYWNY → host renderuje v2 (SldWorkspaceContainer) NIEZALEŻNIE od domyślnej v3', () => {
    const { container } = render(<SldRenderHost width={800} height={600} splitPreviewState={mockPreviewState} />);
    expect(container.querySelector('[data-testid="sld-workspace-container"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-canvas-v3-workspace"]')).toBeNull();
    // Panel podglądu MUSI faktycznie się wyrenderować — dowód, że funkcja
    // Conscious Split (v2) jest w pełni dostępna przez host, nie tylko
    // przekazywana bez efektu.
    expect(container.querySelector('[data-testid="split-preview-panel"]')).toBeTruthy();
  });

  it('splitPreviewState wraca do null → host wraca do v3 (domyślna ścieżka)', () => {
    const { container, rerender } = render(
      <SldRenderHost width={800} height={600} splitPreviewState={mockPreviewState} />,
    );
    expect(container.querySelector('[data-testid="sld-workspace-container"]')).toBeTruthy();

    rerender(<SldRenderHost width={800} height={600} splitPreviewState={null} />);
    expect(container.querySelector('[data-testid="sld-canvas-v3-workspace"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-workspace-container"]')).toBeNull();
  });

  it('override localStorage="v2" + splitPreviewState=null → v2 (flaga sama wystarcza, pomost nie jest jedyną ścieżką do v2)', () => {
    localStorage.setItem(SLD_RENDER_VERSION_STORAGE_KEY, 'v2');
    const { container } = render(<SldRenderHost width={800} height={600} splitPreviewState={null} />);
    expect(container.querySelector('[data-testid="sld-workspace-container"]')).toBeTruthy();
  });
});
