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
  formula_latex: '\\sum Q_{\\text{źródła}} = \\sum_i Q_{akt,i}',
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

// Iloczyn cech: {weryfikacja jednostek z algebrą (`unit_check_latex`, backend
// `analysis/reactive_adequacy/builder.py`), weryfikacja samym zdaniem (`unit_check_latex: null`)}
// × {krok z wzorem, krok lokalny}. Zdanie zostaje słowami (pole prozy bez LaTeX-u — kontrakt
// `slad_proza_bez_latex_guard`), algebra jednostek renderuje się KaTeX-em, nie tekstem.
describe('SladAnalizy — weryfikacja jednostek', () => {
  const ALGEBRA = '\\mathrm{Mvar} - \\mathrm{Mvar} = \\mathrm{Mvar}';
  const ZDANIE = 'Zgodność jednostek: różnica mocy biernych w megawarach jest mocą bierną w megawarach.';
  const ZDANIE_BEZ_ALGEBRY =
    'Zgodność jednostek: rezerwa mocy biernej i tolerancja nasycenia są w megawarach — porównanie wielkości tej samej jednostki.';
  it.each([
    ['krok lokalny', KROK_LOKALNY, ZDANIE, ALGEBRA, 1],
    ['krok lokalny', KROK_LOKALNY, ZDANIE_BEZ_ALGEBRY, null, 0],
    ['krok z wzorem', KROK_BACKENDU, ZDANIE, ALGEBRA, 1],
    ['krok z wzorem', KROK_BACKENDU, ZDANIE_BEZ_ALGEBRY, null, 0],
  ] as const)('%s × „%s" (wzór %s) → wzorów KaTeX w polu jednostek: %i', (_rodzaj, krok, zdanie, latex, wzorow) => {
    render(<SladAnalizy kroki={[{ ...krok, unit_check_pl: zdanie, unit_check_latex: latex }]} />);
    const pole = screen.getByText(PULPIT_STRINGS.sladJednostki).parentElement as HTMLElement;
    const latexy = Array.from(pole.querySelectorAll('[data-testid="math-rendered"]')).map((w) =>
      w.getAttribute('data-latex'),
    );
    expect(latexy).toHaveLength(wzorow);
    expect(pole.textContent).toContain(zdanie);
    if (wzorow > 0) expect(latexy[0]).toBe(ALGEBRA);
    expect(pole.textContent).not.toContain('Mvar - Mvar = Mvar');
    expect(pole.textContent).not.toContain('Mvar − Mvar = Mvar');
  });
});
