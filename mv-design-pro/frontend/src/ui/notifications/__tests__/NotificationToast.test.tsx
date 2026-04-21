import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { NotificationToast } from '../NotificationToast';
import { useNotificationStore } from '../store';

describe('NotificationToast', () => {
  beforeEach(() => {
    useNotificationStore.getState().clearAll();
  });

  it('renders a typographic close button instead of a literal unicode escape', () => {
    useNotificationStore.getState().notify('Test ostrzeżenia', 'warning');

    render(<NotificationToast />);

    const closeButton = screen.getByRole('button', { name: 'Zamknij' });
    expect(closeButton).toHaveTextContent('×');
    expect(closeButton).not.toHaveTextContent('\\u00D7');
  });

  it('dismisses the notification when the close button is clicked', () => {
    useNotificationStore.getState().notify('Test informacji', 'info');

    render(<NotificationToast />);

    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});
