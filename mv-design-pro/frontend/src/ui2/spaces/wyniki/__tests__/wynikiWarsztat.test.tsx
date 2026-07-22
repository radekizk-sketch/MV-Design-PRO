/**
 * Testy warsztatu przestrzeni „Wyniki" (scalenia U3 #1–#2): zakładki
 * rozpływ/zwarcia/pozostałe, zakładka startowa wg rodzaju aktywnego
 * przebiegu, slot mostu. R2-B: deep-link z kontekstem elementu — konsumpcja
 * i czyszczenie OBU pól żądania, pre-selekcja węzła w oknie kompensacji,
 * izolacja kontekstu między zakładkami.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useShellStore } from '../../../shell/useShellStore';
import type { ShortCircuitResults } from '../../../../ui/results-inspector/types';
import { WZORZEC_STRINGS } from '../../../wyniki/wzorzec';
import { WynikiWarsztat } from '../WynikiWarsztat';
import { WYNIKI_WARSZTAT_STRINGS as T } from '../strings';
import { przebiegFixture, snapshotFixture } from './fixtures';

beforeEach(() => {
  usePowerFlowResultsStore.getState().reset();
  usePowerFlowResultsStore.setState({
    selectRun: vi.fn(async () => {}),
    loadResults: vi.fn(async () => {}),
  });
  useResultsInspectorStore.getState().clearRun();
  useResultsInspectorStore.setState({
    selectRun: vi.fn(async () => {}),
    loadShortCircuitResults: vi.fn(async () => {}),
    loadExtendedTrace: vi.fn(async () => {}),
  });
  useExecutionRunsStore.setState({ runs: [], activeRunId: null });
  useAppStateStore.setState({ activeRunId: null, activeProjectId: null });
  useSnapshotStore.getState().reset();
  useShellStore.setState({ wynikiTab: null, wynikiTabElement: null });
});

/** Wynik zwarciowy 1:1 z kontraktem `ShortCircuitResults` (types.ts:172-176). */
function wynikZwarciowyFixture(): ShortCircuitResults {
  return {
    run_id: 'run-sc-1',
    rows: [
      {
        target_id: 'bus-1',
        element_id: 'bus-1',
        target_name: 'Szyna GPZ',
        ikss_ka: 12.5,
        ip_ka: 31.2,
        ith_ka: 12.9,
        sk_mva: 325.0,
        fault_type: '3F',
        flags: [],
      },
    ],
  };
}

function props(over: Partial<Parameters<typeof WynikiWarsztat>[0]> = {}) {
  return {
    trybZaawansowania: 'basic' as const,
    pozostale: <div data-testid="most-pozostale">powierzchnia analiz</div>,
    onOtworzDokumentacje: vi.fn(),
    ...over,
  };
}

describe('WynikiWarsztat — zakładki', () => {
  it('renderuje komplet zakładek z etykietami PL (w tym Pulpit OZE)', () => {
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-wyniki-zakladka-pulpit-oze')).toHaveTextContent(
      T.zakladkaPulpitOze,
    );
  });

  it('renderuje sześć zakładek z etykietami PL', () => {
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-wyniki-zakladka-rozplyw')).toHaveTextContent(T.zakladkaRozplyw);
    expect(screen.getByTestId('mvd-wyniki-zakladka-zwarcia')).toHaveTextContent(T.zakladkaZwarcia);
    expect(screen.getByTestId('mvd-wyniki-zakladka-dowod')).toHaveTextContent(T.zakladkaDowod);
    expect(screen.getByTestId('mvd-wyniki-zakladka-porownanie')).toHaveTextContent(
      T.zakladkaPorownanie,
    );
    expect(screen.getByTestId('mvd-wyniki-zakladka-ncrfg')).toHaveTextContent(T.zakladkaNcRfg);
    expect(screen.getByTestId('mvd-wyniki-zakladka-pozostale')).toHaveTextContent(
      T.zakladkaPozostale,
    );
  });

  it('deep-link ze shell store (F-E8.2): wynikiTab=„studium" otwiera zakładkę studium i czyści żądanie', async () => {
    useShellStore.setState({ wynikiTab: 'studium' });
    render(<WynikiWarsztat {...props()} />);
    // Montaż kreatora studium pobiera katalogi (konwertery + klasy NC RfG) —
    // realny efekt mikrotaskowy, którego skutek (prefill kroku 2) nie ma
    // reprezentacji w UI kroku 1, więc nie ma na co czekać przez findBy*/waitFor.
    // Puste act(async) domyka te mikrotaski w act — bez niego React zgłasza
    // „An update to KreatorStudium was not wrapped in act(...)".
    await act(async () => {});
    expect(screen.getByTestId('mvd-wyniki-zakladka-studium').getAttribute('aria-selected')).toBe('true');
    // Żądanie skonsumowane (jednorazowe) — nie „przykleja" zakładki na stałe.
    expect(useShellStore.getState().wynikiTab).toBeNull();
    // Wywołanie bez elementu (sprzed R2-B) działa 1:1 — kontekst pozostaje pusty.
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
  });

  it('deep-link: nieznane id zakładki jest ignorowane (walidacja), żądanie wyczyszczone (OBA pola)', () => {
    useShellStore.setState({ wynikiTab: 'nieistniejaca-zakladka', wynikiTabElement: 'bus-a' });
    render(<WynikiWarsztat {...props()} />);
    // Zakładka startowa bez zmian (domyślna wg rodzaju przebiegu = „pozostałe" bez przebiegu).
    expect(screen.getByTestId('mvd-wyniki-zakladka-pozostale').getAttribute('aria-selected')).toBe('true');
    expect(useShellStore.getState().wynikiTab).toBeNull();
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
  });

  it('deep-link „kompensacja" z elementem (R2-B): zakładka otwarta, węzeł pre-selekcjonowany, OBA pola wyczyszczone', () => {
    // Pełny łańcuch okna: zakończony rozpływ (rejestr przebiegów) + snapshot z węzłami.
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-lf-1' })],
      activeRunId: 'run-lf-1',
    });
    useSnapshotStore.setState({ snapshot: snapshotFixture() });
    useShellStore.setState({ wynikiTab: 'kompensacja', wynikiTabElement: 'bus-a' });
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-wyniki-zakladka-kompensacja').getAttribute('aria-selected')).toBe('true');
    // Węzeł przekroczenia wybrany bez ręcznego wyboru; bieg od razu możliwy.
    expect(screen.getByTestId('mvd-komp-wezel')).toHaveValue('bus-a');
    expect(screen.getByTestId('mvd-komp-oblicz')).toBeEnabled();
    // Żądanie skonsumowane w całości (tab + element).
    expect(useShellStore.getState().wynikiTab).toBeNull();
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
  });

  it('deep-link z elementem do INNEJ zakładki nie przecieka do okna kompensacji', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-lf-1' })],
      activeRunId: 'run-lf-1',
    });
    useSnapshotStore.setState({ snapshot: snapshotFixture() });
    // Element przy zakładce „studium" — kompensacja NIE jest celem żądania.
    useShellStore.setState({ wynikiTab: 'studium', wynikiTabElement: 'bus-a' });
    render(<WynikiWarsztat {...props()} />);
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
    // Ręczne wejście na kompensację: bez pre-selekcji (zero zalegających refów).
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-kompensacja'));
    expect(screen.getByTestId('mvd-komp-wezel')).toHaveValue('');
  });

  it('zakładka „Porównanie A/B": bez aktywnego projektu — uczciwy stan pusty', () => {
    render(<WynikiWarsztat {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-porownanie'));
    expect(screen.getByTestId('mvd-wyniki-porownanie-bez-projektu')).toHaveTextContent(
      T.porownanieBezProjektu,
    );
  });

  it('zakładka „Jakość wyników": bez przebiegów — uczciwe instrukcje obu sekcji', () => {
    render(<WynikiWarsztat {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-jakosc'));
    // Okno E8.4 renderuje się z jawnymi stanami braku przebiegów (bez wołań API).
    expect(screen.getByTestId('mvd-jakosc-ekran')).toBeInTheDocument();
  });

  it('zakładka „Zgodność powykonawcza": bez przebiegu rozpływu — uczciwy stan pusty', () => {
    render(<WynikiWarsztat {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-odbior'));
    expect(screen.getByTestId('mvd-odbior-ekran')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-odbior-brak-przebiegu')).toBeInTheDocument();
  });

  it('zakładka „Zdolność przyłączeniowa": bez przebiegu rozpływu — uczciwa instrukcja', () => {
    render(<WynikiWarsztat {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-zdolnosc'));
    expect(screen.getByTestId('mvd-zdol-ekran')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-ranking'));
    expect(screen.getByTestId('mvd-rank-ekran')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-krzywe'));
    expect(screen.getByTestId('mvd-krzywe-ekran')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-obszar'));
    expect(screen.getByTestId('mvd-obszar-ekran')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-studium'));
    expect(screen.getByTestId('mvd-studium-ekran')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-frt'));
    expect(screen.getByTestId('mvd-frt-ekran')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-osd'));
    expect(screen.getByTestId('mvd-osd-ekran')).toBeInTheDocument();
    // Zakładka „Dobór kompensacji" (P42): bez przebiegu rozpływu — uczciwy stan pusty.
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-kompensacja'));
    expect(screen.getByTestId('mvd-komp-ekran')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-komp-brak-przebiegu')).toBeInTheDocument();
    // Zakładka „Praca wyspowa" (LoM): bez aktywnego przypadku — uczciwy stan pusty.
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-lom'));
    expect(screen.getByTestId('mvd-lom-ekran')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-lom-brak-przypadku')).toBeInTheDocument();
  });

  it('zakładka „Zgodność NC RfG": bez modułów wytwórczych — uczciwy stan pusty macierzy', async () => {
    render(<WynikiWarsztat {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-ncrfg'));
    expect(screen.getByTestId('mvd-oze-pusty')).toBeInTheDocument();
    // Montaż macierzy pobiera katalog wymogów (zaladujKatalog); w tym środowisku
    // (brak backendu) kończy się jawnym komunikatem błędu katalogu. Czekamy na ten
    // stan końcowy, żeby aktualizacja store'a domknęła się w act — bez tego React
    // zgłasza „An update to MacierzNcRfg was not wrapped in act(...)".
    expect(await screen.findByTestId('mvd-oze-blad-katalogu')).toBeInTheDocument();
  });

  it('zakładka „Wniosek OSD": bez biegów — okno renderuje się, generacja nieaktywna', () => {
    render(<WynikiWarsztat {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-wniosek'));
    expect(screen.getByTestId('mvd-wniosek-ekran')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-wniosek-generuj')).toBeDisabled();
  });

  it('bez aktywnego przebiegu: startuje na moście (pozostałe analizy)', () => {
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('most-pozostale')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-rozplyw-szyny')).not.toBeInTheDocument();
  });

  it('aktywny zakończony rozpływ: startuje na zakładce „Rozpływ mocy"', () => {
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-1' })] });
    useAppStateStore.setState({ activeRunId: 'run-lf-1' });
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
    expect(screen.queryByTestId('most-pozostale')).not.toBeInTheDocument();
  });

  it('aktywne zakończone zwarcie: startuje na zakładce „Zwarcia" z danymi ze store', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-sc-1', analysis_type: 'SC_3F' })],
    });
    useAppStateStore.setState({ activeRunId: 'run-sc-1' });
    useResultsInspectorStore.setState({
      selectedRunId: 'run-sc-1',
      shortCircuitResults: wynikZwarciowyFixture(),
    });
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-zwarcia-ekran')).toBeInTheDocument();
    // Nazwa punktu występuje w tabeli, na osi wykresu i w wyborze wkładów.
    expect(screen.getAllByText('Szyna GPZ').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('most-pozostale')).not.toBeInTheDocument();
  });

  it('klik przełącza zakładki (rozpływ → zwarcia → most)', () => {
    render(<WynikiWarsztat {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-rozplyw'));
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-zwarcia'));
    // Bez wyniku w store: uczciwy stan pusty okna E8.2.
    expect(screen.getByTestId('mvd-zwarcia-ekran-pusty')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-pozostale'));
    expect(screen.getByTestId('most-pozostale')).toBeInTheDocument();
  });

  it('strzałki klawiatury przełączają zakładki (roving tabindex)', () => {
    render(<WynikiWarsztat {...props()} />);
    const pozostale = screen.getByTestId('mvd-wyniki-zakladka-pozostale');
    expect(pozostale).toHaveAttribute('aria-selected', 'true');
    // Kolejność wizualna po grupowaniu: po „Pozostałych" (koniec grupy analiz)
    // następuje pierwsza zakładka grupy OZE.
    fireEvent.keyDown(pozostale, { key: 'ArrowRight' });
    expect(screen.getByTestId('mvd-wyniki-zakladka-ncrfg')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.keyDown(screen.getByTestId('mvd-wyniki-zakladka-ncrfg'), { key: 'ArrowLeft' });
    expect(screen.getByTestId('mvd-wyniki-zakladka-pozostale')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('zakładka rozpływu bez wyniku w store: uczciwy stan pusty okna E8.1', () => {
    render(<WynikiWarsztat {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-rozplyw'));
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
  });

  it('zakładka „Dowód obliczeń": bez przebiegu — uczciwy stan pusty okna E9.1', () => {
    render(<WynikiWarsztat {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-dowod'));
    expect(screen.getByTestId('mvd-dowod-pusty')).toBeInTheDocument();
  });

  it('2×klik na wartości z dowodem w tabeli zwarć przełącza na zakładkę „Dowód obliczeń"', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-sc-1', analysis_type: 'SC_3F' })],
    });
    useAppStateStore.setState({ activeRunId: 'run-sc-1' });
    useResultsInspectorStore.setState({
      selectedRunId: 'run-sc-1',
      shortCircuitResults: wynikZwarciowyFixture(),
    });
    render(<WynikiWarsztat {...props()} />);
    // Wiersz zwarciowy niesie element_id → komórka z dowodem (kontrakt wzorca).
    const przyciskiDowodu = screen.getAllByRole('button', { name: WZORZEC_STRINGS.pokazDowod });
    fireEvent.doubleClick(przyciskiDowodu[0]);
    expect(screen.getByTestId('mvd-wyniki-zakladka-dowod')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
