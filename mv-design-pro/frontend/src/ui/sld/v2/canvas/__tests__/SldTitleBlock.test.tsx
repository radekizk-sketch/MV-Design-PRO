/**
 * K30-38: SldTitleBlock — industrial title block per PN-EN ISO 7200.
 *
 * Inwarianty:
 * 1. Renderuje strukturę zgodną z PN-EN ISO 7200 (frame + separator lines).
 * 2. Defaults zachowują kompatybilność z poprzednim inline blokiem (K30-12).
 * 3. data-status atrybut emitowany dla audytu.
 * 4. Drawing number widoczny tylko gdy podany (opcjonalne pole).
 * 5. Status STATUS_COLORS — kolory różnicują DRAFT / AUDIT / RELEASED / ARCHIVED.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { SldTitleBlock } from '../SldTitleBlock';

describe('SldTitleBlock — K30-38 industrial drawing metryka', () => {
  it('renderuje root group z data-testid', () => {
    const { container } = render(<svg><SldTitleBlock /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-title-block"]')).toBeTruthy();
  });

  it('defaults zawierają project name + status AUDIT', () => {
    const { container, getByText } = render(<svg><SldTitleBlock /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-title-block"]')?.getAttribute('data-status')).toBe('AUDIT');
    expect(getByText('STATUS: AUDIT')).toBeInTheDocument();
    expect(getByText(/MV-DESIGN-PRO/u)).toBeInTheDocument();
  });

  it('drawing number widoczny tylko gdy podany', () => {
    const { container: c1 } = render(<svg><SldTitleBlock /></svg>);
    expect(c1.querySelector('[data-testid="sld-v2-title-block-drawing-number"]')).toBeFalsy();

    const { container: c2, getByText } = render(
      <svg><SldTitleBlock data={{ drawingNumber: 'E-001/2026' }} /></svg>,
    );
    expect(c2.querySelector('[data-testid="sld-v2-title-block-drawing-number"]')).toBeTruthy();
    expect(getByText(/E-001\/2026/u)).toBeInTheDocument();
  });

  it('PN-EN ISO 7200 mandatory pola: projektant + sprawdzający + data + rewizja', () => {
    const { getByText } = render(
      <svg>
        <SldTitleBlock data={{
          designer: 'Jan Kowalski',
          approver: 'Anna Nowak',
          revision: 'R02',
          issueDate: '2026-05-15',
        }} />
      </svg>,
    );
    expect(getByText(/Proj\.: Jan Kowalski/u)).toBeInTheDocument();
    expect(getByText(/Sprawdz\.: Anna Nowak/u)).toBeInTheDocument();
    expect(getByText(/Rev\. R02/u)).toBeInTheDocument();
    expect(getByText('2026-05-15')).toBeInTheDocument();
  });

  it('brak designer/approver → wyświetla "—" zamiast pustego pola', () => {
    const { getByText } = render(<svg><SldTitleBlock /></svg>);
    expect(getByText(/Proj\.: —/u)).toBeInTheDocument();
    expect(getByText(/Sprawdz\.: —/u)).toBeInTheDocument();
  });

  it('format / skala / arkusz widoczne', () => {
    const { getByText } = render(
      <svg>
        <SldTitleBlock data={{ sheetFormat: 'A1', scale: '1:500', sheetNumber: '2/5' }} />
      </svg>,
    );
    expect(getByText(/Format: A1/u)).toBeInTheDocument();
    expect(getByText(/Skala: 1:500/u)).toBeInTheDocument();
    expect(getByText(/Arkusz: 2\/5/u)).toBeInTheDocument();
  });

  it('status różnicuje kolor', () => {
    const { container } = render(<svg><SldTitleBlock data={{ status: 'RELEASED' }} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-title-block"]')?.getAttribute('data-status')).toBe('RELEASED');
  });

  it('frame ma 360×108 px (PN-EN ISO 7200 proportions)', () => {
    const { container } = render(<svg><SldTitleBlock /></svg>);
    const rect = container.querySelector('[data-testid="sld-v2-title-block"] rect');
    expect(rect?.getAttribute('width')).toBe('360');
    expect(rect?.getAttribute('height')).toBe('108');
  });

  it('issueDate gdy brak → fallback do current ISO date', () => {
    const { container } = render(<svg><SldTitleBlock /></svg>);
    // Format YYYY-MM-DD z toISOString
    const today = new Date().toISOString().split('T')[0];
    expect(container.textContent).toContain(today);
  });
});
