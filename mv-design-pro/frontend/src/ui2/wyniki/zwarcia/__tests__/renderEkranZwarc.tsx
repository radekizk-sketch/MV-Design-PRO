/**
 * Render ekranu zwarć z ODCZEKANIEM na ustabilizowanie sekcji pasma MIN/MAX
 * (efekt asynchroniczny `usePasmoZwarcia`, karta W3-G3). Bez tego aktualizacja
 * stanu pasma spływa po asercjach testu jako „not wrapped in act(...)" —
 * ostrzeżenie „celowo zaakceptowane" w 9611fca9 zdjęte U ŹRÓDŁA przy odbiorze
 * fali 3 W3 (2026-09-10), dla KAŻDEGO pliku testów renderującego `EkranZwarc`
 * (KLASA, NIE INSTANCJA: ekranZwarc, rozplywZwarciowy, sladZrodelSieciowych).
 * Gdy ekran nie ma biegu, sekcji nie ma i oczekiwanie kończy się natychmiast.
 */
import type React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';

/**
 * Deterministyczna atrapa `fetch` dla pasma MIN/MAX: odmowa 404 = uczciwy stan
 * „błąd pobrania" pasma, zamiast realnego zapytania sieciowego z jsdom (Node 20
 * ma globalny `fetch`). Testy dostawcy wkładów nadpisują atrapę własną.
 */
export function atrapaFetchPasma(): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
}

export async function renderEkranZwarc(element: React.ReactElement) {
  const wynik = render(element);
  await waitFor(() =>
    expect(screen.queryByTestId('mvd-zwarcia-pasmo-wczytywanie')).not.toBeInTheDocument(),
  );
  return wynik;
}
