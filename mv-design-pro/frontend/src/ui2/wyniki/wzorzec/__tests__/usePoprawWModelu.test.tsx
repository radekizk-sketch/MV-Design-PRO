/**
 * Test hooka pętli decyzji (F-E6.1 + K1 / F-E6.3): usePoprawWModelu prowadzi
 * z wyniku wprost do miejsca decyzji — bez rodzaju zachowanie 1:1 (selekcja +
 * zoom SLD + „Schemat"), z rodzajem wykonuje akcję z rejestru `akcjeNaprawcze`.
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
    useShellStore.setState({ activeSpace: 'wyniki', wynikiTab: null });
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

  it('rodzaj generyczny (napiecie): zachowanie identyczne jak bez rodzaju (1:1)', () => {
    const { result } = renderHook(() => usePoprawWModelu());
    act(() => result.current('szyna-1', 'Bus', 'Szyna GPZ', 'napiecie'));

    const sel = useSelectionStore.getState();
    expect(sel.selectedElement).toEqual({ id: 'szyna-1', type: 'Bus', name: 'Szyna GPZ' });
    expect(sel.sldCenterOnElement).toBe('szyna-1');
    expect(useShellStore.getState().activeSpace).toBe('schemat');
    expect(useShellStore.getState().wynikiTab).toBeNull();
  });

  it('rodzaj „bilans-biernej": akcja kontekstowa — selekcja + zakładka „kompensacja" przestrzeni „Wyniki" (bez zoomu SLD)', () => {
    const { result } = renderHook(() => usePoprawWModelu());
    act(() => result.current('slack', 'Bus', 'Szyna bilansująca', 'bilans-biernej'));

    const sel = useSelectionStore.getState();
    expect(sel.selectedElement).toEqual({ id: 'slack', type: 'Bus', name: 'Szyna bilansująca' });
    // Schemat nie jest celem — odroczony zoom SLD byłby zaskoczeniem.
    expect(sel.sldCenterOnElement).toBeNull();
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(useShellStore.getState().wynikiTab).toBe('kompensacja');
  });
});
