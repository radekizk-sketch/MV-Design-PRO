import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SemanticIssuesBanner } from '../SemanticIssuesBanner';
import type { SemanticIssue } from '../../../types/domainOps';

function makeIssue(overrides: Partial<SemanticIssue> = {}): SemanticIssue {
  return {
    code: 'semantic.test',
    message: 'Naruszenie testowe',
    severity: 'ERROR',
    element_id: 'EL-1',
    field: 'bay_ref',
    suggested_fix: 'Zmień coś',
    ...overrides,
  };
}

describe('SemanticIssuesBanner', () => {
  it('Nie renderuje gdy brak naruszeń', () => {
    const { container } = render(<SemanticIssuesBanner issues={[]} />);
    expect(container.querySelector('[data-testid="semantic-issues-banner"]')).toBeNull();
  });

  it('Renderuje sekcję Błędy gdy są ERROR-y', () => {
    const issues = [makeIssue({ severity: 'ERROR', message: 'Pierwszy błąd' })];
    const { getByText, getByTestId, queryByTestId } = render(<SemanticIssuesBanner issues={issues} />);
    expect(getByTestId('semantic-issues-banner')).toBeTruthy();
    expect(getByTestId('semantic-errors-group')).toBeTruthy();
    expect(queryByTestId('semantic-warnings-group')).toBeNull();
    expect(getByText(/Błędy \(1\)/)).toBeTruthy();
    expect(getByText('Pierwszy błąd')).toBeTruthy();
  });

  it('Renderuje sekcję Ostrzeżenia gdy są WARNING-i', () => {
    const issues = [makeIssue({ severity: 'WARNING', message: 'Ostrzeżenie' })];
    const { getByText, getByTestId, queryByTestId } = render(<SemanticIssuesBanner issues={issues} />);
    expect(queryByTestId('semantic-errors-group')).toBeNull();
    expect(getByTestId('semantic-warnings-group')).toBeTruthy();
    expect(getByText(/Ostrzeżenia \(1\)/)).toBeTruthy();
    expect(getByText('Ostrzeżenie')).toBeTruthy();
  });

  it('Rozdziela ERROR od WARNING w osobne sekcje', () => {
    const issues = [
      makeIssue({ severity: 'ERROR', code: 'semantic.e1', message: 'Błąd 1' }),
      makeIssue({ severity: 'WARNING', code: 'semantic.w1', message: 'Ostrzeżenie 1' }),
      makeIssue({ severity: 'ERROR', code: 'semantic.e2', message: 'Błąd 2' }),
    ];
    const { getByTestId, getByText } = render(<SemanticIssuesBanner issues={issues} />);
    expect(getByTestId('semantic-errors-group')).toBeTruthy();
    expect(getByTestId('semantic-warnings-group')).toBeTruthy();
    expect(getByText(/Błędy \(2\)/)).toBeTruthy();
    expect(getByText(/Ostrzeżenia \(1\)/)).toBeTruthy();
  });

  it('Filtruje po elementId', () => {
    const issues = [
      makeIssue({ element_id: 'EL-1', message: 'Issue EL-1' }),
      makeIssue({ element_id: 'EL-2', message: 'Issue EL-2' }),
    ];
    const { queryByText } = render(<SemanticIssuesBanner issues={issues} elementId="EL-1" />);
    expect(queryByText('Issue EL-1')).toBeTruthy();
    expect(queryByText('Issue EL-2')).toBeNull();
  });

  it('Pokazuje sugestię naprawy gdy istnieje', () => {
    const { getByText } = render(
      <SemanticIssuesBanner issues={[makeIssue({ suggested_fix: 'Konkretna naprawa' })]} />,
    );
    expect(getByText(/Konkretna naprawa/)).toBeTruthy();
  });

  it('Wywołuje onSelectElement po kliknięciu "Pokaż element"', () => {
    const onSelect = vi.fn();
    const { getByText } = render(
      <SemanticIssuesBanner issues={[makeIssue({ element_id: 'EL-99' })]} onSelectElement={onSelect} />,
    );
    fireEvent.click(getByText('Pokaż element'));
    expect(onSelect).toHaveBeenCalledWith('EL-99');
  });

  it('Nie pokazuje "Pokaż element" gdy filtrujemy po elementId', () => {
    const { queryByText } = render(
      <SemanticIssuesBanner
        issues={[makeIssue({ element_id: 'EL-1' })]}
        elementId="EL-1"
        onSelectElement={() => {}}
      />,
    );
    expect(queryByText('Pokaż element')).toBeNull();
  });

  it('data-issue-severity atrybut jest ustawiony', () => {
    const { container } = render(
      <SemanticIssuesBanner
        issues={[
          makeIssue({ severity: 'ERROR' }),
          makeIssue({ severity: 'WARNING', code: 'semantic.w' }),
        ]}
      />,
    );
    expect(container.querySelector('[data-issue-severity="ERROR"]')).toBeTruthy();
    expect(container.querySelector('[data-issue-severity="WARNING"]')).toBeTruthy();
  });
});
