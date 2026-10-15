/**
 * Inspektor — tożsamość kabla nN (karta OBIEKT-KABEL-NN, znaleziska scenariusza 630 kVA).
 *
 * Dawniej kabel nN był „Odcinkiem kablowym SN" z akcjami ciągu SN („Wstaw stację na
 * odcinku", „Kontynuuj ciąg SN"), a „Zmień typ katalogowy" otwierał katalog KABLI SN (bez
 * jednej pozycji nN). Iloczyn cech: rodzaj odcinka (kabel nN / kabel SN / linia SN) ×
 * miejsce klasyfikacji w inspektorze (ramka odcinka, karta techniczna z akcjami, wybór typu
 * z katalogu i jego zapis, sekcja obliczeń). Klik natywny (`userEvent`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';

import { InspectorEngineeringView } from '../InspectorEngineeringView';
import { readinessZListy } from '../../../test/gotowoscTestUtils';

function render(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const openOperationForm = vi.fn();
const openRouteSurface = vi.fn();
const executeDomainOperation = vi.fn(() => Promise.resolve({ error: null }));

const snapshot = {
  buses: [
    { ref_id: 'sn-a', name: 'Szyna SN A', voltage_kv: 15 },
    { ref_id: 'sn-b', name: 'Szyna SN B', voltage_kv: 15 },
    { ref_id: 'nn-rg', name: 'Szyna nN RG', voltage_kv: 0.4 },
    { ref_id: 'nn-zk', name: 'Szyna ZK-1', voltage_kv: 0.4 },
  ],
  branches: [
    {
      id: 'kab-nn-1', ref_id: 'kab-nn-1', name: 'Kabel nN 1', type: 'cable', status: 'closed',
      from_bus_ref: 'nn-rg', to_bus_ref: 'nn-zk', length_km: 0.15, r_ohm_per_km: 0.253,
      x_ohm_per_km: 0.08, catalog_ref: 'kab_nn_4x120_al', catalog_namespace: undefined,
    },
    {
      id: 'kab-sn-1', ref_id: 'kab-sn-1', name: 'Kabel SN 1', type: 'cable', status: 'closed',
      from_bus_ref: 'sn-a', to_bus_ref: 'sn-b', length_km: 0.4, r_ohm_per_km: 0.253,
      x_ohm_per_km: 0.11, catalog_ref: 'cable-tfk-yakxs-3x120', catalog_namespace: 'KABEL_SN',
    },
    {
      id: 'lin-sn-1', ref_id: 'lin-sn-1', name: 'Linia SN 1', type: 'line_overhead', status: 'closed',
      from_bus_ref: 'sn-a', to_bus_ref: 'sn-b', length_km: 1.2, r_ohm_per_km: 0.3,
      x_ohm_per_km: 0.35, catalog_ref: null, catalog_namespace: 'LINIA_SN',
    },
  ],
  branch_points: [],
  transformers: [],
  sources: [],
  substations: [],
  bays: [],
  generators: [],
  loads: [],
};

let mockSelectedElements: Array<{ id: string; type: string; name: string }> = [];

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: unknown) => unknown) =>
    selector({ openOperationForm, openRouteSurface }),
}));

vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedElements: mockSelectedElements, clearSelection: vi.fn() }),
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({
      snapshot,
      logicalViews: null,
      executeDomainOperation,
      readiness: readinessZListy([]),
      fixActions: [],
      rewizjaBiezacegoModelu: 1,
    }),
}));

vi.mock('../../field/useFieldReadModel', () => ({
  useFieldReadModel: () => ({
    data: { fields: [] },
    itemsByBayRef: new Map(),
    itemsByBayId: new Map(),
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: unknown) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT', activeCaseId: 'case-1', activeRunId: null }),
}));

// Wybór typu: atrapa pickera ujawnia kategorię katalogu i pozwala wybrać pozycję —
// realny picker pobiera katalog z backendu (tu nieistotne; badamy, KTÓRY katalog).
vi.mock('../../catalog/TypePicker', () => ({
  TypePicker: (props: { isOpen: boolean; category: string; onSelectType: (id: string) => void }) =>
    props.isOpen ? (
      <div data-testid="type-picker" data-category={props.category}>
        <button type="button" onClick={() => props.onSelectType('kab_nn_4x150_al')}>
          wybierz pozycję
        </button>
      </div>
    ) : null,
}));

const fetchSpy = vi.fn((url: string) =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve(
        url.includes('/nn-cable')
          ? { status: 'nie dotyczy', cable_ref: 'kab-nn-1', reason_pl: 'brak stacji zasilającej w próbce' }
          : {},
      ),
  } as Response),
);

beforeEach(() => {
  openOperationForm.mockReset();
  executeDomainOperation.mockClear();
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
});

function zaznacz(id: string, name: string) {
  mockSelectedElements = [{ id, type: 'LineBranch', name }];
}

const AKCJE_SN = ['Wstaw stację na odcinku', 'Kontynuuj ciąg SN', 'Wstaw ZKSN', 'Wstaw łącznik sekcyjny'];

describe('InspectorEngineeringView — tożsamość kabla nN × miejsce klasyfikacji', () => {
  it('kabel nN: ramka „Kabel nN", karta techniczna nN bez akcji ciągu SN, sekcja obliczeń', async () => {
    zaznacz('kab-nn-1', 'Kabel nN 1');
    render(<InspectorEngineeringView />);
    expect(screen.getByTestId('sld-segment-inspector-title')).toHaveTextContent('Kabel nN');
    expect(screen.getByTestId('sld-segment-inspector-catalog-family')).toHaveTextContent('KABEL_NN');
    const karta = screen.getByTestId('tech-card-host');
    expect(karta).toHaveAttribute('data-tech-card-subject-kind', 'kabel_nn');
    expect(within(karta).getAllByText('Kabel nN').length).toBeGreaterThan(0);
    for (const akcja of AKCJE_SN) expect(screen.queryByText(akcja)).toBeNull();
    expect(screen.queryByText(/Kabel SN|Odcinek kablowy SN/)).toBeNull();
    // Sekcja obliczeń obiektu woła obiekt kabla nN w backendzie (odnośnik parametrem zapytania).
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/cases/case-1/enm/nn-cable?cable_ref=kab-nn-1',
        expect.anything(),
      ),
    );
    await waitFor(() => expect(screen.getByTestId('mvd-kabel-nn-odmowa')).toBeInTheDocument());
  });

  it('kabel nN: „Zmień typ katalogowy" otwiera katalog KABLI nN i zapisuje wiązanie KABEL_NN', async () => {
    zaznacz('kab-nn-1', 'Kabel nN 1');
    render(<InspectorEngineeringView />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('sld-segment-open-catalog-picker'));
    expect(screen.getByTestId('type-picker')).toHaveAttribute('data-category', 'LV_CABLE');
    await user.click(screen.getByText('wybierz pozycję'));
    expect(executeDomainOperation).toHaveBeenCalledWith('case-1', 'assign_catalog_to_element', {
      element_ref: 'kab-nn-1',
      catalog_binding: expect.objectContaining({
        catalog_namespace: 'KABEL_NN',
        catalog_item_id: 'kab_nn_4x150_al',
      }),
      source_mode: 'KATALOG',
    });
  });

  it('kabel nN: akcja karty „Przedłuż obwód kablem nN od końca" startuje z szyny końca kabla', async () => {
    zaznacz('kab-nn-1', 'Kabel nN 1');
    render(<InspectorEngineeringView />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Przedłuż obwód kablem nN od końca'));
    expect(openOperationForm).toHaveBeenCalledWith(
      'add_nn_cable_segment',
      expect.objectContaining({ bus_nn_ref: 'nn-zk' }),
    );
  });

  it('kabel SN: ramka „Kabel SN", katalog kabli SN, akcje ciągu SN, bez sekcji obliczeń nN', () => {
    zaznacz('kab-sn-1', 'Kabel SN 1');
    render(<InspectorEngineeringView />);
    expect(screen.getByTestId('sld-segment-inspector-title')).toHaveTextContent('Kabel SN');
    expect(screen.getByTestId('sld-segment-inspector-catalog-family')).toHaveTextContent('KABEL_SN');
    expect(screen.getByTestId('tech-card-host')).toHaveAttribute('data-tech-card-subject-kind', 'line_segment');
    expect(screen.getByText('Kontynuuj ciąg SN')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-kabel-nn')).toBeNull();
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/nn-cable'))).toBe(false);
  });

  it('linia SN: ramka „Linia napowietrzna SN", katalog linii', async () => {
    zaznacz('lin-sn-1', 'Linia SN 1');
    render(<InspectorEngineeringView />);
    expect(screen.getByTestId('sld-segment-inspector-title')).toHaveTextContent('Linia napowietrzna SN');
    const user = userEvent.setup();
    await user.click(screen.getByTestId('sld-segment-open-catalog-picker'));
    expect(screen.getByTestId('type-picker')).toHaveAttribute('data-category', 'LINE');
  });
});
