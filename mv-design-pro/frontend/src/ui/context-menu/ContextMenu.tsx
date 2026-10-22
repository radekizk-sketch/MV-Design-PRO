/**
 * Menu kontekstowe schematu (jedyny konsument: `SldContextMenuController`).
 *
 * Renderuje pozycje żywego rejestru `SLD_MENU_REGISTRY` w kolejności rejestru,
 * z nagłówkiem sekcji przy każdej zmianie sekcji (kanon sekcji V12K-352:
 * `SEKCJE_MENU_SLD`). Sekcja „Usuń" jest wyróżniona i oddzielona separatorem.
 * Pozycja niedostępna pokazuje powód blokady w podpowiedzi.
 *
 * V12K-352: obsługa podmenu, ikon, separatorów-pozycji i nagłówka z rodzaju
 * elementu USUNIĘTA — dostarczały ich wyłącznie skasowane buildery
 * `context-menu/actions.ts`; żywy rejestr nigdy ich nie używał.
 */

import { Fragment, useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import { clsx } from 'clsx';
import { getOperatingModeLabel, normalizeOperatingMode } from '../operatingMode';
import type { ContextMenuAction, OperatingMode } from '../types';

interface ContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  headerText: string;
  mode: OperatingMode;
  actions: ContextMenuAction[];
  onClose: () => void;
}

/**
 * Context Menu Component.
 *
 * Positioned at (x, y) coordinates, typically from right-click event.
 */
export function ContextMenu({
  isOpen,
  x,
  y,
  headerText,
  mode,
  actions,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const runtimeMode = normalizeOperatingMode(mode);

  // K5-A (defekt złapany natywną ścieżką e2e): menu otwarte przy krawędzi
  // ekranu wychodziło poza viewport — pozycje przy dolnej/prawej krawędzi
  // czyniły akcje NIEKLIKALNYMI (martwy klik mimo poprawnego handlera).
  // Po zmierzeniu realnego rozmiaru menu dociskamy je do okna (useLayoutEffect
  // — korekta przed malowaniem, bez migotania).
  const [pozycja, setPozycja] = useState<{ left: number; top: number }>({ left: x, top: y });
  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = menuRef.current;
    if (!el) {
      setPozycja({ left: x, top: y });
      return;
    }
    const rect = el.getBoundingClientRect();
    const margines = 8;
    setPozycja({
      left: Math.max(margines, Math.min(x, window.innerWidth - rect.width - margines)),
      top: Math.max(margines, Math.min(y, window.innerHeight - rect.height - margines)),
    });
  }, [isOpen, x, y]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Handle action click
  const handleActionClick = useCallback(
    (action: ContextMenuAction) => {
      if (!action.enabled) return;
      action.handler();
      onClose();
    },
    [onClose]
  );

  if (!isOpen) return null;

  // Pozycja docelowa: żądany punkt kliknięcia dociśnięty do viewportu (wyżej).
  const style: React.CSSProperties = {
    position: 'fixed',
    left: pozycja.left,
    top: pozycja.top,
    zIndex: 1000,
  };

  return (
    <div
      ref={menuRef}
      style={style}
      className="min-w-[260px] max-w-[360px] rounded border border-scada-border bg-scada-panel py-1 text-scada-text shadow-xl"
      role="menu"
    >
      {/* Header */}
      <div className="border-b border-scada-border bg-scada-surface px-3 py-2">
        <span className="text-sm font-semibold text-scada-text">
          {headerText}
        </span>
      </div>

      {/* Actions */}
      <div className="py-1">
        {actions.map((action, index) => {
          const prev = actions[index - 1];
          const showSection = Boolean(action.section && action.section !== prev?.section);
          // D1: sekcja „Usuń" wizualnie wyróżniona — czerwony nagłówek + osobny separator
          const isDeleteSection = action.section === 'Usuń';
          // Separator nad sekcją „Usuń" — wizualnie oddziela operacje destrukcyjne
          const showDestructiveSeparator = showSection && isDeleteSection && index > 0;
          return (
            <Fragment key={action.actionKey ?? action.id}>
              {showDestructiveSeparator && (
                <div className="my-1 border-t border-scada-border" role="separator" aria-hidden="true" />
              )}
              {showSection && (
                <div
                  data-testid="context-menu-sekcja"
                  data-sekcja={action.section}
                  className={clsx(
                    'px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest',
                    isDeleteSection ? 'text-red-400' : 'text-scada-muted',
                  )}
                >
                  {action.section}
                </div>
              )}
            <ContextMenuItem
              action={action}
              onClick={() => handleActionClick(action)}
              isDestructive={isDeleteSection}
            />
            </Fragment>
          );
        })}
      </div>

      {/* Mode indicator */}
      <div className="border-t border-scada-border bg-scada-surface px-3 py-1">
        <span
          className={clsx(
            'text-xs',
            runtimeMode === 'MODEL_EDIT' && 'text-scada-sn',
            runtimeMode === 'RESULT_VIEW' && 'text-scada-success'
          )}
        >
          Tryb: {getOperatingModeLabel(mode)}
        </span>
      </div>
    </div>
  );
}

/**
 * Context Menu Item Component.
 */
interface ContextMenuItemProps {
  action: ContextMenuAction;
  onClick: () => void;
  /** D1: gdy true, item należy do sekcji „Usuń" — czerwony hover + tekst. */
  isDestructive?: boolean;
}

function ContextMenuItem({ action, onClick, isDestructive = false }: ContextMenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={!action.enabled}
      data-testid={action.testId}
      data-sekcja={action.section}
      title={!action.enabled ? action.blockedReason : undefined}
      className={clsx(
        'flex w-full items-center px-3 py-1.5 text-left text-sm',
        !action.enabled && 'cursor-not-allowed text-scada-muted opacity-60',
        action.enabled && isDestructive && 'text-sygnal-blokada-tusz hover:bg-sygnal-blokada-tlo hover:text-red-200',
        action.enabled && !isDestructive && 'text-scada-text hover:bg-scada-hover-nav hover:text-scada-sn',
      )}
      role="menuitem"
    >
      {action.label}
    </button>
  );
}

export default ContextMenu;
