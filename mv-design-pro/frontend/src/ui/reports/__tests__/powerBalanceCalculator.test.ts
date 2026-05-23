import { describe, expect, it } from 'vitest';
import {
  calculatePowerBalance,
  formatPowerBalanceForOsd,
  type PowerBalanceInput,
} from '../powerBalanceCalculator';

const baseInput: PowerBalanceInput = {
  sources: [
    { ref: 'gpz', name: 'GPZ główny', type: 'grid', pInstalledMw: 5, pPeakMw: 5, pMinMw: 1 },
    { ref: 'pv1', name: 'PV główna', type: 'der_pv', pInstalledMw: 2, pPeakMw: 1.8, pMinMw: 0 },
  ],
  loads: [
    { ref: 'load1', name: 'Odbiór przemysłowy', type: 'industrial', pPeakMw: 4, pAverageMw: 2 },
  ],
  losses: { transformerLossesMw: 0.05, cableLossesMw: 0.10, totalLossesMw: 0.15 },
};

describe('calculatePowerBalance', () => {
  it('liczy totale prawidłowo', () => {
    const r = calculatePowerBalance(baseInput);
    expect(r.totalInstalledMw).toBeCloseTo(7);
    expect(r.totalPeakSourceMw).toBeCloseTo(6.8);
    expect(r.totalPeakLoadMw).toBeCloseTo(4);
    expect(r.derInstalledMw).toBeCloseTo(2);
    expect(r.conventionalSourceMw).toBeCloseTo(5);
  });

  it('bilans szczytowy = source - load - losses', () => {
    const r = calculatePowerBalance(baseInput);
    // 6.8 - 4 - 0.15 = 2.65
    expect(r.netBalancePeakMw).toBeCloseTo(2.65, 2);
  });

  it('exportPotentialMw nigdy < 0', () => {
    const r = calculatePowerBalance(baseInput);
    expect(r.exportPotentialMw).toBeGreaterThanOrEqual(0);
  });

  it('warning gdy bilans ujemny', () => {
    const r = calculatePowerBalance({
      ...baseInput,
      sources: [
        { ref: 'gpz', name: 'GPZ', type: 'grid', pInstalledMw: 2, pPeakMw: 2, pMinMw: 1 },
      ],
    });
    expect(r.warnings.some((w) => w.includes('deficit'))).toBe(true);
  });

  it('warning gdy DER generuje nadmiar w off-peak', () => {
    const r = calculatePowerBalance({
      ...baseInput,
      sources: [
        ...baseInput.sources,
        { ref: 'pv2', name: 'PV duża', type: 'der_pv', pInstalledMw: 5, pPeakMw: 5, pMinMw: 3 },
      ],
      loads: [{ ref: 'l', name: 'L', type: 'service', pPeakMw: 1, pAverageMw: 0.5 }],
    });
    expect(r.warnings.some((w) => w.includes('eksport'))).toBe(true);
  });

  it('warning gdy straty > 10% mocy źródłowej', () => {
    const r = calculatePowerBalance({
      ...baseInput,
      losses: { transformerLossesMw: 0.5, cableLossesMw: 0.5, totalLossesMw: 1.0 },
    });
    expect(r.warnings.some((w) => w.includes('Straty'))).toBe(true);
  });

  it('warning gdy brak źródeł', () => {
    const r = calculatePowerBalance({
      sources: [],
      loads: baseInput.loads,
      losses: baseInput.losses,
    });
    expect(r.warnings.some((w) => w.includes('Brak źródeł'))).toBe(true);
  });
});

describe('formatPowerBalanceForOsd', () => {
  it('zwraca tekst PL z bilansem', () => {
    const r = calculatePowerBalance(baseInput);
    const text = formatPowerBalanceForOsd(r);
    expect(text).toContain('Moc zainstalowana');
    expect(text).toContain('DER');
    expect(text).toContain('MW');
    expect(text).toContain('Bilans szczytowy');
  });

  it('znaki + dla dodatnich', () => {
    const r = calculatePowerBalance(baseInput);
    const text = formatPowerBalanceForOsd(r);
    expect(text).toMatch(/\+\d/);
  });
});
