import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { InspectorEngineeringView } from '../InspectorEngineeringView';
import { readinessZListy } from '../../../test/gotowoscTestUtils';
import { useKontekstElementuKanwy } from '../../sld/shared/kontekstElementuKanwy';
import { ROLA_SYMBOLU_PL } from '../../sld/shared/identyfikatorAparatu';
import { symbolIdForPrimaryDeviceKind } from '../../sld/v3/compose/apparatusSequence';
import type { SymbolId } from '../../sld/v3/symbols/defs';
import type { BayPrimaryDeviceKind } from '../../../types/enm';

/** Rejestr ZAMKNIĘTY rodzajów rekordu aparatu pola — nowy rodzaj bez wpisu nie skompiluje się. */
const RODZAJE_REKORDU = {
  CB: true,
  LOAD_SWITCH: true,
  DS: true,
  ES: true,
  CT: true,
  VT: true,
  CABLE_HEAD: true,
  TRANSFORMER_DEVICE: true,
  FUSE: true,
  GENERATOR_PV: true,
  GENERATOR_BESS: true,
  GENERATOR_FW: true,
  PCS: true,
  BATTERY: true,
  SURGE_ARRESTER: true,
  UNBALANCE_CT: true,
  PHASE_TO_PHASE_VT: true,
} as const satisfies Record<BayPrimaryDeviceKind, true>;

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
      primary_devices: [] as Array<Record<string, unknown>>,
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

  /** Kontekst kliknięcia kanwy dla aparatu pola — DOKŁADNIE to, co zapisuje
   *  `SldCanvasV3Workspace.handleElementClick` po natywnym kliknięciu symbolu: selekcja i ref
   *  = ref POLA (`ownerRef` symbolu), `deviceRef` = rekord aparatu z meta symbolu (scena
   *  rysuje aparat pola WYŁĄCZNIE z rekordu — sonda `bayEquipmentGaps`), temat menu z
   *  `SymbolId`. Ścieżkę natywną kliku ćwiczy `punktStartuCiagu.test.tsx`. */
  function kliknijAparat(symbolAparatu: SymbolId, deviceRef: string | undefined): void {
    mockSelectedElements = [{ id: 'bay_ref_1', type: 'Switch', name: 'bay_ref_1' }];
    useKontekstElementuKanwy.getState().ustawKontekst({
      selekcjaId: 'bay_ref_1',
      elementKind: 'apparatus',
      ref: 'bay_ref_1',
      deviceRef,
      temat: { menuKind: 'apparatus', modelRef: 'bay_ref_1', kotwica: 'pole', symbolAparatu },
      tylkoOdczyt: false,
    });
  }

  function wyposazPole(kind: BayPrimaryDeviceKind): string {
    const deviceRef = `dev-${kind}`;
    snapshot.bays[0] = {
      ...snapshot.bays[0],
      primary_devices: [
        { device_ref: deviceRef, kind, symbol_ref: kind, placement: 'MIDSTREAM', is_controllable: false },
      ],
    };
    return deviceRef;
  }

  // Iloczyn: KAŻDY rodzaj rekordu aparatu pola rysowany na kanwie (rejestr zamknięty
  // `RODZAJE_REKORDU`, symbol z `symbolIdForPrimaryDeviceKind`) × klik z `deviceRef` sceny →
  // karta aparatu z rolą z jednego słownika symboli, pole powiązane z modelu, zero surowego
  // kodu rodzaju i zero dawnej drugiej ścieżki („Parametry aparatu").
  it.each(Object.keys(RODZAJE_REKORDU) as BayPrimaryDeviceKind[])('rekord %s kliknięty na kanwie: karta aparatu', (kind) => {
    const symbol = symbolIdForPrimaryDeviceKind(kind);
    if (symbol === null || symbol === 'transformer2W') {
      // Rekord bez symbolu w torze pola (źródła DER, przekładnik niezrównoważenia baterii)
      // nie jest klikalny jako aparat, a symbol transformatora scena klasyfikuje jako
      // transformator (`classifySymbolElementKind`, karta transformatora) — tych przypadków
      // iloczynu nie ma w ścieżce kliku aparatu. Lista jest ZAMKNIĘTA: nowy rodzaj bez
      // symbolu aparatu musi tu trafić jawnie.
      expect(['GENERATOR_PV', 'GENERATOR_BESS', 'GENERATOR_FW', 'PCS', 'BATTERY', 'UNBALANCE_CT', 'TRANSFORMER_DEVICE']).toContain(kind);
      return;
    }
    kliknijAparat(symbol, wyposazPole(kind));
    const { container } = render(<InspectorEngineeringView />);
    expect(screen.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'aparat');
    expect(screen.getByTestId('inspektor-karta-wartosc-rola')).toHaveTextContent(ROLA_SYMBOLU_PL[symbol]);
    expect(screen.getByTestId('inspektor-karta-wartosc-pole')).toHaveTextContent('Pole liniowe 1');
    expect(screen.queryByText('Parametry aparatu')).not.toBeInTheDocument();
    expect(container.textContent ?? '').not.toContain(`#${symbol}`);
    expect(container.textContent ?? '').not.toContain(`dev-${kind}`);
  });

  // Symbole stosu pola bez rekordu aparatu (sylwetka braku danych, zakończenie rezerwy) —
  // klik bez `deviceRef` pokazuje kartę POLA, nie aparat z domysłu.
  it.each(['bayNoEquipment', 'bayReserve'] as const)('symbol %s bez rekordu: karta pola', (symbol) => {
    kliknijAparat(symbol, undefined);
    render(<InspectorEngineeringView />);
    expect(screen.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'pole');
    expect(screen.queryByText('Parametry aparatu')).not.toBeInTheDocument();
  });

  it('głowica kablowa: jedna pozycja „Wyprowadź ciąg główny z głowicy" — z paska działań, nie z karty', () => {
    kliknijAparat('cableHead', wyposazPole('CABLE_HEAD'));
    render(<InspectorEngineeringView />);
    expect(screen.getByTestId('inspektor-karta-wartosc-rola')).toHaveTextContent(
      /jawny punkt wyprowadzenia ciągu głównego SN/,
    );
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
