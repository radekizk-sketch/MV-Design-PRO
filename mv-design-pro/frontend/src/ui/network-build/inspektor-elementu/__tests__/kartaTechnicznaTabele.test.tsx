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
  return { rodzaj: 'pole', rodzajPl: 'Pole', nazwa: 'Pole 1', elementRef: 'bay/1', stacjaRef: null, stacjaNazwa: null, sekcje: [sekcja] };
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

// Opis bez powtórzeń (decyzja architekta pkt 1): kolumny objęte komórką poprzedniej
// (`WierszTabeli.polaczone`) — iloczyn: scalenie {brak · rola} × pozycja kolumny {środek · ostatnia}.
describe('wiersz tabeli × kolumny scalone', () => {
  function tabelaPol(polaczone: readonly string[] | undefined, kolumny: readonly string[]): TabelaKarty {
    return {
      klucz: 'pola_sn',
      podpis: 'Pola',
      zwarta: true,
      kolumny: kolumny.map((k) => ({ klucz: k, etykieta: k })),
      wiersze: [
        {
          klucz: 'pole-1',
          komorki: { pole: 'Pole liniowe wejściowe 1', rola: 'Pole liniowe wejściowe', stan: 'zamknięty' },
          ...(polaczone ? { polaczone } : {}),
        },
      ],
      pustaPl: 'Brak.',
    };
  }
  it.each([
    [undefined, ['pole', 'rola', 'stan'], ['pole', 'rola', 'stan'], [1, 1, 1]],
    [['rola'], ['pole', 'rola', 'stan'], ['pole', 'stan'], [2, 1]],
    [['stan'], ['pole', 'rola', 'stan'], ['pole', 'rola'], [1, 2]],
  ] as const)('scalone %j: komórki %j, rozpiętości %j', (polaczone, kolumny, widoczne, rozpietosci) => {
    render(<KartaTechnicznaElementu karta={karta({ id: 's', tytul: 'Rozdzielnica', wiersze: [], tabele: [tabelaPol(polaczone, kolumny)] })} onEdytuj={null} />);
    const komorki = within(screen.getByTestId('inspektor-karta-wiersz-pola_sn')).getAllByRole('cell');
    expect(komorki.map((k) => k.getAttribute('data-kolumna'))).toEqual(widoczne);
    expect(komorki.map((k) => Number(k.getAttribute('colspan') ?? '1'))).toEqual(rozpietosci);
    // Nazwa pola raz — rola nie stoi drugi raz w wierszu, gdy scalona.
    const tekst = screen.getByTestId('inspektor-karta-wiersz-pola_sn').textContent ?? '';
    expect(tekst.split('Pole liniowe wejściowe').length - 1).toBe((polaczone as readonly string[] | undefined)?.includes('rola') ? 1 : 2);
  });
});

// Brak w karcie pola i stacji (decyzja architekta pkt 3, uwaga b): opis braku zamiast „brak
// danych”; brak z edycją jest przyciskiem, akcja wiersza (dodaj zabezpieczenie) — tylko w trybie
// edycji. Iloczyn: wiersz {z wartością · brak z opisem · brak bez opisu} × edycja {jest · brak}
// × tryb {edycja modelu · tylko odczyt}; lista {pusta · z pozycjami}.
describe('wiersz karty × brak × edycja × tryb', () => {
  const EDYCJA = { elementRef: 'bay/1', parametr: 'bay_number', wartosc: '' } as const;
  const AKCJA = { operacja: 'add_relay', kontekst: { bay_ref: 'bay/1' }, etykietaPl: 'dodaj zabezpieczenie' } as const;
  for (const wartosc of ['07', null] as const) {
    for (const brakPl of ['bez numeru dyspozytorskiego — nadaj numer', undefined] as const) {
      for (const zEdycja of [true, false]) {
        for (const tryb of ['edycja', 'odczyt'] as const) {
          it(`wartość=${wartosc ?? 'brak'} opis=${brakPl ? 'jest' : 'brak'} edycja=${zEdycja} tryb=${tryb}`, () => {
            const onEdytuj = vi.fn();
            render(
              <KartaTechnicznaElementu
                karta={karta({
                  id: 's',
                  tytul: 'Identyfikacja',
                  wiersze: [{ klucz: 'numer', etykieta: 'Numer pola', wartosc, ...(brakPl ? { brakPl } : {}), ...(zEdycja ? { edycja: EDYCJA } : {}) }],
                })}
                onEdytuj={tryb === 'edycja' ? onEdytuj : null}
              />,
            );
            const pokazane = screen.getByTestId('inspektor-karta-wartosc-numer').textContent;
            expect(pokazane).toBe(wartosc ?? brakPl ?? 'brak danych');
            const przycisk = screen.queryByTestId('inspektor-karta-zmien-numer');
            const edytowalny = zEdycja && tryb === 'edycja';
            expect(przycisk !== null).toBe(edytowalny);
            if (!przycisk) return;
            // Brak z edycją: opis braku JEST przyciskiem (bez osobnego „Zmień”).
            expect(przycisk.textContent).toBe(wartosc === null ? pokazane : 'Zmień');
            fireEvent.click(przycisk);
            expect(onEdytuj).toHaveBeenCalledWith(EDYCJA);
          });
        }
      }
    }
  }

  it.each(['edycja', 'odczyt'] as const)('akcja wiersza (dodaj zabezpieczenie) — tryb %s', (tryb) => {
    const onAkcja = vi.fn();
    render(
      <KartaTechnicznaElementu
        karta={karta({
          id: 'zab',
          tytul: 'Zabezpieczenie i pomiary',
          wiersze: [{ klucz: 'zabezpieczenie', etykieta: 'Zabezpieczenie', wartosc: null, brakPl: 'Brak sterownika — wzorzec pola wymaga funkcji 51, 50', akcja: AKCJA }],
        })}
        onEdytuj={tryb === 'edycja' ? vi.fn() : null}
        onAkcja={onAkcja}
      />,
    );
    expect(screen.getByTestId('inspektor-karta-wartosc-zabezpieczenie')).toHaveTextContent('Brak sterownika — wzorzec pola wymaga funkcji 51, 50');
    const akcja = screen.queryByTestId('inspektor-karta-akcja-zabezpieczenie');
    expect(akcja !== null).toBe(tryb === 'edycja');
    if (!akcja) return;
    expect(akcja).toHaveTextContent('dodaj zabezpieczenie');
    fireEvent.click(akcja);
    expect(onAkcja).toHaveBeenCalledWith(AKCJA);
  });

  // Uwaga architekta (a): liczba stoi w wierszu etykiety, pozycje listy niżej w osobnym `dd`
  // na całą szerokość — nie w tym samym elemencie co liczba.
  it.each([[[]], [['Odcinek z pola GPZ · YAKXS 3×120/16 · 0,5 km']], [['A', 'B']]] as const)('lista %j: liczba w wierszu etykiety, pozycje osobno', (pozycje) => {
    render(
      <KartaTechnicznaElementu
        karta={karta({
          id: 'p',
          tytul: 'Przyłączenie',
          wiersze: [{ klucz: 'przylaczenie', etykieta: 'Odcinki na zacisku pola', wartosc: pozycje.length ? String(pozycje.length) : 'brak w modelu', lista: pozycje }],
        })}
        onEdytuj={null}
      />,
    );
    const wartosc = screen.getByTestId('inspektor-karta-wartosc-przylaczenie');
    expect(wartosc.textContent).toBe(pozycje.length ? String(pozycje.length) : 'brak w modelu');
    const lista = screen.queryByTestId('inspektor-karta-lista-przylaczenie');
    expect(lista !== null).toBe(pozycje.length > 0);
    if (!lista) return;
    expect(lista.closest('dd')).not.toBe(wartosc.closest('dd'));
    expect(lista.closest('dd')).toHaveClass('mvd-kt-lista-pozycje');
    expect(within(lista).getAllByRole('listitem').map((li) => li.textContent)).toEqual([...pozycje]);
  });
});
