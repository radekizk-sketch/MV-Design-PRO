/**
 * Czujnik surowego zapisu wzoru (`czujnikSurowychWzorow.ts`) — iloczyn cech:
 * {tekst HTML, tekst SVG `<text>`, atrybut opisowy (`title`, `aria-label`), zmiana treści węzła
 * po montażu} × {surowy `$…$` (naruszenie), wzór przez KaTeX/`TekstSvgZWzorami`/`tekstBezWzorow`
 * (bez naruszenia), miejsce zwolnione: `code`, zastępczy `math-fallback`, `data-zrodlo-latex`}.
 * Każdy przypadek woła `naruszeniaSurowychWzorow()` wprost, żeby sprawdzenie po teście (setup)
 * nie oblało testu, który naruszenie wywołuje celowo.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MathInline } from '../../ui/proof/MathRenderer';
import { TekstSvgZWzorami } from '../../ui/proof/TekstSvgZWzorami';
import { TekstZWzorami, tekstBezWzorow } from '../../ui2/kreatory/rama/tekstZWzorami';
import { naruszeniaSurowychWzorow } from '../czujnikSurowychWzorow';

const WZOR = 'Prąd cieplny $I_{th}$ [kA]';

describe('czujnik surowego zapisu wzoru — naruszenia', () => {
  it('tekst HTML z surowym $…$', () => {
    render(<p>{WZOR}</p>);
    expect(naruszeniaSurowychWzorow()).toEqual(['<p> „Prąd cieplny $I_{th}$ [kA]”']);
  });

  it('tekst SVG <text> z surowym $…$', () => {
    render(
      <svg>
        <text>{WZOR}</text>
      </svg>,
    );
    expect(naruszeniaSurowychWzorow()).toHaveLength(1);
  });

  it.each(['title', 'aria-label'])('atrybut %s z surowym $…$', (atrybut) => {
    render(<button type="button" {...{ [atrybut]: WZOR }}>x</button>);
    expect(naruszeniaSurowychWzorow()).toEqual([`<button ${atrybut}> „${WZOR}”`]);
  });

  it('zmiana treści węzła po montażu (characterData)', async () => {
    const { container } = render(<p>bez wzoru</p>);
    expect(naruszeniaSurowychWzorow()).toEqual([]);
    (container.querySelector('p')!.firstChild as Text).data = WZOR;
    expect(naruszeniaSurowychWzorow()).toHaveLength(1);
  });

  it('atrybut ustawiony po montażu', () => {
    const { container } = render(<span>x</span>);
    expect(naruszeniaSurowychWzorow()).toEqual([]);
    container.querySelector('span')!.setAttribute('title', WZOR);
    expect(naruszeniaSurowychWzorow()).toHaveLength(1);
  });
});

describe('czujnik surowego zapisu wzoru — bez naruszenia', () => {
  it('wzór przez KaTeX (TekstZWzorami, MathInline) i atrybut przez tekstBezWzorow', () => {
    render(
      <div title={tekstBezWzorow(WZOR)}>
        <TekstZWzorami tekst={WZOR} /> <MathInline latex="I''_{k}" />
      </div>,
    );
    expect(naruszeniaSurowychWzorow()).toEqual([]);
  });

  it('wzór w SVG przez TekstSvgZWzorami', () => {
    render(
      <svg>
        <text>
          <TekstSvgZWzorami tekst={WZOR} />
        </text>
      </svg>,
    );
    expect(naruszeniaSurowychWzorow()).toEqual([]);
  });

  it('zastępczy math-fallback (błędny LaTeX pokazany jako źródło)', () => {
    render(<MathInline latex="$\frac{$" />);
    expect(naruszeniaSurowychWzorow()).toEqual([]);
  });

  it.each([
    ['code', <code key="c">{WZOR}</code>],
    ['data-zrodlo-latex', <div key="d" data-zrodlo-latex><span>{WZOR}</span></div>],
    ['proza z kwotą', <p key="p">Koszt 5 $ i 7 $ netto</p>],
  ])('%s', (_cecha, element) => {
    render(element);
    expect(naruszeniaSurowychWzorow()).toEqual([]);
  });
});
