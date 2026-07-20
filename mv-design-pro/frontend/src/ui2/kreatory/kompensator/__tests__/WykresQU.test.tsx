/** Test wykresu Q(U) baterii kondensatorów — parabola Q∝U² + punkt znamionowy. */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WykresQU } from '../WykresQU';

afterEach(cleanup);

describe('WykresQU — charakterystyka Q(U) baterii', () => {
  it('rysuje krzywą (parabolę) i punkt znamionowy', () => {
    const { container } = render(<WykresQU />);
    expect(container.querySelector('polyline.mvd-wykres-krzywa')).not.toBeNull();
    expect(container.querySelector('circle.mvd-wykres-punkt')).not.toBeNull();
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });
});
