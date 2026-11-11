import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { InspectorEngineeringView } from '../InspectorEngineeringView';
import { readinessZListy } from '../../../test/gotowoscTestUtils';

/** Karta FAB-J: patrz komentarz w `InspectorEngineeringView.test.tsx`. */
function render(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const openOperationForm = vi.fn();
const openRouteSurface = vi.fn();
const executeDomainOperation = vi.fn();

const fakeFieldItems = Array.from({ length: 5 }, (_, index) => ({
  bay_id: `template-bay-${index + 1}`,
  bay_ref: `template-bay-${index + 1}`,
  bay_name: `Pole szablonu ${index + 1}`,
  canonical_model: {
    base_model: {
      substation_ref: 'st-no-bays',
      gpz_section_id: null,
    },
  },
}));

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: unknown) => unknown) =>
    selector({ openOperationForm, openRouteSurface }),
}));

const selekcja = vi.hoisted(() => ({
  useSelectionStore: (selector: (state: unknown) => unknown) =>
    selector({
      selectedElements: [{ id: 'st-no-bays', type: 'Station', name: 'Stacja testowa' }],
    }),
}));
// Inspektor czyta selekcję przez indeks pakietu, panel z kanwy (karta techniczna) — wprost
// ze sklepu; obie ścieżki widzą TĘ SAMĄ selekcję.
vi.mock('../../selection', () => selekcja);
vi.mock('../../selection/store', () => selekcja);

// JEDNA prawda gotowosci (KD-1 / V12K-286): inspektor czyta problemy przez
// `gotowoscAdapter` z `useSnapshotStore.readiness`, wiec scena zasila TO pole
// (dawna atrapa `readinessLiveStore` byla osobnym, nigdy nieodswiezanym zrodlem).
vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({
      snapshot: {
        buses: [
          { ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15 },
          { ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 },
        ],
        branches: [],
        transformers: [],
        sources: [],
        loads: [
          { ref_id: 'load-1', name: 'Odbiór nN 1', bus_ref: 'bus-nn', p_mw: 0.03, q_mvar: 0, model: 'pq' },
          { ref_id: 'load-2', name: 'Odbiór nN 2', bus_ref: 'bus-nn', p_mw: 0.05, q_mvar: 0, model: 'pq' },
        ],
        generators: [
          {
            ref_id: 'pv-1',
            name: 'Blok PV 1',
            bus_ref: 'bus-nn',
            p_mw: 0.4,
            q_mvar: 0,
            gen_type: 'pv_inverter',
            station_ref: 'st-no-bays',
            catalog_ref: 'pv-inverter-400kw',
          },
          {
            ref_id: 'bess-1',
            name: 'Magazyn energii 1',
            bus_ref: 'bus-nn',
            p_mw: 0.2,
            q_mvar: 0,
            gen_type: 'bess',
            station_ref: 'st-no-bays',
            catalog_ref: 'bess-200kw',
          },
        ],
        substations: [
          {
            id: 'st-no-bays',
            ref_id: 'st-no-bays',
            name: 'Stacja testowa',
            station_type: 'mv_lv',
            bus_refs: ['bus-sn', 'bus-nn'],
            transformer_refs: [],
            meta: {},
          },
        ],
        // Karta W5-B: pola stacji = rekordy `bays` — pięć pól SN (szyna 15 kV) i dwa odpływy
        // nN (szyna 0,4 kV); liczność rozdzielni SN liczy wyłącznie pola SN.
        bays: [
          ...['in', 'out', 'odg', 'tr', 'pom'].map((rola, i) => ({
            id: `sn-${rola}`, ref_id: `sn-${rola}`, name: `Pole SN ${i + 1}`, tags: [], meta: {},
            bay_role: (['IN', 'OUT', 'FEEDER', 'TR', 'MEASUREMENT'] as const)[i], substation_ref: 'st-no-bays',
            bus_ref: 'bus-sn', equipment_refs: [],
          })),
          { id: 'feeder-1', ref_id: 'feeder-1', name: 'Odpływ nN', tags: [], meta: {}, bay_role: 'FEEDER', substation_ref: 'st-no-bays', bus_ref: 'bus-nn', equipment_refs: [] },
          { id: 'feeder-2', ref_id: 'feeder-2', name: 'Odpływ nN', tags: [], meta: {}, bay_role: 'FEEDER', substation_ref: 'st-no-bays', bus_ref: 'bus-nn', equipment_refs: [] },
        ],
      },
      logicalViews: null,
      executeDomainOperation,
      readiness: readinessZListy([]),
      fixActions: [],
    }),
}));


vi.mock('../../field/useFieldReadModel', () => ({
  useFieldReadModel: () => ({
    data: { fields: fakeFieldItems },
    itemsByBayRef: new Map(fakeFieldItems.map((item) => [item.bay_ref, item])),
    itemsByBayId: new Map(),
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: unknown) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT', activeCaseId: 'case-1' }),
}));

describe('InspectorEngineeringView - struktura stacji', () => {
  beforeEach(() => {
    openOperationForm.mockReset();
    openRouteSurface.mockReset();
    executeDomainOperation.mockReset();
  });

  // K6 (Z-12): dane stacji pokazuje WYŁĄCZNIE karta techniczna panelu z kanwy; intencja dawnego
  // testu sekcji „Struktura" zachowana — rozdzielnica SN z rekordów `bays` stacji (pięć pól SN
  // na szynie 15 kV), odpływy nN osobno (dwa pola na szynie 0,4 kV), odbiory i źródła nN.
  it('opisuje rozdzielnicę SN polami SN z rekordów `bays` stacji (odpływy nN osobno)', async () => {
    render(<InspectorEngineeringView />);

    const karta = await screen.findByTestId('inspektor-karta');
    expect(karta).toHaveAttribute('data-rodzaj-karty', 'stacja');
    expect(screen.getByTestId('inspektor-element-etykieta')).toHaveTextContent('Stacja testowa');
    expect(screen.getAllByTestId('inspektor-karta-wiersz-pola_sn')).toHaveLength(5);
    expect(screen.getByTestId('inspektor-karta-lista-nn_odplywy').querySelectorAll('li')).toHaveLength(2);
    const odbiory = screen.getByTestId('inspektor-karta-lista-nn_odbiory');
    expect(odbiory.querySelectorAll('li')).toHaveLength(2);
    expect(odbiory).toHaveTextContent('Odbiór nN 1');
    const zrodla = screen.getByTestId('inspektor-karta-lista-nn_zrodla');
    expect(zrodla.querySelectorAll('li')).toHaveLength(2);
    expect(zrodla).toHaveTextContent('Blok PV 1');
    expect(zrodla).toHaveTextContent('Magazyn energii 1');
    // Bez drugiej ścieżki tych samych danych: dawne sekcje widoku nie wracają.
    expect(screen.queryByTestId('engineering-field-bay_count')).toBeNull();
    expect(screen.queryByTestId('tech-card-host')).toBeNull();
    // Działania na SAMYM końcu inspektora (po wyniku i dowodzie obliczeń), zwinięte, w jednym
    // bloku — bez drugiej, rozwiniętej listy „Operacje" pod nim.
    const opakowanie = screen.getByTestId('sld-engineering-inspector-wrapper');
    const dzialania = screen.getByTestId('inspektor-dzialania-zwiniete') as HTMLDetailsElement;
    expect(dzialania.open).toBe(false);
    const sekcje = Array.from(opakowanie.querySelectorAll('[data-testid]')).filter(
      (el) => !dzialania.contains(el) && el !== dzialania && !el.contains(dzialania),
    );
    for (const el of sekcje) {
      expect(el.compareDocumentPosition(dzialania) & Node.DOCUMENT_POSITION_FOLLOWING, el.getAttribute('data-testid') ?? '').toBeTruthy();
    }
    expect(screen.getByTestId('element-calculation-proof-panel').compareDocumentPosition(dzialania) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Operacje' })).toBeNull();
  });
});
