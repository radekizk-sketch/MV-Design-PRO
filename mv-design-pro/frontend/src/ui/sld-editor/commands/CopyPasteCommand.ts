/**
 * P30b — Copy/Paste Command (UNDO/REDO)
 *
 * CANONICAL ALIGNMENT:
 * - P30a: Command pattern infrastructure
 * - sld_rules.md § A.1: Bijection (symbols ↔ model elements)
 * - ui_canonical_parity.md: Paste = 1 undo operation
 *
 * Command for paste/duplicate operations.
 * Creates new symbols on canvas.
 */

import type { Command } from '../../history/Command';
import { generateCommandId } from '../../history/Command';
import type { AnySldSymbol } from '../types';

/**
 * Copy/paste command parameters.
 */
export interface CopyPasteCommandParams {
  /** New symbols to add */
  newSymbols: AnySldSymbol[];

  /** Add function (adds symbols to canvas) */
  addFn: (symbols: AnySldSymbol[]) => void | Promise<void>;

  /** Remove function (removes symbols from canvas) */
  removeFn: (symbolIds: string[]) => void | Promise<void>;
}

/**
 * Command for paste/duplicate operations.
 * Adds new symbols to canvas (can be undone/redone).
 */
export class CopyPasteCommand implements Command {
  readonly id: string;
  readonly name_pl: string;
  readonly timestamp: number;

  private params: CopyPasteCommandParams;

  constructor(params: CopyPasteCommandParams) {
    this.id = generateCommandId();
    this.timestamp = Date.now();

    const count = params.newSymbols.length;
    this.name_pl = count === 1
      ? 'Wklejenie symbolu'
      : `Wklejenie symboli (${count})`;

    this.params = params;
  }

  async apply(): Promise<void> {
    // Add new symbols
    await this.params.addFn(this.params.newSymbols);
  }

  async revert(): Promise<void> {
    // Remove added symbols
    const symbolIds = this.params.newSymbols.map((s) => s.id);
    await this.params.removeFn(symbolIds);
  }

  /**
   * Factory: Create CopyPasteCommand from parameters.
   */
  static create(params: CopyPasteCommandParams): CopyPasteCommand {
    return new CopyPasteCommand(params);
  }
}
