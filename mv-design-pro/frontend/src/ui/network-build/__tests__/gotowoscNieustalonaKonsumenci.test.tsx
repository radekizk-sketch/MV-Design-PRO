/*
 * Gotowość NIEUSTALONA nie jest gotowością — CZTEREJ KONSUMENCI spoza przestrzeni
 * „Gotowość". Dług V12K-317 poz. 4, karta W3 §2.2.
 *
 * DEFEKT: `statusGotowosci(null)` zwraca `OK`, a `liczbyWgWagi(null)` zera, więc
 * czytelnicy spoza przestrzeni „Gotowość" mapowali stan „NIKT tego nie policzył"
 * na werdykt POZYTYWNY: pasek operacyjny pisał „Układ ochrony skonfigurowany" /
 * „bez błędów krytycznych" / „układ do analizy", panel braków danych wywieszał
 * zieloną bramkę „Układ przygotowany do obliczeń", a kropka stanu elementu
 * świeciła na zielono — dokładnie wtedy, gdy odczyt gotowości z backendu padł.
 *
 * SYGNAŁ: reużyty z toru U5 — `podsumujGotowosc().ustalona` nad tym samym
 * `useSnapshotStore.readiness`, z którego żyje panel gotowości i chrom powłoki.
 * Ten test NIE tworzy drugiej definicji „gotowość ustalona"; sprawdza, że czterej
 * czytelnicy słuchają tej jednej.
 *
 * ŚCIEŻKA REALNA (karta §2.4): prowadzimy PRODUKCYJNY orkiestrator
 * (`useLegacyOrchestrator`) zimnym wejściem na adres — jedyną drogą, którą w
 * produkcji migawka trafia do store'u. Sterujemy WYŁĄCZNIE odpowiedziami serwera
 * (`fetch`); zero `setState` na store'ach badanych (`useSnapshotStore`,
 * `useNetworkBuildStore`). Renderowane są PRODUKCYJNE komponenty i hooki.
 *
 * ILOCZYN CECH (reguła KLASA, NIE INSTANCJA pkt 2): trzy stany gotowości
 * {USTALONA bez uwag, USTALONA z blokadami, NIEUSTALONA} × czterech konsumentów
 * (pasek operacyjny warsztatu, panel braków danych, wyliczenia budowy sieci,
 * kropka stanu elementu). Stan „ustalona bez uwag" jest w tabeli po to, żeby
 * naprawa nie zgasiła stanu DOBREGO — inaczej „nic nie świeci" przechodziłoby
 * jako poprawka.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceOperationalBar } from '../../workspace/WorkspaceOperationalBar';
import { DataGapPanel } from '../../engineering-readiness/DataGapPanel';
import { useNetworkBuildDerived, useNetworkBuildStore } from '../networkBuildStore';
import { useElementStatusDot } from '../liveReadiness';
import { useLegacyOrchestrator } from '../../../ui2/legacy/useLegacyOrchestrator';
import { useShellStore } from '../../../ui2/shell/useShellStore';
import { GOTOWOSC_STRINGS } from '../../../ui2/spaces/gotowosc/strings';
import { SHELL_STRINGS } from '../../../ui2/shell/strings';
import { useAppStateStore } from '../../app-state';
import { useExecutionRunsStore } from '../../study-cases/runStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useSelectionStore } from '../../selection/store';
import { getProject } from '../../projects/api';
import { getStudyCase } from '../../study-cases/api';

vi.mock('../../projects/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../projects/api')>();
  return { ...actual, getProject: vi.fn() };
});

vi.mock('../../study-cases/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../study-cases/api')>();
  return { ...actual, getStudyCase: vi.fn() };
});

const PROJECT_ID = 'proj-w3-konsumenci';
const CASE_ID = 'case-w3-konsumenci';
const RUN_ID = '7c2b5f10-93aa-4d18-8e61-15bd4f70c2a3';
const SNAPSHOT_ID = 'snap-w3-konsumenci';
const MODEL_HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f900112233445566778899aabbccddeeff0';
const ELEMENT_REF = 'LIN-1';

function enmSnapshot() {
  return {
    header: {
      enm_version: '1.0',
      name: 'Sieć SN Przykładowa',
      revision: 7,
      hash_sha256: MODEL_HASH,
    },
    sources: [{ ref_id: 'SRC-GPZ-1', name: 'GPZ 15 kV', bus_ref: 'BUS-SN-1' }],
    buses: [
      { ref_id: 'BUS-SN-1', name: 'Szyna SN', voltage_kv: 15 },
      { ref_id: 'BUS-SN-2', name: 'Szyna odpływowa', voltage_kv: 15 },
    ],
    branches: [
      { ref_id: ELEMENT_REF, type: 'line_overhead', from_ref: 'BUS-SN-1', to_ref: 'BUS-SN-2' },
    ],
    transformers: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    branch_points: [],
    corridors: [],
    line_runs: [],
    logical_views: { trunks: [], branches: [], secondary_connectors: [], terminals: [] },
  };
}

/** Blokada w kształcie `_build_readiness` (severity BLOKUJACE → BLOCKER). */
const E005 = {
  code: 'E005',
  message_pl: "Gałąź 'LIN-1' ma zerową impedancję (R=0 i X=0 Ω/km).",
  element_ref: ELEMENT_REF,
  severity: 'BLOKUJACE',
};

function domainOpResponse(readiness: unknown) {
  return {
    snapshot: enmSnapshot(),
    logical_views: { trunks: [], branches: [], secondary_connectors: [], terminals: [] },
    readiness,
    fix_actions: [],
    changes: { created_element_ids: [], updated_element_ids: [], deleted_element_ids: [] },
    selection_hint: null,
    audit_trail: [],
    domain_events: [],
    materialized_params: { lines_sn: {}, transformers_sn_nn: {} },
    layout: { layout_hash: MODEL_HASH, layout_version: 'v1' },
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

/** Stany gotowości badane w iloczynie cech. */
type StanGotowosci = 'ustalona-bez-uwag' | 'ustalona-z-blokadami' | 'nieustalona';

const READINESS_WG_STANU: Record<StanGotowosci, unknown> = {
  'ustalona-bez-uwag': { ready: true, blockers: [], warnings: [] },
  'ustalona-z-blokadami': { ready: false, blockers: [E005], warnings: [] },
  nieustalona: null, // nieosiągalne przez odpowiedź — odczyt gotowości PADA (patrz stubFetch)
};

function stubFetch(stan: StanGotowosci): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === `/api/analysis-runs/${RUN_ID}/snapshot`) {
        // Kontrakt backendu: run_id / snapshot_id / snapshot — BEZ gotowości.
        return jsonResponse({ run_id: RUN_ID, snapshot_id: SNAPSHOT_ID, snapshot: enmSnapshot() });
      }
      if (url === `/api/analysis-runs/${RUN_ID}`) {
        return jsonResponse({ status: 'DONE', result_status: 'DONE', results_valid: true });
      }
      if (url === `/api/cases/${CASE_ID}/enm/domain-ops`) {
        if (stan === 'nieustalona') {
          // JEDYNA droga do `readiness === null` w produkcji: odczyt gotowości pada,
          // a `refreshReadinessFromBackend` zostawia null (NIGDY wartość zmyśloną).
          throw new TypeError('Failed to fetch');
        }
        return jsonResponse(domainOpResponse(READINESS_WG_STANU[stan]));
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
}

/** Sonda kropki stanu elementu — produkcyjny hook, ten sam, którego używa `BayCard`. */
function KropkaElementu() {
  const dot = useElementStatusDot(ELEMENT_REF);
  return <span data-testid="sonda-kropka">{dot}</span>;
}

/** Sonda wyliczeń budowy sieci — produkcyjny hook `useNetworkBuildDerived`. */
function SondaBudowy() {
  const { isReady, buildPhase, readinessUstalona } = useNetworkBuildDerived();
  return (
    <>
      <span data-testid="sonda-isready">{String(isReady)}</span>
      <span data-testid="sonda-faza">{buildPhase}</span>
      <span data-testid="sonda-ustalona">{String(readinessUstalona)}</span>
    </>
  );
}

/** Wszyscy czterej konsumenci naraz, nad JEDNYM produkcyjnym orkiestratorem. */
function Probe() {
  useLegacyOrchestrator();
  return (
    <>
      <WorkspaceOperationalBar />
      <DataGapPanel />
      <SondaBudowy />
      <KropkaElementu />
    </>
  );
}

const initialAppState = useAppStateStore.getState();
const initialExecutionState = useExecutionRunsStore.getState();
const initialSnapshotState = useSnapshotStore.getState();
const initialNetworkBuildState = useNetworkBuildStore.getState();
const initialSelectionState = useSelectionStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.location.hash = '';
  vi.mocked(getProject).mockResolvedValue({
    id: PROJECT_ID,
    name: 'Sieć SN Przykładowa',
  } as Awaited<ReturnType<typeof getProject>>);
  vi.mocked(getStudyCase).mockResolvedValue({
    id: CASE_ID,
    project_id: PROJECT_ID,
    name: 'Zwarcia maks.',
    result_status: 'FRESH',
  } as Awaited<ReturnType<typeof getStudyCase>>);
  useShellStore.setState({ activeSpace: 'model' });
  useAppStateStore.setState(initialAppState, true);
  useExecutionRunsStore.setState(initialExecutionState, true);
  useSnapshotStore.setState(initialSnapshotState, true);
  useNetworkBuildStore.setState(initialNetworkBuildState, true);
  useSelectionStore.setState(initialSelectionState, true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Doprowadza aplikację do żądanego stanu gotowości PRODUKCYJNĄ ścieżką i czeka,
 * aż migawka będzie w store'rze (model wczytany) — dopiero wtedy czytelnicy mają
 * co oceniać.
 */
async function uruchom(stan: StanGotowosci): Promise<void> {
  stubFetch(stan);
  // Zimne wejście na głęboki link przebiegu: migawka wchodzi BEZ gotowości,
  // a gotowość dociąga osobny odczyt — ten, który w stanie „nieustalona" pada.
  window.location.hash = `#analysis?case=${CASE_ID}&run=${RUN_ID}`;
  render(<Probe />);
  await waitFor(() => {
    expect(useSnapshotStore.getState().snapshot?.header.revision).toBe(7);
  });
  await waitFor(() => {
    const readiness = useSnapshotStore.getState().readiness;
    if (stan === 'nieustalona') expect(readiness).toBeNull();
    else expect(readiness).not.toBeNull();
  });
}

describe('gotowość NIEUSTALONA u czterech konsumentów (V12K-317 poz. 4)', () => {
  // -------------------------------------------------------------------------
  // Konsument 1/4 — pasek operacyjny warsztatu
  // -------------------------------------------------------------------------
  describe('1/4 pasek operacyjny warsztatu', () => {
    it('NIEUSTALONA → cztery segmenty pokazują brak danej, żaden nie deklaruje sukcesu', async () => {
      await uruchom('nieustalona');

      for (const segment of [
        'workspace-operational-computation',
        'workspace-operational-protection',
        'workspace-operational-errors',
        'workspace-operational-blockers',
      ]) {
        await waitFor(() => {
          expect(screen.getByTestId(segment)).toHaveTextContent(SHELL_STRINGS.emptyValue);
        });
      }

      // Żaden werdykt pozytywny nie może paść przy „nie wiadomo".
      expect(screen.queryByText('Układ ochrony skonfigurowany')).toBeNull();
      expect(screen.queryByText('bez błędów krytycznych')).toBeNull();
      expect(screen.queryByText('układ do analizy')).toBeNull();
    });

    it('USTALONA z blokadami → pasek nazywa blokadę, nie brak danej', async () => {
      await uruchom('ustalona-z-blokadami');

      await waitFor(() => {
        expect(screen.getByTestId('workspace-operational-computation')).toHaveTextContent(
          '1 do konfiguracji',
        );
      });
      expect(screen.getByTestId('workspace-operational-errors')).toHaveTextContent(
        '1 błędów technicznych',
      );
      expect(screen.queryByText('układ do analizy')).toBeNull();
    });

    it('USTALONA bez uwag → stan DOBRY nadal jest deklarowany (naprawa go nie gasi)', async () => {
      await uruchom('ustalona-bez-uwag');

      await waitFor(() => {
        expect(screen.getByTestId('workspace-operational-blockers')).toHaveTextContent(
          'układ do analizy',
        );
      });
      expect(screen.getByTestId('workspace-operational-protection')).toHaveTextContent(
        'Układ ochrony skonfigurowany',
      );
      expect(screen.getByTestId('workspace-operational-errors')).toHaveTextContent(
        'bez błędów krytycznych',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Konsument 2/4 — panel braków danych
  // -------------------------------------------------------------------------
  describe('2/4 panel braków danych', () => {
    it('NIEUSTALONA → uczciwy stan zerowy zamiast zielonej bramki', async () => {
      await uruchom('nieustalona');

      expect(await screen.findByTestId('data-gap-panel-nieustalona')).toBeInTheDocument();
      expect(screen.getByText(GOTOWOSC_STRINGS.nieustalonaTytul)).toBeInTheDocument();
      expect(screen.queryByTestId('data-gap-panel-ready')).toBeNull();
      expect(screen.queryByText('Układ przygotowany do obliczeń')).toBeNull();
    });

    it('USTALONA z blokadami → lista problemów, nie stan zerowy', async () => {
      await uruchom('ustalona-z-blokadami');

      await waitFor(() => {
        expect(screen.getByText(E005.message_pl)).toBeInTheDocument();
      });
      expect(screen.queryByTestId('data-gap-panel-nieustalona')).toBeNull();
      expect(screen.queryByTestId('data-gap-panel-ready')).toBeNull();
    });

    it('USTALONA bez uwag → zielona bramka nadal działa', async () => {
      await uruchom('ustalona-bez-uwag');

      expect(await screen.findByTestId('data-gap-panel-ready')).toBeInTheDocument();
      expect(screen.getByText('Układ przygotowany do obliczeń')).toBeInTheDocument();
      expect(screen.queryByTestId('data-gap-panel-nieustalona')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Konsument 3/4 — wyliczenia budowy sieci
  // -------------------------------------------------------------------------
  describe('3/4 wyliczenia budowy sieci', () => {
    it('NIEUSTALONA → `isReady` fałsz, faza NIE „READY", sygnał ustalonej fałsz', async () => {
      await uruchom('nieustalona');

      await waitFor(() => {
        expect(screen.getByTestId('sonda-ustalona')).toHaveTextContent('false');
      });
      expect(screen.getByTestId('sonda-isready')).toHaveTextContent('false');
      expect(screen.getByTestId('sonda-faza')).not.toHaveTextContent('READY');
    });

    it('USTALONA z blokadami → `isReady` fałsz, ale sygnał ustalonej PRAWDA', async () => {
      await uruchom('ustalona-z-blokadami');

      await waitFor(() => {
        expect(screen.getByTestId('sonda-ustalona')).toHaveTextContent('true');
      });
      expect(screen.getByTestId('sonda-isready')).toHaveTextContent('false');
    });

    it('USTALONA bez uwag → sygnał ustalonej PRAWDA (stan dobry nietknięty)', async () => {
      await uruchom('ustalona-bez-uwag');

      await waitFor(() => {
        expect(screen.getByTestId('sonda-ustalona')).toHaveTextContent('true');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Konsument 4/4 — kropka stanu elementu
  // -------------------------------------------------------------------------
  describe('4/4 kropka stanu elementu', () => {
    it('NIEUSTALONA → kropka się NIE zapala (brak danej), nigdy zielona', async () => {
      await uruchom('nieustalona');

      await waitFor(() => {
        expect(screen.getByTestId('sonda-kropka')).toHaveTextContent('none');
      });
    });

    it('USTALONA z blokadami → kropka czerwona na elemencie z blokadą', async () => {
      await uruchom('ustalona-z-blokadami');

      await waitFor(() => {
        expect(screen.getByTestId('sonda-kropka')).toHaveTextContent('error');
      });
    });

    it('USTALONA bez uwag → kropka zielona (stan dobry nietknięty)', async () => {
      await uruchom('ustalona-bez-uwag');

      await waitFor(() => {
        expect(screen.getByTestId('sonda-kropka')).toHaveTextContent('ok');
      });
    });
  });
});
