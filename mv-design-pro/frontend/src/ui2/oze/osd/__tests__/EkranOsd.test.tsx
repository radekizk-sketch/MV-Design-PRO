/*
 * Testy okna „Odpowiedź na polecenia OSD" (karta P40, kryteria §3). Weryfikują:
 * stan braku przebiegu i braku źródeł, jawny bieg z wyborem źródła i polecenia,
 * przełączanie pól parametrów per polecenie, karty porównania przed/po, tabelę
 * napięć, rozwijany ślad WHITE BOX, stan błędu oraz odsłanianie identyfikatorów
 * tylko w trybie eksperckim. API i store'y mockowane; fixtures 1:1 z backendem.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { EkranOsd } from '../EkranOsd';
import {
  przebiegFixture,
  snapshotBezZrodelFixture,
  snapshotFixture,
  widokOsdFixture,
} from './fixtures';
import { OSD_STRINGS } from '../strings';

const pobierzOsd = vi.fn();
vi.mock('../../api', () => ({
  pobierzOdpowiedzOsd: (zapytanie: unknown) => pobierzOsd(zapytanie),
}));

function ustawGotowyRozplyw() {
  useExecutionRunsStore.setState({
    runs: [przebiegFixture({ id: 'lf-run', analysis_type: 'LOAD_FLOW', status: 'DONE' })],
    activeRunId: 'lf-run',
  });
  useSnapshotStore.setState({ snapshot: snapshotFixture() });
}

beforeEach(() => {
  useExecutionRunsStore.getState().reset();
  useSnapshotStore.getState().reset();
});
afterEach(() => {
  useExecutionRunsStore.getState().reset();
  useSnapshotStore.getState().reset();
  vi.clearAllMocks();
});

describe('EkranOsd — stany wejściowe (kryterium 1)', () => {
  it('bez zakończonego rozpływu pokazuje instrukcję, bez formularza i bez API', () => {
    render(<EkranOsd trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-osd-brak-przebiegu')).toHaveTextContent(
      'Brak zakończonego przebiegu rozpływu mocy',
    );
    expect(screen.queryByTestId('mvd-osd-parametry')).not.toBeInTheDocument();
    expect(pobierzOsd).not.toHaveBeenCalled();
  });

  it('z przebiegiem ale bez źródeł w modelu pokazuje uczciwy stan „brak źródeł"', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'lf-run', analysis_type: 'LOAD_FLOW', status: 'DONE' })],
      activeRunId: 'lf-run',
    });
    useSnapshotStore.setState({ snapshot: snapshotBezZrodelFixture() });
    render(<EkranOsd trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-osd-brak-zrodel')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-osd-parametry')).not.toBeInTheDocument();
  });
});

describe('EkranOsd — jawny bieg i parametry polecenia (kryterium 1)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('z przebiegiem i źródłami pokazuje formularz i stan „uruchom", nie woła API', () => {
    render(<EkranOsd trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-osd-parametry')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-osd-idle')).toBeInTheDocument();
    // Domyślne polecenie = ograniczenie P → pole limitu widoczne.
    expect(screen.getByTestId('mvd-osd-limit-p')).toBeInTheDocument();
    expect(pobierzOsd).not.toHaveBeenCalled();
  });

  it('przycisk biegu zablokowany bez wyboru źródła', () => {
    render(<EkranOsd trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-osd-oblicz')).toBeDisabled();
    fireEvent.click(screen.getByTestId('mvd-osd-oblicz'));
    expect(pobierzOsd).not.toHaveBeenCalled();
  });

  it('po wyborze źródła bieg woła API z poleceniem ograniczenia P i wartością wstępną', async () => {
    pobierzOsd.mockResolvedValue(widokOsdFixture());
    render(<EkranOsd trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-osd-zrodlo'), { target: { value: 'gen_sync' } });
    fireEvent.click(screen.getByTestId('mvd-osd-oblicz'));
    expect(await screen.findByTestId('mvd-osd-wynik')).toBeInTheDocument();
    expect(pobierzOsd.mock.calls[0][0]).toMatchObject({
      runId: 'lf-run',
      sourceRef: 'gen_sync',
      command: 'ograniczenie_p',
      pLimitPct: 60,
    });
    // Parametry innych poleceń nie są wysyłane.
    expect(pobierzOsd.mock.calls[0][0].cosPhi).toBeUndefined();
    expect(pobierzOsd.mock.calls[0][0].frequencyHz).toBeUndefined();
  });

  it('polecenie cosφ odsłania pola cosφ i charakteru oraz wysyła je do biegu', async () => {
    pobierzOsd.mockResolvedValue(widokOsdFixture());
    render(<EkranOsd trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-osd-zrodlo'), { target: { value: 'gen_sync' } });
    fireEvent.change(screen.getByTestId('mvd-osd-polecenie'), { target: { value: 'cosfi' } });
    expect(screen.getByTestId('mvd-osd-cosfi')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-osd-charakter')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-osd-limit-p')).not.toBeInTheDocument();
    // Zasada wywodów KaTeX (2026-07-22): konsekwencja Q = ±|P|·tan(arccos cosφ)
    // w opisie parametru renderuje KaTeX (math-rendered), nie surowy tekst.
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(1);
    expect(
      wzory.some((w) => (w.getAttribute('data-latex') ?? '').includes('\\pm|P| \\cdot \\tan')),
    ).toBe(true);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
    fireEvent.click(screen.getByTestId('mvd-osd-oblicz'));
    await screen.findByTestId('mvd-osd-wynik');
    expect(pobierzOsd.mock.calls[0][0]).toMatchObject({
      command: 'cosfi',
      cosPhi: 0.95,
      qCharakter: 'podwzbudny',
    });
  });

  it('polecenie LFSM-O wysyła częstotliwość, statyzm i strefę martwą', async () => {
    pobierzOsd.mockResolvedValue(widokOsdFixture());
    render(<EkranOsd trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-osd-zrodlo'), { target: { value: 'gen_sync' } });
    fireEvent.change(screen.getByTestId('mvd-osd-polecenie'), { target: { value: 'lfsm_o' } });
    fireEvent.change(screen.getByTestId('mvd-osd-czestotliwosc'), { target: { value: '50.5' } });
    fireEvent.click(screen.getByTestId('mvd-osd-oblicz'));
    await screen.findByTestId('mvd-osd-wynik');
    expect(pobierzOsd.mock.calls[0][0]).toMatchObject({
      command: 'lfsm_o',
      frequencyHz: 50.5,
      droopPct: 5,
      deadbandHz: 0.2,
    });
  });

  it('błąd końcówki → jawny stan błędu z komunikatem PL', async () => {
    pobierzOsd.mockRejectedValue(new Error('422 nieznane źródło'));
    render(<EkranOsd trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-osd-zrodlo'), { target: { value: 'gen_sync' } });
    fireEvent.click(screen.getByTestId('mvd-osd-oblicz'));
    expect(await screen.findByTestId('mvd-osd-blad')).toHaveTextContent('422 nieznane źródło');
  });
});

describe('EkranOsd — prezentacja wyniku (kryteria 2, 3, 4)', () => {
  beforeEach(ustawGotowyRozplyw);

  async function uruchomBieg(tryb: 'basic' | 'expert' = 'basic') {
    pobierzOsd.mockResolvedValue(widokOsdFixture());
    render(<EkranOsd trybZaawansowania={tryb} />);
    fireEvent.change(screen.getByTestId('mvd-osd-zrodlo'), { target: { value: 'gen_sync' } });
    fireEvent.click(screen.getByTestId('mvd-osd-oblicz'));
    await screen.findByTestId('mvd-osd-wynik');
  }

  it('karty porównania pokazują delty P źródła i strat (kryterium 2)', async () => {
    await uruchomBieg();
    expect(screen.getByTestId('mvd-osd-karty')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-osd-delta-p_zrodla')).toHaveTextContent('−1,000');
    expect(screen.getByTestId('mvd-osd-delta-straty_p')).toHaveTextContent('−0,030');
  });

  it('tabela napięć węzłów renderuje się z ΔU (kryterium 3)', async () => {
    await uruchomBieg();
    const tabela = screen.getByTestId('mvd-wyn-tabela');
    expect(tabela).toBeInTheDocument();
    // Węzły w tabeli (Szyna A także w założeniach — zawężamy do tabeli).
    expect(within(tabela).getByText('Szyna A')).toBeInTheDocument();
    expect(within(tabela).getByText('Szyna B')).toBeInTheDocument();
  });

  it('rozwija ślad WHITE BOX (reużyty SladAnalizy) (kryterium 4)', async () => {
    await uruchomBieg();
    expect(screen.queryByTestId('mvd-osd-slad')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-osd-slad-otworz'));
    expect(screen.getByTestId('mvd-osd-slad')).toHaveTextContent('2,000 → 1,000 MW');
  });

  it('tryb podstawowy ukrywa identyfikator wejścia (hash)', async () => {
    await uruchomBieg('basic');
    expect(screen.queryByTestId('mvd-osd-eksp-hash')).not.toBeInTheDocument();
  });

  it('tryb ekspercki odsłania hash oraz identyfikatory źródła i przebiegu', async () => {
    await uruchomBieg('expert');
    expect(screen.getByTestId('mvd-osd-eksp-hash')).toHaveTextContent('a1b2c3d4e5f6');
    const wynik = screen.getByTestId('mvd-osd-wynik');
    expect(wynik).toHaveTextContent('gen_sync');
    expect(wynik).toHaveTextContent('run-osd-1');
  });
});
