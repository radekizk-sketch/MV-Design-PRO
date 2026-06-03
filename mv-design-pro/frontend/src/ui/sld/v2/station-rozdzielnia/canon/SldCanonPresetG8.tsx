/**
 * Canonical SLD template — PRESET G8 (Biogazownia / kogeneracja SYNCHRONICZNA, IEC). The first
 * archetype with a synchronous machine DIRECTLY on the grid: N cogeneration gensets on ONE 15 kV
 * busbar (ENEA SN), a connection bay to OSD with the interface protection (NC RfG), and a metering
 * bay (CT on the busbar + VT/meter = granica, bez ⊟, bez PCC). Unlike the induction machine (G7),
 * the synchronous SC is SUSTAINED by excitation — it does NOT decay to the grid-only (Ib ≈ Ik,
 * §6.3 za Z″_GK) — so the genset carries the full synchronous-generator protection. There is no LV
 * tier and no turbine transformer: the gensets sit on the SN busbar. Readout ① bound to the solver.
 */
import {
  AMBER,
  ctRatioLabel,
  CtRing,
  CYAN,
  fmt,
  Glowica,
  ko,
  lbl,
  MONO,
  NodeBadge,
  NodeReadout,
  Odlacznik,
  PINK,
  PowerArrow,
  RelayBox,
  SANS,
  SN_BUS,
  SyncMachine,
  TXT,
  TXT2,
  TXT_MUTED,
  UziemnikIEC,
  VtNoGround,
  vtRatioLabel,
  Wylacznik,
} from './sldCanonKit';
import type { SldOzeArchetypeCompanion } from '../companions/ozeTypes';

/** PRESET G8 — synchronous cogeneration. ONE SN busbar + N genset feeders (machine directly on the grid). */
export function SldCanonPresetG8({ companion }: { companion: SldOzeArchetypeCompanion }): JSX.Element {
  const sn = companion.voltage_flow.buses['SN_PCC'];
  const snSc = companion.short_circuit.buses['SN_PCC'];
  // Synchronous machine: the contribution is LOCAL on the SN busbar (no transformer referral) and
  // SUSTAINED by excitation — sieć = the rest of the bus Ik″.
  const snMach = snSc.source_contribution.ik_contribution_ka ?? 0;
  const snGridShare = Math.max(0, snSc.max.ikss_ka - snMach);
  const earthing = companion.source.grid_earthing;
  const withstand = companion.source.withstand;
  const metering = companion.source.metering;
  const gen = companion.source.genset;
  const snIk1f = earthing ? `${fmt(earthing.ik_1f_ka)} kA · ${earthing.neutral_point}` : 'lok. (OSD)';
  const nGen = gen?.n_gensets ?? 2;
  const genMw = String((gen?.genset_kw ?? 1000) / 1000).replace('.', ',');
  const xdPu = gen?.xd_subtransient_pu ?? 0.15;
  const colKv = fmt(sn.un_kv, 0); // SN kV from the FROZEN solver companion (ENEA-valid, no 30 kV)
  // Interface protection = the connection-field codes (NC RfG); the FULL synchronous-generator set
  // (87G/40/32/64…) is split onto source.protection — like G6/G7 (audit #5).
  const ifaceCodes = (companion.fields.find((f) => f.interface_protection)?.protection_codes ?? []).join(' · ');
  const machineProt = (companion.source.protection?.machine ?? ['87G', '40', '32', '64']).join(' · ');

  const X = { lin: 400, ctBus: 530, pom: 660 };
  const gx = Array.from({ length: nGen }, (_, i) => 980 + i * 280); // genset feeder x-positions
  const node = 1580;
  const snBusY = 200;
  const snX1 = 280;
  const snX2 = 1500;
  const title = 'SZABLON SLD — BIOGAZOWNIA / KOGENERACJA (synchroniczna, IEC)';
  const subtitle = `Szyna SN ${colKv} kV · pole Liniowe · Pomiarowe | ${nGen}× agregat ${genMw} MW (synchroniczny, x″d=${fmt(xdPu, 2)}) — maszyna wprost na szynie SN`;

  return (
    <g data-testid="sld-canon-g8">
      {/* ── header ── */}
      <text x={940} y={42} textAnchor="middle" fill="#F4F6F8" fontFamily={SANS} fontSize={22} fontWeight={800}>{title}</text>
      <text x={940} y={70} textAnchor="middle" fill={AMBER} fontFamily={SANS} fontSize={13} fontWeight={700}>{subtitle}</text>
      <text x={1810} y={112} textAnchor="end" fill={CYAN} fontFamily={SANS} fontSize={11} fontWeight={700}>WYNIKI w węzłach — ze solwera (czas rzecz.) · klik węzeł → White Box</text>

      {/* ── SN busbar (15 kV) ── */}
      <line x1={snX1} y1={snBusY} x2={snX2} y2={snBusY} stroke={SN_BUS} strokeWidth={5} strokeLinecap="round" />
      {lbl(snX2 + 14, snBusY + 4, `SN · ${colKv} kV (szyna)`, TXT2, 12, 700)}
      <NodeBadge x={1462} y={snBusY} n={1} />

      {/* ── POLE 1 · Liniowe (przyłącze → OSD) — interface protection (NC RfG) ── */}
      {lbl(X.lin - 50, 160, 'POLE 1 · Liniowe', CYAN, 12, 700)}
      <line x1={X.lin} y1={snBusY} x2={X.lin} y2={420} stroke={SN_BUS} strokeWidth={2} />
      <Odlacznik x={X.lin} y={246} />
      {lbl(X.lin + 18, 250, 'Q odłącznik', TXT2, 11, 700)}
      <Wylacznik x={X.lin} y={300} />
      {lbl(X.lin + 18, 304, 'Q0 wyłącznik · VCB', TXT2, 11, 700)}
      <RelayBox x={X.lin - 99} y={300} />
      <line x1={X.lin - 87} y1={300} x2={X.lin - 9} y2={300} stroke={CYAN} strokeWidth={1.3} strokeDasharray="3 3" />
      {lbl(X.lin - 188, 333, 'zab. interfejsowe (NC RfG)', CYAN, 10, 700)}
      {lbl(X.lin - 12, 346, ifaceCodes, TXT_MUTED, 8.5, 600, 'end')}
      <UziemnikIEC x={X.lin} y={362} />
      {lbl(X.lin + 40, 380, 'uziemnik (IEC)', TXT_MUTED, 9.5, 600)}
      <Glowica x={X.lin} y={402} />
      {lbl(X.lin + 18, 406, 'głowica kablowa', TXT_MUTED, 9.5, 600)}
      <line x1={X.lin} y1={411} x2={X.lin} y2={505} stroke={SN_BUS} strokeWidth={2} />
      <PowerArrow x={X.lin} y={460} dir="down" />
      {lbl(X.lin + 10, 464, 'eksport → OSD', PINK, 10, 800)}
      {lbl(X.lin - 96, 528, 'kabel SN → SIEĆ OSD (granica na kablu)', TXT_MUTED, 9, 600)}

      {/* ── CT on the SN busbar (current path); secondary → meter ── */}
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
      {lbl(X.pom - 96, 372, vtRatioLabel(sn.un_kv), TXT, 11, 700)}
      {lbl(X.pom - 96, 385, 'bez ziemi (→U)', TXT_MUTED, 9, 600)}
      <g data-keepout={ko(X.pom - 11, 392, 22, 18)}>
        <rect x={X.pom - 11} y={392} width={22} height={18} rx={2} fill="#0A1622" stroke={AMBER} strokeWidth={1.6} />
        <text x={X.pom} y={405} textAnchor="middle" fill={AMBER} fontFamily={MONO} fontSize={9} fontWeight={800}>Wh</text>
      </g>
      {lbl(X.pom - 78, 428, 'POMIAR rozliczeniowy', AMBER, 11, 700)}
      {lbl(X.pom - 78, 441, 'granica = układ pomiarowy (I z CT, U z VT)', TXT_MUTED, 8.5, 600)}

      {/* ── POLE agregatu (N feeders): Q → CB → ◯GS (maszyna synchroniczna wprost na szynie) ── */}
      {gx.map((fx, i) => (
        <g key={i} data-testid={`g8-gen-${i}`}>
          {i === 0 && lbl(fx - 40, 160, `POLE agregatu (${nGen}×)`, CYAN, 12, 700)}
          <line x1={fx} y1={snBusY} x2={fx} y2={420} stroke={SN_BUS} strokeWidth={2} />
          <PowerArrow x={fx} y={232} dir="up" />
          <Odlacznik x={fx} y={250} />
          {lbl(fx + 16, 254, 'Q odłącznik', TXT2, 10, 700)}
          <Wylacznik x={fx} y={300} />
          {lbl(fx + 16, 304, 'Q wyłącznik', TXT2, 10, 700)}
          <RelayBox x={fx - 99} y={300} label="87G" />
          <line x1={fx - 87} y1={300} x2={fx - 9} y2={300} stroke={AMBER} strokeWidth={1.3} strokeDasharray="3 3" />
          {lbl(fx - 12, 346, 'zab. generatora', AMBER, 9, 700, 'end')}
          <line x1={fx} y1={411} x2={fx} y2={462} stroke={SN_BUS} strokeWidth={2} />
          <SyncMachine x={fx} y={474} />
          {lbl(fx, 506, `Agregat ${i + 1} · ${genMw} MW`, AMBER, 10, 800, 'middle')}
          {lbl(fx, 519, `◯GS synchroniczny · x″d=${fmt(xdPu, 2)}`, TXT2, 9, 700, 'middle')}
        </g>
      ))}
      {lbl((gx[0] + gx[gx.length - 1]) / 2, 548, '15 kV: agregaty synchroniczne na szynie = MASZYNA SYNCHRONICZNA (PN-EN 60909 §6.3, za Z″_GK); prąd zwarciowy PODTRZYMYWANY wzbudzeniem (Ib ≈ Ik — NIE zanika jak indukcyjna)', TXT_MUTED, 9, 600, 'middle')}
      {lbl((gx[0] + gx[gx.length - 1]) / 2, 561, `zab. generatora: ${machineProt} (pełny zestaw synchroniczny)`, TXT_MUTED, 8.5, 600, 'middle')}

      {/* ── node ① — SN busbar 15 kV (sieć + MASZYNA synchroniczna, local) ── */}
      <NodeReadout x={node} y={236} n={1} title={`szyna SN · ${colKv} kV`}
        uKv={sn.un_kv} uPu={sn.u_pu} uOk={Math.abs(sn.deviation_percent) <= 5}
        ik3fMax={snSc.max.ikss_ka} ik3fMin={snSc.min.ikss_ka}
        ik1f={snIk1f} share={`sieć ${fmt(snGridShare, 1)} + maszyna ${fmt(snMach, 2)} kA`}
        icw={snSc.icw_ka} icwOk={snSc.verification.passed}
        ip={snSc.max.ip_ka} idyn={withstand?.sn_idyn_ka ?? 0} />

      {/* ── LEGENDA — symbole IEC (wspólny kanon) ── */}
      <rect x={80} y={838} width={1360} height={86} rx={8} fill="none" stroke="#13435A" strokeWidth={1} />
      {lbl(104, 862, 'LEGENDA — symbole IEC', '#9FE6FF', 12, 800)}
      {[
        ['WYŁĄCZNIK □', (cx: number, cy: number) => <Wylacznik x={cx} y={cy} />],
        ['ODŁĄCZNIK ◯', (cx: number, cy: number) => <Odlacznik x={cx} y={cy} />],
        ['UZIEMNIK (IEC)', (cx: number, cy: number) => <UziemnikIEC x={cx - 11} y={cy - 6} />],
        ['CT — pierścień', (cx: number, cy: number) => <CtRing x={cx} y={cy} />],
        ['VT — bez ziemi (→V)', (cx: number, cy: number) => <VtNoGround x={cx - 14} y={cy} />],
        ['GŁOWICA (trójkąt)', (cx: number, cy: number) => <Glowica x={cx} y={cy} />],
        ['ZABEZPIECZENIE', (cx: number, cy: number) => <RelayBox x={cx} y={cy} />],
        ['GEN. SYNCHR. ◯GS', (cx: number, cy: number) => <SyncMachine x={cx} y={cy} />],
        ['kierunek mocy', (cx: number, cy: number) => <PowerArrow x={cx} y={cy - 9} dir="up" />],
      ].map(([label, sym], i) => {
        const cx = 175 + i * 145;
        const cy = 890;
        return (
          <g key={String(label)}>
            {(sym as (a: number, b: number) => JSX.Element)(cx, cy)}
            {lbl(cx, cy + 28, String(label), TXT_MUTED, 8, 700, 'middle')}
          </g>
        );
      })}
    </g>
  );
}
