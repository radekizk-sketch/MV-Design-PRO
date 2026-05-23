/**
 * A11y helpers (G9 z planu).
 *
 * Funkcje pomocnicze dla focus management, ARIA live regions, screen reader announcements.
 */

import { useEffect, useRef } from 'react';

/**
 * Trap focus w obrębie kontenera — focus nie wyjdzie poza dialog.
 *
 * Użycie:
 * ```tsx
 * const ref = useFocusTrap<HTMLDivElement>();
 * return <div ref={ref}>...</div>;
 * ```
 */
export function useFocusTrap<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = getFocusableElements(container);
    focusable[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = getFocusableElements(container);
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement as HTMLElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [active]);

  return ref;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      !el.hasAttribute('disabled')
      && !el.hasAttribute('hidden')
      && el.getAttribute('aria-hidden') !== 'true',
  );
}

/**
 * Announce — ogłoś tekst do screen readera przez ARIA live region.
 *
 * Polite (default) — ogłoszone gdy reader nie mówi.
 * Assertive — natychmiast przerywa current speech.
 */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  let region = document.getElementById(`a11y-announcer-${priority}`);
  if (!region) {
    region = document.createElement('div');
    region.id = `a11y-announcer-${priority}`;
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', priority);
    region.setAttribute('aria-atomic', 'true');
    region.style.cssText =
      'position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;';
    document.body.appendChild(region);
  }
  region.textContent = '';
  setTimeout(() => {
    if (region) region.textContent = message;
  }, 50);
}

/**
 * useSkipToContent — keyboard skip link.
 *
 * Returns handler that focuses #main-content. Pierwszy element w app powinien być skip link.
 */
export function focusMainContent() {
  const main = document.getElementById('main-content');
  if (main) {
    main.setAttribute('tabindex', '-1');
    main.focus();
  }
}
