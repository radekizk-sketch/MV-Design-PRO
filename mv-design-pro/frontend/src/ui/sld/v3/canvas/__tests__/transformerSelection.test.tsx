/**
 * §16-v3 / adaptacja flex (2026-07-17): klik w TRANSFORMATOR stacji na
 * kanwie v3 (fixtura `openTrunkChain.enm.json` — realny backend: GPZ +
 * 2 segmenty + stacja) ustawia selekcję globalną na REALNY ref
 * transformatora (`resolveTransformerRefForOwnerRef` — ta sama
 * rozdzielczość co drawer), typ 'TransformerBranch' — fundament
 * `InspectorEngineeringView` (panel selekcji w CanonicalLayoutV3).
 * Wzorzec harnessu identyczny jak `detailDrawer.test.tsx`.
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
const fixturePath = resolve(here, '..', '..', 'scene', '__tests__', 'fixtures', 'openTrunkChain.enm.json');
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useSnapshotStore.setState({ snapshot: enm });
});

describe('SldCanvasV3Workspace — selekcja transformatora stacji (adaptacja flex)', () => {
  it('klik w symbol transformatora STACJI ustawia selectedElements[0] = realny ref transformatora + otwiera drawer', () => {
    const { container } = render(<SldCanvasV3Workspace width={1600} height={1000} />);
    const group = container.querySelector(
      '[data-testid="sld-v3-symbols"] g[data-element-kind="transformer"][data-owner-ref^="stn/"]',
    );
    expect(group, 'symbol transformatora stacji musi istnieć w DOM (data-element-kind/data-owner-ref)').toBeTruthy();
    fireEvent.click(group!);

    const selected = useSelectionStore.getState().selectedElements[0];
    expect(selected).toBeTruthy();
    expect(selected!.type).toBe('TransformerBranch');
    const expectedRef = (enm.transformers ?? []).find((t) => t.ref_id?.startsWith('stn/'))?.ref_id;
    expect(expectedRef).toBeTruthy();
    expect(selected!.id).toBe(expectedRef);
    expect(screen.getByTestId('sld-v2-detail-drawer-label')).toBeTruthy();
  });
});
