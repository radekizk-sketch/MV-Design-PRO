/**
 * Canonical SLD template — PRESET G1 (PV 1 MW, IEC). The base of the OZE preset
 * family (G1–G9): one shared skeleton (SN busbar · POLE Transformatorowe / Pomiarowe
 * / Liniowe · TR Dyn · nN busbar · źródła), a NIENARUSZALNY IEC symbol canon, and
 * SCADA-style node readouts (①②) bound to the FROZEN solver companion (never
 * placeholders). The renderer CONSUMES solver results; it computes no physics.
 *
 * Symbol canon (§2): ◯ odłącznik · □ wyłącznik · ◇ rozłącznik (kształt=typ,
 * kolor=stan) · uziemnik IEC (linia, nie okrąg) · TR 2 okręgi + Dyn (szeregowo) ·
 * CT pierścień · VT bez ziemi → V · głowica trójkąt · przekaźnik kwadrat I> (trip =
 * linia przerywana) · falownik kwadrat z przekątną ~/= · GRANICA ⊟ · POMIAR Wh ·
 * strzałka mocy (różowa). NIE: PCC.
 *
 * LAYOUT INVARIANT: every canonical glyph carries a data-keepout box; annotation
 * texts must not intersect any keep-out (enforced by SldCanonPresetG1.test.tsx — a
 * bounding-box collision check, so text-on-glyph overlaps cannot recur in G2–G9).
 */
import type { SldOzeArchetypeCompanion } from '../companions/ozeTypes';

const GREEN = '#1FA24A';
const CYAN = '#3BA7D6';
const SN_BUS = '#1FA24A';
const NN_BUS = '#3BA7D6';
const AMBER = '#FFB020';
const PINK = '#FF5FA2';
const TXT = '#CFE9FF';
const TXT2 = '#8FA8BD';
const TXT_MUTED = '#6F8194';
const OK = '#5BE08A';
const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace';
const SANS = 'Inter, system-ui, sans-serif';

const fmt = (v: number, d = 2): string => v.toFixed(d).replace('.', ',');
const ko = (x: number, y: number, w: number, h: number): string => `${x},${y},${w},${h}`;

// ── Canonical IEC symbols (§2). Each carries data-keepout (glyph bounding box). ──
function Odlacznik({ x, y, closed = true }: { x: number; y: number; closed?: boolean }): JSX.Element {
  return (
    <g data-keepout={ko(x - 9, y - 9, 18, 18)}>
      <circle cx={x} cy={y} r={9} fill={closed ? GREEN : '#0A1622'} stroke={closed ? GREEN : '#FF6B6B'} strokeWidth={2} />
    </g>
  );
}
function Wylacznik({ x, y, closed = true }: { x: number; y: number; closed?: boolean }): JSX.Element {
  return (
    <g data-keepout={ko(x - 9, y - 9, 18, 18)}>
      <rect x={x - 9} y={y - 9} width={18} height={18} rx={1.5} fill={closed ? GREEN : '#0A1622'} stroke={closed ? GREEN : '#FF6B6B'} strokeWidth={2} />
    </g>
  );
}
function UziemnikIEC({ x, y, dir = 'right' }: { x: number; y: number; dir?: 'right' | 'left' }): JSX.Element {
  const s = dir === 'right' ? 1 : -1;
  const gx = x + s * 22;
  const box = dir === 'right' ? ko(x - 2, y - 9, 35, 29) : ko(x - 33, y - 9, 35, 29);
  return (
    <g data-keepout={box} stroke={CYAN} strokeWidth={1.6} fill="none">
      <line x1={x} y1={y} x2={gx} y2={y} />
      <line x1={gx} y1={y - 7} x2={gx + s * 9} y2={y + 7} />
      <line x1={gx} y1={y} x2={gx} y2={y + 12} />
      <line x1={gx - 6} y1={y + 12} x2={gx + 6} y2={y + 12} />
      <line x1={gx - 4} y1={y + 15} x2={gx + 4} y2={y + 15} />
      <line x1={gx - 2} y1={y + 18} x2={gx + 2} y2={y + 18} />
    </g>
  );
}
function TrafoDyn({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g data-keepout={ko(x - 13, y - 20, 26, 40)} stroke="#E6F2FF" strokeWidth={1.6} fill="none">
      <circle cx={x} cy={y - 7} r={13} />
      <circle cx={x} cy={y + 7} r={13} />
      <polygon points={`${x},${y - 13} ${x - 5},${y - 4} ${x + 5},${y - 4}`} strokeWidth={1.3} />
      <g strokeWidth={1.3}>
        <line x1={x} y1={y + 2} x2={x} y2={y + 8} />
        <line x1={x} y1={y + 8} x2={x - 5} y2={y + 14} />
        <line x1={x} y1={y + 8} x2={x + 5} y2={y + 14} />
      </g>
    </g>
  );
}
function CtRing({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g data-keepout={ko(x - 9, y - 9, 18, 18)}>
      <circle cx={x} cy={y} r={9} fill="none" stroke="#E6F2FF" strokeWidth={1.8} />
    </g>
  );
}
function VtNoGround({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g data-keepout={ko(x - 7, y - 12, 45, 24)} stroke="#E6F2FF" strokeWidth={1.6} fill="none">
      <circle cx={x} cy={y - 5} r={7} />
      <circle cx={x} cy={y + 5} r={7} />
      <line x1={x + 7} y1={y} x2={x + 22} y2={y} />
      <circle cx={x + 30} cy={y} r={8} stroke={CYAN} />
      <text x={x + 30} y={y + 3} textAnchor="middle" fill={CYAN} fontFamily={SANS} fontSize={8} fontWeight={700}>V</text>
    </g>
  );
}
function Glowica({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g data-keepout={ko(x - 9, y - 8, 18, 17)}>
      <polygon points={`${x - 9},${y - 8} ${x + 9},${y - 8} ${x},${y + 9}`} fill="none" stroke="#E6F2FF" strokeWidth={1.8} />
    </g>
  );
}
function RelayBox({ x, y, label = 'I>' }: { x: number; y: number; label?: string }): JSX.Element {
  return (
    <g data-keepout={ko(x - 12, y - 11, 24, 22)}>
      <rect x={x - 12} y={y - 11} width={24} height={22} rx={2} fill="#0A1622" stroke={CYAN} strokeWidth={1.6} />
      <text x={x} y={y + 4} textAnchor="middle" fill={CYAN} fontFamily={MONO} fontSize={10} fontWeight={800}>{label}</text>
    </g>
  );
}
function InverterSym({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g data-keepout={ko(x - 13, y - 13, 26, 26)} stroke={AMBER} strokeWidth={1.7} fill="none">
      <rect x={x - 13} y={y - 13} width={26} height={26} rx={2} />
      <line x1={x - 13} y1={y + 13} x2={x + 13} y2={y - 13} />
      <path d={`M ${x - 9} ${y + 7} q 2.5 -4 5 0 q 2.5 4 5 0`} strokeWidth={1.4} />
      <g strokeWidth={1.4}>
        <line x1={x - 9} y1={y - 6} x2={x - 3} y2={y - 6} />
        <line x1={x - 9} y1={y - 3} x2={x - 5} y2={y - 3} />
      </g>
    </g>
  );
}
function GranicaMarker({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g data-keepout={ko(x - 11, y - 11, 22, 22)}>
      <rect x={x - 9} y={y - 9} width={18} height={18} rx={2} fill="#0A1622" stroke={AMBER} strokeWidth={1.8} transform={`rotate(45 ${x} ${y})`} />
      <line x1={x - 5} y1={y} x2={x + 5} y2={y} stroke={AMBER} strokeWidth={1.6} />
    </g>
  );
}
function NodeBadge({ x, y, n }: { x: number; y: number; n: number }): JSX.Element {
  return (
    <g data-keepout={ko(x - 9, y - 9, 18, 18)}>
      <circle cx={x} cy={y} r={9} fill="#0A1622" stroke={CYAN} strokeWidth={1.6} />
      <text x={x} y={y + 3.5} textAnchor="middle" fill={CYAN} fontFamily={SANS} fontSize={10} fontWeight={800}>{n}</text>
    </g>
  );
}
function PowerArrow({ x, y, dir }: { x: number; y: number; dir: 'up' | 'down' }): JSX.Element {
  const h = dir === 'up' ? -1 : 1;
  return (
    <g stroke={PINK} fill={PINK} strokeWidth={2}>
      <line x1={x} y1={y} x2={x} y2={y + h * 18} />
      <polygon points={`${x - 4},${y + h * 14} ${x + 4},${y + h * 14} ${x},${y + h * 20}`} stroke="none" />
    </g>
  );
}

function lbl(x: number, y: number, t: string, color = TXT2, size = 11, weight = 600, anchor: 'start' | 'middle' | 'end' = 'start'): JSX.Element {
  return <text x={x} y={y} textAnchor={anchor} fill={color} fontFamily={MONO} fontSize={size} fontWeight={weight}>{t}</text>;
}

/** SCADA node readout (no frame, no table) — "wielkość = wartość" at the node. */
function NodeReadout(props: {
  x: number; y: number; n: number; title: string;
  uKv: number; uPu: number; uOk: boolean; ik3fMax: number; ik3fMin: number;
  ik1f: string; share: string; icw: number; icwOk: boolean; ip: number; idyn: number;
}): JSX.Element {
  const { x, y, n, title, uKv, uPu, uOk, ik3fMax, ik3fMin, ik1f, share, icw, icwOk, ip, idyn } = props;
  const ipOk = ip <= idyn;
  const rows: Array<[string, string, string]> = [
    ['U', `${fmt(uKv)} kV · ${fmt(uPu)} pu${uOk ? ' ✓' : ''}`, uOk ? OK : AMBER],
    ['Ik″ 3f', `${fmt(ik3fMax, 1)} / ${fmt(ik3fMin, 1)} kA`, TXT],
    ['Ik″ 1f-z', ik1f, TXT],
    ['udział', share, TXT],
    ['Icw', `${fmt(icw, 0)} kA${icwOk ? ' ✓' : ''}`, icwOk ? OK : '#FF6B6B'],
    ['ip', `${fmt(ip, 1)} kA · idyn ${fmt(idyn, 0)} ${ipOk ? '✓' : '✗'}`, ipOk ? OK : '#FF6B6B'],
  ];
  return (
    <g>
      <text x={x} y={y} fill="#9FE6FF" fontFamily={SANS} fontSize={12} fontWeight={800}>{n === 1 ? '①' : '②'}</text>
      <text x={x + 16} y={y} fill="#9FE6FF" fontFamily={MONO} fontSize={12} fontWeight={800}>{title}</text>
      {rows.map(([k, v, c], i) => (
        <g key={k}>
          {lbl(x, y + 16 + i * 15, k, TXT_MUTED, 10.5, 600)}
          {lbl(x + 70, y + 16 + i * 15, v, c, 10.5, 700)}
        </g>
      ))}
    </g>
  );
}

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
  const snIk1f = earthing ? `${fmt(earthing.ik_1f_sn_ka)} kA · ${earthing.neutral_point}` : '—';
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
      {lbl(X.p2 - 96, 372, 'VT FD11', TXT, 11, 700)}
      {lbl(X.p2 - 96, 385, '15/√3 · bez ziemi', TXT_MUTED, 9, 600)}
      <g data-keepout={ko(X.p2 - 11, 392, 22, 18)}>
        <rect x={X.p2 - 11} y={392} width={22} height={18} rx={2} fill="#0A1622" stroke={AMBER} strokeWidth={1.6} />
        <text x={X.p2} y={405} textAnchor="middle" fill={AMBER} fontFamily={MONO} fontSize={9} fontWeight={800}>Wh</text>
      </g>
      {lbl(X.p2 - 78, 428, 'POMIAR rozliczeniowy', AMBER, 11, 700)}
      {lbl(X.p2 - 78, 441, '−A16 analizator ND45 (I z AD11, U z FD11)', TXT_MUTED, 8.5, 600)}

      {/* CT AD11 — pierścień na szynie (pomiarowy, strona linii/OSD). */}
      <CtRing x={X.ctBus} y={snBusY} />
      {lbl(X.ctBus, 182, 'CT AD11 · 40/5/5/5', TXT, 10.5, 700, 'middle')}
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
      <GranicaMarker x={X.p3} y={452} />
      {lbl(X.p3 - 72, 449, 'GRANICA', AMBER, 10.5, 800, 'end')}
      {lbl(X.p3 - 72, 462, 'G-ZKSN → OSD', TXT_MUTED, 9, 600, 'end')}
      <line x1={X.p3} y1={461} x2={X.p3} y2={505} stroke={SN_BUS} strokeWidth={2} />
      <PowerArrow x={X.p3} y={482} dir="down" />
      {lbl(X.p3 + 10, 486, 'eksport', PINK, 10, 800)}
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
