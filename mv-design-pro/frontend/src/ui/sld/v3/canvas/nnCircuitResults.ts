/**
 * T2-WYNIKI (PLAN_SLD_NN_TOPOLOGIA_2026-08 §T2 „warstwa wyników nN na SLD"):
 * kontrakt + budowniczy CZYSTY panelu wyników odpływu nN, otwieranego z
 * KLIKU aparatu nN na kanwie v3 (ISTNIEJĄCY mechanizm `SldDetailDrawer`,
 * `elementKind==='apparatus'` w `SldCanvasV3Workspace.tsx` — zero nowego
 * kanału selekcji, werdykt §0 pkt 1 „ONE SOURCE OF TRUTH").
 *
 * ZAKRES: Ib / In / Iz′ / ΔU / Ik″max / Ik1_min / SWZ / I²t /
 * dobór-selektywność — KAŻDA liczba WYŁĄCZNIE z backendu (zero fizyki/
 * arytmetyki fizycznej w UI). Sekcja bez dostawcy danych w BIEŻĄCYM
 * przypadku (brak biegu załadowanego, brak wprowadzonych parametrów
 * dodatkowych) dostaje uczciwy stan `brak_wynikow` — NIGDY fabrykowaną
 * wartość. Werdykt SWZ niesie WŁASNY trzeci stan `nierozstrzygalne`
 * (backend, `application/analyses/swz/werdykt.py::SwzStatus`) — jawnie
 * odróżniony od `brak_wynikow` (backend nie mógł nawet policzyć pętli) i od
 * `nie_dotyczy` (układ sieci nie jest TN, IEC 60364-4-41 nie ma zastosowania).
 *
 * ŹRÓDŁA (mapowanie sekcja→endpoint, zero-phantom):
 *  - Ib, Ik″max      : metryki `I_A`/`IK_3F_A` z JUŻ ZAŁADOWANEGO przebiegu
 *                      (`useRawResultOverlayStore`, ten sam kanał co strzałki
 *                      przepływu/badge OLTC — `overlay.ts`), przy
 *                      `breakerRef`/`busRef` tego obwodu.
 *  - In              : `materialized_params` gałęzi aparatu (dane modelu/
 *                      katalogu — NIE wynik solvera, czysty odczyt).
 *  - ΔU              : `GET /api/quality/voltage-profile?run_id=` (przebieg
 *                      rozpływu mocy) — wiersz szyny `busRef`.
 *  - Ik1_min + SWZ    : `GET /{case_id}/enm/swz` (karta P0.6/G-22), TA SAMA
 *                      odpowiedź co odznaka SWZ na kanwie (`overlay.ts`
 *                      `SwzApiResponse`/`SwzOverlayEntry`) — jeden fetch,
 *                      dwie prezentacje.
 *  - Iz′, I²t, dobór  : WYMAGAJĄ dodatkowych danych wejściowych, których w
 *  -selektywność        tym modelu/przypadku dziś NIE MA (warunki ułożenia
 *                      kabla dla Iz′, dane cieplne przewodu dla I²t) — żaden
 *                      GET nie zwróci ich bez tych danych. Sekcja
 *                      `brak_wynikow` z PRECYZYJNYM powodem (nie placeholder
 *                      funkcji — diagnostyka braku danych w KONKRETNYM
 *                      przypadku, zero fabrykacji przycisku bez realnej akcji).
 */
import type { Branch, EnergyNetworkModel } from '../../../../types/enm';
import { getMetric, type RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
import { STATION_LV_VOLTAGE_LIMIT_KV } from '../../shared/stationBusResolution';
import type { VoltageProfileRowApi } from './nnSwzApi';
import type { SwzApiResponse } from './overlay';

// ---------------------------------------------------------------------------
// Rozwiązanie referencji obwodu nN z klikniętej gałęzi (aparat odpływu)
// ---------------------------------------------------------------------------

export interface NnCircuitRef {
  /** `Substation.ref_id` właściciela szyny nN, z której wychodzi obwód. */
  readonly stationRef: string;
  /** `Bus.ref_id` szyny nN — bliższy koniec gałęzi aparatu (bus_refs stacji). */
  readonly nnBusRef: string;
  /** `Bus.ref_id` DALSZY koniec gałęzi aparatu — punkt obwodu chroniony tym
   *  aparatem (Ib/Ik″max/ΔU liczone TU — „w punkcie zabudowy" aparatu,
   *  IEC 60947). */
  readonly busRef: string;
  /** `Branch.ref_id` klikniętego aparatu (switch/fuse) — `breaker_ref`
   *  dokładnie w przestrzeni endpointów `/enm/swz`, `/enm/nn-device-selection`. */
  readonly breakerRef: string;
}

function otherBusRef(branch: Pick<Branch, 'from_bus_ref' | 'to_bus_ref'>, busRef: string): string | null {
  if (branch.from_bus_ref === busRef) return branch.to_bus_ref;
  if (branch.to_bus_ref === busRef) return branch.from_bus_ref;
  return null;
}

/**
 * Rozwiązuje `NnCircuitRef` z ref klikniętej gałęzi — `null`, gdy gałąź nie
 * jest aparatem (switch/fuse) łączącym się z szyną nN (`voltage_kv <=
 * STATION_LV_VOLTAGE_LIMIT_KV`) należącą do jakiejkolwiek stacji
 * (`Substation.bus_refs`, relacja ENM, nie zgadywanie). Aparaty SN (kliknięte
 * pole rozdzielnicy SN) zwracają `null` — panel wyników nN NIE otwiera się
 * dla nich (uczciwy brak, zero fabrykacji zakresu napięciowego).
 */
export function resolveNnCircuitRef(
  snapshot: EnergyNetworkModel | null,
  breakerRef: string,
): NnCircuitRef | null {
  if (!snapshot) return null;
  const branch = (snapshot.branches ?? []).find(
    (b) => b.ref_id === breakerRef || b.id === breakerRef,
  );
  if (!branch) return null;
  if (branch.type !== 'switch' && branch.type !== 'breaker' && branch.type !== 'fuse'
    && branch.type !== 'disconnector' && branch.type !== 'bus_coupler') {
    return null;
  }
  const busByRef = new Map((snapshot.buses ?? []).map((bus) => [bus.ref_id, bus] as const));
  for (const station of snapshot.substations ?? []) {
    const stationBusRefs = new Set(station.bus_refs ?? []);
    const candidateNnBusRef = stationBusRefs.has(branch.from_bus_ref)
      ? branch.from_bus_ref
      : stationBusRefs.has(branch.to_bus_ref)
        ? branch.to_bus_ref
        : null;
    if (!candidateNnBusRef) continue;
    const nnBus = busByRef.get(candidateNnBusRef);
    if (!nnBus || nnBus.voltage_kv > STATION_LV_VOLTAGE_LIMIT_KV) continue;
    const farBusRef = otherBusRef(branch, candidateNnBusRef);
    if (!farBusRef) continue;
    return {
      stationRef: station.ref_id,
      nnBusRef: candidateNnBusRef,
      busRef: farBusRef,
      breakerRef: branch.ref_id,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sekcje wynikowe — stan czterowartościowy (wartość / brak wyników /
// nierozstrzygalne / nie dotyczy), zero fabrykacji.
// ---------------------------------------------------------------------------

/** Akcja naprawcza dostępna z uczciwego stanu zerowego — WYŁĄCZNIE realne,
 *  istniejące nawigacje (§0 pkt 1: „z akcją", zero fabrykowanych przycisków).
 *  `'przejdz-do-wynikow'` prowadzi do ISTNIEJĄCEGO ekranu Wyniki
 *  (`useNavigation().goToResults`), gdzie użytkownik uruchamia brakujący
 *  bieg (rozpływ mocy / zwarciowy). */
export type NnSectionAction = 'przejdz-do-wynikow';

export interface NnSectionValue<T> {
  readonly stan: 'wartosc';
  readonly wartosc: T;
  /** Pochodzenie WARTOŚCI — pokazywane w panelu (§14.2 „operator zawsze wie,
   *  czyj wynik ogląda"). */
  readonly zrodloPl: string;
}

export interface NnSectionBrakWynikow {
  readonly stan: 'brak_wynikow';
  readonly powodPl: string;
  readonly akcja?: NnSectionAction;
}

export interface NnSectionNieDotyczy {
  readonly stan: 'nie_dotyczy';
  readonly powodPl: string;
}

/**
 * Stan czterowartościowy sekcji: `wartosc` (dane z backendu) / `brak_wynikow`
 * (backend nie mógł policzyć albo bieg wymagany nie jest załadowany) /
 * `nie_dotyczy` (obwiązująca norma nie ma zastosowania — np. układ nie-TN).
 * Trzeci stan WERDYKTU SWZ („nierozstrzygalne", §0 pkt 1 werdyktu) NIE jest
 * osobną wartością TEGO enuma — to WŁASNY, wewnętrzny stan werdyktu SWZ
 * (`NnSwzValue.werdykt`), bo „nierozstrzygalne" jest tam ODPOWIEDZIĄ backendu
 * (sekcja MA dane — koperta `status==='OK'`), nie brakiem danych. Konflacja
 * tych dwóch pojęć w jednym polu ukryłaby różnicę między „nie policzono" i
 * „policzono, ale wynik jest nierozstrzygalny" — dokładnie to, czego
 * zabrania werdykt karty P0.6 §0.3 (fail-closed, jawny trzeci stan).
 */
export type NnSection<T> =
  | NnSectionValue<T>
  | NnSectionBrakWynikow
  | NnSectionNieDotyczy;

function brak(powodPl: string, akcja?: NnSectionAction): NnSectionBrakWynikow {
  return { stan: 'brak_wynikow', powodPl, akcja };
}

function wartosc<T>(wartoscValue: T, zrodloPl: string): NnSectionValue<T> {
  return { stan: 'wartosc', wartosc: wartoscValue, zrodloPl };
}

export interface NnAmpsValue {
  readonly amperow: number;
}

export interface NnKiloampsValue {
  readonly kiloamperow: number;
}

export interface NnPercentValue {
  readonly procent: number;
}

export interface NnRatedDeviceValue {
  readonly amperow: number;
  readonly typPl: string;
}

export type SwzWerdyktStatus = 'spełnia' | 'nie spełnia' | 'nierozstrzygalne';

export interface NnSwzValue {
  readonly werdykt: SwzWerdyktStatus;
  readonly przyczynaPl: string;
  readonly ik1MinA: number;
  readonly iaWymaganeA: number | null;
  readonly marginesProcent: number | null;
}

export interface NnCircuitResultsSpec {
  readonly ref: NnCircuitRef;
  readonly ib: NnSection<NnAmpsValue>;
  readonly inRated: NnSection<NnRatedDeviceValue>;
  readonly izPrime: NnSection<NnAmpsValue>;
  readonly deltaU: NnSection<NnPercentValue>;
  readonly ikMax: NnSection<NnKiloampsValue>;
  readonly ikMin: NnSection<NnKiloampsValue>;
  readonly swz: NnSection<NnSwzValue>;
  readonly iSquaredT: NnSection<{ readonly wytrzymalosc: boolean }>;
  readonly doborSelektywnosc: NnSection<{ readonly rekomendacjaPl: string }>;
  /** R2 (świeżość, wzorzec `overlay.ts::resultsStale`): `true` gdy model
   *  zmienił się po ostatnim biegu, którego wynik ten panel pokazuje —
   *  wartości NIE znikają, ale panel je oznacza (§ karty T2: „nieświeże =
   *  oznaczone, nie ukryte"). */
  readonly resultsStale: boolean;
}

const LOAD_FLOW_ANALYSIS_TYPE = 'load_flow';
const SHORT_CIRCUIT_ANALYSIS_TYPES = new Set(['sc_3f', 'short_circuit', 'short_circuit_sn']);

function isAnalysisType(payload: RawOverlayPayload | null, types: ReadonlySet<string> | string): boolean {
  const actual = (payload?.analysis_type ?? '').toLowerCase();
  if (typeof types === 'string') return actual === types;
  return types.has(actual);
}

/** In — prąd znamionowy aparatu, WYŁĄCZNIE odczyt z `materialized_params`
 *  (dane katalogowe zmaterializowane na gałęzi), namespace-świadomy DOKŁADNIE
 *  jak backend `swz/service.py::_aparat_from_branch` (jedna prawda o tym,
 *  gdzie leży In per rodzaj aparatu — zero drugiej klasyfikacji). */
function readRatedCurrent(branch: Branch): NnSectionValue<NnRatedDeviceValue> | NnSectionBrakWynikow {
  const params = branch.materialized_params;
  if (!params) {
    return brak('Aparat nie ma zmaterializowanych danych katalogowych (Catalog Binding).');
  }
  const catalogNamespace = branch.catalog_namespace;
  if (catalogNamespace === 'APARAT_NN_MCB') {
    const inA = params.in_a;
    if (typeof inA !== 'number') return brak('Brak prądu znamionowego (in_a) w danych katalogowych MCB.');
    return wartosc({ amperow: inA, typPl: `MCB${typeof params.curve_class === 'string' ? ` ${params.curve_class}` : ''}` }, 'model — katalog aparatu');
  }
  if (catalogNamespace === 'WKLADKA_NN') {
    const inA = params.in_a;
    if (typeof inA !== 'number') return brak('Brak prądu znamionowego (in_a) w danych katalogowych wkładki.');
    return wartosc({ amperow: inA, typPl: 'wkładka gG' }, 'model — katalog aparatu');
  }
  if (catalogNamespace === 'APARAT_NN') {
    const inA = params.i_n_a;
    if (typeof inA !== 'number') return brak('Brak prądu znamionowego (i_n_a) w danych katalogowych aparatu.');
    const deviceKind = params.device_kind;
    return wartosc(
      { amperow: inA, typPl: deviceKind === 'ROZLACZNIK_BEZPIECZNIKOWY' ? 'rozłącznik bezpiecznikowy' : 'wyłącznik nN' },
      'model — katalog aparatu',
    );
  }
  const kategoriaOpis = catalogNamespace ?? 'nieznana';
  return brak(`Aparat kategorii katalogu '${kategoriaOpis}' — brak reguły odczytu In dla tego rodzaju.`);
}

/**
 * ΔU — WYŁĄCZNIE odczyt `delta_pct` z wiersza `GET /api/quality/
 * voltage-profile` (rozplyw mocy). Eksportowana (nie lokalna): panel
 * (`NnCircuitResultsPanel`) pobiera wiersz PO otwarciu (na żądanie, nie
 * blokując otwarcia drawera na fetch) i wywołuje tę samą funkcję, żeby
 * przebudować WYŁĄCZNIE sekcję ΔU bez duplikowania reguły stanu.
 */
export function buildDeltaUSection(row: VoltageProfileRowApi | undefined, runId: string | undefined): NnSection<NnPercentValue> {
  if (!row || row.delta_pct == null) {
    return brak(
      'Brak wyniku profilu napięć dla tej szyny w załadowanym przebiegu rozpływu mocy.',
    );
  }
  return wartosc({ procent: row.delta_pct }, `profil napięć — bieg rozpływu mocy (${runId ?? '—'})`);
}

const BRAK_DANYCH_PETLI_POWOD_PL = 'Aparat nie jest korzeniem odpływu rozpoznanego przez pętlę zwarcia nN dla tej stacji.';

/**
 * Ik1_min — WYŁĄCZNIE odczyt z koperty `GET /enm/swz` (pole `swz.ik1_min_a`,
 * TA SAMA pętla — scenariusz MIN, R skorygowane temperaturowo — którą
 * backend liczy RAZ dla werdyktu SWZ; zero drugiego biegu solvera).
 */
function buildIkMinSection(response: SwzApiResponse | undefined): NnSection<NnKiloampsValue> {
  if (!response) return brak(BRAK_DANYCH_PETLI_POWOD_PL);
  if (response.status === 'nie dotyczy') {
    return { stan: 'nie_dotyczy', powodPl: 'Układ sieci nie jest TN — pętla zwarcia IEC 60364-4-41 nie ma zastosowania.' };
  }
  if (response.status === 'brak danych' || !response.swz) {
    return brak('Backend nie mógł policzyć pętli zwarcia dla tego punktu (model niekompletny).');
  }
  return wartosc(
    { kiloamperow: response.swz.ik1_min_a / 1000 },
    'pętla zwarcia IEC 60364-4-41 (Ik1_min, scenariusz MIN)',
  );
}

/**
 * Werdykt SWZ 3-stanowy — WYŁĄCZNIE odczyt z koperty `GET /enm/swz`
 * (`swz.status`: spełnia / nie spełnia / nierozstrzygalne — trzeci stan
 * jawny, fail-closed, NIGDY cichy fallback na „spełnia"). Koperta `status`
 * (OK/brak danych/nie dotyczy) jest INNYM poziomem niż werdykt — brak pętli
 * ⇒ `brak_wynikow`, układ nie-TN ⇒ `nie_dotyczy`, obliczona pętla ⇒ werdykt
 * (który MOŻE SAM być „nierozstrzygalne", np. aparat bez rozpoznanej klasy).
 */
function buildSwzSection(response: SwzApiResponse | undefined): NnSection<NnSwzValue> {
  if (!response) return brak(BRAK_DANYCH_PETLI_POWOD_PL);
  if (response.status === 'nie dotyczy') {
    return { stan: 'nie_dotyczy', powodPl: 'Układ sieci nie jest TN — SWZ metodą pętli TN nie ma zastosowania.' };
  }
  if (response.status === 'brak danych' || !response.swz) {
    return brak('Backend nie mógł ocenić SWZ dla tego obwodu (model niekompletny).');
  }
  return wartosc(
    {
      werdykt: response.swz.status,
      przyczynaPl: response.swz.przyczyna_pl,
      ik1MinA: response.swz.ik1_min_a,
      iaWymaganeA: response.swz.ia_wymagane_a,
      marginesProcent: response.swz.margines != null ? (response.swz.margines - 1) * 100 : null,
    },
    'SWZ per obwód (IEC 60364-4-41)',
  );
}

/**
 * Budowniczy CZYSTY (§14.2, wzorzec `buildFlowOverlayFromScene`): referencja
 * obwodu + gałąź aparatu + JUŻ ZAŁADOWANY przebieg + JUŻ POBRANY wpis SWZ →
 * komplet 8 sekcji (§0 pkt 1 werdyktu). Zero fetch tutaj — WOŁAJĄCY dostarcza
 * gotowe dane (panel/hook robią fetch, ten moduł WYŁĄCZNIE składa wynik).
 */
export function buildNnCircuitResultsSections(params: {
  readonly ref: NnCircuitRef;
  readonly branch: Branch;
  readonly overlayPayload: RawOverlayPayload | null;
  /** Odpowiedź `GET /enm/swz` dla TEGO breakerRef (pełna koperta backendu —
   *  `status` OK/brak danych/nie dotyczy — TA SAMA odpowiedź, z której
   *  `overlay.ts::buildSwzOverlayFromResponses` buduje odznakę na kanwie;
   *  `undefined` = aparat nie jest korzeniem żadnego odpływu rozpoznanego
   *  przez `/enm/fault-loop-feeders` dla tej stacji (np. aparat WEWNĄTRZ
   *  toru, nie na starcie odpływu z szyny nN). */
  readonly swzResponse: SwzApiResponse | undefined;
  /** Wiersz `GET /api/quality/voltage-profile` dla `ref.busRef` — `undefined`
   *  gdy nie pobrany jeszcze (panel pobiera na żądanie, dopiero gdy otwarty
   *  i przebieg rozpływu mocy jest załadowany, patrz `NnCircuitResultsPanel`). */
  readonly voltageProfileRow: VoltageProfileRowApi | undefined;
  readonly resultsStale: boolean;
}): NnCircuitResultsSpec {
  const { ref, branch, overlayPayload, swzResponse, voltageProfileRow, resultsStale } = params;

  const ib: NnSection<NnAmpsValue> = isAnalysisType(overlayPayload, LOAD_FLOW_ANALYSIS_TYPE)
    ? (() => {
        const metric = getMetric(overlayPayload, ref.breakerRef, 'I_A');
        if (!metric || metric.value == null) {
          return brak('Przebieg rozpływu mocy załadowany, ale brak wyniku prądu dla tego odpływu.');
        }
        return wartosc({ amperow: metric.value }, `bieg rozpływu mocy (${overlayPayload?.run_id ?? '—'})`);
      })()
    : brak('Brak załadowanego przebiegu rozpływu mocy — uruchom analizę, żeby zobaczyć Ib.', 'przejdz-do-wynikow');

  const inRated = readRatedCurrent(branch);

  const izPrime: NnSection<NnAmpsValue> = brak(
    'Iz′ wymaga warunków ułożenia kabla (środowisko, izolacja, temperatura, liczba obwodów) — brak wprowadzonych danych dla tego odcinka w tym modelu.',
  );

  const ikMax: NnSection<NnKiloampsValue> = isAnalysisType(overlayPayload, SHORT_CIRCUIT_ANALYSIS_TYPES)
    ? (() => {
        const metric = getMetric(overlayPayload, ref.busRef, 'IK_3F_A');
        if (!metric || metric.value == null) {
          return brak('Przebieg zwarciowy załadowany, ale brak wyniku Ik″ dla tego punktu.');
        }
        return wartosc({ kiloamperow: metric.value / 1000 }, `bieg zwarciowy (${overlayPayload?.run_id ?? '—'})`);
      })()
    : brak('Brak załadowanego przebiegu zwarciowego — uruchom analizę, żeby zobaczyć Ik″max.', 'przejdz-do-wynikow');

  const deltaU: NnSection<NnPercentValue> = isAnalysisType(overlayPayload, LOAD_FLOW_ANALYSIS_TYPE)
    ? buildDeltaUSection(voltageProfileRow, overlayPayload?.run_id)
    : brak('Brak załadowanego przebiegu rozpływu mocy — uruchom analizę, żeby zobaczyć ΔU.', 'przejdz-do-wynikow');

  const ikMin = buildIkMinSection(swzResponse);
  const swz = buildSwzSection(swzResponse);

  const iSquaredT: NnSection<{ readonly wytrzymalosc: boolean }> = brak(
    'I²t wymaga danych cieplnych przewodu (Ith(1s)/Jth(1s), materiał, przekrój) i czasu trwania zwarcia — brak wprowadzonych danych dla tego odcinka.',
  );

  // Dobór aparatu (`GET /enm/nn-device-selection`) wymaga Ib ORAZ Iz′
  // JEDNOCZEŚNIE jako parametrów wejściowych (backend ich nie wyprowadza —
  // `application/analyses/nn_device_selection.py`, patrz nagłówek modułu).
  // Iz′ jest w tym module ZAWSZE `brak_wynikow` (sekcja wyżej) — dobór
  // dziedziczy ten sam brak, jawnie wskazując źródło (zero duplikowania
  // powodu w dwóch miejscach z ryzykiem rozjazdu treści).
  const doborSelektywnosc: NnSection<{ readonly rekomendacjaPl: string }> = brak(
    'Dobór aparatu wymaga Ib i Iz′ jednocześnie — Iz′ nie jest dostępne w tym przypadku (patrz sekcja Iz′ wyżej).',
  );

  return { ref, ib, inRated, izPrime, deltaU, ikMax, ikMin, swz, iSquaredT, doborSelektywnosc, resultsStale };
}
