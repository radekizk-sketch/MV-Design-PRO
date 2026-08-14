/**
 * `LvDomainView(rootStationId, scenarioId)` — kanwa L2 (karta T5b-2, §0
 * rozstrzygnięcie 3, `docs/nn/KONCEPCJA_LOD_NN_2026-08.md` werdykt
 * właściciela + `docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` werdykt B-02 T5b
 * REJECT 0/10 → 18 punktów P0). NOWA, WŁASNA kanwa (nie `SldCanvasV3`) —
 * TORY ELEKTRYCZNE jednej stacji jako spójna, generyczna projekcja grafu
 * domeny (`composeLvDomainScene`): sekcje szyn = kreska magistrali (P0.1),
 * sprzęgło = jawny aparat w szczelinie (P0.2), TR→incomer→BUS jawny
 * (P0.3/P0.4), każdy odpływ = BUS→zabezpieczenie→kabel→cel (P0.5/P0.6),
 * boundary = odpływ→kabel→●terminal→chip (P0.8), stany OPEN/CLOSED
 * GEOMETRIĄ glifu (P0.9); świat SN chowa się za chipem(-ami) kotwicy.
 *
 * Bez wpięcia nawigacji (T5c — kamera/pan/zoom/breadcrumb powrotu to
 * ODRĘBNY stan, karta §0 pkt 3 "MECHANIZMY ROZDZIELONE"): ten komponent jest
 * CZYSTYM renderem danych podanych przez wołającego (props), zero
 * fetch/routing/kamery — sterowany deterministycznym harnessem zrzutowym
 * (`lv-domain-harness-main.tsx`) dla dowodu wizualnego.
 *
 * WYNIKI = przełączalne OVERLAYE (werdykt: "nie 10 liczb naraz; domyślny SLD
 * czysty"), TERAZ Z REALNYMI DANYMI (T5b-2 P0.10/P0.11/P0.17, hard-check #4):
 * `swzByFeederRef`/`resultOverlayPayload`/`voltageProfileByBusRef` — WYŁĄCZNIE
 * odczyt propsów podanych przez wołającego (który sam robi fetch, np.
 * `useSwzOverlay`/`useRawResultOverlayStore` — TA SAMA koperta co reszta
 * kanwy v3/`nnCircuitResults.ts`, ONE SOURCE OF TRUTH), zero fizyki tutaj.
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
import type { LvDomainGraphView, LvDomainOverlayId, UpstreamEquivalentSnapshot } from './types';

const CANVAS_BACKGROUND = '#0B0F14';
const STROKE_BASE = '#E8EEF4';
const STROKE_MUTED = '#5B6B7A';
const STROKE_BOUNDARY = '#E8A33D';
const STROKE_OPEN = '#8A98A6';
const STROKE_CABLE = '#3E6E8E';
const STROKE_BUSBAR = '#E8EEF4';
const FILL_TERMINAL = '#B8C4CF';
/** P0.11: tony werdyktu SWZ/wyniku — spełnia/PASS zielony, nie
 *  spełnia/FAIL czerwony, nierozstrzygalne/brak żółty (kolor JEST
 *  wyłącznie prezentacją gotowego werdyktu backendu — zero progu liczonego
 *  w UI, ta sama zasada co `canvas/overlay.ts::swzPresentationTone`). */
const TONE_OK = '#5FE0A0';
const TONE_FAIL = '#E0615F';
const TONE_UNKNOWN = '#D8B45C';

/** P0.13 "minimalne engineering sizes (…etykiety…) — fit() nie schodzi
 *  poniżej progu czytelności" — fonty STAŁE (SCREEN-STABLE), niezależne od
 *  geometrii świata (zasada WORLD-SCALED vs SCREEN-STABLE, T5a werdykt). */
const FONT_LABEL_PX = 9;
const FONT_HEADER_PX = 13;
const FONT_BADGE_PX = 9;

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
  /** Nadpisanie gabarytu wyświetlania — DOMYŚLNIE gabaryt treści (P0.12:
   *  "Auto-layout: sensowna część viewportu po Fit, nie 15-20% kanwy"), nie
   *  stały rozmiar niezależny od zawartości. */
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

function SceneNodeGlyph({ node }: { readonly node: LvDomainSceneNode }): JSX.Element | null {
  if (!node.symbolId) return null;
  const Glyph = SYMBOL_GLYPHS[node.symbolId];
  const bbox = symbolBBox(node.symbolId);
  const originX = node.x - bbox.width / 2;
  const originY = node.y - bbox.height / 2;
  const stroke = node.meta?.status === 'open' ? STROKE_OPEN : STROKE_BASE;
  return <Glyph x={originX} y={originY} stroke={stroke} state={node.kind === 'apparatus' ? switchStateOf(node) : undefined} />;
}

/** P0.1 — sekcja szyn REALNA: kreska magistrali (nie ikonka). Grubość
 *  wizualnie odróżnialna od kabla/odpływu (P0.6 — dystynkcja aparat/kabel).
 *  Niesie WŁASNE plakietki overlay (zwarcia/spadki U) — `kind==='bus'`
 *  zwraca się wcześnie w pętli renderu, więc odznaki muszą żyć TUTAJ, nie w
 *  gałęzi generycznej (TS słusznie odrzuca `node.kind==='bus'` po wczesnym
 *  return — dwa niezależne warunki rozjechałyby się przy pierwszej zmianie). */
function BusBarNode({
  node,
  activeOverlay,
  resultOverlayPayload,
  voltageProfileByBusRef,
}: {
  readonly node: LvDomainSceneNode;
  readonly activeOverlay: LvDomainOverlayId | null;
  readonly resultOverlayPayload: RawOverlayPayload | null;
  readonly voltageProfileByBusRef: Readonly<Record<string, LvDomainVoltageProfileRow>>;
}): JSX.Element {
  const half = node.busBarHalfWidth ?? 0;
  return (
    <g data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref}>
      <line
        x1={node.x - half}
        y1={node.y}
        x2={node.x + half}
        y2={node.y}
        stroke={STROKE_BUSBAR}
        strokeWidth={4}
        strokeLinecap="square"
      />
      {/* F2 (dowód wizualny, T5b-2): etykieta PONIŻEJ kreski — POWYŻEJ
          schodzi tor incomera (zacisk+aparat, `INCOMER_ROW_OFFSET`), więc
          etykieta nad kreską regularnie nachodziła na ten łańcuch (zrzut
          `lv_domain_station_c_dark.png`). Poniżej kreski koliduje wyłącznie
          z pierwszym rzędem odpływów, który ma własny odstęp (feeder→child
          o pełny `ROW_HEIGHT`, patrz `tapPointOn`/`boardCenterOf`). */}
      <text x={node.x} y={node.y + 16} textAnchor="middle" fontSize={FONT_LABEL_PX} fill={STROKE_MUTED}>
        {node.label}
      </text>
      {activeOverlay === 'loads' || activeOverlay === 'shortCircuit' ? (
        <ResultBadge node={node} overlay={activeOverlay} payload={resultOverlayPayload} />
      ) : null}
      {activeOverlay === 'voltageDrop' ? <VoltageDropBadge node={node} row={voltageProfileByBusRef[node.ref]} /> : null}
    </g>
  );
}

function BoundaryTerminalNode({ node }: { readonly node: LvDomainSceneNode }): JSX.Element {
  return (
    <g data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref}>
      <circle cx={node.x} cy={node.y} r={3.5} fill={FILL_TERMINAL} stroke={STROKE_BOUNDARY} strokeWidth={1} />
    </g>
  );
}

function ChipNode({ node }: { readonly node: LvDomainSceneNode }): JSX.Element {
  const isBoundary = node.kind === 'boundaryChip';
  const fill = isBoundary ? '#2A2116' : '#101820';
  const stroke = isBoundary ? STROKE_BOUNDARY : STROKE_MUTED;
  const textColor = isBoundary ? STROKE_BOUNDARY : STROKE_BASE;
  const chipWidth = Math.max(64, node.label.length * 6.2);
  const chipHeight = 22;
  return (
    <g
      data-testid={`lv-domain-node-${node.ref}`}
      data-node-kind={node.kind}
      data-owner-ref={node.ref}
      role={isBoundary ? 'button' : undefined}
      aria-label={isBoundary ? `Otwórz domenę ${node.label.replace('→ ', '')}` : undefined}
    >
      <rect
        x={node.x - chipWidth / 2}
        y={node.y - chipHeight / 2}
        width={chipWidth}
        height={chipHeight}
        rx={4}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
      <text x={node.x} y={node.y + 4} textAnchor="middle" fontSize={10} fill={textColor} fontFamily="monospace">
        {node.label}
      </text>
    </g>
  );
}

function SceneEdgeLine({ edge }: { readonly edge: LvDomainSceneEdge }): JSX.Element {
  const isCable = edge.kind === 'cable';
  const stroke =
    edge.kind === 'boundaryLink' ? STROKE_BOUNDARY : isCable ? STROKE_CABLE : edge.status === 'open' ? STROKE_OPEN : STROKE_BASE;
  const dash = edge.kind === 'boundaryLink' || edge.status === 'open' ? '4 3' : isCable ? '1 2' : undefined;
  return (
    <line
      data-testid={`lv-domain-edge-${edge.ref}`}
      data-edge-kind={edge.kind}
      data-gap={edge.meta?.gapPl ? 'true' : undefined}
      x1={edge.x1}
      y1={edge.y1}
      x2={edge.x2}
      y2={edge.y2}
      stroke={stroke}
      strokeWidth={edge.kind === 'branch' ? 1.6 : isCable ? 1.4 : 1}
      strokeDasharray={dash}
      strokeLinecap={isCable ? 'round' : undefined}
    >
      {edge.meta?.gapPl ? <title>{String(edge.meta.gapPl)}</title> : null}
      {edge.meta?.apparatusGapPl ? <title>{String(edge.meta.apparatusGapPl)}</title> : null}
    </line>
  );
}

/**
 * P0.10/P0.11/hard-check#4: plakietka SWZ NA TORZE (nie sam zielony
 * przycisk) — displayedValue == DOKŁADNIE `swzByFeederRef[node.ref]` podany
 * przez wołającego (`SwzOverlayEntry`, zero przeliczeń). Format: `Ik₁min` +
 * `t wymagany` (IEC 60364-4-41), oraz `Ia wymagane` przy FAIL. Karta cytuje
 * wzorzec `SWZ ✓ 0.12/0.40 s` (czas ZADZIAŁANIA aparatu / czas dopuszczalny)
 * — TEN konkretny czas zadziałania (`ta`, z krzywej zabezpieczenia przy
 * Ik1min) NIE jest polem `SwzApiResponse`/`SwzOverlayEntry` (koperta niesie
 * WYŁĄCZNIE `ik1_min_a`/`ia_wymagane_a`/`t_wymagany_s`/`margines` — bez
 * odczytu z krzywej TCC aparatu). Luka nazwana w raporcie karty T5b-2
 * (P0.10/P0.11) — plakietka pokazuje to, co koperta NIESIE, bez fabrykacji
 * `ta`.
 */
function SwzBadge({ node, entry }: { readonly node: LvDomainSceneNode; readonly entry: SwzOverlayEntry | undefined }): JSX.Element | null {
  if (!entry) return null;
  const tone = entry.status === 'spełnia' ? TONE_OK : entry.status === 'nie spełnia' ? TONE_FAIL : TONE_UNKNOWN;
  const symbol = entry.status === 'spełnia' ? '✓' : entry.status === 'nie spełnia' ? '✗' : '?';
  const tSuffix = entry.tWymaganyS != null ? `/${entry.tWymaganyS.toFixed(2)} s` : '';
  const text =
    entry.status === 'nie spełnia' && entry.iaWymaganeA != null
      ? `SWZ ${symbol} Ik₁min=${entry.ik1MinA.toFixed(0)} A · Ia wym.=${entry.iaWymaganeA.toFixed(0)} A`
      : `SWZ ${symbol} ${entry.ik1MinA.toFixed(0)} A${tSuffix}`;
  return (
    <g data-testid={`lv-domain-badge-swz-${node.ref}`} data-swz-status={entry.status}>
      <text x={node.x} y={node.y + 26} textAnchor="middle" fontSize={FONT_BADGE_PX} fill={tone} fontFamily="monospace">
        {text}
      </text>
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

  // P0.12 — gabaryt DOMYŚLNY = dokładnie treść (props.width/height nadpisują
  // TYLKO wyświetlanie, viewBox zawsze = gabaryt treści, zero pustej kanwy).
  const displayWidth = width ?? scene.width;
  const displayHeight = height ?? scene.height;

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
          <div style={{ fontSize: FONT_HEADER_PX, fontWeight: 600 }}>{view.station_name ?? view.station_ref} · nN</div>
          {/* P0.14: nagłówek OPISUJE DOMENĘ (napięcie/liczba TR/sekcji/DER/
              boundary) — parametry tabliczki TR (Sn/uk/grupa) PRZENIESIONE na
              węzeł transformatora w scenie, nagłówek ich NIE powtarza. */}
          <div data-testid="lv-domain-descriptor" style={{ fontSize: 11, color: STROKE_MUTED }}>
            {domainDescriptor}
          </div>
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
      </header>
      <div data-testid="lv-domain-overlay-status" style={{ padding: '0 16px 8px', fontSize: 11, color: STROKE_MUTED }}>
        {overlayStatusLabel(activeOverlay, hasAnyOverlayData)}
      </div>
      <svg
        data-testid="lv-domain-svg"
        width={displayWidth}
        height={displayHeight}
        viewBox={`0 0 ${scene.width} ${scene.height}`}
      >
        <rect x={0} y={0} width={scene.width} height={scene.height} fill={CANVAS_BACKGROUND} />
        <g data-testid="lv-domain-edges">
          {scene.edges.map((edge) => (
            <SceneEdgeLine key={edge.ref} edge={edge} />
          ))}
        </g>
        <g data-testid="lv-domain-nodes">
          {scene.nodes.map((node) => {
            if (node.kind === 'anchorChip' || node.kind === 'boundaryChip') return <ChipNode key={node.ref} node={node} />;
            if (node.kind === 'bus') {
              return (
                <BusBarNode
                  key={node.ref}
                  node={node}
                  activeOverlay={activeOverlay}
                  resultOverlayPayload={resultOverlayPayload}
                  voltageProfileByBusRef={voltageProfileByBusRef}
                />
              );
            }
            if (node.kind === 'boundaryTerminal') return <BoundaryTerminalNode key={node.ref} node={node} />;
            return (
              <g key={node.ref} data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref}>
                <SceneNodeGlyph node={node} />
                <text
                  x={node.x}
                  y={node.y + symbolBBox(node.symbolId).height / 2 + 12}
                  textAnchor="middle"
                  fontSize={FONT_LABEL_PX}
                  fill={STROKE_MUTED}
                >
                  {node.label}
                </text>
                {node.kind === 'apparatus' && activeOverlay === 'swz' ? (
                  <SwzBadge node={node} entry={swzByFeederRef[node.ref]} />
                ) : null}
                {node.kind === 'apparatus' && (activeOverlay === 'loads' || activeOverlay === 'shortCircuit') ? (
                  <ResultBadge node={node} overlay={activeOverlay} payload={resultOverlayPayload} />
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/** P0.17: displayedValue == solverResult(elementRef, runId) — odczyt WPROST
 *  z `RawOverlayPayload.elements[ref].metrics`, zero przeliczeń. */
function ResultBadge({
  node,
  overlay,
  payload,
}: {
  readonly node: LvDomainSceneNode;
  readonly overlay: 'loads' | 'shortCircuit';
  readonly payload: RawOverlayPayload | null;
}): JSX.Element | null {
  if (!payload) return null;
  const metricCode = overlay === 'shortCircuit' ? 'IK_3F_A' : 'I_A';
  const metric = getMetric(payload, node.ref, metricCode);
  if (!metric || metric.value == null) return null;
  return (
    <g data-testid={`lv-domain-badge-${overlay}-${node.ref}`} data-run-id={payload.run_id}>
      <text x={node.x} y={node.y + 26} textAnchor="middle" fontSize={FONT_BADGE_PX} fill={STROKE_BASE} fontFamily="monospace">
        {formatMetric(metric)}
      </text>
    </g>
  );
}

function VoltageDropBadge({
  node,
  row,
}: {
  readonly node: LvDomainSceneNode;
  readonly row: LvDomainVoltageProfileRow | undefined;
}): JSX.Element | null {
  if (!row || row.delta_pct == null) return null;
  return (
    <g data-testid={`lv-domain-badge-voltageDrop-${node.ref}`}>
      <text x={node.x} y={node.y - 16} textAnchor="middle" fontSize={FONT_BADGE_PX} fill={STROKE_BASE} fontFamily="monospace">
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
