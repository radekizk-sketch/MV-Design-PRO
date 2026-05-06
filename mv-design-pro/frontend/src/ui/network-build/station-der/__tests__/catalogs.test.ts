/**
 * Testy katalogów station-der (Faza B).
 */

import { describe, it, expect } from 'vitest';

import {
  NC_RFG_PROFILE_CATALOG,
  LVRT_CURVE_CATALOG,
  HVRT_CURVE_CATALOG,
  LV_VOLTAGE_LEVEL_CATALOG,
  CONNECTION_VARIANT_CATALOG,
  STATION_TEMPLATE_CATALOG,
  PV_INVERTER_CATALOG,
  BESS_PCS_CATALOG,
  BESS_BATTERY_CATALOG,
  WIND_TURBINE_CATALOG,
  selectLvrtCurvesForProfile,
  selectHvrtCurvesForProfile,
  selectConnectionVariantsForKind,
  selectPvInvertersForVoltage,
  selectBessPcsForVoltage,
  getNcRfgProfile,
  getLvVoltageLevel,
  getConnectionSideLabelPl,
} from '../catalogs';

describe('NC RfG profile catalog', () => {
  it('zawiera 5 profili (PSE/Energa/Tauron/Enea/PGE)', () => {
    expect(NC_RFG_PROFILE_CATALOG).toHaveLength(5);
    const operators = NC_RFG_PROFILE_CATALOG.map((p) => p.operator_code);
    expect(operators).toEqual(['PSE', 'Energa', 'Tauron', 'Enea', 'PGE']);
  });

  it('każdy profil ma catalog_namespace=nc_rfg_profile + version + label_pl', () => {
    for (const profile of NC_RFG_PROFILE_CATALOG) {
      expect(profile.catalog_namespace).toBe('nc_rfg_profile');
      expect(profile.catalog_version).toBeTruthy();
      expect(profile.label_pl.length).toBeGreaterThan(0);
      expect(profile.status).toBe('active');
    }
  });

  it('getNcRfgProfile zwraca profil albo null', () => {
    expect(getNcRfgProfile('ncrfg_pse')?.operator_code).toBe('PSE');
    expect(getNcRfgProfile('unknown')).toBeNull();
  });
});

describe('LVRT/HVRT curve catalog', () => {
  it('LVRT zawiera krzywe z envelope (5 punktów po 0-3s)', () => {
    expect(LVRT_CURVE_CATALOG.length).toBeGreaterThanOrEqual(4);
    for (const curve of LVRT_CURVE_CATALOG) {
      expect(curve.envelope.length).toBe(5);
      expect(curve.envelope[0].time_s).toBe(0);
      // U_min na początku ≤ U_min na końcu (krzywa rośnie).
      expect(curve.envelope[0].voltage_pu).toBeLessThanOrEqual(
        curve.envelope[curve.envelope.length - 1].voltage_pu,
      );
    }
  });

  it('HVRT zawiera krzywe z envelope opadającym', () => {
    for (const curve of HVRT_CURVE_CATALOG) {
      expect(curve.envelope.length).toBe(5);
      // U_max na początku ≥ U_max na końcu (krzywa opada).
      expect(curve.envelope[0].voltage_pu).toBeGreaterThanOrEqual(
        curve.envelope[curve.envelope.length - 1].voltage_pu,
      );
    }
  });

  it('selectLvrtCurvesForProfile filtruje po operatorze', () => {
    const curves = selectLvrtCurvesForProfile('ncrfg_pse');
    expect(curves.length).toBeGreaterThan(0);
    expect(curves.every((c) => c.operator_code === 'PSE')).toBe(true);
  });

  it('selectHvrtCurvesForProfile filtruje po operatorze', () => {
    const curves = selectHvrtCurvesForProfile('ncrfg_energa');
    expect(curves.every((c) => c.operator_code === 'Energa')).toBe(true);
  });
});

describe('LvVoltageLevelCatalog', () => {
  it('zawiera 5 poziomów napięć nN', () => {
    expect(LV_VOLTAGE_LEVEL_CATALOG.length).toBe(5);
    const voltages = LV_VOLTAGE_LEVEL_CATALOG.map((l) => l.nominal_kv).sort();
    expect(voltages).toEqual([0.23, 0.4, 0.69, 1.0, 6.0]);
  });

  it('getLvVoltageLevel zwraca konkretny poziom albo null', () => {
    expect(getLvVoltageLevel('lv_0_4kV')?.nominal_kv).toBe(0.4);
    expect(getLvVoltageLevel('lv_unknown')).toBeNull();
  });
});

describe('ConnectionVariantCatalog', () => {
  it('zawiera 6 wariantów (3 stacjonarne + 3 pozastacjonarne — Naprawa B.2)', () => {
    expect(CONNECTION_VARIANT_CATALOG).toHaveLength(6);
    const sides = CONNECTION_VARIANT_CATALOG.map((v) => v.side);
    expect(sides).toContain('SN');
    expect(sides).toContain('nN');
    expect(sides).toContain('dedicated_transformer');
    expect(sides).toContain('at_zksn');
    expect(sides).toContain('at_branch_pole');
    expect(sides).toContain('at_cable_joint');
  });

  it('selectConnectionVariantsForKind: PV ma 6 wariantów (SN, nN, dedicated, ZK SN, słup, mufa)', () => {
    const variants = selectConnectionVariantsForKind('PV');
    expect(variants).toHaveLength(6);
  });

  it('selectConnectionVariantsForKind: FW ma 3 warianty (SN, dedicated, słup) — nie nN, nie mufa', () => {
    const variants = selectConnectionVariantsForKind('FW');
    const sides = variants.map((v) => v.side);
    expect(sides).toContain('SN');
    expect(sides).toContain('dedicated_transformer');
    expect(sides).toContain('at_branch_pole');
    expect(sides).not.toContain('nN');
    expect(sides).not.toContain('at_cable_joint');
  });

  it('getConnectionSideLabelPl zwraca polski label', () => {
    expect(getConnectionSideLabelPl('SN')).toContain('SN');
    expect(getConnectionSideLabelPl('nN')).toContain('nN');
    expect(getConnectionSideLabelPl('dedicated_transformer')).toContain('transformator');
  });
});

describe('StationTemplateCatalog', () => {
  it('zawiera ≥10 szablonów stacji', () => {
    expect(STATION_TEMPLATE_CATALOG.length).toBeGreaterThanOrEqual(10);
  });

  it('każdy szablon ma topological_type i transformer_count', () => {
    for (const tmpl of STATION_TEMPLATE_CATALOG) {
      expect(['końcowa', 'przelotowa', 'odgałęźna', 'sekcyjna']).toContain(tmpl.topological_type);
      expect(tmpl.transformer_count).toBeGreaterThanOrEqual(1);
      expect(tmpl.nn_voltage_level_refs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('zawiera co najmniej jeden multi-voltage szablon (>1 poziom nN)', () => {
    const multi = STATION_TEMPLATE_CATALOG.filter((t) => t.nn_voltage_level_refs.length > 1);
    expect(multi.length).toBeGreaterThan(0);
  });

  it('zawiera szablony z PV/BESS', () => {
    const labels = STATION_TEMPLATE_CATALOG.map((t) => t.label_pl).join(' ');
    expect(labels).toContain('PV');
    expect(labels).toContain('BESS');
  });
});

describe('Device catalogs (PV/BESS/FW)', () => {
  it('PV inverter catalog ma ≥3 pozycje z różnymi mocami', () => {
    expect(PV_INVERTER_CATALOG.length).toBeGreaterThanOrEqual(3);
    const powers = PV_INVERTER_CATALOG.map((p) => p.nominal_power_kw);
    expect(new Set(powers).size).toBeGreaterThanOrEqual(2);
  });

  it('BESS PCS catalog ma ≥2 pozycje', () => {
    expect(BESS_PCS_CATALOG.length).toBeGreaterThanOrEqual(2);
  });

  it('BESS battery catalog ma ≥2 pozycje', () => {
    expect(BESS_BATTERY_CATALOG.length).toBeGreaterThanOrEqual(2);
  });

  it('Wind turbine catalog ma ≥3 pozycje (PMSG, DFIG, SCIG)', () => {
    expect(WIND_TURBINE_CATALOG.length).toBeGreaterThanOrEqual(3);
    const types = WIND_TURBINE_CATALOG.map((w) => w.generator_type);
    expect(types).toContain('PMSG');
    expect(types).toContain('DFIG');
  });

  it('selectPvInvertersForVoltage filtruje po napięciu', () => {
    const inv0_69 = selectPvInvertersForVoltage(0.69);
    expect(inv0_69.length).toBeGreaterThan(0);
    expect(inv0_69.every((i) => Math.abs(i.nominal_voltage_kv - 0.69) < 0.01)).toBe(true);
  });

  it('selectBessPcsForVoltage filtruje po napięciu', () => {
    const pcs0_4 = selectBessPcsForVoltage(0.4);
    expect(pcs0_4.length).toBeGreaterThan(0);
  });
});
