import { describe, expect, it } from 'vitest';
import { validateDerPowerVsTransformer } from '../derPowerValidation';

describe('validateDerPowerVsTransformer', () => {
  it('verdict=ok gdy moc DER ≤ 80% transformatora', () => {
    const result = validateDerPowerVsTransformer({
      derPowerKva: 400,
      transformerRatedKva: 630,
    });
    expect(result.verdict).toBe('ok');
    expect(result.utilizationPercent).toBeCloseTo(63.5, 1);
  });

  it('verdict=warning gdy 80% < moc DER ≤ 100%', () => {
    const result = validateDerPowerVsTransformer({
      derPowerKva: 540,
      transformerRatedKva: 630,
    });
    expect(result.verdict).toBe('warning');
    expect(result.utilizationPercent).toBeCloseTo(85.7, 1);
    expect(result.recommendation).toBeTruthy();
  });

  it('verdict=error gdy moc DER > 100% transformatora', () => {
    const result = validateDerPowerVsTransformer({
      derPowerKva: 700,
      transformerRatedKva: 630,
    });
    expect(result.verdict).toBe('error');
    expect(result.utilizationPercent).toBeCloseTo(111.1, 1);
    expect(result.recommendation).toContain('większy');
  });

  it('error gdy derPowerKva ≤ 0', () => {
    expect(validateDerPowerVsTransformer({ derPowerKva: 0, transformerRatedKva: 630 }).verdict).toBe('error');
    expect(validateDerPowerVsTransformer({ derPowerKva: -100, transformerRatedKva: 630 }).verdict).toBe('error');
  });

  it('error gdy transformerRatedKva ≤ 0', () => {
    expect(validateDerPowerVsTransformer({ derPowerKva: 100, transformerRatedKva: 0 }).verdict).toBe('error');
  });

  it('respektuje custom thresholds', () => {
    const tighter = validateDerPowerVsTransformer({
      derPowerKva: 500,
      transformerRatedKva: 1000,
      warningThreshold: 0.4,
    });
    expect(tighter.verdict).toBe('warning');

    const lenient = validateDerPowerVsTransformer({
      derPowerKva: 900,
      transformerRatedKva: 1000,
      warningThreshold: 0.95,
    });
    expect(lenient.verdict).toBe('ok');
  });

  it('graniczna wartość 80% przechodzi jako OK', () => {
    const result = validateDerPowerVsTransformer({
      derPowerKva: 504,
      transformerRatedKva: 630,
    });
    expect(result.verdict).toBe('ok');
  });
});
