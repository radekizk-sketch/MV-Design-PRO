import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SzczegolySzablonu } from '../SzczegolySzablonu';
import { SZABLONY_STRINGS } from '../strings';
import { szablonFarmaPv, szablonPelny } from './fixtures';

describe('<SzczegolySzablonu /> — panel szczegółów (karta §2)', () => {
  it('stan pusty: brak wybranego szablonu pokazuje podpowiedź', () => {
    render(<SzczegolySzablonu szablon={null} onZastosuj={() => {}} />);
    expect(screen.getByTestId('mvd-szczegoly-puste')).toBeInTheDocument();
    expect(screen.getByText(SZABLONY_STRINGS.szczegolyBrakWyboru)).toBeInTheDocument();
  });

  it('renderuje nazwę, opis i sekcję transformatora z opcjami', () => {
    const szablon = szablonPelny();
    const { container } = render(<SzczegolySzablonu szablon={szablon} onZastosuj={() => {}} />);
    expect(screen.getByTestId('mvd-szczegoly')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: szablon.name_pl })).toBeInTheDocument();
    expect(container.textContent).toContain('TR 630 kVA SN/nN');
    expect(container.textContent).toContain('domyślny');
  });

  it('renderuje role pól SN z ich polskimi etykietami', () => {
    const szablon = szablonPelny();
    render(<SzczegolySzablonu szablon={szablon} onZastosuj={() => {}} />);
    expect(screen.getByText('Pole liniowe IN')).toBeInTheDocument();
    expect(screen.getByText('Pole transformatorowe')).toBeInTheDocument();
  });

  it('brak źródeł DER pokazuje komunikat „brak DER" zamiast pustej listy', () => {
    const szablon = szablonPelny();
    render(<SzczegolySzablonu szablon={szablon} onZastosuj={() => {}} />);
    expect(screen.getByText(SZABLONY_STRINGS.szczegolyBrakDer)).toBeInTheDocument();
  });

  it('szablon z DER renderuje sekcję źródeł z liczbą i mocą jednostkową', () => {
    const szablon = szablonFarmaPv();
    render(<SzczegolySzablonu szablon={szablon} onZastosuj={() => {}} />);
    expect(screen.queryByText(SZABLONY_STRINGS.szczegolyBrakDer)).not.toBeInTheDocument();
    expect(screen.getByText('Falownik PV SN przez block TR')).toBeInTheDocument();
  });

  it('klik „Zastosuj i edytuj" woła onZastosuj z id szablonu', () => {
    const onZastosuj = vi.fn();
    const szablon = szablonPelny();
    render(<SzczegolySzablonu szablon={szablon} onZastosuj={onZastosuj} />);
    fireEvent.click(screen.getByText(SZABLONY_STRINGS.zastosujIEdytuj));
    expect(onZastosuj).toHaveBeenCalledWith(szablon.id);
  });
});
