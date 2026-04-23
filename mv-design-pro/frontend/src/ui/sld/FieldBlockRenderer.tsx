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

function CornerBracketFrame({
  x,
  y,
  width,
  height,
  stroke,
  corner = 14,
  dash = '5 4',
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  corner?: number;
  dash?: string;
}) {
  const x2 = x + width;
  const y2 = y + height;

  return (
    <g opacity={0.85}>
      <path d={`M ${x + corner} ${y} H ${x} V ${y + corner}`} fill="none" stroke={stroke} strokeWidth={1} strokeDasharray={dash} />
      <path d={`M ${x2 - corner} ${y} H ${x2} V ${y + corner}`} fill="none" stroke={stroke} strokeWidth={1} strokeDasharray={dash} />
      <path d={`M ${x + corner} ${y2} H ${x} V ${y2 - corner}`} fill="none" stroke={stroke} strokeWidth={1} strokeDasharray={dash} />
      <path d={`M ${x2 - corner} ${y2} H ${x2} V ${y2 - corner}`} fill="none" stroke={stroke} strokeWidth={1} strokeDasharray={dash} />
    </g>
  );
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
  const snEnvelope = {
    x: snBounds.x - 10,
    y: snBounds.y - 10,
    width: snBounds.width + 20,
    height: snBounds.height + 20,
  };
  const nnEnvelope = {
    x: baseX - NN_BUSBAR_WIDTH / 2 - 16,
    y: nnY - 14,
    width: NN_BUSBAR_WIDTH + 32,
    height: 40,
  };
  const titleBandHalfWidth = Math.max(snEnvelope.width / 2 + 26, 108);

  return (
    <g
      data-sld-role="station-field"
      data-station-id={field.stationId}
      data-station-type={field.stationType}
      data-element-id={field.stationId}
      data-element-type="Station"
      data-element-name={field.stationId}
    >
      <g data-sld-role="station-title-band" opacity={0.9}>
        <line
          x1={baseX - titleBandHalfWidth}
          y1={baseY - 40}
          x2={baseX - 42}
          y2={baseY - 40}
          stroke="#94A3B8"
          strokeWidth={1}
          strokeDasharray="6 4"
        />
        <line
          x1={baseX + 42}
          y1={baseY - 40}
          x2={baseX + titleBandHalfWidth}
          y2={baseY - 40}
          stroke="#94A3B8"
          strokeWidth={1}
          strokeDasharray="6 4"
        />
        <circle cx={baseX - titleBandHalfWidth - 10} cy={baseY - 40} r={3} fill={colorSN} />
      </g>

      <text x={baseX} y={baseY - 30} textAnchor="middle" className="sld-label-station-title">
        {field.stationId}
      </text>
      <text x={baseX} y={baseY - 18} textAnchor="middle" className="sld-label-params">
        {stationTypeLabel}
      </text>

      <g data-sld-role="station-sn-section">
        <CornerBracketFrame
          x={snEnvelope.x}
          y={snEnvelope.y}
          width={snEnvelope.width}
          height={snEnvelope.height}
          stroke="#94A3B8"
        />

        <text
          x={snEnvelope.x + snEnvelope.width + 8}
          y={snEnvelope.y + 10}
          className="sld-label-params"
          opacity={0.8}
        >
          Sekcja SN
        </text>

        <CanonicalFieldBlockSvg
          detail={block}
          layout={snLayout}
          color={colorSN}
        />
      </g>

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
        <g data-sld-role="station-nn-section">
          <CornerBracketFrame
            x={nnEnvelope.x}
            y={nnEnvelope.y}
            width={nnEnvelope.width}
            height={nnEnvelope.height}
            stroke={colorNN}
            corner={10}
            dash="4 3"
          />
          <text
            x={nnEnvelope.x}
            y={nnEnvelope.y - 6}
            className="sld-label-params"
            opacity={0.8}
          >
            Sekcja nN
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
