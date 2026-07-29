/**
 * Context Menu Component (PF-style)
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 4: Menu Kontekstowe specifications
 * - sld_rules.md § E.2, § E.3: Context Menu patterns
 *
 * Features:
 * - Mode-aware action enabling/disabling
 * - Polish labels
 * - Submenu support
 * - Keyboard navigation
 */

import { Fragment, useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import { clsx } from 'clsx';
import { getOperatingModeLabel, normalizeOperatingMode } from '../operatingMode';
import type { ContextMenuAction, ElementType, OperatingMode } from '../types';
import { hasTechnicalIcon, TechnicalIcon } from '../icons/technicalIconRegistry';
import type { TechnicalIconName } from '../icons/technicalIconRegistry';
import { getContextMenuHeader } from './actions';

interface ContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  elementType: ElementType;
  elementName: string;
  headerText?: string;
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
  elementType,
  elementName,
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
      if (!action.enabled || action.separator) return;
      if (action.handler) {
        action.handler();
      }
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

  const visibleActions = actions.filter((action) => action.visible);

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
          {headerText ?? getContextMenuHeader(elementType, elementName)}
        </span>
      </div>

      {/* Actions */}
      <div className="py-1">
        {visibleActions.map((action, index) => {
          const prev = visibleActions[index - 1];
          const showSection = Boolean(action.section && action.section !== prev?.section && !action.separator);
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
  if (action.separator) {
    return <div className="my-1 border-t border-gray-200" role="separator" />;
  }

  const hasSubmenu = action.submenu && action.submenu.length > 0;

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={!action.enabled}
        data-testid={action.testId}
        title={!action.enabled ? action.blockedReason : undefined}
        className={clsx(
          'flex w-full items-center justify-between px-3 py-1.5 text-left text-sm',
          !action.enabled && 'cursor-not-allowed text-scada-muted opacity-60',
          action.enabled && isDestructive && 'text-red-400 hover:bg-red-900/30 hover:text-red-200',
          action.enabled && !isDestructive && 'text-scada-text hover:bg-scada-hover-nav hover:text-scada-sn',
        )}
        role="menuitem"
      >
        <span className="flex items-center gap-2">
          {action.icon && <ContextMenuIcon icon={action.icon} />}
          <span>{action.label}</span>
        </span>
        {hasSubmenu && <span className="text-scada-muted">&gt;</span>}
      </button>

      {/* Submenu */}
      {hasSubmenu && action.enabled && (
        <div className="absolute left-full top-0 hidden group-hover:block ml-0.5">
          <div className="min-w-[220px] rounded border border-scada-border bg-scada-panel py-1 shadow-lg">
            {action.submenu!.map((subAction) => (
              <ContextMenuItem
                key={subAction.actionKey ?? subAction.id}
                action={subAction}
                onClick={() => {
                  if (subAction.handler) {
                    subAction.handler();
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ContextMenuIcon({ icon }: { icon: string }) {
  if (!hasTechnicalIcon(icon)) {
    return <span aria-hidden="true" className="h-4 w-4" />;
  }

  return (
    <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center text-scada-muted">
      <TechnicalIcon name={icon as TechnicalIconName} size={16} />
    </span>
  );
}

export default ContextMenu;
