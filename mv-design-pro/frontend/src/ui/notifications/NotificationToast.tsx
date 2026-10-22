/**
 * Notification Toast — inline non-blocking notifications.
 *
 * Renders at the top-right of the viewport, BELOW every element marked as a toast-free zone
 * (`data-toast-omija` — the project bar with „Oblicz" and the toolbar). Auto-dismisses after 5s.
 * Replaces all forbidden alert() calls per project canon rules.
 *
 * Karta GPZ-H5-SLD pkt 3e: stos stał na stałym `top-2 right-2` i zasłaniał przycisk „Oblicz"
 * w prawym końcu paska projektu — po komunikacie operacji (np. „Dodano stację") inżynier nie
 * mógł od razu uruchomić obliczeń. Ten komponent jest JEDYNYM rendererem `notify()` w aplikacji
 * (inwentarz klasy: `position: fixed` w `ui/**`/`ui2/**` — pozostałe nakładki stałe to okna
 * modalne, menu kontekstowe i wyszukiwarka, nie komunikaty), więc naprawa tutaj obejmuje całą
 * klasę. Górna krawędź stosu = najniższa dolna krawędź stref `data-toast-omija` + odstęp,
 * mierzona przy zmianie rozmiaru (pasek łamie się na wąskim oknie).
 */

import { clsx } from 'clsx';
import { useEffect, useState } from 'react';
import { useNotificationStore, type NotificationType } from './store';

/** Atrybut strefy, której komunikat nie może zasłonić (paski akcji powłoki). */
export const ATRYBUT_STREFY_BEZ_TOASTOW = 'data-toast-omija';
/** Odstęp stosu komunikatów od strefy chronionej i od krawędzi okna [px]. */
export const ODSTEP_TOASTOW_PX = 8;

/** Górna krawędź stosu komunikatów: pod najniższą strefą chronioną (albo przy krawędzi okna). */
export function gornaKrawedzToastow(dokument: Document): number {
  let dol = 0;
  dokument.querySelectorAll(`[${ATRYBUT_STREFY_BEZ_TOASTOW}]`).forEach((element) => {
    dol = Math.max(dol, element.getBoundingClientRect().bottom);
  });
  return Math.ceil(dol) + ODSTEP_TOASTOW_PX;
}

function useGornaKrawedzToastow(aktywny: boolean): number {
  const [gora, setGora] = useState(ODSTEP_TOASTOW_PX);
  useEffect(() => {
    if (!aktywny) return;
    const zmierz = () => setGora(gornaKrawedzToastow(document));
    zmierz();
    window.addEventListener('resize', zmierz);
    const obserwator = typeof ResizeObserver === 'function' ? new ResizeObserver(zmierz) : null;
    document.querySelectorAll(`[${ATRYBUT_STREFY_BEZ_TOASTOW}]`).forEach((element) => obserwator?.observe(element));
    return () => {
      window.removeEventListener('resize', zmierz);
      obserwator?.disconnect();
    };
  }, [aktywny]);
  return gora;
}

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
  const gora = useGornaKrawedzToastow(notifications.length > 0);

  if (notifications.length === 0) return null;

  return (
    <div
      className="fixed z-50 flex flex-col gap-2 max-w-sm"
      style={{ top: gora, right: ODSTEP_TOASTOW_PX }}
      data-testid="notification-toast-container"
    >
      {notifications.map((n) => (
        <div
          key={n.id}
          className={clsx(
            'flex flex-col gap-1 px-3 py-2 rounded border shadow-md text-sm',
            'animate-[fadeIn_0.2s_ease-in]',
            TYPE_STYLES[n.type]
          )}
          role="alert"
          data-testid="notification-toast"
        >
          <div className="flex items-start gap-2">
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
          {n.actions && n.actions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pl-5 pt-1" data-testid={`notification-actions-${n.id}`}>
              {n.actions.map((action, idx) => (
                <button
                  key={`${action.label}-${idx}`}
                  type="button"
                  onClick={() => {
                    action.onClick();
                    dismiss(n.id);
                  }}
                  className={clsx(
                    'rounded border px-2 py-0.5 text-[11px] font-medium',
                    action.variant === 'danger'
                      ? 'border-red-400 text-red-700 hover:bg-red-100'
                      : 'border-current text-current hover:opacity-80',
                  )}
                  data-testid={`notification-action-${n.id}-${idx}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
