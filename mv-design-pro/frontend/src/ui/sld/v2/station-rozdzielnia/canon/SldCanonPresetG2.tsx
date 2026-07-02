/**
 * Canonical SLD template — PRESET G2 (PV nN, prosument, IEC). Same skeleton + symbol
 * canon as G1 (sldCanonKit), REDUCED: a small PV connects directly to the OSD LV network
 * (TN). The OSD MV/LV transformer is upstream (the OSD's). One node readout, solver-bound.
 *
 * Connection essence (grid → consumer): SIEĆ OSD nN → złącze + zab. przedlicznikowe (OSD)
 * → LICZNIK dwukierunkowy = GRANICA (the billing meter sits AT the supply boundary, AHEAD
 * of the consumer's main breaker, so the OSD meters import/export independent of the
 * consumer's switching) → wyłącznik główny odbiorcy (RGB, anti-islanding/U<>/f<>/df-dt) →
 * szyna nN → falownik PV + odbiór. No PCC. No separate boundary marker — the meter IS the
 * boundary.
 */
import {
  AMBER,
  CYAN,
  fmt,
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

/** A billing meter glyph (Wh) — for the prosumer it is bidirectional and IS the boundary. */
function MeterWh({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g data-keepout={ko(x - 12, y - 10, 24, 20)}>
      <rect x={x - 12} y={y - 10} width={24} height={20} rx={2} fill="#0A1622" stroke={AMBER} strokeWidth={1.7} />
      <text x={x} y={y + 4} textAnchor="middle" fill={AMBER} fontFamily={MONO} fontSize={10} fontWeight={800}>Wh</text>
    </g>
  );
}

/** PRESET G2 — PV nN (prosument). Direct LV connection to the OSD network (TN). */
export function SldCanonPresetG2({ companion }: { companion: SldOzeArchetypeCompanion }): JSX.Element {
  const nn = companion.voltage_flow.buses['NN_BUS'];
  const nnSc = companion.short_circuit.buses['NN_BUS'];
  const faln = nnSc.source_contribution.ik_contribution_ka ?? 0; // PV inverter (IBG) share
  const gridShare = Math.max(0, nnSc.max.ikss_ka - faln);
  const earthing = companion.source.grid_earthing;
  const ik1f = earthing ? `${fmt(earthing.ik_1f_ka)} kA · ${earthing.neutral_point}` : '—';
  const pvKw = Math.round(companion.source.power_hierarchy.pn_ac_kw);

  const busY = 430;
  const nnX1 = 240;
  const nnX2 = 900;
  const connX = 330; // złącze / metering / main-breaker spine
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
      <text x={1140} y={104} textAnchor="end" fill={CYAN} fontFamily={SANS} fontSize={11} fontWeight={700}>WYNIKI w węźle — ze solwera (czas rzecz.) · klik węzeł → White Box</text>

      {/* ── przyłącze (sieć OSD → odbiorca): fuse → LICZNIK (granica) → wył. główny ── */}
      {lbl(connX, 122, 'SIEĆ OSD nN', TXT2, 12, 700, 'middle')}
      {lbl(connX, 136, '(za trafem MV/LV OSD)', TXT_MUTED, 8.5, 600, 'middle')}
      <line x1={connX} y1={142} x2={connX} y2={busY} stroke={NN_BUS} strokeWidth={2} />

      {/* złącze + zabezpieczenie przedlicznikowe OSD (bezpiecznik) */}
      <g data-keepout={ko(connX - 5, 160, 10, 20)}>
        <rect x={connX - 5} y={160} width={10} height={20} rx={1.5} fill="#0A1622" stroke="#E6F2FF" strokeWidth={1.4} />
      </g>
      {lbl(connX + 16, 174, 'złącze · zab. przedlicznikowe (OSD)', TXT_MUTED, 9, 600)}

      {/* LICZNIK dwukierunkowy — pomiar rozliczeniowy = GRANICA własności/eksploatacji */}
      <MeterWh x={connX} y={224} />
      {lbl(connX + 18, 218, 'LICZNIK dwukier. — pomiar rozliczeniowy', AMBER, 10.5, 700)}
      {lbl(connX + 18, 231, 'GRANICA własności/eksploatacji (= licznik)', TXT_MUTED, 8.5, 600)}

      {/* wyłącznik główny odbiorcy (RGB) + zabezpieczenia interfejsowe — ZA licznikiem */}
      <Wylacznik x={connX} y={284} />
      {lbl(connX + 18, 288, 'wyłącznik główny odbiorcy (RGB)', TXT2, 11, 700)}
      <RelayBox x={connX - 92} y={284} />
      <line x1={connX - 80} y1={284} x2={connX - 9} y2={284} stroke={CYAN} strokeWidth={1.3} strokeDasharray="3 3" />
      {lbl(connX - 150, 307, 'zab. interfejsowe', CYAN, 9.5, 700)}
      {lbl(connX - 150, 320, 'anti-islanding · U<> · f<> · df/dt', TXT_MUTED, 9, 600)}

      {/* eksport (licznik dwukierunkowy: import/eksport wg bilansu PV–odbiór) */}
      <PowerArrow x={connX + 16} y={384} dir="up" />
      {lbl(connX + 24, 380, 'eksport / import (dwukier.)', PINK, 9.5, 800)}

      {/* ── szyna nN ── */}
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
        ip={nnSc.max.ip_ka} idyn={nnSc.idyn_ka} />

      {/* ── LEGENDA — symbole IEC (wspólny kanon) ── */}
      <rect x={80} y={630} width={1060} height={86} rx={8} fill="none" stroke="#13435A" strokeWidth={1} />
      {lbl(104, 654, 'LEGENDA — symbole IEC', '#9FE6FF', 12, 800)}
      {[
        ['WYŁĄCZNIK □', (cx: number, cy: number) => <Wylacznik x={cx} y={cy} />],
        ['ODŁĄCZNIK ◯', (cx: number, cy: number) => <Odlacznik x={cx} y={cy} />],
        ['ZABEZPIECZENIE', (cx: number, cy: number) => <RelayBox x={cx} y={cy} />],
        ['FALOWNIK ~/=', (cx: number, cy: number) => <InverterSym x={cx} y={cy} />],
        ['LICZNIK (granica)', (cx: number, cy: number) => <MeterWh x={cx} y={cy} />],
        ['kierunek mocy', (cx: number, cy: number) => <PowerArrow x={cx} y={cy - 9} dir="up" />],
      ].map(([label, sym], i) => {
        const cx = 190 + i * 150;
        const cy = 682;
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
