import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GridSourceEditor } from '../shared/GridSourceEditor';

describe('GridSourceEditor catalog fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it('nie pokazuje surowego 500 i odblokowuje ręczną definicję GPZ, gdy katalog nie odpowiada', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => {
        throw new Error('empty response');
      },
    });

    const { container } = render(
      <GridSourceEditor
        isOpen
        mode="create"
        initialData={{
          source_name: 'POZ1',
          sections_count: 2,
          gpz_section_name: 'sekcja 1',
          gpz_line_field_name: 'pole1',
        }}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Włączono ręczną definicję parametrów GPZ/)).toBeInTheDocument();
    });

    expect(screen.queryByText(/500 Internal Server Error: No detail/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Katalog' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Umowa równoważna ręczna' })).toBeEnabled();

    const voltageInput = screen.getByText('Napięcie SN [kV]').parentElement?.querySelector('input');
    const sk3Input = screen.getByText('Sk3 [MVA]').parentElement?.querySelector('input');
    const rxInput = screen.getByText('R/X').parentElement?.querySelector('input');

    expect(voltageInput).toBeInTheDocument();
    expect(sk3Input).toBeInTheDocument();
    expect(rxInput).toBeInTheDocument();
    expect(voltageInput).toBeEnabled();
    expect(sk3Input).toBeEnabled();
    expect(rxInput).toBeEnabled();
    expect(container).toHaveTextContent('Backend katalogów nie odpowiada');
  });
});
