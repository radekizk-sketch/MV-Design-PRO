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
 *
 * Karta KASACJA-SCL-I-CIM-KLIENT: `onExport` jest asynchroniczny (pozycja CGMES
 * pobiera archiwum z serwera). INTENCJA DOŁOŻONA: (4) na czas pobrania pozycja
 * pokazuje stan pracy, a menu nie przyjmuje drugiego eksportu; (5) odmowa
 * serwera (odrzucona obietnica) daje komunikat tak samo jak wyjątek budowy.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { SldExportFormatMenu } from '../SldExportFormatMenu';
import { SLD_EXPORT_FORMATS } from '../../../v3/export/formats';

describe('SldExportFormatMenu', () => {
  it('renderuje toggle przycisku z polską etykietą', () => {
    render(<SldExportFormatMenu onExport={async () => 'plik.svg'} />);
    expect(screen.getByRole('button', { name: /Eksportuj schemat/i })).toBeInTheDocument();
  });

  it('po kliknięciu otwiera menu z DOKŁADNIE tymi formatami, które deklaruje rejestr formatów', () => {
    render(<SldExportFormatMenu onExport={async () => 'plik.svg'} />);
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    expect(screen.getByTestId('sld-export-menu-items')).toBeInTheDocument();
    for (const descriptor of SLD_EXPORT_FORMATS) {
      expect(screen.getByTestId(`sld-export-format-${descriptor.id}`)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('menuitem')).toHaveLength(SLD_EXPORT_FORMATS.length);
  });

  it('PNG nie jest oferowany — raster nie jest deterministyczny i nie da się sprawdzić jego treści', () => {
    render(<SldExportFormatMenu onExport={async () => 'plik.svg'} />);
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    expect(screen.queryByTestId('sld-export-format-png')).toBeNull();
  });

  it('każdy format ma tytuł (tooltip) z opisem use-case', () => {
    render(<SldExportFormatMenu onExport={async () => 'plik.svg'} />);
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    for (const descriptor of SLD_EXPORT_FORMATS) {
      const button = screen.getByTestId(`sld-export-format-${descriptor.id}`);
      expect(button.getAttribute('title')).toBe(descriptor.descriptionPl);
    }
    expect(screen.getByTestId('sld-export-format-dxf').getAttribute('title')).toMatch(/CAD/i);
  });

  it('klik pozycji woła eksport wołającego i melduje nazwę pliku', async () => {
    const onExport = vi.fn(async () => 'schemat-sld_projekt.dxf');
    const onExported = vi.fn();
    render(<SldExportFormatMenu onExport={onExport} onExported={onExported} />);
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    fireEvent.click(screen.getByTestId('sld-export-format-dxf'));

    expect(onExport).toHaveBeenCalledWith('dxf');
    await waitFor(() => expect(onExported).toHaveBeenCalledWith('schemat-sld_projekt.dxf', 'dxf'));
  });

  it('wyjątek bramki (np. rysunek bez geometrii) kończy się komunikatem, nie cichym niepowodzeniem', async () => {
    const onError = vi.fn();
    render(
      <SldExportFormatMenu
        onExport={async () => {
          throw new Error('Eksport DXF: rysunek nie zawiera żadnej geometrii — eksport przerwany.');
        }}
        onError={onError}
      />,
    );
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    fireEvent.click(screen.getByTestId('sld-export-format-dxf'));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0]).toMatch(/nie zawiera żadnej geometrii/);
  });

  it('brak rysunku (wołający zwraca null) też daje komunikat', async () => {
    const onError = vi.fn();
    render(<SldExportFormatMenu onExport={async () => null} onError={onError} />);
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    fireEvent.click(screen.getByTestId('sld-export-format-svg'));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0]).toMatch(/Nie ma czego wyeksportować/);
  });

  it('pozycja CGMES jest jedynym eksportem modelu sieci — bez SCD i CIM', () => {
    render(<SldExportFormatMenu onExport={async () => 'plik.cgmes.zip'} />);
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    expect(screen.getByTestId('sld-export-format-cgmes')).toHaveTextContent('CGMES — model sieci (IEC 61970 EQ+TP)');
    // Dokładnie cztery pozycje: rysunek (SVG/PDF/DXF) i jeden model (CGMES).
    expect(screen.getAllByRole('menuitem').map((el) => el.getAttribute('data-testid'))).toEqual([
      'sld-export-format-svg',
      'sld-export-format-pdf',
      'sld-export-format-dxf',
      'sld-export-format-cgmes',
    ]);
  });

  it('w trakcie pobrania pozycja pokazuje pracę, pozostałe są zablokowane, drugi klik nie startuje eksportu', async () => {
    let zakoncz: (nazwa: string) => void = () => {};
    const onExport = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          zakoncz = resolve;
        }),
    );
    const onExported = vi.fn();
    render(<SldExportFormatMenu onExport={onExport} onExported={onExported} />);
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    fireEvent.click(screen.getByTestId('sld-export-format-cgmes'));

    await waitFor(() => expect(screen.getByTestId('sld-export-format-svg')).toBeDisabled());
    expect(screen.getByTestId('sld-export-format-cgmes')).toHaveTextContent('…');
    fireEvent.click(screen.getByTestId('sld-export-format-svg'));
    expect(onExport).toHaveBeenCalledTimes(1);

    zakoncz('schemat-sld.cgmes.zip');
    await waitFor(() => expect(onExported).toHaveBeenCalledWith('schemat-sld.cgmes.zip', 'cgmes'));
    expect(screen.queryByTestId('sld-export-menu-items')).toBeNull();
  });

  it('odmowa serwera (odrzucona obietnica) daje komunikat serwera', async () => {
    const onError = vi.fn();
    render(
      <SldExportFormatMenu
        onExport={() => Promise.reject(new Error('Eksport CGMES wstrzymany — model sieci jest niekompletny: x'))}
        onError={onError}
      />,
    );
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    fireEvent.click(screen.getByTestId('sld-export-format-cgmes'));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Eksport CGMES wstrzymany — model sieci jest niekompletny: x'));
  });
});
