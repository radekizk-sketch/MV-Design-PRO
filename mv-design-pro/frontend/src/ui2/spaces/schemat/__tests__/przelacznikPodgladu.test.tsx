/**
 * Testy trybu pracy kanwy schematu (karta KD-4, luka L-1).
 *
 * INTENCJA: podgląd tylko do odczytu ma być osiągalny Z POWŁOKI (dotąd tylko
 * trasą mostu `#sld-view` z wyszukiwarki poleceń), a stan trybu ma być JEDNĄ
 * prawdą — ten sam widok nie może zachowywać się różnie zależnie od tego, jak
 * się do niego weszło. Kliki natywne (userEvent), Zero-Debt pkt 5.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useShellStore } from '../../../shell/useShellStore';
import { PrzelacznikPodgladu } from '../PrzelacznikPodgladu';

beforeEach(() => {
  useShellStore.setState({ podgladSchematu: false });
});

afterEach(() => cleanup());

describe('PrzelacznikPodgladu — tryb pracy kanwy (L-1)', () => {
  it('domyślnie EDYCJA; klik „Podgląd" włącza tryb tylko do odczytu', async () => {
    const user = userEvent.setup();
    render(<PrzelacznikPodgladu />);

    expect(screen.getByTestId('mvd-schemat-tryb-edycja').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByTestId('mvd-schemat-tryb-uwaga')).toBeNull();

    await user.click(screen.getByTestId('mvd-schemat-tryb-podglad'));

    expect(useShellStore.getState().podgladSchematu).toBe(true);
    expect(screen.getByTestId('mvd-schemat-tryb-podglad').getAttribute('aria-pressed')).toBe('true');
    // Uczciwa informacja, CO oznacza tryb (edycja jest odrzucana).
    expect(screen.getByTestId('mvd-schemat-tryb-uwaga')).toBeTruthy();
  });

  it('powrót do edycji zdejmuje blokadę', async () => {
    const user = userEvent.setup();
    useShellStore.setState({ podgladSchematu: true });
    render(<PrzelacznikPodgladu />);

    await user.click(screen.getByTestId('mvd-schemat-tryb-edycja'));
    expect(useShellStore.getState().podgladSchematu).toBe(false);
  });
});
