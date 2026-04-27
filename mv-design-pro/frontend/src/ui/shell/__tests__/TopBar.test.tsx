/**
 * Tests for TopBar — V12 tryby pracy + kontekst.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../navigation/routes', () => ({
  navigateToCaseConfig: vi.fn(),
  navigateToVariants: vi.fn(),
}));

import { TopBar } from '../TopBar';
import { useAppStateStore } from '../../app-state/store';

const WORK_MODES = ['TE', 'TW', 'TZ', 'TP', 'TA', 'TN'] as const;
const F_KEYS = ['F2', 'F3', 'F4', 'F5', 'F6', 'F7'] as const;

describe('TopBar — tryby pracy V12', () => {
  beforeEach(() => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
    });
  });

  afterEach(() => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
    });
  });

  it('renderuje 6 trybów pracy', () => {
    render(<TopBar projectName="Test" />);
    expect(screen.getByTestId('top-bar-v12')).toBeInTheDocument();
    expect(screen.getByTestId('work-mode-switcher')).toBeInTheDocument();
    for (const mode of WORK_MODES) {
      expect(screen.getByTestId(`work-mode-${mode}`)).toBeInTheDocument();
    }
  });

  it('pokazuje kontekstową trójkę (Przypadek/Wariant/Migawka)', () => {
    render(<TopBar projectName="Test" />);
    expect(screen.getByTestId('context-triple')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-przypadek')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-wariant')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-migawka')).toBeInTheDocument();
  });

  it('klik w TZ aktywuje tryb zabezpieczeń', () => {
    render(<TopBar projectName="Test" />);
    act(() => {
      fireEvent.click(screen.getByTestId('work-mode-TZ'));
    });
    expect(useAppStateStore.getState().activeWorkMode).toBe('TZ');
  });

  it('F4 aktywuje tryb TZ', () => {
    render(<TopBar projectName="Test" />);
    act(() => {
      fireEvent.keyDown(window, { key: 'F4' });
    });
    expect(useAppStateStore.getState().activeWorkMode).toBe('TZ');
  });

  it.each(WORK_MODES.map((mode, idx) => [F_KEYS[idx], mode]))(
    '%s aktywuje tryb %s',
    (key, mode) => {
      render(<TopBar projectName="Test" />);
      act(() => {
        fireEvent.keyDown(window, { key });
      });
      expect(useAppStateStore.getState().activeWorkMode).toBe(mode);
    },
  );

  it('F4 z Ctrl NIE zmienia trybu', () => {
    render(<TopBar projectName="Test" />);
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
    });
    act(() => {
      fireEvent.keyDown(window, { key: 'F4', ctrlKey: true });
    });
    expect(useAppStateStore.getState().activeWorkMode).toBe('TE');
  });

  it('aktywny tryb ma aria-pressed=true', () => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TW');
    });
    render(<TopBar projectName="Test" />);
    expect(screen.getByTestId('work-mode-TW')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('work-mode-TE')).toHaveAttribute('aria-pressed', 'false');
  });

  it('przycisk Oblicz wywołuje onCalculate', () => {
    const onCalculate = vi.fn();
    render(<TopBar projectName="Test" onCalculate={onCalculate} />);
    act(() => {
      fireEvent.click(screen.getByTestId('top-bar-calculate'));
    });
    expect(onCalculate).toHaveBeenCalled();
  });

  it('TE→TW synchronizuje legacy activeMode (MODEL_EDIT→RESULT_VIEW)', () => {
    render(<TopBar projectName="Test" />);
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
    });
    expect(useAppStateStore.getState().activeMode).toBe('MODEL_EDIT');
    act(() => {
      fireEvent.click(screen.getByTestId('work-mode-TW'));
    });
    expect(useAppStateStore.getState().activeMode).toBe('RESULT_VIEW');
  });
});
