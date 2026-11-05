/*
 * Karta PROZA-BEZ-SYMBOLI-ASCII — krok tekstowy śladu (SladWywodu, SladSekcyjny) składa
 * segment `$…$` prozy backendu KaTeX-em, nigdy nie pokazuje surowego `$I_{od}$` ani `I_od`.
 * ILOCZYN CECH: {SladWywodu, SladSekcyjny} × {krok z segmentem, krok bez segmentu}.
 * Wstrzyknięta regresja (powrót do `<code>{krok.tekst}</code>`) czerwieni oba przypadki
 * z segmentem — sprawdzone przy wdrożeniu karty.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SladWywodu } from '../SladWywodu';
import { SladSekcyjny } from '../SladSekcyjny';

const Z_SEGMENTEM = 'Dane: |$I_{od}$| = 0,0808 kA (wynik rozpływu)';
const BEZ_SEGMENTU = 'Wynik: obciążenie = 134,74 %';

function sprawdzKroki(kontener: HTMLElement) {
  const kroki = Array.from(kontener.querySelectorAll('li'));
  expect(kroki).toHaveLength(2);
  const [zSegmentem, bezSegmentu] = kroki;
  expect(zSegmentem.textContent).not.toContain('$');
  expect(zSegmentem.textContent).not.toContain('I_{od}');
  expect(zSegmentem.querySelector('.katex')).not.toBeNull();
  expect(zSegmentem.textContent).toContain('0,0808 kA (wynik rozpływu)');
  expect(bezSegmentu.textContent).toBe(BEZ_SEGMENTU);
  expect(bezSegmentu.querySelector('.katex')).toBeNull();
}

describe('Ślad obliczeń — proza z segmentem wzoru', () => {
  const kroki = [
    { tekst: Z_SEGMENTEM, latex: null },
    { tekst: BEZ_SEGMENTU, latex: null },
  ];

  it('SladWywodu składa segment $…$ kroku tekstowego KaTeX-em', () => {
    render(<SladWywodu kroki={kroki} testIdPrefix="mvd-test-proza" />);
    fireEvent.click(screen.getByTestId('mvd-test-proza-btn'));
    sprawdzKroki(screen.getByTestId('mvd-test-proza'));
  });

  it('SladSekcyjny składa segment $…$ kroku tekstowego KaTeX-em', () => {
    const { container } = render(
      <SladSekcyjny
        sekcje={[{ tytul: 'Obciążenie gałęzi', kroki, norma: 'IEC 60287' }]}
        testIdPrefix="mvd-test-proza-sekcje"
      />,
    );
    fireEvent.click(screen.getByTestId('mvd-test-proza-sekcje-btn'));
    fireEvent.click(screen.getByTestId('mvd-test-proza-sekcje-sekcja-btn-0'));
    const lista = container.querySelector('ol');
    expect(lista).not.toBeNull();
    sprawdzKroki(lista as HTMLElement);
  });
});
