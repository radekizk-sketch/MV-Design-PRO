/*
 * Testy okna „Zdolność przyłączeniowa" (karta P2, kryteria §4). Weryfikują:
 * stan braku przebiegu, jawny bieg z parametrami i wyborem węzłów, tabelę per
 * węzeł z kryterium wiążącym PL, rozwijany ślad scenariuszy, wykres słupkowy,
 * stan błędu oraz odsłanianie identyfikatorów tylko w trybie eksperckim.
 * API i store'y mockowane/ustawiane; fixtures 1:1 z backendem.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { EkranZdolnosci } from '../EkranZdolnosci';
import { przebiegFixture, snapshotFixture, widokZdolnosciFixture } from './fixtures';

const pobierz = vi.fn();
vi.mock('../../api', () => ({
  pobierzZdolnoscPrzylaczeniowa: (zapytanie: unknown) => pobierz(zapytanie),
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

describe('EkranZdolnosci — brak przebiegu rozpływu (kryterium 1)', () => {
  it('bez zakończonego rozpływu pokazuje instrukcję, bez formularza i bez wywołania API', () => {
    render(<EkranZdolnosci trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-zdol-brak-przebiegu')).toHaveTextContent(
      'Brak zakończonego przebiegu rozpływu mocy',
    );
    expect(screen.queryByTestId('mvd-zdol-parametry')).not.toBeInTheDocument();
    expect(pobierz).not.toHaveBeenCalled();
  });
});

describe('EkranZdolnosci — jawny bieg (kryterium 1)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('z przebiegiem pokazuje formularz i stan „uruchom", nie woła API przed kliknięciem', () => {
    render(<EkranZdolnosci trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-zdol-parametry')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-zdol-idle')).toBeInTheDocument();
    expect(pobierz).not.toHaveBeenCalled();
  });

  it('kliknięcie „Oblicz" woła API z przebiegiem i domyślnymi parametrami', async () => {
    pobierz.mockResolvedValue(widokZdolnosciFixture());
    render(<EkranZdolnosci trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-zdol-oblicz'));
    expect(await screen.findByTestId('mvd-zdol-wynik')).toBeInTheDocument();
    expect(pobierz).toHaveBeenCalledWith({
      runId: 'lf-run',
      candidateBusRefs: undefined,
      stepMw: 0.5,
      maxSteps: 40,
    });
  });

  it('bez wyboru węzłów wysyła domyślnych kandydatów (candidateBusRefs undefined)', async () => {
    pobierz.mockResolvedValue(widokZdolnosciFixture());
    render(<EkranZdolnosci trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-zdol-oblicz'));
    await screen.findByTestId('mvd-zdol-wynik');
    expect(pobierz.mock.calls[0][0].candidateBusRefs).toBeUndefined();
  });

  it('wybór węzłów przekazuje candidate_bus_refs do zapytania', async () => {
    pobierz.mockResolvedValue(widokZdolnosciFixture());
    render(<EkranZdolnosci trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-zdol-wybor-bus-a'));
    fireEvent.click(screen.getByTestId('mvd-zdol-oblicz'));
    await screen.findByTestId('mvd-zdol-wynik');
    expect(pobierz.mock.calls[0][0].candidateBusRefs).toEqual(['bus-a']);
  });

  it('zmienione parametry (krok/liczba kroków) trafiają do zapytania', async () => {
    pobierz.mockResolvedValue(widokZdolnosciFixture());
    render(<EkranZdolnosci trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-zdol-krok'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('mvd-zdol-max'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('mvd-zdol-oblicz'));
    await screen.findByTestId('mvd-zdol-wynik');
    expect(pobierz.mock.calls[0][0]).toMatchObject({ stepMw: 1, maxSteps: 10 });
  });

  it('błąd końcówki → jawny stan błędu z komunikatem', async () => {
    pobierz.mockRejectedValue(new Error('422 zły przebieg'));
    render(<EkranZdolnosci trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-zdol-oblicz'));
    expect(await screen.findByTestId('mvd-zdol-blad')).toHaveTextContent('422 zły przebieg');
  });
});

describe('EkranZdolnosci — tabela i wykres (kryteria 2, 3)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('tabela pokazuje moc przyłączalną i kryterium wiążące PL per węzeł', async () => {
    pobierz.mockResolvedValue(widokZdolnosciFixture());
    render(<EkranZdolnosci trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-zdol-oblicz'));
    await screen.findByTestId('mvd-zdol-tabela');
    expect(screen.getByTestId('mvd-zdol-generacja-bus-a')).toHaveTextContent('2,000 MW');
    expect(screen.getByTestId('mvd-zdol-moc-bus-a')).toHaveTextContent('1,500 MW');
    expect(screen.getByTestId('mvd-zdol-kryterium-bus-a')).toHaveTextContent('Odchylenie napięcia');
    expect(screen.getByTestId('mvd-zdol-kryterium-bus-b')).toHaveTextContent('Brak');
  });

  it('renderuje wykres słupkowy mocy przyłączalnej', async () => {
    pobierz.mockResolvedValue(widokZdolnosciFixture());
    render(<EkranZdolnosci trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-zdol-oblicz'));
    expect(await screen.findByTestId('mvd-zdol-wykres')).toBeInTheDocument();
  });
});

describe('EkranZdolnosci — ślad scenariuszy (kryterium 4)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('rozwija ślad scenariuszy per węzeł (moc → dopuszczalny/niedopuszczalny)', async () => {
    pobierz.mockResolvedValue(widokZdolnosciFixture());
    render(<EkranZdolnosci trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-zdol-oblicz'));
    await screen.findByTestId('mvd-zdol-wynik');
    expect(screen.queryByTestId('mvd-zdol-slad-bus-a')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-zdol-slad-otworz-bus-a'));
    const slad = screen.getByTestId('mvd-zdol-slad-bus-a');
    expect(slad).toHaveTextContent('Dopuszczalny');
    expect(slad).toHaveTextContent('Niedopuszczalny');
  });
});

describe('EkranZdolnosci — tryb ekspercki (identyfikatory)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('tryb podstawowy ukrywa identyfikator wejścia (hash)', async () => {
    pobierz.mockResolvedValue(widokZdolnosciFixture());
    render(<EkranZdolnosci trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-zdol-oblicz'));
    await screen.findByTestId('mvd-zdol-wynik');
    expect(screen.queryByTestId('mvd-zdol-eksp')).not.toBeInTheDocument();
  });

  it('tryb ekspercki odsłania identyfikator wejścia i przebiegu', async () => {
    pobierz.mockResolvedValue(widokZdolnosciFixture());
    render(<EkranZdolnosci trybZaawansowania="expert" />);
    fireEvent.click(screen.getByTestId('mvd-zdol-oblicz'));
    await screen.findByTestId('mvd-zdol-wynik');
    const eksp = screen.getByTestId('mvd-zdol-eksp');
    expect(eksp).toHaveTextContent('a1b2c3d4e5f6');
    expect(eksp).toHaveTextContent('run-lf-1');
  });
});

describe('EkranZdolnosci — pętla wynik → model (K5-B / H-3 pkt 1)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('„Przyłącz źródło w tym węźle" otwiera formularz add_converter_source z preselekcją bus_ref i przechodzi do przestrzeni Schemat', async () => {
    const { useNetworkBuildStore } = await import('../../../../ui/network-build/networkBuildStore');
    const { useShellStore } = await import('../../../shell/useShellStore');
    pobierz.mockResolvedValue(widokZdolnosciFixture());
    render(<EkranZdolnosci trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-zdol-oblicz'));
    await screen.findByTestId('mvd-zdol-wynik');

    // Realna ścieżka: natywny klik akcji w wierszu węzła.
    fireEvent.click(screen.getByTestId('mvd-zdol-przylacz-bus-a'));

    const surface = useNetworkBuildStore.getState().activeSurface;
    expect(surface?.routeState.payload?.delegate).toBe('operation_form');
    expect(surface?.routeState.payload?.operation).toBe('add_converter_source');
    const context = surface?.routeState.payload?.context as Record<string, unknown>;
    expect(context.bus_ref).toBe('bus-a');
    // Formularze operacji domenowych żyją na kanwie schematu.
    expect(useShellStore.getState().activeSpace).toBe('schemat');

    // Sprzątanie stanu współdzielonych store'ów (izolacja kolejnych testów pliku).
    useNetworkBuildStore.getState().closeOperationForm();
    useShellStore.getState().setActiveSpace('projekt');
    window.location.hash = '';
  });
});
