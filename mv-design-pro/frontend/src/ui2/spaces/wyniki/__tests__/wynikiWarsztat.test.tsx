/**
 * Testy warsztatu przestrzeni „Wyniki" (scalenia U3 #1–#2; nawigacja OBSZAR → ANALIZA
 * z karty B-02 / W3-E): obszary i zakładki, zakładka startowa wg rodzaju aktywnego
 * przebiegu (bez przebiegu — „Ocena techniczna wyników"), slot mostu w obszarze
 * „Widoki klasyczne". R2-B: deep-link z kontekstem elementu — konsumpcja i czyszczenie
 * OBU pól żądania, pre-selekcja węzła w oknie kompensacji, izolacja kontekstu między
 * zakładkami. R3-C: kontekst zakładki „Dowód obliczeń" = konkretny przebieg (dowód
 * kolumny A/B porównania) + pełny łańcuch realną ścieżką (2×klik w komórkę porównania
 * → dowód runu strony). B-02: ocena techniczna → dowód WSKAZANEGO przebiegu.
 *
 * Realna ścieżka użytkownika po przebudowie: zakładka innego obszaru NIE istnieje w DOM,
 * dopóki obszar nie zostanie wybrany — helper `otworzZakladke` klika obszar (po atrybucie
 * `data-zakladki`, tym samym, którym posługują się specyfikacje e2e), potem zakładkę.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

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
vi.mock('../../../wyniki/porownanie/zwarciaPorownanieApi', () => ({
  pobierzPorownanieZwarciowe: vi.fn(),
}));

import { fetchShortCircuitResults } from '../../../../ui/results-inspector/api';
import { pobierzPorownanieZwarciowe } from '../../../wyniki/porownanie/zwarciaPorownanieApi';
import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useStationDerStore } from '../../../../ui/network-build/station-der';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useShellStore } from '../../../shell/useShellStore';
import type { ShortCircuitResults } from '../../../../ui/results-inspector/types';
import { WZORZEC_STRINGS } from '../../../wyniki/wzorzec';
import { grupyZWynikami, type OdpowiedzOceny } from '../../../wyniki/ocena';
import ocenaFixture from '../../../../harness-fixtures/generated/werdykt_projektowy_scena_ocena.json';
import { WynikiWarsztat } from '../WynikiWarsztat';
import { OBSZARY, ZAKLADKI } from '../obszary';
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
  useAppStateStore.setState({ activeRunId: null, activeProjectId: null, activeCaseId: null });
  useSnapshotStore.getState().reset();
  useStationDerStore.getState().reset();
  useShellStore.setState({ wynikiTab: null, wynikiTabElement: null });
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
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

/**
 * Realna ścieżka użytkownika: obszar (po atrybucie `data-zakladki`, jak w e2e) →
 * zakładka. Zakładka spoza aktywnego obszaru nie istnieje w DOM, więc klik „w ciemno"
 * po testid byłby testem drugiej, nieistniejącej nawigacji.
 */
function otworzZakladke(id: string): HTMLElement {
  const obszar = document.querySelector<HTMLElement>(
    `[data-testid^="mvd-wyniki-obszar-"][data-zakladki~="${id}"]`,
  );
  if (!obszar) throw new Error(`brak obszaru niosącego zakładkę „${id}"`);
  if (obszar.getAttribute('aria-selected') !== 'true') fireEvent.click(obszar);
  const zakladka = screen.getByTestId(`mvd-wyniki-zakladka-${id}`);
  fireEvent.click(zakladka);
  return zakladka;
}

describe('WynikiWarsztat — obszary i zakładki (B-02)', () => {
  it('renderuje komplet obszarów z etykietami PL; bez przebiegu startuje na „Ocena techniczna wyników"', () => {
    render(<WynikiWarsztat {...props({ trybZaawansowania: 'expert' })} />);
    for (const obszar of OBSZARY) {
      expect(screen.getByTestId(`mvd-wyniki-obszar-${obszar.id}`)).toHaveTextContent(obszar.etykieta);
    }
    expect(screen.getByTestId('mvd-wyniki-obszar-ocena-i-przeglad')).toHaveAttribute('aria-selected', 'true');
    const ocena = screen.getByTestId('mvd-wyniki-zakladka-ocena');
    expect(ocena).toHaveAttribute('aria-selected', 'true');
    expect(ocena).toHaveTextContent(T.zakladkaOcena);
    expect(screen.getByTestId('mvd-ocena')).toBeInTheDocument();
    expect(screen.queryByTestId('most-pozostale')).not.toBeInTheDocument();
  });

  it('pasek zakładek pokazuje WYŁĄCZNIE zakładki aktywnego obszaru; wejście w obszar otwiera jego pierwszą zakładkę', () => {
    render(<WynikiWarsztat {...props()} />);
    expect(screen.queryByTestId('mvd-wyniki-zakladka-rozplyw')).toBeNull();
    fireEvent.click(screen.getByTestId('mvd-wyniki-obszar-rozplyw'));
    expect(screen.getByTestId('mvd-wyniki-obszar-rozplyw')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mvd-wyniki-zakladka-rozplyw')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('mvd-wyniki-zakladka-ocena')).toBeNull();
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
  });

  it('KLASA: każda zakładka należy do dokładnie jednego obszaru, a suma obszarów = komplet zakładek', () => {
    const wszystkie = OBSZARY.flatMap((obszar) => obszar.zakladki);
    expect(new Set(wszystkie).size).toBe(wszystkie.length);
    expect([...wszystkie].sort()).toEqual(ZAKLADKI.map((z) => z.id).sort());
    // Atrybut `data-zakladki` (adres dla e2e) niesie dokładnie zakładki obszaru.
    render(<WynikiWarsztat {...props({ trybZaawansowania: 'expert' })} />);
    for (const obszar of OBSZARY) {
      expect(screen.getByTestId(`mvd-wyniki-obszar-${obszar.id}`).getAttribute('data-zakladki')).toBe(
        obszar.zakladki.join(' '),
      );
    }
  });

  it('obszar „OZE i przyłączenia": zakładki z etykietami PL (w tym Pulpit OZE)', async () => {
    render(<WynikiWarsztat {...props()} />);
    otworzZakladke('pulpit-oze');
    expect(screen.getByTestId('mvd-wyniki-zakladka-pulpit-oze')).toHaveTextContent(T.zakladkaPulpitOze);
    expect(screen.getByTestId('mvd-wyniki-zakladka-ncrfg')).toHaveTextContent(T.zakladkaNcRfg);
    expect(screen.getByTestId('mvd-wyniki-zakladka-kompensacja')).toHaveTextContent(T.zakladkaKompensacja);
    expect(screen.getByTestId('mvd-wyniki-obszar-oze')).toHaveAttribute('aria-selected', 'true');
    // Montaż pulpitu OZE pobiera dane asynchronicznie — domykamy mikrotaski w act.
    await act(async () => {});
  });

  // K8 (wygaszenie trasy mostu #protection-results): zakładka „Koordynacja
  // zabezpieczeń" MUSI mieć realnego dostawcę — bez niej lądowisko wygaszonej
  // trasy byłoby phantomem.
  it('zakładka „koordynacja" (K8) ma etykietę PL i realnego dostawcę (EkranKoordynacji)', () => {
    render(<WynikiWarsztat {...props()} />);
    const zakladka = otworzZakladke('koordynacja');
    expect(zakladka).toHaveTextContent(T.zakladkaKoordynacja);
    expect(zakladka.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('mvd-wyniki-obszar-zwarcia')).toHaveAttribute('aria-selected', 'true');
    // Bez projektu ekran pokazuje UCZCIWY stan zerowy z akcją naprawczą.
    expect(screen.getByTestId('mvd-koordynacja-brak-projektu')).toBeTruthy();
  });

  it('deep-link „koordynacja" (K8): żądanie ze shell store otwiera zakładkę i jej obszar, żądanie skonsumowane', () => {
    useShellStore.setState({ wynikiTab: 'koordynacja' });
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-wyniki-zakladka-koordynacja').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('mvd-wyniki-obszar-zwarcia')).toHaveAttribute('aria-selected', 'true');
    expect(useShellStore.getState().wynikiTab).toBeNull();
  });

  it('deep-link ze shell store (F-E8.2): wynikiTab=„studium" otwiera zakładkę studium i czyści żądanie', async () => {
    useShellStore.setState({ wynikiTab: 'studium' });
    render(<WynikiWarsztat {...props()} />);
    // Montaż kreatora studium pobiera katalogi — puste act(async) domyka mikrotaski.
    await act(async () => {});
    expect(screen.getByTestId('mvd-wyniki-zakladka-studium').getAttribute('aria-selected')).toBe('true');
    expect(useShellStore.getState().wynikiTab).toBeNull();
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
  });

  it('deep-link: nieznane id zakładki jest ignorowane (walidacja), żądanie wyczyszczone (OBA pola)', () => {
    useShellStore.setState({ wynikiTab: 'nieistniejaca-zakladka', wynikiTabElement: 'bus-a' });
    render(<WynikiWarsztat {...props()} />);
    // Zakładka startowa bez zmian (bez przebiegu = ocena techniczna wyników).
    expect(screen.getByTestId('mvd-wyniki-zakladka-ocena').getAttribute('aria-selected')).toBe('true');
    expect(useShellStore.getState().wynikiTab).toBeNull();
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
  });

  it('deep-link „kompensacja" z elementem (R2-B): zakładka otwarta, węzeł pre-selekcjonowany, OBA pola wyczyszczone', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-lf-1' })],
      activeRunId: 'run-lf-1',
    });
    useSnapshotStore.setState({ snapshot: snapshotFixture() });
    useShellStore.setState({ wynikiTab: 'kompensacja', wynikiTabElement: 'bus-a' });
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-wyniki-zakladka-kompensacja').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('mvd-komp-wezel')).toHaveValue('bus-a');
    expect(screen.getByTestId('mvd-komp-oblicz')).toBeEnabled();
    expect(useShellStore.getState().wynikiTab).toBeNull();
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
  });

  it('deep-link z elementem do INNEJ zakładki nie przecieka do okna kompensacji', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-lf-1' })],
      activeRunId: 'run-lf-1',
    });
    useSnapshotStore.setState({ snapshot: snapshotFixture() });
    useShellStore.setState({ wynikiTab: 'studium', wynikiTabElement: 'bus-a' });
    render(<WynikiWarsztat {...props()} />);
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
    otworzZakladke('kompensacja');
    expect(screen.getByTestId('mvd-komp-wezel')).toHaveValue('');
  });

  it('zakładka „Porównanie A/B": bez aktywnego projektu — uczciwy stan pusty', () => {
    render(<WynikiWarsztat {...props()} />);
    otworzZakladke('porownanie');
    expect(screen.getByTestId('mvd-wyniki-porownanie-bez-projektu')).toHaveTextContent(
      T.porownanieBezProjektu,
    );
  });

  it('zakładka „Jakość wyników" (obszar oceny): bez przebiegów — uczciwe instrukcje obu sekcji', () => {
    render(<WynikiWarsztat {...props()} />);
    otworzZakladke('jakosc');
    expect(screen.getByTestId('mvd-jakosc-ekran')).toBeInTheDocument();
  });

  it('zakładka „Zgodność powykonawcza": bez przebiegu rozpływu — uczciwy stan pusty', () => {
    render(<WynikiWarsztat {...props()} />);
    otworzZakladke('odbior');
    expect(screen.getByTestId('mvd-odbior-ekran')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-odbior-brak-przebiegu')).toBeInTheDocument();
  });

  it('obszar OZE: każde okno renderuje się z uczciwym stanem zerowym', () => {
    render(<WynikiWarsztat {...props()} />);
    otworzZakladke('zdolnosc');
    expect(screen.getByTestId('mvd-zdol-ekran')).toBeInTheDocument();
    otworzZakladke('ranking');
    expect(screen.getByTestId('mvd-rank-ekran')).toBeInTheDocument();
    otworzZakladke('krzywe');
    expect(screen.getByTestId('mvd-krzywe-ekran')).toBeInTheDocument();
    otworzZakladke('obszar');
    expect(screen.getByTestId('mvd-obszar-ekran')).toBeInTheDocument();
    otworzZakladke('studium');
    expect(screen.getByTestId('mvd-studium-ekran')).toBeInTheDocument();
    otworzZakladke('frt');
    expect(screen.getByTestId('mvd-frt-ekran')).toBeInTheDocument();
    otworzZakladke('osd');
    expect(screen.getByTestId('mvd-osd-ekran')).toBeInTheDocument();
    otworzZakladke('kompensacja');
    expect(screen.getByTestId('mvd-komp-ekran')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-komp-brak-przebiegu')).toBeInTheDocument();
    otworzZakladke('lom');
    expect(screen.getByTestId('mvd-lom-ekran')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-lom-brak-przypadku')).toBeInTheDocument();
  });

  it('zakładka „Zgodność NC RfG": bez modułów wytwórczych — uczciwy stan pusty macierzy', async () => {
    render(<WynikiWarsztat {...props()} />);
    otworzZakladke('ncrfg');
    expect(screen.getByTestId('mvd-oze-pusty')).toBeInTheDocument();
    expect(await screen.findByTestId('mvd-oze-blad-katalogu')).toBeInTheDocument();
  });

  it('deep-link „ncrfg" z kontekstem modułu (P-1): zakładka otwarta, moduł pre-selekcjonowany po nazwie, OBA pola wyczyszczone', async () => {
    useStationDerStore.getState().attachDer({
      id: 'der-a', project_id: 'p-1', station_id: 'st-1',
      der_kind: 'PV', name: 'PV_T1', connection_side: 'nN',
    });
    useStationDerStore.getState().attachDer({
      id: 'der-b', project_id: 'p-1', station_id: 'st-1',
      der_kind: 'PV', name: 'PV_T4', connection_side: 'nN',
    });
    useShellStore.setState({ wynikiTab: 'ncrfg', wynikiTabElement: 'PV_T4' });
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-wyniki-zakladka-ncrfg').getAttribute('aria-selected')).toBe('true');
    await screen.findByTestId('mvd-oze-blad-katalogu');
    expect(screen.getByTestId('mvd-oze-modul-der-b')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('mvd-oze-modul-der-a')).toHaveAttribute('aria-pressed', 'false');
    expect(useShellStore.getState().wynikiTab).toBeNull();
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
  });

  it('deep-link „ncrfg" z nieznanym refem: zakładka otwarta, pre-selekcja bez zmian (zero fabrykacji)', async () => {
    useStationDerStore.getState().attachDer({
      id: 'der-a', project_id: 'p-1', station_id: 'st-1',
      der_kind: 'PV', name: 'PV_T1', connection_side: 'nN',
    });
    useShellStore.setState({ wynikiTab: 'ncrfg', wynikiTabElement: 'nieznany-ref' });
    render(<WynikiWarsztat {...props()} />);
    await screen.findByTestId('mvd-oze-blad-katalogu');
    expect(screen.getByTestId('mvd-oze-modul-der-a')).toHaveAttribute('aria-pressed', 'true');
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
  });

  it('zakładka „Wniosek OSD": bez biegów — okno renderuje się, generacja nieaktywna', () => {
    render(<WynikiWarsztat {...props()} />);
    otworzZakladke('wniosek');
    expect(screen.getByTestId('mvd-wniosek-ekran')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-wniosek-generuj')).toBeDisabled();
  });

  it('bez aktywnego przebiegu i przypadku: ocena techniczna z uczciwym stanem zerowym (nie most)', () => {
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-ocena-brak-przypadku')).toBeInTheDocument();
    expect(screen.queryByTestId('most-pozostale')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-rozplyw-szyny')).not.toBeInTheDocument();
  });

  it('aktywny zakończony rozpływ: startuje na zakładce „Rozpływ mocy" w obszarze rozpływu', () => {
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-1' })] });
    useAppStateStore.setState({ activeRunId: 'run-lf-1' });
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-wyniki-obszar-rozplyw')).toHaveAttribute('aria-selected', 'true');
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
    expect(screen.getAllByText('Szyna GPZ').length).toBeGreaterThan(0);
    expect(screen.getByTestId('mvd-wyniki-obszar-zwarcia')).toHaveAttribute('aria-selected', 'true');
  });

  it('hydratacja K2 (K3-A4): rejestr przebiegów doładowany PO montażu przełącza z oceny na rodzaj przebiegu', () => {
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-wyniki-zakladka-ocena')).toHaveAttribute('aria-selected', 'true');
    act(() => {
      useExecutionRunsStore.setState({
        runs: [przebiegFixture({ id: 'run-sc-9', analysis_type: 'SC_3F' })],
      });
      useAppStateStore.setState({ activeRunId: 'run-sc-9' });
    });
    expect(screen.getByTestId('mvd-wyniki-zakladka-zwarcia')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mvd-wyniki-obszar-zwarcia')).toHaveAttribute('aria-selected', 'true');
  });

  it('hydratacja K2 (K3-A4): rozpływ po hydratacji przełącza na zakładkę „Rozpływ mocy"', () => {
    render(<WynikiWarsztat {...props()} />);
    act(() => {
      useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-9' })] });
      useAppStateStore.setState({ activeRunId: 'run-lf-9' });
    });
    expect(screen.getByTestId('mvd-wyniki-zakladka-rozplyw')).toHaveAttribute('aria-selected', 'true');
  });

  it('K3-A4: ręczny wybór zakładki ma pierwszeństwo — hydratacja go nie nadpisuje', async () => {
    render(<WynikiWarsztat {...props()} />);
    otworzZakladke('dowod');
    act(() => {
      useExecutionRunsStore.setState({
        runs: [przebiegFixture({ id: 'run-sc-9', analysis_type: 'SC_3F' })],
      });
      useAppStateStore.setState({ activeRunId: 'run-sc-9' });
    });
    expect(screen.getByTestId('mvd-wyniki-zakladka-dowod')).toHaveAttribute('aria-selected', 'true');
    // Pakiet dowodowy czyta przebieg asynchronicznie — domykamy mikrotaski w act.
    await act(async () => {});
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

  // K3-A3: dostawcy kart dawnego huba E-29…E-32 — po kasacji huba (B-02) JEDYNA
  // realna ścieżka wejścia do tych ekranów prowadzi przez obszar → zakładkę
  // (intencja z testów `ekranStanuFazowego`/`ekranZbieznosci` „karta huba → dostawca"
  // przeniesiona tutaj: dostawcą E-30/E-31 jest zakładka obszaru rozpływu, E-32/E-29 —
  // obszaru zwarć/stabilności).
  it('zakładkowi dostawcy dawnych kart huba E-29…E-32 (K3-A3): cztery zakładki renderują ekrany ui2', () => {
    render(<WynikiWarsztat {...props()} />);
    otworzZakladke('zbieznosc');
    expect(screen.getByTestId('mvd-zbieznosc')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-wyniki-obszar-rozplyw')).toHaveAttribute('aria-selected', 'true');
    otworzZakladke('stan-fazowy');
    expect(screen.getByTestId('mvd-stan-fazowy')).toBeInTheDocument();
    otworzZakladke('skladowe');
    expect(screen.getByTestId('mvd-skladowe')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-wyniki-obszar-zwarcia')).toHaveAttribute('aria-selected', 'true');
    otworzZakladke('stabilnosc');
    expect(screen.getByTestId('mvd-stabilnosc')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-wyniki-obszar-stabilnosc')).toHaveAttribute('aria-selected', 'true');
  });

  it('klik przełącza zakładki między obszarami (rozpływ → zwarcia → widoki klasyczne)', () => {
    render(<WynikiWarsztat {...props()} />);
    otworzZakladke('rozplyw');
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
    otworzZakladke('zwarcia');
    expect(screen.getByTestId('mvd-zwarcia-ekran-pusty')).toBeInTheDocument();
    const klasyczne = otworzZakladke('pozostale');
    expect(klasyczne).toHaveTextContent(T.zakladkaPozostale);
    expect(screen.getByTestId('mvd-wyniki-obszar-klasyczne')).toHaveTextContent(T.obszarKlasyczne);
    expect(screen.getByTestId('most-pozostale')).toBeInTheDocument();
  });

  it('strzałki klawiatury przełączają zakładki W OBRĘBIE obszaru (roving tabindex, zawinięcie)', () => {
    render(<WynikiWarsztat {...props()} />);
    const ocena = screen.getByTestId('mvd-wyniki-zakladka-ocena');
    expect(ocena).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(ocena, { key: 'ArrowRight' });
    expect(screen.getByTestId('mvd-wyniki-zakladka-co-wymaga-uwagi')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByTestId('mvd-wyniki-zakladka-co-wymaga-uwagi'), { key: 'ArrowLeft' });
    expect(screen.getByTestId('mvd-wyniki-zakladka-ocena')).toHaveAttribute('aria-selected', 'true');
    // Zawinięcie: w lewo z pierwszej zakładki = ostatnia zakładka TEGO obszaru.
    fireEvent.keyDown(screen.getByTestId('mvd-wyniki-zakladka-ocena'), { key: 'ArrowLeft' });
    const ostatnia = OBSZARY[0].zakladki[OBSZARY[0].zakladki.length - 1];
    expect(screen.getByTestId(`mvd-wyniki-zakladka-${ostatnia}`)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mvd-wyniki-obszar-ocena-i-przeglad')).toHaveAttribute('aria-selected', 'true');
  });

  it('strzałki klawiatury na pasku obszarów przełączają obszar i otwierają jego pierwszą zakładkę', () => {
    render(<WynikiWarsztat {...props()} />);
    fireEvent.keyDown(screen.getByTestId('mvd-wyniki-obszar-ocena-i-przeglad'), { key: 'ArrowRight' });
    expect(screen.getByTestId('mvd-wyniki-obszar-rozplyw')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mvd-wyniki-zakladka-rozplyw')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByTestId('mvd-wyniki-obszar-rozplyw'), { key: 'ArrowLeft' });
    expect(screen.getByTestId('mvd-wyniki-obszar-ocena-i-przeglad')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mvd-wyniki-zakladka-ocena')).toHaveAttribute('aria-selected', 'true');
  });

  it('zakładka rozpływu bez wyniku w store: uczciwy stan pusty okna E8.1', () => {
    render(<WynikiWarsztat {...props()} />);
    otworzZakladke('rozplyw');
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
  });

  it('zakładka „Dowód obliczeń": bez przebiegu — uczciwy stan pusty okna E9.1', () => {
    render(<WynikiWarsztat {...props()} />);
    otworzZakladke('dowod');
    expect(screen.getByTestId('mvd-dowod-pusty')).toBeInTheDocument();
  });

  it('2×klik na wartości z dowodem w tabeli zwarć przełącza na zakładkę „Dowód obliczeń" (obszar oceny)', async () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-sc-1', analysis_type: 'SC_3F' })],
    });
    useAppStateStore.setState({ activeRunId: 'run-sc-1' });
    useResultsInspectorStore.setState({
      selectedRunId: 'run-sc-1',
      shortCircuitResults: wynikZwarciowyFixture(),
    });
    render(<WynikiWarsztat {...props()} />);
    const przyciskiDowodu = screen.getAllByRole('button', { name: WZORZEC_STRINGS.pokazDowod });
    fireEvent.doubleClick(przyciskiDowodu[0]);
    expect(screen.getByTestId('mvd-wyniki-zakladka-dowod')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mvd-wyniki-obszar-ocena-i-przeglad')).toHaveAttribute('aria-selected', 'true');
    // Pakiet dowodowy czyta przebieg asynchronicznie — domykamy mikrotaski w act.
    await act(async () => {});
  });

  it('powierzchnia trasowa mostu spoza dawnego huba przełącza na „Widoki klasyczne"; dawny hub — nie', () => {
    render(<WynikiWarsztat {...props()} />);
    // Dawny hub E-35 (domyślna zakładka „results") = widok zastąpiony rejestrem — bez przełączenia.
    act(() => {
      useNetworkBuildStore.getState().openRouteSurface('E-35');
    });
    expect(screen.getByTestId('mvd-wyniki-zakladka-ocena')).toHaveAttribute('aria-selected', 'true');
    // Jawny tab powierzchni analiz (deep-link `#analysis?tab=trace`) ma router TYLKO
    // w zakładce „Widoki klasyczne" — warsztat musi tam przejść, inaczej ślad byłby niewidoczny.
    act(() => {
      useNetworkBuildStore.getState().openRouteSurface('E-35', { tabId: 'trace' });
    });
    expect(screen.getByTestId('mvd-wyniki-zakladka-pozostale')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('most-pozostale')).toBeInTheDocument();
    // Zamknięcie powierzchni (powrót) nie przerzuca użytkownika gdzie indziej.
    act(() => {
      useNetworkBuildStore.getState().clearRouteManagedSurface();
    });
    expect(screen.getByTestId('mvd-wyniki-zakladka-pozostale')).toHaveAttribute('aria-selected', 'true');
  });
});

/**
 * V126-JEZYK (ocena właściciela 0/10 z 2026-08-07): pakiet analiz specjalistycznych
 * należy do trybu eksperckiego. Brama to PARA predykatów z JEDNEGO źródła
 * (`zakladkaDostepna` w `obszary.ts`): pasek obszarów (obszar bez dostępnej zakładki
 * znika), pasek zakładek, render treści — plus trzeci koniec: deep-link `setWynikiTab`.
 */
describe('WynikiWarsztat — brama trybu dla analiz specjalistycznych (V126-JEZYK)', () => {
  it('tor podstawowy: obszaru „Analizy specjalistyczne" NIE ma', () => {
    render(<WynikiWarsztat {...props({ trybZaawansowania: 'basic' })} />);
    expect(screen.queryByTestId('mvd-wyniki-obszar-specjalistyczne')).toBeNull();
    expect(screen.queryByTestId('mvd-wyniki-zakladka-akademickie')).toBeNull();
  });

  it('tor rozszerzony: obszaru NIE ma', () => {
    render(<WynikiWarsztat {...props({ trybZaawansowania: 'extended' })} />);
    expect(screen.queryByTestId('mvd-wyniki-obszar-specjalistyczne')).toBeNull();
  });

  it('tryb ekspercki: obszar jest i prowadzi do okna (kontrola dodatnia bramy)', () => {
    render(<WynikiWarsztat {...props({ trybZaawansowania: 'expert' })} />);
    expect(screen.getByTestId('mvd-wyniki-obszar-specjalistyczne')).toHaveTextContent(T.obszarSpecjalistyczne);
    const zakladka = otworzZakladke('akademickie');
    expect(zakladka).toHaveTextContent(T.zakladkaAkademickie);
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
      expect(screen.getByTestId('mvd-wyniki-zakladka-jakosc')).toHaveAttribute('aria-selected', 'true'),
    );
  });

  it('obniżenie trybu przy otwartej zakładce zamyka ją i wraca na ocenę (nie zostaje sierota)', () => {
    const { rerender } = render(<WynikiWarsztat {...props({ trybZaawansowania: 'expert' })} />);
    otworzZakladke('akademickie');
    expect(screen.getByTestId('mvd-akad-ekran')).toBeTruthy();
    rerender(<WynikiWarsztat {...props({ trybZaawansowania: 'basic' })} />);
    expect(screen.queryByTestId('mvd-akad-ekran')).toBeNull();
    expect(screen.getByTestId('mvd-wyniki-zakladka-ocena')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('mvd-wyniki-obszar-specjalistyczne')).toBeNull();
  });
});

describe('WynikiWarsztat — kontekst przebiegu zakładki „Dowód obliczeń" (R3-C, B-02)', () => {
  it('deep-link „dowod" z kontekstem: zakładka otwarta, ślad WSKAZANEGO przebiegu, OBA pola wyczyszczone', async () => {
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-1' })] });
    useAppStateStore.setState({ activeRunId: 'run-lf-1' });
    useShellStore.setState({ wynikiTab: 'dowod', wynikiTabElement: 'run-porownany' });
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-wyniki-zakladka-dowod').getAttribute('aria-selected')).toBe('true');
    const selectRun = useResultsInspectorStore.getState().selectRun;
    await waitFor(() => expect(selectRun).toHaveBeenCalledWith('run-porownany'));
    expect(selectRun).not.toHaveBeenCalledWith('run-lf-1');
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
    otworzZakladke('rozplyw');
    otworzZakladke('dowod');
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
    vi.mocked(fetchShortCircuitResults).mockImplementation(async (runId: string) => ({
      ...wynikZwarciowyFixture(),
      run_id: runId,
    }));
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
    otworzZakladke('porownanie');
    await screen.findByTestId('mvd-por-host');
    fireEvent.click(screen.getByTestId('mvd-por-tryb-zwarcia'));
    fireEvent.change(screen.getByTestId('mvd-porz-select-a'), { target: { value: 'sc-run-a' } });
    fireEvent.change(screen.getByTestId('mvd-porz-select-b'), { target: { value: 'sc-run-b' } });
    fireEvent.click(screen.getByTestId('mvd-porz-przycisk'));
    await screen.findByTestId('mvd-porz-wynik');
    fireEvent.doubleClick(screen.getAllByRole('button', { name: WZORZEC_STRINGS.pokazDowod })[0]);
    expect(screen.getByTestId('mvd-wyniki-zakladka-dowod')).toHaveAttribute('aria-selected', 'true');
    const selectRun = useResultsInspectorStore.getState().selectRun;
    await waitFor(() => expect(selectRun).toHaveBeenCalledWith('sc-run-a'));
    expect(useShellStore.getState().wynikiTab).toBeNull();
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
  });

  // B-02: pozycja oceny technicznej niesie ODWOŁANIE DO DOWODU (bieg + element) —
  // przycisk „Dowód obliczeń" otwiera wywód TEGO biegu, nie aktywnego (kryteria
  // rozpływu i zwarć pochodzą z różnych przebiegów). Dane: realna odpowiedź agregatu
  // werdyktu na sieci złotej (fixtura sceny „ocena").
  it('ocena techniczna → „Dowód obliczeń" otwiera wywód biegu wskazanego przez pozycję oceny', async () => {
    const fixtura = ocenaFixture as unknown as OdpowiedzOceny;
    useAppStateStore.setState({ activeCaseId: fixtura.case_id, activeProjectId: 'proj-1', activeRunId: 'run-lf-1' });
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-1' })], activeRunId: 'run-lf-1' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const adres = String(url);
        if (adres.includes('/api/quality/design-verdict')) {
          return { ok: true, status: 200, statusText: 'OK', json: async () => fixtura } as Response;
        }
        throw new Error(`nieoczekiwane wywołanie: ${adres}`);
      }),
    );
    render(<WynikiWarsztat {...props()} />);
    // Warsztat startuje na rozpływie (aktywny przebieg) — do oceny wchodzimy realną ścieżką.
    otworzZakladke('ocena');
    const dowody = await screen.findAllByTestId('mvd-ocena-dowod');
    fireEvent.click(dowody[0]);
    expect(screen.getByTestId('mvd-wyniki-zakladka-dowod')).toHaveAttribute('aria-selected', 'true');
    const pierwszyZDowodem = grupyZWynikami(fixtura)[0].pozycje[0].elementy.find((e) => e.dowod !== null);
    expect(pierwszyZDowodem?.dowod).toBeTruthy();
    const selectRun = useResultsInspectorStore.getState().selectRun;
    await waitFor(() => expect(selectRun).toHaveBeenCalledWith(pierwszyZDowodem!.dowod!.run_id));
    expect(selectRun).not.toHaveBeenCalledWith('run-lf-1');
  });
});

// EKRAN-N1, odbiór niezależny (2026-08-14): iniekcja nadzoru — zakładka ogłoszona w
// pasku, ale BEZ dostawcy treści — przetrwała 110 testów, bo każdy pin był INSTANCJĄ.
// Ten test przypina KLASĘ dla nawigacji dwupoziomowej: każdy obszar otwiera się,
// każda jego zakładka renderuje niepusty panel — uczciwy stan zerowy TEŻ jest treścią.
describe('WynikiWarsztat — KLASA: każdy obszar i każda zakładka ma dostawcę treści', () => {
  it('klik w każdy obszar i każdą jego zakładkę (tryb expert = komplet) renderuje niepusty panel', async () => {
    const { container } = render(<WynikiWarsztat {...props({ trybZaawansowania: 'expert' })} />);
    const obszary = screen.getAllByTestId(/^mvd-wyniki-obszar-/);
    expect(obszary).toHaveLength(OBSZARY.length);
    let policzone = 0;
    for (const obszar of obszary) {
      fireEvent.click(obszar);
      expect(obszar).toHaveAttribute('aria-selected', 'true');
      const zakladki = within(screen.getByRole('tablist', { name: T.ariaZakladki })).getAllByRole('tab');
      expect(zakladki.length, `obszar „${obszar.textContent}" bez zakładek`).toBeGreaterThan(0);
      for (const zakladka of zakladki) {
        fireEvent.click(zakladka);
        policzone += 1;
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
    }
    // Sanity: nawigacja nie skurczyła się cicho (32 zakładki w chwili przypięcia;
    // celowe usunięcie zakładki obniża próg razem z tą liczbą).
    expect(policzone).toBeGreaterThanOrEqual(32);
    expect(policzone).toBe(ZAKLADKI.length);
  });
});
