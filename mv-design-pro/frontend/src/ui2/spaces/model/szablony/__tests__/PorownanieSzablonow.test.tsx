import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PorownanieSzablonow, zbudujWierszePorownania } from '../PorownanieSzablonow';
import { SZABLONY_STRINGS } from '../strings';
import { szablonFarmaPv, szablonHybrydowy, szablonPelny } from './fixtures';

describe('zbudujWierszePorownania — funkcja czysta (karta §4.3)', () => {
  it('wykrywa identyczną liczbę pól SN dla dwóch takich samych szablonów', () => {
    const a = szablonPelny({ id: 'a', sn_bays_count_default: 3 });
    const b = szablonPelny({ id: 'b', sn_bays_count_default: 3 });
    const wiersze = zbudujWierszePorownania(a, b);
    const wierszLiczbaPol = wiersze.find((w) => w.cecha === SZABLONY_STRINGS.porownanieWierszLiczbaPol)!;
    expect(wierszLiczbaPol.identyczne).toBe(true);
    expect(wierszLiczbaPol.wartoscA).toBe('3');
  });

  it('wykrywa różnicę liczby pól SN', () => {
    const a = szablonPelny({ id: 'a', sn_bays_count_default: 3 });
    const b = szablonPelny({ id: 'b', sn_bays_count_default: 6 });
    const wiersze = zbudujWierszePorownania(a, b);
    const wierszLiczbaPol = wiersze.find((w) => w.cecha === SZABLONY_STRINGS.porownanieWierszLiczbaPol)!;
    expect(wierszLiczbaPol.identyczne).toBe(false);
    expect(wierszLiczbaPol.wartoscA).toBe('3');
    expect(wierszLiczbaPol.wartoscB).toBe('6');
  });

  it('wiersz DER pokazuje „—" gdy szablon nie ma źródeł', () => {
    const a = szablonPelny();
    const b = szablonFarmaPv();
    const wiersze = zbudujWierszePorownania(a, b);
    const wierszDer = wiersze.find((w) => w.cecha === SZABLONY_STRINGS.porownanieWierszDer)!;
    expect(wierszDer.wartoscA).toBe('—');
    expect(wierszDer.wartoscB).toContain('Falownik PV SN przez block TR');
  });

  it('wiersz DER szablonu hybrydowego zawiera oba rodzaje (PV + BESS)', () => {
    const a = szablonPelny();
    const b = szablonHybrydowy();
    const wiersze = zbudujWierszePorownania(a, b);
    const wierszDer = wiersze.find((w) => w.cecha === SZABLONY_STRINGS.porownanieWierszDer)!;
    expect(wierszDer.wartoscB).toContain('Falownik PV SN przez block TR');
    expect(wierszDer.wartoscB).toContain('Magazyn BESS SN przez block TR');
  });

  it('zwraca komplet wierszy: pola, role pól, transformator, odpływy, DER, aparaty, zabezpieczenia', () => {
    const wiersze = zbudujWierszePorownania(szablonPelny({ id: 'a' }), szablonPelny({ id: 'b' }));
    expect(wiersze.map((w) => w.cecha)).toEqual([
      SZABLONY_STRINGS.porownanieWierszLiczbaPol,
      SZABLONY_STRINGS.porownanieWierszRolePol,
      SZABLONY_STRINGS.porownanieWierszLiczbaTransformatorow,
      SZABLONY_STRINGS.porownanieWierszTransformator,
      SZABLONY_STRINGS.porownanieWierszOdplywyNn,
      SZABLONY_STRINGS.porownanieWierszDer,
      SZABLONY_STRINGS.porownanieWierszAparatyNn,
      SZABLONY_STRINGS.porownanieWierszZabezpieczenia,
    ]);
  });
});

describe('<PorownanieSzablonow /> — tabela różnic', () => {
  it('renderuje tytuł i nazwy porównywanych szablonów w nagłówku', () => {
    const a = szablonPelny({ id: 'a', name_pl: 'Szablon A' });
    const b = szablonFarmaPv();
    render(<PorownanieSzablonow a={a} b={b} onZamknij={() => {}} />);
    expect(screen.getByText(SZABLONY_STRINGS.porownanieTytul)).toBeInTheDocument();
    expect(screen.getByText('Szablon A')).toBeInTheDocument();
    expect(screen.getByText(b.name_pl)).toBeInTheDocument();
  });

  it('oznacza wiersz różniący się tagiem „różne"', () => {
    const a = szablonPelny({ id: 'a', sn_bays_count_default: 2 });
    const b = szablonPelny({ id: 'b', sn_bays_count_default: 5 });
    render(<PorownanieSzablonow a={a} b={b} onZamknij={() => {}} />);
    expect(screen.getAllByText(SZABLONY_STRINGS.porownanieRozne).length).toBeGreaterThan(0);
  });

  it('klik „Zamknij porównanie" woła onZamknij', () => {
    const onZamknij = vi.fn();
    render(<PorownanieSzablonow a={szablonPelny({ id: 'a' })} b={szablonPelny({ id: 'b' })} onZamknij={onZamknij} />);
    fireEvent.click(screen.getByText(SZABLONY_STRINGS.porownanieZamknij));
    expect(onZamknij).toHaveBeenCalledTimes(1);
  });
});
