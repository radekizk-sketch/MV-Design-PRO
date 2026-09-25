/**
 * Pozycje audytowe bloku dokumentu NC RfG (karta #145).
 *
 * Iloczyn cech: {pozycja merytoryczna, pozycja audytowa} × {tryb podstawowy, ekspercki}
 * oraz parytet listy z backendem (`werdykt/dokument.py::POZYCJE_AUDYTOWE` — stałe etykiet
 * czytane ze źródła, równość zbiorów).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useShellStore } from '../../../shell/useShellStore';
import { POZYCJE_AUDYTOWE_BLOKU } from '../typy';
import { ZapisDokumentu } from '../komponenty';

const ZRODLO = join(process.cwd(), '..', 'backend', 'src', 'werdykt', 'dokument.py');

describe('pozycje audytowe — parytet z backendem', () => {
  it('lista frontu = krotka POZYCJE_AUDYTOWE backendu (po wartościach stałych)', () => {
    const tekst = readFileSync(ZRODLO, 'utf-8');
    const krotka = /POZYCJE_AUDYTOWE: tuple\[str, \.\.\.\] = \(([^)]*)\)/.exec(tekst);
    expect(krotka).not.toBeNull();
    const wartosci = krotka![1].split(',').map((nazwa) => nazwa.trim()).filter(Boolean).map((stala) => {
      const def = new RegExp(`^${stala} = "([^"]+)"`, 'm').exec(tekst);
      expect(def, stala).not.toBeNull();
      return def![1];
    });
    expect([...wartosci].sort()).toEqual([...POZYCJE_AUDYTOWE_BLOKU].sort());
  });
});

describe('ZapisDokumentu — identyfikatory poza pierwszym planem', () => {
  const BLOK = [
    { etykieta_pl: 'Dowód', tresc_pl: 'metoda: symulacja; przydatność dowodowa: tak' },
    { etykieta_pl: 'Odniesienie do dowodu', tresc_pl: 'bieg 1612608abc' },
    { etykieta_pl: 'Ślad', tresc_pl: 'K1: krok' },
    { etykieta_pl: 'Bieg śladu', tresc_pl: 'bieg run-7; wersja silnika 1.2.0' },
  ];

  afterEach(() => useShellStore.setState({ advancementMode: 'basic' } as never));

  it.each([
    ['basic', false],
    ['expert', true],
  ])('tryb %s: pozycje merytoryczne w zapisie, audytowe tylko w informacjach audytowych', (tryb, ekspert) => {
    useShellStore.setState({ advancementMode: tryb } as never);
    render(<ZapisDokumentu blok={BLOK} testid="zapis" />);
    fireEvent.click(screen.getByTestId('zapis-przelacz'));
    const zapis = screen.getByTestId('zapis');
    expect(zapis).toHaveTextContent('metoda: symulacja');
    expect(zapis).toHaveTextContent('K1: krok');
    expect(zapis).not.toHaveTextContent('1612608abc');
    expect(zapis).not.toHaveTextContent('run-7');
    expect(screen.queryByTestId('zapis-informacje-audytowe-przelacz') !== null).toBe(ekspert);
  });
});
