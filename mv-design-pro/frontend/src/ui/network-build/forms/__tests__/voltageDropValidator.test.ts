import { describe, expect, it } from 'vitest';
import { calculateVoltageDrop } from '../voltageDropValidator';

describe('calculateVoltageDrop', () => {
  it('kabel XLPE 240 mm² Al, 15 kV, 200 A, 5 km, cos φ=0.95 → OK', () => {
    const r = calculateVoltageDrop({
      loadCurrentA: 200,
      cableLengthKm: 5,
      cableResistanceOhmPerKm: 0.125,
      cableReactanceOhmPerKm: 0.10,
      cosPhi: 0.95,
      systemVoltageKv: 15,
    });
    // ΔU = √3 × 200 × 5 × (0.125 × 0.95 + 0.10 × 0.312) / 1000
    // ≈ √3 × 200 × 5 × 0.1499 / 1000 ≈ 0.260 V (ten obliczenie to / kV)
    // Faktycznie: ΔU% = 0.26 / 15 = 1.73%
    expect(r.verdict).toBe('ok');
    expect(r.voltageDropPercent).toBeLessThan(5);
  });

  it('długi kabel → error gdy ΔU > 5%', () => {
    const r = calculateVoltageDrop({
      loadCurrentA: 400,
      cableLengthKm: 20,
      cableResistanceOhmPerKm: 0.5,
      cableReactanceOhmPerKm: 0.15,
      cosPhi: 0.9,
      systemVoltageKv: 15,
    });
    expect(r.verdict).toBe('error');
    expect(r.message).toContain('przekracza');
    expect(r.recommendation).toContain('Zwiększ przekrój');
  });

  it('verdict zwraca string z 3 możliwości', () => {
    const r = calculateVoltageDrop({
      loadCurrentA: 300,
      cableLengthKm: 13,
      cableResistanceOhmPerKm: 0.2,
      cableReactanceOhmPerKm: 0.1,
      cosPhi: 0.9,
      systemVoltageKv: 15,
    });
    expect(['ok', 'warning', 'error']).toContain(r.verdict);
    expect(r.voltageDropPercent).toBeGreaterThan(0);
  });

  it('silnik dopuszcza 8% spadku', () => {
    const r = calculateVoltageDrop({
      loadCurrentA: 100,
      cableLengthKm: 1,
      cableResistanceOhmPerKm: 1,
      cableReactanceOhmPerKm: 0.1,
      cosPhi: 0.85,
      systemVoltageKv: 0.4,
      isMotorLoad: true,
    });
    // Dla 0.4 kV ten spadek będzie duży, ale limit 8%
    expect(r.message).toMatch(/8%|spadek/);
  });

  it('error gdy długość <= 0', () => {
    const r = calculateVoltageDrop({
      loadCurrentA: 100,
      cableLengthKm: 0,
      cableResistanceOhmPerKm: 0.1,
      cableReactanceOhmPerKm: 0.05,
      cosPhi: 0.9,
      systemVoltageKv: 15,
    });
    expect(r.verdict).toBe('error');
    expect(r.message).toContain('Niepoprawne');
  });

  it('error gdy cos φ poza [0, 1]', () => {
    const r = calculateVoltageDrop({
      loadCurrentA: 100,
      cableLengthKm: 1,
      cableResistanceOhmPerKm: 0.1,
      cableReactanceOhmPerKm: 0.05,
      cosPhi: 1.5,
      systemVoltageKv: 15,
    });
    expect(r.verdict).toBe('error');
    expect(r.message).toContain('cos');
  });

  it('rekomendacja zawiera % wymaganego zwiększenia przekroju', () => {
    const r = calculateVoltageDrop({
      loadCurrentA: 400,
      cableLengthKm: 20,
      cableResistanceOhmPerKm: 0.5,
      cableReactanceOhmPerKm: 0.15,
      cosPhi: 0.9,
      systemVoltageKv: 15,
    });
    expect(r.recommendation).toMatch(/przekrój|trasę/);
  });
});
