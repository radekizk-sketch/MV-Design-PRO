import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfilNapiecChart } from '../ProfilNapiecChart';
import { ROZPLYW_STRINGS } from '../strings';
import { naProfilNapiec } from '../adapters/rozplywAdapter';
import { powerFlowResultFixture } from './fixtures';

const punkty = naProfilNapiec(powerFlowResultFixture().bus_results);

describe('ProfilNapiecChart — wykres Recharts (tokeny --mvd-*, deterministyczny)', () => {
  it('renderuje tytuł wykresu i kontener', () => {
    render(<ProfilNapiecChart punkty={punkty} />);
    expect(screen.getByTestId('mvd-rozplyw-wykres')).toBeInTheDocument();
    expect(screen.getByText(ROZPLYW_STRINGS.wykresTytul)).toBeInTheDocument();
  });

  it('kolory wyłącznie przez tokeny var(--mvd-*) — zero literałów hex w SVG', () => {
    const { container } = render(<ProfilNapiecChart punkty={punkty} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const html = svg!.outerHTML;
    expect(html).toContain('var(--mvd-accent)');
    expect(html).toContain('var(--mvd-warn)');
    // Zero hex-owych literałów kolorów wpisanych przez ten komponent
    // (dozwolone jedynie techniczne #fff/none generowane przez samą bibliotekę).
    expect(html).not.toMatch(/#(?:[0-9a-fA-F]{6})\b/);
  });

  it('deterministyczny: dwa rendery tych samych danych → identyczny SVG (po normalizacji id)', () => {
    // Recharts nadaje techniczne, inkrementalne id (clipPath) per montaż —
    // to artefakt biblioteki, nie danych. Normalizacja id izoluje test na
    // GEOMETRII i WARTOŚCIACH (Determinism Rule: same wejście → same wyjście).
    const normalizuj = (svg: string) => svg.replace(/recharts\d+/g, 'recharts-id');
    const a = render(<ProfilNapiecChart punkty={punkty} />);
    const svgA = normalizuj(a.container.querySelector('svg')!.outerHTML);
    a.unmount();
    const b = render(<ProfilNapiecChart punkty={punkty} />);
    const svgB = normalizuj(b.container.querySelector('svg')!.outerHTML);
    expect(svgA).toBe(svgB);
  });

  it('oś X niesie identyfikatory szyn z danych (zero losowości)', () => {
    const { container } = render(<ProfilNapiecChart punkty={punkty} />);
    const tekstSvg = container.querySelector('svg')!.textContent ?? '';
    expect(tekstSvg).toContain('SZ-GPZ');
    expect(tekstSvg).toContain('SZ-ST2');
  });
});
