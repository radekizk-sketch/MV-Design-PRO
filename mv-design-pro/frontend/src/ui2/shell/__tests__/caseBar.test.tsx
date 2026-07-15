import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CaseBar } from '../CaseBar';
import type { ShellCaseInfo } from '../shellStatus';
import { SHELL_STRINGS } from '../strings';

function makeInfo(overrides: Partial<ShellCaseInfo> = {}): ShellCaseInfo {
  return {
    projectPresent: true,
    caseName: 'Zwarcia maks. + PV 100%',
    caseCount: 4,
    resultStatus: 'FRESH',
    modelValidated: true,
    readinessWarnings: 0,
    readinessBlockers: 0,
    ...overrides,
  };
}

describe('CaseBar', () => {
  it('chip aktywnego przypadku jest zawsze widoczny (etykieta z §5)', () => {
    render(<CaseBar info={makeInfo()} />);
    expect(screen.getByText(SHELL_STRINGS.activeCase)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-casebar-chip')).toHaveTextContent('Zwarcia maks. + PV 100%');
  });

  it('prezentuje stany modelu / gotowości / wyników ze store (props)', () => {
    render(
      <CaseBar
        info={makeInfo({ resultStatus: 'OUTDATED', modelValidated: false, readinessWarnings: 2 })}
      />,
    );
    expect(screen.getByTestId('mvd-casebar-model')).toHaveTextContent(SHELL_STRINGS.modelPending);
    expect(screen.getByTestId('mvd-casebar-readiness')).toHaveTextContent('Gotowość: 2 ostrzeżenia');
    expect(screen.getByTestId('mvd-casebar-results')).toHaveTextContent(SHELL_STRINGS.resultsOutdated);
    expect(screen.getByTestId('mvd-casebar-count')).toHaveTextContent('Przypadków: 4');
  });

  it('gotowość: liczba pojedyncza/mnoga i blokady', () => {
    const { rerender } = render(<CaseBar info={makeInfo({ readinessWarnings: 1 })} />);
    expect(screen.getByTestId('mvd-casebar-readiness')).toHaveTextContent('Gotowość: 1 ostrzeżenie');
    rerender(<CaseBar info={makeInfo({ readinessBlockers: 3, readinessWarnings: 1 })} />);
    expect(screen.getByTestId('mvd-casebar-readiness')).toHaveTextContent('Gotowość: 3 blokady');
  });

  it('stan „brak projektu": chip pokazuje „—" i akcję „Otwórz projekt"', () => {
    const onOpenProject = vi.fn();
    render(<CaseBar info={makeInfo({ projectPresent: false, caseName: null })} onOpenProject={onOpenProject} />);
    expect(screen.getByTestId('mvd-casebar-chip')).toHaveTextContent(SHELL_STRINGS.emptyValue);
    expect(screen.queryByTestId('mvd-casebar-model')).toBeNull();
    const button = screen.getByTestId('mvd-open-project');
    expect(button).toHaveTextContent(SHELL_STRINGS.openProject);
    fireEvent.click(button);
    expect(onOpenProject).toHaveBeenCalledTimes(1);
  });
});
