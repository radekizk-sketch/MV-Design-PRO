/**
 * E3b — GPZ as a FULL SWITCHGEAR (not a box). Renders the GPZ 110/15 substation operator-grade,
 * straight from the model: WN (110 kV) incomer field → WN/SN transformer(s) with on-load tap →
 * 15 kV busbar section(s) → numbered outgoing feeder fields (odłącznik · wyłącznik · CT · głowica ·
 * protection · destination). Title block + IEC legend. Geometry is deterministic from the model
 * counts; glyphs are the E0 canon. Live U/I/P/Q is the E4 overlay (added later) — here: structure.
 */
import {
  AMBER,
  CtRing,
  fmt,
  Glowica,
  lbl,
  Odlacznik,
  PowerArrow,
  RelayBox,
  SANS,
  SN_BUS,
  TrafoDyn,
  TXT,
  TXT2,
  TXT_MUTED,
  Wylacznik,
} from '../../canon/sldCanonKit';
import type { NetworkGpz } from './networkModel';

const HV = '#B07CC6'; // 110 kV (violet — distinct from the 15 kV green busbar)
const PITCH = 180;
const X0 = 130; // left margin (room for the kV labels)

export interface GpzSwitchgearGeometry {
  readonly width: number;
  readonly height: number;
}

function feederCount(gpz: NetworkGpz): number {
  return Math.max(1, gpz.sections.reduce((n, s) => n + s.feeders.length, 0));
}

/** Deterministic canvas size from the model counts. */
export function gpzSwitchgearSize(gpz: NetworkGpz): GpzSwitchgearGeometry {
  const cols = Math.max(feederCount(gpz), gpz.transformers.length, 1);
  return { width: Math.max(660, X0 + 260 + cols * PITCH), height: 700 };
}

export function GpzSwitchgear({ gpz, x = 0, y = 0 }: { gpz: NetworkGpz; x?: number; y?: number }): JSX.Element {
  const size = gpzSwitchgearSize(gpz);
  // vertical flow (title spans the top; the switchgear is laid out below it)
  const wnArrowY = y + 96;
  const wnBusY = y + 196;
  const trY = y + 280;
  const snBusY = y + 392;
  const legendY = y + 624;

  const trafos = gpz.transformers.length ? gpz.transformers : [{ id: 'TR1', mva: 0, uhv_kv: gpz.hv_kv, ulv_kv: gpz.sn_kv }];
  const trXs = trafos.map((_, i) => x + X0 + 40 + i * PITCH);
  const feeders = gpz.sections.flatMap((s, si) => s.feeders.map((f, fi) => ({ ...f, section: s.name, n: si * 10 + fi + 1 })));
  const feederXs = feeders.map((_, i) => x + X0 + 240 + i * PITCH);

  const busX1 = x + X0 - 10;
  const busX2 = Math.max(...trXs, ...feederXs, x + X0 + 60) + 60;

  return (
    <g data-testid="gpz-switchgear">
      {/* ── title block (full width, top) ── */}
      <g data-testid="gpz-title">
        <rect x={x + 12} y={y + 12} width={size.width - 24} height={58} rx={6} fill="#0C1B27" stroke="#3A7CA5" strokeWidth={1.2} />
        <text x={x + 26} y={y + 40} fill="#FFD23F" fontFamily={SANS} fontSize={18} fontWeight={800}>{gpz.name}</text>
        {lbl(x + 26, y + 58, `ROZDZIELNIA ${fmt(gpz.hv_kv, 0)}/${fmt(gpz.sn_kv, 0)} kV`, TXT2, 10, 700)}
        {lbl(x + size.width - 26, y + 40, 'TRANSMISJA POPRAWNA', '#5BD6A6', 10, 700, 'end')}
        {lbl(x + size.width - 26, y + 58, `TR: ${trafos.length} · pola: ${feeders.length}`, TXT_MUTED, 9, 600, 'end')}
      </g>

      {/* ── WN (110 kV) incomer field: grid → odłącznik → wyłącznik → 110 busbar ── */}
      <g data-testid="gpz-wn">
        <PowerArrow x={trXs[0]} y={wnArrowY} dir="down" />
        <line x1={trXs[0]} y1={wnArrowY + 12} x2={trXs[0]} y2={wnBusY} stroke={HV} strokeWidth={2} />
        <Odlacznik x={trXs[0]} y={wnArrowY + 36} />
        <Wylacznik x={trXs[0]} y={wnArrowY + 78} />
        {lbl(trXs[0] + 16, wnArrowY + 34, 'pole WN', TXT_MUTED, 8.5, 600)}
        <line x1={trXs[0] - 70} y1={wnBusY} x2={trXs[trafos.length - 1] + 70} y2={wnBusY} stroke={HV} strokeWidth={5} strokeLinecap="round" />
        {lbl(trXs[0] - 80, wnBusY + 4, `${fmt(gpz.hv_kv, 0)} kV`, HV, 11, 800, 'end')}
      </g>

      {/* ── WN/SN transformer(s) with on-load tap changer ── */}
      {trafos.map((tr, i) => (
        <g key={tr.id} data-testid={`gpz-tr-${tr.id}`}>
          <line x1={trXs[i]} y1={wnBusY} x2={trXs[i]} y2={trY - 16} stroke={HV} strokeWidth={2} />
          <TrafoDyn x={trXs[i]} y={trY} />
          <line x1={trXs[i] - 16} y1={trY + 10} x2={trXs[i] + 14} y2={trY - 12} stroke={AMBER} strokeWidth={1.3} />
          <path d={`M${trXs[i] + 14},${trY - 12} l-6,1 l3,5 z`} fill={AMBER} />
          {lbl(trXs[i] + 22, trY - 4, `TR${i + 1}`, TXT, 10, 800)}
          {lbl(trXs[i] + 22, trY + 9, `${fmt(tr.mva, 0)} MVA`, TXT2, 8.5, 700)}
          {lbl(trXs[i] + 22, trY + 21, `${fmt(tr.uhv_kv, 0)}/${fmt(tr.ulv_kv, 0)} kV · YNd11`, TXT_MUTED, 7.5, 600)}
          <line x1={trXs[i]} y1={trY + 16} x2={trXs[i]} y2={snBusY} stroke={SN_BUS} strokeWidth={2} />
        </g>
      ))}

      {/* ── 15 kV busbar section(s) ── */}
      <line x1={busX1} y1={snBusY} x2={busX2} y2={snBusY} stroke={SN_BUS} strokeWidth={5} strokeLinecap="round" />
      {lbl(busX1 - 8, snBusY - 10, `${fmt(gpz.sn_kv, 0)} kV · ${gpz.sections.map((s) => s.name).join(' · ') || 'Sekcja 1'}`, TXT2, 10, 800, 'start')}

      {/* ── outgoing feeder fields ── */}
      {feeders.map((f, i) => {
        const fx = feederXs[i];
        return (
          <g key={`${f.section}-${f.n}`} data-testid={`gpz-feeder-${f.n}`}>
            <line x1={fx} y1={snBusY} x2={fx} y2={snBusY + 196} stroke={SN_BUS} strokeWidth={1.8} />
            <rect x={fx - 13} y={snBusY + 10} width={26} height={12} rx={2} fill="#0A1622" stroke={TXT2} strokeWidth={0.8} />
            {lbl(fx, snBusY + 19, String(f.n), '#9FE6FF', 8, 800, 'middle')}
            <Odlacznik x={fx} y={snBusY + 44} />
            <Wylacznik x={fx} y={snBusY + 86} />
            <RelayBox x={fx - 40} y={snBusY + 86} label="I>" />
            <line x1={fx - 28} y1={snBusY + 86} x2={fx - 9} y2={snBusY + 86} stroke={AMBER} strokeWidth={1.1} strokeDasharray="3 3" />
            <CtRing x={fx} y={snBusY + 124} />
            <PowerArrow x={fx - 16} y={snBusY + 150} dir="down" />
            <Glowica x={fx} y={snBusY + 180} />
            {lbl(fx, snBusY + 200, f.name.replace(/^Pole\s+/i, ''), TXT, 8.5, 800, 'middle')}
            {f.to_name && lbl(fx, snBusY + 212, `→ ${f.to_name}`, TXT_MUTED, 8, 600, 'middle')}
          </g>
        );
      })}

      {/* ── IEC legend (operator chrome) ── */}
      <g data-testid="gpz-legend">
        <rect x={x + 12} y={legendY} width={430} height={56} rx={6} fill="none" stroke="#13435A" strokeWidth={1} />
        {lbl(x + 26, legendY + 22, 'LEGENDA — symbole IEC', '#9FE6FF', 10, 800)}
        <Odlacznik x={x + 40} y={legendY + 42} />
        {lbl(x + 56, legendY + 45, 'odłącznik', TXT_MUTED, 8, 600)}
        <Wylacznik x={x + 152} y={legendY + 42} />
        {lbl(x + 168, legendY + 45, 'wyłącznik', TXT_MUTED, 8, 600)}
        <CtRing x={x + 272} y={legendY + 42} />
        {lbl(x + 286, legendY + 45, 'CT', TXT_MUTED, 8, 600)}
        <Glowica x={x + 342} y={legendY + 42} />
        {lbl(x + 358, legendY + 45, 'głowica', TXT_MUTED, 8, 600)}
      </g>
    </g>
  );
}
