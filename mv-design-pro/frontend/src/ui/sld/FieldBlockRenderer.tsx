import React, { useMemo } from 'react';
import type { StationFieldAnnotationV1 } from './core/layoutResult';
import { FieldRoleV1 } from './core/fieldDeviceContracts';
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
const CLOSED_COLOR = '#16A34A';
const OPEN_COLOR = '#DC2626';
const PANEL_FILL = 'rgba(255,255,255,0.92)';
const PANEL_STROKE = '#64748B';
const SECTION_FILL_SN = 'rgba(29, 78, 216, 0.045)';
const SECTION_FILL_NN = 'rgba(180, 83, 9, 0.06)';

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
  kind: 'disconnector' | 'breaker' | 'earthing';
  closed?: boolean;
}

const DeviceBox: React.FC<DeviceBoxProps> = ({ x, y, label, kind, closed = true }) => {
  const fill = closed ? CLOSED_COLOR : OPEN_COLOR;
  const symbolStroke = '#FFFFFF';
  const left = x - FIELD_DEVICE_WIDTH / 2;
  const top = y - FIELD_DEVICE_HEIGHT / 2;

  return (
    <g data-sld-role={`apparatus-${kind}`} data-state={closed ? 'zalaczony' : 'wylaczony'}>
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
      ) : (
        <>
          <path d={`M ${x - 10} ${y - 8} L ${x} ${y + 8} L ${x + 10} ${y - 8}`} fill="none" stroke={symbolStroke} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M ${x - 10} ${y + 8} L ${x} ${y - 8} L ${x + 10} ${y + 8}`} fill="none" stroke={symbolStroke} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
        </>
      )}
      <text x={x + 26} y={y + 4} className="sld-label-params" fill="#111827">
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
      <text x={x + 34} y={y + 4} className="sld-label-params" fill="#111827">
        TR SN/nN
      </text>
    </g>
  );
}

function renderSnField(
  item: StationCadField,
  stationId: string,
  colorSN: string,
  showTechnicalLabels: boolean,
): React.ReactNode {
  const conductorX = item.x;
  const yQ2 = item.topY + 22;
  const yQ1 = item.topY + 54;
  const yQ2Down = item.topY + 86;
  const exitY = item.bottomY + 26;
  const isTransformer = item.role === FieldRoleV1.TRANSFORMER_SN_NN;
  const isCoupler = item.role === FieldRoleV1.COUPLER_SN || item.role === FieldRoleV1.BUS_TIE;
  const isSnExit = item.role === FieldRoleV1.LINE_OUT || item.role === FieldRoleV1.LINE_BRANCH;

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
      <DeviceBox x={conductorX} y={yQ2} label="Q2" kind="disconnector" />
      <DeviceBox x={conductorX} y={yQ1} label="Q1" kind="breaker" />
      <DeviceBox x={conductorX} y={yQ2Down} label={isCoupler ? 'Q3' : 'Q2'} kind="disconnector" />

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
            fill="#FFFFFF"
            stroke={colorSN}
            strokeWidth={2}
            data-testid={`station-sn-port-${stationId}-${item.role}`}
            data-sld-port-role={isSnExit ? 'BAY_SN_OUT' : 'BAY_SN_IN'}
            data-voltage-domain="SN"
          />
        </>
      )}

      {isLineField(item.role) && (
        <g data-sld-role="field-earthing-branch" data-voltage-domain="SN">
          <line x1={conductorX} y1={item.bottomY - 12} x2={conductorX + 34} y2={item.bottomY - 12} stroke={colorSN} strokeWidth={1.7} />
          <line x1={conductorX + 34} y1={item.bottomY - 12} x2={conductorX + 34} y2={item.bottomY + 14} stroke={colorSN} strokeWidth={1.7} />
          <DeviceBox x={conductorX + 34} y={item.bottomY + 28} label="Q3" kind="earthing" closed={false} />
          {renderGroundSymbol(conductorX + 34, item.bottomY + 45, colorSN)}
        </g>
      )}

      {isTransformer && (
        <line
          x1={conductorX}
          y1={item.bottomY}
          x2={conductorX}
          y2={item.bottomY + 38}
          stroke={colorSN}
          strokeWidth={STATION_INTERNAL_STROKE}
          data-sld-port-role="BAY_SN_TRANSFORMER"
          data-voltage-domain="SN"
        />
      )}

      <text
        x={conductorX}
        y={item.busY - 22}
        textAnchor="middle"
        className="sld-label-params"
        fill="#111827"
      >
        {stationRoleLabel(item.role)}
      </text>
      {showTechnicalLabels && (
        <text
          x={conductorX}
          y={exitY + 18}
          textAnchor="middle"
          className="sld-label-params"
          fill="#475569"
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
      data-element-name={field.stationId}
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
        fill="#0F172A"
      >
        {field.stationId}
      </text>
      <text x={labelX} y={titleY + 14} textAnchor="middle" className="sld-label-params" fill="#334155">
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
        {layout.fields.map((item) => renderSnField(item, field.stationId, colorSN, showFieldLabels))}
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
                  {feeder.designation} {feeder.power_kW}kW
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
          {field.apparatus.map((item, index) => (
            <text
              key={`${item.designation}-params`}
              x={layout.bounds.x + layout.bounds.width + 14}
              y={layout.bounds.y + 64 + index * 13}
              className="sld-label-params"
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
