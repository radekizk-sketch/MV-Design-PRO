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
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import type {
  ProtectionComparisonResult,
  ProtectionComparisonTrace,
  ProtectionRunItem,
} from '../../../../ui/protection-comparison/types';
import { fmtCzasZadzialania, rodzajProblemuZabezpieczenPL, wagaPL } from '../strings';
import wynikSceny from '../../../../harness-fixtures/generated/porownanie_scena_wynik_zabezpieczen.json';
import biegiSceny from '../../../../harness-fixtures/generated/porownanie_scena_biegi_zabezpieczen.json';
import sladSceny from '../../../../harness-fixtures/generated/porownanie_scena_slad_zabezpieczen.json';

/**
 * PRAWDZIWE odpowiedzi backendu dla sieci złotej G08 (warianty A i B, urządzenia i nastawy
 * z modelu) z generatora fikstur harnessu — nie ręcznie wpisany kształt. Warianty brzegowe
 * (utrata zadziałania, pusty ranking) = zmiana pola realnego rekordu.
 */
const WYNIK = wynikSceny as unknown as ProtectionComparisonResult;
const BIEGI = (biegiSceny as unknown as { runs: ProtectionRunItem[] }).runs;
const SLAD = sladSceny as unknown as ProtectionComparisonTrace;
const BIEG_A = WYNIK.run_a_id;
const BIEG_B = WYNIK.run_b_id;

/** Wynik z jednym wierszem zmienionym na utratę zadziałania w wariancie B. */
function wynikZUtrataZadzialania(): ProtectionComparisonResult {
  const [pierwszy, ...reszta] = WYNIK.rows;
  return {
    ...WYNIK,
    rows: [
      {
        ...pierwszy,
        trip_state_b: 'NO_TRIP',
        t_trip_s_b: null,
        delta_t_s: null,
        state_change: 'TRIP_TO_NO_TRIP',
      },
      ...reszta,
    ],
    summary: { ...WYNIK.summary, trip_to_no_trip_count: 1, no_change_count: reszta.length },
  };
}

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
  mockRuns.mockResolvedValue(BIEGI);
  mockCompare.mockResolvedValue(WYNIK);
  mockTrace.mockResolvedValue(SLAD);
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
  fireEvent.change(selA, { target: { value: BIEG_A } });
  fireEvent.change(screen.getByTestId('mvd-porzab-select-b'), { target: { value: BIEG_B } });
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
  it('brak przebiegów → uczciwy komunikat + akcja prowadzi do oceny zabezpieczeń (E-28)', async () => {
    mockRuns.mockResolvedValue([]);
    const openRouteSurface = vi.fn();
    useNetworkBuildStore.setState({ openRouteSurface } as never);
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    expect(await screen.findByTestId('mvd-porzab-brak-przebiegow')).toHaveTextContent(
      ZB.brakPrzebiegow,
    );
    const akcja = screen.getByTestId('mvd-porzab-brak-przebiegow-akcja');
    expect(akcja).toHaveTextContent('Przejdź do oceny zabezpieczeń');
    fireEvent.click(akcja);
    expect(openRouteSurface).toHaveBeenCalledWith('E-28');
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
    for (const bieg of BIEGI) {
      expect(
        within(selA).getByRole('option', {
          name: new RegExp(`Ocena zabezpieczeń · rew\\. ${bieg.model_revision} ·`),
        }),
      ).toBeInTheDocument();
    }
  });

  it('etykieta niesie nazwę przypadku ze store’u, gdy znana', async () => {
    const biegA = BIEGI.find((b) => b.id === BIEG_A)!;
    useStudyCasesStore.setState({ cases: [przypadek({ id: biegA.study_case_id })] });
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    const selA = await screen.findByTestId('mvd-porzab-select-a');
    expect(
      within(selA).getByRole('option', {
        name: new RegExp(`rew\\. ${biegA.model_revision} · .* · Wariant letni`),
      }),
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
    fireEvent.change(screen.getByTestId('mvd-porzab-select-a'), { target: { value: BIEG_A } });
    fireEvent.change(screen.getByTestId('mvd-porzab-select-b'), { target: { value: BIEG_A } });
    fireEvent.click(screen.getByTestId('mvd-porzab-przycisk'));
    expect(screen.getByTestId('mvd-porzab-blad')).toHaveTextContent(ZB.walidacjaTeSame);
    expect(mockCompare).not.toHaveBeenCalled();
  });

  it('klik woła createProtectionComparison z parą wybranych przebiegów', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    expect(mockCompare).toHaveBeenCalledWith(BIEG_A, BIEG_B);
  });

  it('błąd backendu → uczciwy komunikat, brak wyniku', async () => {
    mockCompare.mockRejectedValue(new Error('runy niezgodne'));
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    fireEvent.change(screen.getByTestId('mvd-porzab-select-a'), { target: { value: BIEG_A } });
    fireEvent.change(screen.getByTestId('mvd-porzab-select-b'), { target: { value: BIEG_B } });
    fireEvent.click(screen.getByTestId('mvd-porzab-przycisk'));
    await waitFor(() =>
      expect(screen.getByTestId('mvd-porzab-blad')).toHaveTextContent('runy niezgodne'),
    );
    expect(screen.queryByTestId('mvd-porzab-wynik')).not.toBeInTheDocument();
  });
});

describe('TrybZabezpieczen — prezentacja wyniku (prawdziwy wynik sieci złotej)', () => {
  it('podsumowanie jako założenia: porównań łącznie, zmiany stanu, problemy', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    const wiersze = screen.getAllByTestId('mvd-wyn-zalozenie');
    const porownan = wiersze.find((w) => w.textContent?.includes(ZB.podsumPorownanRazem));
    expect(porownan).toHaveTextContent(String(WYNIK.summary.total_rows));
    const s = WYNIK.summary;
    const zmiany = wiersze.find((w) => w.textContent?.includes('Zmiany stanu'));
    expect(zmiany).toHaveTextContent(
      `${s.trip_to_no_trip_count} · ${s.no_trip_to_trip_count} · ${s.invalid_change_count} · ${s.no_change_count}`,
    );
  });

  it('zakładka Zmiany stanu: wiersz per (urządzenie, punkt) z nazwami z modelu i wiarygodnością', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(wiersze).toHaveLength(WYNIK.rows.length);
    WYNIK.rows.forEach((r, i) => {
      const w = within(wiersze[i]);
      expect(w.getByText(r.nazwa_urzadzenia_pl)).toBeInTheDocument();
      expect(w.getByText(r.nazwa_punktu_pl)).toBeInTheDocument();
      expect(w.getAllByText(fmtCzasZadzialania(r.t_trip_s_a!)).length).toBeGreaterThan(0);
      expect(w.getAllByText('wiarygodny').length).toBe(2);
      expect(wiersze[i]).not.toHaveTextContent(r.device_id_a);
    });
  });

  it('utrata zadziałania: stan po polsku, pole bez wartości → kreska (FAB-E)', async () => {
    mockCompare.mockResolvedValue(wynikZUtrataZadzialania());
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    const w = within(screen.getAllByTestId('mvd-wyn-wiersz')[0]);
    expect(w.getByText('Brak zadziałania')).toBeInTheDocument();
    expect(w.getByText('Utrata zadziałania')).toBeInTheDocument();
    expect(w.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('filtr „pokaż tylko zmiany": realne porównanie bez zmian → uczciwy stan zerowy', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-porzab-filtr-zmiany'));
    expect(screen.getByTestId('mvd-porzab-stany-puste')).toHaveTextContent(ZB.filtrPusto);
  });

  it('filtr „pokaż tylko zmiany" zostawia wyłącznie wiersz ze zmianą stanu', async () => {
    mockCompare.mockResolvedValue(wynikZUtrataZadzialania());
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-porzab-filtr-zmiany'));
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(wiersze).toHaveLength(1);
    expect(wiersze[0]).toHaveTextContent(WYNIK.rows[0].nazwa_urzadzenia_pl);
  });

  it('zakładka Ranking: waga i rodzaj po polsku, opis z backendu', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-porzab-tab-ranking'));
    const tabela = screen.getByTestId('mvd-wyn-tabela');
    expect(WYNIK.ranking.length).toBeGreaterThan(0);
    for (const issue of WYNIK.ranking) {
      expect(tabela).toHaveTextContent(wagaPL(issue.severity));
      expect(tabela).toHaveTextContent(rodzajProblemuZabezpieczenPL(issue.issue_code));
      expect(tabela).not.toHaveTextContent(issue.issue_code);
    }
  });

  it('wybór wiersza rankingu → szczegół z opisem z backendu', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-porzab-tab-ranking'));
    fireEvent.click(screen.getAllByTestId('mvd-wyn-wiersz')[0]);
    expect(screen.getByTestId('mvd-porzab-szczegol')).toHaveTextContent(
      WYNIK.ranking[0].description_pl,
    );
  });

  it('pusty ranking → uczciwy komunikat „bez problemów"', async () => {
    mockCompare.mockResolvedValue({ ...WYNIK, ranking: [] });
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    fireEvent.click(screen.getByTestId('mvd-porzab-tab-ranking'));
    expect(screen.getByTestId('mvd-porzab-ranking-puste')).toHaveTextContent(ZB.brakRankingu);
  });

  it('identyfikator porównania i proweniencja wyłącznie w „Informacjach audytowych" (karta #145)', async () => {
    const { rerender } = render(<EkranPorownania {...props({ trybZaawansowania: 'basic' })} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    expect(screen.queryByTestId('mvd-porzab-informacje-audytowe')).not.toBeInTheDocument();

    rerender(<EkranPorownania {...props({ trybZaawansowania: 'expert' })} />);
    expect(screen.getByTestId('mvd-porzab-wynik')).not.toHaveTextContent(WYNIK.comparison_id);
    fireEvent.click(screen.getByTestId('mvd-porzab-informacje-audytowe-przelacz'));
    const lista = screen.getByTestId('mvd-porzab-informacje-audytowe-lista');
    expect(lista).toHaveTextContent(WYNIK.comparison_id);
    // Odciski migawek skrócone do 12 znaków (metadana audytowa, nie treść pierwszoplanowa).
    expect(lista).toHaveTextContent(WYNIK.provenance_a.snapshot_hash.slice(0, 12));
    expect(lista).toHaveTextContent(WYNIK.provenance_b.snapshot_hash.slice(0, 12));
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
    expect(useShellStore.getState().wynikiTabElement).toBe(BIEG_A);
  });

  it('kolumny różnic bez akcji dowodu (różnica nie ma pojedynczego wywodu WHITE BOX)', async () => {
    render(<EkranPorownania {...props()} />);
    await przejdzDoZabezpieczen();
    await wykonajPorownanie();
    const wiersz = screen.getAllByTestId('mvd-wyn-wiersz')[0];
    const liczbaPrzyciskow = within(wiersz).getAllByRole('button', {
      name: WZORZEC_STRINGS.pokazDowod,
    }).length;
    // Dowód mają: stan A/B, czas A/B, prąd A/B, zapas A/B — różnice (czas, prąd) nie.
    expect(liczbaPrzyciskow).toBe(8);
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
    expect(mockTrace).toHaveBeenCalledWith(WYNIK.comparison_id);
    expect(mockTrace).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mvd-porzab-slad')).toHaveTextContent(
      SLAD.steps[0].description_pl,
    );
    // Karta #145: pola śladu nazwane po polsku, bez kluczy i kodów kroków na pierwszym planie.
    expect(screen.getByTestId('mvd-porzab-slad')).toHaveTextContent(
      'Liczba ocen zabezpieczeń w biegu A',
    );
    expect(screen.getByTestId('mvd-porzab-slad')).not.toHaveTextContent('evaluations_a_count');
    expect(screen.getByTestId('mvd-porzab-slad')).not.toHaveTextContent('MATCH_EVALUATIONS');

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

    mockCompare.mockResolvedValue({ ...WYNIK, comparison_id: 'porownanie-2' });
    fireEvent.click(screen.getByTestId('mvd-porzab-przycisk'));
    await screen.findByTestId('mvd-porzab-wynik');
    expect(screen.queryByTestId('mvd-porzab-slad')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mvd-porzab-slad-btn'));
    await screen.findByTestId('mvd-porzab-slad');
    expect(mockTrace).toHaveBeenLastCalledWith('porownanie-2');
  });
});
