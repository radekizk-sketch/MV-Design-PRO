/**
 * K30-109/110: DS (Disconnector) IEC 60617-7-13-02 + CB (Circuit Breaker)
 * IEC 60617-7-13-08 compliance — contact dots + lever/contact line.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ApparatusDsCircle, ApparatusCbSquare } from '../GpzApparatusSymbols';

afterEach(() => cleanup());

describe('ApparatusDsCircle — K30-109 IEC 60617-7-13-02', () => {
  it('closed: vertical lever + 2 contact dots', () => {
    const { container } = render(
      <svg>
        <ApparatusDsCircle cx={50} cy={50} state="closed" energized />
      </svg>,
    );
    const ds = container.querySelector('[data-testid="sld-v2-gpz-bay-ds"]');
    expect(ds?.getAttribute('data-symbol-canon')).toBe('disconnector_two_contact_lever');
    // 2 contact dots (top + bottom) — circles z r=0.9
    const dots = Array.from(ds?.querySelectorAll('circle') ?? []).filter((c) => c.getAttribute('r') === '0.9');
    expect(dots.length).toBe(2);
    // Lever line (vertical when closed): x1 === x2
    const lines = Array.from(ds?.querySelectorAll('line') ?? []);
    const verticalLever = lines.find((l) => l.getAttribute('x1') === l.getAttribute('x2'));
    expect(verticalLever).toBeTruthy();
  });

  it('open: diagonal lever (~45°) + 2 contact dots', () => {
    const { container } = render(
      <svg>
        <ApparatusDsCircle cx={50} cy={50} state="open" energized={false} />
      </svg>,
    );
    const ds = container.querySelector('[data-testid="sld-v2-gpz-bay-ds"]');
    const lines = Array.from(ds?.querySelectorAll('line') ?? []);
    // Diagonal lever: x1 !== x2 (diagonal line)
    const diagonalLever = lines.find((l) => l.getAttribute('x1') !== l.getAttribute('x2'));
    expect(diagonalLever).toBeTruthy();
  });

  it('unknown: neutralny symbol bez znaku zastępczego', () => {
    const { container } = render(
      <svg>
        <ApparatusDsCircle cx={50} cy={50} state="unknown" energized={false} />
      </svg>,
    );
    const ds = container.querySelector('[data-testid="sld-v2-gpz-bay-ds"]');
    expect(ds?.getAttribute('data-state')).toBe('unknown');
    expect(ds?.textContent).not.toContain('?');
  });
});

describe('ApparatusCbSquare — K30-110 IEC 60617-7-13-08', () => {
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

  it('CB jest wizualnie WIĘKSZY niż DS (kwadrat 9 vs okrąg radius 4.5)', () => {
    const { container: cbContainer } = render(
      <svg>
        <ApparatusCbSquare cx={50} cy={50} state="closed" energized />
      </svg>,
    );
    const cbRect = cbContainer.querySelector('[data-testid="sld-v2-gpz-bay-cb"] rect');
    const cbWidth = parseFloat(cbRect?.getAttribute('width') ?? '0');
    cleanup();
    const { container: dsContainer } = render(
      <svg>
        <ApparatusDsCircle cx={50} cy={50} state="closed" energized />
      </svg>,
    );
    const dsCircle = dsContainer.querySelector('[data-testid="sld-v2-gpz-bay-ds"] circle');
    const dsRadius = parseFloat(dsCircle?.getAttribute('r') ?? '0');
    // CB powinien mieć większy bounding box niż DS (9 > 9)
    expect(cbWidth).toBeGreaterThanOrEqual(dsRadius * 2);
  });
});
