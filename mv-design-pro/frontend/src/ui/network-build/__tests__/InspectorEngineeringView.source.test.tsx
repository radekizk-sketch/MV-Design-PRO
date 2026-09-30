import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';

import { InspectorEngineeringView } from '../InspectorEngineeringView';
import { readinessZListy } from '../../../test/gotowoscTestUtils';

/**
 * CV-4.3 K7 (karta K7-FE): inspektor pokazuje dane scenariusza MIN (Sk3/Ik3/R-X)
 * źródła sieciowego — warunki przyłączenia OSD, obok istniejących pól MAX.
 * Karta FAB-J: patrz komentarz w `InspectorEngineeringView.test.tsx`.
 */
function render(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const openOperationForm = vi.fn();

const snapshot = {
  buses: [
    {
      ref_id: 'bus-sn-1',
      name: 'Szyna SN 1',
      voltage_kv: 15,
    },
  ],
  branches: [],
  branch_points: [],
  transformers: [],
  sources: [
    {
      ref_id: 'src-1',
      name: 'GPZ Testowy',
      bus_ref: 'bus-sn-1',
      model: 'short_circuit_power',
      sk3_mva: 250,
      rx_ratio: 0.1,
      sk3_min_mva: 150,
      ik3_min_ka: 5.2,
      rx_ratio_min: 0.2,
    },
  ],
  substation: [],
  substations: [],
  bays: [],
  generators: [],
  loads: [],
};

let mockSelectedElements: Array<{ id: string; type: string; name: string }> = [];

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: { openOperationForm: typeof openOperationForm }) => unknown) =>
    selector({ openOperationForm }),
}));

vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: { selectedElements: typeof mockSelectedElements }) => unknown) =>
    selector({ selectedElements: mockSelectedElements }),
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({
      snapshot,
      logicalViews: null,
      executeDomainOperation: vi.fn(),
      readiness: readinessZListy([]),
      fixActions: [],
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
  useAppStateStore: (selector: (state: { activeMode: string; activeCaseId: string }) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT', activeCaseId: 'case-1' }),
}));

describe('InspectorEngineeringView - dane scenariusza MIN źródła sieciowego (CV-4.3 K7)', () => {
  beforeEach(() => {
    openOperationForm.mockReset();
    mockSelectedElements = [{ id: 'src-1', type: 'Source', name: 'GPZ Testowy' }];
  });

  it('pokazuje Sk3/Ik3/R-X scenariusza MIN obok wartości MAX', () => {
    render(<InspectorEngineeringView />);

    expect(screen.getByText('Moc zwarciowa Sk3')).toBeInTheDocument();
    expect(screen.getByText('Moc zwarciowa Sk3 (MIN)')).toBeInTheDocument();
    expect(screen.getByText('Prąd zwarciowy Ik3 (MIN)')).toBeInTheDocument();
    expect(screen.getByText('Stosunek R/X (MIN)')).toBeInTheDocument();
    expect(screen.getByTestId('engineering-field-sk3_min_mva')).toHaveTextContent('150');
    expect(screen.getByTestId('engineering-field-ik3_min_ka')).toHaveTextContent('5,2');
    expect(screen.getByTestId('engineering-field-rx_ratio_min')).toHaveTextContent('0,2');
  });

  it('źródło bez danych MIN pokazuje pola jako brak (uczciwy stan pusty, zero fabrykacji)', () => {
    snapshot.sources[0] = {
      ...snapshot.sources[0],
      sk3_min_mva: null as unknown as number,
      ik3_min_ka: null as unknown as number,
      rx_ratio_min: null as unknown as number,
    };

    render(<InspectorEngineeringView />);

    expect(screen.getByText('Moc zwarciowa Sk3 (MIN)')).toBeInTheDocument();
    expect(screen.getByTestId('engineering-field-sk3_min_mva')).toHaveTextContent('nie podano');
    expect(screen.getByTestId('engineering-field-ik3_min_ka')).toHaveTextContent('nie podano');
    expect(screen.getByTestId('engineering-field-rx_ratio_min')).toHaveTextContent('nie podano');
  });
});

/**
 * CV-4.3 K7c: inspektor pokazuje napięcie zadane szyny bilansującej
 * (`Source.u_set_pu`) — ta sama ścieżka rendera co scenariusz MIN powyżej
 * (`buildSectionsForElement`, dispatch bez semantycznej roli GPZ).
 */
describe('InspectorEngineeringView - napięcie zadane szyny bilansującej (CV-4.3 K7c)', () => {
  beforeEach(() => {
    openOperationForm.mockReset();
    mockSelectedElements = [{ id: 'src-1', type: 'Source', name: 'GPZ Testowy' }];
    snapshot.sources[0] = {
      ref_id: 'src-1',
      name: 'GPZ Testowy',
      bus_ref: 'bus-sn-1',
      model: 'short_circuit_power',
      sk3_mva: 250,
      rx_ratio: 0.1,
    } as (typeof snapshot.sources)[number];
  });

  it('źródło z u_set_pu pokazuje wartość (klik natywny nie wymagany, render czyta store)', () => {
    snapshot.sources[0] = { ...snapshot.sources[0], u_set_pu: 1.06 } as (typeof snapshot.sources)[number];
    render(<InspectorEngineeringView />);

    expect(screen.getByText('Napięcie zadane szyny bilansującej')).toBeInTheDocument();
    expect(screen.getByTestId('engineering-field-u_set_pu')).toHaveTextContent('1,06');
  });

  it('źródło bez u_set_pu pokazuje pole jako brak (uczciwy stan pusty, zero fabrykacji)', () => {
    render(<InspectorEngineeringView />);

    expect(screen.getByText('Napięcie zadane szyny bilansującej')).toBeInTheDocument();
    expect(screen.getByTestId('engineering-field-u_set_pu')).toHaveTextContent('nie podano');
  });

  // Iloczyn cech (KLASA NIE INSTANCJA): DWIE ścieżki rendera niosą tę samą
  // sekcję „Parametry sieci" źródła — `buildSectionsForElement` (powyżej,
  // element BEZ roli semantycznej GPZ) i `buildSemanticGpzSections`
  // (`semanticElementKind: 'GPZ'`, ID zawiera `/substation`). Karta K7-FE
  // dopisała MIN do obu miejsc, ale sprawdzała tylko ścieżkę pierwszą — ten
  // test dowodzi DRUGIEJ, żeby regresja jednej z dwóch kopii była wykrywalna.
  it('ścieżka semantyczna GPZ (buildSemanticGpzSections) TEŻ niesie u_set_pu i MIN', () => {
    // `semanticElementKind: 'GPZ'` samo wystarcza do `isSemanticGpzSource` —
    // `id: 'src-1'` dalej trafia `s.ref_id === selectedElement.id` w wyszukaniu
    // źródła wewnątrz `buildSemanticGpzSections`, więc fixtura pozostaje prosta.
    mockSelectedElements = [
      { id: 'src-1', type: 'Source', name: 'GPZ Testowy', semanticElementKind: 'GPZ' } as never,
    ];
    snapshot.sources[0] = {
      ...snapshot.sources[0],
      u_set_pu: 0.97,
      sk3_min_mva: 150,
    } as (typeof snapshot.sources)[number];

    render(<InspectorEngineeringView />);

    expect(screen.getByText('Napięcie zadane szyny bilansującej')).toBeInTheDocument();
    expect(screen.getByTestId('engineering-field-u_set_pu')).toHaveTextContent('0,97');
    expect(screen.getByTestId('engineering-field-sk3_min_mva')).toHaveTextContent('150');
  });
});
