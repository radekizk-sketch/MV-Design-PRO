/**
 * Tabela ocen funkcji ziemnozwarciowych i uziemień stacji — rekordy z REALNEGO biegu ewaluatora
 * (fikstura generowana z backendu i pilnowana strażnikiem
 * `backend/tests/ci/test_fikstura_oceny_ziemnozwarciowej.py`).
 *
 * ILOCZYN CECH: wariant sieci {izolowana bez danych uziomu, kompensowana z AWSC i uziomem} ×
 * rodzaj rekordu {ocena funkcji, uziemienie stacji, odmowa} × zawężenie {wszystkie, jeden
 * sterownik} × akcja {z drogą do uzupełnienia, bez}. Klik natywny (userEvent).
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import fikstura from './fixtures/oceny_ziemnozwarciowe.json';
import { TabelaOcenyZiemnozwarciowej } from '../TabelaOcenyZiemnozwarciowej';
import {
  rekordyZiemnozwarciowe,
  zapisWielkosci,
  zdanieBrakow,
  type WynikOcenyZiemnozwarciowej,
} from '../ocenaZiemnozwarciowa';
import { KOORDYNACJA_STRINGS as T } from '../strings';

const WARIANTY = fikstura as unknown as Record<string, WynikOcenyZiemnozwarciowej>;

describe.each(Object.keys(WARIANTY))('TabelaOcenyZiemnozwarciowej — %s', (nazwa) => {
  const wynik = WARIANTY[nazwa];
  const rekordy = rekordyZiemnozwarciowe(wynik);

  it('wiersz każdego rekordu: kryterium z backendu, wynik i limit z jednostką, etykieta ZE zdaniem', () => {
    render(<TabelaOcenyZiemnozwarciowej wynik={wynik} />);
    const wiersze = screen.getAllByTestId('mvd-ocena-ziemnozwarciowa-wiersz');
    expect(wiersze).toHaveLength(rekordy.length);
    // Kolejność czytania = kolejność raportu: oceny, uziemienia, odmowy.
    expect(wiersze.map((w) => w.dataset.kryterium)).toEqual(rekordy.map((r) => r.kryterium));
    wiersze.forEach((w, i) => {
      const r = rekordy[i];
      const komorki = within(w).getAllByRole('cell');
      expect(komorki[0]).toHaveTextContent(r.nazwa_urzadzenia_pl);
      expect(komorki[1]).toHaveTextContent(r.etykieta_pl ?? '—');
      expect(komorki[2]).toHaveTextContent(r.kryterium_pl);
      expect(komorki[3]).toHaveTextContent(zapisWielkosci(r.ocena.wynik?.wartosc));
      expect(komorki[4]).toHaveTextContent(zapisWielkosci(r.ocena.limit?.wartosc));
      // Werdykt wyjaśnialny: status nigdy sam — etykieta i zdanie wyjaśnienia w jednej komórce.
      expect(komorki[5]).toHaveTextContent(r.ocena.etykieta.etykieta_pl);
      expect(komorki[5]).toHaveTextContent(r.zdanie_pl);
      expect(w.dataset.status).toBe(r.status);
    });
  });

  it('odmowa i kryterium bez danych niosą braki z akcją naprawczą; przycisk prowadzi do modelu', async () => {
    const onUzupelnij = vi.fn();
    render(<TabelaOcenyZiemnozwarciowej wynik={wynik} onUzupelnij={onUzupelnij} />);
    const zBrakami = rekordy.filter((r) => zdanieBrakow(r) !== null);
    expect(zBrakami.length).toBeGreaterThan(0);
    const braki = screen.getAllByTestId('mvd-ocena-ziemnozwarciowa-braki');
    expect(braki).toHaveLength(zBrakami.length);
    zBrakami.forEach((r, i) => expect(braki[i]).toHaveTextContent(zdanieBrakow(r)!));
    // Przycisk tylko przy odmowie z brakami modelu (napięcie krokowe bez geometrii nie ma
    // operacji w modelu — sam opis braku).
    const przyciski = screen.getAllByTestId('mvd-ocena-ziemnozwarciowa-uzupelnij');
    expect(przyciski).toHaveLength(rekordy.filter((r) => (r.braki ?? []).length > 0).length);
    await userEvent.click(przyciski[0]);
    expect(onUzupelnij).toHaveBeenCalledTimes(1);
  });

  it('zawężenie do jednego sterownika pokazuje wyłącznie jego rekordy', () => {
    const ref = wynik.oceny[0].urzadzenie_ref;
    render(<TabelaOcenyZiemnozwarciowej wynik={wynik} urzadzenieRef={ref} />);
    const wiersze = screen.getAllByTestId('mvd-ocena-ziemnozwarciowa-wiersz');
    expect(wiersze.length).toBe(rekordy.filter((r) => r.urzadzenie_ref === ref).length);
    expect(wiersze.every((w) => w.dataset.urzadzenie === ref)).toBe(true);
  });
});

describe('TabelaOcenyZiemnozwarciowej — stan zerowy', () => {
  it('bez wyniku i bez rekordów — uczciwy komunikat, bez tabeli', () => {
    const { rerender } = render(<TabelaOcenyZiemnozwarciowej wynik={null} />);
    expect(screen.getByTestId('mvd-ocena-ziemnozwarciowa-brak')).toHaveTextContent(T.ziemneBrak);
    expect(screen.queryByRole('table')).toBeNull();
    rerender(
      <TabelaOcenyZiemnozwarciowej
        wynik={{ oceny: [], uziemienia: [], odmowy: [], doziemienie: {}, wyniki_uziemien: [], funkcje: [] }}
      />,
    );
    expect(screen.getByTestId('mvd-ocena-ziemnozwarciowa-brak')).toBeInTheDocument();
  });

  it('wariant kompensowany z AWSC niesie napięcie uziomowe z jednostką, izolowany — rezystancję dopuszczalną', () => {
    const awsc = rekordyZiemnozwarciowe(WARIANTY.KOMPENSOWANY_AWSC_z_uziomem);
    const uziomowe = awsc.find((r) => r.kryterium === 'NAPIECIE_UZIOMOWE');
    expect(uziomowe && zapisWielkosci(uziomowe.ocena.wynik?.wartosc)).toMatch(/ V$/);
    const izolowany = rekordyZiemnozwarciowe(WARIANTY.IZOLOWANY_bez_uziomu);
    expect(izolowany.some((r) => r.kryterium === 'REZYSTANCJA_DOPUSZCZALNA')).toBe(true);
  });
});
