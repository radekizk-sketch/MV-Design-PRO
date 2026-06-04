/**
 * Testy deterministycznego rozwiązania pola → branch odpływu i wypełniania
 * pomiarów P/Q/I z raw overlay rozpływu mocy.
 *
 * Reguła nadrzędna: BEZ zgadywania. Pole jest wypełniane tylko gdy branch jest
 * rozwiązany jednoznacznie i overlay faktycznie ma metrykę; inaczej null.
 */
import { describe, expect, it } from 'vitest';

import type { Bay, Branch } from '../../../../../types/enm';
import type { RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import {
  extractBayMeasurements,
  resolveFeederBranchRef,
} from '../enmToCanonicalGpzAdapter';

/* ---------------------------------------------------------------------------
   Fabryki
   --------------------------------------------------------------------------- */

function branch(refId: string, fromBus: string, toBus: string): Branch {
  return {
    id: refId,
    ref_id: refId,
    name: refId,
    tags: [],
    meta: {},
    type: 'cable',
    from_bus_ref: fromBus,
    to_bus_ref: toBus,
    status: 'closed',
    length_km: 1,
    r_ohm_per_km: 0.1,
    x_ohm_per_km: 0.1,
  } as Branch;
}

function bay(busRef: string, overrides: Partial<Bay> = {}): Bay {
  return {
    id: 'bay-x',
    ref_id: 'bay-x',
    name: 'bay-x',
    tags: [],
    meta: {},
    bay_role: 'OUT',
    substation_ref: 'g',
    bus_ref: busRef,
    equipment_refs: [],
    ...overrides,
  } as Bay;
}

function overlay(
  elements: Record<string, Record<string, number | null>>,
  analysisType = 'LOAD_FLOW',
): RawOverlayPayload {
  return {
    run_id: 'run-1',
    analysis_type: analysisType,
    elements: Object.fromEntries(
      Object.entries(elements).map(([refId, metrics]) => [
        refId,
        {
          ref_id: refId,
          kind: 'branch',
          badges: [],
          severity: 'INFO',
          metrics: Object.fromEntries(
            Object.entries(metrics).map(([code, value]) => [
              code,
              { code, value, unit: code === 'I_A' ? 'A' : code === 'P_MW' ? 'MW' : 'MVAr' },
            ]),
          ),
        },
      ]),
    ),
  };
}

/* ---------------------------------------------------------------------------
   resolveFeederBranchRef
   --------------------------------------------------------------------------- */

describe('resolveFeederBranchRef', () => {
  it('unikalny match po stronie from → { branchRef, gpzAtFrom: true }', () => {
    const branches = [branch('br-1', 'bus-sn', 'bus-dst')];
    const result = resolveFeederBranchRef(bay('bus-sn'), branches);
    expect(result).toEqual({ branchRef: 'br-1', gpzAtFrom: true });
  });

  it('unikalny match po stronie to → gpzAtFrom: false', () => {
    const branches = [branch('br-1', 'bus-dst', 'bus-sn')];
    const result = resolveFeederBranchRef(bay('bus-sn'), branches);
    expect(result).toEqual({ branchRef: 'br-1', gpzAtFrom: false });
  });

  it('rozstrzyga wieloznaczność przez outgoing_destination_ref', () => {
    const branches = [
      branch('br-1', 'bus-sn', 'bus-A'),
      branch('br-2', 'bus-sn', 'bus-B'),
    ];
    const result = resolveFeederBranchRef(
      bay('bus-sn', { outgoing_destination_ref: 'bus-B' }),
      branches,
    );
    expect(result).toEqual({ branchRef: 'br-2', gpzAtFrom: true });
  });

  it('wieloznaczne (≥2 kandydatów, brak destination) → null', () => {
    const branches = [
      branch('br-1', 'bus-sn', 'bus-A'),
      branch('br-2', 'bus-sn', 'bus-B'),
    ];
    expect(resolveFeederBranchRef(bay('bus-sn'), branches)).toBeNull();
  });

  it('destination_ref nie pasuje do żadnego drugiego końca → null', () => {
    const branches = [branch('br-1', 'bus-sn', 'bus-A')];
    expect(
      resolveFeederBranchRef(bay('bus-sn', { outgoing_destination_ref: 'bus-Z' }), branches),
    ).toBeNull();
  });

  it('brak kandydata (bus pola nie jest endpointem) → null', () => {
    const branches = [branch('br-1', 'bus-other', 'bus-dst')];
    expect(resolveFeederBranchRef(bay('bus-sn'), branches)).toBeNull();
  });

  it('pusta lista branchy → null', () => {
    expect(resolveFeederBranchRef(bay('bus-sn'), [])).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
   extractBayMeasurements
   --------------------------------------------------------------------------- */

describe('extractBayMeasurements', () => {
  const branches = [branch('br-1', 'bus-sn', 'bus-dst')];

  it('overlay obecny + unikalny branch → wypełnia pMw/qMvar/i1A', () => {
    const payload = overlay({ 'br-1': { P_MW: 2.5, Q_Mvar: 0.8, I_A: 96.2 } });
    const m = extractBayMeasurements(bay('bus-sn'), 'LINE_OUT', branches, payload);
    expect(m).toEqual({ pMw: 2.5, qMvar: 0.8, i1A: 96.2 });
  });

  it('brak konkretnej metryki w overlay → to pole = null (reszta wypełniona)', () => {
    const payload = overlay({ 'br-1': { P_MW: 2.5, I_A: 96.2 } });
    const m = extractBayMeasurements(bay('bus-sn'), 'LINE_OUT', branches, payload);
    expect(m).toEqual({ pMw: 2.5, qMvar: null, i1A: 96.2 });
  });

  it('metryka jawnie null w overlay → pole null', () => {
    const payload = overlay({ 'br-1': { P_MW: null, Q_Mvar: 0.8, I_A: 96.2 } });
    const m = extractBayMeasurements(bay('bus-sn'), 'LINE_OUT', branches, payload);
    expect(m).toEqual({ pMw: null, qMvar: 0.8, i1A: 96.2 });
  });

  it('branch wieloznaczny → pomiary null (NIE zgaduje)', () => {
    const ambiguous = [
      branch('br-1', 'bus-sn', 'bus-A'),
      branch('br-2', 'bus-sn', 'bus-B'),
    ];
    const payload = overlay({ 'br-1': { P_MW: 2.5 }, 'br-2': { P_MW: 9.9 } });
    expect(extractBayMeasurements(bay('bus-sn'), 'LINE_OUT', ambiguous, payload)).toBeNull();
  });

  it('brak overlay → null', () => {
    expect(extractBayMeasurements(bay('bus-sn'), 'LINE_OUT', branches, null)).toBeNull();
  });

  it('overlay nie ma elementu dla branchu → null (wszystkie 3 puste)', () => {
    const payload = overlay({ 'inny-branch': { P_MW: 2.5 } });
    expect(extractBayMeasurements(bay('bus-sn'), 'LINE_OUT', branches, payload)).toBeNull();
  });

  it('rola pola nie liniowa (TRANSFORMER) → null (brak jednoznacznego odpływu)', () => {
    const payload = overlay({ 'br-1': { P_MW: 2.5, Q_Mvar: 0.8, I_A: 96.2 } });
    expect(extractBayMeasurements(bay('bus-sn'), 'TRANSFORMER', branches, payload)).toBeNull();
  });

  it('rola COUPLER → null', () => {
    const payload = overlay({ 'br-1': { P_MW: 2.5, Q_Mvar: 0.8, I_A: 96.2 } });
    expect(extractBayMeasurements(bay('bus-sn'), 'COUPLER', branches, payload)).toBeNull();
  });

  it('LINE_IN i LINE_BRANCH też wypełniane', () => {
    const payload = overlay({ 'br-1': { P_MW: 1.1, Q_Mvar: 0.2, I_A: 40 } });
    expect(extractBayMeasurements(bay('bus-sn'), 'LINE_IN', branches, payload)).toEqual({
      pMw: 1.1,
      qMvar: 0.2,
      i1A: 40,
    });
    expect(extractBayMeasurements(bay('bus-sn'), 'LINE_BRANCH', branches, payload)).toEqual({
      pMw: 1.1,
      qMvar: 0.2,
      i1A: 40,
    });
  });

  it('SC payload (tylko IK_3F_A, brak P/Q/I) → null (uczciwie pusty)', () => {
    const payload = overlay({ 'br-1': { IK_3F_A: 12000 } }, 'SC_3F');
    expect(extractBayMeasurements(bay('bus-sn'), 'LINE_OUT', branches, payload)).toBeNull();
  });
});
