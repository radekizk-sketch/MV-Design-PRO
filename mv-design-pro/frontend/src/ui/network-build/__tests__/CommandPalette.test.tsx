/**
 * Testy CommandPalette (Etap 6).
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { CommandPalette } from '../CommandPalette';

describe('CommandPalette — paleta komend (Ctrl+Shift+P)', () => {
  it('zwraca null gdy isOpen=false', () => {
    const { container } = render(
      <CommandPalette isOpen={false} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renderuje paletę z input + lista komend', () => {
    render(<CommandPalette isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
    expect(screen.getByTestId('command-palette-input')).toBeInTheDocument();
    expect(screen.getByTestId('command-palette-results')).toBeInTheDocument();
  });

  it('filtruje komendy po fuzzy search query', () => {
    render(<CommandPalette isOpen onClose={vi.fn()} />);
    const input = screen.getByTestId('command-palette-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'PV' } });
    // Po wpisaniu "PV" lista zawiera akcje DER PV.
    const results = screen.getByTestId('command-palette-results');
    expect(results.textContent).toContain('PV');
  });

  it('Esc zamyka paletę', () => {
    const onClose = vi.fn();
    render(<CommandPalette isOpen onClose={onClose} />);
    const input = screen.getByTestId('command-palette-input');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('Enter wykonuje pierwszą pasującą komendę', () => {
    const onClose = vi.fn();
    const customRun = vi.fn();
    render(
      <CommandPalette
        isOpen
        onClose={onClose}
        extraCommands={[
          {
            id: 'shortcut:test-action',
            label: 'Akcja testowa Z',
            description: 'Testowa akcja zdefiniowana extraCommand',
            keywords: 'akcjaTestowa',
            run: customRun,
          },
        ]}
      />,
    );
    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'akcjaTestowa' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(customRun).toHaveBeenCalled();
  });

  it('zawiera komendy ekranów E-XX z screenCanonRegistry', () => {
    render(<CommandPalette isOpen onClose={vi.fn()} />);
    const input = screen.getByTestId('command-palette-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'pulpit' } });
    const results = screen.getByTestId('command-palette-results');
    expect(results.textContent).toContain('Pulpit projektu');
  });

  it('zawiera komendy menu SLD_MENU_REGISTRY (poza tłem)', () => {
    render(<CommandPalette isOpen onClose={vi.fn()} />);
    const input = screen.getByTestId('command-palette-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'transformatorowa' } });
    const results = screen.getByTestId('command-palette-results');
    // Menu cable_segment_sn ma "Wstaw stację transformatorową"
    expect(results.textContent).toContain('Wstaw stację transformatorową');
  });

  it('wyświetla pusty stan gdy brak komend pasujących', () => {
    render(<CommandPalette isOpen onClose={vi.fn()} />);
    const input = screen.getByTestId('command-palette-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'qzqzqzqz9999' } });
    expect(screen.getByTestId('command-palette-empty')).toBeInTheDocument();
  });
});
