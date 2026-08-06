/*
 * ŁAŃCUCH „porównanie → różnice na schemacie" (tryb zwarciowy ekranu porównań).
 *
 * DŁUG, KTÓRY TE TESTY ZAMYKAJĄ: akcja pokazania różnic na schemacie była
 * widoczna w interfejsie i kończyła się błędem, bo jej klient wołał trasę bez
 * dostawcy. Dlatego test NIE mockuje klienta nakładki — podstawia `fetch`
 * (granicę sieci) i sprawdza ADRES, którego ekran używa. Mock modułu klienta
 * przepuściłby dokładnie ten defekt, który tu naprawiamy.
 *
 * Ścieżka NATYWNA (Zero-Debt pkt 5): akcja uruchamiana realnym klikiem
 * (`userEvent`), a nie wołaniem funkcji store'u.
 *
 * Pokrycie: akcja pojawia się dopiero po porównaniu · trafia w realną trasę
 * z parą UŻYTĄ w porównaniu (nie z selektorów) · sukces przenosi na schemat
 * i zasila nakładkę · błąd zostaje na ekranie porównania (bez przejścia) ·
 * brak punktów wspólnych = zdanie wyjaśniające zamiast martwego przycisku.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EkranPorownania } from '../EkranPorownania';
import { ZWARCIA_POROWNANIE_STRINGS as SZ } from '../strings';
import { useShellStore } from '../../../shell/useShellStore';
import { fetchPowerFlowRuns } from '../../../../ui/power-flow-comparison/api';
import { pobierzPorownanieZwarciowe } from '../zwarciaPorownanieApi';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useStudyCasesStore } from '../../../../ui/study-cases/store';
import { useSldDeltaOverlayStore } from '../../../../ui/sld-overlay/sldDeltaOverlayStore';
import type { StudyCaseListItem } from '../../../../ui/study-cases/types';
import { runsFixture } from './fixtures';
import { przebiegFixture, punktPorownania } from './zwarcieFixtures';

vi.mock('../../../../ui/power-flow-comparison/api', () => ({
  fetchPowerFlowRuns: vi.fn(),
  createPowerFlowComparison: vi.fn(),
}));

vi.mock('../zwarciaPorownanieApi', () => ({
  pobierzPorownanieZwarciowe: vi.fn(),
}));

const mockPfRuns = vi.mocked(fetchPowerFlowRuns);
const mockPorownanie = vi.mocked(pobierzPorownanieZwarciowe);

const NAKLADKA = {
  run_id_a: 'sc-run-a',
  run_id_b: 'sc-run-b',
  analysis_type: 'DELTA_SC',
  report_version: '1.2.0',
  elements: {
    'bus-1': {
      ref_id: 'bus-1',
      kind: 'bus',
      badges: [],
      severity: 'WARNING',
      metrics: {
        DELTA_IK_3F_KA: {
          code: 'DELTA_IK_3F_KA',
          value: 2,
          unit: 'kA',
          format_hint: 'fixed2',
          source: 'solver',
        },
      },
    },
  },
  legend: { title: 'Legenda roznic A/B', entries: [] },
  content_hash: 'a'.repeat(64),
  liczba_punktow_zmienionych: 1,
  liczba_punktow_bez_zmian: 0,
  liczba_punktow_bez_odpowiednika: 0,
  liczba_punktow_bez_danych: 0,
};

function przypadek(over: Partial<StudyCaseListItem> = {}): StudyCaseListItem {
  return {
    id: 'case-1',
    name: 'Wariant letni',
    description: '',
    result_status: 'FRESH',
    results_valid: true,
    is_active: false,
    updated_at: '2026-07-10T08:00:00Z',
    ...over,
  };
}

function props() {
  return { projektId: 'proj-1', trybZaawansowania: 'basic' as const };
}

function odpowiedzNakladki(ok = true, status = 200): Response {
  return { ok, status, json: async () => NAKLADKA } as unknown as Response;
}

/** Porównanie z jednym punktem wspólnym (jest co pokazać na schemacie). */
function porownanieZPunktem(runIdA: string, runIdB: string) {
  return Promise.resolve({
    run_id_a: runIdA,
    run_id_b: runIdB,
    report_version: '1.2.0',
    punkty: [
      punktPorownania({
        target_id: 'B1',
        target_name: 'Szyna 1',
        ikss_ka_a: 10,
        ikss_ka_b: 12,
        delta_ikss_ka: 2,
        delta_ikss_percent: 20,
      }),
    ],
    liczba_punktow_wspolnych: 1,
    liczba_punktow_tylko_a: 0,
    liczba_punktow_tylko_b: 0,
  });
}

beforeEach(() => {
  mockPfRuns.mockResolvedValue(runsFixture());
  mockPorownanie.mockImplementation(porownanieZPunktem);
  useExecutionRunsStore.setState({
    runs: [
      przebiegFixture({ id: 'sc-run-a', finished_at: '2026-07-10T08:20:00Z' }),
      przebiegFixture({ id: 'sc-run-b', finished_at: '2026-07-10T08:15:00Z' }),
    ],
  });
  useStudyCasesStore.setState({ cases: [przypadek()] });
  useShellStore.setState({ wynikiTab: null, wynikiTabElement: null });
  useSldDeltaOverlayStore.getState().wyczyscRoznice();
  window.location.hash = '#results';
});

afterEach(() => {
  useExecutionRunsStore.setState({ runs: [] });
  useStudyCasesStore.setState({ cases: [] });
  useSldDeltaOverlayStore.getState().wyczyscRoznice();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function przejdzDoZwarc() {
  await screen.findByTestId('mvd-por-host');
  fireEvent.click(screen.getByTestId('mvd-por-tryb-zwarcia'));
  await screen.findByTestId('mvd-porz-ekran');
}

async function wykonajPorownanie(a = 'sc-run-a', b = 'sc-run-b') {
  fireEvent.change(screen.getByTestId('mvd-porz-select-a'), { target: { value: a } });
  fireEvent.change(screen.getByTestId('mvd-porz-select-b'), { target: { value: b } });
  fireEvent.click(screen.getByTestId('mvd-porz-przycisk'));
  await screen.findByTestId('mvd-porz-wynik');
}

describe('Różnice na schemacie — dostępność akcji', () => {
  it('przed porównaniem akcji nie ma (nie ma czego pokazać)', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    expect(screen.queryByTestId('mvd-porz-schemat')).toBeNull();
  });

  it('po porównaniu akcja jest dostępna', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    await wykonajPorownanie();
    expect(screen.getByTestId('mvd-porz-schemat-przycisk')).toBeEnabled();
  });

  it('brak punktów wspólnych ⇒ zdanie wyjaśniające zamiast martwego przycisku', async () => {
    mockPorownanie.mockImplementation((a: string, b: string) =>
      Promise.resolve({
        run_id_a: a,
        run_id_b: b,
        report_version: '1.2.0',
        punkty: [punktPorownania({ target_id: 'B2', target_name: 'Szyna 2', obecny_w: 'B' })],
        liczba_punktow_wspolnych: 0,
        liczba_punktow_tylko_a: 0,
        liczba_punktow_tylko_b: 1,
      }),
    );
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    await wykonajPorownanie();

    expect(screen.queryByTestId('mvd-porz-schemat-przycisk')).toBeNull();
    expect(screen.getByTestId('mvd-porz-schemat-brak').textContent).toBe(SZ.brakPunktowWspolnych);
  });
});

describe('Różnice na schemacie — klik', () => {
  it('KLIK woła trasę nakładki z parą UŻYTĄ w porównaniu i przenosi na schemat', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockResolvedValue(odpowiedzNakladki());
    vi.stubGlobal('fetch', mockFetch);

    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    await wykonajPorownanie();

    // Selektor przestawiony PO porównaniu — nakładka musi dotyczyć pary
    // pokazanej w tabeli, nie bieżącego ustawienia list.
    fireEvent.change(screen.getByTestId('mvd-porz-select-a'), { target: { value: 'sc-run-b' } });
    await user.click(screen.getByTestId('mvd-porz-schemat-przycisk'));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/short-circuit-comparisons/sld-overlay');
    expect(JSON.parse(init.body)).toEqual({ run_id_a: 'sc-run-a', run_id_b: 'sc-run-b' });

    await waitFor(() => expect(useSldDeltaOverlayStore.getState().nakladka).not.toBeNull());
    expect(window.location.hash).toBe('#sld');
  });

  it('błąd pobrania zostaje na ekranie porównania — bez przejścia na schemat', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(odpowiedzNakladki(false, 500)));

    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    await wykonajPorownanie();
    await user.click(screen.getByTestId('mvd-porz-schemat-przycisk'));

    const blad = await screen.findByTestId('mvd-porz-schemat-blad');
    expect(blad.textContent).toMatch(/500/);
    expect(useSldDeltaOverlayStore.getState().nakladka).toBeNull();
    expect(window.location.hash).toBe('#results');
  });
});
