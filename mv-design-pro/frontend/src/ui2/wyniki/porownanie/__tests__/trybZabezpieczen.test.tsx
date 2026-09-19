import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { EkranPorownania } from '../EkranPorownania';
import { ZABEZPIECZENIA_POROWNANIE_STRINGS as ZB } from '../strings';
import { WZORZEC_STRINGS } from '../../wzorzec';
import { useShellStore } from '../../../shell/useShellStore';
import { fetchPowerFlowRuns } from '../../../../ui/power-flow-comparison/api';
import {
  createProtectionComparison,
  fetchProtectionRuns,
  getProtectionComparisonTrace,
} from '../../../../ui/protection-comparison/api';
import { useStudyCasesStore } from '../../../../ui/study-cases/store';
import type { StudyCaseListItem } from '../../../../ui/study-cases/types';
import { runsFixture } from './fixtures';
import {
  porownanieZabezpieczenFixture,
  przebiegiZabezpieczenFixture,
  sladZabezpieczenFixture,
  wierszZabezpieczenFixture,
} from './zabezpieczeniaFixtures';

// PF mockowane obronnie: `EkranPorownania` montuje domyślnie tryb rozpływu
// (nieaktywny w tych testach, ale obecny w drzewie), analogicznie do
// `trybZwarciowy.test.tsx`.
vi.mock('../../../../ui/power-flow-comparison/api', () => ({
  fetchPowerFlowRuns: vi.fn(),
  createPowerFlowComparison: vi.fn(),
}));

vi.mock('../../../../ui/protection-comparison/api', () => ({
  fetchProtectionRuns: vi.fn(),
  createProtectionComparison: vi.fn(),
  getProtectionComparisonTrace: vi.fn(),
}));

const mockPfRuns = vi.mocked(fetchPowerFlowRuns);
const mockRuns = vi.mocked(fetchProtectionRuns);
const mockCompare = vi.mocked(createProtectionComparison);
const mockTrace = vi.mocked(getProtectionComparisonTrace);

function przypadek(over: Partial<StudyCaseListItem> = {}): StudyCaseListItem {
  return {
    id: 'case-1',
    name: 'Wariant letni',
    description: '',
    result_status: 'FRESH',
    results_valid: true,
    result_status_reason: 'model-niezmieniony',
    result_status_reason_pl: 'Model nie zmienił się od chwili obliczenia.',
    rewizja_biegu: 4,
    rewizja_biezaca: 4,
    zmiany_od_biegu: [],
    is_active: false,
    updated_at: '2026-07-10T08:00:00Z',
    ...over,
  };
}

function props(over: Partial<Parameters<typeof EkranPorownania>[0]> = {}) {
  return { projektId: 'proj-1', trybZaawansowania: 'basic' as const, ...over };
}

beforeEach(() => {
  mockPfRuns.mockResolvedValue(runsFixture());
  mockRuns.mockResolvedValue(przebiegiZabezpieczenFixture());
  mockCompare.mockResolvedValue(porownanieZabezpieczenFixture());
  mockTrace.mockResolvedValue(sladZabezpieczenFixture());
  useStudyCasesStore.setState({ cases: [] });
  useShellStore.setState({ wynikiTab: null, wynikiTabElement: null, activeSpace: 'wyniki' });
});

afterEach(() => {
  useStudyCasesStore.setState({ cases: [] });
  useShellStore.setState({ wynikiTab: null, wynikiTabElement: null });
  vi.clearAllMocks();
});

async function przejdzDoZabezpieczen() {
  await screen.findByTestId('mvd-por-host');
  fireEvent.click(screen.getByTestId('mvd-por-tryb-zabezpieczenia'));
  await screen.findByTestId('mvd-porzab-ekran');
}

async function wykonajPorownanie() {
  const selA = await screen.findByTestId('mvd-porzab-select-a');
  fireEvent.change(selA, { target: { value: 'run-zab-a' } });
  fireEvent.change(screen.getByTestId('mvd-porzab-select-b'), { target: { value: 'run-zab-b' } });
  fireEvent.click(screen.getByTestId('mvd-porzab-przycisk'));
  await screen.findByTestId('mvd-porzab-wynik');
}

describe('Porównanie A/B — przełącznik trybu obejmuje zabezpieczenia (D1)', () => {
  it('trzeci przycisk trybu przełącza na ekran zabezpieczeń, powrót wraca do rozpływu', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    expect(screen.getByTestId('mvd-por-tryb-zabezpieczenia')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByTestId('mvd-por-tryb-rozplyw'));
    expect(await screen.findByTestId('mvd-por-select-a')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-porzab-ekran')).not.toBeInTheDocument();
  });
});

describe('TrybZabezpieczen — lista przebiegów i uczciwy stan zerowy (D2)', () => {
  it('brak przebiegów → uczciwy komunikat + akcja nawiguje do schematu (zero fabrykacji)', async () => {
    mockRuns.mockResolvedValue([]);
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    expect(await screen.findByTestId('mvd-porzab-brak-przebiegow')).toHaveTextContent(
      ZB.brakPrzebiegow,
    );
    const akcja = screen.getByTestId('mvd-porzab-brak-przebiegow-akcja');
    expect(akcja).toHaveTextContent('Przejdź do schematu');
    fireEvent.click(akcja);
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });

  it('błąd wczytywania listy → komunikat błędu PL', async () => {
    mockRuns.mockRejectedValue(new Error('backend padł'));
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    expect(await screen.findByTestId('mvd-porzab-lista-blad')).toHaveTextContent('backend padł');
  });

  it('selektory pokazują listę biegów zabezpieczeń BEZ segmentu zbieżności (ProtectionRunItem go nie ma)', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    const selA = await screen.findByTestId('mvd-porzab-select-a');
    expect(
      within(selA).getByRole('option', { name: /Ocena zabezpieczeń · rew\. 1 · snap-zab · 2026-07-10 08:15/ }),
    ).toBeInTheDocument();
  });

  it('etykieta niesie nazwę przypadku ze store’u, gdy znana', async () => {
    useStudyCasesStore.setState({ cases: [przypadek()] });
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    const selA = await screen.findByTestId('mvd-porzab-select-a');
    // Obie fikstury dzielą `study_case_id: 'case-1'` (jak `runsFixture` rozpływu) —
    // dopasowanie po dacie (unikalnej per bieg) odróżnia opcję run-zab-a.
    expect(
      within(selA).getByRole('option', { name: /2026-07-10 08:15 · Wariant letni/ }),
    ).toBeInTheDocument();
  });
});

describe('TrybZabezpieczen — jawne uruchomienie porównania (zero automatyzmu)', () => {
  it('przycisk zablokowany bez wyboru A i B; nie woła backendu przed kliknięciem', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await screen.findByTestId('mvd-porzab-select-a');
    expect(screen.getByTestId('mvd-porzab-przycisk')).toBeDisabled();
    expect(mockCompare).not.toHaveBeenCalled();
  });

  it('ten sam przebieg A i B → walidacja „muszą być różne"', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    fireEvent.change(screen.getByTestId('mvd-porzab-select-a'), { target: { value: 'run-zab-a' } });
    fireEvent.change(screen.getByTestId('mvd-porzab-select-b'), { target: { value: 'run-zab-a' } });
    fireEvent.click(screen.getByTestId('mvd-porzab-przycisk'));
    expect(screen.getByTestId('mvd-porzab-blad')).toHaveTextContent(ZB.walidacjaTeSame);
    expect(mockCompare).not.toHaveBeenCalled();
  });

  it('klik woła createProtectionComparison z parą wybranych przebiegów', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    expect(mockCompare).toHaveBeenCalledWith('run-zab-a', 'run-zab-b');
  });

  it('błąd backendu → uczciwy komunikat, brak wyniku', async () => {
    mockCompare.mockRejectedValue(new Error('runy niezgodne'));
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    fireEvent.change(screen.getByTestId('mvd-porzab-select-a'), { target: { value: 'run-zab-a' } });
    fireEvent.change(screen.getByTestId('mvd-porzab-select-b'), { target: { value: 'run-zab-b' } });
    fireEvent.click(screen.getByTestId('mvd-porzab-przycisk'));
    await waitFor(() =>
      expect(screen.getByTestId('mvd-porzab-blad')).toHaveTextContent('runy niezgodne'),
    );
    expect(screen.queryByTestId('mvd-porzab-wynik')).not.toBeInTheDocument();
  });
});

describe('TrybZabezpieczen — prezentacja wyniku na realnym kształcie ProtectionComparisonResult', () => {
  it('podsumowanie jako założenia: porównań łącznie, zmiany stanu, problemy', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    const wiersze = screen.getAllByTestId('mvd-wyn-zalozenie');
    const porownan = wiersze.find((w) => w.textContent?.includes(ZB.podsumPorownanRazem));
    expect(porownan).toHaveTextContent('2');
    const zmiany = wiersze.find((w) => w.textContent?.includes('Zmiany stanu'));
    expect(zmiany).toHaveTextContent('1 · 0 · 0 · 0');
  });

  it('zakładka Zmiany stanu: wiersz per (element, punkt) z polami A/B/Δ', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(wiersze).toHaveLength(2);
    const pierwszy = within(wiersze[0]);
    expect(pierwszy.getByText('BRK-F01')).toBeInTheDocument();
    expect(pierwszy.getByText('BUS-GPZ')).toBeInTheDocument();
    expect(pierwszy.getByText('Zadziałanie')).toBeInTheDocument();
    expect(pierwszy.getByText('Brak zadziałania')).toBeInTheDocument();
    expect(pierwszy.getByText('Utrata zadziałania')).toBeInTheDocument();
  });

  it('pole nullowalne (t_trip_s_b brak) → kreska, bez dowodu (FAB-E)', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    const wiersz = screen.getAllByTestId('mvd-wyn-wiersz')[0];
    expect(within(wiersz).getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('filtr „pokaż tylko zmiany" ukrywa wiersz NO_CHANGE', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    expect(screen.getAllByTestId('mvd-wyn-wiersz')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('mvd-porzab-filtr-zmiany'));
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(wiersze).toHaveLength(1);
    expect(wiersze[0]).toHaveTextContent('BRK-F01');
  });

  it('wszystkie wiersze bez zmiany → uczciwy stan zerowy filtru', async () => {
    mockCompare.mockResolvedValue(
      porownanieZabezpieczenFixture({
        rows: [wierszZabezpieczenFixture({ state_change: 'NO_CHANGE' })],
      }),
    );
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-porzab-filtr-zmiany'));
    expect(screen.getByTestId('mvd-porzab-stany-puste')).toHaveTextContent(ZB.filtrPusto);
  });

  it('zakładka Ranking: waga/rodzaj PL + punkt zwarcia (rozszerzenie vs rozpływ)', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-porzab-tab-ranking'));
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    expect(tabela.getByText('Krytyczny')).toBeInTheDocument();
    expect(tabela.getByText('Utrata zadziałania')).toBeInTheDocument();
    expect(tabela.getByText('BUS-GPZ')).toBeInTheDocument();
  });

  it('wybór wiersza rankingu → szczegół z punktem zwarcia (pole własne zabezpieczeń)', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-porzab-tab-ranking'));
    fireEvent.click(screen.getAllByTestId('mvd-wyn-wiersz')[0]);
    const szczegol = within(screen.getByTestId('mvd-porzab-szczegol'));
    expect(szczegol.getByText('BUS-GPZ')).toBeInTheDocument();
    expect(
      szczegol.getByText('Zabezpieczenie BRK-F01 traci zadziałanie na punkcie BUS-GPZ w wariancie B.'),
    ).toBeInTheDocument();
  });

  it('pusty ranking → uczciwy komunikat „bez problemów"', async () => {
    mockCompare.mockResolvedValue(porownanieZabezpieczenFixture({ ranking: [] }));
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-porzab-tab-ranking'));
    expect(screen.getByTestId('mvd-porzab-ranking-puste')).toHaveTextContent(ZB.brakRankingu);
  });

  it('identyfikator porównania i proweniencja WYŁĄCZNIE w trybie eksperckim (D1: ten sam panel)', async () => {
    const { rerender } = render(<EkranPorownania {...props({ trybZaawansowania: 'basic' })} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    expect(screen.queryByTestId('mvd-porzab-id')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-por-proweniencja')).not.toBeInTheDocument();

    rerender(<EkranPorownania {...props({ trybZaawansowania: 'expert' })} />);
    expect(screen.getByTestId('mvd-porzab-id')).toHaveTextContent('cmp-zab-001');
    const panele = screen.getAllByTestId('mvd-por-proweniencja-panel');
    expect(panele).toHaveLength(2);
    expect(panele[0]).toHaveTextContent('snap-zab-a');
    expect(panele[1]).toHaveTextContent('snap-zab-b');
  });
});

describe('TrybZabezpieczen — dowody kolumn A/B (R3-C)', () => {
  it('2×klik na wartości kolumny A → deep-link dowodu z run_a_id z WYNIKU', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    const wiersz = screen.getAllByTestId('mvd-wyn-wiersz')[0];
    const przyciski = within(wiersz).getAllByRole('button', { name: WZORZEC_STRINGS.pokazDowod });
    fireEvent.doubleClick(przyciski[0]);
    expect(useShellStore.getState().wynikiTab).toBe('dowod');
    expect(useShellStore.getState().wynikiTabElement).toBe('run-zab-a');
  });

  it('kolumny Δ bez akcji dowodu (różnica nie ma pojedynczego wywodu WHITE BOX)', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    // Wiersz drugi (BRK-F02) ma wszystkie pola liczbowe -> Δt/ΔI bez przycisku.
    expect(screen.getByText('0,000').closest('button')).toBeNull();
  });
});

describe('TrybZabezpieczen — ślad porównania (White Box, na żądanie)', () => {
  it('zwinięty domyślnie; rozwinięcie ładuje ślad JEDNYM wywołaniem z comparison_id', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    expect(screen.queryByTestId('mvd-porzab-slad')).not.toBeInTheDocument();
    expect(mockTrace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('mvd-porzab-slad-btn'));
    await screen.findByTestId('mvd-porzab-slad');
    expect(mockTrace).toHaveBeenCalledWith('cmp-zab-001');
    expect(mockTrace).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mvd-porzab-slad')).toHaveTextContent(
      'Dopasowanie ewaluacji po (element chroniony, punkt zwarcia)',
    );

    // Zwinięcie i ponowne rozwinięcie NIE powtarza żądania (ten sam comparison_id).
    fireEvent.click(screen.getByTestId('mvd-porzab-slad-btn'));
    expect(screen.queryByTestId('mvd-porzab-slad')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-porzab-slad-btn'));
    await screen.findByTestId('mvd-porzab-slad');
    expect(mockTrace).toHaveBeenCalledTimes(1);
  });

  it('błąd wczytania śladu → uczciwy komunikat', async () => {
    mockTrace.mockRejectedValue(new Error('ślad niedostępny'));
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-porzab-slad-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('mvd-porzab-slad-blad')).toHaveTextContent('ślad niedostępny'),
    );
  });

  it('nowe porównanie resetuje ślad poprzedniego (zależny od comparison_id)', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-porzab-slad-btn'));
    await screen.findByTestId('mvd-porzab-slad');

    mockCompare.mockResolvedValue(
      porownanieZabezpieczenFixture({ comparison_id: 'cmp-zab-002' }),
    );
    fireEvent.click(screen.getByTestId('mvd-porzab-przycisk'));
    await screen.findByTestId('mvd-porzab-wynik');
    expect(screen.queryByTestId('mvd-porzab-slad')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mvd-porzab-slad-btn'));
    await screen.findByTestId('mvd-porzab-slad');
    expect(mockTrace).toHaveBeenLastCalledWith('cmp-zab-002');
  });
});
