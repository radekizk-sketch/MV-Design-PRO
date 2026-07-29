import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ParametrRow, formatujWartosc } from '../ParametrRow';
import { definicjaParametru } from '../parametryDefinicje';

const DEF_UK = definicjaParametru('uk_percent')!;
const DEF_VECTOR = definicjaParametru('vector_group')!;
const DEF_R = definicjaParametru('r_ohm_per_km')!;

describe('formatujWartosc', () => {
  it('formatuje liczbę z jednostką (separator PL, jednostka po wartości)', () => {
    expect(formatujWartosc(DEF_UK, 6)).toBe('6,00 %');
  });

  it('formatuje z zadaną liczbą miejsc dziesiętnych', () => {
    expect(formatujWartosc(DEF_R, 0.2392)).toBe('0,2392 Ω/km');
  });

  it('zwraca wartość tekstową dosłownie dla definicji tekstowej', () => {
    expect(formatujWartosc(DEF_VECTOR, 'Dyn5')).toBe('Dyn5');
  });

  it('zwraca em-dash dla braku wartości tekstowej', () => {
    expect(formatujWartosc(DEF_VECTOR, null)).toBe('—');
  });

  it('zwraca etykietę braku dla braku wartości liczbowej', () => {
    expect(formatujWartosc(DEF_UK, undefined)).toBe('brak danych');
  });
});

describe('ParametrRow', () => {
  it('renderuje symbol, etykietę, definicję z normą i wartość mono', () => {
    const { container } = render(<ParametrRow definicja={DEF_UK} wartosc={6} />);
    const text = container.textContent ?? '';
    expect(text).toContain('uk');
    expect(text).toContain('Napięcie zwarcia');
    expect(text).toContain('IEC 60076-1');
    expect(text).toContain('6,00 %');
  });

  it('oznacza wartość klasą mono (tabular-nums)', () => {
    const { container } = render(<ParametrRow definicja={DEF_UK} wartosc={6} />);
    expect(container.querySelector('.mvd-katalog__param-wartosc')).not.toBeNull();
  });
});
