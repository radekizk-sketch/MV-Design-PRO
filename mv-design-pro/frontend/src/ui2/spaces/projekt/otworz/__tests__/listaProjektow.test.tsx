import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ListaProjektow } from '../ListaProjektow';
import { OTWORZ_STRINGS } from '../strings';
import type { ProjektWiersz } from '../adapters/projektyAdapter';

function projekty(): ProjektWiersz[] {
  return [
    { id: 'PR1', nazwa: 'Sieć SN Rejon Wschód', ostatniaZmianaISO: '2026-07-10T09:15:00Z' },
    { id: 'PR2', nazwa: 'Przyłączenie PV Kozia Wola', ostatniaZmianaISO: '2026-07-14T16:40:00Z' },
    { id: 'PR3', nazwa: 'Audyt sieci wiejskiej', ostatniaZmianaISO: null },
  ];
}

describe('ListaProjektow — tabela istniejących projektów (W-102)', () => {
  it('renderuje nagłówki kolumn „Nazwa" i „Ostatnia zmiana"', () => {
    render(
      <ListaProjektow
        projekty={projekty()}
        zaznaczonyId={null}
        onZaznacz={() => {}}
        onOtworz={() => {}}
      />,
    );
    expect(screen.getByText(OTWORZ_STRINGS.kolNazwa)).toBeInTheDocument();
    expect(screen.getByText(OTWORZ_STRINGS.kolOstatniaZmiana)).toBeInTheDocument();
  });

  it('renderuje wiersze z nazwą i sformatowaną datą ostatniej zmiany', () => {
    render(
      <ListaProjektow
        projekty={projekty()}
        zaznaczonyId={null}
        onZaznacz={() => {}}
        onOtworz={() => {}}
      />,
    );
    expect(screen.getByText('Sieć SN Rejon Wschód')).toBeInTheDocument();
    expect(screen.getByText('2026-07-10 09:15')).toBeInTheDocument();
    expect(screen.getByText('2026-07-14 16:40')).toBeInTheDocument();
  });

  it('brak daty ostatniej zmiany → „—"', () => {
    render(
      <ListaProjektow
        projekty={projekty()}
        zaznaczonyId={null}
        onZaznacz={() => {}}
        onOtworz={() => {}}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('stan „ładowanie" pokazuje komunikat wczytywania, bez tabeli', () => {
    render(
      <ListaProjektow
        projekty={[]}
        ladowanie
        zaznaczonyId={null}
        onZaznacz={() => {}}
        onOtworz={() => {}}
      />,
    );
    expect(screen.getByText(OTWORZ_STRINGS.ladowanieProjektow)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('pusta lista (bez ładowania) → „Brak istniejących projektów"', () => {
    render(
      <ListaProjektow
        projekty={[]}
        zaznaczonyId={null}
        onZaznacz={() => {}}
        onOtworz={() => {}}
      />,
    );
    expect(screen.getByText(OTWORZ_STRINGS.brakProjektow)).toBeInTheDocument();
  });

  it('klik wiersza = selekcja (onZaznacz z id)', () => {
    const onZaznacz = vi.fn();
    render(
      <ListaProjektow
        projekty={projekty()}
        zaznaczonyId={null}
        onZaznacz={onZaznacz}
        onOtworz={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('Sieć SN Rejon Wschód'));
    expect(onZaznacz).toHaveBeenCalledWith('PR1');
  });

  it('2× klik wiersza = otwarcie (onOtworz z id)', () => {
    const onOtworz = vi.fn();
    render(
      <ListaProjektow
        projekty={projekty()}
        zaznaczonyId={null}
        onZaznacz={() => {}}
        onOtworz={onOtworz}
      />,
    );
    fireEvent.doubleClick(screen.getByText('Przyłączenie PV Kozia Wola'));
    expect(onOtworz).toHaveBeenCalledWith('PR2');
  });

  it('`Enter` na wierszu = otwarcie (onOtworz z id)', () => {
    const onOtworz = vi.fn();
    render(
      <ListaProjektow
        projekty={projekty()}
        zaznaczonyId="PR2"
        onZaznacz={() => {}}
        onOtworz={onOtworz}
      />,
    );
    const wiersz = screen.getByText('Przyłączenie PV Kozia Wola').closest('tr');
    fireEvent.keyDown(wiersz as HTMLElement, { key: 'Enter' });
    expect(onOtworz).toHaveBeenCalledWith('PR2');
  });

  it('`ArrowDown` na zogniskowanym wierszu = selekcja kolejnego', () => {
    const onZaznacz = vi.fn();
    render(
      <ListaProjektow
        projekty={projekty()}
        zaznaczonyId={null}
        onZaznacz={onZaznacz}
        onOtworz={() => {}}
      />,
    );
    const pierwszy = screen.getByText('Sieć SN Rejon Wschód').closest('tr');
    fireEvent.keyDown(pierwszy as HTMLElement, { key: 'ArrowDown' });
    expect(onZaznacz).toHaveBeenCalledWith('PR2');
  });

  it('wiersz zaznaczony ma aria-selected="true" i roving tabIndex 0', () => {
    render(
      <ListaProjektow
        projekty={projekty()}
        zaznaczonyId="PR2"
        onZaznacz={() => {}}
        onOtworz={() => {}}
      />,
    );
    const wiersz = screen.getByText('Przyłączenie PV Kozia Wola').closest('tr');
    expect(wiersz).toHaveAttribute('aria-selected', 'true');
    expect(wiersz).toHaveAttribute('tabIndex', '0');
    const innyWiersz = screen.getByText('Sieć SN Rejon Wschód').closest('tr');
    expect(innyWiersz).toHaveAttribute('tabIndex', '-1');
  });

  it('przycisk „Otwórz" jest wyłączony bez selekcji i aktywny po selekcji', () => {
    const onOtworz = vi.fn();
    const { rerender } = render(
      <ListaProjektow
        projekty={projekty()}
        zaznaczonyId={null}
        onZaznacz={() => {}}
        onOtworz={onOtworz}
      />,
    );
    const przycisk = screen.getByRole('button', { name: OTWORZ_STRINGS.otworz });
    expect(przycisk).toBeDisabled();

    rerender(
      <ListaProjektow
        projekty={projekty()}
        zaznaczonyId="PR1"
        onZaznacz={() => {}}
        onOtworz={onOtworz}
      />,
    );
    expect(przycisk).toBeEnabled();
    fireEvent.click(przycisk);
    expect(onOtworz).toHaveBeenCalledWith('PR1');
  });
});
