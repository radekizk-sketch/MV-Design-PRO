/**
 * DialogManager — centralized dialog stack management (G3 z planu).
 *
 * Responsibilities:
 * - Z-index stack management (top dialog wins)
 * - ESC zamyka top dialog, Cmd+ESC zamyka wszystkie
 * - Focus management (trap focus, restore on close)
 * - Backdrop click behaviour (configurable)
 *
 * Pure service — komponenty subskrybują przez useDialog hook.
 */

import { create } from 'zustand';

export type DialogId = string;

export interface DialogEntry {
  id: DialogId;
  zIndex: number;
  closeOnBackdrop: boolean;
  closeOnEscape: boolean;
  restoreFocusTo?: HTMLElement | null;
  onClose: () => void;
}

interface DialogManagerState {
  stack: DialogEntry[];
  open: (entry: Omit<DialogEntry, 'zIndex'>) => void;
  close: (id: DialogId) => void;
  closeTop: () => void;
  closeAll: () => void;
  topId: () => DialogId | null;
}

const BASE_Z_INDEX = 1000;
const Z_INDEX_STEP = 10;

export const useDialogManager = create<DialogManagerState>((set, get) => ({
  stack: [],
  open: (entry) => {
    set((state) => {
      const existing = state.stack.find((d) => d.id === entry.id);
      if (existing) return state;
      const zIndex = BASE_Z_INDEX + state.stack.length * Z_INDEX_STEP;
      return { stack: [...state.stack, { ...entry, zIndex }] };
    });
  },
  close: (id) => {
    const entry = get().stack.find((d) => d.id === id);
    if (entry?.restoreFocusTo) {
      try {
        entry.restoreFocusTo.focus();
      } catch {
        // ignore - element may be detached
      }
    }
    entry?.onClose();
    set((state) => ({ stack: state.stack.filter((d) => d.id !== id) }));
  },
  closeTop: () => {
    const top = get().stack[get().stack.length - 1];
    if (top) get().close(top.id);
  },
  closeAll: () => {
    const ids = get().stack.map((d) => d.id);
    for (const id of ids.reverse()) {
      get().close(id);
    }
  },
  topId: () => {
    const stack = get().stack;
    return stack.length > 0 ? stack[stack.length - 1].id : null;
  },
}));

export function installDialogKeyboardHandler(): () => void {
  const handler = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    const state = useDialogManager.getState();
    if (state.stack.length === 0) return;
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      state.closeAll();
      return;
    }
    const top = state.stack[state.stack.length - 1];
    if (top.closeOnEscape) {
      event.preventDefault();
      state.close(top.id);
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
