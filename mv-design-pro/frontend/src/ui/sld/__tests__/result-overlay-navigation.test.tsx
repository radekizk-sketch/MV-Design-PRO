import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAppStateStore } from '../../app-state/store';
import { WynikiContextPanel } from '../../shell/context-panels/WynikiContextPanel';

describe('result-overlay-navigation - wyniki i uzasadnienie', () => {
  it('klik nakładki wynikowej aktywuje widok wynikowy, a uzasadnienie prowadzi do raportów', () => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
      useAppStateStore.getState().setActiveArea('WYNIKI_ANALIZY');
    });

    render(<WynikiContextPanel />);

    act(() => {
      fireEvent.click(screen.getByTestId('wyniki-action-show-overlays'));
    });
    expect(useAppStateStore.getState().activeWorkMode).toBe('TW');

    act(() => {
      fireEvent.click(screen.getByTestId('wyniki-action-proof'));
    });
    expect(useAppStateStore.getState().activeArea).toBe('RAPORTY_UZASADNIENIA');
  });
});
