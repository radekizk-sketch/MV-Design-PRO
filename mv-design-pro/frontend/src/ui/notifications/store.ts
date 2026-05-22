/**
 * Notification Store — inline toast notifications replacing alert().
 *
 * Lightweight Zustand store for displaying non-blocking notification
 * messages in the UI. Replaces all forbidden alert()/confirm()/prompt() calls.
 */

import { create } from 'zustand';

export type NotificationType = 'error' | 'warning' | 'info' | 'success';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: number;
}

interface NotificationState {
  notifications: Notification[];
  notify: (message: string, type?: NotificationType) => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

let _counter = 0;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  notify: (message: string, type: NotificationType = 'error') => {
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
    const notification: Notification = { id, type, message, timestamp: now };
    set((state) => ({
      notifications: [...state.notifications.slice(-4), notification],
    }));
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    }, 5000);
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
export function notify(message: string, type: NotificationType = 'error'): void {
  useNotificationStore.getState().notify(message, type);
}
