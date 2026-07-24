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
 * jednokawałkowa `singleHopSegmentRefs` jak flow); szyna — `meta.ownerRef`,
 * gdy adapter niesie realny bus ref. ADAPTER-BUSREF (dług W4/R2/V12K-163
 * DOMKNIĘTY): szyny GPZ o refie KOMPOZYTOWYM (`${sectionId}#bus-primary` itd.)
 * niosą TERAZ addytywną metadanę `meta.busResultRef` = kanoniczny `Bus.ref_id`
 * ze snapshotu ENM (adapter `enmToCanonicalGpzAdapter.ts`) — dopasowanie
 * `payload.elements` idzie po TYM refie (`resultRefForSegment`), a `ownerRef`
 * (kompozyt) pozostaje kluczem tożsamości/kotwicy. Szyny sekcji rysowane
 * wielokrotnie (główna/rezerwowa/domknięcie ringu) DEDUPLIKUJĄ się po
 * `busResultRef` — dokładnie jedna etykieta U/δ na sekcję, kotwica na szynie
 * głównej (pierwsza w kolejności sceny).
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
  /** R3 (wym. 9) — SEVERITY elementu 1:1 z kontraktu backendu
   *  (`RawOverlayElement.severity`: INFO/WARNING/IMPORTANT/CRITICAL). ZERO progów
   *  liczonych w UI — renderer mapuje ten łańcuch na istniejące tokeny statusów
   *  (`colorTokens.ts::resultSeverityColor`) oraz na znacznik tekstowy „⚠"
   *  (kolor DODATKIEM, nie jedynym nośnikiem). Element bez wpisu payloadu nie
   *  powstaje (entry emitowany tylko dla elementu z metrykami), więc severity
   *  ZAWSZE pochodzi z realnego elementu; brak pola w payloadzie ⇒ „INFO”
   *  (neutralne, brak przekroczenia). */
  readonly severity: string;
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
 * ADAPTER-BUSREF (dług W4/R2/V12K-163): ref używany do DOPASOWANIA payloadu/
 * energizacji dla segmentu — kanoniczny `Bus.ref_id` (`meta.busResultRef`,
 * niesiony ze snapshotu przez adapter dla szyn GPZ o refie kompozytowym), a w
 * jego braku `meta.ownerRef` (segmenty, których `ownerRef` JEST już realnym
 * refem ENM). JEDNO ŹRÓDŁO PRAWDY dla warstwy wynikowej (`resultLabels`) i
 * energizacji/flow (`SldCanvasV3`) — zero rozjazdu mapowań. `undefined` gdy
 * segment nie ma ŻADNEGO refu. */
export function resultRefForSegment(
  meta: { readonly ownerRef?: string; readonly busResultRef?: string } | undefined,
): string | undefined {
  return meta?.busResultRef ?? meta?.ownerRef;
}

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
    entries[ownerRef] = { ownerRef, kind: labelKind, lines, severity: severityOf(payload, ownerRef) };
  }

  // ADAPTER-BUSREF: dedup etykiet szyny po KANONICZNYM refie — sekcja SN GPZ
  // rysowana jako główna+rezerwowa+domknięcie ringu (różne `ownerRef`
  // kompozytowe) współdzieli JEDEN `busResultRef` ⇒ dokładnie jedna etykieta
  // U/δ (kotwica na PIERWSZEJ, tj. szynie głównej). Refy realne (szyny stacji,
  // gdzie `busResultRef` brak) trafiają tu jako własny `ownerRef` — zachowanie
  // niezmienne (każda taka szyna to inny wpis).
  const seenBusResultRefs = new Set<string>();
  for (const segment of scene.segments) {
    const elementKind = segment.meta?.elementKind;
    const ownerRef = segment.meta?.ownerRef;
    if (!elementKind || !ownerRef) continue;
    if (entries[ownerRef]) continue;
    if (elementKind === 'bus') {
      const resultRef = resultRefForSegment(segment.meta) ?? ownerRef;
      if (seenBusResultRefs.has(resultRef)) continue;
      const lines = linesFor(payload, resultRef, selectResultLabelSpecs(analysis, 'bus'));
      if (lines.length === 0) continue;
      seenBusResultRefs.add(resultRef);
      entries[ownerRef] = { ownerRef, kind: 'bus', lines, severity: severityOf(payload, resultRef) };
    } else if (elementKind === 'segment') {
      if (ownerRef.includes('#') || !trustedBranchRefs.has(ownerRef)) continue;
      const lines = linesFor(payload, ownerRef, selectResultLabelSpecs(analysis, 'branch'));
      if (lines.length === 0) continue;
      entries[ownerRef] = { ownerRef, kind: 'branch', lines, severity: severityOf(payload, ownerRef) };
    }
  }

  return entries;
}

/** R3 (wym. 9) — SEVERITY elementu 1:1 z payloadu (`RawOverlayElement.severity`).
 *  ZERO progów w UI: odczyt gotowej klasyfikacji backendu, brak wpisu/pola ⇒
 *  „INFO” (neutralne). */
function severityOf(payload: RawOverlayPayload, ownerRef: string): string {
  return payload.elements[ownerRef]?.severity ?? 'INFO';
}

// ---------------------------------------------------------------------------
// R3 (wym. 9/17) — POCHODNE severity + FILTRY widoczności warstwy wynikowej.
// CZYSTE funkcje (bez DOM/React) — działają WYŁĄCZNIE na warstwie etykiet
// (mapa `ownerRef → ResultLabelEntry`), NIE na scenie: geometria niezmienna
// niezależnie od stanu filtrów (inwariant §11, dowód w testach).
// ---------------------------------------------------------------------------

/** Wielkości filtrowane (wym. 17 „tylko P / tylko Q / tylko prądy / tylko
 *  napięcia / tylko przeciążenia”, rozszerzone o S — komplet realnych wielkości
 *  szablonów). Każdy prefiks linii mapuje się na dokładnie jedną. */
export type ResultLabelQuantity = 'P' | 'Q' | 'S' | 'I' | 'U' | 'loading';

/** Prefiks linii (z `resultLabelTemplates.ts`) → wielkość filtrowana. Zamknięta
 *  tabela — WSZYSTKIE prefiksy szablonów pokryte, więc każda linia jest
 *  filtrowalna: P/ΔP→moc czynna, Q→bierna, S→pozorna, I/Ik″/ip/Ith→prądy,
 *  U/δ→węzeł (napięcie/kąt), obc.→obciążenie. */
const PREFIX_TO_QUANTITY: Readonly<Record<string, ResultLabelQuantity>> = {
  P: 'P',
  'ΔP': 'P',
  Q: 'Q',
  S: 'S',
  I: 'I',
  'Ik″': 'I',
  ip: 'I',
  Ith: 'I',
  U: 'U',
  δ: 'U',
  'obc.': 'loading',
};

/** Wielkość linii wg prefiksu (`null` = prefiks spoza tabeli — linia traktowana
 *  jako zawsze widoczna, bez cichego gubienia). */
export function resultLabelLineQuantity(prefix: string): ResultLabelQuantity | null {
  return PREFIX_TO_QUANTITY[prefix] ?? null;
}

/** Klasy severity oznaczające PRZEKROCZENIE (wym. 9/17 „tylko przekroczenia”).
 *  1:1 z kontraktem backendu — INFO to brak przekroczenia. */
const EXCEEDANCE_SEVERITIES: ReadonlySet<string> = new Set(['WARNING', 'IMPORTANT', 'CRITICAL']);

/** `true` gdy severity oznacza przekroczenie (kontrakt backendu, ZERO progów w UI). */
export function isExceedanceSeverity(severity: string | undefined): boolean {
  return severity != null && EXCEEDANCE_SEVERITIES.has(severity);
}

/** `true` gdy JAKIKOLWIEK element warstwy niesie przekroczenie — brama aktywności
 *  filtra „tylko przekroczenia” (wym. 17: przy braku przekroczeń kontrolka
 *  wyszarzona, zero dead-click). */
export function resultLabelsHaveExceedances(
  entries: Readonly<Record<string, ResultLabelEntry>> | undefined,
): boolean {
  if (!entries) return false;
  for (const ref of Object.keys(entries)) {
    if (isExceedanceSeverity(entries[ref].severity)) return true;
  }
  return false;
}

/** Stan filtrów warstwy wynikowej (wym. 17). Domyślnie WSZYSTKO widoczne —
 *  zgodnie z akceptacją R2 (sonda metryk przy domyślnych filtrach) i inwariantem
 *  geometrii (filtr działa WYŁĄCZNIE na warstwie etykiet). */
export interface ResultLabelFilter {
  /** Wielkości widoczne (odznaczenie ukrywa linie tej wielkości). */
  readonly quantities: Readonly<Record<ResultLabelQuantity, boolean>>;
  /** Klasy elementów widoczne (odznaczenie ukrywa cały wpis danej klasy). */
  readonly classes: Readonly<Record<ResultLabelKind, boolean>>;
  /** `true` = pokazuj wyłącznie elementy z przekroczeniem (severity>INFO). */
  readonly onlyExceedances: boolean;
}

export const DEFAULT_RESULT_LABEL_FILTER: ResultLabelFilter = {
  quantities: { P: true, Q: true, S: true, I: true, U: true, loading: true },
  classes: { source: true, transformer: true, branch: true, bus: true },
  onlyExceedances: false,
};

/** `true` gdy filtr jest w stanie DOMYŚLNYM (wszystko widoczne) — wtedy
 *  `applyResultLabelFilter` zwraca wejście bez zmian (tożsamość referencji:
 *  determinizm i zerowy koszt, sonda akceptacji R2 nietknięta). */
function isDefaultResultLabelFilter(filter: ResultLabelFilter): boolean {
  if (filter.onlyExceedances) return false;
  for (const q of Object.keys(filter.quantities) as ResultLabelQuantity[]) {
    if (!filter.quantities[q]) return false;
  }
  for (const k of Object.keys(filter.classes) as ResultLabelKind[]) {
    if (!filter.classes[k]) return false;
  }
  return true;
}

/**
 * Zastosuj filtry widoczności (wym. 17) do mapy etykiet — CZYSTA funkcja na
 * warstwie etykiet (scena/geometria NIETKNIĘTA). Kolejność:
 *   1. klasa elementu wyłączona ⇒ cały wpis pominięty;
 *   2. „tylko przekroczenia” ⇒ wpis bez przekroczenia (severity≤INFO) pominięty;
 *   3. linie przycięte do włączonych wielkości; wpis bez linii ⇒ pominięty.
 * Stan DOMYŚLNY (wszystko widoczne) ⇒ zwraca wejście bez zmian (tożsamość).
 * Determinizm: iteracja po kluczach posortowanych, brak zależności od kolejności
 * wstawień.
 */
export function applyResultLabelFilter(
  entries: Readonly<Record<string, ResultLabelEntry>> | undefined,
  filter: ResultLabelFilter,
): Readonly<Record<string, ResultLabelEntry>> {
  if (!entries) return {};
  if (isDefaultResultLabelFilter(filter)) return entries;
  const out: Record<string, ResultLabelEntry> = {};
  for (const ref of Object.keys(entries).sort()) {
    const entry = entries[ref];
    if (!filter.classes[entry.kind]) continue;
    if (filter.onlyExceedances && !isExceedanceSeverity(entry.severity)) continue;
    const lines = entry.lines.filter((line) => {
      const q = resultLabelLineQuantity(line.prefix);
      return q === null ? true : filter.quantities[q];
    });
    if (lines.length === 0) continue;
    out[ref] = lines.length === entry.lines.length ? entry : { ...entry, lines };
  }
  return out;
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
