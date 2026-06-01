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
  const pccRef = companion.pcc_bus_ref;
  const boundary = companion.boundary;
  // The producer installation = a busbar with a CONNECTION field (interface
  // protection, looking at the grid → boundary) + a SOURCE field (→ transformer
  // → source). Drawn as columns on the PCC busbar; orthogonal throughout.
  const connField = companion.fields.find((f) => f.role === 'connection');
  const switchField = companion.fields.find((f) => f.role === 'switch');
  const meterField = companion.fields.find((f) => f.role === 'measurement');
  const srcField = companion.fields.find((f) => f.role === 'source');
  const loadField = companion.fields.find((f) => f.role === 'load');
  const schematic = companion.source.schematic;

  // Wider canvas when the unit has many fields (schematic-faithful = 2 SN fields
  // + meter + own-needs + source).
  const W = companion.fields.length >= 5 ? 300 : 240;
  const busY = 0;
  const busX1 = -W / 2;
  const busX2 = W / 2;
  const busKv = companion.voltage_flow.buses[pccRef]?.un_kv ?? 15;
  const busColor = busColorForVoltage(busKv);

  // Field columns left→right: connection (grid side), [switch SŁ2+U], measurement,
  // [own-needs/load], source.
  const connX = busX1 + 34;
  const switchX = busX1 + 70;
  const meterX = busX1 + (switchField ? 106 : 78);
  const loadX = busX2 - 86;
  const srcX = busX2 - 40;

  // The incomer flow direction (reverse = export) from the solver.
  const incomerBranch: OzeVfBranch | undefined =
    INCOMER_REFS.map((r) => companion.voltage_flow.branches[r]).find((b) => b !== undefined);
  const incomerDir = incomerBranch?.direction ?? 'none';

  const handle = (id: string) => (onFieldClick ? (e: MouseEvent) => { e.stopPropagation(); onFieldClick(id); } : undefined);

  const breakerY = busY + (detail === 'far' ? 16 : 26);
  const relayY = breakerY + (detail === 'far' ? 12 : 18);
  // Source column: breaker → (transformer if the source sits behind one) → source.
  const srcBreakerY = busY + (detail === 'far' ? 16 : 26);
  // A transformer is drawn in the SOURCE column iff the source field is on a
  // DIFFERENT (lower) busbar than the PCC — i.e. a block/step-up transformer.
  const hasTrafo = !!srcField && srcField.on_bus_ref !== pccRef;
  const trafoY = srcBreakerY + (detail === 'far' ? 16 : 26);
  const srcSymY = (hasTrafo ? trafoY : srcBreakerY) + (detail === 'far' ? 16 : 28);

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

      {/* ─── GRID SIDE: the OSD network stub + the BOUNDARY marker ─── */}
      <line data-testid="oze-grid-stub" x1={busX1 - 30} y1={busY} x2={busX1} y2={busY} stroke="#5A6B78" strokeWidth={2.4} strokeDasharray="5 3" />
      {detail !== 'far' && (
        <text x={busX1 - 15} y={busY - 8} textAnchor="middle" fill="#7E8790" fontFamily={FONT_MONO} fontSize={6.6} fontWeight={700}>SIEĆ OSD</text>
      )}
      {/* Boundary marker (axis-6 variant) — a labelled diamond on the grid edge. */}
      <g data-testid="oze-boundary-marker" data-variant={boundary.variant} data-enm-variant={boundary.enm_connection_variant}>
        <polygon points={`${busX1},${busY - 6} ${busX1 + 6},${busY} ${busX1},${busY + 6} ${busX1 - 6},${busY}`} fill="#0A1622" stroke="#9FE6FF" strokeWidth={1.6} />
        {detail !== 'far' && (
          <text x={busX1} y={busY + 18} textAnchor="middle" fill="#9FE6FF" fontFamily={FONT_MONO} fontSize={6.4} fontWeight={800}>
            {`${boundary.variant}${boundary.metered ? ' ⊟' : ''}`}
          </text>
        )}
      </g>

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
          <line x1={connX} y1={busY} x2={connX} y2={breakerY - (detail === 'far' ? 6 : 8)} stroke={busColor} strokeWidth={1.8} />
          <g data-testid="oze-conn-breaker" data-symbol-shape="square" data-state="closed">
            <ApparatusCbSquare cx={connX} cy={breakerY} state="closed" energized />
          </g>
          {/* Export/import flow arrow on the connection path (direction from solver). */}
          {detail !== 'far' && <FlowArrow x={connX} topY={busY + 3} botY={busY + 18} direction={incomerDir} />}
          {/* Field label ABOVE the breaker (right of the path) — clear of the codes. */}
          {detail !== 'far' && (
            <text x={connX + 11} y={breakerY - 4} textAnchor="start" fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_SANS} fontSize={6.6} fontWeight={700}>
              {`PRZYŁ. ${connField.abb_cell}`}
            </text>
          )}
          {/* Interface-protection relay (gate I): a relay box BELOW the breaker
              with the codes wrapped in a NARROW right-hung stack (≤4 per row), so
              it never reaches the hierarchy block on the far left. */}
          {detail === 'close' && (() => {
            const codes = connField.protection_codes;
            const rows: string[] = [];
            for (let i = 0; i < codes.length; i += 4) rows.push(codes.slice(i, i + 4).join('·'));
            return (
              <g data-testid="oze-protection" data-machine-type={src.machine_type} data-on-field="connection" pointerEvents="none">
                <rect x={connX - 4} y={relayY - 4} width={8} height={8} rx={1} fill="#0A1622" stroke="#5BE08A" strokeWidth={1} />
                <text x={connX} y={relayY + 2.4} textAnchor="middle" fill="#5BE08A" fontFamily={FONT_MONO} fontSize={5} fontWeight={800}>R</text>
                {rows.map((r, i) => (
                  <text key={i} x={connX + 8} y={relayY + 1 + i * 7} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={5.8} fontWeight={700}>{r}</text>
                ))}
              </g>
            );
          })()}
        </g>
      )}

      {/* ─── SWITCH field (POLE NR 2 — SŁ2+U): rozłącznik ◇ + uziemnik ─── */}
      {switchField && (
        <g
          data-testid="oze-field-switch"
          data-field-role="switch"
          data-abb-cell={switchField.abb_cell}
          data-source-ref={switchField.source_ref}
          onClick={handle(`${companion.archetype}/${switchField.field_id}`)}
          style={{ cursor: onFieldClick ? 'pointer' : 'default' }}
        >
          <line x1={switchX} y1={busY} x2={switchX} y2={breakerY - 7} stroke={busColor} strokeWidth={1.8} />
          {/* rozłącznik ◇ (upright, state by colour) */}
          <g data-symbol-shape="diamond" data-state="closed">
            <polygon points={`${switchX},${breakerY - 6} ${switchX + 6},${breakerY} ${switchX},${breakerY + 6} ${switchX - 6},${breakerY}`} fill="#0A8D43" stroke={COLOR_DEVICE_CLOSED_BORDER} strokeWidth={1.6} />
            <line x1={switchX} y1={breakerY - 4.5} x2={switchX} y2={breakerY + 4.5} stroke={COLOR_DEVICE_CLOSED_BORDER} strokeWidth={1.3} />
          </g>
          {/* uziemnik (earth branch, left) */}
          <line x1={switchX} y1={breakerY + 6} x2={switchX} y2={breakerY + 11} stroke={busColor} strokeWidth={1.4} />
          <line x1={switchX - 4} y1={breakerY + 11} x2={switchX + 4} y2={breakerY + 11} stroke={busColor} strokeWidth={1.4} />
          <line x1={switchX - 2.5} y1={breakerY + 13} x2={switchX + 2.5} y2={breakerY + 13} stroke={busColor} strokeWidth={1.1} />
          {detail !== 'far' && (
            <text x={switchX} y={breakerY + 24} textAnchor="middle" fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_SANS} fontSize={6.4} fontWeight={700} paintOrder="stroke" stroke="#05070A" strokeWidth={2}>
              {`SŁ2+U ${switchField.abb_cell}`}
            </text>
          )}
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

      {/* ─── OWN-LOAD field (POTRZEBY_WLASNE) — customer station consumption ─── */}
      {loadField && (
        <g
          data-testid="oze-field-load"
          data-field-role="load"
          data-abb-cell={loadField.abb_cell}
          data-source-ref={loadField.source_ref}
          onClick={handle(`${companion.archetype}/${loadField.field_id}`)}
          style={{ cursor: onFieldClick ? 'pointer' : 'default' }}
        >
          <line x1={loadX} y1={busY} x2={loadX} y2={srcSymY - 6} stroke={busColor} strokeWidth={1.8} />
          {/* Load symbol — a filled downward triangle (IEC consumer). */}
          {detail !== 'far' && (
            <polygon points={`${loadX - 5},${srcSymY - 6} ${loadX + 5},${srcSymY - 6} ${loadX},${srcSymY + 3}`} fill="#7DD3FC" stroke="#7DD3FC" strokeWidth={1} />
          )}
          {detail !== 'far' && (
            <text x={loadX} y={srcSymY + (detail === 'close' ? 14 : 12)} textAnchor="middle" fill="#7DD3FC" fontFamily={FONT_SANS} fontSize={6.6} fontWeight={700} paintOrder="stroke" stroke="#05070A" strokeWidth={2}>
              {`ODB. WŁ. (${loadField.abb_cell})`}
            </text>
          )}
        </g>
      )}

      {/* ─── SOURCE field: breaker → (transformer) → source symbol ─── */}
      {srcField && (
        <g
          data-testid="oze-field-source"
          data-field-role="source"
          data-abb-cell={srcField.abb_cell}
          data-source-ref={srcField.source_ref}
          data-interface-protection="false"
          onClick={handle(`${companion.archetype}/${srcField.field_id}`)}
          style={{ cursor: onFieldClick ? 'pointer' : 'default' }}
        >
          <line x1={srcX} y1={busY} x2={srcX} y2={srcBreakerY - (detail === 'far' ? 6 : 8)} stroke={busColor} strokeWidth={1.8} />
          <g data-testid="oze-source-breaker" data-symbol-shape="square" data-state="closed">
            <ApparatusCbSquare cx={srcX} cy={srcBreakerY} state="closed" energized />
          </g>
          {hasTrafo ? (
            <>
              <line x1={srcX} y1={srcBreakerY + (detail === 'far' ? 6 : 8)} x2={srcX} y2={trafoY - 9} stroke={busColor} strokeWidth={1.8} />
              <ApparatusTransformerSymbol cx={srcX} cy={trafoY} vectorGroup="Dyn5" neutralEarthed />
              <line x1={srcX} y1={trafoY + 9} x2={srcX} y2={srcSymY - 8} stroke="#7DD3FC" strokeWidth={1.8} />
            </>
          ) : (
            <line x1={srcX} y1={srcBreakerY + (detail === 'far' ? 6 : 8)} x2={srcX} y2={srcSymY - 8} stroke={busColor} strokeWidth={1.8} />
          )}
          {detail !== 'far' && <PvInverterSymbol cx={srcX} cy={srcSymY} r={detail === 'close' ? 8 : 7} />}
          {detail !== 'far' && (
            <text x={srcX} y={srcSymY + (detail === 'close' ? 16 : 14)} textAnchor="middle" fill="#FFB020" fontFamily={FONT_SANS} fontSize={7} fontWeight={700} paintOrder="stroke" stroke="#05070A" strokeWidth={2}>
              {`${srcField.kind} (${srcField.abb_cell})`}
            </text>
          )}
          {detail === 'far' && (
            <text x={srcX} y={srcSymY + 4} textAnchor="middle" fill="#FFB020" fontFamily={FONT_MONO} fontSize={8} fontWeight={800}>{src.technology}</text>
          )}
        </g>
      )}

      {/* Concise results at objects (close zoom): per-bus U + Ik'' + ≤Icw +
          contribution — stacked on the RIGHT of the busbar, clear of the fields. */}
      {detail === 'close' && Object.keys(companion.voltage_flow.buses).sort().map((busRef, i) => {
        const vf = companion.voltage_flow.buses[busRef];
        const sc = companion.short_circuit.buses[busRef];
        if (!vf || !sc) return null;
        return <BusResults key={busRef} vf={vf} sc={sc} x={busX2 + 18} y={busY + 16 + i * 40} />;
      })}

      {/* Power hierarchy (gate H), close zoom, BELOW the unit on the left — clear
          of the connection-field protection codes. */}
      {detail === 'close' && <PowerHierarchy h={src.power_hierarchy} x={busX1 - 30} y={busY + 76} />}

      {/* Schematic equipment register (close zoom) — the distinguishing block of a
          template DISTILLED from a real drawing: transformer/CT/VT/grid/modules,
          each pinned to the schematic (source_ref). Placed BOTTOM-LEFT, below the
          power hierarchy, clear of the right-side bus-result panels. */}
      {detail === 'close' && schematic && (
        <g data-testid="oze-schematic" data-source-ref={schematic.source_ref} pointerEvents="none">
          <text x={busX1 - 30} y={busY + 130} fill="#9FE6FF" fontFamily={FONT_MONO} fontSize={7} fontWeight={800}>
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
            <text key={i} x={busX1 - 30} y={busY + 139 + i * 8} fill={i === 3 ? COLOR_TEXT_MUTED : COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={6} fontWeight={i === 3 ? 400 : 600}>
              {ln}
            </text>
          ))}
        </g>
      )}
    </g>
  );
}
