/*
 * Testy sekcji siły sieci (P47a §1.2): brak zakończonego przebiegu zwarciowego →
 * instrukcja „Przeprowadź analizę zwarciową"; z przebiegiem SC/DONE → SCR per
 * węzeł + werdykt + WSCR + ślad WHITE BOX inline. API i store mockowane.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { SekcjaSilySieci } from '../SekcjaSilySieci';
import { BRAKI_DANYCH_SILY } from '../strings';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { przebiegFixture, silaSieciFixture } from './analizyFixtures';

const pobierzSileSieci = vi.fn();
vi.mock('../../api', () => ({
  pobierzSileSieci: (runId: string) => pobierzSileSieci(runId),
}));

beforeEach(() => {
  useExecutionRunsStore.getState().reset();
});
afterEach(() => {
  useExecutionRunsStore.getState().reset();
  vi.clearAllMocks();
});

describe('SekcjaSilySieci — brak przebiegu (kryterium 4)', () => {
  it('bez zakończonego zwarcia pokazuje instrukcję zamiast pustki', () => {
    render(<SekcjaSilySieci szczegolyAudytowe={false} />);
    expect(screen.getByTestId('mvd-oze-sila-brak-przebiegu')).toHaveTextContent(
      'Przeprowadź analizę zwarciową',
    );
    expect(pobierzSileSieci).not.toHaveBeenCalled();
  });
});

describe('SekcjaSilySieci — wynik z przebiegu SC (kryterium 2)', () => {
  beforeEach(() => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'sc-run', analysis_type: 'SC_3F', status: 'DONE' })],
    });
  });

  it('renderuje WSCR, werdykt i SCR per węzeł z backendu', async () => {
    pobierzSileSieci.mockResolvedValue(silaSieciFixture());
    render(<SekcjaSilySieci szczegolyAudytowe={false} />);
    expect(await screen.findByTestId('mvd-oze-sila-wynik')).toBeInTheDocument();
    expect(pobierzSileSieci).toHaveBeenCalledWith('sc-run');
    expect(screen.getByTestId('mvd-oze-sila-wscr')).toHaveTextContent('4,5');
    expect(screen.getByTestId('mvd-oze-sila-werdykt-bus-pcc-1')).toHaveTextContent('mocna');
    expect(screen.getByTestId('mvd-oze-sila-werdykt-bus-pcc-2')).toHaveTextContent('bardzo słaba');
  });

  it('karta #145: węzeł nazwany z modelu, braki danych po polsku — bez referencji i kodów', async () => {
    useSnapshotStore.setState({
      snapshot: { buses: [{ ref_id: 'bus-pcc-3', id: 'b3', name: 'Szyna PCC farmy 3', voltage_kv: 15 }] },
    } as never);
    pobierzSileSieci.mockResolvedValue(silaSieciFixture());
    render(<SekcjaSilySieci szczegolyAudytowe={false} />);
    const wezel = await screen.findByTestId('mvd-oze-sila-wezel-bus-pcc-3');
    expect(wezel).toHaveTextContent('Szyna PCC farmy 3');
    // Braki danych po polsku — w szczegółach węzła (standard KD6), jednym kliknięciem.
    await userEvent.setup().click(screen.getByTestId('mvd-oze-sila-slad-otworz-bus-pcc-3'));
    const szczegoly = screen.getByTestId('mvd-oze-sila-szczegoly-bus-pcc-3');
    expect(szczegoly).toHaveTextContent(BRAKI_DANYCH_SILY.s_sc_mva);
    for (const el of [wezel, szczegoly]) {
      expect(el).not.toHaveTextContent('bus-pcc-3');
      expect(el).not.toHaveTextContent('s_sc_mva');
    }
    useSnapshotStore.setState({ snapshot: null } as never);
  });

  it('rozwija ślad WHITE BOX węzła inline (szczegóły na żądanie)', async () => {
    pobierzSileSieci.mockResolvedValue(silaSieciFixture());
    render(<SekcjaSilySieci szczegolyAudytowe={false} />);
    await screen.findByTestId('mvd-oze-sila-wynik');
    expect(screen.queryByTestId('mvd-oze-slad-kroki')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-oze-sila-slad-otworz-bus-pcc-1'));
    expect(screen.getByText('SCR = 120,0 / 20,0')).toBeInTheDocument();
  });

  it('błąd końcówki → jawny stan błędu', async () => {
    pobierzSileSieci.mockRejectedValue(new Error('422 brak zwarcia'));
    render(<SekcjaSilySieci szczegolyAudytowe={false} />);
    expect(await screen.findByTestId('mvd-oze-sila-blad')).toHaveTextContent('422 brak zwarcia');
  });
});

describe('SekcjaSilySieci — wyróżnienie moduł→węzeł (P47b)', () => {
  beforeEach(() => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'sc-run', analysis_type: 'SC_3F', status: 'DONE' })],
    });
  });

  it('wyróżniony moduł podświetla wiersz swojego węzła (i tylko jego)', async () => {
    useSnapshotStore.setState({
      snapshot: { buses: [{ ref_id: 'bus-pcc-2', id: 'b2', name: 'Szyna PCC farmy 2', voltage_kv: 15 }] },
    } as never);
    pobierzSileSieci.mockResolvedValue(silaSieciFixture());
    render(<SekcjaSilySieci szczegolyAudytowe={false} wyroznionyModul="src-2" />);
    await screen.findByTestId('mvd-oze-sila-wynik');
    expect(screen.getByTestId('mvd-oze-sila-wezel-bus-pcc-2')).toHaveAttribute(
      'data-wyrozniony',
      'true',
    );
    expect(screen.getByTestId('mvd-oze-sila-wezel-bus-pcc-1')).not.toHaveAttribute(
      'data-wyrozniony',
    );
    // Karta #145: wyróżniony węzeł nazwany z modelu, nigdy referencją.
    expect(screen.getByTestId('mvd-oze-sila-wyroznienie-wezel')).toHaveTextContent('Szyna PCC farmy 2');
    expect(screen.getByTestId('mvd-oze-sila-wyroznienie-wezel')).not.toHaveTextContent('bus-pcc-2');
    useSnapshotStore.setState({ snapshot: null } as never);
  });

  it('moduł bez węzła w wynikach → uczciwa adnotacja, brak podświetlenia', async () => {
    pobierzSileSieci.mockResolvedValue(silaSieciFixture());
    render(<SekcjaSilySieci szczegolyAudytowe={false} wyroznionyModul="modul-obcy" />);
    await screen.findByTestId('mvd-oze-sila-wynik');
    expect(screen.getByTestId('mvd-oze-sila-wyroznienie-brak')).toHaveTextContent(
      'nieodnaleziony',
    );
    expect(screen.getByTestId('mvd-oze-sila-wezel-bus-pcc-1')).not.toHaveAttribute(
      'data-wyrozniony',
    );
  });

  it('bez wyróżnionego modułu nie pokazuje adnotacji ani podświetlenia', async () => {
    pobierzSileSieci.mockResolvedValue(silaSieciFixture());
    render(<SekcjaSilySieci szczegolyAudytowe={false} />);
    await screen.findByTestId('mvd-oze-sila-wynik');
    expect(screen.queryByTestId('mvd-oze-sila-wyroznienie-wezel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-oze-sila-wyroznienie-brak')).not.toBeInTheDocument();
  });
});
