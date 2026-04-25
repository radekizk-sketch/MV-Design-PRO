/**
 * BaySvgRenderer — CANONICAL-grade SVG renderer for station bay visualization.
 *
 * CANONICAL CONTRACT (BINDING):
 * - Deterministic: same config -> identical SVG output.
 * - Uses bayRenderer.ts computeBayLayout() for geometry calculation.
 * - Uses shared StationBlockLayoutSvg for all active field/device rendering.
 * - All coordinates on GRID_BASE grid.
 * - No physics calculations.
 */

import React, { useMemo, useCallback } from 'react';
import type { StationConfig } from './types';
import { FIELD_ROLE_LABELS_PL } from './types';
import type { RectangleV1 } from '../sld/core/layoutResult';
import type { StationBayLayoutV1 } from '../sld/core/bayRenderer';
import { computeBayLayout } from '../sld/core/bayRenderer';
import type { StationBlockDetailV1 } from '../sld/core/fieldDeviceContracts';
import {
  CANONICAL_VOLTAGE_COLORS,
  CANONICAL_TYPOGRAPHY,
} from '../sld/sldCanonicalStyle';
import { StationBlockLayoutSvg } from '../field/StationBlockLayoutSvg';

// =============================================================================
// GEOMETRY CONSTANTS
// =============================================================================

const BLOCK_PADDING = 20;
const BAY_MIN_WIDTH = 80;
const BUSBAR_EXTRA = 10;

// =============================================================================
// COMPONENT PROPS
// =============================================================================

export interface BaySvgRendererProps {
  /** Station configuration to render. */
  config: StationConfig;
  /** Kanoniczny detail pola dostarczony przez warstwę wyżej. */
  detail: StationBlockDetailV1;
  /** Visual theme for shared renderer. */
  theme?: 'light' | 'canonical-dark';
  /** Width of the SVG canvas. */
  width?: number;
  /** Height of the SVG canvas. */
  height?: number;
  /** Currently selected field ID. */
  selectedFieldId?: string | null;
  /** Currently selected device ID. */
  selectedDeviceId?: string | null;
  /** Callback when a field (bay) is clicked. */
  onFieldClick?: (fieldId: string) => void;
  /** Callback when a device is clicked. */
  onDeviceClick?: (deviceId: string) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const BaySvgRenderer: React.FC<BaySvgRendererProps> = ({
  config,
  detail,
  theme = 'canonical-dark',
  width = 800,
  height = 500,
  selectedFieldId = null,
  selectedDeviceId = null,
  onFieldClick,
  onDeviceClick,
}) => {
  const palette = useMemo(() => {
    if (theme === 'canonical-dark') {
      return {
        background: '#18181B',
        grid: '#27272A',
        frameClassName: 'bg-zinc-900 border border-zinc-700 rounded shadow-sm',
        title: '#F8FAFC',
        subtitle: '#CBD5E1',
        busbar: '#FFFFFF',
        connection: '#FFFFFF',
        label: '#E2E8F0',
        mutedLabel: '#CBD5E1',
        highlightFill: 'rgba(59, 130, 246, 0.14)',
        highlightStroke: '#60A5FA',
        deviceDefaultStroke: '#FFFFFF',
        deviceOffPathStroke: '#E2E8F0',
        cableMarker: '#FFFFFF',
      };
    }

    return {
      background: '#FFFFFF',
      grid: '#F1F5F9',
      frameClassName: 'bg-white border border-slate-200 rounded shadow-sm',
      title: '#1E293B',
      subtitle: '#64748B',
      busbar: CANONICAL_VOLTAGE_COLORS.SN,
      connection: '#475569',
      label: '#475569',
      mutedLabel: '#64748B',
      highlightFill: 'rgba(59, 130, 246, 0.06)',
      highlightStroke: '#3B82F6',
      deviceDefaultStroke: '#1E293B',
      deviceOffPathStroke: '#94A3B8',
      cableMarker: '#94A3B8',
    };
  }, [theme]);

  const layout = useMemo((): StationBayLayoutV1 | null => {
    if (config.fields.length === 0) return null;

    const fieldCount = Math.max(config.fields.length, 1);
    const blockWidth = Math.max(fieldCount * BAY_MIN_WIDTH + BLOCK_PADDING * 2, 300);
    const blockHeight = 300;
    const blockX = (width - blockWidth) / 2;
    const blockY = 60;

    const blockBounds: RectangleV1 = {
      x: blockX,
      y: blockY,
      width: blockWidth,
      height: blockHeight,
    };

    return computeBayLayout(detail, blockBounds);
  }, [config.fields.length, detail, width]);

  const handleFieldClick = useCallback(
    (fieldId: string) => {
      onFieldClick?.(fieldId);
    },
    [onFieldClick],
  );

  if (!layout) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={theme === 'canonical-dark' ? 'bg-zinc-900 border border-zinc-700 rounded' : 'bg-slate-50 border border-slate-200 rounded'}
      >
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          fill={palette.subtitle}
          fontSize={14}
        >
          Dodaj pola rozdzielcze, aby wyświetlić schemat stacji
        </text>
      </svg>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={palette.frameClassName}
      data-testid="bay-svg-renderer"
    >
      <defs>
        <pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={palette.grid} strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill={palette.background} />
      <rect width={width} height={height} fill="url(#grid-pattern)" />

      <text
        x={width / 2}
        y={30}
        textAnchor="middle"
        fill={palette.title}
        fontSize={CANONICAL_TYPOGRAPHY.fontSize.large}
        fontWeight={CANONICAL_TYPOGRAPHY.fontWeight.bold}
        fontFamily="Inter, sans-serif"
      >
        {config.stationName}
      </text>
      <text
        x={width / 2}
        y={48}
        textAnchor="middle"
        fill={palette.subtitle}
        fontSize={10}
        fontFamily="Inter, sans-serif"
      >
        {config.embeddingRole === 'TRUNK_LEAF' && 'Stacja końcowa'}
        {config.embeddingRole === 'TRUNK_INLINE' && 'Stacja przelotowa'}
        {config.embeddingRole === 'TRUNK_BRANCH' && 'Stacja odgałęzieniowa'}
        {config.embeddingRole === 'LOCAL_SECTIONAL' && 'Stacja sekcyjna'}
      </text>

      <StationBlockLayoutSvg
        detail={detail}
        layout={layout}
        palette={palette}
        selectedFieldId={selectedFieldId}
        selectedDeviceId={selectedDeviceId}
        onFieldClick={handleFieldClick}
        onDeviceClick={onDeviceClick}
        resolveFieldLabel={(fieldId, fieldRole) => {
          const fieldConfig = config.fields.find((field) => field.fieldId === fieldId);
          return fieldConfig ? FIELD_ROLE_LABELS_PL[fieldConfig.fieldRole] : fieldRole;
        }}
        resolveDeviceVisual={(deviceId) => {
          const fieldConfig = config.fields.find((field) =>
            field.devices.some((device) => device.deviceId === deviceId),
          );
          const deviceConfig = fieldConfig?.devices.find((device) => device.deviceId === deviceId);
          if (!deviceConfig) {
            return null;
          }
          return {
            label: deviceConfig.label,
            switchState: deviceConfig.switchState,
            stateTone: deviceConfig.stateTone,
          };
        }}
        showPorts={true}
        busbarExtra={BUSBAR_EXTRA}
      />

      <g transform={`translate(${width - 160}, ${height - 50})`}>
        <text x={0} y={0} fill="#94A3B8" fontSize={8} fontFamily="Inter, sans-serif">
          Pól: {config.fields.length} | Aparatów:{' '}
          {config.fields.reduce((sum, field) => sum + field.devices.length, 0)}
        </text>
      </g>
    </svg>
  );
};
