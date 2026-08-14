/**
 * `LvDomainView(rootStationId, scenarioId)` — kanwa L2 (karta T5b, §0
 * rozstrzygnięcie 3, `docs/nn/KONCEPCJA_LOD_NN_2026-08.md` werdykt
 * właściciela). NOWA, WŁASNA kanwa (nie `SldCanvasV3`) — pełna topologia nN
 * jednej stacji jako spójna, generyczna projekcja grafu domeny
 * (`composeLvDomainScene`); świat SN chowa się za chipem(-ami) kotwicy.
 *
 * Bez wpięcia nawigacji (T5c — kamera/pan/zoom/breadcrumb powrotu to
 * ODRĘBNY stan, karta §0 pkt 3 "MECHANIZMY ROZDZIELONE"): ten komponent jest
 * CZYSTYM renderem danych podanych przez wołającego (props), zero
 * fetch/routing/kamery — sterowany deterministycznym harnessem zrzutowym
 * (`lv-domain-harness-main.tsx`) dla dowodu wizualnego.
 *
 * WYNIKI = przełączalne OVERLAYE (werdykt: "nie 10 liczb naraz; domyślny SLD
 * czysty"). ZERO PHANTOM: przełącznik istnieje WYŁĄCZNIE dla
 * `LvDomainOverlayId` (kanały z realnym dostawcą — reuse `nnCircuitResults.ts`/
 * `/enm/swz`/voltage-profile, patrz `types.ts`); Termika/Selektywność NIE są
 * tu wymienione (żaden istniejący kanał ich per-odpływ nie dostarcza).
 */
import { useMemo, useState, type CSSProperties } from 'react';

import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import { SYMBOL_GLYPHS } from '../symbols/glyphs';
import { composeLvDomainScene, type LvDomainScene, type LvDomainSceneNode } from './composeLvDomainScene';
import type { LvDomainGraphView, LvDomainOverlayId, UpstreamEquivalentSnapshot } from './types';

const CANVAS_BACKGROUND = '#0B0F14';
const STROKE_BASE = '#E8EEF4';
const STROKE_MUTED = '#5B6B7A';
const STROKE_BOUNDARY = '#E8A33D';
const STROKE_OPEN = '#8A98A6';

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

export interface LvDomainViewProps {
  readonly rootStationId: string;
  readonly scenarioId: string;
  readonly view: LvDomainGraphView;
  readonly upstreamEquivalents?: readonly UpstreamEquivalentSnapshot[];
  readonly width?: number;
  readonly height?: number;
  /** Overlay aktywny na start — `null` = SLD czysty (domyślne, werdykt). */
  readonly initialOverlay?: LvDomainOverlayId | null;
}

function symbolBBox(symbolId: SymbolId | undefined): { readonly width: number; readonly height: number } {
  if (!symbolId) return { width: 0, height: 0 };
  const def = SYMBOL_DEFS[symbolId];
  return { width: def.width, height: def.height };
}

function SceneNodeGlyph({ node }: { readonly node: LvDomainSceneNode }): JSX.Element | null {
  if (!node.symbolId) return null;
  const Glyph = SYMBOL_GLYPHS[node.symbolId];
  const bbox = symbolBBox(node.symbolId);
  const originX = node.x - bbox.width / 2;
  const originY = node.y - bbox.height / 2;
  const stroke = node.meta?.status === 'open' ? STROKE_OPEN : STROKE_BASE;
  return (
    <g data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref}>
      <Glyph x={originX} y={originY} stroke={stroke} />
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
    <g data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref}>
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

function SceneEdgeLine({ edge }: { readonly edge: LvDomainScene['edges'][number] }): JSX.Element {
  const stroke =
    edge.kind === 'boundaryLink' ? STROKE_BOUNDARY : edge.status === 'open' ? STROKE_OPEN : STROKE_BASE;
  const dash = edge.kind === 'boundaryLink' || edge.status === 'open' ? '4 3' : undefined;
  return (
    <line
      data-testid={`lv-domain-edge-${edge.ref}`}
      data-edge-kind={edge.kind}
      x1={edge.x1}
      y1={edge.y1}
      x2={edge.x2}
      y2={edge.y2}
      stroke={stroke}
      strokeWidth={edge.kind === 'branch' ? 1.6 : 1}
      strokeDasharray={dash}
    />
  );
}

/** Nazwa dostawcy overlay w meta — WYŁĄCZNIE informacyjna (T5b nie wpina
 *  jeszcze realnych danych wynikowych do sceny, zgodnie z "Bez wpięcia
 *  nawigacji" — kanał danych przychodzi z T5c). Etykieta nad kanwą pokazuje
 *  KTÓRY overlay jest aktywny; treść liczbowa dojdzie razem z wpięciem. */
function overlayStatusLabel(overlay: LvDomainOverlayId | null): string {
  if (overlay === null) return 'SLD czysty (bez nakładki)';
  return `Nakładka: ${OVERLAY_LABELS_PL[overlay]}`;
}

export function LvDomainView(props: LvDomainViewProps): JSX.Element {
  const { rootStationId, scenarioId, view, upstreamEquivalents = [], width = 960, height = 640, initialOverlay = null } = props;
  const [activeOverlay, setActiveOverlay] = useState<LvDomainOverlayId | null>(initialOverlay);

  const scene = useMemo(() => composeLvDomainScene(view, upstreamEquivalents), [view, upstreamEquivalents]);

  const nameplateTransformer = view.transformers[0];

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
          <div style={{ fontSize: 14, fontWeight: 600 }}>{view.station_name ?? view.station_ref} · nN</div>
          {nameplateTransformer && (
            <div data-testid="lv-domain-tr-nameplate" style={{ fontSize: 11, color: STROKE_MUTED }}>
              {nameplateTransformer.sn_mva} MVA · {nameplateTransformer.uhv_kv}/{nameplateTransformer.ulv_kv} kV ·{' '}
              {nameplateTransformer.vector_group ?? '—'} · uk={nameplateTransformer.uk_percent}%
            </div>
          )}
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
        {overlayStatusLabel(activeOverlay)}
      </div>
      <svg
        data-testid="lv-domain-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${Math.max(scene.width, width)} ${Math.max(scene.height, height)}`}
      >
        <rect x={0} y={0} width={Math.max(scene.width, width)} height={Math.max(scene.height, height)} fill={CANVAS_BACKGROUND} />
        <g data-testid="lv-domain-edges">
          {scene.edges.map((edge) => (
            <SceneEdgeLine key={edge.ref} edge={edge} />
          ))}
        </g>
        <g data-testid="lv-domain-nodes">
          {scene.nodes.map((node) =>
            node.kind === 'anchorChip' || node.kind === 'boundaryChip' ? (
              <ChipNode key={node.ref} node={node} />
            ) : (
              <g key={node.ref}>
                <SceneNodeGlyph node={node} />
                <text
                  x={node.x}
                  y={node.y + symbolBBox(node.symbolId).height / 2 + 12}
                  textAnchor="middle"
                  fontSize={9}
                  fill={STROKE_MUTED}
                >
                  {node.label}
                </text>
              </g>
            ),
          )}
        </g>
      </svg>
    </div>
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
