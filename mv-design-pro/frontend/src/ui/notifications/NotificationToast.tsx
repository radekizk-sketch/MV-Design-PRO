/**
 * Notification Toast — inline non-blocking notifications.
 *
 * Renders at the top-right of the viewport. Auto-dismisses after 5s.
 * Replaces all forbidden alert() calls per project canon rules.
 */

import { clsx } from 'clsx';
import { useNotificationStore, type NotificationType } from './store';

const TYPE_STYLES: Record<NotificationType, string> = {
  error: 'bg-red-50 border-red-400 text-red-800',
  warning: 'bg-yellow-50 border-yellow-400 text-yellow-800',
  info: 'bg-blue-50 border-blue-400 text-blue-800',
  success: 'bg-green-50 border-green-400 text-green-800',
};

const TYPE_ICONS: Record<NotificationType, string> = {
  error: '\u2716',
  warning: '\u26A0',
  info: '\u2139',
  success: '\u2714',
};

export function NotificationToast() {
  const notifications = useNotificationStore((s) => s.notifications);
  const dismiss = useNotificationStore((s) => s.dismiss);

  if (notifications.length === 0) return null;

  return (
    <div
      className="fixed top-2 right-2 z-50 flex flex-col gap-2 max-w-sm"
      data-testid="notification-toast-container"
    >
      {notifications.map((n) => (
        <div
          key={n.id}
          className={clsx(
            'flex items-start gap-2 px-3 py-2 rounded border shadow-md text-sm',
            'animate-[fadeIn_0.2s_ease-in]',
            TYPE_STYLES[n.type]
          )}
          role="alert"
          data-testid="notification-toast"
        >
          <span className="flex-shrink-0 mt-0.5">{TYPE_ICONS[n.type]}</span>
          <span className="flex-1 break-words">{n.message}</span>
          <button
            type="button"
            onClick={() => dismiss(n.id)}
            className="flex-shrink-0 ml-1 opacity-60 hover:opacity-100"
            aria-label="Zamknij"
          >
            {"\u00D7"}
          </button>
        </div>
      ))}
    </div>
  );
}
