/*
 * Gotowość NIEUSTALONA nie jest gotowością (dług V12K-309 poz. 1) — ŚCIEŻKA REALNA.
 *
 * DEFEKT: przy wczytanej migawce i `readiness === null` `useStanGotowosci`
 * zwracał `wszystko-gotowe`, więc panel deklarował „Gotowe do analiz — kontrola
 * techniczna układu nie wskazuje braków". Po naprawie D5 (V12K-309) ten stan jest
 * osiągalny WYŁĄCZNIE wtedy, gdy odczyt gotowości z backendu padnie — czyli
 * dokładnie wtedy, gdy NIE WIADOMO, panel twierdził, że jest dobrze.
 *
 * ŚCIEŻKA REALNA (wymóg karty): prowadzimy PRODUKCYJNY orkiestrator zimnym
 * wejściem na głęboki link przebiegu (`#analysis?case=…&run=…`) — jedyną drogą,
 * którą w produkcji migawka trafia do store'u bez gotowości. Gotowość dociąga
 * `refreshReadinessFromBackend`; scenariusz zaczyna od odpowiedzi błędnej, więc
 * `readiness` zostaje `null`. Panel jest produkcyjny, przycisk klikany natywnie,
 * a kolejny odczyt zwraca PRAWDZIWĄ gotowość z blokadą. Zero `setState` na
 * badanych store'ach, zero syntetycznych zdarzeń.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { PanelGotowosci } from '../PanelGotowosci';
import { GOTOWOSC_STRINGS } from '../strings';
import { useLegacyOrchestrator } from '../../../legacy/useLegacyOrchestrator';
import { useShellStore } from '../../../shell/useShellStore';
import { useAppStateStore } from '../../../../ui/app-state';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../../../ui/selection/store';
import { getProject } from '../../../../ui/projects/api';
import { getStudyCase } from '../../../../ui/study-cases/api';

vi.mock('../../../../ui/projects/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../ui/projects/api')>();
  return { ...actual, getProject: vi.fn() };
});

vi.mock('../../../../ui/study-cases/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../ui/study-cases/api')>();
  return { ...actual, getStudyCase: vi.fn() };
});

const PROJECT_ID = 'proj-gotowosc-nieustalona';
const CASE_ID = 'case-gotowosc-nieustalona';
const RUN_ID = '4e8a1d90-2b77-4c31-9f52-6ad0c3e91b47';
const SNAPSHOT_ID = 'snap-nieustalona';
const MODEL_HASH = 'c0ffee11deadbeef2233445566778899aabbccddeeff00112233445566778899';

function enmSnapshot() {
  return {
    header: {
      enm_version: '1.0',
      name: 'Sieć SN Przykładowa',
      revision: 5,
      hash_sha256: MODEL_HASH,
    },
    sources: [{ ref_id: 'SRC-GPZ-1', name: 'GPZ 15 kV', bus_ref: 'BUS-SN-1' }],
    buses: [
      { ref_id: 'BUS-SN-1', name: 'Szyna SN', voltage_kv: 15 },
      { ref_id: 'BUS-SN-2', name: 'Szyna odpływowa', voltage_kv: 15 },
    ],
    branches: [{ ref_id: 'LIN-1', type: 'line_overhead', from_ref: 'BUS-SN-1', to_ref: 'BUS-SN-2' }],
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
  element_ref: 'LIN-1',
  severity: 'BLOKUJACE',
};

function domainOpResponse() {
  return {
    snapshot: enmSnapshot(),
    logical_views: { trunks: [], branches: [], secondary_connectors: [], terminals: [] },
    readiness: { ready: false, blockers: [E005], warnings: [] },
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

/** Liczba wywołań operacji domenowej — dowód, że ponowienie NAPRAWDĘ pyta serwer. */
let odczytyGotowosci = 0;
/** Pierwsze `ileBledow` odczytów gotowości kończy się błędem sieci. */
let ileBledow = 0;

function stubFetch() {
  odczytyGotowosci = 0;
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
        odczytyGotowosci += 1;
        if (odczytyGotowosci <= ileBledow) {
          throw new TypeError('Failed to fetch');
        }
        return jsonResponse(domainOpResponse());
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
}

/**
 * Czeka, aż licznik odczytów gotowości przestanie rosnąć (dwa kolejne pomiary
 * w odstępie 150 ms równe). Bez tego wzrost licznika po kliku mógłby pochodzić
 * od samoczynnego ponowienia orkiestratora — test przechodziłby, nie sprawdzając
 * niczego o przycisku.
 */
async function poczekajNaCisze(): Promise<void> {
  let poprzedni = -1;
  for (let proba = 0; proba < 20; proba += 1) {
    const biezacy = odczytyGotowosci;
    if (biezacy === poprzedni) return;
    poprzedni = biezacy;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Odczyty gotowości nie ucichły — licznik rośnie bez końca');
}

function Probe() {
  useLegacyOrchestrator();
  return (
    <PanelGotowosci trybZaawansowania="basic" onSelekcja={vi.fn()} onAkcjaNaprawcza={vi.fn()} />
  );
}

const initialAppState = useAppStateStore.getState();
const initialExecutionState = useExecutionRunsStore.getState();
const initialSnapshotState = useSnapshotStore.getState();
const initialNetworkBuildState = useNetworkBuildStore.getState();
const initialSelectionState = useSelectionStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  ileBledow = 0;
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
  useShellStore.setState({ activeSpace: 'gotowosc' });
  useAppStateStore.setState(initialAppState, true);
  useExecutionRunsStore.setState(initialExecutionState, true);
  useSnapshotStore.setState(initialSnapshotState, true);
  useNetworkBuildStore.setState(initialNetworkBuildState, true);
  useSelectionStore.setState(initialSelectionState, true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Panel „Gotowość" — gotowość nieustalona NIE jest gotowością (V12K-309 poz. 1)', () => {
  it('nieudany odczyt gotowości → stan nieustalony z akcją, NIGDY „Gotowe do analiz"', async () => {
    ileBledow = 99; // każdy odczyt gotowości pada
    stubFetch();
    window.location.hash = `#analysis?case=${CASE_ID}&run=${RUN_ID}`;

    render(<Probe />);

    // Migawka jest w store (model wczytany), gotowości NIE MA.
    await waitFor(() => {
      expect(useSnapshotStore.getState().snapshot?.header.revision).toBe(5);
    });
    await waitFor(() => {
      expect(odczytyGotowosci).toBeGreaterThan(0);
    });
    expect(useSnapshotStore.getState().readiness).toBeNull();

    // Uczciwy stan zerowy zamiast fałszywej zielonej bramki.
    expect(await screen.findByTestId('mvd-gotowosc-nieustalona')).toBeInTheDocument();
    expect(screen.getByText(GOTOWOSC_STRINGS.nieustalonaTytul)).toBeInTheDocument();
    expect(screen.queryByText(GOTOWOSC_STRINGS.wszystkoGotowe)).toBeNull();
    expect(screen.queryByText(GOTOWOSC_STRINGS.wszystkoGotoweOpis)).toBeNull();
    expect(screen.queryByTestId('mvd-gotowosc-ok')).toBeNull();
    // Bramka „następny krok → obliczenia" też nie może kusić przy „nie wiadomo".
    expect(screen.queryByTestId('mvd-gotowosc-nastepny')).toBeNull();

    // Wyjście ze stanu „nie wiadomo" istnieje i jest klikalne.
    expect(screen.getByTestId('mvd-gotowosc-ponow')).toHaveTextContent(
      GOTOWOSC_STRINGS.sprobujPonownie,
    );
  });

  it('natywny klik „Spróbuj ponownie" pyta serwer i pokazuje PRAWDZIWĄ gotowość', async () => {
    ileBledow = 99; // serwer niedostępny — dopóki nie odblokujemy go niżej
    stubFetch();
    window.location.hash = `#analysis?case=${CASE_ID}&run=${RUN_ID}`;

    render(<Probe />);

    const przycisk = await screen.findByTestId('mvd-gotowosc-ponow');

    // Cisza na łączu: dopiero gdy orkiestrator przestanie ponawiać samoczynnie,
    // wzrost licznika po kliku dowodzi, że to KLIK zapytał serwer (a nie efekt
    // trasowy, który akurat wypadł w tej samej chwili).
    await poczekajNaCisze();
    ileBledow = odczytyGotowosci; // każde KOLEJNE zapytanie zwraca gotowość
    const przedKlikiem = odczytyGotowosci;

    await userEvent.click(przycisk);

    await waitFor(() => {
      expect(odczytyGotowosci).toBe(przedKlikiem + 1);
    });

    // Gotowość policzona przez serwer — panel pokazuje blokadę, nie „gotowe".
    await waitFor(() => {
      expect(screen.getByTestId('mvd-gotowosc-blokady-calkowite')).toHaveTextContent('1');
    });
    expect(screen.getByText(E005.message_pl)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-gotowosc-nieustalona')).toBeNull();
    expect(screen.queryByText(GOTOWOSC_STRINGS.wszystkoGotowe)).toBeNull();
    expect(useSnapshotStore.getState().readiness?.blockers).toHaveLength(1);
  });

  it('gotowość POLICZONA i bez uwag nadal daje „Gotowe do analiz" (naprawa nie gasi stanu dobrego)', async () => {
    odczytyGotowosci = 0;
    // Zwykłe wejście na model: operacja domenowa niesie gotowość — tu bez uwag.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url === `/api/cases/${CASE_ID}/enm/domain-ops`) {
          odczytyGotowosci += 1;
          return jsonResponse({
            ...domainOpResponse(),
            readiness: { ready: true, blockers: [], warnings: [] },
          });
        }
        return { ok: false, status: 404, json: async () => ({}) };
      }),
    );
    window.location.hash = `#sld?project=${PROJECT_ID}&case=${CASE_ID}`;

    render(<Probe />);

    expect(await screen.findByTestId('mvd-gotowosc-ok')).toBeInTheDocument();
    expect(screen.getByText(GOTOWOSC_STRINGS.wszystkoGotowe)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-gotowosc-nieustalona')).toBeNull();
  });
});
