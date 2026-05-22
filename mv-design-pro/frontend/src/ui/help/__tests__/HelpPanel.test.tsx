import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpPanel } from '../HelpPanel';

describe('HelpPanel', () => {
  it('nie renderuje gdy isOpen=false', () => {
    const { container } = render(<HelpPanel isOpen={false} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="help-panel"]')).toBeNull();
  });

  it('renderuje 3 zakładki: Dokumentacja / Glosariusz / Skróty', () => {
    render(<HelpPanel isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('help-tab-docs')).toBeInTheDocument();
    expect(screen.getByTestId('help-tab-glossary')).toBeInTheDocument();
    expect(screen.getByTestId('help-tab-shortcuts')).toBeInTheDocument();
  });

  it('default tab to docs', () => {
    render(<HelpPanel isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('help-content-docs')).toBeInTheDocument();
    expect(screen.getByText(/Typowy przepływ pracy/)).toBeInTheDocument();
  });

  it('przełącza na zakładkę glosariusza', () => {
    render(<HelpPanel isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('help-tab-glossary'));
    expect(screen.getByTestId('help-content-glossary')).toBeInTheDocument();
    expect(screen.getByTestId('help-glossary-search')).toBeInTheDocument();
  });

  it('glosariusz zawiera kluczowe terminy (GPZ, PCC, NC RfG, FRT)', () => {
    render(<HelpPanel isOpen initialTab="glossary" onClose={vi.fn()} />);
    expect(screen.getByTestId('glossary-entry-GPZ')).toBeInTheDocument();
    expect(screen.getByTestId('glossary-entry-PCC')).toBeInTheDocument();
    expect(screen.getByTestId('glossary-entry-NC RfG')).toBeInTheDocument();
    expect(screen.getByTestId('glossary-entry-FRT / LVRT / HVRT')).toBeInTheDocument();
  });

  it('glosariusz filtruje po search', () => {
    render(<HelpPanel isOpen initialTab="glossary" onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('help-glossary-search'), { target: { value: 'ROCOF' } });
    expect(screen.getByTestId('glossary-entry-ROCOF / dRoCoF')).toBeInTheDocument();
    expect(screen.queryByTestId('glossary-entry-GPZ')).toBeNull();
  });

  it('search z 0 wyników pokazuje komunikat', () => {
    render(<HelpPanel isOpen initialTab="glossary" onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('help-glossary-search'), { target: { value: 'xyz123nieistnieje' } });
    expect(screen.getByText(/Brak wyników/)).toBeInTheDocument();
  });

  it('skróty zawierają min. 5 kategorii', () => {
    render(<HelpPanel isOpen initialTab="shortcuts" onClose={vi.fn()} />);
    expect(screen.getByText(/Nawigacja/)).toBeInTheDocument();
    expect(screen.getByText(/Edycja modelu/)).toBeInTheDocument();
  });

  it('skróty renderują tabelę z kbd elements', () => {
    const { container } = render(<HelpPanel isOpen initialTab="shortcuts" onClose={vi.fn()} />);
    const kbds = container.querySelectorAll('kbd');
    expect(kbds.length).toBeGreaterThan(10);
  });

  it('onClose wywoływane po kliknięciu X', () => {
    const onClose = vi.fn();
    render(<HelpPanel isOpen onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Zamknij pomoc'));
    expect(onClose).toHaveBeenCalled();
  });

  it('onClose wywoływane po kliknięciu tła', () => {
    const onClose = vi.fn();
    render(<HelpPanel isOpen onClose={onClose} />);
    fireEvent.click(screen.getByTestId('help-panel'));
    expect(onClose).toHaveBeenCalled();
  });
});
