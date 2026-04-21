/**
 * P30b — SLD Editor Module Exports
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: ≥110% Canonical editing experience
 * - P30a: Full UNDO/REDO integration
 */

// Main component
export { SldEditor } from './SldEditor';
export type { SldEditorProps } from './SldEditor';

// Store
export { useSldEditorStore, useSelectedSymbols, useHasSelection, useSelectionCount, useGridConfig, useIsDragging } from './SldEditorStore';

// Types
export type {
  Position,
  BoundingBox,
  SldSymbol,
  NodeSymbol,
  BranchSymbol,
  SwitchSymbol,
  SourceSymbol,
  LoadSymbol,
  AnySldSymbol,
  SelectionMode,
  DragState,
  LassoState,
  GridConfig,
  AlignDirection,
  DistributeDirection,
  ClipboardData,
  ToolbarAction,
} from './types';

// Commands (for advanced usage)
export { MultiSymbolMoveCommand } from './commands/MultiSymbolMoveCommand';
export { CopyPasteCommand } from './commands/CopyPasteCommand';
export { AlignDistributeCommand } from './commands/AlignDistributeCommand';

// Hooks
export { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
export { useSldDrag } from './hooks/useSldDrag';

// Utils
export { alignSymbols, distributeSymbols, snapPositionToGrid, getSymbolBoundingBox, getCombinedBoundingBox } from './utils/geometry';
