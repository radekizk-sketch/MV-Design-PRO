import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { BranchPoleCard } from '../cards/BranchPoleCard';

let lastProps: Record<string, unknown> | null = null;

const openOperationForm = vi.fn();
const executeDomainOperation = vi.fn();
const closeObjectCard = vi.fn();

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
      executeDomainOperation,
    }),
}));

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: { openOperationForm: typeof openOperationForm }) => unknown,
  ) => selector({ openOperationForm }),
}));

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeCaseId: string }) => unknown) =>
    selector({ activeCaseId: 'case-1' }),
}));

beforeEach(() => {
  lastProps = null;
  openOperationForm.mockReset();
  executeDomainOperation.mockReset();
  closeObjectCard.mockReset();
  currentSnapshot = {
    branches: [
      {
        id: 'seg/0f0f0f0f0f0f0f0f0f0f0f0f/segment_R_branch_pole',
        ref_id: 'seg/0f0f0f0f0f0f0f0f0f0f0f0f/segment_R_branch_pole',
        name: 'seg/0f0f0f0f0f0f0f0f0f0f0f0f/segment_R_branch_pole',
        type: 'line_overhead',
        length_km: 0.25,
        catalog_namespace: 'linia_sn',
        tags: [],
        meta: {},
      },
    ],
    branch_points: [
      {
        ref_id: 'bp/1234567890abcdef1234567890/branch_pole',
        name: 'bp/1234567890abcdef1234567890/branch_pole',
        branch_point_type: 'branch_pole',
        parent_segment_id: 'seg/0f0f0f0f0f0f0f0f0f0f0f0f/segment_R_branch_pole',
        ports: {
          MAIN_IN: 'bus/aaaaaaaaaaaaaaaaaaaaaaaa',
          MAIN_OUT: 'bus/bbbbbbbbbbbbbbbbbbbbbbbb',
          BRANCH: ['bus/cccccccccccccccccccccccc'],
        },
        branch_occupied: {
          BRANCH: 'seg/deadbeefdeadbeefdeadbeef/outgoing',
        },
        switch_state: 'closed',
        catalog_ref: 'SLUP-ODG-12',
        catalog_namespace: 'mv_branch_points',
        source_mode: 'KATALOG',
        completeness_status: 'KOMPLETNY',
      },
    ],
  };
});

describe('BranchPoleCard — karta słupa bez surowych identyfikatorów', () => {
  it('nagłówek i sekcje publiczne opisują słup jako węzeł linii napowietrznej', () => {
    render(
      <BranchPoleCard
        elementId="bp/1234567890abcdef1234567890/branch_pole"
        onClose={closeObjectCard}
      />,
    );

    const props = lastProps as {
      elementName?: string;
      elementType?: string;
      sections?: Array<{ id: string; label: string; fields: Array<{ key: string; label: string; value: unknown }> }>;
    } | null;

    expect(props?.elementName).toBe('Słup rozgałęźny SN');
    expect(props?.elementType).toBe('Słup rozgałęźny SN');

    const serialized = JSON.stringify(props?.sections ?? []);
    expect(serialized).not.toMatch(/bp\//);
    expect(serialized).not.toMatch(/bus\//);
    expect(serialized).not.toMatch(/seg\//);
    expect(serialized).not.toMatch(/[a-f0-9]{24,}/i);

    const ident = props?.sections?.find((section) => section.id === 'ident');
    expect(ident?.fields.find((field) => field.key === 'role')?.value).toBe(
      'węzeł linii napowietrznej z portem odgałęzienia',
    );
    expect(ident?.fields.find((field) => field.key === 'parent_segment')?.value).toBe('Odcinek 01');

    const topology = props?.sections?.find((section) => section.id === 'topology');
    expect(topology?.fields.find((field) => field.key === 'main_in')?.value).toBe('połączony');
    expect(topology?.fields.find((field) => field.key === 'main_out')?.value).toBe('połączony');
    expect(topology?.fields.find((field) => field.key === 'branch_port')?.value).toBe(
      'zajęty przez odgałęzienie',
    );
    expect(topology?.fields.find((field) => field.key === 'medium')?.value).toBe('linia napowietrzna SN');
  });
});
