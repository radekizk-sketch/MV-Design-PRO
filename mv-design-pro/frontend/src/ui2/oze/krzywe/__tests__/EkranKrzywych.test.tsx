/*
 * Testy okna „Krzywe zdolności P–Q" (karta P41, kryteria §3). Weryfikują:
 * wczytanie katalogu typów i operatorów, dobór typu+operatora i jawny bieg,
 * uczciwy stan „typ nie ma krzywej producenta" (bieg zablokowany, bez API),
 * wykres pasma producenta, tabelę punktów z marginesem i tagiem statusu,
 * werdykt całości PL, rozwijany ślad WHITE BOX (reużyty `SladAnalizy`), stan
 * błędu z komunikatem końcówki oraz odsłanianie identyfikatorów tylko eksperckie.
 * API mockowane; fixtures 1:1 z backendem.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { EkranKrzywych } from '../EkranKrzywych';
import {
  katalogNcRfgFixture,
  rekordyKonwerterowFixture,
  widokPokryciaFixture,
  widokPokryteFixture,
} from './fixtures';

const pobierzKonwertery = vi.fn();
const pobierzKatalog = vi.fn();
const pobierzPokrycie = vi.fn();

vi.mock('../../api', () => ({
  pobierzKonwertery: () => pobierzKonwertery(),
  pobierzKatalogKlasNcRfg: () => pobierzKatalog(),
  pobierzPokryciePQ: (zapytanie: unknown) => pobierzPokrycie(zapytanie),
}));

const TYP_Z_KRZYWA = 'conv-pv-card-sungrow-sg3150u-mv';
const TYP_BEZ_KRZYWEJ = 'conv-pv-generic-1mw';

function ustawKatalogGotowy() {
  pobierzKonwertery.mockResolvedValue(rekordyKonwerterowFixture());
  pobierzKatalog.mockResolvedValue(katalogNcRfgFixture());
}

async function wczytajISkonfiguruj(tryb: 'basic' | 'expert' = 'basic') {
  render(<EkranKrzywych trybZaawansowania={tryb} />);
  await screen.findByTestId('mvd-krzywe-dobor');
  fireEvent.change(screen.getByTestId('mvd-krzywe-typ'), { target: { value: TYP_Z_KRZYWA } });
  fireEvent.change(screen.getByTestId('mvd-krzywe-operator'), { target: { value: 'pse' } });
}

beforeEach(ustawKatalogGotowy);
afterEach(() => vi.clearAllMocks());

describe('EkranKrzywych — wczytanie katalogu', () => {
  it('błąd katalogu → jawny stan błędu, bez formularza doboru', async () => {
    pobierzKonwertery.mockRejectedValue(new Error('500 katalog'));
    render(<EkranKrzywych trybZaawansowania="basic" />);
    expect(await screen.findByTestId('mvd-krzywe-katalog-blad')).toHaveTextContent('500 katalog');
    expect(screen.queryByTestId('mvd-krzywe-dobor')).not.toBeInTheDocument();
  });

  it('po wczytaniu pokazuje dobór typu i operatora oraz stan „uruchom"', async () => {
    render(<EkranKrzywych trybZaawansowania="basic" />);
    expect(await screen.findByTestId('mvd-krzywe-dobor')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-krzywe-idle')).toBeInTheDocument();
    expect(pobierzPokrycie).not.toHaveBeenCalled();
  });
});

describe('EkranKrzywych — typ bez krzywej producenta (kryterium 1)', () => {
  it('wybór typu bez krzywej → uczciwy komunikat, bieg zablokowany, bez API', async () => {
    render(<EkranKrzywych trybZaawansowania="basic" />);
    await screen.findByTestId('mvd-krzywe-dobor');
    fireEvent.change(screen.getByTestId('mvd-krzywe-typ'), { target: { value: TYP_BEZ_KRZYWEJ } });
    fireEvent.change(screen.getByTestId('mvd-krzywe-operator'), { target: { value: 'pse' } });
    expect(screen.getByTestId('mvd-krzywe-typ-bez-krzywej')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-krzywe-oblicz')).toBeDisabled();
    fireEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    expect(pobierzPokrycie).not.toHaveBeenCalled();
  });

  it('lista typów oznacza typ bez krzywej adnotacją „brak krzywej producenta"', async () => {
    render(<EkranKrzywych trybZaawansowania="basic" />);
    await screen.findByTestId('mvd-krzywe-dobor');
    expect(screen.getByTestId('mvd-krzywe-typ')).toHaveTextContent('brak krzywej producenta');
  });
});

describe('EkranKrzywych — jawny bieg (kryterium 1)', () => {
  it('typ z krzywą + operator → klik woła API z identyfikatorami', async () => {
    pobierzPokrycie.mockResolvedValue(widokPokryciaFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    expect(await screen.findByTestId('mvd-krzywe-wynik')).toBeInTheDocument();
    expect(pobierzPokrycie).toHaveBeenCalledWith({
      catalogItemId: TYP_Z_KRZYWA,
      operatorId: 'pse',
    });
  });

  it('nie woła API przed kliknięciem (jawny bieg)', async () => {
    await wczytajISkonfiguruj();
    expect(pobierzPokrycie).not.toHaveBeenCalled();
    expect(screen.getByTestId('mvd-krzywe-idle')).toBeInTheDocument();
  });

  it('błąd końcówki → jawny stan błędu z komunikatem PL końcówki', async () => {
    pobierzPokrycie.mockRejectedValue(
      new Error("Typ 'x' nie ma krzywej producenta (pole pq_curve); weryfikacja..."),
    );
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    expect(await screen.findByTestId('mvd-krzywe-blad')).toHaveTextContent(
      'nie ma krzywej producenta',
    );
  });
});

describe('EkranKrzywych — wykres, tabela, werdykt (kryteria 2, 3, 4)', () => {
  beforeEach(() => pobierzPokrycie.mockResolvedValue(widokPokryciaFixture()));

  it('renderuje wykres pasma producenta', async () => {
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    expect(await screen.findByTestId('mvd-krzywe-wykres')).toBeInTheDocument();
  });

  it('tabela pokazuje margines i tag statusu punktu niepokrytego', async () => {
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    const tabela = await screen.findByTestId('mvd-wyn-tabela');
    expect(tabela).toHaveTextContent('Niepokryty');
    expect(tabela).toHaveTextContent('-0,409');
    // tag ostrzeżenia wzorca (flaga backendu, bez oceny lokalnej)
    expect(screen.getAllByTestId('mvd-wyn-tag-ostrzezenie').length).toBeGreaterThan(0);
  });

  it('werdykt całości PL: niepokryte → baner błędu z opisem backendu', async () => {
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    const werdykt = await screen.findByTestId('mvd-krzywe-werdykt');
    expect(werdykt).toHaveTextContent('NIE pokrywa wymagania operatora');
    expect(werdykt.className).toContain('mvd-krzywe-werdykt--err');
  });

  it('werdykt pokryte → baner ok', async () => {
    pobierzPokrycie.mockResolvedValue(widokPokryteFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    const werdykt = await screen.findByTestId('mvd-krzywe-werdykt');
    expect(werdykt.className).toContain('mvd-krzywe-werdykt--ok');
  });
});

describe('EkranKrzywych — ślad WHITE BOX (kryterium 4)', () => {
  beforeEach(() => pobierzPokrycie.mockResolvedValue(widokPokryciaFixture()));

  it('rozwija ślad weryfikacji (reużyty SladAnalizy) z formułą pokrycia', async () => {
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    await screen.findByTestId('mvd-krzywe-wynik');
    expect(screen.queryByTestId('mvd-krzywe-slad')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-krzywe-slad-otworz'));
    const slad = screen.getByTestId('mvd-krzywe-slad');
    expect(slad).toHaveTextContent('punkt pokryty');
    expect(slad).toHaveTextContent('NIEPOKRYTE: 3/4 punktow.');
  });
});

describe('EkranKrzywych — tryb ekspercki (identyfikatory)', () => {
  beforeEach(() => pobierzPokrycie.mockResolvedValue(widokPokryciaFixture()));

  it('tryb podstawowy ukrywa identyfikatory typu i operatora', async () => {
    await wczytajISkonfiguruj('basic');
    fireEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    await screen.findByTestId('mvd-krzywe-wynik');
    expect(screen.queryByTestId('mvd-krzywe-eksp')).not.toBeInTheDocument();
  });

  it('tryb ekspercki odsłania catalog_item_id i operator_id', async () => {
    await wczytajISkonfiguruj('expert');
    fireEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    await screen.findByTestId('mvd-krzywe-wynik');
    const eksp = screen.getByTestId('mvd-krzywe-eksp');
    expect(eksp).toHaveTextContent(TYP_Z_KRZYWA);
    expect(eksp).toHaveTextContent('pse');
  });
});

// Granica modułu klienta persystencji DER (K5-B) — PATCH mockowany, klasa błędu
// zachowana (komponent robi `instanceof` przy uczciwym komunikacie). `vi.mock`
// jest hoistowany na szczyt modułu, więc rejestracja MUSI żyć na poziomie pliku.
const patchBindings = vi.fn();
vi.mock('../../../../ui/sld/v2/canvas/derPersistenceApi', () => {
  class DerPersistenceApiError extends Error {}
  return {
    DerPersistenceApiError,
    patchDerCatalogBindings: (...args: unknown[]) => patchBindings(...args),
  };
});

describe('EkranKrzywych — przypisanie krzywych do modułu DER (K5-B / H-3 pkt 2)', () => {
  async function przygotujModulIWynik() {
    const { useStationDerStore } = await import('../../../../ui/network-build/station-der');
    const { useAppStateStore } = await import('../../../../ui/app-state');
    useStationDerStore.getState().reset();
    useStationDerStore.getState().attachDer({
      id: 'der-1',
      project_id: 'proj-1',
      station_id: 'st-1',
      der_kind: 'PV',
      name: 'PV Stacja 1',
      connection_side: 'nN',
    });
    useAppStateStore.setState({ activeProjectId: 'proj-1', activeCaseId: 'case-1' } as never);

    pobierzPokrycie.mockResolvedValue(widokPokryteFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    await screen.findByTestId('mvd-krzywe-wynik');
    return { useStationDerStore, useAppStateStore };
  }

  it('zapis wysyła WYŁĄCZNIE wybrane krzywe (pominięcie ≠ null) i aktualizuje profil modułu', async () => {
    const { useStationDerStore, useAppStateStore } = await przygotujModulIWynik();
    patchBindings.mockResolvedValue({});

    // Realna ścieżka: wybór modułu, wybór krzywej LVRT, natywny klik zapisu.
    fireEvent.change(screen.getByTestId('mvd-krzywe-wiazania-modul'), {
      target: { value: 'der-1' },
    });
    fireEvent.change(screen.getByTestId('mvd-krzywe-wiazania-lvrt'), {
      target: { value: 'lvrt_pse_b' },
    });
    fireEvent.click(screen.getByTestId('mvd-krzywe-wiazania-zapisz'));

    await vi.waitFor(() =>
      expect(patchBindings).toHaveBeenCalledWith('proj-1', 'case-1', 'der-1', {
        lvrt_curve_ref: 'lvrt_pse_b',
      }),
    );
    // Rekord warsztatu zsynchronizowany — reguła gotowości widzi krzywą od razu.
    // (waitFor: synchronizacja następuje PO rozstrzygnięciu promisa PATCH.)
    await vi.waitFor(() =>
      expect(
        useStationDerStore.getState().ders['der-1'].profiles.lvrt_curve_ref,
      ).toBe('lvrt_pse_b'),
    );

    useStationDerStore.getState().reset();
    useAppStateStore.setState({ activeProjectId: null, activeCaseId: null } as never);
  });

  it('zapis bez żadnej wybranej krzywej jest odmową z powodem (bez pustego PATCH)', async () => {
    const { useStationDerStore, useAppStateStore } = await przygotujModulIWynik();

    fireEvent.change(screen.getByTestId('mvd-krzywe-wiazania-modul'), {
      target: { value: 'der-1' },
    });
    fireEvent.click(screen.getByTestId('mvd-krzywe-wiazania-zapisz'));

    expect(await screen.findByTestId('mvd-krzywe-wiazania-blad')).toHaveTextContent(
      'Wybierz przynajmniej jedną krzywą',
    );
    expect(patchBindings).not.toHaveBeenCalled();

    useStationDerStore.getState().reset();
    useAppStateStore.setState({ activeProjectId: null, activeCaseId: null } as never);
  });

  it('bez modułów w modelu sekcja pokazuje uczciwy stan zamiast pickera', async () => {
    const { useStationDerStore } = await import('../../../../ui/network-build/station-der');
    useStationDerStore.getState().reset();
    pobierzPokrycie.mockResolvedValue(widokPokryteFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    await screen.findByTestId('mvd-krzywe-wynik');

    expect(screen.getByTestId('mvd-krzywe-wiazania-brak-modulow')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-krzywe-wiazania-modul')).not.toBeInTheDocument();
  });
});
