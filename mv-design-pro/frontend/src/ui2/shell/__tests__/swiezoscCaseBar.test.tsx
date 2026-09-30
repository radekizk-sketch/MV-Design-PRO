/*
 * Znacznik świeżości wyników w pasku aktywnego przypadku — ŚCIEŻKA REALNA
 * (karta K4/D1, dług V12K-309 poz. 2 domknięty w CV-2-W).
 *
 * DEFEKT (pomiar audytu 2026-08-01): po edycji modelu następującej PO biegu chip
 * trwał na „Wyniki: aktualne" — model rew. 9, wynik z rew. 8. Serwerowy
 * `result_status` zmieniał się dopiero, gdy KTOŚ unieważnił przypadek, a edycja
 * modelu przez tę ścieżkę nie przechodziła.
 *
 * GDZIE JEST TERAZ NAPRAWA. U ŹRÓDŁA: status wyników przypadku jest WYPROWADZANY
 * przez backend z jego biegów i koperty rewizji (`application/study_case/
 * status_wynikow.py`), razem z przyczyną po polsku i listą zmian, które go
 * unieważniły. Powłoka NIE liczy już świeżości drugi raz — poprzednia wersja
 * porównywała parę rewizji na własną rękę, co było drugą prawdą o jednym stanie.
 *
 * CZEGO PILNUJE TEN PLIK. Że chrom pokazuje WERDYKT SERWERA wiernie i że NIC w
 * store'ach (w szczególności podgląd przebiegu z inną rewizją migawki) nie jest
 * w stanie tego werdyktu wywrócić. Store'y zasilają PRODUKCYJNE hooki
 * (`useLegacyOrchestrator` + `useHydratacjaPowloki`) odpowiedziami serwera w
 * kształcie backendu, chip jest produkcyjny, a klik — natywny.
 */

import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { CaseBar } from '../CaseBar';
import { SHELL_STRINGS } from '../strings';
import { useShellCaseInfo } from '../shellStatus';
import { useShellStore } from '../useShellStore';
import { useHydratacjaPowloki } from '../useHydratacjaPowloki';
import { useLegacyOrchestrator } from '../../legacy/useLegacyOrchestrator';
import { useAppStateStore } from '../../../ui/app-state';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../../ui/selection/store';
import { getProject } from '../../../ui/projects/api';
import { getStudyCase } from '../../../ui/study-cases/api';
import type { StudyCaseResultStatus } from '../../../ui/study-cases/types';

vi.mock('../../../ui/projects/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../ui/projects/api')>();
  return { ...actual, getProject: vi.fn() };
});

vi.mock('../../../ui/study-cases/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../ui/study-cases/api')>();
  return { ...actual, getStudyCase: vi.fn() };
});

const PROJECT_ID = 'proj-swiezosc';
const CASE_ID = 'case-swiezosc';
const RUN_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const MODEL_HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f809';

const PRZYCZYNA_MODEL = 'Model zmienił się po obliczeniu — wynik opisuje poprzedni stan sieci.';
const PRZYCZYNA_KATALOG =
  'Biblioteka typów katalogowych zmieniła się po obliczeniu — parametry '
  + 'zmaterializowane w chwili biegu mogą różnić się od obowiązujących.';
const PRZYCZYNA_SWIEZY = 'Model nie zmienił się od chwili obliczenia.';

/** Migawka ENM o zadanej rewizji — kształt jak w odpowiedzi domain-ops. */
function enmSnapshot(revision: number) {
  return {
    header: {
      enm_version: '1.0',
      name: 'Sieć SN Przykładowa',
      revision,
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

function domainOpResponse(revision: number) {
  return {
    snapshot: enmSnapshot(revision),
    logical_views: { trunks: [], branches: [], secondary_connectors: [], terminals: [] },
    readiness: { ready: true, blockers: [], warnings: [] },
    fix_actions: [],
    changes: { created_element_ids: [], updated_element_ids: [], deleted_element_ids: [] },
    selection_hint: null,
    audit_trail: [],
    domain_events: [],
    materialized_params: { lines_sn: {}, transformers_sn_nn: {} },
    layout: { layout_hash: MODEL_HASH, layout_version: 'v1' },
  };
}

interface WerdyktSerwera {
  readonly status: StudyCaseResultStatus;
  readonly przyczyna: string;
  readonly kod: string;
  readonly rewizjaBiegu: number | null;
  readonly rewizjaBiezaca: number;
  readonly zmiany: ReadonlyArray<{
    rewizja: number;
    operacja: string | null;
    opis_pl: string;
    elementy: string[];
  }>;
}

const WERDYKT_SWIEZY: WerdyktSerwera = {
  status: 'FRESH',
  kod: 'model-niezmieniony',
  przyczyna: PRZYCZYNA_SWIEZY,
  rewizjaBiegu: 8,
  rewizjaBiezaca: 8,
  zmiany: [],
};

const WERDYKT_MODEL_ZMIENIONY: WerdyktSerwera = {
  status: 'OUTDATED',
  kod: 'model-zmieniony',
  przyczyna: PRZYCZYNA_MODEL,
  rewizjaBiegu: 8,
  rewizjaBiezaca: 9,
  zmiany: [
    {
      rewizja: 9,
      operacja: 'continue_trunk_segment_sn',
      opis_pl: 'Dołożono odcinek magistrali',
      elementy: ['LIN-2'],
    },
  ],
};

const WERDYKT_KATALOG: WerdyktSerwera = {
  status: 'OUTDATED',
  kod: 'katalog-zmieniony',
  przyczyna: PRZYCZYNA_KATALOG,
  rewizjaBiegu: 8,
  rewizjaBiezaca: 8,
  zmiany: [],
};

/** Przypadek w kształcie `StudyCaseResponse` (api/study_cases.py, CV-2-W). */
function studyCaseResponse(werdykt: WerdyktSerwera) {
  return {
    id: CASE_ID,
    project_id: PROJECT_ID,
    name: 'Zwarcia maks.',
    description: '',
    config: {},
    result_status: werdykt.status,
    results_valid: werdykt.status === 'FRESH',
    result_status_reason: werdykt.kod,
    result_status_reason_pl: werdykt.przyczyna,
    rewizja_biegu: werdykt.rewizjaBiegu,
    rewizja_biezaca: werdykt.rewizjaBiezaca,
    zmiany_od_biegu: werdykt.zmiany,
    is_active: true,
    revision: 3,
    created_at: '2026-08-01T09:00:00Z',
    updated_at: '2026-08-01T09:30:00Z',
  };
}

/** Rekord przebiegu w kształcie `/api/execution/study-cases/{id}/runs`. */
function runRecord(runId: string) {
  return {
    id: runId,
    study_case_id: CASE_ID,
    analysis_type: 'SC_3F',
    solver_input_hash: 'sha-in',
    status: 'DONE',
    started_at: '2026-08-01T09:20:00Z',
    finished_at: '2026-08-01T09:20:11Z',
    error_message: null,
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

/**
 * Zaślepka sieci w kształcie realnego backendu.
 * @param werdykt werdykt świeżości, który serwer oddaje przy przypadku
 * @param rewizjaModelu rewizja BIEŻĄCEGO modelu (odpowiedź domain-ops)
 */
function stubFetch(werdykt: WerdyktSerwera, rewizjaModelu: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === `/api/projects/${PROJECT_ID}`) {
        return jsonResponse({ id: PROJECT_ID, name: 'Sieć SN Przykładowa' });
      }
      if (url === `/api/study-cases/project/${PROJECT_ID}/active`) {
        return jsonResponse(studyCaseResponse(werdykt));
      }
      if (url === `/api/study-cases/project/${PROJECT_ID}`) {
        return jsonResponse([
          {
            id: CASE_ID,
            name: 'Zwarcia maks.',
            description: '',
            result_status: werdykt.status,
            results_valid: werdykt.status === 'FRESH',
            result_status_reason: werdykt.kod,
            result_status_reason_pl: werdykt.przyczyna,
            rewizja_biegu: werdykt.rewizjaBiegu,
            rewizja_biezaca: werdykt.rewizjaBiezaca,
            zmiany_od_biegu: werdykt.zmiany,
            is_active: true,
            updated_at: '2026-08-01T09:30:00Z',
          },
        ]);
      }
      if (url === `/api/study-cases/${CASE_ID}`) {
        return jsonResponse(studyCaseResponse(werdykt));
      }
      if (url === `/api/execution/study-cases/${CASE_ID}/runs`) {
        return jsonResponse({ runs: [runRecord(RUN_ID)] });
      }
      if (url === `/api/cases/${CASE_ID}/enm/domain-ops`) {
        return jsonResponse(domainOpResponse(rewizjaModelu));
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
}

function Probe() {
  useLegacyOrchestrator();
  useHydratacjaPowloki('connected');
  const info = useShellCaseInfo();
  return (
    <CaseBar
      info={info}
      onPrzejdzDoObliczen={() => useShellStore.getState().setActiveSpace('obliczenia')}
    />
  );
}

const initialAppState = useAppStateStore.getState();
const initialExecutionState = useExecutionRunsStore.getState();
const initialSnapshotState = useSnapshotStore.getState();
const initialNetworkBuildState = useNetworkBuildStore.getState();
const initialSelectionState = useSelectionStore.getState();
const initialStudyCasesState = useStudyCasesStore.getState();

/** Czeka, aż chrom pozna werdykt serwera i migawkę modelu. */
async function poczekajNaZnacznik(status: StudyCaseResultStatus): Promise<void> {
  await waitFor(() => {
    expect(useSnapshotStore.getState().snapshot?.header.revision).toBeDefined();
    expect(useStudyCasesStore.getState().activeCase?.result_status).toBe(status);
  });
}

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
  useShellStore.setState({ activeSpace: 'projekt' });
  useAppStateStore.setState(initialAppState, true);
  useExecutionRunsStore.setState(initialExecutionState, true);
  useSnapshotStore.setState(initialSnapshotState, true);
  useNetworkBuildStore.setState(initialNetworkBuildState, true);
  useSelectionStore.setState(initialSelectionState, true);
  useStudyCasesStore.setState(initialStudyCasesState, true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Znacznik świeżości wyników w pasku aktywnego przypadku (K4/D1 + CV-2-W)', () => {
  it('POMIAR AUDYTU: model rew. 9, wynik z rew. 8 → „Wyniki: nieaktualne" i natywny klik prowadzi do obliczeń', async () => {
    stubFetch(WERDYKT_MODEL_ZMIENIONY, 9);
    window.location.hash = `#sld?project=${PROJECT_ID}&case=${CASE_ID}`;

    render(<Probe />);
    await poczekajNaZnacznik('OUTDATED');

    const chip = await screen.findByText(SHELL_STRINGS.resultsOutdated);
    const przycisk = screen.getByTestId('mvd-casebar-results');
    expect(przycisk).toContainElement(chip);
    expect(przycisk.tagName).toBe('BUTTON');
    // Podpowiedź niesie PRZYCZYNĘ z serwera — chrom niczego nie tłumaczy sam.
    expect(przycisk.getAttribute('title')).toContain(PRZYCZYNA_MODEL);

    fireEvent.click(przycisk);
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });

  it('PRZYCZYNA „katalog zmieniony" (model bez zmian) też zapala „nieaktualne" z tekstem serwera', async () => {
    // Do CV-2 zmiana typu katalogowego nie unieważniała NICZEGO: rewizje modelu
    // były zgodne, więc każde porównanie rewizji po stronie UI mówiło „aktualne".
    stubFetch(WERDYKT_KATALOG, 8);
    window.location.hash = `#sld?project=${PROJECT_ID}&case=${CASE_ID}`;

    render(<Probe />);
    await poczekajNaZnacznik('OUTDATED');

    await waitFor(() => {
      expect(screen.getByTestId('mvd-casebar-results')).toHaveTextContent(
        SHELL_STRINGS.resultsOutdated,
      );
    });
    const chip = screen.getByTestId('mvd-casebar-results');
    expect(chip.getAttribute('title')).toContain('Biblioteka typów katalogowych');
    expect(chip).not.toHaveTextContent(SHELL_STRINGS.resultsFresh);
  });

  it('werdykt FRESH → „Wyniki: aktualne", znacznik statyczny', async () => {
    stubFetch(WERDYKT_SWIEZY, 8);
    window.location.hash = `#sld?project=${PROJECT_ID}&case=${CASE_ID}`;

    render(<Probe />);
    await poczekajNaZnacznik('FRESH');

    await waitFor(() => {
      expect(screen.getByTestId('mvd-casebar-results')).toHaveTextContent(
        SHELL_STRINGS.resultsFresh,
      );
    });
    const chip = screen.getByTestId('mvd-casebar-results');
    expect(chip.tagName).toBe('SPAN');
    expect(chip.getAttribute('title')).toBe(PRZYCZYNA_SWIEZY);

    // Znacznik AKTUALNY jest statyczny — klik NIE nawiguje. Porównujemy PRZED/PO,
    // bo trasa `#sld` ląduje w „Schemacie" i literał mówiłby o czymś innym.
    const przestrzenPrzedKlikiem = useShellStore.getState().activeSpace;
    fireEvent.click(chip);
    expect(useShellStore.getState().activeSpace).toBe(przestrzenPrzedKlikiem);
  });

  it('ŻADNA zmiana migawki w store nie wywraca werdyktu serwera (koniec drugiej derywacji)', async () => {
    // Wejście na link przebiegu wpisuje do `useSnapshotStore` migawkę SPRZED biegu
    // (`setAnalysisRunSnapshot`), a operacja domenowa — migawkę nowszą
    // (`setSnapshot`). Dopóki chrom liczył świeżość SAM, obie te akcje przestawiały
    // chip (raz na „aktualne", raz na „nieustalone") niezależnie od tego, co orzekł
    // serwer. Teraz werdykt ma jedno źródło: odpowiedź o przypadku.
    stubFetch(WERDYKT_SWIEZY, 8);
    window.location.hash = `#sld?project=${PROJECT_ID}&case=${CASE_ID}`;

    render(<Probe />);
    await poczekajNaZnacznik('FRESH');
    await waitFor(() => {
      expect(screen.getByTestId('mvd-casebar-results')).toHaveTextContent(
        SHELL_STRINGS.resultsFresh,
      );
    });

    const migawka = useSnapshotStore.getState().snapshot;
    expect(migawka).not.toBeNull();

    // Podgląd przebiegu (rewizja migawki = rewizja wyniku) — bez zmiany werdyktu.
    act(() => {
      useSnapshotStore.getState().setAnalysisRunSnapshot(migawka!, 'snap-podglad');
    });
    // Model jedzie dalej (rew. 9, akcja produkcyjna `setSnapshot`) — chip NADAL
    // pokazuje to, co orzekł serwer; przeliczenie werdyktu należy do backendu przy
    // następnym odczycie przypadku, nie do arytmetyki w powłoce.
    act(() => {
      useSnapshotStore.getState().setSnapshot(domainOpResponse(9) as never);
    });

    await waitFor(() => {
      expect(screen.getByTestId('mvd-casebar-results')).toHaveTextContent(
        SHELL_STRINGS.resultsFresh,
      );
    });
    expect(screen.getByTestId('mvd-casebar-results')).not.toHaveTextContent(
      SHELL_STRINGS.resultsOutdated,
    );
  });
});
