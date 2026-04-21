import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RenewableSourceCard } from '../cards/RenewableSourceCard';

let lastProps: Record<string, unknown> | null = null;

const closeObjectCard = vi.fn();
const openOperationForm = vi.fn();

let currentSnapshot: Record<string, unknown> = {
  generators: [
    {
      ref_id: 'gen-1',
      name: 'Farma wiatrowa 1',
      gen_type: 'wind_inverter',
      connection_variant: 'block_transformer',
      station_ref: null,
      blocking_transformer_ref: null,
      bus_ref: 'bus-1',
      p_mw: 1.2,
      q_mvar: 0.1,
      catalog_ref: null,
    },
  ],
  buses: [
    {
      ref_id: 'bus-1',
      name: 'Szyna SN 1',
      voltage_kv: 15,
    },
  ],
  substations: [],
  transformers: [],
};

vi.mock('../cards/ObjectCard', () => ({
  ObjectCard: (props: Record<string, unknown>) => {
    lastProps = props;
    return <div data-testid="object-card">{String(props.elementType ?? '')}</div>;
  },
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({
      snapshot: currentSnapshot,
      readiness: { blockers: [] },
    }),
}));

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: { openOperationForm: typeof openOperationForm; closeObjectCard: typeof closeObjectCard }) => unknown) =>
    selector({ openOperationForm, closeObjectCard }),
}));

describe('RenewableSourceCard', () => {
  beforeEach(() => {
    lastProps = null;
    openOperationForm.mockReset();
    closeObjectCard.mockReset();
    currentSnapshot = {
      generators: [
        {
          ref_id: 'gen-1',
          name: 'Farma wiatrowa 1',
          gen_type: 'wind_inverter',
          connection_variant: 'block_transformer',
          station_ref: null,
          blocking_transformer_ref: null,
          bus_ref: 'bus-1',
          p_mw: 1.2,
          q_mvar: 0.1,
          catalog_ref: null,
        },
      ],
      buses: [
        {
          ref_id: 'bus-1',
          name: 'Szyna SN 1',
          voltage_kv: 15,
        },
      ],
      substations: [],
      transformers: [],
    };
  });

  it('pokazuje skrót FW i nie ostrzega o stacji dla wariantu blokowego', () => {
    render(<RenewableSourceCard elementId="gen-1" />);

    expect(screen.getByTestId('object-card')).toHaveTextContent('Źródło OZE — FW');

    const connectionSection = (lastProps as {
      sections?: Array<{ id: string; fields: Array<{ key: string; severity?: string }> }>;
    })?.sections?.find((section) => section.id === 'connection');
    const stationField = connectionSection?.fields.find((field) => field.key === 'station_ref');

    expect(stationField?.severity).toBeUndefined();
  });

  it('oznacza brak stacji jako ostrzeżenie tylko dla wariantu nn_side', () => {
    currentSnapshot = {
      ...currentSnapshot,
      generators: [
        {
          ...(currentSnapshot.generators as Array<Record<string, unknown>>)[0],
          connection_variant: 'nn_side',
        },
      ],
    };

    render(<RenewableSourceCard elementId="gen-1" />);

    const connectionSection = (lastProps as {
      sections?: Array<{ id: string; fields: Array<{ key: string; severity?: string }> }>;
    })?.sections?.find((section) => section.id === 'connection');
    const stationField = connectionSection?.fields.find((field) => field.key === 'station_ref');

    expect(stationField?.severity).toBe('warning');
  });
});
