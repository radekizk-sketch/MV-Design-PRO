import React, { useMemo } from 'react';
import type { StationFieldAnnotationV1 } from './core/layoutResult';
import { computeBayLayout } from './core/bayRenderer';
import { JunctionDot } from './symbols/JunctionDot';
import { CanonicalSymbol } from './CanonicalSymbolRenderer';
import {
  STATION_INTERNAL_STROKE,
  NN_BUSBAR_WIDTH,
} from './IndustrialAesthetics';
import { CANONICAL_VOLTAGE_COLORS, DER_FEEDER_COLORS } from './sldCanonicalStyle';
import {
  DEFAULT_FIELD_BLOCK_PALETTE,
  StationBlockLayoutSvg,
  type StationBlockDeviceVisual,
  type StationBlockPalette,
} from '../field/StationBlockLayoutSvg';
import { formatStationTypeLabelPl } from '../shared/stationTypeLabels';

export interface FieldBlockRendererProps {
  field: StationFieldAnnotationV1;
  colorSN?: string;
  colorNN?: string;
  showTechnicalLabels?: boolean;
}

const SYMBOL_SIZE = 28;

function buildCanonicalFieldPalette(color: string): StationBlockPalette {
  return {
    ...DEFAULT_FIELD_BLOCK_PALETTE,
    busbar: color,
    connection: color,
    cableMarker: color,
  };
}

export interface CanonicalFieldBlockSvgProps {
  detail: Parameters<typeof computeBayLayout>[0];
  layout: ReturnType<typeof computeBayLayout>;
  color: string;
  resolveDeviceVisual?: (deviceId: string) => StationBlockDeviceVisual | null | undefined;
  showFieldLabels?: boolean;
  showCableExitMarkers?: boolean;
}

export const CanonicalFieldBlockSvg: React.FC<CanonicalFieldBlockSvgProps> = ({
  detail,
  layout,
  color,
  resolveDeviceVisual,
  showFieldLabels = false,
  showCableExitMarkers = true,
}) => (
  <StationBlockLayoutSvg
    detail={detail}
    layout={layout}
    palette={buildCanonicalFieldPalette(color)}
    resolveDeviceVisual={resolveDeviceVisual}
    showBusSectionLabels={false}
    showBusbarEndCaps={false}
    showFieldLabels={showFieldLabels}
    showCableExitMarkers={showCableExitMarkers}
  />
);

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

export const FieldBlockRenderer: React.FC<FieldBlockRendererProps> = ({
  field,
  colorSN = CANONICAL_VOLTAGE_COLORS.SN,
  colorNN = CANONICAL_VOLTAGE_COLORS.nN,
  showTechnicalLabels = false,
}) => {
  const baseX = field.apparatus[0]?.position.x ?? 0;
  const baseY = field.apparatus[0]?.position.y ?? 0;
  const stationTypeLabel = formatStationTypeLabelPl(field.stationType);
  const block = field.detail ?? null;

  const snBounds = useMemo(
    () => ({
      x: baseX - 84,
      y: baseY - 28,
      width: 168,
      height: 164,
    }),
    [baseX, baseY],
  );

  const snLayout = useMemo(
    () => (block ? computeBayLayout(block, snBounds) : null),
    [block, snBounds],
  );
  if (!block || !snLayout) {
    return null;
  }
  const nnY = snLayout.totalBounds.y + snLayout.totalBounds.height + 34;
  const stationHeight = Math.max(nnY - (baseY - 48) + 86, 240);
  const stationWidth = 320;

  return (
    <g
      data-sld-role="station-field"
      data-station-id={field.stationId}
      data-station-type={field.stationType}
      data-element-id={field.stationId}
      data-element-type="Station"
      data-element-name={field.stationId}
    >
      <rect
        x={baseX - stationWidth / 2}
        y={baseY - 48}
        width={stationWidth}
        height={stationHeight}
        rx={6}
        ry={6}
        fill="rgba(248, 250, 252, 0.88)"
        stroke="#94A3B8"
        strokeWidth={1.2}
      />

      <rect
        x={snBounds.x - 12}
        y={snBounds.y - 8}
        width={snBounds.width + 24}
        height={snBounds.height + 16}
        rx={4}
        ry={4}
        fill="rgba(255, 255, 255, 0.4)"
        stroke="#94A3B8"
        strokeWidth={0.7}
        strokeDasharray="4 2"
        data-sld-role="station-sn-section"
      />

      <text x={baseX} y={baseY - 30} textAnchor="middle" className="sld-label-station-title">
        {field.stationId}
      </text>
      <text x={baseX} y={baseY - 18} textAnchor="middle" className="sld-label-params">
        {stationTypeLabel}
      </text>

      <CanonicalFieldBlockSvg
        detail={block}
        layout={snLayout}
        color={colorSN}
      />

      {showTechnicalLabels && (
        <>
          {field.apparatus.map((item, index) => (
            <text
              key={`${item.designation}-params`}
              x={snBounds.x + snBounds.width + 24}
              y={snBounds.y + 30 + index * 13}
              className="sld-label-params"
              opacity={0.7}
            >
              {item.designation}: {formatParams(item.parameters)}
            </text>
          ))}
          {field.protection.map((relay, index) => (
            <text
              key={`${relay.designation}-params`}
              x={snBounds.x - 56}
              y={snBounds.y + snBounds.height + 14 + index * 12}
              className="sld-label-params"
              opacity={0.7}
            >
              {relay.function} {relay.setting_Ir_A}A {relay.setting_t_s}s
            </text>
          ))}
        </>
      )}

      {field.nnBusbar && (
        <g data-sld-role="nn-busbar">
          <rect
            x={baseX - NN_BUSBAR_WIDTH / 2 - 12}
            y={nnY - 18}
            width={NN_BUSBAR_WIDTH + 24}
            height={44}
            rx={3}
            ry={3}
            fill="rgba(255, 255, 255, 0.4)"
            stroke="#94A3B8"
            strokeWidth={0.7}
            strokeDasharray="4 2"
            data-sld-role="station-nn-section"
          />
          <text
            x={baseX - NN_BUSBAR_WIDTH / 2}
            y={nnY - 6}
            className="sld-label-params"
            opacity={0.7}
          >
            nN
          </text>

          <line
            x1={baseX}
            y1={snLayout.totalBounds.y + snLayout.totalBounds.height - 10}
            x2={baseX}
            y2={nnY}
            stroke={colorNN}
            strokeWidth={STATION_INTERNAL_STROKE}
          />
          <line
            x1={baseX - NN_BUSBAR_WIDTH / 2}
            y1={nnY}
            x2={baseX + NN_BUSBAR_WIDTH / 2}
            y2={nnY}
            stroke={colorNN}
            strokeWidth={4}
            strokeLinecap="round"
          />

          {field.nnBusbar.feeders.map((feeder, feederIndex) => {
            const feederCount = field.nnBusbar.feeders.length;
            const feederSpacing = NN_BUSBAR_WIDTH / (feederCount + 1);
            const feederX = baseX - NN_BUSBAR_WIDTH / 2 + (feederIndex + 1) * feederSpacing;
            const feederColor = derFeederColor(feeder.type, colorNN);

            return (
              <g key={feeder.designation} data-sld-role="nn-feeder" data-feeder-type={feeder.type}>
                <JunctionDot x={feederX} y={nnY} color={colorNN} />
                <line
                  x1={feederX}
                  y1={nnY}
                  x2={feederX}
                  y2={nnY + 30}
                  stroke={feederColor}
                  strokeWidth={STATION_INTERNAL_STROKE}
                />
                <g transform={`translate(${feederX - SYMBOL_SIZE / 2}, ${nnY + 18})`}>
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
                  y={nnY + 58}
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
            x={baseX + NN_BUSBAR_WIDTH / 2 + 8}
            y={nnY + 4}
            className="sld-label-params"
          >
            {field.nnBusbar.voltageKV}kV
          </text>
        </g>
      )}
    </g>
  );
};
