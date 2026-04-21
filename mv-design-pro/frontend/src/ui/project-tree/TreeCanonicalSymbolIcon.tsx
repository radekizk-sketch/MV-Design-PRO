/**
 * TreeCanonicalSymbolIcon — Wrapper symboli CANONICAL dla Project Tree
 *
 * P9: Canonical-style Project Tree CANONICAL symbol icons
 *
 * CANONICAL ALIGNMENT:
 * - CanonicalSymbolRenderer.tsx: Źródło symboli SVG
 * - SymbolResolver.ts: Definicje CanonicalSymbolId
 * - treeSymbolMap.ts: Mapowanie TreeNodeType → CanonicalSymbolId
 *
 * DESIGN PRINCIPLES:
 * - Monochromatyczne ikony (currentColor)
 * - Rozmiar dostosowany do drzewa (14-18px)
 * - Spójny styl z CANONICAL/Canonical
 * - Dostępność: aria-label po polsku
 */

import React from 'react';
import { CanonicalSymbol } from '../sld/CanonicalSymbolRenderer';
import type { CanonicalSymbolId } from '../sld/SymbolResolver';

export interface TreeCanonicalSymbolIconProps {
  /** ID symbolu CANONICAL */
  symbolId: CanonicalSymbolId;
  /** Rozmiar ikony w pikselach (domyślnie 16) */
  size?: number;
  /** Tryb wyciszony - zmniejszona widoczność (domyślnie false) */
  muted?: boolean;
  /** Tytuł/tooltip po polsku */
  title?: string;
  /** Dodatkowe klasy CSS */
  className?: string;
}

/**
 * Wrapper symboli CANONICAL dla Project Tree.
 *
 * Renderuje symbol CANONICAL w kontenerze SVG z odpowiednimi
 * stylami dla wyświetlania w drzewie projektu.
 *
 * Użycie:
 * ```tsx
 * <TreeCanonicalSymbolIcon
 *   symbolId="busbar"
 *   size={16}
 *   title="Szyna zbiorcza"
 * />
 * ```
 */
export const TreeCanonicalSymbolIcon: React.FC<TreeCanonicalSymbolIconProps> = ({
  symbolId,
  size = 16,
  muted = false,
  title,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`inline-block flex-shrink-0 ${muted ? 'opacity-50' : ''} ${className}`}
      style={{ color: 'currentColor' }}
      role="img"
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <CanonicalSymbol
        symbolId={symbolId}
        stroke="currentColor"
        fill="none"
        size={100}
        strokeWidth={4}
      />
    </svg>
  );
};

export default TreeCanonicalSymbolIcon;
