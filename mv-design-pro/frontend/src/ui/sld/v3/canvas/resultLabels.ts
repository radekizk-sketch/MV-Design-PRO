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
 * `payload.elements`; przęsło — `segmentRef` == `branch_id` (bramka orientacji
 * `orientedSegmentRefs`, ta sama co flow); szyna — `meta.ownerRef`,
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
import type { RawMetricValue, RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
import { getMetric } from '../../../sld-overlay/rawResultOverlayStore';
import type { EnergyNetworkModel } from '../../../../types/enm';
import type { SceneV3 } from '../scene/buildScene';
import { orientedSegmentRefs } from './overlay';
import type { ResultPointCoverage, ResultRefBridge } from './resultRefBridge';
import {
  applyDeltaSign,
  computeResultLabelTrend,
  normalizeResultLabelAnalysis,
  selectResultLabelSpecs,
  type ResultLabelAnalysis,
  type ResultLabelComparisonMode,
  type ResultLabelKind,
  type ResultLabelLine,
  type ResultLabelLineSpec,
} from './resultLabelTemplates';

export type { ResultLabelKind, ResultLabelLine } from './resultLabelTemplates';
export type { ResultLabelComparisonMode, ResultLabelTrend } from './resultLabelTemplates';

/**
 * R4 (wym. 10/15) — KONTEKST porównawczy dla buildera etykiet: poprzedni payload
 * (ten SAM `analysis_type` co bieżący — gwarantuje wołający) + tryb prezentacji.
 * Porównanie WYŁĄCZNIE ref-do-ref i kod-do-kodu (lookup po TYM SAMYM refie i
 * kodzie metryki, którymi zbudowano linię bieżącą) — element/kod bez
 * odpowiednika w poprzednim biegu nie dostaje ani Δ, ani trendu (uczciwie).
 */
export interface ResultLabelComparison {
  readonly previousPayload: RawOverlayPayload;
  readonly mode: ResultLabelComparisonMode;
}

/** Wpis etykiety wynikowej jednego elementu — linie w kolejności priorytetu
 *  (kotwica z `ownerRef` w rendererze; zwijanie LOD w rendererze). Pusty
 *  (`lines.length===0`) NIE jest emitowany. */
export interface ResultLabelEntry {
  readonly ownerRef: string;
  /** S9-2 — ref PUNKTU WYNIKU (klucz `payload.elements`), z którego zbudowano
   *  linie. Różny od `ownerRef` wszędzie tam, gdzie rysunek nazywa obiekt
   *  refem kompozytowym (szyna stacji `${stationRef}#sn-bus`, blok stacji na
   *  L0, symbol transformatora zakotwiczony na polu) — patrz
   *  `resultRefBridge.ts`. Nośnik tożsamości dla dedupu (jedna etykieta na
   *  punkt) i dla rachunku pokrycia (`summarizeResultPointCoverage`). */
  readonly resultRef: string;
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

/** Czy metryka niesie skończoną liczbę (jedyny warunek emisji linii, §0). */
function finiteMetric(metric: RawMetricValue | null): metric is RawMetricValue & { value: number } {
  return metric != null && metric.value !== null && metric.value !== undefined && Number.isFinite(metric.value);
}

/**
 * R4 (wym. 10/15) — złóż JEDNĄ linię z bieżącej metryki i (opcjonalnie)
 * porównania. Bez porównania (lub gdy poprzednia metryka nie istnieje) linia
 * jest BAZOWA (`{prefix, text}`, bez `trend`). Z porównaniem i istniejącą
 * poprzednią metryką: `text` = Δ ze znakiem (`delta`) albo „poprzednia →
 * bieżąca" (`previous`), a `trend` = kierunek wg progu martwej strefy. Znak i
 * jednostka Δ pochodzą z ISTNIEJĄCEGO formattera szablonu (`spec.format`) —
 * zero nowej prezentacji fizyki.
 */
function buildLine(
  metric: RawMetricValue & { value: number },
  spec: ResultLabelLineSpec,
  comparison: ResultLabelComparison | undefined,
  lookupRef: string,
): ResultLabelLine {
  const base = spec.format(metric);
  if (!comparison) return { prefix: spec.prefix, text: base };
  const prev = getMetric(comparison.previousPayload, lookupRef, spec.code);
  if (!finiteMetric(prev)) return { prefix: spec.prefix, text: base }; // brak odpowiednika ⇒ bez trendu
  const trend = computeResultLabelTrend(prev.value, metric.value);
  if (comparison.mode === 'delta') {
    const diff = metric.value - prev.value;
    const deltaBody = applyDeltaSign(spec.format({ ...metric, value: diff }), diff);
    return { prefix: spec.prefix, text: `Δ ${deltaBody}`, trend };
  }
  return { prefix: spec.prefix, text: `${spec.format(prev)} → ${base}`, trend };
}

/** Zbuduj linie dla jednego elementu z metryk payloadu (obecne kody → linie,
 *  w kolejności specyfikacji; brak kodu ⇒ brak linii). Wartość `null`/brak/
 *  nieskończona ⇒ linia pominięta (zero placeholderów, §0). `comparison` (R4)
 *  wzbogaca linie o Δ/poprzednią i trend — po TYM SAMYM `ownerRef` (ref-do-ref)
 *  i kodzie (kod-do-kodu). */
function linesFor(
  payload: RawOverlayPayload,
  ownerRef: string,
  specs: readonly ResultLabelLineSpec[],
  comparison?: ResultLabelComparison,
): readonly ResultLabelLine[] {
  const lines: ResultLabelLine[] = [];
  const presentCodes = new Set<string>();
  for (const spec of specs) {
    if (spec.skipIfAnyPresent && spec.skipIfAnyPresent.some((c) => presentCodes.has(c))) continue;
    const metric = getMetric(payload, ownerRef, spec.code);
    if (!finiteMetric(metric)) continue;
    presentCodes.add(spec.code);
    lines.push(buildLine(metric, spec, comparison, ownerRef));
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
 * S9-2 — klasy symboli sceny DOPUSZCZONE do warstwy wynikowej. Poza rodzinami
 * z tabeli wyżej dochodzi `station`: zwinięty blok stacji na poziomie przeglądu
 * (L0), który — przez most refów — niesie wartość STACYJNĄ (szyna SN stacji).
 * `apparatus` NIE jest tu wymieniony celowo: symbol aparatu pola dzieli
 * `ownerRef` z polem, więc bez tej bramy etykieta transformatora stacji mogłaby
 * zakotwiczyć się na rozłączniku zamiast na symbolu transformatora.
 */
const LABELLED_SYMBOL_KINDS: ReadonlySet<string> = new Set([
  'transformer',
  'source',
  'der',
  'station',
]);

/**
 * ADAPTER-BUSREF (dług W4/R2/V12K-163): ref używany do DOPASOWANIA payloadu
 * dla segmentu — kanoniczny `Bus.ref_id` (`meta.busResultRef`, niesiony ze
 * snapshotu przez adapter dla szyn GPZ o refie kompozytowym), a w jego braku
 * `meta.ownerRef` — ale WYŁĄCZNIE gdy `ownerRef` jest refem MODELU, nie refem
 * RYSUNKU.
 *
 * ODMOWA ZAMIAST PODSTAWIENIA (karta WN-WYNIK, klasa „wynik jednego elementu na
 * innym elemencie"): ref RYSUNKOWY poznajemy po sufiksie kompozytowym
 * (`${cośRealnego}#sn-bus`, `#bus-primary`, `#hv-bus` — konwencja
 * `compose/station.ts`/`compose/gpz.ts`). Taki ref NIE ISTNIEJE w przestrzeni
 * `payload.elements` (klucze backendu to `Bus.ref_id`), więc schodzenie do niego
 * może wyłącznie (a) chybić albo (b) trafić CUDZY klucz, gdyby kiedykolwiek
 * skolidował — czyli przypiąć szynie wartość innego obiektu. INWENTARZ (pomiar
 * kart WN-WYNIK na sieci referencyjnej 52 stacji i na 6 kształtach GPZ z żywego
 * backendu): ZERO odcinków szynowych sceny ma `ownerRef` równy
 * `Bus.ref_id` — fallback nie obsługiwał ŻADNEJ realnej szyny, obsługiwał
 * wyłącznie ryzyko. Odcinki toru (`elementKind==='segment'`) mają `ownerRef`
 * BEZ sufiksu (realny `branch_id`) i przechodzą jak dotąd.
 *
 * `undefined` = uczciwy brak dopasowania (wołający NIE rysuje etykiety), nigdy
 * wartość sąsiada. TA SAMA dyscyplina, co bramka przęseł w
 * `buildResultLabelsFromScene` (`ownerRef.includes('#') ⇒ pomiń`) — jedna
 * reguła dla całej warstwy wynikowej. */
export function resultRefForSegment(
  meta: { readonly ownerRef?: string; readonly busResultRef?: string } | undefined,
): string | undefined {
  if (meta?.busResultRef) return meta.busResultRef;
  const ownerRef = meta?.ownerRef;
  if (!ownerRef || ownerRef.includes('#')) return undefined;
  return ownerRef;
}

/**
 * Zbuduj mapę etykiet wynikowych `ownerRef → ResultLabelEntry` dla jednej sceny.
 * `payload===null` ⇒ pusta mapa (§14.2 „overlay wyłączony bez wyniku"). TREŚĆ
 * wg rejestru szablonów (`resultLabelTemplates.ts`) dla rodziny analizy z
 * `payload.analysis_type`; nierozpoznana analiza ⇒ brak szablonów ⇒ pusta mapa
 * (zero fabrykacji). Element bez pasujących metryk ⇒ brak wpisu (zero atrap).
 * `trustedBranchRefs`: zbiór refów przęseł o UDOWODNIONEJ orientacji
 * (klucze `orientedSegmentRefs`) — jedyne przęsła z jednoznaczną tożsamością
 * gałęzi, dopuszczone do etykiety (spójnie z bramką flow).
 * `bridge` (S9-2, `resultRefBridge.ts`): most refów rysunek → punkt wyniku dla
 * elementów, których rysunek nazywa INACZEJ niż model (szyny stacji, blok
 * stacji na L0, transformator stacji zakotwiczony na polu). Brak mostu ⇒
 * zachowanie sprzed karty (`meta.busResultRef` / `ownerRef`).
 */
export function buildResultLabelsFromScene(
  scene: SceneV3,
  payload: RawOverlayPayload | null,
  trustedBranchRefs: ReadonlySet<string>,
  comparison?: ResultLabelComparison,
  bridge?: ResultRefBridge,
): Record<string, ResultLabelEntry> {
  const entries: Record<string, ResultLabelEntry> = {};
  if (!payload) return entries;
  const analysis: ResultLabelAnalysis | null = normalizeResultLabelAnalysis(payload.analysis_type);
  if (!analysis) return entries;

  // S9-2: JEDEN dedup dla całej sceny — po refie PUNKTU WYNIKU, nie po refie
  // rysunku. Domyka dotychczasowy dedup szyn GPZ (sekcja rysowana jako
  // główna+rezerwowa+domknięcie ringu dzieli jeden `busResultRef`) i obejmuje
  // przypadki mostu (blok stacji L0 i odcinek szyny SN wskazują TEN SAM punkt).
  const seenResultRefs = new Set<string>();
  const emit = (ownerRef: string, resultRef: string, kind: ResultLabelKind): void => {
    if (entries[ownerRef] || seenResultRefs.has(resultRef)) return;
    const lines = linesFor(payload, resultRef, selectResultLabelSpecs(analysis, kind), comparison);
    if (lines.length === 0) return;
    seenResultRefs.add(resultRef);
    entries[ownerRef] = { ownerRef, resultRef, kind, lines, severity: severityOf(payload, resultRef) };
  };

  for (const symbol of scene.symbols) {
    const elementKind = symbol.meta?.elementKind;
    const ownerRef = symbol.meta?.ownerRef;
    if (!elementKind || !ownerRef || !LABELLED_SYMBOL_KINDS.has(elementKind)) continue;
    // MOST REFÓW (S9-2) ma pierwszeństwo: symbol transformatora stacji jest
    // zakotwiczony na polu (`…/sn_field/003`), a zwinięty blok stacji na L0 na
    // refie stacji — oba wskazują punkt wyniku, którego rysunek nie nazywa.
    const binding = bridge?.get(ownerRef);
    const labelKind = binding?.kind ?? SYMBOL_KIND_TO_LABEL_KIND[elementKind];
    if (!labelKind) continue;
    emit(ownerRef, binding?.resultRef ?? ownerRef, labelKind);
  }

  for (const segment of scene.segments) {
    const elementKind = segment.meta?.elementKind;
    const ownerRef = segment.meta?.ownerRef;
    if (!elementKind || !ownerRef) continue;
    if (entries[ownerRef]) continue;
    const binding = bridge?.get(ownerRef);
    if (binding) {
      // Szyna stacji (`${stationRef}#sn-bus` / `#lv-bus`): ref rysunkowy nie
      // jest refem szyny w modelu. Most rozstrzyga też KLASĘ — odcinek szyny nN
      // jest w scenie klasyfikowany jako zwykły odcinek toru, a jest szyną.
      emit(ownerRef, binding.resultRef, binding.kind);
      continue;
    }
    if (elementKind === 'bus') {
      // ODMOWA ZAMIAST PODSTAWIENIA (WN-WYNIK): brak udowodnionego punktu
      // wyniku ⇒ BRAK etykiety. Dawne `?? ownerRef` sprowadzało odcinek szyny
      // do jego refu RYSUNKOWEGO (`…#hv-bus`) — klucza, którego backend nie
      // emituje, a który mógł skolidować z refem innego obiektu.
      const busResultRef = resultRefForSegment(segment.meta);
      if (busResultRef) emit(ownerRef, busResultRef, 'bus');
    } else if (elementKind === 'segment') {
      if (ownerRef.includes('#') || !trustedBranchRefs.has(ownerRef)) continue;
      emit(ownerRef, ownerRef, 'branch');
    }
  }

  return entries;
}

/**
 * S9-2 — UCZCIWY RACHUNEK POKRYCIA warstwy wynikowej: każdy punkt wyniku
 * backendu trafia do DOKŁADNIE JEDNEJ z czterech kategorii, a ich suma równa
 * się liczbie punktów (inwariant testowany). Kolejność rozstrzygania (pierwsza
 * pasująca wygrywa — stąd rozłączność):
 *   1. `hiddenByModel` — model JAWNIE nie rysuje tego węzła
 *      (`Bus.meta.render_on_sld === false`: mufa ciągu, zacisk pola);
 *   2. `withoutTemplate` — rodzina analizy nie ma szablonu treści dla klasy
 *      tego elementu (np. gałąź w wyniku zwarciowym);
 *   3. `labelled` — punkt ma etykietę (jest w mapie wpisów, po `resultRef`);
 *   4. `withoutAnchor` — reszta: punkt rysowalny i z szablonem, ale bez elementu
 *      sceny (odmowa mostu przy niejednoznaczności albo element spoza sieci).
 * Kategoria 4 to jedyny REALNY brak pokrycia — jej refy są wypisane.
 */
export function summarizeResultPointCoverage(
  payload: RawOverlayPayload | null,
  entries: Readonly<Record<string, ResultLabelEntry>> | undefined,
  hiddenByModel: ReadonlySet<string>,
): ResultPointCoverage {
  const empty: ResultPointCoverage = {
    total: 0,
    labelled: 0,
    hiddenByModel: 0,
    withoutTemplate: 0,
    withoutAnchor: 0,
    withoutAnchorRefs: [],
  };
  if (!payload) return empty;
  const analysis = normalizeResultLabelAnalysis(payload.analysis_type);
  const labelledRefs = new Set<string>();
  for (const ref of Object.keys(entries ?? {})) labelledRefs.add((entries ?? {})[ref].resultRef);
  let labelled = 0;
  let hidden = 0;
  let withoutTemplate = 0;
  const withoutAnchorRefs: string[] = [];
  for (const ref of Object.keys(payload.elements).sort()) {
    if (hiddenByModel.has(ref)) {
      hidden += 1;
      continue;
    }
    if (!resultPointHasTemplate(analysis, payload, ref)) {
      withoutTemplate += 1;
      continue;
    }
    if (labelledRefs.has(ref)) {
      labelled += 1;
      continue;
    }
    withoutAnchorRefs.push(ref);
  }
  return {
    total: Object.keys(payload.elements).length,
    labelled,
    hiddenByModel: hidden,
    withoutTemplate,
    withoutAnchor: withoutAnchorRefs.length,
    withoutAnchorRefs,
  };
}

/** Klasa elementu payloadu (`RawOverlayElement.kind`, kontrakt backendu
 *  `result_builder_v1`) → klasa szablonu warstwy wynikowej. `generator` to
 *  klasa źródeł/DER w payloadzie (`gpz/…/source/main` ma `kind: "generator"`).
 *  Klasa nieznana ⇒ brak szablonu (uczciwie, zero fabrykacji). */
const PAYLOAD_KIND_TO_LABEL_KIND: Readonly<Record<string, ResultLabelKind>> = {
  bus: 'bus',
  branch: 'branch',
  transformer: 'transformer',
  generator: 'source',
  source: 'source',
};

/** `true` gdy rodzina analizy ma szablon treści dla klasy tego punktu ORAZ
 *  punkt niesie co najmniej jedną metrykę z tego szablonu (brak metryk = brak
 *  linii = brak etykiety; ta sama bramka co w builderze, jedno źródło prawdy). */
function resultPointHasTemplate(
  analysis: ResultLabelAnalysis | null,
  payload: RawOverlayPayload,
  ref: string,
): boolean {
  if (!analysis) return false;
  const kind = PAYLOAD_KIND_TO_LABEL_KIND[payload.elements[ref]?.kind ?? ''];
  if (!kind) return false;
  const specs = selectResultLabelSpecs(analysis, kind);
  return specs.some((spec) => finiteMetric(getMetric(payload, ref, spec.code)));
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
  // Sk = moc zwarciowa [MVA] (R4) — filtrowana pod „moc pozorna S" (obie w MVA,
  // najbliższa semantyka; linia pozostaje filtrowalna, brak cichego gubienia).
  Sk: 'S',
  I: 'I',
  'Ik″': 'I',
  ip: 'I',
  Ith: 'I',
  U: 'U',
  δ: 'U',
  // ΔU = spadek napięcia linii/kabla [%] — wielkość NAPIĘCIOWA (LF-KONTRAKT
  // V12K-161 dołożył ją do szablonu gałęzi, ale tabela nie została uzupełniona:
  // linia przechodziła przez filtry niefiltrowalna. Deklaracja „tabela
  // ZAMKNIĘTA" nie miała testu — teraz ma).
  'ΔU': 'U',
  // cosφ = |P|/|S| — mówi, jaka CZĘŚĆ mocy pozornej jest mocą czynną, więc
  // znika razem z grupą mocy czynnej (ta sama zasada „najbliższa semantyka"
  // co przy Sk→S). Dotąd bez wpisu, z tego samego powodu co ΔU.
  'cosφ': 'P',
  'obc.': 'loading',
  // NAKŁADKA RÓŻNIC A/B — prefiksy rodziny `short_circuit_delta`. Różnica
  // wielkości filtruje się jak sama wielkość (Δ Ik″/ip/Ith → prądy, Δ Sk → moc
  // pozorna), inaczej włączenie filtra prądów zostawiłoby różnice prądów na
  // ekranie: tabela jest ZAMKNIĘTA, każdy prefiks szablonu musi tu być.
  'Δ Ik″': 'I',
  'Δ Ik″ %': 'I',
  'Δ ip': 'I',
  'Δ Ith': 'I',
  'Δ Sk': 'S',
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

/** Ponowny eksport bramki orientacji — wołający (workspace) używa TEGO SAMEGO
 *  zbioru co nakładka przepływu (jedna definicja, `overlay.ts`): przęsło z
 *  udowodnioną tożsamością gałęzi dostaje i etykietę, i strzałkę, albo żadnego
 *  z dwojga. */
export { orientedSegmentRefs };
export type { EnergyNetworkModel };
