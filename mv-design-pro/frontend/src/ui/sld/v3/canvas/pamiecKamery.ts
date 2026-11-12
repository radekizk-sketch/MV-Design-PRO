/**
 * SLD V3 — PAMIĘĆ KAMERY PER PROJEKT (karta SLD-SKALA-I-NAWIGACJA, R7).
 *
 * Warsztat schematu odmontowuje się przy wyjściu z przestrzeni schematu (przestrzeń modelu,
 * analiz, projektu), a kamera jest stanem wewnętrznym kanwy — bez pamięci powrót na schemat
 * zaczynał od dopasowania całej sieci i projektant tracił miejsce pracy. Pamięć trzyma ostatni
 * kadr (przekształcenie i rozmiar kanwy, w którym obowiązywał) per identyfikator projektu na czas
 * sesji przeglądarki; zaznaczenie jest już globalne (`ui/selection/store.ts`) i przeżywa wyjście
 * samo. Kadr wraca CIĘCIEM (bez przelotu) przez tę samą akcję reduktora co „Poprzedni widok"
 * (`przywroc`), więc obowiązują te same granice skali i tego samego świata.
 *
 * Granica: pamięć nie jest częścią modelu ani projektu (nie trafia do archiwum, eksportu ani
 * wyniku) — to stan widoku, jak historia kadrów. Projekt bez identyfikatora (`null`) nie ma
 * pamięci.
 */
import type { ViewportTransform } from './camera';

export interface ZapamietanyKadr {
  readonly transform: ViewportTransform;
  readonly viewportSize: { readonly width: number; readonly height: number };
}

const PAMIEC = new Map<string, ZapamietanyKadr>();

export function zapamietajKadrProjektu(projekt: string | null | undefined, kadr: ZapamietanyKadr): void {
  if (!projekt) return;
  if (!(kadr.viewportSize.width > 0 && kadr.viewportSize.height > 0)) return;
  PAMIEC.set(projekt, kadr);
}

export function kadrProjektu(projekt: string | null | undefined): ZapamietanyKadr | undefined {
  return projekt ? PAMIEC.get(projekt) : undefined;
}

/** Wyłącznie dla testów — izolacja przypadków. */
export function wyczyscPamiecKamery(): void {
  PAMIEC.clear();
}
