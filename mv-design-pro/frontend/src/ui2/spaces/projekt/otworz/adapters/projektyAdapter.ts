/*
 * Adapter listy istniejących projektów (okno W-102, karta E2.2) — czysta
 * projekcja read-only istniejącego typu `Project` (`ui/projects/api.ts`) na
 * wiersz tabeli „Istniejące projekty" (nazwa, ostatnia zmiana). Zero wołań
 * API, zero mutacji.
 *
 * Źródło danych (mapowanie plik:linia — karta §2, §6 wzorca `pulpitAdapter.ts`):
 * - `Project` (kształt danych projektu) — `ui/projects/api.ts:12-18`
 *   (`id`, `name`, `description`, `created_at`, `updated_at`).
 * - `listProjects()` (jedyna funkcja zwracająca listę) — `ui/projects/api.ts:82-86`.
 *
 * TODO-KARTA (źródło niejednoznaczne — karta §2: „brak jednoznacznego źródła
 * → adapter-szkielet TODO-KARTA + lista z propsów, NIE zgaduj i NIE wołaj
 * API"): `ui/projects/api.ts` NIE wystawia store'a read-only (Zustand ani
 * inny) z listą projektów — jedyna funkcja `listProjects()` wykonuje `fetch`
 * do backendu (`ui/projects/api.ts:82-86`) przy każdym wywołaniu, czyli jest
 * efektem ubocznym, nie odczytem stanu. Karta E2.2 zakazuje wołania API z tego
 * modułu. Do czasu wprowadzenia store'a projektów (kolejna faza programu —
 * karta zarządcy wpina hook `use*` analogiczny do `usePrzypadkiWiersze` w
 * `pulpitAdapter.ts`), lista trafia do `OtworzProjekt` WYŁĄCZNIE przez props
 * `projekty`. Funkcja `mapujProjekty` poniżej jest czystą projekcją gotową do
 * wpięcia w przyszły hook, testowalną fixture'ami o kształcie `Project`.
 */

import type { Project } from '../../../../../ui/projects/api';

/** Wiersz tabeli „Istniejące projekty" (W-102). */
export interface ProjektWiersz {
  id: string;
  nazwa: string;
  ostatniaZmianaISO: string | null;
}

/** Czysta projekcja `Project[]` (ui/projects/api.ts:12-18) → wiersze W-102. */
export function mapujProjekty(projekty: Project[]): ProjektWiersz[] {
  return projekty.map((p) => ({
    id: p.id,
    nazwa: p.name,
    ostatniaZmianaISO: p.updated_at ?? null,
  }));
}
