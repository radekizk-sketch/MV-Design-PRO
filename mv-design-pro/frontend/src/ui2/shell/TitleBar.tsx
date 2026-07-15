/*
 * Pasek tytułowy powłoki (okno W-110): logo, ścieżka projektu, przełącznik trybu
 * zaawansowania, przełącznik motywu, zwijanie paneli, menu „Widok" (Przywróć
 * układ domyślny) oraz akcje „Zapisz" i „Przelicz aktywny przypadek".
 */

import { useId, useState } from 'react';
import { ModeSwitch } from './ModeSwitch';
import type { AdvancementMode } from './modeModel';
import { SHELL_STRINGS } from './strings';
import { themeLabel, type ThemeMode } from '../theme/themeMode';

interface TitleBarProps {
  projectName: string | null;
  advancementMode: AdvancementMode;
  onAdvancementModeChange: (mode: AdvancementMode) => void;
  themeMode: ThemeMode;
  onThemeToggle: () => void;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onResetLayout: () => void;
  onSave?: () => void;
  onCalculate?: () => void;
}

export function TitleBar({
  projectName,
  advancementMode,
  onAdvancementModeChange,
  themeMode,
  onThemeToggle,
  leftCollapsed,
  rightCollapsed,
  onToggleLeft,
  onToggleRight,
  onResetLayout,
  onSave,
  onCalculate,
}: TitleBarProps) {
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const menuId = useId();

  return (
    <div className="mvd-titlebar" data-testid="mvd-titlebar">
      <span className="mvd-logo">
        {SHELL_STRINGS.appNameLead}
        <span className="mvd-logo-accent">{SHELL_STRINGS.appNameAccent}</span>
      </span>
      <span className="mvd-crumb">
        {SHELL_STRINGS.projectPrefix}: {projectName ?? SHELL_STRINGS.emptyValue}
      </span>

      <span className="mvd-grow" />

      <ModeSwitch mode={advancementMode} onChange={onAdvancementModeChange} />

      <button
        type="button"
        className="mvd-btn"
        onClick={onThemeToggle}
        data-testid="mvd-theme-toggle"
      >
        {SHELL_STRINGS.themeGroup}: {themeLabel(themeMode)}
      </button>

      <button
        type="button"
        className="mvd-btn"
        aria-pressed={!leftCollapsed}
        title={`${SHELL_STRINGS.toggleLeft} (Ctrl+B)`}
        onClick={onToggleLeft}
        data-testid="mvd-toggle-left"
      >
        ⟨ {SHELL_STRINGS.toggleLeft}
      </button>
      <button
        type="button"
        className="mvd-btn"
        aria-pressed={!rightCollapsed}
        title={`${SHELL_STRINGS.toggleRight} (Ctrl+I)`}
        onClick={onToggleRight}
        data-testid="mvd-toggle-right"
      >
        {SHELL_STRINGS.toggleRight} ⟩
      </button>

      <div className="mvd-menu">
        <button
          type="button"
          className="mvd-btn"
          aria-haspopup="menu"
          aria-expanded={viewMenuOpen}
          aria-controls={menuId}
          onClick={() => setViewMenuOpen((open) => !open)}
          data-testid="mvd-view-menu"
        >
          {SHELL_STRINGS.viewMenu}
        </button>
        {viewMenuOpen && (
          <div className="mvd-menu-list" id={menuId} role="menu">
            <button
              type="button"
              role="menuitem"
              className="mvd-menu-item"
              onClick={() => {
                setViewMenuOpen(false);
                onResetLayout();
              }}
              data-testid="mvd-reset-layout"
            >
              {SHELL_STRINGS.resetLayout}
            </button>
          </div>
        )}
      </div>

      <button type="button" className="mvd-btn" onClick={onSave} data-testid="mvd-save">
        {SHELL_STRINGS.save}
      </button>
      <button
        type="button"
        className="mvd-btn mvd-btn-primary"
        onClick={onCalculate}
        data-testid="mvd-calculate"
      >
        {SHELL_STRINGS.calculate}
      </button>
    </div>
  );
}
