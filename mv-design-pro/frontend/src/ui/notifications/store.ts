/**
 * Notification Store — inline toast notifications replacing alert().
 *
 * Lightweight Zustand store for displaying non-blocking notification
 * messages in the UI. Replaces all forbidden alert()/confirm()/prompt() calls.
 */

import { create } from 'zustand';

export type NotificationType = 'error' | 'warning' | 'info' | 'success';

/** Action button w toaście - np. "Cofnij", "Pokaż element", "Zobacz szczegóły". */
export interface NotificationAction {
  /** Etykieta przycisku (PL). */
  label: string;
  /** Callback wywoływany po kliknięciu. Toast jest dismissed po wywołaniu. */
  onClick: () => void;
  /** Wariant wizualny. Default 'primary'. */
  variant?: 'primary' | 'danger';
}

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: number;
  /** Opcjonalne akcje w toaście (Cofnij / Pokaż / etc.). */
  actions?: NotificationAction[];
  /** Czy toast pozostaje do ręcznego dismiss (sticky). Default false dla error/sticky=true. */
  sticky?: boolean;
}

export interface NotifyOptions {
  type?: NotificationType;
  actions?: NotificationAction[];
  sticky?: boolean;
}

interface NotificationState {
  notifications: Notification[];
  notify: (message: string, typeOrOptions?: NotificationType | NotifyOptions) => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

let _counter = 0;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  notify: (message: string, typeOrOptions: NotificationType | NotifyOptions = 'error') => {
    const options: NotifyOptions = typeof typeOrOptions === 'string'
      ? { type: typeOrOptions }
      : typeOrOptions;
    const type = options.type ?? 'error';
    const now = Date.now();
    const notifications = get().notifications;
    const latest = notifications[notifications.length - 1];
    if (
      latest?.message === message
      && latest.type === type
      && now - latest.timestamp < 1500
    ) {
      return;
    }

    const id = `notif-${++_counter}-${Date.now()}`;
    // error sticky default - krytyczne ostrzeżenia user musi zobaczyć
    const sticky = options.sticky ?? type === 'error';
    const notification: Notification = {
      id,
      type,
      message,
      timestamp: now,
      actions: options.actions,
      sticky,
    };
    set((state) => ({
      notifications: [...state.notifications.slice(-4), notification],
    }));
    // Auto-dismiss after 5 seconds (skip dla sticky)
    if (!sticky) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      }, 5000);
    }
  },

  dismiss: (id: string) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearAll: () => set({ notifications: [] }),
}));

/**
 * Standalone notify function (for use outside React components).
 */
export function notify(message: string, typeOrOptions: NotificationType | NotifyOptions = 'error'): void {
  useNotificationStore.getState().notify(message, typeOrOptions);
}
