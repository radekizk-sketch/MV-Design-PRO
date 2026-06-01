/**
 * OZE source archetype unit (KROK 2, Runda 2a — PV G1-G3).
 *
 * Renders one renewable-source archetype as a responsive 3-level unit, inheriting
 * the T1-T4 contract: ABB symbols (CB=□/LOAD_SWITCH=◇/DS=◯, state by COLOUR),
 * orthogonal routing (90° only), the LOD ladder (L0 shape+state / L1 +direction
 * +labels / L2 +full IEC symbols +protection +CONCISE results at objects). The
 * full White Box derivation stays OFF the canvas (companion data → future panel).
 *
 * OZE-specific (all READ from the FROZEN solvers via the companion — never
 * recomputed, B-01/P-A):
 *   - machine type (IBG / synchronous / asynchronous) + NC RfG control mode at
 *     the source (gate G);
 *   - power hierarchy Pzainst ≥ Pn,AC ≥ Pprzyłącz ≥ Posiągalna + valid flag (gate H);
 *   - protection set as a function of machine type (gate I);
 *   - short-circuit CONTRIBUTION of the source tagged by machine type — IBG is a
 *     bounded current, NOT a synchronous machine (gate J);
 *   - BIDIRECTIONAL flow: generation = reverse export, direction read from the
 *     solver (the PCC incomer points UP toward the grid when exporting).
 */

import {
  COLOR_DEVICE_CLOSED_BORDER,
  COLOR_FIELD_TRUNK_ENERGIZED,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TR_FLOW_DOWN,
  FONT_MONO,
  FONT_SANS,
} from '../theme/tokens';
import { ApparatusCbSquare, ApparatusTransformerSymbol } from '../renderer/GpzApparatusSymbols';
import type { MouseEvent } from 'react';
import type {
  SldOzeArchetypeCompanion,
  OzeVfBus,
  OzeVfBranch,
  OzeScBus,
} from './companions/ozeTypes';
import type { StationDetailLevel } from './geometry';

export interface OzeSourceArchetypeProps {
  readonly companion: SldOzeArchetypeCompanion;
  readonly stationCode: string;
  readonly name: string;
  readonly detail: StationDetailLevel;
  readonly onFieldClick?: (id: string) => void;
  readonly x?: number;
  readonly y?: number;
}

// The canonical branch refs the OZE substrates use for the grid incomer.
const INCOMER_REFS = ['sr/branch/in'];

function busColorForVoltage(kv: number): string {
  if (kv >= 12) return COLOR_FIELD_TRUNK_ENERGIZED;
  if (kv >= 0.2) return '#7DD3FC';
  return COLOR_FIELD_TRUNK_ENERGIZED;
}

/** PV inverter symbol (IEC: ~ over =, in a circle) — orthogonal, state by colour. */
function PvInverterSymbol(props: { cx: number; cy: number; r: number }): JSX.Element {
  const { cx, cy, r } = props;
  return (
    <g data-testid="oze-inverter-symbol" data-symbol-canon="pv_inverter">
      <circle cx={cx} cy={cy} r={r} fill="#0A1622" stroke="#FFB020" strokeWidth={1.6} />
      <path d={`M ${cx - r * 0.5} ${cy - r * 0.25} q ${r * 0.25} -${r * 0.4} ${r * 0.5} 0 t ${r * 0.5} 0`} fill="none" stroke="#FFB020" strokeWidth={1.2} />
      <line x1={cx - r * 0.5} y1={cy + r * 0.3} x2={cx + r * 0.5} y2={cy + r * 0.3} stroke="#FFB020" strokeWidth={1.2} />
    </g>
  );
}

/** Wind Type-4 turbine: full-converter (~ inside the generator circle) + a 3-blade
 *  rotor on top. Rotor blades are a <path> (NOT <line>) so the orthogonality gate,
 *  which only inspects connection <line> segments, stays satisfied. */
function WtgSymbol(props: { cx: number; cy: number; r: number }): JSX.Element {
  const { cx, cy, r } = props;
  return (
    <g data-testid="oze-wtg-symbol" data-symbol-canon="wtg_full_converter">
      <circle cx={cx} cy={cy} r={r} fill="#0A1622" stroke="#FFB020" strokeWidth={1.6} />
      <path d={`M ${cx - r * 0.5} ${cy + r * 0.25} q ${r * 0.25} -${r * 0.4} ${r * 0.5} 0 t ${r * 0.5} 0`} fill="none" stroke="#FFB020" strokeWidth={1.1} />
      {/* rotor: hub mast (vertical line, ok) + 3 blades (path → exempt). */}
      <line x1={cx} y1={cy - r} x2={cx} y2={cy - r - 4} stroke="#FFB020" strokeWidth={1.2} />
      <circle cx={cx} cy={cy - r - 5} r={1.3} fill="#FFB020" />
      <path d={`M ${cx} ${cy - r - 5} l 0 -5 M ${cx} ${cy - r - 5} l 4.3 2.6 M ${cx} ${cy - r - 5} l -4.3 2.6`} fill="none" stroke="#FFB020" strokeWidth={1.1} strokeLinecap="round" />
    </g>
  );
}

/** Reverse-aware vertical flow arrow on the incomer (generation = points UP). */
function FlowArrow(props: { x: number; topY: number; botY: number; direction: 'forward' | 'reverse' | 'none' }): JSX.Element | null {
  const { x, topY, botY, direction } = props;
  if (direction === 'none') return null;
  // Incomer convention: reverse = export to grid (UP); forward = import (DOWN).
  const pointsUp = direction === 'reverse';
  const headY = pointsUp ? topY : botY;
  const tailY = pointsUp ? botY : topY;
  const color = direction === 'reverse' ? COLOR_TR_FLOW_DOWN : COLOR_FIELD_TRUNK_ENERGIZED;
  const headDir = pointsUp ? -1 : 1;
  return (
    <g data-testid="oze-flow-incomer" data-flow-direction={direction} data-flow-points={pointsUp ? 'up' : 'down'} pointerEvents="none">
      <line x1={x} y1={tailY} x2={x} y2={headY} stroke={color} strokeWidth={2.6} strokeLinecap="round" />
      <polygon points={`${x},${headY} ${x - 3.4},${headY - headDir * 5} ${x + 3.4},${headY - headDir * 5}`} fill={color} />
    </g>
  );
}

/** One IEC apparatus glyph by kind — shape = type, state = colour, orthogonal. */
function ApparatusGlyph(props: { kind: string; cx: number; cy: number }): JSX.Element {
  const { kind, cx, cy } = props;
  const g = COLOR_DEVICE_CLOSED_BORDER;
  switch (kind) {
    case 'CB': // wyłącznik □
      return <rect data-symbol-shape="square" x={cx - 5} y={cy - 5} width={10} height={10} rx={1} fill="#0A8D43" stroke={g} strokeWidth={1.5} />;
    case 'LOAD_SWITCH': // rozłącznik ◇
      return <polygon data-symbol-shape="diamond" points={`${cx},${cy - 6} ${cx + 6},${cy} ${cx},${cy + 6} ${cx - 6},${cy}`} fill="#0A8D43" stroke={g} strokeWidth={1.5} />;
    case 'DS': // odłącznik ◯
    case 'ES': // uziemnik ◯ (na gałęzi ziemi)
      return <circle data-symbol-shape="circle" cx={cx} cy={cy} r={5.5} fill="none" stroke={g} strokeWidth={1.5} />;
    case 'CT': // przekładnik prądowy — dwa okręgi na osi
      return (
        <g data-symbol-shape="ct">
          <circle cx={cx} cy={cy - 2.5} r={3.2} fill="none" stroke="#7DD3FC" strokeWidth={1.2} />
          <circle cx={cx} cy={cy + 2.5} r={3.2} fill="none" stroke="#7DD3FC" strokeWidth={1.2} />
        </g>
      );
    case 'VT': // przekładnik napięciowy — trójkąt uzwojeń (gałąź boczna)
      return (
        <g data-symbol-shape="vt">
          <circle cx={cx - 3} cy={cy} r={2.6} fill="none" stroke="#7DD3FC" strokeWidth={1.1} />
          <circle cx={cx + 3} cy={cy} r={2.6} fill="none" stroke="#7DD3FC" strokeWidth={1.1} />
          <circle cx={cx} cy={cy + 3} r={2.6} fill="none" stroke="#7DD3FC" strokeWidth={1.1} />
        </g>
      );
    case 'SURGE_ARRESTER': // ogranicznik — prostokąt z błyskawicą (gałąź boczna)
      return (
        <g data-symbol-shape="surge">
          <rect x={cx - 3} y={cy - 5} width={6} height={10} rx={1} fill="#0A1622" stroke="#FFB020" strokeWidth={1.2} />
          <path d={`M ${cx - 1.5} ${cy - 3} l 2 3 l -2 0 l 2 3`} fill="none" stroke="#FFB020" strokeWidth={1} />
        </g>
      );
    case 'CABLE_HEAD': // głowica kablowa ▲
      return <polygon data-symbol-shape="cable-head" points={`${cx},${cy + 5} ${cx - 4.5},${cy - 3} ${cx + 4.5},${cy - 3}`} fill="none" stroke={g} strokeWidth={1.4} />;
    default:
      return <circle cx={cx} cy={cy} r={3} fill="none" stroke={COLOR_TEXT_MUTED} strokeWidth={1} />;
  }
}

/**
 * Detailed SN field — the full apparatus stack drawn DOWN the field's vertical
 * power axis (busbar→cable: UPSTREAM → MIDSTREAM → DOWNSTREAM), with side branches
 * (OFF_PATH: VT, surge arrester) and the ground branch (ES) drawn laterally, and
 * the POWER-FLOW arrow running THROUGH the stack (direction from the solver). Every
 * apparatus carries a data-source-ref (pinned to the ENM/schematic). Orthogonal.
 */
function ApparatusStack(props: {
  field: SldOzeArchetypeCompanion['fields'][number];
  cx: number;
  topY: number;
  direction: 'forward' | 'reverse' | 'none';
  labelSide?: 'left' | 'right';
  onClick?: (e: MouseEvent) => void;
  /** When set, this field is the OSD LINE: the cable docks to the grid boundary
   *  (ZKSN) at its end, and export flows DOWN the cable toward the OSD. */
  gridBoundary?: SldOzeArchetypeCompanion['boundary'];
}): JSX.Element {
  const { field, cx, topY, direction, labelSide = 'right', onClick, gridBoundary } = props;
  const lx = labelSide === 'right' ? cx + 9 : cx - 9;
  const lAnchor = labelSide === 'right' ? 'start' : 'end';
  const stack = field.apparatus ?? [];
  const onPath = stack.filter((a) => ['UPSTREAM', 'MIDSTREAM', 'DOWNSTREAM'].includes(a.placement));
  const offPath = stack.filter((a) => a.placement === 'OFF_PATH');
  const ground = stack.filter((a) => a.placement === 'GROUND_BRANCH');
  const step = 21;
  const pathBottom = topY + (onPath.length + 1) * step;
  // y of each on-path apparatus.
  const yOf = (i: number) => topY + (i + 1) * step;
  return (
    <g
      data-testid={`oze-field-stack-${field.field_id}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* vertical power axis (the tor mocy) busbar→cable. */}
      <line x1={cx} y1={topY} x2={cx} y2={pathBottom} stroke="#27E0A0" strokeWidth={2} />
      {/* power-flow arrow THROUGH the stack. Normally reverse = export UP to the
          busbar; on the OSD LINE field the OSD is DOWN the cable, so export points
          DOWN (busbar → cable → OSD). */}
      {direction !== 'none' && (() => {
        const up = gridBoundary ? direction === 'forward' : direction === 'reverse';
        const aTop = topY + step * 0.4;
        const aBot = topY + step * 1.4;
        const headY = up ? aTop : aBot;
        const tailY = up ? aBot : aTop;
        const col = direction === 'reverse' ? COLOR_TR_FLOW_DOWN : COLOR_FIELD_TRUNK_ENERGIZED;
        const hd = up ? -1 : 1;
        return (
          <g data-testid={`oze-flow-${field.field_id}`} data-flow-direction={direction} data-flow-points={up ? 'up' : 'down'} pointerEvents="none">
            <line x1={cx - 9} y1={tailY} x2={cx - 9} y2={headY} stroke={col} strokeWidth={2.4} strokeLinecap="round" />
            <polygon points={`${cx - 9},${headY} ${cx - 11.6},${headY - hd * 4.5} ${cx - 6.4},${headY - hd * 4.5}`} fill={col} />
          </g>
        );
      })()}
      {/* on-path apparatus down the axis. */}
      {onPath.map((a, i) => (
        <g key={a.device_ref} data-testid={`oze-app-${field.field_id}-${i}`} data-apparatus-kind={a.kind} data-placement={a.placement} data-source-ref={a.source_ref}>
          <ApparatusGlyph kind={a.kind} cx={cx} cy={yOf(i)} />
          {/* terse label — designation's leading token only (full catalog is in
              the WG SCHEMATU register); keeps the stack legible. */}
          <text x={lx} y={yOf(i) + 2.2} textAnchor={lAnchor} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={5.8} fontWeight={600}>
            {a.designation.replace(/\s*\(.*\)/, '').split(' · ')[0]}
          </text>
        </g>
      ))}
      {/* off-path side branches (VT, surge arrester) — lateral, orthogonal. */}
      {offPath.map((a, i) => {
        const by = yOf(Math.min(i + 1, onPath.length - 1));
        const bx = cx - 18;
        return (
          <g key={a.device_ref} data-testid={`oze-app-${field.field_id}-off-${i}`} data-apparatus-kind={a.kind} data-placement="OFF_PATH" data-source-ref={a.source_ref}>
            <line x1={cx} y1={by} x2={bx} y2={by} stroke="#7DD3FC" strokeWidth={1.2} />
            <ApparatusGlyph kind={a.kind} cx={bx} cy={by + 8} />
            <line x1={bx} y1={by} x2={bx} y2={by + 3} stroke="#7DD3FC" strokeWidth={1.2} />
          </g>
        );
      })}
      {/* ground branch (ES) — lateral + earth ticks. */}
      {ground.map((a) => {
        const gy = pathBottom - step * 0.5;
        const gx = cx + 16;
        return (
          <g key={a.device_ref} data-testid={`oze-app-${field.field_id}-gnd`} data-apparatus-kind="ES" data-placement="GROUND_BRANCH" data-source-ref={a.source_ref}>
            <line x1={cx} y1={gy} x2={gx} y2={gy} stroke={COLOR_TEXT_MUTED} strokeWidth={1.2} />
            <line x1={gx} y1={gy} x2={gx} y2={gy + 5} stroke={COLOR_TEXT_MUTED} strokeWidth={1.2} />
            <line x1={gx - 3.5} y1={gy + 5} x2={gx + 3.5} y2={gy + 5} stroke={COLOR_TEXT_MUTED} strokeWidth={1.2} />
            <line x1={gx - 2.2} y1={gy + 6.6} x2={gx + 2.2} y2={gy + 6.6} stroke={COLOR_TEXT_MUTED} strokeWidth={1} />
          </g>
        );
      })}
      {/* CABLE ENTRY: port on the cable head + cable from the corridor docking to
          it with a 90° elbow from entry_side (axis 7). The cable docks to the PORT
          — never to the middle of the field. Orthogonal; flow continues through. */}
      {field.port && (() => {
        const p = field.port;
        const portY = pathBottom + 6;              // port just below the head
        const drop = 26;                            // vertical run from the port
        const side = p.entry_side;
        const horiz = side === 'BOK-L' ? -34 : side === 'BOK-P' ? 34 : 0;
        const cableColor = direction === 'reverse' ? COLOR_TR_FLOW_DOWN : COLOR_FIELD_TRUNK_ENERGIZED;
        // elbow: port → straight down → (if side) 90° turn toward the corridor.
        const kneeY = portY + drop;
        const endX = cx + horiz;
        return (
          <g data-testid={`oze-port-${field.field_id}`} data-port-kind={p.kind} data-entry-side={side} data-occupied-by={p.occupied_by} data-source-ref={p.source_ref}>
            {/* head → port stub */}
            <line x1={cx} y1={pathBottom} x2={cx} y2={portY} stroke="#27E0A0" strokeWidth={2} />
            {/* port node (square = cable connection point) */}
            <rect x={cx - 3} y={portY - 3} width={6} height={6} rx={0.8} fill="#0A1622" stroke="#9FE6FF" strokeWidth={1.4} />
            {/* cable: vertical drop then 90° elbow toward the corridor (orthogonal) */}
            <line x1={cx} y1={portY + 3} x2={cx} y2={kneeY} stroke={cableColor} strokeWidth={2.2} strokeLinecap="butt" />
            {horiz !== 0 && <line x1={cx} y1={kneeY} x2={endX} y2={kneeY} stroke={cableColor} strokeWidth={2.2} strokeLinecap="butt" />}
            {gridBoundary ? (
              /* OSD LINE: the grid boundary (ZKSN) sits ON this cable — a labelled
                 diamond at its end, then the SIEĆ OSD stub. This IS the single point
                 of connection; there is no separate busbar-edge boundary. */
              <g data-testid="oze-boundary-marker" data-variant={gridBoundary.variant} data-enm-variant={gridBoundary.enm_connection_variant}>
                <polygon points={`${endX},${kneeY - 6} ${endX + 6},${kneeY} ${endX},${kneeY + 6} ${endX - 6},${kneeY}`} fill="#0A1622" stroke="#9FE6FF" strokeWidth={1.6} />
                <line x1={endX} y1={kneeY + 6} x2={endX} y2={kneeY + 15} stroke="#5A6B78" strokeWidth={2.2} strokeDasharray="4 3" />
                <text x={endX} y={kneeY + 24} textAnchor="middle" fill="#7E8790" fontFamily={FONT_MONO} fontSize={5.8} fontWeight={700}>SIEĆ OSD</text>
                <text x={endX} y={kneeY - 10} textAnchor="middle" fill="#9FE6FF" fontFamily={FONT_MONO} fontSize={5.8} fontWeight={800}>
                  {`${gridBoundary.variant}${gridBoundary.metered ? ' ⊟' : ''}`}
                </text>
                <text x={endX + (side === 'BOK-P' ? 10 : -10)} y={kneeY + 2.2} textAnchor={side === 'BOK-P' ? 'start' : 'end'} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={5.4} fontWeight={600}>
                  {p.cable}
                </text>
              </g>
            ) : (
              <>
                {/* corridor stub marker (where the network/magistrala docks) */}
                <line x1={endX} y1={kneeY - 4} x2={endX} y2={kneeY + 4} stroke="#5A6B78" strokeWidth={2.4} />
                <text x={endX + (side === 'BOK-P' ? 4 : -4)} y={kneeY + 12} textAnchor={side === 'BOK-P' ? 'start' : 'end'} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={5.6} fontWeight={600}>
                  {`${p.kind} · ${side}`}
                </text>
                <text x={endX + (side === 'BOK-P' ? 4 : -4)} y={kneeY + 19} textAnchor={side === 'BOK-P' ? 'start' : 'end'} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={5.4} fontWeight={600}>
                  {p.cable}
                </text>
              </>
            )}
          </g>
        );
      })()}
    </g>
  );
}

/** Power-hierarchy bar (gate H): Pzainst ≥ Pn,AC ≥ Pprzyłącz ≥ Posiągl + verdict. */
function PowerHierarchy(props: { h: SldOzeArchetypeCompanion['source']['power_hierarchy']; x: number; y: number }): JSX.Element {
  const { h, x, y } = props;
  const rows: Array<[string, number]> = [
    ['Pzainst', h.p_zainst_kw],
    ['Pn,AC', h.pn_ac_kw],
    ['Pprzyłącz', h.p_przylacz_kw],
    ['Posiągalna', h.p_osiagalna_kw],
  ];
  const ok = h.valid;
  return (
    <g data-testid="oze-power-hierarchy" data-valid={ok ? 'true' : 'false'} pointerEvents="none">
      <text x={x} y={y} fill="#9FE6FF" fontFamily={FONT_MONO} fontSize={7.5} fontWeight={800}>
        {`HIERARCHIA MOCY ${ok ? '✓' : '✗'}`}
      </text>
      {rows.map(([k, v], i) => (
        <text key={k} x={x} y={y + 9 + i * 8} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={6.6}>
          {`${k} = ${v.toFixed(0)} kW${i < rows.length - 1 ? ' ≥' : ''}`}
        </text>
      ))}
    </g>
  );
}

/** Concise busbar results (U + Ik''max/min + ≤Icw verdict + source contribution +,
 *  for rotating machines, the per-machine WHITE-BOX breakdown I″k·i_b·μ·q, §6.6). */
function BusResults(props: { vf: OzeVfBus; sc: OzeScBus; x: number; y: number }): JSX.Element {
  const { vf, sc, x, y } = props;
  const ok = sc.verification.passed;
  const within = Math.abs(vf.deviation_percent) <= 5;
  const contrib = sc.source_contribution;
  const machines = contrib.machines ?? [];
  return (
    <g data-testid={`oze-bus-results-${vf.bus_ref}`} pointerEvents="none">
      <circle cx={x - 6} cy={y - 3} r={2.2} fill={within ? '#5BE08A' : '#FFB020'} />
      <text x={x} y={y} fill="#CFE9FF" fontFamily={FONT_MONO} fontSize={7.4} fontWeight={800}>
        {`${vf.bus_ref}: U=${vf.u_kv.toFixed(vf.un_kv < 1 ? 3 : 2)} kV (${vf.u_pu.toFixed(3)} pu)`}
      </text>
      <text x={x} y={y + 9} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={6.8}>
        {`Ik"max=${sc.max.ikss_ka.toFixed(2)} / min=${sc.min.ikss_ka.toFixed(2)} kA`}
      </text>
      <text x={x} y={y + 18} fill={ok ? '#5BE08A' : '#FF6B6B'} fontFamily={FONT_MONO} fontSize={6.8} fontWeight={700}>
        {`Ik"max ${ok ? '≤' : '>'} Icw ${sc.icw_ka} kA ${ok ? '✓' : '✗'}`}
      </text>
      {/* Gate J — the source contribution, machine-typed. */}
      <text x={x} y={y + 27} fill="#FFB020" fontFamily={FONT_MONO} fontSize={6.6} data-testid={`oze-sc-contrib-${vf.bus_ref}`} data-machine-type={contrib.machine_type} data-synchronous={String(contrib.is_synchronous_machine)}>
        {`wkład ${contrib.machine_type}: ${contrib.ik_contribution_ka.toFixed(3)} kA (${contrib.machine_type === 'IBG' ? 'ograniczony' : 'maszyna'})${contrib.ib_contribution_ka != null ? ` · i_b=${contrib.ib_contribution_ka.toFixed(3)} kA` : ''}`}
      </text>
      {/* Per-machine WHITE-BOX breakdown (§6.6) — each rotating machine's partial I″k,
          breaking current i_b, decay μ and (asynchronous) q. Absent for IBG. */}
      {machines.map((m, j) => (
        <text
          key={m.source_id}
          x={x + 5}
          y={y + 36 + j * 8}
          fill={COLOR_TEXT_MUTED}
          fontFamily={FONT_MONO}
          fontSize={6}
          data-testid={`oze-sc-machine-${vf.bus_ref}-${j}`}
          data-machine-mu={m.mu}
          data-machine-q={m.q}
        >
          {`#${j + 1} ${m.node_ref}: I″k=${m.ikss_partial_ka.toFixed(3)} · i_b=${m.ib_partial_ka.toFixed(3)} kA · μ=${m.mu.toFixed(3)}${contrib.is_synchronous_machine ? '' : ` · q=${m.q.toFixed(3)}`}`}
        </text>
      ))}
    </g>
  );
}

export function OzeSourceArchetype(props: OzeSourceArchetypeProps): JSX.Element {
  const { companion, stationCode, name, detail, onFieldClick, x = 0, y = 0 } = props;
  const src = companion.source;
  const pccRef = companion.pcc_bus_ref;
  const boundary = companion.boundary;
  // The producer installation = a busbar with a CONNECTION field (interface
  // protection, looking at the grid → boundary) + a SOURCE field (→ transformer
  // → source). Drawn as columns on the PCC busbar; orthogonal throughout.
  const connField = companion.fields.find((f) => f.role === 'connection');
  // POLE 2 = the TRANSFORMER field (terminal station): the step-up transformer
  // hangs UNDER it, fed by its cable — it is NOT a second line to the OSD.
  const trafoField = companion.fields.find((f) => f.role === 'transformer');
  const meterField = companion.fields.find((f) => f.role === 'measurement');
  const srcField = companion.fields.find((f) => f.role === 'source');
  const loadField = companion.fields.find((f) => f.role === 'load');
  const q1Field = companion.fields.find((f) => f.role === 'breaker');
  const schematic = companion.source.schematic;
  // The single OSD connection (terminal station): the line field whose cable docks
  // to the grid. The ZKSN boundary sits on THIS cable — not at the busbar edge.
  const osdLineField = companion.fields.find((f) => f.port?.kind === 'sn_input');
  // BESS (storage) — bidirectional IBG: PCS feeders + a battery glyph + the energy
  // (kWh) register, distinguishing it from a PV farm at a glance.
  const storage = src.storage;
  const isBess = !!storage;
  const feederPrefix = isBess ? 'PCS' : 'INW';
  const ownLabel = isBess ? 'PW' : 'RPW-PV';
  // Wind Type 4 — the internal SN collector network: the turbine BAYS sit on the
  // collector (PCC) bus, each with its OWN transformer + WTG hanging behind it (NOT
  // a shared nN tier). Detected via the collector spec.
  const collector = src.collector;
  const isWind = !!collector;
  const turbineFields = isWind
    ? companion.fields.filter((f) => f.role === 'source' && f.on_bus_ref === pccRef)
    : [];

  // nN tier: the source feeders (≥1) sit on a bus DIFFERENT from the PCC (behind a
  // step-up transformer). The tier carries an optional main breaker (Q1), the
  // inverter source feeders (≥3 for Buk 1, NOT one block) + the own-needs load.
  const srcOnOtherBus = companion.fields.find((f) => f.role === 'source' && f.on_bus_ref !== pccRef);
  const nnBusRef = q1Field?.on_bus_ref ?? srcOnOtherBus?.on_bus_ref;
  const nnTier = nnBusRef && nnBusRef !== pccRef
    ? {
        nnKv: companion.voltage_flow.buses[nnBusRef]?.un_kv ?? 0.8,
        feeders: companion.fields.filter(
          (f) => f.on_bus_ref === nnBusRef && (f.role === 'source' || f.role === 'load'),
        ),
      }
    : null;

  // Wider canvas when the SN fields carry detailed apparatus stacks (need room
  // for the per-apparatus labels) or when there are many fields.
  const hasStacks = (connField?.apparatus?.length ?? 0) > 0;
  const W = hasStacks ? 440 : companion.fields.length >= 5 ? 300 : 240;
  const busY = 0;
  const busX1 = -W / 2;
  const busX2 = W / 2;
  const busKv = companion.voltage_flow.buses[pccRef]?.un_kv ?? 15;
  const busColor = busColorForVoltage(busKv);
  // Per-bus result blocks widen when the source is a rotating machine and carries a
  // per-machine SC breakdown (§6.6), so stacked bus blocks do not overlap. IBG
  // archetypes have no `machines` ⇒ the step stays 40 px (no layout change).
  const maxMachinesPerBus = Math.max(
    0,
    ...Object.values(companion.short_circuit.buses).map(
      (b) => b.source_contribution.machines?.length ?? 0,
    ),
  );
  const busResultStep = 40 + maxMachinesPerBus * 8;

  // Auxiliary text registers (power hierarchy + schematic) sit bottom-left for the
  // simple archetypes; for the DETAILED (stacked) Buk-1 board they move to a bottom
  // FOOTER (below the nN tier) so they clear the POLE 1 cable corridor, which runs
  // left from the cable head (entry_side BOK-L) into exactly that bottom-left zone.
  const blocksInFooter = hasStacks;
  const hierX = busX1 - 96;
  const hierY = blocksInFooter ? busY + 286 : busY + 76;
  const schemX = blocksInFooter ? busX1 + 10 : busX1 - 96;
  const schemY = blocksInFooter ? busY + 286 : busY + 132;

  // Field columns. POLE 1 (line) is on the left; the TRANSFORMER bay (POLE 2 +
  // step-up transformer + nN tier) sits centre-right so the nN busbar can spread
  // and POLE 1's OSD-cable corridor (running left) never crosses it.
  const connX = busX1 + (hasStacks ? 64 : 34);
  const trafoX = busX1 + (hasStacks ? 250 : 170);
  const meterX = busX1 + 78;
  const loadX = busX2 - 86;
  const srcX = busX2 - 40;

  // The incomer flow direction (reverse = export) from the solver.
  const incomerBranch: OzeVfBranch | undefined =
    INCOMER_REFS.map((r) => companion.voltage_flow.branches[r]).find((b) => b !== undefined);
  const incomerDir = incomerBranch?.direction ?? 'none';

  const handle = (id: string) => (onFieldClick ? (e: MouseEvent) => { e.stopPropagation(); onFieldClick(id); } : undefined);

  const breakerY = busY + (detail === 'far' ? 16 : 26);
  const relayY = breakerY + (detail === 'far' ? 12 : 18);
  // Legacy single-source column (G1/G3: source on the SAME bus as the PCC, no Q1).
  const srcBreakerY = busY + (detail === 'far' ? 16 : 26);
  const srcSymY = srcBreakerY + (detail === 'far' ? 16 : 28);
  const pccSrcField = !nnTier && !isWind ? srcField : undefined;
  const pccLoadField = !nnTier ? loadField : undefined;

  return (
    <g
      data-testid={`oze-source-${companion.archetype}`}
      data-archetype={companion.archetype}
      data-detail={detail}
      data-machine-type={src.machine_type}
      data-technology={src.technology}
      data-nc-class={src.nc_rfg_class}
      data-control-mode={src.control_mode}
      data-pcc={pccRef}
      data-boundary={boundary.variant}
      data-converged={String(companion.converged)}
      transform={`translate(${x}, ${y})`}
    >
      {/* Header. */}
      <text x={0} y={busY - 30} textAnchor="middle" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={detail === 'close' ? 12 : 11} fontWeight={900} paintOrder="stroke" stroke="#05070A" strokeWidth={3}>
        {`${stationCode} · ${name}`}
      </text>
      {/* Machine type + NC RfG mode badge (gate G). */}
      {detail !== 'far' && (
        <text data-testid="oze-source-badge" x={0} y={busY - 19} textAnchor="middle" fill="#FFB020" fontFamily={FONT_MONO} fontSize={7.5} fontWeight={700}>
          {`${src.technology} · ${src.machine_type} · NC ${src.nc_rfg_class} · ${src.control_mode}`}
        </text>
      )}

      {/* ─── GRID SIDE (simple archetypes only) — OSD stub + boundary on the busbar
           edge. For the TERMINAL station (an OSD-line field exists) the boundary
           sits on POLE 1's cable instead, so this busbar-edge marker is omitted. ─── */}
      {!osdLineField && (
        <>
          <line data-testid="oze-grid-stub" x1={busX1 - 30} y1={busY} x2={busX1} y2={busY} stroke="#5A6B78" strokeWidth={2.4} strokeDasharray="5 3" />
          {detail !== 'far' && (
            <text x={busX1 - 15} y={busY - 8} textAnchor="middle" fill="#7E8790" fontFamily={FONT_MONO} fontSize={6.6} fontWeight={700}>SIEĆ OSD</text>
          )}
          <g data-testid="oze-boundary-marker" data-variant={boundary.variant} data-enm-variant={boundary.enm_connection_variant}>
            <polygon points={`${busX1},${busY - 6} ${busX1 + 6},${busY} ${busX1},${busY + 6} ${busX1 - 6},${busY}`} fill="#0A1622" stroke="#9FE6FF" strokeWidth={1.6} />
            {detail !== 'far' && (
              <text x={busX1} y={busY + 18} textAnchor="middle" fill="#9FE6FF" fontFamily={FONT_MONO} fontSize={6.4} fontWeight={800}>
                {`${boundary.variant}${boundary.metered ? ' ⊟' : ''}`}
              </text>
            )}
          </g>
        </>
      )}

      {/* ─── PRODUCER busbar (PCC) ─── */}
      <line x1={busX1} y1={busY} x2={busX2} y2={busY} stroke={busColor} strokeWidth={4} data-testid={`oze-busbar-${pccRef}`} />
      <line x1={busX2} y1={busY - 5} x2={busX2} y2={busY + 5} stroke={busColor} strokeWidth={2} />
      {detail !== 'far' && (
        <text x={busX2 + 4} y={busY + 3} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={7} fontWeight={700}>
          {`${busKv >= 1 ? busKv.toFixed(0) + ' kV' : (busKv * 1000).toFixed(0) + ' V'}`}
        </text>
      )}

      {/* ─── CONNECTION field (interface protection HERE, looking at the grid) ─── */}
      {connField && (
        <g
          data-testid="oze-field-connection"
          data-field-role="connection"
          data-abb-cell={connField.abb_cell}
          data-source-ref={connField.source_ref}
          data-interface-protection="true"
          onClick={handle(`${companion.archetype}/${connField.field_id}`)}
          style={{ cursor: onFieldClick ? 'pointer' : 'default' }}
        >
          {/* L0/L1: a single breaker box (+ a short stub to the ZKSN boundary on the
              OSD cable). L2: the FULL apparatus stack with the cable + ZKSN at its end. */}
          {detail === 'close' && (connField.apparatus?.length ?? 0) > 0 ? (
            <ApparatusStack field={connField} cx={connX} topY={busY} direction={incomerDir} labelSide="right" onClick={handle(`${companion.archetype}/${connField.field_id}`)} gridBoundary={osdLineField === connField ? boundary : undefined} />
          ) : (
            <>
              <line x1={connX} y1={busY} x2={connX} y2={breakerY - (detail === 'far' ? 6 : 8)} stroke={busColor} strokeWidth={1.8} />
              <g data-testid="oze-conn-breaker" data-symbol-shape="square" data-state="closed">
                <ApparatusCbSquare cx={connX} cy={breakerY} state="closed" energized />
              </g>
              {detail !== 'far' && <FlowArrow x={connX} topY={busY + 3} botY={busY + 18} direction={incomerDir} />}
              {/* Compact ZKSN boundary on the OSD cable, below the breaker. */}
              {osdLineField === connField && (() => {
                const bY = breakerY + (detail === 'far' ? 14 : 18);
                return (
                  <g data-testid="oze-boundary-marker" data-variant={boundary.variant} data-enm-variant={boundary.enm_connection_variant}>
                    <line x1={connX} y1={breakerY + (detail === 'far' ? 6 : 8)} x2={connX} y2={bY - 6} stroke={busColor} strokeWidth={1.6} />
                    <polygon points={`${connX},${bY - 6} ${connX + 6},${bY} ${connX},${bY + 6} ${connX - 6},${bY}`} fill="#0A1622" stroke="#9FE6FF" strokeWidth={1.6} />
                    <line x1={connX} y1={bY + 6} x2={connX} y2={bY + 14} stroke="#5A6B78" strokeWidth={2.2} strokeDasharray="4 3" />
                    {detail !== 'far' && (
                      <text x={connX - 9} y={bY + 2} textAnchor="end" fill="#9FE6FF" fontFamily={FONT_MONO} fontSize={6.2} fontWeight={800}>
                        {`${boundary.variant}${boundary.metered ? ' ⊟' : ''}`}
                      </text>
                    )}
                    {detail !== 'far' && (
                      <text x={connX} y={bY + 23} textAnchor="middle" fill="#7E8790" fontFamily={FONT_MONO} fontSize={6} fontWeight={700}>SIEĆ OSD</text>
                    )}
                  </g>
                );
              })()}
            </>
          )}
          {/* Field label ABOVE the breaker (right of the path) — clear of the codes. */}
          {detail !== 'far' && (
            <text x={connX + 11} y={breakerY - 4} textAnchor="start" fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_SANS} fontSize={6.6} fontWeight={700}>
              {`PRZYŁ. ${connField.abb_cell}`}
            </text>
          )}
          {/* Interface-protection relay (gate I). In the DETAILED (stacked) view the
              apparatus labels hug the axis, so the relay + its codes are hung to the
              RIGHT of those labels (a short orthogonal tick off the CT level), in the
              clear gap between the breaker and the CT — keeping the dense POLE 1 stack
              legible. The compact view keeps the relay on the axis below the breaker. */}
          {detail === 'close' && (() => {
            const codes = connField.protection_codes;
            const rows: string[] = [];
            for (let i = 0; i < codes.length; i += 4) rows.push(codes.slice(i, i + 4).join('·'));
            const stacked = (connField.apparatus?.length ?? 0) > 0;
            const rTopY = stacked ? busY + 53 : relayY; // clear gap between the CB and the CT
            const rBoxX = stacked ? connX + 26 : connX; // off the axis & the short apparatus labels
            const codesX = stacked ? connX + 36 : connX + 8;
            return (
              <g data-testid="oze-protection" data-machine-type={src.machine_type} data-on-field="connection" pointerEvents="none">
                {stacked && <line x1={connX + 9} y1={rTopY} x2={rBoxX - 5} y2={rTopY} stroke="#5BE08A" strokeWidth={1} strokeDasharray="2 1.5" />}
                <rect x={rBoxX - 4} y={rTopY - 4} width={8} height={8} rx={1} fill="#0A1622" stroke="#5BE08A" strokeWidth={1} />
                <text x={rBoxX} y={rTopY + 2.4} textAnchor="middle" fill="#5BE08A" fontFamily={FONT_MONO} fontSize={5} fontWeight={800}>R</text>
                {rows.map((r, i) => (
                  <text key={i} x={codesX} y={rTopY + 1 + i * 7} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={5.8} fontWeight={700}>{r}</text>
                ))}
              </g>
            );
          })()}
        </g>
      )}

      {/* ─── MEASUREMENT field (SDM) at the SN boundary, if present ─── */}
      {meterField && (
        <g
          data-testid="oze-field-measurement"
          data-field-role="measurement"
          data-abb-cell={meterField.abb_cell}
          data-source-ref={meterField.source_ref}
          onClick={handle(`${companion.archetype}/${meterField.field_id}`)}
          style={{ cursor: onFieldClick ? 'pointer' : 'default' }}
        >
          <line x1={meterX} y1={busY} x2={meterX} y2={breakerY} stroke={busColor} strokeWidth={1.6} />
          {/* VT triple-circle glyph (measurement). */}
          <circle cx={meterX - 3} cy={breakerY} r={2.4} fill="none" stroke="#7DD3FC" strokeWidth={1.1} />
          <circle cx={meterX + 3} cy={breakerY} r={2.4} fill="none" stroke="#7DD3FC" strokeWidth={1.1} />
          <circle cx={meterX} cy={breakerY + 3} r={2.4} fill="none" stroke="#7DD3FC" strokeWidth={1.1} />
          {detail !== 'far' && (
            <text x={meterX} y={breakerY + 16} textAnchor="middle" fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_SANS} fontSize={6.6} fontWeight={700} paintOrder="stroke" stroke="#05070A" strokeWidth={2}>
              {`POM. (${meterField.abb_cell})`}
            </text>
          )}
        </g>
      )}

      {/* ════ TRANSFORMER BAY + nN TIER (800 V, układ IT). For the terminal station
           POLE 2 (the transformer field) sits on the SN busbar and the step-up
           transformer hangs UNDER it (fed by POLE 2's cable) → Q1 → nN busbar → ≥3
           inverter feeders + own-needs. There is NO SN output: the bay terminates at
           the transformer. (Simple farms without a transformer field tap the busbar
           directly at srcX — legacy path.) Orthogonal throughout. ════ */}
      {nnTier && (() => {
        const trafo = trafoField;                // POLE 2 = transformer field (terminal station)
        const trX = trafo ? trafoX : srcX;       // transformer spine x (under POLE 2, else free tap)
        // POLE 2's switch depth: a full apparatus stack at close, a rozłącznik
        // diamond at far/closer. The transformer hangs directly below it.
        const trafoOnPath = (trafo?.apparatus ?? []).filter((a) => ['UPSTREAM', 'MIDSTREAM', 'DOWNSTREAM'].includes(a.placement)).length;
        const stacked = detail === 'close' && trafoOnPath > 0;
        const pole2Bottom = trafo ? (stacked ? busY + (trafoOnPath + 1) * 21 : breakerY + 6) : busY;
        const trTopY = trafo
          ? pole2Bottom + (detail === 'close' ? 40 : 24)
          : busY + (detail === 'close' ? 158 : detail === 'closer' ? 22 : 14);
        const trMidY = trTopY + (detail === 'far' ? 12 : 18);
        const nnBusY = trMidY + (detail === 'far' ? 16 : 26);
        const nnX1 = busX1 + (hasStacks ? 130 : 18); // start right of POLE 1's OSD-cable corridor
        const nnX2 = busX2 - 8;
        const feeders = nnTier.feeders;
        const fStep = (nnX2 - (nnX1 + 26)) / Math.max(1, feeders.length);
        const fBreakerY = nnBusY + (detail === 'far' ? 14 : 22);
        const fSymY = fBreakerY + (detail === 'far' ? 14 : 24);
        return (
          <g data-testid="oze-nn-tier" data-nn-kv={nnTier.nnKv}>
            {/* POLE 2 — TRANSFORMER FIELD: rozłącznik on the busbar; the transformer
                hangs below, fed by its cable (no SN output — terminal station). */}
            {trafo && (
              <g
                data-testid="oze-field-transformer"
                data-field-role="transformer"
                data-abb-cell={trafo.abb_cell}
                data-source-ref={trafo.source_ref}
                onClick={handle(`${companion.archetype}/${trafo.field_id}`)}
                style={{ cursor: onFieldClick ? 'pointer' : 'default' }}
              >
                {stacked ? (
                  <ApparatusStack field={trafo} cx={trX} topY={busY} direction="none" labelSide="right" onClick={handle(`${companion.archetype}/${trafo.field_id}`)} />
                ) : (
                  <>
                    <line x1={trX} y1={busY} x2={trX} y2={breakerY - 7} stroke={busColor} strokeWidth={1.8} />
                    <g data-symbol-shape="diamond" data-state="closed">
                      <polygon points={`${trX},${breakerY - 6} ${trX + 6},${breakerY} ${trX},${breakerY + 6} ${trX - 6},${breakerY}`} fill="#0A8D43" stroke={COLOR_DEVICE_CLOSED_BORDER} strokeWidth={1.6} />
                      <line x1={trX} y1={breakerY - 4.5} x2={trX} y2={breakerY + 4.5} stroke={COLOR_DEVICE_CLOSED_BORDER} strokeWidth={1.3} />
                    </g>
                  </>
                )}
                {detail !== 'far' && (
                  <text x={trX} y={busY - 7} textAnchor="middle" fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_SANS} fontSize={6.4} fontWeight={700} paintOrder="stroke" stroke="#05070A" strokeWidth={2}>
                    {`SŁ2+U ${trafo.abb_cell}`}
                  </text>
                )}
              </g>
            )}
            {/* (POLE 2 cable head / busbar) → transformer spine. */}
            <line x1={trX} y1={pole2Bottom} x2={trX} y2={trTopY - 9} stroke={busColor} strokeWidth={1.8} />
            <ApparatusTransformerSymbol cx={trX} cy={trTopY} vectorGroup="Dyn5" neutralEarthed />
            {/* transformer → nN main breaker Q1 → nN busbar. */}
            <line x1={trX} y1={trTopY + 9} x2={trX} y2={trMidY - 7} stroke="#7DD3FC" strokeWidth={1.8} />
            {q1Field && (
              <g
                data-testid="oze-field-breaker"
                data-field-role="breaker"
                data-abb-cell={q1Field.abb_cell}
                data-source-ref={q1Field.source_ref}
                data-interface-protection="true"
                onClick={handle(`${companion.archetype}/${q1Field.field_id}`)}
                style={{ cursor: onFieldClick ? 'pointer' : 'default' }}
              >
                <g data-symbol-shape="square" data-state="closed">
                  <ApparatusCbSquare cx={trX} cy={trMidY} state="closed" energized />
                </g>
                {detail !== 'far' && (
                  <text x={trX + 11} y={trMidY + 2} textAnchor="start" fill="#5BE08A" fontFamily={FONT_MONO} fontSize={6.4} fontWeight={800}>Q1</text>
                )}
              </g>
            )}
            <line x1={trX} y1={trMidY + 7} x2={trX} y2={nnBusY} stroke="#7DD3FC" strokeWidth={1.8} />
            {/* nN busbar (800 V, układ IT). */}
            <line x1={nnX1} y1={nnBusY} x2={nnX2} y2={nnBusY} stroke="#7DD3FC" strokeWidth={3.4} data-testid="oze-nn-busbar" />
            {detail !== 'far' && (
              <text x={nnX2 + 4} y={nnBusY + 3} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={6.6} fontWeight={700}>{`${nnTier.nnKv * 1000} V · IT`}</text>
            )}
            {/* Inverter feeders (≥3) + own-needs — each its own field, BTVC fuse. */}
            {feeders.map((f, i) => {
              const fx = nnX1 + 26 + i * fStep;
              const isOwn = f.role === 'load';
              return (
                <g
                  key={f.field_id}
                  data-testid={isOwn ? 'oze-field-load' : `oze-field-inv-${i}`}
                  data-field-role={f.role}
                  data-abb-cell={f.abb_cell}
                  data-source-ref={f.source_ref}
                  onClick={handle(`${companion.archetype}/${f.field_id}`)}
                  style={{ cursor: onFieldClick ? 'pointer' : 'default' }}
                >
                  <line x1={fx} y1={nnBusY} x2={fx} y2={fBreakerY - 6} stroke="#7DD3FC" strokeWidth={1.6} />
                  {/* BTVC fuse (rect) on inverter feeders. */}
                  {!isOwn && detail !== 'far' && (
                    <rect x={fx - 2.5} y={fBreakerY - 6} width={5} height={9} rx={0.6} fill="#0A8D43" stroke={COLOR_DEVICE_CLOSED_BORDER} strokeWidth={1} />
                  )}
                  <line x1={fx} y1={fBreakerY + (isOwn ? 0 : 3)} x2={fx} y2={fSymY - 7} stroke="#7DD3FC" strokeWidth={1.6} />
                  {/* symbol: inverter (~) for source, load triangle for own-needs;
                      a BESS source carries a battery glyph beside the PCS (⎓). */}
                  {detail !== 'far' && (isOwn
                    ? <polygon points={`${fx - 5},${fSymY - 6} ${fx + 5},${fSymY - 6} ${fx},${fSymY + 3}`} fill="#7DD3FC" stroke="#7DD3FC" strokeWidth={1} />
                    : <PvInverterSymbol cx={fx} cy={fSymY} r={detail === 'close' ? 7 : 6} />)}
                  {detail !== 'far' && isBess && !isOwn && (
                    <g data-testid={`oze-battery-${i}`} pointerEvents="none">
                      <line x1={fx + 6} y1={fSymY - 3} x2={fx + 14} y2={fSymY - 3} stroke="#FFB020" strokeWidth={1.3} />
                      <line x1={fx + 8} y1={fSymY - 1} x2={fx + 12} y2={fSymY - 1} stroke="#FFB020" strokeWidth={1} />
                      <line x1={fx + 6} y1={fSymY + 1} x2={fx + 14} y2={fSymY + 1} stroke="#FFB020" strokeWidth={1.3} />
                      <line x1={fx + 8} y1={fSymY + 3} x2={fx + 12} y2={fSymY + 3} stroke="#FFB020" strokeWidth={1} />
                    </g>
                  )}
                  {detail === 'close' && (
                    <text x={fx} y={fSymY + 14} textAnchor="middle" fill={isOwn ? '#7DD3FC' : '#FFB020'} fontFamily={FONT_MONO} fontSize={5.6} fontWeight={700}>
                      {isOwn ? ownLabel : `${feederPrefix}.${i + 1}`}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })()}

      {/* ─── WIND collector tier (G6): the turbine BAYS on the collector (PCC) bus,
           each with its OWN turbine transformer + WTG hanging behind it. This is the
           distinguishing structure — n distributed transformers + an SN collector,
           NOT n inverters on one shared nN bus. ─── */}
      {isWind && turbineFields.length > 0 && (() => {
        const collX1 = busX1 + (hasStacks ? 130 : 40); // right of POLE 1's OSD-cable corridor
        const collX2 = busX2 - 8;
        const tStep = (collX2 - collX1) / Math.max(1, turbineFields.length);
        const trY = busY + (detail === 'far' ? 18 : 30);
        const wtgY = trY + (detail === 'far' ? 18 : 32);
        const r = detail === 'close' ? 7 : 6;
        return (
          <g data-testid="oze-collector-tier" data-collector-kv={collector!.collector_kv} data-n-turbines={collector!.n_turbines}>
            {turbineFields.map((f, i) => {
              const tx = collX1 + (i + 0.5) * tStep;
              const vf = companion.voltage_flow.branches[`sr/branch/wtg-tr${i + 1}`];
              return (
                <g
                  key={f.field_id}
                  data-testid={`oze-field-wtg-${i}`}
                  data-field-role="source"
                  data-abb-cell={f.abb_cell}
                  data-source-ref={f.source_ref}
                  onClick={handle(`${companion.archetype}/${f.field_id}`)}
                  style={{ cursor: onFieldClick ? 'pointer' : 'default' }}
                >
                  <line x1={tx} y1={busY} x2={tx} y2={trY - 9} stroke={busColor} strokeWidth={1.8} />
                  <ApparatusTransformerSymbol cx={tx} cy={trY} vectorGroup="Dyn5" neutralEarthed />
                  {detail !== 'far' && (
                    <>
                      <line x1={tx} y1={trY + 9} x2={tx} y2={wtgY - r - 6} stroke="#7DD3FC" strokeWidth={1.6} />
                      <WtgSymbol cx={tx} cy={wtgY} r={r} />
                    </>
                  )}
                  {detail === 'close' && (
                    <>
                      <text x={tx} y={wtgY + 17} textAnchor="middle" fill="#FFB020" fontFamily={FONT_MONO} fontSize={5.8} fontWeight={700}>{`WTG.${i + 1}`}</text>
                      {vf && (
                        <text x={tx} y={wtgY + 25} textAnchor="middle" fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={5}>{`${Math.abs(vf.p_mw).toFixed(1)} MW`}</text>
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </g>
        );
      })()}

      {/* Legacy single-source column (G1/G3: source on the PCC bus, no nN tier). */}
      {pccSrcField && (
        <g
          data-testid="oze-field-source"
          data-field-role="source"
          data-abb-cell={pccSrcField.abb_cell}
          data-source-ref={pccSrcField.source_ref}
          data-interface-protection="false"
          onClick={handle(`${companion.archetype}/${pccSrcField.field_id}`)}
          style={{ cursor: onFieldClick ? 'pointer' : 'default' }}
        >
          <line x1={srcX} y1={busY} x2={srcX} y2={srcBreakerY - (detail === 'far' ? 6 : 8)} stroke={busColor} strokeWidth={1.8} />
          <g data-testid="oze-source-breaker" data-symbol-shape="square" data-state="closed">
            <ApparatusCbSquare cx={srcX} cy={srcBreakerY} state="closed" energized />
          </g>
          <line x1={srcX} y1={srcBreakerY + (detail === 'far' ? 6 : 8)} x2={srcX} y2={srcSymY - 8} stroke={busColor} strokeWidth={1.8} />
          {detail !== 'far' && <PvInverterSymbol cx={srcX} cy={srcSymY} r={detail === 'close' ? 8 : 7} />}
          {detail !== 'far' && (
            <text x={srcX} y={srcSymY + (detail === 'close' ? 16 : 14)} textAnchor="middle" fill="#FFB020" fontFamily={FONT_SANS} fontSize={7} fontWeight={700} paintOrder="stroke" stroke="#05070A" strokeWidth={2}>
              {`${pccSrcField.kind} (${pccSrcField.abb_cell})`}
            </text>
          )}
          {detail === 'far' && (
            <text x={srcX} y={srcSymY + 4} textAnchor="middle" fill="#FFB020" fontFamily={FONT_MONO} fontSize={8} fontWeight={800}>{src.technology}</text>
          )}
        </g>
      )}
      {/* Legacy own-load on the PCC bus (only when no nN tier carries it). */}
      {pccLoadField && (
        <g data-testid="oze-field-load" data-field-role="load" data-abb-cell={pccLoadField.abb_cell} data-source-ref={pccLoadField.source_ref} onClick={handle(`${companion.archetype}/${pccLoadField.field_id}`)} style={{ cursor: onFieldClick ? 'pointer' : 'default' }}>
          <line x1={loadX} y1={busY} x2={loadX} y2={srcSymY - 6} stroke={busColor} strokeWidth={1.8} />
          {detail !== 'far' && <polygon points={`${loadX - 5},${srcSymY - 6} ${loadX + 5},${srcSymY - 6} ${loadX},${srcSymY + 3}`} fill="#7DD3FC" stroke="#7DD3FC" strokeWidth={1} />}
          {detail !== 'far' && <text x={loadX} y={srcSymY + (detail === 'close' ? 14 : 12)} textAnchor="middle" fill="#7DD3FC" fontFamily={FONT_SANS} fontSize={6.6} fontWeight={700} paintOrder="stroke" stroke="#05070A" strokeWidth={2}>{`ODB. WŁ. (${pccLoadField.abb_cell})`}</text>}
        </g>
      )}

      {/* Concise results at objects (close zoom): per-bus U + Ik'' + ≤Icw +
          contribution — stacked on the RIGHT of the busbar, clear of the fields. */}
      {detail === 'close' && Object.keys(companion.voltage_flow.buses).sort().map((busRef, i) => {
        const vf = companion.voltage_flow.buses[busRef];
        const sc = companion.short_circuit.buses[busRef];
        if (!vf || !sc) return null;
        return <BusResults key={busRef} vf={vf} sc={sc} x={busX2 + 18} y={busY + 16 + i * busResultStep} />;
      })}

      {/* Power hierarchy (gate H), close zoom — bottom-left, or the footer for the
          detailed board (clear of the connection-field codes and the cable corridor). */}
      {detail === 'close' && <PowerHierarchy h={src.power_hierarchy} x={hierX} y={hierY} />}

      {/* Schematic equipment register (close zoom) — the distinguishing block of a
          template DISTILLED from a real drawing: transformer/CT/VT/grid/modules,
          each pinned to the schematic (source_ref). Placed BOTTOM-LEFT, below the
          power hierarchy, clear of the right-side bus-result panels. */}
      {detail === 'close' && schematic && (
        <g data-testid="oze-schematic" data-source-ref={schematic.source_ref} pointerEvents="none">
          <text x={schemX} y={schemY} fill="#9FE6FF" fontFamily={FONT_MONO} fontSize={7} fontWeight={800}>
            WG SCHEMATU (źródło)
          </text>
          {[
            `Trafo: ${schematic.transformer}`,
            `nN ${schematic.nn_kv * 1000} V · układ ${schematic.nn_grid} · wył. ${schematic.nn_main_breaker}`,
            `CT ${schematic.ct.type} ${schematic.ct.ratio} · Ith=${schematic.ct.ith_ka} kA · Idyn=${schematic.ct.idyn_ka} kA`,
            `  rdzenie: ${schematic.ct.cores.join(' · ')}`,
            `VT ${schematic.vt.type} ${schematic.vt.ratio}`,
            `PV: ${schematic.pv_modules}`,
            `Potrzeby własne: ${schematic.own_needs}`,
          ].map((ln, i) => (
            <text key={i} x={schemX} y={schemY + 9 + i * 8} fill={i === 3 ? COLOR_TEXT_MUTED : COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={6} fontWeight={i === 3 ? 400 : 600}>
              {ln}
            </text>
          ))}
        </g>
      )}

      {/* Storage register (BESS) — the ENERGY axis (kWh) + the bidirectional powers,
          the block that distinguishes a magazyn from a PV farm. Pinned to the
          standard (source_ref). Footer, in place of the schematic register. */}
      {detail === 'close' && storage && (
        <g data-testid="oze-storage" data-source-ref={storage.source_ref} pointerEvents="none">
          <text x={schemX} y={schemY} fill="#9FE6FF" fontFamily={FONT_MONO} fontSize={7} fontWeight={800}>
            MAGAZYN (oś energii)
          </text>
          {[
            `Moc PCS: ${storage.n_pcs}×${storage.pcs_kw.toFixed(0)} kW = ${storage.power_kw.toFixed(0)} kW`,
            `Pojemność: ${storage.capacity_kwh.toFixed(0)} kWh · ${storage.duration_h} h`,
            `Praca 2-kier.: rozład. ${storage.discharge_kw.toFixed(0)} kW ⇄ ład. ${storage.charge_kw.toFixed(0)} kW`,
            `Maszyna: IBG (PCS) — Ik ograniczony k·In (§6.7)`,
          ].map((ln, i) => (
            <text key={i} x={schemX} y={schemY + 9 + i * 8} fill={i === 3 ? COLOR_TEXT_MUTED : COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={6} fontWeight={i === 3 ? 400 : 600}>
              {ln}
            </text>
          ))}
        </g>
      )}

      {/* Collector register (Wind T4) — the internal SN collector network, the block
          that distinguishes a wind farm (distributed turbine transformers) from a PV
          farm (one shared transformer). Pinned to the standard (source_ref). */}
      {detail === 'close' && collector && (
        <g data-testid="oze-collector" data-source-ref={collector.source_ref} pointerEvents="none">
          <text x={schemX} y={schemY} fill="#9FE6FF" fontFamily={FONT_MONO} fontSize={7} fontWeight={800}>
            SIEĆ KOLEKTOROWA SN
          </text>
          {[
            `Kolektor: ${collector.collector_kv} kV · ${collector.topology}`,
            `Turbiny: ${collector.n_turbines} × ${(collector.turbine_kw / 1000).toFixed(1)} MW ${src.machine_type === 'ASYNCHRONOUS' ? '(Typ 1, generator asynchroniczny)' : '(Typ 4, pełny przekształtnik)'}`,
            `Trafo turbiny (każda): ${collector.turbine_transformer}`,
            src.machine_type === 'ASYNCHRONOUS'
              ? `Maszyna: asynchroniczna — Ik za Z_M (§6.7), zanik μ·q (§6.6)`
              : `Maszyna: IBG — Ik ograniczony k·In (§6.7), NIE maszyna`,
          ].map((ln, i) => (
            <text key={i} x={schemX} y={schemY + 9 + i * 8} fill={i === 3 ? COLOR_TEXT_MUTED : COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={6} fontWeight={i === 3 ? 400 : 600}>
              {ln}
            </text>
          ))}
        </g>
      )}
    </g>
  );
}
