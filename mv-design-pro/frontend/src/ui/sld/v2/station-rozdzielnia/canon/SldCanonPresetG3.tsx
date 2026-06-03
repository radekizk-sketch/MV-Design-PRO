/**
 * Canonical SLD template — PRESET G3 (BESS / magazyn energii, IEC). SAME SN-station
 * structure as G1 (PV) — three bays: POLE Transformatorowe · Pomiarowe · Liniowe — with
 * the shared symbol canon + readouts from sldCanonKit. The only preset change vs G1: the
 * source is a BIDIRECTIONAL battery PCS (4Q — ładowanie ⇄ rozładowanie) on the nN busbar,
 * and SoC/BMS live state lives in the click-module (IEC 62933), not on the canvas.
 * Metering = CT/VT on the SN busbar (POLE Pomiarowe) = boundary. No ⊟, no PCC.
 */
import {
  AMBER,
  BatteryGlyph,
  ctRatioLabel,
  CtRing,
  CYAN,
  fmt,
  Glowica,
  InverterSym,
  ko,
  lbl,
  MONO,
  NN_BUS,
  NodeBadge,
  NodeReadout,
  Odlacznik,
  PINK,
  PowerArrowBi,
  SANS,
  SN_BUS,
  TrafoDyn,
  TXT,
  TXT2,
  TXT_MUTED,
  UziemnikIEC,
  VtNoGround,
  vtRatioLabel,
  Wylacznik,
} from './sldCanonKit';
import type { SldOzeArchetypeCompanion } from '../companions/ozeTypes';

/** PRESET G3 — BESS (magazyn energii). SN+TR station (3 bays, as PV), bidirectional PCS. */
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
  const metering = companion.source.metering;
  const snIk1f = earthing ? `${fmt(earthing.ik_1f_ka)} kA · ${earthing.neutral_point}` : '—';
  const nnIk1f = `≈0 (IT)${earthing?.imd_it_nn ? ' · IMD' : ''}`;
  const st = companion.source.storage;
  const nPcs = st?.n_pcs ?? 2;
  const pcsKw = st?.pcs_kw ?? 500;

  const X = { p1: 400, p2: 745, p3: 1090, ctBus: 950, node1: 1340 };
  const snBusY = 200;
  const nnBusY = 600;
  const snX1 = 280;
  const snX2 = 1520;
  const nnX1 = 330;
  const nnX2 = 1300;
  const pcsX = nPcs === 2 ? [575, 780] : [540, 720, 900];
  const ownX = 1030;
  const title = 'SZABLON SLD — MAGAZYN ENERGII BESS (IEC)';
  const subtitle = `SN: pole Transformatorowe · Pomiarowe · Liniowe | TR 1,25 MVA 15/0,4 kV Dyn | nN 0,4 kV IT | ${nPcs}× PCS ${pcsKw} kW (4Q) · ${(st?.power_kw ?? 1000) / 1000} MW / ${(st?.capacity_kwh ?? 2000) / 1000} MWh`;

  return (
    <g data-testid="sld-canon-g3">
      {/* ── header ── */}
      <text x={900} y={42} textAnchor="middle" fill="#F4F6F8" fontFamily={SANS} fontSize={22} fontWeight={800}>{title}</text>
      <text x={900} y={70} textAnchor="middle" fill={AMBER} fontFamily={SANS} fontSize={13} fontWeight={700}>{subtitle}</text>
      <text x={1540} y={112} textAnchor="end" fill={CYAN} fontFamily={SANS} fontSize={11} fontWeight={700}>WYNIKI w węzłach — ze solwera (czas rzecz.) · klik węzeł → White Box</text>

      {/* ── SN busbar ── */}
      <line x1={snX1} y1={snBusY} x2={snX2} y2={snBusY} stroke={SN_BUS} strokeWidth={5} strokeLinecap="round" />
      {lbl(snX2 + 14, snBusY + 4, 'SN · 15 kV', TXT2, 12, 700)}
      <NodeBadge x={X.node1 - 2} y={snBusY} n={1} />

      {/* ── POLE 1 · Transformatorowe ── */}
      {lbl(X.p1 - 90, 160, 'POLE 1 · Transformatorowe', CYAN, 12, 700)}
      <line x1={X.p1} y1={snBusY} x2={X.p1} y2={460} stroke={SN_BUS} strokeWidth={2} />
      <Odlacznik x={X.p1} y={250} />
      {lbl(X.p1 + 18, 254, 'Q odłącznik', TXT2, 11, 700)}
      <Wylacznik x={X.p1} y={310} />
      {lbl(X.p1 + 18, 314, 'Q wyłącznik · VCB', TXT2, 11, 700)}
      <UziemnikIEC x={X.p1} y={340} />
      {lbl(X.p1 + 40, 358, 'uziemnik (IEC)', TXT_MUTED, 9.5, 600)}
      <TrafoDyn x={X.p1} y={440} />
      {lbl(X.p1 + 26, 438, 'T1 · Dyn', TXT, 12, 800)}
      {lbl(X.p1 + 26, 452, '1,25 MVA · 15/0,4 kV', TXT_MUTED, 9.5, 600)}
      <line x1={X.p1} y1={460} x2={X.p1} y2={505} stroke={CYAN} strokeWidth={2} />
      <Wylacznik x={X.p1} y={507} />
      {lbl(X.p1 + 18, 511, 'Q1 nN · wył. główny', TXT2, 11, 700)}
      <line x1={X.p1} y1={525} x2={X.p1} y2={nnBusY} stroke={NN_BUS} strokeWidth={2} />
      <PowerArrowBi x={X.p1} y={555} />
      {lbl(X.p1 + 12, 559, '4Q', PINK, 11, 800)}

      {/* ── POLE 2 · Pomiarowe (VT-tap + licznik; CT w torze na szynie = granica) ── */}
      {lbl(X.p2 - 60, 160, 'POLE 2 · Pomiarowe', CYAN, 12, 700)}
      <line x1={X.p2} y1={snBusY} x2={X.p2} y2={300} stroke={SN_BUS} strokeWidth={2} />
      <Odlacznik x={X.p2} y={252} />
      {lbl(X.p2 + 18, 256, 'Q odłącznik', TXT2, 11, 700)}
      <g data-keepout={ko(X.p2 - 5, 318, 10, 20)}>
        <rect x={X.p2 - 5} y={318} width={10} height={20} rx={1.5} fill="#0A1622" stroke="#E6F2FF" strokeWidth={1.4} />
      </g>
      {lbl(X.p2 + 14, 333, 'bezp. VT (GTS)', TXT_MUTED, 9.5, 600)}
      <VtNoGround x={X.p2} y={360} />
      {lbl(X.p2 - 96, 372, vtRatioLabel(sn.un_kv, metering?.vt), TXT, 11, 700)}
      {lbl(X.p2 - 96, 385, 'bez ziemi (→U)', TXT_MUTED, 9, 600)}
      <g data-keepout={ko(X.p2 - 11, 392, 22, 18)}>
        <rect x={X.p2 - 11} y={392} width={22} height={18} rx={2} fill="#0A1622" stroke={AMBER} strokeWidth={1.6} />
        <text x={X.p2} y={405} textAnchor="middle" fill={AMBER} fontFamily={MONO} fontSize={9} fontWeight={800}>Wh</text>
      </g>
      {lbl(X.p2 - 78, 428, 'POMIAR rozliczeniowy', AMBER, 11, 700)}
      {lbl(X.p2 - 78, 441, 'granica = układ pomiarowy (I z CT, U z VT)', TXT_MUTED, 8.5, 600)}

      {/* CT — pierścień na szynie SN (w torze prądowym); wtórny → licznik. */}
      <CtRing x={X.ctBus} y={snBusY} />
      {lbl(X.ctBus, 182, ctRatioLabel(metering?.ct), TXT, 10.5, 700, 'middle')}
      <circle cx={X.ctBus} cy={snBusY + 38} r={2.5} fill={CYAN} />
      <line x1={X.ctBus} y1={snBusY + 9} x2={X.ctBus} y2={snBusY + 36} stroke={CYAN} strokeWidth={1.2} strokeDasharray="3 3" />
      {lbl(X.ctBus + 8, snBusY + 41, '→ I do licznika', TXT_MUTED, 9, 600)}

      {/* ── POLE 3 · Liniowe (przyłącze do OSD; moc dwukierunkowa) ── */}
      {lbl(X.p3 - 50, 160, 'POLE 3 · Liniowe', CYAN, 12, 700)}
      <line x1={X.p3} y1={snBusY} x2={X.p3} y2={470} stroke={SN_BUS} strokeWidth={2} />
      <Odlacznik x={X.p3} y={246} />
      {lbl(X.p3 + 18, 250, 'Q odłącznik', TXT2, 11, 700)}
      <UziemnikIEC x={X.p3} y={300} />
      {lbl(X.p3 + 40, 318, 'uziemnik (IEC)', TXT_MUTED, 9.5, 600)}
      <Glowica x={X.p3} y={358} />
      {lbl(X.p3 + 18, 362, 'głowica kablowa', TXT_MUTED, 9.5, 600)}
      <CtRing x={X.p3} y={400} />
      {lbl(X.p3 + 18, 404, 'CT linii · 100/1', TXT_MUTED, 9.5, 600)}
      <line x1={X.p3} y1={409} x2={X.p3} y2={505} stroke={SN_BUS} strokeWidth={2} />
      <PowerArrowBi x={X.p3} y={462} />
      {lbl(X.p3 + 14, 466, 'rozładow. ⇄ ładow.', PINK, 9.5, 800)}
      {lbl(X.p3 - 110, 528, '3×XRUHAKXS → SIEĆ OSD', TXT_MUTED, 9, 600)}

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
      {lbl((pcsX[0] + pcsX[pcsX.length - 1]) / 2, 770, 'SoC · BMS · obwody DC → moduł magazynu (IEC 62933)', TXT_MUTED, 9.5, 600, 'middle')}

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
      <rect x={80} y={838} width={1300} height={86} rx={8} fill="none" stroke="#13435A" strokeWidth={1} />
      {lbl(104, 862, 'LEGENDA — symbole IEC', '#9FE6FF', 12, 800)}
      {[
        ['WYŁĄCZNIK □', (cx: number, cy: number) => <Wylacznik x={cx} y={cy} />],
        ['ODŁĄCZNIK ◯', (cx: number, cy: number) => <Odlacznik x={cx} y={cy} />],
        ['UZIEMNIK (IEC)', (cx: number, cy: number) => <UziemnikIEC x={cx - 11} y={cy - 6} />],
        ['TR (2 okręgi+Dyn)', (cx: number, cy: number) => <TrafoDyn x={cx} y={cy} />],
        ['CT — pierścień', (cx: number, cy: number) => <CtRing x={cx} y={cy} />],
        ['VT — bez ziemi (→V)', (cx: number, cy: number) => <VtNoGround x={cx - 14} y={cy} />],
        ['PCS ~/= + bateria', (cx: number, cy: number) => <InverterSym x={cx} y={cy} />],
        ['GŁOWICA (trójkąt)', (cx: number, cy: number) => <Glowica x={cx} y={cy} />],
        ['moc 2-kier. (4Q)', (cx: number, cy: number) => <PowerArrowBi x={cx} y={cy} />],
      ].map(([label, sym], i) => {
        const cx = 175 + i * 138;
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
