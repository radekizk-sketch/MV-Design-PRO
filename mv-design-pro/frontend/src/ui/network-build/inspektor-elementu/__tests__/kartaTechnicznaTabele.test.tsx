/**
 * Renderer tabel karty technicznej K6 (decyzja architekta 2026-11-04 pkt 2 i 3). ILOCZYN CECH:
 *
 *   liczba tabel sekcji {1 · 2} → podpis tabeli {brak — nazwa z tytułu sekcji · obecny};
 *   kolumna {liczbowa · tekstowa} → klasa wyrównania liczb w nagłówku i w komórkach;
 *   wiersz {z celem · bez celu} × wywołanie otwarcia {podane · brak}
 *     → przycisk otwarcia karty obiektu w pierwszej komórce tylko dla (z celem × podane).
 *
 * Klik natywny (`fireEvent.click` na przycisku, jak użytkownik).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { KartaTechniczna, SekcjaKarty, TabelaKarty } from '../../../sld/shared/kartaTechnicznaElementu';
import { KartaTechnicznaElementu } from '../KartaTechnicznaElementu';

afterEach(cleanup);

const CEL = { rodzaj: 'aparat', poleRef: 'bay/1', aparatRef: 'dev/cb' } as const;

function tabela(klucz: string, zCelem = false): TabelaKarty {
  return {
    klucz,
    podpis: `Podpis ${klucz}`,
    zwarta: true,
    kolumny: [
      { klucz: 'nazwa', etykieta: 'Aparat' },
      { klucz: 'ur', etykieta: 'Uᵣ [kV]', liczbowa: true },
    ],
    wiersze: [
      { klucz: 'w1', komorki: { nazwa: 'Wyłącznik Q1', ur: '24' }, ...(zCelem ? { cel: CEL } : {}) },
      { klucz: 'w2', komorki: { nazwa: 'Odłącznik Q0', ur: null } },
    ],
    pustaPl: 'Brak.',
  };
}

function karta(sekcja: SekcjaKarty): KartaTechniczna {
  return { rodzaj: 'pole', rodzajPl: 'Pole', nazwa: 'Pole 1', elementRef: 'bay/1', sekcje: [sekcja] };
}

describe('podpis tabeli × liczba tabel sekcji', () => {
  it('jedna tabela: bez podpisu, obszar i tabela nazwane tytułem sekcji', () => {
    render(<KartaTechnicznaElementu karta={karta({ id: 'zasilanie', tytul: 'Zasilanie', wiersze: [], tabele: [tabela('siec')] })} onEdytuj={null} />);
    expect(screen.queryByTestId('inspektor-karta-tabela-siec-podpis')).toBeNull();
    expect(screen.queryByText('Podpis siec')).toBeNull();
    const idTytulu = screen.getByText('Zasilanie').id;
    expect(idTytulu).not.toBe('');
    expect(screen.getByTestId('inspektor-karta-tabela-siec-przewijanie')).toHaveAttribute('aria-labelledby', idTytulu);
    expect(screen.getByTestId('inspektor-karta-tabela-siec')).toHaveAttribute('aria-labelledby', idTytulu);
  });

  it('dwie tabele: każda z podpisem, który ją nazywa', () => {
    render(
      <KartaTechnicznaElementu
        karta={karta({ id: 'sekcje_szyn', tytul: 'Sekcje szyn', wiersze: [], tabele: [tabela('sn'), tabela('wn')] })}
        onEdytuj={null}
      />,
    );
    for (const k of ['sn', 'wn']) {
      const podpis = screen.getByTestId(`inspektor-karta-tabela-${k}-podpis`);
      expect(podpis).toHaveTextContent(`Podpis ${k}`);
      expect(screen.getByTestId(`inspektor-karta-tabela-${k}`)).toHaveAttribute('aria-labelledby', podpis.id);
    }
  });
});

describe('kolumna liczbowa', () => {
  it('nagłówek i komórki kolumny liczbowej mają klasę liczb; tekstowej — nie', () => {
    render(<KartaTechnicznaElementu karta={karta({ id: 'aparatura', tytul: 'Aparatura', wiersze: [], tabele: [tabela('aparaty')] })} onEdytuj={null} />);
    const t = screen.getByTestId('inspektor-karta-tabela-aparaty');
    const naglowki = within(t).getAllByRole('columnheader');
    expect(naglowki.map((th) => th.classList.contains('mvd-kt-liczba'))).toEqual([false, true]);
    for (const td of t.querySelectorAll('td[data-kolumna="ur"]')) expect(td).toHaveClass('mvd-kt-liczba');
    for (const td of t.querySelectorAll('td[data-kolumna="nazwa"]')) expect(td).not.toHaveClass('mvd-kt-liczba');
  });
});

describe('wiersz z celem × wywołanie otwarcia', () => {
  it.each([
    [true, true, 1],
    [true, false, 0],
    [false, true, 0],
    [false, false, 0],
  ] as const)('cel %s × wywołanie %s → przycisków %i', (zCelem, zWywolaniem, przyciskow) => {
    const otworz = vi.fn();
    render(
      <KartaTechnicznaElementu
        karta={karta({ id: 'aparatura', tytul: 'Aparatura', wiersze: [], tabele: [tabela('aparaty', zCelem)] })}
        onEdytuj={null}
        onOtworz={zWywolaniem ? otworz : undefined}
      />,
    );
    const przyciski = screen.queryAllByTestId('inspektor-karta-otworz-aparaty');
    expect(przyciski).toHaveLength(przyciskow);
    if (przyciskow > 0) {
      // Przycisk niesie tekst pierwszej komórki wiersza z celem.
      expect(przyciski[0]).toHaveTextContent('Wyłącznik Q1');
      expect(przyciski[0].closest('td')).toHaveAttribute('data-kolumna', 'nazwa');
      fireEvent.click(przyciski[0]);
      expect(otworz).toHaveBeenCalledTimes(1);
      expect(otworz).toHaveBeenCalledWith(CEL);
    }
    // Tekst komórki jest zawsze widoczny (z przyciskiem albo bez).
    expect(screen.getByText('Wyłącznik Q1')).toBeInTheDocument();
  });
});
