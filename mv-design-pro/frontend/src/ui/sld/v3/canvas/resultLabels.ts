/**
 * W4 → R1 (RECENZJA_WARSTWA_WYNIKOWA_2026-07; program WYNIKI-SLD R1) — warstwa
 * LICZBOWYCH etykiet wynikowych, budowniczy CZYSTY (bez DOM/React/Date/
 * losowości — importowalny z `scripts/*` i testów węzłowych, wzorzec
 * `overlay.ts` `buildFlowOverlayFromScene`). Rozszerza istniejące kanały
 * nakładki v3 (strzałki przepływu/zwarciowe + badge OLTC) o TEKSTOWE odczyty
 * wielkości.
 *
 * R1: TREŚĆ etykiety wynika z UNIWERSALNEGO REJESTRU szablonów
 * (`resultLabelTemplates.ts`) kluczowanego (typ analizy × klasa elementu) —
 * budowniczy nie zna już „na sztywno" pól, tylko odczytuje właściwe
 * specyfikacje wg `payload.analysis_type`. Dzięki temu jedna warstwa obsługuje
 * rozpływ i (docelowo) zwarcia/termikę/ΔU bez forków per-solver.
 *
 * §0 ZERO fizyki w UI: wartości 1:1 z `RawOverlayPayload.elements[ref].metrics
 * [code].value`, WYŁĄCZNIE formatowanie (formatery w `resultLabelTemplates.ts`).
 * BRAK metryki ⇒ BRAK linii (zero placeholderów); element bez ŻADNEJ metryki ⇒
 * brak wpisu (zero atrap).
 *
 * §9/§11 ZERO zmiany geometrii: budowniczy CZYTA scenę, nie mutuje; renderer
 * (`SldCanvasV3.tsx` `computeResultLabelPlacements`/`SceneResultLabelNode`)
 * dokłada osobną warstwę SVG NAD sceną — `scene.symbols`/`scene.segments`/
 * `scene.labels` nietknięte (dowód inwariancji: test `sldCanvasV3.test.tsx`,
 * rozszerzony w R1 o ON/OFF × L0/L1/L2).
 *
 * LOD (wym. 5): budowniczy produkuje PEŁNY zestaw linii (kolejność = priorytet);
 * ZWIJANIE do L0/L1/L2 robi renderer efektywnym LOD kamery (histereza S8) przez
 * `resultLabelLinesForLod` — mapa etykiet jest LOD-niezależna (tożsamość po
 * `ownerRef`), a poziom szczegółu wybiera się dopiero przy rysowaniu.
 *
 * Przestrzeń refów (identyczna co pozostałe kanały, patrz `overlay.ts` nagłówek):
 * transformator/źródło/DER — `meta.ownerRef` = ENM `ref_id` = klucz
 * `payload.elements`; przęsło — `segmentRef` == `branch_id` (bramka
 * jednokawałkowa `singleHopSegmentRefs` jak flow); szyna — `meta.ownerRef`
 * (rozwiązuje się do klucza payloadu, gdy adapter niesie realny bus ref; szyny
 * GPZ o refie kompozytowym `#bus-primary`/`#sn-bus` NIE mapują — znana luka
 * adaptera, uczciwie: brak etykiety).
 */
import type { RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
import { getMetric } from '../../../sld-overlay/rawResultOverlayStore';
import type { EnergyNetworkModel } from '../../../../types/enm';
import type { SceneV3 } from '../scene/buildScene';
import { singleHopSegmentRefs } from './overlay';
import {
  normalizeResultLabelAnalysis,
  selectResultLabelSpecs,
  type ResultLabelAnalysis,
  type ResultLabelKind,
  type ResultLabelLine,
  type ResultLabelLineSpec,
} from './resultLabelTemplates';

export type { ResultLabelKind, ResultLabelLine } from './resultLabelTemplates';

/** Wpis etykiety wynikowej jednego elementu — linie w kolejności priorytetu
 *  (kotwica z `ownerRef` w rendererze; zwijanie LOD w rendererze). Pusty
 *  (`lines.length===0`) NIE jest emitowany. */
export interface ResultLabelEntry {
  readonly ownerRef: string;
  readonly kind: ResultLabelKind;
  readonly lines: readonly ResultLabelLine[];
}

/** Zbuduj linie dla jednego elementu z metryk payloadu (obecne kody → linie,
 *  w kolejności specyfikacji; brak kodu ⇒ brak linii). Wartość `null`/brak/
 *  nieskończona ⇒ linia pominięta (zero placeholderów, §0). */
function linesFor(
  payload: RawOverlayPayload,
  ownerRef: string,
  specs: readonly ResultLabelLineSpec[],
): readonly ResultLabelLine[] {
  const lines: ResultLabelLine[] = [];
  const presentCodes = new Set<string>();
  for (const spec of specs) {
    if (spec.skipIfAnyPresent && spec.skipIfAnyPresent.some((c) => presentCodes.has(c))) continue;
    const metric = getMetric(payload, ownerRef, spec.code);
    if (!metric || metric.value === null || metric.value === undefined) continue;
    if (!Number.isFinite(metric.value)) continue;
    presentCodes.add(spec.code);
    lines.push({ prefix: spec.prefix, text: spec.format(metric) });
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Budowniczy CZYSTY: scena + payload (lub null) → wpisy per ownerRef.
// ---------------------------------------------------------------------------

const SYMBOL_KIND_TO_LABEL_KIND: Readonly<Record<string, ResultLabelKind>> = {
  transformer: 'transformer',
  source: 'source',
  der: 'source',
};

/**
 * Zbuduj mapę etykiet wynikowych `ownerRef → ResultLabelEntry` dla jednej sceny.
 * `payload===null` ⇒ pusta mapa (§14.2 „overlay wyłączony bez wyniku"). TREŚĆ
 * wg rejestru szablonów (`resultLabelTemplates.ts`) dla rodziny analizy z
 * `payload.analysis_type`; nierozpoznana analiza ⇒ brak szablonów ⇒ pusta mapa
 * (zero fabrykacji). Element bez pasujących metryk ⇒ brak wpisu (zero atrap).
 * `trustedBranchRefs`: zbiór refów przęseł jednokawałkowych
 * (`singleHopSegmentRefs`) — jedyne przęsła z jednoznaczną tożsamością gałęzi,
 * dopuszczone do etykiety (brak dubli wielokawałkowych, spójnie z bramką flow).
 */
export function buildResultLabelsFromScene(
  scene: SceneV3,
  payload: RawOverlayPayload | null,
  trustedBranchRefs: ReadonlySet<string>,
): Record<string, ResultLabelEntry> {
  const entries: Record<string, ResultLabelEntry> = {};
  if (!payload) return entries;
  const analysis: ResultLabelAnalysis | null = normalizeResultLabelAnalysis(payload.analysis_type);
  if (!analysis) return entries;

  for (const symbol of scene.symbols) {
    const elementKind = symbol.meta?.elementKind;
    const ownerRef = symbol.meta?.ownerRef;
    if (!elementKind || !ownerRef) continue;
    const labelKind = SYMBOL_KIND_TO_LABEL_KIND[elementKind];
    if (!labelKind) continue;
    if (entries[ownerRef]) continue; // ta sama tożsamość na wielu LOD/symbolach
    const lines = linesFor(payload, ownerRef, selectResultLabelSpecs(analysis, labelKind));
    if (lines.length === 0) continue;
    entries[ownerRef] = { ownerRef, kind: labelKind, lines };
  }

  for (const segment of scene.segments) {
    const elementKind = segment.meta?.elementKind;
    const ownerRef = segment.meta?.ownerRef;
    if (!elementKind || !ownerRef) continue;
    if (entries[ownerRef]) continue;
    if (elementKind === 'bus') {
      const lines = linesFor(payload, ownerRef, selectResultLabelSpecs(analysis, 'bus'));
      if (lines.length === 0) continue;
      entries[ownerRef] = { ownerRef, kind: 'bus', lines };
    } else if (elementKind === 'segment') {
      if (ownerRef.includes('#') || !trustedBranchRefs.has(ownerRef)) continue;
      const lines = linesFor(payload, ownerRef, selectResultLabelSpecs(analysis, 'branch'));
      if (lines.length === 0) continue;
      entries[ownerRef] = { ownerRef, kind: 'branch', lines };
    }
  }

  return entries;
}

/** `true` gdy mapa etykiet pusta (brak wyniku / brak metryk) — bramka renderera
 *  „warstwa pusta bez wyniku". */
export function isResultLabelsEmpty(entries: Record<string, ResultLabelEntry> | undefined): boolean {
  return !entries || Object.keys(entries).length === 0;
}

/** Ponowny eksport bramki jednokawałkowej — wołający (workspace) używa tego
 *  samego zbioru co flow overlay (jedna definicja, `overlay.ts`). */
export { singleHopSegmentRefs };
export type { EnergyNetworkModel };
