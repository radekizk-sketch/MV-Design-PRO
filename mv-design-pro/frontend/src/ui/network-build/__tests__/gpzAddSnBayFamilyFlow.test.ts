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
    expect(SCREEN_TRANSITIONS['E-10'].allowedOpenTargets).toEqual(['E-14']);
    expect(SCREEN_TRANSITIONS['E-10'].allowedOpenTargets).not.toContain('E-11');
    expect(sourceActions.some((action) => action.id === 'continue_trunk_segment_sn')).toBe(false);
    expect(sourceActions.some((action) => action.id === 'start_branch_segment_sn')).toBe(false);
    expect(
      sourceActions.some((action) =>
        (action.actionKey ?? '').includes('branch') || (action.actionKey ?? '').includes('segment'),
      ),
    ).toBe(false);
  });

  it('routes the canonical GPZ continuation through add_sn_bay and E-06 before E-11', () => {
    expect(getOperationSurfaceByOp('add_sn_bay')?.screenCode).toBe('E-14');
    expect(getOperationSurfaceByOp('continue_trunk_segment_sn')?.screenCode).toBe('E-06');
    expect(SCREEN_TRANSITIONS['E-14'].allowedOpenTargets).toContain('E-06');
    expect(SCREEN_TRANSITIONS['E-14'].allowedOpenTargets).not.toContain('E-11');
    expect(SCREEN_TRANSITIONS['E-06'].allowedOpenTargets).toEqual(['E-11']);
    expect(SCREEN_TRANSITIONS['E-11'].allowedOpenFrom).toContain('E-06');
  });

  it('forces E-06 and E-11 to keep only the canonical family step and family tabs', () => {
    expect(SCREEN_MATRIX['E-06'].allowedTabIds).toEqual(['wybor-rodziny']);
    expect(SCREEN_MATRIX['E-06'].defaultTabId).toBe('wybor-rodziny');
    expect(SCREEN_MATRIX['E-06'].prerequisiteCodes).toEqual(['E-14']);
    expect(SCREEN_MATRIX['E-11'].allowedTabIds).toEqual(['kabel-sn', 'linia-napowietrzna-sn']);
    expect(SCREEN_MATRIX['E-11'].defaultTabId).toBe('kabel-sn');
    expect(SCREEN_MATRIX['E-11'].prerequisiteCodes).toEqual(['E-06']);
    expect(SCREEN_TRANSITIONS['E-11'].allowedOpenFrom).toEqual(['E-06']);
  });
});
