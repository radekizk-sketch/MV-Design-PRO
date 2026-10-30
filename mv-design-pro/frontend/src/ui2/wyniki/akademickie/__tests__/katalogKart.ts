/**
 * Oczekiwanie na WCZYTANY katalog kart okna analiz specjalistycznych.
 *
 * Sekcja `mvd-akad-katalog-kart` istnieje już w stanie ładowania (komunikat „wczytywanie”),
 * więc samo jej pojawienie się nie znaczy, że karty są w DOM — zapytania o karty zaraz po
 * `findByTestId` sekcji były wyścigiem (czerwone pod obciążeniem puli testów). Stan wczytania
 * niesie `aria-busy` sekcji (ten sam sygnał dla czytnika ekranu).
 */
import { screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

export async function czekajNaKatalogKart(): Promise<HTMLElement> {
  const sekcja = await screen.findByTestId('mvd-akad-katalog-kart');
  await waitFor(() => expect(sekcja).toHaveAttribute('aria-busy', 'false'));
  return sekcja;
}
