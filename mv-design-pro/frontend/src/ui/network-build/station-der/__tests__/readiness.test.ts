/**
 * Testy aggregacji readiness Station ↔ DER (Faza F).
 */

import { describe, it, expect } from 'vitest';

import {
  buildAggregatedReadiness,
  computeDerReadinessMatrix,
  emptyReadinessMatrix,
  READINESS_AXIS_LABELS_PL,
  summarizeReadiness,
} from '../readiness';
import {
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  type StationDerConnection,
} from '../types';

const FROZEN_NOW = '2026-05-06T10:00:00Z';

function makeDer(
  overrides: Partial<StationDerConnection> = {},
): StationDerConnection {
  return {
    id: 'der_1',
    project_id: 'p',
    station_id: 'station_1',
    der_kind: 'PV',
    name: 'PV Test',
    connection_side: 'SN',
    pcc_ref: 'pcc_1',
    bay_ref: null,
    transformer_ref: null,
    lv_busbar_ref: null,
    internal_cable_ref: null,
    voltage_level_ref: null,
    catalogs: { ...EMPTY_DER_CATALOGS, device_catalog_ref: 'pv_inv_sma_2500' },
    profiles: { ...EMPTY_DER_PROFILES, nc_rfg_profile_ref: 'ncrfg_pse' },
    nominal_power_kw: 2500,
    completeness: 'complete',
    readiness: { ...EMPTY_DER_READINESS },
    created_at: FROZEN_NOW,
    updated_at: FROZEN_NOW,
    ...overrides,
  };
}

describe('computeDerReadinessMatrix — agregacja gotowości DER', () => {
  it('Pełny minimalny DER (device + pcc + nc_rfg) → SC ready, FRT/HVRT blocked, NC RfG blocked', () => {
    const matrix = computeDerReadinessMatrix(makeDer());
    expect(matrix.sc_3f).toBe('ready');
    expect(matrix.sc_1f).toBe('ready');
    expect(matrix.sc_2f).toBe('ready');
    expect(matrix.sc_2fg).toBe('ready');
    expect(matrix.q_u).toBe('ready');
    // Brak LVRT/HVRT curve → frt/hvrt blocked
    expect(matrix.frt).toBe('blocked');
    expect(matrix.hvrt).toBe('blocked');
    expect(matrix.nc_rfg).toBe('blocked');
  });

  it('DER z pełnymi profilami → FRT/HVRT/NC_RFG ready', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({
        profiles: {
          nc_rfg_profile_ref: 'ncrfg_pse',
          lvrt_curve_ref: 'lvrt_pse_b',
          hvrt_curve_ref: 'hvrt_pse_b',
          regulation_profile_ref: null,
        },
      }),
    );
    expect(matrix.frt).toBe('ready');
    expect(matrix.hvrt).toBe('ready');
    expect(matrix.nc_rfg).toBe('ready');
  });

  it('DER bez device_catalog_ref → SC blocked', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({ catalogs: { ...EMPTY_DER_CATALOGS } }),
    );
    expect(matrix.sc_3f).toBe('blocked');
    expect(matrix.equipment).toBe('blocked');
  });

  it('DER bez pcc_ref → SC blocked', () => {
    const matrix = computeDerReadinessMatrix(makeDer({ pcc_ref: null }));
    expect(matrix.sc_3f).toBe('blocked');
  });

  it('DER z dedicated_transformer ale bez transformer_catalog_ref → equipment partial', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({ connection_side: 'dedicated_transformer' }),
    );
    expect(matrix.equipment).toBe('partial');
  });

  it('DER z protection + ct + vt → protection ready', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'pv_inv_sma_2500',
          protection_catalog_ref: 'prot_xyz',
          ct_catalog_ref: 'ct_xyz',
          vt_catalog_ref: 'vt_xyz',
        },
      }),
    );
    expect(matrix.protection).toBe('ready');
  });

  it('protection_selectivity z 0 innych DER → partial', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'pv_inv_sma_2500',
          protection_catalog_ref: 'prot_xyz',
          ct_catalog_ref: 'ct_xyz',
          vt_catalog_ref: 'vt_xyz',
        },
      }),
      { otherDersInStation: 0 },
    );
    expect(matrix.protection_selectivity).toBe('partial');
  });

  it('protection_selectivity z ≥1 innych DER → ready', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'pv_inv_sma_2500',
          protection_catalog_ref: 'prot_xyz',
          ct_catalog_ref: 'ct_xyz',
          vt_catalog_ref: 'vt_xyz',
        },
      }),
      { otherDersInStation: 2 },
    );
    expect(matrix.protection_selectivity).toBe('ready');
  });

  it('VDROP wymaga nominal_power_kw', () => {
    const matrix = computeDerReadinessMatrix(makeDer({ nominal_power_kw: null }));
    expect(matrix.vdrop).not.toBe('ready');
  });

  it('Report blocked gdy SC blocked', () => {
    const matrix = computeDerReadinessMatrix(makeDer({ pcc_ref: null }));
    expect(matrix.report_osd).toBe('blocked');
    expect(matrix.report_technical).toBe('blocked');
  });
});

describe('buildAggregatedReadiness — wiersze z polskimi labelami', () => {
  it('zwraca 14 osi z polskimi etykietami', () => {
    const rows = buildAggregatedReadiness(makeDer());
    expect(rows).toHaveLength(14);
    expect(rows.map((r) => r.label_pl)).toContain('Zwarcie 3-fazowe (SC3F)');
    expect(rows.map((r) => r.label_pl)).toContain('Zgodność przyłączeniowa (NC RfG)');
    expect(rows.map((r) => r.label_pl)).toContain('Raport OSD');
  });

  it('blockers dla SC mają target_screen=E-21 dla PV i target_tab odpowiedni', () => {
    const der = makeDer({
      catalogs: { ...EMPTY_DER_CATALOGS },
    });
    const rows = buildAggregatedReadiness(der);
    const sc3f = rows.find((r) => r.axis === 'sc_3f');
    expect(sc3f?.status).toBe('blocked');
    expect(sc3f?.blockers).toHaveLength(1);
    expect(sc3f?.blockers[0].target_screen).toBe('E-21');
    expect(sc3f?.blockers[0].target_tab).toBe('inverters');
    expect(sc3f?.blockers[0].message_pl).toContain('katalogu');
  });

  it('blocker NC RfG missing → target_tab=ncrfg', () => {
    const der = makeDer({ profiles: { ...EMPTY_DER_PROFILES } });
    const rows = buildAggregatedReadiness(der);
    const qu = rows.find((r) => r.axis === 'q_u');
    expect(qu?.status).toBe('blocked');
    expect(qu?.blockers[0].target_tab).toBe('ncrfg');
  });

  it('FW (E-23) target_screen mapowany poprawnie', () => {
    const der = makeDer({ der_kind: 'FW', catalogs: { ...EMPTY_DER_CATALOGS } });
    const rows = buildAggregatedReadiness(der);
    const sc3f = rows.find((r) => r.axis === 'sc_3f');
    expect(sc3f?.blockers[0].target_screen).toBe('E-23');
  });

  it('BESS (E-22) target_screen', () => {
    const der = makeDer({ der_kind: 'BESS', catalogs: { ...EMPTY_DER_CATALOGS } });
    const rows = buildAggregatedReadiness(der);
    const sc3f = rows.find((r) => r.axis === 'sc_3f');
    expect(sc3f?.blockers[0].target_screen).toBe('E-22');
  });
});

describe('summarizeReadiness', () => {
  it('liczy ready/partial/blocked', () => {
    const summary = summarizeReadiness(emptyReadinessMatrix());
    expect(summary.total).toBe(14);
    expect(summary.blocked).toBe(14);
    expect(summary.ready).toBe(0);
  });
});

describe('READINESS_AXIS_LABELS_PL', () => {
  it('zawiera 14 polskich labelów (zgodne z DerReadinessMatrix)', () => {
    expect(Object.keys(READINESS_AXIS_LABELS_PL)).toHaveLength(14);
    expect(READINESS_AXIS_LABELS_PL.frt).toContain('FRT');
    expect(READINESS_AXIS_LABELS_PL.hvrt).toContain('HVRT');
    expect(READINESS_AXIS_LABELS_PL.nc_rfg).toContain('NC RfG');
  });
});
