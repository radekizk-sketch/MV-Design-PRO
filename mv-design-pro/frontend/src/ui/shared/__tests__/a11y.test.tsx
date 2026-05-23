import { describe, expect, it, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useFocusTrap, getFocusableElements, announce, focusMainContent } from '../a11y';

function reset() {
  document.body.innerHTML = '';
}

describe('a11y helpers', () => {
  beforeEach(reset);

  describe('getFocusableElements', () => {
    it('zwraca buttons, inputs, selectes, textareas i a[href]', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button>btn</button>
        <input />
        <a href="/">link</a>
        <button disabled>disabled</button>
        <span>span</span>
      `;
      document.body.appendChild(container);
      const elements = getFocusableElements(container);
      expect(elements.map((el) => el.tagName.toLowerCase())).toEqual(['button', 'input', 'a']);
    });

    it('pomija disabled', () => {
      const container = document.createElement('div');
      container.innerHTML = `<button disabled>x</button><button>y</button>`;
      document.body.appendChild(container);
      const elements = getFocusableElements(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].textContent).toBe('y');
    });
  });

  describe('announce', () => {
    it('tworzy live region z odpowiednim aria-live', () => {
      announce('test polite');
      const region = document.getElementById('a11y-announcer-polite');
      expect(region).not.toBeNull();
      expect(region?.getAttribute('aria-live')).toBe('polite');
    });

    it('assertive ma aria-live=assertive', () => {
      announce('test assertive', 'assertive');
      const region = document.getElementById('a11y-announcer-assertive');
      expect(region?.getAttribute('aria-live')).toBe('assertive');
    });

    it('idempotent - nie duplikuje regionów', () => {
      announce('a');
      announce('b');
      const regions = document.querySelectorAll('#a11y-announcer-polite');
      expect(regions).toHaveLength(1);
    });
  });

  describe('focusMainContent', () => {
    it('focuses element z id=main-content', () => {
      const main = document.createElement('main');
      main.id = 'main-content';
      document.body.appendChild(main);
      focusMainContent();
      expect(main.getAttribute('tabindex')).toBe('-1');
    });

    it('no-op gdy brak main-content', () => {
      expect(() => focusMainContent()).not.toThrow();
    });
  });

  describe('useFocusTrap', () => {
    function TestComponent() {
      const ref = useFocusTrap<HTMLDivElement>(true);
      return (
        <div ref={ref} data-testid="trap">
          <button>first</button>
          <button>last</button>
        </div>
      );
    }

    it('renderuje bez crashu', () => {
      const { getByTestId } = render(<TestComponent />);
      expect(getByTestId('trap')).toBeTruthy();
    });
  });
});
