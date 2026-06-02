/**
 * Canonical SLD template — PRESET G2 (PV nN, prosument, IEC). Same skeleton + symbol
 * canon as G1 (from sldCanonKit), but REDUCED: a small PV connects DIRECTLY to the OSD
 * low-voltage network (TN) — no own SN bay, no step-up transformer. The OSD MV/LV
 * transformer is upstream (the OSD's). One node readout (nN busbar), solver-bound.
 *
 * Skeleton (preset layer): SIEĆ OSD nN → złącze (Q wyłącznik · pomiar Wh · GRANICA) →
 * nN busbar → falownik PV + odbiór. Symbols/readout/legend reused from the kit; the
 * only per-preset change is which tiers exist and the source/grid/earthing.
 */
import {
  AMBER,
  CYAN,
  fmt,
  GranicaMarker,
  InverterSym,
  ko,
  lbl,
  MONO,
  NN_BUS,
  NodeBadge,
  NodeReadout,
  Odlacznik,
  PINK,
  PowerArrow,
  RelayBox,
  SANS,
  TXT2,
  TXT_MUTED,
  Wylacznik,
} from './sldCanonKit';
import type { SldOzeArchetypeCompanion } from '../companions/ozeTypes';

/** PRESET G2 — PV nN (prosument). Direct LV connection to the OSD network (TN). */
export function SldCanonPresetG2({ companion }: { companion: SldOzeArchetypeCompanion }): JSX.Element {
  const nn = companion.voltage_flow.buses['NN_BUS'];
  const nnSc = companion.short_circuit.buses['NN_BUS'];
  const faln = nnSc.source_contribution.ik_contribution_ka ?? 0; // PV inverter (IBG) share
  const gridShare = Math.max(0, nnSc.max.ikss_ka - faln);
  const earthing = companion.source.grid_earthing;
  const withstand = companion.source.withstand;
  const ik1f = earthing ? `${fmt(earthing.ik_1f_ka)} kA · ${earthing.neutral_point}` : '—';
  const pvKw = Math.round(companion.source.power_hierarchy.pn_ac_kw);

  const busY = 360;
  const nnX1 = 240;
  const nnX2 = 900;
  const connX = 320; // złącze / OSD connection
  const pvX = 560;
  const loadX = 740;
  const nodeX = 980;
  const title = 'SZABLON SLD — PV nN (PROSUMENT, IEC)';
  const subtitle = `Przyłącze nN do sieci OSD (bez własnego TR SN) | nN 0,4 kV układ TN | PV ${pvKw} kW`;

  return (
    <g data-testid="sld-canon-g2">
      {/* ── header ── */}
      <text x={620} y={42} textAnchor="middle" fill="#F4F6F8" fontFamily={SANS} fontSize={22} fontWeight={800}>{title}</text>
      <text x={620} y={70} textAnchor="middle" fill={AMBER} fontFamily={SANS} fontSize={13} fontWeight={700}>{subtitle}</text>
      <text x={1140} y={108} textAnchor="end" fill={CYAN} fontFamily={SANS} fontSize={11} fontWeight={700}>WYNIKI w węźle — ze solwera (czas rzecz.) · klik węzeł → White Box</text>

      {/* ── złącze nN: SIEĆ OSD → Q wyłącznik → przekaźnik → pomiar Wh → GRANICA → szyna ── */}
      {lbl(connX, 138, 'SIEĆ OSD nN', TXT2, 12, 700, 'middle')}
      {lbl(connX, 152, '(za trafem MV/LV OSD)', TXT_MUTED, 8.5, 600, 'middle')}
      <line x1={connX} y1={160} x2={connX} y2={busY} stroke={NN_BUS} strokeWidth={2} />
      <PowerArrow x={connX - 16} y={188} dir="up" />
      {lbl(connX - 22, 184, 'eksport', PINK, 10, 800, 'end')}
      <Wylacznik x={connX} y={206} />
      {lbl(connX + 18, 210, 'Q wyłącznik główny', TXT2, 11, 700)}
      <RelayBox x={connX - 92} y={206} />
      <line x1={connX - 80} y1={206} x2={connX - 9} y2={206} stroke={CYAN} strokeWidth={1.3} strokeDasharray="3 3" />
      {lbl(connX - 150, 229, 'zab. przyłączeniowe', CYAN, 9.5, 700)}
      {lbl(connX - 150, 242, 'anti-islanding · U<> · f<> · df/dt', TXT_MUTED, 9, 600)}
      <g data-keepout={ko(connX - 11, 262, 22, 18)}>
        <rect x={connX - 11} y={262} width={22} height={18} rx={2} fill="#0A1622" stroke={AMBER} strokeWidth={1.6} />
        <text x={connX} y={275} textAnchor="middle" fill={AMBER} fontFamily={MONO} fontSize={9} fontWeight={800}>Wh</text>
      </g>
      {lbl(connX + 18, 275, 'POMIAR (wg OSD nN)', AMBER, 10.5, 700)}
      <GranicaMarker x={connX} y={312} />
      {lbl(connX + 18, 316, 'GRANICA · G-ZLICZE → OSD', TXT_MUTED, 9, 600)}

      {/* ── nN busbar ── */}
      <line x1={nnX1} y1={busY} x2={nnX2} y2={busY} stroke={NN_BUS} strokeWidth={5} strokeLinecap="round" />
      {lbl(nnX2 + 14, busY + 4, 'nN · 0,4 kV · TN', TXT2, 12, 700)}
      <NodeBadge x={nnX2 - 14} y={busY} n={1} />

      {/* ── falownik PV ── */}
      <line x1={pvX} y1={busY} x2={pvX} y2={busY + 30} stroke={NN_BUS} strokeWidth={1.8} />
      <PowerArrow x={pvX - 16} y={busY + 24} dir="up" />
      <Odlacznik x={pvX} y={busY + 44} />
      <line x1={pvX} y1={busY + 53} x2={pvX} y2={busY + 70} stroke={NN_BUS} strokeWidth={1.8} />
      <InverterSym x={pvX} y={busY + 87} />
      {lbl(pvX, busY + 120, `PV ${pvKw} kW`, AMBER, 11, 800, 'middle')}
      {lbl(pvX, busY + 133, `falownik IBG · Ik″ ≈ ${fmt(faln, 2)} kA`, TXT2, 9, 700, 'middle')}

      {/* ── odbiór (local load) ── */}
      <line x1={loadX} y1={busY} x2={loadX} y2={busY + 60} stroke={NN_BUS} strokeWidth={1.8} />
      <polygon points={`${loadX - 7},${busY + 60} ${loadX + 7},${busY + 60} ${loadX},${busY + 74}`} fill="#7DD3FC" stroke="#7DD3FC" strokeWidth={1} />
      {lbl(loadX, busY + 92, 'ODBIÓR własny', TXT2, 10, 700, 'middle')}

      {/* ── node ① readout ── */}
      <NodeReadout x={nodeX} y={busY - 124} n={1} title="szyna nN · 0,40 kV · TN"
        uKv={nn.un_kv} uPu={nn.u_pu} uOk={Math.abs(nn.deviation_percent) <= 5}
        ik3fMax={nnSc.max.ikss_ka} ik3fMin={nnSc.min.ikss_ka}
        ik1f={ik1f} share={`OSD ${fmt(gridShare, 1)} + faln. ${fmt(faln, 2)} kA`}
        icw={nnSc.icw_ka} icwOk={nnSc.verification.passed}
        ip={nnSc.max.ip_ka} idyn={withstand?.nn_idyn_ka ?? 0} />

      {/* ── LEGENDA — symbole IEC (wspólny kanon) ── */}
      <rect x={80} y={560} width={1060} height={86} rx={8} fill="none" stroke="#13435A" strokeWidth={1} />
      {lbl(104, 584, 'LEGENDA — symbole IEC', '#9FE6FF', 12, 800)}
      {[
        ['WYŁĄCZNIK □', (cx: number, cy: number) => <Wylacznik x={cx} y={cy} />],
        ['ODŁĄCZNIK ◯', (cx: number, cy: number) => <Odlacznik x={cx} y={cy} />],
        ['ZABEZPIECZENIE', (cx: number, cy: number) => <RelayBox x={cx} y={cy} />],
        ['FALOWNIK ~/=', (cx: number, cy: number) => <InverterSym x={cx} y={cy} />],
        ['GRANICA / POMIAR', (cx: number, cy: number) => <GranicaMarker x={cx} y={cy} />],
        ['kierunek mocy', (cx: number, cy: number) => <PowerArrow x={cx} y={cy - 9} dir="up" />],
      ].map(([label, sym], i) => {
        const cx = 180 + i * 138;
        const cy = 612;
        return (
          <g key={String(label)}>
            {(sym as (a: number, b: number) => JSX.Element)(cx, cy)}
            {lbl(cx, cy + 28, String(label), TXT_MUTED, 9, 700, 'middle')}
          </g>
        );
      })}
    </g>
  );
}
