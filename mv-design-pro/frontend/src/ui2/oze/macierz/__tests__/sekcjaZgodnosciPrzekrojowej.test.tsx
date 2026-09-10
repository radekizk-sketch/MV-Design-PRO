/*
 * Sekcja "Zgodność przekrojowa przypadku" (karta W3-D, 2026-09-09).
 * Pokrycie: stan zerowy (brak przypadku / brak DER / błąd) × dane × natywny
 * klik odświeżenia — KLASA NIE INSTANCJA, nie tylko przykład z karty.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { fetchNcRfgCaseCompliance } from '../../../../ui/ncrfg-tests/api';
import { SekcjaZgodnosciPrzekrojowej } from '../SekcjaZgodnosciPrzekrojowej';

vi.mock('../../../../ui/ncrfg-tests/api', () => ({
  fetchNcRfgCaseCompliance: vi.fn(),
}));

const fetchMock = vi.mocked(fetchNcRfgCaseCompliance);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SekcjaZgodnosciPrzekrojowej — stan zerowy: brak przypadku', () => {
  it('bez caseId NIE woła API i pokazuje komunikat "wybierz przypadek"', async () => {
    render(<SekcjaZgodnosciPrzekrojowej caseId={null} operatorId="enea" nazwyModulow={{}} />);
    expect(await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-brak-przypadku')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('przycisk odświeżenia jest wyłączony bez aktywnego przypadku', async () => {
    render(<SekcjaZgodnosciPrzekrojowej caseId={null} operatorId="enea" nazwyModulow={{}} />);
    expect(await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-odswiez')).toBeDisabled();
  });
});

describe('SekcjaZgodnosciPrzekrojowej — stan zerowy: brak DER', () => {
  it('caseId obecny, der_count=0 → komunikat "brak źródła", zero wierszy tabeli', async () => {
    fetchMock.mockResolvedValueOnce({
      case_id: 'case-1',
      operator_id: 'enea',
      der_count: 0,
      reports: [],
    });
    render(<SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="enea" nazwyModulow={{}} />);
    expect(await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-brak-der')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-oze-zgodnosc-przekrojowa-tabela')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('case-1', 'enea');
  });
});

describe('SekcjaZgodnosciPrzekrojowej — stan zerowy: błąd', () => {
  it('odrzucenie zapytania pokazuje komunikat błędu z treścią wyjątku', async () => {
    fetchMock.mockRejectedValueOnce(new Error('backend padł'));
    render(<SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="enea" nazwyModulow={{}} />);
    const blad = await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-blad');
    expect(blad).toHaveTextContent('backend padł');
    expect(screen.queryByTestId('mvd-oze-zgodnosc-przekrojowa-tabela')).not.toBeInTheDocument();
  });

  it('błąd bez komunikatu Error (rzut nie-Error) używa etykiety generycznej', async () => {
    fetchMock.mockRejectedValueOnce('coś się zepsuło');
    render(<SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="enea" nazwyModulow={{}} />);
    const blad = await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-blad');
    expect(blad).toHaveTextContent('Nie udało się sprawdzić zgodności przekrojowej');
  });
});

describe('SekcjaZgodnosciPrzekrojowej — dane: tabela werdyktów', () => {
  it('renderuje wiersz per moduł z nazwą (ze słownika), klasą, mocą, napięciem, werdyktem i licznikiem testów', async () => {
    fetchMock.mockResolvedValueOnce({
      case_id: 'case-1',
      operator_id: 'enea',
      der_count: 2,
      reports: [
        {
          operator_id: 'enea',
          operator_name_pl: 'Enea Operator',
          der_ref: 'pv-1',
          module_type: 'B',
          p_max_kw: 500,
          voltage_kv: 15,
          test_results: [],
          overall_pass: true,
          total_tests: 10,
          passed_count: 10,
          no_module_count: 0,
        },
        {
          operator_id: 'enea',
          operator_name_pl: 'Enea Operator',
          der_ref: 'bess-1',
          module_type: 'C',
          p_max_kw: 800,
          voltage_kv: 15,
          test_results: [
            { test_id: 'T4', test_name_pl: 'Regulacja Q(U)', verdict: 'fail', message_pl: 'Brak krzywej Q(U).' },
          ],
          overall_pass: false,
          total_tests: 10,
          passed_count: 9,
          no_module_count: 0,
        },
      ],
    });
    render(
      <SekcjaZgodnosciPrzekrojowej
        caseId="case-1"
        operatorId="enea"
        nazwyModulow={{ 'pv-1': 'PV Dach A', 'bess-1': 'Magazyn energii 1' }}
      />,
    );

    const tabela = await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-tabela');
    expect(within(tabela).getByText('PV Dach A')).toBeInTheDocument();
    expect(within(tabela).getByText('Magazyn energii 1')).toBeInTheDocument();

    const werdyktZgodny = screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-werdykt-pv-1');
    expect(werdyktZgodny).toHaveTextContent('zgodny');
    const werdyktNiezgodny = screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-werdykt-bess-1');
    expect(werdyktNiezgodny).toHaveTextContent('niezgodny');

    // Podsumowanie: 2 moduły, 1 zgodny, 1 niezgodny.
    const podsum = screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-podsum');
    expect(podsum).toHaveTextContent('2');
    expect(podsum).toHaveTextContent('Enea Operator');

    // Niezgodny moduł dostaje listę niespełnionych wymagań z uzasadnieniem.
    const niespelniony = screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-niespelniony-bess-1');
    expect(niespelniony).toHaveTextContent('Regulacja Q(U)');
    expect(niespelniony).toHaveTextContent('Brak krzywej Q(U).');
    // Zgodny moduł NIE dostaje wpisu na liście niespełnionych.
    expect(
      screen.queryByTestId('mvd-oze-zgodnosc-przekrojowa-niespelniony-pv-1'),
    ).not.toBeInTheDocument();
  });

  it('moduł bez wpisu w słowniku nazw pokazuje der_ref (uczciwy fallback)', async () => {
    fetchMock.mockResolvedValueOnce({
      case_id: 'case-1',
      operator_id: 'enea',
      der_count: 1,
      reports: [
        {
          operator_id: 'enea',
          operator_name_pl: 'Enea Operator',
          der_ref: 'pv-nieznany-w-store',
          module_type: 'A',
          p_max_kw: 50,
          voltage_kv: 0.4,
          test_results: [],
          overall_pass: true,
          total_tests: 3,
          passed_count: 3,
          no_module_count: 0,
        },
      ],
    });
    render(<SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="enea" nazwyModulow={{}} />);
    const tabela = await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-tabela');
    expect(within(tabela).getByText('pv-nieznany-w-store')).toBeInTheDocument();
  });
});

describe('SekcjaZgodnosciPrzekrojowej — natywny klik: odśwież', () => {
  it('klik przycisku odświeżenia ponawia zapytanie z aktualnym operatorId', async () => {
    fetchMock.mockResolvedValue({
      case_id: 'case-1',
      operator_id: 'enea',
      der_count: 0,
      reports: [],
    });
    render(<SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="enea" nazwyModulow={{}} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const przycisk = screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-odswiez');
    fireEvent.click(przycisk);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith('case-1', 'enea');
  });

  it('zmiana operatorId (prop) automatycznie ponawia zapytanie — nie wymaga kliku', async () => {
    fetchMock.mockResolvedValue({
      case_id: 'case-1',
      operator_id: 'enea',
      der_count: 0,
      reports: [],
    });
    const { rerender } = render(
      <SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="enea" nazwyModulow={{}} />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(<SekcjaZgodnosciPrzekrojowej caseId="case-1" operatorId="pge" nazwyModulow={{}} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith('case-1', 'pge');
  });
});
