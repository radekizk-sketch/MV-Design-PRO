import React from 'react';
import {
  DeviceTypeV1,
  type FieldRoleV1,
  type StationBlockDetailV1,
} from '../sld/core/fieldDeviceContracts';
import type { BayGeometryV1, StationBayLayoutV1 } from '../sld/core/bayRenderer';
import { CanonicalSymbol } from '../sld/CanonicalSymbolRenderer';
import { CANONICAL_STROKE, CANONICAL_VOLTAGE_COLORS } from '../sld/sldCanonicalStyle';

export interface StationBlockPalette {
  background?: string;
  busbar: string;
  connection: string;
  label: string;
  mutedLabel: string;
  highlightFill: string;
  highlightStroke: string;
  deviceDefaultStroke: string;
  deviceOffPathStroke: string;
  cableMarker: string;
}

export interface StationBlockDeviceVisual {
  label?: string;
  switchState?: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  stateTone?: 'open' | 'closed' | 'unknown' | 'fault' | 'normal';
}

export interface StationBlockLayoutSvgProps {
  detail: StationBlockDetailV1;
  layout: StationBayLayoutV1;
  palette?: StationBlockPalette;
  selectedFieldId?: string | null;
  selectedDeviceId?: string | null;
  onFieldClick?: (fieldId: string) => void;
  onDeviceClick?: (deviceId: string) => void;
  resolveFieldLabel?: (fieldId: string, fieldRole: FieldRoleV1) => string;
  resolveDeviceVisual?: (deviceId: string) => StationBlockDeviceVisual | null | undefined;
  showBusSectionLabels?: boolean;
  showBusbarEndCaps?: boolean;
  showFieldLabels?: boolean;
  showCableExitMarkers?: boolean;
  showPorts?: boolean;
  busbarExtra?: number;
}

export const DEFAULT_FIELD_BLOCK_PALETTE: StationBlockPalette = {
  busbar: CANONICAL_VOLTAGE_COLORS.SN,
  connection: '#475569',
  label: '#475569',
  mutedLabel: '#64748B',
  highlightFill: 'rgba(59, 130, 246, 0.08)',
  highlightStroke: '#3B82F6',
  deviceDefaultStroke: '#1E293B',
  deviceOffPathStroke: '#94A3B8',
  cableMarker: '#94A3B8',
};

function stateToneFill(stateTone: StationBlockDeviceVisual['stateTone'] | undefined): string | null {
  switch (stateTone) {
    case 'closed':
      return '#DC2626';
    case 'open':
      return '#16A34A';
    case 'unknown':
      return '#D97706';
    case 'fault':
      return '#B91C1C';
    default:
      return null;
  }
}

function stateToneStroke(stateTone: StationBlockDeviceVisual['stateTone'] | undefined): string {
  return stateToneFill(stateTone) ?? '#1E293B';
}

function defaultResolveFieldLabel(fieldId: string, fieldRole: FieldRoleV1): string {
  return fieldRole || fieldId;
}

function isMiniScadaTileDevice(deviceType: DeviceTypeV1): boolean {
  return (
    deviceType === DeviceTypeV1.CB
    || deviceType === DeviceTypeV1.DS
    || deviceType === DeviceTypeV1.LOAD_SWITCH
    || deviceType === DeviceTypeV1.ES
    || deviceType === DeviceTypeV1.CABLE_HEAD
  );
}

function renderGroundBelowDevice(
  device: BayGeometryV1['devices'][number],
  stroke: string,
): React.ReactNode {
  if (device.deviceType !== DeviceTypeV1.ES) {
    return null;
  }

  return (
    <>
      <line
        x1={device.position.x}
        y1={device.position.y + device.size.height / 2}
        x2={device.position.x}
        y2={device.position.y + device.size.height / 2 + 10}
        stroke={stroke}
        strokeWidth={CANONICAL_STROKE.symbol}
      />
      <g transform={`translate(${device.position.x - 10}, ${device.position.y + device.size.height / 2 + 10})`}>
        <CanonicalSymbol
          symbolId="ground"
          size={20}
          stroke={stroke}
          fill="none"
          strokeWidth={CANONICAL_STROKE.symbol * 0.75}
        />
      </g>
    </>
  );
}

function renderPorts(
  bay: BayGeometryV1,
  palette: StationBlockPalette,
): React.ReactNode {
  return (
    <React.Fragment key={`ports-${bay.bayId}`}>
      {bay.portIn && (
        <g>
          <line
            x1={bay.portIn.x}
            y1={bay.portIn.y - 15}
            x2={bay.portIn.x}
            y2={bay.portIn.y}
            stroke={palette.busbar}
            strokeWidth={CANONICAL_STROKE.feeder}
          />
          <polygon
            points={`${bay.portIn.x},${bay.portIn.y - 15} ${bay.portIn.x - 4},${bay.portIn.y - 22} ${bay.portIn.x + 4},${bay.portIn.y - 22}`}
            fill={palette.busbar}
          />
        </g>
      )}
      {bay.portOut && (
        <g>
          <line
            x1={bay.portOut.x}
            y1={bay.portOut.y}
            x2={bay.portOut.x}
            y2={bay.portOut.y + 15}
            stroke={palette.busbar}
            strokeWidth={CANONICAL_STROKE.feeder}
          />
          <polygon
            points={`${bay.portOut.x},${bay.portOut.y + 15} ${bay.portOut.x - 4},${bay.portOut.y + 22} ${bay.portOut.x + 4},${bay.portOut.y + 22}`}
            fill={palette.busbar}
          />
        </g>
      )}
    </React.Fragment>
  );
}

export function StationBlockLayoutSvg({
  detail,
  layout,
  palette = DEFAULT_FIELD_BLOCK_PALETTE,
  selectedFieldId = null,
  selectedDeviceId = null,
  onFieldClick,
  onDeviceClick,
  resolveFieldLabel = defaultResolveFieldLabel,
  resolveDeviceVisual,
  showBusSectionLabels = true,
  showBusbarEndCaps = true,
  showFieldLabels = true,
  showCableExitMarkers = true,
  showPorts = false,
  busbarExtra = 10,
}: StationBlockLayoutSvgProps) {
  return (
    <g data-testid={`station-block-${detail.blockId}`} data-station-id={detail.blockId}>
      <line
        x1={layout.busbarGeometry.x1 - busbarExtra}
        y1={layout.busbarGeometry.y}
        x2={layout.busbarGeometry.x2 + busbarExtra}
        y2={layout.busbarGeometry.y}
        stroke={palette.busbar}
        strokeWidth={CANONICAL_STROKE.busbar}
        strokeLinecap="round"
      />

      {showBusSectionLabels && layout.busbarGeometry.sections.map((section) => (
        <text
          key={section.sectionId}
          x={(section.x1 + section.x2) / 2}
          y={layout.busbarGeometry.y - 8}
          textAnchor="middle"
          fill={palette.busbar}
          fontSize={9}
          fontWeight="500"
          fontFamily="Inter, sans-serif"
        >
          {section.sectionId}
        </text>
      ))}

      {showBusbarEndCaps && (
        <>
          <circle
            cx={layout.busbarGeometry.x1 - busbarExtra}
            cy={layout.busbarGeometry.y}
            r={3}
            fill={palette.busbar}
          />
          <circle
            cx={layout.busbarGeometry.x2 + busbarExtra}
            cy={layout.busbarGeometry.y}
            r={3}
            fill={palette.busbar}
          />
        </>
      )}

      {layout.auxiliaryConnections.map((connection, index) => (
        <line
          key={`aux-${connection.kind}-${index}`}
          x1={connection.from.x}
          y1={connection.from.y}
          x2={connection.to.x}
          y2={connection.to.y}
          stroke={palette.connection}
          strokeWidth={CANONICAL_STROKE.feeder}
          strokeLinecap="round"
        />
      ))}

      {layout.auxiliaryConnections
        .filter((connection) => connection.kind === 'BUS_TAP')
        .map((connection, index) => (
          <circle
            key={`tap-node-${index}`}
            cx={connection.from.x}
            cy={connection.from.y}
            r={3}
            fill={palette.busbar}
          />
        ))}

      {layout.internalConnections.map((connection, index) => (
        <line
          key={`connection-${index}`}
          x1={connection.from.x}
          y1={connection.from.y}
          x2={connection.to.x}
          y2={connection.to.y}
          stroke={palette.connection}
          strokeWidth={CANONICAL_STROKE.feeder}
          strokeLinecap="round"
        />
      ))}

      {layout.bays.map((bay) => {
        const isSelected = bay.bayId === selectedFieldId;
        const field = detail.fields.find((item) => item.id === bay.bayId);

        return (
          <g
            key={bay.bayId}
            data-testid={`bay-${bay.bayId}`}
            onClick={() => onFieldClick?.(bay.bayId)}
            style={onFieldClick ? { cursor: 'pointer' } : undefined}
          >
            <rect
              x={bay.bounds.x}
              y={bay.bounds.y}
              width={bay.bounds.width}
              height={bay.bounds.height}
              fill={isSelected ? palette.highlightFill : 'transparent'}
              stroke={isSelected ? palette.highlightStroke : 'transparent'}
              strokeWidth={isSelected ? 1.5 : 0}
              strokeDasharray={isSelected ? '4 2' : undefined}
              rx={2}
            />

            {bay.devices.map((device) => {
              const isDeviceSelected = device.deviceId === selectedDeviceId;
              const visual = resolveDeviceVisual?.(device.deviceId) ?? null;
              const stateFill = stateToneFill(visual?.stateTone);
              const stateStroke = stateToneStroke(visual?.stateTone);
              const isTileDevice = isMiniScadaTileDevice(device.deviceType);
              const deviceFill = isTileDevice ? '#16A34A' : stateFill;
              const deviceStroke = isTileDevice ? '#15803D' : stateStroke;

              return (
                <g
                  key={device.deviceId}
                  transform={`translate(${device.position.x - device.size.width / 2}, ${device.position.y - device.size.height / 2})`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeviceClick?.(device.deviceId);
                  }}
                  data-testid={`device-${device.deviceId}`}
                  style={onDeviceClick ? { cursor: 'pointer' } : undefined}
                >
                  {(stateFill || isTileDevice) && (
                    <rect
                      x={-6}
                      y={-6}
                      width={device.size.width + 12}
                      height={device.size.height + 12}
                      rx={4}
                      fill={deviceFill ?? 'none'}
                      stroke={deviceStroke}
                      strokeWidth={1.25}
                      opacity={0.96}
                    />
                  )}

                  {isDeviceSelected && (
                    <rect
                      x={-4}
                      y={-4}
                      width={device.size.width + 8}
                      height={device.size.height + 8}
                      fill="rgba(245, 158, 11, 0.12)"
                      stroke="#F59E0B"
                      strokeWidth={1.5}
                      rx={3}
                    />
                  )}

                  <g
                    transform={
                      device.rotation !== 0
                        ? `rotate(${device.rotation}, ${device.size.width / 2}, ${device.size.height / 2})`
                        : undefined
                    }
                  >
                    <CanonicalSymbol
                      symbolId={device.symbolId}
                      size={Math.min(device.size.width, device.size.height)}
                      stroke={
                        (stateFill || isTileDevice)
                          ? '#FFFFFF'
                          : device.isOnPowerPath
                            ? palette.deviceDefaultStroke
                            : palette.deviceOffPathStroke
                      }
                      fill={(stateFill || isTileDevice) ? 'none' : undefined}
                      strokeWidth={CANONICAL_STROKE.symbol}
                      switchState={visual?.switchState}
                    />
                  </g>

                  {renderGroundBelowDevice(
                    device,
                    (stateFill || isTileDevice) ? '#FFFFFF' : palette.connection,
                  )}

                  {visual?.label && (
                    <text
                      x={device.size.width + 8}
                      y={device.size.height / 2 + 3}
                      fill={(stateFill || isTileDevice) ? '#F8FAFC' : palette.label}
                      fontSize={8}
                      fontWeight="600"
                      fontFamily="Inter, sans-serif"
                    >
                      {visual.label}
                    </text>
                  )}
                </g>
              );
            })}

            {showFieldLabels && field && (
              <text
                x={bay.bounds.x + bay.bounds.width / 2}
                y={bay.bounds.y + bay.bounds.height + 14}
                textAnchor="middle"
                fill={isSelected ? palette.highlightStroke : palette.label}
                fontSize={9}
                fontWeight={isSelected ? '600' : '400'}
                fontFamily="Inter, sans-serif"
              >
                {resolveFieldLabel(bay.bayId, field.fieldRole)}
              </text>
            )}

            {showCableExitMarkers
              && bay.fieldRole !== 'COUPLER_SN'
              && bay.fieldRole !== 'BUS_TIE' && (
              <line
                x1={bay.cableExitPoint.x - 6}
                y1={bay.cableExitPoint.y}
                x2={bay.cableExitPoint.x + 6}
                y2={bay.cableExitPoint.y}
                stroke={palette.cableMarker}
                strokeWidth={1.5}
              />
            )}
          </g>
        );
      })}

      {showPorts && layout.bays.map((bay) => renderPorts(bay, palette))}
    </g>
  );
}
