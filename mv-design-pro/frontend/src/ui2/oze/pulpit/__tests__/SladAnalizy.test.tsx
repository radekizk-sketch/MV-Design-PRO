/**
 * SladAnalizy — symbol wielkości wyłącznie KaTeX-em (`ui_math_guard`, karta UX-04/ZU).
 *
 * Iloczyn cech: {krok z wzorem i identyfikatorem backendu z gołym indeksem (`ΣQ_zrodla`),
 * krok lokalny bez wzoru z nazwą prozą} × {podstawienie z wzorem `$…$`, podstawienie prozą}.
 * Identyfikator `symbol` jest kluczem kroku, nie tekstem dla projektanta: przy wzorze ekran
 * pokazuje etykietę „Wzór” i wzór KaTeX; nazwę pokazuje tylko krok bez wzoru.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SladAnalizy } from '../SladAnalizy';
import { PULPIT_STRINGS } from '../strings';

const KROK_BACKENDU = {
  symbol: 'ΣQ_zrodla',
  formula_latex: '\\sum Q_{źródła} = \\sum_i Q_{akt,i}',
  substitution_pl: '$Q_{\\mathrm{gen}}$ = 1,2 Mvar',
  result_pl: 'netto 1,2 Mvar',
};
const KROK_LOKALNY = {
  symbol: 'konwencja znaku',
  formula_latex: '',
  substitution_pl: 'generacja dodatnia',
  result_pl: 'przyjęto konwencję odbiornikową',
};

describe('SladAnalizy — symbol kroku', () => {
  it('krok z wzorem: etykieta „Wzór”, wzór KaTeX, identyfikator backendu nie na ekranie', () => {
    render(<SladAnalizy kroki={[KROK_BACKENDU, KROK_LOKALNY]} />);
    const lista = screen.getByTestId('mvd-oze-slad-kroki');
    const latexy = Array.from(lista.querySelectorAll('[data-testid="math-rendered"]')).map(
      (wezel) => wezel.getAttribute('data-latex'),
    );
    expect(latexy).toContain(KROK_BACKENDU.formula_latex);
    expect(latexy).toContain('$Q_{\\mathrm{gen}}$');
    expect(lista.textContent).toContain(PULPIT_STRINGS.sladWzor);
    expect(lista.textContent).not.toContain('ΣQ_zrodla');
    expect(lista.textContent).not.toContain(`(${KROK_BACKENDU.symbol})`);
  });

  it('krok bez wzoru: nazwa prozą jest etykietą kroku', () => {
    render(<SladAnalizy kroki={[KROK_LOKALNY]} />);
    const lista = screen.getByTestId('mvd-oze-slad-kroki');
    expect(lista.textContent).toContain('konwencja znaku');
    expect(lista.textContent).toContain('generacja dodatnia');
    expect(lista.querySelector('[data-testid="math-rendered"]')).toBeNull();
  });
});
