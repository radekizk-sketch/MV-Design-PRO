/**
 * Tests for StatusBarV12 — V12 dolny pasek statusu.
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StatusBarV12 } from '../StatusBarV12';
import { useAppStateStore } from '../../app-state/store';

describe('StatusBarV12 — pasek statusu V12', () => {
  beforeEach(() => {
    act(() => {
      const store = useAppStateStore.getState();
      store.setActiveArea('MO');
      store.setActiveWorkMode('TE');
      store.setActiveProject(null);
      store.setActiveCase(null);
      store.setActiveSnapshot(null);
      store.setActiveRun(null);
    });
  });

  afterEach(() => {
    act(() => {
      const store = useAppStateStore.getState();
      store.setActiveArea('MO');
      store.setActiveWorkMode('TE');
    });
  });

  it('renderuje status-bar-v12 i status-area-mode', () => {
    render(<StatusBarV12 />);
    expect(screen.getByTestId('status-bar-v12')).toBeInTheDocument();
    expect(screen.getByTestId('status-area-mode')).toBeInTheDocument();
  });

  it('pokazuje aktywny obszar i tryb pracy w status-area-mode', () => {
    act(() => {
      useAppStateStore.getState().setActiveArea('AN');
      useAppStateStore.getState().setActiveWorkMode('TW');
    });
    render(<StatusBarV12 />);
    expect(screen.getByTestId('status-area-mode')).toHaveTextContent('Studia / Wyniki');
  });

  it('pokazuje status walidacji (valid/warnings/errors)', () => {
    const { rerender } = render(<StatusBarV12 validationStatus="valid" />);
    expect(screen.getByTestId('status-validation')).toBeInTheDocument();

    rerender(<StatusBarV12 validationStatus="warnings" validationWarnings={3} />);
    expect(screen.getByTestId('status-validation')).toBeInTheDocument();
    expect(screen.getByTestId('status-validation').textContent).toMatch(/3/);

    rerender(<StatusBarV12 validationStatus="errors" validationErrors={2} />);
    expect(screen.getByTestId('status-validation').textContent).toMatch(/2/);
  });

  it('pokazuje liczniki sieci', () => {
    render(<StatusBarV12 networkStats={{ nodeCount: 42, branchCount: 17 }} />);
    expect(screen.getByTestId('status-network')).toBeInTheDocument();
    expect(screen.getByTestId('status-network').textContent).toMatch(/42/);
    expect(screen.getByTestId('status-network').textContent).toMatch(/17/);
  });
});
