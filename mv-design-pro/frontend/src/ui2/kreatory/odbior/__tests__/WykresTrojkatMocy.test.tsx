/** Test trójkąta mocy odbioru — niższy cosφ → dłuższa przyprostokątna Q (więcej Q). */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WykresTrojkatMocy } from '../WykresTrojkatMocy';

afterEach(cleanup);

/** Długość pionowej przyprostokątnej Q (|y2−y1|) pierwszej pionowej linii. */
function dlugoscQ(container: HTMLElement): number {
  const linie = Array.from(container.querySelectorAll('line.mvd-wykres-krzywa'));
  // Druga linia = przyprostokątna Q (pionowa: x1==x2).
  const q = linie.find((l) => l.getAttribute('x1') === l.getAttribute('x2'));
  return Math.abs(Number(q?.getAttribute('y2')) - Number(q?.getAttribute('y1')));
}

describe('WykresTrojkatMocy — trójkąt mocy odbioru', () => {
  it('rysuje trzy boki trójkąta i punkt roboczy', () => {
    const { container } = render(<WykresTrojkatMocy cosPhi={0.93} />);
    expect(container.querySelectorAll('line.mvd-wykres-krzywa').length).toBe(2); // P + Q
    expect(container.querySelector('line.mvd-wykres-krzywa-lustro')).not.toBeNull(); // S
    expect(container.querySelector('circle.mvd-wykres-punkt')).not.toBeNull();
  });

  it('niższy cosφ → większa moc bierna Q (dłuższa przyprostokątna pionowa)', () => {
    const wysoki = render(<WykresTrojkatMocy cosPhi={0.98} />);
    const niski = render(<WykresTrojkatMocy cosPhi={0.8} />);
    expect(dlugoscQ(niski.container)).toBeGreaterThan(dlugoscQ(wysoki.container));
  });
});
