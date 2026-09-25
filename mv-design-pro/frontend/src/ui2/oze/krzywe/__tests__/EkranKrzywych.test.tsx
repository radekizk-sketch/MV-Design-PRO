/*
 * Testy okna „Krzywe zdolności P–Q" (karta P41, kryteria §3). Weryfikują:
 * wczytanie katalogu typów i operatorów, dobór typu+operatora i jawny bieg (także dla
 * typu bez krzywej producenta — odpowiedzią jest rekord „nie oceniono" z nazwanym brakiem),
 * wykres pasma producenta, tabelę zapasów punktów (liczby, bez statusu punktu), ocenę =
 * rekord `OcenaKryterium` w `KartaWerdyktu` (etykieta i zdanie z rekordu), rozwijany ślad
 * WHITE BOX (reużyty `SladAnalizy`), stan błędu z komunikatem końcówki oraz identyfikatory
 * wyłącznie w sekcji audytowej trybu eksperckiego. API mockowane na granicy klienta; fixtury
 * policzone backendem; interakcje natywne (`userEvent`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EkranKrzywych } from '../EkranKrzywych';
import {
  katalogNcRfgFixture,
  rekordyKonwerterowFixture,
  widokBezKrzywejFixture,
  widokMagazynuFixture,
  widokPokryciaFixture,
} from './fixtures';

const pobierzKonwertery = vi.fn();
const pobierzPokrycie = vi.fn();

vi.mock('../../api', () => ({
  pobierzKonwertery: () => pobierzKonwertery(),
  pobierzPokryciePQ: (zapytanie: unknown) => pobierzPokrycie(zapytanie),
}));

// Katalog operatorów NC RfG czyta produkcyjny klient `ui2/oze/ncrfg/api.ts`
// (`pobierzKatalogNcRfg`) — atrapa stoi na granicy `fetch` i odpowiada wyłącznie na
// `GET /api/ncrfg-tests/catalog` katalogiem policzonym backendem (fikstura generowana).
function atrapaKataloguNcRfg(url: string): Response {
  if (new URL(url, 'http://localhost').pathname !== '/api/ncrfg-tests/catalog') {
    throw new Error(`atrapa okna P–Q: nieoczekiwane zapytanie ${url}`);
  }
  return new Response(JSON.stringify(katalogNcRfgFixture()), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Karta FAB-J: `SekcjaWiazanKrzywych` (sekcja „wiazania" pod wynikiem PQ) czyta
// operatorów NC RfG + krzywe P(f) WYŁĄCZNIE z backendu (`derRemoteCatalogs.ts`
// / `audit2-api.ts`) — ten ekran potrzebuje profili ride-through, nie listy operatorów
// okna P–Q. Mock na granicy modułu klienta, ten sam wzorzec co `vi.mock('../../api', ...)`.
const fetchNcRfgOperatorsSekcjaMock = vi.fn();
const fetchAudit2CatalogSnapshotSekcjaMock = vi.fn();
vi.mock('../../../../ui/network-build/station-der/derRemoteCatalogs', () => ({
  fetchNcRfgOperators: () => fetchNcRfgOperatorsSekcjaMock(),
  getNcRfgOperator: (
    operators: ReadonlyArray<{ operator_id: string }>,
    operatorId: string | null,
  ) => (operatorId ? operators.find((o) => o.operator_id === operatorId) ?? null : null),
}));
vi.mock('../../../../ui/network-build/station-der/audit2-api', () => ({
  fetchAudit2CatalogSnapshot: () => fetchAudit2CatalogSnapshotSekcjaMock(),
}));

const TYP_Z_KRZYWA = 'conv-pv-card-sungrow-sg3150u-mv';
const TYP_BEZ_KRZYWEJ = widokBezKrzywejFixture().typ_katalogowy.id;

function ustawKatalogGotowy() {
  pobierzKonwertery.mockResolvedValue(rekordyKonwerterowFixture());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => atrapaKataloguNcRfg(url)),
  );
  // Uczciwy domyślny stan: brak operatorów/krzywych P(f), dopóki test go nie
  // nadpisze — `SekcjaWiazanKrzywych` renderuje się dopiero po biegu PQ, ale
  // Promise.all musi się rozstrzygnąć, żeby stan nie utknął w „ładowaniu".
  fetchNcRfgOperatorsSekcjaMock.mockResolvedValue([]);
  fetchAudit2CatalogSnapshotSekcjaMock.mockResolvedValue({
    bess_operation_modes: [],
    tap_changers: [],
    hv_fuses: [],
    device_withstand: [],
    pf_curves: [],
    block_transformers: [],
    mv_neutral_groundings: [],
  });
}

async function wczytajISkonfiguruj(tryb: 'basic' | 'expert' = 'basic') {
  render(<EkranKrzywych trybZaawansowania={tryb} onOtworzDowod={vi.fn()} />);
  await screen.findByTestId('mvd-krzywe-dobor');
  await userEvent.selectOptions(screen.getByTestId('mvd-krzywe-typ'), TYP_Z_KRZYWA);
  await userEvent.selectOptions(screen.getByTestId('mvd-krzywe-operator'), 'pse');
}

beforeEach(ustawKatalogGotowy);
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('EkranKrzywych — wczytanie katalogu', () => {
  it('błąd katalogu → jawny stan błędu, bez formularza doboru', async () => {
    pobierzKonwertery.mockRejectedValue(new Error('500 katalog'));
    render(<EkranKrzywych trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    expect(await screen.findByTestId('mvd-krzywe-katalog-blad')).toHaveTextContent('500 katalog');
    expect(screen.queryByTestId('mvd-krzywe-dobor')).not.toBeInTheDocument();
  });

  it('po wczytaniu pokazuje dobór typu i operatora oraz stan „uruchom"', async () => {
    render(<EkranKrzywych trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    expect(await screen.findByTestId('mvd-krzywe-dobor')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-krzywe-idle')).toBeInTheDocument();
    expect(pobierzPokrycie).not.toHaveBeenCalled();
  });
});

describe('EkranKrzywych — typ bez krzywej producenta (kryterium 1)', () => {
  it('wybór typu bez krzywej → bieg dozwolony; odpowiedź = rekord „nie oceniono" z nazwanym brakiem', async () => {
    const widok = widokBezKrzywejFixture();
    pobierzPokrycie.mockResolvedValue(widok);
    render(<EkranKrzywych trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    await screen.findByTestId('mvd-krzywe-dobor');
    await userEvent.selectOptions(screen.getByTestId('mvd-krzywe-typ'), TYP_BEZ_KRZYWEJ);
    await userEvent.selectOptions(screen.getByTestId('mvd-krzywe-operator'), 'pse');
    expect(screen.getByTestId('mvd-krzywe-oblicz')).toBeEnabled();
    await userEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    const etykieta = await screen.findByTestId('mvd-krzywe-werdykt-etykieta');
    expect(etykieta).toHaveTextContent(widok.ocena.etykieta.etykieta_pl);
    expect(etykieta).toHaveAttribute('data-status', 'NIE_OCENIONO');
    expect(screen.getByTestId('mvd-krzywe-werdykt')).toHaveTextContent(
      widok.ocena.wyjasnienie.czego_brakuje[0],
    );
    expect(pobierzPokrycie).toHaveBeenCalledWith({ catalogItemId: TYP_BEZ_KRZYWEJ, operatorId: 'pse' });
  });

  it('lista typów oznacza typ bez krzywej adnotacją „brak krzywej producenta"', async () => {
    render(<EkranKrzywych trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    await screen.findByTestId('mvd-krzywe-dobor');
    expect(screen.getByTestId('mvd-krzywe-typ')).toHaveTextContent('brak krzywej producenta');
  });
});

describe('EkranKrzywych — jawny bieg (kryterium 1)', () => {
  it('typ z krzywą + operator → klik woła API z identyfikatorami', async () => {
    pobierzPokrycie.mockResolvedValue(widokPokryciaFixture());
    await wczytajISkonfiguruj();
    await userEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
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
    await userEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    expect(await screen.findByTestId('mvd-krzywe-blad')).toHaveTextContent(
      'nie ma krzywej producenta',
    );
  });
});

describe('EkranKrzywych — wykres, tabela, werdykt (kryteria 2, 3, 4)', () => {
  beforeEach(() => pobierzPokrycie.mockResolvedValue(widokPokryciaFixture()));

  it('renderuje wykres pasma producenta', async () => {
    await wczytajISkonfiguruj();
    await userEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    expect(await screen.findByTestId('mvd-krzywe-wykres')).toBeInTheDocument();
  });

  it('tabela pokazuje zapasy punktów jako liczby — bez statusu i tagu punktu', async () => {
    await wczytajISkonfiguruj();
    await userEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    const tabela = await screen.findByTestId('mvd-wyn-tabela');
    expect(tabela).toHaveTextContent('-0,409');
    expect(tabela).not.toHaveTextContent(/niepokryty|pokryty/i);
    expect(screen.queryAllByTestId('mvd-wyn-tag-ostrzezenie')).toHaveLength(0);
  });

  // Iloczyn cech: rekord oceny × status (porównanie wykonane bez podstawy / nie dotyczy).
  it.each([
    ['typ PV z krzywą (brak zweryfikowanej podstawy profilu)', widokPokryciaFixture],
    ['magazyn energii (nie dotyczy)', widokMagazynuFixture],
  ] as const)('ocena = rekord backendu w karcie werdyktu: %s', async (_opis, fabryka) => {
    const widok = fabryka();
    pobierzPokrycie.mockResolvedValue(widok);
    await wczytajISkonfiguruj();
    await userEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    const etykieta = await screen.findByTestId('mvd-krzywe-werdykt-etykieta');
    expect(etykieta).toHaveTextContent(widok.ocena.etykieta.etykieta_pl);
    expect(etykieta).toHaveAttribute('data-status', widok.ocena.status_maszynowy);
    expect(etykieta).toHaveAttribute('data-semantyka', widok.ocena.etykieta.semantyka);
    const werdykt = screen.getByTestId('mvd-krzywe-werdykt');
    expect(werdykt).toHaveTextContent(widok.ocena.wyjasnienie.zdanie_pl);
    expect(screen.getByTestId(`mvd-werdykt-${widok.ocena.kryterium_id}`)).toBeInTheDocument();
  });
});

describe('EkranKrzywych — ślad WHITE BOX (kryterium 4)', () => {
  beforeEach(() => pobierzPokrycie.mockResolvedValue(widokPokryciaFixture()));

  it('rozwija ślad weryfikacji (reużyty SladAnalizy) z formułą pokrycia', async () => {
    await wczytajISkonfiguruj();
    await userEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    await screen.findByTestId('mvd-krzywe-wynik');
    expect(screen.queryByTestId('mvd-krzywe-slad')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('mvd-krzywe-slad-otworz'));
    const slad = screen.getByTestId('mvd-krzywe-slad');
    expect(slad).toHaveTextContent(widokPokryciaFixture().slad_whitebox.wynik);
  });
});

describe('EkranKrzywych — tryb ekspercki (identyfikatory)', () => {
  beforeEach(() => pobierzPokrycie.mockResolvedValue(widokPokryciaFixture()));

  it('tryb podstawowy ukrywa identyfikatory typu i operatora', async () => {
    await wczytajISkonfiguruj('basic');
    await userEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    await screen.findByTestId('mvd-krzywe-wynik');
    expect(screen.queryByTestId('mvd-krzywe-eksp')).not.toBeInTheDocument();
  });

  it('tryb ekspercki odsłania catalog_item_id i operator_id w sekcji audytowej', async () => {
    await wczytajISkonfiguruj('expert');
    await userEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    await screen.findByTestId('mvd-krzywe-wynik');
    await userEvent.click(screen.getByTestId('mvd-krzywe-eksp-przelacz'));
    const eksp = screen.getByTestId('mvd-krzywe-eksp-lista');
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

    pobierzPokrycie.mockResolvedValue(widokPokryciaFixture());
    await wczytajISkonfiguruj();
    await userEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    await screen.findByTestId('mvd-krzywe-wynik');
    return { useStationDerStore, useAppStateStore };
  }

  it('zapis wysyła WYŁĄCZNIE wybraną krzywę P(f) (pominięcie ≠ null) i aktualizuje profil modułu', async () => {
    // Karta FAB-J: LVRT/HVRT NIE SĄ już niezależnie wybieralne na tym ekranie —
    // backend niesie jedną parę krzywych ride-through na operatora NC RfG
    // (pokazywane read-only, patrz test niżej), więc jedyna edytowalna krzywa
    // wiązań to P(f). Intencja oryginalnego testu (pominięcie ≠ null, zapis
    // wysyła WYŁĄCZNIE dotknięte pole) zostaje — na jedynym polu, które nadal
    // jest niezależnym wyborem.
    fetchAudit2CatalogSnapshotSekcjaMock.mockResolvedValue({
      bess_operation_modes: [],
      tap_changers: [],
      hv_fuses: [],
      device_withstand: [],
      pf_curves: [
        {
          id: 'pf_droop_5',
          catalog_namespace: 'pf_curve',
          catalog_version: 'v1',
          label_pl: 'P(f) statyzm 5%',
          f_ref_hz: 50,
          droop_percent: 5,
          f_min_hz: 47.5,
          f_max_hz: 51.5,
          deadband_hz: 0.2,
          zrodlo_pl: 'NC RfG art. 13 ust. 2',
        },
      ],
      block_transformers: [],
      mv_neutral_groundings: [],
    });
    const { useStationDerStore, useAppStateStore } = await przygotujModulIWynik();
    patchBindings.mockResolvedValue({});

    // Realna ścieżka: wybór modułu, wybór krzywej P(f), natywny klik zapisu.
    await userEvent.selectOptions(screen.getByTestId('mvd-krzywe-wiazania-modul'), 'der-1');
    await screen.findByText('P(f) statyzm 5%');
    await userEvent.selectOptions(screen.getByTestId('mvd-krzywe-wiazania-pf'), 'pf_droop_5');
    await userEvent.click(screen.getByTestId('mvd-krzywe-wiazania-zapisz'));

    await vi.waitFor(() =>
      expect(patchBindings).toHaveBeenCalledWith('proj-1', 'case-1', 'der-1', {
        pf_curve_ref: 'pf_droop_5',
      }),
    );
    // Rekord warsztatu zsynchronizowany — reguła gotowości widzi krzywą od razu.
    // (waitFor: synchronizacja następuje PO rozstrzygnięciu promisa PATCH.)
    await vi.waitFor(() =>
      expect(
        useStationDerStore.getState().ders['der-1'].profiles.pf_curve_ref,
      ).toBe('pf_droop_5'),
    );

    useStationDerStore.getState().reset();
    useAppStateStore.setState({ activeProjectId: null, activeCaseId: null } as never);
  });

  it('krzywe LVRT/HVRT pokazane read-only wg profilu NC RfG już przypisanego modułowi', async () => {
    // Karta FAB-J: gdy moduł ma przypisany profil operatora, ekran pokazuje
    // JEGO krzywą ride-through (dowód White Box) — nie oferuje wyboru
    // niespójnego z tym profilem.
    fetchNcRfgOperatorsSekcjaMock.mockResolvedValue([
      {
        operator_id: 'pse',
        operator_name_pl: 'PSE',
        last_revision: '2024-Q4',
        reactive_power: { q_range_pct_pn_min: -0.33, q_range_pct_pn_max: 0.33, cos_phi_min: 0.95, voltage_control_modes: [] },
        ride_through: {
          lvrt: [{ time_s: 0, voltage_pu: 0.05 }, { time_s: 1.5, voltage_pu: 0.85 }],
          hvrt: [{ time_s: 0, voltage_pu: 1.3 }],
        },
      },
    ]);
    const { useStationDerStore, useAppStateStore } = await przygotujModulIWynik();
    useStationDerStore.getState().updateDerProfiles('der-1', { nc_rfg_profile_ref: 'pse' });

    await userEvent.selectOptions(screen.getByTestId('mvd-krzywe-wiazania-modul'), 'der-1');

    await vi.waitFor(() => {
      expect(screen.getByTestId('mvd-krzywe-wiazania-lvrt')).toHaveTextContent('0.05 pu');
      expect(screen.getByTestId('mvd-krzywe-wiazania-hvrt')).toHaveTextContent('1.30 pu');
    });

    useStationDerStore.getState().reset();
    useAppStateStore.setState({ activeProjectId: null, activeCaseId: null } as never);
  });

  it('zapis bez żadnej wybranej krzywej jest odmową z powodem (bez pustego PATCH)', async () => {
    const { useStationDerStore, useAppStateStore } = await przygotujModulIWynik();

    await userEvent.selectOptions(screen.getByTestId('mvd-krzywe-wiazania-modul'), 'der-1');
    await userEvent.click(screen.getByTestId('mvd-krzywe-wiazania-zapisz'));

    expect(await screen.findByTestId('mvd-krzywe-wiazania-blad')).toHaveTextContent(
      'Wybierz krzywą P(f) do zapisania.',
    );
    expect(patchBindings).not.toHaveBeenCalled();

    useStationDerStore.getState().reset();
    useAppStateStore.setState({ activeProjectId: null, activeCaseId: null } as never);
  });

  it('bez modułów w modelu sekcja pokazuje uczciwy stan zamiast pickera', async () => {
    const { useStationDerStore } = await import('../../../../ui/network-build/station-der');
    useStationDerStore.getState().reset();
    pobierzPokrycie.mockResolvedValue(widokPokryciaFixture());
    await wczytajISkonfiguruj();
    await userEvent.click(screen.getByTestId('mvd-krzywe-oblicz'));
    await screen.findByTestId('mvd-krzywe-wynik');

    expect(screen.getByTestId('mvd-krzywe-wiazania-brak-modulow')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-krzywe-wiazania-modul')).not.toBeInTheDocument();
  });
});
