/**
 * Tests for the compact V12 top bar.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../navigation/routes', () => ({
  navigateToCaseConfig: vi.fn(),
  navigateToVariants: vi.fn(),
}));

import { TopBar } from '../TopBar';
import { useAppStateStore } from '../../app-state/store';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { makeCalculationReadySnapshot } from '../../../test/enmCalculationSnapshot';

const WORK_MODES = ['TE', 'TW', 'TZ', 'TP', 'TA', 'TN'] as const;
const F_KEYS = ['F2', 'F3', 'F4', 'F5', 'F6', 'F7'] as const;

describe('TopBar - compact V12 chrome', () => {
  beforeEach(() => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
      useSnapshotStore.getState().reset();
    });
  });

  afterEach(() => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
      useAppStateStore.getState().setActiveCase(null);
      useSnapshotStore.getState().reset();
    });
  });

  it('renders compact project context and primary actions', () => {
    render(<TopBar projectName="Sieć SN Zachód" />);

    expect(screen.getByTestId('top-bar-v12')).toBeInTheDocument();
    expect(screen.getByTestId('context-triple')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-project')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-wariant')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-przypadek')).toBeInTheDocument();
    expect(screen.queryByTestId('ctx-migawka')).not.toBeInTheDocument();
    expect(screen.getByTestId('top-bar-calculate')).toHaveTextContent('Sprawdź braki');
    expect(screen.getByTestId('top-bar-overlay')).toHaveTextContent('Nakładka');
    expect(screen.getByTestId('top-bar-results')).toHaveTextContent('Analizy');
    expect(screen.getByTestId('top-bar-export')).toHaveTextContent('Eksport');
    expect(screen.getByTestId('top-bar-settings')).toBeInTheDocument();
    expect(screen.queryByTestId('work-mode-switcher')).not.toBeInTheDocument();
  });

  it.each(WORK_MODES.map((mode, idx) => [F_KEYS[idx], mode]))(
    '%s keeps keyboard work-mode access and activates %s',
    (key, mode) => {
      render(<TopBar projectName="Test" />);
      act(() => {
        fireEvent.keyDown(window, { key });
      });
      expect(useAppStateStore.getState().activeWorkMode).toBe(mode);
    },
  );

  it('F4 with Ctrl does not change work mode', () => {
    render(<TopBar projectName="Test" />);
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
    });
    act(() => {
      fireEvent.keyDown(window, { key: 'F4', ctrlKey: true });
    });
    expect(useAppStateStore.getState().activeWorkMode).toBe('TE');
  });

  it('Oblicz calls onCalculate', () => {
    const onCalculate = vi.fn();
    act(() => {
      useAppStateStore.getState().setActiveCase('case-1', 'Zwarcie maksymalne IEC 60909', 'ShortCircuitCase', 'NONE');
      useSnapshotStore.setState({ snapshot: makeCalculationReadySnapshot() });
    });
    render(<TopBar projectName="Test" onCalculate={onCalculate} />);
    act(() => {
      fireEvent.click(screen.getByTestId('top-bar-calculate'));
    });
    expect(onCalculate).toHaveBeenCalledOnce();
  });

  it('Nakładka switches to result overlay mode and opens results', () => {
    const onViewResults = vi.fn();
    render(<TopBar projectName="Test" onViewResults={onViewResults} />);

    act(() => {
      fireEvent.click(screen.getByTestId('top-bar-overlay'));
    });

    expect(useAppStateStore.getState().activeWorkMode).toBe('TW');
    expect(onViewResults).toHaveBeenCalledOnce();
  });

  it('Analizy opens the results/analysis surface', () => {
    const onViewResults = vi.fn();
    render(<TopBar projectName="Test" onViewResults={onViewResults} />);

    act(() => {
      fireEvent.click(screen.getByTestId('top-bar-results'));
    });

    expect(useAppStateStore.getState().activeWorkMode).toBe('TA');
    expect(onViewResults).toHaveBeenCalledOnce();
  });
});
