/**
 * Canonical SLD template — PRESET G5 (Farma wiatrowa Typ 4, IEC). SAME shared kit + node
 * readouts as G1/G3 and the SAME locked metering pattern (CT in the current path on the
 * collector busbar + VT/meter bay = granica, bez ⊟, bez PCC). The wind difference is REAL
 * topology, not a relabel: ONE 15 kV collector busbar (ENEA SN — 30 kV nie istnieje) with a
 * connection bay to OSD, a metering bay, and N turbine feeders — EACH with its own transformer (0,69/15 kV)
 * + full converter (~/=) + generator (◯G). The grid-facing SC source is the converter
 * (IBG, current-limited k·In per IEC 60909-0:2016 §6.7) — NOT a machine. Readouts ①②
 * bound to the FROZEN solver.
 */
import {
  AMBER,
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
  WindGen,
  Wylacznik,
} from './sldCanonKit';
import type { SldOzeArchetypeCompanion } from '../companions/ozeTypes';

/** PRESET G5 — Wind Type 4 (full converter). Collector SN + N turbine feeders. */
export function SldCanonPresetG5({ companion }: { companion: SldOzeArchetypeCompanion }): JSX.Element {
  const sn = companion.voltage_flow.buses['SN_PCC'];
  const lv = companion.voltage_flow.buses['WTG_LV_1'];
  const snSc = companion.short_circuit.buses['SN_PCC'];
  const lvSc = companion.short_circuit.buses['WTG_LV_1'];
  const faln = snSc.source_contribution.ik_contribution_ka ?? 0; // WTG converter (IBG) share
  const snGridShare = Math.max(0, snSc.max.ikss_ka - faln);
  const lvTrShare = Math.max(0, lvSc.max.ikss_ka - faln);
  const earthing = companion.source.grid_earthing;
  const withstand = companion.source.withstand;
  const metering = companion.source.metering;
  const col = companion.source.collector;
  const snIk1f = earthing ? `${fmt(earthing.ik_1f_ka)} kA · ${earthing.neutral_point}` : '—';
  const nTurb = col?.n_turbines ?? 3;
  const turbMw = String((col?.turbine_kw ?? 2000) / 1000).replace('.', ',');
  const colKv = fmt(sn.un_kv, 0); // collector kV from the FROZEN solver companion (ENEA-valid, no 30 kV)
  const turbTr = col?.turbine_transformer ?? '0,69/15 kV · 2,5 MVA';

  const X = { lin: 400, ctBus: 530, pom: 660, t: [920, 1130, 1340], node: 1580 };
  const snBusY = 200;
  const snX1 = 280;
  const snX2 = 1500;
  const title = 'SZABLON SLD — FARMA WIATROWA (Typ 4, IEC)';
  const subtitle = `Kolektor SN ${colKv} kV · pole Liniowe · Pomiarowe | ${nTurb}× WTG ${turbMw} MW (Typ 4 · pełny przekształtnik) · trafo turb. ${turbTr}`;

  return (
    <g data-testid="sld-canon-g5">
      {/* ── header ── */}
      <text x={940} y={42} textAnchor="middle" fill="#F4F6F8" fontFamily={SANS} fontSize={22} fontWeight={800}>{title}</text>
      <text x={940} y={70} textAnchor="middle" fill={AMBER} fontFamily={SANS} fontSize={13} fontWeight={700}>{subtitle}</text>
      <text x={1810} y={112} textAnchor="end" fill={CYAN} fontFamily={SANS} fontSize={11} fontWeight={700}>WYNIKI w węzłach — ze solwera (czas rzecz.) · klik węzeł → White Box</text>

      {/* ── collector busbar (15 kV) ── */}
      <line x1={snX1} y1={snBusY} x2={snX2} y2={snBusY} stroke={SN_BUS} strokeWidth={5} strokeLinecap="round" />
      {lbl(snX2 + 14, snBusY + 4, `SN · ${colKv} kV (kolektor)`, TXT2, 12, 700)}
      <NodeBadge x={1462} y={snBusY} n={1} />

      {/* ── POLE 1 · Liniowe (przyłącze → OSD) ── */}
      {lbl(X.lin - 50, 160, 'POLE 1 · Liniowe', CYAN, 12, 700)}
      <line x1={X.lin} y1={snBusY} x2={X.lin} y2={420} stroke={SN_BUS} strokeWidth={2} />
      <Odlacznik x={X.lin} y={246} />
      {lbl(X.lin + 18, 250, 'Q odłącznik', TXT2, 11, 700)}
      <Wylacznik x={X.lin} y={300} />
      {lbl(X.lin + 18, 304, 'Q0 wyłącznik · VCB', TXT2, 11, 700)}
      {/* interface protection (left zone, dashed trip line ending before the field axis) */}
      <RelayBox x={X.lin - 99} y={300} />
      <line x1={X.lin - 87} y1={300} x2={X.lin - 9} y2={300} stroke={CYAN} strokeWidth={1.3} strokeDasharray="3 3" />
      {lbl(X.lin - 180, 333, 'zab. interfejsowe (NC RfG)', CYAN, 10, 700)}
      {lbl(X.lin - 180, 346, '67/67N·81·27/59·df/dt·AI', TXT_MUTED, 9, 600)}
      <UziemnikIEC x={X.lin} y={362} />
      {lbl(X.lin + 40, 380, 'uziemnik (IEC)', TXT_MUTED, 9.5, 600)}
      <Glowica x={X.lin} y={402} />
      {lbl(X.lin + 18, 406, 'głowica kablowa', TXT_MUTED, 9.5, 600)}
      <line x1={X.lin} y1={411} x2={X.lin} y2={505} stroke={SN_BUS} strokeWidth={2} />
      <PowerArrow x={X.lin} y={460} dir="down" />
      {lbl(X.lin + 10, 464, 'eksport → OSD', PINK, 10, 800)}
      {lbl(X.lin - 96, 528, 'kabel SN → SIEĆ OSD (granica na kablu)', TXT_MUTED, 9, 600)}

      {/* ── CT on the collector busbar (current path); secondary → meter ── */}
      <CtRing x={X.ctBus} y={snBusY} />
      {lbl(X.ctBus, 182, ctRatioLabel(metering?.ct), TXT, 10.5, 700, 'middle')}
      <circle cx={X.ctBus} cy={snBusY + 38} r={2.5} fill={CYAN} />
      <line x1={X.ctBus} y1={snBusY + 9} x2={X.ctBus} y2={snBusY + 36} stroke={CYAN} strokeWidth={1.2} strokeDasharray="3 3" />
      {lbl(X.ctBus + 8, snBusY + 41, '→ I do licznika', TXT_MUTED, 9, 600)}

      {/* ── POLE 2 · Pomiarowe (VT tap + billing meter = granica) — locked pattern ── */}
      {lbl(X.pom - 60, 160, 'POLE 2 · Pomiarowe', CYAN, 12, 700)}
      <line x1={X.pom} y1={snBusY} x2={X.pom} y2={300} stroke={SN_BUS} strokeWidth={2} />
      <Odlacznik x={X.pom} y={252} />
      {lbl(X.pom + 18, 256, 'Q odłącznik', TXT2, 11, 700)}
      <g data-keepout={ko(X.pom - 5, 318, 10, 20)}>
        <rect x={X.pom - 5} y={318} width={10} height={20} rx={1.5} fill="#0A1622" stroke="#E6F2FF" strokeWidth={1.4} />
      </g>
      {lbl(X.pom + 14, 333, 'bezp. VT (GTS)', TXT_MUTED, 9.5, 600)}
      <VtNoGround x={X.pom} y={360} />
      {lbl(X.pom - 96, 372, vtRatioLabel(sn.un_kv, metering?.vt), TXT, 11, 700)}
      {lbl(X.pom - 96, 385, 'bez ziemi (→U)', TXT_MUTED, 9, 600)}
      <g data-keepout={ko(X.pom - 11, 392, 22, 18)}>
        <rect x={X.pom - 11} y={392} width={22} height={18} rx={2} fill="#0A1622" stroke={AMBER} strokeWidth={1.6} />
        <text x={X.pom} y={405} textAnchor="middle" fill={AMBER} fontFamily={MONO} fontSize={9} fontWeight={800}>Wh</text>
      </g>
      {lbl(X.pom - 78, 428, 'POMIAR rozliczeniowy', AMBER, 11, 700)}
      {lbl(X.pom - 78, 441, 'granica = układ pomiarowy (I z CT, U z VT)', TXT_MUTED, 8.5, 600)}

      {/* ── POLE turbinowe (N feeders): Q → CB → trafo turb. → ~/= → ◯G ── */}
      {X.t.map((fx, i) => (
        <g key={i} data-testid={`g5-wtg-${i}`}>
          {i === 0 && lbl(fx - 40, 160, `POLE turbinowe (${nTurb}×)`, CYAN, 12, 700)}
          <line x1={fx} y1={snBusY} x2={fx} y2={420} stroke={SN_BUS} strokeWidth={2} />
          <PowerArrow x={fx} y={232} dir="up" />
          <Odlacznik x={fx} y={250} />
          <Wylacznik x={fx} y={300} />
          <TrafoDyn x={fx} y={400} />
          {lbl(fx + 16, 396, `WTG ${i + 1}`, TXT, 11, 800)}
          {lbl(fx + 16, 409, turbTr, TXT_MUTED, 8.5, 600)}
          <line x1={fx} y1={420} x2={fx} y2={487} stroke={NN_BUS} strokeWidth={2} />
          {i === 1 && <NodeBadge x={fx} y={452} n={2} />}
          <InverterSym x={fx} y={500} />
          <line x1={fx} y1={513} x2={fx} y2={540} stroke={NN_BUS} strokeWidth={2} />
          <WindGen x={fx} y={552} />
          {lbl(fx, 580, `${turbMw} MW · Typ 4 (PMSG)`, AMBER, 10, 800, 'middle')}
          {lbl(fx, 593, `~/= → ◯G · Ik″ ≈ ${fmt(faln / nTurb, 2)} kA`, TXT2, 9, 700, 'middle')}
        </g>
      ))}
      {lbl((X.t[0] + X.t[X.t.length - 1]) / 2, 614, '0,69 kV: za przekształtnikiem (IBG, prąd ograniczony k·In) — NIE maszyna', TXT_MUTED, 9, 600, 'middle')}

      {/* ── node ① — collector 15 kV ── */}
      <NodeReadout x={X.node} y={236} n={1} title={`kolektor SN · ${colKv} kV`}
        uKv={sn.un_kv} uPu={sn.u_pu} uOk={Math.abs(sn.deviation_percent) <= 5}
        ik3fMax={snSc.max.ikss_ka} ik3fMin={snSc.min.ikss_ka}
        ik1f={snIk1f} share={`sieć ${fmt(snGridShare, 1)} + WTG ${fmt(faln, 1)} kA`}
        icw={snSc.icw_ka} icwOk={snSc.verification.passed}
        ip={snSc.max.ip_ka} idyn={withstand?.sn_idyn_ka ?? 0} />

      {/* ── node ② — turbine LV 0.69 kV ── */}
      <NodeReadout x={X.node} y={470} n={2} title="zacisk turbiny · 0,69 kV"
        uKv={lv.un_kv} uPu={lv.u_pu} uOk={Math.abs(lv.deviation_percent) <= 5}
        ik3fMax={lvSc.max.ikss_ka} ik3fMin={lvSc.min.ikss_ka}
        ik1f="lok. (trafo Dyn turb.)" share={`TR ${fmt(lvTrShare, 1)} + ~/= ${fmt(faln, 1)} kA`}
        icw={lvSc.icw_ka} icwOk={lvSc.verification.passed}
        ip={lvSc.max.ip_ka} idyn={withstand?.nn_idyn_ka ?? 0} />

      {/* ── LEGENDA — symbole IEC (wspólny kanon) ── */}
      <rect x={80} y={838} width={1500} height={86} rx={8} fill="none" stroke="#13435A" strokeWidth={1} />
      {lbl(104, 862, 'LEGENDA — symbole IEC', '#9FE6FF', 12, 800)}
      {[
        ['WYŁĄCZNIK □', (cx: number, cy: number) => <Wylacznik x={cx} y={cy} />],
        ['ODŁĄCZNIK ◯', (cx: number, cy: number) => <Odlacznik x={cx} y={cy} />],
        ['UZIEMNIK (IEC)', (cx: number, cy: number) => <UziemnikIEC x={cx - 11} y={cy - 6} />],
        ['TRAFO TURB. (Dyn)', (cx: number, cy: number) => <TrafoDyn x={cx} y={cy} />],
        ['CT — pierścień', (cx: number, cy: number) => <CtRing x={cx} y={cy} />],
        ['VT — bez ziemi (→V)', (cx: number, cy: number) => <VtNoGround x={cx - 14} y={cy} />],
        ['GŁOWICA (trójkąt)', (cx: number, cy: number) => <Glowica x={cx} y={cy} />],
        ['ZABEZPIECZENIE', (cx: number, cy: number) => <RelayBox x={cx} y={cy} />],
        ['PRZEKSZTAŁTNIK ~/=', (cx: number, cy: number) => <InverterSym x={cx} y={cy} />],
        ['GENERATOR ◯G', (cx: number, cy: number) => <WindGen x={cx} y={cy} />],
        ['kierunek mocy', (cx: number, cy: number) => <PowerArrow x={cx} y={cy - 9} dir="up" />],
      ].map(([label, sym], i) => {
        const cx = 175 + i * 132;
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
