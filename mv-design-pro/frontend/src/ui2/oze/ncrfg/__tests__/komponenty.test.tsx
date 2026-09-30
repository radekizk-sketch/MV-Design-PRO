/**
 * Wspólne komponenty zgodności NC RfG (karta AB-1a Pakiet D2) na odpowiedziach POLICZONYCH
 * przez backend (fixtury harnessu — `eksport_fixtur_harnessu.py`):
 * - nagłówek modułu: klasyfikacja/technologia/źródło danych/dowód albo jawny brak/procedura
 *   z pól backendu (procedura to obiekt `DokumentWarstwy` — nigdy `[object Object]`);
 * - dowód certyfikatu: iloczyn (dowód × odrzucenie × brak) × (model × formularz);
 * - lista rekordów wymagań: plakietka = etykieta z rekordu, karta po natywnym kliknięciu;
 * - sekcja modułu dokumentu i ekran braków 422.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import certyfikatBraki from '../../../../harness-fixtures/generated/certyfikat_scena_macierz_braki.json';
import certyfikatWidok from '../../../../harness-fixtures/generated/certyfikat_scena_magazyn.json';
import biegFixtura from '../../../../harness-fixtures/generated/ncrfg_bieg_scena_macierz.json';
import zgodnoscFixtura from '../../../../harness-fixtures/generated/ncrfg_zgodnosc_przekrojowa_scena_macierz.json';
import { useShellStore } from '../../../shell/useShellStore';
import {
  BrakiDokumentu,
  DowodCertyfikatuOpis,
  ListaRekordowWymagan,
  NaglowekModuluNcRfg,
  SekcjaModuluDokumentu,
} from '../komponenty';
import { POZYCJE_AUDYTOWE_BLOKU } from '../typy';
import type {
  BiegNcRfg,
  BrakiCertyfikatu,
  WidokCertyfikatu,
  ZgodnoscPrzypadkuNcRfg,
} from '../typy';

const BIEG = biegFixtura as unknown as BiegNcRfg;
const ZGODNOSC = zgodnoscFixtura as unknown as ZgodnoscPrzypadkuNcRfg;
const WIDOK = certyfikatWidok as unknown as WidokCertyfikatu;
const BRAKI = certyfikatBraki as unknown as BrakiCertyfikatu;

describe('NaglowekModuluNcRfg', () => {
  it('bieg „co-jeśli": pola backendu, procedura jako tekst dokumentu, dowód = jawny brak formularza', () => {
    const modul = BIEG.modules[1];
    render(<NaglowekModuluNcRfg modul={modul} testid="n" />);
    const naglowek = screen.getByTestId('n');
    expect(naglowek).not.toHaveTextContent('[object Object]');
    expect(screen.getByTestId('n-klasyfikacja')).toHaveAttribute('data-modul', modul.klasyfikacja.modul ?? '');
    expect(screen.getByTestId('n-klasyfikacja')).toHaveTextContent(modul.klasyfikacja.powod_pl);
    expect(screen.getByTestId('n-procedura')).toHaveTextContent(modul.wersja_procedury.tytul);
    expect(screen.getByTestId('n-zrodlo')).toHaveTextContent('dane formularza');
    expect(screen.getByTestId('n-dowod')).toHaveAttribute('data-stan', 'brak');
    expect(screen.getByTestId('n-dowod')).toHaveTextContent('wyprowadza wyłącznie serwer');
  });

  it('zatwierdzony model: dowód certyfikatu z rekordu wykazu (numer dokumentu, WiPWC)', () => {
    const pv = ZGODNOSC.bieg!.modules.find((m) => m.dowod_certyfikatu !== null)!;
    render(<NaglowekModuluNcRfg modul={pv} testid="n" />);
    expect(screen.getByTestId('n-dowod')).toHaveAttribute('data-stan', 'dowod');
    expect(screen.getByTestId('n-dowod-numer')).toHaveTextContent(pv.dowod_certyfikatu!.numer_dokumentu);
    expect(screen.getByTestId('n-dowod-wipwc')).toHaveTextContent(pv.dowod_certyfikatu!.wersja_wipwc);
    expect(screen.getByTestId('n-zrodlo')).toHaveTextContent('zatwierdzony model');
  });
});

describe('DowodCertyfikatuOpis — dowód × odrzucenie × brak × źródło danych', () => {
  const dowod = ZGODNOSC.bieg!.modules.find((m) => m.dowod_certyfikatu !== null)!.dowod_certyfikatu;
  it.each([
    ['dowód z modelu', dowod, null, 'ZATWIERDZONY_MODEL', 'dowod'],
    ['odrzucona tabliczka', null, { der_ref: 'x', rekord_ref: 'r', powod_pl: 'rekord spoza wykazu' }, 'ZATWIERDZONY_MODEL', 'odrzucony'],
    ['brak w modelu', null, null, 'ZATWIERDZONY_MODEL', 'brak'],
    ['brak w biegu z formularza', null, null, 'ZADANIE_KLIENTA', 'brak'],
  ] as const)('%s', (_opis, d, odrzucony, zrodlo, stan) => {
    render(<DowodCertyfikatuOpis dowod={d} odrzucony={odrzucony} zrodloDanych={zrodlo} testid="d" />);
    expect(screen.getByTestId('d')).toHaveAttribute('data-stan', stan);
    if (stan === 'dowod') {
      // Karta #145: rekord nazwany polami wykazu; klucz rekordu rejestru poza pierwszym planem.
      expect(screen.getByTestId('d')).toHaveTextContent(d!.producent);
      expect(screen.getByTestId('d')).not.toHaveTextContent(d!.rekord_id);
    }
    if (stan === 'odrzucony') expect(screen.getByTestId('d')).toHaveTextContent('rekord spoza wykazu');
    if (stan === 'brak') {
      expect(screen.getByTestId('d')).toHaveTextContent(
        zrodlo === 'ZATWIERDZONY_MODEL' ? 'tabliczka urządzenia w modelu' : 'biegu z danych formularza',
      );
    }
  });
});

it('dowód certyfikatu: identyfikator rekordu wykazu wyłącznie w informacjach audytowych trybu eksperckiego', async () => {
  const dowod = ZGODNOSC.bieg!.modules.find((m) => m.dowod_certyfikatu !== null)!.dowod_certyfikatu!;
  const uzytkownik = userEvent.setup();
  useShellStore.setState({ advancementMode: 'expert' });
  render(<DowodCertyfikatuOpis dowod={dowod} zrodloDanych="ZATWIERDZONY_MODEL" testid="d" />);
  await uzytkownik.click(screen.getByTestId('d-informacje-audytowe-przelacz'));
  expect(screen.getByTestId('d-informacje-audytowe-lista')).toHaveTextContent(dowod.rekord_id);
  useShellStore.setState({ advancementMode: 'basic' });
});

describe('ListaRekordowWymagan', () => {
  it('plakietka niesie etykietę i status Z REKORDU; karta rozwija się natywnym kliknięciem', async () => {
    const rekordy = BIEG.ocena_wymagan[1].wymagania;
    const uzytkownik = userEvent.setup();
    render(<ListaRekordowWymagan rekordy={rekordy} testid="w" />);
    const pierwszy = rekordy[0];
    const wiersz = screen.getByTestId(`w-${pierwszy.wymaganie_id}`);
    const plakietka = within(wiersz).getByTestId(`w-${pierwszy.wymaganie_id}-etykieta`);
    expect(plakietka).toHaveTextContent(pierwszy.etykieta.etykieta_pl);
    expect(plakietka).toHaveAttribute('data-status', pierwszy.status_maszynowy);
    expect(plakietka).toHaveAttribute('data-semantyka', pierwszy.etykieta.semantyka);
    expect(screen.queryByTestId(`w-${pierwszy.wymaganie_id}-karta`)).toBeNull();
    const przelacz = within(wiersz).getByTestId(`w-${pierwszy.wymaganie_id}-przelacz`);
    await uzytkownik.click(przelacz);
    expect(przelacz).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId(`w-${pierwszy.wymaganie_id}-karta`)).toBeInTheDocument();
    await uzytkownik.click(przelacz);
    expect(screen.queryByTestId(`w-${pierwszy.wymaganie_id}-karta`)).toBeNull();
  });

  it('ten sam wymaganie_id z kilku modułów (lista braków) → jednoznaczne identyfikatory wierszy', () => {
    const rekordy = BIEG.ocena_wymagan[1].wymagania;
    const pierwszy = rekordy[0];
    render(<ListaRekordowWymagan rekordy={[pierwszy, pierwszy, pierwszy]} testid="w" />);
    expect(screen.getAllByTestId(`w-${pierwszy.wymaganie_id}`)).toHaveLength(1);
    expect(screen.getAllByTestId(`w-${pierwszy.wymaganie_id}-2`)).toHaveLength(1);
    expect(screen.getAllByTestId(`w-${pierwszy.wymaganie_id}-3`)).toHaveLength(1);
  });

  it('pusta lista rekordów → jawny komunikat, nie pusta tabela', () => {
    render(<ListaRekordowWymagan rekordy={[]} testid="w" />);
    expect(screen.getByTestId('w-pusta')).toBeInTheDocument();
  });
});

describe('SekcjaModuluDokumentu (widok certyfikatu policzony backendem)', () => {
  it('wiersze dokumentu, dowód/brak i rekordy W z blokami zapisu dokumentu', async () => {
    const sekcja = WIDOK.moduly[0];
    const uzytkownik = userEvent.setup();
    render(<SekcjaModuluDokumentu sekcja={sekcja} testid="s" />);
    const wiersze = screen.getByTestId('s-wiersze');
    for (const wiersz of sekcja.wiersze) expect(wiersze).toHaveTextContent(wiersz.etykieta_pl);
    expect(screen.getByTestId('s-dowod')).toHaveAttribute('data-stan', sekcja.dowod_certyfikatu ? 'dowod' : 'brak');
    const pierwszy = sekcja.wymagania[0];
    await uzytkownik.click(screen.getByTestId(`s-wymagania-${pierwszy.rekord.wymaganie_id}-przelacz`));
    await uzytkownik.click(screen.getByTestId(`s-wymagania-${pierwszy.rekord.wymaganie_id}-zapis-przelacz`));
    const blok = screen.getByTestId(`s-wymagania-${pierwszy.rekord.wymaganie_id}-zapis`);
    // Karta #145: intencja bez zmian — każda pozycja bloku backendu jest pokazana; pozycje
    // audytowe (odniesienie do dowodu, bieg śladu) stoją w informacjach audytowych, nie w
    // zapisie pierwszego planu (iloczyn trybów przypina `pozycjeAudytowe.test.tsx`).
    for (const pozycja of pierwszy.blok) {
      if (POZYCJE_AUDYTOWE_BLOKU.includes(pozycja.etykieta_pl)) {
        expect(blok).not.toHaveTextContent(pozycja.etykieta_pl);
      } else {
        expect(blok).toHaveTextContent(pozycja.etykieta_pl);
      }
    }
    expect(pierwszy.blok.some((p) => POZYCJE_AUDYTOWE_BLOKU.includes(p.etykieta_pl))).toBe(true);
  });
});

describe('BrakiDokumentu (422 certyfikatu policzone backendem)', () => {
  it('komunikat, rekordy W pogrupowane po module ze zdaniami backendu, bez liczników', () => {
    render(
      <BrakiDokumentu
        komunikat={BRAKI.komunikat}
        braki={BRAKI.braki}
        zdania={BRAKI.braki_pl}
        pominietePl={BRAKI.pominiete_pl}
        testid="b"
      />,
    );
    expect(screen.getByTestId('b')).toHaveTextContent(BRAKI.komunikat);
    expect(BRAKI.braki.length).toBeGreaterThan(0);
    // Każdy brak należy do NAZWANEGO modułu (`der_ref`/`der_name` z odpowiedzi 422) — ten
    // sam wymóg dwóch modułów nie zlewa się w jeden wiersz bez wskazania, którego dotyczy.
    BRAKI.braki.forEach((brak, indeks) => {
      const modul = screen.getByTestId(`b-modul-${brak.der_ref}`);
      expect(modul).toHaveTextContent(brak.der_name ?? brak.der_ref);
      const lista = within(modul).getByTestId(`b-rekordy-${brak.der_ref}`);
      expect(
        within(lista).getAllByTestId(`b-rekordy-${brak.der_ref}-${brak.rekord.wymaganie_id}-etykieta`)[0],
      ).toHaveTextContent(brak.rekord.etykieta.etykieta_pl);
      expect(lista).toHaveTextContent(BRAKI.braki_pl[indeks].zdanie_pl);
      expect(BRAKI.braki_pl[indeks].der_ref).toBe(brak.der_ref);
    });
    expect(screen.queryByTestId('b-tekstowe')).toBeNull();
  });
});
