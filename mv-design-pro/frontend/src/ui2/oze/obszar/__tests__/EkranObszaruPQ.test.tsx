/*
 * Testy okna „Obszar bezpiecznej pracy P–Q" (karta P30, kryteria §3). Weryfikują:
 * stan braku przebiegu, jawny bieg z wyborem węzła i parametrami siatki, blokadę
 * biegu bez węzła, tabelę wierzchołków + wykres, założenia z liczbą biegów,
 * rozwijany ślad zredukowany, nakładkę krzywej producenta, stan błędu oraz
 * odsłanianie identyfikatorów tylko w trybie eksperckim. API i store'y mockowane;
 * fixtures 1:1 z backendem.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { EkranObszaruPQ } from '../EkranObszaruPQ';
import {
  przebiegFixture,
  rekordyKonwerterowFixture,
  snapshotFixture,
  widokObszaruFixture,
} from './fixtures';
import { OBSZAR_STRINGS } from '../strings';

const pobierzObszar = vi.fn();
const pobierzKonwertery = vi.fn();
vi.mock('../../api', () => ({
  pobierzObszarPQ: (zapytanie: unknown) => pobierzObszar(zapytanie),
  pobierzKonwertery: () => pobierzKonwertery(),
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
  pobierzKonwertery.mockResolvedValue(rekordyKonwerterowFixture());
});
afterEach(() => {
  useExecutionRunsStore.getState().reset();
  useSnapshotStore.getState().reset();
  vi.clearAllMocks();
});

describe('EkranObszaruPQ — brak przebiegu rozpływu (kryterium 1)', () => {
  it('bez zakończonego rozpływu pokazuje instrukcję, bez formularza i bez wywołania API', async () => {
    render(<EkranObszaruPQ trybZaawansowania="basic" />);
    // Montaż pobiera katalog konwerterów (mikrotaski), ale bez przebiegu
    // formularz (a z nim select typów) nie jest renderowany — skutek fetchu nie
    // ma reprezentacji w UI, więc nie ma na co czekać przez findBy*/waitFor.
    // Puste act(async) domyka te mikrotaski w act — bez niego React zgłasza
    // „An update to EkranObszaruPQ was not wrapped in act(...)".
    await act(async () => {});
    expect(screen.getByTestId('mvd-obszar-brak-przebiegu')).toHaveTextContent(
      'Brak zakończonego przebiegu rozpływu mocy',
    );
    expect(screen.queryByTestId('mvd-obszar-parametry')).not.toBeInTheDocument();
    expect(pobierzObszar).not.toHaveBeenCalled();
  });
});

describe('EkranObszaruPQ — jawny bieg (kryterium 1)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('z przebiegiem pokazuje formularz i stan „uruchom", nie woła API przed kliknięciem', async () => {
    render(<EkranObszaruPQ trybZaawansowania="basic" />);
    // Realny stan końcowy montażu: katalog konwerterów wczytany → opcja typu
    // falownika w selekcie nakładki (domyka aktualizację stanu w act).
    await screen.findByRole('option', { name: /Sungrow/ });
    expect(screen.getByTestId('mvd-obszar-parametry')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-obszar-idle')).toBeInTheDocument();
    expect(pobierzObszar).not.toHaveBeenCalled();
  });

  it('przycisk biegu jest zablokowany bez wyboru węzła', async () => {
    render(<EkranObszaruPQ trybZaawansowania="basic" />);
    // Realny stan końcowy montażu: opcja typu z katalogu (jak wyżej).
    await screen.findByRole('option', { name: /Sungrow/ });
    expect(screen.getByTestId('mvd-obszar-oblicz')).toBeDisabled();
    fireEvent.click(screen.getByTestId('mvd-obszar-oblicz'));
    expect(pobierzObszar).not.toHaveBeenCalled();
  });

  it('po wyborze węzła bieg woła API z przebiegiem, węzłem i domyślnymi parametrami siatki', async () => {
    pobierzObszar.mockResolvedValue(widokObszaruFixture());
    render(<EkranObszaruPQ trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-obszar-wezel'), { target: { value: 'bus-a' } });
    fireEvent.click(screen.getByTestId('mvd-obszar-oblicz'));
    expect(await screen.findByTestId('mvd-obszar-wynik')).toBeInTheDocument();
    expect(pobierzObszar).toHaveBeenCalledWith({
      runId: 'lf-run',
      busRef: 'bus-a',
      stepPMw: 0.5,
      stepQMvar: 0.25,
      maxStepsP: 20,
      maxStepsQ: 16,
    });
  });

  it('zmienione parametry siatki trafiają do zapytania', async () => {
    pobierzObszar.mockResolvedValue(widokObszaruFixture());
    render(<EkranObszaruPQ trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-obszar-wezel'), { target: { value: 'bus-a' } });
    fireEvent.change(screen.getByTestId('mvd-obszar-step-p'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('mvd-obszar-max-q'), { target: { value: '8' } });
    fireEvent.click(screen.getByTestId('mvd-obszar-oblicz'));
    await screen.findByTestId('mvd-obszar-wynik');
    expect(pobierzObszar.mock.calls[0][0]).toMatchObject({ stepPMw: 1, maxStepsQ: 8 });
  });

  it('błąd końcówki → jawny stan błędu z komunikatem', async () => {
    pobierzObszar.mockRejectedValue(new Error('422 zły przebieg'));
    render(<EkranObszaruPQ trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-obszar-wezel'), { target: { value: 'bus-a' } });
    fireEvent.click(screen.getByTestId('mvd-obszar-oblicz'));
    expect(await screen.findByTestId('mvd-obszar-blad')).toHaveTextContent('422 zły przebieg');
  });
});

describe('EkranObszaruPQ — tabela, wykres i założenia (kryteria 2, 3, 4)', () => {
  beforeEach(ustawGotowyRozplyw);

  async function uruchomBieg() {
    pobierzObszar.mockResolvedValue(widokObszaruFixture());
    render(<EkranObszaruPQ trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-obszar-wezel'), { target: { value: 'bus-a' } });
    fireEvent.click(screen.getByTestId('mvd-obszar-oblicz'));
    await screen.findByTestId('mvd-obszar-wynik');
  }

  it('renderuje wykres obszaru', async () => {
    await uruchomBieg();
    expect(screen.getByTestId('mvd-obszar-wykres')).toBeInTheDocument();
  });

  it('tabela wierzchołków pokazuje pasmo pracy i tag braku pasma', async () => {
    await uruchomBieg();
    // Dwa wierzchołki dopuszczalne → dwa tagi „Pasmo pracy"; jeden niedopuszczalny.
    expect(screen.getAllByText(OBSZAR_STRINGS.tagPasmo)).toHaveLength(2);
    expect(screen.getByText(OBSZAR_STRINGS.tagBrakPasma)).toBeInTheDocument();
  });

  it('założenia pokazują liczbę biegów (wykonane / górny limit)', async () => {
    await uruchomBieg();
    expect(screen.getByTestId('mvd-obszar-biegi')).toHaveTextContent('15 / 693');
  });

  it('rozwija zredukowany ślad siatki (reużyty SladAnalizy)', async () => {
    await uruchomBieg();
    expect(screen.queryByTestId('mvd-obszar-slad')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-obszar-slad-otworz'));
    expect(screen.getByTestId('mvd-obszar-slad')).toHaveTextContent('15 / 693');
  });
});

describe('EkranObszaruPQ — nakładka krzywej producenta (kryterium 2)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('wybór typu falownika z krzywą dokłada serie producenta na wykresie', async () => {
    pobierzObszar.mockResolvedValue(widokObszaruFixture());
    render(<EkranObszaruPQ trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-obszar-wezel'), { target: { value: 'bus-a' } });
    fireEvent.click(screen.getByTestId('mvd-obszar-oblicz'));
    await screen.findByTestId('mvd-obszar-wynik');
    // Nakładka domyślnie wyłączona.
    expect(screen.queryByText(OBSZAR_STRINGS.legendaProdMax)).not.toBeInTheDocument();
    // Opcje typów wczytane asynchronicznie z katalogu.
    await screen.findByRole('option', { name: /Sungrow/ });
    fireEvent.change(screen.getByTestId('mvd-obszar-typ'), {
      target: { value: 'conv-pv-card-sungrow-sg3150u-mv' },
    });
    expect(screen.getByText(OBSZAR_STRINGS.legendaProdMax)).toBeInTheDocument();
  });
});

describe('EkranObszaruPQ — tryb ekspercki (identyfikatory)', () => {
  beforeEach(ustawGotowyRozplyw);

  async function uruchomBieg(tryb: 'basic' | 'expert') {
    pobierzObszar.mockResolvedValue(widokObszaruFixture());
    render(<EkranObszaruPQ trybZaawansowania={tryb} />);
    fireEvent.change(screen.getByTestId('mvd-obszar-wezel'), { target: { value: 'bus-a' } });
    fireEvent.click(screen.getByTestId('mvd-obszar-oblicz'));
    await screen.findByTestId('mvd-obszar-wynik');
  }

  it('tryb podstawowy ukrywa identyfikator wejścia (hash)', async () => {
    await uruchomBieg('basic');
    expect(screen.queryByTestId('mvd-obszar-eksp-hash')).not.toBeInTheDocument();
  });

  it('tryb ekspercki odsłania identyfikator wejścia i przebiegu', async () => {
    await uruchomBieg('expert');
    const hash = screen.getByTestId('mvd-obszar-eksp-hash');
    expect(hash).toHaveTextContent('a1b2c3d4e5f6');
    expect(screen.getByTestId('mvd-obszar-wynik')).toHaveTextContent('run-lf-1');
  });
});

describe('EkranObszaruPQ — zapis ograniczeń Q generatora (K5-B / H-3 pkt 3)', () => {
  beforeEach(ustawGotowyRozplyw);

  async function uruchomBieg() {
    pobierzObszar.mockResolvedValue(widokObszaruFixture());
    render(<EkranObszaruPQ trybZaawansowania="basic" />);
    fireEvent.change(screen.getByTestId('mvd-obszar-wezel'), { target: { value: 'bus-a' } });
    fireEvent.click(screen.getByTestId('mvd-obszar-oblicz'));
    await screen.findByTestId('mvd-obszar-wynik');
  }

  it('węzeł bez modułu wytwórczego → uczciwy powód zamiast atrapy zapisu', async () => {
    await uruchomBieg();
    expect(screen.getByTestId('mvd-obszar-limity-brak-generatorow')).toHaveTextContent(
      'nie ma modułu wytwórczego',
    );
    expect(screen.queryByTestId('mvd-obszar-limity-zapisz')).not.toBeInTheDocument();
  });

  it('zapis woła update_element_parameters z limitami SCALONYMI (P zostaje, Q z pól)', async () => {
    const { useAppStateStore } = await import('../../../../ui/app-state');
    const wykonaj = vi.fn().mockResolvedValue({ error: null });
    useAppStateStore.setState({ activeCaseId: 'case-pq' } as never);
    useSnapshotStore.setState({
      snapshot: {
        ...snapshotFixture(),
        generators: [
          {
            ref_id: 'gen-1',
            name: 'PV Szyna A',
            bus_ref: 'bus-a',
            p_mw: 1.0,
            limits: { p_min_mw: 0.0, p_max_mw: 2.0 },
          },
        ],
      },
      executeDomainOperation: wykonaj,
    } as never);

    await uruchomBieg();

    // Realna ścieżka: korekta wartości w polach + natywny klik zapisu.
    fireEvent.change(screen.getByTestId('mvd-obszar-limity-qmin'), {
      target: { value: '-1.5' },
    });
    fireEvent.change(screen.getByTestId('mvd-obszar-limity-qmax'), {
      target: { value: '1.5' },
    });
    fireEvent.click(screen.getByTestId('mvd-obszar-limity-zapisz'));

    await vi.waitFor(() =>
      expect(wykonaj).toHaveBeenCalledWith('case-pq', 'update_element_parameters', {
        element_ref: 'gen-1',
        parameters: {
          // Scalenie: granice P z modelu NIE giną przy zapisie pasma Q.
          limits: { p_min_mw: 0.0, p_max_mw: 2.0, q_min_mvar: -1.5, q_max_mvar: 1.5 },
        },
      }),
    );
    expect(screen.queryByTestId('mvd-obszar-limity-blad')).not.toBeInTheDocument();
    useAppStateStore.setState({ activeCaseId: null } as never);
  });

  it('odmowa backendu (np. bramka katalogowa) jest NAZWANA przy przycisku', async () => {
    const { useAppStateStore } = await import('../../../../ui/app-state');
    const wykonaj = vi.fn().mockResolvedValue({
      error: 'Element fizyczny wymaga przypiętego katalogu.',
    });
    useAppStateStore.setState({ activeCaseId: 'case-pq' } as never);
    useSnapshotStore.setState({
      snapshot: {
        ...snapshotFixture(),
        generators: [{ ref_id: 'gen-1', name: 'PV Szyna A', bus_ref: 'bus-a', p_mw: 1.0 }],
      },
      executeDomainOperation: wykonaj,
    } as never);

    await uruchomBieg();
    fireEvent.click(screen.getByTestId('mvd-obszar-limity-zapisz'));

    expect(await screen.findByTestId('mvd-obszar-limity-blad')).toHaveTextContent(
      'Element fizyczny wymaga przypiętego katalogu.',
    );
    useAppStateStore.setState({ activeCaseId: null } as never);
  });
});
