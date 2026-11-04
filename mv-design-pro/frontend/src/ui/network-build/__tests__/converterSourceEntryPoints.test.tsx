import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import { NnSwitchgearCard } from '../cards/NnSwitchgearCard';
import { StationCard } from '../cards/StationCard';

let lastProps: Record<string, unknown> | null = null;

const openOperationForm = vi.fn();
const closeObjectCard = vi.fn();

let currentSnapshot: Record<string, unknown> = {};

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
  useNetworkBuildStore: (
    selector: (state: { openOperationForm: typeof openOperationForm; closeObjectCard: typeof closeObjectCard }) => unknown,
  ) => selector({ openOperationForm, closeObjectCard }),
}));

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeMode: string }) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT' }),
}));

function getAction(id: string) {
  const actions =
    (lastProps as { actions?: Array<{ id: string; onClick: () => void }> } | null)?.actions ?? [];
  const action = actions.find((candidate) => candidate.id === id);
  expect(action).toBeDefined();
  return action!;
}

describe('converter source card entry points', () => {
  beforeEach(() => {
    lastProps = null;
    openOperationForm.mockReset();
    closeObjectCard.mockReset();
    currentSnapshot = {
      substations: [
        {
          id: 'st-1',
          ref_id: 'st-1',
          name: 'ST-1',
          station_type: 'inline',
          entry_point_ref: 'bus/sn',
          transformer_refs: ['tr-1'],
          bus_refs: ['bus/sn', 'bus/nn'],
        },
      ],
      bays: [],
      transformers: [
        {
          ref_id: 'tr-1',
          name: 'TR-1',
          sn_mva: 0.4,
          uk_percent: 6,
        },
      ],
      buses: [
        { ref_id: 'bus/sn', name: 'Szyna SN', voltage_kv: 15 },
        { ref_id: 'bus/nn', name: 'Szyna nN', voltage_kv: 0.4 },
      ],
      loads: [],
      generators: [],
    };
  });

  it('StationCard otwiera PV przez kanoniczne add_converter_source', () => {
    render(<StationCard elementId="st-1" />);

    getAction('add_pv').onClick();

    expect(openOperationForm).toHaveBeenCalledWith('add_converter_source', {
      station_ref: 'st-1',
      bus_nn_ref: 'bus/nn',
      source_technology: 'PV',
      connection_variant: 'nn_side',
    });
  });

  it('StationCard otwiera BESS przez kanoniczne add_converter_source', () => {
    render(<StationCard elementId="st-1" />);

    getAction('add_bess').onClick();

    expect(openOperationForm).toHaveBeenCalledWith('add_converter_source', {
      station_ref: 'st-1',
      bus_nn_ref: 'bus/nn',
      source_technology: 'BESS',
      connection_variant: 'nn_side',
    });
  });

  it('StationCard otwiera FW przez kanoniczne add_converter_source', () => {
    render(<StationCard elementId="st-1" />);

    getAction('add_fw').onClick();

    expect(openOperationForm).toHaveBeenCalledWith('add_converter_source', {
      station_ref: 'st-1',
      bus_nn_ref: 'bus/nn',
      source_technology: 'FW',
      connection_variant: 'nn_side',
    });
  });

  it('NnSwitchgearCard otwiera PV przez kanoniczne add_converter_source', () => {
    render(<NnSwitchgearCard elementId="st-1" />);

    getAction('add_pv').onClick();

    expect(openOperationForm).toHaveBeenCalledWith('add_converter_source', {
      station_ref: 'st-1',
      bus_nn_ref: 'bus/nn',
      source_technology: 'PV',
      connection_variant: 'nn_side',
    });
  });

  it('NnSwitchgearCard otwiera BESS przez kanoniczne add_converter_source', () => {
    render(<NnSwitchgearCard elementId="st-1" />);

    getAction('add_bess').onClick();

    expect(openOperationForm).toHaveBeenCalledWith('add_converter_source', {
      station_ref: 'st-1',
      bus_nn_ref: 'bus/nn',
      source_technology: 'BESS',
      connection_variant: 'nn_side',
    });
  });

  it('NnSwitchgearCard otwiera FW przez kanoniczne add_converter_source', () => {
    render(<NnSwitchgearCard elementId="st-1" />);

    getAction('add_fw').onClick();

    expect(openOperationForm).toHaveBeenCalledWith('add_converter_source', {
      station_ref: 'st-1',
      bus_nn_ref: 'bus/nn',
      source_technology: 'FW',
      connection_variant: 'nn_side',
    });
  });

  // Karta ETYKIETA-STACJI-PRZELOTOWEJ: rodzaj stacji z TOPOLOGII (jedna reguła produktu), nie
  // z deklaracji — stacja fikstury deklaruje „inline", ale nie ma ani jednego pola liniowego,
  // więc jest końcowa (intencja testu bez zmian: karta pokazuje rodzaj stacji).
  it('StationCard pokazuje rodzaj stacji z topologii w nagłówku', () => {
    render(<StationCard elementId="st-1" />);

    expect(lastProps).toMatchObject({
      elementType: 'Stacja końcowa',
    });
  });

  it('NnSwitchgearCard pokazuje rodzaj stacji z topologii w sekcji identyfikacji', () => {
    render(<NnSwitchgearCard elementId="st-1" />);

    const sections =
      (lastProps as { sections?: Array<{ id: string; fields: Array<{ key: string; value: unknown }> }> } | null)
        ?.sections ?? [];
    const identSection = sections.find((section) => section.id === 'ident');
    expect(identSection?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'type', value: 'Stacja końcowa' }),
      ]),
    );
  });

  // Kontrakt werdyktu wyjaśnialnego (karta WERDYKT-MIGRACJA-190): bilans mocy rozdzielnicy
  // nN jest miarą bez kryterium — iloczyn {nadwyżka, zero, deficyt} × {pole bilansu}: żaden
  // znak różnicy nie nadaje polu tonu oceny („warning"/„ok").
  it.each([
    ['nadwyżka generacji', 0.3, 0.1],
    ['bilans zerowy', 0.1, 0.1],
    ['deficyt generacji', 0.05, 0.2],
  ])('NnSwitchgearCard: %s — pole bilansu bez tonu oceny', (_opis, genMw, loadMw) => {
    currentSnapshot = {
      ...currentSnapshot,
      loads: [{ ref_id: 'ld-1', name: 'Odbiór', bus_ref: 'bus/nn', p_mw: loadMw, q_mvar: 0 }],
      generators: [
        { ref_id: 'pv-1', name: 'PV', bus_ref: 'bus/nn', gen_type: 'pv_inverter', p_mw: genMw },
      ],
    };
    render(<NnSwitchgearCard elementId="st-1" />);

    const sections =
      (lastProps as {
        sections?: Array<{ id: string; fields: Array<{ key: string; value: unknown; severity?: string }> }>;
      } | null)?.sections ?? [];
    const pole = sections.find((section) => section.id === 'bilans')?.fields.find((f) => f.key === 'balance');
    expect(pole?.value).toBeCloseTo((genMw - loadMw) * 1000, 6);
    expect(pole?.severity).toBeUndefined();
  });
});
