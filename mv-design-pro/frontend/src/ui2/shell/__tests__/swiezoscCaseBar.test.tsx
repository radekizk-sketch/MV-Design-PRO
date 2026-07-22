/*
 * Test realną ścieżką (karta K4/D1): powłoka AppShell + REALNE store'y
 * (useStudyCasesStore / useAppStateStore / useShellStore zasilone setState),
 * natywny fireEvent.click w znacznik świeżości paska aktywnego przypadku.
 * „Nieaktualne" → przejście do przestrzeni „Obliczenia"; „aktualne" → bez akcji.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppShell } from '../AppShell';
import { useShellStore } from '../useShellStore';
import { SHELL_STRINGS } from '../strings';
import { useAppStateStore } from '../../../ui/app-state';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import { studyCaseFixture } from '../../spaces/obliczenia/__tests__/fixtures';
import type { StudyCaseResultStatus } from '../../../ui/study-cases/types';

function ustawStan(status: StudyCaseResultStatus) {
  useAppStateStore.setState({
    activeProjectId: 'P-1',
    activeProjectName: 'Sieć SN Przykładowa',
    activeCaseId: 'K-1',
    activeCaseName: 'Zwarcia maks.',
  });
  useStudyCasesStore.setState({
    activeCase: studyCaseFixture('K-1', 'Zwarcia maks.', {
      result_status: status,
      results_valid: status === 'FRESH',
      is_active: true,
    }),
  });
}

beforeEach(() => {
  localStorage.clear();
  useShellStore.setState({
    activeSpace: 'projekt',
    advancementMode: 'basic',
    bottomPanelOpen: false,
    bottomPanelTab: 'problemy',
    layoutBySpace: {},
  });
});

afterEach(() => {
  useAppStateStore.setState({
    activeProjectId: null,
    activeProjectName: null,
    activeCaseId: null,
    activeCaseName: null,
  });
  useStudyCasesStore.setState({ activeCase: null, cases: [] });
});

describe('Znacznik świeżości wyników w pasku aktywnego przypadku (K4/D1)', () => {
  it('„nieaktualne" ze store → natywny klik przenosi do przestrzeni „Obliczenia"', () => {
    ustawStan('OUTDATED');
    render(<AppShell />);

    const chip = screen.getByTestId('mvd-casebar-results');
    expect(chip).toHaveTextContent(SHELL_STRINGS.resultsOutdated);
    expect(chip.tagName).toBe('BUTTON');

    fireEvent.click(chip);
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });

  it('„aktualne" ze store → znacznik statyczny, klik nie zmienia przestrzeni', () => {
    ustawStan('FRESH');
    render(<AppShell />);

    const chip = screen.getByTestId('mvd-casebar-results');
    expect(chip).toHaveTextContent(SHELL_STRINGS.resultsFresh);
    expect(chip.tagName).toBe('SPAN');

    fireEvent.click(chip);
    expect(useShellStore.getState().activeSpace).toBe('projekt');
  });

  it('brak aktywnego przypadku w store → „Wyniki: brak", bez akcji', () => {
    useAppStateStore.setState({
      activeProjectId: 'P-1',
      activeProjectName: 'Sieć SN Przykładowa',
    });
    useStudyCasesStore.setState({ activeCase: null });
    render(<AppShell />);

    const chip = screen.getByTestId('mvd-casebar-results');
    expect(chip).toHaveTextContent(SHELL_STRINGS.resultsNone);
    expect(chip.tagName).toBe('SPAN');

    fireEvent.click(chip);
    expect(useShellStore.getState().activeSpace).toBe('projekt');
  });
});
