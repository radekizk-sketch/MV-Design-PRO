/**
 * no-dead-clicks-in-primary-workflow
 *
 * Verifies that primary top-bar controls are wired to concrete actions.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../app-state/store', () => ({
  useAppStateStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      activeWorkMode: 'TE',
      setActiveWorkMode: vi.fn(),
      activeCaseName: 'Zwarcie maksymalne IEC 60909',
      activeCaseId: 'case-sc-1',
      activeVariantName: 'Stan projektowany 2026',
      activeSnapshotId: null,
      activeProjectName: 'Projekt testowy',
      activeCaseResultStatus: 'NONE',
    }),
  useCanCalculate: () => ({ allowed: true, reason: null }),
}));

vi.mock('../../navigation/routes', () => ({
  navigateToCaseConfig: vi.fn(),
  navigateToVariants: vi.fn(),
}));

vi.mock('../../history/hooks', () => ({
  useHistoryState: () => ({
    undo: { execute: vi.fn(), isEnabled: false, tooltip: 'Cofnij ostatnią operację' },
    redo: { execute: vi.fn(), isEnabled: false, tooltip: 'Ponów ostatnią cofniętą operację' },
  }),
}));

import { navigateToCaseConfig, navigateToVariants } from '../../navigation/routes';
import { TopBar } from '../TopBar';

describe('no dead clicks in primary workflow - TopBar', () => {
  it('Oblicz button calls onCalculate', () => {
    const onCalculate = vi.fn();
    render(<TopBar onCalculate={onCalculate} />);

    fireEvent.click(screen.getByTestId('top-bar-calculate'));

    expect(onCalculate).toHaveBeenCalledOnce();
  });

  it('Analizy button calls onViewResults', () => {
    const onViewResults = vi.fn();
    render(<TopBar onViewResults={onViewResults} />);

    fireEvent.click(screen.getByTestId('top-bar-results'));

    expect(onViewResults).toHaveBeenCalledOnce();
  });

  it('Nakładka button calls onViewResults', () => {
    const onViewResults = vi.fn();
    render(<TopBar onViewResults={onViewResults} />);

    fireEvent.click(screen.getByTestId('top-bar-overlay'));

    expect(onViewResults).toHaveBeenCalledOnce();
  });

  it('Obliczenia button navigates to case-config', () => {
    render(<TopBar />);

    fireEvent.click(screen.getByTestId('ctx-przypadek'));

    expect(navigateToCaseConfig).toHaveBeenCalled();
  });

  it('Stan projektu button navigates to variants', () => {
    render(<TopBar />);

    fireEvent.click(screen.getByTestId('ctx-wariant'));

    expect(navigateToVariants).toHaveBeenCalled();
  });

  it('Eksport and settings are wired to menu actions', () => {
    const onMenuAction = vi.fn();
    render(<TopBar onMenuAction={onMenuAction} />);

    fireEvent.click(screen.getByTestId('top-bar-export'));
    fireEvent.click(screen.getByTestId('top-bar-settings'));

    expect(onMenuAction).toHaveBeenCalledWith('export');
    expect(onMenuAction).toHaveBeenCalledWith('settings');
  });

  it('top-bar testid is always present', () => {
    render(<TopBar />);
    expect(screen.getByTestId('top-bar-v12')).toBeInTheDocument();
  });
});
