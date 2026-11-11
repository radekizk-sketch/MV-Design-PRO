/*
 * Testy sekcji adekwatności mocy biernej (P47a §1.3): brak zakończonego rozpływu →
 * instrukcja „Przeprowadź rozpływ mocy"; z przebiegiem LOAD_FLOW/DONE → rezerwy Q
 * per źródło + nasycenie + naruszenia + werdykt + proweniencja. API i store mockowane.
 */

import { oczekujTekstuZWzorami } from '../../../../test/tekstZWzorami';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { SekcjaAdekwatnosciQ } from '../SekcjaAdekwatnosciQ';
import { BRAKI_DANYCH_Q, PULPIT_STRINGS, WERDYKTY_ADEKWATNOSCI_Q } from '../strings';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { adekwatnoscQFixture, przebiegFixture } from './analizyFixtures';

const pobierzAdekwatnoscQ = vi.fn();
vi.mock('../../api', () => ({
  pobierzAdekwatnoscQ: (runId: string) => pobierzAdekwatnoscQ(runId),
}));

beforeEach(() => {
  useExecutionRunsStore.getState().reset();
});
afterEach(() => {
  useExecutionRunsStore.getState().reset();
  vi.clearAllMocks();
});

describe('SekcjaAdekwatnosciQ — brak przebiegu (kryterium 4)', () => {
  it('bez zakończonego rozpływu pokazuje instrukcję', () => {
    render(<SekcjaAdekwatnosciQ szczegolyAudytowe={false} />);
    expect(screen.getByTestId('mvd-oze-adekw-brak-przebiegu')).toHaveTextContent(
      'Przeprowadź rozpływ mocy',
    );
    expect(pobierzAdekwatnoscQ).not.toHaveBeenCalled();
  });

  it('przebieg zwarciowy nie aktywuje adekwatności (tylko LOAD_FLOW)', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'sc', analysis_type: 'SC_3F', status: 'DONE' })],
    });
    render(<SekcjaAdekwatnosciQ szczegolyAudytowe={false} />);
    expect(screen.getByTestId('mvd-oze-adekw-brak-przebiegu')).toBeInTheDocument();
  });
});

describe('SekcjaAdekwatnosciQ — wynik z rozpływu (kryterium 3)', () => {
  beforeEach(() => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'lf-run', analysis_type: 'LOAD_FLOW', status: 'DONE' })],
    });
  });

  it('renderuje werdykt, rezerwy źródeł, nasycenie i naruszenia z backendu', async () => {
    pobierzAdekwatnoscQ.mockResolvedValue(adekwatnoscQFixture());
    render(<SekcjaAdekwatnosciQ szczegolyAudytowe={false} />);
    expect(await screen.findByTestId('mvd-oze-adekw-wynik')).toBeInTheDocument();
    expect(pobierzAdekwatnoscQ).toHaveBeenCalledWith('lf-run');
    // Karta #145: werdykt maszynowy backendu nie trafia na ekran — polska etykieta.
    expect(screen.getByTestId('mvd-oze-adekw-werdykt')).toHaveTextContent(
      WERDYKTY_ADEKWATNOSCI_Q['wystarczająca rezerwa Q'],
    );
    expect(screen.getByTestId('mvd-oze-adekw-werdykt')).not.toHaveTextContent('rezerwa Q');
    expect(screen.getByTestId('mvd-oze-adekw-nasycenie-src-2')).toHaveTextContent('przy granicy');
    expect(screen.getByTestId('mvd-oze-adekw-naruszenie-bus-pcc-2')).toBeInTheDocument();
  });

  it('karta #145: źródło i węzeł nazwane z modelu, braki danych po polsku — bez referencji i kodów', async () => {
    useSnapshotStore.setState({
      snapshot: {
        buses: [{ ref_id: 'bus-pcc-2', id: 'b2', name: 'Szyna PCC farmy 2', voltage_kv: 15 }],
        generators: [{ ref_id: 'src-2', id: 'g2', name: 'Falownik farmy 2' }],
      },
    } as never);
    const dane = adekwatnoscQFixture();
    pobierzAdekwatnoscQ.mockResolvedValue({
      ...dane,
      sources: dane.sources.map((zrodlo) =>
        zrodlo.ref === 'src-2' ? { ...zrodlo, missing_data: ['q_min_mvar', 'q_max_mvar'] } : zrodlo,
      ),
    });
    render(<SekcjaAdekwatnosciQ szczegolyAudytowe={false} />);
    const zrodlo = await screen.findByTestId('mvd-oze-adekw-zrodlo-src-2');
    expect(zrodlo).toHaveTextContent('Falownik farmy 2');
    // Wiersz źródła mówi „brakujące dane" w stanie regulacji; same braki po polsku z symbolami
    // granic przez KaTeX (`$Q_{\\min}$`, nie ASCII `Q_min`) — w szczegółach (standard KD6).
    expect(screen.getByTestId('mvd-oze-adekw-nasycenie-src-2')).toHaveTextContent(PULPIT_STRINGS.adekwBrakDanych);
    expect(screen.getByTestId('mvd-oze-adekw-nasycenie-src-2')).toHaveAttribute('data-uwaga', 'brak');
    await userEvent.setup().click(screen.getByTestId('mvd-oze-adekw-slad-otworz-src-2'));
    const szczegoly = screen.getByTestId('mvd-oze-adekw-szczegoly-src-2');
    oczekujTekstuZWzorami(szczegoly, BRAKI_DANYCH_Q.q_min_mvar);
    oczekujTekstuZWzorami(szczegoly, BRAKI_DANYCH_Q.q_max_mvar);
    for (const el of [zrodlo, szczegoly]) {
      expect(el).not.toHaveTextContent('src-2');
      expect(el).not.toHaveTextContent('q_min_mvar');
    }
    expect(screen.getByTestId('mvd-oze-adekw-naruszenie-bus-pcc-2')).toHaveTextContent('Szyna PCC farmy 2');
    useSnapshotStore.setState({ snapshot: null } as never);
  });

  it('pokazuje proweniencję werdyktu (jakość pól Q-granic)', async () => {
    pobierzAdekwatnoscQ.mockResolvedValue(adekwatnoscQFixture());
    render(<SekcjaAdekwatnosciQ szczegolyAudytowe={false} />);
    expect(await screen.findByTestId('mvd-oze-adekw-proweniencja')).toHaveTextContent(
      'z karty katalogowej',
    );
  });

  it('błąd końcówki → jawny stan błędu', async () => {
    pobierzAdekwatnoscQ.mockRejectedValue(new Error('422 brak rozpływu'));
    render(<SekcjaAdekwatnosciQ szczegolyAudytowe={false} />);
    expect(await screen.findByTestId('mvd-oze-adekw-blad')).toHaveTextContent('422 brak rozpływu');
  });
});

describe('SekcjaAdekwatnosciQ — wyróżnienie moduł→węzeł (P47b)', () => {
  beforeEach(() => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'lf-run', analysis_type: 'LOAD_FLOW', status: 'DONE' })],
    });
  });

  it('wyróżniony moduł podświetla źródło i naruszenie swojego węzła', async () => {
    useSnapshotStore.setState({
      snapshot: { buses: [{ ref_id: 'bus-pcc-2', id: 'b2', name: 'Szyna PCC farmy 2', voltage_kv: 15 }] },
    } as never);
    pobierzAdekwatnoscQ.mockResolvedValue(adekwatnoscQFixture());
    render(<SekcjaAdekwatnosciQ szczegolyAudytowe={false} wyroznionyModul="src-2" />);
    await screen.findByTestId('mvd-oze-adekw-wynik');
    expect(screen.getByTestId('mvd-oze-adekw-zrodlo-src-2')).toHaveAttribute(
      'data-wyrozniony',
      'true',
    );
    expect(screen.getByTestId('mvd-oze-adekw-zrodlo-src-1')).not.toHaveAttribute('data-wyrozniony');
    // Naruszenie napięciowe na tym samym węźle również podświetlone.
    expect(screen.getByTestId('mvd-oze-adekw-naruszenie-bus-pcc-2')).toHaveAttribute(
      'data-wyrozniony',
      'true',
    );
    // Karta #145: wyróżniony węzeł nazwany z modelu, nigdy referencją.
    expect(screen.getByTestId('mvd-oze-adekw-wyroznienie-wezel')).toHaveTextContent('Szyna PCC farmy 2');
    expect(screen.getByTestId('mvd-oze-adekw-wyroznienie-wezel')).not.toHaveTextContent('bus-pcc-2');
    useSnapshotStore.setState({ snapshot: null } as never);
  });

  it('moduł bez węzła w wynikach → uczciwa adnotacja, brak podświetlenia', async () => {
    pobierzAdekwatnoscQ.mockResolvedValue(adekwatnoscQFixture());
    render(<SekcjaAdekwatnosciQ szczegolyAudytowe={false} wyroznionyModul="modul-obcy" />);
    await screen.findByTestId('mvd-oze-adekw-wynik');
    expect(screen.getByTestId('mvd-oze-adekw-wyroznienie-brak')).toHaveTextContent(
      'nieodnaleziony',
    );
    expect(screen.getByTestId('mvd-oze-adekw-zrodlo-src-1')).not.toHaveAttribute('data-wyrozniony');
  });
});
