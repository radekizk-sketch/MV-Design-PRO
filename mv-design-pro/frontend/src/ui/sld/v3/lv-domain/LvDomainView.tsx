/**
 * `LvDomainView` — kanwa projekcji domeny nN (kontrakt 3.0.0; mandat
 * „profesjonalizacja SLD nN"). WŁASNA kanwa (nie `SldCanvasV3`): TORY
 * ELEKTRYCZNE jednej stacji jako projekcja grafu domeny
 * (`composeLvDomainScene`) — CZYSTY render propsów, zero fetch/routing/kamery.
 *
 * ELEKTRYKA PRZED GRAFIKĄ: renderer NIE liczy energizacji, wysp, ról ani
 * ostrzeżeń — czyta je z meta sceny (przepisanej z projekcji). Każdy stan ma
 * NOŚNIK GEOMETRYCZNY (wzór kreski, glif, znacznik tekstowy); kolor jest
 * kanałem redundantnym (§26) — tryb `mono` (druk, §44) nie traci informacji.
 *
 * WARSTWA WIZUALNA czyta WYŁĄCZNIE `visualGrammar.ts` (tokeny §21/§41, cztery
 * poziomy graficzne §20, fit §25) i `symbolRegistry.ts` (§4). Poziom
 * szczegółowości (LOD) jest filtrem prezentacji z JEDNYM wyprowadzeniem
 * (`ctx.widoczne`) po `REJESTR_ELEMENTOW_KANWY`; punktowe porównania `lod`
 * w komponentach są zakazane (pin: `__tests__/lodProjekcjaNn.test.tsx`).
 *
 * WYNIKI (§18/§19): plakietki czytają WPROST `result_snapshot.overlay_payload`
 * (kody metryk ResultSet v1: IK_3F_A/IK_1F_A/IP_A/ITH_A/I_A/U_kV) i profil
 * napięć; każda plakietka niesie POCHODZENIE (typ analizy, przebieg, status
 * świeżości) — dane źródłowe (tabliczki) i wyniki nie mieszają się.
 *
 * WYBÓR (§37/§38): klik w element podświetla PEŁNY tor zasilania z
 * `graph.supply_paths` backendu — zero BFS po stronie klienta.
 */
import { useMemo, useState, type CSSProperties } from 'react';

import { buildSwzOverlayFromResponses, type SwzOverlayEntry } from '../canvas/overlay';
import type { RawMetricValue, RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
import { getMetric } from '../../../sld-overlay/rawResultOverlayStore';
import { CadSymbol } from '../cad/CadSymbol';
import { ELECTRICAL_CAD_SYMBOL_REGISTRY, gabarytCad, type CadOrientation, type CadSwitchState } from '../cad/cadSymbolRegistry';
import type { ThemeMode } from '../../../../ui2/theme/themeMode';
import {
  composeLvDomainScene,
  domainDescriptorLabel,
  type LvDomainScene,
  type LvDomainSceneEdge,
  type LvDomainSceneEdgeKind,
  type LvDomainSceneNode,
} from './composeLvDomainScene';
import { kodyAnsiPelne, nazwyFunkcjiPl, stanSlowny, technologiaZrodlaPl, wpisAparatu, znakiIec, znakiIecPelne } from './symbolRegistry';
import {
  BUS_STROKE_SCREEN_PX,
  CAD_U_PX,
  CHAR_WIDTH_RATIO,
  CHAR_WIDTH_RATIO_BOLD,
  CHAR_WIDTH_RATIO_MONO,
  JUNCTION_RADIUS_SCREEN_PX,
  LINE_DASH_SCREEN_PX,
  LINE_HEIGHT,
  LINE_SCREEN_PX,
  SLD_LABEL,
  TOKENY_GEOMETRII,
  etykietaStanuZasilania,
  fitSceneToViewport,
  licznikOdplywowLabel,
  limitZnakow,
  mocLabel,
  paletaMono,
  paletaNnDlaMotywu,
  plFixed,
  plNumber,
  snKvaLabel,
  tokenyCss,
  tonStanuZasilania,
  tonWagi,
  tonWerdyktuSeverity,
  skalaSymboluNaEkranie,
  widocznyNaLod,
  wzorKreskiStanu,
  zawinNazwe,
  type ElementKanwyNn,
  type PaletaNn,
  type PoziomLod,
  type RodzajSymbolu,
  type SceneFit,
} from './visualGrammar';
import type {
  LvDeviceState,
  LvDomainGenerator,
  LvDomainIsland,
  LvDomainOverlayId,
  LvDomainProjectionV1,
  LvDomainSwzFeederV1,
  LvDomainValidationMessage,
  LvDomainVoltageProfileRow,
  LvEnergizationState,
} from './types';

const DEFAULT_VIEWPORT = { width: 1280, height: 800 } as const;
const HEADER_ALLOWANCE_PX = 96;

type LabelMode = 'engineering' | 'audit';

const OVERLAY_LABELS_PL: Readonly<Record<LvDomainOverlayId, string>> = {
  loads: 'Obciążenia',
  voltageDrop: 'Spadki napięcia',
  shortCircuit: 'Zwarcia',
  swz: 'SWZ',
};
const OVERLAY_ORDER: readonly LvDomainOverlayId[] = ['loads', 'voltageDrop', 'shortCircuit', 'swz'];

interface KontekstRysunku {
  readonly sp: (screenPx: number) => number;
  readonly fit: SceneFit;
  readonly paleta: PaletaNn;
  readonly widoczne: (kind: ElementKanwyNn) => boolean;
  readonly labelMode: LabelMode;
  readonly warningsByRef: ReadonlyMap<string, readonly LvDomainValidationMessage[]>;
  readonly highlighted: ReadonlySet<string>;
  readonly selectedRef: string | null;
  readonly islandByRef: ReadonlyMap<string, LvDomainIsland>;
  /** Nazwy elementów po referencji (źródła DER, transformatory) — etykiety
   *  wysp mówią „z Magazyn D", nie „z QF-D1_zrodlo". */
  readonly nameByRef: ReadonlyMap<string, string>;
}

export interface LvDomainViewProps {
  readonly projection: LvDomainProjectionV1;
  readonly width?: number;
  readonly height?: number;
  readonly initialOverlay?: LvDomainOverlayId | null;
  readonly lod?: PoziomLod;
  readonly theme?: ThemeMode;
  /** Paleta monochromatyczna (druk A4/A3) — stany niosą wzory i znaczniki. */
  readonly mono?: boolean;
  /** Element wybrany na start (podświetlenie toru zasilania). */
  readonly initialSelectedRef?: string | null;
}

function textHalo(ctx: KontekstRysunku): {
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly paintOrder: 'stroke';
  readonly strokeLinejoin: 'round';
} {
  return { stroke: ctx.paleta.tlo, strokeWidth: ctx.sp(4.5), paintOrder: 'stroke', strokeLinejoin: 'round' };
}

/** Klucz katalogowy kabla → człony do etykiety: przedrostek przestrzeni
 *  nazw (`KABEL_NN` → `kabel-nn-`) jest zdejmowany, bo przestrzeń niesie
 *  osobne pole; reszta klucza dzieli się po „-" na wiersze (maks. 3) —
 *  klucz zostaje kluczem (zero „humanizacji" na oko), tylko złożony w kolumnę. */
function czlonyKluczaKatalogowego(catalogRef: string, namespace: string | null): readonly string[] {
  const prefiks = namespace ? `${namespace.toLowerCase().replace(/_/g, '-')}-` : '';
  const trzon = prefiks && catalogRef.toLowerCase().startsWith(prefiks) ? catalogRef.slice(prefiks.length) : catalogRef;
  const czlony = trzon.split('-').filter(Boolean);
  if (czlony.length <= 3) return czlony;
  return [...czlony.slice(0, 2), czlony.slice(2).join('-')];
}

/** Tor ORTOGONALNY (§23): pion, poziom albo łamana H→V, gdy końce różnią się
 *  w obu osiach (zejście liścia z zacisku do własnego slotu). Nigdy skos. */
function sciezkaOrtogonalna(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2 || y1 === y2) return `M ${x1} ${y1} L ${x2} ${y2}`;
  return `M ${x1} ${y1} H ${x2} V ${y2}`;
}

function orientacjaWezla(node: LvDomainSceneNode): CadOrientation {
  return node.orientation ?? 'pionowa';
}

/** Gabaryt symbolu CAD [u] po obrocie (0×0, gdy węzeł nie ma symbolu). */
function symbolBBox(node: LvDomainSceneNode): { readonly width: number; readonly height: number } {
  if (!node.symbolId) return { width: 0, height: 0 };
  const g = gabarytCad(node.symbolId, orientacjaWezla(node));
  return { width: g.w, height: g.h };
}

function switchStateOf(state: unknown): CadSwitchState {
  if (state === 'OPEN') return 'open';
  if (state === 'CLOSED') return 'closed';
  return 'unknown';
}

function elementSymbolu(node: LvDomainSceneNode): ElementKanwyNn {
  switch (node.kind) {
    case 'transformer':
      return 'symbolTransformatora';
    case 'generator':
      return 'symbolZrodlaDer';
    case 'load':
      return 'symbolOdbioru';
    case 'measurement':
      return 'symbolPomiaru';
    case 'relay':
      return 'symbolZabezpieczenia';
    case 'boundaryTerminal':
      return 'zaciskGranicy';
    case 'terminal':
      return 'zaciskToru';
    case 'bus':
      return 'szynaSekcji';
    case 'anchorBar':
      return 'kotwicaSystemuSn';
    default:
      return 'symbolAparatu';
  }
}

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
    case 'anchorBar':
      return 'nazwaKotwicyZrodla';
    case 'bus':
      return 'nazwaSekcji';
    case 'measurement':
      return 'nazwaPomiaru';
    default:
      return 'nazwaAparatu';
  }
}

function elementKrawedzi(kind: LvDomainSceneEdgeKind): ElementKanwyNn {
  switch (kind) {
    case 'anchorDrop':
    case 'sourceDrop':
    case 'incomer':
      return 'torZrodla';
    case 'coupler':
      return 'torSprzegla';
    case 'cable':
      return 'kabelOdplywu';
    case 'boundaryLink':
      return 'linkGranicy';
    case 'relayLink':
      return 'symbolZabezpieczenia';
    default:
      return 'torOdplywu';
  }
}

function rodzajSymbolu(node: LvDomainSceneNode): RodzajSymbolu {
  switch (node.kind) {
    case 'transformer':
      return 'transformer';
    case 'generator':
      return 'generator';
    case 'load':
      return 'load';
    case 'measurement':
      return 'measurement';
    case 'relay':
      return 'relay';
    case 'apparatus':
      return node.meta?.role === 'coupler' ? 'coupler' : 'apparatus';
    default:
      return 'junction';
  }
}

/** Rozmiar symbolu CAD na EKRANIE [px] i skala świata na 1 u (`k`) —
 *  jedna skala biblioteki (`CAD_U_PX`) z sufitem udziału w slocie. */
function glyphScreenSize(node: LvDomainSceneNode, fit: SceneFit): { readonly w: number; readonly h: number; readonly k: number; readonly pxNaU: number } {
  const bbox = symbolBBox(node);
  if (bbox.height === 0) return { w: 0, h: 0, k: 1, pxNaU: CAD_U_PX };
  const pxNaU = skalaSymboluNaEkranie(rodzajSymbolu(node), bbox.width, fit.s);
  return { w: bbox.width * pxNaU, h: bbox.height * pxNaU, k: pxNaU / fit.s, pxNaU };
}

/** Limit znaków w linii etykiety dla szerokości slotu [świat] przy skali fitu. */
function maxCharsForWidth(worldWidth: number, fontPx: number, fit: SceneFit, ratio: number = CHAR_WIDTH_RATIO): number {
  return limitZnakow(worldWidth * fit.s, fontPx, ratio);
}

/** Szerokość pasa etykiety aparatu [px ekranu] — od prawej krawędzi symbolu
 *  do granicy slotu sąsiada (R2 §17: pole ma MIN_FIELD_WIDTH, etykieta nie
 *  jest ściskana ani obracana; nadmiar ucina wielokropek, pełna nazwa w
 *  podpowiedzi i w panelu). */
function pasEtykietyAparatuPx(node: LvDomainSceneNode, ctx: KontekstRysunku): number {
  const glyph = glyphScreenSize(node, ctx.fit);
  return Math.max(24, TOKENY_GEOMETRII.feederGap * ctx.fit.s - glyph.w / 2 - TOKENY_GEOMETRII.labelGap - 6);
}

function formatujMetryke(metric: RawMetricValue): string {
  const value = metric.value;
  if (typeof value !== 'number') return `${String(value)} ${metric.unit}`.trim();
  const hint = (metric as { format_hint?: string }).format_hint ?? 'fixed2';
  const digits = hint === 'fixed0' ? 0 : hint === 'fixed1' ? 1 : hint === 'fixed4' ? 4 : 2;
  return `${plFixed(value, digits)} ${metric.unit}`.trim();
}

function etykietaZdolnosci(capability: unknown): string {
  switch (capability) {
    case 'GRID_FORMING':
      return 'tworzy napięcie · grid-forming';
    case 'GRID_FOLLOWING':
      return 'podąża za siecią · grid-following';
    case 'DUAL_MODE':
      return 'tryb podwójny · sieć / wyspa';
    default:
      return 'zdolność pracy wyspowej nieznana';
  }
}

/** Etykieta wyspy (§14–§16) jako WIERSZE nad kreską: [0] stan i źródła,
 *  [1] odniesienie N/PE · bilans · dopuszczalność (wyłącznie z danych
 *  projekcji; `island_operation_allowed === null` = NIEOCENIONA, nigdy
 *  „niedopuszczalna" z domysłu). */
function etykietaWyspy(island: LvDomainIsland, nameByRef: ReadonlyMap<string, string>): readonly string[] | null {
  if (!island.is_islanded) return null;
  const nazwy = island.energizing_source_ids.map((ref) => nameByRef.get(ref) ?? ref);
  const zrodla = nazwy.length ? ` z: ${nazwy.join(', ')}` : '';
  const npe = island.neutral_reference.status === 'OK'
    ? `N/PE: ${island.neutral_reference.system ?? '—'} (${nameByRef.get(island.neutral_reference.source_ref ?? '') ?? island.neutral_reference.source_ref ?? '—'})`
    : island.neutral_reference.status === 'brak_ukladu'
      ? 'N/PE: układ sieci niezadeklarowany'
      : 'N/PE: brak odniesienia w wyspie';
  const bilans = island.power_balance.state === 'deficyt'
    ? 'bilans: deficyt'
    : island.power_balance.state === 'nadwyzka'
      ? 'bilans: nadwyżka'
      : island.power_balance.state === 'zrownowazony'
        ? 'bilans: zrównoważony'
        : 'bilans: brak danych';
  const dopuszczalnosc = island.island_operation_allowed === null
    ? 'praca wyspowa: nieoceniona'
    : island.island_operation_allowed
      ? 'praca wyspowa: dopuszczalna'
      : 'praca wyspowa: niedopuszczalna';
  switch (island.energization_state) {
    case 'ENERGIZED':
    case 'MULTISOURCE':
      return [`WYSPA · zasilona${zrodla} (tworzy napięcie)`, `${npe} · ${bilans} · ${dopuszczalnosc}`];
    case 'UNKNOWN':
      return ['WYSPA · zdolność źródła nieznana — stan zasilania nieznany'];
    default:
      return island.der_refs.length
        ? ['WYSPA · źródła podążające za siecią — bez napięcia (wg topologii)']
        : null;
  }
}

/** Identyfikator przebiegu do etykiety: pełny, gdy krótki; UUID — pierwsze
 *  8 znaków; przedrostek „przebieg-" identyfikatora nie dubluje słowa. */
function skrotPrzebiegu(runId: string): string {
  const id = runId.replace(/^przebieg-/, '');
  return id.length <= 24 ? `przebieg ${id}` : `przebieg ${id.slice(0, 8)}`;
}

function statusWynikuLabel(projection: LvDomainProjectionV1): string {
  const result = projection.result_snapshot;
  if (result.status === 'NONE') return 'wynik: brak przebiegu';
  const typ = result.analysis_type ?? 'analiza';
  const przebieg = result.run_id ? ` · ${skrotPrzebiegu(result.run_id)}` : '';
  if (result.status === 'OUTDATED') return `wynik: NIEAKTUALNY (${typ}${przebieg}) · ${result.reason_pl}`;
  return `wynik: aktualny (${typ}${przebieg})`;
}

// ---------------------------------------------------------------------------
// Komponent główny.
// ---------------------------------------------------------------------------

export function LvDomainView(props: LvDomainViewProps): JSX.Element {
  const {
    projection,
    width,
    height,
    initialOverlay = null,
    lod = 2,
    theme = 'dark_scada',
    mono = false,
    initialSelectedRef = null,
  } = props;
  const view = projection.graph;
  const [activeOverlay, setActiveOverlay] = useState<LvDomainOverlayId | null>(initialOverlay);
  const [labelMode, setLabelMode] = useState<LabelMode>('engineering');
  const [selectedRef, setSelectedRef] = useState<string | null>(initialSelectedRef);
  const [warningsOpen, setWarningsOpen] = useState<boolean>(false);

  const paleta = useMemo(() => (mono ? paletaMono() : paletaNnDlaMotywu(theme)), [theme, mono]);
  const scene = useMemo(() => composeLvDomainScene(view, projection.upstream_equivalents), [view, projection.upstream_equivalents]);
  const domainDescriptor = useMemo(() => domainDescriptorLabel(view), [view]);
  const swzFeeders = useMemo(
    () => projection.swz_snapshot.transformers.flatMap((t) => t.feeders.map((feeder) => ({ transformerRef: t.transformer_ref, feeder }))),
    [projection.swz_snapshot.transformers],
  );
  const swzByFeederRef = useMemo(() => buildSwzOverlayFromResponses(swzFeeders.map(({ feeder }) => feeder.swz)), [swzFeeders]);
  const resultOverlayPayload = useMemo<RawOverlayPayload | null>(() => {
    const result = projection.result_snapshot;
    if (!result.run_id || !result.analysis_type || !result.overlay_payload) return null;
    return { run_id: result.run_id, analysis_type: result.analysis_type, run_finished_at: result.run_finished_at, elements: result.overlay_payload.elements };
  }, [projection.result_snapshot]);
  const voltageProfileByBusRef = useMemo<Readonly<Record<string, LvDomainVoltageProfileRow>>>(
    () => Object.fromEntries((projection.result_snapshot.voltage_profile?.rows ?? []).map((row) => [row.bus_id, row])),
    [projection.result_snapshot.voltage_profile],
  );
  const feederByRef = useMemo(() => new Map(swzFeeders.map((entry) => [entry.feeder.feeder_root_branch_ref, entry] as const)), [swzFeeders]);
  // JEDEN znacznik na komunikat (§40): komunikat o wyspie wylicza wszystkie
  // zaciski i odcinki wyspy — siedem „!" na jednym polu to szum, nie audyt.
  // Kotwica znacznika: pierwsza SZYNA z `element_refs`, w braku — pierwszy
  // element obecny na scenie. Pełna lista referencji zostaje w panelu audytu.
  const warningsByRef = useMemo(() => {
    const map = new Map<string, LvDomainValidationMessage[]>();
    const kindByRef = new Map(scene.nodes.map((n) => [n.ref, n.kind] as const));
    for (const message of projection.validation_messages) {
      const kotwica = message.element_refs.find((ref) => kindByRef.get(ref) === 'bus')
        ?? message.element_refs.find((ref) => kindByRef.has(ref))
        ?? message.element_refs[0];
      if (!kotwica) continue;
      map.set(kotwica, [...(map.get(kotwica) ?? []), message]);
    }
    return map;
  }, [projection.validation_messages, scene.nodes]);
  const islandByRef = useMemo(() => new Map((view.status === 'OK' ? view.islands : []).map((i) => [i.island_ref, i] as const)), [view]);
  const nameByRef = useMemo(() => {
    const map = new Map<string, string>();
    if (view.status !== 'OK') return map;
    for (const g of view.generators) map.set(g.ref_id, g.name);
    for (const t of view.transformers) map.set(t.ref_id, t.name);
    return map;
  }, [view]);

  /** Szyna, do której odnosi się wybrany element (z projekcji, nie z geometrii). */
  const busOfRef = (ref: string | null): string | null => {
    if (!ref || view.status !== 'OK') return null;
    if (view.buses.some((b) => b.ref_id === ref)) return ref;
    const device = view.devices.find((d) => d.ref_id === ref);
    if (device) return device.child_bus_ref;
    const load = view.loads.find((l) => l.ref_id === ref);
    if (load) return load.bus_ref;
    const gen = view.generators.find((g) => g.ref_id === ref);
    if (gen) return gen.bus_ref;
    const trafo = view.transformers.find((t) => t.ref_id === ref);
    if (trafo) return trafo.lv_bus_ref;
    return null;
  };

  const highlighted = useMemo(() => {
    const set = new Set<string>();
    const busRef = busOfRef(selectedRef);
    if (!busRef || view.status !== 'OK') return set;
    const perSource = scene.supplyPaths.get(busRef);
    if (!perSource) return set;
    const branchByRef = new Map(view.branches.map((b) => [b.ref_id, b] as const));
    for (const [sourceRef, branchRefs] of perSource) {
      set.add(sourceRef);
      set.add(`${sourceRef}#lv`);
      set.add(`anchor#${sourceRef}`);
      const buses = new Set<string>([busRef]);
      for (const ref of branchRefs) {
        set.add(ref);
        set.add(`${ref}#a`);
        set.add(`${ref}#b`);
        const branch = branchByRef.get(ref);
        if (branch) {
          buses.add(branch.from_bus_ref);
          buses.add(branch.to_bus_ref);
        }
      }
      for (const b of buses) set.add(`${b}#feed`);
    }
    if (selectedRef) {
      set.add(selectedRef);
      set.add(`${selectedRef}#leaf-drop`);
    }
    return set;
  }, [selectedRef, scene, view]);

  if (view.status !== 'OK') {
    return (
      <div data-testid="lv-domain-view-root" data-status="brak-danych" style={{ background: paleta.tlo, color: paleta.kreskaBazowa, padding: 24, fontFamily: 'monospace' }}>
        Domena nN stacji „{projection.station_ref}" — brak danych ({(view.missing_data ?? []).join(', ') || 'nieznany powód'}).
      </div>
    );
  }

  const viewportWidth = width ?? DEFAULT_VIEWPORT.width;
  const viewportHeight = height ?? DEFAULT_VIEWPORT.height;
  const canvasHeight = Math.max(240, viewportHeight - HEADER_ALLOWANCE_PX);
  const fit = fitSceneToViewport(scene.width, scene.height, viewportWidth, canvasHeight, lod);
  const ctx: KontekstRysunku = {
    fit,
    paleta,
    sp: (screenPx: number): number => screenPx / fit.s,
    widoczne: (kind: ElementKanwyNn): boolean => widocznyNaLod(kind, lod),
    labelMode,
    warningsByRef,
    highlighted,
    selectedRef,
    islandByRef,
    nameByRef,
  };
  // R2 §17: scena, która nie mieści się przy skali minimalnej poziomu, NIE
  // jest pomniejszana — kanwa przewija (pan/scroll); SVG ma rozmiar treści.
  const svgWidth = Math.max(viewportWidth, Math.ceil(fit.contentWidth));
  const svgHeight = Math.max(canvasHeight, Math.ceil(fit.contentHeight));

  const outdated = projection.result_snapshot.status === 'OUTDATED';
  const hasSwzData = activeOverlay === 'swz' && Object.keys(swzByFeederRef).length > 0;
  const hasResultData = (activeOverlay === 'loads' || activeOverlay === 'shortCircuit') && resultOverlayPayload != null;
  const hasVoltageDropData = activeOverlay === 'voltageDrop' && Object.keys(voltageProfileByBusRef).length > 0;
  const hasAnyOverlayData = hasSwzData || hasResultData || hasVoltageDropData;
  // POCHODZENIE nakładki (§19): SWZ to obliczenie pętli zwarcia Z MODELU
  // (IEC 60364-4-41) przy budowie projekcji — niezależne od przebiegu; wynik
  // przebiegu NIEAKTUALNY jest pokazywany jako nieaktualny, nie ukrywany.
  const overlayStatus = activeOverlay === null
    ? 'schemat czysty (bez nakładki)'
    : !hasAnyOverlayData
      ? `nakładka: ${OVERLAY_LABELS_PL[activeOverlay]} · brak wyniku (uruchom przebieg)`
      : activeOverlay === 'swz'
        ? `nakładka: SWZ · pętla zwarcia IEC 60364-4-41 liczona z modelu ENM r${projection.model_snapshot.revision} (bez przebiegu)`
        : outdated
          ? `nakładka: ${OVERLAY_LABELS_PL[activeOverlay]} · wartości NIEAKTUALNE (przebieg sprzed zmiany modelu)`
          : `nakładka: ${OVERLAY_LABELS_PL[activeOverlay]}`;
  const selectedFeeder = selectedRef ? feederByRef.get(selectedRef) ?? null : null;
  const blockerCount = projection.validation_messages.filter((m) => m.severity === 'BLOCKER').length;
  const importantCount = projection.validation_messages.filter((m) => m.severity === 'IMPORTANT').length;

  const onSelect = (ref: string): void => setSelectedRef((current) => (current === ref ? null : ref));

  return (
    <div
      data-testid="lv-domain-view-root"
      data-status="ok"
      data-root-station-id={projection.station_ref}
      data-scenario-id={projection.scenario_id}
      data-projection-hash={projection.projection_hash}
      data-model-hash={projection.model_snapshot.model_hash}
      data-lod={lod}
      data-theme-mode={theme}
      data-mono={mono ? 'true' : 'false'}
      data-selected-ref={selectedRef ?? undefined}
      style={{ ...(tokenyCss() as CSSProperties), background: paleta.tlo, color: paleta.kreskaBazowa, fontFamily: 'sans-serif', position: 'relative' }}
    >
      <style>{'@media print { [data-testid="lv-domain-toolbar"], [data-testid="lv-domain-feeder-panel"], [data-testid="lv-domain-warnings-panel"] { display: none !important; } }'}</style>
      <header data-testid="lv-domain-toolbar" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{view.station_name ?? view.station_ref} · nN</div>
          <div data-testid="lv-domain-descriptor" style={{ fontSize: 11, color: paleta.kreskaWygaszona }}>{domainDescriptor}</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div data-testid="lv-domain-labelmode-switcher" role="group" aria-label="Tryb etykiet" style={{ display: 'flex', gap: 4 }}>
            <button type="button" data-testid="lv-domain-labelmode-engineering" aria-pressed={labelMode === 'engineering'} onClick={() => setLabelMode('engineering')} style={overlayButtonStyle(labelMode === 'engineering', paleta)}>
              Etykiety: projektowe
            </button>
            <button type="button" data-testid="lv-domain-labelmode-audit" aria-pressed={labelMode === 'audit'} onClick={() => setLabelMode('audit')} style={overlayButtonStyle(labelMode === 'audit', paleta)}>
              Audyt topologii
            </button>
          </div>
          <div data-testid="lv-domain-overlay-switcher" role="group" aria-label="Nakładka wyników" style={{ display: 'flex', gap: 4 }}>
            <button type="button" data-testid="lv-domain-overlay-none" aria-pressed={activeOverlay === null} onClick={() => setActiveOverlay(null)} style={overlayButtonStyle(activeOverlay === null, paleta)}>
              Brak
            </button>
            {OVERLAY_ORDER.map((overlayId) => (
              <button key={overlayId} type="button" data-testid={`lv-domain-overlay-${overlayId}`} aria-pressed={activeOverlay === overlayId} onClick={() => setActiveOverlay(overlayId)} style={overlayButtonStyle(activeOverlay === overlayId, paleta)}>
                {OVERLAY_LABELS_PL[overlayId]}
              </button>
            ))}
          </div>
          <button
            type="button"
            data-testid="lv-domain-warnings-toggle"
            data-blockers={blockerCount}
            data-important={importantCount}
            aria-pressed={warningsOpen}
            onClick={() => setWarningsOpen((open) => !open)}
            style={{
              ...overlayButtonStyle(warningsOpen, paleta),
              color: blockerCount > 0 ? paleta.tonBledu : importantCount > 0 ? paleta.tonOstrzegawczy : paleta.kreskaWygaszona,
            }}
          >
            {`Audyt: ${projection.validation_messages.length}`}
          </button>
        </div>
      </header>
      <div data-testid="lv-domain-overlay-status" style={{ padding: '0 16px 4px', fontSize: 11, color: paleta.kreskaWygaszona }}>
        {overlayStatus}
      </div>
      {ctx.widoczne('znacznikSwiezosciWyniku') ? (
        <div
          data-testid="lv-domain-result-freshness"
          data-result-status={projection.result_snapshot.status}
          style={{ padding: '0 16px 6px', fontSize: 11, color: outdated ? paleta.tonOstrzegawczy : paleta.kreskaWygaszona, fontWeight: outdated ? 700 : 400 }}
        >
          {`model ENM r${projection.model_snapshot.revision} · ${statusWynikuLabel(projection)}`}
          {view.energization_basis_pl ? (
            <span data-testid="lv-domain-energization-basis" style={{ fontWeight: 400, color: paleta.kreskaWygaszona }}>{` · ${view.energization_basis_pl}`}</span>
          ) : null}
        </div>
      ) : null}
      <div data-testid="lv-domain-scroll" data-scroll={fit.scroll ? 'true' : 'false'} style={{ width: viewportWidth, height: canvasHeight, overflow: fit.scroll ? 'auto' : 'hidden' }}>
      <svg data-testid="lv-domain-svg" data-fit-scale={fit.s} width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ display: 'block' }}>
        <rect x={0} y={0} width={svgWidth} height={svgHeight} fill={paleta.tlo} />
        <g data-testid="lv-domain-world" transform={`translate(${fit.tx} ${fit.ty}) scale(${fit.s})`}>
          <g data-testid="lv-domain-highlight">
            {scene.edges.filter((e) => highlighted.has(e.ref)).map((edge) => (
              ctx.widoczne('podswietlenieToru') ? (
                <path key={`hl-${edge.ref}`} data-testid={`lv-domain-highlight-${edge.ref}`} d={sciezkaOrtogonalna(edge.x1, edge.y1, edge.x2, edge.y2)} fill="none" stroke={paleta.podswietlenie} strokeOpacity={0.35} strokeWidth={ctx.sp(LINE_SCREEN_PX.highlight)} strokeLinecap="round" strokeLinejoin="round" />
              ) : null
            ))}
          </g>
          <g data-testid="lv-domain-edges">
            {scene.edges.map((edge) => (
              <SceneEdgeLine key={edge.ref} edge={edge} scene={scene} ctx={ctx} />
            ))}
          </g>
          <g data-testid="lv-domain-nodes">
            {scene.nodes.map((node) => {
              switch (node.kind) {
                case 'anchorBar':
                  return <AnchorBarNode key={node.ref} node={node} ctx={ctx} />;
                case 'boundaryChip':
                  return <BoundaryRefNode key={node.ref} node={node} ctx={ctx} />;
                case 'bus':
                  return (
                    <BusBarNode key={node.ref} node={node} ctx={ctx} activeOverlay={activeOverlay} resultOverlayPayload={resultOverlayPayload} voltageProfileByBusRef={voltageProfileByBusRef} outdated={outdated} onSelect={onSelect} />
                  );
                case 'boundaryTerminal':
                  return (
                    <g key={node.ref} data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref}>
                      {ctx.widoczne('zaciskGranicy') ? (
                        <circle cx={node.x} cy={node.y} r={ctx.sp(JUNCTION_RADIUS_SCREEN_PX + 1)} fill={paleta.wypelnienieZacisku} stroke={paleta.kreskaGranicy} strokeWidth={ctx.sp(1.2)} />
                      ) : null}
                    </g>
                  );
                case 'terminal':
                  return <TerminalNode key={node.ref} node={node} ctx={ctx} onSelect={onSelect} />;
                default:
                  return (
                    <ElementNode
                      key={node.ref}
                      node={node}
                      ctx={ctx}
                      activeOverlay={activeOverlay}
                      resultOverlayPayload={resultOverlayPayload}
                      swzEntry={swzByFeederRef[node.ref]}
                      outdated={outdated}
                      onSelect={onSelect}
                    />
                  );
              }
            })}
          </g>
        </g>
      </svg>
      </div>
      {warningsOpen ? (
        <WarningsPanel messages={projection.validation_messages} paleta={paleta} onPick={(ref) => setSelectedRef(ref)} onClose={() => setWarningsOpen(false)} />
      ) : null}
      {selectedFeeder ? (
        <LvFeederPanel feeder={selectedFeeder.feeder} transformerRef={selectedFeeder.transformerRef} projection={projection} paleta={paleta} resultOverlayPayload={resultOverlayPayload} onClose={() => setSelectedRef(null)} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panele.
// ---------------------------------------------------------------------------

function WarningsPanel({ messages, paleta, onPick, onClose }: {
  readonly messages: readonly LvDomainValidationMessage[];
  readonly paleta: PaletaNn;
  readonly onPick: (ref: string) => void;
  readonly onClose: () => void;
}): JSX.Element {
  return (
    <aside data-testid="lv-domain-warnings-panel" style={{ position: 'absolute', top: 100, left: 16, bottom: 16, width: 380, maxWidth: 'calc(100% - 32px)', overflow: 'auto', padding: 14, border: `1px solid ${paleta.kreskaWygaszona}`, borderRadius: 6, background: paleta.panelTlo, boxShadow: paleta.panelCien, zIndex: 4, fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Audyt topologii i stanu</div>
        <button type="button" onClick={onClose} style={overlayButtonStyle(false, paleta)}>Zamknij</button>
      </div>
      {messages.length === 0 ? (
        <div style={{ marginTop: 10, color: paleta.kreskaWygaszona }}>Brak komunikatów — topologia i stany bez zastrzeżeń.</div>
      ) : (
        <ol style={{ margin: '10px 0 0', paddingLeft: 18 }}>
          {messages.map((m, i) => (
            <li key={`${m.code}-${i}`} data-testid={`lv-domain-warning-${m.code}`} data-severity={m.severity} style={{ marginBottom: 8 }}>
              <div style={{ color: tonWagi(m.severity, paleta), fontWeight: 700, fontFamily: 'monospace' }}>{`${m.code} · ${m.severity === 'BLOCKER' ? 'blokujące' : m.severity === 'IMPORTANT' ? 'istotne' : 'informacja'}`}</div>
              <div>{m.message_pl}</div>
              {m.element_refs.length > 0 ? (
                <div style={{ marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {m.element_refs.map((ref) => (
                    <button key={ref} type="button" onClick={() => onPick(ref)} style={{ ...overlayButtonStyle(false, paleta), fontFamily: 'monospace' }}>{ref}</button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

function LvFeederPanel({ feeder, transformerRef, projection, paleta, resultOverlayPayload, onClose }: {
  readonly feeder: LvDomainSwzFeederV1;
  readonly transformerRef: string;
  readonly projection: LvDomainProjectionV1;
  readonly paleta: PaletaNn;
  readonly resultOverlayPayload: RawOverlayPayload | null;
  readonly onClose: () => void;
}): JSX.Element {
  const resultElement = resultOverlayPayload?.elements[feeder.feeder_root_branch_ref];
  const metrics = Object.values(resultElement?.metrics ?? {});
  const swz = feeder.swz.swz;
  const statusTone = swz?.status === 'spełnia' ? paleta.tonOk : swz?.status === 'nie spełnia' ? paleta.tonBledu : paleta.tonOstrzegawczy;
  const shortHash = (value: string): string => (value.length > 14 ? `${value.slice(0, 14)}…` : value);
  const segment = projection.graph.segments.find((s) => s.segment_id === feeder.feeder_root_branch_ref);
  const zabezpieczenia = projection.graph.protection_assignments.filter((p) => p.breaker_ref === feeder.feeder_root_branch_ref);
  const urzadzenie = projection.graph.devices.find((d) => d.ref_id === feeder.feeder_root_branch_ref);
  const galaz = projection.graph.branches.find((b) => b.ref_id === feeder.feeder_root_branch_ref);
  const aparat = urzadzenie ? wpisAparatu(urzadzenie.device_type, urzadzenie.device_kind, urzadzenie.catalog_namespace) : null;
  return (
    <aside data-testid="lv-domain-feeder-panel" data-feeder-ref={feeder.feeder_root_branch_ref} style={{ position: 'absolute', top: 100, right: 16, bottom: 16, width: 350, maxWidth: 'calc(100% - 32px)', overflow: 'auto', padding: 16, border: `1px solid ${paleta.kreskaWygaszona}`, borderRadius: 6, background: paleta.panelTlo, boxShadow: paleta.panelCien, zIndex: 4, fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ color: paleta.kreskaBazowa, fontWeight: 700 }}>Odpływ nN</div>
          <div style={{ color: paleta.kreskaWygaszona, fontFamily: 'monospace' }}>{feeder.feeder_root_branch_ref}</div>
        </div>
        <button type="button" onClick={onClose} style={overlayButtonStyle(false, paleta)}>Zamknij</button>
      </div>
      <section style={{ marginTop: 14 }} data-testid="lv-domain-feeder-aparat">
        <div style={{ fontWeight: 600 }}>Aparat pola</div>
        {aparat && urzadzenie ? (
          <>
            <div style={{ marginTop: 4 }}>{`${galaz?.name ?? urzadzenie.ref_id} · ${aparat.nazwaPl.toUpperCase()}`}</div>
            <div style={{ color: paleta.kreskaWygaszona, fontFamily: 'monospace' }}>
              {`${aparat.klasaOznaczenia} · stan: ${stanSlowny(urzadzenie.device_state)} · katalog: ${galaz?.catalog_ref ?? 'brak'}${urzadzenie.device_kind ? ` · rodzaj: ${urzadzenie.device_kind}` : ' · rodzaj: katalog nie klasyfikuje'}`}
            </div>
          </>
        ) : (
          <div style={{ color: paleta.kreskaWygaszona, marginTop: 4 }}>Odpływ bez aparatu w modelu (audyt NN-AUD-07).</div>
        )}
      </section>
      <section style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 600 }}>Stan zacisków (topologia)</div>
        <div data-testid="lv-domain-feeder-terminals" style={{ color: paleta.kreskaWygaszona, marginTop: 4 }}>
          {segment
            ? `łączność: ${segment.connectivity_state === 'CLOSED' ? 'zamknięty' : 'otwarty'} · zacisk A: ${segment.from_terminal.energization_state} (${segment.from_terminal.island_ref}) · zacisk B: ${segment.to_terminal.energization_state} (${segment.to_terminal.island_ref})`
            : 'brak danych odcinka'}
        </div>
      </section>
      <section style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 600 }}>Zabezpieczenia aparatu</div>
        {zabezpieczenia.length === 0 ? (
          <div style={{ color: paleta.kreskaWygaszona, marginTop: 4 }}>Model nie przypisuje zabezpieczenia do tego aparatu.</div>
        ) : zabezpieczenia.map((z) => (
          <div key={z.ref_id} data-testid={`lv-domain-feeder-relay-${z.ref_id}`} style={{ marginTop: 4 }}>
            <div>{z.name}</div>
            <div style={{ color: paleta.kreskaWygaszona, fontFamily: 'monospace' }}>
              {`funkcje: ${znakiIecPelne(z.function_codes).join(' · ') || '—'} (ANSI ${kodyAnsiPelne(z.function_codes).join(', ') || '—'}) · CT: ${z.ct_ref ?? 'brak'} · ${z.is_enabled ? 'aktywne' : 'wyłączone'}`}
            </div>
            <div style={{ color: paleta.kreskaWygaszona }}>
              {nazwyFunkcjiPl(z.function_codes).join(' · ') || '—'}
            </div>
          </div>
        ))}
      </section>
      <section style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 600 }}>Model ENM</div>
        <div style={{ color: paleta.kreskaWygaszona, marginTop: 4 }}>{`rewizja ${projection.model_snapshot.revision} · scenariusz ${projection.scenario_id}`}</div>
        <div title={projection.model_snapshot.model_hash} style={{ color: paleta.kreskaWygaszona, fontFamily: 'monospace' }}>{`model ${shortHash(projection.model_snapshot.model_hash)}`}</div>
      </section>
      <section style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 600 }}>Wynik przebiegu</div>
        <div style={{ color: projection.result_snapshot.status === 'OUTDATED' ? paleta.tonOstrzegawczy : paleta.kreskaWygaszona, marginTop: 4 }}>{statusWynikuLabel(projection)}</div>
        {metrics.length > 0 ? metrics.map((metric) => (
          <div key={metric.code} style={{ fontFamily: 'monospace', marginTop: 3 }}>{`${metric.code}: ${formatujMetryke(metric)}`}</div>
        )) : (
          <div style={{ color: paleta.kreskaWygaszona, marginTop: 3 }}>Brak metryk tego odpływu w aktywnym przebiegu.</div>
        )}
      </section>
      <section style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 600 }}>Pętla zwarcia i SWZ</div>
        <div data-testid="lv-domain-feeder-transformer" data-transformer-ref={transformerRef} style={{ color: paleta.kreskaWygaszona, marginTop: 4 }}>
          {`liczone od transformatora: ${transformerRef} · zasilanie: ${feeder.supply ?? 'brak danych'}`}
        </div>
        {feeder.supply_assumption_pl ? (
          <div data-testid="lv-domain-feeder-supply-assumption" style={{ color: paleta.tonOstrzegawczy, marginTop: 4 }}>{feeder.supply_assumption_pl}</div>
        ) : null}
        <div style={{ color: paleta.kreskaWygaszona, marginTop: 4 }}>{`punkt najgorszy: ${feeder.worst_point_bus_ref ?? 'brak'} · punkty: ${feeder.points.length}`}</div>
        {swz ? (
          <>
            <div style={{ color: statusTone, fontWeight: 700, marginTop: 6 }}>{`SWZ: ${swz.status}`}</div>
            <div style={{ fontFamily: 'monospace', marginTop: 3 }}>{`Ik₁ min = ${plFixed(swz.ik1_min_a, 0)} A`}</div>
            {swz.ia_wymagane_a != null ? <div style={{ fontFamily: 'monospace', marginTop: 3 }}>{`Ia wymagane = ${plFixed(swz.ia_wymagane_a, 0)} A`}</div> : null}
            <div style={{ color: paleta.kreskaWygaszona, marginTop: 6 }}>{swz.przyczyna_pl}</div>
          </>
        ) : (
          <div style={{ color: paleta.tonOstrzegawczy, marginTop: 6 }}>{feeder.swz.reason_pl ?? `SWZ: ${feeder.swz.status}`}</div>
        )}
      </section>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Węzły.
// ---------------------------------------------------------------------------

function WarningMarker({ node, ctx, dx, dy }: { readonly node: LvDomainSceneNode; readonly ctx: KontekstRysunku; readonly dx: number; readonly dy: number }): JSX.Element | null {
  // Znacznik przy elemencie WYŁĄCZNIE dla wag blokującej/istotnej — informacja
  // (np. wspólne zasilanie SN) jest w panelu audytu i na kotwicy, nie jako „!".
  const messages = (ctx.warningsByRef.get(node.ref) ?? []).filter((m) => m.severity !== 'INFO');
  if (messages.length === 0 || !ctx.widoczne('znacznikOstrzezenia')) return null;
  const worst = messages.some((m) => m.severity === 'BLOCKER') ? 'BLOCKER' : 'IMPORTANT';
  const r = ctx.sp(6.5);
  return (
    <g data-testid={`lv-domain-warning-marker-${node.ref}`} data-severity={worst}>
      <title>{messages.map((m) => `${m.code}: ${m.message_pl}`).join('\n')}</title>
      <circle cx={node.x + dx} cy={node.y + dy} r={r} fill={ctx.paleta.tlo} stroke={tonWagi(worst, ctx.paleta)} strokeWidth={ctx.sp(1.4)} />
      <text x={node.x + dx} y={node.y + dy + ctx.sp(3.4)} textAnchor="middle" fontSize={ctx.sp(SLD_LABEL.WARNING)} fontWeight={700} fill={tonWagi(worst, ctx.paleta)}>
        !
      </text>
    </g>
  );
}

/** Symbol CAD węzła: rejestr `cad/` rysowany przez `CadSymbol` — środek
 *  symbolu w (node.x, node.y), skala `k` [j. świata / u] screen-stable,
 *  kreska nieskalowana (`CAD_SYMBOL_STROKE_PX`), stan z geometrii noża,
 *  orientacja pozioma dla sprzęgła w osi szyny. Zero glifów aplikacji. */
function ScaledGlyph({ node, ctx }: { readonly node: LvDomainSceneNode; readonly ctx: KontekstRysunku }): JSX.Element | null {
  if (!node.symbolId || !ctx.widoczne(elementSymbolu(node))) return null;
  const { k } = glyphScreenSize(node, ctx.fit);
  const center = ELECTRICAL_CAD_SYMBOL_REGISTRY[node.symbolId].anchors.center;
  const state = node.kind === 'apparatus' ? switchStateOf(node.meta?.deviceState) : undefined;
  const selected = ctx.selectedRef === node.ref || ctx.highlighted.has(node.ref);
  const ink = selected ? ctx.paleta.podswietlenie : ctx.paleta.kreskaBazowa;
  const functionCodes = node.kind === 'relay' ? ((node.meta?.functionCodes as readonly string[] | undefined) ?? []) : undefined;
  return (
    <>
      {functionCodes ? (
        <title>{`${node.label} · funkcje: ${znakiIecPelne(functionCodes).join(', ')} (ANSI ${kodyAnsiPelne(functionCodes).join(', ')}) · ${nazwyFunkcjiPl(functionCodes).join(', ')}`}</title>
      ) : null}
      <CadSymbol
        id={node.symbolId}
        x={node.x - center.x * k}
        y={node.y - center.y * k}
        scale={k}
        state={state}
        orientation={orientacjaWezla(node)}
        ink={ink}
        paper={ctx.paleta.tlo}
        wnetrze={functionCodes ? znakiIec(functionCodes) : undefined}
      />
    </>
  );
}

function TerminalNode({ node, ctx, onSelect }: { readonly node: LvDomainSceneNode; readonly ctx: KontekstRysunku; readonly onSelect: (ref: string) => void }): JSX.Element {
  const degree = typeof node.meta?.degree === 'number' ? node.meta.degree : 2;
  const showDot = degree !== 2 || ctx.labelMode === 'audit';
  const energization = node.meta?.energization as LvEnergizationState | undefined;
  // Zacisk toru: węzeł (kropka pełna, stopień ≥ 3) albo zacisk (okrąg pusty)
  // z rejestru CAD; ton stanu zasilania jest DRUGIM kanałem (geometria pierwsza).
  const { k } = glyphScreenSize(node, ctx.fit);
  const center = node.symbolId ? ELECTRICAL_CAD_SYMBOL_REGISTRY[node.symbolId].anchors.center : { x: 0, y: 0 };
  return (
    <g data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref} data-energization={energization} data-degree={degree} onClick={() => onSelect(node.ref)} style={{ cursor: 'pointer' }}>
      <title>{`${node.label} · ${energization ?? '—'}`}</title>
      {showDot && ctx.widoczne('zaciskToru') && node.symbolId ? (
        <CadSymbol id={node.symbolId} x={node.x - center.x * k} y={node.y - center.y * k} scale={k} ink={tonStanuZasilania(energization, ctx.paleta)} paper={ctx.paleta.tlo} strokePx={LINE_SCREEN_PX.secondary} />
      ) : null}
      {ctx.labelMode === 'audit' && ctx.widoczne('nazwaZaciskuModelu') ? (
        <text {...textHalo(ctx)} x={node.x + ctx.sp(7)} y={node.y + ctx.sp(3.5)} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.TERTIARY)} fill={ctx.paleta.kreskaWygaszona}>
          {node.label}
        </text>
      ) : null}
      <WarningMarker node={node} ctx={ctx} dx={ctx.sp(-12)} dy={0} />
    </g>
  );
}

function AnchorBarNode({ node, ctx }: { readonly node: LvDomainSceneNode; readonly ctx: KontekstRysunku }): JSX.Element {
  const tozsamosc = typeof node.meta?.tozsamoscLabel === 'string' ? node.meta.tozsamoscLabel : node.label;
  const opis = typeof node.meta?.opisLabel === 'string' ? node.meta.opisLabel : null;
  const shared = node.meta?.shared === true;
  const systemCount = typeof node.meta?.systemCount === 'number' ? node.meta.systemCount : 1;
  const systemIndex = typeof node.meta?.systemIndex === 'number' ? node.meta.systemIndex : 1;
  const status = node.meta?.status;
  const left = node.barLeft ?? node.x;
  const right = node.barRight ?? node.x;
  const highlighted = ctx.highlighted.has(node.ref) || (node.meta?.transformerRefs as readonly string[] | undefined)?.some((ref) => ctx.highlighted.has(`anchor#${ref}`));
  // Opis (Sk″/Ik″ albo powód braku) zawijany do pasa kotwicy (§30) — dwie
  // niezależne kotwice SN obok siebie nie piszą po sobie ani poza kadr.
  const labelMaxWidth = typeof node.meta?.labelMaxWidth === 'number' ? node.meta.labelMaxWidth : TOKENY_GEOMETRII.sourceSlot * 3;
  const opisLinie = opis ? zawinNazwe(opis, maxCharsForWidth(labelMaxWidth - 40, SLD_LABEL.RESULT, ctx.fit, CHAR_WIDTH_RATIO_MONO), 4) : [];
  const opisStep = ctx.sp(SLD_LABEL.RESULT * LINE_HEIGHT);
  const opisY0 = node.y - ctx.sp(6) - ctx.sp(SLD_LABEL.SECONDARY * LINE_HEIGHT) - opisStep * (opisLinie.length - 1);
  return (
    <g data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref} data-shared={shared ? 'true' : 'false'} data-system-count={systemCount} data-anchor-status={String(status)}>
      {ctx.widoczne('kotwicaSystemuSn') ? (
        <>
          <line x1={left} y1={node.y} x2={right} y2={node.y} stroke={highlighted ? ctx.paleta.podswietlenie : ctx.paleta.kreskaBazowa} strokeWidth={ctx.sp(BUS_STROKE_SCREEN_PX.sub)} strokeLinecap="square" strokeDasharray={status === 'OK' ? undefined : `${ctx.sp(6)} ${ctx.sp(4)}`} />
          {/* Znak sieci zewnętrznej (IEC 60617 — falisty symbol źródła) nad kreską: kotwica to SYSTEM, nie kolejny aparat. */}
          <path d={`M ${left} ${node.y - ctx.sp(9)} q ${ctx.sp(5)} ${-ctx.sp(6)} ${ctx.sp(10)} 0 t ${ctx.sp(10)} 0`} fill="none" stroke={ctx.paleta.kreskaBazowa} strokeWidth={ctx.sp(1.2)} />
        </>
      ) : null}
      {ctx.widoczne('nazwaKotwicyZrodla') ? (
        <text {...textHalo(ctx)} x={left + ctx.sp(28)} y={node.y - ctx.sp(6)} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.SECONDARY)} fontWeight={700} fill={ctx.paleta.kreskaBazowa}>
          {tozsamosc}
          {systemCount > 1 ? (
            <tspan fontWeight={400} fill={ctx.paleta.kreskaWygaszona}>{`  ·  system SN ${systemIndex} z ${systemCount} (niezależny)`}</tspan>
          ) : null}
          {shared ? <tspan fontWeight={400} fill={ctx.paleta.kreskaWygaszona}>{'  ·  wspólne zasilanie transformatorów'}</tspan> : null}
        </text>
      ) : null}
      {opisLinie.length > 0 && ctx.widoczne('parametryKotwicyZrodla') ? (
        <text {...textHalo(ctx)} data-testid={`lv-domain-anchor-opis-${node.ref}`} x={left + ctx.sp(28)} y={opisY0} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.RESULT)} fill={ctx.paleta.kreskaWygaszona} fontFamily="monospace">
          {opisLinie.map((linia, i) => (
            <tspan key={i} x={left + ctx.sp(28)} dy={i === 0 ? 0 : opisStep}>{linia}</tspan>
          ))}
        </text>
      ) : null}
    </g>
  );
}

function BusBarNode({ node, ctx, activeOverlay, resultOverlayPayload, voltageProfileByBusRef, outdated, onSelect }: {
  readonly node: LvDomainSceneNode;
  readonly ctx: KontekstRysunku;
  readonly activeOverlay: LvDomainOverlayId | null;
  readonly resultOverlayPayload: RawOverlayPayload | null;
  readonly voltageProfileByBusRef: Readonly<Record<string, LvDomainVoltageProfileRow>>;
  readonly outdated: boolean;
  readonly onSelect: (ref: string) => void;
}): JSX.Element {
  const left = node.barLeft ?? node.x;
  const right = node.barRight ?? node.x;
  const isMain = node.meta?.busTier !== 'sub';
  const strokeWidth = ctx.sp(isMain ? BUS_STROKE_SCREEN_PX.main : BUS_STROKE_SCREEN_PX.sub);
  const energization = node.meta?.energization as LvEnergizationState | undefined;
  const stanLabel = energization ? etykietaStanuZasilania(energization) : null;
  const supplyRefs = (node.meta?.supplyRefs as readonly string[] | undefined) ?? [];
  const island = typeof node.meta?.islandRef === 'string' ? ctx.islandByRef.get(node.meta.islandRef) : undefined;
  const wyspaLinie = island ? etykietaWyspy(island, ctx.nameByRef) : null;
  const feederCount = typeof node.meta?.feederCount === 'number' ? node.meta.feederCount : null;
  const dash = wzorKreskiStanu(energization);
  const selected = ctx.selectedRef === node.ref;
  const labelY = node.y - ctx.sp(TOKENY_GEOMETRII.labelGap) - strokeWidth / 2;
  const labelPx = isMain ? SLD_LABEL.PRIMARY : SLD_LABEL.SECONDARY + 1;
  const labelX = typeof node.meta?.labelX === 'number' ? node.meta.labelX : left;
  const stanLinia = stanLabel
    ? `${stanLabel}${energization === 'MULTISOURCE' && supplyRefs.length ? ` (${supplyRefs.map((ref) => ctx.nameByRef.get(ref) ?? ref).join(', ')})` : ''}`
    : null;
  // Nazwa sekcji zawijana do długości kreski (§30; wąski ekran §43): długa
  // nazwa rozdzielnicy nie wychodzi poza kreskę ani poza kadr.
  const nazwaLinie = zawinNazwe(node.label, maxCharsForWidth(Math.max(right - labelX, TOKENY_GEOMETRII.feederGap) - 8, labelPx, ctx.fit, CHAR_WIDTH_RATIO_BOLD), 2);
  const nazwaStep = ctx.sp(labelPx * LINE_HEIGHT);
  const nazwaY0 = labelY - nazwaStep * (nazwaLinie.length - 1);
  // Wiersze NAD kreską (od dołu): nazwa → stan zasilania → wyspa (1–2
  // wiersze). Pod kreską stoją aparaty odpływów, więc żaden tekst szyny nie
  // schodzi poniżej.
  const stanStep = ctx.sp(SLD_LABEL.STATUS * LINE_HEIGHT);
  const stanY = nazwaY0 - nazwaStep;
  const wyspaY0 = (stanLinia ? stanY - stanStep : stanY) - stanStep * ((wyspaLinie?.length ?? 1) - 1);
  const najwyzszyWiersz = wyspaLinie ? wyspaY0 : stanLinia ? stanY : nazwaY0;
  const kotwicaPlakietki: KotwicaPlakietki = isMain
    ? { x: right + ctx.sp(TOKENY_GEOMETRII.labelGap), textAnchor: 'start', y0: node.y + ctx.sp(BUS_STROKE_SCREEN_PX.main / 2 + SLD_LABEL.RESULT + 4), kierunek: 1, maxChars: null }
    : {
        x: labelX,
        textAnchor: 'start',
        y0: najwyzszyWiersz - ctx.sp(SLD_LABEL.RESULT * LINE_HEIGHT + 2),
        kierunek: -1,
        maxChars: maxCharsForWidth(Math.max(right - labelX, TOKENY_GEOMETRII.feederGap) - 8, SLD_LABEL.RESULT, ctx.fit, CHAR_WIDTH_RATIO_MONO),
      };
  return (
    <g
      data-testid={`lv-domain-node-${node.ref}`}
      data-node-kind={node.kind}
      data-owner-ref={node.ref}
      data-bus-tier={isMain ? 'main' : 'sub'}
      data-energization={energization}
      data-island-ref={typeof node.meta?.islandRef === 'string' ? node.meta.islandRef : undefined}
      data-islanded={island ? String(island.is_islanded) : undefined}
      onClick={() => onSelect(node.ref)}
      style={{ cursor: 'pointer' }}
    >
      {ctx.widoczne('szynaSekcji') ? (
        <line x1={left} y1={node.y} x2={right} y2={node.y} stroke={selected ? ctx.paleta.podswietlenie : tonStanuZasilania(energization, ctx.paleta)} strokeWidth={strokeWidth} strokeLinecap="square" strokeDasharray={dash ? `${ctx.sp(dash[0])} ${ctx.sp(dash[1])}` : undefined} />
      ) : null}
      {energization === 'CONFLICT' && ctx.widoczne('szynaSekcji') ? (
        // Nośnik geometryczny konfliktu: podwójna kreska (dwa źródła spięte).
        <line x1={left} y1={node.y + strokeWidth} x2={right} y2={node.y + strokeWidth} stroke={ctx.paleta.tonBledu} strokeWidth={ctx.sp(1.4)} strokeDasharray={`${ctx.sp(2)} ${ctx.sp(2)}`} />
      ) : null}
      {ctx.widoczne('nazwaSekcji') ? (
        <text {...textHalo(ctx)} x={labelX} y={nazwaY0} textAnchor="start" fontSize={ctx.sp(labelPx)} fontWeight={700} fill={ctx.paleta.kreskaBazowa}>
          {nazwaLinie.map((linia, i) => (
            <tspan key={i} x={labelX} dy={i === 0 ? 0 : nazwaStep}>{linia}</tspan>
          ))}
          {node.meta?.voltageKv != null && ctx.widoczne('napiecieSekcji') ? (
            <tspan fontSize={ctx.sp(SLD_LABEL.SECONDARY)} fontWeight={400} fill={ctx.paleta.kreskaWygaszona}>{`  ·  ${plNumber(node.meta.voltageKv as number)} kV`}</tspan>
          ) : null}
          {feederCount != null && ctx.widoczne('licznikOdplywowSekcji') ? (
            <tspan data-testid={`lv-domain-bus-licznik-${node.ref}`} fontSize={ctx.sp(SLD_LABEL.SECONDARY)} fontWeight={600} fill={ctx.paleta.kreskaWygaszona}>{`  ·  ${licznikOdplywowLabel(feederCount)}`}</tspan>
          ) : null}
        </text>
      ) : null}
      {stanLinia && ctx.widoczne('znacznikStanuZasilania') ? (
        <text
          {...textHalo(ctx)}
          data-testid={`lv-domain-bus-stan-${node.ref}`}
          data-energization={energization}
          x={labelX}
          y={stanY}
          textAnchor="start"
          fontSize={ctx.sp(SLD_LABEL.STATUS)}
          fontWeight={700}
          fill={energization === 'CONFLICT' ? ctx.paleta.tonBledu : energization === 'MULTISOURCE' ? ctx.paleta.tonInfo : tonStanuZasilania(energization, ctx.paleta)}
        >
          {stanLinia}
        </text>
      ) : null}
      {wyspaLinie && ctx.widoczne('znacznikWyspy') ? (
        <text
          {...textHalo(ctx)}
          data-testid={`lv-domain-bus-wyspa-${node.ref}`}
          x={labelX}
          y={wyspaY0}
          textAnchor="start"
          fontSize={ctx.sp(SLD_LABEL.STATUS)}
          fontWeight={700}
          fill={island?.is_energized === false ? ctx.paleta.bezNapiecia : ctx.paleta.tonOstrzegawczy}
        >
          {wyspaLinie.map((linia, i) => (
            <tspan key={i} x={labelX} dy={i === 0 ? 0 : stanStep} fontWeight={i === 0 ? 700 : 500}>{linia}</tspan>
          ))}
        </text>
      ) : null}
      <WarningMarker node={node} ctx={ctx} dx={right - node.x + ctx.sp(12)} dy={0} />
      {activeOverlay === 'shortCircuit' || activeOverlay === 'loads' ? (
        <BusResultBadge node={node} ctx={ctx} overlay={activeOverlay} payload={resultOverlayPayload} outdated={outdated} kotwica={kotwicaPlakietki} />
      ) : null}
      {activeOverlay === 'voltageDrop' ? <VoltageDropBadge node={node} ctx={ctx} row={voltageProfileByBusRef[node.ref]} outdated={outdated} kotwica={kotwicaPlakietki} /> : null}
    </g>
  );
}

/** Kotwica plakietek wyniku szyny (§18): sekcja główna — ZA prawym końcem
 *  kreski, pod nią (pas wolny: przerwa między sekcjami albo skraj sceny);
 *  podrozdzielnica — wiersze NAD kreską, od etykiety (za pionem zasilającym)
 *  w górę, ZAWIJANE do długości kreski (obok krótkiej kreski podrozdzielnicy
 *  biegnie kolumna sąsiedniego odpływu rozdzielnicy nadrzędnej, a nad nią
 *  jest wolny pas do aparatu zasilającego). Jedno miejsce dla wszystkich
 *  nakładek szyny. */
interface KotwicaPlakietki {
  readonly x: number;
  readonly textAnchor: 'start' | 'end';
  /** Y pierwszego wiersza; `kierunek` = −1 układa kolejne wiersze W GÓRĘ. */
  readonly y0: number;
  readonly kierunek: 1 | -1;
  /** Limit znaków w wierszu (zawijanie) albo `null` — pas bez ograniczeń. */
  readonly maxChars: number | null;
}

function wierszePlakietki(kotwica: KotwicaPlakietki, teksty: readonly string[], maxLines = 4): readonly string[] {
  return teksty.flatMap((t) => (kotwica.maxChars ? zawinNazwe(t, kotwica.maxChars, maxLines) : [t]));
}

function BoundaryRefNode({ node, ctx }: { readonly node: LvDomainSceneNode; readonly ctx: KontekstRysunku }): JSX.Element {
  return (
    <g data-testid={`lv-domain-node-${node.ref}`} data-node-kind={node.kind} data-owner-ref={node.ref} role="button" aria-label={`Otwórz domenę ${node.label.replace('→ ', '')}`}>
      {ctx.widoczne('nazwaGranicy') ? (
        <text {...textHalo(ctx)} x={node.x - ctx.sp(2)} y={node.y + ctx.sp(4)} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.SECONDARY + 0.5)} fontWeight={600} fill={ctx.paleta.kreskaGranicy}>
          {node.label}
        </text>
      ) : null}
      {node.meta?.voltageKv != null && ctx.widoczne('napiecieGranicy') ? (
        <text {...textHalo(ctx)} x={node.x - ctx.sp(2)} y={node.y + ctx.sp(17)} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.TERTIARY)} fill={ctx.paleta.kreskaWygaszona}>
          {`${plNumber(node.meta.voltageKv as number)} kV · granica domeny`}
        </text>
      ) : null}
    </g>
  );
}

function ElementNode({ node, ctx, activeOverlay, resultOverlayPayload, swzEntry, outdated, onSelect }: {
  readonly node: LvDomainSceneNode;
  readonly ctx: KontekstRysunku;
  readonly activeOverlay: LvDomainOverlayId | null;
  readonly resultOverlayPayload: RawOverlayPayload | null;
  readonly swzEntry: SwzOverlayEntry | undefined;
  readonly outdated: boolean;
  readonly onSelect: (ref: string) => void;
}): JSX.Element {
  const selectable = node.kind === 'apparatus' || node.kind === 'load' || node.kind === 'generator' || node.kind === 'transformer';
  const glyph = glyphScreenSize(node, ctx.fit);
  return (
    <g
      data-testid={`lv-domain-node-${node.ref}`}
      data-node-kind={node.kind}
      data-owner-ref={node.ref}
      data-device-state={node.kind === 'apparatus' ? String(node.meta?.deviceState) : undefined}
      data-device-role={node.kind === 'apparatus' ? String(node.meta?.role) : undefined}
      data-selected={ctx.selectedRef === node.ref ? 'true' : undefined}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      onClick={selectable ? () => onSelect(node.ref) : undefined}
      onKeyDown={selectable ? (event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(node.ref); } : undefined}
      style={{ cursor: selectable ? 'pointer' : undefined }}
    >
      {/* Pełna nazwa i nazwa polska klasy aparatu w podpowiedzi (R2 §17/§18) —
          etykieta na kanwie jest skracana wielokropkiem, nigdy łamana. */}
      {node.kind === 'apparatus' ? (
        <title>{`${node.label} · ${String(node.meta?.nazwaPl ?? '')} · ${stanSlowny((node.meta?.deviceState as LvDeviceState | undefined) ?? 'UNKNOWN')}`}</title>
      ) : node.kind === 'load' || node.kind === 'generator' || node.kind === 'transformer' ? (
        <title>{node.kind === 'transformer' ? `${String(node.meta?.name ?? node.ref)} · ${node.label}` : node.label}</title>
      ) : null}
      <ScaledGlyph node={node} ctx={ctx} />
      <NodeLabel node={node} ctx={ctx} />
      {/* Transformator: znacznik na wysokości środka glifu (górny róg zajmuje
          tick zacisku „SN"); pozostałe symbole — górny lewy róg. */}
      <WarningMarker node={node} ctx={ctx} dx={-ctx.sp(glyph.w / 2 + 11)} dy={node.kind === 'transformer' ? 0 : -ctx.sp(glyph.h / 2)} />
      {node.kind === 'apparatus' && activeOverlay === 'swz' ? <SwzBadge node={node} ctx={ctx} entry={swzEntry} /> : null}
      {node.kind === 'apparatus' && activeOverlay === 'loads' ? <ApparatusResultBadge node={node} ctx={ctx} payload={resultOverlayPayload} outdated={outdated} /> : null}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Krawędzie.
// ---------------------------------------------------------------------------

function SceneEdgeLine({ edge, scene, ctx }: { readonly edge: LvDomainSceneEdge; readonly scene: LvDomainScene; readonly ctx: KontekstRysunku }): JSX.Element | null {
  if (!ctx.widoczne(elementKrawedzi(edge.kind))) return null;
  const isCable = edge.kind === 'cable';
  const isBoundaryLink = edge.kind === 'boundaryLink';
  const isRelayLink = edge.kind === 'relayLink';
  const energization = edge.meta?.energization as LvEnergizationState | undefined;
  const highlighted = ctx.highlighted.has(edge.ref);
  const stroke = isRelayLink
    ? ctx.paleta.kreskaWygaszona
    : isBoundaryLink
      ? ctx.paleta.kreskaGranicy
      : highlighted
        ? ctx.paleta.podswietlenie
        : isCable && (energization === undefined || energization === 'ENERGIZED' || energization === 'MULTISOURCE')
          ? ctx.paleta.kreskaKabla
          : tonStanuZasilania(energization, ctx.paleta);
  const dashPattern = isBoundaryLink ? LINE_DASH_SCREEN_PX.boundary : isRelayLink ? ([1.5, 3] as const) : wzorKreskiStanu(energization);
  const dash = dashPattern ? `${ctx.sp(dashPattern[0])} ${ctx.sp(dashPattern[1])}` : undefined;
  const width = ctx.sp(
    edge.kind === 'coupler' ? LINE_SCREEN_PX.coupler : isCable ? LINE_SCREEN_PX.cable : isBoundaryLink ? LINE_SCREEN_PX.boundary : isRelayLink ? LINE_SCREEN_PX.secondary : LINE_SCREEN_PX.connection,
  );

  // Kikut kończy się DOKŁADNIE na zacisku symbolu CAD (symbol niesie własne
  // odcinki przewodu od zacisku do styku — tor jest ciągły, bez przerwy i
  // bez nakładki); sprzęgło poziome: zaciski po lewej/prawej.
  let { x1, y1, x2, y2 } = edge;
  const deviceRef = typeof edge.meta?.deviceRef === 'string' ? edge.meta.deviceRef : null;
  if (deviceRef) {
    const device = scene.nodes.find((n) => n.ref === deviceRef && n.kind === 'apparatus');
    if (device) {
      const g = glyphScreenSize(device, ctx.fit);
      const horizontal = device.meta?.horizontal === true;
      const gap = ctx.sp((horizontal ? g.w : g.h) / 2);
      if (edge.meta?.side === 'a') {
        if (horizontal) x2 = device.x - gap; else y2 = device.y - gap;
      } else if (horizontal) {
        x1 = device.x + gap;
      } else {
        y1 = device.y + gap;
      }
    }
  }
  return (
    <g data-testid={`lv-domain-edge-${edge.ref}`} data-edge-kind={edge.kind} data-energization={energization} data-connectivity={typeof edge.meta?.connectivity === 'string' ? edge.meta.connectivity : undefined}>
      <path d={sciezkaOrtogonalna(x1, y1, x2, y2)} fill="none" stroke={stroke} strokeWidth={width} strokeDasharray={dash} strokeLinecap={isCable ? 'round' : undefined} strokeLinejoin="round" />
      {isBoundaryLink ? <path d={`M ${x2} ${y2} l ${-ctx.sp(9)} ${-ctx.sp(4)} l 0 ${ctx.sp(8)} Z`} fill={ctx.paleta.kreskaGranicy} stroke="none" /> : null}
      {energization === 'UNKNOWN' && !isRelayLink ? (
        // Znak „?" PO LEWEJ pionu — po prawej biegną etykiety (nazwy sekcji,
        // aparatów), po lewej pas jest wolny.
        <text {...textHalo(ctx)} x={x2 - ctx.sp(6)} y={(y1 + y2) / 2 + ctx.sp(4)} textAnchor="end" fontSize={ctx.sp(SLD_LABEL.STATUS)} fontWeight={700} fill={ctx.paleta.kreskaWygaszona}>?</text>
      ) : null}
      {isCable && typeof edge.meta?.catalogRef === 'string' && edge.meta.catalogRef && ctx.widoczne('parametrKabla') ? (
        // Parametr kabla (klucz katalogowy z modelu) po LEWEJ pionu kabla, w
        // 7/8 jego długości — po prawej biegnie kolumna etykiet aparatu, a w
        // POŁOWIE kabla siedzi przekładnik z etykietą po prawej (sąsiedniej
        // kolumny); inny wiersz = zero kolizji z sąsiadem. Jeden wiersz
        // (człony klucza po spacji) mieści się w połowie slotu.
        <text {...textHalo(ctx)} data-testid={`lv-domain-kabel-${edge.ref}`} x={Math.min(x1, x2) - ctx.sp(CAD_U_PX * 8 + 4)} y={y1 + ((y2 - y1) * 7) / 8 + ctx.sp(3.5)} textAnchor="end" fontSize={ctx.sp(SLD_LABEL.TERTIARY)} fill={ctx.paleta.kreskaWygaszona} fontFamily="monospace">
          {czlonyKluczaKatalogowego(edge.meta.catalogRef, typeof edge.meta?.catalogNamespace === 'string' ? edge.meta.catalogNamespace : null).join(' ')}
        </text>
      ) : null}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Etykiety węzłów (cztery poziomy graficzne §20).
// ---------------------------------------------------------------------------

function NodeLabel({ node, ctx }: { readonly node: LvDomainSceneNode; readonly ctx: KontekstRysunku }): JSX.Element | null {
  const glyph = glyphScreenSize(node, ctx.fit);
  const pokazNazwe = ctx.widoczne(elementNazwy(node));
  if (node.kind === 'transformer') {
    const name = typeof node.meta?.name === 'string' ? node.meta.name : node.ref;
    const snMva = typeof node.meta?.snMva === 'number' ? node.meta.snMva : null;
    const uhv = typeof node.meta?.uhvKv === 'number' ? node.meta.uhvKv : null;
    const ulv = typeof node.meta?.ulvKv === 'number' ? node.meta.ulvKv : null;
    const group = typeof node.meta?.vectorGroup === 'string' ? node.meta.vectorGroup : null;
    const uk = typeof node.meta?.ukPercent === 'number' ? node.meta.ukPercent : null;
    const xText = node.x + ctx.sp(glyph.w / 2 + TOKENY_GEOMETRII.labelGap);
    const pokazTabliczke = ctx.widoczne('tabliczkaTransformatora');
    const step = ctx.sp(SLD_LABEL.SECONDARY * LINE_HEIGHT);
    return (
      <g {...textHalo(ctx)}>
        {pokazNazwe ? (
          <text x={xText} y={node.y - step} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.PRIMARY)} fontWeight={700} fill={ctx.paleta.kreskaBazowa}>{name}</text>
        ) : null}
        {snMva != null && pokazTabliczke ? (
          <text x={xText} y={node.y} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.PRIMARY - 1)} fontWeight={600} fill={ctx.paleta.kreskaBazowa}>{snKvaLabel(snMva)}</text>
        ) : null}
        {uhv != null && ulv != null && pokazTabliczke ? (
          <text x={xText} y={node.y + step} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.SECONDARY)} fill={ctx.paleta.kreskaWygaszona}>{`${plNumber(uhv)}/${plNumber(ulv)} kV${group ? ` · ${group}` : ''}`}</text>
        ) : null}
        {uk != null && pokazTabliczke ? (
          <text x={xText} y={node.y + 2 * step} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.SECONDARY)} fill={ctx.paleta.kreskaWygaszona}>{`uk = ${plNumber(uk)}%`}</text>
        ) : null}
        {/* Zaciski jawne (§9): SN u góry, nN u dołu glifu. */}
        {pokazTabliczke ? (
          <>
            <text x={node.x - ctx.sp(glyph.w / 2 + 4)} y={node.y - ctx.sp(glyph.h / 2) + ctx.sp(4)} textAnchor="end" fontSize={ctx.sp(SLD_LABEL.TERTIARY)} fill={ctx.paleta.kreskaWygaszona}>SN</text>
            <text x={node.x - ctx.sp(glyph.w / 2 + 4)} y={node.y + ctx.sp(glyph.h / 2)} textAnchor="end" fontSize={ctx.sp(SLD_LABEL.TERTIARY)} fill={ctx.paleta.kreskaWygaszona}>nN</text>
          </>
        ) : null}
      </g>
    );
  }
  if (node.kind === 'apparatus') {
    const isCoupler = node.meta?.role === 'coupler';
    const state = node.meta?.deviceState as LvDeviceState | undefined;
    const stateWord = state ? stanSlowny(state) : null;
    if (isCoupler) {
      // Nazwa i stan NAD glifem: pas nad kreską między sekcjami jest wolny
      // (źródła stoją na krańcach sekcji), a pod kreską leży pas aparatów odpływów.
      return (
        <g {...textHalo(ctx)}>
          {stateWord && ctx.widoczne('stanSlownyLacznika') ? (
            <text data-testid={`lv-domain-stan-${node.ref}`} x={node.x} y={node.y - ctx.sp(glyph.h / 2 + 8 + SLD_LABEL.PRIMARY * LINE_HEIGHT)} textAnchor="middle" fontSize={ctx.sp(SLD_LABEL.STATUS)} fontWeight={700} fill={state === 'OPEN' ? ctx.paleta.tonOstrzegawczy : ctx.paleta.kreskaWygaszona}>{stateWord}</text>
          ) : null}
          {pokazNazwe ? (
            <text x={node.x} y={node.y - ctx.sp(glyph.h / 2 + 8)} textAnchor="middle" fontSize={ctx.sp(SLD_LABEL.PRIMARY - 1)} fontWeight={700} fill={ctx.paleta.kreskaBazowa}>{node.label}</text>
          ) : null}
        </g>
      );
    }
    const pokazStan = Boolean(stateWord && state === 'OPEN' && ctx.widoczne('stanSlownyLacznika'));
    const nazwaPl = typeof node.meta?.nazwaPl === 'string' ? node.meta.nazwaPl : null;
    const pokazKlase = ctx.labelMode === 'audit' && nazwaPl !== null && ctx.widoczne('nazwaZaciskuModelu');
    if (!pokazNazwe && !pokazStan && !pokazKlase) return null;
    // Oznaczenie POZIOMO po prawej symbolu, JEDEN wiersz w pasie slotu
    // (R2 §17): pole ma MIN_FIELD_WIDTH, więc etykieta nie jest obracana ani
    // ściskana — nadmiar ucina wielokropek (pełna nazwa w podpowiedzi).
    const xText = node.x + ctx.sp(glyph.w / 2 + TOKENY_GEOMETRII.labelGap);
    const fontPx = SLD_LABEL.PRIMARY - 2;
    const oznaczenie = zawinNazwe(node.label, limitZnakow(pasEtykietyAparatuPx(node, ctx), fontPx, CHAR_WIDTH_RATIO_BOLD), 1)[0];
    const stanY = node.y + ctx.sp(4 + SLD_LABEL.STATUS * LINE_HEIGHT);
    return (
      <g {...textHalo(ctx)}>
        {pokazNazwe ? (
          <text x={xText} y={node.y + ctx.sp(4)} textAnchor="start" fontSize={ctx.sp(fontPx)} fontWeight={600} fill={ctx.paleta.kreskaBazowa}>{oznaczenie}</text>
        ) : null}
        {pokazStan ? (
          <text data-testid={`lv-domain-stan-${node.ref}`} x={xText} y={stanY} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.STATUS)} fontWeight={700} fill={ctx.paleta.tonOstrzegawczy}>{stateWord}</text>
        ) : null}
        {pokazKlase ? (
          <text data-testid={`lv-domain-klasa-${node.ref}`} x={xText} y={pokazStan ? stanY + ctx.sp(SLD_LABEL.TERTIARY * LINE_HEIGHT) : stanY} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.TERTIARY)} fill={ctx.paleta.kreskaWygaszona}>{nazwaPl.toUpperCase()}</text>
        ) : null}
      </g>
    );
  }
  if (node.kind === 'generator') {
    const pMw = typeof node.meta?.pMw === 'number' ? node.meta.pMw : null;
    const pokazParametry = pMw != null && ctx.widoczne('parametrZrodlaDer');
    const zdolnosc = etykietaZdolnosci(node.meta?.islandCapability);
    if (node.meta?.direct === true) {
      // Źródło BEZ POLA stoi nad kreską na krańcu sekcji — pas po prawej jest
      // wolny, etykieta w prawo od glifu (jak tabliczka transformatora).
      const xText = node.x + ctx.sp(glyph.w / 2 + TOKENY_GEOMETRII.labelGap);
      return (
        <g {...textHalo(ctx)}>
          {pokazNazwe ? (
            <text x={xText} y={node.y - ctx.sp(2)} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.PRIMARY)} fontWeight={700} fill={ctx.paleta.kreskaBazowa}>{node.label}</text>
          ) : null}
          {pokazParametry ? (
            <>
              <text x={xText} y={node.y + ctx.sp(SLD_LABEL.SECONDARY * LINE_HEIGHT)} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.SECONDARY)} fill={ctx.paleta.kreskaWygaszona}>
                {`${mocLabel(pMw)} · ${technologiaZrodlaPl(node.meta?.genType as LvDomainGenerator['gen_type'])}`}
              </text>
              <text data-testid={`lv-domain-der-zdolnosc-${node.ref}`} x={xText} y={node.y + ctx.sp(2 * SLD_LABEL.SECONDARY * LINE_HEIGHT)} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.TERTIARY)} fill={ctx.paleta.kreskaWygaszona}>{zdolnosc}</text>
            </>
          ) : null}
        </g>
      );
    }
    // Źródło W POLU: etykieta POD symbolem, centrowana i zawinięta do slotu
    // (bez łamania słów, ≤ 2 wiersze nazwy); opis: technologia źródła (§10/§11:
    // PV to TECHNOLOGIA, falownik ELEMENTEM — symbol pokazuje tor, opis
    // technologię) · moc · zdolność pracy wyspowej (FAKT — do 2 wierszy).
    const maxCharsNazwy = maxCharsForWidth(TOKENY_GEOMETRII.feederGap - 8, SLD_LABEL.PRIMARY - 1, ctx.fit, CHAR_WIDTH_RATIO_BOLD);
    const nazwaLinie = zawinNazwe(node.label, maxCharsNazwy, 2);
    const maxCharsOpisu = maxCharsForWidth(TOKENY_GEOMETRII.feederGap - 8, SLD_LABEL.TERTIARY, ctx.fit);
    const technologiaLinie = zawinNazwe(technologiaZrodlaPl(node.meta?.genType as LvDomainGenerator['gen_type']), maxCharsOpisu, 2);
    const zdolnoscLinie = zawinNazwe(zdolnosc, maxCharsOpisu, 2);
    const stepNazwy = ctx.sp((SLD_LABEL.PRIMARY - 1) * LINE_HEIGHT);
    const stepOpisu = ctx.sp(SLD_LABEL.TERTIARY * LINE_HEIGHT);
    const yBase = node.y + ctx.sp(glyph.h / 2 + 14);
    const yMoc = yBase + stepNazwy * (pokazNazwe ? nazwaLinie.length : 0);
    const yTechnologia = yMoc + ctx.sp(SLD_LABEL.SECONDARY * LINE_HEIGHT);
    const yZdolnosc = yTechnologia + stepOpisu * technologiaLinie.length;
    return (
      <g {...textHalo(ctx)}>
        {pokazNazwe ? (
          <text x={node.x} y={yBase} textAnchor="middle" fontSize={ctx.sp(SLD_LABEL.PRIMARY - 1)} fontWeight={700} fill={ctx.paleta.kreskaBazowa}>
            {nazwaLinie.map((linia, i) => (
              <tspan key={i} x={node.x} dy={i === 0 ? 0 : stepNazwy}>{linia}</tspan>
            ))}
          </text>
        ) : null}
        {pokazParametry ? (
          <>
            <text x={node.x} y={yMoc} textAnchor="middle" fontSize={ctx.sp(SLD_LABEL.SECONDARY)} fill={ctx.paleta.kreskaWygaszona}>{mocLabel(pMw)}</text>
            <text data-testid={`lv-domain-der-technologia-${node.ref}`} x={node.x} y={yTechnologia} textAnchor="middle" fontSize={ctx.sp(SLD_LABEL.TERTIARY)} fill={ctx.paleta.kreskaWygaszona}>
              {technologiaLinie.map((linia, i) => (
                <tspan key={i} x={node.x} dy={i === 0 ? 0 : stepOpisu}>{linia}</tspan>
              ))}
            </text>
            <text data-testid={`lv-domain-der-zdolnosc-${node.ref}`} x={node.x} y={yZdolnosc} textAnchor="middle" fontSize={ctx.sp(SLD_LABEL.TERTIARY)} fill={ctx.paleta.kreskaWygaszona}>
              {zdolnoscLinie.map((linia, i) => (
                <tspan key={i} x={node.x} dy={i === 0 ? 0 : stepOpisu}>{linia}</tspan>
              ))}
            </text>
          </>
        ) : null}
      </g>
    );
  }
  if (node.kind === 'load') {
    const pMw = typeof node.meta?.pMw === 'number' ? node.meta.pMw : null;
    const yBase = node.y + ctx.sp(glyph.h / 2 + 14);
    // R2 §17: nazwa odbioru ≤ 2 wiersze BEZ łamania słów, nadmiar „…" —
    // pełna nazwa w podpowiedzi elementu i w panelu odpływu (inspektor).
    const lines = zawinNazwe(node.label, maxCharsForWidth(TOKENY_GEOMETRII.feederGap - 8, SLD_LABEL.SECONDARY + 1, ctx.fit, CHAR_WIDTH_RATIO_BOLD), 2);
    const step = ctx.sp((SLD_LABEL.SECONDARY + 1) * LINE_HEIGHT);
    return (
      <g {...textHalo(ctx)}>
        {pokazNazwe ? (
          <text x={node.x} y={yBase} textAnchor="middle" fontSize={ctx.sp(SLD_LABEL.SECONDARY + 1)} fontWeight={600} fill={ctx.paleta.kreskaBazowa}>
            {lines.map((line, i) => (
              <tspan key={i} x={node.x} dy={i === 0 ? 0 : step}>{line}</tspan>
            ))}
          </text>
        ) : null}
        {pMw != null && ctx.widoczne('parametrOdbioru') ? (
          <text x={node.x} y={yBase + step * (pokazNazwe ? lines.length : 0)} textAnchor="middle" fontSize={ctx.sp(SLD_LABEL.SECONDARY)} fill={ctx.paleta.kreskaWygaszona}>{mocLabel(pMw)}</text>
        ) : null}
      </g>
    );
  }
  if (node.kind === 'measurement') {
    if (!ctx.widoczne('nazwaPomiaru')) return null;
    // Dwa wiersze (oznaczenie / przekładnia) w szerokości slotu — jeden długi
    // wiersz „CT Agregat G1 200/5 A" dotykał pionu sąsiedniej kolumny.
    const xText = node.x + ctx.sp(glyph.w / 2 + TOKENY_GEOMETRII.labelGap);
    const ratio = typeof node.meta?.ratio === 'string' ? node.meta.ratio : null;
    const nazwaLinie = zawinNazwe(node.label, maxCharsForWidth(TOKENY_GEOMETRII.feederGap - 40, SLD_LABEL.TERTIARY, ctx.fit), 1);
    // Tabliczka przekładnika TEKSTEM obok (R2 §9): przekładnia, klasa, moc
    // pomiarowa, rdzenie i układ — wyłącznie z danych modelu, wiersz pomijany,
    // gdy model go nie niesie (żadnego „—" udającego wartość).
    const klasa = typeof node.meta?.accuracyClass === 'string' ? node.meta.accuracyClass : null;
    const moc = typeof node.meta?.burdenVa === 'number' ? `${plNumber(node.meta.burdenVa)} VA` : null;
    const rdzenie = typeof node.meta?.ctCores === 'number' ? `${node.meta.ctCores} ${node.meta.ctCores === 1 ? 'rdzeń' : node.meta.ctCores < 5 ? 'rdzenie' : 'rdzeni'}` : null;
    const uklad = node.meta?.ctArrangement === '3xCT' ? '3×CT' : node.meta?.ctArrangement === 'ferranti' ? 'Ferranti' : null;
    const wiersze = [
      nazwaLinie[0],
      ...(ratio ? [ratio] : []),
      ...([klasa ? `kl. ${klasa}` : null, moc].filter((w): w is string => w !== null).length ? [[klasa ? `kl. ${klasa}` : null, moc].filter(Boolean).join(' · ')] : []),
      ...([rdzenie, uklad].filter(Boolean).length ? [[rdzenie, uklad].filter(Boolean).join(' · ')] : []),
    ];
    const step = ctx.sp(SLD_LABEL.TERTIARY * LINE_HEIGHT);
    return (
      <text {...textHalo(ctx)} data-testid={`lv-domain-tabliczka-${node.ref}`} x={xText} y={node.y + ctx.sp(3.5) - (step * (wiersze.length - 1)) / 2} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.TERTIARY)} fill={ctx.paleta.kreskaWygaszona}>
        {wiersze.map((w, i) => (
          <tspan key={i} x={xText} dy={i === 0 ? 0 : step}>{w}</tspan>
        ))}
      </text>
    );
  }
  if (node.kind === 'relay') {
    // Kody funkcji niesie glif; nazwa zabezpieczenia — wyłącznie w trybie
    // audytu (na kanwie projektowej byłaby trzecią etykietą w kolumnie incomera).
    if (!ctx.widoczne('nazwaPomiaru') || ctx.labelMode !== 'audit') return null;
    return (
      <text {...textHalo(ctx)} x={node.x} y={node.y + ctx.sp(glyph.h / 2 + 11)} textAnchor="middle" fontSize={ctx.sp(SLD_LABEL.TERTIARY)} fill={ctx.paleta.kreskaWygaszona}>
        {node.label}
      </text>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Wyniki (§18/§19): plakietki z pochodzeniem; kropka werdyktu na przeglądzie.
// ---------------------------------------------------------------------------

function VerdictDot({ node, ctx, tone, overlay, status }: { readonly node: LvDomainSceneNode; readonly ctx: KontekstRysunku; readonly tone: string; readonly overlay: LvDomainOverlayId; readonly status?: string }): JSX.Element {
  const glyph = glyphScreenSize(node, ctx.fit);
  return <circle data-testid={`lv-domain-verdict-${overlay}-${node.ref}`} data-swz-status={status} cx={node.x} cy={node.y + ctx.sp(glyph.h / 2 + 12)} r={ctx.sp(4.5)} fill={tone} stroke={ctx.paleta.tlo} strokeWidth={ctx.sp(1.2)} />;
}

const SC_METRICS: readonly { readonly code: string; readonly label: string }[] = [
  { code: 'IK_3F_A', label: 'Ik″3' },
  { code: 'IK_1F_A', label: 'Ik″1' },
  { code: 'IP_A', label: 'ip' },
  { code: 'ITH_A', label: 'Ith' },
];

function BusResultBadge({ node, ctx, overlay, payload, outdated, kotwica }: { readonly node: LvDomainSceneNode; readonly ctx: KontekstRysunku; readonly overlay: 'loads' | 'shortCircuit'; readonly payload: RawOverlayPayload | null; readonly outdated: boolean; readonly kotwica: KotwicaPlakietki }): JSX.Element | null {
  if (!payload) return null;
  const codes = overlay === 'shortCircuit' ? SC_METRICS : [{ code: 'U_kV', label: 'U' }, { code: 'V_PU', label: 'u' }];
  const present = codes.map((c) => ({ ...c, metric: getMetric(payload, node.ref, c.code) })).filter((c) => c.metric && c.metric.value != null);
  if (present.length === 0) return null;
  if (ctx.widoczne('kropkaWerdyktu')) {
    return <VerdictDot node={node} ctx={ctx} tone={tonWerdyktuSeverity(payload.elements[node.ref]?.severity, ctx.paleta)} overlay={overlay} />;
  }
  if (!ctx.widoczne('plakietkaWyniku')) return null;
  const step = ctx.sp(SLD_LABEL.RESULT * LINE_HEIGHT);
  const wiersze = wierszePlakietki(kotwica, present.map((c) => `${c.label} = ${formatujMetryke(c.metric!)}`));
  const norm = overlay === 'shortCircuit' ? 'IEC 60909' : 'rozpływ';
  const pochodzenie = ctx.widoczne('pochodzenieWyniku')
    ? wierszePlakietki(kotwica, [`${norm} · ${skrotPrzebiegu(payload.run_id)} · ${outdated ? 'NIEAKTUALNY' : 'aktualny'}`])
    : [];
  // Kolejność wierszy od kotwicy: przy kierunku „w górę" pochodzenie stoi
  // najbliżej kreski, wartości nad nim — czyta się od góry: wartości, potem
  // pochodzenie, tak samo jak przy kierunku „w dół".
  const liczba = wiersze.length + pochodzenie.length;
  const yWiersza = (i: number): number => (kotwica.kierunek === 1 ? kotwica.y0 + i * step : kotwica.y0 - (liczba - 1 - i) * step);
  return (
    <g {...textHalo(ctx)} data-testid={`lv-domain-badge-${overlay}-${node.ref}`} data-run-id={payload.run_id} data-outdated={outdated ? 'true' : 'false'}>
      {wiersze.map((wiersz, i) => (
        <text key={`w${i}`} x={kotwica.x} y={yWiersza(i)} textAnchor={kotwica.textAnchor} fontSize={ctx.sp(SLD_LABEL.RESULT)} fill={outdated ? ctx.paleta.tonOstrzegawczy : ctx.paleta.kreskaBazowa} fontFamily="monospace">
          {wiersz}
        </text>
      ))}
      {pochodzenie.length > 0 ? (
        <text data-testid="lv-domain-provenance" x={kotwica.x} y={yWiersza(wiersze.length)} textAnchor={kotwica.textAnchor} fontSize={ctx.sp(SLD_LABEL.TERTIARY)} fill={outdated ? ctx.paleta.tonOstrzegawczy : ctx.paleta.kreskaWygaszona} fontFamily="monospace">
          {pochodzenie.map((wiersz, i) => (
            <tspan key={`p${i}`} x={kotwica.x} dy={i === 0 ? 0 : step}>{wiersz}</tspan>
          ))}
        </text>
      ) : null}
    </g>
  );
}

function ApparatusResultBadge({ node, ctx, payload, outdated }: { readonly node: LvDomainSceneNode; readonly ctx: KontekstRysunku; readonly payload: RawOverlayPayload | null; readonly outdated: boolean }): JSX.Element | null {
  if (!payload) return null;
  const metric = getMetric(payload, node.ref, 'I_A');
  if (!metric || metric.value == null) return null;
  if (ctx.widoczne('kropkaWerdyktu')) return <VerdictDot node={node} ctx={ctx} tone={tonWerdyktuSeverity(payload.elements[node.ref]?.severity, ctx.paleta)} overlay="loads" />;
  if (!ctx.widoczne('plakietkaWyniku')) return null;
  const glyph = glyphScreenSize(node, ctx.fit);
  return (
    <g {...textHalo(ctx)} data-testid={`lv-domain-badge-loads-${node.ref}`} data-run-id={payload.run_id}>
      <text x={node.x} y={node.y + ctx.sp(glyph.h / 2 + 26)} textAnchor="middle" fontSize={ctx.sp(SLD_LABEL.RESULT)} fill={outdated ? ctx.paleta.tonOstrzegawczy : ctx.paleta.kreskaBazowa} fontFamily="monospace">{`I = ${formatujMetryke(metric)}`}</text>
    </g>
  );
}

function SwzBadge({ node, ctx, entry }: { readonly node: LvDomainSceneNode; readonly ctx: KontekstRysunku; readonly entry: SwzOverlayEntry | undefined }): JSX.Element | null {
  if (!entry) return null;
  const glyph = glyphScreenSize(node, ctx.fit);
  const tone = entry.status === 'spełnia' ? ctx.paleta.tonOk : entry.status === 'nie spełnia' ? ctx.paleta.tonBledu : ctx.paleta.tonOstrzegawczy;
  if (ctx.widoczne('kropkaWerdyktu')) return <VerdictDot node={node} ctx={ctx} tone={tone} overlay="swz" status={entry.status} />;
  if (!ctx.widoczne('plakietkaWyniku')) return null;
  const symbol = entry.status === 'spełnia' ? '✓' : entry.status === 'nie spełnia' ? '✗' : '?';
  // Plakietka w KOLUMNIE pola (≤ 12 znaków monospace w wierszu — mieści się
  // w slocie `feederGap`), pod wierszem nazwy i stanu aparatu; jeden długi
  // wiersz wchodził w glif sąsiedniego odpływu (zrzut 18_swz_overlay).
  const linie = [
    `SWZ ${symbol}`,
    `Ik₁min ${plFixed(entry.ik1MinA, 0)} A`,
    ...(entry.status === 'nie spełnia' && entry.iaWymaganeA != null ? [`Ia wym. ${plFixed(entry.iaWymaganeA, 0)} A`] : []),
    ...(entry.tWymaganyS != null ? [`t ≤ ${plFixed(entry.tWymaganyS, 2)} s`] : []),
  ];
  const xText = node.x + ctx.sp(glyph.w / 2 + TOKENY_GEOMETRII.labelGap);
  const step = ctx.sp(SLD_LABEL.RESULT * LINE_HEIGHT);
  // Pod wierszami nazwy i stanu aparatu (jedna orientacja etykiet — pozioma).
  const y0 = node.y + ctx.sp(4 + 2 * SLD_LABEL.STATUS * LINE_HEIGHT);
  return (
    <g {...textHalo(ctx)} data-testid={`lv-domain-badge-swz-${node.ref}`} data-swz-status={entry.status}>
      <text x={xText} y={y0} textAnchor="start" fontSize={ctx.sp(SLD_LABEL.RESULT)} fill={tone} fontFamily="monospace">
        {linie.map((linia, i) => (
          <tspan key={i} x={xText} dy={i === 0 ? 0 : step} fontWeight={i === 0 ? 700 : 400}>{linia}</tspan>
        ))}
      </text>
    </g>
  );
}

function VoltageDropBadge({ node, ctx, row, outdated, kotwica }: { readonly node: LvDomainSceneNode; readonly ctx: KontekstRysunku; readonly row: LvDomainVoltageProfileRow | undefined; readonly outdated: boolean; readonly kotwica: KotwicaPlakietki }): JSX.Element | null {
  if (!row || row.delta_pct == null) return null;
  if (ctx.widoczne('kropkaWerdyktu')) return <VerdictDot node={node} ctx={ctx} tone={ctx.paleta.kreskaBazowa} overlay="voltageDrop" />;
  if (!ctx.widoczne('plakietkaWyniku')) return null;
  const wiersze = wierszePlakietki(kotwica, [`ΔU = ${plFixed(row.delta_pct, 2)} %${outdated ? ' (NIEAKTUALNY)' : ''}`]);
  const step = ctx.sp(SLD_LABEL.RESULT * LINE_HEIGHT);
  const yWiersza = (i: number): number => (kotwica.kierunek === 1 ? kotwica.y0 + i * step : kotwica.y0 - (wiersze.length - 1 - i) * step);
  return (
    <g {...textHalo(ctx)} data-testid={`lv-domain-badge-voltageDrop-${node.ref}`} data-outdated={outdated ? 'true' : 'false'}>
      {wiersze.map((wiersz, i) => (
        <text key={`w${i}`} x={kotwica.x} y={yWiersza(i)} textAnchor={kotwica.textAnchor} fontSize={ctx.sp(SLD_LABEL.RESULT)} fill={outdated ? ctx.paleta.tonOstrzegawczy : ctx.paleta.kreskaBazowa} fontFamily="monospace">{wiersz}</text>
      ))}
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
