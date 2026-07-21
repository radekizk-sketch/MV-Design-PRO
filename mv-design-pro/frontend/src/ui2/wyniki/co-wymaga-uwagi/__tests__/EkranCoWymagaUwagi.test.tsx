/*
 * Test ekranu rejestru „Co wymaga uwagi" (karta A1 / V12K-098). Uczciwe stany
 * zerowe (brak przebiegu ≠ sieć w normie), lista przekroczeń oraz REALNA akcja
 * „Popraw w modelu" (pętla F-E6.1: selekcja + przejście do przestrzeni „Schemat").
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EkranCoWymagaUwagi } from '../EkranCoWymagaUwagi';
import { CO_WYMAGA_UWAGI_STRINGS as T } from '../strings';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { useSelectionStore } from '../../../../ui/selection/store';
import { useShellStore } from '../../../shell/useShellStore';
import { busResultFixture, powerFlowResultFixture } from '../../rozplyw/__tests__/fixtures';

describe('EkranCoWymagaUwagi — skonsolidowany rejestr przekroczeń', () => {
  beforeEach(() => {
    usePowerFlowResultsStore.getState().reset();
    useSelectionStore.setState({ selectedElement: null, sldCenterOnElement: null } as never);
    useShellStore.setState({ activeSpace: 'wyniki' });
  });

  it('brak przebiegu → uczciwy stan zerowy z następnym krokiem (nie „sieć w normie")', () => {
    render(<EkranCoWymagaUwagi />);
    expect(screen.getByTestId('mvd-cwu-brak-przebiegu')).toBeInTheDocument();
    expect(screen.getByText(T.brakPrzebieguKrok)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-cwu-w-normie')).not.toBeInTheDocument();
  });

  it('przebieg bez przekroczeń → „sieć w normie" (odróżnione od braku przebiegu)', () => {
    usePowerFlowResultsStore.setState({
      results: powerFlowResultFixture({ bus_results: [busResultFixture({ v_pu: 1.0 })] }),
    });
    render(<EkranCoWymagaUwagi />);
    expect(screen.getByTestId('mvd-cwu-w-normie')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-cwu-brak-przebiegu')).not.toBeInTheDocument();
  });

  it('przekroczenia → lista z podsumowaniem liczby pozycji', () => {
    usePowerFlowResultsStore.setState({
      results: powerFlowResultFixture({
        bus_results: [
          busResultFixture({ bus_id: 'A', v_pu: 1.0 }),
          busResultFixture({ bus_id: 'B', v_pu: 0.94 }),
          busResultFixture({ bus_id: 'C', v_pu: 1.06 }),
        ],
      }),
    });
    render(<EkranCoWymagaUwagi />);
    expect(screen.getAllByTestId('mvd-cwu-pozycja')).toHaveLength(2);
    expect(screen.getByTestId('mvd-cwu-podsumowanie')).toHaveTextContent('2');
  });

  it('„Popraw w modelu" prowadzi do decyzji: zaznacza element i przechodzi do „Schemat"', async () => {
    usePowerFlowResultsStore.setState({
      results: powerFlowResultFixture({ bus_results: [busResultFixture({ bus_id: 'SZ-ST2', v_pu: 0.941 })] }),
    });
    render(<EkranCoWymagaUwagi />);

    await userEvent.click(screen.getByTestId('mvd-cwu-popraw'));

    const sel = useSelectionStore.getState();
    expect(sel.selectedElement).toMatchObject({ id: 'SZ-ST2', type: 'Bus' });
    expect(sel.sldCenterOnElement).toBe('SZ-ST2');
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });
});
