import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { KafelSzablonu } from '../KafelSzablonu';
import { SZABLONY_STRINGS } from '../strings';
import { szablonPelny, szablonSekcyjny } from './fixtures';

describe('<KafelSzablonu /> — kafel wariantu (karta §3)', () => {
  it('renderuje nazwę i opis zastosowania', () => {
    const szablon = szablonPelny();
    render(
      <KafelSzablonu
        szablon={szablon}
        zaznaczony={false}
        doPorownania={false}
        onKlik={() => {}}
        onOtworz={() => {}}
        onMenuKontekstowe={() => {}}
      />,
    );
    expect(screen.getByText(szablon.name_pl)).toBeInTheDocument();
    expect(screen.getByText(szablon.use_case_pl)).toBeInTheDocument();
  });

  it('pokazuje pola strukturalne: kategorię, moc [kVA] i napięcia [kV] (kontrakt szablonu, nie parsowanie name_pl)', () => {
    const szablon = szablonPelny({ rated_power_kva: 630, voltage_hv_kv: 15, voltage_lv_kv: 0.4 });
    render(
      <KafelSzablonu
        szablon={szablon}
        zaznaczony={false}
        doPorownania={false}
        onKlik={() => {}}
        onOtworz={() => {}}
        onMenuKontekstowe={() => {}}
      />,
    );
    expect(screen.getByText(szablon.category_label_pl)).toBeInTheDocument();
    expect(screen.getByText('630 kVA')).toBeInTheDocument();
    expect(screen.getByText('15/0.4 kV')).toBeInTheDocument();
  });

  it('moc/napięcia null (katalog niedostępny) — wiersze pominięte, zero wartości fabrykowanej', () => {
    const szablon = szablonPelny({ rated_power_kva: null, voltage_hv_kv: null, voltage_lv_kv: null });
    render(
      <KafelSzablonu
        szablon={szablon}
        zaznaczony={false}
        doPorownania={false}
        onKlik={() => {}}
        onOtworz={() => {}}
        onMenuKontekstowe={() => {}}
      />,
    );
    expect(screen.queryByText(SZABLONY_STRINGS.kafelMoc)).not.toBeInTheDocument();
    expect(screen.queryByText(SZABLONY_STRINGS.kafelNapiecia)).not.toBeInTheDocument();
  });

  it('pokazuje liczbę pól SN wprost z schema.sn_bays_count.default', () => {
    const szablon = szablonPelny({ sn_bays_count_default: 6 });
    render(
      <KafelSzablonu
        szablon={szablon}
        zaznaczony={false}
        doPorownania={false}
        onKlik={() => {}}
        onOtworz={() => {}}
        onMenuKontekstowe={() => {}}
      />,
    );
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('miniatura SVG ma dokładnie tyle prostokątów, ile pól SN (deterministyczna)', () => {
    const szablon = szablonPelny({ sn_bays_count_default: 4 });
    const { container } = render(
      <KafelSzablonu
        szablon={szablon}
        zaznaczony={false}
        doPorownania={false}
        onKlik={() => {}}
        onOtworz={() => {}}
        onMenuKontekstowe={() => {}}
      />,
    );
    expect(container.querySelectorAll('rect.mvd-szablony-miniatura-pole')).toHaveLength(4);
  });

  it('1× klik woła onKlik z id szablonu', () => {
    const onKlik = vi.fn();
    const szablon = szablonPelny();
    render(
      <KafelSzablonu
        szablon={szablon}
        zaznaczony={false}
        doPorownania={false}
        onKlik={onKlik}
        onOtworz={() => {}}
        onMenuKontekstowe={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId(`mvd-szablon-kafel-${szablon.id}`));
    expect(onKlik).toHaveBeenCalledWith(szablon.id);
  });

  it('2× klik woła onOtworz (Zastosuj i edytuj) z id szablonu', () => {
    const onOtworz = vi.fn();
    const szablon = szablonPelny();
    render(
      <KafelSzablonu
        szablon={szablon}
        zaznaczony={false}
        doPorownania={false}
        onKlik={() => {}}
        onOtworz={onOtworz}
        onMenuKontekstowe={() => {}}
      />,
    );
    fireEvent.doubleClick(screen.getByTestId(`mvd-szablon-kafel-${szablon.id}`));
    expect(onOtworz).toHaveBeenCalledWith(szablon.id);
  });

  it('prawy klik woła onMenuKontekstowe z id i pozycją, bez natywnego menu przeglądarki', () => {
    const onMenuKontekstowe = vi.fn();
    const szablon = szablonPelny();
    render(
      <KafelSzablonu
        szablon={szablon}
        zaznaczony={false}
        doPorownania={false}
        onKlik={() => {}}
        onOtworz={() => {}}
        onMenuKontekstowe={onMenuKontekstowe}
      />,
    );
    fireEvent.contextMenu(screen.getByTestId(`mvd-szablon-kafel-${szablon.id}`), { clientX: 12, clientY: 34 });
    expect(onMenuKontekstowe).toHaveBeenCalledWith(szablon.id, { x: 12, y: 34 });
  });

  it('`Enter` na zaznaczonym kaflu woła onOtworz (gramatyka MODEL_INTERAKCJI §2)', () => {
    const onOtworz = vi.fn();
    const szablon = szablonPelny();
    render(
      <KafelSzablonu
        szablon={szablon}
        zaznaczony
        doPorownania={false}
        onKlik={() => {}}
        onOtworz={onOtworz}
        onMenuKontekstowe={() => {}}
      />,
    );
    fireEvent.keyDown(screen.getByTestId(`mvd-szablon-kafel-${szablon.id}`), { key: 'Enter' });
    expect(onOtworz).toHaveBeenCalledWith(szablon.id);
  });

  it('rola „COUPLER" trafia na kafel wyłącznie jako polska etykieta (label_pl), nie kod roli', () => {
    const szablon = szablonSekcyjny();
    render(
      <KafelSzablonu
        szablon={szablon}
        zaznaczony={false}
        doPorownania={false}
        onKlik={() => {}}
        onOtworz={() => {}}
        onMenuKontekstowe={() => {}}
      />,
    );
    expect(screen.getByText(/Pole sprzęgła \(bus coupler\)/)).toBeInTheDocument();
  });

  it('znacznik porównania widoczny wyłącznie gdy doPorownania=true', () => {
    const szablon = szablonPelny();
    const { rerender } = render(
      <KafelSzablonu
        szablon={szablon}
        zaznaczony={false}
        doPorownania={false}
        onKlik={() => {}}
        onOtworz={() => {}}
        onMenuKontekstowe={() => {}}
      />,
    );
    expect(screen.getByTestId(`mvd-szablon-kafel-${szablon.id}`).className).not.toMatch(/porownanie/);
    rerender(
      <KafelSzablonu
        szablon={szablon}
        zaznaczony={false}
        doPorownania
        onKlik={() => {}}
        onOtworz={() => {}}
        onMenuKontekstowe={() => {}}
      />,
    );
    expect(screen.getByTestId(`mvd-szablon-kafel-${szablon.id}`).className).toMatch(/porownanie/);
  });
});
