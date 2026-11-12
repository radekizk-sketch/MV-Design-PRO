import { afterEach, describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SemanticIssuesBanner } from '../SemanticIssuesBanner';
import type { SemanticIssue } from '../../../types/domainOps';
import type { EnergyNetworkModel } from '../../../types/enm';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useSelectionStore } from '../../selection/store';

const migawka = {
  buses: [],
  branches: [],
  transformers: [],
  sources: [],
  loads: [{ id: 'LOAD-1', ref_id: 'LOAD-1', name: 'Odbiór 1', bus_ref: 'B-1' }],
  generators: [],
  substations: [],
  bays: [],
  junctions: [],
  corridors: [],
  measurements: [],
  protection_assignments: [],
} as unknown as EnergyNetworkModel;

const stanSnapshot = useSnapshotStore.getState();
const stanSelekcji = useSelectionStore.getState();
afterEach(() => {
  useSnapshotStore.setState(stanSnapshot, true);
  useSelectionStore.setState(stanSelekcji, true);
});

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

  it('Element na schemacie → wspólny przycisk „Pokaż na schemacie" zaznacza go i wskazuje kamerze', () => {
    useSnapshotStore.setState({ snapshot: migawka });
    const { getByTestId } = render(
      <SemanticIssuesBanner issues={[makeIssue({ code: 'semantic.zero_power_load', element_id: 'LOAD-1' })]} />,
    );
    const przycisk = getByTestId('semantic-issue-action-semantic.zero_power_load');
    // Ta sama etykieta dla każdego kodu — dawne „Uzupełnij moc odbioru" obiecywało naprawę.
    expect(przycisk).toHaveTextContent('Pokaż na schemacie');
    fireEvent.click(przycisk);
    expect(useSelectionStore.getState().selectedElement?.id).toBe('LOAD-1');
    expect(useSelectionStore.getState().sldWskazanie?.ref).toBe('LOAD-1');
  });

  it('Element spoza migawki → brak przycisku (bez martwego kliku)', () => {
    useSnapshotStore.setState({ snapshot: migawka });
    const { queryByTestId } = render(<SemanticIssuesBanner issues={[makeIssue({ element_id: 'EL-99' })]} />);
    expect(queryByTestId('semantic-issue-action-semantic.test')).toBeNull();
  });

  it('Nie pokazuje przycisku gdy filtrujemy po elementId', () => {
    useSnapshotStore.setState({ snapshot: migawka });
    const { queryByText } = render(
      <SemanticIssuesBanner issues={[makeIssue({ element_id: 'LOAD-1' })]} elementId="LOAD-1" />,
    );
    expect(queryByText('Pokaż na schemacie')).toBeNull();
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
