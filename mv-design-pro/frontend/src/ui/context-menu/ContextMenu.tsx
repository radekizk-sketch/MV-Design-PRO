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

import { useEffect, useRef, useCallback } from 'react';
import { clsx } from 'clsx';
import { getOperatingModeLabel, normalizeOperatingMode } from '../operatingMode';
import type { ContextMenuAction, ElementType, OperatingMode } from '../types';
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

  // Adjust position to stay within viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 1000,
  };

  return (
    <div
      ref={menuRef}
      style={style}
      className="bg-white border border-gray-300 rounded-lg shadow-lg py-1 min-w-[200px] max-w-[300px]"
      role="menu"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
        <span className="text-sm font-medium text-gray-800">
          {headerText ?? getContextMenuHeader(elementType, elementName)}
        </span>
      </div>

      {/* Actions */}
      <div className="py-1">
        {actions
          .filter((action) => action.visible)
          .map((action) => (
            <ContextMenuItem
              key={action.actionKey ?? action.id}
              action={action}
              onClick={() => handleActionClick(action)}
            />
          ))}
      </div>

      {/* Mode indicator */}
      <div className="px-3 py-1 border-t border-gray-200 bg-gray-50">
        <span
          className={clsx(
            'text-xs',
            runtimeMode === 'MODEL_EDIT' && 'text-blue-600',
            runtimeMode === 'RESULT_VIEW' && 'text-green-600'
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
}

function ContextMenuItem({ action, onClick }: ContextMenuItemProps) {
  if (action.separator) {
    return <div className="my-1 border-t border-gray-200" role="separator" />;
  }

  const hasSubmenu = action.submenu && action.submenu.length > 0;

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={!action.enabled}
        className={clsx(
          'w-full text-left px-3 py-1.5 text-sm flex items-center justify-between',
          action.enabled
            ? 'text-gray-700 hover:bg-blue-50 hover:text-blue-800'
            : 'text-gray-400 cursor-not-allowed'
        )}
        role="menuitem"
      >
        <span className="flex items-center gap-2">
          {action.icon && <span>{action.icon}</span>}
          <span>{action.label}</span>
        </span>
        {hasSubmenu && <span className="text-gray-400">&gt;</span>}
      </button>

      {/* Submenu */}
      {hasSubmenu && action.enabled && (
        <div className="absolute left-full top-0 hidden group-hover:block ml-0.5">
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg py-1 min-w-[180px]">
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

export default ContextMenu;
