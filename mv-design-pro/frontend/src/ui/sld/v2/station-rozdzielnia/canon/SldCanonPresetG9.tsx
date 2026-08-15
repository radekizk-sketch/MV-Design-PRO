/**
 * Canonical SLD template — PRESET G9 (GPO WIELOPOLOWE, IEC) — the family culmination: DIFFERENT
 * source types on ONE 15 kV SN busbar. A line bay (export→OSD, NC RfG interface) + a metering bay
 * (granica, CT+VT+Wh, bez ⊟/PCC) + 3 source bays of DIFFERENT kinds, each with its OWN glyph and
 * machine/IBG protection: PV (IBG ~/=, §6.7 referred), synchronous genset (◯GS, §6.3 SUSTAINED)
 * and asynchronous wind (◯G∼, §6.7 decaying). SC at the busbar = sieć + maszyny (Z-bus) + IBG
 * (referred, F-1); the share is broken out per type. Readout ① bound to the FROZEN solver.
 */
import {
  AMBER,
  AsyncMachine,
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
  SyncMachine,
  TrafoDyn,
  TXT,
  TXT2,
  TXT_MUTED,
  UziemnikIEC,
  VtNoGround,
  vtRatioLabel,
  Wylacznik,
} from './sldCanonKit';
import type { OzeField, SldOzeArchetypeCompanion } from '../companions/ozeTypes';

/** PRESET G9 — multi-bay GPO. One SN busbar, N heterogeneous source bays (IBG + synchronous + async). */
export function SldCanonPresetG9({ companion }: { companion: SldOzeArchetypeCompanion }): JSX.Element {
  const sn = companion.voltage_flow.buses['SN_PCC'];
  const snSc = companion.short_circuit.buses['SN_PCC'];
  const sc = snSc.source_contribution;
  const ibgKa = sc.ibg_ka ?? 0;
  const machKa = sc.machine_ka ?? 0;
  const gridShare = Math.max(0, snSc.max.ikss_ka - ibgKa - machKa);
  const earthing = companion.source.grid_earthing;
  const metering = companion.source.metering;
  const snIk1f = earthing ? `${fmt(earthing.ik_1f_ka)} kA · ${earthing.neutral_point}` : 'lok. (OSD)';
  const colKv = fmt(sn.un_kv, 0); // SN kV from the FROZEN solver companion (ENEA-valid, no 30 kV)
  const ifaceCodes = (companion.fields.find((f) => f.interface_protection)?.protection_codes ?? []).join(' · ');
  const sources = companion.fields.filter((f) => f.role === 'source');

  const X = { lin: 400, ctBus: 530, pom: 660 };
  const sx = [950, 1180, 1410]; // source-bay x-positions
  const node = 1620;
  const snBusY = 200;
  const snX1 = 280;
  const snX2 = 1560;

  // Per-bay glyph + tag, chosen by the field's source_kind (no glyph hard-coding by position).
  const bayGlyph = (kind: OzeField['source_kind'], x: number, y: number): JSX.Element =>
    kind === 'SYNCHRONOUS' ? <SyncMachine x={x} y={y} />
      : kind === 'ASYNCHRONOUS' ? <AsyncMachine x={x} y={y} />
        : <InverterSym x={x} y={y} />;
  const bayTag = (kind: OzeField['source_kind']): string =>
    kind === 'SYNCHRONOUS' ? '◯GS synchr. · §6.3 podtrzym.'
      : kind === 'ASYNCHRONOUS' ? '◯G∼ async · §6.7 zanik'
        : '~/= IBG · §6.7 ogran.';
  const relayTag = (kind: OzeField['source_kind']): string =>
    kind === 'SYNCHRONOUS' ? '87G' : kind === 'ASYNCHRONOUS' ? '51' : 'AI';

  const title = 'SZABLON SLD — GPO WIELOPOLOWE (różne źródła na jednej szynie SN, IEC)';
  const subtitle = `Szyna SN ${colKv} kV · pole Liniowe · Pomiarowe + ${sources.length} pola źródłowe RÓŻNYCH typów (IBG + synchr. ◯GS + async ◯G∼) — zwarcie: sieć + maszyny (Z-bus) + IBG (sprowadzony)`;

  return (
    <g data-testid="sld-canon-g9">
      <text x={960} y={42} textAnchor="middle" fill="#F4F6F8" fontFamily={SANS} fontSize={21} fontWeight={800}>{title}</text>
      <text x={960} y={70} textAnchor="middle" fill={AMBER} fontFamily={SANS} fontSize={12} fontWeight={700}>{subtitle}</text>
      <text x={1880} y={112} textAnchor="end" fill={CYAN} fontFamily={SANS} fontSize={11} fontWeight={700}>WYNIKI w węzłach — ze solwera (czas rzecz.) · klik węzeł → pełna jawność obliczeń</text>

      {/* ── SN busbar (15 kV) ── */}
      <line x1={snX1} y1={snBusY} x2={snX2} y2={snBusY} stroke={SN_BUS} strokeWidth={5} strokeLinecap="round" />
      {lbl(snX2 + 14, snBusY + 4, `SN · ${colKv} kV (szyna GPO)`, TXT2, 12, 700)}
      <NodeBadge x={1522} y={snBusY} n={1} />

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
      {lbl(X.lin + 46, 380, 'uziemnik (IEC)', TXT_MUTED, 9.5, 600)}
      <Glowica x={X.lin} y={402} />
      {lbl(X.lin + 18, 406, 'głowica kablowa', TXT_MUTED, 9.5, 600)}
      <line x1={X.lin} y1={411} x2={X.lin} y2={505} stroke={SN_BUS} strokeWidth={2} />
      <PowerArrow x={X.lin} y={460} dir="down" />
      {lbl(X.lin + 10, 464, 'eksport → OSD', PINK, 10, 800)}
      {lbl(X.lin - 96, 528, 'kabel SN → SIEĆ OSD (granica na kablu)', TXT_MUTED, 9, 600)}

      {/* ── CT on the busbar (current path); secondary → meter ── */}
      <CtRing x={X.ctBus} y={snBusY} />
      {lbl(X.ctBus, 182, ctRatioLabel(metering?.ct), TXT, 10.5, 700, 'middle')}
      <circle cx={X.ctBus} cy={snBusY + 38} r={2.5} fill={CYAN} />
      <line x1={X.ctBus} y1={snBusY + 9} x2={X.ctBus} y2={snBusY + 36} stroke={CYAN} strokeWidth={1.2} strokeDasharray="3 3" />
      {lbl(X.ctBus + 8, snBusY + 41, '→ I do licznika', TXT_MUTED, 9, 600)}

      {/* ── POLE 2 · Pomiarowe (VT tap + billing meter = granica) ── */}
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

      {/* ── POLA źródłowe (N×, RÓŻNE typy): Q → CB → [zab.] → (trafo blokowy → zacisk nN →) źródło ── */}
      {sources.map((f, i) => {
        const fx = sx[i] ?? sx[sx.length - 1] + (i - sx.length + 1) * 230;
        // Block transformer iff the source sits on a LOWER-voltage bus (PV 0,4 / wind 0,69);
        // the synchronous genset is an MV machine DIRECTLY on the 15 kV busbar (no trafo).
        const lvBus = f.on_bus_ref !== 'SN_PCC' ? companion.voltage_flow.buses[f.on_bus_ref] : undefined;
        const glyphY = 468;
        return (
          <g key={f.field_id} data-testid={`g9-src-${i}`} data-source-kind={f.source_kind}>
            {i === 0 && lbl(fx - 40, 160, `POLA źródłowe (${sources.length}×)`, CYAN, 12, 700)}
            <line x1={fx} y1={snBusY} x2={fx} y2={lvBus ? 372 : glyphY - 12} stroke={SN_BUS} strokeWidth={2} />
            <PowerArrow x={fx} y={232} dir="up" />
            <Odlacznik x={fx} y={250} />
            <Wylacznik x={fx} y={300} />
            <RelayBox x={fx - 80} y={300} label={relayTag(f.source_kind)} />
            <line x1={fx - 68} y1={300} x2={fx - 9} y2={300} stroke={AMBER} strokeWidth={1.3} strokeDasharray="3 3" />
            {lbl(fx - 12, 346, 'zab. pola', AMBER, 8.5, 700, 'end')}
            {lvBus ? (
              <g>
                <TrafoDyn x={fx} y={392} />
                {lbl(fx + 22, 388, `TR ${colKv}/${fmt(lvBus.un_kv, 2)} kV`, TXT_MUTED, 8, 600)}
                <line x1={fx} y1={404} x2={fx} y2={glyphY - 12} stroke={NN_BUS} strokeWidth={2} />
                {lbl(fx + 16, 451, `zacisk ${fmt(lvBus.un_kv, 2)} kV`, TXT_MUTED, 8, 600)}
              </g>
            ) : null}
            {bayGlyph(f.source_kind, fx, glyphY)}
            {lbl(fx, 500, f.kind, TXT, 9.5, 800, 'middle')}
            {lbl(fx, 513, bayTag(f.source_kind), TXT2, 8.5, 700, 'middle')}
            {lbl(fx, 526, f.protection_codes.join(' · '), TXT_MUTED, 7.5, 600, 'middle')}
          </g>
        );
      })}
      {lbl((sx[0] + sx[sources.length - 1]) / 2, 542, 'GPO: maszyny w Z-bus (synchr. §6.3 podtrzymanie Ib≈Ik / async §6.7 zanik μ·q, trafo blokowy tłumi) + IBG sprowadzony (§6.7, F-1) — superpozycja na szynie SN', TXT_MUTED, 8.5, 600, 'middle')}

      {/* ── node ① — SN busbar 15 kV (sieć + maszyny + IBG) ── */}
      <NodeReadout x={node} y={236} n={1} title={`szyna GPO · ${colKv} kV`}
        uKv={sn.un_kv} uPu={sn.u_pu} uOk={Math.abs(sn.deviation_percent) <= 5}
        ik3fMax={snSc.max.ikss_ka} ik3fMin={snSc.min.ikss_ka}
        ik1f={snIk1f} share={`sieć ${fmt(gridShare, 1)} + masz ${fmt(machKa, 2)} + IBG ${fmt(ibgKa, 2)} kA`}
        icw={snSc.icw_ka} icwOk={snSc.verification.passed}
        ip={snSc.max.ip_ka} idyn={snSc.idyn_ka} />

      {/* ── LEGENDA — symbole IEC (wspólny kanon) ── */}
      <rect x={80} y={838} width={1540} height={86} rx={8} fill="none" stroke="#13435A" strokeWidth={1} />
      {lbl(104, 862, 'LEGENDA — symbole IEC', '#9FE6FF', 12, 800)}
      {[
        ['WYŁĄCZNIK □', (cx: number, cy: number) => <Wylacznik x={cx} y={cy} />],
        ['ODŁĄCZNIK ◯', (cx: number, cy: number) => <Odlacznik x={cx} y={cy} />],
        ['UZIEMNIK (IEC)', (cx: number, cy: number) => <UziemnikIEC x={cx - 8} y={cy - 6} />],
        ['CT — pierścień', (cx: number, cy: number) => <CtRing x={cx} y={cy} />],
        ['VT — bez ziemi (→V)', (cx: number, cy: number) => <VtNoGround x={cx - 14} y={cy} />],
        ['GŁOWICA (trójkąt)', (cx: number, cy: number) => <Glowica x={cx} y={cy} />],
        ['ZABEZPIECZENIE', (cx: number, cy: number) => <RelayBox x={cx} y={cy} />],
        ['IBG ~/= (falownik)', (cx: number, cy: number) => <InverterSym x={cx} y={cy} />],
        ['GEN. SYNCHR. ◯GS', (cx: number, cy: number) => <SyncMachine x={cx} y={cy} />],
        ['GEN. INDUKC. ◯G∼', (cx: number, cy: number) => <AsyncMachine x={cx} y={cy} />],
        ['kierunek mocy', (cx: number, cy: number) => <PowerArrow x={cx} y={cy - 9} dir="up" />],
      ].map(([label, sym], i) => {
        const cx = 175 + i * 132;
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
