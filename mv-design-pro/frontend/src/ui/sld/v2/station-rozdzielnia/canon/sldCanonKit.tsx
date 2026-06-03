/**
 * Canonical SLD kit — the NIENARUSZALNY IEC symbol set (§2), SCADA node readout, and
 * the layout-collision helper shared by EVERY OZE preset (G1–G9). One skeleton, one
 * symbol canon: presets compose these primitives, they never define local glyph
 * variants. Each glyph carries a data-keepout box; presets' tests assert that no
 * annotation text intersects a keep-out (bounding-box check), so text-on-glyph
 * overlaps cannot recur as the family grows.
 *
 * Canon: ◯ odłącznik · □ wyłącznik · ◇ rozłącznik (kształt=typ, kolor=stan) · uziemnik
 * IEC (linia, nie okrąg) · TR 2 okręgi + Dyn (szeregowo) · CT pierścień · VT bez ziemi
 * → V · głowica trójkąt · przekaźnik kwadrat I> (trip = linia przerywana) · falownik
 * kwadrat z przekątną ~/= · POMIAR Wh (licznik = granica własności/eksploatacji) ·
 * strzałka mocy (różowa). NIE: PCC, NIE: osobny znacznik granicy — granicą jest pomiar.
 */

import type { OzeMeteringCt } from '../companions/ozeTypes';

export const GREEN = '#1FA24A';
export const CYAN = '#3BA7D6';
export const SN_BUS = '#1FA24A';
export const NN_BUS = '#3BA7D6';
export const AMBER = '#FFB020';
export const PINK = '#FF5FA2';
export const TXT = '#CFE9FF';
export const TXT2 = '#8FA8BD';
export const TXT_MUTED = '#6F8194';
export const OK = '#5BE08A';
export const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace';
export const SANS = 'Inter, system-ui, sans-serif';

export const fmt = (v: number, d = 2): string => v.toFixed(d).replace('.', ',');
/** Keep-out box "x,y,w,h" — for preset-local glyphs (fuses, meters) outside the canon. */
export const ko = (x: number, y: number, w: number, h: number): string => `${x},${y},${w},${h}`;

/** Compose a CT ratio label from the structured nameplate — "CT · [type · ]ipn/isn/isn…".
 *  The render NEVER hard-codes a ratio; absent data → explicit "—" (no literal substitution).
 *  Selection (Ipn = next-std ≥ I_load) is the station wizard's; here we only render its field. */
export function ctRatioLabel(ct?: OzeMeteringCt): string {
  if (!ct) return 'CT · —';
  const cores = Math.max(1, Math.round(ct.cores));
  const secondary = Array.from({ length: cores }, () => fmt(ct.isn_a, 0)).join('/');
  const tag = ct.type ? `${ct.type} · ` : '';
  return `CT · ${tag}${fmt(ct.ipn_a, 0)}/${secondary}`;
}

/** Compose a VT ratio label "VT · Un/√3". The primary is DERIVED from the bus Un (line-to-earth,
 *  Un/√3) — deterministic, not a design choice — so only un_kv is required. Absent un_kv → "—"
 *  (no literal). The secondary (Usn/√3) + Fv ride in the contract (metering.vt) for the
 *  wizard/detail drawer, not this cramped metering-bay label. */
export function vtRatioLabel(unKv: number | undefined): string {
  if (unKv === undefined || !Number.isFinite(unKv) || unKv <= 0) return 'VT · —';
  // Primary = the bus Un shown FAITHFULLY (strip trailing zeros — 15 → "15", 15,75 → "15,75");
  // never integer-rounded (15,75 → "16" would misrepresent the level).
  const primary = unKv.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
  return `VT · ${primary}/√3`;
}

export function lbl(
  x: number, y: number, t: string, color = TXT2, size = 11, weight = 600,
  anchor: 'start' | 'middle' | 'end' = 'start',
): JSX.Element {
  return <text x={x} y={y} textAnchor={anchor} fill={color} fontFamily={MONO} fontSize={size} fontWeight={weight}>{t}</text>;
}

export function Odlacznik({ x, y, closed = true }: { x: number; y: number; closed?: boolean }): JSX.Element {
  return (
    <g data-keepout={ko(x - 9, y - 9, 18, 18)}>
      <circle cx={x} cy={y} r={9} fill={closed ? GREEN : '#0A1622'} stroke={closed ? GREEN : '#FF6B6B'} strokeWidth={2} />
    </g>
  );
}
export function Wylacznik({ x, y, closed = true }: { x: number; y: number; closed?: boolean }): JSX.Element {
  return (
    <g data-keepout={ko(x - 9, y - 9, 18, 18)}>
      <rect x={x - 9} y={y - 9} width={18} height={18} rx={1.5} fill={closed ? GREEN : '#0A1622'} stroke={closed ? GREEN : '#FF6B6B'} strokeWidth={2} />
    </g>
  );
}
/** IEC 60617 EARTHING SWITCH (uziemnik) — a SWITCHING apparatus, not a fixed tap to earth: a
 * straight conductor stub off the bay + a moving blade deflected ~38° (default OPEN, state by
 * colour), terminated by the STANDARD IEC earth electrode (one longest bar + two shorter below,
 * joined by a short lead). Distinct from protective earth (no blade), the disconnector ◯ (no
 * earth), and the cable head ▽ (triangle). */
export function UziemnikIEC({ x, y, closed = false }: { x: number; y: number; closed?: boolean }): JSX.Element {
  const sw = closed ? GREEN : '#FF6B6B'; // blade state colour — default OPEN
  const bx = x + 16; // earthing-switch axis, branched off the bay conductor
  return (
    <g data-keepout={ko(x - 1, y - 2, 27, 30)} fill="none">
      {/* straight conductor stub off the bay + fixed (upper) contact */}
      <line x1={x} y1={y} x2={bx} y2={y} stroke={sw} strokeWidth={1.6} />
      <line x1={bx} y1={y} x2={bx} y2={y + 4} stroke={sw} strokeWidth={1.8} />
      {/* moving blade — pivots at the earth side, deflected ~38° (OPEN: a gap to the fixed contact) */}
      <line x1={bx} y1={y + 15} x2={bx - 9} y2={y + 4} stroke={sw} strokeWidth={2} />
      <circle cx={bx} cy={y + 15} r={1.5} fill={sw} stroke="none" />
      {/* earth lead + standard IEC earth electrode (longest → shortest) */}
      <line x1={bx} y1={y + 15} x2={bx} y2={y + 18} stroke={CYAN} strokeWidth={1.6} />
      <line x1={bx - 8} y1={y + 18} x2={bx + 8} y2={y + 18} stroke={CYAN} strokeWidth={1.9} />
      <line x1={bx - 5} y1={y + 21} x2={bx + 5} y2={y + 21} stroke={CYAN} strokeWidth={1.9} />
      <line x1={bx - 2} y1={y + 24} x2={bx + 2} y2={y + 24} stroke={CYAN} strokeWidth={1.9} />
    </g>
  );
}
export function TrafoDyn({ x, y }: { x: number; y: number }): JSX.Element {
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
export function CtRing({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g data-keepout={ko(x - 9, y - 9, 18, 18)}>
      <circle cx={x} cy={y} r={9} fill="none" stroke="#E6F2FF" strokeWidth={1.8} />
    </g>
  );
}
export function VtNoGround({ x, y }: { x: number; y: number }): JSX.Element {
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
export function Glowica({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g data-keepout={ko(x - 9, y - 8, 18, 17)}>
      <polygon points={`${x - 9},${y - 8} ${x + 9},${y - 8} ${x},${y + 9}`} fill="none" stroke="#E6F2FF" strokeWidth={1.8} />
    </g>
  );
}
export function RelayBox({ x, y, label = 'I>' }: { x: number; y: number; label?: string }): JSX.Element {
  return (
    <g data-keepout={ko(x - 12, y - 11, 24, 22)}>
      <rect x={x - 12} y={y - 11} width={24} height={22} rx={2} fill="#0A1622" stroke={CYAN} strokeWidth={1.6} />
      <text x={x} y={y + 4} textAnchor="middle" fill={CYAN} fontFamily={MONO} fontSize={10} fontWeight={800}>{label}</text>
    </g>
  );
}
export function InverterSym({ x, y }: { x: number; y: number }): JSX.Element {
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
export function NodeBadge({ x, y, n }: { x: number; y: number; n: number }): JSX.Element {
  return (
    <g data-keepout={ko(x - 9, y - 9, 18, 18)}>
      <circle cx={x} cy={y} r={9} fill="#0A1622" stroke={CYAN} strokeWidth={1.6} />
      <text x={x} y={y + 3.5} textAnchor="middle" fill={CYAN} fontFamily={SANS} fontSize={10} fontWeight={800}>{n}</text>
    </g>
  );
}
export function PowerArrow({ x, y, dir }: { x: number; y: number; dir: 'up' | 'down' }): JSX.Element {
  const h = dir === 'up' ? -1 : 1;
  return (
    <g stroke={PINK} fill={PINK} strokeWidth={2}>
      <line x1={x} y1={y} x2={x} y2={y + h * 18} />
      <polygon points={`${x - 4},${y + h * 14} ${x + 4},${y + h * 14} ${x},${y + h * 20}`} stroke="none" />
    </g>
  );
}

/** Bidirectional power (BESS charge ⇄ discharge / 4Q) — arrowheads both ends. */
export function PowerArrowBi({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g stroke={PINK} fill={PINK} strokeWidth={2}>
      <line x1={x} y1={y - 11} x2={x} y2={y + 11} />
      <polygon points={`${x - 4},${y - 7} ${x + 4},${y - 7} ${x},${y - 13}`} stroke="none" />
      <polygon points={`${x - 4},${y + 7} ${x + 4},${y + 7} ${x},${y + 13}`} stroke="none" />
    </g>
  );
}

/** Battery glyph (BESS) — drawn beside the PCS converter (~/= ⎓). */
export function BatteryGlyph({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g stroke={AMBER} strokeWidth={1.4} fill="none" data-keepout={ko(x - 2, y - 7, 18, 14)}>
      <line x1={x} y1={y - 6} x2={x + 14} y2={y - 6} />
      <line x1={x + 3} y1={y - 3} x2={x + 11} y2={y - 3} strokeWidth={1} />
      <line x1={x} y1={y} x2={x + 14} y2={y} />
      <line x1={x + 3} y1={y + 3} x2={x + 11} y2={y + 3} strokeWidth={1} />
      <line x1={x} y1={y + 6} x2={x + 14} y2={y + 6} />
    </g>
  );
}

/** Wind-turbine generator (WTG) — IEC rotating machine ◯ with "G"; pairs with the ~/=
 * converter to read as a full-converter (Type 4) turbine. AMBER source color. */
export function WindGen({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g data-keepout={ko(x - 12, y - 12, 24, 24)}>
      <circle cx={x} cy={y} r={12} fill="none" stroke={AMBER} strokeWidth={1.7} />
      <text x={x} y={y + 4} textAnchor="middle" fill={AMBER} fontFamily={SANS} fontSize={12} fontWeight={800}>G</text>
    </g>
  );
}

/** IEC 60617 rotating machine ◯ marked "G∼" = ASYNCHRONOUS (induction) generator — the ∼ is
 * the induction/AC marking, distinct from the synchronous WindGen ◯"G" (PMSG). Used where the
 * machine itself is the SC source on the grid (DFIG stator, cage), not behind a full converter. */
export function AsyncMachine({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g data-keepout={ko(x - 12, y - 12, 24, 24)}>
      <circle cx={x} cy={y} r={12} fill="none" stroke={AMBER} strokeWidth={1.7} />
      <text x={x} y={y + 4} textAnchor="middle" fill={AMBER} fontFamily={SANS} fontSize={11} fontWeight={800}>G∼</text>
    </g>
  );
}

/** IEC 60617 rotating machine ◯ marked "GS" = SYNCHRONOUS generator — distinct from the
 * AsyncMachine ◯"G∼" (induction). Used where a synchronous machine sits directly on the grid
 * (cogeneration): its SC is SUSTAINED by excitation, NOT decaying to the grid-only like induction. */
export function SyncMachine({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g data-keepout={ko(x - 12, y - 12, 24, 24)}>
      <circle cx={x} cy={y} r={12} fill="none" stroke={AMBER} strokeWidth={1.7} />
      <text x={x} y={y + 4} textAnchor="middle" fill={AMBER} fontFamily={SANS} fontSize={10} fontWeight={800}>GS</text>
    </g>
  );
}

/** IEC 60617 capacitor — two parallel plates (non-polarised). A reactive-compensation bank for
 * an induction generator (which draws Q from the grid); leads top/bottom for inline placement. */
export function CapacitorBank({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g data-keepout={ko(x - 9, y - 9, 18, 18)}>
      <line x1={x} y1={y - 9} x2={x} y2={y - 2} stroke={CYAN} strokeWidth={1.5} />
      <line x1={x - 8} y1={y - 2} x2={x + 8} y2={y - 2} stroke={CYAN} strokeWidth={2.2} />
      <line x1={x - 8} y1={y + 3} x2={x + 8} y2={y + 3} stroke={CYAN} strokeWidth={2.2} />
      <line x1={x} y1={y + 3} x2={x} y2={y + 9} stroke={CYAN} strokeWidth={1.5} />
    </g>
  );
}

const CIRCLED = ['①', '②', '③', '④', '⑤'];

/** SCADA node readout (no frame, no table) — "wielkość = wartość" at the node. */
export function NodeReadout(props: {
  x: number; y: number; n: number; title: string;
  uKv: number; uPu: number; uOk: boolean; ik3fMax: number; ik3fMin: number;
  // idyn is the bus dynamic-withstand nameplate. OPTIONAL: omit it where no per-bus rating
  // exists (e.g. a station whose single nn_idyn_ka scalar can't be assigned to one of several
  // distinct nN buses) — then ip is shown without a (fabricated) pass/fail verdict.
  ik1f: string; share: string; icw: number; icwOk: boolean; ip: number; idyn?: number;
}): JSX.Element {
  const { x, y, n, title, uKv, uPu, uOk, ik3fMax, ik3fMin, ik1f, share, icw, icwOk, ip, idyn } = props;
  const ipOk = idyn === undefined ? true : ip <= idyn;
  const rows: Array<[string, string, string]> = [
    ['U', `${fmt(uKv)} kV · ${fmt(uPu)} pu${uOk ? ' ✓' : ''}`, uOk ? OK : AMBER],
    ['Ik″ 3f', `${fmt(ik3fMax, 1)} / ${fmt(ik3fMin, 1)} kA`, TXT],
    ['Ik″ 1f-z', ik1f, TXT],
    ['udział', share, TXT],
    ['Icw', `${fmt(icw, 0)} kA${icwOk ? ' ✓' : ''}`, icwOk ? OK : '#FF6B6B'],
    idyn === undefined
      ? ['ip', `${fmt(ip, 1)} kA`, TXT]
      : ['ip', `${fmt(ip, 1)} kA · idyn ${fmt(idyn, 0)} ${ipOk ? '✓' : '✗'}`, ipOk ? OK : '#FF6B6B'],
  ];
  return (
    <g>
      <text x={x} y={y} fill="#9FE6FF" fontFamily={SANS} fontSize={12} fontWeight={800}>{CIRCLED[n - 1] ?? `${n}`}</text>
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

/** Bounding-box layout check (DoD §8.5 / §POZYCJE): every annotation text in the
 * schematic band must clear every canonical glyph's data-keepout box. Returns the
 * offenders (empty ⇒ clean). Shared by all preset tests so the rule holds family-wide. */
export function glyphTextCollisions(svg: SVGSVGElement, band: [number, number] = [130, 820]): string[] {
  const keepouts = Array.from(svg.querySelectorAll('[data-keepout]')).map((el) => {
    const [x, y, w, h] = (el.getAttribute('data-keepout') ?? '').split(',').map(Number);
    return { x0: x, y0: y, x1: x + w, y1: y + h };
  });
  const CHAR = 0.62; // monospace advance ≈ 0.6·fontSize (slight over-estimate)
  const out: string[] = [];
  for (const t of Array.from(svg.querySelectorAll('text'))) {
    if (t.closest('[data-keepout]')) continue; // a glyph's own internal label
    const x = Number(t.getAttribute('x'));
    const y = Number(t.getAttribute('y'));
    const size = Number(t.getAttribute('font-size'));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size)) continue;
    if (y < band[0] || y > band[1]) continue;
    const anchor = t.getAttribute('text-anchor') ?? 'start';
    const w = (t.textContent ?? '').length * size * CHAR;
    const tx0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    const box = { x0: tx0, x1: tx0 + w, y0: y - size, y1: y + 2 };
    for (const k of keepouts) {
      if (box.x0 < k.x1 && box.x1 > k.x0 && box.y0 < k.y1 && box.y1 > k.y0) {
        out.push(`"${t.textContent}" @(${x},${y}) ∩ keepout(${k.x0},${k.y0},${k.x1},${k.y1})`);
        break;
      }
    }
  }
  return out;
}

/** Render↔model CONTINUITY (DoD §8.6) — the conductor analogue of "no orphan station":
 * every VERTICAL conductor endpoint that lands at a busbar's Y-level MUST lie within some
 * busbar's X-span. A transformer drop / feeder cannot dangle next to a bus it never touches
 * (a bus that is connected in the model rendered as a visual island). Conductors = the
 * SN_BUS/NN_BUS coloured power lines (dashed signal lines excluded); busbars = the thick
 * (≥4) horizontal ones. Returns the dangling endpoints (empty ⇒ every drawn connection is
 * a continuous path). Shared by the family tests so the rule holds across G1…G9. */
export function busbarDanglingConductors(svg: SVGSVGElement, tol = 4): string[] {
  const n = (el: Element, a: string): number => Number(el.getAttribute(a));
  const isConductor = (el: Element): boolean => {
    const s = el.getAttribute('stroke');
    return (s === SN_BUS || s === NN_BUS) && !el.getAttribute('stroke-dasharray');
  };
  const lines = Array.from(svg.querySelectorAll('line')).filter(isConductor);
  const bars = lines
    .filter((l) => Math.abs(n(l, 'y1') - n(l, 'y2')) < 1 && n(l, 'stroke-width') >= 4)
    .map((l) => ({ y: n(l, 'y1'), x0: Math.min(n(l, 'x1'), n(l, 'x2')), x1: Math.max(n(l, 'x1'), n(l, 'x2')) }));
  const out: string[] = [];
  for (const l of lines) {
    if (Math.abs(n(l, 'x1') - n(l, 'x2')) >= 1) continue; // vertical conductors only
    const x = n(l, 'x1');
    for (const y of [n(l, 'y1'), n(l, 'y2')]) {
      if (!bars.some((b) => Math.abs(b.y - y) <= tol)) continue; // endpoint not at a bus level
      if (!bars.some((b) => Math.abs(b.y - y) <= tol && x >= b.x0 - tol && x <= b.x1 + tol)) {
        out.push(`conductor @x=${x} ends at busbar y=${y} but lands on no bus span (hanging)`);
      }
    }
  }
  return out;
}
