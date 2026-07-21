/**
 * Test hooka pętli decyzji (F-E6.1): usePoprawWModelu prowadzi z wyniku wprost
 * do miejsca decyzji — zaznacza element, centruje SLD i przechodzi do „Schemat".
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useSelectionStore } from '../../../../ui/selection/store';
import { useShellStore } from '../../../shell/useShellStore';
import { usePoprawWModelu } from '../usePoprawWModelu';

describe('usePoprawWModelu — od wyniku do decyzji', () => {
  beforeEach(() => {
    useSelectionStore.getState().clearSelection?.();
    useSelectionStore.setState({ selectedElement: null, sldCenterOnElement: null } as never);
    useShellStore.setState({ activeSpace: 'wyniki' });
  });

  it('zaznacza element (property-grid), centruje SLD i przechodzi do przestrzeni „Schemat"', () => {
    const { result } = renderHook(() => usePoprawWModelu());
    act(() => result.current('szyna-1', 'Bus', 'Szyna GPZ'));

    const sel = useSelectionStore.getState();
    expect(sel.selectedElement).toEqual({ id: 'szyna-1', type: 'Bus', name: 'Szyna GPZ' });
    expect(sel.sldCenterOnElement).toBe('szyna-1');
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });

  it('gałąź: typ LineBranch przekazany do selekcji', () => {
    const { result } = renderHook(() => usePoprawWModelu());
    act(() => result.current('galaz-7', 'LineBranch', 'Odcinek SN'));
    expect(useSelectionStore.getState().selectedElement?.type).toBe('LineBranch');
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });
});
