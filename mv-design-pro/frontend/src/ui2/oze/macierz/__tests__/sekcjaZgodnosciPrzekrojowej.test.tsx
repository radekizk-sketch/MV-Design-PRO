/**
 * Sekcja „Zgodność przypadku (zatwierdzony model)" (karta AB-1a Pakiet D2 §3) — odpowiedź
 * policzona backendem (fixtura sceny `macierz`); granica atrapy = `fetch`. Per moduł:
 * nagłówek z klasyfikacją, źródłem danych, dowodem certyfikatu (PV z wykazu) albo jawnym
 * brakiem (magazyn) i rekordy W; zero statusu modułu i liczników. Interakcje natywne.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { atrapaSieci, odpowiedzJson } from '../../ncrfg/__tests__/atrapaSieci';
import type { ZgodnoscPrzypadkuNcRfg } from '../../ncrfg/typy';
import { SekcjaZgodnosciPrzekrojowej } from '../SekcjaZgodnosciPrzekrojowej';
import { MACIERZ_STRINGS } from '../strings';
import { zgodnoscFixture } from './fixtures';

function trasa(odpowiedz: () => Response) {
  return atrapaSieci([
    { metoda: 'GET', sciezka: /^\/api\/ncrfg-tests\/cases\/[^/]+\/compliance$/, odpowiedz },
  ]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stany zerowe — bez zapytania, gdy brak podstawy', () => {
  it.each([
    ['brak przypadku', null, 'enea', 'mvd-oze-zgodnosc-przekrojowa-brak-przypadku'],
    ['brak operatora', 'case-demo', null, 'mvd-oze-zgodnosc-przekrojowa-brak-operatora'],
  ] as const)('%s → komunikat, zero zapytań, odświeżenie nieaktywne', (_opis, caseId, operatorId, testid) => {
    const wywolania = trasa(() => odpowiedzJson(200, zgodnoscFixture()));
    render(<SekcjaZgodnosciPrzekrojowej caseId={caseId} operatorId={operatorId} nazwyModulow={{}} trybEkspercki={false} />);
    expect(screen.getByTestId(testid)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-odswiez')).toBeDisabled();
    expect(wywolania).toHaveLength(0);
  });

  it('model bez DER → komunikat „brak źródła"', async () => {
    trasa(() =>
      odpowiedzJson(200, { case_id: 'c', operator_id: 'enea', der_count: 0, pominiete: [], certyfikaty_odrzucone: [], bieg: null }),
    );
    render(<SekcjaZgodnosciPrzekrojowej caseId="c" operatorId="enea" nazwyModulow={{}} trybEkspercki={false} />);
    expect(await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-brak-der')).toHaveTextContent(
      MACIERZ_STRINGS.zgodnoscPrzekrojowaBrakDer,
    );
  });

  it('błąd backendu → komunikat z treścią detail', async () => {
    trasa(() => odpowiedzJson(404, { detail: 'Przypadek case-x nie ma dokumentu ENM.' }));
    render(<SekcjaZgodnosciPrzekrojowej caseId="case-x" operatorId="enea" nazwyModulow={{}} trybEkspercki={false} />);
    expect(await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-blad')).toHaveTextContent('nie ma dokumentu ENM');
  });
});

describe('dane — moduły modelu z dowodem albo jawnym brakiem i rekordami W', () => {
  it('per moduł: nagłówek (zatwierdzony model), dowód PV z wykazu, brak dowodu magazynu, rekordy W', async () => {
    trasa(() => odpowiedzJson(200, zgodnoscFixture()));
    render(<SekcjaZgodnosciPrzekrojowej caseId="case-demo" operatorId="enea" nazwyModulow={{}} trybEkspercki={false} />);
    const bieg = zgodnoscFixture().bieg!;
    for (const [indeks, modul] of bieg.modules.entries()) {
      const naglowek = await screen.findByTestId(`mvd-oze-zgodnosc-przekrojowa-naglowek-${modul.der_ref}`);
      expect(within(naglowek).getByTestId(`mvd-oze-zgodnosc-przekrojowa-naglowek-${modul.der_ref}-zrodlo`)).toHaveTextContent(
        'zatwierdzony model',
      );
      expect(screen.getByTestId(`mvd-oze-zgodnosc-przekrojowa-naglowek-${modul.der_ref}-dowod`)).toHaveAttribute(
        'data-stan',
        modul.dowod_certyfikatu ? 'dowod' : 'brak',
      );
      const lista = screen.getByTestId(`mvd-oze-zgodnosc-przekrojowa-wymagania-${modul.der_ref}`);
      expect(within(lista).getAllByRole('listitem')).toHaveLength(bieg.ocena_wymagan[indeks].wymagania.length);
    }
    expect(screen.queryByText(/zgodnych|niezgodnych/)).toBeNull();
  });

  it('DER pominięte przez backend → lista z powodem backendu; nazwa: słownik › der_name › ref', async () => {
    const odpowiedz: ZgodnoscPrzypadkuNcRfg = {
      ...zgodnoscFixture(),
      pominiete: [{ der_ref: 'fw-1', der_name: null, powod: 'brak_napiecia', powod_pl: 'szyna bez napięcia znamionowego' }],
    };
    trasa(() => odpowiedzJson(200, odpowiedz));
    render(
      <SekcjaZgodnosciPrzekrojowej caseId="case-demo" operatorId="enea" nazwyModulow={{ 'fw-1': 'Farma wiatrowa' }} trybEkspercki={false} />,
    );
    expect(await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-pominiety-fw-1')).toHaveTextContent(
      'Farma wiatrowa: szyna bez napięcia znamionowego',
    );
  });

  it('odciski biegu wyłącznie w trybie eksperckim (informacje audytowe)', async () => {
    trasa(() => odpowiedzJson(200, zgodnoscFixture()));
    const { rerender } = render(
      <SekcjaZgodnosciPrzekrojowej caseId="case-demo" operatorId="enea" nazwyModulow={{}} trybEkspercki={false} />,
    );
    await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-moduly');
    expect(screen.queryByTestId('mvd-oze-zgodnosc-przekrojowa-audyt')).toBeNull();
    rerender(<SekcjaZgodnosciPrzekrojowej caseId="case-demo" operatorId="enea" nazwyModulow={{}} trybEkspercki />);
    expect(screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-audyt')).toBeInTheDocument();
  });
});

describe('interakcje natywne', () => {
  it('odświeżenie ponawia zapytanie; zmiana operatora ponawia je samoczynnie z nowym operator_id', async () => {
    const wywolania = trasa(() => odpowiedzJson(200, zgodnoscFixture()));
    const uzytkownik = userEvent.setup();
    const { rerender } = render(
      <SekcjaZgodnosciPrzekrojowej caseId="case-demo" operatorId="enea" nazwyModulow={{}} trybEkspercki={false} />,
    );
    await screen.findByTestId('mvd-oze-zgodnosc-przekrojowa-moduly');
    await uzytkownik.click(screen.getByTestId('mvd-oze-zgodnosc-przekrojowa-odswiez'));
    await waitFor(() => expect(wywolania).toHaveLength(2));
    rerender(<SekcjaZgodnosciPrzekrojowej caseId="case-demo" operatorId="pse" nazwyModulow={{}} trybEkspercki={false} />);
    await waitFor(() => expect(wywolania).toHaveLength(3));
    expect(wywolania.map((w) => w.zapytanie.get('operator_id'))).toEqual(['enea', 'enea', 'pse']);
  });

  it('„Pokaż w macierzy" tylko dla modułów znanych macierzy; klik woła onWybierzModul(der_ref)', async () => {
    trasa(() => odpowiedzJson(200, zgodnoscFixture()));
    const [znany, nieznany] = zgodnoscFixture().bieg!.modules;
    const onWybierzModul = vi.fn();
    const uzytkownik = userEvent.setup();
    render(
      <SekcjaZgodnosciPrzekrojowej
        caseId="case-demo"
        operatorId="enea"
        nazwyModulow={{ [znany.der_ref]: 'Magazyn' }}
        trybEkspercki={false}
        onWybierzModul={onWybierzModul}
      />,
    );
    await uzytkownik.click(await screen.findByTestId(`mvd-oze-zgodnosc-przekrojowa-pokaz-${znany.der_ref}`));
    expect(onWybierzModul).toHaveBeenCalledWith(znany.der_ref);
    expect(screen.queryByTestId(`mvd-oze-zgodnosc-przekrojowa-pokaz-${nieznany.der_ref}`)).toBeNull();
  });
});
