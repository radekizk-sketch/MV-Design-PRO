/**
 * Renderer symbolu CAD — zamienia prymitywy `ELECTRICAL_CAD_SYMBOL_REGISTRY`
 * (LINE / CIRCLE / ARC / PATH / PIVOT / LETTER) na SVG. To JEDYNE miejsce,
 * które rysuje symbol schematu nN: kanwa nie zna geometrii, rejestr nie zna
 * SVG (R2 §19/§20 — symbol CAD ≠ piktogram aplikacji).
 *
 * Zasady rysunku:
 *  • kreska NIESKALOWANA z kamerą (`vector-effect: non-scaling-stroke`) —
 *    grubość w px ekranu jak w przeglądarce CAD; hierarchię BUS / PRIMARY /
 *    SECONDARY nadaje kanwa przez `strokePx`;
 *  • kolor JEDEN (`ink`) + kolor papieru (`paper`) do maskowania — stan nie
 *    jest kodowany kolorem ani wypełnieniem (R2 §14); `fill: 'ink'` służy
 *    wyłącznie grotom / kropkom połączeń / płytom, które w IEC są pełne;
 *  • stan NIEZNANY = kąt pośredni noża + kreska przerywana grupy przegubu;
 *  • orientacja pozioma = obrót o +90° wokół środka gabarytu (łącznik szyn:
 *    zacisk `a` po prawej, otwarty nóż w górę — jak `punktPoObrocie`).
 */
import type { CSSProperties } from 'react';

import {
  ELECTRICAL_CAD_SYMBOL_REGISTRY,
  prymitywy,
  type CadOrientation,
  type CadPrimitive,
  type CadSwitchState,
  type CadSymbolId,
} from './cadSymbolRegistry';

/** Domyślna grubość bazowa kreski symbolu [px ekranu] (R2 §13: SECONDARY <
 *  symbol < PRIMARY — symbol nie może być cieńszy od przewodu wtórnego ani
 *  grubszy od toru pierwotnego). */
export const CAD_SYMBOL_STROKE_PX = 1.4;

/** Wzór kreski przerywanej stanu nieznanego [u] — skaluje się z symbolem. */
export const CAD_DASH_NIEZNANY = '1.5 1';

export interface CadSymbolProps {
  readonly id: CadSymbolId;
  /** Lewy górny róg gabarytu nominalnego w jednostkach sceny. */
  readonly x: number;
  readonly y: number;
  /** Jednostek sceny na 1 u symbolu (domyślnie 1). */
  readonly scale?: number;
  readonly state?: CadSwitchState;
  readonly orientation?: CadOrientation;
  /** Tusz i papier (kolor tła do maskowania). */
  readonly ink: string;
  readonly paper: string;
  /** Grubość bazowa kreski symbolu [px ekranu]. */
  readonly strokePx?: number;
  /** `false` = kreska w jednostkach sceny (eksport statyczny bez kamery). */
  readonly nonScalingStroke?: boolean;
  readonly fontFamily?: string;
  readonly testId?: string;
  readonly style?: CSSProperties;
  /** Znaki funkcji (notacja IEC: I>, I>>, I0>, U<, f<…) rysowane WEWNĄTRZ
   *  prostokąta symbolu klasy `zabezpieczenie` — dane przypisania, nie część
   *  geometrii rejestru; maks. 2 wiersze (nadmiar sumuje wołający). */
  readonly wnetrze?: readonly string[];
}

interface KontekstRysunkuCad {
  readonly ink: string;
  readonly paper: string;
  readonly strokePx: number;
  readonly nonScaling: boolean;
  readonly fontFamily: string;
  readonly state: CadSwitchState;
}

function kolorWypelnienia(fill: 'ink' | 'none' | 'paper' | undefined, ctx: KontekstRysunkuCad): string {
  if (fill === 'ink') return ctx.ink;
  if (fill === 'paper') return ctx.paper;
  return 'none';
}

function grubosc(w: number | undefined, ctx: KontekstRysunkuCad): number {
  return ctx.strokePx * (w ?? 1);
}

function kreska(w: number | undefined, ctx: KontekstRysunkuCad) {
  return {
    stroke: ctx.ink,
    strokeWidth: grubosc(w, ctx),
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    vectorEffect: ctx.nonScaling ? ('non-scaling-stroke' as const) : undefined,
  };
}

function rysujPrymityw(p: CadPrimitive, i: number, ctx: KontekstRysunkuCad): JSX.Element {
  switch (p.k) {
    case 'line':
      return (
        <line
          key={i}
          x1={p.x1}
          y1={p.y1}
          x2={p.x2}
          y2={p.y2}
          {...kreska(p.w, ctx)}
          strokeDasharray={p.nozStanu && ctx.state === 'unknown' ? CAD_DASH_NIEZNANY : undefined}
          data-cad={p.nozStanu ? 'noz' : 'line'}
        />
      );
    case 'circle':
      return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={kolorWypelnienia(p.fill, ctx)} {...kreska(p.w, ctx)} data-cad="circle" />;
    case 'arc':
      return <path key={i} d={p.d} fill="none" {...kreska(p.w, ctx)} data-cad="arc" />;
    case 'path':
      return <path key={i} d={p.d} fill={kolorWypelnienia(p.fill, ctx)} {...kreska(p.fill === 'ink' ? 0.5 : p.w, ctx)} data-cad="path" />;
    case 'letter':
      // Litera NORMATYWNA symbolu (G maszyny) — część symbolu IEC, nie etykieta.
      return (
        <text
          key={i}
          x={p.x}
          y={p.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={ctx.fontFamily}
          fontSize={p.size}
          fontWeight={600}
          fill={ctx.ink}
          data-cad="letter"
        >
          {p.t}
        </text>
      );
    case 'pivot':
      return (
        <g key={i} transform={`rotate(${p.deg} ${p.cx} ${p.cy})`} data-cad="pivot" data-cad-deg={p.deg}>
          {p.prims.map((q, j) => rysujPrymityw(q, j, ctx))}
        </g>
      );
    default:
      return <g key={i} />;
  }
}

export function CadSymbol(props: CadSymbolProps): JSX.Element {
  const def = ELECTRICAL_CAD_SYMBOL_REGISTRY[props.id];
  const scale = props.scale ?? 1;
  const state: CadSwitchState = props.state ?? 'closed';
  const orientation: CadOrientation = props.orientation ?? 'pionowa';
  const ctx: KontekstRysunkuCad = {
    ink: props.ink,
    paper: props.paper,
    strokePx: props.strokePx ?? CAD_SYMBOL_STROKE_PX,
    nonScaling: props.nonScalingStroke ?? true,
    fontFamily: props.fontFamily ?? 'Inter, "Segoe UI", Arial, sans-serif',
    state,
  };
  const c = def.anchors.center;
  // Obrót +90° (zgodnie z `punktPoObrocie` rejestru): zacisk `a` po prawej,
  // `b` po lewej, otwarty nóż odchyla się W GÓRĘ od osi szyny.
  const obrot = orientation === 'pozioma' ? ` rotate(90 ${c.x} ${c.y})` : '';
  const transform = `translate(${props.x} ${props.y}) scale(${scale})${obrot}`;
  return (
    <g
      data-testid={props.testId}
      data-symbol-canon={props.id}
      data-symbol-family="cad"
      data-switch-state={def.states ? state : undefined}
      data-orientation={orientation}
      data-verification={def.verificationStatus}
      transform={transform}
      style={props.style}
    >
      {prymitywy(props.id, state).map((p, i) => rysujPrymityw(p, i, ctx))}
      {def.functionalClass === 'zabezpieczenie' && props.wnetrze && props.wnetrze.length > 0 && (
        <g data-cad="marks">
          {props.wnetrze.slice(0, 2).map((znak, i, wszystkie) => (
            <text
              key={znak}
              x={def.anchors.center.x}
              y={wszystkie.length === 1 ? def.anchors.center.y : 3.4 + i * 5.2}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily={ctx.fontFamily}
              fontSize={4.6}
              fontWeight={600}
              fill={ctx.ink}
              data-cad="mark"
            >
              {znak}
            </text>
          ))}
        </g>
      )}
    </g>
  );
}
