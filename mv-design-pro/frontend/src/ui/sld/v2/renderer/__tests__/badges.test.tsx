import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EarthingBadge } from '../EarthingBadge';
import { EquipmentProofBadge, computeEquipmentProofStatus } from '../EquipmentProofBadge';

function svgWrap(children: React.ReactNode) {
  return <svg>{children}</svg>;
}

describe('EarthingBadge', () => {
  it('renderuje TN z kodem', () => {
    const { container } = render(svgWrap(<EarthingBadge type="TN" x={100} y={100} />));
    expect(container.querySelector('[data-testid="earthing-badge-TN"]')).toBeTruthy();
    expect(container.textContent).toContain('TN');
  });

  it('renderuje IT z żółtym kolorem', () => {
    const { container } = render(svgWrap(<EarthingBadge type="IT" x={100} y={100} />));
    expect(container.querySelector('[data-testid="earthing-badge-IT"]')).toBeTruthy();
  });

  it('Petersen wyświetla PC code', () => {
    const { container } = render(svgWrap(<EarthingBadge type="PETERSEN" x={100} y={100} />));
    expect(container.textContent).toContain('PC');
  });

  it('Resistor z R [Ω]', () => {
    const { container } = render(svgWrap(<EarthingBadge type="RESISTOR" x={100} y={100} r_ohm={40} />));
    expect(container.querySelector('[data-testid="earthing-value-RESISTOR"]')).toBeTruthy();
    expect(container.textContent).toContain('40 Ω');
  });

  it('Petersen z X [Ω]', () => {
    const { container } = render(svgWrap(<EarthingBadge type="PETERSEN" x={100} y={100} x_ohm={150} />));
    expect(container.textContent).toContain('150 Ω');
  });

  it('onClick wywoływane', () => {
    const onClick = vi.fn();
    const { container } = render(svgWrap(<EarthingBadge type="TN" x={0} y={0} onClick={onClick} />));
    const badge = container.querySelector('[data-testid="earthing-badge-TN"]') as SVGElement;
    badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalled();
  });
});

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
