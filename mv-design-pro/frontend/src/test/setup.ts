/**
 * Vitest Test Setup
 *
 * Konfiguruje środowisko testowe dla React komponentów.
 */

// Dopasowania DOM (`toBeInTheDocument`, …) tylko w środowisku `jsdom`: plik testów
// w środowisku `node` (komentarz wpisany regułą `scripts/srodowisko_testow.mjs`) nie ma
// DOM, więc ładowanie dopasowań byłoby samym kosztem startu pliku.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
}

// jsdom nie ma ResizeObserver - mockujemy dla Recharts/innych bibliotek
// używających ResponsiveContainer.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverMock;
}

// Czujnik ładunku operacji domenowych: każda makieta `vi.fn`/`vi.spyOn` wywołana jak
// wysyłka operacji (`zakres, operacja, ładunek`) jest sprawdzana kontraktem kluczy po teście.
import { zainstalujCzujnikLadunkow } from './czujnikLadunkow';

zainstalujCzujnikLadunkow();
