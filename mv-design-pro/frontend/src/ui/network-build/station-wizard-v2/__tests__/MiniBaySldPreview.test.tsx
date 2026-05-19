import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { MiniBaySldPreview } from '../MiniBaySldPreview';
import { VENDOR_SWITCHGEAR_CATALOG, getVendorSwitchgear } from '../vendorSwitchgearCatalog';

describe('MiniBaySldPreview — SVG mini-SLD per template', () => {
  it('renderuje SVG z szyną SN dla ABB SafePlus', () => {
    const template = getVendorSwitchgear('abb_safe_plus');
    if (!template) throw new Error('ABB template missing');
    render(<MiniBaySldPreview template={template} />);
    const sld = screen.getByTestId('mini-bay-sld-preview');
    expect(sld.getAttribute('data-template')).toBe('abb_safe_plus');
    expect(screen.getByTestId('mini-sld-busbar')).toBeInTheDocument();
  });

  it('renderuje kolumnę pola per defaultBay (4 pola dla ABB)', () => {
    const template = getVendorSwitchgear('abb_safe_plus');
    if (!template) throw new Error();
    const { container } = render(<MiniBaySldPreview template={template} />);
    const columns = container.querySelectorAll('[data-testid^="bay-column-"]');
    expect(columns.length).toBe(template.defaultBays.length);
  });

  it('Każda kolumna ma data-bay-layout zgodny z layout', () => {
    const template = getVendorSwitchgear('abb_safe_plus');
    if (!template) throw new Error();
    render(<MiniBaySldPreview template={template} />);
    const firstBay = screen.getByTestId('bay-column-0');
    expect(firstBay.getAttribute('data-bay-layout')).toBe(template.defaultBays[0].layout);
  });

  it('Klik na pole wywołuje onSelectBay z indexem', () => {
    const template = getVendorSwitchgear('schneider_rm6');
    if (!template) throw new Error();
    const handler = vi.fn();
    render(<MiniBaySldPreview template={template} onSelectBay={handler} />);
    fireEvent.click(screen.getByTestId('bay-column-1'));
    expect(handler).toHaveBeenCalledWith(1);
  });

  it('Wybrane pole ma data-bay-selected="true"', () => {
    const template = getVendorSwitchgear('siemens_8djh');
    if (!template) throw new Error();
    render(<MiniBaySldPreview template={template} selectedBayIndex={2} />);
    const selected = screen.getByTestId('bay-column-2');
    expect(selected.getAttribute('data-bay-selected')).toBe('true');
    const unselected = screen.getByTestId('bay-column-0');
    expect(unselected.getAttribute('data-bay-selected')).toBe('false');
  });

  it('Pokazuje vendor full name + IAC + IP + LSC', () => {
    const template = getVendorSwitchgear('abb_safe_plus');
    if (!template) throw new Error();
    render(<MiniBaySldPreview template={template} />);
    expect(screen.getByText(template.fullName)).toBeInTheDocument();
    expect(screen.getByText(/IAC/)).toBeInTheDocument();
    expect(screen.getByText(/IP3X|IP4X/)).toBeInTheDocument();
  });

  it('Legenda pól pokazuje polskie etykiety per pole', () => {
    const template = getVendorSwitchgear('schneider_rm6');
    if (!template) throw new Error();
    render(<MiniBaySldPreview template={template} />);
    for (const bay of template.defaultBays) {
      expect(screen.getByText(bay.labelPl)).toBeInTheDocument();
    }
  });

  it('Designation pól pokazany w SVG i legend', () => {
    const template = getVendorSwitchgear('zpue_rotoblok');
    if (!template) throw new Error();
    const { container } = render(<MiniBaySldPreview template={template} />);
    for (const bay of template.defaultBays) {
      // Designation pojawia się w SVG text + button label.
      expect(container.textContent).toContain(bay.designation);
    }
  });

  it('Każdy template z katalogu renderuje się bez błędu', () => {
    for (const template of VENDOR_SWITCHGEAR_CATALOG) {
      const { unmount } = render(<MiniBaySldPreview template={template} />);
      const sld = screen.getByTestId('mini-bay-sld-preview');
      expect(sld.getAttribute('data-template')).toBe(template.id);
      unmount();
    }
  });

  it('Apparatus stack rysowany jako g elementy z data-apparatus-type', () => {
    const template = getVendorSwitchgear('abb_safe_plus');
    if (!template) throw new Error();
    const { container } = render(<MiniBaySldPreview template={template} />);
    // Sprawdź że jakikolwiek apparatus jest narysowany.
    const apparatuses = container.querySelectorAll('[data-apparatus-type]');
    expect(apparatuses.length).toBeGreaterThan(0);
  });
});

describe('DerConfiguratorSidebar — 10-sekcyjna nawigacja DER', () => {
  it.todo('renderuje 10 sekcji per DER kind');
});
