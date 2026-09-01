/**
 * `LvDomainView` — kanwa projekcji domeny nN (karta T5b-2 → T5b-3 → T5b-4 →
 * LOD nN, `docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md`). WŁASNA kanwa (nie
 * `SldCanvasV3`) — TORY ELEKTRYCZNE jednej stacji jako projekcja grafu
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
 * POZIOM SZCZEGÓŁOWOŚCI (LOD) — dyrektywa właściciela „każda projekcja ma
 * własny LOD 0/1/2 na JEDNEJ geometrii". Prop `lod` (domyślnie 2, pełny)
 * jest analogonem `lodOverride` kanwy SN: scena liczy się RAZ
 * (`composeLvDomainScene` nie zna LOD), a poziom decyduje WYŁĄCZNIE o tym,
 * KTÓRE elementy tej samej sceny są rysowane. Decyzja „co widać na którym
 * poziomie" NIE ŻYJE w tym pliku — jest w `visualGrammar.ts`
 * (`REJESTR_ELEMENTOW_KANWY`), a tutaj jest DOKŁADNIE JEDNO wyprowadzenie
 * filtra (`widoczne`) przekazywane przez kontekst rysunku. Punktowe
 * porównania `lod` w komponentach są zakazane (pin:
 * `__tests__/lodProjekcjaNn.test.tsx` — skan źródła + porównanie prymitywów
 * toru między poziomami).
 *
 * MOTYW — paleta rysunku idzie z motywu (`paletaNnDlaMotywu`), tak samo jak
 * na kanwie SN. Do tej karty kanwa nN miała paletę wypaloną na ciemno, a
 * harness ustawiał `data-theme` bez pokrycia w rysunku (deklaracja motywu
 * bez pokrycia — ten sam dług, który kanwa SN zamknęła wcześniej).
 *
 * Bez wpięcia nawigacji (T5c) — CZYSTY render propsów, zero fetch/routing/
 * kamery. WYNIKI = przełączalne OVERLAYE z realnych kanałów kontraktu
 * projekcji (`swz_snapshot`/`result_snapshot`) — zero fizyki tutaj.
 */
import { useMemo, useState, type CSSProperties } from 'react';

import { buildSwzOverlayFromResponses, type SwzOverlayEntry } from '../canvas/overlay';
import type { RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
import { getMetric, formatMetric } from '../../../sld-overlay/rawResultOverlayStore';
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import { SYMBOL_GLYPHS } from '../symbols/glyphs';
import type { SwitchState } from '../symbols/glyphs';
import type { ThemeMode } from '../../../../ui2/theme/themeMode';
import {
  composeLvDomainScene,
  domainDescriptorLabel,
  plFixed,
  type LvDomainSceneEdge,
  type LvDomainSceneEdgeKind,
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
  licznikOdplywowLabel,
  paletaNnDlaMotywu,
  plNumber,
  snKvaLabel,
  tonWerdyktuSeverity,
  widocznyNaLod,
  type ElementKanwyNn,
  type PaletaNn,
  type PoziomLod,
  type SceneFit,
} from './visualGrammar';
import type {
  LvDomainOverlayId,
  LvDomainProjectionV1,
  LvDomainSwzFeederV1,
  LvDomainVoltageProfileRow,
} from './types';

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

/**
 * Kontekst rysunku przekazywany do KAŻDEGO komponentu kanwy: przelicznik
 * px ekranu → świata, fit, paleta motywu i JEDYNE wyprowadzenie filtra
 * poziomu szczegółowości. Komponenty nie znają wartości `lod` — znają
 * wyłącznie odpowiedź „czy ten element rysujemy".
 */
interface KontekstRysunku {
  readonly sp: (screenPx: number) => number;
  readonly fit: SceneFit;
  readonly paleta: PaletaNn;
  readonly widoczne: (kind: ElementKanwyNn) => boolean;
}

export interface LvDomainViewProps {
  /** Jedyny kontrakt danych kanwy. Graf, wynik i SWZ pochodzą z tego samego
   *  snapshotu modelu — komponent nie przyjmuje niezależnych fragmentów. */
  readonly projection: LvDomainProjectionV1;
  /** Gabaryt VIEWPORTU [px] (P0-V1) — kanwa wypełnia go w całości, a TREŚĆ
   *  jest fitowana do pasma occupancy i centrowana (`visualGrammar.ts`).
   *  Brak = `DEFAULT_VIEWPORT` (testy jsdom). */
  readonly width?: number;
  readonly height?: number;
  /** Overlay aktywny na start — `null` = SLD czysty (domyślne, werdykt). */
  readonly initialOverlay?: LvDomainOverlayId | null;
  /** Poziom szczegółowości projekcji nN: 0 przegląd, 1 sieć, 2 pełny
   *  (domyślny). Geometria jest ta sama na każdym poziomie. */
  readonly lod?: PoziomLod;
  /** Tryb motywu rysunku — paleta idzie z motywu powłoki (domyślnie
   *  dyspozytorski ciemny, tak jak kanwa SN). */
  readonly theme?: ThemeMode;
}

/** Halo etykiety (maska CAD, T5b-4): pismo podbite tłem kanwy przez
 *  `paint-order: stroke` — kreska toru NIGDY nie przechodzi PRZEZ tekst
 *  (klasa kolizji linia×tekst zmierzona na zrzutach: nazwa magistrali ×
 *  tor incomera, etykieta podszyny × kabel odpływu). Jedna maska dla
 *  WSZYSTKICH etykiet kanwy — reguła KLASA, nie punktowe odsuwanie. */
function textHalo(ctx: KontekstRysunku): {
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly paintOrder: 'stroke';
  readonly strokeLinejoin: 'round';
} {
  return {
    stroke: ctx.paleta.tlo,
    strokeWidth: ctx.sp(5),
    paintOrder: 'stroke',
    strokeLinejoin: 'round',
  };
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

/** Element rejestru dla SYMBOLU węzła (warstwa TOR — nigdy nie znika). */
function elementSymbolu(node: LvDomainSceneNode): ElementKanwyNn {
  switch (node.kind) {
    case 'transformer':
      return 'symbolTransformatora';
    case 'generator':
      return 'symbolZrodlaDer';
    case 'load':
      return 'symbolOdbioru';
    case 'boundaryTerminal':
      return 'zaciskGranicy';
    case 'busJunction':
      return 'zaciskToru';
    case 'bus':
      return 'szynaSekcji';
    default:
      return 'symbolAparatu';
  }
}

/** Element rejestru dla NAZWY węzła (warstwa TOZSAMOSC). */
function elementNazwy(node: LvDomainSceneNode): ElementKanwyNn {
  switch (node.kind) {
    case 'transformer':
      return 'nazwaTransformatora';
    case 'generator':
      return 'nazwaZrodlaDer';
    case 'load':
      return 'nazwaOdbioru';
    case 'boundaryChip':
      return 'nazwaGranicy';
    case 'anchorChip':
      return 'nazwaKotwicyZrodla';
    case 'bus':
      return 'nazwaSekcji';
    default:
      return 'nazwaAparatu';
  }
}

/** Element rejestru dla KRAWĘDZI sceny (warstwa TOR w całości). */
function elementKrawedzi(kind: LvDomainSceneEdgeKind): ElementKanwyNn {
  switch (kind) {
    case 'sourceDrop':
      return 'torZrodla';
    case 'coupler':
      return 'torSprzegla';
    case 'cable':
      return 'kabelOdplywu';
    case 'boundaryLink':
      return 'linkGranicy';
    default:
      return 'torOdplywu';
  }
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

function ScaledGlyph({ node, ctx }: { readonly node: LvDomainSceneNode; readonly ctx: KontekstRysunku }): JSX.Element | null {
  if (!node.symbolId) return null;
  if (!ctx.widoczne(elementSymbolu(node))) return null;
  const Glyph = SYMBOL_GLYPHS[node.symbolId];
  const bbox = symbolBBox(node.symbolId);
  const { k } = glyphScreenSize(node, ctx.fit);
  const originX = node.x - bbox.width / 2;
  const originY = node.y - bbox.height / 2;
  const isCoupler = node.meta?.role === 'coupler';
  const open = node.meta?.status === 'open';
  // P0-V6/werdykt pkt 14: STAN niesie SYMBOL — sprzęgło otwarte w tonie
  // ostrzegawczym (sekcjonowanie!), inne aparaty otwarte wygaszone.
  const stroke = open
    ? isCoupler
      ? ctx.paleta.tonOstrzegawczy
      : ctx.paleta.kreskaOtwarta
    : ctx.paleta.kreskaBazowa;
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
    projection,
    width,
    height,
    initialOverlay = null,
    lod = 2,
    theme = 'dark_scada',
  } = props;
  const rootStationId = projection.station_ref;
  const scenarioId = projection.scenario_id;
  const view = projection.graph;
  const upstreamEquivalents = projection.upstream_equivalents;
  const [activeOverlay, setActiveOverlay] = useState<LvDomainOverlayId | null>(initialOverlay);
  const [labelMode, setLabelMode] = useState<LabelMode>('engineering');
  const [selectedFeederRef, setSelectedFeederRef] = useState<string | null>(null);

  const paleta = useMemo(() => paletaNnDlaMotywu(theme), [theme]);
  const scene = useMemo(() => composeLvDomainScene(view, upstreamEquivalents), [view, upstreamEquivalents]);
  const domainDescriptor = useMemo(() => domainDescriptorLabel(view), [view]);
  // Kontrakt 2.0.0: odpływy ROZBITE PER TRANSFORMATOR (`swz_snapshot.
  // transformers[]`) — każdy liczony od transformatora WŁASNEJ sekcji;
  // do plakietek i panelu odpływu wchodzą wszystkie, z tożsamością
  // transformatora, od którego je policzono.
  const swzFeeders = useMemo(
    () =>
      projection.swz_snapshot.transformers.flatMap((transformer) =>
        transformer.feeders.map((feeder) => ({ transformerRef: transformer.transformer_ref, feeder })),
      ),
    [projection.swz_snapshot.transformers],
  );
  const swzByFeederRef = useMemo(
    () => buildSwzOverlayFromResponses(swzFeeders.map(({ feeder }) => feeder.swz)),
    [swzFeeders],
  );
  const resultOverlayPayload = useMemo<RawOverlayPayload | null>(() => {
    const result = projection.result_snapshot;
    if (!result.run_id || !result.analysis_type || !result.overlay_payload) return null;
    return {
      run_id: result.run_id,
      analysis_type: result.analysis_type,
      run_finished_at: result.run_finished_at,
      elements: result.overlay_payload.elements,
    };
  }, [projection.result_snapshot]);
  const voltageProfileByBusRef = useMemo<Readonly<Record<string, LvDomainVoltageProfileRow>>>(() => {
    const rows = projection.result_snapshot.voltage_profile?.rows ?? [];
    return Object.fromEntries(rows.map((row) => [row.bus_id, row]));
  }, [projection.result_snapshot.voltage_profile]);
  const feederByRef = useMemo(
    () => new Map(swzFeeders.map((entry) => [entry.feeder.feeder_root_branch_ref, entry] as const)),
    [swzFeeders],
  );
  const selectedFeeder = selectedFeederRef ? feederByRef.get(selectedFeederRef) ?? null : null;

  if (view.status !== 'OK') {
    return (
      <div
        data-testid="lv-domain-view-root"
        data-status="brak-danych"
        style={{ background: paleta.tlo, color: paleta.kreskaBazowa, padding: 24, fontFamily: 'monospace' }}
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
  // JEDYNE wyprowadzenie filtra poziomu w całym rendererze (patrz nagłówek).
  const ctx: KontekstRysunku = {
    fit,
    paleta,
    /** px EKRANU → px świata (wewnątrz grupy transformowanej fitem). */
    sp: (screenPx: number): number => screenPx / fit.s,
    widoczne: (kind: ElementKanwyNn): boolean => widocznyNaLod(kind, lod),
  };

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
      data-projection-hash={projection.projection_hash}
      data-model-hash={projection.model_snapshot.model_hash}
      data-lod={lod}
      data-theme-mode={theme}
      style={{ background: paleta.tlo, color: paleta.kreskaBazowa, fontFamily: 'sans-serif', position: 'relative' }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{view.station_name ?? view.station_ref} · nN</div>
          {/* P0.14: nagłówek OPISUJE DOMENĘ (napięcie/liczba TR/sekcji/DER/
              boundary) — parametry tabliczki TR (Sn/uk/grupa) żyją na węźle
              transformatora w scenie, nagłówek ich NIE powtarza. */}
          <div data-testid="lv-domain-descriptor" style={{ fontSize: 11, color: paleta.kreskaWygaszona }}>
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
              style={overlayButtonStyle(labelMode === 'engineering', paleta)}
            >
              Etykiety: projektowe
            </button>
            <button
              type="button"
              data-testid="lv-domain-labelmode-audit"
              aria-pressed={labelMode === 'audit'}
              onClick={() => setLabelMode('audit')}
              style={overlayButtonStyle(labelMode === 'audit', paleta)}
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
              style={overlayButtonStyle(activeOverlay === null, paleta)}
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
                style={overlayButtonStyle(activeOverlay === overlayId, paleta)}
              >
                {OVERLAY_LABELS_PL[overlayId]}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div data-testid="lv-domain-overlay-status" style={{ padding: '0 16px 8px', fontSize: 11, color: paleta.kreskaWygaszona }}>
        {overlayStatusLabel(activeOverlay, hasAnyOverlayData)}
      </div>
      {/* Status wyniku (brak/nieaktualny/aktualny) = TOŻSAMOŚĆ wyniku, nie
          jego opis — jawny na KAŻDYM poziomie szczegółowości (rejestr:
          `znacznikSwiezosciWyniku`). */}
      {ctx.widoczne('znacznikSwiezosciWyniku') ? (
        <div
          data-testid="lv-domain-result-freshness"
          data-result-status={projection.result_snapshot.status}
          style={{
            padding: '0 16px 8px',
            fontSize: 11,
            color: projection.result_snapshot.status === 'OUTDATED' ? paleta.tonOstrzegawczy : paleta.kreskaWygaszona,
          }}
        >
          {`ENM r${projection.model_snapshot.revision} · wynik ${projection.result_snapshot.status}`}
          {projection.result_snapshot.status === 'OUTDATED'
            ? ` · ${projection.result_snapshot.reason_pl}`
            : ''}
        </div>
      ) : null}
      <svg
        data-testid="lv-domain-svg"
        data-fit-scale={fit.s}
        width={viewportWidth}
        height={canvasHeight}
        viewBox={`0 0 ${viewportWidth} ${canvasHeight}`}
      >
        <rect x={0} y={0} width={viewportWidth} height={canvasHeight} fill={paleta.tlo} />
        <g data-testid="lv-domain-world" transform={`translate(${fit.tx} ${fit.ty}) scale(${fit.s})`}>
          <g data-testid="lv-domain-edges">
            {scene.edges.map((edge) => (
              <SceneEdgeLine key={edge.ref} edge={edge} scene={scene} ctx={ctx} />
            ))}
          </g>
          <g data-testid="lv-domain-nodes">
            {scene.nodes.map((node) => {
              if (node.kind === 'anchorChip') return <AnchorChipNode key={node.ref} node={node} ctx={ctx} />;
              if (node.kind === 'boundaryChip') return <BoundaryRefNode key={node.ref} node={node} ctx={ctx} />;
              if (node.kind === 'bus') {
                return (
                  <BusBarNode
                    key={node.ref}
                    node={node}
                    ctx={ctx}
                    activeOverlay={activeOverlay}
                    resultOverlayPayload={resultOverlayPayload}
                    voltageProfileByBusRef={voltageProfileByBusRef}
                  />
                );
              }
              if (node.kind === 'boundaryTerminal') {
                return (
                  <g key={node.ref} data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref}>
                    {ctx.widoczne('zaciskGranicy') ? (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={ctx.sp(JUNCTION_RADIUS_SCREEN_PX + 1)}
                        fill={ctx.paleta.wypelnienieZacisku}
                        stroke={ctx.paleta.kreskaGranicy}
                        strokeWidth={ctx.sp(1.2)}
                      />
                    ) : null}
                  </g>
                );
              }
              if (node.kind === 'busJunction') {
                return (
                  <g key={node.ref} data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref}>
                    {/* P0-V7: kropka zacisku ZAWSZE; nazwa portu modelu
                        WYŁĄCZNIE w trybie AUDYT i na poziomie pełnym — na
                        kanwie projektowej hover (title) niesie pełną nazwę. */}
                    <title>{node.label}</title>
                    {ctx.widoczne('zaciskToru') ? (
                      <circle cx={node.x} cy={node.y} r={ctx.sp(JUNCTION_RADIUS_SCREEN_PX)} fill={ctx.paleta.wypelnienieZacisku} />
                    ) : null}
                    {labelMode === 'audit' && ctx.widoczne('nazwaZaciskuModelu') ? (
                      <text
                        {...textHalo(ctx)}
                        x={node.x + ctx.sp(7)}
                        y={node.y + ctx.sp(3.5)}
                        textAnchor="start"
                        fontSize={ctx.sp(TYPE_SCREEN_PX.tertiary)}
                        fill={ctx.paleta.kreskaWygaszona}
                      >
                        {node.label}
                      </text>
                    ) : null}
                  </g>
                );
              }
              const isFeeder = node.kind === 'apparatus' && feederByRef.has(node.ref);
              const selectFeeder = (): void => {
                if (isFeeder) setSelectedFeederRef(node.ref);
              };
              return (
                <g
                  key={node.ref}
                  data-testid={`lv-domain-node-${node.ref}`}
                  data-node-kind={node.kind}
                  data-owner-ref={node.ref}
                  data-feeder-selected={selectedFeederRef === node.ref ? 'true' : undefined}
                  role={isFeeder ? 'button' : undefined}
                  tabIndex={isFeeder ? 0 : undefined}
                  onClick={selectFeeder}
                  onKeyDown={isFeeder ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') selectFeeder();
                  } : undefined}
                  style={{ cursor: isFeeder ? 'pointer' : undefined }}
                >
                  <ScaledGlyph node={node} ctx={ctx} />
                  <NodeLabel node={node} ctx={ctx} />
                  {node.kind === 'apparatus' && activeOverlay === 'swz' ? (
                    <SwzBadge node={node} ctx={ctx} entry={swzByFeederRef[node.ref]} />
                  ) : null}
                  {node.kind === 'apparatus' && (activeOverlay === 'loads' || activeOverlay === 'shortCircuit') ? (
                    <ResultBadge node={node} ctx={ctx} withGlyphOffset overlay={activeOverlay} payload={resultOverlayPayload} />
                  ) : null}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      {selectedFeeder ? (
        <LvFeederPanel
          feeder={selectedFeeder.feeder}
          transformerRef={selectedFeeder.transformerRef}
          projection={projection}
          paleta={paleta}
          resultOverlayPayload={resultOverlayPayload}
          onClose={() => setSelectedFeederRef(null)}
        />
      ) : null}
    </div>
  );
}

function LvFeederPanel({
  feeder,
  transformerRef,
  projection,
  paleta,
  resultOverlayPayload,
  onClose,
}: {
  readonly feeder: LvDomainSwzFeederV1;
  /** Transformator, od którego backend policzył pętlę i SWZ tego odpływu
   *  (kontrakt 2.0.0 — per transformator, nie „pierwszy transformator stacji"). */
  readonly transformerRef: string;
  readonly projection: LvDomainProjectionV1;
  readonly paleta: PaletaNn;
  readonly resultOverlayPayload: RawOverlayPayload | null;
  readonly onClose: () => void;
}): JSX.Element {
  const resultElement = resultOverlayPayload?.elements[feeder.feeder_root_branch_ref];
  const metrics = Object.values(resultElement?.metrics ?? {});
  const swz = feeder.swz.swz;
  const statusTone = swz?.status === 'spełnia'
    ? paleta.tonOk
    : swz?.status === 'nie spełnia'
      ? paleta.tonBledu
      : paleta.tonOstrzegawczy;
  const shortHash = (value: string): string => value.length > 14 ? `${value.slice(0, 14)}…` : value;

  return (
    <aside
      data-testid="lv-domain-feeder-panel"
      data-feeder-ref={feeder.feeder_root_branch_ref}
      style={{
        position: 'absolute',
        top: 100,
        right: 16,
        bottom: 16,
        width: 350,
        maxWidth: 'calc(100% - 32px)',
        overflow: 'auto',
        padding: 16,
        border: `1px solid ${paleta.kreskaWygaszona}`,
        borderRadius: 6,
        background: paleta.panelTlo,
        boxShadow: paleta.panelCien,
        zIndex: 4,
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ color: paleta.kreskaBazowa, fontWeight: 700 }}>Odpływ nN</div>
          <div style={{ color: paleta.kreskaWygaszona, fontFamily: 'monospace' }}>
            {feeder.feeder_root_branch_ref}
          </div>
        </div>
        <button type="button" onClick={onClose} style={overlayButtonStyle(false, paleta)}>
          Zamknij
        </button>
      </div>

      <section style={{ marginTop: 16 }}>
        <div style={{ color: paleta.kreskaBazowa, fontWeight: 600 }}>Stan modelu ENM</div>
        <div style={{ color: paleta.kreskaWygaszona, marginTop: 4 }}>
          {`rewizja ${projection.model_snapshot.revision} · ${projection.scenario_id}`}
        </div>
        <div title={projection.model_snapshot.model_hash} style={{ color: paleta.kreskaWygaszona, fontFamily: 'monospace' }}>
          {`model ${shortHash(projection.model_snapshot.model_hash)}`}
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <div style={{ color: paleta.kreskaBazowa, fontWeight: 600 }}>Wynik biegu</div>
        <div style={{ color: projection.result_snapshot.status === 'OUTDATED' ? paleta.tonOstrzegawczy : paleta.kreskaWygaszona, marginTop: 4 }}>
          {projection.result_snapshot.status === 'NONE'
            ? 'Brak wyniku'
            : `${projection.result_snapshot.status} · ${projection.result_snapshot.analysis_type ?? 'analiza'}`}
        </div>
        {metrics.length > 0 ? metrics.map((metric) => (
          <div key={metric.code} style={{ color: paleta.kreskaBazowa, fontFamily: 'monospace', marginTop: 3 }}>
            {`${metric.code}: ${formatMetric(metric)}`}
          </div>
        )) : (
          <div style={{ color: paleta.kreskaWygaszona, marginTop: 3 }}>Brak metryk tego odpływu w aktywnym biegu.</div>
        )}
      </section>

      <section style={{ marginTop: 16 }}>
        <div style={{ color: paleta.kreskaBazowa, fontWeight: 600 }}>Pętla zwarcia i SWZ</div>
        <div
          data-testid="lv-domain-feeder-transformer"
          data-transformer-ref={transformerRef}
          style={{ color: paleta.kreskaWygaszona, marginTop: 4 }}
        >
          {`liczone od transformatora: ${transformerRef} · zasilanie: ${feeder.supply ?? 'brak danych'}`}
        </div>
        {feeder.supply_assumption_pl ? (
          <div data-testid="lv-domain-feeder-supply-assumption" style={{ color: paleta.tonOstrzegawczy, marginTop: 4 }}>
            {feeder.supply_assumption_pl}
          </div>
        ) : null}
        <div style={{ color: paleta.kreskaWygaszona, marginTop: 4 }}>
          {`punkt najgorszy: ${feeder.worst_point_bus_ref ?? 'brak'} · punkty: ${feeder.points.length}`}
        </div>
        {swz ? (
          <>
            <div style={{ color: statusTone, fontWeight: 700, marginTop: 6 }}>
              {`SWZ: ${swz.status}`}
            </div>
            <div style={{ color: paleta.kreskaBazowa, fontFamily: 'monospace', marginTop: 3 }}>
              {`Ik₁ min = ${swz.ik1_min_a.toFixed(0)} A`}
            </div>
            {swz.ia_wymagane_a != null ? (
              <div style={{ color: paleta.kreskaBazowa, fontFamily: 'monospace', marginTop: 3 }}>
                {`Ia wymagane = ${swz.ia_wymagane_a.toFixed(0)} A`}
              </div>
            ) : null}
            <div style={{ color: paleta.kreskaWygaszona, marginTop: 6 }}>{swz.przyczyna_pl}</div>
          </>
        ) : (
          <div style={{ color: paleta.tonOstrzegawczy, marginTop: 6 }}>
            {feeder.swz.reason_pl ?? `SWZ: ${feeder.swz.status}`}
          </div>
        )}
      </section>
    </aside>
  );
}

/** P0.1/P0-V5 — sekcja szyn REALNA: kreska magistrali w hierarchii MAIN/SUB
 *  (grubość + typografia z `busTier` — rozpoznawalne bez czytania etykiety).
 *  Niesie WŁASNE plakietki overlay (zwarcia/spadki U) — `kind==='bus'`
 *  zwraca się wcześnie w pętli renderu, więc odznaki muszą żyć TUTAJ.
 *  Stan zasilania szyny (bez napięcia / wyspa DER) jest STANEM RUCHOWYM —
 *  ta sama klasa co OPEN/CLOSED, więc widoczny na każdym poziomie. */
function BusBarNode({
  node,
  ctx,
  activeOverlay,
  resultOverlayPayload,
  voltageProfileByBusRef,
}: {
  readonly node: LvDomainSceneNode;
  readonly ctx: KontekstRysunku;
  readonly activeOverlay: LvDomainOverlayId | null;
  readonly resultOverlayPayload: RawOverlayPayload | null;
  readonly voltageProfileByBusRef: Readonly<Record<string, LvDomainVoltageProfileRow>>;
}): JSX.Element {
  const half = node.busBarHalfWidth ?? 0;
  const isMain = node.meta?.busTier !== 'sub';
  const strokeWidth = ctx.sp(isMain ? BUS_STROKE_SCREEN_PX.main : BUS_STROKE_SCREEN_PX.sub);
  const labelPx = isMain ? TYPE_SCREEN_PX.primary : TYPE_SCREEN_PX.busSub;
  const bezNapiecia = node.meta?.energized === false;
  const wyspaDer = node.meta?.derOnly === true;
  const feederCount = typeof node.meta?.feederCount === 'number' ? node.meta.feederCount : null;
  const labelY = node.y - ctx.sp(10) - strokeWidth / 2;
  return (
    <g
      data-testid={`lv-domain-node-${node.ref}`}
      data-node-kind={node.kind}
      data-owner-ref={node.ref}
      data-bus-tier={isMain ? 'main' : 'sub'}
      data-energized={node.meta?.energized === undefined ? undefined : String(node.meta.energized)}
      data-der-only={node.meta?.derOnly === undefined ? undefined : String(node.meta.derOnly)}
    >
      {ctx.widoczne('szynaSekcji') ? (
        <line
          x1={node.x - half}
          y1={node.y}
          x2={node.x + half}
          y2={node.y}
          stroke={bezNapiecia ? ctx.paleta.bezNapiecia : ctx.paleta.kreskaBazowa}
          strokeWidth={strokeWidth}
          strokeLinecap="square"
          strokeDasharray={bezNapiecia ? dashOf(ctx, LINE_DASH_SCREEN_PX.bezNapiecia) : undefined}
        />
      ) : null}
      {ctx.widoczne('nazwaSekcji') ? (
        <text
          {...textHalo(ctx)}
          x={node.x - half}
          y={labelY}
          textAnchor="start"
          fontSize={ctx.sp(labelPx)}
          fontWeight={700}
          fill={ctx.paleta.kreskaBazowa}
        >
          {node.label}
          {node.meta?.voltageKv != null && ctx.widoczne('napiecieSekcji') ? (
            <tspan fontSize={ctx.sp(TYPE_SCREEN_PX.secondary)} fontWeight={400} fill={ctx.paleta.kreskaWygaszona}>
              {`  ·  ${plNumber(node.meta.voltageKv as number)} kV`}
            </tspan>
          ) : null}
          {bezNapiecia && ctx.widoczne('znacznikBezNapiecia') ? (
            <tspan
              data-testid={`lv-domain-bus-bez-napiecia-${node.ref}`}
              fontSize={ctx.sp(TYPE_SCREEN_PX.secondary)}
              fontWeight={600}
              fill={ctx.paleta.bezNapiecia}
            >
              {'  ·  bez napięcia'}
            </tspan>
          ) : null}
          {wyspaDer && ctx.widoczne('znacznikWyspyDer') ? (
            <tspan
              data-testid={`lv-domain-bus-wyspa-der-${node.ref}`}
              fontSize={ctx.sp(TYPE_SCREEN_PX.secondary)}
              fontWeight={600}
              fill={ctx.paleta.tonOstrzegawczy}
            >
              {'  ·  wyspa DER'}
            </tspan>
          ) : null}
          {/* Licznik odpływów PŁYNIE W LINII NAZWY sekcji, a nie stoi w
              osobnym punkcie kreski. Dwie próby ustawienia go „na wolnym
              miejscu" (prawy koniec kreski w linii nazwy, potem linia wyżej)
              dały dwie różne kolizje na zrzutach: raz ze znacznikiem stanu
              zasilania („1 odpływ cia"), raz z glifem źródła stojącego nad
              prawym końcem kreski. Wolnego miejsca NAD kreską nie ma z
              definicji — to pas źródeł. Tekst dopisany do przepływu nazwy
              nie może kolidować z niczym, cokolwiek jeszcze przyrośnie. */}
          {feederCount != null && ctx.widoczne('licznikOdplywowSekcji') ? (
            <tspan
              data-testid={`lv-domain-bus-licznik-${node.ref}`}
              fontSize={ctx.sp(TYPE_SCREEN_PX.secondary)}
              fontWeight={600}
              fill={ctx.paleta.kreskaWygaszona}
            >
              {`  ·  ${licznikOdplywowLabel(feederCount)}`}
            </tspan>
          ) : null}
        </text>
      ) : null}
      {activeOverlay === 'loads' || activeOverlay === 'shortCircuit' ? (
        <ResultBadge node={node} ctx={ctx} withGlyphOffset={false} overlay={activeOverlay} payload={resultOverlayPayload} />
      ) : null}
      {activeOverlay === 'voltageDrop' ? (
        <VoltageDropBadge node={node} ctx={ctx} row={voltageProfileByBusRef[node.ref]} />
      ) : null}
    </g>
  );
}

/** Werdykt pkt 12 — kotwica SN jest KOTWICĄ, nie dominantą: dyskretny opis
 *  tekstowy (muted, bez obrysu/pudełka) nad torem źródła. TOŻSAMOŚĆ kotwicy
 *  (poziom napięcia zasilania) zostaje na każdym poziomie — źródła nie wolno
 *  ukryć; parametry zwarciowe to opis (poziom pełny). */
function AnchorChipNode({ node, ctx }: { readonly node: LvDomainSceneNode; readonly ctx: KontekstRysunku }): JSX.Element {
  const tozsamosc = typeof node.meta?.tozsamoscLabel === 'string' ? node.meta.tozsamoscLabel : node.label;
  const opis = typeof node.meta?.opisLabel === 'string' ? node.meta.opisLabel : null;
  return (
    <g data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref}>
      {/* Baseline NAD punktem kotwicy — kreska toru źródła startuje w punkcie
          i nie przecina tekstu. */}
      {opis != null && ctx.widoczne('parametryKotwicyZrodla') ? (
        <text
          {...textHalo(ctx)}
          x={node.x}
          y={node.y - ctx.sp(19)}
          textAnchor="middle"
          fontSize={ctx.sp(10)}
          fill={ctx.paleta.kreskaWygaszona}
          fontFamily="monospace"
        >
          {opis}
        </text>
      ) : null}
      {ctx.widoczne('nazwaKotwicyZrodla') ? (
        <text
          {...textHalo(ctx)}
          x={node.x}
          y={node.y - ctx.sp(6)}
          textAnchor="middle"
          fontSize={ctx.sp(10)}
          fill={ctx.paleta.kreskaWygaszona}
          fontFamily="monospace"
        >
          {tozsamosc}
        </text>
      ) : null}
    </g>
  );
}

/** P0-V8 — boundary BEZ wyglądu przycisku: referencja tekstowa w kolorze
 *  granicy (● terminal rysuje `boundaryTerminal`, strzałkę — krawędź
 *  `boundaryLink`), napięcie zacisku pod nazwą. Affordance (rola przycisku,
 *  nawigacja T5c) zostaje w a11y, nie w wyglądzie spoczynkowym. */
function BoundaryRefNode({ node, ctx }: { readonly node: LvDomainSceneNode; readonly ctx: KontekstRysunku }): JSX.Element {
  return (
    <g
      data-testid={`lv-domain-node-${node.ref}`}
      data-node-kind={node.kind}
      data-owner-ref={node.ref}
      role="button"
      aria-label={`Otwórz domenę ${node.label.replace('→ ', '')}`}
    >
      {ctx.widoczne('nazwaGranicy') ? (
        <text
          {...textHalo(ctx)}
          x={node.x - ctx.sp(2)}
          y={node.y + ctx.sp(4)}
          textAnchor="start"
          fontSize={ctx.sp(TYPE_SCREEN_PX.secondary + 0.5)}
          fontWeight={600}
          fill={ctx.paleta.kreskaGranicy}
        >
          {node.label}
        </text>
      ) : null}
      {node.meta?.voltageKv != null && ctx.widoczne('napiecieGranicy') ? (
        <text
          {...textHalo(ctx)}
          x={node.x - ctx.sp(2)}
          y={node.y + ctx.sp(17)}
          textAnchor="start"
          fontSize={ctx.sp(TYPE_SCREEN_PX.tertiary)}
          fill={ctx.paleta.kreskaWygaszona}
        >
          {`${plNumber(node.meta.voltageKv as number)} kV`}
        </text>
      ) : null}
    </g>
  );
}

/** Wzór kreski [px ekranu] → atrybut SVG w jednostkach świata. */
function dashOf(ctx: KontekstRysunku, pattern: readonly [number, number]): string {
  return `${ctx.sp(pattern[0])} ${ctx.sp(pattern[1])}`;
}

/** T5b-4 — gramatyka linii (werdykt pkt 13, `visualGrammar.ts::LINE_SCREEN_PX`):
 *  BUS (rysuje BusBarNode) > INTERNAL CONNECTION (kikuty/incomer/tor źródła)
 *  > CABLE (cieńszy, zaokrąglony) > BOUNDARY (przerywany + strzałka).
 *  Sprzęgło: DWA kikuty do krawędzi glifu — ciągłość toru niesie SYMBOL
 *  aparatu (wypełniony=zamknięty), nie kreska POD symbolem (P0-V6).
 *
 *  DWA NIEZALEŻNE KANAŁY STANU (nie wolno ich zlać): WZÓR KRESKI niesie stan
 *  ŁĄCZNIKA (otwarty = przerywany), KOLOR niesie stan ZASILANIA (bez
 *  napięcia = wygaszony). Odcinek może być jednocześnie za otwartym
 *  łącznikiem i bez napięcia — wtedy widać oba fakty naraz. */
function SceneEdgeLine({
  edge,
  scene,
  ctx,
}: {
  readonly edge: LvDomainSceneEdge;
  readonly scene: { readonly nodes: readonly LvDomainSceneNode[] };
  readonly ctx: KontekstRysunku;
}): JSX.Element | null {
  if (!ctx.widoczne(elementKrawedzi(edge.kind))) return null;
  const isCable = edge.kind === 'cable';
  const isBoundaryLink = edge.kind === 'boundaryLink';
  const open = edge.status === 'open';
  const bezNapiecia = edge.meta?.energized === false;
  const stroke = isBoundaryLink
    ? ctx.paleta.kreskaGranicy
    : bezNapiecia
      ? ctx.paleta.bezNapiecia
      : isCable
        ? ctx.paleta.kreskaKabla
        : open
          ? ctx.paleta.kreskaOtwarta
          : ctx.paleta.kreskaBazowa;
  const dash = isBoundaryLink
    ? dashOf(ctx, LINE_DASH_SCREEN_PX.boundary)
    : open
      ? dashOf(ctx, LINE_DASH_SCREEN_PX.open)
      : bezNapiecia
        ? dashOf(ctx, LINE_DASH_SCREEN_PX.bezNapiecia)
        : undefined;
  const width = ctx.sp(
    edge.kind === 'coupler' ? LINE_SCREEN_PX.coupler : isCable ? LINE_SCREEN_PX.cable : isBoundaryLink ? LINE_SCREEN_PX.boundary : LINE_SCREEN_PX.connection,
  );

  if (edge.kind === 'coupler') {
    // Kikuty sprzęgła od krawędzi kresek sekcji do KRAWĘDZI glifu aparatu —
    // przez glif tor NIE przechodzi (stan niesie sylwetka: P0-V6).
    const couplerNode = scene.nodes.find((n) => n.ref === edge.ref && n.kind === 'apparatus');
    const midX = couplerNode?.x ?? (edge.x1 + edge.x2) / 2;
    const gap = couplerNode ? ctx.sp(SYMBOL_SCREEN_PX.coupler / 2 + 2) : 0;
    const tone = bezNapiecia ? ctx.paleta.bezNapiecia : open ? ctx.paleta.tonOstrzegawczy : ctx.paleta.kreskaBazowa;
    return (
      <g data-testid={`lv-domain-edge-${edge.ref}`} data-edge-kind={edge.kind} data-energized={edge.meta?.energized === undefined ? undefined : String(edge.meta.energized)}>
        <line x1={edge.x1} y1={edge.y1} x2={midX - gap} y2={edge.y2} stroke={tone} strokeWidth={width} strokeDasharray={dash} />
        <line x1={midX + gap} y1={edge.y1} x2={edge.x2} y2={edge.y2} stroke={tone} strokeWidth={width} strokeDasharray={dash} />
      </g>
    );
  }

  return (
    <g
      data-testid={`lv-domain-edge-${edge.ref}`}
      data-edge-kind={edge.kind}
      data-gap={edge.meta?.gapPl ? 'true' : undefined}
      data-energized={edge.meta?.energized === undefined ? undefined : String(edge.meta.energized)}
    >
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
          d={`M ${edge.x2} ${edge.y2} l ${-ctx.sp(9)} ${-ctx.sp(4)} l 0 ${ctx.sp(8)} Z`}
          fill={ctx.paleta.kreskaGranicy}
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
 * kolor/stan niesie SYMBOL, werdykt pkt 14); generator/odbiór = nazwa +
 * wartość dwupoziomowo. Podział NAZWA (tożsamość) / PARAMETR (opis) jest
 * dokładnie osią redukcji poziomów szczegółowości.
 */
function NodeLabel({
  node,
  ctx,
}: {
  readonly node: LvDomainSceneNode;
  readonly ctx: KontekstRysunku;
}): JSX.Element | null {
  const glyph = glyphScreenSize(node, ctx.fit);
  const pokazNazwe = ctx.widoczne(elementNazwy(node));
  if (node.kind === 'transformer') {
    const name = typeof node.meta?.name === 'string' ? node.meta.name : node.ref;
    const snMva = typeof node.meta?.snMva === 'number' ? node.meta.snMva : null;
    const uhv = typeof node.meta?.uhvKv === 'number' ? node.meta.uhvKv : null;
    const ulv = typeof node.meta?.ulvKv === 'number' ? node.meta.ulvKv : null;
    const group = typeof node.meta?.vectorGroup === 'string' ? node.meta.vectorGroup : null;
    const uk = typeof node.meta?.ukPercent === 'number' ? node.meta.ukPercent : null;
    const xText = node.x + ctx.sp(glyph.w / 2 + 12);
    const pokazTabliczke = ctx.widoczne('tabliczkaTransformatora');
    return (
      <g {...textHalo(ctx)}>
        {pokazNazwe ? (
          <text x={xText} y={node.y - ctx.sp(14)} textAnchor="start" fontSize={ctx.sp(TYPE_SCREEN_PX.primary + 1)} fontWeight={700} fill={ctx.paleta.kreskaBazowa}>
            {name}
          </text>
        ) : null}
        {snMva != null && pokazTabliczke ? (
          <text x={xText} y={node.y + ctx.sp(2)} textAnchor="start" fontSize={ctx.sp(TYPE_SCREEN_PX.primary)} fontWeight={600} fill={ctx.paleta.kreskaBazowa}>
            {snKvaLabel(snMva)}
          </text>
        ) : null}
        {uhv != null && ulv != null && pokazTabliczke ? (
          <text x={xText} y={node.y + ctx.sp(16)} textAnchor="start" fontSize={ctx.sp(TYPE_SCREEN_PX.secondary)} fill={ctx.paleta.kreskaWygaszona}>
            {`${plNumber(uhv)}/${plNumber(ulv)} kV${group ? ` · ${group}` : ''}`}
          </text>
        ) : null}
        {uk != null && pokazTabliczke ? (
          <text x={xText} y={node.y + ctx.sp(29)} textAnchor="start" fontSize={ctx.sp(TYPE_SCREEN_PX.secondary)} fill={ctx.paleta.kreskaWygaszona}>
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
        <g {...textHalo(ctx)}>
          {pokazNazwe ? (
            <text
              x={node.x}
              y={node.y + ctx.sp(glyph.h / 2 + 15)}
              textAnchor="middle"
              fontSize={ctx.sp(TYPE_SCREEN_PX.secondary + 1)}
              fontWeight={600}
              fill={ctx.paleta.kreskaBazowa}
            >
              {node.label}
            </text>
          ) : null}
          {/* Słowo stanu = DRUGORZĘDNE potwierdzenie (muted) — stan niesie
              SYMBOL (wypełnienie/przerwa/kolor glifu), werdykt pkt 14.
              Dlatego samo słowo może zniknąć na niższych poziomach, a glif
              stanu ZOSTAJE. */}
          {ctx.widoczne('stanSlownyLacznika') ? (
            <text
              x={node.x}
              y={node.y + ctx.sp(glyph.h / 2 + 29)}
              textAnchor="middle"
              fontSize={ctx.sp(TYPE_SCREEN_PX.secondary - 1)}
              fontWeight={600}
              fill={open ? ctx.paleta.tonOstrzegawczy : ctx.paleta.kreskaWygaszona}
            >
              {open ? 'OTWARTE' : 'ZAMKNIĘTE'}
            </text>
          ) : null}
        </g>
      );
    }
    // Zero pustego znacznika, gdy etykieta nie jest rysowana: rysunek toru
    // ma być BAJT W BAJT ten sam na każdym poziomie (pusta grupa różniłaby
    // odcisk L0 od L2 i maskowałaby realną różnicę geometrii).
    if (!pokazNazwe) return null;
    return (
      <text
        {...textHalo(ctx)}
        x={node.x + ctx.sp(glyph.w / 2 + 9)}
        y={node.y + ctx.sp(4)}
        textAnchor="start"
        fontSize={ctx.sp(TYPE_SCREEN_PX.secondary + 1)}
        fontWeight={600}
        fill={ctx.paleta.kreskaBazowa}
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
    const xText = node.x + ctx.sp(glyph.w / 2 + 9);
    return (
      <g {...textHalo(ctx)}>
        {pokazNazwe ? (
          <text x={xText} y={node.y - ctx.sp(2)} textAnchor="start" fontSize={ctx.sp(TYPE_SCREEN_PX.primary)} fontWeight={700} fill={ctx.paleta.kreskaBazowa}>
            {name}
          </text>
        ) : null}
        {value && ctx.widoczne('parametrZrodlaDer') ? (
          <text x={xText} y={node.y + ctx.sp(12)} textAnchor="start" fontSize={ctx.sp(TYPE_SCREEN_PX.secondary)} fill={ctx.paleta.kreskaWygaszona}>
            {value.replace('.', ',')}
          </text>
        ) : null}
      </g>
    );
  }
  if (node.kind === 'load') {
    const [name, value] = node.label.split(' · ');
    const yBase = node.y + ctx.sp(glyph.h / 2 + 16);
    return (
      <g {...textHalo(ctx)}>
        {pokazNazwe ? (
          <text x={node.x} y={yBase} textAnchor="middle" fontSize={ctx.sp(TYPE_SCREEN_PX.secondary + 1)} fontWeight={600} fill={ctx.paleta.kreskaBazowa}>
            {name}
          </text>
        ) : null}
        {value && ctx.widoczne('parametrOdbioru') ? (
          <text x={node.x} y={yBase + ctx.sp(14)} textAnchor="middle" fontSize={ctx.sp(TYPE_SCREEN_PX.secondary)} fill={ctx.paleta.kreskaWygaszona}>
            {value.replace('.', ',')}
          </text>
        ) : null}
      </g>
    );
  }
  return null;
}

/**
 * KROPKA WERDYKTU — zastępcza, uproszczona postać nakładki na poziomie
 * przeglądu (rejestr: `kropkaWerdyktu`). Nakładka NIE ZNIKA na przeglądzie
 * (ukrycie wyniku byłoby kłamstwem) — zwija się do werdyktu bez liczby, bo
 * liczba przy tej gęstości i tak jest nieczytelna. Ton pochodzi z GOTOWEGO
 * werdyktu backendu; brak werdyktu = ton neutralny („jest wynik").
 */
function VerdictDot({
  node,
  ctx,
  tone,
  overlay,
  status,
}: {
  readonly node: LvDomainSceneNode;
  readonly ctx: KontekstRysunku;
  readonly tone: string;
  readonly overlay: LvDomainOverlayId;
  readonly status?: string;
}): JSX.Element {
  const glyph = glyphScreenSize(node, ctx.fit);
  return (
    <circle
      data-testid={`lv-domain-verdict-${overlay}-${node.ref}`}
      data-swz-status={status}
      cx={node.x}
      cy={node.y + ctx.sp(glyph.h / 2 + 12)}
      r={ctx.sp(4.5)}
      fill={tone}
      stroke={ctx.paleta.tlo}
      strokeWidth={ctx.sp(1.2)}
    />
  );
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
  ctx,
  entry,
}: {
  readonly node: LvDomainSceneNode;
  readonly ctx: KontekstRysunku;
  readonly entry: SwzOverlayEntry | undefined;
}): JSX.Element | null {
  if (!entry) return null;
  const glyph = glyphScreenSize(node, ctx.fit);
  const tone = entry.status === 'spełnia' ? ctx.paleta.tonOk : entry.status === 'nie spełnia' ? ctx.paleta.tonBledu : ctx.paleta.tonOstrzegawczy;
  if (ctx.widoczne('kropkaWerdyktu')) {
    return <VerdictDot node={node} ctx={ctx} tone={tone} overlay="swz" status={entry.status} />;
  }
  if (!ctx.widoczne('plakietkaWyniku')) return null;
  const symbol = entry.status === 'spełnia' ? '✓' : entry.status === 'nie spełnia' ? '✗' : '?';
  const tSuffix = entry.tWymaganyS != null ? `/${plFixed(entry.tWymaganyS, 2)} s` : '';
  const text =
    entry.status === 'nie spełnia' && entry.iaWymaganeA != null
      ? `SWZ ${symbol} Ik₁min=${entry.ik1MinA.toFixed(0)} A · Ia wym.=${entry.iaWymaganeA.toFixed(0)} A`
      : `SWZ ${symbol} ${entry.ik1MinA.toFixed(0)} A${tSuffix}`;
  return (
    <g {...textHalo(ctx)} data-testid={`lv-domain-badge-swz-${node.ref}`} data-swz-status={entry.status}>
      <text x={node.x} y={node.y + ctx.sp(glyph.h / 2 + 30)} textAnchor="middle" fontSize={ctx.sp(TYPE_SCREEN_PX.badge)} fill={tone} fontFamily="monospace">
        {text}
      </text>
    </g>
  );
}

/** P0.17: displayedValue == solverResult(elementRef, runId) — odczyt WPROST
 *  z `RawOverlayPayload.elements[ref].metrics`, zero przeliczeń. */
function ResultBadge({
  node,
  ctx,
  withGlyphOffset,
  overlay,
  payload,
}: {
  readonly node: LvDomainSceneNode;
  readonly ctx: KontekstRysunku;
  /** Odsunięcie od DOLNEJ krawędzi glifu (aparat) vs od kreski szyny. */
  readonly withGlyphOffset: boolean;
  readonly overlay: 'loads' | 'shortCircuit';
  readonly payload: RawOverlayPayload | null;
}): JSX.Element | null {
  if (!payload) return null;
  const metricCode = overlay === 'shortCircuit' ? 'IK_3F_A' : 'I_A';
  const metric = getMetric(payload, node.ref, metricCode);
  if (!metric || metric.value == null) return null;
  if (ctx.widoczne('kropkaWerdyktu')) {
    const tone = tonWerdyktuSeverity(payload.elements[node.ref]?.severity, ctx.paleta);
    return <VerdictDot node={node} ctx={ctx} tone={tone} overlay={overlay} />;
  }
  if (!ctx.widoczne('plakietkaWyniku')) return null;
  const yOffset = withGlyphOffset ? glyphScreenSize(node, ctx.fit).h / 2 + 30 : 26;
  return (
    <g {...textHalo(ctx)} data-testid={`lv-domain-badge-${overlay}-${node.ref}`} data-run-id={payload.run_id}>
      <text x={node.x} y={node.y + ctx.sp(yOffset)} textAnchor="middle" fontSize={ctx.sp(TYPE_SCREEN_PX.badge)} fill={ctx.paleta.kreskaBazowa} fontFamily="monospace">
        {formatMetric(metric)}
      </text>
    </g>
  );
}

function VoltageDropBadge({
  node,
  ctx,
  row,
}: {
  readonly node: LvDomainSceneNode;
  readonly ctx: KontekstRysunku;
  readonly row: LvDomainVoltageProfileRow | undefined;
}): JSX.Element | null {
  if (!row || row.delta_pct == null) return null;
  if (ctx.widoczne('kropkaWerdyktu')) {
    // Profil napięcia nie niesie werdyktu (sam ΔU to liczba, nie ocena) —
    // kropka mówi WYŁĄCZNIE „ten punkt ma wynik", w tonie neutralnym.
    return <VerdictDot node={node} ctx={ctx} tone={ctx.paleta.kreskaBazowa} overlay="voltageDrop" />;
  }
  if (!ctx.widoczne('plakietkaWyniku')) return null;
  return (
    <g {...textHalo(ctx)} data-testid={`lv-domain-badge-voltageDrop-${node.ref}`}>
      <text x={node.x} y={node.y - ctx.sp(20)} textAnchor="middle" fontSize={ctx.sp(TYPE_SCREEN_PX.badge)} fill={ctx.paleta.kreskaBazowa} fontFamily="monospace">
        {`ΔU ${plFixed(row.delta_pct, 2)}%`}
      </text>
    </g>
  );
}

function overlayButtonStyle(active: boolean, paleta: PaletaNn): CSSProperties {
  return {
    background: active ? paleta.przyciskAktywnyTlo : 'transparent',
    color: active ? paleta.tonOk : paleta.kreskaWygaszona,
    border: `1px solid ${active ? paleta.tonOk : paleta.kreskaWygaszona}`,
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
    cursor: 'pointer',
  };
}
