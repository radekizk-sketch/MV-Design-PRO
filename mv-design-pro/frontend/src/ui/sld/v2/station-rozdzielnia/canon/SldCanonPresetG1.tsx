/**
 * Canonical SLD template — PRESET G1 (PV 1 MW, IEC). The base of the OZE preset family
 * (G1–G9): one shared skeleton (SN busbar · POLE Transformatorowe / Pomiarowe / Liniowe ·
 * TR Dyn · nN busbar · źródła), the shared IEC symbol canon + node readouts from
 * sldCanonKit, bound to the FROZEN solver companion. The renderer CONSUMES results.
 */
import {
  AMBER,
  CYAN,
  ctRatioLabel,
  CtRing,
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
  PowerArrow,
  RelayBox,
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

/** PRESET G1 — PV 1 MW (IEC). Reproduces the canonical reference template. */
export function SldCanonPresetG1({ companion }: { companion: SldOzeArchetypeCompanion }): JSX.Element {
  const sn = companion.voltage_flow.buses['SN_PCC'];
  const nn = companion.voltage_flow.buses['NN_800'];
  const snSc = companion.short_circuit.buses['SN_PCC'];
  const nnSc = companion.short_circuit.buses['NN_800'];
  const faln = snSc.source_contribution.ik_contribution_ka ?? 0; // inverter (IBG) share
  const snGridShare = Math.max(0, snSc.max.ikss_ka - faln);
  const nnTrShare = Math.max(0, nnSc.max.ikss_ka - faln);
  // §5 P0 — OSD neutral earthing drives Ik″1f-z (SN); IT nN ⇒ 1st earth fault via IMD.
  const earthing = companion.source.grid_earthing;
  const withstand = companion.source.withstand;
  const metering = companion.source.metering;
  const snIk1f = earthing ? `${fmt(earthing.ik_1f_ka)} kA · ${earthing.neutral_point}` : '—';
  const nnIk1f = `≈0 (IT)${earthing?.imd_it_nn ? ' · IMD' : ''}`;

  const X = { p1: 400, p2: 745, p3: 1090, ctBus: 930, node1: 1340, nnLbl: 1340 };
  const snBusY = 200;
  const nnBusY = 600;
  const snX1 = 280;
  const snX2 = 1520;
  const nnX1 = 330;
  const nnX2 = 1300;
  const invX = [575, 730, 885, 1040];
  const invShare = faln / invX.length;
  const title = 'SZABLON SLD — STACJA PV 1 MW (IEC)';
  const subtitle =
    'SN: pole Transformatorowe · Pomiarowe · Liniowe | TR 1000 kVA 15,75/0,8 kV Dyn5 | nN 0,8 kV układ IT · 4× falownik';

  return (
    <g data-testid="sld-canon-g1">
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
      <PowerArrow x={X.p1} y={snBusY + 14} dir="down" />
      <Odlacznik x={X.p1} y={250} />
      {lbl(X.p1 + 18, 254, 'Q1 odłącznik · OW-17', TXT2, 11, 700)}
      <Wylacznik x={X.p1} y={310} />
      {lbl(X.p1 + 18, 314, 'Q2 wyłącznik · VD4 630A/16kA', TXT2, 11, 700)}
      {/* Relay -A14: left zone, annotation aligned UNDER the box and ending with a
          margin BEFORE the field axis (x=p1) — never over the Q3 uziemnik. */}
      <RelayBox x={X.p1 - 99} y={310} />
      <line x1={X.p1 - 87} y1={310} x2={X.p1 - 9} y2={310} stroke={CYAN} strokeWidth={1.3} strokeDasharray="3 3" />
      {lbl(X.p1 - 180, 333, '−A14 e²TANGO-800', CYAN, 10, 700)}
      {lbl(X.p1 - 180, 346, 'I>> · I0> · G0> · U<> · f<>', TXT_MUTED, 9, 600)}
      <UziemnikIEC x={X.p1} y={340} />
      {lbl(X.p1 + 40, 358, 'Q3 uziemnik (IEC)', TXT_MUTED, 9.5, 600)}
      {lbl(X.p1 - 175, 397, '3×YHAKXS 1×70/25 [12/20kV] → T1', TXT_MUTED, 9.5, 600)}
      <TrafoDyn x={X.p1} y={440} />
      {lbl(X.p1 + 26, 438, 'T1 · Dyn5', TXT, 12, 800)}
      {lbl(X.p1 + 26, 452, '1000 kVA · 15,75/0,8 kV', TXT_MUTED, 9.5, 600)}
      <line x1={X.p1} y1={460} x2={X.p1} y2={505} stroke={CYAN} strokeWidth={2} />
      <Wylacznik x={X.p1} y={507} />
      {lbl(X.p1 + 18, 511, 'QN1 wyłącznik nN · 3WA1110 1000A', TXT2, 11, 700)}
      <line x1={X.p1} y1={525} x2={X.p1} y2={nnBusY} stroke={NN_BUS} strokeWidth={2} />
      <PowerArrow x={X.p1} y={548} dir="down" />
      {lbl(X.p1 + 8, 562, 'P', PINK, 11, 800)}

      {/* ── POLE 2 · Pomiarowe ── */}
      {lbl(X.p2 - 60, 160, 'POLE 2 · Pomiarowe', CYAN, 12, 700)}
      <line x1={X.p2} y1={snBusY} x2={X.p2} y2={300} stroke={SN_BUS} strokeWidth={2} />
      <Odlacznik x={X.p2} y={252} />
      {lbl(X.p2 + 18, 256, 'Q1 odłącznik', TXT2, 11, 700)}
      <g data-keepout={ko(X.p2 - 5, 318, 10, 20)}>
        <rect x={X.p2 - 5} y={318} width={10} height={20} rx={1.5} fill="#0A1622" stroke="#E6F2FF" strokeWidth={1.4} />
      </g>
      {lbl(X.p2 + 14, 333, 'GTS 0,5A', TXT_MUTED, 9.5, 600)}
      <VtNoGround x={X.p2} y={360} />
      {lbl(X.p2 - 96, 372, vtRatioLabel(sn.un_kv, metering?.vt), TXT, 11, 700)}
      {lbl(X.p2 - 96, 385, 'bez ziemi (→U)', TXT_MUTED, 9, 600)}
      <g data-keepout={ko(X.p2 - 11, 392, 22, 18)}>
        <rect x={X.p2 - 11} y={392} width={22} height={18} rx={2} fill="#0A1622" stroke={AMBER} strokeWidth={1.6} />
        <text x={X.p2} y={405} textAnchor="middle" fill={AMBER} fontFamily={MONO} fontSize={9} fontWeight={800}>Wh</text>
      </g>
      {lbl(X.p2 - 78, 428, 'POMIAR rozliczeniowy', AMBER, 11, 700)}
      {lbl(X.p2 - 78, 441, '−A16 analizator ND45 (I z AD11, U z FD11)', TXT_MUTED, 8.5, 600)}

      {/* CT AD11 — pierścień na szynie (pomiarowy, strona linii/OSD). */}
      <CtRing x={X.ctBus} y={snBusY} />
      {lbl(X.ctBus, 182, ctRatioLabel(metering?.ct), TXT, 10.5, 700, 'middle')}
      <circle cx={X.ctBus} cy={snBusY + 38} r={2.5} fill={CYAN} />
      <line x1={X.ctBus} y1={snBusY + 9} x2={X.ctBus} y2={snBusY + 36} stroke={CYAN} strokeWidth={1.2} strokeDasharray="3 3" />
      {lbl(X.ctBus + 8, snBusY + 41, '→ I do −A16', TXT_MUTED, 9, 600)}

      {/* ── POLE 3 · Liniowe ── */}
      {lbl(X.p3 - 50, 160, 'POLE 3 · Liniowe', CYAN, 12, 700)}
      <line x1={X.p3} y1={snBusY} x2={X.p3} y2={470} stroke={SN_BUS} strokeWidth={2} />
      <Odlacznik x={X.p3} y={246} />
      {lbl(X.p3 + 18, 250, 'Q1 odłącznik', TXT2, 11, 700)}
      <UziemnikIEC x={X.p3} y={300} />
      {lbl(X.p3 + 40, 318, 'Q3 uziemnik (IEC)', TXT_MUTED, 9.5, 600)}
      <Glowica x={X.p3} y={358} />
      {lbl(X.p3 + 18, 362, 'głowica ITK124', TXT_MUTED, 9.5, 600)}
      <CtRing x={X.p3} y={400} />
      {lbl(X.p3 + 18, 404, 'CT T4 100/1', TXT_MUTED, 9.5, 600)}
      <line x1={X.p3} y1={409} x2={X.p3} y2={505} stroke={SN_BUS} strokeWidth={2} />
      <PowerArrow x={X.p3} y={462} dir="down" />
      {lbl(X.p3 + 10, 466, 'eksport → OSD', PINK, 10, 800)}
      {lbl(X.p3 - 110, 530, '3×XRUHAKXS 1×70/25 · L=161/191 m → SIEĆ OSD', TXT_MUTED, 9, 600)}

      {/* ── node ① readout (U = nominał — placeholder; realna wartość ze solvera w §5) ── */}
      <NodeReadout x={X.node1} y={236} n={1} title="szyna SN · 15,75 kV"
        uKv={sn.un_kv} uPu={sn.u_pu} uOk={Math.abs(sn.deviation_percent) <= 5}
        ik3fMax={snSc.max.ikss_ka} ik3fMin={snSc.min.ikss_ka}
        ik1f={snIk1f} share={`sieć ${fmt(snGridShare, 1)} + faln. ${fmt(faln, 1)} kA`}
        icw={snSc.icw_ka} icwOk={snSc.verification.passed}
        ip={snSc.max.ip_ka} idyn={withstand?.sn_idyn_ka ?? 0} />

      {/* ── nN busbar ── */}
      <line x1={nnX1} y1={nnBusY} x2={nnX2} y2={nnBusY} stroke={NN_BUS} strokeWidth={5} strokeLinecap="round" />
      {lbl(nnX2 + 14, nnBusY + 4, 'nN · 0,8 kV · IT · 1250A', TXT2, 12, 700)}
      <NodeBadge x={nnX2 - 10} y={nnBusY} n={2} />

      {/* 4× falownik */}
      {invX.map((fx, i) => (
        <g key={i} data-testid={`g1-inv-${i}`}>
          <line x1={fx} y1={nnBusY} x2={fx} y2={648} stroke={NN_BUS} strokeWidth={1.8} />
          <PowerArrow x={fx - 16} y={642} dir="up" />
          <g data-keepout={ko(fx - 5, 648, 10, 18)}>
            <rect x={fx - 5} y={648} width={10} height={18} rx={1.5} fill="#0A1622" stroke={AMBER} strokeWidth={1.4} />
          </g>
          {lbl(fx + 12, 661, `F${i + 1}`, TXT_MUTED, 9.5, 700)}
          <line x1={fx} y1={666} x2={fx} y2={680} stroke={NN_BUS} strokeWidth={1.8} />
          <InverterSym x={fx} y={697} />
          {lbl(fx, 730, `INW ${i + 1}`, AMBER, 11, 800, 'middle')}
          {lbl(fx, 743, 'SUN2000-330KTL · 330 kW', TXT_MUTED, 8, 600, 'middle')}
          {lbl(fx, 756, 'P ≈ 0,25 MW', TXT2, 9, 700, 'middle')}
          {lbl(fx, 769, `Ik″ 3f ≈ ${fmt(invShare, 2)} kA`, TXT2, 9, 700, 'middle')}
        </g>
      ))}
      {lbl(807, 794, 'zabezpieczenia falowników: anti-islanding · U<> · f<> · df/dt', TXT_MUTED, 9.5, 600, 'middle')}

      {/* ── node ② readout ── */}
      <NodeReadout x={X.nnLbl} y={636} n={2} title="szyna nN · 0,80 kV · IT"
        uKv={nn.un_kv} uPu={nn.u_pu} uOk={Math.abs(nn.deviation_percent) <= 5}
        ik3fMax={nnSc.max.ikss_ka} ik3fMin={nnSc.min.ikss_ka}
        ik1f={nnIk1f} share={`TR ${fmt(nnTrShare, 1)} + faln. ${fmt(faln, 1)} kA`}
        icw={nnSc.icw_ka} icwOk={nnSc.verification.passed}
        ip={nnSc.max.ip_ka} idyn={withstand?.nn_idyn_ka ?? 0} />

      {/* ── LEGENDA — symbole IEC ── */}
      <rect x={80} y={838} width={1420} height={86} rx={8} fill="none" stroke="#13435A" strokeWidth={1} />
      {lbl(104, 862, 'LEGENDA — symbole IEC', '#9FE6FF', 12, 800)}
      {[
        ['WYŁĄCZNIK □', (cx: number, cy: number) => <Wylacznik x={cx} y={cy} />],
        ['ODŁĄCZNIK ◯', (cx: number, cy: number) => <Odlacznik x={cx} y={cy} />],
        ['UZIEMNIK (IEC)', (cx: number, cy: number) => <UziemnikIEC x={cx - 11} y={cy - 6} />],
        ['TR (2 okręgi+Dyn)', (cx: number, cy: number) => <TrafoDyn x={cx} y={cy} />],
        ['CT — pierścień', (cx: number, cy: number) => <CtRing x={cx} y={cy} />],
        ['VT — bez ziemi (→V)', (cx: number, cy: number) => <VtNoGround x={cx - 14} y={cy} />],
        ['GŁOWICA (trójkąt)', (cx: number, cy: number) => <Glowica x={cx} y={cy} />],
        ['ZABEZPIECZENIE', (cx: number, cy: number) => <RelayBox x={cx} y={cy} />],
        ['FALOWNIK ~/=', (cx: number, cy: number) => <InverterSym x={cx} y={cy} />],
        ['kierunek mocy', (cx: number, cy: number) => <PowerArrow x={cx} y={cy - 9} dir="up" />],
      ].map(([label, sym], i) => {
        const cx = 170 + i * 138;
        const cy = 890;
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
