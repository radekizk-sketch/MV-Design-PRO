/**
 * MainMenuBar — Pasek menu głównego (Canonical/CANONICAL Style)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Menu narzędziowe — szybki dostęp do akcji
 *
 * Pasek menu o stylu klasy przemysłowej:
 * - Plik (Projekt): Nowy, Otwórz, Zapisz, Eksportuj
 * - Edycja: Cofnij, Ponów, Zaznacz wszystko
 * - Widok: Nawigator, Inspektor, Schemat SLD, Kreator
 * - Sieć: Dodaj element, Walidacja, Gotowość
 * - Obliczenia: Zwarcia 3F, Rozpływ mocy, Wyniki
 * - Narzędzia: Eksport PDF, Eksport DOCX, Ustawienia
 * - Pomoc: Dokumentacja, Informacje
 *
 * Skróty klawiaturowe wyświetlane obok etykiet.
 *
 * 100% POLISH UI
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { clsx } from 'clsx';

// =============================================================================
// Types
// =============================================================================

interface MenuAction {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  danger?: boolean;
}

interface MenuGroup {
  id: string;
  label: string;
  items: MenuAction[];
}

// =============================================================================
// Menu Definitions (100% Polish)
// =============================================================================

const MENU_GROUPS: MenuGroup[] = [
  {
    id: 'file',
    label: 'Plik',
    items: [
      { id: 'new-project', label: 'Nowy projekt', shortcut: 'Ctrl+N' },
      { id: 'open-project', label: 'Otwórz projekt', shortcut: 'Ctrl+O' },
      { id: 'save', label: 'Zapisz', shortcut: 'Ctrl+S' },
      { id: 'sep-1', label: '', separator: true },
      { id: 'export-pdf', label: 'Eksportuj PDF', shortcut: 'Ctrl+Shift+P' },
      { id: 'export-docx', label: 'Eksportuj DOCX' },
      { id: 'export-json', label: 'Eksportuj JSON' },
      { id: 'sep-2', label: '', separator: true },
      { id: 'close', label: 'Zamknij projekt' },
    ],
  },
  {
    id: 'edit',
    label: 'Edycja',
    items: [
      { id: 'undo', label: 'Cofnij', shortcut: 'Ctrl+Z' },
      { id: 'redo', label: 'Ponów', shortcut: 'Ctrl+Y' },
      { id: 'sep-1', label: '', separator: true },
      { id: 'select-all', label: 'Zaznacz wszystko', shortcut: 'Ctrl+A' },
      { id: 'deselect', label: 'Odznacz', shortcut: 'Esc' },
      { id: 'sep-2', label: '', separator: true },
      { id: 'delete', label: 'Usuń zaznaczone', shortcut: 'Del', danger: true },
    ],
  },
  {
    id: 'view',
    label: 'Widok',
    items: [
      { id: 'navigator', label: 'Nawigator projektu', shortcut: 'Ctrl+1' },
      { id: 'inspector', label: 'Inspektor właściwości', shortcut: 'Ctrl+2' },
      { id: 'sld', label: 'Schemat jednokreskowy', shortcut: 'Ctrl+3' },
      { id: 'sld-view', label: 'Podglad schematu', shortcut: 'Ctrl+Shift+3' },
      { id: 'network-build', label: 'Budowa sieci', shortcut: 'Ctrl+4' },
      { id: 'sep-1', label: '', separator: true },
      { id: 'zoom-in', label: 'Powiększ', shortcut: '+' },
      { id: 'zoom-out', label: 'Pomniejsz', shortcut: '-' },
      { id: 'fit-content', label: 'Dopasuj do schematu', shortcut: 'F' },
      { id: 'reset-view', label: 'Resetuj widok', shortcut: '0' },
    ],
  },
  {
    id: 'network',
    label: 'Sieć',
    items: [
      { id: 'add-bus', label: 'Dodaj szynę' },
      { id: 'add-line', label: 'Dodaj linię' },
      { id: 'add-cable', label: 'Dodaj kabel' },
      { id: 'add-transformer', label: 'Dodaj transformator' },
      { id: 'add-source', label: 'Dodaj źródło' },
      { id: 'add-load', label: 'Dodaj odbiór' },
      { id: 'sep-1', label: '', separator: true },
      { id: 'validate', label: 'Walidacja modelu' },
      { id: 'readiness', label: 'Sprawdź gotowość' },
    ],
  },
  {
    id: 'calculations',
    label: 'Obliczenia',
    items: [
      { id: 'run-sc-3f', label: 'Zwarcia 3F (IEC 60909)' },
      { id: 'run-sc-1f', label: 'Zwarcia 1F (doziemne)' },
      { id: 'run-power-flow', label: 'Rozpływ mocy' },
      { id: 'sep-1', label: '', separator: true },
      { id: 'variants', label: 'Zakres i warunki obliczeń' },
      { id: 'analysis', label: 'Poziom analityczny' },
      { id: 'report', label: 'Generator raportu' },
    ],
  },
  {
    id: 'tools',
    label: 'Narzędzia',
    items: [
      { id: 'catalog', label: 'Biblioteka typów' },
      { id: 'protection', label: 'Zabezpieczenia' },
      { id: 'tcc', label: 'Krzywe czasowo-prądowe' },
      { id: 'sep-1', label: '', separator: true },
      { id: 'whitebox', label: 'Wywód obliczeń' },
    ],
  },
  {
    id: 'help',
    label: 'Pomoc',
    items: [
      { id: 'docs', label: 'Dokumentacja' },
      { id: 'shortcuts', label: 'Skróty klawiaturowe' },
      { id: 'sep-1', label: '', separator: true },
      { id: 'about', label: 'O programie MV-DESIGN-PRO' },
    ],
  },
];

// =============================================================================
// Props
// =============================================================================

export interface MainMenuBarProps {
  onAction?: (actionId: string) => void;
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function MainMenuBar({ onAction, className }: MainMenuBarProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!openMenuId) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  // Close on Escape
  useEffect(() => {
    if (!openMenuId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenuId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openMenuId]);

  const handleMenuClick = useCallback((menuId: string) => {
    setOpenMenuId((prev) => (prev === menuId ? null : menuId));
  }, []);

  const handleMenuHover = useCallback((menuId: string) => {
    if (openMenuId !== null) {
      setOpenMenuId(menuId);
    }
  }, [openMenuId]);

  const handleActionClick = useCallback((actionId: string) => {
    setOpenMenuId(null);
    if (onAction) {
      onAction(actionId);
    }
  }, [onAction]);

  return (
    <div
      ref={menuBarRef}
      data-testid="main-menu-bar"
      className={clsx(
        'flex items-center h-7 px-1 bg-scada-bg border-b border-scada-border select-none',
        className
      )}
    >
      {/* Logo / Brand */}
      <div className="flex items-center gap-1.5 px-2 mr-1">
        <svg className="w-4 h-4 text-scada-neon-green" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
        <span className="text-[11px] font-bold text-scada-text tracking-wide">MV-DESIGN-PRO</span>
        <span className="text-[9px] text-scada-muted font-mono ml-0.5">v12</span>
      </div>

      <div className="h-4 w-px bg-scada-border mr-1" />

      {/* Menu groups */}
      {MENU_GROUPS.map((group) => (
        <div key={group.id} className="relative">
          <button
            type="button"
            onClick={() => handleMenuClick(group.id)}
            onMouseEnter={() => handleMenuHover(group.id)}
            className={clsx(
              'px-2.5 py-1 text-[11px] font-medium rounded-sm transition-colors',
              openMenuId === group.id
                ? 'bg-scada-chrome text-scada-text'
                : 'text-scada-dim hover:bg-scada-panel hover:text-scada-text'
            )}
            data-testid={`menu-${group.id}`}
          >
            {group.label}
          </button>

          {/* Dropdown */}
          {openMenuId === group.id && (
            <div
              className="absolute top-full left-0 mt-0.5 min-w-[220px] bg-scada-panel border border-scada-border rounded-md shadow-overlay shadow-black/50 z-50 py-1"
              data-testid={`menu-dropdown-${group.id}`}
            >
              {group.items.map((item) =>
                item.separator ? (
                  <div key={item.id} className="my-1 h-px bg-scada-border mx-2" />
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleActionClick(item.id)}
                    disabled={item.disabled}
                    className={clsx(
                      'w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors text-left',
                      item.disabled
                        ? 'text-scada-muted cursor-not-allowed'
                        : item.danger
                          ? 'text-scada-neon-red hover:bg-scada-neon-red/10'
                          : 'text-scada-dim hover:bg-scada-chrome hover:text-scada-text'
                    )}
                    data-testid={`menu-action-${item.id}`}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="ml-4 text-[10px] text-scada-muted font-mono">
                        {item.shortcut}
                      </span>
                    )}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default MainMenuBar;

