/**
 * F8a — flaga cutoveru renderu SLD (SLD_CAD_REBUILD_PLAN_V3.md §F8;
 * SLD_V3_ACCEPTANCE.md §3). Domyślnie v3 (`featureFlags.USE_SLD_CANVAS_V3`),
 * v2 pozostaje dostępny jako fallback — F8b (usunięcie v2) to zadanie
 * OSOBNE, nietknięte tu.
 *
 * Mechanizm nadpisania (kolejność priorytetu):
 *  1. `localStorage` (klucz `STORAGE_KEY`) — wybór per-sesję/urządzenie,
 *     przydatny dla wsparcia/QA do natychmiastowego rollbacku do v2 bez
 *     rebuildu; ustawiany programowo (brak dedykowanego UI w tej dostawie,
 *     patrz raport F8a — poza zakresem zadania).
 *  2. `featureFlags.USE_SLD_CANVAS_V3` (build-time, env `VITE_FF_…`) —
 *     baza zgodna z istniejącą konwencją projektu (`ui/config/featureFlags.ts`,
 *     wzorzec `USE_LAYOUT_V3`/`App.tsx`).
 */
import { featureFlags } from '../config/featureFlags';

export type SldRenderVersion = 'v2' | 'v3';

export const SLD_RENDER_VERSION_STORAGE_KEY = 'mvdp.sldRenderVersion';

function parseVersion(value: string | null | undefined): SldRenderVersion | null {
  return value === 'v2' || value === 'v3' ? value : null;
}

/**
 * Rozstrzyga wersję renderu SLD do użycia. `storage` jest wstrzykiwalny
 * (domyślnie `window.localStorage`, gdy dostępny) — czysta funkcja dla
 * testów, które mogą przekazać atrapę zamiast realnego `Storage`.
 */
export function resolveSldRenderVersion(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined,
): SldRenderVersion {
  const override = parseVersion(storage?.getItem(SLD_RENDER_VERSION_STORAGE_KEY) ?? null);
  if (override) return override;
  return featureFlags.USE_SLD_CANVAS_V3 ? 'v3' : 'v2';
}
