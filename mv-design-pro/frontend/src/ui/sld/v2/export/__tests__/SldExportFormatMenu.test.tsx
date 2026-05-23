import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SldExportFormatMenu } from '../SldExportFormatMenu';

describe('SldExportFormatMenu', () => {
  it('renderuje toggle przycisku z polską etykietą', () => {
    render(<SldExportFormatMenu />);
    expect(
      screen.getByRole('button', { name: /Eksportuj schemat/i }),
    ).toBeInTheDocument();
  });

  it('po kliknięciu otwiera menu z 6 formatami', () => {
    render(<SldExportFormatMenu />);
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    expect(screen.getByTestId('sld-export-menu-items')).toBeInTheDocument();
    expect(screen.getByTestId('sld-export-format-svg')).toBeInTheDocument();
    expect(screen.getByTestId('sld-export-format-pdf')).toBeInTheDocument();
    expect(screen.getByTestId('sld-export-format-png')).toBeInTheDocument();
    expect(screen.getByTestId('sld-export-format-dxf')).toBeInTheDocument();
    expect(screen.getByTestId('sld-export-format-iec61850')).toBeInTheDocument();
    expect(screen.getByTestId('sld-export-format-cim')).toBeInTheDocument();
  });

  it('każdy format ma tytuł (tooltip) z opisem use-case', () => {
    render(<SldExportFormatMenu />);
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    const dxfBtn = screen.getByTestId('sld-export-format-dxf');
    expect(dxfBtn).toHaveAttribute('title');
    expect(dxfBtn.getAttribute('title')).toMatch(/CAD|AutoCAD|Revit/i);
    const scdBtn = screen.getByTestId('sld-export-format-iec61850');
    expect(scdBtn.getAttribute('title')).toMatch(/SCADA|SIMATIC|WinCC/i);
  });
});
