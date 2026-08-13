/**
 * S9-6: testy przepisane do obecnego kanonu menu eksportu (audyt E-1/E-2).
 *
 * INTENCJA ZACHOWANA z wersji sprzed karty: menu otwiera listę formatów, a
 * każda pozycja niesie opis use-case w tooltipie.
 * INTENCJA DOŁOŻONA: (1) lista pochodzi z JEDNEGO źródła prawdy
 * (`v3/export/formats.ts`) — test porównuje render z tym źródłem, więc nie da
 * się dodać pozycji do menu bez dopisania jej do rejestru formatów;
 * (2) PNG NIE jest oferowany (decyzja karty — patrz `formats.ts`);
 * (3) klik pozycji wykonuje eksport wołającego, a wyjątek z budowy pliku
 * kończy się KOMUNIKATEM, nie ciszą (to była istota E-1: martwy klik).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { SldExportFormatMenu } from '../SldExportFormatMenu';
import { SLD_EXPORT_FORMATS } from '../../../v3/export/formats';

describe('SldExportFormatMenu', () => {
  it('renderuje toggle przycisku z polską etykietą', () => {
    render(<SldExportFormatMenu onExport={() => 'plik.svg'} />);
    expect(screen.getByRole('button', { name: /Eksportuj schemat/i })).toBeInTheDocument();
  });

  it('po kliknięciu otwiera menu z DOKŁADNIE tymi formatami, które deklaruje rejestr formatów', () => {
    render(<SldExportFormatMenu onExport={() => 'plik.svg'} />);
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    expect(screen.getByTestId('sld-export-menu-items')).toBeInTheDocument();
    for (const descriptor of SLD_EXPORT_FORMATS) {
      expect(screen.getByTestId(`sld-export-format-${descriptor.id}`)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('menuitem')).toHaveLength(SLD_EXPORT_FORMATS.length);
  });

  it('PNG nie jest oferowany — raster nie jest deterministyczny i nie da się sprawdzić jego treści', () => {
    render(<SldExportFormatMenu onExport={() => 'plik.svg'} />);
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    expect(screen.queryByTestId('sld-export-format-png')).toBeNull();
  });

  it('każdy format ma tytuł (tooltip) z opisem use-case', () => {
    render(<SldExportFormatMenu onExport={() => 'plik.svg'} />);
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    for (const descriptor of SLD_EXPORT_FORMATS) {
      const button = screen.getByTestId(`sld-export-format-${descriptor.id}`);
      expect(button.getAttribute('title')).toBe(descriptor.descriptionPl);
    }
    expect(screen.getByTestId('sld-export-format-dxf').getAttribute('title')).toMatch(/CAD/i);
  });

  it('klik pozycji woła eksport wołającego i melduje nazwę pliku', () => {
    const onExport = vi.fn(() => 'schemat-sld_projekt.dxf');
    const onExported = vi.fn();
    render(<SldExportFormatMenu onExport={onExport} onExported={onExported} />);
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    fireEvent.click(screen.getByTestId('sld-export-format-dxf'));

    expect(onExport).toHaveBeenCalledWith('dxf');
    expect(onExported).toHaveBeenCalledWith('schemat-sld_projekt.dxf', 'dxf');
  });

  it('wyjątek bramki (np. rysunek bez geometrii) kończy się komunikatem, nie cichym niepowodzeniem', () => {
    const onError = vi.fn();
    render(
      <SldExportFormatMenu
        onExport={() => {
          throw new Error('Eksport DXF: rysunek nie zawiera żadnej geometrii — eksport przerwany.');
        }}
        onError={onError}
      />,
    );
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    fireEvent.click(screen.getByTestId('sld-export-format-dxf'));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/nie zawiera żadnej geometrii/);
  });

  it('brak rysunku (wołający zwraca null) też daje komunikat', () => {
    const onError = vi.fn();
    render(<SldExportFormatMenu onExport={() => null} onError={onError} />);
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    fireEvent.click(screen.getByTestId('sld-export-format-svg'));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/Nie ma czego wyeksportować/);
  });
});
