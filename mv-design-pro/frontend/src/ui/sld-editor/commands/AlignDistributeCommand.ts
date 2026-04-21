/**
 * P30b — Align/Distribute Command (UNDO/REDO)
 *
 * CANONICAL ALIGNMENT:
 * - P30a: Command pattern infrastructure
 * - ui_canonical_parity.md: Align/distribute = 1 undo operation
 *
 * Command for align/distribute operations.
 * Updates multiple symbol positions in one operation.
 */

import type { Command } from '../../history/Command';
import { generateCommandId } from '../../history/Command';
import type { AlignDirection, DistributeDirection, Position } from '../types';

/**
 * Align/distribute command parameters.
 */
export interface AlignDistributeCommandParams {
  /** Operation type */
  operation: 'align' | 'distribute';

  /** Direction (for display) */
  direction: AlignDirection | DistributeDirection;

  /** Symbol position changes */
  changes: Map<string, { old: Position; new: Position }>;

  /** Apply function (updates positions) */
  applyFn: (positions: Map<string, Position>) => void | Promise<void>;
}

/**
 * Command for align/distribute operations.
 */
export class AlignDistributeCommand implements Command {
  readonly id: string;
  readonly name_pl: string;
  readonly timestamp: number;

  private params: AlignDistributeCommandParams;

  constructor(params: AlignDistributeCommandParams) {
    this.id = generateCommandId();
    this.timestamp = Date.now();

    const count = params.changes.size;
    const operationLabel = params.operation === 'align' ? 'Wyrównanie' : 'Rozmieszczenie';
    const directionLabel = this.getDirectionLabel(params.direction);

    this.name_pl = `${operationLabel}: ${directionLabel} (${count})`;

    this.params = params;
  }

  async apply(): Promise<void> {
    // Apply new positions
    const newPositions = new Map<string, Position>();
    this.params.changes.forEach((change, symbolId) => {
      newPositions.set(symbolId, change.new);
    });
    await this.params.applyFn(newPositions);
  }

  async revert(): Promise<void> {
    // Revert to old positions
    const oldPositions = new Map<string, Position>();
    this.params.changes.forEach((change, symbolId) => {
      oldPositions.set(symbolId, change.old);
    });
    await this.params.applyFn(oldPositions);
  }

  private getDirectionLabel(direction: AlignDirection | DistributeDirection): string {
    const labels: Record<string, string> = {
      'left': 'do lewej',
      'right': 'do prawej',
      'top': 'do góry',
      'bottom': 'do dołu',
      'center-horizontal': 'poziomo (środek)',
      'center-vertical': 'pionowo (środek)',
      'horizontal': 'poziomo',
      'vertical': 'pionowo',
    };
    return labels[direction] || direction;
  }

  /**
   * Factory: Create AlignDistributeCommand from parameters.
   */
  static create(params: AlignDistributeCommandParams): AlignDistributeCommand {
    return new AlignDistributeCommand(params);
  }
}
