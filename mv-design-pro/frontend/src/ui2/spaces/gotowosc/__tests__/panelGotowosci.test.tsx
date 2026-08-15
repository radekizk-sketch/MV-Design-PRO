import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PanelGotowosci } from '../PanelGotowosci';
import { GOTOWOSC_STRINGS } from '../strings';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useStudyCasesStore } from '../../../../ui/study-cases/store';
import { useShellStore } from '../../../shell/useShellStore';
import { PROCES_STRINGS } from '../../../proces';
import type { EnergyNetworkModel } from '../../../../types/enm';
import { emituj } from '../../../events/bus';
import { enmFixActionFixture, readinessInfoFixture, readinessInfoZBlokadami } from './fixtures';

function snapshotFixture(revision = 1): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      revision,
      hash_sha256: `hash-${revision}`,
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
  } as unknown as EnergyNetworkModel;
}

function ustawZBlokadami() {
  useSnapshotStore.setState({
    snapshot: snapshotFixture(),
    readiness: readinessInfoZBlokadami(),
    fixActions: [enmFixActionFixture()],
    loading: false,
    error: null,
  });
}

function props(over: Partial<Parameters<typeof PanelGotowosci>[0]> = {}) {
  return {
    trybZaawansowania: 'basic' as const,
    onSelekcja: vi.fn(),
    onAkcjaNaprawcza: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  useSnapshotStore.setState({
    snapshot: null,
    readiness: null,
    fixActions: [],
    loading: false,
    error: null,
  });
  // Panel czyta teraz także przebiegi i aktywny przypadek (wspólna reguła
  // następnej akcji) — zerujemy je, żeby przypadki nie przeciekały między sobą.
  useExecutionRunsStore.setState({ runs: [] });
  useStudyCasesStore.setState({ activeCase: null });
});

describe('PanelGotowosci — stany przestrzeni', () => {
  it('brak projektu: komunikat', () => {
    render(<PanelGotowosci {...props()} />);
    expect(screen.getByText(GOTOWOSC_STRINGS.brakProjektu)).toBeInTheDocument();
  });

  it('ładowanie: „Wczytywanie…"', () => {
    useSnapshotStore.setState({ loading: true });
    render(<PanelGotowosci {...props()} />);
    expect(screen.getByText(GOTOWOSC_STRINGS.ladowanie)).toBeInTheDocument();
  });

  it('błąd: komunikat błędu', () => {
    useSnapshotStore.setState({ error: 'awaria' });
    render(<PanelGotowosci {...props()} />);
    expect(screen.getByText(GOTOWOSC_STRINGS.blad)).toBeInTheDocument();
  });

  it('wszystko gotowe: pozytywne podsumowanie', () => {
    useSnapshotStore.setState({ snapshot: snapshotFixture(), readiness: readinessInfoFixture() });
    render(<PanelGotowosci {...props()} />);
    expect(screen.getByTestId('mvd-gotowosc-ok')).toBeInTheDocument();
    expect(screen.getByText(GOTOWOSC_STRINGS.wszystkoGotowe)).toBeInTheDocument();
  });

  it('lista: sekcje wg celu + podsumowanie liczbowe', () => {
    ustawZBlokadami();
    render(<PanelGotowosci {...props()} />);
    expect(screen.getByTestId('mvd-cel-zwarcia')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-cel-zabezpieczenia')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-gotowosc-blokady-calkowite')).toHaveTextContent('1');
    expect(screen.getByTestId('mvd-gotowosc-ostrzezenia-calkowite')).toHaveTextContent('1');
  });
});

describe('PanelGotowosci — selekcja i akcja naprawcza (gramatyka §2)', () => {
  beforeEach(ustawZBlokadami);

  it('klik wiersza z elementem -> onSelekcja(elementRef)', () => {
    const p = props();
    render(<PanelGotowosci {...p} />);
    fireEvent.click(screen.getByText('GPZ-1'));
    expect(p.onSelekcja).toHaveBeenCalledWith('GPZ-1');
  });

  it('klik „Napraw…" -> onAkcjaNaprawcza(problem) z dopasowanym fix_action', () => {
    const p = props();
    render(<PanelGotowosci {...p} />);
    fireEvent.click(screen.getByRole('button', { name: GOTOWOSC_STRINGS.napraw }));
    expect(p.onAkcjaNaprawcza).toHaveBeenCalledTimes(1);
    const problem = p.onAkcjaNaprawcza.mock.calls[0][0];
    expect(problem.code).toBe('source.grid_supply_missing');
    expect(problem.fixAction).not.toBeNull();
  });

  it('brak fix_action -> „Wymaga interwencji projektanta" zamiast przycisku', () => {
    render(<PanelGotowosci {...props()} />);
    // REL-2 (protection.settings_incomplete) nie ma dopasowanej fixAction w fixture.
    const wiersz = screen.getByTestId('mvd-problem-protection.settings_incomplete-REL-2');
    expect(within(wiersz).getByText(GOTOWOSC_STRINGS.wymagaInterwencji)).toBeInTheDocument();
  });
});

describe('PanelGotowosci — kod gotowości tylko w dymku / trybie eksperckim (§2.7)', () => {
  beforeEach(ustawZBlokadami);

  it('tryb podstawowy: kod NIE jest widocznym tekstem, jest w atrybucie title (dymek)', () => {
    render(<PanelGotowosci {...props({ trybZaawansowania: 'basic' })} />);
    expect(screen.queryByTestId('mvd-problem-kod-source.grid_supply_missing')).not.toBeInTheDocument();
    const wiersz = screen.getByTestId('mvd-problem-source.grid_supply_missing-GPZ-1');
    expect(wiersz).toHaveAttribute('title', 'source.grid_supply_missing');
  });

  it('tryb ekspercki: kod widoczny jako tekst techniczny', () => {
    render(<PanelGotowosci {...props({ trybZaawansowania: 'expert' })} />);
    expect(screen.getByTestId('mvd-problem-kod-source.grid_supply_missing')).toHaveTextContent(
      'source.grid_supply_missing',
    );
  });
});

describe('PanelGotowosci — filtry (waga/cel/gałąź)', () => {
  beforeEach(ustawZBlokadami);

  it('filtr wagi BLOKADA ukrywa ostrzeżenia', () => {
    render(<PanelGotowosci {...props()} />);
    fireEvent.change(screen.getByLabelText(GOTOWOSC_STRINGS.filtrWagaEtykieta), {
      target: { value: 'BLOKADA' },
    });
    expect(screen.queryByText('REL-2')).not.toBeInTheDocument();
    expect(screen.getByText('GPZ-1')).toBeInTheDocument();
  });

  it('filtr celu: inne sekcje pokazują komunikat braku wyników filtra', () => {
    render(<PanelGotowosci {...props()} />);
    fireEvent.change(screen.getByLabelText(GOTOWOSC_STRINGS.filtrCelEtykieta), {
      target: { value: 'zabezpieczenia' },
    });
    const sekcjaZwarcia = screen.getByTestId('mvd-cel-zwarcia');
    expect(within(sekcjaZwarcia).getByText(GOTOWOSC_STRINGS.filtrBrakWynikow)).toBeInTheDocument();
    const sekcjaZabezp = screen.getByTestId('mvd-cel-zabezpieczenia');
    expect(within(sekcjaZabezp).getByText('REL-2')).toBeInTheDocument();
  });

  it('filtr frazy (gałąź — referencja elementu)', () => {
    render(<PanelGotowosci {...props()} />);
    fireEvent.change(screen.getByLabelText(GOTOWOSC_STRINGS.filtrSzukajEtykieta), {
      target: { value: 'gpz' },
    });
    expect(screen.getByText('GPZ-1')).toBeInTheDocument();
    expect(screen.queryByText('REL-2')).not.toBeInTheDocument();
  });

  it('„Wyczyść filtry" resetuje stan i przywraca pełną listę', () => {
    render(<PanelGotowosci {...props()} />);
    fireEvent.change(screen.getByLabelText(GOTOWOSC_STRINGS.filtrSzukajEtykieta), {
      target: { value: 'gpz' },
    });
    fireEvent.click(screen.getByRole('button', { name: GOTOWOSC_STRINGS.filtrWyczysc }));
    expect(screen.getByText('REL-2')).toBeInTheDocument();
  });
});

describe('PanelGotowosci — zwijanie sekcji', () => {
  beforeEach(ustawZBlokadami);

  it('klik nagłówka sekcji zwija treść (aria-expanded)', () => {
    render(<PanelGotowosci {...props()} />);
    const naglowek = within(screen.getByTestId('mvd-cel-zwarcia')).getByRole('button', {
      name: /Do obliczeń zwarciowych/,
    });
    expect(naglowek).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(naglowek);
    expect(naglowek).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('GPZ-1')).not.toBeInTheDocument();
  });
});

describe('PanelGotowosci — „Następny krok" przy zielonej bramce (F-E3)', () => {
  beforeEach(() => {
    useShellStore.setState({ activeSpace: 'gotowosc' });
  });

  // INTENCJA WIERSZY BEZ ZMIAN (po zielonej bramce ekran ma jawny następny
  // krok), KANON ZMIENIONY: sekcja nie ma już własnego, zaszytego zdania —
  // renderuje wspólny panel następnej najlepszej akcji (`ui2/proces`), więc
  // panel gotowości i pulpit projektu mówią projektantowi to samo.
  it('bramka zielona (brak braków) → panel następnej akcji widoczny z opisem PL', () => {
    useSnapshotStore.setState({ snapshot: snapshotFixture(), readiness: readinessInfoFixture() });
    useExecutionRunsStore.setState({ runs: [] });
    render(<PanelGotowosci {...props()} />);
    const sekcja = screen.getByTestId('mvd-nba');
    expect(within(sekcja).getByText(PROCES_STRINGS.nbaEyebrow)).toBeInTheDocument();
    expect(within(sekcja).getByText(PROCES_STRINGS.nbaUruchomObliczeniaTytul)).toBeInTheDocument();
  });

  it('klik natywny „Przejdź do obliczeń" → przełącza aktywną przestrzeń na „obliczenia"', async () => {
    const user = userEvent.setup();
    useSnapshotStore.setState({ snapshot: snapshotFixture(), readiness: readinessInfoFixture() });
    useExecutionRunsStore.setState({ runs: [] });
    render(<PanelGotowosci {...props()} />);
    expect(useShellStore.getState().activeSpace).toBe('gotowosc');
    await user.click(screen.getByTestId('mvd-nba-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });

  it('bramka zielona z samymi ostrzeżeniami (brak blokerów) → sekcja nadal widoczna', () => {
    useSnapshotStore.setState({
      snapshot: snapshotFixture(),
      readiness: {
        ready: false,
        blockers: [],
        warnings: [
          {
            code: 'protection.settings_incomplete',
            message_pl: 'Nastawy przekaźnika niekompletne.',
            element_ref: 'REL-2',
            severity: 'OSTRZEZENIE',
          },
        ],
      },
    });
    render(<PanelGotowosci {...props()} />);
    expect(screen.getByTestId('mvd-gotowosc-blokady-calkowite')).toHaveTextContent('0');
    expect(screen.getByTestId('mvd-nba')).toBeInTheDocument();
  });

  it('bramka czerwona (są blokery) → panelu następnej akcji nie ma (przewodnikiem jest lista)', () => {
    ustawZBlokadami();
    render(<PanelGotowosci {...props()} />);
    expect(screen.queryByTestId('mvd-nba')).not.toBeInTheDocument();
  });

  it('po wykonanych i aktualnych obliczeniach panel prowadzi do WYNIKÓW, nie do obliczeń', async () => {
    // Regresja rozjazdu naprawionego tą kartą: zaszyte zdanie „przejdź do
    // obliczeń" mówiło to samo także wtedy, gdy obliczenia były już zrobione.
    const user = userEvent.setup();
    useSnapshotStore.setState({ snapshot: snapshotFixture(), readiness: readinessInfoFixture() });
    useExecutionRunsStore.setState({
      runs: [
        {
          id: 'run-1',
          study_case_id: 'K1',
          analysis_type: 'SC_3F',
          solver_input_hash: 'h',
          status: 'DONE',
          started_at: '2026-01-01T10:00:00Z',
          finished_at: '2026-01-01T10:01:00Z',
          error_message: null,
        },
      ],
    });
    useStudyCasesStore.setState({
      activeCase: { id: 'K1', name: 'K1', result_status: 'FRESH', results_valid: true } as never,
    });
    render(<PanelGotowosci {...props()} />);
    expect(screen.getByTestId('mvd-nba-tytul')).toHaveTextContent(
      PROCES_STRINGS.nbaPrzejdzDoWynikowTytul,
    );
    await user.click(screen.getByTestId('mvd-nba-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
  });
});

describe('PanelGotowosci — reakcja na żywo (magistrala, karta §4 kryterium 3)', () => {
  beforeEach(ustawZBlokadami);

  it('emisja gotowosc-zmieniona -> licznik się zmienia bez remount', () => {
    render(<PanelGotowosci {...props()} />);
    const panelPrzed = screen.getByTestId('mvd-gotowosc-panel');
    expect(screen.getByTestId('mvd-gotowosc-blokady-calkowite')).toHaveTextContent('1');

    act(() => {
      useSnapshotStore.setState({
        readiness: {
          ready: false,
          blockers: [
            ...readinessInfoZBlokadami().blockers,
            {
              code: 'station.voltage_missing',
              message_pl: 'Stacja nie ma napięcia.',
              element_ref: 'ST-9',
              severity: 'BLOKUJACE',
            },
          ],
          warnings: readinessInfoZBlokadami().warnings,
        },
      });
      emituj({ typ: 'gotowosc-zmieniona', blokady: 2, ostrzezenia: 1 });
    });

    expect(screen.getByTestId('mvd-gotowosc-blokady-calkowite')).toHaveTextContent('2');
    // Ten sam węzeł DOM -> brak remountu.
    expect(screen.getByTestId('mvd-gotowosc-panel')).toBe(panelPrzed);
  });

  it('emisja gotowosc-zmieniona aktualizuje ogłoszenie ARIA-live', () => {
    render(<PanelGotowosci {...props()} />);
    act(() => {
      emituj({ typ: 'gotowosc-zmieniona', blokady: 1, ostrzezenia: 1 });
    });
    expect(screen.getByTestId('mvd-gotowosc-live')).toHaveTextContent(
      GOTOWOSC_STRINGS.ariaZmianaGotowosci(1, 1),
    );
  });

  it('emisja model-zmieniony też aktualizuje ogłoszenie ARIA-live', () => {
    render(<PanelGotowosci {...props()} />);
    act(() => {
      emituj({ typ: 'model-zmieniony', rev: 2, zakres: ['GPZ-1'] });
    });
    expect(screen.getByTestId('mvd-gotowosc-live')).toHaveTextContent(
      GOTOWOSC_STRINGS.ariaZmianaGotowosci(1, 1),
    );
  });
});
