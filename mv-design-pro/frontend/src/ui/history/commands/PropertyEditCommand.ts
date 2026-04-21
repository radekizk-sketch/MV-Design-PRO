/**
 * Property Edit Command — P30a UNDO/REDO for Property Grid
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 2.4: Property Grid editing
 * - ui_canonical_parity.md § D.3: Deterministic field ordering
 *
 * Command for editing element properties in Property Grid.
 * Supports undo/redo of field value changes.
 *
 * PILOT SCOPE:
 * - String fields (name)
 * - Number fields (numeric parameters)
 * - Boolean fields (in_service, etc.)
 */

import type { Command } from '../Command';
import { generateCommandId } from '../Command';

/**
 * Property edit command interface.
 */
export interface PropertyEditCommandParams {
  /** Element ID being edited */
  elementId: string;

  /** Element name (for display) */
  elementName: string;

  /** Field key being edited */
  fieldKey: string;

  /** Field label (Polish, for display) */
  fieldLabel: string;

  /** Old value (before edit) */
  oldValue: unknown;

  /** New value (after edit) */
  newValue: unknown;

  /** Apply function (updates backend/store) */
  applyFn: (value: unknown) => void | Promise<void>;
}

/**
 * Command for editing a property field.
 * NOTE: This is a PILOT implementation - full backend integration pending.
 */
export class PropertyEditCommand implements Command {
  readonly id: string;
  readonly name_pl: string;
  readonly timestamp: number;

  private params: PropertyEditCommandParams;

  constructor(params: PropertyEditCommandParams) {
    this.id = generateCommandId();
    this.name_pl = `Edycja: ${params.elementName}.${params.fieldLabel}`;
    this.timestamp = Date.now();
    this.params = params;
  }

  async apply(): Promise<void> {
    await this.params.applyFn(this.params.newValue);
  }

  async revert(): Promise<void> {
    await this.params.applyFn(this.params.oldValue);
  }

  /**
   * Merge with another PropertyEditCommand if editing same field.
   * This coalesces multiple edits of the same field into one undo operation.
   */
  merge(other: Command): boolean {
    if (!(other instanceof PropertyEditCommand)) {
      return false;
    }

    // Only merge if editing the same field on the same element
    if (
      this.params.elementId === other.params.elementId &&
      this.params.fieldKey === other.params.fieldKey
    ) {
      // Update newValue to the other command's newValue
      this.params.newValue = other.params.newValue;
      return true;
    }

    return false;
  }

  /**
   * Factory: Create PropertyEditCommand from parameters.
   */
  static create(params: PropertyEditCommandParams): PropertyEditCommand {
    return new PropertyEditCommand(params);
  }
}
