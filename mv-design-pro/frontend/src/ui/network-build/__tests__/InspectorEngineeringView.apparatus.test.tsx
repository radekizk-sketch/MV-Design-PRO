import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { InspectorEngineeringView } from '../InspectorEngineeringView';
import { readinessZListy } from '../../../test/gotowoscTestUtils';
import { useKontekstElementuKanwy } from '../../sld/shared/kontekstElementuKanwy';
import { ROLA_SYMBOLU_PL } from '../../sld/shared/identyfikatorAparatu';
import { SYMBOL_DEFS, type SymbolId } from '../../sld/v3/symbols/defs';

/** Karta FAB-J: patrz komentarz w `InspectorEngineeringView.test.tsx`. */
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
  branches: [
    {
      id: 'brk-1',
      ref_id: 'stn/1/sn_field_breaker/000',
      name: 'Wyłącznik pola SN 1',
      type: 'breaker',
      status: 'closed',
      from_bus_ref: 'bus-sn-1',
      to_bus_ref: 'bus-sn-1',
      catalog_ref: null,
      catalog_namespace: 'APARAT_SN',
    },
  ],
  branch_points: [],
  transformers: [],
  sources: [],
  substation: [],
  substations: [
    {
      id: 'stn/teststation/station',
      ref_id: 'stn/teststation/station',
      name: 'Stacja inline',
      station_type: 'inline',
      bus_refs: ['bus-sn-1'],
      transformer_refs: [],
    },
  ],
  bays: [
    {
      id: 'bay-1',
      ref_id: 'bay_ref_1',
      name: 'Pole liniowe 1',
      bay_role: 'OUT',
      substation_ref: 'gpz-1',
      bus_ref: 'bus-sn-1',
      equipment_refs: [],
    },
  ],
  generators: [],
  loads: [],
};

let mockSelectedElements: Array<{ id: string; type: string; name: string }> = [];
let mockReadinessIssues: Array<{
  severity: string;
  element_ref: string | null;
  element_refs: string[];
  message_pl: string;
}> = [];

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: { openOperationForm: typeof openOperationForm }) => unknown) =>
    selector({ openOperationForm }),
}));

vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: { selectedElements: typeof mockSelectedElements }) => unknown) =>
    selector({ selectedElements: mockSelectedElements }),
}));

// JEDNA prawda gotowosci (KD-1 / V12K-286): inspektor czyta problemy przez
// `gotowoscAdapter` z `useSnapshotStore.readiness`, wiec scena zasila TO pole
// (dawna atrapa `readinessLiveStore` byla osobnym, nigdy nieodswiezanym zrodlem).
vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({
      snapshot,
      logicalViews: null,
      readiness: readinessZListy(mockReadinessIssues),
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
  useAppStateStore: (selector: (state: { activeMode: string }) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT' }),
}));

describe('InspectorEngineeringView - aparaty pola SN', () => {
  beforeEach(() => {
    openOperationForm.mockReset();
    mockReadinessIssues = [];
    useKontekstElementuKanwy.getState().wyczysc();
  });

  /** Kontekst kliknięcia kanwy dla aparatu pola — to, co zapisuje `SldCanvasV3Workspace`
   *  po natywnym kliknięciu symbolu (ścieżkę natywną ćwiczy `punktStartuCiagu.test.tsx`). */
  function kliknijAparat(symbolAparatu: SymbolId): void {
    mockSelectedElements = [{ id: 'bay_ref_1', type: 'Switch', name: 'bay_ref_1' }];
    useKontekstElementuKanwy.getState().ustawKontekst({
      selekcjaId: 'bay_ref_1',
      elementKind: 'apparatus',
      ref: 'bay_ref_1',
      temat: { menuKind: 'apparatus', modelRef: 'bay_ref_1', kotwica: 'pole', symbolAparatu },
      tylkoOdczyt: false,
    });
  }

  // Iloczyn: KAŻDY rodzaj symbolu biblioteki × karta aparatu — nazwa z biblioteki symboli,
  // rola z jednego słownika, pole powiązane z modelu, zero surowego kodu rodzaju.
  it.each(Object.keys(SYMBOL_DEFS) as SymbolId[])('karta aparatu %s: nazwa i rola z jednego słownika', (symbol) => {
    kliknijAparat(symbol);
    const { container } = render(<InspectorEngineeringView />);
    expect(screen.getByText('Parametry aparatu')).toBeInTheDocument();
    expect(screen.getAllByText(SYMBOL_DEFS[symbol].labelPl).length).toBeGreaterThan(0);
    expect(screen.getByText(ROLA_SYMBOLU_PL[symbol])).toBeInTheDocument();
    expect(screen.getByText('Pole liniowe 1')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toContain(`#${symbol}`);
    expect(screen.queryByText('Wyprowadzenie sieci SN') !== null).toBe(symbol === 'cableHead');
  });

  it('głowica kablowa: jedna pozycja „Wyprowadź ciąg główny z głowicy" — z paska działań, nie z karty', () => {
    kliknijAparat('cableHead');
    render(<InspectorEngineeringView />);
    expect(screen.getByText('Wyprowadzenie sieci SN')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Wyprowadź ciąg główny z głowicy/ })).toHaveLength(1);
  });

  it('id selekcji z dawnym kodem (`#cable_head`) albo ścieżką widoku wewnętrznego stacji nie daje karty aparatu', () => {
    for (const id of ['bay_ref_1#cable_head', 'stn/teststation/station/internal-bay/tr-3/fuse']) {
      useKontekstElementuKanwy.getState().wyczysc();
      mockSelectedElements = [{ id, type: 'Switch', name: 'Aparat' }];
      const { unmount } = render(<InspectorEngineeringView />);
      expect(screen.queryByText('Parametry aparatu')).not.toBeInTheDocument();
      expect(screen.queryByText('Miejsce w układzie')).not.toBeInTheDocument();
      unmount();
    }
  });
});
