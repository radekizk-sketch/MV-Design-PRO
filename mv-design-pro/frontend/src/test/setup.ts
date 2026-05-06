/**
 * Vitest Test Setup
 *
 * Konfiguruje środowisko testowe dla React komponentów.
 */

import '@testing-library/jest-dom/vitest';

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
