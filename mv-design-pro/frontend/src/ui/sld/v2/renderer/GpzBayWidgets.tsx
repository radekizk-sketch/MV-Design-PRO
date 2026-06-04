/**
 * SLD V2 — GpzSwitchgear bay widget components.
 *
 * Extracted from GpzSwitchgearRenderer.tsx for modularization.
 * Contains: BadgeStack, BadgeRow, KasButton, MeasurementPanel,
 * GroundFaultMarker.
 */

import {
  COLOR_GROUND_FAULT,
  COLOR_KAS_LED,
  COLOR_MEASUREMENT_VALUE,
  COLOR_PANEL_RAISED,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_SECONDARY,
  FONT_MONO,
  FONT_SANS,
  FONT_SIZES,
  GPZ_GEOMETRY,
} from '../theme/tokens';
import type { BayMeasurements, BaySecondaryFlags, GroundFaultMarkerState, SecondaryFlagState } from './GpzSwitchgearTypes';
import { collectBadges, badgeVisual, statusLabel, collectMeasurementRows, fitTextToWidth } from './GpzSwitchgearLayout';

const KAS_LED_RADIUS = GPZ_GEOMETRY.kasLedRadius;
const BADGE_WIDTH = GPZ_GEOMETRY.badgeWidth;
const BADGE_LABEL_HEIGHT = GPZ_GEOMETRY.badgeLabelHeight;
const BADGE_STATUS_HEIGHT = GPZ_GEOMETRY.badgeStatusHeight;
const BADGE_ROW_HEIGHT = BADGE_LABEL_HEIGHT + BADGE_STATUS_HEIGHT + 1;
const BADGE_FONT_SIZE = FONT_SIZES.badge;
const MEASUREMENT_ROW_HEIGHT = GPZ_GEOMETRY.measurementRowHeight;
const MEASUREMENT_PANEL_HEADER_HEIGHT = GPZ_GEOMETRY.measurementPanelHeaderHeight;
const MEASUREMENT_FONT_SIZE = FONT_SIZES.measurementPanel;
const LABEL_CLIP_INSET = GPZ_GEOMETRY.labelClipInset;

// =============================================================================
// BadgeStack
// =============================================================================

interface BadgeStackProps {
  readonly x: number;
  readonly y: number;
  readonly flags: BaySecondaryFlags;
}

/** Renderuje stos badge'y zabezpieczeń (SPZ/SCO/OWG/NZ/LRW/ARN/...). */
export function BadgeStack(props: BadgeStackProps): JSX.Element {
  const { x, y, flags } = props;
  const items = collectBadges(flags);
  return (
    <g data-testid="sld-v2-gpz-bay-badge-stack" data-badge-count={String(items.length)}>
      {items.map((item, idx) => (
        <BadgeRow
          key={item.code}
          x={x}
          y={y + idx * BADGE_ROW_HEIGHT}
          code={item.code}
          state={item.state}
        />
      ))}
    </g>
  );
}

// =============================================================================
// BadgeRow
// =============================================================================

interface BadgeRowProps {
  readonly x: number;
  readonly y: number;
  readonly code: string;
  readonly state: SecondaryFlagState;
}

export function BadgeRow(props: BadgeRowProps): JSX.Element {
  const { x, y, code, state } = props;
  const visual = badgeVisual(code, state);
  const labelTextY = y + BADGE_LABEL_HEIGHT - 1.5;
  const statusTextY = y + BADGE_LABEL_HEIGHT + BADGE_STATUS_HEIGHT - 1;
  return (
    <g
      data-testid={`sld-v2-gpz-bay-badge-${code.toLowerCase()}`}
      data-badge-code={code}
      data-badge-state={state}
    >
      <rect
        x={x}
        y={y}
        width={BADGE_WIDTH}
        height={BADGE_LABEL_HEIGHT}
        fill={visual.labelBg}
        stroke={visual.labelBorder}
        strokeWidth={0.5}
        rx={1}
      />
      <text
        x={x + BADGE_WIDTH / 2}
        y={labelTextY}
        textAnchor="middle"
        fill={visual.labelFg}
        fontFamily={FONT_SANS}
        fontSize={BADGE_FONT_SIZE}
        fontWeight={700}
      >
        {code}
      </text>
      <text
        x={x + BADGE_WIDTH / 2}
        y={statusTextY}
        textAnchor="middle"
        fill={visual.statusColor}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.badgeStatus}
        fontWeight={600}
      >
        {statusLabel(state)}
      </text>
    </g>
  );
}

// =============================================================================
// KasButton
// =============================================================================

interface KasButtonProps {
  readonly cx: number;
  readonly cy: number;
  /** Etykieta przycisku (domyślnie "KAS"). Sprzęgło używa "KAS SP", "KAS SZR". */
  readonly label?: string;
  /** Test-id rodzica (domyślnie "sld-v2-gpz-bay-kas"). */
  readonly testId?: string;
  /** Test-id LED (domyślnie "sld-v2-gpz-bay-kas-led"). */
  readonly ledTestId?: string;
  /** Numer P-* identyfikatora pod LED-em (np. "P133", "C434"). Renderowany gdy podany. */
  readonly pNumber?: string;
  /** Handler kliku (kasowanie sygnalizacji). Z stopPropagation. */
  readonly onClick?: () => void;
}

export function KasButton(props: KasButtonProps): JSX.Element {
  const {
    cx,
    cy,
    label = 'KAS',
    testId = 'sld-v2-gpz-bay-kas',
    ledTestId = 'sld-v2-gpz-bay-kas-led',
    pNumber,
    onClick,
  } = props;
  return (
    <g
      data-testid={testId}
      data-kas-label={label}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      <text
        x={cx - 4}
        y={cy + 1}
        textAnchor="end"
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.kasLabel}
        fontWeight={700}
      >
        {label}
      </text>
      <circle
        cx={cx + 4}
        cy={cy - 2}
        r={KAS_LED_RADIUS}
        fill={COLOR_KAS_LED}
        data-testid={ledTestId}
      />
      {pNumber && (
        <text
          x={cx + 4}
          y={cy + 8}
          textAnchor="middle"
          fill={COLOR_TEXT_MUTED}
          fontFamily={FONT_MONO}
          fontSize={FONT_SIZES.kasPNumber}
          fontWeight={500}
          data-testid={`${testId}-pnumber`}
        >
          {pNumber}
        </text>
      )}
    </g>
  );
}

// =============================================================================
// MeasurementPanel
// =============================================================================

interface MeasurementPanelProps {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly feederName?: string;
  readonly measurements: BayMeasurements;
}

export function MeasurementPanel(props: MeasurementPanelProps): JSX.Element {
  const { x, y, width, feederName, measurements } = props;
  const rows = collectMeasurementRows(measurements);
  const labelX = x - width / 2 + 4;
  const valueX = x + width / 2 - 4;
  /* Nagłówek (nazwa odpływu) przycięty do szerokości panelu minus inset z obu
   * stron — zostawia prześwit do sąsiedniej kolumny (anty-kolizja D1: bez tego
   * "STAROŁĘCKA" + "WSCHODNIA" zlewały się w jeden ciąg). */
  const headerText = feederName
    ? fitTextToWidth(feederName, width - 2 * LABEL_CLIP_INSET, MEASUREMENT_FONT_SIZE)
    : '';

  return (
    <g data-testid="sld-v2-gpz-bay-measurement-panel" data-row-count={String(rows.length)}>
      {feederName && (
        <text
          x={x}
          y={y + 8}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={MEASUREMENT_FONT_SIZE}
          fontWeight={600}
        >
          {headerText}
        </text>
      )}
      {rows.map((row, idx) => {
        const rowY = y + MEASUREMENT_PANEL_HEADER_HEIGHT + idx * MEASUREMENT_ROW_HEIGHT;
        return (
          <g key={`${row.label}-${idx}`} data-testid={`sld-v2-gpz-bay-measurement-${row.label.toLowerCase()}`}>
            <text
              x={labelX}
              y={rowY + MEASUREMENT_FONT_SIZE - 1}
              fill={COLOR_TEXT_MUTED}
              fontFamily={FONT_SANS}
              fontSize={MEASUREMENT_FONT_SIZE}
            >
              {row.label}
            </text>
            <text
              x={valueX}
              y={rowY + MEASUREMENT_FONT_SIZE - 1}
              textAnchor="end"
              fill={COLOR_MEASUREMENT_VALUE}
              fontFamily={FONT_MONO}
              fontSize={MEASUREMENT_FONT_SIZE}
            >
              {row.value}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// =============================================================================
// GroundFaultMarker
// =============================================================================

interface GroundFaultMarkerProps {
  readonly cx: number;
  readonly cy: number;
  readonly state: GroundFaultMarkerState;
}

export function GroundFaultMarker(props: GroundFaultMarkerProps): JSX.Element {
  const { cx, cy, state } = props;
  const fill = state === 'fault' ? COLOR_GROUND_FAULT : COLOR_PANEL_RAISED;
  /* Promień 5 px (audyt UX D1.3): poziom widoczności z fotela dyspozytora
   * (24" 1920×1080, dystans 60 cm). 3 px było ~0.6 mm, niewidoczne. */
  return (
    <g data-testid="sld-v2-gpz-bay-ground-fault" data-state={state}>
      <circle cx={cx} cy={cy} r={5} fill={fill} stroke={COLOR_GROUND_FAULT} strokeWidth={1.6} />
    </g>
  );
}

