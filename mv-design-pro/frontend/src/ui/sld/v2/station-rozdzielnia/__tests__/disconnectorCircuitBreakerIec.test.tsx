/**
 * K30-110: CB (Circuit Breaker) IEC 60617-7-13-08 compliance — contact dots +
 * contact line (symbol okrągłego odłącznika skasowany razem z rendererami v2).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ApparatusCbSquare } from '../GpzApparatusSymbols';

afterEach(() => cleanup());

describe('ApparatusCbSquare — IEC 60617-7-13-08', () => {
  it('closed: vertical contact line + 2 contact dots wewnątrz kwadratu', () => {
    const { container } = render(
      <svg>
        <ApparatusCbSquare cx={50} cy={50} state="closed" energized />
      </svg>,
    );
    const cb = container.querySelector('[data-testid="sld-v2-gpz-bay-cb"]');
    expect(cb?.getAttribute('data-symbol-canon')).toBe('circuit_breaker_square');
    // Powinien być rect (square frame)
    expect(cb?.querySelector('rect')).toBeTruthy();
    // K30-122: Contact dots — 2 circles r=1.1 (zwiększone z 0.9 dla WCAG AA contrast)
    const dots = Array.from(cb?.querySelectorAll('circle') ?? []).filter((c) => c.getAttribute('r') === '1.1');
    expect(dots.length).toBe(2);
    // Vertical contact line
    const lines = Array.from(cb?.querySelectorAll('line') ?? []);
    const verticalContact = lines.find((l) => l.getAttribute('x1') === l.getAttribute('x2'));
    expect(verticalContact).toBeTruthy();
  });

  it('open: horizontal break line + brak contact dots', () => {
    const { container } = render(
      <svg>
        <ApparatusCbSquare cx={50} cy={50} state="open" energized={false} />
      </svg>,
    );
    const cb = container.querySelector('[data-testid="sld-v2-gpz-bay-cb"]');
    // Open: brak contact dots (r=1.1 dla closed, brak dla open)
    const dots = Array.from(cb?.querySelectorAll('circle') ?? []).filter((c) => c.getAttribute('r') === '1.1');
    expect(dots.length).toBe(0);
    // Open: horizontal line (y1 === y2)
    const lines = Array.from(cb?.querySelectorAll('line') ?? []);
    const horizontalBreak = lines.find((l) => l.getAttribute('y1') === l.getAttribute('y2'));
    expect(horizontalBreak).toBeTruthy();
  });
});
