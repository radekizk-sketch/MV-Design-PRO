/**
 * Ekran koordynacji zabezpieczeń (E-28) — urządzenia i nastawy Z MODELU, prądy z biegów.
 *
 * Karta BIEG-ZABEZPIECZEN-Z-MODELU: ekran nie tworzy urządzeń, nie trzyma nastaw i nie buduje
 * prądów. Wskazuje biegi (scenariusz zapisany NA BIEGU), wysyła WYŁĄCZNIE ich identyfikatory
 * i pokazuje wynik backendu (PRAWDZIWY wynik sieci złotej G08 z generatora fikstur).
 *
 * Iloczyn cech wyboru biegów: {brak biegów, tylko MAX, MAX + MIN, MAX + MIN + rozpływ,
 * bieg bez zapisanego scenariusza, dwa biegi MAX (najnowszy wygrywa), bieg nieodczytany}
 * × {panel biegów, blokada uruchomienia, treść żądania}. Wynik: {urządzenia, pary, odmowy
 * urządzeń z akcją naprawczą, odmowy par, pominięte} × {widoczność, droga do edycji nastaw}.
 * Kliki natywne na realnych kontrolkach; API mockowane na granicy modułu klienta.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useAppStateStore } from '../../app-state/store';
import { useExecutionRunsStore } from '../../study-cases/runStore';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { ProtectionCoordinationPage } from '../ProtectionCoordinationPage';
import type { CoordinationResult } from '../types';
import { LABELS } from '../types';
import wynikSceny from '../../../harness-fixtures/generated/koordynacja_scena_wynik.json';

const fetchSC = vi.fn();
const runAnalysis = vi.fn();
const getResult = vi.fn();
const openRouteSurface = vi.fn();

vi.mock('../../results-inspector/api', () => ({
  fetchShortCircuitResults: (id: string) => fetchSC(id),
}));

vi.mock('../api', () => ({
  runCoordinationAnalysis: (...args: unknown[]) => runAnalysis(...args),
  getCoordinationResult: (...args: unknown[]) => getResult(...args),
  getExportPdfUrl: () => 'about:blank',
  getExportDocxUrl: () => 'about:blank',
}));

const WYNIK = wynikSceny as unknown as CoordinationResult;

function bieg(id: string, analysis_type: string, finished_at: string) {
  return {
    id,
    study_case_id: 'case-1',
    analysis_type,
    solver_input_hash: 'h',
    status: 'DONE',
    started_at: null,
    finished_at,
    error_message: null,
  } as never;
}

const SCENARIUSZ: Record<string, 'MAX' | 'MIN' | null> = {
  'run-max-stary': 'MAX',
  'run-max': 'MAX',
  'run-min': 'MIN',
  'run-bez-scenariusza': null,
};

beforeEach(() => {
  vi.clearAllMocks();
  useAppStateStore.setState({ activeProjectId: 'proj-1', activeCaseId: 'case-1' } as never);
  useExecutionRunsStore.setState({ runs: [], activeRunId: null } as never);
  useNetworkBuildStore.setState({ openRouteSurface } as never);
  fetchSC.mockImplementation(async (id: string) => {
    if (id === 'run-nieodczytany') throw new Error('HTTP 404');
    return { run_id: id, rows: [], konfiguracja_biegu: { scenariusz: SCENARIUSZ[id] } };
  });
  runAnalysis.mockResolvedValue({ run_id: 'run-koordynacja' });
  getResult.mockResolvedValue(WYNIK);
});

afterEach(() => {
  cleanup();
});

describe('wybór biegów wejściowych', () => {
  it('brak biegów — panel nazywa brak, uruchomienie odmawia bez wywołania backendu', async () => {
    render(<ProtectionCoordinationPage />);
    expect(await screen.findByTestId('coordination-runs-missing')).toHaveTextContent(
      LABELS.biegi.brakMaxMin,
    );
    fireEvent.click(screen.getByTestId('run-analysis-button'));
    expect(await screen.findByTestId('coordination-status')).toHaveTextContent(
      LABELS.biegi.brakMaxMin,
    );
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('tylko bieg MAX — nadal brak (czułość wymaga MIN)', async () => {
    useExecutionRunsStore.setState({
      runs: [bieg('run-max', 'SC_3F', '2026-09-01T10:00:00Z')],
    } as never);
    render(<ProtectionCoordinationPage />);
    await waitFor(() => expect(fetchSC).toHaveBeenCalledWith('run-max'));
    expect(screen.getByTestId('coordination-run-max')).toHaveTextContent('✓');
    expect(screen.getByTestId('coordination-run-min')).toHaveTextContent(LABELS.biegi.brak);
    fireEvent.click(screen.getByTestId('run-analysis-button'));
    await screen.findByTestId('coordination-status');
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('bieg bez zapisanego scenariusza i bieg nieodczytany nie są kandydatami (nigdy domyślne MAX)', async () => {
    useExecutionRunsStore.setState({
      runs: [
        bieg('run-bez-scenariusza', 'SC_3F', '2026-09-01T12:00:00Z'),
        bieg('run-nieodczytany', 'SC_3F', '2026-09-01T13:00:00Z'),
        bieg('run-min', 'SC_3F', '2026-09-01T11:00:00Z'),
      ],
    } as never);
    render(<ProtectionCoordinationPage />);
    await waitFor(() => expect(screen.getByTestId('coordination-run-min')).toHaveTextContent('✓'));
    expect(screen.getByTestId('coordination-run-max')).toHaveTextContent(LABELS.biegi.brak);
  });

  it('MAX + MIN + rozpływ — żądanie niesie wyłącznie identyfikatory, najnowszy MAX wygrywa', async () => {
    useExecutionRunsStore.setState({
      runs: [
        bieg('run-max-stary', 'SC_3F', '2026-09-01T08:00:00Z'),
        bieg('run-max', 'SC_2F', '2026-09-01T10:00:00Z'),
        bieg('run-min', 'SC_3F', '2026-09-01T09:00:00Z'),
        bieg('run-lf', 'LOAD_FLOW', '2026-09-01T07:00:00Z'),
        bieg('run-1f', 'SC_1F', '2026-09-01T11:00:00Z'),
      ],
    } as never);
    render(<ProtectionCoordinationPage />);
    await waitFor(() => expect(screen.getByTestId('coordination-run-min')).toHaveTextContent('✓'));
    expect(screen.queryByTestId('coordination-runs-missing')).not.toBeInTheDocument();
    // Bieg jednofazowy nie jest kandydatem koordynacji fazowej — nie jest nawet czytany.
    expect(fetchSC).not.toHaveBeenCalledWith('run-1f');

    fireEvent.click(screen.getByTestId('run-analysis-button'));
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1));
    expect(runAnalysis).toHaveBeenCalledWith('proj-1', {
      sc_run_id: 'run-max',
      sc_run_id_min: 'run-min',
      pf_run_id: 'run-lf',
    });
  });

  it('bez rozpływu — żądanie bez pola rozpływu, panel mówi o przeciążalności', async () => {
    useExecutionRunsStore.setState({
      runs: [
        bieg('run-max', 'SC_3F', '2026-09-01T10:00:00Z'),
        bieg('run-min', 'SC_3F', '2026-09-01T09:00:00Z'),
      ],
    } as never);
    render(<ProtectionCoordinationPage />);
    expect(await screen.findByText(LABELS.biegi.brakPf)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('run-analysis-button'));
    await waitFor(() =>
      expect(runAnalysis).toHaveBeenCalledWith('proj-1', {
        sc_run_id: 'run-max',
        sc_run_id_min: 'run-min',
      }),
    );
  });
});

describe('wynik i odmowy', () => {
  function zBiegami(): void {
    useExecutionRunsStore.setState({
      runs: [
        bieg('run-max', 'SC_3F', '2026-09-01T10:00:00Z'),
        bieg('run-min', 'SC_3F', '2026-09-01T09:00:00Z'),
      ],
    } as never);
  }

  async function uruchom(): Promise<void> {
    render(<ProtectionCoordinationPage />);
    await waitFor(() => expect(screen.getByTestId('coordination-run-min')).toHaveTextContent('✓'));
    fireEvent.click(screen.getByTestId('run-analysis-button'));
  }

  it('odmowa backendu widoczna w treści (sieć zmieniona od biegu)', async () => {
    zBiegami();
    runAnalysis.mockRejectedValue(
      new Error('Bieg maksymalny policzono dla innej sieci niż bieżący model.'),
    );
    await uruchom();
    const status = await screen.findByTestId('coordination-status');
    expect(status).toHaveAttribute('role', 'alert');
    expect(status).toHaveTextContent('policzono dla innej sieci');
  });

  it('wynik sieci złotej — urządzenia z nastawami z modelu i para stopniowania', async () => {
    zBiegami();
    await uruchom();
    const panel = await screen.findByTestId('coordination-devices');
    for (const urzadzenie of WYNIK.devices) {
      const pozycja = screen.getByTestId(`coordination-device-${urzadzenie.id}`);
      expect(pozycja).toHaveTextContent(urzadzenie.name);
      for (const stopien of urzadzenie.nastawy!.stopnie) {
        expect(pozycja).toHaveTextContent(stopien.etykieta_pl);
        expect(pozycja).toHaveTextContent(stopien.krzywa_pl);
      }
    }
    expect(WYNIK.pary.length).toBe(1);
    const [podrzedne, nadrzedne] = [WYNIK.pary[0].podrzedne_ref, WYNIK.pary[0].nadrzedne_ref].map(
      (ref) => WYNIK.devices.find((d) => d.id === ref)!.name,
    );
    expect(screen.getByTestId('coordination-pairs')).toHaveTextContent(
      `${podrzedne} (${LABELS.devices.podrzedne}) → ${nadrzedne} (${LABELS.devices.nadrzedne})`,
    );
    expect(panel).not.toHaveTextContent(LABELS.devices.nieznaneUrzadzenie);
  });

  it('odmowy urządzeń (z akcją naprawczą), odmowy par i pominięte są widoczne', async () => {
    zBiegami();
    getResult.mockResolvedValue({
      ...WYNIK,
      odmowy_urzadzen: [
        {
          urzadzenie_ref: 'relay-x',
          nazwa_pl: 'Zabezpieczenie Q9',
          breaker_ref: 'br-x',
          braki: [
            {
              kod: 'protection.ct_missing',
              komunikat_pl: 'Wyłącznik nie ma przekładnika prądowego.',
              akcja_naprawcza_pl: 'Dodaj przekładnik prądowy przy wyłączniku.',
              funkcja: null,
            },
          ],
          kandydaci_naprawy: [],
        },
      ],
      odmowy_par: [
        {
          podrzedne_ref: WYNIK.devices[0].id,
          kandydaci_nadrzedne: ['a', 'b'],
          kod: 'PARA_NIEJEDNOZNACZNA',
          powod_pl: 'Dwa urządzenia nadrzędne o równej strefie — wskaż parę.',
        },
      ],
      pominiete: [
        {
          urzadzenie_ref: 'relay-z',
          nazwa_pl: 'Zabezpieczenie ziemnozwarciowe',
          kod: 'FUNKCJA_NIE_NADPRADOWA',
          powod_pl: 'Urządzenie nie ma stopni nadprądowych fazowych.',
        },
      ],
    });
    await uruchom();
    expect(await screen.findByTestId('coordination-refusals')).toHaveTextContent(
      'Zabezpieczenie Q9: Wyłącznik nie ma przekładnika prądowego. Dodaj przekładnik prądowy przy wyłączniku.',
    );
    expect(screen.getByTestId('coordination-pair-refusals')).toHaveTextContent(
      `${WYNIK.devices[0].name}: Dwa urządzenia nadrzędne o równej strefie — wskaż parę.`,
    );
    expect(screen.getByTestId('coordination-skipped')).toHaveTextContent(
      'Zabezpieczenie ziemnozwarciowe: Urządzenie nie ma stopni nadprądowych fazowych.',
    );
  });

  it('droga do edycji nastaw w modelu — przycisk panelu otwiera ekran zabezpieczeń', async () => {
    zBiegami();
    await uruchom();
    fireEvent.click(await screen.findByTestId('coordination-edit-settings'));
    expect(openRouteSurface).toHaveBeenCalledWith('E-27');
  });

  it('zakładki czułości i selektywności pokazują sprawdzenia z uzasadnieniem backendu', async () => {
    zBiegami();
    await uruchom();
    fireEvent.click(await screen.findByTestId('tab-selectivity'));
    const tabela = screen.getByTestId('selectivity-table');
    for (const c of WYNIK.selectivity_checks) {
      expect(tabela).toHaveTextContent(c.notes_pl);
    }
    fireEvent.click(screen.getByTestId('tab-sensitivity'));
    const czulosc = screen.getByTestId('sensitivity-table');
    for (const c of WYNIK.sensitivity_checks) {
      expect(czulosc).toHaveTextContent(c.notes_pl);
    }
  });
});
