import { describe, expect, it } from 'vitest';
import { exportTccCsv, exportTccEatonPlt, exportTccAbbRelion, generateTccExport, type TccCurveExport } from '../exportTcc';

const sample: TccCurveExport = {
  device_id: 'CB-Pole-1',
  curve_name: 'SI',
  function_code: '51',
  I_set_A: 500,
  t_set_s: 0.3,
  points: [
    { current_multiplier: 2.0, time_s: 4.5 },
    { current_multiplier: 5.0, time_s: 1.2 },
    { current_multiplier: 10.0, time_s: 0.5 },
  ],
};

describe('exportTccCsv (SEL ProACT format)', () => {
  it('zwraca CSV z nagłówkiem', () => {
    const csv = exportTccCsv([sample]);
    expect(csv.split('\n')[0]).toBe('DeviceID,FunctionCode,CurveName,I_set[A],TMS[s],I_mult,t[s]');
  });

  it('wszystkie punkty per device', () => {
    const csv = exportTccCsv([sample]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(4); // header + 3 points
    expect(lines[1]).toContain('CB-Pole-1,51,SI,500.00,0.300,2.000,4.5000');
  });

  it('multiple curves', () => {
    const csv = exportTccCsv([sample, { ...sample, device_id: 'CB-Pole-2' }]);
    expect(csv).toContain('CB-Pole-1');
    expect(csv).toContain('CB-Pole-2');
  });
});

describe('exportTccEatonPlt (EATON eSCADA format)', () => {
  it('zawiera header EATON + metadata', () => {
    const plt = exportTccEatonPlt([sample]);
    expect(plt).toContain('# EATON eSCADA Power Logic Trace');
    expect(plt).toContain('# Vendor: EATON Corporation');
  });

  it('renderuje device block z [DEVICE]...[/DEVICE]', () => {
    const plt = exportTccEatonPlt([sample]);
    expect(plt).toContain('[DEVICE]');
    expect(plt).toContain('[/DEVICE]');
    expect(plt).toContain('Name=CB-Pole-1');
    expect(plt).toContain('ANSI=51');
    expect(plt).toContain('Curve=SI');
    expect(plt).toContain('PointCount=3');
  });

  it('punkty jako Point0=, Point1=', () => {
    const plt = exportTccEatonPlt([sample]);
    expect(plt).toContain('Point0=2,4.5');
    expect(plt).toContain('Point2=10,0.5');
  });
});

describe('exportTccAbbRelion (ABB Relion 530 format)', () => {
  it('zwraca poprawny XML', () => {
    const xml = exportTccAbbRelion([sample]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<RelionConfig vendor="ABB"');
  });

  it('Protection element z ANSI code', () => {
    const xml = exportTccAbbRelion([sample]);
    expect(xml).toContain('<Protection device="CB-Pole-1" ansi="51">');
    expect(xml).toContain('<Curve type="SI"/>');
    expect(xml).toContain('<Pickup unit="A">500</Pickup>');
    expect(xml).toContain('<TimeDial unit="s">0.3</TimeDial>');
  });

  it('CurvePoints z I i t per point', () => {
    const xml = exportTccAbbRelion([sample]);
    expect(xml).toContain('<Point I="2" t="4.5"/>');
    expect(xml).toContain('<Point I="10" t="0.5"/>');
  });

  it('escape XML znaków w device id', () => {
    const xml = exportTccAbbRelion([{ ...sample, device_id: 'CB<Test>' }]);
    expect(xml).toContain('device="CB&lt;Test&gt;"');
  });
});

describe('generateTccExport (format dispatcher)', () => {
  it('sel_csv → CSV', () => {
    expect(generateTccExport([sample], 'sel_csv')).toContain('DeviceID');
  });
  it('eaton_plt → PLT', () => {
    expect(generateTccExport([sample], 'eaton_plt')).toContain('# EATON');
  });
  it('abb_relion → XML', () => {
    expect(generateTccExport([sample], 'abb_relion')).toContain('<RelionConfig');
  });
});
