/**
 * KARTA W5-C — wykonawca menu schematu dla pozycji stanu łącznika.
 *
 * Ścieżka realna: natywny klik w przycisk harnessa wołający `useSldActionExecutor` z
 * (actionId, kind, elementId) — ten sam kontrakt, który konsumuje menu kontekstowe SLD
 * (wzorzec `sldActionExecutorRoadmapHint.test.tsx`). Magazyn migawki jest prawdziwy;
 * podstawione jest wyłącznie `executeDomainOperation` (odpowiedź backendu).
 *
 * Iloczyn cech: pozycja {otwórz, zamknij} × obiekt {pole, aparat pola, łącznik na trasie}
 * × odpowiedź {sukces, odmowa backendu}; do tego brak zakresu obliczeń i obiekt bez
 * jednego łącznika (powód resolvera, bez wywołania operacji). Sukces NIE dokłada
 * lokalnego toastu — potwierdza go centralny komunikat magazynu.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { useAppStateStore } from '../../../app-state';
import { useNotificationStore } from '../../../notifications/store';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import type { SldElementKindForMenu } from '../../v2/command/SldCommandService';
import { useSldActionExecutor } from '../sldActionExecutor';

function Harness({ actionId, kind, elementId }: { actionId: string; kind: SldElementKindForMenu; elementId: string }) {
  const handleAction = useSldActionExecutor({ readOnly: false });
  return (
    <button type="button" onClick={() => handleAction(actionId, kind, elementId)}>
      wykonaj akcję
    </button>
  );
}

const MIGAWKA = {
  header: { name: 'Sieć', revision: 1, hash_sha256: 'h' },
  buses: [],
  branches: [
    { id: 'q1', ref_id: 'q1', name: 'Q1', type: 'breaker', status: 'closed', from_bus_ref: 'a', to_bus_ref: 'b', tags: [], meta: {} },
    { id: 'q2', ref_id: 'q2', name: 'Q2', type: 'switch', status: 'closed', from_bus_ref: 'c', to_bus_ref: 'd', tags: [], meta: {} },
  ],
  bays: [
    { id: 'pole-1', ref_id: 'pole-1', bay_role: 'OUT', bus_ref: 'a', equipment_refs: ['q1'] },
    { id: 'pole-2', ref_id: 'pole-2', bay_role: 'OUT', bus_ref: 'a', equipment_refs: ['q1', 'q2'] },
  ],
  substations: [],
  sources: [],
  loads: [],
  generators: [],
} as unknown as EnergyNetworkModel;

const OBIEKTY: ReadonlyArray<[string, SldElementKindForMenu, string]> = [
  ['pole', 'bay', 'pole-1'],
  // Aparat pola w postaci emitowanej przez kanwę v3 (`${bayRef}#${SymbolId}`).
  ['aparat pola', 'apparatus', 'pole-1#breaker'],
  ['łącznik na trasie', 'apparatus', 'q1'],
];

let wykonaj: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useAppStateStore.getState().reset();
  useSnapshotStore.getState().reset();
  useNotificationStore.getState().clearAll();
  wykonaj = vi.fn();
  useSnapshotStore.setState({ snapshot: MIGAWKA, executeDomainOperation: wykonaj } as never);
  useAppStateStore.setState({ activeCaseId: 'case-lacznik' } as never);
});

afterEach(() => {
  cleanup();
});

function powiadomienia(typ: string): string[] {
  return useNotificationStore
    .getState()
    .notifications.filter((n) => n.type === typ)
    .map((n) => n.message);
}

describe('wykonawca menu: pozycja × obiekt × odpowiedź', () => {
  const przypadki: Array<[string, string, SldElementKindForMenu, string, 'sukces' | 'odmowa']> = [];
  for (const akcja of ['open-switch', 'close-switch']) {
    for (const [opis, kind, ref] of OBIEKTY) {
      for (const odp of ['sukces', 'odmowa'] as const) przypadki.push([`${akcja} × ${opis} × ${odp}`, akcja, kind, ref, odp]);
    }
  }

  it.each(przypadki)('%s', async (_opis, akcja, kind, ref, odp) => {
    wykonaj.mockResolvedValue(
      odp === 'sukces' ? { snapshot: {} } : { snapshot: null, error: 'Łącznik zablokowany blokadą pola.', error_code: 'switch.interlock' },
    );
    const user = userEvent.setup();
    render(<Harness actionId={akcja} kind={kind} elementId={ref} />);
    await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

    const operacja = akcja === 'open-switch' ? 'open_switch' : 'close_switch';
    expect(wykonaj).toHaveBeenCalledTimes(1);
    expect(wykonaj).toHaveBeenCalledWith('case-lacznik', operacja, { switch_ref: 'q1' });
    // Odpowiedź operacji rozstrzygnięta i jej `.then` wykonany, zanim liczymy toasty.
    await act(async () => {
      await wykonaj.mock.results[0]?.value;
    });
    expect(powiadomienia('error')).toEqual(odp === 'odmowa' ? ['Łącznik zablokowany blokadą pola.'] : []);
    // Sukces potwierdza magazyn (tu podstawiony) — wykonawca nie dokłada drugiego toastu.
    expect(powiadomienia('success')).toEqual([]);
  });
});

describe('wykonawca menu: odmowy przed operacją', () => {
  it.each(['open-switch', 'close-switch', 'set-normal-open-point'])(
    '%s na polu z dwoma łącznikami: powód resolvera, bez operacji',
    async (akcja) => {
      const user = userEvent.setup();
      render(<Harness actionId={akcja} kind="bay" elementId="pole-2" />);
      await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));
      expect(wykonaj).not.toHaveBeenCalled();
      expect(powiadomienia('warning').join(' ')).toContain('Pole ma kilka łączników (Q1, Q2)');
    },
  );

  it.each(['open-switch', 'close-switch'])('%s bez zakresu obliczeń: ostrzeżenie, bez operacji', async (akcja) => {
    useAppStateStore.setState({ activeCaseId: null } as never);
    const user = userEvent.setup();
    render(<Harness actionId={akcja} kind="bay" elementId="pole-1" />);
    await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));
    expect(wykonaj).not.toHaveBeenCalled();
    expect(powiadomienia('warning').join(' ')).toContain('Nie wybrano aktywnego zakresu obliczeń');
  });
});
