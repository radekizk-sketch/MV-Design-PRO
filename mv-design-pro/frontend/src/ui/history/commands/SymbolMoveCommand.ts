/**
 * Symbol Move Command — P30a UNDO/REDO for SLD Symbol Movement
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § E.1: Symbol positioning
 * - ui_canonical_parity.md § C: SLD editing
 *
 * Command for moving symbols on SLD diagram.
 * Supports undo/redo of position changes.
 *
 * PILOT SCOPE:
 * - Single symbol move
 * - Multi-symbol move (grouped in transaction)
 */

import type { Command } from '../Command';
import { generateCommandId } from '../Command';

/**
 * Symbol position (x, y coordinates).
 */
export interface SymbolPosition {
  x: number;
  y: number;
}

/**
 * Symbol move command parameters.
 */
export interface SymbolMoveCommandParams {
  /** Element ID being moved */
  elementId: string;

  /** Element name (for display) */
  elementName: string;

  /** Old position (before move) */
  oldPosition: SymbolPosition;

  /** New position (after move) */
  newPosition: SymbolPosition;

  /** Apply function (updates SLD position) */
  applyFn: (position: SymbolPosition) => void | Promise<void>;
}

/**
 * Command for moving a symbol on SLD.
 * NOTE: This is a PILOT implementation - full SLD integration pending.
 */
export class SymbolMoveCommand implements Command {
  readonly id: string;
  readonly name_pl: string;
  readonly timestamp: number;

  private params: SymbolMoveCommandParams;

  constructor(params: SymbolMoveCommandParams) {
    this.id = generateCommandId();
    this.name_pl = `Przesunięcie symbolu: ${params.elementName}`;
    this.timestamp = Date.now();
    this.params = params;
  }

  async apply(): Promise<void> {
    await this.params.applyFn(this.params.newPosition);
  }

  async revert(): Promise<void> {
    await this.params.applyFn(this.params.oldPosition);
  }

  /**
   * Factory: Create SymbolMoveCommand from parameters.
   */
  static create(params: SymbolMoveCommandParams): SymbolMoveCommand {
    return new SymbolMoveCommand(params);
  }

  /**
   * Helper: Create transaction name for multi-symbol move.
   */
  static createTransactionName(count: number): string {
    return count === 1
      ? 'Przesunięcie symbolu'
      : `Przesunięcie symboli (${count})`;
  }
}
