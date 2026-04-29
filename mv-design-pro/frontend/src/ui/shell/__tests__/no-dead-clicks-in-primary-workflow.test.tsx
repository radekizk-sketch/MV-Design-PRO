/**
 * no-dead-clicks-in-primary-workflow
 *
 * Weryfikuje, że kluczowe przyciski pierwotnego przepływu pracy
 * są podpięte pod konkretne akcje i nie są martwymi kliknięciami.
 *
 * Sprawdza kontrakty przycisków w TopBar:
 * - Oblicz → onCalculate callback
 * - Wyniki → onViewResults callback
 * - Przypadek → nawigacja do case-config
 * - Wariant → nawigacja do variants
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../app-state/store', () => ({
  useAppStateStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      activeWorkMode: 'TE',
      setActiveWorkMode: vi.fn(),
      activeCaseName: 'Przypadek SC-1',
      activeCaseId: 'case-sc-1',
      activeVariantName: 'Bazowy',
      activeSnapshotId: null,
      activeProjectName: 'Projekt testowy',
      activeCaseResultStatus: 'NONE',
    }),
}));

vi.mock('../../navigation/routes', () => ({
  navigateToCaseConfig: vi.fn(),
  navigateToVariants: vi.fn(),
}));

import { navigateToCaseConfig, navigateToVariants } from '../../navigation/routes';
import { TopBar } from '../TopBar';

describe('no dead clicks in primary workflow — TopBar', () => {
  it('Oblicz button calls onCalculate', () => {
    const onCalculate = vi.fn();
    render(<TopBar onCalculate={onCalculate} />);

    const btn = screen.getByTestId('top-bar-calculate');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onCalculate).toHaveBeenCalledOnce();
  });

  it('Wyniki button calls onViewResults', () => {
    const onViewResults = vi.fn();
    render(<TopBar onViewResults={onViewResults} />);

    const btn = screen.getByTestId('top-bar-results');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onViewResults).toHaveBeenCalledOnce();
  });

  it('Przypadek button navigates to case-config', () => {
    render(<TopBar />);

    const btn = screen.getByTestId('ctx-przypadek');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(navigateToCaseConfig).toHaveBeenCalled();
  });

  it('Wariant button navigates to variants', () => {
    render(<TopBar />);

    const btn = screen.getByTestId('ctx-wariant');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(navigateToVariants).toHaveBeenCalled();
  });

  it('work-mode-switcher renders all 6 mode buttons', () => {
    render(<TopBar />);

    const switcher = screen.getByTestId('work-mode-switcher');
    expect(switcher).toBeInTheDocument();
    const modes = ['TE', 'TW', 'TZ', 'TP', 'TA', 'TN'];
    for (const mode of modes) {
      expect(screen.getByTestId(`work-mode-${mode}`)).toBeInTheDocument();
    }
  });

  it('top-bar testid is always present', () => {
    render(<TopBar />);
    expect(screen.getByTestId('top-bar-v12')).toBeInTheDocument();
  });
});
