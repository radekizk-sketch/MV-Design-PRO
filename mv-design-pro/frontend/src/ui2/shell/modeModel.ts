/*
 * Tryby zaawansowania (progresywne odsłanianie) — SPEC_UKLAD_PANELI §2.
 * Ukrycie ≠ usunięcie: element o wyższym `minMode` jest nadal w drzewie
 * (ukrywany atrybutem `hidden`, bez remountu), aby zachować stan wewnętrzny.
 * Tryb NIE zmienia danych ani wyników — wyłącznie widoczność powierzchni.
 */

import { SHELL_STRINGS } from './strings';

export type AdvancementMode = 'basic' | 'extended' | 'expert';

export const ADVANCEMENT_MODES: readonly AdvancementMode[] = ['basic', 'extended', 'expert'];

const ORDER: Record<AdvancementMode, number> = { basic: 0, extended: 1, expert: 2 };

const LABELS: Record<AdvancementMode, string> = {
  basic: SHELL_STRINGS.modeBasic,
  extended: SHELL_STRINGS.modeExtended,
  expert: SHELL_STRINGS.modeExpert,
};

export function advancementModeLabel(mode: AdvancementMode): string {
  return LABELS[mode];
}

/** Czy `current` udostępnia powierzchnię o minimalnym trybie `min`. */
export function isModeAtLeast(current: AdvancementMode, min: AdvancementMode): boolean {
  return ORDER[current] >= ORDER[min];
}
