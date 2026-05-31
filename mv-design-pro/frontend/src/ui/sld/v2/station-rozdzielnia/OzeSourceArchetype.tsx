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

function formatPower(mw: number): string {
  const abs = Math.abs(mw);
  if (abs < 1) return `${Math.round(mw * 1000)} kW`;
  return `${mw.toFixed(2)} MW`;
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

/** Concise busbar results (U + Ik''max/min + ≤Icw verdict + IBG contribution). */
function BusResults(props: { vf: OzeVfBus; sc: OzeScBus; x: number; y: number }): JSX.Element {
  const { vf, sc, x, y } = props;
  const ok = sc.verification.passed;
  const within = Math.abs(vf.deviation_percent) <= 5;
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
      <text x={x} y={y + 27} fill="#FFB020" fontFamily={FONT_MONO} fontSize={6.6} data-testid={`oze-sc-contrib-${vf.bus_ref}`} data-machine-type={sc.source_contribution.machine_type} data-synchronous={String(sc.source_contribution.is_synchronous_machine)}>
        {`wkład ${sc.source_contribution.machine_type}: ${sc.source_contribution.ik_contribution_ka.toFixed(3)} kA (${sc.source_contribution.is_synchronous_machine ? 'maszyna' : 'ograniczony'})`}
      </text>
    </g>
  );
}

export function OzeSourceArchetype(props: OzeSourceArchetypeProps): JSX.Element {
  const { companion, stationCode, name, detail, onFieldClick, x = 0, y = 0 } = props;
  const src = companion.source;
  const busRefs = Object.keys(companion.voltage_flow.buses).sort();
  const pccRef = companion.pcc_bus_ref;
  // Geometry: PCC busbar on top, source path below. Orthogonal throughout.
  const W = 220;
  const busY = 0;
  const busX1 = -W / 2;
  const busX2 = W / 2;
  const busKv = companion.voltage_flow.buses[pccRef]?.un_kv ?? 15;
  const busColor = busColorForVoltage(busKv);
  const srcX = 0;
  const incomerX = busX1 + 26;

  // The incomer flow direction (reverse = export) from the solver.
  const incomerBranch: OzeVfBranch | undefined =
    INCOMER_REFS.map((r) => companion.voltage_flow.branches[r]).find((b) => b !== undefined);
  const incomerDir = incomerBranch?.direction ?? 'none';

  const handle = (id: string) => (onFieldClick ? (e: MouseEvent) => { e.stopPropagation(); onFieldClick(id); } : undefined);

  const srcTopY = busY;
  const breakerY = busY + (detail === 'far' ? 16 : 26);
  const trafoY = breakerY + (detail === 'far' ? 16 : 26);
  const invY = trafoY + (detail === 'far' ? 16 : 28);
  const hasTrafo = pccRef.includes('SN') && busRefs.some((b) => b.includes('NN') || b.includes('COLLECTOR'));

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
      data-converged={String(companion.converged)}
      transform={`translate(${x}, ${y})`}
    >
      {/* Header. */}
      <text x={0} y={busY - 26} textAnchor="middle" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={detail === 'close' ? 12 : 11} fontWeight={900} paintOrder="stroke" stroke="#05070A" strokeWidth={3}>
        {`${stationCode} · ${name}`}
      </text>
      {/* Machine type + NC RfG mode badge (gate G). */}
      {detail !== 'far' && (
        <text data-testid="oze-source-badge" x={0} y={busY - 15} textAnchor="middle" fill="#FFB020" fontFamily={FONT_MONO} fontSize={7.5} fontWeight={700}>
          {`${src.technology} · ${src.machine_type} · NC ${src.nc_rfg_class} · ${src.control_mode}`}
        </text>
      )}

      {/* PCC busbar. */}
      <line x1={busX1} y1={busY} x2={busX2} y2={busY} stroke={busColor} strokeWidth={4} data-testid={`oze-busbar-${pccRef}`} />
      <line x1={busX1} y1={busY - 5} x2={busX1} y2={busY + 5} stroke={busColor} strokeWidth={2} />
      <line x1={busX2} y1={busY - 5} x2={busX2} y2={busY + 5} stroke={busColor} strokeWidth={2} />
      {/* PCC marker. */}
      <g data-testid="oze-pcc-marker">
        <circle cx={incomerX} cy={busY} r={3} fill="#9FE6FF" stroke="#05070A" strokeWidth={0.8} />
        {detail !== 'far' && (
          <text x={incomerX} y={busY - 8} textAnchor="middle" fill="#9FE6FF" fontFamily={FONT_MONO} fontSize={6.6} fontWeight={700}>PCC</text>
        )}
      </g>
      {/* Incomer drop + reverse-export flow arrow (orthogonal). */}
      <line x1={incomerX} y1={busY} x2={incomerX} y2={busY + (detail === 'far' ? 22 : 34)} stroke={busColor} strokeWidth={1.8} />
      {detail !== 'far' && <FlowArrow x={incomerX} topY={busY + 3} botY={busY + 18} direction={incomerDir} />}
      {/* Incomer flow readout — stacked under the PCC column (left), so it never
          runs into the centre protection codes. */}
      {detail === 'close' && incomerBranch && (
        <g data-testid="oze-incomer-flow" pointerEvents="none">
          <text x={incomerX} y={busY + 30} textAnchor="middle" fill={incomerDir === 'reverse' ? COLOR_TR_FLOW_DOWN : COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={6.6} fontWeight={700}>
            {incomerDir === 'reverse' ? 'eksport ↑' : 'import ↓'}
          </text>
          <text x={incomerX} y={busY + 39} textAnchor="middle" fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={6.4}>
            {`${formatPower(incomerBranch.p_mw)}`}
          </text>
          <text x={incomerX} y={busY + 48} textAnchor="middle" fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={6.4}>
            {`I=${incomerBranch.i_a.toFixed(0)} A`}
          </text>
        </g>
      )}

      {/* Source path: bus → breaker → (transformer) → inverter. Orthogonal. */}
      <line x1={srcX} y1={srcTopY} x2={srcX} y2={breakerY - (detail === 'far' ? 6 : 8)} stroke={busColor} strokeWidth={1.8} />
      <g data-testid="oze-source-breaker" data-symbol-shape="square" data-state="closed" onClick={handle(`${companion.archetype}/breaker`)} style={{ cursor: onFieldClick ? 'pointer' : 'default' }}>
        <ApparatusCbSquare cx={srcX} cy={breakerY} state="closed" energized />
      </g>
      {hasTrafo ? (
        <>
          <line x1={srcX} y1={breakerY + (detail === 'far' ? 6 : 8)} x2={srcX} y2={trafoY - 9} stroke={busColor} strokeWidth={1.8} />
          <ApparatusTransformerSymbol cx={srcX} cy={trafoY} vectorGroup="Dyn5" neutralEarthed />
          <line x1={srcX} y1={trafoY + 9} x2={srcX} y2={invY - 8} stroke="#7DD3FC" strokeWidth={1.8} />
          {detail !== 'far' && <PvInverterSymbol cx={srcX} cy={invY} r={detail === 'close' ? 8 : 7} />}
        </>
      ) : (
        <>
          <line x1={srcX} y1={breakerY + (detail === 'far' ? 6 : 8)} x2={srcX} y2={invY - 8} stroke={busColor} strokeWidth={1.8} />
          {detail !== 'far' && <PvInverterSymbol cx={srcX} cy={invY} r={detail === 'close' ? 8 : 7} />}
        </>
      )}
      {/* far: a state diamond for the source breaker so the unit reads at L0. */}
      {detail === 'far' && (
        <text x={srcX} y={invY + 4} textAnchor="middle" fill="#FFB020" fontFamily={FONT_MONO} fontSize={8} fontWeight={800}>{src.technology}</text>
      )}

      {/* Protection set (gate I) — machine-type-dependent, close zoom. The codes
          hang on a relay box BELOW the breaker (in the source column), wrapped to
          two rows so they never run into the right-side result panels. */}
      {detail === 'close' && (() => {
        const codes = src.protection_codes;
        const mid = Math.ceil(codes.length / 2);
        const rowA = codes.slice(0, mid).join(' · ');
        const rowB = codes.slice(mid).join(' · ');
        const ry = breakerY + 4;
        return (
          <g data-testid="oze-protection" data-machine-type={src.machine_type} pointerEvents="none">
            <rect x={srcX + 12} y={ry - 5} width={3} height={3} fill="#5BE08A" />
            <line x1={srcX + 6} y1={ry - 3.5} x2={srcX + 12} y2={ry - 3.5} stroke={COLOR_TEXT_MUTED} strokeWidth={0.8} />
            <text x={srcX + 17} y={ry} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={6.2} fontWeight={700}>{rowA}</text>
            {rowB && <text x={srcX + 17} y={ry + 8} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={6.2} fontWeight={700}>{rowB}</text>}
          </g>
        );
      })()}

      {/* Concise results at objects (close zoom): per-bus U + Ik'' + ≤Icw +
          contribution. Stacked on the right, starting BELOW the busbar so they
          clear the protection row. */}
      {detail === 'close' && busRefs.map((busRef, i) => {
        const vf = companion.voltage_flow.buses[busRef];
        const sc = companion.short_circuit.buses[busRef];
        if (!vf || !sc) return null;
        return <BusResults key={busRef} vf={vf} sc={sc} x={busX2 + 16} y={busY + 22 + i * 38} />;
      })}

      {/* Power hierarchy (gate H), close zoom, left of the unit. */}
      {detail === 'close' && <PowerHierarchy h={src.power_hierarchy} x={busX1 - 100} y={busY + 22} />}
    </g>
  );
}
