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

  /* Karta GPZ-MODEL: szablon GPZ ma równoważnik sieci na szynach SN i nie tworzy
     transformatorów 110/SN. Panel pokazuje równoważnik (jedyna dana zasilania), a sekcja
     transformatora mówi wprost „poza modelem" (etykieta z kontraktu backendu
     `templates/gpz_110_sn.py`). Iloczyn: {szablon GPZ, szablon wpinany w odcinek}. */
  it('szablon GPZ pokazuje równoważnik sieci SN, a transformatory 110/SN jako poza modelem', () => {
    const szablon = szablonPelny({
      id: 'tpl_gpz_sn_15_2s_4p',
      category: 'gpz_110_sn',
      wchodzi_w_segment: false,
      transformer_options: [],
      transformer_count: {
        default: 0, min_value: 0, max_value: 0, step: 1,
        label_pl: 'Transformatory 110/SN poza modelem (równoważnik na szynach SN)',
      },
      grid_source_options: [
        { catalog_ref: 'src-gpz-15kv-200mva-rx010', label_pl: 'Zasilanie GPZ 15 kV Sk3 200 MVA', namespace: 'ZRODLO_SN', default: false, badge_pl: null },
        { catalog_ref: 'src-gpz-15kv-250mva-rx010', label_pl: 'Zasilanie GPZ 15 kV Sk3 250 MVA', namespace: 'ZRODLO_SN', default: true, badge_pl: null },
      ],
    });
    const { container } = render(<SzczegolySzablonu szablon={szablon} onZastosuj={() => {}} />);
    const rownowaznik = screen.getByTestId('mvd-szczegoly-rownowaznik');
    expect(rownowaznik.textContent).toContain(SZABLONY_STRINGS.szczegolyRownowaznik);
    expect(rownowaznik.textContent).toContain('Zasilanie GPZ 15 kV Sk3 250 MVA');
    expect(rownowaznik.textContent).toContain('domyślny');
    expect(container.textContent).toContain('Transformatory 110/SN poza modelem');
  });

  it('szablon wpinany w odcinek nie ma sekcji równoważnika sieci', () => {
    render(<SzczegolySzablonu szablon={szablonPelny()} onZastosuj={() => {}} />);
    expect(screen.queryByTestId('mvd-szczegoly-rownowaznik')).toBeNull();
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
    expect(screen.getByText('Falownik PV przez własny transformator blokowy nN/SN')).toBeInTheDocument();
  });

  it('klik „Zastosuj i edytuj" woła onZastosuj z id szablonu', () => {
    const onZastosuj = vi.fn();
    const szablon = szablonPelny();
    render(<SzczegolySzablonu szablon={szablon} onZastosuj={onZastosuj} />);
    fireEvent.click(screen.getByText(SZABLONY_STRINGS.zastosujIEdytuj));
    expect(onZastosuj).toHaveBeenCalledWith(szablon.id);
  });
});
