import React, { useMemo } from 'react';
import type { StationFieldAnnotationV1 } from './core/layoutResult';
import {
  DeviceElectricalRoleV1,
  DevicePowerPathPositionV1,
  DeviceTypeV1,
  FieldRoleV1,
  type DeviceV1,
} from './core/fieldDeviceContracts';
import { JunctionDot } from './symbols/JunctionDot';
import { CanonicalSymbol } from './CanonicalSymbolRenderer';
import { STATION_INTERNAL_STROKE } from './IndustrialAesthetics';
import {
  CANONICAL_STROKE,
  CANONICAL_TYPOGRAPHY,
  CANONICAL_VOLTAGE_COLORS,
  DER_FEEDER_COLORS,
} from './sldCanonicalStyle';
import { buildStationCadLayout, type StationCadField } from './SldStationLayoutEngine';
import { formatStationTypeLabelPl } from '../shared/stationTypeLabels';

export interface FieldBlockRendererProps {
  field: StationFieldAnnotationV1;
  colorSN?: string;
  colorNN?: string;
  showTechnicalLabels?: boolean;
}

const FIELD_DEVICE_WIDTH = 38;
const FIELD_DEVICE_HEIGHT = 26;
const SYMBOL_SIZE = 28;
const CLOSED_COLOR = '#159D63';
const OPEN_COLOR = '#334155';
const ALARM_COLOR = '#DC2626';
const DEVICE_NEUTRAL_FILL = '#071927';
const PANEL_FILL = 'rgba(3, 12, 20, 0.92)';
const PANEL_STROKE = 'rgba(56, 189, 248, 0.58)';
const SECTION_FILL_SN = 'rgba(14, 165, 233, 0.08)';
const SECTION_FILL_NN = 'rgba(245, 158, 11, 0.08)';
const TEXT_PRIMARY = '#EAF6FF';
const TEXT_MUTED = '#9CC9E8';
const PORT_FILL = '#081522';

function derFeederColor(feederType: string, fallback: string): string {
  if (feederType === 'generator_pv') return DER_FEEDER_COLORS.pv;
  if (feederType === 'generator_bess') return DER_FEEDER_COLORS.bess;
  if (feederType === 'generator_wind') return DER_FEEDER_COLORS.wind;
  if (feederType === 'load') return DER_FEEDER_COLORS.load;
  return fallback;
}

function feederSymbolId(feederType: string): 'pv' | 'bess' | 'load' {
  if (feederType === 'generator_pv') return 'pv';
  if (feederType === 'generator_bess') return 'bess';
  return 'load';
}

function formatParams(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
}

function isLineField(role: FieldRoleV1): boolean {
  return role === FieldRoleV1.LINE_IN
    || role === FieldRoleV1.LINE_OUT
    || role === FieldRoleV1.LINE_BRANCH
    || role === FieldRoleV1.PV_SN
    || role === FieldRoleV1.BESS_SN
    || role === FieldRoleV1.FW_SN;
}

function stationRoleLabel(role: FieldRoleV1): string {
  switch (role) {
    case FieldRoleV1.LINE_IN:
      return 'WEJŚCIE SN';
    case FieldRoleV1.LINE_OUT:
      return 'WYJŚCIE SN';
    case FieldRoleV1.LINE_BRANCH:
      return 'ODGAŁĘZIENIE SN';
    case FieldRoleV1.TRANSFORMER_SN_NN:
      return 'TRANSFORMATOR';
    case FieldRoleV1.COUPLER_SN:
    case FieldRoleV1.BUS_TIE:
      return 'SPRZĘGŁO SN';
    case FieldRoleV1.MEASUREMENT_SN:
      return 'POMIAR SN';
    case FieldRoleV1.PV_SN:
      return 'ŹRÓDŁO PV SN';
    case FieldRoleV1.BESS_SN:
      return 'MAGAZYN SN';
    case FieldRoleV1.FW_SN:
      return 'FARMA WIATROWA SN';
    default:
      return 'POLE SN';
  }
}

interface DeviceBoxProps {
  x: number;
  y: number;
  label: string;
  kind: 'disconnector' | 'breaker' | 'earthing' | 'ct' | 'vt' | 'relay' | 'termination';
  closed?: boolean;
  alarm?: boolean;
}

const DeviceBox: React.FC<DeviceBoxProps> = ({ x, y, label, kind, closed = true, alarm = false }) => {
  const fill = alarm
    ? ALARM_COLOR
    : kind === 'ct' || kind === 'vt' || kind === 'relay'
      ? DEVICE_NEUTRAL_FILL
      : closed ? CLOSED_COLOR : OPEN_COLOR;
  const symbolStroke = '#FFFFFF';
  const left = x - FIELD_DEVICE_WIDTH / 2;
  const top = y - FIELD_DEVICE_HEIGHT / 2;

  return (
    <g data-sld-role={`apparatus-${kind}`} data-state={alarm ? 'alarm' : closed ? 'zalaczony' : 'otwarty'}>
      <rect
        x={left}
        y={top}
        width={FIELD_DEVICE_WIDTH}
        height={FIELD_DEVICE_HEIGHT}
        rx={3}
        ry={3}
        fill={fill}
        stroke="#0F172A"
        strokeWidth={0.8}
      />
      {kind === 'breaker' ? (
        <>
          <line x1={x - 9} y1={y + 9} x2={x + 9} y2={y - 9} stroke={symbolStroke} strokeWidth={2.2} strokeLinecap="round" />
          <line x1={x - 9} y1={y - 1} x2={x + 9} y2={y - 1} stroke={symbolStroke} strokeWidth={1.8} strokeLinecap="round" />
        </>
      ) : kind === 'earthing' ? (
        <>
          <line x1={x - 8} y1={y + 9} x2={x + 8} y2={y - 9} stroke={symbolStroke} strokeWidth={2.2} strokeLinecap="round" />
          <line x1={x + 8} y1={y - 9} x2={x + 8} y2={y - 16} stroke={symbolStroke} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : kind === 'ct' || kind === 'vt' ? (
        <>
          <circle cx={x - 5} cy={y} r={7} fill="none" stroke={symbolStroke} strokeWidth={1.8} />
          <circle cx={x + 5} cy={y} r={7} fill="none" stroke={symbolStroke} strokeWidth={1.8} opacity={kind === 'ct' ? 1 : 0.55} />
        </>
      ) : kind === 'relay' ? (
        <text x={x} y={y + 4} textAnchor="middle" fontSize={8} fontWeight={700} fill={symbolStroke}>
          IED
        </text>
      ) : kind === 'termination' ? (
        <path d={`M ${x} ${y - 9} L ${x + 10} ${y + 8} L ${x - 10} ${y + 8} Z`} fill="none" stroke={symbolStroke} strokeWidth={2} strokeLinejoin="round" />
      ) : (
        <>
          <path d={`M ${x - 10} ${y - 8} L ${x} ${y + 8} L ${x + 10} ${y - 8}`} fill="none" stroke={symbolStroke} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M ${x - 10} ${y + 8} L ${x} ${y - 8} L ${x + 10} ${y + 8}`} fill="none" stroke={symbolStroke} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
        </>
      )}
      <text x={x + 26} y={y + 4} className="sld-label-params" fill={TEXT_PRIMARY}>
        {label}
      </text>
    </g>
  );
};

function renderGroundSymbol(x: number, y: number, color: string): React.ReactNode {
  return (
    <g data-sld-role="earthing-symbol">
      <line x1={x} y1={y} x2={x} y2={y + 10} stroke={color} strokeWidth={1.8} />
      <line x1={x - 13} y1={y + 10} x2={x + 13} y2={y + 10} stroke={color} strokeWidth={1.8} />
      <line x1={x - 9} y1={y + 16} x2={x + 9} y2={y + 16} stroke={color} strokeWidth={1.6} />
      <line x1={x - 5} y1={y + 21} x2={x + 5} y2={y + 21} stroke={color} strokeWidth={1.4} />
    </g>
  );
}

function renderTransformerSymbol(x: number, y: number, colorSN: string, colorNN: string, stationId: string): React.ReactNode {
  return (
    <g
      data-testid={`station-transformer-${stationId}`}
      data-sld-role="station-transformer-sn-nn"
      data-voltage-domain="SN-NN"
    >
      <circle cx={x - 10} cy={y} r={18} fill="none" stroke={colorSN} strokeWidth={2} />
      <circle cx={x + 10} cy={y} r={18} fill="none" stroke={colorNN} strokeWidth={2} />
      <text
        x={x}
        y={y - 24}
        textAnchor="middle"
        className="sld-label-params"
        fill={TEXT_PRIMARY}
      >
        TR SN/nN
      </text>
    </g>
  );
}

function powerPathWeight(device: DeviceV1): number {
  switch (device.powerPathPosition) {
    case DevicePowerPathPositionV1.UPSTREAM:
      return 10;
    case DevicePowerPathPositionV1.MIDSTREAM:
      return 20;
    case DevicePowerPathPositionV1.DOWNSTREAM:
      return 30;
    case DevicePowerPathPositionV1.OFF_PATH:
    default:
      return 90;
  }
}

function deviceTypeWeight(device: DeviceV1): number {
  switch (device.deviceType) {
    case DeviceTypeV1.DS:
      return 10;
    case DeviceTypeV1.CB:
    case DeviceTypeV1.LOAD_SWITCH:
    case DeviceTypeV1.FUSE:
      return 20;
    case DeviceTypeV1.CT:
      return 30;
    case DeviceTypeV1.VT:
      return 40;
    case DeviceTypeV1.CABLE_HEAD:
      return 50;
    case DeviceTypeV1.ES:
      return 60;
    case DeviceTypeV1.TRANSFORMER_DEVICE:
      return 70;
    case DeviceTypeV1.RELAY:
      return 80;
    default:
      return 90;
  }
}

function sortDevices(left: DeviceV1, right: DeviceV1): number {
  const pathDiff = powerPathWeight(left) - powerPathWeight(right);
  if (pathDiff !== 0) return pathDiff;
  const typeDiff = deviceTypeWeight(left) - deviceTypeWeight(right);
  if (typeDiff !== 0) return typeDiff;
  return left.id.localeCompare(right.id);
}

function deviceBoxKind(device: DeviceV1): DeviceBoxProps['kind'] {
  switch (device.deviceType) {
    case DeviceTypeV1.CB:
    case DeviceTypeV1.LOAD_SWITCH:
    case DeviceTypeV1.FUSE:
      return 'breaker';
    case DeviceTypeV1.ES:
      return 'earthing';
    case DeviceTypeV1.CT:
      return 'ct';
    case DeviceTypeV1.VT:
      return 'vt';
    case DeviceTypeV1.RELAY:
      return 'relay';
    case DeviceTypeV1.CABLE_HEAD:
      return 'termination';
    case DeviceTypeV1.DS:
    default:
      return 'disconnector';
  }
}

function deviceShortLabel(device: DeviceV1): string {
  switch (device.deviceType) {
    case DeviceTypeV1.CB:
      return 'Wył.';
    case DeviceTypeV1.DS:
      return 'Odł.';
    case DeviceTypeV1.LOAD_SWITCH:
      return 'Rozł.';
    case DeviceTypeV1.FUSE:
      return 'Bez.';
    case DeviceTypeV1.ES:
      return 'Uziem.';
    case DeviceTypeV1.CT:
      return 'PP';
    case DeviceTypeV1.VT:
      return 'PN';
    case DeviceTypeV1.RELAY:
      return 'Zab.';
    case DeviceTypeV1.CABLE_HEAD:
      return 'Głow.';
    case DeviceTypeV1.TRANSFORMER_DEVICE:
      return 'TR';
    default:
      return 'Aparat';
  }
}

function fieldDevices(field: StationFieldAnnotationV1, fieldId: string): DeviceV1[] {
  const detail = field.detail ?? null;
  if (!detail) return [];

  const logicalField = detail.fields.find((item) => item.id === fieldId);
  const allowedDeviceIds = new Set(logicalField?.deviceIds ?? []);

  return detail.devices
    .filter((device) => device.fieldId === fieldId || allowedDeviceIds.has(device.id))
    .sort(sortDevices);
}

function renderSnField(
  item: StationCadField,
  stationId: string,
  colorSN: string,
  showTechnicalLabels: boolean,
  devices: readonly DeviceV1[],
): React.ReactNode {
  const conductorX = item.x;
  const yQ2 = item.topY + 22;
  const exitY = item.bottomY + 26;
  const isTransformer = item.role === FieldRoleV1.TRANSFORMER_SN_NN;
  const isSnExit = item.role === FieldRoleV1.LINE_OUT || item.role === FieldRoleV1.LINE_BRANCH;
  const powerPathDevices = devices.filter((device) =>
    device.electricalRole !== DeviceElectricalRoleV1.PROTECTION
    && device.deviceType !== DeviceTypeV1.TRANSFORMER_DEVICE,
  );
  const protectionDevices = devices.filter((device) => device.electricalRole === DeviceElectricalRoleV1.PROTECTION);

  return (
    <g
      key={item.id}
      data-testid={`station-sn-field-${stationId}-${item.role}`}
      data-sld-role="station-sn-field"
      data-field-role={item.role}
      data-voltage-domain="SN"
    >
      <JunctionDot x={conductorX} y={item.busY} color={colorSN} />
      <line
        x1={conductorX}
        y1={item.busY}
        x2={conductorX}
        y2={item.bottomY}
        stroke={colorSN}
        strokeWidth={STATION_INTERNAL_STROKE}
        strokeLinecap="round"
      />
      {powerPathDevices.length === 0 ? (
        <g data-sld-role="field-devices-missing" data-field-role={item.role}>
          <rect
            x={conductorX - FIELD_DEVICE_WIDTH / 2}
            y={yQ2 - FIELD_DEVICE_HEIGHT / 2}
            width={FIELD_DEVICE_WIDTH}
            height={FIELD_DEVICE_HEIGHT}
            rx={3}
            ry={3}
            fill="rgba(245, 158, 11, 0.08)"
            stroke="#F59E0B"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text x={conductorX + 26} y={yQ2 + 4} className="sld-label-params" fill="#FBBF24">
            brak aparatury
          </text>
        </g>
      ) : (
        powerPathDevices.map((device, index) => {
          const deviceY = item.topY + 22 + index * 30;
          const isEarthingSwitch = device.deviceType === DeviceTypeV1.ES;
          return (
            <DeviceBox
              key={device.id}
              x={conductorX}
              y={deviceY}
              label={deviceShortLabel(device)}
              kind={deviceBoxKind(device)}
              closed={!isEarthingSwitch}
              alarm={false}
            />
          );
        })
      )}
      {protectionDevices.map((device, index) => (
        <DeviceBox
          key={device.id}
          x={conductorX + 42}
          y={item.topY + 36 + index * 30}
          label={deviceShortLabel(device)}
          kind="relay"
          closed
        />
      ))}

      {isLineField(item.role) && (
        <>
          <line
            x1={conductorX}
            y1={item.bottomY}
            x2={conductorX}
            y2={exitY}
            stroke={colorSN}
            strokeWidth={STATION_INTERNAL_STROKE}
          />
          <circle
            cx={conductorX}
            cy={exitY}
            r={4}
            fill={PORT_FILL}
            stroke={colorSN}
            strokeWidth={2}
            data-testid={`station-sn-port-${stationId}-${item.role}`}
            data-sld-port-role={isSnExit ? 'BAY_SN_OUT' : 'BAY_SN_IN'}
            data-sld-port-id={`${item.role}:SN`}
            data-voltage-domain="SN"
          >
            <title>{isSnExit ? 'Zacisk wyjściowy pola SN stacji' : 'Zacisk wejściowy pola SN stacji'}</title>
          </circle>
        </>
      )}

      {isLineField(item.role) && (
        <g data-sld-role="field-earthing-branch" data-voltage-domain="SN">
          <line x1={conductorX} y1={item.bottomY - 12} x2={conductorX + 34} y2={item.bottomY - 12} stroke={colorSN} strokeWidth={1.7} />
          <line x1={conductorX + 34} y1={item.bottomY - 12} x2={conductorX + 34} y2={item.bottomY + 14} stroke={colorSN} strokeWidth={1.7} />
          <DeviceBox x={conductorX + 34} y={item.bottomY + 28} label="Uziem." kind="earthing" closed={false} />
          {renderGroundSymbol(conductorX + 34, item.bottomY + 45, colorSN)}
        </g>
      )}

      {isTransformer && (
        <>
          <line
            x1={conductorX}
            y1={item.bottomY}
            x2={conductorX}
            y2={item.bottomY + 38}
            stroke={colorSN}
            strokeWidth={STATION_INTERNAL_STROKE}
            data-sld-port-role="BAY_SN_TRANSFORMER"
            data-sld-port-id={`${item.role}:SN_TRANSFORMER`}
            data-voltage-domain="SN"
          />
          <circle
            cx={conductorX}
            cy={item.bottomY + 38}
            r={4}
            fill={PORT_FILL}
            stroke={colorSN}
            strokeWidth={2}
            data-testid={`station-sn-port-${stationId}-${item.role}-transformer`}
            data-sld-port-role="BAY_SN_TRANSFORMER"
            data-sld-port-id={`${item.role}:SN_TRANSFORMER`}
            data-voltage-domain="SN"
          >
            <title>Zacisk SN transformatora w stacji</title>
          </circle>
        </>
      )}

      <text
        x={conductorX}
        y={item.busY - 22}
        textAnchor="middle"
        className="sld-label-params"
        fill={TEXT_PRIMARY}
      >
        {stationRoleLabel(item.role)}
      </text>
      {showTechnicalLabels && (
        <text
          x={conductorX}
          y={exitY + 18}
          textAnchor="middle"
          className="sld-label-params"
          fill={TEXT_MUTED}
        >
          {item.id}
        </text>
      )}
    </g>
  );
}

export const FieldBlockRenderer: React.FC<FieldBlockRendererProps> = ({
  field,
  colorSN = CANONICAL_VOLTAGE_COLORS.SN,
  colorNN = CANONICAL_VOLTAGE_COLORS.nN,
  showTechnicalLabels = false,
}) => {
  const layout = useMemo(() => buildStationCadLayout(field), [field]);
  const stationTypeLabel = formatStationTypeLabelPl(field.stationType);
  const stationDisplayName = field.stationName ?? stationTypeLabel;
  const titleY = layout.bounds.y + 22;
  const labelX = layout.bounds.x + layout.bounds.width / 2;
  const showFieldLabels = showTechnicalLabels || layout.fields.length <= 4;

  return (
    <g
      data-testid={`station-cad-${field.stationId}`}
      data-sld-role="station-cad-sn-nn"
      data-station-id={field.stationId}
      data-station-type={field.stationType}
      data-embedding-role={layout.embeddingRole}
      data-element-id={field.stationId}
      data-element-type="Station"
      data-element-name={stationDisplayName}
    >
      <rect
        x={layout.bounds.x}
        y={layout.bounds.y}
        width={layout.bounds.width}
        height={layout.bounds.height}
        rx={2}
        ry={2}
        fill={PANEL_FILL}
        stroke={PANEL_STROKE}
        strokeWidth={1.2}
      />
      <text
        x={labelX}
        y={titleY}
        textAnchor="middle"
        fontFamily={CANONICAL_TYPOGRAPHY.fontFamily}
        fontSize={12}
        fontWeight={700}
        fill={TEXT_PRIMARY}
      >
        {stationDisplayName}
      </text>
      <text x={labelX} y={titleY + 14} textAnchor="middle" className="sld-label-params" fill={TEXT_MUTED}>
        {stationTypeLabel}
      </text>

      <rect
        x={layout.snCompartment.x}
        y={layout.snCompartment.y}
        width={layout.snCompartment.width}
        height={layout.snCompartment.height}
        fill={SECTION_FILL_SN}
        stroke={colorSN}
        strokeWidth={0.8}
        strokeDasharray="6 3"
        data-testid={`station-sn-compartment-${field.stationId}`}
        data-voltage-domain="SN"
      />
      <text x={layout.snCompartment.x + 8} y={layout.snCompartment.y + 16} className="sld-label-params" fill={colorSN}>
        strona SN
      </text>

      <line
        x1={layout.snBus.x1}
        y1={layout.snBus.y}
        x2={layout.snBus.x2}
        y2={layout.snBus.y}
        stroke={colorSN}
        strokeWidth={CANONICAL_STROKE.busbar}
        strokeLinecap="square"
        data-testid={`station-sn-bus-${field.stationId}`}
        data-sld-role="station-sn-busbar"
        data-voltage-domain="SN"
      />
      {layout.hasSnContinuation && (
        <line
          x1={layout.lineInField?.x ?? layout.snBus.x1}
          y1={layout.snBus.y - 8}
          x2={layout.lineOutField?.x ?? layout.snBus.x2}
          y2={layout.snBus.y - 8}
          stroke={colorSN}
          strokeWidth={1.5}
          strokeDasharray="7 4"
          data-testid={`station-sn-continuation-${field.stationId}`}
          data-sld-role="station-sn-continuation"
          data-voltage-domain="SN"
        />
      )}

      <g data-sld-role="station-sn-fields">
        {layout.fields.map((item) => renderSnField(
          item,
          field.stationId,
          colorSN,
          showFieldLabels,
          fieldDevices(field, item.id),
        ))}
      </g>

      {layout.transformer && (
        <>
          {renderTransformerSymbol(layout.transformer.x, layout.transformer.y, colorSN, colorNN, field.stationId)}
          <line
            x1={layout.transformer.x}
            y1={layout.transformer.y + layout.transformer.radius}
            x2={layout.transformer.x}
            y2={layout.nnBus.y}
            stroke={colorNN}
            strokeWidth={STATION_INTERNAL_STROKE}
            data-testid={`station-transformer-to-nn-${field.stationId}`}
            data-sld-role="transformer-nn-drop"
            data-voltage-domain="NN"
          />
        </>
      )}

      {field.nnBusbar && (
        <g
          data-testid={`station-nn-section-${field.stationId}`}
          data-sld-role="station-nn-section"
          data-voltage-domain="NN"
        >
          <rect
            x={layout.nnCompartment.x}
            y={layout.nnCompartment.y}
            width={layout.nnCompartment.width}
            height={layout.nnCompartment.height}
            fill={SECTION_FILL_NN}
            stroke={colorNN}
            strokeWidth={0.8}
            strokeDasharray="6 3"
          />
          <text x={layout.nnCompartment.x + 8} y={layout.nnCompartment.y + 16} className="sld-label-params" fill={colorNN}>
            strona nN
          </text>
          <line
            x1={layout.nnBus.x1}
            y1={layout.nnBus.y}
            x2={layout.nnBus.x2}
            y2={layout.nnBus.y}
            stroke={colorNN}
            strokeWidth={4}
            strokeLinecap="square"
            data-testid={`station-nn-bus-${field.stationId}`}
            data-sld-role="station-nn-busbar"
            data-voltage-domain="NN"
          />

          {field.nnBusbar.feeders.map((feeder, feederIndex) => {
            const feederCount = Math.max(field.nnBusbar.feeders.length, 1);
            const nnBusWidth = layout.nnBus.x2 - layout.nnBus.x1;
            const feederSpacing = nnBusWidth / (feederCount + 1);
            const feederX = layout.nnBus.x1 + (feederIndex + 1) * feederSpacing;
            const feederColor = derFeederColor(feeder.type, colorNN);

            return (
              <g key={feeder.designation} data-sld-role="nn-feeder" data-feeder-type={feeder.type} data-voltage-domain="NN">
                <JunctionDot x={feederX} y={layout.nnBus.y} color={colorNN} />
                <line
                  x1={feederX}
                  y1={layout.nnBus.y}
                  x2={feederX}
                  y2={layout.nnBus.y + 30}
                  stroke={feederColor}
                  strokeWidth={STATION_INTERNAL_STROKE}
                  data-sld-port-role="LV_FEEDER_OUT"
                  data-voltage-domain="NN"
                />
                <g transform={`translate(${feederX - SYMBOL_SIZE / 2}, ${layout.nnBus.y + 18})`}>
                  <CanonicalSymbol
                    symbolId={feederSymbolId(feeder.type)}
                    size={24}
                    stroke={feederColor}
                    fill="none"
                    strokeWidth={STATION_INTERNAL_STROKE}
                  />
                </g>
                <text
                  x={feederX}
                  y={layout.nnBus.y + 58}
                  textAnchor="middle"
                  className="sld-label-params"
                  fill={feederColor}
                >
                  {feeder.designation}{feeder.power_kW > 0 ? ` ${feeder.power_kW}kW` : ''}
                </text>
              </g>
            );
          })}

          <text
            x={layout.nnBus.x2 + 8}
            y={layout.nnBus.y + 4}
            className="sld-label-params"
            fill={colorNN}
          >
            {field.nnBusbar.voltageKV}kV
          </text>
        </g>
      )}

      {showTechnicalLabels && (
        <>
          {field.apparatus
            .filter((item) => Object.keys(item.parameters).length > 0)
            .map((item, index) => (
            <text
              key={`${item.designation}-params`}
              x={layout.bounds.x + layout.bounds.width + 14}
              y={layout.bounds.y + 64 + index * 13}
              className="sld-label-params"
              fill={TEXT_MUTED}
              opacity={0.75}
            >
              {item.designation}: {formatParams(item.parameters)}
            </text>
          ))}
          {field.protection.map((relay, index) => (
            <text
              key={`${relay.designation}-params`}
              x={layout.bounds.x + 12}
              y={layout.bounds.y + layout.bounds.height - 18 - index * 12}
              className="sld-label-params"
              fill={TEXT_MUTED}
              opacity={0.75}
            >
              {relay.function} {relay.setting_Ir_A}A {relay.setting_t_s}s
            </text>
          ))}
        </>
      )}
    </g>
  );
};
