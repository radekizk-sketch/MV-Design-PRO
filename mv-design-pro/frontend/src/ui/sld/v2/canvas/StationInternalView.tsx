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
  COLOR_BUS_LV,
  COLOR_DEVICE_CLOSED,
  COLOR_DEVICE_CLOSED_BORDER,
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

export interface InternalDerDescriptor {
  readonly derId: string;
  readonly kind: 'PV' | 'BESS' | 'FW';
  readonly connectionSide: 'nn' | 'sn' | 'dedicated';
  readonly count?: number;
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
  readonly ders?: readonly InternalDerDescriptor[];
  readonly width: number;
  readonly height: number;
  readonly onClose?: () => void;
  readonly onSelectBay?: (bayId: string) => void;
  readonly onSelectTransformer?: (transformerId: string) => void;
}

const SN_BUSBAR_Y = 100;
const BAY_PITCH = 140;
const BAY_START_X = 80;
const TRANSFORMER_Y = 315;
const NN_BUSBAR_Y = 405;
const BAY_PANEL_WIDTH = 54;
const BAY_PANEL_HEIGHT = 214;
const COLOR_DER_PV = '#FFC857';

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
    snVoltageKv, nnVoltageLevels, bays, transformers, nnSwitchgears, ders = [],
    width, height, onClose, onSelectBay, onSelectTransformer,
  } = props;

  const effectiveBays = normalizeStationInternalBays(substationId, topologicalType, bays, onSelectBay);
  const effectiveNnSwitchgears = nnSwitchgears.length > 0
    ? nnSwitchgears
    : nnVoltageLevels.map((voltage) => ({
        designation: `Rozdzielnica nN ${voltage} kV`,
        nnVoltageKv: voltage,
        feedersCount: ders.some((der) => der.connectionSide === 'nn') ? 2 : 1,
      }));
  const hasPvAfterNn = ders.some((der) => der.kind === 'PV' && der.connectionSide === 'nn');
  const snBusbarWidth = Math.max(BAY_PITCH * Math.max(effectiveBays.length, 1), 520);
  const transformerBay = effectiveBays.findIndex((b) => b.bayRole === 'TR');
  const transformerX = transformerBay >= 0 ? BAY_START_X + transformerBay * BAY_PITCH : BAY_START_X + 2 * BAY_PITCH;
  const contentHeight = Math.max(height, 620);

  return (
    <svg
      data-testid={`sld-v2-station-internal-${substationId}`}
      data-element-kind="station_internal"
      data-station-id={substationId}
      width={width}
      height={contentHeight}
      viewBox={`0 0 ${width} ${contentHeight}`}
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
          stroke={COLOR_BUS_LV}
          strokeWidth={STROKE_BUSBAR_PX}
          data-parity-key="station.internal.bus.sn"
        />
        <text x={16} y={SN_BUSBAR_Y - 10} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_SANS} fontSize={FONT_SIZES.technicalPanel}>
          Szyna SN
        </text>

        {/* Pola SN */}
        {effectiveBays.map((b, i) => {
          const bayX = BAY_START_X + i * BAY_PITCH;
          const isTransformerBay = b.bayRole === 'TR' || b.bayRole === 'OZE';
          return (
            <g key={b.bayId}>
              <rect
                x={bayX - BAY_PANEL_WIDTH / 2}
                y={SN_BUSBAR_Y - 30}
                width={BAY_PANEL_WIDTH}
                height={BAY_PANEL_HEIGHT}
                rx={2}
                fill={isTransformerBay ? '#253036' : '#24282c'}
                opacity={0.88}
                data-parity-key={`station.internal.bay.panel.${b.bayRole.toLowerCase()}`}
              />
              <BayRenderer
                id={b.bayId}
                x={bayX}
                y={SN_BUSBAR_Y}
                designation={b.designation}
                devices={b.devices}
                showQLabels={true}
                onClick={onSelectBay}
              />
            </g>
          );
        })}

        <text
          x={BAY_START_X + snBusbarWidth - 12}
          y={SN_BUSBAR_Y - 10}
          textAnchor="end"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.technicalPanel}
        >
          Pola: WE / WY / TR
        </text>

        <line
          x1={transformerX}
          y1={TRANSFORMER_Y + 28}
          x2={transformerX}
          y2={NN_BUSBAR_Y}
          stroke={COLOR_LINE_PRIMARY}
          strokeWidth={1.8}
          data-parity-key="station.internal.transformer.to.nn"
        />

        {/* Transformator(y) — pod polem TR */}
        {transformers.length > 0 ? transformers.map((t, i) => {
          const tX = transformerBay >= 0
            ? transformerX + (transformers.length > 1 ? (i - 0.5) * 60 : 0)
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
        }) : (
          <FallbackTransformer
            x={transformerX}
            y={TRANSFORMER_Y}
            substationId={substationId}
            onSelectTransformer={onSelectTransformer}
          />
        )}

        {/* Rozdzielnice nN */}
        {effectiveNnSwitchgears.map((sw, i) => (
          <g key={sw.designation} transform={`translate(0, ${NN_BUSBAR_Y + i * 80})`}>
            <line
              x1={BAY_START_X}
              y1={0}
              x2={BAY_START_X + snBusbarWidth}
              y2={0}
              stroke="#3FA9F5"
              strokeWidth={STROKE_BUSBAR_PX}
              data-parity-key="station.internal.bus.nn"
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
              const breakerId = `${substationId}/nn/${sw.designation}/breaker/${fi + 1}`;
              return (
                <g
                  key={fi}
                  data-testid={`station-internal-nn-breaker-${fi + 1}`}
                  data-element-kind="lv_breaker"
                  data-element-id={breakerId}
                  data-symbol-canon="circuit_breaker_square"
                  onClick={onSelectBay ? (event) => { event.stopPropagation(); onSelectBay(breakerId); } : undefined}
                  style={{ cursor: onSelectBay ? 'pointer' : 'default' }}
                >
                  <line x1={fx} y1={0} x2={fx} y2={46} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.5} />
                  <rect
                    x={fx - 7}
                    y={18}
                    width={14}
                    height={14}
                    fill={COLOR_DEVICE_CLOSED}
                    stroke={COLOR_DEVICE_CLOSED_BORDER}
                    strokeWidth={1.4}
                    data-symbol-canon="circuit_breaker_square"
                  />
                  <text x={fx} y={14} textAnchor="middle" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={FONT_SIZES.deviceQ} fontWeight={700}>
                    Q{fi + 1}
                  </text>
                </g>
              );
            })}
          </g>
        ))}

        {hasPvAfterNn && (
          <PvAfterNnInternalView
            substationId={substationId}
            x={BAY_START_X + snBusbarWidth / 2}
            y={NN_BUSBAR_Y + effectiveNnSwitchgears.length * 80 + 14}
            onSelect={onSelectBay}
          />
        )}
      </g>
    </svg>
  );
}

function normalizeStationInternalBays(
  substationId: string,
  topologicalType: StationInternalViewProps['topologicalType'],
  bays: readonly InternalBayDescriptor[],
  onSelectBay?: (bayId: string) => void,
): InternalBayDescriptor[] {
  const baseBays = bays.length > 0 ? bays : buildFallbackBays(substationId, topologicalType);
  return baseBays.map((bay) => ({
    ...bay,
    devices: bay.devices.length > 0 ? withDeviceClicks(bay.devices, onSelectBay) : defaultDevicesForBay(bay, onSelectBay),
  }));
}

function buildFallbackBays(
  substationId: string,
  topologicalType: StationInternalViewProps['topologicalType'],
): InternalBayDescriptor[] {
  const normalizedType = String(topologicalType).toLowerCase();
  const roles: InternalBayDescriptor['bayRole'][] = normalizedType.includes('odga')
    ? ['IN', 'OUT', 'FEEDER', 'TR']
    : normalizedType.includes('przelot') || normalizedType.includes('sekcyj')
      ? ['IN', 'OUT', 'TR']
      : ['IN', 'TR'];
  return roles.map((role, index) => ({
    bayId: `${substationId}/internal-bay/${role.toLowerCase()}-${index + 1}`,
    designation: role === 'IN' ? 'WE' : role === 'OUT' ? 'WY' : role === 'FEEDER' ? 'ODG' : 'TR',
    bayRole: role,
    devices: [],
  }));
}

function withDeviceClicks(
  devices: readonly Omit<DeviceRendererProps, 'x' | 'y'>[],
  onSelectBay?: (bayId: string) => void,
): readonly Omit<DeviceRendererProps, 'x' | 'y'>[] {
  return devices.map((device) => ({
    ...device,
    onClick: device.onClick ?? onSelectBay,
  }));
}

function defaultDevicesForBay(
  bay: InternalBayDescriptor,
  onSelectBay?: (bayId: string) => void,
): readonly Omit<DeviceRendererProps, 'x' | 'y'>[] {
  const makeDevice = (
    suffix: string,
    kind: DeviceRendererProps['kind'],
    designationQ: string,
    state: DeviceRendererProps['state'] = 'closed',
  ): Omit<DeviceRendererProps, 'x' | 'y'> => ({
    id: `${bay.bayId}/${suffix}`,
    kind,
    designationQ,
    state,
    onClick: onSelectBay,
  });

  if (bay.bayRole === 'TR') {
    return [
      makeDevice('switch-disconnector', 'SWITCH_DISCONNECTOR', 'Q1'),
      makeDevice('fuse', 'FUSE', 'F1'),
      makeDevice('earthing-switch', 'ES', 'Q8', 'open'),
      makeDevice('transformer-device', 'TRANSFORMER_DEVICE', 'TR'),
    ];
  }
  if (bay.bayRole === 'COUPLER') {
    return [
      makeDevice('disconnector-a', 'DS_BUS', 'Q1'),
      makeDevice('breaker', 'CB', 'Q0'),
      makeDevice('disconnector-b', 'DS_LINE', 'Q2'),
    ];
  }
  if (bay.bayRole === 'MEASUREMENT') {
    return [
      makeDevice('disconnector', 'DS_BUS', 'Q1'),
      makeDevice('vt', 'VT', 'PU'),
      makeDevice('earthing-switch', 'ES', 'Q8', 'open'),
    ];
  }
  return [
    makeDevice('switch-disconnector', 'SWITCH_DISCONNECTOR', 'Q1'),
    makeDevice('earthing-switch', 'ES', 'Q8', 'open'),
    makeDevice('cable-head', 'CABLE_HEAD', 'K'),
  ];
}

interface FallbackTransformerProps {
  readonly x: number;
  readonly y: number;
  readonly substationId: string;
  readonly onSelectTransformer?: (transformerId: string) => void;
}

function FallbackTransformer(props: FallbackTransformerProps): JSX.Element {
  const transformerId = `${props.substationId}/transformer/sn-nn`;
  return (
    <g
      data-testid={`sld-v2-transformer-${transformerId}`}
      data-element-kind="transformer_sn_nn"
      data-element-id={transformerId}
      transform={`translate(${props.x}, ${props.y})`}
      onClick={props.onSelectTransformer ? (event) => { event.stopPropagation(); props.onSelectTransformer?.(transformerId); } : undefined}
      style={{ cursor: props.onSelectTransformer ? 'pointer' : 'default' }}
    >
      <circle cx={-10} cy={0} r={16} fill="none" stroke={COLOR_LINE_PRIMARY} strokeWidth={2} />
      <circle cx={10} cy={0} r={16} fill="none" stroke={COLOR_LINE_PRIMARY} strokeWidth={2} />
      <text x={0} y={32} textAnchor="middle" fontSize={FONT_SIZES.technicalPanel} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_SANS}>
        Transformator SN/nN - brak danych katalogowych
      </text>
    </g>
  );
}

interface PvAfterNnInternalViewProps {
  readonly substationId: string;
  readonly x: number;
  readonly y: number;
  readonly onSelect?: (elementId: string) => void;
}

function PvAfterNnInternalView(props: PvAfterNnInternalViewProps): JSX.Element {
  const feederXs = [-36, 36];
  const pccId = `${props.substationId}/pv/nn-pcc`;
  return (
    <g
      data-testid={`station-internal-pv-nn-${props.substationId}`}
      data-parity-key="station.internal.pv.nn_connection"
      data-element-kind="pv_nn_connection_tree"
      transform={`translate(${props.x}, ${props.y})`}
    >
      <rect x={-112} y={-12} width={224} height={116} fill="transparent" stroke={COLOR_DER_PV} strokeDasharray="8 8" strokeWidth={1.2} />
      <line x1={-72} y1={0} x2={72} y2={0} stroke={COLOR_DER_PV} strokeWidth={2.4} />
      <g
        data-element-kind="pcc"
        data-element-id={pccId}
        onClick={props.onSelect ? (event) => { event.stopPropagation(); props.onSelect?.(pccId); } : undefined}
        style={{ cursor: props.onSelect ? 'pointer' : 'default' }}
      >
        <circle cx={0} cy={0} r={5} fill={COLOR_DER_PV} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
        <title>Punkt przyłączenia PV po stronie nN</title>
      </g>
      {feederXs.map((x, index) => {
        const breakerId = `${props.substationId}/pv/nn-breaker/Q${index + 1}`;
        const protectionId = `${props.substationId}/pv/protection/e2tango/Q${index + 1}`;
        const inverterId = `${props.substationId}/pv/inverter/${index + 1}`;
        return (
          <g key={breakerId}>
            <line x1={x} y1={0} x2={x} y2={74} stroke={COLOR_DER_PV} strokeWidth={1.8} />
            <g
              data-testid={`station-internal-pv-nn-breaker-${index + 1}`}
              data-element-kind="lv_breaker"
              data-element-id={breakerId}
              data-symbol-canon="circuit_breaker_square"
              onClick={props.onSelect ? (event) => { event.stopPropagation(); props.onSelect?.(breakerId); } : undefined}
              style={{ cursor: props.onSelect ? 'pointer' : 'default' }}
            >
              <rect x={x - 8} y={22} width={16} height={16} fill={COLOR_DEVICE_CLOSED} stroke={COLOR_DEVICE_CLOSED_BORDER} strokeWidth={1.4} />
              <text x={x} y={18} textAnchor="middle" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={FONT_SIZES.deviceQ} fontWeight={700}>
                Q{index + 1}
              </text>
            </g>
            <g
              data-testid={`station-internal-pv-protection-${index + 1}`}
              data-element-kind="protection_relay"
              data-element-id={protectionId}
              data-protected-ref={breakerId}
              onClick={props.onSelect ? (event) => { event.stopPropagation(); props.onSelect?.(protectionId); } : undefined}
              style={{ cursor: props.onSelect ? 'pointer' : 'default' }}
            >
              <rect x={x - 16} y={42} width={32} height={13} fill="#1d1704" stroke="#d6a21d" strokeWidth={1.2} rx={1} />
              <text x={x} y={51} textAnchor="middle" fill="#ffd166" fontFamily={FONT_SANS} fontSize={8} fontWeight={800}>
                e2TANGO
              </text>
              <title>{`Zabezpieczenie PV e2TANGO-400 dla Q${index + 1}`}</title>
            </g>
            <g
              data-element-kind="pv_inverter"
              data-element-id={inverterId}
              onClick={props.onSelect ? (event) => { event.stopPropagation(); props.onSelect?.(inverterId); } : undefined}
              style={{ cursor: props.onSelect ? 'pointer' : 'default' }}
            >
              <circle cx={x} cy={70} r={13} fill="none" stroke={COLOR_DER_PV} strokeWidth={1.8} />
              <path d={`M ${x - 7} 70 C ${x - 3} 63, ${x + 3} 77, ${x + 7} 70`} fill="none" stroke={COLOR_DER_PV} strokeWidth={1.4} />
            </g>
          </g>
        );
      })}
      <text x={86} y={54} fill={COLOR_DER_PV} fontFamily={FONT_SANS} fontSize={FONT_SIZES.bayLabel} fontWeight={800}>
        PV nN
      </text>
    </g>
  );
}
