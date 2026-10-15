/**
 * Kontekst wskazania BRAKU_DO_OPERACJI — rama podaje `data-testid` pola wskazanego przy
 * próbie zapisu, a koszulka pola (`pola.tsx`) oznacza się nim (`data-wskazane`), żeby
 * projektant widział, którego parametru dotyczy jedno zdanie w stopce. Osobny plik, bo
 * kontekst czytają oba moduły ramy (rama i pola) — bez cyklu importów.
 */

import { createContext } from 'react';

export const WskazanieKontekst = createContext<string | null>(null);
