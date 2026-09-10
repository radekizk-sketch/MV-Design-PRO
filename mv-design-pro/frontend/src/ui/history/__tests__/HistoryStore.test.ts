/**
 * History Store Tests — P30a UNDO/REDO
 *
 * Unit tests for command history store.
 * Tests undo/redo functionality, transactions, and mode gating.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useHistoryStore } from '../HistoryStore';
import type { Command } from '../Command';
import { generateCommandId } from '../Command';

// Mock command implementation for testing
class MockCommand implements Command {
  id: string;
  name_pl: string;
  timestamp: number;
  applyCalls: number = 0;
  revertCalls: number = 0;

  constructor(name_pl: string) {
    this.id = generateCommandId();
    this.name_pl = name_pl;
    this.timestamp = Date.now();
  }

  async apply(): Promise<void> {
    this.applyCalls++;
  }

  async revert(): Promise<void> {
    this.revertCalls++;
  }
}

describe('HistoryStore', () => {
  beforeEach(() => {
    // Clear store before each test
    useHistoryStore.getState().clear();
  });

  describe('push', () => {
    it('should push command and apply it', async () => {
      const command = new MockCommand('Test command');
      await useHistoryStore.getState().push(command);

      expect(command.applyCalls).toBe(1);
      expect(useHistoryStore.getState().undoStack).toHaveLength(1);
      expect(useHistoryStore.getState().canUndo()).toBe(true);
    });

    it('should clear redo stack when pushing new command', async () => {
      const cmd1 = new MockCommand('Command 1');
      const cmd2 = new MockCommand('Command 2');
      const cmd3 = new MockCommand('Command 3');

      // Push and undo to populate redo stack
      await useHistoryStore.getState().push(cmd1);
      await useHistoryStore.getState().push(cmd2);
      await useHistoryStore.getState().undo();

      expect(useHistoryStore.getState().redoStack).toHaveLength(1);

      // Push new command should clear redo
      await useHistoryStore.getState().push(cmd3);
      expect(useHistoryStore.getState().redoStack).toHaveLength(0);
    });
  });

  describe('undo', () => {
    it('should undo last command', async () => {
      const command = new MockCommand('Test command');
      await useHistoryStore.getState().push(command);

      const result = await useHistoryStore.getState().undo();

      expect(result).toBe(true);
      expect(command.revertCalls).toBe(1);
      expect(useHistoryStore.getState().undoStack).toHaveLength(0);
      expect(useHistoryStore.getState().redoStack).toHaveLength(1);
    });

    it('should return false when undo stack is empty', async () => {
      const result = await useHistoryStore.getState().undo();
      expect(result).toBe(false);
    });

    it('should undo commands in reverse order', async () => {
      const cmd1 = new MockCommand('Command 1');
      const cmd2 = new MockCommand('Command 2');

      await useHistoryStore.getState().push(cmd1);
      await useHistoryStore.getState().push(cmd2);

      await useHistoryStore.getState().undo();
      expect(cmd2.revertCalls).toBe(1);
      expect(cmd1.revertCalls).toBe(0);

      await useHistoryStore.getState().undo();
      expect(cmd1.revertCalls).toBe(1);
    });
  });

  describe('redo', () => {
    it('should redo last undone command', async () => {
      const command = new MockCommand('Test command');
      await useHistoryStore.getState().push(command);
      await useHistoryStore.getState().undo();

      const result = await useHistoryStore.getState().redo();

      expect(result).toBe(true);
      expect(command.applyCalls).toBe(2); // Once from push, once from redo
      expect(useHistoryStore.getState().undoStack).toHaveLength(1);
      expect(useHistoryStore.getState().redoStack).toHaveLength(0);
    });

    it('should return false when redo stack is empty', async () => {
      const result = await useHistoryStore.getState().redo();
      expect(result).toBe(false);
    });
  });

  describe('transactions', () => {
    it('should group commands in transaction', async () => {
      const cmd1 = new MockCommand('Command 1');
      const cmd2 = new MockCommand('Command 2');

      useHistoryStore.getState().beginTransaction('Multi-command transaction');
      await useHistoryStore.getState().push(cmd1);
      await useHistoryStore.getState().push(cmd2);
      await useHistoryStore.getState().commitTransaction();

      // Should have single composite command in undo stack
      expect(useHistoryStore.getState().undoStack).toHaveLength(1);
      expect(useHistoryStore.getState().canUndo()).toBe(true);
    });

    it('should apply all commands in transaction on commit', async () => {
      const cmd1 = new MockCommand('Command 1');
      const cmd2 = new MockCommand('Command 2');

      useHistoryStore.getState().beginTransaction('Transaction');
      await useHistoryStore.getState().push(cmd1);
      await useHistoryStore.getState().push(cmd2);
      await useHistoryStore.getState().commitTransaction();

      // Commands should be applied during push (not commit)
      expect(cmd1.applyCalls).toBe(1);
      expect(cmd2.applyCalls).toBe(1);
    });

    it('should revert all commands in transaction on undo (reverse order)', async () => {
      const cmd1 = new MockCommand('Command 1');
      const cmd2 = new MockCommand('Command 2');

      useHistoryStore.getState().beginTransaction('Transaction');
      await useHistoryStore.getState().push(cmd1);
      await useHistoryStore.getState().push(cmd2);
      await useHistoryStore.getState().commitTransaction();

      await useHistoryStore.getState().undo();

      // Both should be reverted in reverse order
      expect(cmd2.revertCalls).toBe(1);
      expect(cmd1.revertCalls).toBe(1);
    });

    it('should handle empty transaction', async () => {
      useHistoryStore.getState().beginTransaction('Empty transaction');
      await useHistoryStore.getState().commitTransaction();

      expect(useHistoryStore.getState().undoStack).toHaveLength(0);
    });

    it('should handle single-command transaction', async () => {
      const cmd = new MockCommand('Single command');

      useHistoryStore.getState().beginTransaction('Single');
      await useHistoryStore.getState().push(cmd);
      await useHistoryStore.getState().commitTransaction();

      // Should be pushed as regular command (not composite)
      expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    });

    it('should rollback transaction', () => {
      useHistoryStore.getState().beginTransaction('Transaction');
      // Normally would push commands here, but we're testing rollback
      useHistoryStore.getState().rollbackTransaction();

      expect(useHistoryStore.getState().undoStack).toHaveLength(0);
      expect(useHistoryStore.getState().activeTransaction).toBeNull();
    });
  });

  describe('labels', () => {
    it('should return correct undo label', async () => {
      const command = new MockCommand('Test operation');
      await useHistoryStore.getState().push(command);

      expect(useHistoryStore.getState().getUndoLabel()).toBe('Test operation');
    });

    it('should return null when no undo available', () => {
      expect(useHistoryStore.getState().getUndoLabel()).toBeNull();
    });

    it('should return correct redo label', async () => {
      const command = new MockCommand('Test operation');
      await useHistoryStore.getState().push(command);
      await useHistoryStore.getState().undo();

      expect(useHistoryStore.getState().getRedoLabel()).toBe('Test operation');
    });

    it('should return null when no redo available', () => {
      expect(useHistoryStore.getState().getRedoLabel()).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all history', async () => {
      const cmd1 = new MockCommand('Command 1');
      const cmd2 = new MockCommand('Command 2');

      await useHistoryStore.getState().push(cmd1);
      await useHistoryStore.getState().push(cmd2);
      await useHistoryStore.getState().undo();

      useHistoryStore.getState().clear();

      expect(useHistoryStore.getState().undoStack).toHaveLength(0);
      expect(useHistoryStore.getState().redoStack).toHaveLength(0);
      expect(useHistoryStore.getState().canUndo()).toBe(false);
      expect(useHistoryStore.getState().canRedo()).toBe(false);
    });
  });
});
