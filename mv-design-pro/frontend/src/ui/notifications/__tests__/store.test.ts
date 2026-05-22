/**
 * Notification Store Tests
 *
 * Tests for the notification Zustand store.
 * Validates:
 * - Adding notifications of different types
 * - Notification ID generation and uniqueness
 * - Dismiss individual notifications
 * - Clear all notifications
 * - Max notification limit (keeps last 5 including new)
 * - Auto-dismiss timer behavior
 * - Standalone notify() function
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useNotificationStore, notify } from '../store';

describe('useNotificationStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNotificationStore.setState({ notifications: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Initial State
  // ===========================================================================

  describe('initial state', () => {
    it('should start with empty notifications', () => {
      expect(useNotificationStore.getState().notifications).toEqual([]);
    });
  });

  // ===========================================================================
  // notify action
  // ===========================================================================

  describe('notify', () => {
    it('should add an error notification by default', () => {
      useNotificationStore.getState().notify('Something went wrong');

      const notifs = useNotificationStore.getState().notifications;
      expect(notifs).toHaveLength(1);
      expect(notifs[0].type).toBe('error');
      expect(notifs[0].message).toBe('Something went wrong');
    });

    it('should add a warning notification', () => {
      useNotificationStore.getState().notify('Take care', 'warning');

      const notifs = useNotificationStore.getState().notifications;
      expect(notifs).toHaveLength(1);
      expect(notifs[0].type).toBe('warning');
    });

    it('should add an info notification', () => {
      useNotificationStore.getState().notify('FYI', 'info');

      const notifs = useNotificationStore.getState().notifications;
      expect(notifs[0].type).toBe('info');
    });

    it('should add a success notification', () => {
      useNotificationStore.getState().notify('Done!', 'success');

      const notifs = useNotificationStore.getState().notifications;
      expect(notifs[0].type).toBe('success');
    });

    it('should generate unique IDs for each notification', () => {
      useNotificationStore.getState().notify('Message 1');
      useNotificationStore.getState().notify('Message 2');
      useNotificationStore.getState().notify('Message 3');

      const notifs = useNotificationStore.getState().notifications;
      const ids = notifs.map(n => n.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it('should suppress duplicate notifications from the same click burst', () => {
      useNotificationStore.getState().notify('Pobrano raport techniczny (JSON).', 'success');
      useNotificationStore.getState().notify('Pobrano raport techniczny (JSON).', 'success');

      expect(useNotificationStore.getState().notifications).toHaveLength(1);

      vi.advanceTimersByTime(1501);
      useNotificationStore.getState().notify('Pobrano raport techniczny (JSON).', 'success');

      expect(useNotificationStore.getState().notifications).toHaveLength(2);
    });

    it('should include timestamp on each notification', () => {
      const before = Date.now();
      useNotificationStore.getState().notify('Test');
      const after = Date.now();

      const notif = useNotificationStore.getState().notifications[0];
      expect(notif.timestamp).toBeGreaterThanOrEqual(before);
      expect(notif.timestamp).toBeLessThanOrEqual(after);
    });

    it('should keep at most 5 notifications (last 4 + new)', () => {
      // Add 6 notifications
      for (let i = 0; i < 6; i++) {
        useNotificationStore.getState().notify(`Message ${i}`);
      }

      const notifs = useNotificationStore.getState().notifications;
      expect(notifs.length).toBeLessThanOrEqual(5);
      // The last message should be present
      expect(notifs[notifs.length - 1].message).toBe('Message 5');
    });

    it('should auto-dismiss after 5 seconds', () => {
      useNotificationStore.getState().notify('Temp message');

      expect(useNotificationStore.getState().notifications).toHaveLength(1);

      // Advance time by 5 seconds
      vi.advanceTimersByTime(5000);

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });

    it('should NOT auto-dismiss before 5 seconds', () => {
      useNotificationStore.getState().notify('Temp message');

      vi.advanceTimersByTime(4999);
      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });
  });

  // ===========================================================================
  // dismiss
  // ===========================================================================

  describe('dismiss', () => {
    it('should remove specific notification by ID', () => {
      useNotificationStore.getState().notify('Keep');
      useNotificationStore.getState().notify('Remove');

      const notifs = useNotificationStore.getState().notifications;
      const removeId = notifs[1].id;

      useNotificationStore.getState().dismiss(removeId);

      const remaining = useNotificationStore.getState().notifications;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].message).toBe('Keep');
    });

    it('should do nothing when dismissing non-existent ID', () => {
      useNotificationStore.getState().notify('Keep');

      useNotificationStore.getState().dismiss('non-existent-id');

      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });
  });

  // ===========================================================================
  // clearAll
  // ===========================================================================

  describe('clearAll', () => {
    it('should remove all notifications', () => {
      useNotificationStore.getState().notify('One');
      useNotificationStore.getState().notify('Two');
      useNotificationStore.getState().notify('Three');

      useNotificationStore.getState().clearAll();

      expect(useNotificationStore.getState().notifications).toEqual([]);
    });

    it('should be safe to call when already empty', () => {
      useNotificationStore.getState().clearAll();
      expect(useNotificationStore.getState().notifications).toEqual([]);
    });
  });

  // ===========================================================================
  // Standalone notify function
  // ===========================================================================

  describe('standalone notify()', () => {
    it('should add notification via standalone function', () => {
      notify('Standalone error');

      const notifs = useNotificationStore.getState().notifications;
      expect(notifs).toHaveLength(1);
      expect(notifs[0].message).toBe('Standalone error');
      expect(notifs[0].type).toBe('error');
    });

    it('should support type parameter in standalone function', () => {
      notify('Standalone success', 'success');

      const notifs = useNotificationStore.getState().notifications;
      expect(notifs[0].type).toBe('success');
    });
  });
});
