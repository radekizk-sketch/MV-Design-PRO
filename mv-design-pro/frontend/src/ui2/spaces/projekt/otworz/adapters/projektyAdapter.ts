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
 * STAN (karta E2.2 zakazywała wołania API z TEGO modułu — „adapter = czysta
 * projekcja, zero efektów ubocznych"; karta K4 dostarczyła kontener): wołanie
 * `listProjects()` (`ui/projects/api.ts:82-86`, efekt uboczny — `fetch` przy
 * każdym wywołaniu, nie odczyt stanu) żyje w `OtworzProjektKontener.tsx`, KTÓRY
 * importuje `mapujProjekty` stąd i podaje wynik do `OtworzProjekt` przez props
 * `projekty` (ten sam podział jak `pulpitAdapter.ts` + kontener
 * `PulpitProjektu.tsx`: adapter jest czystą, testowalną projekcją; wołanie API
 * i cykl życia żyją w kontenerze). Ten moduł POZOSTAJE bez `fetch` — to
 * zamierzony podział warstw, nie luka.
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
