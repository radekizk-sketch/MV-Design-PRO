/**
 * Test uczciwego stanu zerowego spadku napięcia (karta W3-J, 2026-09-16) —
 * ZASTĘPUJE `WykresSpadku.test.tsx` (usunięty razem z fabrykowaną krzywą).
 * Iloczyn cech: {tekst uczciwego stanu obecny} × {akcja realna, nie fabrykacja}
 * × {ŻADEN literał progu napięciowego renderowany}.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StanSpadkuNapiecia } from '../StanSpadkuNapiecia';
import { MAGISTRALA_STRINGS as T } from '../strings';

afterEach(cleanup);

describe('StanSpadkuNapiecia — uczciwy stan zerowy (zamiast fabrykowanej krzywej)', () => {
  it('pokazuje komunikat: spadek policzy rozpływ po zapisaniu magistrali', () => {
    render(<StanSpadkuNapiecia />);
    expect(screen.getByText(T.spadekNiedostepnyTytul)).toBeInTheDocument();
    expect(screen.getByText(T.spadekNiedostepnyOpis)).toBeInTheDocument();
  });

  it('nie renderuje żadnego elementu SVG/wykresu (zero liczenia w UI)', () => {
    const { container } = render(<StanSpadkuNapiecia />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.mvd-wykres-svg')).toBeNull();
  });

  it('pokazuje akcję uruchomienia rozpływu z rejestru akcjeStanuZerowego (realny tor, nie fabrykacja)', () => {
    render(<StanSpadkuNapiecia />);
    const przycisk = screen.getByTestId('mvd-kreator-magistrala-spadek-stan-akcja');
    expect(przycisk).toBeInTheDocument();
    expect(przycisk.textContent).not.toBe('');
  });

  it('nie renderuje żadnego literału progu napięciowego (0,95/1,05/0,90/1,10)', () => {
    const { container } = render(<StanSpadkuNapiecia />);
    const tekst = container.textContent ?? '';
    for (const zakazany of ['0,95', '0.95', '1,05', '1.05', '0,90', '0.90', '1,10', '1.10']) {
      expect(tekst).not.toContain(zakazany);
    }
  });
});
