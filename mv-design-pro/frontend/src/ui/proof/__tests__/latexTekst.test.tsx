/**
 * Jedna funkcja konwersji zapisu LaTeX symbolu dla miejsc bez KaTeX-a (`latexTekst.ts`) —
 * iloczyn cech: {indeks prosty, indeks w klamrach, prim podwójny przed indeksem, polecenie
 * greckie w indeksie, indeks górny, polecenie formatu `\mathrm`, ucieczka `\%`, odstęp `\,`,
 * operator} × {odczyt jednym ciągiem (`latexNaTekst`), segmenty SVG (`latexNaSegmentySvg`)
 * i `<tspan>` z `baseline-shift` (`TekstSvgZWzorami`)}.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { latexNaSegmentySvg, latexNaTekst, rozwinStrukture, type SegmentSvg } from '../latexTekst';
import { MathBlock, MathInline } from '../MathRenderer';
import { TekstSvgZWzorami, TspanyWzoru } from '../TekstSvgZWzorami';

const PRZYPADKI: ReadonlyArray<{
  readonly cecha: string;
  readonly latex: string;
  readonly tekst: string;
  readonly segmenty: SegmentSvg[];
}> = [
  {
    cecha: 'indeks prosty',
    latex: 'U_f',
    tekst: 'Uf',
    segmenty: [
      { tekst: 'U', poziom: 'bazowy' },
      { tekst: 'f', poziom: 'dolny' },
    ],
  },
  {
    cecha: 'indeks w klamrach',
    latex: 'P_{max}',
    tekst: 'Pmax',
    segmenty: [
      { tekst: 'P', poziom: 'bazowy' },
      { tekst: 'max', poziom: 'dolny' },
    ],
  },
  {
    cecha: 'prim podwójny przed indeksem',
    latex: "I''_{k}",
    tekst: 'I″k',
    segmenty: [
      { tekst: 'I″', poziom: 'bazowy' },
      { tekst: 'k', poziom: 'dolny' },
    ],
  },
  {
    cecha: 'polecenie greckie w indeksie',
    latex: 'I_{\\Delta n}',
    tekst: 'IΔn',
    segmenty: [
      { tekst: 'I', poziom: 'bazowy' },
      { tekst: 'Δn', poziom: 'dolny' },
    ],
  },
  {
    cecha: 'polecenie greckie bazowe z indeksem',
    latex: '\\cos\\varphi_n',
    tekst: 'cosφn',
    segmenty: [
      { tekst: 'cosφ', poziom: 'bazowy' },
      { tekst: 'n', poziom: 'dolny' },
    ],
  },
  {
    cecha: 'indeks górny',
    latex: 'I^2 t',
    tekst: 'I2 t',
    segmenty: [
      { tekst: 'I', poziom: 'bazowy' },
      { tekst: '2', poziom: 'gorny' },
      { tekst: ' t', poziom: 'bazowy' },
    ],
  },
  {
    cecha: 'polecenie formatu w indeksie',
    latex: 'U_{\\mathrm{zad}}',
    tekst: 'Uzad',
    segmenty: [
      { tekst: 'U', poziom: 'bazowy' },
      { tekst: 'zad', poziom: 'dolny' },
    ],
  },
  {
    cecha: 'ucieczka i odstęp',
    latex: '10\\,\\%\\ U_n',
    tekst: '10 % Un',
    segmenty: [
      { tekst: '10 % U', poziom: 'bazowy' },
      { tekst: 'n', poziom: 'dolny' },
    ],
  },
  {
    cecha: 'operator',
    latex: 'c \\cdot U_n',
    tekst: 'c · Un',
    segmenty: [
      { tekst: 'c · U', poziom: 'bazowy' },
      { tekst: 'n', poziom: 'dolny' },
    ],
  },
];

describe('latexTekst — jedna konwersja symbolu dla miejsc bez KaTeX-a', () => {
  it.each(PRZYPADKI)('$cecha: odczyt jednym ciągiem', ({ latex, tekst }) => {
    expect(latexNaTekst(latex)).toBe(tekst);
  });

  it.each(PRZYPADKI)('$cecha: segmenty SVG', ({ latex, segmenty }) => {
    expect(latexNaSegmentySvg(latex)).toEqual(segmenty);
  });

  it.each(PRZYPADKI)('$cecha: odczyt jednym ciągiem = złączone segmenty SVG', ({ latex }) => {
    const zlaczone = latexNaSegmentySvg(latex)
      .map((segment) => segment.tekst)
      .join('');
    expect(zlaczone.replace(/\s+/g, ' ').trim()).toBe(latexNaTekst(latex));
  });

  it('segmenty nie niosą zapisu LaTeX (`_`, `^`, `{`, `}`, `\\`)', () => {
    for (const { latex } of PRZYPADKI) {
      for (const segment of latexNaSegmentySvg(latex)) {
        expect(segment.tekst).not.toMatch(/[_^{}\\]/);
      }
    }
  });
});

describe('TekstSvgZWzorami — indeks jako <tspan> z baseline-shift', () => {
  it('indeks dolny i górny są tspanami z przesunięciem linii bazowej', () => {
    const { container } = render(
      <svg>
        <text>
          <TspanyWzoru latex="$I''_{k}$" />
        </text>
        <text>
          <TspanyWzoru latex="I^2" />
        </text>
      </svg>,
    );
    const dolny = container.querySelector('[data-indeks="dolny"]');
    const gorny = container.querySelector('[data-indeks="gorny"]');
    expect(dolny?.tagName.toLowerCase()).toBe('tspan');
    expect(dolny?.getAttribute('baseline-shift')).toBe('sub');
    expect(dolny?.textContent).toBe('k');
    expect(gorny?.getAttribute('baseline-shift')).toBe('super');
    expect(container.textContent).not.toMatch(/[_^{}$\\]/);
  });

  it('proza zostaje tekstem, segmenty $…$ stają się tspanami symbolu', () => {
    const { container } = render(
      <svg>
        <text data-testid="os">
          <TekstSvgZWzorami tekst="Prąd $I''_{k}$ [kA] przy $U_n$" />
        </text>
      </svg>,
    );
    const tekst = container.querySelector('[data-testid="os"]');
    expect(tekst?.textContent).toBe('Prąd I″k [kA] przy Un');
    expect(tekst?.querySelectorAll('[data-indeks="dolny"]')).toHaveLength(2);
  });
});

/**
 * Ułamek i pierwiastek w zapisie liniowym (`rozwinStrukture`) — iloczyn cech: {ułamek,
 * pierwiastek z grupą, pierwiastek stopnia n, struktura zagnieżdżona} × {człon pojedynczy (bez
 * nawiasu), człon złożony (z nawiasem)} × {odczyt jednym ciągiem, segmenty SVG}.
 */
const STRUKTURY: ReadonlyArray<{
  readonly cecha: string;
  readonly latex: string;
  readonly tekst: string;
}> = [
  { cecha: 'ułamek członów pojedynczych', latex: '\\frac{1}{2}', tekst: '1/2' },
  { cecha: 'ułamek członów złożonych', latex: '\\frac{a+b}{c \\cdot d}', tekst: '(a+b)/(c · d)' },
  {
    cecha: 'ułamek z pierwiastkiem w mianowniku',
    latex: "I''_k = \\frac{c \\cdot U_n}{\\sqrt{3} \\cdot Z_k}",
    tekst: 'I″k = (c · Un)/(√3 · Zk)',
  },
  { cecha: 'pierwiastek z członu pojedynczego', latex: '\\sqrt{3}', tekst: '√3' },
  { cecha: 'pierwiastek z członu złożonego', latex: '\\sqrt{a+b}', tekst: '√(a+b)' },
  { cecha: 'pierwiastek stopnia n', latex: '\\sqrt[3]{x_1}', tekst: '3√x1' },
  { cecha: 'dfrac jak frac', latex: '\\dfrac{U}{2}', tekst: 'U/2' },
];

describe('rozwinStrukture — ułamek i pierwiastek w odczycie liniowym', () => {
  it.each(STRUKTURY)('$cecha: odczyt jednym ciągiem', ({ latex, tekst }) => {
    expect(latexNaTekst(latex)).toBe(tekst);
  });

  it.each(STRUKTURY)('$cecha: segmenty SVG składają ten sam odczyt', ({ latex, tekst }) => {
    const zlaczone = latexNaSegmentySvg(latex)
      .map((segment) => segment.tekst)
      .join('');
    expect(zlaczone.replace(/\s+/g, ' ').trim()).toBe(tekst);
  });

  it('po rozwinięciu nie zostaje polecenie ułamka ani pierwiastka z argumentem', () => {
    for (const { latex } of STRUKTURY) {
      expect(rozwinStrukture(latex)).not.toMatch(/\\d?frac|\\sqrt\[/);
    }
  });

  it('`\\\\` (nowa linia) nie jest brany za polecenie', () => {
    expect(rozwinStrukture('a \\\\ \\frac{1}{2}')).toBe('a \\\\ {1}/{2}');
  });
});

/**
 * MathRenderer — wzór jest widoczny dla czytnika ekranu i nazwy dostępnej (KaTeX `html` ukrywa
 * swój znacznik `aria-hidden`) i nie podlega `text-transform` kontenera. Iloczyn: {inline, block}
 * × {zapis z ogranicznikami, bez nich}.
 */
describe('MathRenderer — odczyt wzoru i niezależność od wielkości liter kontenera', () => {
  it.each([
    { tryb: 'inline', latex: 'I_{th}', element: <MathInline latex="I_{th}" /> },
    { tryb: 'inline z $…$', latex: '$I_{\\Delta n}$', element: <MathInline latex="$I_{\Delta n}$" /> },
    { tryb: 'block', latex: '$$\\frac{U}{2}$$', element: <MathBlock latex="$$\frac{U}{2}$$" /> },
  ])('$tryb: role="math", aria-label = latexNaTekst, normal-case', ({ latex, element }) => {
    const { getByTestId } = render(element);
    const wzor = getByTestId('math-rendered');
    expect(wzor.getAttribute('role')).toBe('math');
    const tresc = latex.replace(/^\$+|\$+$/g, '');
    expect(wzor.getAttribute('aria-label')).toBe(latexNaTekst(tresc));
    expect(wzor.className).toContain('normal-case');
  });

  it('nazwa dostępna przycisku zawiera odczyt wzoru', () => {
    const { getByRole } = render(
      <button type="button">
        Ustaw <MathInline latex="I_{th}" />
      </button>,
    );
    expect(getByRole('button')).toHaveAccessibleName(/^Ustaw\s+Ith$/);
  });
});
