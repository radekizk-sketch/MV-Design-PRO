/** Test wykresu sztywności GPZ — hiperbola Z∝1/Sk″ + punkt odniesienia. */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WykresSztywnosci } from '../WykresSztywnosci';

afterEach(cleanup);

describe('WykresSztywnosci — sztywność sieci GPZ', () => {
  it('rysuje hiperbolę Z(Sk) i punkt odniesienia', () => {
    const { container } = render(<WykresSztywnosci />);
    const krzywa = container.querySelector('polyline.mvd-wykres-krzywa');
    expect(krzywa).not.toBeNull();
    expect(container.querySelector('circle.mvd-wykres-punkt')).not.toBeNull();
    // Hiperbola malejąca: pierwszy punkt (małe Sk, duże Z) wyżej niż ostatni (oś Y odwrócona).
    const pts = (krzywa?.getAttribute('points') ?? '').trim().split(' ');
    const y0 = Number(pts[0].split(',')[1]);
    const yN = Number(pts[pts.length - 1].split(',')[1]);
    expect(y0).toBeLessThan(yN); // wyżej na SVG = mniejsze y
  });
});
