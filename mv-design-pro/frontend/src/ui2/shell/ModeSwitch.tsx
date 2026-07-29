/*
 * Przełącznik trybów zaawansowania (Podstawowy / Rozszerzony / Ekspercki)
 * oraz bramka progresywnego odsłaniania (AdvancementGate) — SPEC_UKLAD_PANELI §2.
 * Tryb zmienia WYŁĄCZNIE widoczność powierzchni, nie dane ani wyniki.
 */

import type { ReactNode } from 'react';
import { ADVANCEMENT_MODES, advancementModeLabel, isModeAtLeast, type AdvancementMode } from './modeModel';
import { SHELL_STRINGS } from './strings';

interface ModeSwitchProps {
  mode: AdvancementMode;
  onChange: (mode: AdvancementMode) => void;
}

export function ModeSwitch({ mode, onChange }: ModeSwitchProps) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <span className="mvd-lbl">{SHELL_STRINGS.modeGroup}</span>
      <div role="group" aria-label={SHELL_STRINGS.modeGroup} style={{ display: 'inline-flex', gap: '4px' }}>
        {ADVANCEMENT_MODES.map((value) => {
          const active = value === mode;
          return (
            <button
              key={value}
              type="button"
              className={active ? 'mvd-btn mvd-btn-primary' : 'mvd-btn'}
              aria-pressed={active}
              data-mvd-mode={value}
              onClick={() => onChange(value)}
            >
              {advancementModeLabel(value)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface AdvancementGateProps {
  /** Minimalny tryb, w którym element jest widoczny. */
  minMode: AdvancementMode;
  currentMode: AdvancementMode;
  children: ReactNode;
  testId?: string;
}

/**
 * Ukrywa (bez odmontowania) powierzchnię o wyższym `minMode`. Dzieci pozostają
 * w drzewie i zachowują stan wewnętrzny — spełnia kryterium §7.2 (bez remount).
 */
export function AdvancementGate({ minMode, currentMode, children, testId }: AdvancementGateProps) {
  const visible = isModeAtLeast(currentMode, minMode);
  return (
    <div hidden={!visible} data-mvd-gate={minMode} data-mvd-visible={visible} data-testid={testId}>
      {children}
    </div>
  );
}
