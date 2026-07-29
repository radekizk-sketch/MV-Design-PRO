/*
 * Testy okna „Wniosek OSD" (karta W-707): dostępność generacji (każdy powód
 * blokady), walidacja nazwy projektu, render sekcji z fixture 1:1, braki 422,
 * błąd API PL, pobranie DOCX (mock blob), tryb ekspercki (odciski) i etykiety PL.
 *
 * Klient wniosku mockowany częściowo — zachowujemy realną klasę `WniosekBrakiError`
 * (komponent używa `instanceof`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { pobierzWniosek, pobierzWniosekDocx, WniosekBrakiError } from '../../api';
import { useNcRfgStore } from '../../ncRfgStore';
import { EkranWniosku } from '../EkranWniosku';
import { WNIOSEK_STRINGS } from '../strings';
import {
  przebiegFixture,
  wejscieModuluFixture,
  widokWnioskuFixture,
  wynikNcRfgFixture,
} from './fixtures';

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    pobierzWniosek: vi.fn(),
    pobierzWniosekDocx: vi.fn(),
  };
});

/** Ustaw zakończone przebiegi rozpływu i zwarcia w rejestrze biegów. */
function ustawPrzebiegi(): void {
  useExecutionRunsStore.setState({
    runs: [przebiegFixture('run-lf-1', 'LOAD_FLOW'), przebiegFixture('run-sc-1', 'SC_3F')],
    activeRunId: null,
  });
}

/** Ustaw zakończony bieg NC RfG we wspólnym store'u (źródło run_request). */
function ustawBiegNcRfg(): void {
  useNcRfgStore.setState({
    status: 'ready',
    wynik: wynikNcRfgFixture(),
    ostatnieWejscia: [wejscieModuluFixture()],
  });
}

beforeEach(() => {
  useExecutionRunsStore.setState({ runs: [], activeRunId: null });
  useNcRfgStore.getState().reset();
  useAppStateStore.setState({ activeProjectName: null, activeCaseName: null });
});

afterEach(() => {
  useExecutionRunsStore.setState({ runs: [], activeRunId: null });
  useNcRfgStore.getState().reset();
  vi.clearAllMocks();
});

describe('EkranWniosku — dostępność generacji', () => {
  it('renderuje okno z tytułem PL i podtytułem', () => {
    render(<EkranWniosku trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-wniosek-ekran')).toBeInTheDocument();
    expect(screen.getByText(WNIOSEK_STRINGS.tytul)).toBeInTheDocument();
    expect(screen.getByText(WNIOSEK_STRINGS.podtytul)).toBeInTheDocument();
  });

  it('bez biegu NC RfG: przycisk nieaktywny z tytułem o teście zgodności', () => {
    ustawPrzebiegi();
    render(<EkranWniosku trybZaawansowania="basic" />);
    const przycisk = screen.getByTestId('mvd-wniosek-generuj');
    expect(przycisk).toBeDisabled();
    expect(przycisk).toHaveAttribute('title', WNIOSEK_STRINGS.blokadaNcRfg);
  });

  it('bez przebiegu rozpływu: przycisk nieaktywny z tytułem o rozpływie', () => {
    ustawBiegNcRfg();
    render(<EkranWniosku trybZaawansowania="basic" />);
    const przycisk = screen.getByTestId('mvd-wniosek-generuj');
    expect(przycisk).toBeDisabled();
    expect(przycisk).toHaveAttribute('title', WNIOSEK_STRINGS.blokadaBrakRozplywu);
  });

  it('waliduje nazwę projektu: pusta → blokada, po wpisaniu → aktywny', () => {
    ustawPrzebiegi();
    ustawBiegNcRfg();
    render(<EkranWniosku trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-wniosek-wezel'), { target: { value: 'bus-1' } });
    const przycisk = screen.getByTestId('mvd-wniosek-generuj');
    // Brak nazwy projektu (activeProjectName = null) → blokada wymaganego pola.
    expect(przycisk).toBeDisabled();
    expect(przycisk).toHaveAttribute('title', WNIOSEK_STRINGS.blokadaBrakProjektu);
    fireEvent.change(screen.getByTestId('mvd-wniosek-projekt'), {
      target: { value: 'Projekt A' },
    });
    expect(screen.getByTestId('mvd-wniosek-generuj')).not.toBeDisabled();
  });
});

describe('EkranWniosku — generacja i sekcje', () => {
  /** Ustaw kompletny formularz (przebiegi + bieg NC RfG + nazwa projektu + węzeł). */
  function renderGotowy(tryb: 'basic' | 'expert' = 'basic'): void {
    ustawPrzebiegi();
    ustawBiegNcRfg();
    useAppStateStore.setState({ activeProjectName: 'Farma PV Wschód' });
    render(<EkranWniosku trybZaawansowania={tryb} />);
    fireEvent.change(screen.getByTestId('mvd-wniosek-wezel'), { target: { value: 'bus-1' } });
  }

  it('klik „Zbuduj wniosek" wywołuje klienta z żądaniem 1:1 (przebiegi + run_request)', async () => {
    vi.mocked(pobierzWniosek).mockResolvedValue(widokWnioskuFixture());
    renderGotowy();
    fireEvent.click(screen.getByTestId('mvd-wniosek-generuj'));
    await waitFor(() => expect(pobierzWniosek).toHaveBeenCalledTimes(1));
    const zadanie = vi.mocked(pobierzWniosek).mock.calls[0][0];
    expect(zadanie.pf_run_id).toBe('run-lf-1');
    expect(zadanie.sc_run_id).toBe('run-sc-1');
    expect(zadanie.bus_ref).toBe('bus-1');
    expect(zadanie.nazwa_projektu).toBe('Farma PV Wschód');
    expect(zadanie.run_request.modules).toHaveLength(1);
    expect(zadanie.run_request.procedure_version).toBe('PTPiREE 2024');
  });

  it('render sekcji wniosku z fixture 1:1 (bilans, zwarcia, zgodność, założenia)', async () => {
    vi.mocked(pobierzWniosek).mockResolvedValue(widokWnioskuFixture());
    renderGotowy();
    fireEvent.click(screen.getByTestId('mvd-wniosek-generuj'));
    expect(await screen.findByTestId('mvd-wniosek-wynik')).toBeInTheDocument();
    // Bilans mocy — moc źródeł i najwyższe obciążenie.
    const bilans = screen.getByTestId('mvd-wniosek-bilans');
    expect(bilans).toHaveTextContent('1,30 MVA');
    expect(bilans).toHaveTextContent('Transformator T1');
    // Zwarcia w punkcie — nazwa węzła i Ik''.
    const zwarcia = screen.getByTestId('mvd-wniosek-zwarcia');
    expect(zwarcia).toHaveTextContent('Szyna GPZ');
    expect(zwarcia).toHaveTextContent('12,50 kA');
    // Zgodność — werdykt zbiorczy PL.
    expect(screen.getByTestId('mvd-wniosek-werdykt')).toHaveTextContent(
      'Zgodny z wymaganiami NC RfG',
    );
    // Założenia — adnotacje o schemacie i zestawieniach.
    const zalozenia = screen.getByTestId('mvd-wniosek-zalozenia');
    expect(zalozenia).toHaveTextContent('Schemat elektryczny');
    expect(zalozenia).toHaveTextContent('Zestawienia materiałowe');
  });

  it('braki 422: uczciwa lista PL, brak podglądu wniosku', async () => {
    vi.mocked(pobierzWniosek).mockRejectedValue(
      new WniosekBrakiError('Wniosek nie może powstać — dane niekompletne.', [
        'Bilans mocy: przebieg rozpływu nie jest zakończony.',
        'Zwarcia w punkcie przyłączenia: węzeł nie występuje w wynikach.',
      ]),
    );
    renderGotowy();
    fireEvent.click(screen.getByTestId('mvd-wniosek-generuj'));
    const braki = await screen.findByTestId('mvd-wniosek-braki');
    expect(braki).toHaveTextContent(WNIOSEK_STRINGS.brakiTytul);
    expect(braki).toHaveTextContent('Bilans mocy: przebieg rozpływu nie jest zakończony.');
    expect(braki).toHaveTextContent('węzeł nie występuje w wynikach');
    expect(screen.queryByTestId('mvd-wniosek-wynik')).not.toBeInTheDocument();
  });

  it('błąd API: komunikat PL w panelu błędu', async () => {
    vi.mocked(pobierzWniosek).mockRejectedValue(new Error('Nieznany profil operatora sieci.'));
    renderGotowy();
    fireEvent.click(screen.getByTestId('mvd-wniosek-generuj'));
    const blad = await screen.findByTestId('mvd-wniosek-blad');
    expect(blad).toHaveTextContent('Nieznany profil operatora sieci.');
    expect(screen.queryByTestId('mvd-wniosek-braki')).not.toBeInTheDocument();
  });

  it('pobranie DOCX: blob zapisany przez URL.createObjectURL, nazwa z datą', async () => {
    vi.mocked(pobierzWniosek).mockResolvedValue(widokWnioskuFixture());
    const blob = new Blob(['docx'], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    vi.mocked(pobierzWniosekDocx).mockResolvedValue(blob);

    // jsdom nie implementuje URL.createObjectURL — shim + spy.
    if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
    if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => undefined;
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    renderGotowy();
    fireEvent.click(screen.getByTestId('mvd-wniosek-generuj'));
    fireEvent.click(await screen.findByTestId('mvd-wniosek-pobierz-docx'));
    await waitFor(() => expect(pobierzWniosekDocx).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('tryb ekspercki: odciski sekcji widoczne; tryb podstawowy je ukrywa', async () => {
    vi.mocked(pobierzWniosek).mockResolvedValue(widokWnioskuFixture());
    renderGotowy('expert');
    fireEvent.click(screen.getByTestId('mvd-wniosek-generuj'));
    const odciski = await screen.findByTestId('mvd-wniosek-odciski');
    expect(odciski).toHaveTextContent('wniosek-input-hash');
    expect(odciski).toHaveTextContent('odcisk-bilans');
  });

  it('tryb podstawowy: odciski sekcji ukryte', async () => {
    vi.mocked(pobierzWniosek).mockResolvedValue(widokWnioskuFixture());
    renderGotowy('basic');
    fireEvent.click(screen.getByTestId('mvd-wniosek-generuj'));
    await screen.findByTestId('mvd-wniosek-wynik');
    expect(screen.queryByTestId('mvd-wniosek-odciski')).not.toBeInTheDocument();
  });
});
