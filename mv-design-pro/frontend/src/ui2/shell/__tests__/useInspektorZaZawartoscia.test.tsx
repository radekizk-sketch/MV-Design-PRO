/*
 * K11-A — automat inspektora „za zawartością": panel prawy otwiera się, gdy
 * LegacyInspektor ma realną treść (selekcja albo powierzchnia panelowa),
 * a zwija, gdy treści nie ma; ręczne przełączenie MIĘDZY zmianami sygnału
 * jest respektowane (automat działa wyłącznie na zmianę zawartości).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../../ui/selection/store';
import { useShellStore } from '../useShellStore';
import { useInspektorZaZawartoscia } from '../useInspektorZaZawartoscia';

function prawyZwiniety(): boolean {
  return useShellStore.getState().getLayout(useShellStore.getState().activeSpace).rightCollapsed;
}

beforeEach(() => {
  useShellStore.setState({ layoutBySpace: {}, activeSpace: 'schemat' });
  useSelectionStore.getState().selectElement(null);
  useNetworkBuildStore.setState({ activeSurface: null } as never);
});
afterEach(() => {
  useSelectionStore.getState().selectElement(null);
  useNetworkBuildStore.setState({ activeSurface: null } as never);
});

describe('useInspektorZaZawartoscia (K11-A)', () => {
  it('bez zawartości inspektor startuje ZWINIĘTY (także przy stanie zapisanym sprzed K11-A)', () => {
    // Stan zapisany sprzed dyrektywy: panel otwarty mimo braku treści.
    useShellStore.setState({
      layoutBySpace: {
        schemat: { leftWidth: 240, rightWidth: 320, leftCollapsed: false, rightCollapsed: false },
      },
    });
    renderHook(() => useInspektorZaZawartoscia());
    expect(prawyZwiniety()).toBe(true);
  });

  it('selekcja elementu ROZWIJA panel; zdjęcie selekcji zwija', () => {
    renderHook(() => useInspektorZaZawartoscia());
    expect(prawyZwiniety()).toBe(true);

    act(() => {
      useSelectionStore.getState().selectElement({ id: 'bus-1', type: 'bus' } as never);
    });
    expect(prawyZwiniety()).toBe(false);

    act(() => {
      useSelectionStore.getState().selectElement(null);
    });
    expect(prawyZwiniety()).toBe(true);
  });

  it('powierzchnia panelowa (formularz operacji) rozwija panel', () => {
    renderHook(() => useInspektorZaZawartoscia());
    act(() => {
      useNetworkBuildStore.setState({
        activeSurface: { openMode: 'replace_right_panel' },
      } as never);
    });
    expect(prawyZwiniety()).toBe(false);

    act(() => {
      useNetworkBuildStore.setState({ activeSurface: null } as never);
    });
    expect(prawyZwiniety()).toBe(true);
  });

  it('ręczne przełączenie między zmianami sygnału jest respektowane', () => {
    renderHook(() => useInspektorZaZawartoscia());
    act(() => {
      useSelectionStore.getState().selectElement({ id: 'bus-1', type: 'bus' } as never);
    });
    expect(prawyZwiniety()).toBe(false);

    // Użytkownik zwija ręcznie przy TEJ SAMEJ selekcji — automat nie walczy.
    act(() => {
      useShellStore.getState().toggleRightCollapsed('schemat');
    });
    expect(prawyZwiniety()).toBe(true);

    // Dopiero ZMIANA sygnału (zdjęcie selekcji → nowa selekcja) wraca do automatu.
    act(() => {
      useSelectionStore.getState().selectElement(null);
    });
    act(() => {
      useSelectionStore.getState().selectElement({ id: 'bus-2', type: 'bus' } as never);
    });
    expect(prawyZwiniety()).toBe(false);
  });
});
