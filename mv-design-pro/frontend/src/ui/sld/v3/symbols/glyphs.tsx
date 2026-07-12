/**
 * SLD V3 — glify symboli IEC 60617 (SLD_CAD_SPEC_V3 §3, §6).
 *
 * Rysunek BAZOWY: neutralny kolor, czytelny w mono (P5). Stan łącznika
 * wyrażony GEOMETRIĄ (wypełnienie CB, kąt noża DS), nie kolorem. Nakładki
 * stanu (energizacja, napięcie) nakłada kanwa — nie glif.
 * Origin glifu = lewy-górny róg bboxa z SYMBOL_DEFS (porty pasują 1:1).
 */

import { SYMBOL_DEFS, type SymbolId } from './defs';

export const V3_STROKE_BASE = '#E8EEF4';
export const V3_STROKE_APPARATUS = 1.2;

export type SwitchState = 'closed' | 'open' | 'unknown';

export interface GlyphProps {
  readonly x: number;
  readonly y: number;
  readonly state?: SwitchState;
  /** Nadpisanie koloru bazowego (nakładka napięcia na szynach itd.). */
  readonly stroke?: string;
}

function glyphGroupProps(id: SymbolId, props: GlyphProps) {
  return {
    'data-symbol-canon': id,
    'data-switch-state': props.state,
    transform: `translate(${props.x}, ${props.y})`,
  } as const;
}

function stroke(props: GlyphProps): string {
  return props.stroke ?? V3_STROKE_BASE;
}

export function BreakerGlyph(props: GlyphProps): JSX.Element {
  const state = props.state ?? 'unknown';
  return (
    <g {...glyphGroupProps('breaker', props)}>
      <rect
        x={2} y={2} width={12} height={12}
        fill={state === 'closed' ? stroke(props) : 'none'}
        fillOpacity={state === 'unknown' ? 0.35 : 1}
        stroke={stroke(props)}
        strokeWidth={V3_STROKE_APPARATUS}
      />
      <line x1={8} y1={0} x2={8} y2={2} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={8} y1={14} x2={8} y2={16} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
    </g>
  );
}

export function DisconnectorGlyph(props: GlyphProps): JSX.Element {
  const state = props.state ?? 'unknown';
  // Nóż: zamknięty = w osi toru; otwarty = odchylony 45° (IEC 60617-7).
  const bladeEnd = state === 'open' ? { x: 15, y: 12 } : { x: 8, y: 18 };
  return (
    <g {...glyphGroupProps('disconnector', props)}>
      <line x1={8} y1={0} x2={8} y2={6} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line
        x1={8} y1={6} x2={bladeEnd.x} y2={bladeEnd.y}
        stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS}
        strokeDasharray={state === 'unknown' ? '3 2' : undefined}
      />
      <line x1={4} y1={18} x2={12} y2={18} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={8} y1={18} x2={8} y2={24} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
    </g>
  );
}

export function EarthSwitchGlyph(props: GlyphProps): JSX.Element {
  const state = props.state ?? 'open';
  const bladeEnd = state === 'open' ? { x: 15, y: 10 } : { x: 8, y: 14 };
  return (
    <g {...glyphGroupProps('earthSwitch', props)}>
      <line x1={8} y1={0} x2={8} y2={4} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={8} y1={4} x2={bladeEnd.x} y2={bladeEnd.y} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={8} y1={14} x2={8} y2={17} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      {/* ⏚ IEC: trzy malejące kreski */}
      <line x1={2} y1={17} x2={14} y2={17} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={4} y1={20} x2={12} y2={20} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={6} y1={23} x2={10} y2={23} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
    </g>
  );
}

export function FuseSwitchGlyph(props: GlyphProps): JSX.Element {
  const state = props.state ?? 'closed';
  return (
    <g {...glyphGroupProps('fuseSwitch', props)}>
      <line x1={8} y1={0} x2={8} y2={6} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      {state === 'open'
        ? <line x1={8} y1={6} x2={15} y2={12} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
        : <line x1={8} y1={6} x2={8} y2={10} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />}
      {/* wkładka bezpiecznikowa: prostokąt z żyłą */}
      <rect x={5} y={10} width={6} height={12} fill="none" stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={8} y1={10} x2={8} y2={22} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={8} y1={22} x2={8} y2={32} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
    </g>
  );
}

export function Transformer2WGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('transformer2W', props)}>
      <line x1={16} y1={0} x2={16} y2={2} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <circle cx={16} cy={13} r={11} fill="none" stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <circle cx={16} cy={27} r={11} fill="none" stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={16} y1={38} x2={16} y2={40} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
    </g>
  );
}

export function CableHeadGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('cableHead', props)}>
      <path d="M2,14 L14,14 L8,2 Z" fill="none" stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={8} y1={14} x2={8} y2={16} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
    </g>
  );
}

export function JointSleeveGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('jointSleeve', props)}>
      <line x1={0} y1={8} x2={3} y2={8} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <rect x={3} y={5} width={10} height={6} fill={stroke(props)} fillOpacity={0.85} stroke={stroke(props)} strokeWidth={0.8} />
      <line x1={13} y1={8} x2={16} y2={8} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
    </g>
  );
}

export function NoPointGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('noPoint', props)}>
      {/* jawna PRZERWA toru + okrąg łącznika otwartego */}
      <line x1={0} y1={8} x2={4} y2={8} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={12} y1={8} x2={16} y2={8} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <circle cx={8} cy={8} r={3.5} fill="none" stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
    </g>
  );
}

export function JunctionGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('junction', props)}>
      <circle cx={8} cy={8} r={3} fill={stroke(props)} />
    </g>
  );
}

/** F9.3 (spec §14.4): kropka WIĘKSZA (r=7 vs r=3 bazowy) na WIĘKSZYM
 *  gabarycie (32×32 vs 16×16, `symbols/defs.ts`) — akcent węzła rozgałęzienia
 *  odróżnialny od zwykłego T-węzła trasy (`junction`) BEZ zmiany geometrii
 *  routingu (glif, nie trasa). */
export function BranchJunctionGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('branchJunction', props)}>
      <circle cx={16} cy={16} r={7} fill={stroke(props)} />
    </g>
  );
}

export function CurrentTransformerGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('currentTransformer', props)}>
      <line x1={8} y1={0} x2={8} y2={24} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <circle cx={8} cy={12} r={6} fill="none" stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
    </g>
  );
}

export function VoltageTransformerGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('voltageTransformer', props)}>
      <line x1={8} y1={0} x2={8} y2={5} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <circle cx={8} cy={11} r={5.5} fill="none" stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <circle cx={8} cy={17} r={5.5} fill="none" stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
    </g>
  );
}

export function SurgeArresterGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('surgeArrester', props)}>
      <line x1={8} y1={0} x2={8} y2={4} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <rect x={4} y={4} width={8} height={14} fill="none" stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      {/* strzałka udaru w dół */}
      <path d="M8,6 L8,13 M8,13 L5.5,10.5 M8,13 L10.5,10.5" fill="none" stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={8} y1={18} x2={8} y2={21} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={4} y1={21} x2={12} y2={21} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
    </g>
  );
}

function derFrame(props: GlyphProps, id: SymbolId, children: JSX.Element): JSX.Element {
  return (
    <g {...glyphGroupProps(id, props)}>
      <line x1={16} y1={0} x2={16} y2={2} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <rect x={2} y={2} width={28} height={28} rx={2} fill="none" stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      {children}
    </g>
  );
}

export function DerPvGlyph(props: GlyphProps): JSX.Element {
  // Falownik PV (IEC): przekątna DC/AC, po stronie DC panel, po AC sinusoida.
  return derFrame(props, 'derPv', (
    <g>
      <line x1={2} y1={30} x2={30} y2={2} stroke={stroke(props)} strokeWidth={1} />
      <path d="M6,8 h8 M6,11 h8 M6,14 h8" stroke={stroke(props)} strokeWidth={1} fill="none" />
      <path d="M18,23 q3,-5 6,0 q3,5 6,0" stroke={stroke(props)} strokeWidth={1.2} fill="none" transform="translate(-4,0)" />
    </g>
  ));
}

export function DerBessGlyph(props: GlyphProps): JSX.Element {
  return derFrame(props, 'derBess', (
    <g>
      {/* ogniwo: długa i krótka płyta ×2 */}
      <line x1={10} y1={10} x2={22} y2={10} stroke={stroke(props)} strokeWidth={1.6} />
      <line x1={13} y1={14} x2={19} y2={14} stroke={stroke(props)} strokeWidth={1.6} />
      <line x1={10} y1={18} x2={22} y2={18} stroke={stroke(props)} strokeWidth={1.6} />
      <line x1={13} y1={22} x2={19} y2={22} stroke={stroke(props)} strokeWidth={1.6} />
    </g>
  ));
}

export function DerGeneratorGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('derGenerator', props)}>
      <line x1={16} y1={0} x2={16} y2={4} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <circle cx={16} cy={18} r={13} fill="none" stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <text
        x={16} y={22} textAnchor="middle"
        fill={stroke(props)} fontFamily="sans-serif" fontSize={12} fontWeight={700}
      >
        G
      </text>
    </g>
  );
}

/** F6b: stacja SN/nN, widok zbiorczy (L0) — kontur kwadratu (P5: rysunek
 *  bazowy mono, bez wypełnienia), NIE węzeł kropkowy `junction` (odróżnialny
 *  z konstrukcji: `querySelector('circle')` musi być puste dla tego glifu). */
export function StationCollapsedGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('stationCollapsed', props)}>
      <rect x={0} y={0} width={16} height={16} fill="none" stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
    </g>
  );
}

export const SYMBOL_GLYPHS: Readonly<Record<SymbolId, (props: GlyphProps) => JSX.Element>> = {
  breaker: BreakerGlyph,
  disconnector: DisconnectorGlyph,
  earthSwitch: EarthSwitchGlyph,
  fuseSwitch: FuseSwitchGlyph,
  transformer2W: Transformer2WGlyph,
  cableHead: CableHeadGlyph,
  jointSleeve: JointSleeveGlyph,
  noPoint: NoPointGlyph,
  junction: JunctionGlyph,
  branchJunction: BranchJunctionGlyph,
  currentTransformer: CurrentTransformerGlyph,
  voltageTransformer: VoltageTransformerGlyph,
  surgeArrester: SurgeArresterGlyph,
  derPv: DerPvGlyph,
  derBess: DerBessGlyph,
  derGenerator: DerGeneratorGlyph,
  stationCollapsed: StationCollapsedGlyph,
};

/** Sanity: każdy glif ma definicję i odwrotnie (spójność biblioteki). */
export const SYMBOL_IDS = Object.keys(SYMBOL_DEFS) as readonly SymbolId[];
