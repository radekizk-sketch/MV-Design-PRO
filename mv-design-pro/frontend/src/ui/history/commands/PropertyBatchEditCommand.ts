/**
 * Property Batch Edit Command — P30c UNDO/REDO for Property Grid Multi-Edit
 *
 * CANONICAL ALIGNMENT:
 * - P30c: Property Grid multi-edit with Apply/Cancel
 * - P30a: Command pattern for UNDO/REDO
 * - ui_canonical_parity.md § D: Property Grid ≥110% PF UX
 *
 * Command for batch editing properties across multiple elements.
 * Single Apply → Single UNDO/REDO entry.
 *
 * Features:
 * - Apply all changes as 1 transaction
 * - Undo restores original values for all elements
 * - Redo reapplies all changes
 * - Deterministic (sorted by element ID)
 */

import type { Command } from '../Command';
import { generateCommandId } from '../Command';

/**
 * Single element change in batch edit.
 */
export interface ElementChange {
  /** Element ID */
  elementId: string;
  /** Element name (for display) */
  elementName: string;
  /** Field key */
  fieldKey: string;
  /** Old value (before edit) */
  oldValue: unknown;
  /** New value (after edit) */
  newValue: unknown;
}

/**
 * Property batch edit command parameters.
 */
export interface PropertyBatchEditCommandParams {
  /** Field label (Polish, for display) */
  fieldLabel: string;

  /** All changes (sorted by elementId for determinism) */
  changes: ElementChange[];

  /** Apply function (updates backend/store for single element) */
  applyFn: (elementId: string, fieldKey: string, value: unknown) => void | Promise<void>;
}

/**
 * Command for batch editing property fields across multiple elements.
 * Applies all changes as a single UNDO/REDO transaction.
 */
export class PropertyBatchEditCommand implements Command {
  readonly id: string;
  readonly name_pl: string;
  readonly timestamp: number;

  private params: PropertyBatchEditCommandParams;

  constructor(params: PropertyBatchEditCommandParams) {
    this.id = generateCommandId();

    const elementCount = params.changes.length;
    const elementLabel = elementCount === 1 ? 'element' :
                        (elementCount >= 2 && elementCount <= 4) ? 'elementy' : 'elementów';

    this.name_pl = `Edycja "${params.fieldLabel}" (${elementCount} ${elementLabel})`;
    this.timestamp = Date.now();

    // Sort changes by elementId for determinism
    this.params = {
      ...params,
      changes: [...params.changes].sort((a, b) => a.elementId.localeCompare(b.elementId)),
    };
  }

  async apply(): Promise<void> {
    // Apply all changes (new values)
    for (const change of this.params.changes) {
      await this.params.applyFn(change.elementId, change.fieldKey, change.newValue);
    }
  }

  async revert(): Promise<void> {
    // Revert all changes (old values)
    for (const change of this.params.changes) {
      await this.params.applyFn(change.elementId, change.fieldKey, change.oldValue);
    }
  }

  /**
   * Factory: Create PropertyBatchEditCommand from parameters.
   */
  static create(params: PropertyBatchEditCommandParams): PropertyBatchEditCommand {
    return new PropertyBatchEditCommand(params);
  }
}
