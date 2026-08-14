/**
 * Testy kreatora „Dodaj pole SN" — realna ścieżka użytkownika, Zero-Debt §5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorPolaSn } from '../KreatorPolaSn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
const resolved: { station: string | null; bus: string | null } = { station: 'st-1', bus: 'bus-1' };
const snapshotState = {
  error: null as string | null,
  snapshot: {},
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

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchMvApparatusTypes: () =>
    Promise.resolve([
      { id: 'app-1', name: 'Wyłącznik SN', device_kind: 'BREAKER', u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 20 },
    ]),
  /**
   * Rodziny w kształcie ODPOWIEDZI BACKENDU (`GET /api/catalog/switchgear-families`):
   * z klasami znamionowymi, technologią i WYLICZANYM `tor_konfiguracji`.
   * Poprzednia fikstura miała trzy pola, więc ekran nie mógł nawet pokazać, czym
   * wybrana rodzina jest — a właśnie to rozstrzyga o sposobie budowy rozdzielnicy.
   */
  fetchSwitchgearFamilies: () =>
    Promise.resolve([
      {
        switchgear_family_ref: 'fam-1',
        family_name: 'Rotoblok SVS',
        manufacturer_ref: 'ZPUE',
        series_name: null,
        voltage_levels: [15, 20],
        rated_current_options: [630],
        short_time_current_options: [16],
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
        voltage_levels: [15],
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
  fetchCompleteBayTemplates: (manufacturerRef?: string | null, bayKind?: string | null) =>
    fetchBayTemplatesMock(manufacturerRef, bayKind),
}));

async function pick() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-pole-katalog')).toBeInTheDocument();
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
    fetchBayTemplatesMock.mockResolvedValue([]);
  });

  afterEach(() => cleanup());

  it('dodaje pole SN z rolą, aparatem i katalogiem (operacja domenowa)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPolaSn />);
    await pick();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rola'), 'TR');

    await userEvent.click(screen.getByTestId('mvd-kreator-pole-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_sn_bay',
        expect.objectContaining({
          bus_ref: 'bus-1',
          station_ref: 'st-1',
          bay_role: 'TR',
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

  it('uczciwy stan zerowy: bez szyny/stacji zapis zablokowany', async () => {
    resolved.station = null;
    resolved.bus = null;
    render(<KreatorPolaSn />);
    // Montaż pobiera katalogi (aparaty + rodziny rozdzielnic) — czekamy na
    // realny stan końcowy UI (opcja aparatu w selekcie katalogu), żeby
    // aktualizacje stanu domknęły się w act.
    await screen.findByRole('option', { name: /Wyłącznik SN/ });
    expect(screen.getByTestId('mvd-kreator-pole-brak')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-pole-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorPolaSn />);
    await pick();
    expect(screen.getByTestId('mvd-kreator-pole-zapisz')).toBeDisabled();
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
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rodzina'), 'fam-1');

    const naglowek = await screen.findByTestId('mvd-kreator-pole-naglowek-rodziny');
    expect(naglowek).toHaveTextContent('15 / 20 kV');
    expect(naglowek).toHaveTextContent('630 A');
    expect(naglowek).toHaveTextContent('16 kA');
    expect(naglowek).toHaveTextContent('powietrzna');
    expect(naglowek).toHaveTextContent(/modułowy/i);
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
