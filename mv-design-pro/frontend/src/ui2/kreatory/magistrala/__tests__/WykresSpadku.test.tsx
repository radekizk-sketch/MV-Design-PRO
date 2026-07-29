/** Test wykresu profilu napięcia magistrali — nachylenie zależne od cosφ (poglądowo). */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WykresSpadku } from '../WykresSpadku';

afterEach(cleanup);

/** Y końca profilu (drugi punkt) — niżej na SVG = większe „y" (oś odwrócona). */
function yKonca(container: HTMLElement): number {
  const linia = container.querySelector('line.mvd-wykres-krzywa');
  return Number(linia?.getAttribute('y2'));
}

describe('WykresSpadku — profil napięcia magistrali', () => {
  it('rysuje profil (linia) + limit + pasmo poza zakresem', () => {
    const { container } = render(<WykresSpadku cosPhi={0.95} />);
    expect(container.querySelector('line.mvd-wykres-krzywa')).not.toBeNull();
    expect(container.querySelector('line.mvd-wykres-prog')).not.toBeNull();
    expect(container.querySelector('rect.mvd-wykres-pasmo')).not.toBeNull();
  });

  it('niższy cosφ → głębszy spadek (koniec profilu niżej)', () => {
    const wysoki = render(<WykresSpadku cosPhi={1.0} />);
    const niski = render(<WykresSpadku cosPhi={0.8} />);
    // Oś Y odwrócona: głębszy spadek = większa wartość y2.
    expect(yKonca(niski.container)).toBeGreaterThan(yKonca(wysoki.container));
  });
});
