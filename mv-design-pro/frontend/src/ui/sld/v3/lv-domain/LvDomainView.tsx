/**
 * `LvDomainView(rootStationId, scenarioId)` — kanwa L2 (karta T5b-2 → T5b-3
 * → T5b-4, `docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md`). NOWA, WŁASNA kanwa
 * (nie `SldCanvasV3`) — TORY ELEKTRYCZNE jednej stacji jako projekcja grafu
 * domeny (`composeLvDomainScene`).
 *
 * T5b-4 — PROFESSIONAL VISUAL GRAMMAR (werdykt B-02 6/10, P0-V1..V10):
 * warstwa wizualna czyta WYŁĄCZNIE `visualGrammar.ts` (jeden język, pkt 25):
 * - P0-V1/P0-V10: fit-to-viewport z pasmem occupancy + CENTROWANIE — mała
 *   fixtura zajmuje 60–75% szerokości viewportu, nie klei się do lewej;
 * - P0-V2: typografia i grubości kresek SCREEN-STABLE (px ekranu / skala
 *   fitu), symbole CLAMPED do celów ekranowych;
 * - P0-V3: sylwetka aparatu ZA FUNKCJĄ (mapowanie w kompozytorze);
 * - P0-V5: hierarchia magistral MAIN/SUB (grubość+typografia z `busTier`);
 * - P0-V6: sprzęgło większe, STAN niesie SYMBOL (wypełnienie/kolor glifu),
 *   słowo stanu jest drugorzędnym potwierdzeniem (muted);
 * - P0-V7: DWA TRYBY ETYKIET — ENGINEERING (domyślny; zero nazw zacisków/
 *   portów na kanwie, hover niesie pełną nazwę) i AUDYT (nazwy terminali);
 * - P0-V8: boundary = terminal + referencja tekstowa ze strzałką (zero
 *   wyglądu przycisku w spoczynku);
 * - P0-V9: DER większy niż odbiór (tożsamość źródła);
 * - kotwica SN = dyskretny opis (nie dominanta — werdykt pkt 12).
 *
 * Bez wpięcia nawigacji (T5c) — CZYSTY render propsów, zero fetch/routing/
 * kamery. WYNIKI = przełączalne OVERLAYE z realnych kanałów wołającego
 * (`swzByFeederRef`/`resultOverlayPayload`/`voltageProfileByBusRef`) — zero
 * fizyki tutaj.
 */
import { useMemo, useState, type CSSProperties } from 'react';

import type { SwzOverlayEntry } from '../canvas/overlay';
import type { RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
import { getMetric, formatMetric } from '../../../sld-overlay/rawResultOverlayStore';
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import { SYMBOL_GLYPHS } from '../symbols/glyphs';
import type { SwitchState } from '../symbols/glyphs';
import {
  composeLvDomainScene,
  domainDescriptorLabel,
  type LvDomainSceneEdge,
  type LvDomainSceneNode,
} from './composeLvDomainScene';
import {
  BUS_STROKE_SCREEN_PX,
  JUNCTION_RADIUS_SCREEN_PX,
  LINE_DASH_SCREEN_PX,
  LINE_SCREEN_PX,
  SYMBOL_SCREEN_PX,
  TYPE_SCREEN_PX,
  fitSceneToViewport,
  glyphScaleForScreenTarget,
  plNumber,
  snKvaLabel,
  type SceneFit,
} from './visualGrammar';
import type { LvDomainGraphView, LvDomainOverlayId, UpstreamEquivalentSnapshot } from './types';

const CANVAS_BACKGROUND = '#0B0F14';
const STROKE_BASE = '#E8EEF4';
const STROKE_MUTED = '#5B6B7A';
const STROKE_BOUNDARY = '#E8A33D';
const STROKE_OPEN = '#8A98A6';
/** T5b-4: kabel jaśniejszy niż w T5b-3 (#3E6E8E ginął na tle #0B0F14 przy
 *  grubości 1,9 px ekranu — klasa linii ma być ROZRÓŻNIALNA, nie ukryta). */
const STROKE_CABLE = '#6FA0C2';
const STROKE_BUSBAR = '#E8EEF4';
const FILL_TERMINAL = '#B8C4CF';
/** P0.11: tony werdyktu SWZ/wyniku — spełnia/PASS zielony, nie
 *  spełnia/FAIL czerwony, nierozstrzygalne/brak żółty (kolor JEST
 *  wyłącznie prezentacją gotowego werdyktu backendu — zero progu liczonego
 *  w UI, ta sama zasada co `canvas/overlay.ts::swzPresentationTone`). */
const TONE_OK = '#5FE0A0';
const TONE_FAIL = '#E0615F';
const TONE_UNKNOWN = '#D8B45C';

/** Domyślny viewport (px), gdy wołający nie podał gabarytu (jsdom/testy).
 *  Harness i realne wpięcia podają RZECZYWISTY viewport (P0-V1: occupancy
 *  liczy się względem prawdziwego ekranu, nie stałej). */
const DEFAULT_VIEWPORT = { width: 1280, height: 800 } as const;
/** Wysokość paska nagłówka (HTML nad SVG) — reszta viewportu idzie na kanwę. */
const HEADER_ALLOWANCE_PX = 72;

/** P0-V7 — tryb etykiet: ENGINEERING (kanwa projektowa, zero nazw portów
 *  modelu) vs AUDYT (nazwy zacisków/terminali — inspekcja topologii). */
type LabelMode = 'engineering' | 'audit';

/** Rejestr etykiet PL overlay (werdykt: przełączalne overlaye inżynierskie).
 *  ZAMKNIĘTY na `LvDomainOverlayId` — dopisanie klucza tu bez realnego
 *  dostawcy w `types.ts` byłoby phantom (zakazane). */
const OVERLAY_LABELS_PL: Readonly<Record<LvDomainOverlayId, string>> = {
  loads: 'Obciążenia',
  voltageDrop: 'Spadki U',
  shortCircuit: 'Zwarcia',
  swz: 'SWZ',
};

const OVERLAY_ORDER: readonly LvDomainOverlayId[] = ['loads', 'voltageDrop', 'shortCircuit', 'swz'];

/** `bus_id`/`delta_pct` — mirror `canvas/nnSwzApi.ts::VoltageProfileRowApi`
 *  (reużycie kształtu bez importu modułu robiącego fetch, ten sam kontrakt). */
export interface LvDomainVoltageProfileRow {
  readonly bus_id: string;
  readonly delta_pct: number | null;
}

export interface LvDomainViewProps {
  readonly rootStationId: string;
  readonly scenarioId: string;
  readonly view: LvDomainGraphView;
  readonly upstreamEquivalents?: readonly UpstreamEquivalentSnapshot[];
  /** Gabaryt VIEWPORTU [px] (P0-V1) — kanwa wypełnia go w całości, a TREŚĆ
   *  jest fitowana do pasma occupancy i centrowana (`visualGrammar.ts`).
   *  Brak = `DEFAULT_VIEWPORT` (testy jsdom). */
  readonly width?: number;
  readonly height?: number;
  /** Overlay aktywny na start — `null` = SLD czysty (domyślne, werdykt). */
  readonly initialOverlay?: LvDomainOverlayId | null;
  /** P0.10/P0.11/hard-check#4 — odznaka SWZ per odpływ, klucz = ref aparatu
   *  (branch_ref) DOKŁADNIE jak `canvas/overlay.ts::SwzOverlayEntry.ownerRef`
   *  (`useSwzOverlay().swzByOwnerRef` — TEN SAM kanał co odznaka kanwy v3,
   *  zero drugiego źródła). */
  readonly swzByFeederRef?: Readonly<Record<string, SwzOverlayEntry>>;
  /** P0.17 — surowy payload JUŻ załadowanego przebiegu (load_flow/sc_3f),
   *  TA SAMA koperta co `rawResultOverlayStore`/`nnCircuitResults.ts`; klucz
   *  wewnętrzny = `elements[ref_id]` (bus/branch ref). */
  readonly resultOverlayPayload?: RawOverlayPayload | null;
  /** Overlay "Spadki U" — wiersz profilu napięć per szyna (osobny endpoint od
   *  `resultOverlayPayload`, ten sam wzorzec co `nnCircuitResults.ts`). */
  readonly voltageProfileByBusRef?: Readonly<Record<string, LvDomainVoltageProfileRow>>;
}

/** Halo etykiety (maska CAD, T5b-4): pismo podbite tłem kanwy przez
 *  `paint-order: stroke` — kreska toru NIGDY nie przechodzi PRZEZ tekst
 *  (klasa kolizji linia×tekst zmierzona na zrzutach: nazwa magistrali ×
 *  tor incomera, etykieta podszyny × kabel odpływu). Jedna maska dla
 *  WSZYSTKICH etykiet kanwy — reguła KLASA, nie punktowe odsuwanie. */
function textHalo(sp: (px: number) => number): {
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly paintOrder: 'stroke';
  readonly strokeLinejoin: 'round';
} {
  return { stroke: CANVAS_BACKGROUND, strokeWidth: sp(5), paintOrder: 'stroke', strokeLinejoin: 'round' };
}

function symbolBBox(symbolId: SymbolId | undefined): { readonly width: number; readonly height: number } {
  if (!symbolId) return { width: 0, height: 0 };
  const def = SYMBOL_DEFS[symbolId];
  return { width: def.width, height: def.height };
}

/** P0.9: "Stany łączeniowe aparatów pokazane symbolem" — GEOMETRIA glifu
 *  (`GlyphProps.state`), nie tylko kolor odcieniowy (kolor pozostaje jako
 *  DRUGI, redundantny sygnał — czytelność w druku mono). */
function switchStateOf(node: LvDomainSceneNode): SwitchState {
  const status = node.meta?.status;
  if (status === 'open') return 'open';
  if (status === 'closed') return 'closed';
  return 'unknown';
}

/** Cel EKRANOWY [px wysokości glifu] per rodzaj węzła (`visualGrammar.ts`,
 *  P0-V3/P0-V6/P0-V9): TR = centrum toru zasilania; sprzęgło > aparat
 *  odpływu (stan sekcjonowania widoczny z daleka); DER > odbiór. */
function glyphScreenTargetFor(node: LvDomainSceneNode): number {
  if (node.kind === 'transformer') return SYMBOL_SCREEN_PX.transformer;
  if (node.kind === 'generator') return SYMBOL_SCREEN_PX.generator;
  if (node.kind === 'load') return SYMBOL_SCREEN_PX.load;
  if (node.kind === 'apparatus') {
    return node.meta?.role === 'coupler' ? SYMBOL_SCREEN_PX.coupler : SYMBOL_SCREEN_PX.apparatus;
  }
  return SYMBOL_SCREEN_PX.junction;
}

/** Gabaryt EKRANOWY glifu węzła [px] + mnożnik skali glifu przy danym ficie. */
function glyphScreenSize(node: LvDomainSceneNode, fit: SceneFit): { readonly w: number; readonly h: number; readonly k: number } {
  const bbox = symbolBBox(node.symbolId);
  if (bbox.height === 0) return { w: 0, h: 0, k: 1 };
  const target = glyphScreenTargetFor(node);
  const k = glyphScaleForScreenTarget(bbox.height, target, fit.s);
  return { w: (bbox.width * target) / bbox.height, h: target, k };
}

function ScaledGlyph({ node, fit }: { readonly node: LvDomainSceneNode; readonly fit: SceneFit }): JSX.Element | null {
  if (!node.symbolId) return null;
  const Glyph = SYMBOL_GLYPHS[node.symbolId];
  const bbox = symbolBBox(node.symbolId);
  const { k } = glyphScreenSize(node, fit);
  const originX = node.x - bbox.width / 2;
  const originY = node.y - bbox.height / 2;
  const isCoupler = node.meta?.role === 'coupler';
  const open = node.meta?.status === 'open';
  // P0-V6/werdykt pkt 14: STAN niesie SYMBOL — sprzęgło otwarte w tonie
  // ostrzegawczym (sekcjonowanie!), inne aparaty otwarte wygaszone.
  const stroke = open ? (isCoupler ? TONE_UNKNOWN : STROKE_OPEN) : STROKE_BASE;
  const state = node.kind === 'apparatus' ? switchStateOf(node) : undefined;
  // Sprzęgło leży na TORZE POZIOMYM — glif aparatu (porty N/S) obrócony 90°,
  // żeby jego kikuty leżały w osi toru (sylwetka, nie kwadrat z wąsami).
  const rotation = isCoupler ? ' rotate(90)' : '';
  return (
    <g transform={`translate(${node.x} ${node.y})${rotation} scale(${k}) translate(${-node.x} ${-node.y})`}>
      <Glyph x={originX} y={originY} stroke={stroke} state={state} />
    </g>
  );
}

/** Nazwa dostawcy overlay w meta — WYŁĄCZNIE informacyjna gdy KANAŁ nie ma
 *  danych dla ŻADNEGO węzła sceny (uczciwy brak, nie fabrykacja liczby). */
function overlayStatusLabel(overlay: LvDomainOverlayId | null, hasAnyData: boolean): string {
  if (overlay === null) return 'SLD czysty (bez nakładki)';
  if (!hasAnyData) return `Nakładka: ${OVERLAY_LABELS_PL[overlay]} · brak wyniku (uruchom bieg)`;
  return `Nakładka: ${OVERLAY_LABELS_PL[overlay]}`;
}

export function LvDomainView(props: LvDomainViewProps): JSX.Element {
  const {
    rootStationId,
    scenarioId,
    view,
    upstreamEquivalents = [],
    width,
    height,
    initialOverlay = null,
    swzByFeederRef = {},
    resultOverlayPayload = null,
    voltageProfileByBusRef = {},
  } = props;
  const [activeOverlay, setActiveOverlay] = useState<LvDomainOverlayId | null>(initialOverlay);
  const [labelMode, setLabelMode] = useState<LabelMode>('engineering');

  const scene = useMemo(() => composeLvDomainScene(view, upstreamEquivalents), [view, upstreamEquivalents]);
  const domainDescriptor = useMemo(() => domainDescriptorLabel(view), [view]);

  if (view.status !== 'OK') {
    return (
      <div
        data-testid="lv-domain-view-root"
        data-status="brak-danych"
        style={{ background: CANVAS_BACKGROUND, color: STROKE_BASE, padding: 24, fontFamily: 'monospace' }}
      >
        Domena nN stacji „{rootStationId}" — brak danych ({(view.missing_data ?? []).join(', ') || 'nieznany powód'}).
      </div>
    );
  }

  // P0-V1/P0-V10 — kanwa wypełnia viewport; treść fitowana do pasma
  // occupancy i CENTROWANA (`visualGrammar.ts::fitSceneToViewport`).
  const viewportWidth = width ?? DEFAULT_VIEWPORT.width;
  const viewportHeight = height ?? DEFAULT_VIEWPORT.height;
  const canvasHeight = Math.max(240, viewportHeight - HEADER_ALLOWANCE_PX);
  const fit = fitSceneToViewport(scene.width, scene.height, viewportWidth, canvasHeight);
  /** px EKRANU → px świata (wewnątrz grupy transformowanej fitem). */
  const sp = (screenPx: number): number => screenPx / fit.s;

  const hasSwzData = activeOverlay === 'swz' && Object.keys(swzByFeederRef).length > 0;
  const hasResultData =
    (activeOverlay === 'loads' || activeOverlay === 'shortCircuit') && resultOverlayPayload != null;
  const hasVoltageDropData = activeOverlay === 'voltageDrop' && Object.keys(voltageProfileByBusRef).length > 0;
  const hasAnyOverlayData = hasSwzData || hasResultData || hasVoltageDropData;

  return (
    <div
      data-testid="lv-domain-view-root"
      data-status="ok"
      data-root-station-id={rootStationId}
      data-scenario-id={scenarioId}
      style={{ background: CANVAS_BACKGROUND, color: STROKE_BASE, fontFamily: 'sans-serif' }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{view.station_name ?? view.station_ref} · nN</div>
          {/* P0.14: nagłówek OPISUJE DOMENĘ (napięcie/liczba TR/sekcji/DER/
              boundary) — parametry tabliczki TR (Sn/uk/grupa) żyją na węźle
              transformatora w scenie, nagłówek ich NIE powtarza. */}
          <div data-testid="lv-domain-descriptor" style={{ fontSize: 11, color: STROKE_MUTED }}>
            {domainDescriptor}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* P0-V7 — tryb etykiet: ENGINEERING (projektowy, domyślny) /
              AUDYT (nazwy zacisków i terminali modelu). */}
          <div data-testid="lv-domain-labelmode-switcher" role="group" aria-label="Tryb etykiet" style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              data-testid="lv-domain-labelmode-engineering"
              aria-pressed={labelMode === 'engineering'}
              onClick={() => setLabelMode('engineering')}
              style={overlayButtonStyle(labelMode === 'engineering')}
            >
              Etykiety: projektowe
            </button>
            <button
              type="button"
              data-testid="lv-domain-labelmode-audit"
              aria-pressed={labelMode === 'audit'}
              onClick={() => setLabelMode('audit')}
              style={overlayButtonStyle(labelMode === 'audit')}
            >
              Audyt topologii
            </button>
          </div>
          <div data-testid="lv-domain-overlay-switcher" role="group" aria-label="Nakładka wyników" style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              data-testid="lv-domain-overlay-none"
              aria-pressed={activeOverlay === null}
              onClick={() => setActiveOverlay(null)}
              style={overlayButtonStyle(activeOverlay === null)}
            >
              Brak
            </button>
            {OVERLAY_ORDER.map((overlayId) => (
              <button
                key={overlayId}
                type="button"
                data-testid={`lv-domain-overlay-${overlayId}`}
                aria-pressed={activeOverlay === overlayId}
                onClick={() => setActiveOverlay(overlayId)}
                style={overlayButtonStyle(activeOverlay === overlayId)}
              >
                {OVERLAY_LABELS_PL[overlayId]}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div data-testid="lv-domain-overlay-status" style={{ padding: '0 16px 8px', fontSize: 11, color: STROKE_MUTED }}>
        {overlayStatusLabel(activeOverlay, hasAnyOverlayData)}
      </div>
      <svg
        data-testid="lv-domain-svg"
        data-fit-scale={fit.s}
        width={viewportWidth}
        height={canvasHeight}
        viewBox={`0 0 ${viewportWidth} ${canvasHeight}`}
      >
        <rect x={0} y={0} width={viewportWidth} height={canvasHeight} fill={CANVAS_BACKGROUND} />
        <g data-testid="lv-domain-world" transform={`translate(${fit.tx} ${fit.ty}) scale(${fit.s})`}>
          <g data-testid="lv-domain-edges">
            {scene.edges.map((edge) => (
              <SceneEdgeLine key={edge.ref} edge={edge} scene={scene} sp={sp} />
            ))}
          </g>
          <g data-testid="lv-domain-nodes">
            {scene.nodes.map((node) => {
              if (node.kind === 'anchorChip') return <AnchorChipNode key={node.ref} node={node} sp={sp} />;
              if (node.kind === 'boundaryChip') return <BoundaryRefNode key={node.ref} node={node} sp={sp} />;
              if (node.kind === 'bus') {
                return (
                  <BusBarNode
                    key={node.ref}
                    node={node}
                    sp={sp}
                    activeOverlay={activeOverlay}
                    resultOverlayPayload={resultOverlayPayload}
                    voltageProfileByBusRef={voltageProfileByBusRef}
                  />
                );
              }
              if (node.kind === 'boundaryTerminal') {
                return (
                  <g key={node.ref} data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref}>
                    <circle cx={node.x} cy={node.y} r={sp(JUNCTION_RADIUS_SCREEN_PX + 1)} fill={FILL_TERMINAL} stroke={STROKE_BOUNDARY} strokeWidth={sp(1.2)} />
                  </g>
                );
              }
              if (node.kind === 'busJunction') {
                return (
                  <g key={node.ref} data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref}>
                    {/* P0-V7: kropka zacisku ZAWSZE; nazwa portu modelu
                        WYŁĄCZNIE w trybie AUDYT — na kanwie projektowej
                        hover (title) niesie pełną nazwę. */}
                    <title>{node.label}</title>
                    <circle cx={node.x} cy={node.y} r={sp(JUNCTION_RADIUS_SCREEN_PX)} fill={FILL_TERMINAL} />
                    {labelMode === 'audit' ? (
                      <text {...textHalo(sp)} x={node.x + sp(7)} y={node.y + sp(3.5)} textAnchor="start" fontSize={sp(TYPE_SCREEN_PX.tertiary)} fill={STROKE_MUTED}>
                        {node.label}
                      </text>
                    ) : null}
                  </g>
                );
              }
              return (
                <g key={node.ref} data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref}>
                  <ScaledGlyph node={node} fit={fit} />
                  <NodeLabel node={node} fit={fit} sp={sp} />
                  {node.kind === 'apparatus' && activeOverlay === 'swz' ? (
                    <SwzBadge node={node} fit={fit} sp={sp} entry={swzByFeederRef[node.ref]} />
                  ) : null}
                  {node.kind === 'apparatus' && (activeOverlay === 'loads' || activeOverlay === 'shortCircuit') ? (
                    <ResultBadge node={node} fit={fit} sp={sp} overlay={activeOverlay} payload={resultOverlayPayload} />
                  ) : null}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}

/** P0.1/P0-V5 — sekcja szyn REALNA: kreska magistrali w hierarchii MAIN/SUB
 *  (grubość + typografia z `busTier` — rozpoznawalne bez czytania etykiety).
 *  Niesie WŁASNE plakietki overlay (zwarcia/spadki U) — `kind==='bus'`
 *  zwraca się wcześnie w pętli renderu, więc odznaki muszą żyć TUTAJ. */
function BusBarNode({
  node,
  sp,
  activeOverlay,
  resultOverlayPayload,
  voltageProfileByBusRef,
}: {
  readonly node: LvDomainSceneNode;
  readonly sp: (px: number) => number;
  readonly activeOverlay: LvDomainOverlayId | null;
  readonly resultOverlayPayload: RawOverlayPayload | null;
  readonly voltageProfileByBusRef: Readonly<Record<string, LvDomainVoltageProfileRow>>;
}): JSX.Element {
  const half = node.busBarHalfWidth ?? 0;
  const isMain = node.meta?.busTier !== 'sub';
  const strokeWidth = sp(isMain ? BUS_STROKE_SCREEN_PX.main : BUS_STROKE_SCREEN_PX.sub);
  const labelPx = isMain ? TYPE_SCREEN_PX.primary : TYPE_SCREEN_PX.busSub;
  return (
    <g data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref} data-bus-tier={isMain ? 'main' : 'sub'}>
      <line
        x1={node.x - half}
        y1={node.y}
        x2={node.x + half}
        y2={node.y}
        stroke={STROKE_BUSBAR}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
      />
      <text
        {...textHalo(sp)}
        x={node.x - half}
        y={node.y - sp(10) - strokeWidth / 2}
        textAnchor="start"
        fontSize={sp(labelPx)}
        fontWeight={700}
        fill={STROKE_BASE}
      >
        {node.label}
        {node.meta?.voltageKv != null ? (
          <tspan fontSize={sp(TYPE_SCREEN_PX.secondary)} fontWeight={400} fill={STROKE_MUTED}>
            {`  ·  ${plNumber(node.meta.voltageKv as number)} kV`}
          </tspan>
        ) : null}
      </text>
      {activeOverlay === 'loads' || activeOverlay === 'shortCircuit' ? (
        <ResultBadge node={node} fit={null} sp={sp} overlay={activeOverlay} payload={resultOverlayPayload} />
      ) : null}
      {activeOverlay === 'voltageDrop' ? <VoltageDropBadge node={node} sp={sp} row={voltageProfileByBusRef[node.ref]} /> : null}
    </g>
  );
}

/** Werdykt pkt 12 — kotwica SN jest KOTWICĄ, nie dominantą: dyskretny opis
 *  tekstowy (muted, bez obrysu/pudełka) nad torem źródła. */
function AnchorChipNode({ node, sp }: { readonly node: LvDomainSceneNode; readonly sp: (px: number) => number }): JSX.Element {
  return (
    <g data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref}>
      {/* Baseline NAD punktem kotwicy — kreska toru źródła startuje w punkcie
          i nie przecina tekstu. */}
      <text {...textHalo(sp)} x={node.x} y={node.y - sp(6)} textAnchor="middle" fontSize={sp(10)} fill={STROKE_MUTED} fontFamily="monospace">
        {node.label}
      </text>
    </g>
  );
}

/** P0-V8 — boundary BEZ wyglądu przycisku: referencja tekstowa w kolorze
 *  granicy (● terminal rysuje `boundaryTerminal`, strzałkę — krawędź
 *  `boundaryLink`), napięcie zacisku pod nazwą. Affordance (rola przycisku,
 *  nawigacja T5c) zostaje w a11y, nie w wyglądzie spoczynkowym. */
function BoundaryRefNode({ node, sp }: { readonly node: LvDomainSceneNode; readonly sp: (px: number) => number }): JSX.Element {
  return (
    <g
      data-testid={`lv-domain-node-${node.ref}`}
      data-node-kind={node.kind}
      data-owner-ref={node.ref}
      role="button"
      aria-label={`Otwórz domenę ${node.label.replace('→ ', '')}`}
    >
      <text {...textHalo(sp)} x={node.x - sp(2)} y={node.y + sp(4)} textAnchor="start" fontSize={sp(TYPE_SCREEN_PX.secondary + 0.5)} fontWeight={600} fill={STROKE_BOUNDARY}>
        {node.label}
      </text>
      {node.meta?.voltageKv != null ? (
        <text {...textHalo(sp)} x={node.x - sp(2)} y={node.y + sp(17)} textAnchor="start" fontSize={sp(TYPE_SCREEN_PX.tertiary)} fill={STROKE_MUTED}>
          {`${plNumber(node.meta.voltageKv as number)} kV`}
        </text>
      ) : null}
    </g>
  );
}

/** T5b-4 — gramatyka linii (werdykt pkt 13, `visualGrammar.ts::LINE_SCREEN_PX`):
 *  BUS (rysuje BusBarNode) > INTERNAL CONNECTION (kikuty/incomer/tor źródła)
 *  > CABLE (cieńszy, zaokrąglony) > BOUNDARY (przerywany + strzałka).
 *  Sprzęgło: DWA kikuty do krawędzi glifu — ciągłość toru niesie SYMBOL
 *  aparatu (wypełniony=zamknięty), nie kreska POD symbolem (P0-V6). */
function SceneEdgeLine({
  edge,
  scene,
  sp,
}: {
  readonly edge: LvDomainSceneEdge;
  readonly scene: { readonly nodes: readonly LvDomainSceneNode[] };
  readonly sp: (px: number) => number;
}): JSX.Element {
  const isCable = edge.kind === 'cable';
  const isBoundaryLink = edge.kind === 'boundaryLink';
  const open = edge.status === 'open';
  const dashOf = (pattern: readonly [number, number]): string => `${sp(pattern[0])} ${sp(pattern[1])}`;
  const stroke = isBoundaryLink ? STROKE_BOUNDARY : isCable ? STROKE_CABLE : open ? STROKE_OPEN : STROKE_BASE;
  const dash = isBoundaryLink ? dashOf(LINE_DASH_SCREEN_PX.boundary) : open ? dashOf(LINE_DASH_SCREEN_PX.open) : undefined;
  const width = sp(
    edge.kind === 'coupler' ? LINE_SCREEN_PX.coupler : isCable ? LINE_SCREEN_PX.cable : isBoundaryLink ? LINE_SCREEN_PX.boundary : LINE_SCREEN_PX.connection,
  );

  if (edge.kind === 'coupler') {
    // Kikuty sprzęgła od krawędzi kresek sekcji do KRAWĘDZI glifu aparatu —
    // przez glif tor NIE przechodzi (stan niesie sylwetka: P0-V6).
    const couplerNode = scene.nodes.find((n) => n.ref === edge.ref && n.kind === 'apparatus');
    const midX = couplerNode?.x ?? (edge.x1 + edge.x2) / 2;
    const gap = couplerNode ? sp(SYMBOL_SCREEN_PX.coupler / 2 + 2) : 0;
    const tone = open ? TONE_UNKNOWN : STROKE_BASE;
    const stubDash = open ? dashOf(LINE_DASH_SCREEN_PX.open) : undefined;
    return (
      <g data-testid={`lv-domain-edge-${edge.ref}`} data-edge-kind={edge.kind}>
        <line x1={edge.x1} y1={edge.y1} x2={midX - gap} y2={edge.y2} stroke={tone} strokeWidth={width} strokeDasharray={stubDash} />
        <line x1={midX + gap} y1={edge.y1} x2={edge.x2} y2={edge.y2} stroke={tone} strokeWidth={width} strokeDasharray={stubDash} />
      </g>
    );
  }

  return (
    <g data-testid={`lv-domain-edge-${edge.ref}`} data-edge-kind={edge.kind} data-gap={edge.meta?.gapPl ? 'true' : undefined}>
      {edge.meta?.gapPl ? <title>{String(edge.meta.gapPl)}</title> : null}
      {edge.meta?.apparatusGapPl ? <title>{String(edge.meta.apparatusGapPl)}</title> : null}
      <line
        x1={edge.x1}
        y1={edge.y1}
        x2={edge.x2}
        y2={edge.y2}
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinecap={isCable ? 'round' : undefined}
      />
      {isBoundaryLink ? (
        // Strzałka referencji granicznej (●────→): grot na końcu linku,
        // kierunek z geometrii krawędzi (linki są poziome w prawo).
        <path
          d={`M ${edge.x2} ${edge.y2} l ${-sp(9)} ${-sp(4)} l 0 ${sp(8)} Z`}
          fill={STROKE_BOUNDARY}
          stroke="none"
        />
      ) : null}
    </g>
  );
}

/**
 * T5b-4 — etykiety per rodzaj węzła, typografia SCREEN-STABLE (P0-V2) z
 * `visualGrammar.ts`: TR = blok HIERARCHICZNY (werdykt pkt 4: oznaczenie +
 * Sn[kVA] jako PRIMARY, przekładnia·grupa i uk jako SECONDARY — nie 5
 * równorzędnych mikrolinii); aparat = oznaczenie PO PRAWEJ glifu; sprzęgło =
 * nazwa nad glifem + STAN słownie jako DRUGORZĘDNE potwierdzenie (muted —
 * kolor/stan niesie SYMBOL, werdykt pkt 14 „to powinno zostać odwrócone");
 * generator/odbiór = nazwa + wartość dwupoziomowo.
 */
function NodeLabel({
  node,
  fit,
  sp,
}: {
  readonly node: LvDomainSceneNode;
  readonly fit: SceneFit;
  readonly sp: (px: number) => number;
}): JSX.Element {
  const glyph = glyphScreenSize(node, fit);
  if (node.kind === 'transformer') {
    const name = typeof node.meta?.name === 'string' ? node.meta.name : node.ref;
    const snMva = typeof node.meta?.snMva === 'number' ? node.meta.snMva : null;
    const uhv = typeof node.meta?.uhvKv === 'number' ? node.meta.uhvKv : null;
    const ulv = typeof node.meta?.ulvKv === 'number' ? node.meta.ulvKv : null;
    const group = typeof node.meta?.vectorGroup === 'string' ? node.meta.vectorGroup : null;
    const uk = typeof node.meta?.ukPercent === 'number' ? node.meta.ukPercent : null;
    const xText = node.x + sp(glyph.w / 2 + 12);
    return (
      <g {...textHalo(sp)}>
        <text x={xText} y={node.y - sp(14)} textAnchor="start" fontSize={sp(TYPE_SCREEN_PX.primary + 1)} fontWeight={700} fill={STROKE_BASE}>
          {name}
        </text>
        {snMva != null ? (
          <text x={xText} y={node.y + sp(2)} textAnchor="start" fontSize={sp(TYPE_SCREEN_PX.primary)} fontWeight={600} fill={STROKE_BASE}>
            {snKvaLabel(snMva)}
          </text>
        ) : null}
        {uhv != null && ulv != null ? (
          <text x={xText} y={node.y + sp(16)} textAnchor="start" fontSize={sp(TYPE_SCREEN_PX.secondary)} fill={STROKE_MUTED}>
            {`${plNumber(uhv)}/${plNumber(ulv)} kV${group ? ` · ${group}` : ''}`}
          </text>
        ) : null}
        {uk != null ? (
          <text x={xText} y={node.y + sp(29)} textAnchor="start" fontSize={sp(TYPE_SCREEN_PX.secondary)} fill={STROKE_MUTED}>
            {`uk = ${plNumber(uk)}%`}
          </text>
        ) : null}
      </g>
    );
  }
  if (node.kind === 'apparatus') {
    const isCoupler = node.meta?.role === 'coupler';
    const open = node.meta?.status === 'open';
    if (isCoupler) {
      // Blok nazwa+stan POD glifem — strefa między sekcjami jest pusta;
      // nazwa NAD glifem wchodziła w pas etykiet źródeł lewej sekcji
      // (zmierzone na zrzucie multi-source: „coupler" × wartość PV).
      return (
        <g {...textHalo(sp)}>
          <text
            x={node.x}
            y={node.y + sp(glyph.h / 2 + 15)}
            textAnchor="middle"
            fontSize={sp(TYPE_SCREEN_PX.secondary + 1)}
            fontWeight={600}
            fill={STROKE_BASE}
          >
            {node.label}
          </text>
          {/* Słowo stanu = DRUGORZĘDNE potwierdzenie (muted) — stan niesie
              SYMBOL (wypełnienie/przerwa/kolor glifu), werdykt pkt 14. */}
          <text
            x={node.x}
            y={node.y + sp(glyph.h / 2 + 29)}
            textAnchor="middle"
            fontSize={sp(TYPE_SCREEN_PX.secondary - 1)}
            fontWeight={600}
            fill={open ? TONE_UNKNOWN : STROKE_MUTED}
          >
            {open ? 'OTWARTE' : 'ZAMKNIĘTE'}
          </text>
        </g>
      );
    }
    return (
      <text
        {...textHalo(sp)}
        x={node.x + sp(glyph.w / 2 + 9)}
        y={node.y + sp(4)}
        textAnchor="start"
        fontSize={sp(TYPE_SCREEN_PX.secondary + 1)}
        fontWeight={600}
        fill={STROKE_BASE}
      >
        {node.label}
      </text>
    );
  }
  if (node.kind === 'generator') {
    // P0-V9: tożsamość ŹRÓDŁA — glif duży, etykieta PO PRAWEJ glifu (pod
    // glifem wchodziłaby w tor/kreskę szyny poniżej — zmierzona kolizja
    // PV1 × magistrala na zrzutach T5b-4).
    const [name, value] = node.label.split(' · ');
    const xText = node.x + sp(glyph.w / 2 + 9);
    return (
      <g {...textHalo(sp)}>
        <text x={xText} y={node.y - sp(2)} textAnchor="start" fontSize={sp(TYPE_SCREEN_PX.primary)} fontWeight={700} fill={STROKE_BASE}>
          {name}
        </text>
        {value ? (
          <text x={xText} y={node.y + sp(12)} textAnchor="start" fontSize={sp(TYPE_SCREEN_PX.secondary)} fill={STROKE_MUTED}>
            {value.replace('.', ',')}
          </text>
        ) : null}
      </g>
    );
  }
  if (node.kind === 'load') {
    const [name, value] = node.label.split(' · ');
    const yBase = node.y + sp(glyph.h / 2 + 16);
    return (
      <g {...textHalo(sp)}>
        <text x={node.x} y={yBase} textAnchor="middle" fontSize={sp(TYPE_SCREEN_PX.secondary + 1)} fontWeight={600} fill={STROKE_BASE}>
          {name}
        </text>
        {value ? (
          <text x={node.x} y={yBase + sp(14)} textAnchor="middle" fontSize={sp(TYPE_SCREEN_PX.secondary)} fill={STROKE_MUTED}>
            {value.replace('.', ',')}
          </text>
        ) : null}
      </g>
    );
  }
  return <g />;
}

/**
 * P0.10/P0.11/hard-check#4: plakietka SWZ NA TORZE (nie sam zielony
 * przycisk) — displayedValue == DOKŁADNIE `swzByFeederRef[node.ref]` podany
 * przez wołającego (`SwzOverlayEntry`, zero przeliczeń). Format: `Ik₁min` +
 * `t wymagany` (IEC 60364-4-41), oraz `Ia wymagane` przy FAIL. Czas
 * zadziałania aparatu (`ta` z krzywej TCC) NIE jest polem koperty
 * `SwzApiResponse`/`SwzOverlayEntry` — luka nazwana w raporcie karty T5b-2
 * (P0.10/P0.11) — plakietka pokazuje to, co koperta NIESIE, bez fabrykacji.
 */
function SwzBadge({
  node,
  fit,
  sp,
  entry,
}: {
  readonly node: LvDomainSceneNode;
  readonly fit: SceneFit;
  readonly sp: (px: number) => number;
  readonly entry: SwzOverlayEntry | undefined;
}): JSX.Element | null {
  if (!entry) return null;
  const glyph = glyphScreenSize(node, fit);
  const tone = entry.status === 'spełnia' ? TONE_OK : entry.status === 'nie spełnia' ? TONE_FAIL : TONE_UNKNOWN;
  const symbol = entry.status === 'spełnia' ? '✓' : entry.status === 'nie spełnia' ? '✗' : '?';
  const tSuffix = entry.tWymaganyS != null ? `/${entry.tWymaganyS.toFixed(2)} s` : '';
  const text =
    entry.status === 'nie spełnia' && entry.iaWymaganeA != null
      ? `SWZ ${symbol} Ik₁min=${entry.ik1MinA.toFixed(0)} A · Ia wym.=${entry.iaWymaganeA.toFixed(0)} A`
      : `SWZ ${symbol} ${entry.ik1MinA.toFixed(0)} A${tSuffix}`;
  return (
    <g {...textHalo(sp)} data-testid={`lv-domain-badge-swz-${node.ref}`} data-swz-status={entry.status}>
      <text x={node.x} y={node.y + sp(glyph.h / 2 + 30)} textAnchor="middle" fontSize={sp(TYPE_SCREEN_PX.badge)} fill={tone} fontFamily="monospace">
        {text}
      </text>
    </g>
  );
}

/** P0.17: displayedValue == solverResult(elementRef, runId) — odczyt WPROST
 *  z `RawOverlayPayload.elements[ref].metrics`, zero przeliczeń. */
function ResultBadge({
  node,
  fit,
  sp,
  overlay,
  payload,
}: {
  readonly node: LvDomainSceneNode;
  readonly fit: SceneFit | null;
  readonly sp: (px: number) => number;
  readonly overlay: 'loads' | 'shortCircuit';
  readonly payload: RawOverlayPayload | null;
}): JSX.Element | null {
  if (!payload) return null;
  const metricCode = overlay === 'shortCircuit' ? 'IK_3F_A' : 'I_A';
  const metric = getMetric(payload, node.ref, metricCode);
  if (!metric || metric.value == null) return null;
  const yOffset = fit ? glyphScreenSize(node, fit).h / 2 + 30 : 26;
  return (
    <g {...textHalo(sp)} data-testid={`lv-domain-badge-${overlay}-${node.ref}`} data-run-id={payload.run_id}>
      <text x={node.x} y={node.y + sp(yOffset)} textAnchor="middle" fontSize={sp(TYPE_SCREEN_PX.badge)} fill={STROKE_BASE} fontFamily="monospace">
        {formatMetric(metric)}
      </text>
    </g>
  );
}

function VoltageDropBadge({
  node,
  sp,
  row,
}: {
  readonly node: LvDomainSceneNode;
  readonly sp: (px: number) => number;
  readonly row: LvDomainVoltageProfileRow | undefined;
}): JSX.Element | null {
  if (!row || row.delta_pct == null) return null;
  return (
    <g {...textHalo(sp)} data-testid={`lv-domain-badge-voltageDrop-${node.ref}`}>
      <text x={node.x} y={node.y - sp(20)} textAnchor="middle" fontSize={sp(TYPE_SCREEN_PX.badge)} fill={STROKE_BASE} fontFamily="monospace">
        {`ΔU ${row.delta_pct.toFixed(2)}%`}
      </text>
    </g>
  );
}

function overlayButtonStyle(active: boolean): CSSProperties {
  return {
    background: active ? '#1D3A2E' : 'transparent',
    color: active ? '#5FE0A0' : STROKE_MUTED,
    border: `1px solid ${active ? '#5FE0A0' : STROKE_MUTED}`,
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
    cursor: 'pointer',
  };
}
