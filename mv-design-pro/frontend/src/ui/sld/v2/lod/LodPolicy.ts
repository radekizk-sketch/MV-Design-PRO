/**
 * SLD v2 LOD Policy — 5 poziomów szczegółowości (PR-5).
 *
 * @see docs/sld/SLD_LOD_AND_LAYERS.md (LOD 0–4)
 */

export type LodLevel = 0 | 1 | 2 | 3 | 4;

/** Progi zoom dla automatycznego LOD. */
export const LOD_ZOOM_THRESHOLDS = {
  // scale >= próg → tym wyższy LOD
  LOD_0_MAX: 0.3, // < 0.3: overview (mapa)
  LOD_1_MAX: 0.7, // 0.3–0.7: sieć
  LOD_2_MAX: 1.5, // 0.7–1.5: obiekty
  LOD_3_MAX: 3.0, // 1.5–3.0: szczegół techniczny
  // > 3.0: LOD 4 (diagnostyka)
} as const;

/** Etykiety poziomow szczegolowosci widoczne dla projektanta. */
export const LOD_LEVEL_LABELS_PL: Readonly<Record<LodLevel, string>> = {
  0: 'Topologia sieci',
  1: 'Odcinki i kierunki zasilania',
  2: 'Stacje, długości i moce',
  3: 'Pola, aparatura i zabezpieczenia',
  4: 'Pomiary, nastawy i dowody',
};

/** Wnioskuje LOD z scale viewport-a. */
export function inferLodFromScale(scale: number): LodLevel {
  if (scale < LOD_ZOOM_THRESHOLDS.LOD_0_MAX) return 0;
  if (scale < LOD_ZOOM_THRESHOLDS.LOD_1_MAX) return 1;
  if (scale < LOD_ZOOM_THRESHOLDS.LOD_2_MAX) return 2;
  if (scale < LOD_ZOOM_THRESHOLDS.LOD_3_MAX) return 3;
  return 4;
}

/**
 * Wszystkie kindy elementów rozpoznawane przez LOD policy.
 *
 * Phase 0A dodaje 4 nowe kindy:
 * - `mini_block_overview` (LOD 0+): mini-RMU w widoku systemowym.
 * - `mini_block_compact` (LOD 2+): mini-RMU w wariancie kompaktowym.
 * - `mini_block_detail` (LOD 3+): mini-RMU w wariancie szczegółowym.
 * - `gpz_switchgear` (LOD 1+): GPZ z sekcjami i polami (delegacja).
 * - `der_sub_tree` (LOD 3+): pełne drzewo połączeniowe DER.
 */
export type LodElementKind =
  | 'gpz_block'
  | 'section'
  | 'bay_head'
  | 'device'
  | 'device_label'
  | 'cable_run'
  | 'station_block'
  | 'station_internal'
  | 'der_marker'
  | 'der_full'
  | 'measurement'
  | 'q_label'
  | 'missing_data_marker'
  | 'alarm_marker'
  | 'nop_marker'
  | 'mini_block_overview'
  | 'mini_block_compact'
  | 'mini_block_detail'
  | 'gpz_switchgear'
  | 'der_sub_tree'
  // Spine: ciąg SN jako poziomy korytarz (PR-B konsolidacji UI).
  // Widoczny od LOD 0 (overview) — zawsze rysujemy szkielet topologii.
  | 'spine_axis'
  // Węzły na osi spine (stacja, ZKSN, słup, NOP).
  | 'spine_node'
  // Odgałęzienia do branch run-ów.
  | 'spine_branch';

/** Czy element typu X jest widoczny na danym LOD. */
export function isVisibleAtLod(
  elementKind: LodElementKind,
  lod: LodLevel,
): boolean {
  switch (elementKind) {
    case 'gpz_block': return lod >= 0;
    case 'section': return lod >= 1;
    case 'bay_head': return lod >= 1;
    case 'device': return lod >= 2;
    case 'device_label': return lod >= 3;
    case 'cable_run': return lod >= 0;
    case 'station_block': return lod >= 0;
    case 'station_internal': return lod >= 3;
    case 'der_marker': return lod >= 0;
    case 'der_full': return lod >= 2;
    case 'measurement': return lod >= 3;
    case 'q_label': return lod >= 3;
    case 'missing_data_marker': return lod >= 1;
    case 'alarm_marker': return lod >= 0;
    case 'nop_marker': return lod >= 1;
    case 'mini_block_overview': return lod >= 0;
    case 'mini_block_compact': return lod >= 2;
    case 'mini_block_detail': return lod >= 3;
    case 'gpz_switchgear': return lod >= 1;
    case 'der_sub_tree': return lod >= 3;
    case 'spine_axis': return lod >= 0;
    case 'spine_node': return lod >= 0;
    case 'spine_branch': return lod >= 1;
  }
}

/**
 * Mapping 5 poziomów LOD na 4 etykiety produktowe.
 * Pozwala UI używać czytelnych nazw (overview/medium/detail/zoom-in)
 * bez zmiany istniejącej semantyki numerycznej.
 */
export type LodLabel = 'overview' | 'medium' | 'detail' | 'zoom-in';

export function lodLabel(lod: LodLevel): LodLabel {
  if (lod === 0) return 'overview';
  if (lod === 1 || lod === 2) return 'medium';
  if (lod === 3) return 'detail';
  return 'zoom-in';
}

/** Czy obiekt zaznaczony "wybija" widoczność na wyższy LOD niż globalny. */
export function effectiveLodForElement(
  globalLod: LodLevel,
  isSelected: boolean,
): LodLevel {
  if (!isSelected) return globalLod;
  // Selected obiekt: minimum LOD 3 (pełen detal)
  return Math.max(globalLod, 3) as LodLevel;
}

export type SldLayerId =
  | 'equipment'
  | 'labels'
  | 'ports'
  | 'measurements'
  | 'results-pf'
  | 'results-voltage'
  | 'results-sc'
  | 'stability'
  | 'missing-data'
  | 'protection'
  | 'der'
  | 'topology'
  | 'alarms'
  | 'spine';

/** Domyślne stany warstw widoczności (start aplikacji). */
export const DEFAULT_LAYER_VISIBILITY: Readonly<Record<SldLayerId, boolean>> = {
  equipment: true,
  labels: true,
  ports: false,
  measurements: false,
  'results-pf': false,
  'results-voltage': false,
  'results-sc': false,
  stability: false,
  'missing-data': true,
  protection: true,
  der: true,
  topology: true,
  alarms: true,
  spine: false,
};

/** Polskie etykiety warstw (UI). */
export const LAYER_LABELS_PL: Readonly<Record<SldLayerId, string>> = {
  equipment: 'Aparatura',
  labels: 'Etykiety',
  ports: 'Porty',
  measurements: 'Pomiary',
  'results-pf': 'Wyniki rozpływowe',
  'results-voltage': 'Wyniki napięciowe',
  'results-sc': 'Wyniki zwarciowe',
  stability: 'Stabilność / FRT',
  'missing-data': 'Konfiguracja',
  protection: 'Zabezpieczenia',
  der: 'OZE / BESS / FW',
  topology: 'Topologia pracy',
  alarms: 'Alarmy / uzależnienia',
  spine: 'Ciąg SN (preview)',
};

// =============================================================================
// LOD Hysteresis FSM (Phase 0A)
// =============================================================================

/**
 * Histereza LOD: zapobiega migotaniu na progach (np. 0.68 ↔ 0.72 dla
 * progu 0.7). Reguła:
 *   - Aby przejść z LOD N do LOD N+1, scale musi przekroczyć próg(N) *
 *     (1 + hysteresisMargin).
 *   - Aby przejść z LOD N do LOD N-1, scale musi spaść poniżej próg(N) *
 *     (1 - hysteresisMargin).
 *
 * Domyślny margines: 0.15 (15%) — stabilizuje przejścia.
 *
 * Debounce: zmiana LOD wymaga utrzymania nowego progu przez `debounceMs`
 * (domyślnie 250 ms). Wcześniejszy powrót do poprzedniego progu anuluje
 * przejście.
 *
 * Acceptance Invariant nr 6: LOD zmienia tylko szczegół wizualny, NIE
 * topologię. Hysteresis controller jest pure state machine — nie dotyka
 * domeny.
 */
export interface LodControllerOptions {
  readonly initialScale: number;
  /** Margines histerezy (0–1). Domyślnie 0.15 (15%). */
  readonly hysteresisMargin?: number;
  /** Debounce ms dla zmiany LOD. Domyślnie 250 ms. */
  readonly debounceMs?: number;
  /**
   * Wstrzyknięcie zegara — używane w testach. Pozwala kontrolować
   * upływ czasu bez czekania na real timery.
   */
  readonly nowProvider?: () => number;
}

export interface LodController {
  /**
   * Aktualizuje scale. Zwraca aktualny LOD (po zastosowaniu histerezy
   * i debounce). Wywołanie nie ma efektów ubocznych.
   */
  update(scale: number, atTimeMs?: number): LodLevel;
  /** Aktualny LOD bez aktualizacji scale. */
  getLod(): LodLevel;
  /** Ostatnio przekazany scale. */
  getScale(): number;
  /** Reset do scale, bez histerezy/debounce. */
  reset(scale: number): void;
}

interface PendingTransition {
  readonly targetLod: LodLevel;
  readonly armedAtMs: number;
}

/**
 * Tworzy kontroler LOD z histerezą i debounce.
 *
 * Czysty stateful — bez React, bez timerów. Wywołujący (np. ViewportController)
 * wywołuje `update(scale, atTimeMs)` w każdej klatce / przy każdej zmianie
 * scale.
 */
export function createLodController(opts: LodControllerOptions): LodController {
  const margin = opts.hysteresisMargin ?? 0.15;
  const debounceMs = opts.debounceMs ?? 250;
  const nowProvider = opts.nowProvider ?? (() => Date.now());

  let currentLod: LodLevel = inferLodFromScale(opts.initialScale);
  let lastScale = opts.initialScale;
  let pending: PendingTransition | null = null;

  function applyHysteresis(scale: number): LodLevel {
    // Próg górny dla obecnego LOD (próg powyżej którego rozważamy LOD+1).
    const upperThreshold = upperBoundForLod(currentLod);
    const lowerThreshold = lowerBoundForLod(currentLod);
    if (upperThreshold !== null && scale >= upperThreshold * (1 + margin)) {
      return inferLodFromScale(scale);
    }
    if (lowerThreshold !== null && scale <= lowerThreshold * (1 - margin)) {
      return inferLodFromScale(scale);
    }
    return currentLod;
  }

  return {
    update(scale: number, atTimeMs?: number): LodLevel {
      lastScale = scale;
      const now = atTimeMs ?? nowProvider();
      const candidate = applyHysteresis(scale);

      if (candidate === currentLod) {
        // Zmiana scale nie wymusza zmiany LOD — anuluj oczekujące przejście.
        pending = null;
        return currentLod;
      }

      if (candidate < currentLod && currentLod - candidate > 1) {
        currentLod = candidate;
        pending = null;
        return currentLod;
      }

      // Inicjuj lub aktualizuj oczekujące przejście.
      if (!pending || pending.targetLod !== candidate) {
        pending = { targetLod: candidate, armedAtMs: now };
      }

      // Jeśli debounce już upłynął (lub debounceMs == 0), commituj.
      if (now - pending.armedAtMs >= debounceMs) {
        currentLod = pending.targetLod;
        pending = null;
      }
      return currentLod;
    },
    getLod(): LodLevel {
      return currentLod;
    },
    getScale(): number {
      return lastScale;
    },
    reset(scale: number): void {
      currentLod = inferLodFromScale(scale);
      lastScale = scale;
      pending = null;
    },
  };
}

/** Górna granica scale dla danego LOD (poza którą rozważamy LOD+1). */
function upperBoundForLod(lod: LodLevel): number | null {
  switch (lod) {
    case 0:
      return LOD_ZOOM_THRESHOLDS.LOD_0_MAX;
    case 1:
      return LOD_ZOOM_THRESHOLDS.LOD_1_MAX;
    case 2:
      return LOD_ZOOM_THRESHOLDS.LOD_2_MAX;
    case 3:
      return LOD_ZOOM_THRESHOLDS.LOD_3_MAX;
    case 4:
      return null; // brak górnego progu
  }
}

/** Dolna granica scale dla danego LOD (poniżej której rozważamy LOD-1). */
function lowerBoundForLod(lod: LodLevel): number | null {
  switch (lod) {
    case 0:
      return null; // brak dolnego progu
    case 1:
      return LOD_ZOOM_THRESHOLDS.LOD_0_MAX;
    case 2:
      return LOD_ZOOM_THRESHOLDS.LOD_1_MAX;
    case 3:
      return LOD_ZOOM_THRESHOLDS.LOD_2_MAX;
    case 4:
      return LOD_ZOOM_THRESHOLDS.LOD_3_MAX;
  }
}
