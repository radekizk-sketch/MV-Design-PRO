import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WykresIkssChart } from '../WykresIkssChart';
import { ZWARCIA_STRINGS } from '../strings';
import { naSlupkiIkss } from '../zwarciaModel';
import { shortCircuitResultsFixture } from './fixtures';

const slupki = naSlupkiIkss(shortCircuitResultsFixture().rows);

describe('WykresIkssChart — słupki Recharts (tokeny --mvd-*, deterministyczny)', () => {
  it('renderuje tytuł wykresu i kontener', () => {
    render(<WykresIkssChart slupki={slupki} />);
    expect(screen.getByTestId('mvd-zwarcia-wykres')).toBeInTheDocument();
    expect(screen.getByText(ZWARCIA_STRINGS.wykresTytul)).toBeInTheDocument();
  });

  it('kolory wyłącznie przez tokeny var(--mvd-*) — zero literałów hex w SVG', () => {
    const { container } = render(<WykresIkssChart slupki={slupki} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const html = svg!.outerHTML;
    expect(html).toContain('var(--mvd-accent)');
    expect(html).not.toMatch(/#(?:[0-9a-fA-F]{6})\b/);
  });

  it('deterministyczny: dwa rendery tych samych danych → identyczny SVG (po normalizacji id)', () => {
    const normalizuj = (svg: string) => svg.replace(/recharts\d+/g, 'recharts-id');
    const a = render(<WykresIkssChart slupki={slupki} />);
    const svgA = normalizuj(a.container.querySelector('svg')!.outerHTML);
    a.unmount();
    const b = render(<WykresIkssChart slupki={slupki} />);
    const svgB = normalizuj(b.container.querySelector('svg')!.outerHTML);
    expect(svgA).toBe(svgB);
  });

  it('oś X niesie nazwy punktów zwarcia z danych (zero losowości)', () => {
    const { container } = render(<WykresIkssChart slupki={slupki} />);
    const tekstSvg = container.querySelector('svg')!.textContent ?? '';
    expect(tekstSvg).toContain('Szyna GPZ 15 kV');
    expect(tekstSvg).toContain('Szyna ST1 15 kV');
  });
});
