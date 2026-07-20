/*
 * Testy sekcji „Arc Flash" (IEEE 1584-2018) okna „Jakość wyników" — audyt V12K-059 poz. A.
 * Weryfikują realną ścieżkę: uczciwy stan bez przebiegu (bez API), formularz parametrów
 * projektowych, przeliczenie (POST) po kliknięciu, tabelę wyników z energią/AFB/PPE,
 * uczciwe „dane niekompletne" (braki wejść z backendu, bez zmyślania), ślad WHITE BOX
 * w trybie eksperckim. API mockowane; fixture 1:1 z `build_arc_flash_view`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { SekcjaArcFlash } from '../EkranJakosci';
import type { ArcFlashResponse } from '../api';
import { JAKOSC_STRINGS } from '../strings';
import { przebiegTestowy } from './fixtures';

vi.mock('../api', () => ({
  fetchWiarygodnoscZwarciowa: vi.fn(),
  fetchWalidacjaEnergetyczna: vi.fn(),
  fetchMigotanie: vi.fn(),
  fetchArcFlash: vi.fn(),
}));

import { fetchArcFlash } from '../api';

const mockedArcFlash = vi.mocked(fetchArcFlash);

const AF_FIXTURE: ArcFlashResponse = {
  analysis_id: 'af-1',
  context: null,
  status: 'COMPUTED_IEEE_1584_OPEN_SOURCE',
  status_label_pl: 'obliczony (IEEE 1584 open-source)',
  results: [
    {
      bus_ref: 'bus-1',
      status: 'COMPUTED_IEEE_1584_OPEN_SOURCE',
      status_label_pl: 'obliczony (IEEE 1584 open-source)',
      method: 'IEEE_1584_2018',
      electrode_config: 'VCB',
      i_bf_ka: 12.5,
      voltage_kv: 15.0,
      arc_time_s: 0.2,
      conductor_gap_mm: 152,
      working_distance_mm: 455,
      i_arc_ka: 11.8,
      incident_energy_cal_cm2: 8.42,
      incident_energy_joule_cm2: 35.2,
      arc_flash_boundary_mm: 1320,
      ppe_category: '2',
      ppe_table_provenance: null,
      provenance: 'ARC_FLASH_OPEN_SOURCE_PROVENANCE',
      provenance_caveat_pl: 'Wynik na współczynnikach open-source — wymaga weryfikacji z normą.',
      why_pl: 'Energia incydentu wyznaczona wg IEEE 1584-2018.',
      missing_data: [],
      white_box: [
        {
          symbol: 'E',
          formula_latex: 'E = 1.2 \\cdot ...',
          substitution_pl: 'E = 1.2 · …',
          result_pl: 'E = 8,42 cal/cm²',
          unit_check_pl: '[cal/cm²]',
          table_ref: 'IEEE_1584_VCB',
        },
      ],
    },
  ],
};

function props(over = {}) {
  return {
    przebieg: przebiegTestowy('sc-1', 'SC_3F'),
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  mockedArcFlash.mockReset();
});

describe('SekcjaArcFlash — realna ścieżka', () => {
  it('brak przebiegu zwarciowego → uczciwa instrukcja, bez wołania API', () => {
    render(<SekcjaArcFlash {...props({ przebieg: null })} />);
    expect(screen.getByTestId('mvd-jakosc-arcflash-brak')).toBeTruthy();
    expect(mockedArcFlash).not.toHaveBeenCalled();
  });

  it('formularz obecny; przed przeliczeniem brak wołania API', () => {
    render(<SekcjaArcFlash {...props()} />);
    expect(screen.getByTestId('mvd-jakosc-af-form')).toBeTruthy();
    expect(screen.getByTestId('mvd-jakosc-af-czeka')).toBeTruthy();
    expect(mockedArcFlash).not.toHaveBeenCalled();
  });

  it('przelicz → POST z parametrami projektowymi + tabela energii/AFB/PPE', async () => {
    mockedArcFlash.mockResolvedValue(AF_FIXTURE);
    render(<SekcjaArcFlash {...props()} />);
    fireEvent.change(screen.getByTestId('mvd-jakosc-af-odleglosc'), { target: { value: '455' } });
    fireEvent.change(screen.getByTestId('mvd-jakosc-af-odstep'), { target: { value: '152' } });
    fireEvent.change(screen.getByTestId('mvd-jakosc-af-czas'), { target: { value: '0.2' } });
    fireEvent.click(screen.getByTestId('mvd-jakosc-af-licz'));

    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-arcflash')).toBeTruthy());
    expect(mockedArcFlash).toHaveBeenCalledWith('sc-1', {
      working_distance_mm: 455,
      conductor_gap_mm: 152,
      arc_time_s: 0.2,
      electrode_config: 'VCB',
      enclosure_type: 'Typical',
    });
    const tabela = screen.getByTestId('mvd-wyn-tabela');
    expect(tabela).toHaveTextContent('bus-1');
    expect(tabela).toHaveTextContent('8,42'); // energia cal/cm² z przecinkiem PL
    expect(tabela).toHaveTextContent('1320'); // granica łuku mm
  });

  it('puste parametry → wysyłka null (bez zmyślania wejść)', async () => {
    mockedArcFlash.mockResolvedValue({ ...AF_FIXTURE, results: [] });
    render(<SekcjaArcFlash {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-jakosc-af-licz'));
    await waitFor(() => expect(mockedArcFlash).toHaveBeenCalled());
    expect(mockedArcFlash).toHaveBeenCalledWith('sc-1', {
      working_distance_mm: null,
      conductor_gap_mm: null,
      arc_time_s: null,
      electrode_config: 'VCB',
      enclosure_type: 'Typical',
    });
  });

  it('wybór wiersza → szczegół z proweniencją; ślad WHITE BOX tylko w trybie eksperckim', async () => {
    mockedArcFlash.mockResolvedValue(AF_FIXTURE);
    const { unmount } = render(<SekcjaArcFlash {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-jakosc-af-licz'));
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-arcflash')).toBeTruthy());
    fireEvent.click(screen.getByText('bus-1').closest('tr')!);
    const szczegol = screen.getByTestId('mvd-jakosc-af-szczegol');
    expect(within(szczegol).getByTestId('mvd-jakosc-af-proweniencja')).toBeTruthy();
    // Tryb podstawowy: brak przycisku śladu.
    expect(screen.queryByTestId('mvd-jakosc-af-slad-otworz')).toBeNull();
    unmount();

    mockedArcFlash.mockResolvedValue(AF_FIXTURE);
    render(<SekcjaArcFlash {...props({ trybZaawansowania: 'expert' })} />);
    fireEvent.click(screen.getByTestId('mvd-jakosc-af-licz'));
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-arcflash')).toBeTruthy());
    fireEvent.click(screen.getByText('bus-1').closest('tr')!);
    fireEvent.click(screen.getByTestId('mvd-jakosc-af-slad-otworz'));
    expect(screen.getByTestId('mvd-jakosc-af-slad')).toBeTruthy();
  });
});
