/*
 * Tryb motywu powłoki MV-DESIGN-PRO (okno W-110).
 *
 * Nazwy trybów są zamrożone i wspólne z wątkiem SLD (karta koordynacyjna SLD-01):
 *   dark_scada       — w UI prezentowany jako „ciemny (dyspozytorski)"
 *   light_technical  — w UI prezentowany jako „jasny (techniczny)"
 *
 * Aktywny tryb jest publikowany na elemencie root jako atrybut `data-theme`
 * (punkt styku z wątkiem SLD). Moduł jest deterministyczny — nie używa
 * Date.now() ani Math.random().
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ThemeMode = 'dark_scada' | 'light_technical';

export const THEME_MODES: readonly ThemeMode[] = ['dark_scada', 'light_technical'];

const THEME_LABELS: Record<ThemeMode, string> = {
  dark_scada: 'ciemny (dyspozytorski)',
  light_technical: 'jasny (techniczny)',
};

/** Polska etykieta trybu motywu (strefa pierwszoplanowa UI). */
export function themeLabel(mode: ThemeMode): string {
  return THEME_LABELS[mode];
}

/**
 * Rozstrzyga tryb na podstawie preferencji systemowej.
 * Gdy `matchMedia` jest niedostępne (np. środowisko testowe), zwraca
 * `dark_scada` — tryb dyspozytorski jest podstawowym trybem ekranowym.
 *
 * UWAGA: funkcja NIE jest już źródłem stanu początkowego store'a (kanon:
 * „the application shell owns the screen theme" — start ZAWSZE od `dark_scada`,
 * §0.4 karty TM1). Zachowana jako narzędzie dla ewentualnych konsumentów
 * chcących odczytać preferencję systemową jawnie.
 */
export function resolveSystemTheme(): ThemeMode {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light_technical'
      : 'dark_scada';
  }
  return 'dark_scada';
}

/** Publikuje tryb na elemencie root jako `data-theme`. */
export function applyThemeMode(
  mode: ThemeMode,
  root: HTMLElement | null = typeof document !== 'undefined' ? document.documentElement : null,
): void {
  if (root) {
    root.setAttribute('data-theme', mode);
  }
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const useThemeModeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      // Domyślny tryb ZAWSZE dyspozytorski (dark_scada) — podstawowy tryb
      // ekranowy stacji przemysłowej. Preferencja systemowa NIE steruje startem;
      // wybór użytkownika jest persystowany przez middleware `persist`.
      mode: 'dark_scada',
      setMode: (mode) => set({ mode }),
      toggle: () =>
        set({ mode: get().mode === 'dark_scada' ? 'light_technical' : 'dark_scada' }),
    }),
    {
      name: 'mvd-theme-mode',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
