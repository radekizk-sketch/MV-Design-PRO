/**
 * CONNECTION RENDERER — Komponent renderowania polaczen SLD (CANONICAL-style)
 *
 * PR-SLD-CANONICAL-STYLE-02: CANONICAL 1:1 Visual Parity
 *
 * CANONICAL ALIGNMENT:
 * - sldCanonicalStyle.ts: Single source of truth for visual styling
 * - SLD_KANONICZNA_SPECYFIKACJA.md § 4: Polaczenia
 * - AUDYT_SLD_CANONICAL.md: N-01, N-05
 *
 * FEATURES:
 * - Renderowanie polaczen jako polyline SVG
 * - Styl CANONICAL: hierarchia grubosci (feeder stroke)
 * - Podswietlenie przy kliknieciu
 * - Powiekszona strefa klikniecia (hitbox)
 *
 * STROKE HIERARCHY:
 * - Connections use CANONICAL_STROKE.feeder (subordinate to busbar)
 */

import React, { useCallback, useMemo } from 'react';
import type { Connection, Position } from '../sld-editor/types';
import {
  CANONICAL_STROKE,
  CANONICAL_STROKE_SELECTED,
  CANONICAL_STATE_COLORS,
  CANONICAL_TYPOGRAPHY,
  CANONICAL_LINE_LABEL,
  calculateLineLabelPosition,
} from './sldCanonicalStyle';
import { CABLE_DASH_ARRAY, RING_DASH_ARRAY, RING_STROKE_WIDTH } from './IndustrialAesthetics';

// =============================================================================
// STALE STYLIZACJI — using CANONICAL tokens
// =============================================================================

/** Grubosc linii polaczenia (px) — uses CANONICAL feeder stroke */
const CONNECTION_STROKE_WIDTH = CANONICAL_STROKE.feeder;

/** Grubosc linii podswietlonej (px) — uses CANONICAL selected feeder stroke */
const CONNECTION_STROKE_WIDTH_SELECTED = CANONICAL_STROKE_SELECTED.feeder;

/** Grubosc niewidocznej strefy klikniecia (px) */
const HITBOX_STROKE_WIDTH = 12;

/** Kolory polaczen — using CANONICAL state colors */
const CONNECTION_COLORS = {
  default: CANONICAL_TYPOGRAPHY.labelColor,     // same as symbol default
  deenergized: CANONICAL_STATE_COLORS.deenergized,
  selected: CANONICAL_STATE_COLORS.selected,
  hover: CANONICAL_STATE_COLORS.info,
} as const;

// =============================================================================
// KOMPONENT POLACZENIA
// =============================================================================

export interface ConnectionRendererProps {
  /** Polaczenie do renderowania */
  connection: Connection;
  /** Czy polaczenie jest zaznaczone */
  selected?: boolean;
  /** Czy polaczenie jest aktywne (pod napieciem) */
  energized?: boolean;
  /** Etykieta polaczenia (nazwa linii/kabla) */
  label?: string;
  /** Czy pokazywac etykiete */
  showLabel?: boolean;
  /** Callback przy kliknieciu */
  onClick?: (connectionId: string, event: React.MouseEvent) => void;
  /** Callback przy najechaniu */
  onMouseEnter?: (connectionId: string) => void;
  /** Callback przy zjechaniu */
  onMouseLeave?: (connectionId: string) => void;
}

/**
 * Konwertuj sciezke na string dla SVG polyline.
 */
function pathToPoints(path: Position[]): string {
  return path.map((p) => `${p.x},${p.y}`).join(' ');
}

function resolveBranchType(connection: Connection): 'LINE' | 'CABLE' | null {
  const direct = connection.branchType;
  if (direct === 'LINE' || direct === 'CABLE') {
    return direct;
  }

  const projected = connection.attributes?.branchType;
  return projected === 'LINE' || projected === 'CABLE' ? projected : null;
}

/**
 * Komponent renderowania polaczenia.
 * PR-SLD-CANONICAL-LABELS-01: Etykiety na linii z halo/white-box.
 */
export const ConnectionRenderer: React.FC<ConnectionRendererProps> = ({
  connection,
  selected = false,
  energized = true,
  label,
  showLabel = true,
  onClick,
  onMouseEnter,
  onMouseLeave,
}) => {
  const { id, path, connectionType, connectionStyle } = connection;
  const connectionRef = connection.elementId ?? id;
  const connectionTypeAttr = connectionType ?? 'unknown';

  // Ring detection — kontrakt §1.7: ring = 2px przerywana
  const isRing = connectionStyle === 'ring';
  const branchType = resolveBranchType(connection);

  // Hooks must be called before any early return (Rules of Hooks)
  // Punkty dla polyline
  const points = useMemo(
    () => (path && path.length >= 2) ? pathToPoints(path) : '',
    [path]
  );

  // Oblicz pozycje etykiety (deterministycznie)
  const labelPosition = useMemo(() => {
    if (!path || path.length < 2 || !showLabel || !label) return null;
    return calculateLineLabelPosition(path, id);
  }, [path, id, showLabel, label]);

  // Handlery
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick?.(id, e);
    },
    [id, onClick]
  );

  const handleMouseEnter = useCallback(() => {
    onMouseEnter?.(id);
  }, [id, onMouseEnter]);

  const handleMouseLeave = useCallback(() => {
    onMouseLeave?.(id);
  }, [id, onMouseLeave]);

  // Jesli sciezka jest pusta lub ma mniej niz 2 punkty, nie renderuj
  if (!path || path.length < 2) {
    return null;
  }

  // Styl linii
  const strokeColor = selected
    ? CONNECTION_COLORS.selected
    : energized
    ? CONNECTION_COLORS.default
    : CONNECTION_COLORS.deenergized;

  // Ring: stała grubość RING_STROKE_WIDTH, linia przerywana (kontrakt §1.7)
  const strokeWidth = isRing
    ? RING_STROKE_WIDTH
    : selected
    ? CONNECTION_STROKE_WIDTH_SELECTED
    : CONNECTION_STROKE_WIDTH;

  // Stroke-dasharray: ring and cable are dashed; overhead LINE remains solid.
  const strokeDashArray = isRing
    ? RING_DASH_ARRAY
    : branchType === 'CABLE'
      ? CABLE_DASH_ARRAY
      : undefined;

  const opacity = energized ? 1 : 0.6;

  // Szacowana szerokosc etykiety (7px na znak — przemyslowy standard)
  const estimatedLabelWidth = label ? Math.max(30, label.length * 7) : 0;
  const labelHeight = CANONICAL_TYPOGRAPHY.fontSize.medium;

  return (
    <g
      data-testid={`sld-connection-${id}`}
      data-connection-type={connectionTypeAttr}
      data-connection-ref={connectionRef}
      data-element-id={connection.elementId ?? undefined}
      data-connection-selected={selected}
      data-connection-energized={energized}
      data-branch-type={branchType ?? undefined}
      data-has-label={!!(showLabel && label && labelPosition)}
    >
      {/* Niewidoczna strefa klikniecia (hitbox) */}
      <polyline
        points={points}
        fill="none"
        stroke="transparent"
        strokeWidth={HITBOX_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ cursor: onClick ? 'pointer' : 'default' }}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />

      {/* Widoczna linia polaczenia */}
      {/* Ring: linia przerywana (kontrakt §1.7 — Industrial Aesthetics) */}
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={strokeDashArray}
        opacity={opacity}
        style={{ pointerEvents: 'none' }}
        data-connection-ring={isRing}
        data-branch-medium={branchType === 'CABLE' ? 'cable' : branchType === 'LINE' ? 'overhead' : undefined}
      />

      {/* Etykieta na linii z halo/white-box */}
      {showLabel && label && labelPosition && (
        <g
          data-testid={`sld-connection-label-${id}`}
          data-label-segment={labelPosition.segmentIndex}
          data-label-offset={labelPosition.offsetDirection}
        >
          {/* Halo/white-box — tlo dla czytelnosci */}
          <rect
            x={labelPosition.position.x - estimatedLabelWidth / 2 - CANONICAL_LINE_LABEL.haloPadding}
            y={labelPosition.position.y - labelHeight / 2 - CANONICAL_LINE_LABEL.haloPadding}
            width={estimatedLabelWidth + CANONICAL_LINE_LABEL.haloPadding * 2}
            height={labelHeight + CANONICAL_LINE_LABEL.haloPadding * 2}
            fill={CANONICAL_LINE_LABEL.haloColor}
            opacity={CANONICAL_LINE_LABEL.haloOpacity}
            rx={1}
            ry={1}
            style={{ pointerEvents: 'none' }}
            data-testid={`sld-connection-label-halo-${id}`}
          />
          {/* Tekst etykiety */}
          <text
            x={labelPosition.position.x}
            y={labelPosition.position.y}
            textAnchor={labelPosition.textAnchor}
            dominantBaseline="central"
            fontFamily={CANONICAL_TYPOGRAPHY.fontFamily}
            fontSize={CANONICAL_TYPOGRAPHY.fontSize.medium}
            fontWeight={selected ? CANONICAL_TYPOGRAPHY.fontWeight.semibold : CANONICAL_TYPOGRAPHY.fontWeight.normal}
            fill={CANONICAL_TYPOGRAPHY.labelColor}
            style={{ pointerEvents: 'none' }}
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
};

// =============================================================================
// KOMPONENT GRUPY POLACZEN
// =============================================================================

export interface ConnectionsLayerProps {
  /** Lista polaczen do renderowania */
  connections: Connection[];
  /** ID zaznaczonego polaczenia */
  selectedConnectionId?: string | null;
  /** Mapa energizacji (connectionId -> boolean) */
  energizationMap?: Map<string, boolean>;
  /** Mapa etykiet (connectionId -> label) */
  labelMap?: Map<string, string>;
  /** Czy pokazywac etykiety na polaczeniach */
  showLabels?: boolean;
  /** Callback przy kliknieciu polaczenia */
  onConnectionClick?: (connectionId: string, event: React.MouseEvent) => void;
  /** Callback przy najechaniu na polaczenie */
  onConnectionHover?: (connectionId: string | null) => void;
}

/**
 * Warstwa renderowania wszystkich polaczen.
 * Polaczenia sa renderowane pod symbolami.
 * PR-SLD-CANONICAL-LABELS-01: Etykiety na liniach z halo.
 */
export const ConnectionsLayer: React.FC<ConnectionsLayerProps> = ({
  connections,
  selectedConnectionId,
  energizationMap,
  labelMap,
  showLabels = true,
  onConnectionClick,
  onConnectionHover,
}) => {
  // DETERMINIZM: Sortuj polaczenia po ID
  const sortedConnections = useMemo(
    () => [...connections].sort((a, b) => a.id.localeCompare(b.id)),
    [connections]
  );

  const handleMouseEnter = useCallback(
    (connectionId: string) => {
      onConnectionHover?.(connectionId);
    },
    [onConnectionHover]
  );

  const handleMouseLeave = useCallback(() => {
    onConnectionHover?.(null);
  }, [onConnectionHover]);

  return (
    <g data-testid="sld-connections-layer">
      {sortedConnections.map((connection) => (
        <ConnectionRenderer
          key={connection.id}
          connection={connection}
          selected={connection.id === selectedConnectionId}
          energized={energizationMap?.get(connection.id) ?? true}
          label={labelMap?.get(connection.id)}
          showLabel={showLabels}
          onClick={onConnectionClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      ))}
    </g>
  );
};

// =============================================================================
// EKSPORT DOMYSLNY
// =============================================================================

export default ConnectionRenderer;
