/**
 * Test selektora wejścia (E1.7b §3) — szew parytetowy:
 * domyślnie STARA powłoka; nowa wyłącznie przez jawny parametr/localStorage.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { KLUCZ_POWLOKI, wybierzWejscie } from '../entry';

function ustawAdres(sciezkaZSearch: string, hash: string) {
  window.history.replaceState(null, '', sciezkaZSearch);
  window.location.hash = hash;
}

describe('E1.7b — selektor wejścia aplikacji (flaga parytetowa)', () => {
  afterEach(() => {
    localStorage.removeItem(KLUCZ_POWLOKI);
    ustawAdres('/', '');
  });

  it('domyślnie wybiera STARE wejście (zero zmiany zachowania)', () => {
    ustawAdres('/', '');
    expect(wybierzWejscie()).toBe('stare');
  });

  it('parametr ?powloka=nowa w zapytaniu hash włącza nowe wejście', () => {
    ustawAdres('/', '#sld?powloka=nowa');
    expect(wybierzWejscie()).toBe('nowe');
  });

  it('parametr ?powloka=nowa w search włącza nowe wejście', () => {
    ustawAdres('/?powloka=nowa', '');
    expect(wybierzWejscie()).toBe('nowe');
  });

  it('localStorage mvdp.powloka=nowa włącza nowe wejście', () => {
    ustawAdres('/', '');
    localStorage.setItem(KLUCZ_POWLOKI, 'nowa');
    expect(wybierzWejscie()).toBe('nowe');
  });

  it('parametr ?powloka=stara wygrywa z localStorage', () => {
    localStorage.setItem(KLUCZ_POWLOKI, 'nowa');
    ustawAdres('/', '#sld?powloka=stara');
    expect(wybierzWejscie()).toBe('stare');
  });
});
