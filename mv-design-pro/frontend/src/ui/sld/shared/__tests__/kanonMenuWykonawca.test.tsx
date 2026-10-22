/**
 * V12K-351 — wykonawca pozycji kanonu menu kontekstowego SLD.
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
import { czyAkcjaZmieniaModel, useSldActionExecutor } from '../sldActionExecutor';

function Harness({
  actionId,
  kind,
  elementId,
  readOnly = false,
}: {
  actionId: string;
  kind: SldElementKindForMenu;
  elementId: string | null;
  readOnly?: boolean;
}) {
  const handleAction = useSldActionExecutor({ readOnly });
  return (
    <button type="button" onClick={() => handleAction(actionId, kind, elementId)}>
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
