import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { EkranPorownania } from '../EkranPorownania';
import { ZWARCIA_POROWNANIE_STRINGS as SZ } from '../strings';
import { WZORZEC_STRINGS } from '../../wzorzec';
import { useShellStore } from '../../../shell/useShellStore';
import { fetchPowerFlowRuns } from '../../../../ui/power-flow-comparison/api';
import { fetchShortCircuitResults } from '../../../../ui/results-inspector/api';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useStudyCasesStore } from '../../../../ui/study-cases/store';
import type { StudyCaseListItem } from '../../../../ui/study-cases/types';
import { runsFixture } from './fixtures';
import { przebiegFixture, wierszSc } from './zwarcieFixtures';

vi.mock('../../../../ui/power-flow-comparison/api', () => ({
  fetchPowerFlowRuns: vi.fn(),
  createPowerFlowComparison: vi.fn(),
}));

vi.mock('../../../../ui/results-inspector/api', () => ({
  fetchShortCircuitResults: vi.fn(),
}));

const mockPfRuns = vi.mocked(fetchPowerFlowRuns);
const mockScResults = vi.mocked(fetchShortCircuitResults);

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

function props(over: Partial<Parameters<typeof EkranPorownania>[0]> = {}) {
  return { projektId: 'proj-1', trybZaawansowania: 'basic' as const, ...over };
}

/** Zasila runStore mieszanką przebiegów (SC × 2, LOAD_FLOW, niezakończony). */
function ustawPrzebiegi() {
  useExecutionRunsStore.setState({
    runs: [
      przebiegFixture({ id: 'sc-run-a', finished_at: '2026-07-10T08:20:00Z' }),
      przebiegFixture({ id: 'sc-run-b', finished_at: '2026-07-10T08:15:00Z' }),
      przebiegFixture({ id: 'lf-run', analysis_type: 'LOAD_FLOW' }),
      przebiegFixture({ id: 'run-w-toku', status: 'RUNNING' }),
    ],
  });
}

beforeEach(() => {
  mockPfRuns.mockResolvedValue(runsFixture());
  mockScResults.mockImplementation((runId: string) =>
    Promise.resolve(
      runId === 'sc-run-a'
        ? { run_id: 'sc-run-a', rows: [wierszSc({ target_id: 'B1', target_name: 'Szyna 1', ikss_ka: 10 })] }
        : {
            run_id: 'sc-run-b',
            rows: [
              wierszSc({ target_id: 'B1', target_name: 'Szyna 1', ikss_ka: 12 }),
              wierszSc({ target_id: 'B2', target_name: 'Szyna 2', ikss_ka: 8 }),
            ],
          },
    ),
  );
  ustawPrzebiegi();
  useStudyCasesStore.setState({ cases: [przypadek()] });
  // Izolacja deep-linku dowodu (R3-C): żadne żądanie nie zalega między testami.
  useShellStore.setState({ wynikiTab: null, wynikiTabElement: null });
});

afterEach(() => {
  useExecutionRunsStore.setState({ runs: [] });
  useStudyCasesStore.setState({ cases: [] });
  useShellStore.setState({ wynikiTab: null, wynikiTabElement: null });
  vi.clearAllMocks();
});

async function przejdzDoZwarc() {
  await screen.findByTestId('mvd-por-host');
  fireEvent.click(screen.getByTestId('mvd-por-tryb-zwarcia'));
  await screen.findByTestId('mvd-porz-ekran');
}

describe('Porównanie A/B — przełącznik trybu (E12.2)', () => {
  it('domyślnie tryb rozpływu (bez regresji): selektory rozpływu obecne', async () => {
    render(<EkranPorownania {...props()} />);
    expect(await screen.findByTestId('mvd-por-tryb-rozplyw')).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('mvd-por-select-a')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-porz-ekran')).not.toBeInTheDocument();
  });

  it('przełączenie na „Zwarcia" pokazuje ekran zwarciowy, powrót wraca do rozpływu', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    expect(screen.getByTestId('mvd-porz-select-a')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-por-tryb-rozplyw'));
    expect(await screen.findByTestId('mvd-por-select-a')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-porz-ekran')).not.toBeInTheDocument();
  });
});

describe('Porównanie A/B zwarć — selektory (runStore, SC_*/DONE)', () => {
  it('selektory pokazują tylko przebiegi zwarciowe zakończone (bez LF / w toku)', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    const selA = screen.getByTestId('mvd-porz-select-a');
    // 2 przebiegi SC + opcja pusta = 3 opcje
    expect(within(selA).getAllByRole('option')).toHaveLength(3);
    expect(within(selA).getAllByRole('option', { name: /Zwarcie trójfazowe \(3F\)/ })).toHaveLength(2);
  });

  it('etykieta przebiegu niesie nazwę przypadku ze store’u', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    const selA = screen.getByTestId('mvd-porz-select-a');
    expect(
      within(selA).getAllByRole('option', { name: /Wariant letni/ }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('brak przebiegów zwarciowych → uczciwy komunikat PL', async () => {
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ analysis_type: 'LOAD_FLOW' })] });
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    expect(screen.getByTestId('mvd-porz-brak-przebiegow')).toHaveTextContent(SZ.brakPrzebiegow);
    expect(screen.queryByTestId('mvd-porz-select-a')).not.toBeInTheDocument();
  });
});

describe('Porównanie A/B zwarć — porównanie i tabela delt', () => {
  async function wykonaj() {
    fireEvent.change(screen.getByTestId('mvd-porz-select-a'), { target: { value: 'sc-run-a' } });
    fireEvent.change(screen.getByTestId('mvd-porz-select-b'), { target: { value: 'sc-run-b' } });
    fireEvent.click(screen.getByTestId('mvd-porz-przycisk'));
    await screen.findByTestId('mvd-porz-wynik');
  }

  it('klik „Porównaj przebiegi" woła backend dla obu przebiegów (zero automatyzmu)', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    expect(mockScResults).not.toHaveBeenCalled();
    await wykonaj();
    expect(mockScResults).toHaveBeenCalledWith('sc-run-a');
    expect(mockScResults).toHaveBeenCalledWith('sc-run-b');
  });

  it('tabela delt: wspólny punkt z Ik" A/B/Δ (procent, format PL)', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    await wykonaj();
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    expect(tabela.getByText('Szyna 1')).toBeInTheDocument();
    expect(tabela.getByText('10,000')).toBeInTheDocument();
    expect(tabela.getByText('12,000')).toBeInTheDocument();
    expect(tabela.getByText('+2,000 (+20,0%)')).toBeInTheDocument();
  });

  it('punkt bez odpowiednika w drugim przebiegu jest uczciwie oznaczony', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    await wykonaj();
    // Szyna 2 istnieje tylko w przebiegu B
    expect(screen.getByText(`Szyna 2${SZ.tylkoB}`)).toBeInTheDocument();
  });

  it('błąd backendu → uczciwy komunikat PL, brak wyniku', async () => {
    mockScResults.mockRejectedValue(new Error('sieć padła'));
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    fireEvent.change(screen.getByTestId('mvd-porz-select-a'), { target: { value: 'sc-run-a' } });
    fireEvent.change(screen.getByTestId('mvd-porz-select-b'), { target: { value: 'sc-run-b' } });
    fireEvent.click(screen.getByTestId('mvd-porz-przycisk'));
    await waitFor(() => expect(screen.getByTestId('mvd-porz-blad')).toHaveTextContent('sieć padła'));
    expect(screen.queryByTestId('mvd-porz-wynik')).not.toBeInTheDocument();
  });

  it('ten sam przebieg A i B → walidacja „muszą być różne", bez wołania backendu', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    fireEvent.change(screen.getByTestId('mvd-porz-select-a'), { target: { value: 'sc-run-a' } });
    fireEvent.change(screen.getByTestId('mvd-porz-select-b'), { target: { value: 'sc-run-a' } });
    fireEvent.click(screen.getByTestId('mvd-porz-przycisk'));
    expect(screen.getByTestId('mvd-porz-blad')).toHaveTextContent(SZ.walidacjaTeSame);
    expect(mockScResults).not.toHaveBeenCalled();
  });
});

describe('Porównanie A/B zwarć — dowody kolumn A/B (R3-C)', () => {
  async function wykonaj() {
    fireEvent.change(screen.getByTestId('mvd-porz-select-a'), { target: { value: 'sc-run-a' } });
    fireEvent.change(screen.getByTestId('mvd-porz-select-b'), { target: { value: 'sc-run-b' } });
    fireEvent.click(screen.getByTestId('mvd-porz-przycisk'));
    await screen.findByTestId('mvd-porz-wynik');
  }

  /** Wiersz punktu po nazwie + jego przyciski dowodu (kolejność kolumn tabeli). */
  function przyciskiWiersza(nazwa: string) {
    const wiersz = screen
      .getAllByTestId('mvd-wyn-wiersz')
      .find((w) => w.textContent?.includes(nazwa));
    expect(wiersz).toBeDefined();
    return within(wiersz!).getAllByRole('button', { name: WZORZEC_STRINGS.pokazDowod });
  }

  it('2×klik na wartości kolumny A → deep-link dowodu z przebiegiem A', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    await wykonaj();
    fireEvent.doubleClick(przyciskiWiersza('Szyna 1')[0]); // Ik" A
    expect(useShellStore.getState().wynikiTab).toBe('dowod');
    expect(useShellStore.getState().wynikiTabElement).toBe('sc-run-a');
  });

  it('2×klik na wartości kolumny B → deep-link dowodu z przebiegiem B', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    await wykonaj();
    fireEvent.doubleClick(przyciskiWiersza('Szyna 1')[1]); // Ik" B
    expect(useShellStore.getState().wynikiTab).toBe('dowod');
    expect(useShellStore.getState().wynikiTabElement).toBe('sc-run-b');
  });

  it('kolumny Δ bez akcji dowodu (różnica nie ma pojedynczego wywodu WHITE BOX)', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    await wykonaj();
    // Wspólny punkt: 8 przycisków (A i B dla Ik", ip, Ith, Sk) — delty bez przycisku.
    expect(przyciskiWiersza('Szyna 1')).toHaveLength(8);
    expect(screen.getByText('+2,000 (+20,0%)').closest('button')).toBeNull();
  });

  it('punkt „(tylko B)": kolumny A (kreski) bez akcji, kolumny B otwierają dowód B', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    await wykonaj();
    const przyciski = przyciskiWiersza(`Szyna 2${SZ.tylkoB}`);
    expect(przyciski).toHaveLength(4); // wyłącznie strony B
    fireEvent.doubleClick(przyciski[0]);
    expect(useShellStore.getState().wynikiTabElement).toBe('sc-run-b');
  });

  it('zmiana selektora PO porównaniu nie zmienia celu dowodu (para użyta w porównaniu)', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZwarc();
    await wykonaj();
    // Przestawienie selektora A nie przelicza tabeli — dowód wciąż z pary A/B porównania.
    fireEvent.change(screen.getByTestId('mvd-porz-select-a'), { target: { value: 'sc-run-b' } });
    fireEvent.doubleClick(przyciskiWiersza('Szyna 1')[0]);
    expect(useShellStore.getState().wynikiTabElement).toBe('sc-run-a');
  });
});
