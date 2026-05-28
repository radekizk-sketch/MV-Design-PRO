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

  it('Renderuje listę z liczbą naruszeń', () => {
    const issues = [makeIssue(), makeIssue({ code: 'semantic.test2', message: 'Drugie' })];
    const { getByText, getByTestId } = render(<SemanticIssuesBanner issues={issues} />);
    expect(getByTestId('semantic-issues-banner')).toBeTruthy();
    expect(getByText(/Naruszenia semantyki \(2\)/)).toBeTruthy();
    expect(getByText('Naruszenie testowe')).toBeTruthy();
    expect(getByText('Drugie')).toBeTruthy();
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

  it('Dla odbioru bez P/Q pokazuje akcję uzupełnienia mocy', () => {
    const onSelect = vi.fn();
    const { getByText } = render(
      <SemanticIssuesBanner
        issues={[makeIssue({ code: 'semantic.zero_power_load', element_id: 'LOAD-1' })]}
        onSelectElement={onSelect}
      />,
    );
    fireEvent.click(getByText('Uzupełnij moc odbioru'));
    expect(onSelect).toHaveBeenCalledWith('LOAD-1');
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

  it('WARNING ma żółty kolor, ERROR czerwony', () => {
    const { container } = render(
      <SemanticIssuesBanner
        issues={[makeIssue({ severity: 'WARNING', message: 'Ostrzeżenie' })]}
      />,
    );
    const msg = container.querySelector('.text-amber-700');
    expect(msg).toBeTruthy();
  });
});
