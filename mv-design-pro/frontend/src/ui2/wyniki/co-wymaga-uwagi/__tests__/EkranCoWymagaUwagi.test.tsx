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
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useShellStore } from '../../../shell/useShellStore';
import { busResultFixture, powerFlowResultFixture } from '../../rozplyw/__tests__/fixtures';

describe('EkranCoWymagaUwagi — skonsolidowany rejestr przekroczeń', () => {
  beforeEach(() => {
    usePowerFlowResultsStore.getState().reset();
    useExecutionRunsStore.setState({ runs: [] } as never);
    useSelectionStore.setState({ selectedElement: null, sldCenterOnElement: null } as never);
    useShellStore.setState({ activeSpace: 'wyniki' });
  });

  it('brak przebiegu → uczciwy stan zerowy z następnym krokiem (nie „sieć w normie")', () => {
    render(<EkranCoWymagaUwagi />);
    expect(screen.getByTestId('mvd-cwu-brak-przebiegu')).toBeInTheDocument();
    expect(screen.getByText(T.brakPrzebieguKrok)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-cwu-w-normie')).not.toBeInTheDocument();
  });

  it('zakończony przebieg ZWARCIOWY → NIE „brak przebiegu" (defekt K6 / H-5 pkt 5)', () => {
    // Rejestr wyprowadzał „czy jest przebieg" wyłącznie z wyniku ROZPŁYWU
    // w store — po biegu zwarciowym ekran kłamał, że przebiegu nie ma.
    useExecutionRunsStore.setState({
      runs: [
        {
          id: 'run-sc',
          study_case_id: 'case-1',
          analysis_type: 'SC_3F',
          solver_input_hash: 'h',
          status: 'DONE',
          started_at: '2026-07-30T10:00:00Z',
          finished_at: '2026-07-30T10:00:03Z',
          error_message: null,
        },
      ],
    } as never);

    render(<EkranCoWymagaUwagi />);

    expect(screen.queryByTestId('mvd-cwu-brak-przebiegu')).not.toBeInTheDocument();
    expect(screen.getByTestId('mvd-cwu-w-normie')).toBeInTheDocument();
  });

  it('stan „sieć w normie" ma DWA jawne następne kroki (dokumentacja, porównanie)', () => {
    usePowerFlowResultsStore.setState({
      results: powerFlowResultFixture({ bus_results: [busResultFixture({ v_pu: 1.0 })] }),
    });
    render(<EkranCoWymagaUwagi />);
    expect(screen.getByTestId('mvd-cwu-w-normie-dokumentacja-akcja')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-cwu-w-normie-porownanie-akcja')).toBeInTheDocument();
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
