/**
 * Kreator edycji parametrów — sekcja linii napowietrznej 110 kV (przewód z katalogu
 * PRZEWOD_LINII_WN + geometria słupa). Realna ścieżka: natywne kliki i wpisy, katalog i podgląd
 * z `fetch` (odpowiedzi w kształcie backendu), zapis przez `executeDomainOperation`.
 *
 * Iloczyn cech: {wiązanie PRZEWOD_LINII_WN, LINIA_SN na szynie 110 kV, LINIA_SN na szynie 15 kV}
 * × {zmiana geometrii, zmiana przewodu, obie, żadna} × {kontekst z polem `geometria_slupa`, bez}
 * × {podgląd: kompletność niepełna z wartościami roboczymi}.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorEdycjiParametrow } from '../KreatorEdycjiParametrow';
import REKORDY from '../../../../harness-fixtures/generated/jakosc_scena_rekordy.json';

const PASMO_X1 = REKORDY.parametry_linii[1];
const PASMO_X0_X1 = REKORDY.parametry_linii[4];

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { element_ref: 'L1' };
const snapshotState = {
  error: null as string | null,
  executeDomainOperation: executeDomainOperationMock,
  snapshot: null as Record<string, unknown> | null,
};

vi.mock('../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../../ui/topology/snapshotStore', async (importOriginal) => {
  const oryginal = await importOriginal<typeof import('../../../../ui/topology/snapshotStore')>();
  const useSnapshotStore = (selector: (s: typeof snapshotState) => unknown) => selector(snapshotState);
  useSnapshotStore.getState = () => snapshotState;
  return { ...oryginal, useSnapshotStore };
});

vi.mock('../../../../ui/network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (s: { closeOperationForm: typeof closeFormMock }) => unknown) =>
    selector({ closeOperationForm: closeFormMock }),
  useActiveOperationContext: () => context,
}));

vi.mock('../../../../ui/navigation/routes', () => ({ navigateToSld: () => undefined }));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectElement: () => void; centerSldOnElement: () => void }) => unknown) =>
    selector({ selectElement: () => undefined, centerSldOnElement: () => undefined }),
}));

const AFL6_240 = 'przewod-wn-243-al1-39-st1a';
const AFL6_185 = 'przewod-wn-184-al1-30-st1a';
const ODGROMOWY = 'przewod-wn-97-al1-56-st1a';

const KATALOG = {
  przewody: [
    { id: AFL6_240, name: 'AFL-6 240 mm² (243-AL1/39-ST1A)', przeznaczenie: 'FAZOWY', voltage_rating_kv: 110 },
    { id: AFL6_185, name: 'AFL-6 185 mm² (184-AL1/30-ST1A)', przeznaczenie: 'FAZOWY', voltage_rating_kv: 110 },
    { id: ODGROMOWY, name: 'AFL-1,7 95 mm² (97-AL1/56-ST1A)', przeznaczenie: 'ODGROMOWY', voltage_rating_kv: 110 },
  ],
  wartosci_robocze: [
    { parametr: 'fazy', nazwa_pl: 'położenie przewodów fazowych na słupie', rodzaj_zrodla: 'ZALOZENIE_INZYNIERSKIE', odniesienie: 'słup typowy 110 kV', uzasadnienie_pl: 'u', wplyw_pl: 'w' },
    { parametr: 'odgromowe', nazwa_pl: 'położenie przewodu odgromowego', rodzaj_zrodla: 'ZALOZENIE_INZYNIERSKIE', odniesienie: 'jeden przewód w osi słupa', uzasadnienie_pl: 'u', wplyw_pl: 'w' },
    { parametr: 'przewod_odgromowy_ref', nazwa_pl: 'typ przewodu odgromowego', rodzaj_zrodla: 'ZALOZENIE_INZYNIERSKIE', odniesienie: 'przewód stalowo-aluminiowy', uzasadnienie_pl: 'u', wplyw_pl: 'w' },
    { parametr: 'rezystywnosc_gruntu_ohm_m', nazwa_pl: 'rezystywność gruntu', rodzaj_zrodla: 'ZALOZENIE_INZYNIERSKIE', odniesienie: 'ρ = 100 Ω·m', uzasadnienie_pl: 'u', wplyw_pl: 'w' },
  ],
};

const PODGLAD = {
  przewod: { oznaczenie: '243-AL1/39-ST1A', przekroj_mm2: 243, zrodlo: 'PN-EN 50182' },
  parametry: {
    metoda: 'Carson', wersja_metody: '1', r1_ohm_per_km: 0.11902, x1_ohm_per_km: 0.40901,
    b1_s_per_km: 2.7858e-6, r0_ohm_per_km: 0.30723, x0_ohm_per_km: 1.01621, b0_s_per_km: 1.6769e-6,
    r1_temperatura_ohm_per_km: 0.14, temperatura_przewodu_c: 80, kompletnosc_dowodu: 'NIEPELNY',
  },
  dane_linii: {
    skladowe: [
      { parametr: 'fazy', nazwa_pl: 'położenie przewodów fazowych na słupie', pochodzenie: 'PROJEKT', wartosc_robocza: false, opis_zrodla_pl: 'dana projektu' },
      { parametr: 'rezystywnosc_gruntu_ohm_m', nazwa_pl: 'rezystywność gruntu', pochodzenie: 'PROPOZYCJA', wartosc_robocza: true, opis_zrodla_pl: 'ρ = 100 Ω·m (ESTIMATED)' },
    ],
  },
  pasma_wiarygodnosci: [
    // Ocena pasma X′1 WYGENEROWANA backendem (`ocen_parametry_linii_110kv`, karta
    // WERDYKT-MIGRACJA-190) — z rekordem werdyktu, bez ręcznej atrapy.
    PASMO_X1,
    // Pasmo naruszone (X′0/X′1 poza pasmem) — etykieta i ton z rekordu.
    PASMO_X0_X1,
  ],
};

function liniaModelu(zmiany: Record<string, unknown> = {}) {
  return {
    ref_id: 'L1',
    name: 'Linia 110 kV GPZ A – GPZ B',
    type: 'line_overhead',
    from_bus_ref: 'A',
    to_bus_ref: 'B',
    length_km: 20,
    r_ohm_per_km: 0.119,
    x_ohm_per_km: 0.409,
    catalog_ref: AFL6_240,
    catalog_namespace: 'PRZEWOD_LINII_WN',
    geometria_slupa: null,
    ...zmiany,
  };
}

function model(galaz: Record<string, unknown>, napiecieKv = 110) {
  return {
    header: { defaults: { frequency_hz: 50, unit_system: 'SI' } },
    buses: [
      { ref_id: 'A', name: 'Szyna A', voltage_kv: napiecieKv },
      { ref_id: 'B', name: 'Szyna B', voltage_kv: napiecieKv },
    ],
    branches: [galaz],
  };
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const adres = String(input);
  const tresc = adres.endsWith('/parametry-linii')
    ? PODGLAD
    : adres.endsWith('/api/catalog/overhead-conductor-types')
      ? KATALOG
      : [];
  return new Response(JSON.stringify(tresc), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

const S = 'mvd-kreator-edycja-linia-wn';

describe('KreatorEdycjiParametrow — linia napowietrzna 110 kV', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { element_ref: 'L1' };
    snapshotState.error = null;
    snapshotState.snapshot = model(liniaModelu());
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    executeDomainOperationMock.mockResolvedValue({ error: null });
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('linia z przewodem 110 kV: sekcja z przewodem z modelu, puste pola z podpowiedzią wartości roboczej', async () => {
    render(<KreatorEdycjiParametrow />);
    const przewod = await screen.findByTestId(`${S}-przewod`);
    expect(przewod).toHaveValue(AFL6_240);
    // Lista przewodów linii: wyłącznie fazowe (przewód odgromowy nie jest przewodem fazowym).
    const opcje = Array.from((przewod as HTMLSelectElement).options).map((o) => o.value);
    expect(opcje).toEqual(['', AFL6_240, AFL6_185]);
    expect(screen.getByTestId(`${S}-faza-0-x`)).toHaveValue('');
    const sekcja = screen.getByTestId(S);
    expect(sekcja).toHaveTextContent('Puste pole: wartość robocza — słup typowy 110 kV');
    expect(sekcja).toHaveTextContent('Puste pole: wartość robocza — ρ = 100 Ω·m');
    // Nic nie zmieniono — zapis zablokowany.
    expect(screen.getByTestId('mvd-kreator-edycja-zapisz')).toBeDisabled();
  });

  it('zmiana geometrii → jedna operacja update_element_parameters z `geometria_slupa`', async () => {
    render(<KreatorEdycjiParametrow />);
    await screen.findByTestId(`${S}-przewod`);
    await userEvent.type(screen.getByTestId(`${S}-rezystywnosc`), '250');
    await userEvent.selectOptions(screen.getByTestId(`${S}-tryb-odgromowych`), 'brak');
    await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    expect(executeDomainOperationMock).toHaveBeenCalledWith('case-1', 'update_element_parameters', {
      element_ref: 'L1',
      parameters: {
        geometria_slupa: {
          fazy: null,
          liczba_w_wiazce: 1,
          odstep_wiazki_m: null,
          odgromowe: [],
          przewod_odgromowy_ref: null,
          rezystywnosc_gruntu_ohm_m: 250,
        },
      },
    });
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('zmiana przewodu i geometrii → najpierw geometria, potem przypisanie przewodu z katalogu', async () => {
    render(<KreatorEdycjiParametrow />);
    await screen.findByTestId(`${S}-przewod`);
    await userEvent.selectOptions(screen.getByTestId(`${S}-przewod`), AFL6_185);
    await userEvent.type(screen.getByTestId(`${S}-rezystywnosc`), '50');
    await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(2));
    expect(executeDomainOperationMock.mock.calls[0][1]).toBe('update_element_parameters');
    expect(executeDomainOperationMock.mock.calls[1]).toEqual([
      'case-1',
      'assign_catalog_to_element',
      {
        element_ref: 'L1',
        catalog_binding: expect.objectContaining({
          catalog_namespace: 'PRZEWOD_LINII_WN',
          catalog_item_id: AFL6_185,
        }),
        // Bez `source_mode`: pochodzenie ustala operacja (toEqual — klucz nadmiarowy = czerwień).
      },
    ]);
  });

  it('błąd zapisu geometrii zatrzymuje przypisanie przewodu i pokazuje odmowę backendu', async () => {
    executeDomainOperationMock.mockResolvedValueOnce({
      error: 'Geometria słupa ma niepoprawny kształt',
    });
    render(<KreatorEdycjiParametrow />);
    await screen.findByTestId(`${S}-przewod`);
    await userEvent.selectOptions(screen.getByTestId(`${S}-przewod`), AFL6_185);
    await userEvent.type(screen.getByTestId(`${S}-rezystywnosc`), '50');
    await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));

    await waitFor(() => expect(screen.getByText('Geometria słupa ma niepoprawny kształt')).toBeInTheDocument());
    expect(executeDomainOperationMock).toHaveBeenCalledTimes(1);
    expect(closeFormMock).not.toHaveBeenCalled();
  });

  it('linia SN na szynie 110 kV: sekcja bez przewodu, wybór przewodu → wyłącznie przypisanie z katalogu', async () => {
    snapshotState.snapshot = model(liniaModelu({ catalog_namespace: 'LINIA_SN', catalog_ref: 'linia-sn' }));
    render(<KreatorEdycjiParametrow />);
    const przewod = await screen.findByTestId(`${S}-przewod`);
    expect(przewod).toHaveValue('');
    await userEvent.selectOptions(przewod, AFL6_240);
    await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    expect(executeDomainOperationMock.mock.calls[0][1]).toBe('assign_catalog_to_element');
  });

  it('linia SN na szynie 15 kV: brak sekcji linii 110 kV', async () => {
    snapshotState.snapshot = model(
      liniaModelu({ catalog_namespace: 'LINIA_SN', catalog_ref: 'linia-sn' }),
      15,
    );
    render(<KreatorEdycjiParametrow />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId(S)).toBeNull();
  });

  it('niepełne fazy → błąd pola, zapis zablokowany, nic nie trafia do backendu', async () => {
    render(<KreatorEdycjiParametrow />);
    await screen.findByTestId(`${S}-przewod`);
    await userEvent.type(screen.getByTestId(`${S}-faza-0-x`), '-4,2');
    expect(screen.getByTestId(S)).toHaveTextContent('wszystkich trzech faz');
    expect(screen.getByTestId('mvd-kreator-edycja-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('podgląd: geometria i częstotliwość modelu idą do backendu; wynik z kompletnością i pasmem', async () => {
    render(<KreatorEdycjiParametrow />);
    await screen.findByTestId(`${S}-przewod`);
    await userEvent.type(screen.getByTestId(`${S}-rezystywnosc`), '250');
    await userEvent.click(screen.getByTestId(`${S}-podglad`));

    const wynik = await screen.findByTestId(`${S}-podglad-wynik`);
    const wywolanie = fetchMock.mock.calls.find(([adres]) => String(adres).endsWith('/parametry-linii'));
    expect(String(wywolanie?.[0])).toContain(`/api/catalog/overhead-conductor-types/${AFL6_240}/parametry-linii`);
    expect(JSON.parse(String(wywolanie?.[1]?.body))).toEqual({
      geometria_slupa: {
        fazy: null,
        liczba_w_wiazce: 1,
        odstep_wiazki_m: null,
        odgromowe: null,
        przewod_odgromowy_ref: null,
        rezystywnosc_gruntu_ohm_m: 250,
      },
      czestotliwosc_hz: 50,
    });
    expect(wynik).toHaveTextContent('Kompletność dowodu: niepełna');
    expect(wynik).toHaveTextContent('Reaktancja X′1');
    expect(wynik).toHaveTextContent(PASMO_X1.wyjasnienie_pl);
    // Etykieta pasma z rekordu (spełnione / naruszone), nie z flagi `w_pasmie` w UI.
    expect(screen.getByTestId(`${S}-pasmo-etykieta-x1_ohm_per_km`)).toHaveTextContent(
      PASMO_X1.ocena.etykieta.etykieta_pl,
    );
    expect(screen.getByTestId(`${S}-pasmo-etykieta-x0_do_x1`)).toHaveTextContent(
      PASMO_X0_X1.ocena.etykieta.etykieta_pl,
    );
    expect(PASMO_X0_X1.ocena.status_maszynowy).toBe('NIE_SPELNIA');
    expect(screen.getByTestId(`${S}-skladowa-rezystywnosc_gruntu_ohm_m`)).toHaveTextContent('wartość robocza');
    // Podgląd niczego nie zapisuje.
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  describe('akcja naprawcza gotowości wskazuje geometrię słupa', () => {
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    });

    it('kursor w pierwszym polu geometrii; wiersz klucz → wartość pozostaje pusty', async () => {
      context = { element_ref: 'L1', field: 'geometria_slupa' };
      render(<KreatorEdycjiParametrow />);
      const pole = await screen.findByTestId(`${S}-faza-0-x`);
      await waitFor(() => expect(pole).toHaveFocus());
      expect(screen.getByTestId('mvd-kreator-edycja-klucz-0')).toHaveValue('');
    });
  });
});
