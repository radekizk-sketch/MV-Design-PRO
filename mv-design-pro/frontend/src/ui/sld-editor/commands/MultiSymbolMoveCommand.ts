/**
 * P30b — Multi-Symbol Move Command (UNDO/REDO)
 *
 * CANONICAL ALIGNMENT:
 * - P30a: Command pattern infrastructure
 * - sld_rules.md § E.1: Multi-symbol drag
 * - ui_canonical_parity.md: Group move = 1 undo operation
 *
 * Command for moving multiple symbols on SLD diagram.
 * Entire drag (mouseDown → mouseUp) = 1 command.
 */

import type { Command } from '../../history/Command';
import { generateCommandId } from '../../history/Command';
import type { Position } from '../types';

/**
 * Position change for a single symbol.
 */
export interface SymbolPositionChange {
  symbolId: string;
  oldPosition: Position;
  newPosition: Position;
}

/**
 * Multi-symbol move command parameters.
 */
export interface MultiSymbolMoveCommandParams {
  /** Position changes for all symbols */
  changes: SymbolPositionChange[];

  /** Apply function (updates SLD positions) */
  applyFn: (changes: Map<string, Position>) => void | Promise<void>;
}

/**
 * Command for moving multiple symbols on SLD.
 * Groups all position changes into a single undo/redo operation.
 */
export class MultiSymbolMoveCommand implements Command {
  readonly id: string;
  readonly name_pl: string;
  readonly timestamp: number;

  private params: MultiSymbolMoveCommandParams;

  constructor(params: MultiSymbolMoveCommandParams) {
    this.id = generateCommandId();
    this.timestamp = Date.now();

    const count = params.changes.length;
    this.name_pl = count === 1
      ? 'Przesunięcie symbolu'
      : `Przesunięcie symboli (${count})`;

    this.params = params;
  }

  async apply(): Promise<void> {
    // Apply new positions
    const positionsMap = new Map(
      this.params.changes.map((c) => [c.symbolId, c.newPosition])
    );
    await this.params.applyFn(positionsMap);
  }

  async revert(): Promise<void> {
    // Revert to old positions
    const positionsMap = new Map(
      this.params.changes.map((c) => [c.symbolId, c.oldPosition])
    );
    await this.params.applyFn(positionsMap);
  }

  /**
   * Factory: Create MultiSymbolMoveCommand from parameters.
   */
  static create(params: MultiSymbolMoveCommandParams): MultiSymbolMoveCommand {
    return new MultiSymbolMoveCommand(params);
  }
}
