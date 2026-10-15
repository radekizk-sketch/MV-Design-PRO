/**
 * Testy kreatora „Dodaj pole SN" — realna ścieżka użytkownika, Zero-Debt §5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorPolaSn } from '../KreatorPolaSn';
import type { MVApparatusCatalogType } from '../../../../ui/catalog/types';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
const resolved: { station: string | null; bus: string | null } = { station: 'st-1', bus: 'bus-1' };
// Szyna 15 kV — napięcie dla doboru aparatu (zdatne: U_n aparatu ≥ 15 kV).
const snapshotState = {
  error: null as string | null,
  snapshot: { buses: [{ id: 'bus-1', ref_id: 'bus-1', voltage_kv: 15 }] } as Record<string, unknown>,
  executeDomainOperation: executeDomainOperationMock,
};

vi.mock('../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../../ui/topology/snapshotStore', () => {
  const useSnapshotStore = (selector: (s: typeof snapshotState) => unknown) => selector(snapshotState);
  useSnapshotStore.getState = () => snapshotState;
  return { useSnapshotStore };
});

vi.mock('../../../../ui/network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (s: { closeOperationForm: typeof closeFormMock }) => unknown) =>
    selector({ closeOperationForm: closeFormMock }),
  useActiveOperationContext: () => ({}),
}));

vi.mock('../../../../ui/network-build/forms/enmResolvers', () => ({
  resolveStationRef: () => resolved.station,
  resolveBusSnRef: () => resolved.bus,
  stationLabel: () => 'Rozdzielnia ST-1',
}));

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => navigateToSldMock(),
}));

const fetchBayTemplatesMock = vi.fn();

// `vi.hoisted` + `vi.fn()` (S9-5): pozwala nadpisać implementację per test
// (`mockReturnValueOnce`), żeby symulować katalog W TRAKCIE ładowania.
const { fetchMvApparatusTypesMock, fetchSwitchgearFamiliesMock } = vi.hoisted(() => ({
  fetchMvApparatusTypesMock: vi.fn((): Promise<MVApparatusCatalogType[]> =>
    Promise.resolve([
      // Rzuty końcówki katalogu (producent rozdzielnicy, rodzaj w słowniku rodzin).
      { id: 'app-1', name: 'Wyłącznik SN', device_kind: 'WYLACZNIK', u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 20, manufacturer_ref: 'ZPUE', family_apparatus_kind: 'circuit_breaker', interchangeable_across_families: false },
      { id: 'app-2', name: 'Rozłącznik SN 12 kV', device_kind: 'ROZLACZNIK', u_n_kv: 12, i_n_a: 400, breaking_capacity_ka: 16, manufacturer_ref: 'ZPUE', family_apparatus_kind: 'switch_disconnector', interchangeable_across_families: false },
    ]),
  ),
  /**
   * Rodziny w kształcie ODPOWIEDZI BACKENDU (`GET /api/catalog/switchgear-families`):
   * z klasami znamionowymi, technologią i WYLICZANYM `tor_konfiguracji`.
   * Poprzednia fikstura miała trzy pola, więc ekran nie mógł nawet pokazać, czym
   * wybrana rodzina jest — a właśnie to rozstrzyga o sposobie budowy rozdzielnicy.
   */
  fetchSwitchgearFamiliesMock: vi.fn(() =>
    Promise.resolve([
      {
        switchgear_family_ref: 'fam-1',
        family_name: 'Rotoblok SVS',
        manufacturer_ref: 'ZPUE',
        series_name: null,
        network_voltages_kv: [15, 20],
        um_classes_kv: [17.5, 24],
        rated_current_options: [630],
        short_time_current_options: [16],
        allowed_apparatus_kinds: ['circuit_breaker', 'switch_disconnector', 'fuse_set'],
        insulation_type: 'air',
        construction_type: 'wnetrzowa',
        tor_konfiguracji: 'MODULARNY',
        status: 'repo_verified',
        source_refs: ['kat'],
        notes_pl: null,
      },
      {
        switchgear_family_ref: 'fam-rmu',
        family_name: 'TPM Air',
        manufacturer_ref: 'ZPUE',
        series_name: null,
        network_voltages_kv: [15],
        um_classes_kv: [17.5],
        rated_current_options: [630],
        short_time_current_options: [20],
        insulation_type: 'air',
        construction_type: 'RMU',
        tor_konfiguracji: 'BLOK_RMU',
        status: 'repo_verified',
        source_refs: ['kat'],
        notes_pl: null,
      },
    ]),
  ),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchManufacturers: () =>
    Promise.resolve([{ manufacturer_ref: 'ZPUE', name: 'ZPUE S.A. (Włoszczowa)', normalized_code: 'ZPUE', country: 'PL', status: 'repo_verified', source_refs: [] }]),
  fetchMvApparatusTypes: () => fetchMvApparatusTypesMock(),
  fetchSwitchgearFamilies: () => fetchSwitchgearFamiliesMock(),
  fetchCompleteBayTemplates: (manufacturerRef?: string | null, bayKind?: string | null) =>
    fetchBayTemplatesMock(manufacturerRef, bayKind),
}));

async function pick() {
  // Czekamy na OPCJĘ z katalogu, nie na samą kontrolkę: lista istnieje (z podpowiedzią)
  // zanim katalog się wczyta, więc wybór tuż po jej pojawieniu się był wyścigiem.
  await waitFor(() => {
    expect(
      screen.getByTestId('mvd-kreator-pole-katalog').querySelector('option[value="app-1"]'),
    ).not.toBeNull();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-katalog'), 'app-1');
}

describe('KreatorPolaSn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    resolved.station = 'st-1';
    resolved.bus = 'bus-1';
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    fetchBayTemplatesMock.mockReset();
    fetchMvApparatusTypesMock.mockClear();
    fetchSwitchgearFamiliesMock.mockClear();
    fetchBayTemplatesMock.mockResolvedValue([]);
  });

  afterEach(() => cleanup());

  it('dodaje pole SN z rolą, aparatem i katalogiem (operacja domenowa)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPolaSn />);
    await pick();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rola'), 'TR');
    // Rodzaj aparatu dobrany z pozycji katalogowej (wyłącznik) — zwykła, edytowalna wartość pola,
    // bez etykiety pochodzenia (dyrektywa 2026-10-15: narzędzie projektowe, nie ewidencja).
    expect(screen.getByTestId('mvd-kreator-pole-aparat')).toHaveValue('BREAKER');
    expect(screen.getByTestId('mvd-kreator-pole-aparat')).toBeEnabled();
    expect(screen.queryByText(/przyjęto/)).toBeNull();

    await userEvent.click(screen.getByTestId('mvd-kreator-pole-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_sn_bay',
        expect.objectContaining({
          bus_ref: 'bus-1',
          station_ref: 'st-1',
          bay_role: 'TR',
          apparatus_kind: 'BREAKER',
          catalog_binding: expect.objectContaining({ catalog_namespace: 'APARAT_SN', catalog_item_id: 'app-1' }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('wiąże pole z szablonem producenta (rodzina → BayKind roli → szablon)', async () => {
    fetchBayTemplatesMock.mockResolvedValue([
      {
        template_ref: 'tmpl-tr-1',
        manufacturer_ref: 'ZPUE',
        switchgear_family_ref: 'fam-1',
        notes_pl: 'Pole transformatorowe 630A',
      },
    ]);
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPolaSn />);
    await pick();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rola'), 'TR');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rodzina'), 'fam-1');

    // BayKind wyprowadzony z roli TR = transformatorowe.
    await waitFor(() => {
      expect(fetchBayTemplatesMock).toHaveBeenCalledWith('ZPUE', 'transformatorowe');
    });
    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-pole-szablon-wybor')).toBeInTheDocument();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-szablon-wybor'), 'tmpl-tr-1');

    await userEvent.click(screen.getByTestId('mvd-kreator-pole-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_sn_bay',
        expect.objectContaining({
          bay_role: 'TR',
          switchgear_family_ref: 'fam-1',
          manufacturer_ref: 'ZPUE',
          bay_template_ref: 'tmpl-tr-1',
        }),
      );
    });
  });

  it('pole pomiarowe: wybór układu pomiarowego energii trafia do payloadu add_sn_bay', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPolaSn />);
    await pick();
    // Wybór pomiaru widoczny dopiero dla roli pomiarowej (realna ścieżka).
    expect(screen.queryByTestId('mvd-kreator-pole-rodzaj-pomiaru')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rola'), 'MEASUREMENT');
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-pole-rodzaj-pomiaru'),
      'KONTROLNY',
    );

    await userEvent.click(screen.getByTestId('mvd-kreator-pole-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_sn_bay',
        expect.objectContaining({
          bay_role: 'MEASUREMENT',
          funkcja_pomiaru: 'UKLAD_ENERGII',
          rodzaj_pomiaru: 'KONTROLNY',
        }),
      );
    });
  });

  it('pole pomiarowe bez zmiany wyboru = pomiar napięcia szyn (jawnie w payloadzie)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPolaSn />);
    await pick();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rola'), 'MEASUREMENT');
    await userEvent.click(screen.getByTestId('mvd-kreator-pole-zapisz'));
    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalled();
    });
    const payload = executeDomainOperationMock.mock.calls[0][2] as Record<string, unknown>;
    expect(payload.funkcja_pomiaru).toBe('NAPIECIA_SZYN');
    expect(payload.rodzaj_pomiaru).toBeUndefined();
  });

  it('rola niepomiarowa nie wysyła pomiaru (zero fantomów)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPolaSn />);
    await pick();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rola'), 'OUT');
    await userEvent.click(screen.getByTestId('mvd-kreator-pole-zapisz'));
    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalled();
    });
    const payload = executeDomainOperationMock.mock.calls[0][2] as Record<string, unknown>;
    expect(payload.funkcja_pomiaru).toBeUndefined();
    expect(payload.rodzaj_pomiaru).toBeUndefined();
  });

  // Intencja dawnych testów „zapis zablokowany”: bez szyny/stacji i bez przypadku operacja
  // nie rusza — w nowym kanonie przez jedno wskazanie przy próbie zapisu.
  it('bez szyny/stacji: próba zapisu nazywa brak szyny, operacja nie rusza', async () => {
    resolved.station = null;
    resolved.bus = null;
    render(<KreatorPolaSn />);
    await screen.findByRole('option', { name: /Wyłącznik SN/ });
    expect(screen.getByTestId('mvd-kreator-pole-brak')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('mvd-kreator-pole-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie')).toBeInTheDocument();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('bez aktywnego przypadku: próba zapisu wskazuje przypadek', async () => {
    appState.activeCaseId = null;
    render(<KreatorPolaSn />);
    await pick();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rola'), 'OUT');
    await userEvent.click(screen.getByTestId('mvd-kreator-pole-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/aktywny przypadek/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('świeży kreator: zero alertów; jedyny aparat zdatny na 15 kV przyjęty; zapis wskazuje rolę pola', async () => {
    render(<KreatorPolaSn />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-pole-katalog')).toHaveValue('app-1'));
    expect(screen.getByTestId('mvd-kreator-pole-katalog')).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
    // Aparat 12 kV nie jest oferowany na szynie 15 kV (lista zawężona napięciem szyny).
    expect(screen.queryByRole('option', { name: /Rozłącznik SN 12 kV/ })).toBeNull();
    await userEvent.click(screen.getByTestId('mvd-kreator-pole-zapisz'));
    expect(screen.getByTestId('mvd-kreator-pole-rola')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Wybierz rolę pola — /);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  /**
   * S9-5 (`karta_e2e_s95.md`, klasa: bramka enable bez sygnału gotowości) —
   * TEN SAM mechanizm jak w `KreatorMagistralaSn.tsx`, powtórzony w tym pliku:
   * zapis nie sprawdzał, czy katalog aparatów/rodzin już doszedł.
   */
  it('iloczyn cech: katalog jeszcze się ładuje × szyna dostępna → zapis zablokowany z komunikatem', async () => {
    fetchMvApparatusTypesMock.mockReturnValueOnce(new Promise(() => {}));
    fetchSwitchgearFamiliesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorPolaSn />);

    expect(screen.getByTestId('mvd-kreator-pole-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-pole')).toHaveAttribute('data-status', 'ladowanie');
    expect(screen.getByTestId('mvd-kreator-blokada').textContent).toMatch(/katalogu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});

/**
 * KONFIGURATOR-POL-RMU (etap S3) — TEN SAM model katalogowego pola, co w
 * kreatorze stacji. Dokładanie pojedynczego pola jest DRUGIM miejscem w
 * kreatorach, gdzie wybiera się rodzinę i kartę pola, więc obowiązuje tu ten sam
 * kanon: nagłówek rodziny + PEŁNY skład pola z karty producenta.
 *
 * Różnica jest merytoryczna i przypięta testem: operacja `add_sn_bay` NIE MA
 * w kontrakcie pola `equipment`, więc żadne doposażenie nie jest tu sterowalne.
 */
describe('KreatorPolaSn — katalogowe pole rodziny (S3)', () => {
  const SZABLON_ZE_SKLADEM = {
    template_ref: 'tmpl-tr-1',
    manufacturer_ref: 'ZPUE',
    switchgear_family_ref: 'fam-1',
    notes_pl: 'Pole transformatorowe 630A',
    device_instances: [
      {
        device_template_ref: 'dev-q1',
        apparatus_kind: 'switch_disconnector',
        label: 'Q1',
        position_in_bay: 1,
        electrical_side: 'busbar_side',
        status_wyposazenia: 'FABRYCZNY',
      },
      {
        device_template_ref: 'dev-ct',
        apparatus_kind: 'current_transformer',
        label: 'T1',
        position_in_bay: 2,
        electrical_side: 'line_side',
        status_wyposazenia: 'OPCJA',
      },
    ],
  };

  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    resolved.station = 'st-1';
    resolved.bus = 'bus-1';
    snapshotState.error = null;
    executeDomainOperationMock.mockReset();
    executeDomainOperationMock.mockResolvedValue({ error: null });
    fetchBayTemplatesMock.mockReset();
    fetchBayTemplatesMock.mockResolvedValue([SZABLON_ZE_SKLADEM]);
  });

  afterEach(() => cleanup());

  it('nagłówek wybranej rodziny podaje klasy znamionowe, technologię i tor', async () => {
    render(<KreatorPolaSn />);
    await pick();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rola'), 'TR');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rodzina'), 'fam-1');

    const naglowek = await screen.findByTestId('mvd-kreator-pole-naglowek-rodziny');
    expect(naglowek).toHaveTextContent('15 / 20 kV');
    expect(naglowek).toHaveTextContent('630 A');
    expect(naglowek).toHaveTextContent('16 kA');
    expect(naglowek).toHaveTextContent('powietrzna');
    expect(naglowek).toHaveTextContent(/modułowy/i);
    // Producent nazwą z rejestru producentów, nie identyfikatorem rodziny (`ZPUE`).
    expect(naglowek).toHaveTextContent('ZPUE S.A. (Włoszczowa)');
  });

  // Ten sam predykat oferty co kreator stacji (`aparatWOfercieRodziny`). Iloczyn: producent
  // {rodziny, inny, brak} × wymienność {tak, nie} × rodzaj {dopuszczony, spoza rodziny}.
  it('po wyborze rodziny lista aparatów to oferta rodziny (z wkładkami wymiennymi)', async () => {
    fetchMvApparatusTypesMock.mockReturnValueOnce(
      Promise.resolve([
        { id: 'app-1', name: 'Wyłącznik SN', device_kind: 'WYLACZNIK', u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 20, manufacturer_ref: 'ZPUE', family_apparatus_kind: 'circuit_breaker', interchangeable_across_families: false },
        { id: 'app-siemens', name: 'Wyłącznik Siemens', device_kind: 'WYLACZNIK', u_n_kv: 17.5, i_n_a: 1250, breaking_capacity_ka: 25, manufacturer_ref: 'SIEMENS', family_apparatus_kind: 'circuit_breaker', interchangeable_across_families: false },
        { id: 'app-bezp', name: 'ETI VV 63 A', device_kind: 'ROZLACZNIK_BEZPIECZNIKOWY', u_n_kv: 17.5, i_n_a: 63, breaking_capacity_ka: 20, manufacturer_ref: null, family_apparatus_kind: 'fuse_set', interchangeable_across_families: true },
        { id: 'app-slup', name: 'Odłącznik słupowy', device_kind: 'ODLACZNIK', u_n_kv: 17.5, i_n_a: 400, breaking_capacity_ka: 0, manufacturer_ref: null, family_apparatus_kind: 'switch_disconnector', interchangeable_across_families: false },
        { id: 'app-rek', name: 'Reklozer', device_kind: 'REKLOZER', u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 16, manufacturer_ref: 'ZPUE', family_apparatus_kind: null, interchangeable_across_families: false },
      ]),
    );
    render(<KreatorPolaSn />);
    const katalog = (await screen.findByTestId('mvd-kreator-pole-katalog')) as HTMLSelectElement;
    const opcje = () => [...katalog.querySelectorAll('option')].map((o) => o.value).filter(Boolean);
    await waitFor(() => expect(opcje()).toContain('app-siemens'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rola'), 'TR');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rodzina'), 'fam-1');
    await waitFor(() => expect(opcje()).not.toContain('app-siemens'));
    expect([...opcje()].sort()).toEqual(['app-1', 'app-bezp']);
  });

  it('karta pola pokazuje PEŁNY skład katalogowy, a doposażenia NIE da się tu wskazać', async () => {
    render(<KreatorPolaSn />);
    await pick();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rola'), 'TR');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rodzina'), 'fam-1');
    await waitFor(() => {
      const szablon = screen.getByTestId('mvd-kreator-pole-szablon-wybor') as HTMLSelectElement;
      expect(szablon.querySelector('option[value="tmpl-tr-1"]')).not.toBeNull();
    });
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-pole-szablon-wybor'),
      'tmpl-tr-1',
    );

    const karta = await screen.findByTestId('mvd-kreator-pole-wyposazenie');
    expect(karta).toHaveTextContent('Q1');
    expect(karta).toHaveTextContent('rozłącznik');
    expect(karta).toHaveTextContent('przekładnik prądowy');

    // OPCJA bez dostawcy W TEJ OPERACJI: status widoczny, kontrolki NIE MA.
    expect(screen.queryByTestId('mvd-kreator-pole-wyposazenie-opcja-dev-ct')).toBeNull();
    expect(
      screen.getByTestId('mvd-kreator-pole-wyposazenie-bez-dostawcy-dev-ct'),
    ).toHaveTextContent(/nie ma pola dla tego rodzaju aparatu/i);
  });

  it('rodzina dostarczana blokami RMU jest nazwana wprost (bez blokowania operacji)', async () => {
    render(<KreatorPolaSn />);
    await pick();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rodzina'), 'fam-rmu');

    expect(await screen.findByTestId('mvd-kreator-pole-rodzina-blokowa')).toHaveTextContent(
      /blok fabryczny/i,
    );
    // Werdykt należy do backendu — kreator nie zamyka drogi zapisu.
    expect(screen.getByTestId('mvd-kreator-pole-zapisz')).not.toBeDisabled();
  });
});
