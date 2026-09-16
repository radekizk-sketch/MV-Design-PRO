import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { EquipmentProofBadge, computeEquipmentProofStatus } from '../EquipmentProofBadge';

function svgWrap(children: React.ReactNode) {
  return <svg>{children}</svg>;
}

describe('EquipmentProofBadge', () => {
  it('OK status - zielona ikona ✓', () => {
    const { container } = render(svgWrap(
      <EquipmentProofBadge data={{ status: 'ok' }} x={0} y={0} />,
    ));
    expect(container.querySelector('[data-testid="equipment-proof-badge-ok"]')).toBeTruthy();
    expect(container.textContent).toContain('✓');
  });

  it('WARNING - żółta ikona ⚠', () => {
    const { container } = render(svgWrap(
      <EquipmentProofBadge data={{ status: 'warning' }} x={0} y={0} />,
    ));
    expect(container.querySelector('[data-testid="equipment-proof-badge-warning"]')).toBeTruthy();
    expect(container.textContent).toContain('⚠');
  });

  it('FAIL - czerwona ikona ✗ + pulsing ring', () => {
    const { container } = render(svgWrap(
      <EquipmentProofBadge data={{ status: 'fail' }} x={0} y={0} />,
    ));
    expect(container.querySelector('[data-testid="equipment-proof-badge-fail"]')).toBeTruthy();
    expect(container.textContent).toContain('✗');
    // pulsing animate elements
    expect(container.querySelectorAll('animate').length).toBeGreaterThan(0);
  });
});

describe('computeEquipmentProofStatus', () => {
  it('utilization <80% → ok', () => {
    expect(computeEquipmentProofStatus(5, 10)).toBe('ok');
  });

  it('utilization 80-99% → warning', () => {
    expect(computeEquipmentProofStatus(8.5, 10)).toBe('warning');
  });

  it('utilization 100% → fail', () => {
    expect(computeEquipmentProofStatus(10, 10)).toBe('fail');
  });

  it('utilization >100% → fail', () => {
    expect(computeEquipmentProofStatus(12, 10)).toBe('fail');
  });

  it('uwzględnia worst case z Ith i Idyn', () => {
    // Ith 50% (ok), Idyn 95% (warning) → warning
    expect(computeEquipmentProofStatus(5, 10, 9.5, 10)).toBe('warning');
  });

  it('undefined inputs → ok (brak danych do walidacji)', () => {
    expect(computeEquipmentProofStatus(undefined, undefined)).toBe('ok');
  });
});
