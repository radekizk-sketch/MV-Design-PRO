import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';

import { InspectorEngineeringView } from '../InspectorEngineeringView';
import { readinessZListy } from '../../../test/gotowoscTestUtils';
import { BRAK_DANYCH_PL } from '../../sld/shared/kartaTechnicznaElementu';

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

// Inspektor czyta selekcję przez indeks pakietu, panel z kanwy (karta techniczna, kontekst
// aparatu) — wprost ze sklepu; obie ścieżki widzą TĘ SAMĄ selekcję.
vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: { selectedElements: typeof mockSelectedElements }) => unknown) =>
    selector({ selectedElements: mockSelectedElements }),
}));

vi.mock('../../selection/store', () => ({
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

  // Inspektor pokazuje dane źródła WYŁĄCZNIE kartą techniczną panelu z kanwy (K6 —
  // `kartaTechnicznaElementu.ts`, `kartaSieci`); dawne sekcje widoku (`engineering-field-*`)
  // nie renderują się, gdy obiekt ma kartę. Test do karty K6 sprawdzał je tylko dlatego, że
  // panel czytał selekcję z niezamockowanego sklepu (dwie ścieżki selekcji w teście).
  it('pokazuje Sk3/Ik3/R-X scenariusza MIN obok wartości MAX', () => {
    render(<InspectorEngineeringView />);

    expect(screen.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'siec_zasilajaca');
    expect(screen.getByTestId('inspektor-karta-wartosc-sk_max')).toHaveTextContent('250 MVA');
    expect(screen.getByTestId('inspektor-karta-wartosc-sk_min')).toHaveTextContent('150 MVA');
    expect(screen.getByTestId('inspektor-karta-wartosc-ik_min')).toHaveTextContent('5,2 kA');
    expect(screen.getByTestId('inspektor-karta-wartosc-rx_min')).toHaveTextContent('0,2');
    expect(screen.queryByTestId('engineering-field-sk3_min_mva')).not.toBeInTheDocument();
  });

  it('źródło bez danych MIN pokazuje pola jako brak (uczciwy stan pusty, zero fabrykacji)', () => {
    snapshot.sources[0] = {
      ...snapshot.sources[0],
      sk3_min_mva: null as unknown as number,
      ik3_min_ka: null as unknown as number,
      rx_ratio_min: null as unknown as number,
    };

    render(<InspectorEngineeringView />);

    for (const klucz of ['sk_min', 'ik_min', 'rx_min']) {
      expect(screen.getByTestId(`inspektor-karta-pole-${klucz}`)).toHaveAttribute('data-brak', 'true');
      expect(screen.getByTestId(`inspektor-karta-wartosc-${klucz}`)).toHaveTextContent(BRAK_DANYCH_PL);
    }
  });
});

/**
 * CV-4.3 K7c: inspektor pokazuje napięcie zadane szyny bilansującej
 * (`Source.u_set_pu`) w karcie technicznej sieci zasilającej (sekcja „Rozpływ mocy").
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
    expect(screen.getByTestId('inspektor-karta-wartosc-u_set')).toHaveTextContent('1,06 p.u.');
  });

  it('źródło bez u_set_pu pokazuje pole jako brak (uczciwy stan pusty, zero fabrykacji)', () => {
    render(<InspectorEngineeringView />);

    expect(screen.getByText('Napięcie zadane szyny bilansującej')).toBeInTheDocument();
    expect(screen.getByTestId('inspektor-karta-pole-u_set')).toHaveAttribute('data-brak', 'true');
    expect(screen.getByTestId('inspektor-karta-wartosc-u_set')).toHaveTextContent(BRAK_DANYCH_PL);
  });

  // Iloczyn cech (KLASA NIE INSTANCJA): selekcja źródła z rolą semantyczną GPZ
  // (`semanticElementKind: 'GPZ'`) i bez niej — obie trafiają w TĘ SAMĄ kartę sieci
  // zasilającej (jedna ścieżka danych źródła), z u_set_pu i MIN.
  it('selekcja semantyczna GPZ pokazuje tę samą kartę sieci zasilającej z u_set_pu i MIN', () => {
    mockSelectedElements = [
      { id: 'src-1', type: 'Source', name: 'GPZ Testowy', semanticElementKind: 'GPZ' } as never,
    ];
    snapshot.sources[0] = {
      ...snapshot.sources[0],
      u_set_pu: 0.97,
      sk3_min_mva: 150,
    } as (typeof snapshot.sources)[number];

    render(<InspectorEngineeringView />);

    expect(screen.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'siec_zasilajaca');
    expect(screen.getByTestId('inspektor-karta-wartosc-u_set')).toHaveTextContent('0,97 p.u.');
    expect(screen.getByTestId('inspektor-karta-wartosc-sk_min')).toHaveTextContent('150 MVA');
  });
});
