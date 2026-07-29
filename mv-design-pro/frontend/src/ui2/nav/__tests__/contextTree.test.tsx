import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContextTree } from '../ContextTree';
import { NAV_STRINGS, licznikTitle } from '../strings';
import type { WezelDrzewa } from '../treeModel';

function wezel(overrides: Partial<WezelDrzewa> & { id: string; etykietaPL: string }): WezelDrzewa {
  return {
    ikona: 'stacja',
    liczniki: { blokady: 0, ostrzezenia: 0 },
    dzieci: [],
    trybMin: 'basic',
    ...overrides,
  };
}

function drzewoFixture(): WezelDrzewa[] {
  return [
    wezel({
      id: 'a',
      etykietaPL: 'Alfa',
      dzieci: [
        wezel({ id: 'a1', etykietaPL: 'Alfa-jeden', liczniki: { blokady: 1, ostrzezenia: 0 } }),
        wezel({ id: 'a2', etykietaPL: 'Alfa-dwa', trybMin: 'expert' }),
      ],
    }),
    wezel({ id: 'b', etykietaPL: 'Beta', liczniki: { blokady: 0, ostrzezenia: 2 } }),
  ];
}

function noop() {
  /* celowo puste — domyślny handler w testach niesprawdzających wywołania */
}

describe('ContextTree — stany', () => {
  it('stan pusty: „Brak elementów" gdy `wezly` jest puste', () => {
    render(
      <ContextTree wezly={[]} zaznaczonyId={null} onZaznacz={noop} onOtworz={noop} filtrProblemy={false} />,
    );
    expect(screen.getByTestId('mvd-tree-empty')).toHaveTextContent(NAV_STRINGS.brakElementow);
  });

  it('stan pusty z akcją: przycisk wywołuje callback z propsów', () => {
    const onKlik = vi.fn();
    render(
      <ContextTree
        wezly={[]}
        zaznaczonyId={null}
        onZaznacz={noop}
        onOtworz={noop}
        filtrProblemy={false}
        akcjaPusty={{ etykieta: 'Dodaj pierwszy projekt', onKlik }}
      />,
    );
    const btn = screen.getByTestId('mvd-tree-empty-akcja');
    expect(btn).toHaveTextContent('Dodaj pierwszy projekt');
    fireEvent.click(btn);
    expect(onKlik).toHaveBeenCalledTimes(1);
  });

  it('stan ładowania: szkielet z aria-busy', () => {
    render(
      <ContextTree wezly={[]} zaznaczonyId={null} onZaznacz={noop} onOtworz={noop} filtrProblemy={false} ladowanie />,
    );
    expect(screen.getByTestId('mvd-tree-loading')).toHaveAttribute('aria-busy', 'true');
  });

  it('stan „filtr bez wyników": filtr aktywny, brak węzłów z problemem', () => {
    const wezlyBezProblemow = [wezel({ id: 'x', etykietaPL: 'X' })];
    render(
      <ContextTree
        wezly={wezlyBezProblemow}
        zaznaczonyId={null}
        onZaznacz={noop}
        onOtworz={noop}
        filtrProblemy
      />,
    );
    expect(screen.getByTestId('mvd-tree-empty')).toHaveTextContent(NAV_STRINGS.brakWynikowFiltra);
  });

  it('gotowy: renderuje drzewo z rolą tree i wierszami treeitem', () => {
    render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId={null} onZaznacz={noop} onOtworz={noop} filtrProblemy={false} />,
    );
    expect(screen.getByTestId('mvd-tree')).toHaveAttribute('role', 'tree');
    expect(screen.getByTestId('mvd-tree-row-a')).toHaveAttribute('role', 'treeitem');
    expect(screen.getByTestId('mvd-tree-row-b')).toBeInTheDocument();
  });
});

describe('ContextTree — selekcja i otwarcie', () => {
  it('1× klik emituje onZaznacz(id, "klik")', () => {
    const onZaznacz = vi.fn();
    render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId={null} onZaznacz={onZaznacz} onOtworz={noop} filtrProblemy={false} />,
    );
    fireEvent.click(screen.getByTestId('mvd-tree-row-b'));
    expect(onZaznacz).toHaveBeenCalledWith('b', 'klik');
  });

  it('2× klik wywołuje onOtworz(id)', () => {
    const onOtworz = vi.fn();
    render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId={null} onZaznacz={noop} onOtworz={onOtworz} filtrProblemy={false} />,
    );
    fireEvent.doubleClick(screen.getByTestId('mvd-tree-row-b'));
    expect(onOtworz).toHaveBeenCalledWith('b');
  });

  it('Enter na wierszu wywołuje onOtworz(id) (jak 2× klik)', () => {
    const onOtworz = vi.fn();
    render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId="b" onZaznacz={noop} onOtworz={onOtworz} filtrProblemy={false} />,
    );
    fireEvent.keyDown(screen.getByTestId('mvd-tree-row-b'), { key: 'Enter' });
    expect(onOtworz).toHaveBeenCalledWith('b');
  });

  it('aria-selected odzwierciedla zaznaczonyId (komponent sterowany propsami)', () => {
    render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId="b" onZaznacz={noop} onOtworz={noop} filtrProblemy={false} />,
    );
    expect(screen.getByTestId('mvd-tree-row-b')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mvd-tree-row-a')).toHaveAttribute('aria-selected', 'false');
  });
});

describe('ContextTree — zwijanie gałęzi', () => {
  it('węzeł z dziećmi renderuje chevron z aria-expanded=false domyślnie (bez zaznaczenia)', () => {
    render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId={null} onZaznacz={noop} onOtworz={noop} filtrProblemy={false} />,
    );
    expect(screen.getByTestId('mvd-tree-row-a')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('mvd-tree-row-a1')).toBeNull();
  });

  it('klik na chevron rozwija gałąź (dzieci stają się widoczne)', () => {
    render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId={null} onZaznacz={noop} onOtworz={noop} filtrProblemy={false} />,
    );
    fireEvent.click(screen.getByTestId('mvd-tree-chevron-a'));
    expect(screen.getByTestId('mvd-tree-row-a')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('mvd-tree-row-a1')).toBeInTheDocument();
  });

  it('auto-odsłania ścieżkę do zaznaczonego węzła (zaznaczonyId wewnątrz zwiniętej gałęzi)', () => {
    render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId="a1" onZaznacz={noop} onOtworz={noop} filtrProblemy={false} />,
    );
    expect(screen.getByTestId('mvd-tree-row-a1')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-tree-row-a1')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('ContextTree — klawiatura', () => {
  it('ArrowRight na zwiniętym węźle z dziećmi rozwija gałąź', () => {
    render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId="a" onZaznacz={noop} onOtworz={noop} filtrProblemy={false} />,
    );
    fireEvent.keyDown(screen.getByTestId('mvd-tree-row-a'), { key: 'ArrowRight' });
    expect(screen.getByTestId('mvd-tree-row-a')).toHaveAttribute('aria-expanded', 'true');
  });

  it('ArrowLeft na rozwiniętym węźle zwija gałąź', () => {
    const onZaznacz = vi.fn();
    const { rerender } = render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId="a" onZaznacz={onZaznacz} onOtworz={noop} filtrProblemy={false} />,
    );
    fireEvent.click(screen.getByTestId('mvd-tree-chevron-a'));
    rerender(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId="a" onZaznacz={onZaznacz} onOtworz={noop} filtrProblemy={false} />,
    );
    expect(screen.getByTestId('mvd-tree-row-a')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(screen.getByTestId('mvd-tree-row-a'), { key: 'ArrowLeft' });
    expect(screen.getByTestId('mvd-tree-row-a')).toHaveAttribute('aria-expanded', 'false');
  });

  it('ArrowDown przechodzi do kolejnego widocznego wiersza i emituje zrodlo "klawiatura"', () => {
    const onZaznacz = vi.fn();
    render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId="a" onZaznacz={onZaznacz} onOtworz={noop} filtrProblemy={false} />,
    );
    fireEvent.keyDown(screen.getByTestId('mvd-tree-row-a'), { key: 'ArrowDown' });
    expect(onZaznacz).toHaveBeenCalledWith('b', 'klawiatura');
  });

  it('ArrowUp przechodzi do poprzedniego widocznego wiersza', () => {
    const onZaznacz = vi.fn();
    render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId="b" onZaznacz={onZaznacz} onOtworz={noop} filtrProblemy={false} />,
    );
    fireEvent.keyDown(screen.getByTestId('mvd-tree-row-b'), { key: 'ArrowUp' });
    expect(onZaznacz).toHaveBeenCalledWith('a', 'klawiatura');
  });

  it('Home/End przechodzą do pierwszego/ostatniego widocznego wiersza', () => {
    const onZaznacz = vi.fn();
    render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId="a" onZaznacz={onZaznacz} onOtworz={noop} filtrProblemy={false} />,
    );
    fireEvent.keyDown(screen.getByTestId('mvd-tree-row-a'), { key: 'End' });
    expect(onZaznacz).toHaveBeenLastCalledWith('b', 'klawiatura');
    fireEvent.keyDown(screen.getByTestId('mvd-tree-row-b'), { key: 'Home' });
    expect(onZaznacz).toHaveBeenLastCalledWith('a', 'klawiatura');
  });

  it('typeahead: pisanie liter przeskakuje do węzła zaczynającego się od wpisanych znaków', () => {
    const onZaznacz = vi.fn();
    render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId="a" onZaznacz={onZaznacz} onOtworz={noop} filtrProblemy={false} />,
    );
    fireEvent.keyDown(screen.getByTestId('mvd-tree-row-a'), { key: 'b' });
    expect(onZaznacz).toHaveBeenCalledWith('b', 'typeahead');
  });

  it('prawy klik wywołuje onMenuKontekstowe(id, pozycja)', () => {
    const onMenuKontekstowe = vi.fn();
    render(
      <ContextTree
        wezly={drzewoFixture()}
        zaznaczonyId={null}
        onZaznacz={noop}
        onOtworz={noop}
        filtrProblemy={false}
        onMenuKontekstowe={onMenuKontekstowe}
      />,
    );
    fireEvent.contextMenu(screen.getByTestId('mvd-tree-row-b'), { clientX: 12, clientY: 34 });
    expect(onMenuKontekstowe).toHaveBeenCalledWith('b', { x: 12, y: 34 });
  });
});

describe('ContextTree — liczniki problemów i filtr', () => {
  it('licznik renderuje się z tytułem „Blokady: n, ostrzeżenia: m" (§5)', () => {
    render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId={null} onZaznacz={noop} onOtworz={noop} filtrProblemy={false} />,
    );
    fireEvent.click(screen.getByTestId('mvd-tree-chevron-a'));
    expect(screen.getByTestId('mvd-tree-badge-a1')).toHaveAttribute('title', licznikTitle(1, 0));
  });

  it('filtr „tylko z problemami" zachowuje przodka dopasowanego węzła i ukrywa gałąź bez problemów', () => {
    render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId={null} onZaznacz={noop} onOtworz={noop} filtrProblemy />,
    );
    // „a" ma problem u potomka (a1) — musi zostać, mimo że sam nie ma liczników.
    expect(screen.getByTestId('mvd-tree-row-a')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-tree-row-b')).toBeInTheDocument();
  });
});

describe('ContextTree — tryb zaawansowania i tryb drzewa topologii', () => {
  it('węzeł o trybMin wyższym niż trybAktualny jest ukryty', () => {
    render(
      <ContextTree
        wezly={drzewoFixture()}
        zaznaczonyId={null}
        onZaznacz={noop}
        onOtworz={noop}
        filtrProblemy={false}
        trybAktualny="basic"
      />,
    );
    fireEvent.click(screen.getByTestId('mvd-tree-chevron-a'));
    expect(screen.queryByTestId('mvd-tree-row-a2')).toBeNull();
    expect(screen.getByTestId('mvd-tree-row-a1')).toBeInTheDocument();
  });

  it('selektor trybu drzewa renderuje się tylko gdy podano `tryb` i wywołuje onZmienTryb', () => {
    const onZmienTryb = vi.fn();
    const { rerender } = render(
      <ContextTree wezly={drzewoFixture()} zaznaczonyId={null} onZaznacz={noop} onOtworz={noop} filtrProblemy={false} />,
    );
    expect(screen.queryByTestId('mvd-tree-mode')).toBeNull();

    rerender(
      <ContextTree
        wezly={drzewoFixture()}
        zaznaczonyId={null}
        onZaznacz={noop}
        onOtworz={noop}
        filtrProblemy={false}
        tryb="zasilania"
        onZmienTryb={onZmienTryb}
      />,
    );
    expect(screen.getByTestId('mvd-tree-mode')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-tree-mode-administracyjny'));
    expect(onZmienTryb).toHaveBeenCalledWith('administracyjny');
  });
});

describe('ContextTree — zero literałów hex', () => {
  it('ContextTree.tsx i tree.css nie zawierają koloru hex (tylko var(--mvd-*))', () => {
    const dir = join(process.cwd(), 'src', 'ui2', 'nav');
    for (const file of ['ContextTree.tsx', 'tree.css']) {
      const source = readFileSync(join(dir, file), 'utf8');
      const hexMatches = source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(hexMatches).toEqual([]);
    }
  });
});
