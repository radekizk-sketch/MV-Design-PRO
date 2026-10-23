/**
 * Żądanie edycji czasu wyłączenia t_b scenariusza zwarciowego (karta TB-WARTOSC-ROBOCZA).
 *
 * PO CO. Ekran wyników zwarć oznacza t_b będący wartością roboczą (propozycja normowa albo
 * czas pola z roboczym czasem własnym wyłącznika) i daje akcję „Zmień wartość". Jedynym
 * nośnikiem t_b projektanta jest pole `breaking_time_seconds` konfiguracji scenariusza
 * zwarciowego — akcja prowadzi więc do okna scenariuszy w przestrzeni „Obliczenia":
 *  - bieg powstały ze scenariusza (`konfiguracja_biegu.scenariusz_zwarciowy_id`) → edycja t_b
 *    TEGO scenariusza (zapis przez `updateScenario`, kontrakt `UpdateFaultScenarioRequest`);
 *  - bieg przypadku bez scenariusza → formularz nowego scenariusza z kursorem w polu t_b.
 *
 * Żądanie żyje w store do chwili, gdy panel scenariuszy je odbierze (panel może się
 * zamontować dopiero po przejściu do przestrzeni). Moduł nic nie liczy.
 */

import { create } from 'zustand';

import { przejdzDoPrzestrzeni } from '../../../shell/przejsciaPrzestrzeni';

export interface ZadanieCzasuTb {
  /** Scenariusz do edycji t_b; `null` = nowy scenariusz (bieg przypadku bez scenariusza). */
  readonly scenarioId: string | null;
}

interface StanZadaniaCzasuTb {
  readonly zadanie: ZadanieCzasuTb | null;
  zazadaj: (scenarioId: string | null) => void;
  odbierz: () => ZadanieCzasuTb | null;
}

export const useZadanieCzasuTb = create<StanZadaniaCzasuTb>((set, get) => ({
  zadanie: null,
  zazadaj: (scenarioId) => set({ zadanie: { scenarioId } }),
  odbierz: () => {
    const { zadanie } = get();
    if (zadanie !== null) set({ zadanie: null });
    return zadanie;
  },
}));

/**
 * Akcja „Zmień wartość" t_b: zapisuje żądanie i przechodzi do przestrzeni „Obliczenia"
 * (kolejność jest faktem — panel scenariuszy odbiera żądanie przy montowaniu).
 */
export function otworzEdycjeCzasuTb(scenarioId: string | null): void {
  useZadanieCzasuTb.getState().zazadaj(scenarioId);
  przejdzDoPrzestrzeni('obliczenia');
}
