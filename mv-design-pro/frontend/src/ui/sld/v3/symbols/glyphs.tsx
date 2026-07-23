/**
 * SLD V3 — glify symboli IEC 60617 (SLD_CAD_SPEC_V3 §3, §6).
 *
 * Rysunek BAZOWY: neutralny kolor, czytelny w mono (P5). Stan łącznika
 * wyrażony GEOMETRIĄ (wypełnienie CB, kąt noża DS), nie kolorem. Nakładki
 * stanu (energizacja, napięcie) nakłada kanwa — nie glif.
 * Origin glifu = lewy-górny róg bboxa z SYMBOL_DEFS (porty pasują 1:1).
 */

import { SYMBOL_DEFS, type SymbolId } from './defs';
import { BASE_STROKE } from '../theme/colorTokens';
import { MINI_RMU, DER_MARKER_SHAPE, type StationDerGlyphKind } from './miniRmuGrammar';

/** SCHEMAT-10 S3 (V12K-135): wartość TERAZ z `theme/colorTokens.ts`
 *  (`BASE_STROKE`) — JEDNO źródło prawdy, ta sama wartość co dotąd, zero
 *  zmiany zachowania. Re-eksport zachowuje istniejący import w `SldCanvasV3.tsx`. */
export const V3_STROKE_BASE = BASE_STROKE;
export const V3_STROKE_APPARATUS = 1.2;

export type SwitchState = 'closed' | 'open' | 'unknown';

/** SCHEMAT-10 GS-1/GS-2 (V12K-137): rodzaj DER niesiony przez sylwetkę mini-RMU
 *  na L0. Źródło definicji = `miniRmuGrammar.ts` (gramatyka konstrukcyjna),
 *  re-eksport tu zachowuje istniejące importy; `'unknown'` mapuje wołający na
 *  `'generator'` (glif generyczny, jak `DER_SOURCE_KIND_SYMBOL`). */
export type { StationDerGlyphKind } from './miniRmuGrammar';

export interface GlyphProps {
  readonly x: number;
  readonly y: number;
  readonly state?: SwitchState;
  /** Nadpisanie koloru bazowego (nakładka napięcia na szynach itd.). */
  readonly stroke?: string;
  /** F9.9 (spec §17.3): kody funkcji przekaźnika (np. ["50/51","51N"], maks.
   *  2 linie) — WYŁĄCZNIE `ProtectionRelayGlyph` czyta to pole, pozostałe
   *  glify je ignorują (wspólny `GlyphProps`, jak `state`, zero rozgałęzień
   *  sygnatury per symbol). */
  readonly labelLines?: readonly string[];
  /** F10.5 (spec §20.2): `true` gdy przekaźnik ma nierozstrzygnięty
   *  prerekwizyt topologiczny funkcji (67N⇒VT/87T⇒TR/51N⇒I0) —
   *  WYŁĄCZNIE `ProtectionRelayGlyph` czyta to pole (jak `labelLines`).
   *  Rysuje MAŁY badge „!" w rogu okręgu (geometria WEWNĄTRZ 24×24 bboxa,
   *  zero nowej rezerwacji width/height w `layout/measure.ts` — §20.3
   *  „warstwa zabezpieczeń zwarta, nie zasłania toru pierwotnego"). Treść
   *  ostrzeżenia (np. „67N: brak VT") żyje w `missingData`/inspektorze, NIE
   *  na scenie jako tekst — glif niesie WYŁĄCZNIE sygnał obecności. */
  readonly hasTopologyWarning?: boolean;
  /** Recenzja NO-GO 2026-07-17 pkt 11: litera mierzonej WIELKOŚCI miernika
   *  (A = prąd z CT, V = napięcie z VT) — WYŁĄCZNIE `MeterGlyph` czyta to
   *  pole (wzorzec `labelLines`). Brak danych ⇒ fallback „M" (rozstrzygany
   *  wpisem legendy arkusza). */
  readonly meterQuantity?: 'A' | 'V';
  /** SCHEMAT-10 GS-1 (V12K-137, GAP §10.4): stacja SEKCYJNA (sprzęgło w
   *  topologii, `classifyStationTopologicalType`) — WYŁĄCZNIE `Station
   *  CollapsedGlyph` rysuje przerwę sekcyjną na szynie (wzór `labelLines`).
   *  Rodzaj stacji (SN/nN · rozdzielnia sieciowa · sekcyjna) WYPROWADZONY z
   *  TYPU elementów, nie z nazw (spec §19.3). */
  readonly stationSectioned?: boolean;
  /** GS-1: stacja SN/nN z transformatorem (`Substation.hasTransformer`/
   *  `transformerRatedKva`) — mini-glif TR zwieszony pod szyną. Odróżnia
   *  stację transformatorową od rozdzielni sieciowej (bez TR). */
  readonly stationHasTransformer?: boolean;
  /** GS-1 (baza §10.4: DER na L0 = 0 → domknięcie): dominujący rodzaj DER
   *  przyłączonego do stacji — marker nad szyną (PV/BESS/FW). `null`/brak =
   *  stacja bez DER (zero markera). */
  readonly stationDer?: StationDerGlyphKind | null;
  /** GS-1: stacja niesie punkt/łącznik NORMALNIE OTWARTY (`Substation.isNop`)
   *  — marker otwartego łącznika na szynie (odróżnialny od zamkniętego). */
  readonly stationNoOpen?: boolean;
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

/** Recenzja NO-GO 2026-07-17 pkt 5 (spec §12.5): ROZŁĄCZNIK (łącznik
 *  obciążeniowy, IEC 60617 switch-disconnector) — geometria odłącznika +
 *  POPRZECZKA na końcu styku ruchomego (cecha odróżniająca zdolność
 *  łączenia pod obciążeniem). Stan z geometrii noża jak `DisconnectorGlyph`. */
export function LoadBreakSwitchGlyph(props: GlyphProps): JSX.Element {
  const state = props.state ?? 'unknown';
  const bladeEnd = state === 'open' ? { x: 15, y: 12 } : { x: 8, y: 18 };
  return (
    <g {...glyphGroupProps('loadBreakSwitch', props)}>
      <line x1={8} y1={0} x2={8} y2={6} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      {/* Poprzeczka rozłącznika: krótka kreska PROSTOPADŁA do noża na jego
          swobodnym końcu (IEC 60617 S00504) — obraca się razem z nożem. */}
      {state === 'open' ? (
        <line x1={13} y1={9} x2={17} y2={15} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      ) : (
        <line x1={4} y1={14} x2={12} y2={14} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      )}
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

/** Recenzja NO-GO 2026-07-17 pkt 6 (spec §12.5): zagregowany ODBIÓR —
 *  strzałka odbioru (IEC 60617): pion od portu N + grot w dół. */
export function LoadArrowGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('loadArrow', props)}>
      <line x1={8} y1={0} x2={8} y2={10} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <path d="M 3 10 L 13 10 L 8 16 Z" fill={stroke(props)} stroke="none" />
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

/**
 * F9.4 (spec §13.2, V12K-029): farma wiatrowa — IEC 60617 nie definiuje glifu
 * turbiny wiatrowej; konwencja rysunkowa (jak `DerPvGlyph`/`DerBessGlyph`:
 * rozróżnienie IKONĄ, nie tekstem) — maszt + piasta + trzy łopaty rozstawione
 * 120°, czytelne mono bez podpisu.
 */
export function DerWindGlyph(props: GlyphProps): JSX.Element {
  return derFrame(props, 'derWind', (
    <g>
      <line x1={16} y1={26} x2={16} y2={11} stroke={stroke(props)} strokeWidth={1.4} />
      <circle cx={16} cy={11} r={1.6} fill={stroke(props)} />
      <line x1={16} y1={11} x2={16} y2={3} stroke={stroke(props)} strokeWidth={1.2} />
      <line x1={16} y1={11} x2={22.9} y2={14.9} stroke={stroke(props)} strokeWidth={1.2} />
      <line x1={16} y1={11} x2={9.1} y2={14.9} stroke={stroke(props)} strokeWidth={1.2} />
    </g>
  ));
}

/**
 * F9.4 (spec §13.1/§13.2): sieć zewnętrzna (`Source` ENM, `kind=
 * 'external_grid'`) — strzałka zasilania W DÓŁ (konwencja: moc wchodzi Z
 * ZEWNĄTRZ do szyny), odrębna od wszystkich symboli DER (bez ramki
 * kwadratowej `derFrame` — ten symbol NIE jest instalacją DER).
 */
export function GridSourceGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('gridSource', props)}>
      <line x1={8} y1={0} x2={8} y2={8} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <path d="M4,8 L12,8 L8,16 Z" fill={stroke(props)} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={8} y1={16} x2={8} y2={24} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
    </g>
  );
}

/** GS-1/GS-2 (V12K-137, GAP §10.4): marker DER (nad szyną mini-RMU) — kształt
 *  koduje rodzaj (PV trójkąt / BESS kwadrat / FW·generator okrąg), spójnie z
 *  konwencją „rozróżnienie IKONĄ" glifów DER (`DerPvGlyph`…). Geometria WYŁĄCZNIE
 *  z `MINI_RMU.markers.der` (reguła 13: zero literałów lokalnych). */
function derMiniMarker(kind: StationDerGlyphKind, s: string): JSX.Element {
  const { x: cx, centerY: cy, half: h } = MINI_RMU.markers.der;
  const w = MINI_RMU.stroke.marker;
  const shape = DER_MARKER_SHAPE[kind];
  if (shape === 'triangle') {
    // PV: trójkąt wierzchołkiem w górę, podstawa na dole strefy.
    return <path d={`M${cx},${cy - h} L${cx + h},${cy + h} L${cx - h},${cy + h} Z`} fill="none" stroke={s} strokeWidth={w} />;
  }
  if (shape === 'square') {
    return <rect x={cx - h} y={cy - h} width={2 * h} height={2 * h} fill="none" stroke={s} strokeWidth={w} />;
  }
  // FW (farma wiatrowa) i generator generyczny → okrąg (maszyna wirująca).
  return <circle cx={cx} cy={cy} r={h} fill="none" stroke={s} strokeWidth={w} />;
}

/**
 * GS-1 (V12K-137, GAP `S7_GAP_CROSSING_ZERO` §10.4, macierz `AUDYT_SCHEMATOW_
 * OD_ZERA_2026-07` §3 „Stacja"): stacja SN/nN — MINI-RMU na L0 (sylwetka tej
 * samej gramatyki co L1/L2 w miniaturze), NIE goły kwadrat/kropka `junction`.
 * Rysunek BAZOWY mono (P5, stan/rodzaj = GEOMETRIA, nie kolor):
 *  - enklozura (obrys) + POZIOMA KRESKA SZYNY SN (grubsza) przez środek —
 *    routing L0 kotwiczy się środkiem (24,24), więc szyna magistrali
 *    przechodzi wprost przez sylwetkę (spójne z „szyna biegnie przez stację");
 *  - markery WEWNĄTRZ bboxa (48×48), każdy w osobnej strefie (bez nachodzeń,
 *    z dala od pionowej kolumny routingu x=24), z atrybutem DOM dla wyroczni:
 *      · transformator (SN/nN) — mini-glif TR zwieszony pod szyną (dół-lewo);
 *      · DER — marker rodzaju nad szyną (góra-prawo);
 *      · stacja sekcyjna — przerwa/sprzęgło na szynie (środek);
 *      · łącznik/NO otwarty — kwadrat otwarty na szynie (prawo).
 * Odróżnialność od `junction`: obecność `data-station-silhouette` + enklozura
 * (rect) + kreska szyny (test `symbols.test.tsx`). Kolor NIE koduje tu stanu.
 */
export function StationCollapsedGlyph(props: GlyphProps): JSX.Element {
  const s = stroke(props);
  const { enclosure: e, bus, markers, stroke: sw } = MINI_RMU;
  const tr = markers.transformer;
  const sc = markers.sectioned;
  const der = markers.der;
  const no = markers.noOpen;
  return (
    <g {...glyphGroupProps('stationCollapsed', props)} data-station-silhouette="mini-rmu">
      {/* Enklozura (obrys RMU) — mono, bez wypełnienia (P5, reguła 3: nie maskuje toru). */}
      <rect x={e.x} y={e.y} width={e.width} height={e.height} rx={e.rx} fill="none" stroke={s} strokeWidth={V3_STROKE_APPARATUS} />
      {/* Szyna SN wewnętrzna — TOR MOCY przez środek, grubsza kreska (nośnik = waga,
          nie kolor); współliniowa z portami W/E (reguła 2/4). */}
      <line x1={bus.x1} y1={bus.y} x2={bus.x2} y2={bus.y} stroke={s} strokeWidth={sw.bus} data-station-bus="true" />
      {/* Stacja SEKCYJNA: sprzęgło = dwie kreski flankujące kolumnę routingu na szynie. */}
      {props.stationSectioned && (
        <g data-station-sectioned="true">
          <line x1={sc.leftX} y1={sc.y1} x2={sc.leftX} y2={sc.y2} stroke={s} strokeWidth={sw.marker} />
          <line x1={sc.rightX} y1={sc.y1} x2={sc.rightX} y2={sc.y2} stroke={s} strokeWidth={sw.marker} />
        </g>
      )}
      {/* Transformator (SN/nN): rola UZUPEŁNIAJĄCA (reguła 12) — stub w dół + dwa
          małe okręgi (dwuuzwojeniowy) w lewej-dolnej strefie. */}
      {props.stationHasTransformer && (
        <g data-station-transformer="true">
          <line x1={tr.x} y1={tr.stubY1} x2={tr.x} y2={tr.stubY2} stroke={s} strokeWidth={V3_STROKE_APPARATUS} />
          <circle cx={tr.x} cy={tr.circle1Y} r={tr.circleR} fill="none" stroke={s} strokeWidth={sw.marker} />
          <circle cx={tr.x} cy={tr.circle2Y} r={tr.circleR} fill="none" stroke={s} strokeWidth={sw.marker} />
        </g>
      )}
      {/* DER: stub w górę + marker rodzaju (PV/BESS/FW) w prawej-górnej strefie. */}
      {props.stationDer && (
        <g data-station-der={props.stationDer}>
          <line x1={der.x} y1={der.stubY1} x2={der.x} y2={der.stubY2} stroke={s} strokeWidth={V3_STROKE_APPARATUS} />
          {derMiniMarker(props.stationDer, s)}
        </g>
      )}
      {/* Łącznik/NO otwarty: kwadrat OTWARTY na szynie (prawy odcinek). */}
      {props.stationNoOpen && (
        <rect x={no.x} y={no.y} width={no.size} height={no.size} fill="none" stroke={s} strokeWidth={sw.marker} data-station-no="true" />
      )}
    </g>
  );
}

/**
 * F9.9 (spec §17.1/§17.3): przekaźnik zabezpieczeniowy — okrąg z kodami
 * funkcji ANSI/IEEE C37.2 (np. „50/51" nad „51N", maks. 2 linie ≤4 znaki,
 * §17.3 — obcinanie/wybór DWÓCH pierwszych kodów jest odpowiedzialnością
 * WOŁAJĄCEGO, `compose/station.ts`/`compose/gpz.ts`, ta funkcja rysuje
 * WYŁĄCZNIE to, co dostanie w `labelLines`, zero własnej logiki wyboru).
 * Brak wypełnienia (P5: rysunek bazowy mono) — element ADNOTACJI, nie stanu.
 */
export function ProtectionRelayGlyph(props: GlyphProps): JSX.Element {
  const lines = props.labelLines ?? [];
  const ty = lines.length > 1 ? [9, 17] : [13.5];
  return (
    <g {...glyphGroupProps('protectionRelay', props)}>
      <circle cx={12} cy={12} r={11} fill="none" stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      {lines.slice(0, 2).map((line, i) => (
        <text
          key={line}
          x={12} y={ty[i]} textAnchor="middle"
          fill={stroke(props)} fontFamily="sans-serif" fontSize={7} fontWeight={600}
        >
          {line}
        </text>
      ))}
      {/* F10.5 (spec §20.2): badge „!" — nierozstrzygnięty prerekwizyt
       *  topologiczny funkcji (67N⇒VT/87T⇒TR/51N⇒I0). Geometria WEWNĄTRZ
       *  bboxa 24×24 (róg NE okręgu głównego, r=11 wokół (12,12) zostawia
       *  narożniki wolne) — zero nowej rezerwacji miejsca, mono (jak reszta
       *  glifu bazowego, P5 — kolor NIE koduje tu stanu fizycznego). */}
      {props.hasTopologyWarning && (
        <g data-topology-warning="true">
          <circle cx={19.5} cy={4.5} r={3.6} fill="none" stroke={stroke(props)} strokeWidth={0.9} />
          <text
            x={19.5} y={6.7} textAnchor="middle"
            fill={stroke(props)} fontFamily="sans-serif" fontSize={6} fontWeight={700}
          >
            !
          </text>
        </g>
      )}
    </g>
  );
}

/**
 * F9.9 (spec §17.1): miernik — okrąg „M" statyczny (wzorzec `DerGeneratorGlyph`
 * „G" — tekst BAKED w glifie, bo treść nie jest danymi zmiennymi, jest
 * notacją stałą, koordynacja `docs/sld/SLD_PROTECTION_MARKING_COORDINATION_
 * 2026-07.md` pkt 1: „numery C37.2 są NOTACJĄ, nie kodenames").
 */
export function MeterGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('meter', props)}>
      <circle cx={12} cy={12} r={11} fill="none" stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <text
        x={12} y={16} textAnchor="middle"
        fill={stroke(props)} fontFamily="sans-serif" fontSize={12} fontWeight={700}
      >
        {/* Recenzja NO-GO 2026-07-17 pkt 11: litera mierzonej wielkości
            (A/V) z danych pomiaru; „M" tylko gdy wielkość nieznana. */}
        {props.meterQuantity ?? 'M'}
      </text>
    </g>
  );
}

export const SYMBOL_GLYPHS: Readonly<Record<SymbolId, (props: GlyphProps) => JSX.Element>> = {
  breaker: BreakerGlyph,
  disconnector: DisconnectorGlyph,
  loadBreakSwitch: LoadBreakSwitchGlyph,
  loadArrow: LoadArrowGlyph,
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
  derWind: DerWindGlyph,
  gridSource: GridSourceGlyph,
  stationCollapsed: StationCollapsedGlyph,
  protectionRelay: ProtectionRelayGlyph,
  meter: MeterGlyph,
};

/** Sanity: każdy glif ma definicję i odwrotnie (spójność biblioteki). */
export const SYMBOL_IDS = Object.keys(SYMBOL_DEFS) as readonly SymbolId[];
