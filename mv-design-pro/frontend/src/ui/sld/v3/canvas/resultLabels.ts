/**
 * W4 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §8–§9, §16) — warstwa LICZBOWYCH
 * etykiet wynikowych §8 na L2, budowniczy CZYSTY (bez DOM/React/Date/losowości —
 * importowalny z `scripts/*` i testów węzłowych, wzorzec `overlay.ts`
 * `buildFlowOverlayFromScene`). Rozszerza istniejące kanały nakładki v3
 * (strzałki przepływu/zwarciowe + badge OLTC) o TEKSTOWE odczyty wielkości,
 * których żaden dotychczasowy kanał NIE rysuje:
 *   - węzeł (szyna, `elementKind==='bus'`): U [kV]/[p.u.], kąt δ [°] (rozpływ);
 *     Ik″ / ip / Ith [kA] (zwarcie);
 *   - transformator (symbol `elementKind==='transformer'`): S [MVA], ΔP strat;
 *   - źródło/DER (symbol `elementKind==='source'|'der'`): P/Q generacji ZE
 *     ZNAKIEM (§16 — znak reprezentuje kierunek: + wtłaczanie, − pobór);
 *   - przęsło (odcinek `elementKind==='segment'`): obciążenie [%] (P/Q/I niesie
 *     już strzałka przepływu — kanał `flowByOwnerRef`, ZERO duplikacji).
 *
 * §0 ZERO fizyki w UI: wartości 1:1 z `RawOverlayPayload.elements[ref].metrics
 * [code].value` (`result_builder_v1.py` `_METRIC_MAP` — kody U_kV/V_PU/ANGLE_DEG/
 * S_MVA/LOSSES_P_MW/P_MW/Q_Mvar/LOADING_PCT/IK_3F_A/IP_A/ITH_A), WYŁĄCZNIE
 * formatowanie (polski przecinek dziesiętny, jednostki; prądy przez istniejący
 * `formatMagnitudeKa` — <0,1 kA ⇒ ampery). BRAK metryki ⇒ BRAK linii (zero
 * placeholderów); element bez ŻADNEJ metryki ⇒ brak wpisu (zero atrap).
 *
 * §9 ZERO zmiany geometrii: budowniczy CZYTA scenę, nie mutuje; renderer
 * (`SldCanvasV3.tsx` `computeResultLabelPlacements`/`SceneResultLabelNode`)
 * dokłada osobną warstwę SVG NAD sceną — `scene.symbols`/`scene.segments`/
 * `scene.labels` nietknięte (dowód inwariancji: test `sldCanvasV3.test.tsx`).
 *
 * Przestrzeń refów (identyczna co pozostałe kanały, patrz `overlay.ts` nagłówek):
 * transformator/źródło/DER — `meta.ownerRef` = ENM `ref_id` = klucz
 * `payload.elements` (wzorzec OLTC `buildOltcOverlayFromScene`); przęsło —
 * `segmentRef` == `branch_id` (bramka jednokawałkowa `singleHopSegmentRefs`
 * jak flow — jeden odczyt na realną gałąź, brak dubli wielokawałkowych); szyna —
 * `meta.ownerRef` (rozwiązuje się do klucza payloadu, gdy adapter niesie realny
 * bus ref; szyny GPZ o refie kompozytowym `#bus-primary`/`#sn-bus` NIE mapują —
 * znana luka adaptera, ta sama co energizacja/flow, uczciwie: brak etykiety).
 */
import type { RawMetricValue, RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
import { getMetric } from '../../../sld-overlay/rawResultOverlayStore';
import { formatMagnitudeKa } from '../../../sld-overlay/FaultContributionArrow';
import type { EnergyNetworkModel } from '../../../../types/enm';
import type { SceneV3 } from '../scene/buildScene';
import { singleHopSegmentRefs } from './overlay';

/** Klasa elementu, do którego zakotwiczona jest etykieta — decyduje o strategii
 *  kotwiczenia w rendererze (szyna/przęsło → środek biegu odcinka; TR/źródło →
 *  pod symbolem). */
export type ResultLabelKind = 'bus' | 'transformer' | 'source' | 'branch';

/** Jedna linia etykiety: prefiks wielkości (np. „U", „Ik″", „P") + wartość
 *  sformatowana (1:1 ze źródła). */
export interface ResultLabelLine {
  readonly prefix: string;
  readonly text: string;
}

/** Wpis etykiety wynikowej jednego elementu — do trzech linii (kotwica z
 *  `ownerRef` w rendererze). Pusty (`lines.length===0`) NIE jest emitowany. */
export interface ResultLabelEntry {
  readonly ownerRef: string;
  readonly kind: ResultLabelKind;
  readonly lines: readonly ResultLabelLine[];
}

// ---------------------------------------------------------------------------
// Formatowanie (spec §10 / §0: formatowanie dozwolone, fizyka nie).
// ---------------------------------------------------------------------------

/** Polski zapis liczby wg `format_hint` metryki (`fixed0/1/2/4`) — WYŁĄCZNIE
 *  formatowanie, wartość źródłowa bez zmian; przecinek dziesiętny. */
function formatMetricValuePl(metric: RawMetricValue): string {
  const hint = metric.format_hint ?? 'fixed2';
  const value = metric.value as number;
  let decimals: number;
  if (hint === 'fixed0') decimals = 0;
  else if (hint === 'fixed1') decimals = 1;
  else if (hint === 'fixed4') decimals = 4;
  else decimals = 2;
  return value.toFixed(decimals).replace('.', ',');
}

/** Skalar z jednostką, np. „15,02 kV". */
function formatScalar(metric: RawMetricValue): string {
  return `${formatMetricValuePl(metric)} ${metric.unit}`;
}

/** Skalar ZE ZNAKIEM (§16: znak reprezentuje kierunek generacji/poboru — „+"
 *  wtłaczanie, „−"/„-" pobór). Dodatnie dostają jawny „+"; format i jednostka
 *  jak `formatScalar`. Wartość 0 bez znaku (kierunek nieokreślony). */
function formatSignedScalar(metric: RawMetricValue): string {
  const value = metric.value as number;
  const body = formatScalar(metric);
  if (value > 0) return `+${body}`;
  return body; // ujemne niesie własny „-"; zero bez znaku
}

/** Prąd [kA] przez istniejący `formatMagnitudeKa` (<0,1 kA ⇒ ampery). Payload
 *  emituje IK/IP/ITH albo w kA (`ikss_ka`, hint fixed2), albo w A (`ikss_a`,
 *  hint fixed0) — normalizacja do kA (A ⇒ /1000) zachowuje wartość źródłową,
 *  a `formatMagnitudeKa` sam wybiera prezentację kA/A. */
function formatCurrent(metric: RawMetricValue): string {
  const value = metric.value as number;
  const ka = metric.unit === 'A' ? value / 1000 : value;
  return formatMagnitudeKa(ka);
}

// ---------------------------------------------------------------------------
// Kontrakt kodów metryk per klasa (kolejność = kolejność linii). Prefiks +
// funkcja formatująca; brak metryki w payloadzie ⇒ linia pominięta.
// ---------------------------------------------------------------------------

interface LineSpec {
  readonly code: string;
  readonly prefix: string;
  readonly format: (m: RawMetricValue) => string;
  /** Gdy ustawione: linia dodawana WYŁĄCZNIE, gdy żadna z tych metryk nie
   *  wystąpiła wcześniej (np. V_PU jako fallback U, gdy brak U_kV). */
  readonly skipIfAnyPresent?: readonly string[];
}

const BUS_SPECS: readonly LineSpec[] = [
  { code: 'U_kV', prefix: 'U', format: formatScalar },
  { code: 'V_PU', prefix: 'U', format: formatScalar, skipIfAnyPresent: ['U_kV'] },
  { code: 'ANGLE_DEG', prefix: 'δ', format: formatScalar },
  { code: 'IK_3F_A', prefix: 'Ik″', format: formatCurrent },
  { code: 'IP_A', prefix: 'ip', format: formatCurrent },
  { code: 'ITH_A', prefix: 'Ith', format: formatCurrent },
];

const TRANSFORMER_SPECS: readonly LineSpec[] = [
  { code: 'S_MVA', prefix: 'S', format: formatScalar },
  { code: 'LOSSES_P_MW', prefix: 'ΔP', format: formatScalar },
];

const SOURCE_SPECS: readonly LineSpec[] = [
  { code: 'P_MW', prefix: 'P', format: formatSignedScalar },
  { code: 'Q_Mvar', prefix: 'Q', format: formatSignedScalar },
];

const BRANCH_SPECS: readonly LineSpec[] = [
  { code: 'LOADING_PCT', prefix: 'obc.', format: formatScalar },
];

/** Zbuduj linie dla jednego elementu z metryk payloadu (obecne kody → linie,
 *  w kolejności specyfikacji; brak kodu ⇒ brak linii). Wartość `null`/brak ⇒
 *  linia pominięta (zero placeholderów, §0). */
function linesFor(
  payload: RawOverlayPayload,
  ownerRef: string,
  specs: readonly LineSpec[],
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

const SYMBOL_KIND_TO_SPECS: Readonly<Record<string, readonly LineSpec[]>> = {
  transformer: TRANSFORMER_SPECS,
  source: SOURCE_SPECS,
  der: SOURCE_SPECS,
};

/**
 * Zbuduj mapę etykiet wynikowych `ownerRef → ResultLabelEntry` dla jednej sceny.
 * `payload===null` ⇒ pusta mapa (§14.2 „overlay wyłączony bez wyniku"). Element
 * bez pasujących metryk ⇒ brak wpisu (zero atrap). `trustedBranchRefs`: zbiór
 * refów przęseł jednokawałkowych (`singleHopSegmentRefs`) — jedyne przęsła z
 * jednoznaczną tożsamością gałęzi, dopuszczone do etykiety obciążenia (brak
 * dubli wielokawałkowych, spójnie z bramką flow).
 */
export function buildResultLabelsFromScene(
  scene: SceneV3,
  payload: RawOverlayPayload | null,
  trustedBranchRefs: ReadonlySet<string>,
): Record<string, ResultLabelEntry> {
  const entries: Record<string, ResultLabelEntry> = {};
  if (!payload) return entries;

  for (const symbol of scene.symbols) {
    const elementKind = symbol.meta?.elementKind;
    const ownerRef = symbol.meta?.ownerRef;
    if (!elementKind || !ownerRef) continue;
    const labelKind = SYMBOL_KIND_TO_LABEL_KIND[elementKind];
    if (!labelKind) continue;
    if (entries[ownerRef]) continue; // ta sama tożsamość na wielu LOD/symbolach
    const lines = linesFor(payload, ownerRef, SYMBOL_KIND_TO_SPECS[elementKind]);
    if (lines.length === 0) continue;
    entries[ownerRef] = { ownerRef, kind: labelKind, lines };
  }

  for (const segment of scene.segments) {
    const elementKind = segment.meta?.elementKind;
    const ownerRef = segment.meta?.ownerRef;
    if (!elementKind || !ownerRef) continue;
    if (entries[ownerRef]) continue;
    if (elementKind === 'bus') {
      const lines = linesFor(payload, ownerRef, BUS_SPECS);
      if (lines.length === 0) continue;
      entries[ownerRef] = { ownerRef, kind: 'bus', lines };
    } else if (elementKind === 'segment') {
      if (ownerRef.includes('#') || !trustedBranchRefs.has(ownerRef)) continue;
      const lines = linesFor(payload, ownerRef, BRANCH_SPECS);
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
