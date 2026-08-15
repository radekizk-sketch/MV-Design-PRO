/**
 * Testy warsztatu przestrzeni „Wyniki" (scalenia U3 #1–#2): zakładki
 * rozpływ/zwarcia/pozostałe, zakładka startowa wg rodzaju aktywnego
 * przebiegu, slot mostu. R2-B: deep-link z kontekstem elementu — konsumpcja
 * i czyszczenie OBU pól żądania, pre-selekcja węzła w oknie kompensacji,
 * izolacja kontekstu między zakładkami. R3-C: kontekst zakładki „Dowód
 * obliczeń" = konkretny przebieg (dowód kolumny A/B porównania) + pełny
 * łańcuch realną ścieżką (2×klik w komórkę porównania → dowód runu strony).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';

// R3-C (pełny łańcuch przez okno porównania): lista przebiegów rozpływu,
// porównanie zwarciowe i per-przebiegowe wyniki zwarciowe mockowane na granicy
// klienta API (reszta modułu inspektora wyników pozostaje realna —
// importOriginal).
vi.mock('../../../../ui/power-flow-comparison/api', () => ({
  fetchPowerFlowRuns: vi.fn(async () => []),
  createPowerFlowComparison: vi.fn(),
}));
vi.mock('../../../../ui/results-inspector/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchShortCircuitResults: vi.fn(),
}));
// KD-3 poz. 11: tabela porównania zwarć powstaje z JEDNEJ końcówki
// `POST /api/short-circuit-comparisons` (delty liczy domena, nie ekran).
// Wcześniej ten test karmił porównanie dwoma odczytami wyników zwarciowych —
// intencja („pełny łańcuch realną ścieżką: klik w komórkę A → dowód przebiegu
// A") bez zmian, zmienia się tylko granica, na której stoi atrapa.
vi.mock('../../../wyniki/porownanie/zwarciaPorownanieApi', () => ({
  pobierzPorownanieZwarciowe: vi.fn(),
}));

import { fetchShortCircuitResults } from '../../../../ui/results-inspector/api';
import { pobierzPorownanieZwarciowe } from '../../../wyniki/porownanie/zwarciaPorownanieApi';
import { useAppStateStore } from '../../../../ui/app-state';
import { useStationDerStore } from '../../../../ui/network-build/station-der';
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
  useStationDerStore.getState().reset();
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

  // K8 (wygaszenie trasy mostu #protection-results): zakładka „Koordynacja
  // zabezpieczeń" MUSI mieć realnego dostawcę — bez niej lądowisko wygaszonej
  // trasy byłoby phantomem (dokładnie tego wymagał K3-A3 przy czterech
  // zakładkach kart huba).
  it('zakładka „koordynacja" (K8) ma etykietę PL i realnego dostawcę (EkranKoordynacji)', () => {
    render(<WynikiWarsztat {...props()} />);
    const zakladka = screen.getByTestId('mvd-wyniki-zakladka-koordynacja');
    expect(zakladka).toHaveTextContent(T.zakladkaKoordynacja);

    fireEvent.click(zakladka);
    expect(zakladka.getAttribute('aria-selected')).toBe('true');
    // Bez projektu ekran pokazuje UCZCIWY stan zerowy z akcją naprawczą
    // (kontrakt EkranKoordynacji), a nie pustą przestrzeń ani widok mostu.
    expect(screen.getByTestId('mvd-koordynacja-brak-projektu')).toBeTruthy();
  });

  it('deep-link „koordynacja" (K8): żądanie ze shell store otwiera zakładkę i jest konsumowane', () => {
    useShellStore.setState({ wynikiTab: 'koordynacja' });
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-wyniki-zakladka-koordynacja').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(useShellStore.getState().wynikiTab).toBeNull();
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

  it('deep-link „ncrfg" z kontekstem modułu (P-1): zakładka otwarta, moduł pre-selekcjonowany po nazwie, OBA pola wyczyszczone', async () => {
    // Dwa moduły wytwórcze — kontekst wskazuje DRUGI po nazwie (wspólny klucz
    // kreatora DER dla generatora ENM niesionego przez akcję SLD show-ncrfg).
    useStationDerStore.getState().attachDer({
      id: 'der-a', project_id: 'p-1', station_id: 'st-1',
      der_kind: 'PV', name: 'PV_T1', connection_side: 'SN',
    });
    useStationDerStore.getState().attachDer({
      id: 'der-b', project_id: 'p-1', station_id: 'st-1',
      der_kind: 'PV', name: 'PV_T4', connection_side: 'SN',
    });
    useShellStore.setState({ wynikiTab: 'ncrfg', wynikiTabElement: 'PV_T4' });
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-wyniki-zakladka-ncrfg').getAttribute('aria-selected')).toBe('true');
    // Montaż macierzy pobiera katalog wymogów — czekamy na stan końcowy (act).
    await screen.findByTestId('mvd-oze-blad-katalogu');
    expect(screen.getByTestId('mvd-oze-modul-der-b')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('mvd-oze-modul-der-a')).toHaveAttribute('aria-pressed', 'false');
    // Żądanie skonsumowane w całości (tab + element).
    expect(useShellStore.getState().wynikiTab).toBeNull();
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
  });

  it('deep-link „ncrfg" z nieznanym refem: zakładka otwarta, pre-selekcja bez zmian (zero fabrykacji)', async () => {
    useStationDerStore.getState().attachDer({
      id: 'der-a', project_id: 'p-1', station_id: 'st-1',
      der_kind: 'PV', name: 'PV_T1', connection_side: 'SN',
    });
    useShellStore.setState({ wynikiTab: 'ncrfg', wynikiTabElement: 'nieznany-ref' });
    render(<WynikiWarsztat {...props()} />);
    await screen.findByTestId('mvd-oze-blad-katalogu');
    // Domyślny wybór (pierwszy moduł) — nieznany kontekst nie fabrykuje dopasowania.
    expect(screen.getByTestId('mvd-oze-modul-der-a')).toHaveAttribute('aria-pressed', 'true');
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
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

  it('hydratacja K2 (K3-A4): rejestr przebiegów doładowany PO montażu przełącza zakładkę z mostu na rodzaj przebiegu', () => {
    // Zimny start: rejestr pusty → zakładka startowa 'pozostałe' (most).
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-wyniki-zakladka-pozostale')).toHaveAttribute('aria-selected', 'true');
    // Hydratacja K2: rejestr przebiegów + aktywny przebieg spływają z serwera.
    act(() => {
      useExecutionRunsStore.setState({
        runs: [przebiegFixture({ id: 'run-sc-9', analysis_type: 'SC_3F' })],
      });
      useAppStateStore.setState({ activeRunId: 'run-sc-9' });
    });
    // Zakładka DOCHODZI do rodzaju przebiegu — użytkownik nic nie wybierał.
    expect(screen.getByTestId('mvd-wyniki-zakladka-zwarcia')).toHaveAttribute('aria-selected', 'true');
  });

  it('hydratacja K2 (K3-A4): rozpływ po hydratacji przełącza na zakładkę „Rozpływ mocy"', () => {
    render(<WynikiWarsztat {...props()} />);
    act(() => {
      useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-9' })] });
      useAppStateStore.setState({ activeRunId: 'run-lf-9' });
    });
    expect(screen.getByTestId('mvd-wyniki-zakladka-rozplyw')).toHaveAttribute('aria-selected', 'true');
  });

  it('K3-A4: ręczny wybór zakładki ma pierwszeństwo — hydratacja go nie nadpisuje', () => {
    render(<WynikiWarsztat {...props()} />);
    // Użytkownik świadomie wchodzi na „Dowód obliczeń" przed hydratacją.
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-dowod'));
    act(() => {
      useExecutionRunsStore.setState({
        runs: [przebiegFixture({ id: 'run-sc-9', analysis_type: 'SC_3F' })],
      });
      useAppStateStore.setState({ activeRunId: 'run-sc-9' });
    });
    // Zakładka wybrana ręcznie zostaje — zero zaskakującego przełączania.
    expect(screen.getByTestId('mvd-wyniki-zakladka-dowod')).toHaveAttribute('aria-selected', 'true');
  });

  it('K3-A4: deep-link zakładki (wynikiTab) też ma pierwszeństwo przed hydratacją', () => {
    useShellStore.setState({ wynikiTab: 'porownanie' });
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-wyniki-zakladka-porownanie')).toHaveAttribute('aria-selected', 'true');
    act(() => {
      useExecutionRunsStore.setState({
        runs: [przebiegFixture({ id: 'run-sc-9', analysis_type: 'SC_3F' })],
      });
      useAppStateStore.setState({ activeRunId: 'run-sc-9' });
    });
    expect(screen.getByTestId('mvd-wyniki-zakladka-porownanie')).toHaveAttribute('aria-selected', 'true');
  });

  it('zakładkowi dostawcy kart huba E-29…E-32 (K3-A3): cztery zakładki renderują ekrany ui2', () => {
    render(<WynikiWarsztat {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-zbieznosc'));
    expect(screen.getByTestId('mvd-zbieznosc')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-skladowe'));
    expect(screen.getByTestId('mvd-skladowe')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-stan-fazowy'));
    expect(screen.getByTestId('mvd-stan-fazowy')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-stabilnosc'));
    expect(screen.getByTestId('mvd-stabilnosc')).toBeInTheDocument();
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

/**
 * V126-JEZYK (ocena właściciela 0/10 z 2026-08-07): pakiet analiz akademickich
 * zjeżdża z toru podstawowego projektanta do trybu eksperckiego. Brama to PARA
 * predykatów z JEDNEGO źródła (`zakladkaDostepna`): pasek zakładek i render
 * treści — plus trzeci koniec: deep-link `setWynikiTab`, który do tej karty
 * potrafił wejść na zakładkę z pominięciem paska.
 */
describe('WynikiWarsztat — brama trybu dla pakietu akademickiego (V126-JEZYK)', () => {
  it('tor podstawowy: zakładki „Analizy akademickie" NIE ma', () => {
    render(<WynikiWarsztat {...props({ trybZaawansowania: 'basic' })} />);
    expect(screen.queryByTestId('mvd-wyniki-zakladka-akademickie')).toBeNull();
  });

  it('tor rozszerzony: zakładki „Analizy akademickie" NIE ma', () => {
    render(<WynikiWarsztat {...props({ trybZaawansowania: 'extended' })} />);
    expect(screen.queryByTestId('mvd-wyniki-zakladka-akademickie')).toBeNull();
  });

  it('tryb ekspercki: zakładka jest i prowadzi do okna (kontrola dodatnia bramy)', () => {
    render(<WynikiWarsztat {...props({ trybZaawansowania: 'expert' })} />);
    const zakladka = screen.getByTestId('mvd-wyniki-zakladka-akademickie');
    expect(zakladka).toHaveTextContent(T.zakladkaAkademickie);
    fireEvent.click(zakladka);
    expect(screen.getByTestId('mvd-akad-ekran')).toBeTruthy();
  });

  it('deep-link nie obchodzi bramy: żądanie „akademickie" w trybie podstawowym nie przełącza zakładki', async () => {
    render(<WynikiWarsztat {...props({ trybZaawansowania: 'basic' })} />);
    act(() => {
      useShellStore.getState().setWynikiTab('akademickie');
    });
    await waitFor(() => expect(useShellStore.getState().wynikiTab).toBeNull());
    expect(screen.queryByTestId('mvd-akad-ekran')).toBeNull();
    // Kontrola dodatnia tej samej ścieżki: deep-link na zakładkę BEZ bramy działa.
    act(() => {
      useShellStore.getState().setWynikiTab('jakosc');
    });
    await waitFor(() =>
      expect(screen.getByTestId('mvd-wyniki-zakladka-jakosc')).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
  });

  it('obniżenie trybu przy otwartej zakładce zamyka ją (nie zostaje sierota)', () => {
    const { rerender } = render(<WynikiWarsztat {...props({ trybZaawansowania: 'expert' })} />);
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-akademickie'));
    expect(screen.getByTestId('mvd-akad-ekran')).toBeTruthy();
    rerender(<WynikiWarsztat {...props({ trybZaawansowania: 'basic' })} />);
    expect(screen.queryByTestId('mvd-akad-ekran')).toBeNull();
    expect(screen.getByTestId('mvd-wyniki-zakladka-werdykt')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('WynikiWarsztat — kontekst przebiegu zakładki „Dowód obliczeń" (R3-C)', () => {
  it('deep-link „dowod" z kontekstem: zakładka otwarta, ślad WSKAZANEGO przebiegu, OBA pola wyczyszczone', async () => {
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-1' })] });
    useAppStateStore.setState({ activeRunId: 'run-lf-1' });
    useShellStore.setState({ wynikiTab: 'dowod', wynikiTabElement: 'run-porownany' });
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-wyniki-zakladka-dowod').getAttribute('aria-selected')).toBe('true');
    // Kontener dowodu wybiera przebieg z kontekstu, NIE aktywny.
    const selectRun = useResultsInspectorStore.getState().selectRun;
    await waitFor(() => expect(selectRun).toHaveBeenCalledWith('run-porownany'));
    expect(selectRun).not.toHaveBeenCalledWith('run-lf-1');
    // Żądanie skonsumowane w całości (tab + element).
    expect(useShellStore.getState().wynikiTab).toBeNull();
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
  });

  it('ręczne wejście na „Dowód obliczeń" po deep-linku wraca do aktywnego przebiegu (izolacja)', async () => {
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-1' })] });
    useAppStateStore.setState({ activeRunId: 'run-lf-1' });
    useShellStore.setState({ wynikiTab: 'dowod', wynikiTabElement: 'run-porownany' });
    render(<WynikiWarsztat {...props()} />);
    const selectRun = useResultsInspectorStore.getState().selectRun;
    await waitFor(() => expect(selectRun).toHaveBeenCalledWith('run-porownany'));
    // Wyjście i ręczny powrót: wskazanie z porównania nie może zalegać.
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-rozplyw'));
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-dowod'));
    await waitFor(() => expect(selectRun).toHaveBeenCalledWith('run-lf-1'));
  });

  it('pełny łańcuch realną ścieżką: 2×klik w komórkę A porównania zwarć → dowód przebiegu A', async () => {
    useAppStateStore.setState({ activeRunId: null, activeProjectId: 'proj-1' });
    useExecutionRunsStore.setState({
      runs: [
        przebiegFixture({ id: 'sc-run-a', analysis_type: 'SC_3F' }),
        przebiegFixture({ id: 'sc-run-b', analysis_type: 'SC_3F', finished_at: '2026-07-16T08:00:01Z' }),
      ],
    });
    // Dowód (panel wywodu elementu) nadal czyta wynik POJEDYNCZEGO przebiegu.
    vi.mocked(fetchShortCircuitResults).mockImplementation(async (runId: string) => ({
      ...wynikZwarciowyFixture(),
      run_id: runId,
    }));
    // Porównanie A/B przychodzi GOTOWE z domeny (delty są polami odpowiedzi).
    vi.mocked(pobierzPorownanieZwarciowe).mockImplementation(async (a: string, b: string) => ({
      run_id_a: a,
      run_id_b: b,
      report_version: '1.3.0',
      punkty: [
        {
          target_id: 'bus-1',
          target_name: 'Szyna GPZ',
          obecny_w: 'AB' as const,
          ikss_ka_a: 12.5,
          ikss_ka_b: 12.1,
          delta_ikss_ka: -0.4,
          delta_ikss_percent: -3.2,
        },
      ],
      liczba_punktow_wspolnych: 1,
      liczba_punktow_tylko_a: 0,
      liczba_punktow_tylko_b: 0,
    }));
    render(<WynikiWarsztat {...props()} />);
    // Okno porównania → tryb zwarciowy → jawne porównanie A/B.
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-porownanie'));
    await screen.findByTestId('mvd-por-host');
    fireEvent.click(screen.getByTestId('mvd-por-tryb-zwarcia'));
    fireEvent.change(screen.getByTestId('mvd-porz-select-a'), { target: { value: 'sc-run-a' } });
    fireEvent.change(screen.getByTestId('mvd-porz-select-b'), { target: { value: 'sc-run-b' } });
    fireEvent.click(screen.getByTestId('mvd-porz-przycisk'));
    await screen.findByTestId('mvd-porz-wynik');
    // Pierwszy przycisk dowodu wiersza = kolumna Ik" A (kolejność kolumn tabeli).
    fireEvent.doubleClick(screen.getAllByRole('button', { name: WZORZEC_STRINGS.pokazDowod })[0]);
    // Warsztat konsumuje deep-link: zakładka dowodu + ślad przebiegu A.
    expect(screen.getByTestId('mvd-wyniki-zakladka-dowod')).toHaveAttribute('aria-selected', 'true');
    const selectRun = useResultsInspectorStore.getState().selectRun;
    await waitFor(() => expect(selectRun).toHaveBeenCalledWith('sc-run-a'));
    expect(useShellStore.getState().wynikiTab).toBeNull();
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
  });
});

// EKRAN-N1, odbiór niezależny (2026-08-14): iniekcja nadzoru — zakładka
// „Kontyngencje N-1" ogłoszona w pasku, ale BEZ dostawcy treści (panel pusty
// po kliknięciu) — przetrwała 110 testów, bo każdy dotychczasowy pin zakładki
// był INSTANCJĄ (konkretna zakładka, konkretny testid). Ten test przypina
// KLASĘ: każda ogłoszona zakładka renderuje treść — uczciwy stan zerowy TEŻ
// jest treścią, a pusta przestrzeń po kliknięciu to martwa zakładka.
describe('WynikiWarsztat — KLASA: każda ogłoszona zakładka ma dostawcę treści', () => {
  it('klik w każdą zakładkę (tryb expert = komplet paska) renderuje niepusty panel', async () => {
    const { container } = render(<WynikiWarsztat {...props({ trybZaawansowania: 'expert' })} />);
    const zakladki = screen.getAllByRole('tab');
    // Sanity: pasek nie skurczył się cicho (32 zakładki w chwili przypięcia;
    // celowe usunięcie zakładki obniża próg razem z tą liczbą).
    expect(zakladki.length).toBeGreaterThanOrEqual(32);
    for (const zakladka of zakladki) {
      fireEvent.click(zakladka);
      expect(zakladka).toHaveAttribute('aria-selected', 'true');
      const panel = container.querySelector('[role="tabpanel"]');
      expect(panel, `brak panelu treści po kliknięciu „${zakladka.textContent}"`).not.toBeNull();
      await waitFor(() => {
        expect(
          (panel as HTMLElement).children.length,
          `martwa zakładka: „${zakladka.textContent}" nie renderuje żadnej treści`,
        ).toBeGreaterThan(0);
      });
    }
  });
});
