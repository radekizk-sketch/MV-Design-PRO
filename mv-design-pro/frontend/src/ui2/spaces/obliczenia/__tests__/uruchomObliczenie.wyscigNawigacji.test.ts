/*
 * Bieg a miejsce pracy projektanta (karta S9-11, znaleziska W-3 i W-4 audytu
 * `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`; następca testu karty S9-3).
 *
 * HISTORIA DEFEKTU: `uruchomObliczenie` kończyło się `navigateToResults` —
 * najpierw bezwarunkowym (W-3: odłożony skok depczący nawigację projektanta,
 * pomiar audytu: kanwa montowała się i po 590 ms znikała), potem warunkowym
 * S9-3 („skok tylko z niezmienionego miejsca pracy") — który w NAJCZĘSTSZYM
 * scenariuszu (bieg bez ruchu myszy) nadal wyrywał projektanta ze schematu
 * i odmontowywał kanwę (W-4).
 *
 * KONTRAKT S9-11: bieg NIE nawiguje WCALE. Projektant zostaje tam, gdzie jest;
 * gotowość wyniku sygnalizuje komunikat, a świeży przebieg jest ZWIĄZANY z
 * powłoką (`setActiveRun`), więc jawny klik w „Wyniki i dowody" otwiera JEGO
 * wyniki (deep-link K3 przez `mostTrasyPrzestrzeni` dokleja `?run=`).
 *
 * ILOCZYN CECH (reguła KLASA, NIE INSTANCJA §2) — nie sam przykład z karty:
 *   {miejsce startu: schemat / obliczenia / wyniki}
 *   × {projektant przechodzi w trakcie biegu / nie rusza się}
 *   × {bieg udany / bieg nieudany}.
 *
 * ŚCIEŻKA UŻYTKOWNIKA: zmianę miejsca pracy w trakcie biegu wykonujemy
 * PRODUKCYJNĄ funkcją `przejdzDoPrzestrzeni` (tą samą, którą woła klik w
 * nawigacji przestrzeni AppShell) — nie ustawiamy stanu store'a ręcznie.
 * Natywny klik na żywej aplikacji pokrywa spec e2e
 * `e2e/pulapka-nawigacji-po-biegu.spec.ts` (bramka tej samej karty).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { uruchomObliczenie, KOMUNIKAT_BIEG_WYNIKI_CZEKAJA } from '../uruchomObliczenie';
import { przejdzDoPrzestrzeni } from '../../../shell/przejsciaPrzestrzeni';
import { useShellStore } from '../../../shell/useShellStore';
import { useAppStateStore } from '../../../../ui/app-state';
import { useNotificationStore } from '../../../../ui/notifications/store';
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

function komunikaty(): string[] {
  return useNotificationStore.getState().notifications.map((n) => n.message);
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.location.hash = '';
  useNotificationStore.getState().clearAll();
  useAppStateStore.setState({
    activeProjectId: 'projekt-1',
    activeCaseId: CASE_ID,
    activeRunId: null,
  } as never);
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

describe('W-4 — bieg bez ruchu projektanta zostawia go TAM, GDZIE BYŁ', () => {
  it('start ze „Schematu": trasa #sld i przestrzeń bez zmian, komunikat mówi, gdzie czeka wynik', async () => {
    window.location.hash = '#sld';
    useShellStore.setState({ activeSpace: 'schemat' });
    torBiegu();

    const ok = await uruchomObliczenie('SC_3F');

    expect(ok).toBe(true);
    expect(useShellStore.getState().activeSpace).toBe('schemat');
    expect(trasa()).toBe('#sld');
    expect(komunikaty()).toContain(KOMUNIKAT_BIEG_WYNIKI_CZEKAJA);
  });

  it('start z „Obliczeń": zero przeniesienia na wyniki, przebieg związany z powłoką', async () => {
    window.location.hash = '#case-config';
    useShellStore.setState({ activeSpace: 'obliczenia' });
    torBiegu();

    const ok = await uruchomObliczenie('SC_3F');

    expect(ok).toBe(true);
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
    expect(trasa()).toBe('#case-config');
    // Kontrola dodatnia: świeży przebieg jest aktywny — jawny klik otworzy JEGO wyniki.
    expect(useAppStateStore.getState().activeRunId).toBe(RUN_ID);
  });

  it('start z „Wyników": ponowny bieg nie zmienia trasy ani parametru ?run= bez klika', async () => {
    window.location.hash = '#analysis?run=stary';
    useShellStore.setState({ activeSpace: 'wyniki' });
    torBiegu();

    await uruchomObliczenie('SC_3F');

    expect(trasa()).toBe('#analysis');
    // Trasa należy do użytkownika: bieg jej nie przepisuje (parametr zostaje).
    expect(window.location.hash).toBe('#analysis?run=stary');
    // Świeży przebieg jest aktywny w powłoce — ekran wyników czyta go ze store'u.
    expect(useAppStateStore.getState().activeRunId).toBe(RUN_ID);
  });

  it('bieg NIEUDANY też nie nawiguje i nie obiecuje wyników', async () => {
    window.location.hash = '#sld';
    useShellStore.setState({ activeSpace: 'schemat' });
    torBiegu({ run: runFixture({ status: 'FAILED' }) });

    const ok = await uruchomObliczenie('SC_3F');

    expect(ok).toBe(false);
    expect(useShellStore.getState().activeSpace).toBe('schemat');
    expect(trasa()).toBe('#sld');
    expect(komunikaty()).not.toContain(KOMUNIKAT_BIEG_WYNIKI_CZEKAJA);
  });
});

describe('W-3 — nawigacja projektanta W TRAKCIE biegu jest nienaruszalna', () => {
  it('przejście na „Gotowość" w trakcie biegu zostaje (start ze „Schematu")', async () => {
    window.location.hash = '#sld';
    useShellStore.setState({ activeSpace: 'schemat' });
    torBiegu({ wTrakcieBiegu: () => przejdzDoPrzestrzeni('gotowosc') });

    const ok = await uruchomObliczenie('SC_3F');

    expect(ok).toBe(true);
    expect(useShellStore.getState().activeSpace).toBe('gotowosc');
    expect(trasa()).not.toBe('#analysis');
  });

  it('wejście na schemat w trakcie biegu zostaje (start z „Obliczeń")', async () => {
    window.location.hash = '#case-config';
    useShellStore.setState({ activeSpace: 'obliczenia' });
    torBiegu({ wTrakcieBiegu: () => przejdzDoPrzestrzeni('schemat') });

    await uruchomObliczenie('SC_3F');

    expect(useShellStore.getState().activeSpace).toBe('schemat');
    expect(trasa()).toBe('#sld');
  });

  it('wejście na schemat w trakcie biegu zostaje także dla rozpływu (start z „Wyników")', async () => {
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
    expect(useShellStore.getState().activeSpace).toBe('gotowosc');
    expect(trasa()).not.toBe('#analysis');
  });
});

describe('Kontrola dodatnia — wyniki OSIĄGALNE jawnym klikiem (deep-link K3 nietknięty)', () => {
  it('po biegu jawne przejście do „Wyników" otwiera trasę z parametrem świeżego przebiegu', async () => {
    window.location.hash = '#sld';
    useShellStore.setState({ activeSpace: 'schemat' });
    torBiegu();

    await uruchomObliczenie('SC_3F');
    // Projektant został na schemacie…
    expect(trasa()).toBe('#sld');

    // …a JAWNY wybór przestrzeni „Wyniki i dowody" (ta sama ścieżka co klik w
    // AppShell) prowadzi na wyniki TEGO biegu.
    przejdzDoPrzestrzeni('wyniki');

    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(trasa()).toBe('#analysis');
    expect(window.location.hash).toContain(`run=${RUN_ID}`);
  });
});
