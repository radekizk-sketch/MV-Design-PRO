/**
 * P30b — Geometry Utilities for SLD Editor
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: ≥110% Canonical align/distribute
 * - Deterministic algorithms (no randomness, stable sorting)
 *
 * FEATURES:
 * - Align symbols (left, right, top, bottom, center-h, center-v)
 * - Distribute symbols (horizontal, vertical)
 * - Bounding box calculations
 * - Snap-to-grid
 */

import type { AlignDirection, AnySldSymbol, BoundingBox, DistributeDirection, Position } from '../types';

/**
 * Get bounding box for a single symbol.
 * For simplicity, assumes symbols are rectangles with default size.
 */
export function getSymbolBoundingBox(symbol: AnySldSymbol): BoundingBox {
  const DEFAULT_WIDTH = 60;
  const DEFAULT_HEIGHT = 40;

  // Node symbols have explicit width/height
  if (symbol.elementType === 'Bus' && 'width' in symbol && 'height' in symbol) {
    return {
      x: symbol.position.x,
      y: symbol.position.y,
      width: symbol.width,
      height: symbol.height,
    };
  }

  // Default bounding box for other symbols
  return {
    x: symbol.position.x,
    y: symbol.position.y,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  };
}

/**
 * Get combined bounding box for multiple symbols.
 */
export function getCombinedBoundingBox(symbols: AnySldSymbol[]): BoundingBox | null {
  if (symbols.length === 0) return null;

  const boxes = symbols.map(getSymbolBoundingBox);

  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Get center point of bounding box.
 */
export function getBoundingBoxCenter(box: BoundingBox): Position {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

/**
 * Align symbols to a specific direction.
 *
 * DETERMINISM:
 * - Anchor element = FIRST symbol in sorted array (by id)
 * - All other symbols align to anchor's edge/center
 *
 * @returns Map of symbol ID → new position
 */
export function alignSymbols(
  symbols: AnySldSymbol[],
  direction: AlignDirection
): Map<string, Position> {
  if (symbols.length === 0) return new Map();

  // DETERMINISM: Sort by ID, first = anchor
  const sorted = [...symbols].sort((a, b) => a.id.localeCompare(b.id));
  const anchor = sorted[0];
  const anchorBox = getSymbolBoundingBox(anchor);

  const updates = new Map<string, Position>();

  sorted.forEach((symbol) => {
    const box = getSymbolBoundingBox(symbol);
    const newPosition = { ...symbol.position };

    switch (direction) {
      case 'left':
        newPosition.x = anchorBox.x;
        break;
      case 'right':
        newPosition.x = anchorBox.x + anchorBox.width - box.width;
        break;
      case 'top':
        newPosition.y = anchorBox.y;
        break;
      case 'bottom':
        newPosition.y = anchorBox.y + anchorBox.height - box.height;
        break;
      case 'center-horizontal':
        newPosition.x = anchorBox.x + anchorBox.width / 2 - box.width / 2;
        break;
      case 'center-vertical':
        newPosition.y = anchorBox.y + anchorBox.height / 2 - box.height / 2;
        break;
    }

    updates.set(symbol.id, newPosition);
  });

  return updates;
}

/**
 * Distribute symbols evenly along a direction.
 *
 * DETERMINISM:
 * - Symbols sorted by position (x for horizontal, y for vertical)
 * - Equal spacing computed from bounding boxes
 *
 * @returns Map of symbol ID → new position
 */
export function distributeSymbols(
  symbols: AnySldSymbol[],
  direction: DistributeDirection
): Map<string, Position> {
  if (symbols.length < 3) {
    // Need at least 3 symbols to distribute
    return new Map();
  }

  const updates = new Map<string, Position>();

  // Sort symbols by position
  const sorted =
    direction === 'horizontal'
      ? [...symbols].sort((a, b) => a.position.x - b.position.x)
      : [...symbols].sort((a, b) => a.position.y - b.position.y);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const firstBox = getSymbolBoundingBox(first);
  const lastBox = getSymbolBoundingBox(last);

  // Compute total space available for distribution
  const totalSpace =
    direction === 'horizontal'
      ? lastBox.x - (firstBox.x + firstBox.width)
      : lastBox.y - (firstBox.y + firstBox.height);

  // Compute total size of middle symbols
  const middleSymbols = sorted.slice(1, -1);
  const totalMiddleSize = middleSymbols.reduce((sum, symbol) => {
    const box = getSymbolBoundingBox(symbol);
    return sum + (direction === 'horizontal' ? box.width : box.height);
  }, 0);

  // Compute spacing between symbols
  const spacing = (totalSpace - totalMiddleSize) / (sorted.length - 1);

  // Position middle symbols
  let currentPos =
    direction === 'horizontal' ? firstBox.x + firstBox.width : firstBox.y + firstBox.height;

  sorted.forEach((symbol, index) => {
    if (index === 0 || index === sorted.length - 1) {
      // Keep first and last in place
      updates.set(symbol.id, symbol.position);
    } else {
      const box = getSymbolBoundingBox(symbol);
      const newPosition = { ...symbol.position };

      if (direction === 'horizontal') {
        newPosition.x = currentPos + spacing;
        currentPos = newPosition.x + box.width;
      } else {
        newPosition.y = currentPos + spacing;
        currentPos = newPosition.y + box.height;
      }

      updates.set(symbol.id, newPosition);
    }
  });

  return updates;
}

/**
 * Snap position to grid.
 *
 * @param position Position to snap
 * @param gridSize Grid size in pixels
 * @returns Snapped position
 */
export function snapPositionToGrid(position: Position, gridSize: number): Position {
  return {
    x: Math.round(position.x / gridSize) * gridSize,
    y: Math.round(position.y / gridSize) * gridSize,
  };
}

/**
 * Check if point is inside bounding box.
 */
export function isPointInsideBox(point: Position, box: BoundingBox): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

/**
 * Check if two bounding boxes intersect.
 */
export function doBoundingBoxesIntersect(box1: BoundingBox, box2: BoundingBox): boolean {
  return !(
    box1.x + box1.width < box2.x ||
    box2.x + box2.width < box1.x ||
    box1.y + box1.height < box2.y ||
    box2.y + box2.height < box1.y
  );
}
