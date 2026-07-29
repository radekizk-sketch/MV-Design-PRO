import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { InspectorPanel } from '../InspectorPanel';
import { INSPECTOR_STRINGS } from '../strings';
import { resetPinStore, szyna } from './fixtures';
import type { InspectorPanelProps } from '../inspectorModel';

const INSPECTOR_DIR = join(process.cwd(), 'src', 'ui2', 'inspector');

function props(over: Partial<InspectorPanelProps> = {}): InspectorPanelProps {
  return {
    obiekt: szyna(),
    rewizjaModelu: 215,
    onOtworzDowod: vi.fn(),
    onNawiguj: vi.fn(),
    onPrzelicz: vi.fn(),
    trybZaawansowania: 'basic',
    ...over,
  };
}

describe('InspectorPanel — stany', () => {
  beforeEach(resetPinStore);

  it('brak selekcji: pokazuje „Zaznacz obiekt, aby zobaczyć szczegóły"', () => {
    render(<InspectorPanel {...props({ obiekt: null })} />);
    expect(screen.getByTestId('mvd-inspector-empty')).toHaveTextContent(
      INSPECTOR_STRINGS.brakSelekcji,
    );
  });

  it('renderuje nazwę i etykietę typu obiektu na pierwszym planie', () => {
    render(<InspectorPanel {...props()} />);
    expect(screen.getByText('Szyna GPZ 15 kV')).toBeInTheDocument();
    expect(screen.getByText('Szyna')).toBeInTheDocument();
  });

  it('zakładka Wyniki pusta → „Brak wyników dla tego obiektu"', () => {
    render(<InspectorPanel {...props({ obiekt: szyna({ wyniki: [], rewizjaWynikow: undefined }) })} />);
    fireEvent.click(screen.getByRole('tab', { name: INSPECTOR_STRINGS.tabWyniki }));
    expect(screen.getByTestId('mvd-inspector-wyniki-empty')).toHaveTextContent(
      INSPECTOR_STRINGS.brakWynikow,
    );
  });

  it('wynik nieaktualny: FreshnessBadge + „Przelicz" wywołuje onPrzelicz', () => {
    const onPrzelicz = vi.fn();
    render(<InspectorPanel {...props({ rewizjaModelu: 216, onPrzelicz })} />);
    fireEvent.click(screen.getByRole('tab', { name: INSPECTOR_STRINGS.tabWyniki }));
    const freshness = screen.getByTestId('mvd-inspector-wyniki-freshness');
    expect(freshness).toBeInTheDocument();
    fireEvent.click(within(freshness).getByText(INSPECTOR_STRINGS.przelicz));
    expect(onPrzelicz).toHaveBeenCalled();
  });
});

describe('InspectorPanel — zakładki', () => {
  beforeEach(resetPinStore);

  it('lista zakładek: role="tablist" i cztery stałe zakładki w kolejności', () => {
    render(<InspectorPanel {...props()} />);
    const tabs = within(screen.getAllByRole('tablist')[0]).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      INSPECTOR_STRINGS.tabWlasciwosci,
      INSPECTOR_STRINGS.tabWyniki,
      INSPECTOR_STRINGS.tabDowod,
      INSPECTOR_STRINGS.tabPowiazania,
    ]);
  });

  it('klik zakładki Powiązania pokazuje listy nawigacyjne', () => {
    render(<InspectorPanel {...props()} />);
    fireEvent.click(screen.getByRole('tab', { name: INSPECTOR_STRINGS.tabPowiazania }));
    expect(screen.getByText('Transformator T1')).toBeInTheDocument();
  });

  it('nawigacja klawiaturą ←/→ przełącza aktywną zakładkę', () => {
    render(<InspectorPanel {...props()} />);
    const wlasciwosci = screen.getByRole('tab', { name: INSPECTOR_STRINGS.tabWlasciwosci });
    expect(wlasciwosci).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getAllByRole('tablist')[0], { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: INSPECTOR_STRINGS.tabWyniki })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('tabpanel powiązany z aktywną zakładką (aria-labelledby)', () => {
    render(<InspectorPanel {...props()} />);
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toContain('tab-wlasciwosci');
  });
});

describe('InspectorPanel — zakładka Dowód', () => {
  beforeEach(resetPinStore);

  it('„Pokaż dowód" wywołuje onOtworzDowod(ref)', () => {
    const onOtworzDowod = vi.fn();
    render(<InspectorPanel {...props({ onOtworzDowod })} />);
    fireEvent.click(screen.getByRole('tab', { name: INSPECTOR_STRINGS.tabDowod }));
    fireEvent.click(screen.getByText(INSPECTOR_STRINGS.pokazDowod));
    expect(onOtworzDowod).toHaveBeenCalledWith('proof-sc3f-bus7');
  });

  it('brak dowodów → stan pusty', () => {
    render(<InspectorPanel {...props({ obiekt: szyna({ dowody: [] }) })} />);
    fireEvent.click(screen.getByRole('tab', { name: INSPECTOR_STRINGS.tabDowod }));
    expect(screen.getByText(INSPECTOR_STRINGS.brakDowodow)).toBeInTheDocument();
  });
});

describe('InspectorPanel — pinezka i podział', () => {
  beforeEach(resetPinStore);

  it('„Przypnij" tworzy podział: przypięty na górze, bieżąca selekcja na dole', () => {
    const { rerender } = render(<InspectorPanel {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-insp-single-pin'));

    const split = screen.getByTestId('mvd-inspector-split');
    expect(split).toBeInTheDocument();
    expect(within(split).getByText(INSPECTOR_STRINGS.sekcjaPrzypiety)).toBeInTheDocument();
    expect(within(split).getByText(INSPECTOR_STRINGS.sekcjaBiezacy)).toBeInTheDocument();

    // zmiana selekcji: dół pokazuje nowy obiekt, góra pozostaje przypięta
    rerender(<InspectorPanel {...props({ obiekt: szyna({ id: 'BUS-9', nazwa: 'Szyna 20 kV' }) })} />);
    expect(screen.getByText('Szyna GPZ 15 kV')).toBeInTheDocument();
    expect(screen.getByText('Szyna 20 kV')).toBeInTheDocument();
  });

  it('„Odepnij" wraca do pojedynczego widoku', () => {
    render(<InspectorPanel {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-insp-single-pin'));
    expect(screen.getByTestId('mvd-inspector-split')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-insp-pinned-pin'));
    expect(screen.queryByTestId('mvd-inspector-split')).not.toBeInTheDocument();
  });

  it('skrót „P" przełącza pinezkę bieżącej selekcji', () => {
    render(<InspectorPanel {...props()} />);
    fireEvent.keyDown(screen.getByTestId('mvd-inspector-panel'), { key: 'p' });
    expect(screen.getByTestId('mvd-inspector-split')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('mvd-inspector-panel'), { key: 'p' });
    expect(screen.queryByTestId('mvd-inspector-split')).not.toBeInTheDocument();
  });
});

describe('InspectorPanel — tryb ekspercki', () => {
  beforeEach(resetPinStore);

  it('tryb podstawowy: „Szczegóły techniczne" i identyfikatory ukryte', () => {
    render(<InspectorPanel {...props({ trybZaawansowania: 'basic' })} />);
    expect(screen.queryByText(INSPECTOR_STRINGS.szczegolyTechniczne)).not.toBeInTheDocument();
    expect(screen.queryByText('BUS-7')).not.toBeInTheDocument();
  });

  it('tryb ekspercki: „Szczegóły techniczne" z identyfikatorem technicznym', () => {
    render(<InspectorPanel {...props({ trybZaawansowania: 'expert' })} />);
    expect(screen.getByText(INSPECTOR_STRINGS.szczegolyTechniczne)).toBeInTheDocument();
    expect(screen.getByText('BUS-7')).toBeInTheDocument();
  });
});

describe('InspectorPanel — higiena (zero hex, determinizm)', () => {
  const sourceFiles = readdirSync(INSPECTOR_DIR).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));

  for (const file of sourceFiles) {
    it(`${file}: brak literałów hex koloru`, () => {
      const source = readFileSync(join(INSPECTOR_DIR, file), 'utf8');
      const hex = source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(hex).toEqual([]);
    });

    it(`${file}: brak Date.now()/Math.random() (determinizm)`, () => {
      const source = readFileSync(join(INSPECTOR_DIR, file), 'utf8');
      expect(source).not.toMatch(/Date\.now|Math\.random/);
    });
  }

  it('inspector.css: kolory wyłącznie przez var(--mvd-*), brak hex', () => {
    const css = readFileSync(join(INSPECTOR_DIR, 'inspector.css'), 'utf8');
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });
});
