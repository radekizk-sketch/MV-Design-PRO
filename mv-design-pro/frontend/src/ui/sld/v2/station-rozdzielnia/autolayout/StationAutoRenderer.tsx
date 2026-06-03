/**
 * E2 AUTO-LAYOUT — thin renderer: GEOMETRY only. It positions the E0 canon symbols and reads the
 * SAME FROZEN-solver companion for every value (idyn, F-1 share breakdown, 1f-z) — it does NOT
 * re-implement the model or the readouts. The output therefore MATCHES the hand-coded preset for
 * the same companion; only the positions come from the engine. No PCC name/marker (canon).
 */
import {
  AMBER,
  AsyncMachine,
  CtRing,
  CYAN,
  fmt,
  Glowica,
  InverterSym,
  lbl,
  NN_BUS,
  NodeReadout,
  Odlacznik,
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
import type { OzeScBus, OzeSourceContribution, SldOzeArchetypeCompanion } from '../companions/ozeTypes';
import type { BayPlacement, StationLayout } from './stationLayout';

const kv = (v: number): string => (Number.isInteger(v) ? String(v) : fmt(v, 2));

/** Wrap protection codes into ≤n-per-line groups (the per-bay annotation stays inside its pitch). */
function chunk<T>(arr: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Local per-node share, the SAME breakdown as the canon: "sieć X + maszyna/IBG …"; zero terms
 *  dropped (PV node = IBG-only; machine node = machine-only); never a raw machine_type enum. On a
 *  MIXED collector both terms show (sources funnel up); on a LOWER bus only the term whose source
 *  is LOCAL there (a sibling LV bus does not contribute its IBG/machine through the grid). */
function shareLabel(
  cc: OzeSourceContribution,
  ikss: number,
  opts: { isCollector: boolean; hasLocalIbg: boolean; hasLocalMachine: boolean },
): string {
  if (cc.machine_type === 'MIXED') {
    const m = opts.isCollector || opts.hasLocalMachine ? cc.machine_ka ?? 0 : 0;
    const ibg = opts.isCollector || opts.hasLocalIbg ? cc.ibg_ka ?? 0 : 0;
    const parts = [`sieć ${fmt(Math.max(0, ikss - m - ibg), 1)}`];
    if (m > 0.005) parts.push(`masz ${fmt(m, 2)}`);
    if (ibg > 0.005) parts.push(`IBG ${fmt(ibg, 2)}`);
    return `${parts.join(' + ')} kA`;
  }
  const c = cc.ik_contribution_ka;
  const tag = cc.machine_type === 'IBG' ? 'IBG' : 'maszyna';
  return `sieć ${fmt(Math.max(0, ikss - c), 1)} + ${tag} ${fmt(c, 2)} kA`;
}

function sourceGlyph(kind: BayPlacement['sourceKind'], x: number, y: number): JSX.Element {
  if (kind === 'SYNCHRONOUS') return <SyncMachine x={x} y={y} />;
  if (kind === 'ASYNCHRONOUS') return <AsyncMachine x={x} y={y} />;
  return <InverterSym x={x} y={y} />;
}

/** Short PRIMARY relay tag for the RelayBox glyph (the full set is spelled out beneath it).
 *  Same convention as the hand-coded GPO preset: synchr → 87G, async → 51, IBG → AI. */
function relayTag(kind: BayPlacement['sourceKind']): string {
  return kind === 'SYNCHRONOUS' ? '87G' : kind === 'ASYNCHRONOUS' ? '51' : 'AI';
}

/** Relay annotation in a bay (E1 RelayBox + the protection_codes FROM THE MODEL): the interface
 *  NC RfG set on the connection bay, the per-source machine/IBG set on a source bay. Dashed amber
 *  link to the bay drop, codes wrapped to stay inside the pitch. Nothing drawn when codes empty. */
function ProtBadge({ x, y, codes, iface, tag }: {
  x: number; y: number; codes: readonly string[]; iface: boolean; tag: string;
}): JSX.Element | null {
  if (codes.length === 0) return null;
  const rx = x - 60;
  const lines = chunk(codes, 5).map((c) => c.join(' · '));
  return (
    <g data-testid="auto-prot" data-iface={iface ? '1' : '0'}>
      <RelayBox x={rx} y={y} label={iface ? 'NC' : tag} />
      <line x1={rx + 12} y1={y} x2={x - 9} y2={y} stroke={AMBER} strokeWidth={1.2} strokeDasharray="3 3" />
      {lbl(rx, y + 23, iface ? 'zab. interfejsowe (NC RfG)' : 'zab. pola', CYAN, 7.5, 700, 'middle')}
      {lines.map((ln, i) => <g key={i}>{lbl(rx, y + 34 + i * 11, ln, TXT_MUTED, 7, 600, 'middle')}</g>)}
    </g>
  );
}

/** A bay drawn at the geometry. SN bays carry the standard odłącznik + wyłącznik; an nN OUTGOING
 *  bay carries ONE apparatus (the main breaker is the transformer incomer — drawn there). */
function Bay({ bay, busColor, lv, codes, iface }: {
  bay: BayPlacement; busColor: string; lv: boolean; codes: readonly string[]; iface: boolean;
}): JSX.Element {
  const { x, busY, anchorY, role } = bay;
  return (
    <g data-testid={`auto-bay-${bay.id}`} data-role={role} data-source-kind={bay.sourceKind ?? ''}>
      <line x1={x} y1={busY} x2={x} y2={anchorY} stroke={busColor} strokeWidth={2} />
      {role === 'metering' ? null : lv ? (
        <Wylacznik x={x} y={busY + 46} />
      ) : (
        <>
          <Odlacznik x={x} y={busY + 46} />
          <Wylacznik x={x} y={busY + 96} />
        </>
      )}
      {role !== 'metering' && <ProtBadge x={x} y={busY + (lv ? 46 : 96)} codes={codes} iface={iface} tag={relayTag(bay.sourceKind)} />}
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
          <VtNoGround x={x} y={busY + 120} />
          {lbl(x - 4, anchorY, 'POMIAR rozliczeniowy', AMBER, 9, 700, 'middle')}
          {lbl(x - 4, anchorY + 13, 'granica = układ pomiarowy (CT+VT)', TXT_MUTED, 8, 600, 'middle')}
        </>
      )}
      {role === 'source' && (
        <>
          <PowerArrow x={x} y={busY + (lv ? 24 : 124)} dir="up" />
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
  const e = companion.source.grid_earthing;
  const readoutX = layout.bbox.x + layout.bbox.width - 230;
  const trafoBusIds = new Set(layout.transformers.map((t) => t.id.replace(/^tr\//, '')));
  // Protection codes per bay, READ FROM THE MODEL (field.protection_codes by field_id): the
  // interface NC RfG set on the connection bay; the per-source set on each source bay. A
  // single-machine archetype (G8) keeps its machine set on source.protection — use it when the
  // field itself is empty. The renderer never invents a function code.
  const fieldById = new Map(companion.fields.map((f) => [f.field_id, f]));
  const bayProtection = (bay: BayPlacement): { codes: readonly string[]; iface: boolean } => {
    const f = fieldById.get(bay.id);
    if (!f) return { codes: [], iface: false };
    if (f.protection_codes.length) return { codes: f.protection_codes, iface: f.interface_protection };
    if (bay.role === 'source' && companion.source.protection?.machine?.length)
      return { codes: companion.source.protection.machine, iface: false };
    return { codes: [], iface: f.interface_protection };
  };

  return (
    <g data-testid="sld-autolayout" data-hash={layout.hash}>
      <text x={layout.bbox.x + layout.bbox.width / 2} y={layout.bbox.y + 24} textAnchor="middle"
        fill="#F4F6F8" fontFamily={SANS} fontSize={16} fontWeight={800}>
        {`AUTO-LAYOUT (E2) ze MODELU — ${companion.archetype}`}
      </text>

      {/* ── busbars (one per voltage tier) ── */}
      {layout.buses.map((bus) => (
        <g key={bus.id} data-testid={`auto-bus-${bus.id}`}>
          <line x1={bus.x1} y1={bus.y} x2={bus.x2} y2={bus.y} stroke={bus.unKv >= 1 ? SN_BUS : NN_BUS} strokeWidth={5} strokeLinecap="round" />
          {lbl(bus.x1 - 12, bus.y + 4, `${kv(bus.unKv)} kV`, TXT2, 11, 700, 'end')}
        </g>
      ))}

      {/* ── transformers: SOLID vertical drop spanning tiers — TrafoDyn + nN MAIN BREAKER (51/87T)
            incomer; the nN busbar sits DIRECTLY under it. No floating box, no dotted line. ── */}
      {layout.transformers.map((tr) => {
        const mid = (tr.hvY + tr.lvY) / 2;
        return (
          <g key={tr.id} data-testid={`auto-tr-${tr.id}`}>
            <line x1={tr.x} y1={tr.hvY} x2={tr.x} y2={tr.lvY} stroke={SN_BUS} strokeWidth={2} />
            <Odlacznik x={tr.x} y={tr.hvY + 46} />
            <Wylacznik x={tr.x} y={tr.hvY + 96} />
            <TrafoDyn x={tr.x} y={mid} />
            {lbl(tr.x + 16, mid - 2, 'Dyn', TXT2, 8.5, 700)}
            <Wylacznik x={tr.x} y={tr.lvY - 46} />
            {lbl(tr.x + 16, tr.lvY - 42, 'Q gł. nN · 51/87T', TXT_MUTED, 8, 600)}
          </g>
        );
      })}

      {/* ── bays (transformer poles are drawn by the transformer loop above) ── */}
      {layout.bays
        .filter((bay) => bay.role !== 'transformer')
        .map((bay) => {
          const bus = layout.buses.find((b) => b.id === bay.busId)!;
          const prot = bayProtection(bay);
          return <Bay key={bay.id} bay={bay} busColor={bus.unKv >= 1 ? SN_BUS : NN_BUS}
            lv={trafoBusIds.has(bay.busId)} codes={prot.codes} iface={prot.iface} />;
        })}

      {/* ── node readouts (from the companion — idyn, share, 1f-z), to the right; no PCC name ── */}
      {layout.buses.map((bus, i) => {
        const b: OzeScBus | undefined = sc[bus.id];
        const v = vf[bus.id];
        if (!b || !v) return null;
        const isSn = bus.unKv >= 1;
        const localSrc = layout.bays.filter((bay) => bay.busId === bus.id && bay.role === 'source');
        const hasLocalIbg = localSrc.some((s) => s.sourceKind === 'IBG' || s.sourceKind === undefined);
        const hasLocalMachine = localSrc.some((s) => s.sourceKind === 'SYNCHRONOUS' || s.sourceKind === 'ASYNCHRONOUS');
        return (
          <NodeReadout key={bus.id} x={readoutX} y={bus.y + 30} n={i + 1}
            title={`szyna ${isSn ? 'SN' : 'nN'} · ${kv(bus.unKv)} kV`}
            uKv={v.un_kv} uPu={v.u_pu} uOk={Math.abs(v.deviation_percent) <= 5}
            ik3fMax={b.max.ikss_ka} ik3fMin={b.min.ikss_ka}
            ik1f={isSn && e ? `${fmt(e.ik_1f_ka)} kA · ${e.neutral_point}` : 'lok. (za trafem)'}
            share={shareLabel(b.source_contribution, b.max.ikss_ka, { isCollector: bus.band === 0, hasLocalIbg, hasLocalMachine })}
            icw={b.icw_ka} icwOk={b.verification.passed}
            ip={b.max.ip_ka} idyn={b.idyn_ka} />
        );
      })}
    </g>
  );
}
