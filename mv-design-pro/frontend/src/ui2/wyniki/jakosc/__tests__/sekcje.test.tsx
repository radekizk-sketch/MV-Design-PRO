import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SekcjaWalidacji, SekcjaWiarygodnosci } from '../EkranJakosci';
import { JAKOSC_STRINGS } from '../strings';
import { WALIDACJA_FIXTURE, WIARYGODNOSC_FIXTURE, przebiegTestowy } from './fixtures';
import { useSelectionStore } from '../../../../ui/selection/store';
import { useShellStore } from '../../../shell/useShellStore';
import type { WalidacjaResponse } from '../api';

vi.mock('../api', () => ({
  fetchWiarygodnoscZwarciowa: vi.fn(),
  fetchWalidacjaEnergetyczna: vi.fn(),
}));

import { fetchWalidacjaEnergetyczna, fetchWiarygodnoscZwarciowa } from '../api';

const mockedWiarygodnosc = vi.mocked(fetchWiarygodnoscZwarciowa);
const mockedWalidacja = vi.mocked(fetchWalidacjaEnergetyczna);

function propsWiarygodnosc(over = {}) {
  return {
    przebieg: przebiegTestowy('sc-1', 'SC_3F'),
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}
function propsWalidacja(over = {}) {
  return {
    przebieg: przebiegTestowy('pf-1', 'LOAD_FLOW'),
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  mockedWiarygodnosc.mockReset();
  mockedWalidacja.mockReset();
});

describe('SekcjaWiarygodnosci — stany', () => {
  it('brak przebiegu → uczciwa instrukcja, bez wołania API', () => {
    render(<SekcjaWiarygodnosci {...propsWiarygodnosc({ przebieg: null })} />);
    expect(screen.getByTestId('mvd-jakosc-wiarygodnosc-brak')).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.brakPrzebieguZwarciowego)).toBeTruthy();
    expect(mockedWiarygodnosc).not.toHaveBeenCalled();
  });

  it('błąd pobrania → panel błędu', async () => {
    mockedWiarygodnosc.mockRejectedValue(new Error('boom'));
    render(<SekcjaWiarygodnosci {...propsWiarygodnosc()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-wiarygodnosc-blad')).toBeTruthy());
    expect(screen.getByText(JAKOSC_STRINGS.blad)).toBeTruthy();
  });

  it('gotowe → tabela z węzłami, statusy PL i podsumowanie', async () => {
    mockedWiarygodnosc.mockResolvedValue(WIARYGODNOSC_FIXTURE);
    render(<SekcjaWiarygodnosci {...propsWiarygodnosc()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-wiarygodnosc')).toBeTruthy());
    expect(mockedWiarygodnosc).toHaveBeenCalledWith('sc-1');
    expect(screen.getByText('Szyna A')).toBeTruthy();
    expect(screen.getByText('poza zakresem wiarygodności')).toBeTruthy();
    const podsum = screen.getByTestId('mvd-jakosc-wiarygodnosc-podsumowanie');
    expect(within(podsum).getAllByTestId('mvd-jakosc-chip')).toHaveLength(4);
  });

  it('kolumna blokady OSD pokazuje Tak/Nie', async () => {
    mockedWiarygodnosc.mockResolvedValue(WIARYGODNOSC_FIXTURE);
    render(<SekcjaWiarygodnosci {...propsWiarygodnosc()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-wiarygodnosc')).toBeTruthy());
    expect(screen.getAllByText('Tak').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nie').length).toBeGreaterThan(0);
  });

  it('wybór wiersza pokazuje why_pl w panelu szczegółu', async () => {
    mockedWiarygodnosc.mockResolvedValue(WIARYGODNOSC_FIXTURE);
    render(<SekcjaWiarygodnosci {...propsWiarygodnosc()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-wiarygodnosc')).toBeTruthy());
    // przed wyborem: panel pusty
    expect(screen.getByTestId('mvd-jakosc-wiarygodnosc-szczegol-pusty')).toBeTruthy();
    const wiersz = screen.getByText('Szyna B').closest('tr');
    fireEvent.click(wiersz!);
    const szczegol = screen.getByTestId('mvd-jakosc-wiarygodnosc-szczegol');
    expect(within(szczegol).getByText(WIARYGODNOSC_FIXTURE.items[1].why_pl)).toBeTruthy();
  });

  it('identyfikator węzła ukryty w trybie podstawowym', async () => {
    mockedWiarygodnosc.mockResolvedValue(WIARYGODNOSC_FIXTURE);
    render(<SekcjaWiarygodnosci {...propsWiarygodnosc()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-wiarygodnosc')).toBeTruthy());
    fireEvent.click(screen.getByText('Szyna A').closest('tr')!);
    expect(screen.queryByText('bus-A')).toBeNull();
  });

  it('identyfikator węzła widoczny w trybie eksperckim', async () => {
    mockedWiarygodnosc.mockResolvedValue(WIARYGODNOSC_FIXTURE);
    render(<SekcjaWiarygodnosci {...propsWiarygodnosc({ trybZaawansowania: 'expert' })} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-wiarygodnosc')).toBeTruthy());
    expect(screen.getAllByText('bus-A').length).toBeGreaterThan(0);
  });
});

describe('SekcjaWalidacji — stany', () => {
  it('brak przebiegu rozpływu → uczciwa instrukcja', () => {
    render(<SekcjaWalidacji {...propsWalidacja({ przebieg: null })} />);
    expect(screen.getByTestId('mvd-jakosc-walidacja-brak')).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.brakPrzebieguRozplywu)).toBeTruthy();
    expect(mockedWalidacja).not.toHaveBeenCalled();
  });

  it('błąd pobrania → panel błędu', async () => {
    mockedWalidacja.mockRejectedValue(new Error('boom'));
    render(<SekcjaWalidacji {...propsWalidacja()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja-blad')).toBeTruthy());
  });

  it('gotowe → wszystkie rodzaje kontroli po polsku', async () => {
    mockedWalidacja.mockResolvedValue(WALIDACJA_FIXTURE);
    render(<SekcjaWalidacji {...propsWalidacja()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    expect(mockedWalidacja).toHaveBeenCalledWith('pf-1');
    for (const etykieta of [
      'Obciążenie gałęzi',
      'Obciążenie transformatora',
      'Odchylenie napięcia',
      'Budżet strat',
      'Bilans mocy biernej',
    ]) {
      expect(screen.getByText(etykieta)).toBeTruthy();
    }
  });

  it('progi z konfiguracji obecne w sekcji ZAŁOŻENIA', async () => {
    mockedWalidacja.mockResolvedValue(WALIDACJA_FIXTURE);
    render(<SekcjaWalidacji {...propsWalidacja()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    expect(screen.getByText(JAKOSC_STRINGS.zalProgObciazeniaOstrz)).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.zalProgNapieciaPrzekr)).toBeTruthy();
  });

  it('podsumowanie ma 4 chipy statusów', async () => {
    mockedWalidacja.mockResolvedValue(WALIDACJA_FIXTURE);
    render(<SekcjaWalidacji {...propsWalidacja()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    const podsum = screen.getByTestId('mvd-jakosc-walidacja-podsumowanie');
    expect(within(podsum).getAllByTestId('mvd-jakosc-chip')).toHaveLength(4);
  });

  it('wybór wiersza pokazuje why_pl i status PL w szczególe', async () => {
    mockedWalidacja.mockResolvedValue(WALIDACJA_FIXTURE);
    render(<SekcjaWalidacji {...propsWalidacja()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    fireEvent.click(screen.getByText('Odchylenie napięcia').closest('tr')!);
    const szczegol = screen.getByTestId('mvd-jakosc-walidacja-szczegol');
    expect(within(szczegol).getByText(WALIDACJA_FIXTURE.items[2].why_pl)).toBeTruthy();
    expect(within(szczegol).getByText('Przekroczenie')).toBeTruthy();
  });
});

describe('SekcjaWalidacji — ślad WHITE BOX per pozycja (R2-A / K3-G1)', () => {
  it('tryb ekspercki: wybór pozycji z wywodem → przycisk śladu → pełny wywód', async () => {
    mockedWalidacja.mockResolvedValue(WALIDACJA_FIXTURE);
    render(<SekcjaWalidacji {...propsWalidacja({ trybZaawansowania: 'expert' })} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    fireEvent.click(screen.getByText('Odchylenie napięcia').closest('tr')!);
    fireEvent.click(screen.getByTestId('mvd-jakosc-wal-slad-otworz'));
    const slad = screen.getByTestId('mvd-jakosc-wal-slad');
    // R3-D: wzor i podstawienie renderowane KaTeX-em (nie surowy tekst ASCII).
    const formuly = within(slad).getAllByTestId('math-rendered');
    expect(formuly).toHaveLength(2);
    expect(formuly[0].getAttribute('data-latex')).toContain('\\delta U');
    expect(formuly[1].getAttribute('data-latex')).toContain('= 12.00');
    // Kroki bez formuly (dane/progi/werdykt) pozostaja tekstowe.
    expect(within(slad).getByText(/U = 13.2000 kV \(wynik PF\)/)).toBeTruthy();
    expect(within(slad).getByText('Werdykt: PRZEKROCZENIE')).toBeTruthy();
  });

  it('tryb podstawowy: ślad niedostępny; pozycja bez wywodu bez przycisku', async () => {
    mockedWalidacja.mockResolvedValue(WALIDACJA_FIXTURE);
    render(<SekcjaWalidacji {...propsWalidacja()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    fireEvent.click(screen.getByText('Odchylenie napięcia').closest('tr')!);
    expect(screen.queryByTestId('mvd-jakosc-wal-slad-otworz')).toBeNull();
  });
});

describe('SekcjaWalidacji — pętla decyzji „Popraw w modelu" (F-E6.2)', () => {
  beforeEach(() => {
    useSelectionStore.setState({ selectedElement: null, sldCenterOnElement: null } as never);
    useShellStore.setState({ activeSpace: 'wyniki', wynikiTab: null });
  });

  it('przycisk decyzji tylko na wierszach z przekroczeniem mapującym na element (WARNING/FAIL element-level)', async () => {
    mockedWalidacja.mockResolvedValue(WALIDACJA_FIXTURE);
    render(<SekcjaWalidacji {...propsWalidacja()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    // Fixtura: WARNING (transformator) + FAIL (napięcie) = 2 wiersze z ostrzeżeniem, oba element-level.
    expect(screen.getAllByTestId('mvd-wyn-popraw')).toHaveLength(2);
  });

  it('przekroczenie napięcia → „Popraw" zaznacza węzeł (Bus) i przechodzi do „Schemat"', async () => {
    mockedWalidacja.mockResolvedValue(WALIDACJA_FIXTURE);
    render(<SekcjaWalidacji {...propsWalidacja()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    // Wiersz napięcia (bus-B) — znajdź przycisk w jego wierszu.
    const wierszNapiecia = screen.getByText('Odchylenie napięcia').closest('tr')!;
    fireEvent.click(within(wierszNapiecia).getByTestId('mvd-wyn-popraw'));
    const sel = useSelectionStore.getState();
    expect(sel.selectedElement).toMatchObject({ id: 'bus-B', type: 'Bus' });
    expect(sel.sldCenterOnElement).toBe('bus-B');
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });

  it('bilans mocy biernej (FAIL) → akcja KONTEKSTOWA (K1/F-E6.3): etykieta „dobór kompensacji", klik prowadzi do zakładki „kompensacja" przestrzeni „Wyniki"', async () => {
    // Wariant fixtury: REACTIVE_BALANCE z werdyktem FAIL (element = węzeł
    // bilansujący). Wartość liczbowa konieczna — tag przekroczenia (ostrzezenie)
    // siada na komórce wartości, jak w realnej odpowiedzi backendu dla FAIL.
    const fixtura: WalidacjaResponse = {
      ...WALIDACJA_FIXTURE,
      items: [
        {
          ...WALIDACJA_FIXTURE.items[4],
          observed_value: 0.82,
          limit_fail: 0.95,
          status: 'FAIL',
        },
      ],
    };
    mockedWalidacja.mockResolvedValue(fixtura);
    render(<SekcjaWalidacji {...propsWalidacja()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());

    // Etykieta kontekstowa (§0.5 karty K1 — akcja różni się od generycznej).
    const przycisk = screen.getByTestId('mvd-wyn-popraw');
    expect(przycisk.textContent).toBe('Popraw w modelu — dobór kompensacji');

    // Realna ścieżka: natywny klik → realne store'y (selekcja + deep-link zakładki).
    fireEvent.click(przycisk);
    const sel = useSelectionStore.getState();
    expect(sel.selectedElement).toMatchObject({
      id: WALIDACJA_FIXTURE.items[4].target_id,
      type: 'Bus',
    });
    // Schemat nie jest celem tej akcji — bez odroczonego zoomu SLD.
    expect(sel.sldCenterOnElement).toBeNull();
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(useShellStore.getState().wynikiTab).toBe('kompensacja');
    // R2-B: deep-link niesie ref węzła przekroczenia — okno „Dobór kompensacji"
    // pre-selekcjonuje węzeł zamiast wymagać ponownego ręcznego wyboru.
    expect(useShellStore.getState().wynikiTabElement).toBe(
      WALIDACJA_FIXTURE.items[4].target_id,
    );
  });

  it('bilans strat (target_id=network) z przekroczeniem NIE dostaje przycisku (agregat systemowy, brak martwej akcji)', async () => {
    // Wariant fixtury: LOSS_BUDGET z werdyktem FAIL (agregat „siec", nie element modelu).
    const fixtura: WalidacjaResponse = {
      ...WALIDACJA_FIXTURE,
      items: [
        { ...WALIDACJA_FIXTURE.items[2] }, // VOLTAGE_DEVIATION / FAIL / bus-B (element-level)
        { ...WALIDACJA_FIXTURE.items[3], status: 'FAIL' }, // LOSS_BUDGET / target_id="siec"
      ],
    };
    mockedWalidacja.mockResolvedValue(fixtura);
    render(<SekcjaWalidacji {...propsWalidacja()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    // Oba wiersze mają ostrzeżenie, ale tylko element-level (napięcie) dostaje przycisk.
    expect(screen.getAllByTestId('mvd-wyn-popraw')).toHaveLength(1);
  });
});
