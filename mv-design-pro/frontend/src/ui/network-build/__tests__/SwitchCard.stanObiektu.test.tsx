/**
 * Karta łącznika — stan obiektu (zakaz gazów fluorowanych w obiektach projektowanych).
 *
 * Iloczyn cech: rodzaj gałęzi {łącznik poza polem, łącznik opisany aparatem pola, łącznik w polu
 * bez własnego stanu, bezpiecznik} × stan własny {ISTNIEJACY, PROJEKTOWANY, brak}. Akcja zmiany
 * stanu idzie natywnym klikiem przycisku karty do operacji `set_object_state` ze `switch_ref`;
 * łącznik opisany aparatem pola nie ma akcji (stan wspólny z aparatem — karta pola), bo backend
 * odmówiłby `object_state.switch_has_bay_device`.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SwitchCard } from '../cards/SwitchCard';

let currentSnapshot: Record<string, unknown> = {};
const execMock = vi.fn();
const notifyMock = vi.fn();

vi.mock('../../topology/snapshotStore', () => {
  const stan = () => ({
    snapshot: currentSnapshot,
    readiness: { blockers: [] },
    executeDomainOperation: execMock,
    error: null,
  });
  const useSnapshotStore = (selector: (s: unknown) => unknown) => selector(stan());
  useSnapshotStore.getState = stan;
  return { useSnapshotStore };
});
vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ openOperationForm: vi.fn(), closeObjectCard: vi.fn() }),
}));
vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT', activeCaseId: 'case-1' }),
}));
vi.mock('../../notifications/store', () => ({ notify: (...a: unknown[]) => notifyMock(...a) }));

const SZYNY = [
  { ref_id: 'b1', name: 'Szyna 1', voltage_kv: 15 },
  { ref_id: 'b2', name: 'Szyna 2', voltage_kv: 15 },
];

function lacznik(typ: string, stan?: 'ISTNIEJACY' | 'PROJEKTOWANY'): Record<string, unknown> {
  return {
    ref_id: 'sw-1', name: 'Łącznik 1', type: typ, from_bus_ref: 'b1', to_bus_ref: 'b2',
    status: 'closed', catalog_ref: 'sw-ls-ogolny-prozniowy-24kv-630a',
    ...(stan ? { stan_obiektu: stan } : {}),
  };
}

function model(galaz: Record<string, unknown>, bays: unknown[] = []): Record<string, unknown> {
  return { buses: SZYNY, branches: [galaz], bays, substations: [] };
}

function poleStanu(): string {
  const etykieta = screen.getByText('Stan obiektu');
  return etykieta.nextElementSibling?.textContent ?? '';
}

beforeEach(() => {
  execMock.mockReset().mockResolvedValue({ error: null });
  notifyMock.mockReset();
});
afterEach(() => cleanup());

describe('Karta łącznika — łącznik poza polem', () => {
  it.each([
    ['ISTNIEJACY', 'istniejący', ['Oznacz jako projektowany'], ['Oznacz jako istniejący']],
    ['PROJEKTOWANY', 'projektowany', ['Oznacz jako istniejący'], ['Oznacz jako projektowany']],
    [undefined, 'nieustalony', ['Oznacz jako istniejący', 'Oznacz jako projektowany'], []],
  ] as const)('stan %s → pole „%s" i akcje przeciwne', (stan, napis, sa, nieMa) => {
    currentSnapshot = model(lacznik('switch', stan));
    render(<SwitchCard elementId="sw-1" />);
    expect(poleStanu()).toContain(napis);
    for (const a of sa) expect(screen.getByRole('button', { name: a })).toBeInTheDocument();
    for (const a of nieMa) expect(screen.queryByRole('button', { name: a })).toBeNull();
  });

  it('klik „Oznacz jako istniejący" wysyła set_object_state ze switch_ref', async () => {
    currentSnapshot = model(lacznik('breaker', 'PROJEKTOWANY'));
    render(<SwitchCard elementId="sw-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Oznacz jako istniejący' }));
    expect(execMock).toHaveBeenCalledWith('case-1', 'set_object_state', {
      switch_ref: 'sw-1',
      stan_obiektu: 'ISTNIEJACY',
    });
  });

  it('odmowa backendu wraca zdaniem w powiadomieniu', async () => {
    execMock.mockResolvedValue({ error: 'Łącznik 1 wykorzystuje gaz fluorowany (SF₆) …' });
    currentSnapshot = model(lacznik('switch', 'ISTNIEJACY'));
    render(<SwitchCard elementId="sw-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Oznacz jako projektowany' }));
    await vi.waitFor(() =>
      expect(notifyMock).toHaveBeenCalledWith('Łącznik 1 wykorzystuje gaz fluorowany (SF₆) …', 'error'),
    );
  });
});

describe('Karta łącznika — łącznik w polu', () => {
  it('opisany aparatem pola: stan wspólny z aparatem, bez akcji stanu', () => {
    const pole = {
      ref_id: 'bay-1', name: 'Pole L1', stan_obiektu: 'ISTNIEJACY', equipment_refs: ['sw-1'],
      primary_devices: [{ device_ref: 'd1', kind: 'CB', linked_ref: 'sw-1', stan_obiektu: 'ISTNIEJACY' }],
    };
    currentSnapshot = model(lacznik('breaker', 'ISTNIEJACY'), [pole]);
    render(<SwitchCard elementId="sw-1" />);
    expect(poleStanu()).toBe('istniejący — wspólny z aparatem pola Pole L1');
    expect(screen.queryByRole('button', { name: /Oznacz jako/ })).toBeNull();
  });

  it('w polu bez własnego stanu: stan pola, akcja dostępna (łącznik bez lustra w wyposażeniu)', () => {
    const pole = { ref_id: 'bay-1', name: 'Pole L1', stan_obiektu: 'PROJEKTOWANY', equipment_refs: ['sw-1'], primary_devices: [] };
    currentSnapshot = model(lacznik('disconnector'), [pole]);
    render(<SwitchCard elementId="sw-1" />);
    expect(poleStanu()).toBe('projektowany — stan pola Pole L1');
    expect(screen.getByRole('button', { name: 'Oznacz jako istniejący' })).toBeInTheDocument();
  });
});

describe('Karta łącznika — bezpiecznik', () => {
  it('bezpiecznik nie niesie stanu obiektu (bez komory gaszeniowej z gazem)', () => {
    currentSnapshot = model({ ...lacznik('fuse'), rated_current_a: 40 });
    render(<SwitchCard elementId="sw-1" />);
    expect(screen.queryByText('Stan obiektu')).toBeNull();
    expect(screen.queryByRole('button', { name: /Oznacz jako/ })).toBeNull();
  });
});
