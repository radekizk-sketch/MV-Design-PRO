import type React from 'react';
import type { DeviceV1, StationBlockDetailV1 } from '../sld/core/fieldDeviceContracts';
import type { StationBlockLayoutV1 } from '../sld/core/bayRenderer';

export interface FieldBlockPalette {
  readonly busbar: string;
  readonly connection: string;
  readonly outline: string;
  readonly surface: string;
  readonly text: string;
  readonly cableMarker: string;
}

export const DEFAULT_FIELD_BLOCK_PALETTE: FieldBlockPalette = {
  busbar: '#2f80ed',
  connection: '#2f80ed',
  outline: '#64748b',
  surface: '#0f172a',
  text: '#e5e7eb',
  cableMarker: '#2f80ed',
};

export interface DeviceVisualOverride {
  readonly label?: string;
  readonly state?: 'closed' | 'open' | 'unknown';
}

export interface StationBlockLayoutSvgProps {
  readonly detail: StationBlockDetailV1;
  readonly layout: StationBlockLayoutV1;
  readonly palette?: Partial<FieldBlockPalette>;
  readonly resolveDeviceVisual?: (deviceId: string, device: DeviceV1 | null) => DeviceVisualOverride | null;
  readonly showBusSectionLabels?: boolean;
  readonly showBusbarEndCaps?: boolean;
  readonly showFieldLabels?: boolean;
  readonly showCableExitMarkers?: boolean;
}

function findDevice(detail: StationBlockDetailV1, deviceId: string): DeviceV1 | null {
  return detail.devices.find((device) => device.id === deviceId) ?? null;
}

export const StationBlockLayoutSvg: React.FC<StationBlockLayoutSvgProps> = ({
  detail,
  layout,
  palette,
  resolveDeviceVisual,
  showBusSectionLabels = true,
  showBusbarEndCaps = true,
  showFieldLabels = true,
  showCableExitMarkers = true,
}) => {
  const colors = { ...DEFAULT_FIELD_BLOCK_PALETTE, ...palette };

  return (
    <g data-sld-role="station-block-layout" data-station-block-id={detail.blockId}>
      <rect
        x={layout.bounds.x}
        y={layout.bounds.y}
        width={layout.bounds.width}
        height={layout.bounds.height}
        rx={4}
        fill={colors.surface}
        stroke={colors.outline}
        strokeWidth={1.2}
      />
      <line
        x1={layout.busbarGeometry.x1}
        y1={layout.busbarGeometry.y}
        x2={layout.busbarGeometry.x2}
        y2={layout.busbarGeometry.y}
        stroke={colors.busbar}
        strokeWidth={4}
        strokeLinecap="round"
      />
      {showBusbarEndCaps ? (
        <>
          <circle cx={layout.busbarGeometry.x1} cy={layout.busbarGeometry.y} r={3} fill={colors.busbar} />
          <circle cx={layout.busbarGeometry.x2} cy={layout.busbarGeometry.y} r={3} fill={colors.busbar} />
        </>
      ) : null}
      {showBusSectionLabels
        ? detail.busSections.map((section, index) => (
            <text
              key={section.id}
              x={layout.busbarGeometry.x1 + 12 + index * 34}
              y={layout.busbarGeometry.y - 7}
              fill={colors.text}
              fontSize={7}
            >
              {section.id}
            </text>
          ))
        : null}
      {layout.bays.map((bay) => {
        const field = detail.fields.find((item) => item.id === bay.fieldId) ?? null;
        return (
          <g key={bay.fieldId} data-sld-role="station-bay-layout" data-field-id={bay.fieldId}>
            <line
              x1={bay.x + bay.width / 2}
              y1={layout.busbarGeometry.y}
              x2={bay.cableExitPoint.x}
              y2={bay.cableExitPoint.y}
              stroke={colors.connection}
              strokeWidth={2}
            />
            {showFieldLabels ? (
              <text x={bay.x + bay.width / 2} y={bay.y + 8} textAnchor="middle" fill={colors.text} fontSize={7}>
                {field?.name ?? field?.fieldRole ?? bay.fieldId}
              </text>
            ) : null}
            {showCableExitMarkers ? (
              <circle cx={bay.cableExitPoint.x} cy={bay.cableExitPoint.y} r={3} fill={colors.cableMarker} />
            ) : null}
          </g>
        );
      })}
      {detail.deviceAnchors.map((anchor) => {
        const device = findDevice(detail, anchor.deviceId);
        const visual = resolveDeviceVisual?.(anchor.deviceId, device) ?? null;
        const x = layout.bounds.x + anchor.relativeX * layout.bounds.width;
        const y = layout.bounds.y + anchor.relativeY * layout.bounds.height;
        return (
          <g key={anchor.deviceId} data-sld-role="station-device-anchor" data-device-id={anchor.deviceId}>
            <rect
              x={x - anchor.width / 2}
              y={y - anchor.height / 2}
              width={anchor.width}
              height={anchor.height}
              rx={2}
              fill="none"
              stroke={colors.outline}
              strokeDasharray={visual?.state === 'unknown' ? '3 2' : undefined}
            />
            {visual?.label ? (
              <text x={x} y={y + 3} textAnchor="middle" fill={colors.text} fontSize={6}>
                {visual.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
};

