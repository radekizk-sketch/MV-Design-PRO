import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OsdDataForm } from '../OsdDataForm';

describe('OsdDataForm', () => {
  it('nie renderuje gdy isOpen=false', () => {
    const { container } = render(
      <OsdDataForm isOpen={false} onClose={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="osd-data-form"]')).toBeNull();
  });

  it('renderuje wszystkie 4 sekcje wymaganych pól OSD', () => {
    render(<OsdDataForm isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Operator dystrybucyjny')).toBeInTheDocument();
    expect(screen.getByText('Projekt')).toBeInTheDocument();
    expect(screen.getByText('Projektant i sprawdzający')).toBeInTheDocument();
    expect(screen.getByText('Format wydruku')).toBeInTheDocument();
  });

  it('renderuje 6 buttonów wyboru operatora (PSE, Enea, Energa, Tauron, PGE, Inny)', () => {
    render(<OsdDataForm isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('osd-operator-PSE')).toBeInTheDocument();
    expect(screen.getByTestId('osd-operator-ENEA')).toBeInTheDocument();
    expect(screen.getByTestId('osd-operator-ENERGA')).toBeInTheDocument();
    expect(screen.getByTestId('osd-operator-TAURON')).toBeInTheDocument();
    expect(screen.getByTestId('osd-operator-PGE')).toBeInTheDocument();
    expect(screen.getByTestId('osd-operator-INNY')).toBeInTheDocument();
  });

  it('wybór operatora wypełnia pełną nazwę', () => {
    render(<OsdDataForm isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('osd-operator-PGE'));
    const fullName = screen.getByTestId('osd-operator-full') as HTMLInputElement;
    expect(fullName.value).toBe('PGE Dystrybucja S.A.');
  });

  it('select Inny nie modyfikuje pełnej nazwy', () => {
    render(<OsdDataForm isOpen onClose={vi.fn()} data={{ osdOperator: 'Custom Op' }} />);
    fireEvent.click(screen.getByTestId('osd-operator-INNY'));
    const fullName = screen.getByTestId('osd-operator-full') as HTMLInputElement;
    expect(fullName.value).toBe('Custom Op');
  });

  it('select Faza zawiera 4 opcje PB/PW/PR/PK', () => {
    render(<OsdDataForm isOpen onClose={vi.fn()} />);
    const phaseSelect = screen.getByTestId('osd-phase') as HTMLSelectElement;
    const values = Array.from(phaseSelect.options).map((o) => o.value);
    expect(values).toContain('PB');
    expect(values).toContain('PW');
    expect(values).toContain('PR');
    expect(values).toContain('PK');
  });

  it('select Status zawiera 4 opcje', () => {
    render(<OsdDataForm isOpen onClose={vi.fn()} />);
    const statusSelect = screen.getByTestId('osd-status') as HTMLSelectElement;
    const values = Array.from(statusSelect.options).map((o) => o.value);
    expect(values).toContain('DRAFT');
    expect(values).toContain('AUDIT');
    expect(values).toContain('RELEASED');
    expect(values).toContain('ARCHIVED');
  });

  it('zapisuje pełne dane OSD przez onSave', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<OsdDataForm isOpen onClose={onClose} onSave={onSave} />);

    fireEvent.change(screen.getByTestId('osd-investor'), {
      target: { value: 'PGE Dystrybucja Sp. z o.o.' },
    });
    fireEvent.change(screen.getByTestId('osd-location'), {
      target: { value: 'ul. Główna 1, Warszawa' },
    });
    fireEvent.change(screen.getByTestId('osd-phase'), { target: { value: 'PB' } });
    fireEvent.change(screen.getByTestId('osd-status'), { target: { value: 'AUDIT' } });
    fireEvent.change(screen.getByTestId('osd-designer'), { target: { value: 'Jan Kowalski' } });
    fireEvent.change(screen.getByTestId('osd-designer-qual'), { target: { value: 'SEP D nr 12345' } });

    fireEvent.click(screen.getByTestId('osd-save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          investor: 'PGE Dystrybucja Sp. z o.o.',
          location: 'ul. Główna 1, Warszawa',
          phase: 'PB',
          status: 'AUDIT',
          designer: 'Jan Kowalski',
          designerQualification: 'SEP D nr 12345',
        }),
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('pokazuje błąd zapisu i NIE zamyka okna', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Błąd serwera OSD'));
    const onClose = vi.fn();
    render(<OsdDataForm isOpen onClose={onClose} onSave={onSave} />);

    fireEvent.click(screen.getByTestId('osd-save'));

    await waitFor(() => {
      expect(screen.getByTestId('osd-save-error')).toHaveTextContent('Błąd serwera OSD');
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Anuluj zamyka okno bez zapisu', () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    render(<OsdDataForm isOpen onClose={onClose} onSave={onSave} />);
    fireEvent.click(screen.getByText('Anuluj'));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('pre-wypełnia dane z prop data', () => {
    render(
      <OsdDataForm
        isOpen
        onClose={vi.fn()}
        data={{ investor: 'Pre-filled', drawingNumber: 'SLD-001' }}
      />,
    );
    expect((screen.getByTestId('osd-investor') as HTMLInputElement).value).toBe('Pre-filled');
    expect((screen.getByTestId('osd-drawing-number') as HTMLInputElement).value).toBe('SLD-001');
  });
});
