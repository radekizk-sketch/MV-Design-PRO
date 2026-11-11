/**
 * Karta GPZ-MODEL — karta stacji GPZ czyta granicę zasilania z modelu.
 *
 * Model zna dwa przypadki GPZ: (A) równoważnik sieci 110 kV na wspólnej szynie WN
 * z transformatorami WN/SN w modelu, (B) równoważnik na szynach SN, transformatory
 * poza modelem. Dawna karta liczyła szynę WN jako szynę SN i ostrzegała o zerze
 * sekcji WN oraz zerze transformatorów także w przypadku B — fałszywy alarm
 * stanu poprawnego. Iloczyn cech: {szyna WN jest, nie ma} × {transformatory 0, 1}.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { StationCard } from '../cards/StationCard';

type Pole = { key: string; value: unknown; severity?: string };
let lastProps: { sections?: Array<{ id: string; fields: Pole[] }> } | null = null;
let currentSnapshot: Record<string, unknown> = {};

vi.mock('../cards/ObjectCard', () => ({
  ObjectCard: (props: Record<string, unknown>) => {
    lastProps = props as typeof lastProps;
    return <div data-testid="object-card" />;
  },
}));
vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({ snapshot: currentSnapshot, logicalViews: null, readiness: { blockers: [] } }),
}));
vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ openOperationForm: vi.fn(), closeObjectCard: vi.fn() }),
}));
vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeMode: string }) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT' }),
}));

const SZYNA_WN = { ref_id: 'gpz/x/hv_section/001/bus_wn', name: 'Szyna WN', voltage_kv: 110 };
const SZYNA_S1 = { ref_id: 'gpz/x/section/001/bus_sn', name: 'Sekcja 1', voltage_kv: 15 };
const SZYNA_S2 = { ref_id: 'gpz/x/section/002/bus_sn', name: 'Sekcja 2', voltage_kv: 15 };
const TR = {
  ref_id: 'gpz/x/transformer/001', name: 'TR1', hv_bus_ref: SZYNA_WN.ref_id,
  lv_bus_ref: SZYNA_S1.ref_id, sn_mva: 25, uhv_kv: 110, ulv_kv: 15, uk_percent: 11, pk_kw: 120,
};

function gpz(zSzynaWn: boolean, zTransformatorem: boolean): Record<string, unknown> {
  const szyny = zSzynaWn ? [SZYNA_WN, SZYNA_S1, SZYNA_S2] : [SZYNA_S1, SZYNA_S2];
  return {
    substations: [{
      id: 'gpz-1', ref_id: 'gpz-1', name: 'GPZ', station_type: 'gpz',
      bus_refs: szyny.map((b) => b.ref_id),
      transformer_refs: zTransformatorem ? [TR.ref_id] : [],
      gpz_sections: [
        { section_id: 's1', bus_ref: SZYNA_S1.ref_id, order: 1 },
        { section_id: 's2', bus_ref: SZYNA_S2.ref_id, order: 2 },
      ],
      gpz_hv_sections: [],
    }],
    buses: szyny,
    transformers: zTransformatorem ? [TR] : [],
    bays: [],
    branches: [],
    sources: [],
  };
}

function pole(klucz: string): Pole {
  const pola = (lastProps?.sections ?? []).find((s) => s.id === 'struktura')?.fields ?? [];
  const p = pola.find((f) => f.key === klucz);
  expect(p, klucz).toBeDefined();
  return p!;
}

describe('StationCard — granica zasilania GPZ (karta GPZ-MODEL)', () => {
  beforeEach(() => { lastProps = null; });

  it.each([
    // [szyna WN, transformator, szyny WN, szyny SN, ostrzeżenie o transformatorach, granica]
    [true, true, 1, 2, 'ok', 'Równoważnik sieci WN — transformatory WN/SN w modelu'],
    [true, false, 1, 2, 'warning', 'Równoważnik sieci WN — transformatory WN/SN w modelu'],
    [false, false, 0, 2, 'ok', 'Równoważnik sieci na szynach SN — transformatory WN/SN poza modelem'],
  ] as const)(
    'szyna WN=%s × transformator=%s ⇒ szyny WN %i, szyny SN %i, transformatory %s',
    (zSzynaWn, zTransformatorem, wn, sn, ostrzezenie, granica) => {
      currentSnapshot = gpz(zSzynaWn, zTransformatorem);
      render(<StationCard elementId="gpz-1" />);
      expect(pole('gpz_wn_buses_count').value).toBe(wn);
      // Szyna WN nie jest szyną SN (dawne „powyżej pasma nN" liczyło ją jako SN).
      expect(pole('sn_buses_count').value).toBe(sn);
      expect(pole('transformers_count').severity).toBe(ostrzezenie);
      expect(pole('gpz_granica_zasilania').value).toBe(granica);
      // Pusta lista sekcji WN jest stanem kanonicznym — karta nie ostrzega o niej.
      const pola = (lastProps?.sections ?? []).flatMap((s) => s.fields.map((f) => f.key));
      expect(pola).not.toContain('gpz_sections_hv_count');
    },
  );

  it('stacja nie-GPZ bez transformatora nadal dostaje ostrzeżenie', () => {
    currentSnapshot = {
      substations: [{ id: 'st-1', ref_id: 'st-1', name: 'ST', station_type: 'inline',
        bus_refs: [SZYNA_S1.ref_id], transformer_refs: [] }],
      buses: [SZYNA_S1], transformers: [], bays: [], branches: [], sources: [],
    };
    render(<StationCard elementId="st-1" />);
    expect(pole('transformers_count').severity).toBe('warning');
    const pola = (lastProps?.sections ?? []).flatMap((s) => s.fields.map((f) => f.key));
    expect(pola).not.toContain('gpz_granica_zasilania');
  });
});
