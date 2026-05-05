/**
 * StationInternalView — wewnętrzny SLD stacji (PR-6).
 *
 * Otwierany przez double-click stacji. Renderuje:
 * - Szynę SN stacji
 * - Pola SN (z aparatami)
 * - Transformator(y) SN/nN
 * - Rozdzielnice nN (jeden lub wiele poziomów — multi-voltage)
 *
 * Brief 2 §7 — 3 tryby (zewnętrzny / wewnętrzny / mieszany inline).
 */

import {
  COLOR_LINE_PRIMARY,
  COLOR_PANEL,
  COLOR_PANEL_RAISED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_SANS,
  FONT_SIZES,
  STROKE_BUSBAR_PX,
} from '../theme/tokens';
import { BayRenderer } from '../renderer/BayRenderer';
import type { DeviceRendererProps } from '../renderer/DeviceRenderer';

export interface InternalBayDescriptor {
  readonly bayId: string;
  readonly designation: string;
  readonly bayRole: 'IN' | 'OUT' | 'TR' | 'COUPLER' | 'FEEDER' | 'MEASUREMENT' | 'OZE';
  readonly devices: readonly Omit<DeviceRendererProps, 'x' | 'y'>[];
}

export interface InternalTransformerDescriptor {
  readonly transformerId: string;
  readonly designation: string;
  readonly snMva: number;
  readonly uhvKv: number;
  readonly ulvKv: number;
}

export interface InternalNnSwitchgearDescriptor {
  readonly designation: string;
  readonly nnVoltageKv: number;
  readonly feedersCount: number;
}

export interface StationInternalViewProps {
  readonly substationId: string;
  readonly name: string;
  readonly topologicalType: 'końcowa' | 'przelotowa' | 'odgałęźna' | 'sekcyjna';
  readonly constructionType?: 'wnetrzowa' | 'kontenerowa' | 'slupowa' | 'prefabrykowana' | 'inna' | null;
  readonly snVoltageKv: number;
  readonly nnVoltageLevels: readonly number[];
  readonly bays: readonly InternalBayDescriptor[];
  readonly transformers: readonly InternalTransformerDescriptor[];
  readonly nnSwitchgears: readonly InternalNnSwitchgearDescriptor[];
  readonly width: number;
  readonly height: number;
  readonly onClose?: () => void;
  readonly onSelectBay?: (bayId: string) => void;
  readonly onSelectTransformer?: (transformerId: string) => void;
}

const SN_BUSBAR_Y = 100;
const BAY_PITCH = 140;
const BAY_START_X = 80;
const TRANSFORMER_Y = 380;
const NN_BUSBAR_Y = 480;

const CONSTRUCTION_TYPE_LABELS: Record<NonNullable<StationInternalViewProps['constructionType']>, string> = {
  wnetrzowa: 'wnętrzowa',
  kontenerowa: 'kontenerowa',
  slupowa: 'słupowa',
  prefabrykowana: 'prefabrykowana',
  inna: 'inna',
};

export function StationInternalView(props: StationInternalViewProps): JSX.Element {
  const {
    substationId, name, topologicalType, constructionType,
    snVoltageKv, nnVoltageLevels, bays, transformers, nnSwitchgears,
    width, height, onClose, onSelectBay, onSelectTransformer,
  } = props;

  const snBusbarWidth = Math.max(BAY_PITCH * Math.max(bays.length, 1), 400);
  const transformerBay = bays.findIndex((b) => b.bayRole === 'TR');

  return (
    <svg
      data-testid={`sld-v2-station-internal-${substationId}`}
      data-element-kind="station_internal"
      data-station-id={substationId}
      width={width}
      height={height}
      style={{ background: COLOR_PANEL }}
    >
      {/* Header */}
      <g>
        <rect width={width} height={48} fill={COLOR_PANEL_RAISED} />
        <text x={16} y={20} fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={FONT_SIZES.switchgearParams} fontWeight={700}>
          {name}
        </text>
        <text x={16} y={40} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_SANS} fontSize={FONT_SIZES.technicalPanel}>
          Typ topologiczny: {topologicalType}
          {constructionType && ` • Konstrukcja: ${CONSTRUCTION_TYPE_LABELS[constructionType]}`}
          {' • Napięcie SN: '}{snVoltageKv} kV
          {nnVoltageLevels.length > 0 && ` • Poziomy nN: ${nnVoltageLevels.join(' / ')} kV`}
        </text>
        {onClose && (
          <g transform={`translate(${width - 40}, 12)`} style={{ cursor: 'pointer' }} onClick={onClose}>
            <rect width={28} height={24} fill="transparent" />
            <text x={14} y={17} textAnchor="middle" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={20} fontWeight={700}>
              ×
            </text>
          </g>
        )}
      </g>

      {/* Sekcja SN: szyna + pola */}
      <g transform={`translate(0, 60)`}>
        {/* Szyna SN */}
        <line
          x1={BAY_START_X}
          y1={SN_BUSBAR_Y}
          x2={BAY_START_X + snBusbarWidth}
          y2={SN_BUSBAR_Y}
          stroke="#FFD400"
          strokeWidth={STROKE_BUSBAR_PX}
        />
        <text x={16} y={SN_BUSBAR_Y - 10} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_SANS} fontSize={FONT_SIZES.technicalPanel}>
          Szyna SN
        </text>

        {/* Pola SN */}
        {bays.map((b, i) => (
          <BayRenderer
            key={b.bayId}
            id={b.bayId}
            x={BAY_START_X + i * BAY_PITCH}
            y={SN_BUSBAR_Y}
            designation={b.designation}
            devices={b.devices}
            showQLabels={true}
            onClick={onSelectBay}
          />
        ))}

        {/* Transformator(y) — pod polem TR */}
        {transformers.map((t, i) => {
          const tX = transformerBay >= 0
            ? BAY_START_X + transformerBay * BAY_PITCH + (transformers.length > 1 ? (i - 0.5) * 60 : 0)
            : BAY_START_X + 100 + i * 100;
          return (
            <g
              key={t.transformerId}
              data-testid={`sld-v2-transformer-${t.transformerId}`}
              transform={`translate(${tX}, ${TRANSFORMER_Y})`}
              onClick={onSelectTransformer ? (e) => { e.stopPropagation(); onSelectTransformer(t.transformerId); } : undefined}
              style={{ cursor: onSelectTransformer ? 'pointer' : 'default' }}
            >
              {/* 2 okręgi (kanon §5 pkt 20) */}
              <circle cx={0} cy={-12} r={14} fill="none" stroke={COLOR_LINE_PRIMARY} strokeWidth={2} />
              <circle cx={0} cy={12} r={14} fill="none" stroke={COLOR_LINE_PRIMARY} strokeWidth={2} />
              <text x={20} y={-5} fontSize={FONT_SIZES.deviceQ} fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontWeight={600}>
                {t.designation}
              </text>
              <text x={20} y={10} fontSize={FONT_SIZES.technicalPanel} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_SANS}>
                {t.snMva.toFixed(1)} MVA
              </text>
              <text x={20} y={24} fontSize={FONT_SIZES.technicalPanel} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_SANS}>
                {t.uhvKv}/{t.ulvKv} kV
              </text>
            </g>
          );
        })}

        {/* Rozdzielnice nN */}
        {nnSwitchgears.map((sw, i) => (
          <g key={sw.designation} transform={`translate(0, ${NN_BUSBAR_Y + i * 80})`}>
            <line
              x1={BAY_START_X}
              y1={0}
              x2={BAY_START_X + snBusbarWidth}
              y2={0}
              stroke="#3FA9F5"
              strokeWidth={STROKE_BUSBAR_PX}
            />
            <text x={16} y={-10} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_SANS} fontSize={FONT_SIZES.technicalPanel}>
              {sw.designation}
            </text>
            <text x={16} y={4} fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={FONT_SIZES.technicalPanel} fontWeight={500}>
              {sw.nnVoltageKv} kV • {sw.feedersCount} odpływ.
            </text>
            {/* Odpływy nN — proste pionowe linie */}
            {Array.from({ length: sw.feedersCount }).map((_, fi) => {
              const fx = BAY_START_X + 60 + fi * 80;
              return (
                <line
                  key={fi}
                  x1={fx}
                  y1={0}
                  x2={fx}
                  y2={30}
                  stroke={COLOR_LINE_PRIMARY}
                  strokeWidth={1.5}
                />
              );
            })}
          </g>
        ))}
      </g>
    </svg>
  );
}
