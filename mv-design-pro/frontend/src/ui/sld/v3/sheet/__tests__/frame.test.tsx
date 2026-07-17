/**
 * SLD V3 F4 — wyrocznie ramki arkusza (SLD_CAD_SPEC_V3 §2/§10).
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { rectsOverlap, type V3Rect } from '../../core/grid';
import { computeLegendRowLayout, SheetFrame, type SheetLegendEntry } from '../Frame';

describe('V3 sheet — SheetFrame (spec §2: strefy referencyjne co 400px)', () => {
  it('1600×800 (4 kolumny × 2 wiersze) ⇒ znaczniki stref 1..4 i A..B obecne', () => {
    const { container } = render(<SheetFrame width={1600} height={800} scaleLabel="1:1000" />);
    for (let i = 1; i <= 4; i++) {
      expect(container.querySelector(`[data-testid="sld-sheet-zone-col-${i}"]`)).toBeTruthy();
    }
    expect(container.querySelector('[data-testid="sld-sheet-zone-row-A"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-sheet-zone-row-B"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-sheet-zone-col-5"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="sld-sheet-zone-row-C"]')).toBeFalsy();
  });

  it('rozmiar niebędący wielokrotnością 400 ⇒ ostatnia strefa nadal wyznaczona (ceil)', () => {
    const { container } = render(<SheetFrame width={900} height={500} scaleLabel="1:500" />);
    // ceil(900/400)=3, ceil(500/400)=2
    expect(container.querySelector('[data-testid="sld-sheet-zone-col-3"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-sheet-zone-row-B"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-sheet-zone-col-4"]')).toBeFalsy();
  });

  it('ramka i obszar rysunku obecne, wymiary SVG uwzględniają margines', () => {
    const { container } = render(<SheetFrame width={800} height={400} scaleLabel="1:1000" />);
    const border = container.querySelector('[data-testid="sld-sheet-border"]');
    expect(border?.getAttribute('width')).toBe('800');
    expect(border?.getAttribute('height')).toBe('400');
    const svg = container.querySelector('[data-testid="sld-sheet-frame"]');
    expect(Number(svg?.getAttribute('width'))).toBeGreaterThan(800);
    expect(Number(svg?.getAttribute('height'))).toBeGreaterThan(400);
  });
});

describe('V3 sheet — SheetFrame (etykieta skali)', () => {
  it('renderuje etykietę skali z przekazanym tekstem', () => {
    const { container } = render(<SheetFrame width={800} height={400} scaleLabel="1:250" />);
    const label = container.querySelector('[data-testid="sld-sheet-scale-label"]');
    expect(label?.textContent).toBe('Skala 1:250');
  });
});

describe('V3 sheet — SheetFrame (legenda, spec §2: symbole i linie)', () => {
  it('legenda domyślna renderuje ≥6 glifów symboli oraz wpisy linii', () => {
    const { container } = render(<SheetFrame width={800} height={400} scaleLabel="1:1000" />);
    const legend = container.querySelector('[data-testid="sld-sheet-legend"]');
    expect(legend).toBeTruthy();
    const glyphNodes = legend!.querySelectorAll('[data-symbol-canon]');
    expect(glyphNodes.length).toBeGreaterThanOrEqual(6);
    expect(container.querySelector('[data-testid="sld-sheet-legend-line-cable"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-sheet-legend-line-overhead"]')).toBeTruthy();
  });

  it('legenda niestandardowa (custom entries) nadpisuje domyślną', () => {
    const { container } = render(
      <SheetFrame
        width={800}
        height={400}
        scaleLabel="1:1000"
        legend={[{ kind: 'symbol', id: 'breaker', labelPl: 'Wyłącznik' }]}
      />,
    );
    const legend = container.querySelector('[data-testid="sld-sheet-legend"]');
    expect(legend!.querySelectorAll('[data-symbol-canon]').length).toBe(1);
  });

  it(
    'D1/k5a: wiersze legendy domyślnej ROZŁĄCZNE geometrycznie — glif WYŻSZY niż ' +
      'wiersz minimalny (fuseSwitch 32px, transformer2W 40px) NIE zachodzi na wiersz niżej ' +
      '(regresja: dawny stały krok 24px nadpisywał kolejny wiersz)',
    () => {
      const { container } = render(<SheetFrame width={800} height={400} scaleLabel="1:1000" />);
      const legend = container.querySelector('[data-testid="sld-sheet-legend"]')!;
      const entries: SheetLegendEntry[] = Array.from(
        legend.querySelectorAll('[data-testid^="sld-sheet-legend-item-"]'),
      ).map((item) => ({
        kind: item.querySelector('[data-symbol-canon]') ? 'symbol' : 'line',
        id: item.getAttribute('data-testid')!.replace('sld-sheet-legend-item-', ''),
        labelPl: '',
      }));
      expect(entries.length).toBeGreaterThanOrEqual(9); // 7 symbole + 2 linie (default)

      const rows = computeLegendRowLayout(entries);
      // Pełna szerokość wiersza jest nieistotna dla kolizji Y — używamy tej
      // samej szerokości >0 dla wszystkich wierszy (rectsOverlap sprawdza AND
      // obu osi; x nakłada się celowo, żeby test badał WYŁĄCZNIE osobność Y).
      const rects: V3Rect[] = rows.map((r) => ({ x: 0, y: r.y, width: 100, height: r.height }));
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          expect(rectsOverlap(rects[i], rects[j])).toBe(false);
        }
      }
      // Kontrprzykład samo-chroniący: dawna stała wysokość 24px BY zafailowała
      // dla fuseSwitch(h=32)/transformer2W(h=40) — potwierdzamy, że wysokość
      // wiersza rzeczywiście rośnie względem glifu (nie jest to zawsze 24).
      const tallRow = rows.find((r) => r.entry.id === 'transformer2W');
      expect(tallRow).toBeTruthy();
      expect(tallRow!.height).toBeGreaterThan(24);
    },
  );
});

describe('V3 sheet — SheetFrame (zakaz klas Tailwind w SVG <text>, lekcja z 5a235ce)', () => {
  it('każdy element <text> ma jawny atrybut font-size i font-family, żaden nie ma atrybutu class', () => {
    const { container } = render(<SheetFrame width={1600} height={800} scaleLabel="1:1000" />);
    const texts = container.querySelectorAll('text');
    expect(texts.length).toBeGreaterThan(0);
    texts.forEach((node) => {
      expect(node.getAttribute('font-size')).toBeTruthy();
      expect(node.getAttribute('font-family')).toBeTruthy();
      expect(node.getAttribute('class')).toBeNull();
    });
  });
});

describe('V3 sheet — SheetFrame (title block: slot, NIE duplikacja)', () => {
  it('bez titleBlock: slot nieobecny w DOM', () => {
    const { container } = render(<SheetFrame width={800} height={400} scaleLabel="1:1000" />);
    expect(container.querySelector('[data-testid="sld-sheet-title-block-slot"]')).toBeFalsy();
  });

  it('z titleBlock: renderuje DOKŁADNIE przekazaną zawartość (Frame nic nie duplikuje)', () => {
    const { container } = render(
      <SheetFrame
        width={800}
        height={400}
        scaleLabel="1:1000"
        titleBlock={<g data-testid="fake-title-block"><text fontFamily="sans-serif" fontSize={10}>X</text></g>}
      />,
    );
    const slot = container.querySelector('[data-testid="sld-sheet-title-block-slot"]');
    expect(slot).toBeTruthy();
    expect(slot!.querySelector('[data-testid="fake-title-block"]')).toBeTruthy();
  });

  it('titleBlockOrigin niestandardowe steruje pozycją slotu (transform)', () => {
    const { container } = render(
      <SheetFrame
        width={800}
        height={400}
        scaleLabel="1:1000"
        titleBlock={<g data-testid="fake-title-block" />}
        titleBlockOrigin={{ x: 12, y: 34 }}
      />,
    );
    const slot = container.querySelector('[data-testid="sld-sheet-title-block-slot"]');
    expect(slot?.getAttribute('transform')).toBe('translate(12, 34)');
  });
});

describe('V3 sheet — SheetFrame (treść: dzieci renderowane w obszarze rysunku)', () => {
  it('children trafiają do sheet-content', () => {
    const { container } = render(
      <SheetFrame width={800} height={400} scaleLabel="1:1000">
        <g data-testid="fake-scene" />
      </SheetFrame>,
    );
    const content = container.querySelector('[data-testid="sld-sheet-content"]');
    expect(content?.querySelector('[data-testid="fake-scene"]')).toBeTruthy();
  });
});
