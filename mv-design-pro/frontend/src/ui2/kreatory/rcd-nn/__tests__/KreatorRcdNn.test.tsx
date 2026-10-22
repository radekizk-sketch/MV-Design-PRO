/**
 * Testy kreatora „Wyłącznik różnicowoprądowy nN" (add_nn_rcd) — realna ścieżka (natywny
 * klik `userEvent`, Zero-Debt §5) na REALNYCH resolverach migawki (`enmResolvers`), bez
 * podmiany logiki wyboru odbioru.
 *
 * Iloczyn cech (KLASA, NIE INSTANCJA):
 *  - źródło odbioru: kontekst `load_ref` (menu odbioru) × kontekst szyny nN z jednym odbiorem
 *    × kontekst szyny z kilkoma odbiorami (bez domysłu) × wybór z listy (brak kontekstu);
 *  - typ RCD: ogólny (bez czasu niezadziałania) × selektywny S (z czasem niezadziałania);
 *  - nazwa: pominięta (payload BEZ klucza `name`) × nadana (payload z `name`);
 *  - stany brzegowe: brak odbiorów nN w migawce × błąd katalogu × pusty katalog ×
 *    odpowiedź z `error` × brak odpowiedzi (błąd magazynu) × odbiór z istniejącym RCD ×
 *    odbiór na szynie SN (poza listą — backend i tak odmówiłby kodem `nn.rcd_not_nn_band`).
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorRcdNn } from '../KreatorRcdNn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();
const fetchLvRcdTypesMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = {};

function migawka(opcje: { bezOdbiorowNn?: boolean; zRcd?: boolean } = {}) {
  return {
    buses: [
      { id: 'bus-nn-1', ref_id: 'bus-nn-1', name: 'Szyna nN I', voltage_kv: 0.4 },
      { id: 'bus-nn-2', ref_id: 'bus-nn-2', name: 'Szyna nN II', voltage_kv: 0.4 },
      { id: 'bus-sn-1', ref_id: 'bus-sn-1', name: 'Szyna SN', voltage_kv: 15 },
    ],
    loads: opcje.bezOdbiorowNn
      ? [{ id: 'load-sn', ref_id: 'load-sn', name: 'Odbiór SN', bus_ref: 'bus-sn-1' }]
      : [
          { id: 'load-a', ref_id: 'load-a', name: 'Budynek A', bus_ref: 'bus-nn-1' },
          { id: 'load-b1', ref_id: 'load-b1', name: 'Hala B1', bus_ref: 'bus-nn-2' },
          { id: 'load-b2', ref_id: 'load-b2', name: 'Hala B2', bus_ref: 'bus-nn-2' },
          { id: 'load-sn', ref_id: 'load-sn', name: 'Odbiór SN', bus_ref: 'bus-sn-1' },
        ],
    branches: opcje.zRcd
      ? [
          {
            id: 'rcd-1',
            ref_id: 'rcd-1',
            name: 'RCD istniejący',
            type: 'switch',
            from_bus_ref: 'bus-nn-1',
            to_bus_ref: 'bus-nn-1t',
            meta: { device_role: 'RCD', load_ref: 'load-a' },
          },
        ]
      : [],
    substations: [],
  };
}

const snapshotState = {
  error: null as string | null,
  snapshot: migawka() as unknown,
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
  useActiveOperationForm: () => ({ op: 'add_nn_rcd', context }),
}));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectElement: typeof selectElementMock; centerSldOnElement: typeof centerSldOnElementMock }) => unknown) =>
    selector({ selectElement: selectElementMock, centerSldOnElement: centerSldOnElementMock }),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  fetchLvRcdTypes: () => fetchLvRcdTypesMock(),
  getCatalogErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Błąd katalogu'),
}));

// Rekordy przepisane z GET /api/catalog/lv-rcd-types (LVRcdType.to_dict()).
const RCD_OGOLNY = {
  id: 'rcd_nn_a_40a_30ma',
  name: 'RCCB A 40 A / 30 mA',
  in_a: 40,
  i_delta_n_a: 0.03,
  rcd_type: 'A',
  selective: false,
  t_a_s: 0.3,
  t_a_2idn_s: 0.15,
  t_a_5idn_s: 0.04,
  t_nieczuly_min_s: null,
  u_n_kv: 0.4,
  poles: null,
  manufacturer: null,
  verification_status: 'REFERENCYJNY',
  source_reference: 'IEC 61008-1 Tabela 1 (kl. 9.9.2)',
  catalog_status: 'REFERENCYJNY_V1',
  contract_version: '2.0',
};
const RCD_SELEKTYWNY = {
  ...RCD_OGOLNY,
  id: 'rcd_nn_ac_s_63a_500ma',
  name: 'RCCB AC S 63 A / 500 mA',
  in_a: 63,
  i_delta_n_a: 0.5,
  rcd_type: 'AC',
  selective: true,
  t_a_s: 0.5,
  t_a_2idn_s: 0.2,
  t_a_5idn_s: 0.15,
  t_nieczuly_min_s: 0.13,
};

async function poZaladowaniuKatalogu() {
  await waitFor(() => expect(screen.getByTestId('mvd-kreator-rcd-nn-katalog')).not.toBeDisabled());
}

describe('KreatorRcdNn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = {};
    snapshotState.error = null;
    snapshotState.snapshot = migawka();
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
    fetchLvRcdTypesMock.mockReset();
    fetchLvRcdTypesMock.mockResolvedValue([RCD_OGOLNY, RCD_SELEKTYWNY]);
  });

  afterEach(() => cleanup());

  it('odbiór z kontekstu (load_ref) × typ ogólny × bez nazwy: payload DOKŁADNIE {load_ref, catalog_ref}', async () => {
    context = { load_ref: 'load-a' };
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'rcd-x', element_type: 'branch' } });
    render(<KreatorRcdNn />);

    await poZaladowaniuKatalogu();
    expect(screen.getByTestId('mvd-kreator-rcd-nn-odbior')).toHaveValue('load-a');
    expect(screen.getByTestId('mvd-kreator-rcd-nn-zapisz')).toBeDisabled();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-rcd-nn-katalog'), 'rcd_nn_a_40a_30ma');
    await userEvent.click(screen.getByTestId('mvd-kreator-rcd-nn-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    // toStrictEqual: klucz `name` z wartością undefined też jest rozjazdem kontraktu payloadu.
    expect(executeDomainOperationMock.mock.calls[0].slice(0, 2)).toEqual(['case-1', 'add_nn_rcd']);
    expect(executeDomainOperationMock.mock.calls[0][2]).toStrictEqual({
      load_ref: 'load-a',
      catalog_ref: 'rcd_nn_a_40a_30ma',
    });
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('brak kontekstu × wybór odbioru z listy × typ selektywny × nazwa: payload {load_ref, catalog_ref, name}', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: null });
    render(<KreatorRcdNn />);

    await poZaladowaniuKatalogu();
    expect(screen.getByTestId('mvd-kreator-rcd-nn-odbior')).toHaveValue('');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-rcd-nn-odbior'), 'load-b2');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-rcd-nn-katalog'), 'rcd_nn_ac_s_63a_500ma');
    await userEvent.type(screen.getByTestId('mvd-kreator-rcd-nn-nazwa'), '  RCD hali B2  ');
    await userEvent.click(screen.getByTestId('mvd-kreator-rcd-nn-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    expect(executeDomainOperationMock.mock.calls[0].slice(0, 2)).toEqual(['case-1', 'add_nn_rcd']);
    expect(executeDomainOperationMock.mock.calls[0][2]).toStrictEqual({
      load_ref: 'load-b2',
      catalog_ref: 'rcd_nn_ac_s_63a_500ma',
      name: 'RCD hali B2',
    });
  });

  it('lista odbiorów: tylko odbiory na szynach nN (odbiór SN poza listą), deterministyczna kolejność po nazwie', async () => {
    render(<KreatorRcdNn />);
    await poZaladowaniuKatalogu();
    const opcje = within(screen.getByTestId('mvd-kreator-rcd-nn-odbior'))
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(opcje).toEqual(['', 'load-a', 'load-b1', 'load-b2']);
  });

  it('kontekst szyny nN z JEDNYM odbiorem rozstrzyga odbiór; szyna z DWOMA odbiorami — bez domysłu', async () => {
    context = { bus_nn_ref: 'bus-nn-1' };
    const { unmount } = render(<KreatorRcdNn />);
    await poZaladowaniuKatalogu();
    expect(screen.getByTestId('mvd-kreator-rcd-nn-odbior')).toHaveValue('load-a');
    unmount();

    context = { element_ref: 'bus-nn-2' };
    render(<KreatorRcdNn />);
    await poZaladowaniuKatalogu();
    expect(screen.getByTestId('mvd-kreator-rcd-nn-odbior')).toHaveValue('');
  });

  it('etykieta pozycji katalogu: nazwa · I_Δn w mA · typ · In; parametry typu ogólnego bez czasu niezadziałania', async () => {
    render(<KreatorRcdNn />);
    await poZaladowaniuKatalogu();
    const etykiety = within(screen.getByTestId('mvd-kreator-rcd-nn-katalog'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(etykiety).toContain('RCCB A 40 A / 30 mA · 30 mA · typ A · In 40 A');
    expect(etykiety).toContain('RCCB AC S 63 A / 500 mA · 500 mA · typ AC S · In 63 A');

    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-rcd-nn-katalog'), 'rcd_nn_a_40a_30ma');
    expect(screen.getByTestId('mvd-kreator-rcd-nn-param-idn')).toHaveTextContent('0,030 A (30 mA)');
    expect(screen.getByTestId('mvd-kreator-rcd-nn-param-rodzaj')).toHaveTextContent('A');
    expect(screen.getByTestId('mvd-kreator-rcd-nn-param-selektywny')).toHaveTextContent('nie');
    expect(screen.getByTestId('mvd-kreator-rcd-nn-param-ta1')).toHaveTextContent('0,30 s');
    expect(screen.getByTestId('mvd-kreator-rcd-nn-param-ta2')).toHaveTextContent('0,15 s');
    expect(screen.getByTestId('mvd-kreator-rcd-nn-param-ta5')).toHaveTextContent('0,04 s');
    expect(screen.getByTestId('mvd-kreator-rcd-nn-param-in')).toHaveTextContent('40 A');
    expect(screen.getByTestId('mvd-kreator-rcd-nn-param-un')).toHaveTextContent('0,40 kV');
    expect(screen.getByTestId('mvd-kreator-rcd-nn-param-zrodlo')).toHaveTextContent('Referencyjny');
    expect(screen.queryByTestId('mvd-kreator-rcd-nn-param-tnz')).toBeNull();
  });

  it('typ selektywny S: pokazuje minimalny czas niezadziałania z rekordu', async () => {
    render(<KreatorRcdNn />);
    await poZaladowaniuKatalogu();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-rcd-nn-katalog'), 'rcd_nn_ac_s_63a_500ma');
    expect(screen.getByTestId('mvd-kreator-rcd-nn-param-selektywny')).toHaveTextContent('tak');
    expect(screen.getByTestId('mvd-kreator-rcd-nn-param-tnz')).toHaveTextContent('0,13 s');
  });

  it('brak odbiorów nN w migawce: uczciwy stan zerowy, zapis zablokowany', async () => {
    snapshotState.snapshot = migawka({ bezOdbiorowNn: true });
    render(<KreatorRcdNn />);
    await poZaladowaniuKatalogu();
    expect(screen.getByTestId('mvd-kreator-rcd-nn-brak-odbiorow')).toHaveTextContent('Brak odbiorów nN w modelu');
    expect(screen.queryByTestId('mvd-kreator-rcd-nn-odbior')).toBeNull();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-rcd-nn-katalog'), 'rcd_nn_a_40a_30ma');
    expect(screen.getByTestId('mvd-kreator-rcd-nn-zapisz')).toBeDisabled();
  });

  it('błąd katalogu: komunikat błędu, brak pozycji, zapis zablokowany', async () => {
    context = { load_ref: 'load-a' };
    fetchLvRcdTypesMock.mockRejectedValue(new Error('Katalog RCD niedostępny'));
    render(<KreatorRcdNn />);
    expect(await screen.findByText('Katalog RCD niedostępny')).toBeInTheDocument();
    expect(within(screen.getByTestId('mvd-kreator-rcd-nn-katalog')).getAllByRole('option')).toHaveLength(1);
    expect(screen.getByTestId('mvd-kreator-rcd-nn-zapisz')).toBeDisabled();
  });

  it('pusty katalog: stan gotowy z komunikatem (nie wieczne „Ładowanie”)', async () => {
    fetchLvRcdTypesMock.mockResolvedValue([]);
    render(<KreatorRcdNn />);
    await poZaladowaniuKatalogu();
    expect(screen.getByTestId('mvd-kreator-rcd-nn-katalog-pusty')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-rcd-nn-katalog')).not.toHaveTextContent('Ładowanie');
  });

  it('odpowiedź z error: komunikat backendu, kreator NIE zamyka się', async () => {
    context = { load_ref: 'load-a' };
    executeDomainOperationMock.mockResolvedValue({ error: 'Wskazany odbiór nN nie istnieje w modelu sieci.' });
    render(<KreatorRcdNn />);
    await poZaladowaniuKatalogu();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-rcd-nn-katalog'), 'rcd_nn_a_40a_30ma');
    await userEvent.click(screen.getByTestId('mvd-kreator-rcd-nn-zapisz'));
    expect(await screen.findByText('Wskazany odbiór nN nie istnieje w modelu sieci.')).toBeInTheDocument();
    expect(closeFormMock).not.toHaveBeenCalled();
  });

  it('brak odpowiedzi: komunikat błędu magazynu migawki, kreator NIE zamyka się', async () => {
    context = { load_ref: 'load-a' };
    executeDomainOperationMock.mockImplementation(async () => {
      snapshotState.error = 'Błąd zapisu operacji (HTTP 422).';
      return null;
    });
    render(<KreatorRcdNn />);
    await poZaladowaniuKatalogu();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-rcd-nn-katalog'), 'rcd_nn_a_40a_30ma');
    await userEvent.click(screen.getByTestId('mvd-kreator-rcd-nn-zapisz'));
    expect(await screen.findByText('Błąd zapisu operacji (HTTP 422).')).toBeInTheDocument();
    expect(closeFormMock).not.toHaveBeenCalled();
  });

  it('odbiór z istniejącym RCD: etykieta i informacja o kolejnym aparacie w torze', async () => {
    snapshotState.snapshot = migawka({ zRcd: true });
    context = { load_ref: 'load-a' };
    render(<KreatorRcdNn />);
    await poZaladowaniuKatalogu();
    expect(screen.getByTestId('mvd-kreator-rcd-nn-ma-rcd')).toHaveTextContent('RCD istniejący');
    const etykieta = within(screen.getByTestId('mvd-kreator-rcd-nn-odbior'))
      .getAllByRole('option')
      .find((o) => (o as HTMLOptionElement).value === 'load-a')?.textContent;
    expect(etykieta).toContain('ma już wyłącznik różnicowoprądowy: RCD istniejący');
  });

  it('brak aktywnego przypadku: zapis zablokowany', async () => {
    appState.activeCaseId = null;
    context = { load_ref: 'load-a' };
    render(<KreatorRcdNn />);
    await poZaladowaniuKatalogu();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-rcd-nn-katalog'), 'rcd_nn_a_40a_30ma');
    expect(screen.getByTestId('mvd-kreator-rcd-nn-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
