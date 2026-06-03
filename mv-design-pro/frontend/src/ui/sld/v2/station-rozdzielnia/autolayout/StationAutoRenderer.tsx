/**
 * E2 AUTO-LAYOUT — thin renderer: draws the E0 canon symbols at the GEOMETRY the engine produced
 * from the MODEL. It owns NO layout maths (all positions come from StationLayout) and NO physics
 * (readout values are read straight from the FROZEN-solver companion). This is the "renderer fed
 * by the layout layer" — the canon presets are reproduced from the model, not hand-placed.
 */
import {
  AMBER,
  AsyncMachine,
  CtRing,
  fmt,
  Glowica,
  InverterSym,
  lbl,
  NN_BUS,
  NodeReadout,
  Odlacznik,
  PINK,
  PowerArrow,
  RelayBox,
  SANS,
  SN_BUS,
  SyncMachine,
  TrafoDyn,
  TXT,
  TXT2,
  TXT_MUTED,
  VtNoGround,
  Wylacznik,
} from '../canon/sldCanonKit';
import type { OzeScBus, SldOzeArchetypeCompanion } from '../companions/ozeTypes';
import type { BayPlacement, StationLayout } from './stationLayout';

const kv = (v: number): string => (Number.isInteger(v) ? String(v) : fmt(v, 2));

function sourceGlyph(kind: BayPlacement['sourceKind'], x: number, y: number): JSX.Element {
  if (kind === 'SYNCHRONOUS') return <SyncMachine x={x} y={y} />;
  if (kind === 'ASYNCHRONOUS') return <AsyncMachine x={x} y={y} />;
  return <InverterSym x={x} y={y} />;
}

function Bay({ bay, busColor }: { bay: BayPlacement; busColor: string }): JSX.Element {
  const { x, busY, anchorY, role } = bay;
  return (
    <g data-testid={`auto-bay-${bay.id}`} data-role={role} data-source-kind={bay.sourceKind ?? ''}>
      <line x1={x} y1={busY} x2={x} y2={anchorY} stroke={busColor} strokeWidth={2} />
      <Odlacznik x={x} y={busY + 50} />
      {role !== 'metering' && <Wylacznik x={x} y={busY + 100} />}
      {role === 'line' && (
        <>
          <PowerArrow x={x} y={anchorY - 40} dir="down" />
          <Glowica x={x} y={anchorY} />
          {lbl(x + 14, anchorY + 4, 'kabel → OSD', TXT_MUTED, 8.5, 600)}
        </>
      )}
      {role === 'metering' && (
        <>
          <CtRing x={x} y={busY} />
          <VtNoGround x={x} y={busY + 130} />
          {lbl(x - 4, anchorY, 'POMIAR (CT+VT+Wh)', AMBER, 9, 700, 'middle')}
          {lbl(x - 4, anchorY + 13, 'granica — bez ⊟/PCC', TXT_MUTED, 8, 600, 'middle')}
        </>
      )}
      {role === 'transformer' && (
        <>
          <RelayBox x={x - 78} y={busY + 100} label="TR" />
          <TrafoDyn x={x} y={(busY + anchorY) / 2} />
        </>
      )}
      {role === 'source' && (
        <>
          <PowerArrow x={x} y={busY + 28} dir="up" />
          {sourceGlyph(bay.sourceKind, x, anchorY)}
          {lbl(x, anchorY + 26, bay.label, TXT, 8.5, 700, 'middle')}
        </>
      )}
    </g>
  );
}

export function StationAutoRenderer({
  layout,
  companion,
}: {
  layout: StationLayout;
  companion: SldOzeArchetypeCompanion;
}): JSX.Element {
  const sc = companion.short_circuit.buses;
  const vf = companion.voltage_flow.buses;
  const readoutX = layout.bbox.x + layout.bbox.width - 230;

  return (
    <g data-testid="sld-autolayout" data-hash={layout.hash}>
      <text x={layout.bbox.x + layout.bbox.width / 2} y={layout.bbox.y + 24} textAnchor="middle"
        fill="#F4F6F8" fontFamily={SANS} fontSize={16} fontWeight={800}>
        {`AUTO-LAYOUT (E2) ze MODELU — ${companion.archetype}`}
      </text>

      {/* ── busbars (one horizontal bar per voltage tier) ── */}
      {layout.buses.map((bus) => {
        const color = bus.unKv >= 1 ? SN_BUS : NN_BUS;
        return (
          <g key={bus.id} data-testid={`auto-bus-${bus.id}`}>
            <line x1={bus.x1} y1={bus.y} x2={bus.x2} y2={bus.y} stroke={color} strokeWidth={5} strokeLinecap="round" />
            {lbl(bus.x1 - 12, bus.y + 4, `${kv(bus.unKv)} kV`, TXT2, 11, 700, 'end')}
          </g>
        );
      })}

      {/* ── transformer drops (vertical, between tiers) ── */}
      {layout.transformers.map((tr) => (
        <line key={tr.id} x1={tr.x} y1={tr.hvY} x2={tr.x} y2={tr.lvY} stroke={PINK} strokeWidth={1.4} strokeDasharray="2 4" />
      ))}

      {/* ── bays ── */}
      {layout.bays.map((bay) => {
        const bus = layout.buses.find((b) => b.id === bay.busId)!;
        return <Bay key={bay.id} bay={bay} busColor={bus.unKv >= 1 ? SN_BUS : NN_BUS} />;
      })}

      {/* ── node readouts (one per bus that has SC data), to the right ── */}
      {layout.buses.map((bus, i) => {
        const b: OzeScBus | undefined = sc[bus.id];
        const v = vf[bus.id];
        if (!b || !v) return null;
        const cc = b.source_contribution;
        const share =
          cc.machine_type === 'MIXED'
            ? `sieć + masz ${fmt(cc.machine_ka ?? 0, 2)} + IBG ${fmt(cc.ibg_ka ?? 0, 2)} kA`
            : `udział ${cc.machine_type} ${fmt(cc.ik_contribution_ka, 2)} kA`;
        return (
          <NodeReadout key={bus.id} x={readoutX} y={bus.y + 36} n={i + 1} title={`${bus.id} · ${kv(bus.unKv)} kV`}
            uKv={v.un_kv} uPu={v.u_pu} uOk={Math.abs(v.deviation_percent) <= 5}
            ik3fMax={b.max.ikss_ka} ik3fMin={b.min.ikss_ka} ik1f="—" share={share}
            icw={b.icw_ka} icwOk={b.verification.passed} ip={b.max.ip_ka} idyn={0} />
        );
      })}
    </g>
  );
}
