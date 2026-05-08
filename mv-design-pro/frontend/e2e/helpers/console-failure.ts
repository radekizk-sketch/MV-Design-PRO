/**
 * Console failure helper (R54) — fail E2E test gdy console.error/pageerror.
 *
 * Wymóg z Etap 18 prompt huntowego: każdy E2E test smoke + workflow
 * powinien failować na realnym JS error w przeglądarce.
 *
 * Wcześniej: errors w console przechodziły niezauważone — ukryte regresje.
 * Po R54: pierwszy error w runtime → test fail z dokładnym message.
 *
 * Użycie:
 *   import { failOnConsoleErrors } from './helpers/console-failure';
 *   test.beforeEach(async ({ page }) => {
 *     failOnConsoleErrors(page);
 *     ...
 *   });
 */

import type { Page } from '@playwright/test';

/**
 * Lista znanych warningów które MOŻNA tolerować (np. dev-mode React warnings
 * z biblioteki zewnętrznej). NIE używać do tłumienia własnych bugów.
 */
const ALLOWED_CONSOLE_PATTERNS: readonly RegExp[] = [
  /Download the React DevTools/,
  /vite-plugin-react/,
  /\[hmr\]/i,
];

export interface ConsoleFailureOptions {
  /** Dodatkowe wzorce do ignorowania (np. specyficzne dla danego testu). */
  readonly extraAllowedPatterns?: readonly RegExp[];
  /** Loguj wszystkie console messages przed fail (do debugowania). */
  readonly logAll?: boolean;
}

export function failOnConsoleErrors(page: Page, opts: ConsoleFailureOptions = {}): void {
  const allowed = [...ALLOWED_CONSOLE_PATTERNS, ...(opts.extraAllowedPatterns ?? [])];

  page.on('console', (msg) => {
    const type = msg.type();
    if (opts.logAll) {
      console.log(`[browser ${type}] ${msg.text()}`);
    }
    if (type !== 'error') return;
    const text = msg.text();
    if (allowed.some((pattern) => pattern.test(text))) return;
    throw new Error(`E2E console.error w przeglądarce: ${text}`);
  });

  page.on('pageerror', (error) => {
    const text = error.message;
    if (allowed.some((pattern) => pattern.test(text))) return;
    throw new Error(`E2E pageerror w przeglądarce: ${text}\n${error.stack ?? ''}`);
  });
}

/**
 * Wariant zbierający — zamiast wyrzucać throw, kolekcjonuje errory do
 * zwrócenia. Użyteczne dla testów które chcą sprawdzić listę errorów
 * końcowo (assertion na końcu) zamiast przerywać przy pierwszym.
 */
export function collectConsoleErrors(page: Page, opts: ConsoleFailureOptions = {}): {
  errors: string[];
  pageErrors: string[];
} {
  const allowed = [...ALLOWED_CONSOLE_PATTERNS, ...(opts.extraAllowedPatterns ?? [])];
  const errors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (allowed.some((p) => p.test(text))) return;
    errors.push(text);
  });

  page.on('pageerror', (error) => {
    const text = error.message;
    if (allowed.some((p) => p.test(text))) return;
    pageErrors.push(text);
  });

  return { errors, pageErrors };
}
