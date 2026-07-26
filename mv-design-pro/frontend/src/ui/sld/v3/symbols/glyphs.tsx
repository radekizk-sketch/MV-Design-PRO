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
import { MINI_RMU, DER_MARKER_SHAPE, type MiniRmuLineTopology, type StationDerGlyphKind } from './miniRmuGrammar';

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
  /** Rodzaj uziemienia punktu neutralnego (V12K-219) — WYŁĄCZNIE dla glifu
   *  `neutralEarthing`; pozostałe glify go ignorują (wspólny `GlyphProps`). */
  readonly earthingKind?: 'resistor' | 'coil' | 'direct' | 'isolated';
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
  /** GS-4 (recenzja 2026-07-23; baza GS-1 §10.4): dominujący rodzaj DER
   *  przyłączonego do SZYNY SN stacji — pole DER nad szyną (`poleDer`).
   *  `null`/brak = zero DER na SN. Pozycja symbolu DER wynika z RZECZYWISTEGO
   *  miejsca przyłączenia (nie z samego faktu obecności). */
  readonly stationDerOnMv?: StationDerGlyphKind | null;
  /** GS-4: dominujący rodzaj DER ZA TRANSFORMATOREM (strona nN) — znak przy
   *  gałęzi pola TR PONIŻEJ uzwojeń (`poleTr.derNn`, INNA kotwica niż DER na
   *  SN). Wymaga `stationHasTransformer` (bez TR nie istnieje strona nN —
   *  sprzeczność raportuje `buildScene`, glif jej nie rysuje). NIEZALEŻNE od
   *  `stationDerOnMv` — oba mogą wystąpić naraz. */
  readonly stationDerBehindTr?: StationDerGlyphKind | null;
  /** GS-1: stacja niesie punkt/łącznik NORMALNIE OTWARTY (`Substation.isNop`)
   *  — marker otwartego łącznika na szynie (odróżnialny od zamkniętego). */
  readonly stationNoOpen?: boolean;
  /** GS-5 (uwaga właściciela 2026-07-23: „render zakłada, że większość stacji
   *  to przelotowe, a w realnej sieci to końcowe z odgałęzień"): topologia
   *  pól liniowych sylwetki z REALNEJ roli stacji w ciągu (spec §19.3 +
   *  prezentacja stacji ostatniej w ciągu): `'końcowa'` = TYLKO pole WE,
   *  szyna kończy się w rozdzielnicy (zero fantomowego toru na wylot);
   *  `'przelotowa'` = dwa pola (zachowanie dotychczasowe = default dla
   *  wołających bez podsumowania); `'odgałęźna'` = dwa pola + węzeł
   *  odgałęzienia na szynie (kabel zejścia rysuje scena; pełne pole
   *  odgałęźne od L1 — uzasadnienie przestrzenne w `miniRmuGrammar.ts`). */
  readonly stationLineTopology?: MiniRmuLineTopology;
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

/**
 * Punkt neutralny sieci — sposób jego pracy rozstrzyga o prądzie zwarcia
 * doziemnego, a przez to o czułości zabezpieczeń ziemnozwarciowych i o
 * napięciach dotykowych na uziomach (PN-EN 50522). Wariant bierze się z
 * `earthingKind` (dana modelu, zero domysłu):
 *
 *  • `resistor`  — prostokąt rezystora; prąd ograniczony do `U_f/R`,
 *  • `coil`      — cewka (dławik gaszący/Petersena); kompensuje prąd
 *                  pojemnościowy sieci, zostaje prąd resztkowy,
 *  • `direct`    — samo połączenie z uziomem; prąd rzędu zwarcia trójfazowego,
 *  • `isolated`  — PRZERWA w torze do uziomu (kreska urwana): sieć izolowana,
 *                  prąd doziemny płynie wyłącznie przez pojemności doziemne.
 *
 * Symbol uziomu (trzy malejące kreski) jest wspólny dla wszystkich wariantów
 * poza izolowanym — tam zostaje, ale tor jest przerwany, co jest istotą tej
 * konfiguracji i musi być widoczne na pierwszy rzut oka.
 */
export function NeutralEarthingGlyph(props: GlyphProps): JSX.Element {
  const kind = props.earthingKind ?? 'direct';
  const izolowana = kind === 'isolated';
  return (
    <g {...glyphGroupProps('neutralEarthing', props)} data-earthing-kind={kind}>
      {/* Zejście od szyny do aparatu; przy sieci izolowanej krótsze — tor jest
          przerwany celowo, nie z braku miejsca. */}
      <line
        x1={8}
        y1={0}
        x2={8}
        y2={izolowana ? 5 : 8}
        stroke={stroke(props)}
        strokeWidth={V3_STROKE_APPARATUS}
      />
      {kind === 'resistor' && (
        <rect
          x={4}
          y={8}
          width={8}
          height={10}
          fill="none"
          stroke={stroke(props)}
          strokeWidth={V3_STROKE_APPARATUS}
        />
      )}
      {kind === 'coil' && (
        <path
          d="M 8 8 q 5 2.5 0 5 q -5 2.5 0 5"
          fill="none"
          stroke={stroke(props)}
          strokeWidth={V3_STROKE_APPARATUS}
        />
      )}
      {!izolowana && (
        <line x1={8} y1={18} x2={8} y2={21} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      )}
      <line x1={2} y1={21} x2={14} y2={21} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={4} y1={25} x2={12} y2={25} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
      <line x1={6} y1={29} x2={10} y2={29} stroke={stroke(props)} strokeWidth={V3_STROKE_APPARATUS} />
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

/** GS-3 (K4/K5): marker RODZAJU DER — pomocniczy. Trójkąt jest ZAREZERWOWANY
 *  dla głowicy kablowej, więc PV=romb, BESS=bateria, FW/gen=okrąg. GS-4:
 *  kotwica (cx,cy,h) parametryzowana — TEN SAM kształt rodzaju w polu DER na
 *  SN (`poleDer`) i za TR na nN (`poleTr.derNn`); różni się WYŁĄCZNIE miejsce
 *  przyłączenia (topologia), nigdy notacja rodzaju. */
function derMiniMarker(kind: StationDerGlyphKind, s: string, cx: number, cy: number, h: number): JSX.Element {
  const w = MINI_RMU.stroke.marker;
  const shape = DER_MARKER_SHAPE[kind];
  if (shape === 'diamond') {
    return <path d={`M${cx},${cy - h} L${cx + h},${cy} L${cx},${cy + h} L${cx - h},${cy} Z`} fill="none" stroke={s} strokeWidth={w} />;
  }
  if (shape === 'battery') {
    // Prostokąt bateryjny 2:1 z kreską wewnętrzną (NIE kwadrat aparatu).
    return (
      <g>
        <rect x={cx - h} y={cy - h / 2} width={2 * h} height={h} fill="none" stroke={s} strokeWidth={w} />
        <line x1={cx} y1={cy - h / 2} x2={cx} y2={cy + h / 2} stroke={s} strokeWidth={w} />
      </g>
    );
  }
  if (shape === 'circle-spokes') {
    // Wirnik: okrąg + 3 ramiona (Y).
    return (
      <g>
        <circle cx={cx} cy={cy} r={h} fill="none" stroke={s} strokeWidth={w} />
        <line x1={cx} y1={cy} x2={cx} y2={cy - h} stroke={s} strokeWidth={w} />
        <line x1={cx} y1={cy} x2={cx - 0.87 * h} y2={cy + 0.5 * h} stroke={s} strokeWidth={w} />
        <line x1={cx} y1={cy} x2={cx + 0.87 * h} y2={cy + 0.5 * h} stroke={s} strokeWidth={w} />
      </g>
    );
  }
  // Generator: okrąg z kropką centralną.
  return (
    <g>
      <circle cx={cx} cy={cy} r={h} fill="none" stroke={s} strokeWidth={w} />
      <circle cx={cx} cy={cy} r={0.35} fill={s} stroke="none" />
    </g>
  );
}

/** Głowica kablowa (K1/K4): trójkąt wierzchołkiem ku wnętrzu pola. */
function glowica(xBase: number, xTip: number, y: number, halfH: number, s: string, w: number): JSX.Element {
  return <path d={`M${xTip},${y} L${xBase},${y - halfH} L${xBase},${y + halfH} Z`} fill="none" stroke={s} strokeWidth={w} />;
}

/**
 * GS-3 (V12K-137, werdykt NO-GO recenzji GS-2 — `GRAMATYKA_MINI_RMU_2026-07.md`
 * K1–K7): stacja SN/nN na L0 = MINIATUROWY SLD ROZDZIELNICY — kompozycja PÓL,
 * nie ikona na linii. Tor: kabel → △głowica → aparat pola → SZYNA WEWNĘTRZNA
 * (nie wychodzi poza enklozurę, K2) → aparat → △głowica → kabel. Pola TR/DER
 * jako własne odgałęzienia z aparatem (K3/K5); sekcja/NO = stan aparatu W TORZE
 * szyny (K6, NO = realna przerwa). Obrys wtórny (K7). Geometria WYŁĄCZNIE z
 * `MINI_RMU` (reguła 13). Mono (P5) — stan/rodzaj = geometria, nie kolor.
 */
export function StationCollapsedGlyph(props: GlyphProps): JSX.Element {
  const s = stroke(props);
  const { enclosure: e, bus, linia: L, poleTr: tr, poleDer: der, sprzeglo: sp, odgalezienie: od, stroke: sw } = MINI_RMU;
  const y = L.y;
  const busBroken = props.stationNoOpen === true;
  // GS-5: topologia pól liniowych z roli stacji w ciągu; brak danych =
  // 'przelotowa' (zachowanie dotychczasowe — sylwetka bazowa bez podsumowania).
  const lineTopology = props.stationLineTopology ?? 'przelotowa';
  const drawRightField = lineTopology !== 'końcowa';
  return (
    <g {...glyphGroupProps('stationCollapsed', props)} data-station-silhouette="mini-rmu" data-station-line-topology={lineTopology}>
      {/* Obrys enklozury — WTÓRNY (K7): najlżejsza kreska, bez wypełnienia. */}
      <rect x={e.x} y={e.y} width={e.width} height={e.height} rx={e.rx} fill="none" stroke={s} strokeWidth={sw.outline} data-station-outline="true" />
      {/* POLE LINIOWE L1: kabel → głowica → aparat → łącznik do szyny (K1). */}
      <line x1={L.stubL.x1} y1={y} x2={L.stubL.x2} y2={y} stroke={s} strokeWidth={sw.path} />
      {glowica(L.glowicaL.xBase, L.glowicaL.xTip, y, L.glowicaL.halfH, s, sw.path)}
      <rect x={L.aparatL.x - L.aparatL.size / 2} y={y - L.aparatL.size / 2} width={L.aparatL.size} height={L.aparatL.size} fill="none" stroke={s} strokeWidth={sw.path} data-station-aparat="L1" />
      <line x1={L.glowicaL.xTip} y1={y} x2={L.aparatL.x - L.aparatL.size / 2} y2={y} stroke={s} strokeWidth={sw.path} />
      <line x1={L.linkL.x1} y1={y} x2={L.linkL.x2} y2={y} stroke={s} strokeWidth={sw.path} />
      {/* SZYNA WEWNĘTRZNA (K2) — najgrubsza; przy NO realna PRZERWA (K6). */}
      {busBroken ? (
        <g data-station-no="true">
          <line x1={bus.x1} y1={y} x2={sp.x - sp.gapHalf} y2={y} stroke={s} strokeWidth={sw.bus} data-station-bus="true" />
          <line x1={sp.x + sp.gapHalf} y1={y} x2={bus.x2} y2={y} stroke={s} strokeWidth={sw.bus} />
          {/* Otwarty styk aparatu: kreska odchylona od osi (stan OTWARTY). */}
          <line x1={sp.x - sp.gapHalf} y1={y} x2={sp.x + sp.gapHalf} y2={y - 2 * sp.gapHalf} stroke={s} strokeWidth={sw.path} />
        </g>
      ) : (
        <line x1={bus.x1} y1={y} x2={bus.x2} y2={y} stroke={s} strokeWidth={sw.bus} data-station-bus="true" />
      )}
      {/* Rodzina APARAT SEKCYJNY (K6): stan ZAMKNIĘTY = te same styki co stan
          otwarty (NO), człon ruchomy DOMKNIĘTY na osi (ciągłość); zmienia się
          wyłącznie położenie członu — jedna rodzina glifu, jedna kotwica. */}
      {props.stationSectioned && !busBroken && (
        <g data-station-sectioned="true">
          <line x1={sp.x - sp.gapHalf} y1={y - 2} x2={sp.x - sp.gapHalf} y2={y + 2} stroke={s} strokeWidth={sw.path} />
          <line x1={sp.x + sp.gapHalf} y1={y - 2} x2={sp.x + sp.gapHalf} y2={y + 2} stroke={s} strokeWidth={sw.path} />
        </g>
      )}
      {props.stationSectioned && busBroken && <g data-station-sectioned="true" />}
      {/* POLE LINIOWE L2 (lustrzane) — TYLKO gdy tor kontynuuje (GS-5):
          stacja KOŃCOWA nie dostaje fantomowego pola na wylot; szyna kończy
          się w rozdzielnicy (rezerwa/koniec ciągu — uczciwy obraz roli). */}
      {drawRightField && (
        <g data-station-field-out="true">
          <line x1={L.linkR.x1} y1={y} x2={L.linkR.x2} y2={y} stroke={s} strokeWidth={sw.path} />
          <rect x={L.aparatR.x - L.aparatR.size / 2} y={y - L.aparatR.size / 2} width={L.aparatR.size} height={L.aparatR.size} fill="none" stroke={s} strokeWidth={sw.path} data-station-aparat="L2" />
          <line x1={L.aparatR.x + L.aparatR.size / 2} y1={y} x2={L.glowicaR.xTip} y2={y} stroke={s} strokeWidth={sw.path} />
          {glowica(L.glowicaR.xBase, L.glowicaR.xTip, y, L.glowicaR.halfH, s, sw.path)}
          <line x1={L.stubR.x1} y1={y} x2={L.stubR.x2} y2={y} stroke={s} strokeWidth={sw.path} />
        </g>
      )}
      {/* GS-5: WĘZEŁ ODGAŁĘZIENIA na szynie (stacja odgałęźna, ≥3 pola
          liniowe §19.3) — kropka węzłowa (junction); kabel zejścia rysuje
          scena. Przy NO (przerwa szyny w środku) kropka NIE jest rysowana —
          punkt środka leży w realnej przerwie; odgałęzienie pozostaje
          widoczne kablem sceny. */}
      {lineTopology === 'odgałęźna' && !busBroken && (
        <circle cx={od.x} cy={y} r={od.r} fill={s} stroke="none" data-station-branch-node="true" />
      )}
      {/* POLE TR (K3): szyna → aparat pola TR → transformator (dwuuzwojeniowy). */}
      {props.stationHasTransformer && (
        <g data-station-transformer="true">
          <line x1={tr.x} y1={tr.stub1.y1} x2={tr.x} y2={tr.stub1.y2} stroke={s} strokeWidth={sw.path} />
          <rect x={tr.x - tr.aparat.size / 2} y={tr.aparat.y} width={tr.aparat.size} height={tr.aparat.size} fill="none" stroke={s} strokeWidth={sw.path} data-station-aparat="TR" />
          <line x1={tr.x} y1={tr.stub2.y1} x2={tr.x} y2={tr.stub2.y2} stroke={s} strokeWidth={sw.path} />
          <circle cx={tr.x} cy={tr.circle1Y} r={tr.circleR} fill="none" stroke={s} strokeWidth={sw.marker} />
          <circle cx={tr.x} cy={tr.circle2Y} r={tr.circleR} fill="none" stroke={s} strokeWidth={sw.marker} />
          {/* GS-4: DER ZA TRANSFORMATOREM (strona nN) — znak źródła przy
              gałęzi pola TR PONIŻEJ uzwojeń, POZA enklozurą (nN na zewnątrz
              rozdzielnicy SN). ZAKAZ renderu z szyny SN, gdy model mówi nN.
              Guard `stationHasTransformer` z konstrukcji: blok żyje WEWNĄTRZ
              grupy TR (bez TR strona nN nie istnieje). */}
          {props.stationDerBehindTr && (
            <g data-station-der-nn={props.stationDerBehindTr}>
              <line x1={tr.x} y1={tr.derNn.stub.y1} x2={tr.x} y2={tr.derNn.stub.y2} stroke={s} strokeWidth={sw.path} />
              {derMiniMarker(props.stationDerBehindTr, s, tr.x, tr.derNn.markerCY, tr.derNn.markerHalf)}
            </g>
          )}
        </g>
      )}
      {/* POLE DER na SN (K5): szyna → aparat pola DER → marker rodzaju. */}
      {props.stationDerOnMv && (
        <g data-station-der-sn={props.stationDerOnMv}>
          <line x1={der.x} y1={der.stub1.y1} x2={der.x} y2={der.stub1.y2} stroke={s} strokeWidth={sw.path} />
          <rect x={der.x - der.aparat.size / 2} y={der.aparat.y} width={der.aparat.size} height={der.aparat.size} fill="none" stroke={s} strokeWidth={sw.path} data-station-aparat="DER" />
          <line x1={der.x} y1={der.stub2.y1} x2={der.x} y2={der.stub2.y2} stroke={s} strokeWidth={sw.path} />
          {derMiniMarker(props.stationDerOnMv, s, der.x, der.markerCY, der.markerHalf)}
        </g>
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
  neutralEarthing: NeutralEarthingGlyph,
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
