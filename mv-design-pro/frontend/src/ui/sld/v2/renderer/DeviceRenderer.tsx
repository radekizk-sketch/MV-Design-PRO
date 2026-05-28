/**
 * DeviceRenderer — renderer aparatu w polu SN (PR-5b).
 *
 * Renderuje pojedynczy aparat (CB, DS, ES, CT, VT, FUSE, SURGE_ARRESTER, CABLE_HEAD,
 * TRANSFORMER_DEVICE) jako prostokątny blok stanu z polską etykietą Q.
 *
 * INWARIANT (BINDING): state→style ma wpływ TYLKO na fill/stroke/class —
 * geometria, viewBox, anchors są niezmienne (sprawdzone w PR-13 symbol-state-invariant).
 *
 * Reguły symboliki briefa §5:
 * - Aparaty łączeniowe (CB/DS/LOAD_SWITCH) = prostokątne bloki stanu
 * - Zamknięty=zielony, otwarty=czerwony, nieznany=szary, awaria=alarm
 * - Głowica kablowa = trójkąt 18-22 px (NIE kropka, NIE ziemia)
 * - Uziemnik = boczny tor zakończony symbolem ziemi
 * - CT = w osi toru, VT = boczny tor pomiarowy
 */

import {
  CABLE_HEAD_TRIANGLE_PX,
  COLOR_TEXT_PRIMARY,
  CT_SIZE_PX,
  DEVICE_BLOCK_STANDARD,
  FONT_SANS,
  FONT_SIZES,
  VT_SIZE_PX,
  getDeviceStyle,
  type DeviceState,
} from '../theme/tokens';

export type DeviceKindV2 =
  | 'CB'
  | 'DS_BUS'
  | 'DS_LINE'
  | 'SWITCH_DISCONNECTOR'
  | 'ES'
  | 'CT'
  | 'VT'
  | 'FUSE'
  | 'SURGE_ARRESTER'
  | 'CABLE_HEAD'
  | 'TRANSFORMER_DEVICE';

export interface DeviceRendererProps {
  readonly id: string;
  readonly kind: DeviceKindV2;
  readonly designationQ: string;
  readonly state: DeviceState;
  readonly x: number;
  readonly y: number;
  readonly selected?: boolean;
  readonly showQLabel?: boolean;
  readonly onClick?: (id: string) => void;
}

export function DeviceRenderer(props: DeviceRendererProps): JSX.Element {
  const { id, kind, designationQ, state, x, y, selected, showQLabel, onClick } = props;
  const effectiveState: DeviceState = selected ? 'selected' : state;
  const style = getDeviceStyle(effectiveState);
  const hitArea = getDeviceHitArea(kind);
  const label = getDeviceAccessibleLabel(kind, designationQ);
  const activate = (event: { stopPropagation: () => void; preventDefault?: () => void }) => {
    event.stopPropagation();
    onClick?.(id);
  };

  return (
    <g
      data-testid={`sld-v2-device-${id}`}
      data-element-kind="device"
      data-element-id={id}
      data-device-kind={kind}
      data-device-state={state}
      transform={`translate(${x}, ${y})`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? label : undefined}
      onClick={onClick ? activate : undefined}
      onDoubleClick={onClick ? activate : undefined}
      onContextMenu={onClick ? (event) => { event.preventDefault(); activate(event); } : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick(id);
        }
      } : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <title>{label}</title>
      {onClick && (
        <rect
          x={hitArea.x}
          y={hitArea.y}
          width={hitArea.width}
          height={hitArea.height}
          fill="transparent"
          pointerEvents="all"
          data-hit-area="device"
          data-testid={`sld-v2-device-hit-${id}`}
        />
      )}
      {renderDeviceShape(kind, style)}
      {showQLabel && (
        <text
          x={DEVICE_BLOCK_STANDARD.width / 2 + 4}
          y={4}
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.deviceQ}
          fontWeight={500}
        >
          {designationQ}
        </text>
      )}
    </g>
  );
}

function getDeviceAccessibleLabel(kind: DeviceKindV2, designationQ: string): string {
  switch (kind) {
    case 'CB':
      return `Wyłącznik ${designationQ}`;
    case 'DS_BUS':
    case 'DS_LINE':
      return `Odłącznik ${designationQ}`;
    case 'SWITCH_DISCONNECTOR':
      return `Rozłącznik ${designationQ}`;
    case 'ES':
      return `Uziemnik ${designationQ}`;
    case 'CT':
      return `Przekładnik prądowy ${designationQ}`;
    case 'VT':
      return `Przekładnik napięciowy ${designationQ}`;
    case 'FUSE':
      return `Bezpiecznik ${designationQ}`;
    case 'SURGE_ARRESTER':
      return `Ogranicznik przepięć ${designationQ}`;
    case 'CABLE_HEAD':
      return `Głowica kablowa ${designationQ}`;
    case 'TRANSFORMER_DEVICE':
      return `Transformator ${designationQ}`;
    default:
      return `Aparat ${designationQ}`;
  }
}

function getDeviceHitArea(kind: DeviceKindV2): { x: number; y: number; width: number; height: number } {
  switch (kind) {
    case 'ES':
      return { x: -12, y: -12, width: 56, height: 56 };
    case 'VT':
      return { x: -14, y: -24, width: 64, height: 48 };
    case 'TRANSFORMER_DEVICE':
      return { x: -24, y: -30, width: 72, height: 60 };
    case 'SURGE_ARRESTER':
      return { x: -18, y: -22, width: 54, height: 44 };
    default:
      return { x: -22, y: -22, width: 62, height: 44 };
  }
}

function renderDeviceShape(
  kind: DeviceKindV2,
  style: ReturnType<typeof getDeviceStyle>,
): JSX.Element {
  if (kind === 'CB') {
    const s = Math.min(DEVICE_BLOCK_STANDARD.width, DEVICE_BLOCK_STANDARD.height);
    return (
      <rect
        x={-s / 2}
        y={-s / 2}
        width={s}
        height={s}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        className={style.className}
        data-symbol-canon="circuit_breaker_square"
      />
    );
  }

  if (kind === 'DS_BUS' || kind === 'DS_LINE') {
    const r = Math.min(DEVICE_BLOCK_STANDARD.width, DEVICE_BLOCK_STANDARD.height) * 0.22;
    return (
      <circle
        cx={0}
        cy={0}
        r={r}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        className={style.className}
        data-symbol-canon="disconnector_circle"
      />
    );
  }

  if (kind === 'SWITCH_DISCONNECTOR') {
    const s = Math.min(DEVICE_BLOCK_STANDARD.width, DEVICE_BLOCK_STANDARD.height) * 0.42;
    return (
      <rect
        x={-s / 2}
        y={-s / 2}
        width={s}
        height={s}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        className={style.className}
        transform="rotate(45)"
        data-symbol-canon="switch_disconnector_rotated_square"
      />
    );
  }

  if (kind === 'FUSE') {
    const w = DEVICE_BLOCK_STANDARD.width * 0.22;
    const h = DEVICE_BLOCK_STANDARD.height * 0.48;
    return (
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        className={style.className}
        data-symbol-canon="fuse_vertical_rectangle"
      />
    );
  }

  switch (kind as DeviceKindV2) {
    case 'CB':
    case 'DS_BUS':
    case 'DS_LINE':
    case 'FUSE': {
      // Prostokątny blok stanu — kanonicznie 38×54 lub 46×64
      const w = DEVICE_BLOCK_STANDARD.width;
      const h = DEVICE_BLOCK_STANDARD.height;
      return (
        <rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
          className={style.className}
        />
      );
    }

    case 'ES': {
      // Uziemnik na bocznym torze — pionowy tor + symbol ziemi
      const length = 30;
      return (
        <g data-symbol-canon="earthing_switch_lateral_branch">
          {/* Pionowy boczny tor */}
          <line
            x1={0}
            y1={0}
            x2={20}
            y2={0}
            stroke={style.stroke}
            strokeWidth={2}
            className={style.className}
          />
          <line
            x1={20}
            y1={0}
            x2={20}
            y2={length}
            stroke={style.stroke}
            strokeWidth={2}
            className={style.className}
          />
          {/* Symbol ziemi: 3 poziome linie */}
          <line x1={10} y1={length} x2={30} y2={length} stroke={style.stroke} strokeWidth={2} />
          <line x1={13} y1={length + 4} x2={27} y2={length + 4} stroke={style.stroke} strokeWidth={1.5} />
          <line x1={16} y1={length + 8} x2={24} y2={length + 8} stroke={style.stroke} strokeWidth={1} />
        </g>
      );
    }

    case 'CT': {
      // Przekładnik prądowy w osi toru — dwa okręgi
      const r = CT_SIZE_PX / 2;
      return (
        <g>
          <circle
            cx={0}
            cy={-r / 2}
            r={r / 2}
            fill="none"
            stroke={style.stroke}
            strokeWidth={2}
            className={style.className}
          />
          <circle
            cx={0}
            cy={r / 2}
            r={r / 2}
            fill="none"
            stroke={style.stroke}
            strokeWidth={2}
            className={style.className}
          />
        </g>
      );
    }

    case 'VT': {
      // Przekładnik napięciowy na bocznym torze pomiarowym
      const r = VT_SIZE_PX / 2;
      return (
        <g>
          {/* Boczny tor pomiarowy */}
          <line x1={0} y1={0} x2={r * 1.2} y2={0} stroke={style.stroke} strokeWidth={2} />
          {/* Okrąg VT z symbolem V */}
          <circle
            cx={r * 1.2 + r}
            cy={0}
            r={r}
            fill="none"
            stroke={style.stroke}
            strokeWidth={2}
            className={style.className}
          />
          <text
            x={r * 1.2 + r}
            y={5}
            textAnchor="middle"
            fontSize={12}
            fontFamily="monospace"
            fill={style.stroke}
          >
            V
          </text>
        </g>
      );
    }

    case 'CABLE_HEAD': {
      // Głowica kablowa: trójkąt 18-22 px (NIE kropka, NIE ziemia)
      const s = CABLE_HEAD_TRIANGLE_PX;
      const half = s / 2;
      return (
        <polygon
          points={`0,${-half} ${-half},${half} ${half},${half}`}
          fill="none"
          stroke={style.stroke}
          strokeWidth={2}
          className={style.className}
        />
      );
    }

    case 'SURGE_ARRESTER': {
      // Ogranicznik przepięć — zigzag pionowy
      return (
        <path
          d="M 0,-15 L -6,-10 L 6,-5 L -6,0 L 6,5 L -6,10 L 0,15"
          fill="none"
          stroke={style.stroke}
          strokeWidth={2}
          className={style.className}
        />
      );
    }

    case 'TRANSFORMER_DEVICE': {
      // Transformator: dwa okręgi (kanon briefa §5 pkt 20)
      return (
        <g
          data-symbol-canon="transformer_intersecting_circles"
          data-transformer-circles-intersect="true"
          data-transformer-circle-overlap-px={15}
        >
          <circle
            cx={0}
            cy={-7.5}
            r={15}
            fill="none"
            stroke={style.stroke}
            strokeWidth={2}
            className={style.className}
            data-transformer-winding="SN"
            data-symbol-canon="transformer_winding_circle"
          />
          <circle
            cx={0}
            cy={7.5}
            r={15}
            fill="none"
            stroke={style.stroke}
            strokeWidth={2}
            className={style.className}
            data-transformer-winding="nN"
            data-symbol-canon="transformer_winding_circle"
          />
        </g>
      );
    }
    default:
      throw new Error(`Nieobsługiwany aparat SLD: ${kind}`);
  }
}
