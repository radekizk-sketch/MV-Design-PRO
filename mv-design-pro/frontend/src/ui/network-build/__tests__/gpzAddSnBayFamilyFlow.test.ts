import { describe, expect, it } from 'vitest';

import type { ContextMenuHandlers } from '../contextMenuIntegration';
import { buildContextMenuForElement } from '../contextMenuIntegration';
import { getOperationSurfaceByOp } from '../../topology/modals/operationSurfaceRegistry';
import { SCREEN_MATRIX, SCREEN_TRANSITIONS } from '../../workspace/types';

function makeHandlers(): ContextMenuHandlers {
  const noop = () => undefined;
  return {
    onOpenOperationForm: noop,
    onOpenObjectCard: noop,
    onSelectElement: noop,
    onCenterOnElement: noop,
    onDeleteElement: noop,
    onCatalogRequired: noop,
  };
}

describe('canonical GPZ -> add SN bay -> choose family flow', () => {
  it('keeps segment creation unreachable from GPZ creation until the SN bay step', () => {
    const sourceActions = buildContextMenuForElement(
      {
        elementId: 'src-gpz-1',
        elementType: 'Source',
        elementName: 'GPZ Glowny',
        mode: 'MODEL_EDIT',
      },
      makeHandlers(),
    ) ?? [];

    expect(getOperationSurfaceByOp('add_grid_source_sn')?.screenCode).toBe('E-10');
    expect(SCREEN_TRANSITIONS['E-10'].allowedOpenTargets).toEqual(['E-11']);
    expect(SCREEN_TRANSITIONS['E-10'].allowedOpenTargets).not.toContain('E-12');
    expect(sourceActions.some((action) => action.id === 'continue_trunk_segment_sn')).toBe(false);
    expect(sourceActions.some((action) => action.id === 'start_branch_segment_sn')).toBe(false);
    expect(
      sourceActions.some((action) =>
        (action.actionKey ?? '').includes('branch') || (action.actionKey ?? '').includes('segment'),
      ),
    ).toBe(false);
  });

  it('routes the canonical GPZ continuation through add_sn_bay before E-12', () => {
    expect(getOperationSurfaceByOp('add_sn_bay')?.screenCode).toBe('E-11');
    expect(SCREEN_TRANSITIONS['E-11'].allowedOpenTargets).toContain('E-12');
    expect(SCREEN_TRANSITIONS['E-12'].allowedOpenFrom).toContain('E-11');
  });

  it('forces E-12 to choose only kabel SN or linia napowietrzna SN', () => {
    expect(getOperationSurfaceByOp('continue_trunk_segment_sn')?.screenCode).toBe('E-12');
    expect(SCREEN_MATRIX['E-12'].allowedTabIds).toEqual(['kabel-sn', 'linia-napowietrzna-sn']);
    expect(SCREEN_MATRIX['E-12'].defaultTabId).toBe('kabel-sn');
    expect(SCREEN_MATRIX['E-12'].prerequisiteCodes).toEqual(['E-11']);
    expect(SCREEN_TRANSITIONS['E-12'].allowedOpenFrom).toContain('E-11');
  });
});
