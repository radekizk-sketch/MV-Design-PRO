/*
 * Wyścig „koniec biegu vs nawigacja projektanta" (karta S9-3, znalezisko W-3
 * audytu `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`).
 *
 * DEFEKT: `uruchomObliczenie` kończyło się bezwarunkowym `navigateToResults`.
 * Bieg trwa sekundy, więc skok lądował na projektancie, który w międzyczasie
 * wrócił na schemat — kanwa montowała się i po chwili znikała (pomiar HEAD:
 * 590 ms). Kontrakt naprawy: nawigacja użytkownika ZAWSZE wygrywa; skok po
 * biegu wolno wykonać najwyżej RAZ i tylko z niezmienionego miejsca pracy.
 *
 * ILOCZYN CECH (reguła KLASA, NIE INSTANCJA §2) — nie sam przykład z karty:
 *   {bieg kończy się PO wejściu na schemat, PRZED wejściem}
 *   × {miejsce startu: schemat / obliczenia / wyniki}
 *   × {bieg udany, bieg nieudany}.
 * Kontrola dodatnia jest równie ważna jak reprodukcja: lądowisko wyników
 * (V12K-273) MUSI dalej działać dla biegu bez interakcji użytkownika.
 *
 * ŚCIEŻKA UŻYTKOWNIKA: zmianę miejsca pracy w trakcie biegu wykonujemy
 * PRODUKCYJNĄ funkcją `przejdzDoPrzestrzeni` (tą samą, którą woła klik w
 * nawigacji przestrzeni AppShell) — nie ustawiamy stanu store'a ręcznie.
 * Natywny klik na żywej aplikacji pokrywa spec e2e
 * `e2e/pulapka-nawigacji-po-biegu.spec.ts` (bramka tej samej karty).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { uruchomObliczenie } from '../uruchomObliczenie';
import { przejdzDoPrzestrzeni } from '../../../shell/przejsciaPrzestrzeni';
import { useShellStore } from '../../../shell/useShellStore';
import { useAppStateStore } from '../../../../ui/app-state';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import type { ExecutionRun } from '../../../../ui/study-cases/types';

const CASE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const RUN_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

function runFixture(over: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: RUN_ID,
    study_case_id: CASE_ID,
    analysis_type: 'SC_3F',
    solver_input_hash: 'hash',
    status: 'DONE',
    started_at: '2026-08-06T10:00:00Z',
    finished_at: '2026-08-06T10:00:05Z',
    error_message: null,
    ...over,
  };
}

/**
 * Instaluje tor biegu, którego zakończenie następuje PO wykonaniu `wTrakcieBiegu`
 * — czyli po tym, jak projektant zmienił miejsce pracy. `createAndExecuteRun`
 * jest naturalnym punktem wstrzyknięcia: to jedyna chwila, w której bieg jeszcze
 * trwa, a test ma kontrolę nad kolejnością.
 */
function torBiegu(opcje: { wTrakcieBiegu?: () => void; run?: ExecutionRun } = {}) {
  const createAndExecuteRun = vi.fn(async () => {
    opcje.wTrakcieBiegu?.();
    return opcje.run ?? runFixture();
  });
  useExecutionRunsStore.setState({
    runs: [],
    activeRunId: null,
    runStatus: null,
    createAndExecuteRun,
    pollRunStatus: vi.fn(async () => opcje.run ?? runFixture()),
  } as never);
  return createAndExecuteRun;
}

function trasa(): string {
  const hash = window.location.hash;
  const q = hash.indexOf('?');
  return q >= 0 ? hash.slice(0, q) : hash;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.location.hash = '';
  useAppStateStore.setState({ activeProjectId: 'projekt-1', activeCaseId: CASE_ID } as never);
  useSnapshotStore.setState({ readiness: { ready: true, blockers: [], warnings: [] } } as never);
  useShellStore.setState({ activeSpace: 'obliczenia' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('W-3 — bieg kończy się PO wejściu projektanta na schemat', () => {
  it('start ze „Schematu": zero automatycznej nawigacji, projektant zostaje na kanwie', async () => {
    window.location.hash = '#sld';
    useShellStore.setState({ activeSpace: 'schemat' });
    // Projektant „odchodzi" w trakcie biegu na Gotowość i wraca na Schemat —
    // ważne, że OSTATNIA nawigacja jest jego, a nie powłoki.
    torBiegu({ wTrakcieBiegu: () => przejdzDoPrzestrzeni('gotowosc') });

    const ok = await uruchomObliczenie('SC_3F');

    expect(ok).toBe(true);
    expect(useShellStore.getState().activeSpace).toBe('gotowosc');
    expect(trasa()).not.toBe('#analysis');
  });

  it('start z „Obliczeń": wejście na schemat w trakcie biegu wygrywa', async () => {
    window.location.hash = '#case-config';
    useShellStore.setState({ activeSpace: 'obliczenia' });
    torBiegu({ wTrakcieBiegu: () => przejdzDoPrzestrzeni('schemat') });

    await uruchomObliczenie('SC_3F');

    expect(useShellStore.getState().activeSpace).toBe('schemat');
    expect(trasa()).toBe('#sld');
  });

  it('start z „Wyników": wejście na schemat w trakcie biegu wygrywa (rozpływ)', async () => {
    window.location.hash = '#analysis';
    useShellStore.setState({ activeSpace: 'wyniki' });
    torBiegu({
      wTrakcieBiegu: () => przejdzDoPrzestrzeni('schemat'),
      run: runFixture({ analysis_type: 'LOAD_FLOW' }),
    });

    await uruchomObliczenie('LOAD_FLOW');

    expect(useShellStore.getState().activeSpace).toBe('schemat');
    expect(trasa()).toBe('#sld');
  });

  it('bieg NIEUDANY również nie wyrywa projektanta z bieżącej pracy', async () => {
    window.location.hash = '#sld';
    useShellStore.setState({ activeSpace: 'schemat' });
    torBiegu({
      wTrakcieBiegu: () => przejdzDoPrzestrzeni('gotowosc'),
      run: runFixture({ status: 'FAILED' }),
    });

    const ok = await uruchomObliczenie('SC_3F');

    expect(ok).toBe(false);
    expect(trasa()).not.toBe('#analysis');
  });
});

describe('Kontrola dodatnia — lądowisko wyników bez interakcji (V12K-273 nietknięte)', () => {
  it('start z „Obliczeń": bieg bez ruchu użytkownika przenosi na wyniki z ?run=', async () => {
    window.location.hash = '#case-config';
    useShellStore.setState({ activeSpace: 'obliczenia' });
    torBiegu();

    const ok = await uruchomObliczenie('SC_3F');

    expect(ok).toBe(true);
    expect(trasa()).toBe('#analysis');
    expect(window.location.hash).toContain(`run=${RUN_ID}`);
  });

  it('start ze „Schematu": bieg bez ruchu użytkownika też przenosi na wyniki', async () => {
    window.location.hash = '#sld';
    useShellStore.setState({ activeSpace: 'schemat' });
    torBiegu();

    await uruchomObliczenie('SC_3F');

    expect(trasa()).toBe('#analysis');
    expect(window.location.hash).toContain(`run=${RUN_ID}`);
  });

  it('start z „Wyników": ponowny bieg odświeża ?run= bez zmiany trasy', async () => {
    window.location.hash = '#analysis?run=stary';
    useShellStore.setState({ activeSpace: 'wyniki' });
    torBiegu();

    await uruchomObliczenie('SC_3F');

    expect(trasa()).toBe('#analysis');
    expect(window.location.hash).toContain(`run=${RUN_ID}`);
  });
});
