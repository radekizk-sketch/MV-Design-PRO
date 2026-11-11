/**
 * V12K-352 — wykonawca pozycji kanonu menu kontekstowego SLD.
 *
 * Kliknięcia NATYWNE (userEvent) w przycisk harnessa wołający `useSldActionExecutor` z
 * ustalonym (actionId, kind, elementId) — dokładnie kontrakt `SldContextMenuController.onAction`
 * i paska działań inspektora (wzorzec `sldActionExecutorShowResults.test.tsx`).
 *
 * ILOCZYN CECH:
 *  - pozycje dołożone przez kartę × ich realny cel (karta konfiguratora z `defaultCard`,
 *    formularz operacji `update_element_parameters`, zakładka „Zwarcia" Wyników);
 *  - KAŻDA pozycja `SLD_MENU_REGISTRY` × tryb podglądu schematu: sekcje zmieniające model
 *    („Dodaj", „Operacje", „Usuń") są blokowane, pozostałe działają — jedno źródło prawdy
 *    (sekcja pozycji w rejestrze), nie lista prefiksów identyfikatorów.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useShellStore } from '../../../../ui2/shell/useShellStore';
import { useAppStateStore } from '../../../app-state';
import { useNetworkBuildStore } from '../../../network-build/networkBuildStore';
import { useNotificationStore } from '../../../notifications/store';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import {
  SLD_MENU_REGISTRY,
  type SldElementKindForMenu,
} from '../../v2/command/SldCommandService';
import { czyAkcjaZmieniaModel, POWOD_BRAKU_SCHEMATU_NN_PL, useSldActionExecutor } from '../sldActionExecutor';
import { operacjaBezposredniaNn, type GrafMenuNn, type OperacjaNn } from '../../v3/lv-domain/operacjeNn';

function Harness({
  actionId,
  kind,
  elementId,
  readOnly = false,
  operacjaNn,
}: {
  actionId: string;
  kind: SldElementKindForMenu;
  elementId: string | null;
  readOnly?: boolean;
  /** Ładunek operacji bezpośredniej nN — tak, jak przynosi go portal schematu nN. */
  operacjaNn?: OperacjaNn;
}) {
  const handleAction = useSldActionExecutor({ readOnly });
  return (
    <button type="button" onClick={() => handleAction(actionId, kind, elementId, operacjaNn)}>
      wykonaj akcję
    </button>
  );
}

async function kliknij(): Promise<void> {
  await userEvent.setup().click(screen.getByRole('button', { name: 'wykonaj akcję' }));
}

beforeEach(() => {
  useAppStateStore.getState().reset();
  useSnapshotStore.getState().reset();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  useShellStore.setState({ activeSpace: 'schemat', wynikiTab: null, wynikiTabElement: null });
  useNotificationStore.setState({ notifications: [] } as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
});

describe('Pozycje kanonu prowadzą do KONKRETNEJ karty konfiguratora (defaultCard)', () => {
  it.each([
    ['station', 'edit-station-bays', 'E-13', 'bays'],
    ['station', 'edit-station-transformer', 'E-13', 'transformer'],
    ['station', 'show-station-nn', 'E-13', 'nn-switchgear'],
    ['station', 'show-station-readiness', 'E-13', 'readiness'],
    ['cable_segment_sn', 'change-catalog', 'E-12', 'catalog'],
    ['cable_segment_sn', 'edit-laying', 'E-12', 'route'],
    ['cable_segment_sn', 'show-thermal', 'E-12', 'rating'],
    ['overhead_line_sn', 'edit-line', 'E-12', 'route'],
    ['overhead_line_sn', 'show-thermal', 'E-12', 'rating'],
  ] as const)('%s → %s otwiera %s na karcie „%s"', async (kind, actionId, ekran, karta) => {
    render(<Harness actionId={actionId} kind={kind} elementId="ref/obiekt-1" />);
    await kliknij();
    const powierzchnia = useNetworkBuildStore.getState().activeSurface;
    expect(powierzchnia?.screenCode).toBe(ekran);
    expect(powierzchnia?.entityRef).toBe('ref/obiekt-1');
    expect(powierzchnia?.routeState.payload).toEqual({ defaultCard: karta });
  });

  it.each(['cable_segment_sn', 'overhead_line_sn'] as const)(
    '%s → open-segment-card otwiera kartę odcinka bez wymuszonej karty',
    async (kind) => {
      render(<Harness actionId="open-segment-card" kind={kind} elementId="ref/odcinek-1" />);
      await kliknij();
      const powierzchnia = useNetworkBuildStore.getState().activeSurface;
      expect(powierzchnia?.screenCode).toBe('E-12');
      expect(powierzchnia?.entityRef).toBe('ref/odcinek-1');
    },
  );

  it.each(['station', 'cable_segment_sn', 'overhead_line_sn', 'der_pv', 'der_bess', 'der_fw', 'der'] as const)(
    '%s → show-rationale otwiera dowody obliczeń (E-36)',
    async (kind) => {
      render(<Harness actionId="show-rationale" kind={kind} elementId="ref/obiekt-2" />);
      await kliknij();
      expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-36');
    },
  );
});

describe('Pozycje źródła OZE', () => {
  it.each(['der_pv', 'der_bess', 'der_fw', 'der'] as const)(
    '%s → edit-source-module otwiera formularz update_element_parameters z refem generatora',
    async (kind) => {
      const openOperationForm = vi.fn();
      useNetworkBuildStore.setState({ openOperationForm } as never);
      render(<Harness actionId="edit-source-module" kind={kind} elementId="gen/PV-1" />);
      await kliknij();
      expect(openOperationForm).toHaveBeenCalledTimes(1);
      expect(openOperationForm).toHaveBeenCalledWith(
        'update_element_parameters',
        expect.objectContaining({ element_ref: 'gen/PV-1', element_type: expect.any(String) }),
      );
    },
  );

  it.each(['der_pv', 'der_bess', 'der_fw', 'der'] as const)(
    '%s → show-sc-contributions otwiera zakładkę „Zwarcia" warsztatu Wyników',
    async (kind) => {
      render(<Harness actionId="show-sc-contributions" kind={kind} elementId="gen/PV-1" />);
      await kliknij();
      expect(useShellStore.getState().wynikiTab).toBe('zwarcia');
      expect(useShellStore.getState().activeSpace).toBe('wyniki');
      expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
    },
  );
});

describe('Pozycje schematu nN (kabel, aparat, zacisk, odbiór) — realny cel każdej pozycji', () => {
  const MIGAWKA_NN = {
    buses: [
      { ref_id: 'bus/a', name: 'Szyna A' },
      { ref_id: 'bus/t', name: 'Zacisk T' },
      { ref_id: 'bus/b', name: 'Szyna B' },
    ],
    branches: [
      { ref_id: 'cab/2', name: 'Kabel 2', type: 'cable', from_bus_ref: 'bus/t', to_bus_ref: 'bus/b' },
      { ref_id: 'cab/1', name: 'Kabel 1', type: 'cable', from_bus_ref: 'bus/a', to_bus_ref: 'bus/t' },
      { ref_id: 'fu/1', name: 'Bezpiecznik 1', type: 'fuse', from_bus_ref: 'bus/a', to_bus_ref: 'bus/b' },
      { ref_id: 'cp/1', name: 'Sprzęgło', type: 'bus_coupler', from_bus_ref: 'bus/a', to_bus_ref: 'bus/b' },
    ],
    loads: [{ ref_id: 'load/1', name: 'Odbiór 1', bus_ref: 'bus/b' }],
  };
  // Graf projekcji nN — jedyne źródło ładunku operacji bezpośrednich (portal liczy go
  // `operacjaBezposredniaNn` i podaje wykonawcy; wykonawca nie odtwarza topologii z ENM).
  const GRAF_NN = { ...MIGAWKA_NN, devices: [{ ref_id: 'fu/1', device_role: 'feeder' }] } as unknown as GrafMenuNn;

  it.each([
    ['set-nn-laying', 'set_nn_cable_laying_conditions'],
    ['split-nn-segment', 'split_nn_segment'],
  ] as const)('nn_cable → %s otwiera formularz %s z refem odcinka', async (actionId, op) => {
    const openOperationForm = vi.fn();
    useNetworkBuildStore.setState({ openOperationForm } as never);
    render(<Harness actionId={actionId} kind="nn_cable" elementId="cab/1" />);
    await kliknij();
    expect(openOperationForm).toHaveBeenCalledTimes(1);
    expect(openOperationForm).toHaveBeenCalledWith(op, expect.objectContaining({ segment_ref: 'cab/1' }));
  });

  it.each([
    ['nn_terminal', 'merge-nn-segments', 'bus/t', 'merge_nn_segments', { segment_a_ref: 'cab/1', segment_b_ref: 'cab/2' }],
    ['nn_apparatus', 'copy-nn-feeder', 'fu/1', 'copy_nn_feeder', { feeder_apparatus_ref: 'fu/1' }],
  ] as const)('%s → %s wykonuje %s wprost z ładunkiem z grafu projekcji nN', async (kind, actionId, ref, op, payload) => {
    const executeDomainOperation = vi.fn().mockResolvedValue({ snapshot: {} });
    useSnapshotStore.setState({ executeDomainOperation, snapshot: null } as never);
    useAppStateStore.setState({ activeCaseId: 'case-1' } as never);
    render(
      <Harness actionId={actionId} kind={kind} elementId={ref} operacjaNn={operacjaBezposredniaNn(actionId, ref, GRAF_NN)} />,
    );
    await kliknij();
    expect(executeDomainOperation).toHaveBeenCalledTimes(1);
    expect(executeDomainOperation).toHaveBeenCalledWith('case-1', op, payload, expect.objectContaining({ komunikatSukcesuPl: expect.any(String) }));
  });

  it.each([
    ['nn_terminal', 'merge-nn-segments', 'bus/a'],
    ['nn_apparatus', 'copy-nn-feeder', 'cp/1'],
  ] as const)('%s → %s bez spełnionego warunku: komunikat powodu, ZERO operacji', async (kind, actionId, ref) => {
    const executeDomainOperation = vi.fn();
    useSnapshotStore.setState({ executeDomainOperation, snapshot: MIGAWKA_NN } as never);
    useAppStateStore.setState({ activeCaseId: 'case-1' } as never);
    const operacja = operacjaBezposredniaNn(actionId, ref, GRAF_NN);
    render(<Harness actionId={actionId} kind={kind} elementId={ref} operacjaNn={operacja} />);
    await kliknij();
    expect(executeDomainOperation).not.toHaveBeenCalled();
    const komunikaty = useNotificationStore.getState().notifications;
    expect(komunikaty.map((wpis) => wpis.type)).toContain('warning');
    expect(operacja.ok).toBe(false);
    expect(komunikaty.map((wpis) => wpis.message)).toContain(operacja.ok ? '' : operacja.powodPl);
  });

  it.each([
    ['nn_terminal', 'merge-nn-segments', 'bus/t'],
    ['nn_apparatus', 'copy-nn-feeder', 'fu/1'],
  ] as const)('%s → %s bez ładunku z portalu nN (migawka ENM obecna): odmowa, ZERO operacji', async (kind, actionId, ref) => {
    const executeDomainOperation = vi.fn();
    useSnapshotStore.setState({ executeDomainOperation, snapshot: MIGAWKA_NN } as never);
    useAppStateStore.setState({ activeCaseId: 'case-1' } as never);
    render(<Harness actionId={actionId} kind={kind} elementId={ref} />);
    await kliknij();
    expect(executeDomainOperation).not.toHaveBeenCalled();
    const komunikaty = useNotificationStore.getState().notifications.map((wpis) => wpis.message);
    expect(komunikaty).toContain(POWOD_BRAKU_SCHEMATU_NN_PL);
  });

  it.each([
    ['nn_cable', 'delete-nn-cable', 'cab/1', 'odcinek kabla nN'],
    ['nn_apparatus', 'delete-nn-apparatus', 'fu/1', 'aparat nN'],
    ['nn_terminal', 'delete-nn-terminal', 'bus/t', 'zacisk nN'],
    ['nn_load', 'delete-nn-load', 'load/1', 'odbiór nN'],
  ] as const)('%s → %s: potwierdzenie i delete_element z refem obiektu', async (kind, actionId, ref, etykieta) => {
    const executeDomainOperation = vi.fn().mockResolvedValue({ snapshot: {} });
    useSnapshotStore.setState({ executeDomainOperation, snapshot: MIGAWKA_NN } as never);
    useAppStateStore.setState({ activeCaseId: 'case-1' } as never);
    render(<Harness actionId={actionId} kind={kind} elementId={ref} />);
    await kliknij();
    const potwierdzenie = useNotificationStore
      .getState()
      .notifications.find((wpis) => wpis.message.startsWith('Potwierdź usunięcie'));
    expect(potwierdzenie?.message).toContain(etykieta);
    potwierdzenie?.actions?.find((a) => a.label === 'Usuń')?.onClick();
    expect(executeDomainOperation).toHaveBeenCalledWith(
      'case-1',
      'delete_element',
      // Ładunek = kontrakt `delete_element` (`element_ref`); identyfikator akcji menu nie jest
      // daną operacji (handler go nie czyta).
      { element_ref: ref },
      expect.anything(),
    );
  });
});

const WSZYSTKIE_POZYCJE = (Object.entries(SLD_MENU_REGISTRY) as Array<
  [SldElementKindForMenu, (typeof SLD_MENU_REGISTRY)[SldElementKindForMenu]]
>).flatMap(([kind, pozycje]) => pozycje.map((pozycja) => [kind, pozycja.id, pozycja.section] as const));

describe('Tryb podglądu schematu × każda pozycja rejestru', () => {
  it('predykat zmiany modelu pochodzi z sekcji pozycji', () => {
    for (const [kind, id, section] of WSZYSTKIE_POZYCJE) {
      expect(czyAkcjaZmieniaModel(id, kind), `${kind}/${id}`).toBe(
        section === 'Dodaj' || section === 'Operacje' || section === 'Usuń',
      );
    }
  });

  it.each(WSZYSTKIE_POZYCJE.filter(([, , section]) => ['Dodaj', 'Operacje', 'Usuń'].includes(section)))(
    '%s → %s (%s) jest blokowana w trybie podglądu bez skutku',
    async (kind, actionId) => {
      const openOperationForm = vi.fn();
      const openRouteSurface = vi.fn();
      const executeDomainOperation = vi.fn();
      useNetworkBuildStore.setState({ openOperationForm, openRouteSurface } as never);
      useSnapshotStore.setState({ executeDomainOperation } as never);
      useAppStateStore.setState({ activeCaseId: 'case-1' } as never);
      render(<Harness actionId={actionId} kind={kind} elementId="ref/obiekt-3" readOnly />);
      await kliknij();
      expect(openOperationForm).not.toHaveBeenCalled();
      expect(openRouteSurface).not.toHaveBeenCalled();
      expect(executeDomainOperation).not.toHaveBeenCalled();
      const komunikaty = useNotificationStore.getState().notifications.map((wpis) => wpis.message);
      expect(komunikaty).toContain('Tryb podglądu schematu — przełącz na edycję, aby budować sieć.');
    },
  );
});
