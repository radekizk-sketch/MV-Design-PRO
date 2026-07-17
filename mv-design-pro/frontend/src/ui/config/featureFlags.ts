/**
 * Feature Flags — konfiguracja funkcjonalności UI
 *
 * ZASADY:
 * - Każda flaga domyślnie może być nadpisana przez env variable
 * - Format env: VITE_FF_<NAZWA_FLAGI>
 * - Wszystkie flagi są read-only w runtime
 *
 * UŻYCIE:
 * import { featureFlags } from '@/ui/config/featureFlags';
 * if (featureFlags.ENABLE_MATH_RENDERING) { ... }
 */

// =============================================================================
// Helper
// =============================================================================

/**
 * Parsuj wartość env na boolean.
 * Akceptuje: "true", "1", "yes" jako true, reszta to false.
 */
function parseEnvBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.toLowerCase().trim();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

/**
 * Bezpiecznie pobierz zmienną env dla Vite.
 * Używa import.meta.env jeśli dostępne, inaczej zwraca undefined.
 */
function getViteEnv(key: string): string | undefined {
  try {
    const env = (import.meta as any).env; // as any: import.meta.env is not typed in all build contexts
    return env?.[key];
  } catch {
    return undefined;
  }
}

// =============================================================================
// Feature Flags
// =============================================================================

export interface FeatureFlags {
  /**
   * ENABLE_MATH_RENDERING
   *
   * Włącza renderowanie wzorów matematycznych LaTeX przez KaTeX
   * w widoku "Ślad obliczeń".
   *
   * Gdy wyłączone: LaTeX wyświetlany jako czysty tekst (kod).
   * Gdy włączone: LaTeX renderowany wizualnie przez KaTeX.
   *
   * Domyślnie: true (ON)
   * Env override: VITE_FF_ENABLE_MATH_RENDERING
   */
  ENABLE_MATH_RENDERING: boolean;

  /**
   * sldCadEditingEnabled
   *
   * Wlacza stan i kontrakty geometrii CAD dla SLD (AUTO/CAD/HYBRID).
   * Nie dodaje narzedzi edycji w UI.
   *
   * Domyslnie: false (OFF)
   * Env override: VITE_FF_SLD_CAD_EDITING_ENABLED
   */
  sldCadEditingEnabled: boolean;

  /**
   * ENM_INSPECTOR_VISIBLE
   *
   * Pokazuje moduł ENM Inspector (dev tool — raw ENM model dumps).
   * Domyślnie wyłączony — to narzędzie diagnostyczne dewelopera,
   * nie engineering UI dla operatora.
   *
   * Domyślnie: false (OFF)
   * Env override: VITE_FF_ENM_INSPECTOR_VISIBLE
   */
  ENM_INSPECTOR_VISIBLE: boolean;

  /**
   * SLD_OVERLAY_DEMO_VISIBLE
   *
   * Pokazuje showcase SldOverlayDemo (demo różnych overlay-ów SLD).
   * Domyślnie wyłączony — to showcase storybook-style, nie engineering UI.
   *
   * Domyślnie: false (OFF)
   * Env override: VITE_FF_SLD_OVERLAY_DEMO_VISIBLE
   */
  SLD_OVERLAY_DEMO_VISIBLE: boolean;

  /**
   * USE_LAYOUT_V3
   *
   * Włącza shell V3 (chrome 146→76px, NavRail collapsible,
   * 3-poziomowa hierarchia akcji). Domyślnie V12.
   *
   * Domyślnie: false (V12 default)
   * Env override: VITE_USE_LAYOUT_V3
   */
  USE_LAYOUT_V3: boolean;

}

/**
 * Globalne feature flags.
 * Frozen object — immutable w runtime.
 */
export const featureFlags: Readonly<FeatureFlags> = Object.freeze({
  ENABLE_MATH_RENDERING: parseEnvBoolean(
    getViteEnv('VITE_FF_ENABLE_MATH_RENDERING'),
    true // domyślnie ON
  ),
  sldCadEditingEnabled: parseEnvBoolean(
    getViteEnv('VITE_FF_SLD_CAD_EDITING_ENABLED'),
    false
  ),
  ENM_INSPECTOR_VISIBLE: parseEnvBoolean(
    getViteEnv('VITE_FF_ENM_INSPECTOR_VISIBLE'),
    false // dev tool — domyślnie ukryty
  ),
  SLD_OVERLAY_DEMO_VISIBLE: parseEnvBoolean(
    getViteEnv('VITE_FF_SLD_OVERLAY_DEMO_VISIBLE'),
    false // storybook showcase — domyślnie ukryty
  ),
  USE_LAYOUT_V3: parseEnvBoolean(
    getViteEnv('VITE_USE_LAYOUT_V3'),
    false
  ),
});

/**
 * Hook do dostępu do feature flags w komponentach React.
 * Zwraca immutable obiekt flag.
 */
export function useFeatureFlags(): Readonly<FeatureFlags> {
  return featureFlags;
}

/**
 * Sprawdź czy konkretna flaga jest włączona.
 */
export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  return featureFlags[flag];
}
