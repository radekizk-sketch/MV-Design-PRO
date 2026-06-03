/**
 * Canonical SLD template — PRESET G4 (HYBRYDA PV + BESS, IEC). The G4 slot (reserved when
 * wind moved to G5) = a co-located PV generator + battery store, rendered for BOTH coupling
 * variants the FROZEN-solver companion can carry (companion.source.hybrid.coupling):
 *   • SN_BUS — wspólna szyna SN: PV i BESS, KAŻDE za WŁASNYM trafem, na jednej szynie 15 kV.
 *   • AC_LV  — AC-coupled: falowniki PV + PCS BESS na WSPÓLNEJ szynie nN za JEDNYM trafem.
 * Both sources are IBG (PV inverters + bidirectional BESS PCS, IEC 60909-0:2016 §6.7); the
 * SC share = their SUM. Metering = CT/VT on the SN busbar (POLE Pomiarowe) = boundary. No
 * ⊟, no PCC. Readouts bound to the solver (klik węzeł → White Box). Voltage labels derive
 * from the companion (ENEA-valid, no 30 kV).
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
  lbl,
  NN_BUS,
  NodeBadge,
  NodeReadout,
  Odlacznik,
  PowerArrow,
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
import type { OzeScBus, OzeVfBus, SldOzeArchetypeCompanion } from '../companions/ozeTypes';

/** PRESET G4 — PV + BESS hybrid. Topology branches on companion.source.hybrid.coupling. */
export function SldCanonPresetG4({ companion }: { companion: SldOzeArchetypeCompanion }): JSX.Element {
  const hy = companion.source.hybrid;
  const isBus = hy?.coupling === 'SN_BUS';
  const vf = companion.voltage_flow.buses;
  const sc = companion.short_circuit.buses;
  const sn = vf['SN_PCC'];
  const snSc = sc['SN_PCC'];
  const colKv = fmt(sn.un_kv, 0); // ENEA-valid collector kV from the companion (no 30 kV)
  const faln = snSc.source_contribution.ik_contribution_ka ?? 0; // PV + BESS IBG share (sum)
  const snGridShare = Math.max(0, snSc.max.ikss_ka - faln);
  const earthing = companion.source.grid_earthing;
  const withstand = companion.source.withstand;
  const metering = companion.source.metering;
  const snIk1f = earthing ? `${fmt(earthing.ik_1f_ka)} kA · ${earthing.neutral_point}` : '—';
  const nnIk1f = `≈0 (IT)${earthing?.imd_it_nn ? ' · IMD' : ''}`;
  const pvKw = hy?.pv_kw ?? 999;
  const bessKw = hy?.bess_kw ?? 1000;
  const bessMwh = (hy?.bess_capacity_kwh ?? 2000) / 1000;

  const snBusY = 200;
  const snX1 = 280;
  const snX2 = 1540;
  const nnBusY = 600;
  const nodeX = 1350;
  // BUS-variant nN trains: each bus span is computed FROM its transformer-drop x + feeder
  // xs, so the drop ALWAYS lands on the bus (render↔model continuity — no hanging feeder).
  const PAD = 35;
  const pvTrX = 380;
  const pvFeeders = [320, 440, 560];
  const bessTrX = 760;
  const pcsFeeders = [720, 880];
  const span = (xs: number[]): [number, number] => [Math.min(...xs) - PAD, Math.max(...xs) + PAD];
  const [pvX1, pvX2] = span([pvTrX, ...pvFeeders]);
  const [bessX1, bessX2] = span([bessTrX, ...pcsFeeders]);
  const title = 'SZABLON SLD — HYBRYDA PV + BESS (IEC)';
  const subtitle = isBus
    ? `Wspólna szyna SN ${colKv} kV (sprzężenie na SN) | POLE TR PV · TR BESS · Pomiarowe · Liniowe | PV ${pvKw / 1000} MW + BESS ${bessKw / 1000} MW / ${bessMwh} MWh`
    : `AC-coupled — wspólny trafo przyłączeniowy (sprzężenie na nN) | POLE TR · Pomiarowe · Liniowe | PV ${pvKw / 1000} MW + BESS ${bessKw / 1000} MW / ${bessMwh} MWh`;

  // One nN source feeder: drop from the bus, breaker, inverter (+ battery for a PCS).
  const sourceFeeder = (fx: number, key: string, label: string, kw: number, isPcs: boolean) => (
    <g key={key} data-testid={key}>
      <line x1={fx} y1={nnBusY} x2={fx} y2={648} stroke={NN_BUS} strokeWidth={1.8} />
      {isPcs ? <PowerArrowBi x={fx - 16} y={636} /> : <PowerArrow x={fx - 16} y={636} dir="up" />}
      <Wylacznik x={fx} y={663} />
      <line x1={fx} y1={672} x2={fx} y2={684} stroke={NN_BUS} strokeWidth={1.8} />
      <InverterSym x={fx} y={701} />
      {isPcs ? <BatteryGlyph x={fx + 15} y={701} /> : null}
      {lbl(fx, 734, `${label} · ${kw} kW`, isPcs ? AMBER : CYAN, 11, 800, 'middle')}
      {lbl(fx, 747, isPcs ? '4Q · 2-kier.' : '~/= · IBG §6.7', TXT2, 9, 700, 'middle')}
    </g>
  );

  // A transformer bay dropping from the SN busbar to an nN bus (Odłącznik · Wyłącznik · TR).
  const trafoBay = (fx: number, label: string, rating: string, down: number) => (
    <>
      <line x1={fx} y1={snBusY} x2={fx} y2={down} stroke={SN_BUS} strokeWidth={2} />
      <Odlacznik x={fx} y={252} />
      {lbl(fx + 18, 256, 'Q odłącznik', TXT2, 11, 700)}
      <Wylacznik x={fx} y={312} />
      {lbl(fx + 18, 316, 'Q wyłącznik · VCB', TXT2, 11, 700)}
      <TrafoDyn x={fx} y={442} />
      {lbl(fx + 26, 440, label, TXT, 12, 800)}
      {lbl(fx + 26, 454, rating, TXT_MUTED, 9.5, 600)}
      <line x1={fx} y1={462} x2={fx} y2={nnBusY} stroke={NN_BUS} strokeWidth={2} />
    </>
  );

  // The metering bay (CT in the current path on the SN busbar + VT-tap + meter = boundary).
  const meteringBay = (px: number, ctx: number) => (
    <>
      {lbl(px - 60, 160, 'POLE · Pomiarowe', CYAN, 12, 700)}
      <line x1={px} y1={snBusY} x2={px} y2={300} stroke={SN_BUS} strokeWidth={2} />
      <Odlacznik x={px} y={252} />
      {lbl(px + 18, 256, 'Q odłącznik', TXT2, 11, 700)}
      <VtNoGround x={px} y={360} />
      {lbl(px - 96, 372, vtRatioLabel(sn.un_kv), TXT, 11, 700)}
      {lbl(px - 96, 385, 'bez ziemi (→U)', TXT_MUTED, 9, 600)}
      {lbl(px - 78, 428, 'POMIAR rozliczeniowy', AMBER, 11, 700)}
      {lbl(px - 78, 441, 'granica = układ pomiarowy (I z CT, U z VT)', TXT_MUTED, 8.5, 600)}
      <CtRing x={ctx} y={snBusY} />
      {lbl(ctx, 182, ctRatioLabel(metering?.ct), TXT, 10.5, 700, 'middle')}
    </>
  );

  // The line bay (przyłącze do OSD; moc dwukierunkowa — PV gen + BESS rozładowanie).
  const lineBay = (px: number) => (
    <>
      {lbl(px - 50, 160, 'POLE · Liniowe', CYAN, 12, 700)}
      <line x1={px} y1={snBusY} x2={px} y2={505} stroke={SN_BUS} strokeWidth={2} />
      <Odlacznik x={px} y={250} />
      {lbl(px + 18, 254, 'Q odłącznik', TXT2, 11, 700)}
      <UziemnikIEC x={px} y={300} />
      {lbl(px + 40, 318, 'uziemnik (IEC)', TXT_MUTED, 9.5, 600)}
      <Glowica x={px} y={362} />
      {lbl(px + 18, 366, 'głowica kablowa', TXT_MUTED, 9.5, 600)}
      <CtRing x={px} y={410} />
      {lbl(px + 18, 414, 'CT linii · 100/1', TXT_MUTED, 9.5, 600)}
      <PowerArrowBi x={px} y={470} />
      {lbl(px - 118, 528, '3×XRUHAKXS → SIEĆ OSD', TXT_MUTED, 9, 600)}
    </>
  );

  const nodeReadout = (x: number, y: number, n: number, titleTxt: string, b: OzeVfBus, bsc: OzeScBus,
    shareTxt: string, ik1f: string, idyn: number) => (
    <NodeReadout x={x} y={y} n={n} title={titleTxt}
      uKv={b.un_kv} uPu={b.u_pu} uOk={Math.abs(b.deviation_percent) <= 5}
      ik3fMax={bsc.max.ikss_ka} ik3fMin={bsc.min.ikss_ka} ik1f={ik1f} share={shareTxt}
      icw={bsc.icw_ka} icwOk={bsc.verification.passed} ip={bsc.max.ip_ka} idyn={idyn} />
  );

  // nN-node share: grid-through-TR + LOCAL IBG (per-bus k·In from the companion).
  const nnShare = (bsc: OzeScBus, srcLabel: string): string => {
    const ibg = bsc.source_contribution.ik_contribution_ka ?? 0;
    return `TR ${fmt(Math.max(0, bsc.max.ikss_ka - ibg), 1)} + ${srcLabel} ${fmt(ibg, 1)} kA`;
  };
  // SN-node share: grid + the PV+BESS IBG REFERRED to SN (~0.09 kA, not the raw nN sum).
  const snShareTxt = `sieć ${fmt(snGridShare, 1)} + PV+BESS ${fmt(faln, 2)} kA`;

  return (
    <g data-testid={isBus ? 'sld-canon-g4-bus' : 'sld-canon-g4-ac'}>
      {/* ── header ── */}
      <text x={900} y={42} textAnchor="middle" fill="#F4F6F8" fontFamily={SANS} fontSize={22} fontWeight={800}>{title}</text>
      <text x={900} y={70} textAnchor="middle" fill={AMBER} fontFamily={SANS} fontSize={13} fontWeight={700}>{subtitle}</text>
      <text x={1540} y={112} textAnchor="end" fill={CYAN} fontFamily={SANS} fontSize={11} fontWeight={700}>WYNIKI w węzłach — ze solwera (czas rzecz.) · klik węzeł → White Box</text>

      {/* ── SN busbar ── */}
      <line x1={snX1} y1={snBusY} x2={snX2} y2={snBusY} stroke={SN_BUS} strokeWidth={5} strokeLinecap="round" />
      {lbl(snX2 + 14, snBusY + 4, `SN · ${colKv} kV`, TXT2, 12, 700)}
      <NodeBadge x={nodeX - 4} y={snBusY} n={1} />

      {isBus ? (
        <>
          {/* ── BUS variant: TR PV + TR BESS on the common SN busbar; each drops onto its
              OWN nN bus whose span is computed to contain the drop (render↔model continuity). ── */}
          {lbl(pvTrX - 84, 160, 'POLE · TR PV', CYAN, 12, 700)}
          {trafoBay(pvTrX, 'T-PV · Dyn', `${fmt(1.0, 2)} MVA · ${colKv}/0,8 kV`, 462)}
          {lbl(bessTrX - 96, 160, 'POLE · TR BESS', CYAN, 12, 700)}
          {trafoBay(bessTrX, 'T-BESS · Dyn', `${fmt(1.25, 2)} MVA · ${colKv}/0,4 kV`, 462)}
          {meteringBay(1010, 1095)}
          {lineBay(1180)}

          {/* PV nN busbar (0,8 kV, IT) — span [pvX1,pvX2] covers the T-PV drop + feeders */}
          <line x1={pvX1} y1={nnBusY} x2={pvX2} y2={nnBusY} stroke={NN_BUS} strokeWidth={5} strokeLinecap="round" />
          {lbl(pvX1, nnBusY - 10, 'nN PV · 0,8 kV · IT', TXT2, 11, 700)}
          <NodeBadge x={pvX2 - 10} y={nnBusY} n={2} />
          {pvFeeders.map((fx, i) => sourceFeeder(fx, `g4bus-pv-${i}`, `PV ${i + 1}`, 333, false))}

          {/* BESS nN busbar (0,4 kV, IT) — span [bessX1,bessX2] covers the T-BESS drop + feeders */}
          <line x1={bessX1} y1={nnBusY} x2={bessX2} y2={nnBusY} stroke={NN_BUS} strokeWidth={5} strokeLinecap="round" />
          {lbl(bessX1, nnBusY - 10, 'nN BESS · 0,4 kV · IT', TXT2, 11, 700)}
          <NodeBadge x={bessX2 - 10} y={nnBusY} n={3} />
          {pcsFeeders.map((fx, i) => sourceFeeder(fx, `g4bus-pcs-${i}`, `PCS ${i + 1}`, 500, true))}

          {/* node readouts ①②③ (numerical share per bus) */}
          {nodeReadout(nodeX, 236, 1, `szyna SN · ${colKv} kV`, sn, snSc, snShareTxt, snIk1f, withstand?.sn_idyn_ka ?? 0)}
          {nodeReadout(nodeX, 470, 2, 'szyna nN PV · 0,80 kV', vf['PV_NN'], sc['PV_NN'],
            nnShare(sc['PV_NN'], 'falow.'), nnIk1f, withstand?.nn_idyn_ka ?? 0)}
          {nodeReadout(nodeX, 700, 3, 'szyna nN BESS · 0,40 kV', vf['BESS_NN'], sc['BESS_NN'],
            nnShare(sc['BESS_NN'], 'PCS'), nnIk1f, withstand?.nn_idyn_ka ?? 0)}
        </>
      ) : (
        <>
          {/* ── AC variant: ONE transformer → common nN bus (PV inverters + BESS PCS) ── */}
          {lbl(400 - 84, 160, 'POLE · Transformatorowe', CYAN, 12, 700)}
          {trafoBay(400, 'T1 · Dyn', `${fmt(2.5, 2)} MVA · ${colKv}/0,8 kV`, 462)}
          {meteringBay(745, 950)}
          {lineBay(1090)}

          {/* common nN busbar (0,8 kV) + 3 PV inverters + 2 BESS PCS */}
          <line x1={300} y1={nnBusY} x2={1180} y2={nnBusY} stroke={NN_BUS} strokeWidth={5} strokeLinecap="round" />
          {lbl(1180 + 14, nnBusY + 4, 'nN · 0,8 kV · IT', TXT2, 12, 700)}
          <NodeBadge x={1160} y={nnBusY} n={2} />
          {[400, 520, 640].map((fx, i) => sourceFeeder(fx, `g4ac-pv-${i}`, `PV ${i + 1}`, 333, false))}
          {[860, 1000].map((fx, i) => sourceFeeder(fx, `g4ac-pcs-${i}`, `PCS ${i + 1}`, 500, true))}

          {/* node readouts ①② (numerical share per bus) */}
          {nodeReadout(nodeX, 236, 1, `szyna SN · ${colKv} kV`, sn, snSc, snShareTxt, snIk1f, withstand?.sn_idyn_ka ?? 0)}
          {nodeReadout(nodeX, 690, 2, 'szyna nN · 0,80 kV · IT', vf['NN'], sc['NN'],
            nnShare(sc['NN'], 'PV+BESS'), nnIk1f, withstand?.nn_idyn_ka ?? 0)}
        </>
      )}

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
        ['FALOWNIK PV ~/=', (cx: number, cy: number) => <InverterSym x={cx} y={cy} />],
        ['PCS + bateria (4Q)', (cx: number, cy: number) => <BatteryGlyph x={cx} y={cy} />],
        ['GŁOWICA (trójkąt)', (cx: number, cy: number) => <Glowica x={cx} y={cy} />],
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
