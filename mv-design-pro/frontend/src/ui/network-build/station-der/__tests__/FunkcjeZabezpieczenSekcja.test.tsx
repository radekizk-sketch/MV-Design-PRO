/**
 * Sekcja funkcji zabezpieczeniowych na ekranie (E21-3, audyt E-21 P7/P8).
 *
 * Testy pilnują tego, co odróżnia dobór od ozdoby: każda funkcja pokazuje PODSTAWĘ,
 * chroniony obiekt i źródło pomiaru; niezgodność przeznaczenia urządzenia jest
 * widoczna; kwestie otwarte (czego nie da się rozstrzygnąć) też — bo cisza wyglądałaby
 * jak „nic nie brakuje". Ekran NICZEGO nie dobiera: cała treść pochodzi z reguły
 * domenowej, więc test podstawia odpowiedź endpointu i sprawdza, co ekran z nią robi.
 */

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FunkcjeZabezpieczenSekcja } from '../FunkcjeZabezpieczenSekcja';

const ODPOWIEDZ = {
  generator_ref: 'DER-1',
  bay_ref: 'BAY-1',
  fakty: {
    connection_side: 'SN',
    neutral_grounding_mode: 'cewka_petersena',
    zero_sequence_current_source: 'przekladnik_ferrantiego',
    zero_sequence_voltage_source: 'otwarty_trojkat_vt',
  },
  dobor: {
    wymagane: [
      {
        kod: '50',
        nazwa_pl: 'Nadprądowe zwłoczne bezzwłoczne (I>>)',
        podstawa_pl: 'Szybkie wyłączenie zwarć międzyfazowych (IEC 60255-151).',
        chroniony_obiekt_pl: 'pole wytwórcy DER-1',
        zrodlo_pomiaru_pl: 'przekładniki prądowe fazowe pola',
      },
      {
        kod: '50G',
        nazwa_pl: 'Ziemnozwarciowe z przekładnika ziemnozwarciowego',
        podstawa_pl: 'Prąd zerowy mierzony przekładnikiem obejmującym wszystkie żyły.',
        chroniony_obiekt_pl: 'pole wytwórcy DER-1',
        zrodlo_pomiaru_pl: 'przekładnik ziemnozwarciowy (Ferrantiego)',
      },
      {
        kod: '67N',
        nazwa_pl: 'Kierunkowe ziemnozwarciowe',
        podstawa_pl: 'Sieć kompensowana: prąd doziemny jest pojemnościowy.',
        chroniony_obiekt_pl: 'pole wytwórcy DER-1',
        zrodlo_pomiaru_pl: 'prąd zerowy + napięcie z otwartego trójkąta',
      },
    ],
    kwestie_otwarte: [
      {
        kod: 'protection.osd_requirements_not_modelled',
        opis_pl: 'Model nie niesie wymagań zabezpieczeniowych operatora sieci.',
        skutek_pl: 'Zweryfikuj listę z warunkami przyłączenia.',
      },
    ],
  },
  urzadzenie: {
    protection_catalog_ref: 'ABB_REB670',
    nazwa: 'ABB Relion REB670',
    brakujace_funkcje: ['50G', '67N'],
    ostrzezenia_przeznaczenia: [
      'ABB Relion REB670 deklaruje funkcję 87BB (różnicowe szyn zbiorczych), '
      + 'która należy do innej strefy zabezpieczeniowej niż pole wytwórcy.',
    ],
    pokrywa_wymagania: false,
  },
};

const originalFetch = global.fetch;

describe('FunkcjeZabezpieczenSekcja — dobór z reguły, nie lista uniwersalna', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ODPOWIEDZ,
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('każda funkcja niesie podstawę, chroniony obiekt i źródło pomiaru', async () => {
    // Sedno pkt P7: „samo wyświetlenie kodów nie stanowi projektu zabezpieczeń".
    render(<FunkcjeZabezpieczenSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);

    const wiersz = await screen.findByTestId('funkcja-50G');
    expect(wiersz.textContent).toContain('Ziemnozwarciowe z przekładnika');
    expect(wiersz.textContent).toContain('Prąd zerowy mierzony przekładnikiem');
    expect(wiersz.textContent).toContain('Chroniony obiekt: pole wytwórcy DER-1');
    expect(wiersz.textContent).toContain('Pomiar: przekładnik ziemnozwarciowy');
  });

  it('pokazuje TOR POMIAROWY, z którego wynika dobór', async () => {
    render(<FunkcjeZabezpieczenSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const tor = await screen.findByTestId('funkcje-tor-pomiaru');
    expect(tor.textContent).toContain('sieć kompensowana');
    expect(tor.textContent).toContain('przekładnika ziemnozwarciowego');
    expect(tor.textContent).toContain('otwartego trójkąta');
  });

  it('funkcja, której urządzenie NIE realizuje, jest oznaczona przy tej funkcji', async () => {
    render(<FunkcjeZabezpieczenSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    expect(await screen.findByTestId('funkcja-brak-w-urzadzeniu-50G')).toBeTruthy();
    expect(screen.getByTestId('funkcja-brak-w-urzadzeniu-67N')).toBeTruthy();
    // Kontrola odwrotna: funkcja realizowana NIE dostaje ostrzeżenia.
    expect(screen.queryByTestId('funkcja-brak-w-urzadzeniu-50')).toBeNull();
  });

  it('niezgodność PRZEZNACZENIA urządzenia jest widoczna osobno od braku funkcji', async () => {
    // Dwa różne werdykty, dwa różne miejsca — aparat może mieć komplet kodów ANSI
    // i mimo to być urządzeniem innej strefy (przypadek REB670).
    render(<FunkcjeZabezpieczenSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const ostrzezenie = await screen.findByTestId('funkcje-ostrzezenie-przeznaczenia');
    expect(ostrzezenie.textContent).toContain('87BB');
    expect(ostrzezenie.textContent).toContain('innej strefy');
  });

  it('kwestie otwarte są POKAZANE — cisza wyglądałaby jak brak braków', async () => {
    render(<FunkcjeZabezpieczenSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const kwestie = await screen.findByTestId('funkcje-kwestie-otwarte');
    expect(kwestie.textContent).toContain('wymagań zabezpieczeniowych operatora');
    expect(kwestie.textContent).toContain('warunkami przyłączenia');
  });

  it('bez projektu i przypadku obliczeniowego powód jest nazwany, a zapytania nie ma', () => {
    render(<FunkcjeZabezpieczenSekcja derId="DER-1" projectId={null} caseId={null} />);
    expect(screen.getByTestId('funkcje-brak-kontekstu')).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('błąd pobrania jest POKAZANY, a nie zamieniony w pustą listę funkcji', async () => {
    // Pusta lista wyglądałaby jak „żadna funkcja nie jest wymagana" — nieprawda
    // groźniejsza od komunikatu o błędzie.
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    render(<FunkcjeZabezpieczenSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const blad = await screen.findByTestId('funkcje-blad');
    expect(blad.textContent).toContain('Nie udało się pobrać doboru');
    expect(screen.queryByTestId('funkcja-50')).toBeNull();
  });

  it('odpowiedz o INNYM ksztalcie nie wywraca karty — powod jest nazwany', async () => {
    // Defekt zlapany regresja: sekcja ufala kształtowi odpowiedzi, wiec payload z innego
    // endpointu (albo starsza wersja API) rzucal wyjatkiem w renderze i kasowal CALA
    // karte gotowosci razem z edytorem wiazan. Kontrola kształtu zamienia to w nazwany
    // blad tej jednej sekcji.
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ id: 'ct_200_5_5p10_10va_abb', name: 'CT 200/5' }],
    })) as unknown as typeof fetch;

    render(<FunkcjeZabezpieczenSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const blad = await screen.findByTestId('funkcje-blad');
    expect(blad.textContent).toContain('nieoczekiwany kształt');
  });
});
