/**
 * Canonical SLD template — PRESET G3 (BESS / magazyn energii, IEC). Same skeleton + symbol
 * canon as G1 (sldCanonKit): SN station via a step-up transformer, but the source is a
 * BIDIRECTIONAL battery PCS (4Q — ładowanie ⇄ rozładowanie). Two SN bays (Liniowe +
 * Transformatorowe), nN busbar with n×PCS + potrzeby własne. SoC/BMS live state lives in
 * the click-module, not on the canvas. Metering is instrument-transformer (CT/VT) on the
 * SN busbar — no separate boundary marker, no PCC. Node readouts bound to the FROZEN solver.
 */
import {
  AMBER,
  BatteryGlyph,
  CtRing,
  CYAN,
  fmt,
  Glowica,
  InverterSym,
  lbl,
  NN_BUS,
  NodeBadge,
  NodeReadout,
  Odlacznik,
  PINK,
  PowerArrow,
  PowerArrowBi,
  SANS,
  SN_BUS,
  TrafoDyn,
  TXT,
  TXT2,
  TXT_MUTED,
  Wylacznik,
} from './sldCanonKit';
import type { SldOzeArchetypeCompanion } from '../companions/ozeTypes';

/** PRESET G3 — BESS (magazyn energii). SN+TR connection, bidirectional PCS (4Q). */
export function SldCanonPresetG3({ companion }: { companion: SldOzeArchetypeCompanion }): JSX.Element {
  const sn = companion.voltage_flow.buses['SN_PCC'];
  const nn = companion.voltage_flow.buses['NN'];
  const snSc = companion.short_circuit.buses['SN_PCC'];
  const nnSc = companion.short_circuit.buses['NN'];
  const faln = snSc.source_contribution.ik_contribution_ka ?? 0; // PCS (IBG) share
  const snGridShare = Math.max(0, snSc.max.ikss_ka - faln);
  const nnTrShare = Math.max(0, nnSc.max.ikss_ka - faln);
  const earthing = companion.source.grid_earthing;
  const withstand = companion.source.withstand;
  const snIk1f = earthing ? `${fmt(earthing.ik_1f_ka)} kA · ${earthing.neutral_point}` : '—';
  const nnIk1f = `≈0 (IT)${earthing?.imd_it_nn ? ' · IMD' : ''}`;
  const st = companion.source.storage;
  const nPcs = st?.n_pcs ?? 2;
  const pcsKw = st?.pcs_kw ?? 500;

  const X = { pTr: 430, pLine: 820, node1: 1330 };
  const snBusY = 200;
  const nnBusY = 600;
  const snX1 = 280;
  const snX2 = 1500;
  const nnX1 = 330;
  const nnX2 = 1290;
  const pcsX = nPcs === 2 ? [560, 770] : [520, 700, 880];
  const ownX = 1010;
  const title = 'SZABLON SLD — MAGAZYN ENERGII BESS (IEC)';
  const subtitle = `SN: pole Liniowe · Transformatorowe | TR 1,25 MVA 15/0,4 kV Dyn | nN 0,4 kV IT | ${nPcs}× PCS ${pcsKw} kW (4Q) · ${(st?.power_kw ?? 1000) / 1000} MW / ${(st?.capacity_kwh ?? 2000) / 1000} MWh`;

  return (
    <g data-testid="sld-canon-g3">
      {/* ── header ── */}
      <text x={840} y={42} textAnchor="middle" fill="#F4F6F8" fontFamily={SANS} fontSize={22} fontWeight={800}>{title}</text>
      <text x={840} y={70} textAnchor="middle" fill={AMBER} fontFamily={SANS} fontSize={13} fontWeight={700}>{subtitle}</text>
      <text x={1520} y={112} textAnchor="end" fill={CYAN} fontFamily={SANS} fontSize={11} fontWeight={700}>WYNIKI w węzłach — ze solwera (czas rzecz.) · klik węzeł → White Box</text>

      {/* ── SN busbar ── */}
      <line x1={snX1} y1={snBusY} x2={snX2} y2={snBusY} stroke={SN_BUS} strokeWidth={5} strokeLinecap="round" />
      {lbl(snX2 + 14, snBusY + 4, 'SN · 15 kV', TXT2, 12, 700)}
      <NodeBadge x={X.node1 - 2} y={snBusY} n={1} />

      {/* ── POLE TRANSFORMATOROWE ── */}
      {lbl(X.pTr - 90, 160, 'POLE · Transformatorowe', CYAN, 12, 700)}
      <line x1={X.pTr} y1={snBusY} x2={X.pTr} y2={460} stroke={SN_BUS} strokeWidth={2} />
      <Odlacznik x={X.pTr} y={250} />
      {lbl(X.pTr + 18, 254, 'Q odłącznik', TXT2, 11, 700)}
      <Wylacznik x={X.pTr} y={310} />
      {lbl(X.pTr + 18, 314, 'Q wyłącznik · VCB', TXT2, 11, 700)}
      <TrafoDyn x={X.pTr} y={440} />
      {lbl(X.pTr + 26, 438, 'T1 · Dyn', TXT, 12, 800)}
      {lbl(X.pTr + 26, 452, '1,25 MVA · 15/0,4 kV', TXT_MUTED, 9.5, 600)}
      <line x1={X.pTr} y1={460} x2={X.pTr} y2={505} stroke={CYAN} strokeWidth={2} />
      <Wylacznik x={X.pTr} y={507} />
      {lbl(X.pTr + 18, 511, 'Q1 nN · wył. główny', TXT2, 11, 700)}
      <line x1={X.pTr} y1={525} x2={X.pTr} y2={nnBusY} stroke={NN_BUS} strokeWidth={2} />

      {/* ── POLE LINIOWE SN (przyłącze do OSD) — pomiar przekładnikowy CT/VT na szynie ── */}
      {lbl(X.pLine - 50, 160, 'POLE · Liniowe', CYAN, 12, 700)}
      <line x1={X.pLine} y1={snBusY} x2={X.pLine} y2={470} stroke={SN_BUS} strokeWidth={2} />
      <Odlacznik x={X.pLine} y={250} />
      {lbl(X.pLine + 18, 254, 'Q odłącznik + uziemnik', TXT2, 11, 700)}
      <CtRing x={X.pLine} y={320} />
      {lbl(X.pLine + 18, 318, 'CT/VT — pomiar rozliczeniowy', AMBER, 10.5, 700)}
      {lbl(X.pLine + 18, 331, '(granica = układ pomiarowy)', TXT_MUTED, 8.5, 600)}
      <Glowica x={X.pLine} y={388} />
      {lbl(X.pLine + 18, 392, 'głowica kablowa', TXT_MUTED, 9.5, 600)}
      <line x1={X.pLine} y1={397} x2={X.pLine} y2={505} stroke={SN_BUS} strokeWidth={2} />
      <PowerArrowBi x={X.pLine} y={450} />
      {lbl(X.pLine + 14, 454, 'rozładowanie ⇄ ładowanie', PINK, 9.5, 800)}
      {lbl(X.pLine - 110, 528, '3×XRUHAKXS → SIEĆ OSD', TXT_MUTED, 9, 600)}

      {/* ── node ① readout ── */}
      <NodeReadout x={X.node1} y={236} n={1} title="szyna SN · 15 kV"
        uKv={sn.un_kv} uPu={sn.u_pu} uOk={Math.abs(sn.deviation_percent) <= 5}
        ik3fMax={snSc.max.ikss_ka} ik3fMin={snSc.min.ikss_ka}
        ik1f={snIk1f} share={`sieć ${fmt(snGridShare, 1)} + PCS ${fmt(faln, 1)} kA`}
        icw={snSc.icw_ka} icwOk={snSc.verification.passed}
        ip={snSc.max.ip_ka} idyn={withstand?.sn_idyn_ka ?? 0} />

      {/* ── nN busbar ── */}
      <line x1={nnX1} y1={nnBusY} x2={nnX2} y2={nnBusY} stroke={NN_BUS} strokeWidth={5} strokeLinecap="round" />
      {lbl(nnX2 + 14, nnBusY + 4, 'nN · 0,4 kV · IT', TXT2, 12, 700)}
      <NodeBadge x={nnX2 - 10} y={nnBusY} n={2} />

      {/* ── PCS (bidirectional 4Q) + battery ── */}
      {pcsX.map((fx, i) => (
        <g key={i} data-testid={`g3-pcs-${i}`}>
          <line x1={fx} y1={nnBusY} x2={fx} y2={648} stroke={NN_BUS} strokeWidth={1.8} />
          <PowerArrowBi x={fx - 16} y={636} />
          <Wylacznik x={fx} y={663} />
          <line x1={fx} y1={672} x2={fx} y2={684} stroke={NN_BUS} strokeWidth={1.8} />
          <InverterSym x={fx} y={701} />
          <BatteryGlyph x={fx + 15} y={701} />
          {lbl(fx, 734, `PCS ${i + 1} · ${pcsKw} kW`, AMBER, 11, 800, 'middle')}
          {lbl(fx, 747, `4Q · Ik″ ≈ ${fmt(faln / pcsX.length, 2)} kA`, TXT2, 9, 700, 'middle')}
        </g>
      ))}
      {lbl((pcsX[0] + pcsX[pcsX.length - 1]) / 2, 770, 'SoC · BMS · DC = obwody DC → moduł magazynu (IEC 62933)', TXT_MUTED, 9.5, 600, 'middle')}

      {/* ── potrzeby własne (HVAC/BMS) ── */}
      <line x1={ownX} y1={nnBusY} x2={ownX} y2={nnBusY + 60} stroke={NN_BUS} strokeWidth={1.8} />
      <polygon points={`${ownX - 7},${nnBusY + 60} ${ownX + 7},${nnBusY + 60} ${ownX},${nnBusY + 74}`} fill="#7DD3FC" stroke="#7DD3FC" strokeWidth={1} />
      {lbl(ownX, nnBusY + 92, 'pot. własne (HVAC/BMS)', TXT2, 10, 700, 'middle')}

      {/* ── node ② readout ── */}
      <NodeReadout x={X.node1} y={636} n={2} title="szyna nN · 0,40 kV · IT"
        uKv={nn.un_kv} uPu={nn.u_pu} uOk={Math.abs(nn.deviation_percent) <= 5}
        ik3fMax={nnSc.max.ikss_ka} ik3fMin={nnSc.min.ikss_ka}
        ik1f={nnIk1f} share={`TR ${fmt(nnTrShare, 1)} + PCS ${fmt(faln, 1)} kA`}
        icw={nnSc.icw_ka} icwOk={nnSc.verification.passed}
        ip={nnSc.max.ip_ka} idyn={withstand?.nn_idyn_ka ?? 0} />

      {/* ── LEGENDA — symbole IEC (wspólny kanon) ── */}
      <rect x={80} y={838} width={1200} height={86} rx={8} fill="none" stroke="#13435A" strokeWidth={1} />
      {lbl(104, 862, 'LEGENDA — symbole IEC', '#9FE6FF', 12, 800)}
      {[
        ['WYŁĄCZNIK □', (cx: number, cy: number) => <Wylacznik x={cx} y={cy} />],
        ['ODŁĄCZNIK ◯', (cx: number, cy: number) => <Odlacznik x={cx} y={cy} />],
        ['TR (2 okręgi+Dyn)', (cx: number, cy: number) => <TrafoDyn x={cx} y={cy} />],
        ['CT — pierścień', (cx: number, cy: number) => <CtRing x={cx} y={cy} />],
        ['PCS ~/= + bateria', (cx: number, cy: number) => <InverterSym x={cx} y={cy} />],
        ['GŁOWICA (trójkąt)', (cx: number, cy: number) => <Glowica x={cx} y={cy} />],
        ['moc 2-kier. (4Q)', (cx: number, cy: number) => <PowerArrowBi x={cx} y={cy} />],
        ['moc 1-kier.', (cx: number, cy: number) => <PowerArrow x={cx} y={cy - 9} dir="up" />],
      ].map(([label, sym], i) => {
        const cx = 180 + i * 138;
        const cy = 888;
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
