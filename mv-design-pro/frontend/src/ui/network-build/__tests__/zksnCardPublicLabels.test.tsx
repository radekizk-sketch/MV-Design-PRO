/**
 * ZksnCard — guard publicznych etykiet.
 *
 * Surowe identyfikatory (seg/.../..., UUID, hash) nie mogą pojawić się
 * jako główna treść karty. Komunikat „brak parametru" w polach magistrali
 * przyjmuje formę inżynierską („Podłączone" / „—"), nie nazwę szyny.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ZksnCard } from '../cards/ZksnCard';

let lastProps: Record<string, unknown> | null = null;

const openOperationForm = vi.fn();
const closeObjectCard = vi.fn();
const executeDomainOperation = vi.fn();

let currentSnapshot: Record<string, unknown> = {};

vi.mock('../cards/ObjectCard', () => ({
  ObjectCard: (props: Record<string, unknown>) => {
    lastProps = props;
    return <div data-testid="object-card" />;
  },
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({
      snapshot: currentSnapshot,
      logicalViews: null,
      readiness: { blockers: [] },
      executeDomainOperation,
    }),
}));

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: { openOperationForm: typeof openOperationForm; closeObjectCard: typeof closeObjectCard }) => unknown,
  ) => selector({ openOperationForm, closeObjectCard }),
}));

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeMode: string; activeCaseId: string }) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT', activeCaseId: 'case-1' }),
}));

beforeEach(() => {
  lastProps = null;
  currentSnapshot = {
    branch_points: [
      {
        ref_id: 'seg/abc123def456ZZZZ9999/bp_zksn_root',
        name: 'seg/abc123def456ZZZZ9999/bp_zksn_root',
        branch_point_type: 'zksn',
        parent_segment_id: 'seg/9aa9bb88cc77dd66ee55/main_run',
        ports: { MAIN_IN: 'bus/abcd1234567890ffeeddccbb', MAIN_OUT: 'bus/0011aabbccddeeff', BRANCH: ['bus/01230123aabbccdd'] },
        branch_occupied: { BRANCH: 'seg/branch_target_aaaa1111' },
        switch_state: 'closed',
        completeness_status: 'KOMPLETNY',
      },
    ],
  };
});

describe('ZksnCard — publiczne etykiety bez surowych identyfikatorów', () => {
  it('nagłówek karty nie zawiera surowych seg/UUID — używa fallbacku ZKSN', () => {
    render(
      <ZksnCard
        elementId="seg/abc123def456ZZZZ9999/bp_zksn_root"
        onClose={closeObjectCard}
      />,
    );

    const elementName = (lastProps as { elementName?: string } | null)?.elementName ?? '';
    expect(elementName).toBe('ZKSN');
    expect(elementName).not.toMatch(/seg\//);
    expect(elementName).not.toMatch(/[a-f0-9]{16,}/);
  });

  it('sekcja Identyfikacja nie pokazuje raw parent_segment_id', () => {
    render(
      <ZksnCard
        elementId="seg/abc123def456ZZZZ9999/bp_zksn_root"
        onClose={closeObjectCard}
      />,
    );

    const sections = (lastProps as { sections?: Array<{ id: string; fields: Array<{ key: string; value: unknown }> }> } | null)?.sections ?? [];
    const ident = sections.find((s) => s.id === 'ident');
    expect(ident, 'brak sekcji ident').toBeDefined();

    const refIdField = ident!.fields.find((f) => f.key === 'ref_id');
    expect(refIdField, 'pole ref_id nie powinno być widoczne w sekcji Identyfikacja').toBeUndefined();

    const parent = ident!.fields.find((f) => f.key === 'parent_segment');
    expect(parent, 'brak pola parent_segment').toBeDefined();
    expect(String(parent!.value)).toBe('Magistrala SN');
  });

  it('sekcja Topologia nie pokazuje surowych bus_refów portów magistrali', () => {
    render(
      <ZksnCard
        elementId="seg/abc123def456ZZZZ9999/bp_zksn_root"
        onClose={closeObjectCard}
      />,
    );

    const sections = (lastProps as { sections?: Array<{ id: string; fields: Array<{ key: string; value: unknown }> }> } | null)?.sections ?? [];
    const topology = sections.find((s) => s.id === 'topology');
    expect(topology).toBeDefined();

    const mainIn = topology!.fields.find((f) => f.key === 'main_in');
    expect(String(mainIn!.value)).toBe('Podłączone');
    expect(String(mainIn!.value)).not.toMatch(/bus\//);

    const branchPort = topology!.fields.find((f) => f.key === 'BRANCH');
    expect(branchPort).toBeDefined();
    expect(String(branchPort!.value)).not.toMatch(/seg\//);
    expect(String(branchPort!.value)).toMatch(/Zajęty/);
  });

  it('akcja dodania odgalezienia jest zablokowana dla zajetego pojedynczego portu BRANCH', () => {
    render(
      <ZksnCard
        elementId="seg/abc123def456ZZZZ9999/bp_zksn_root"
        onClose={closeObjectCard}
      />,
    );

    const actions = (lastProps as { actions?: Array<{ id: string; label: string; disabled?: boolean }> } | null)?.actions ?? [];
    const addBranch = actions.find((action) => action.id === 'add_branch_BRANCH');
    expect(addBranch).toBeDefined();
    expect(addBranch?.label).toContain('ODG 1');
    expect(addBranch?.disabled).toBe(true);
  });
});
