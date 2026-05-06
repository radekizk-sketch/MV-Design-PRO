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

/** Wnioskuje LOD z scale viewport-a. */
export function inferLodFromScale(scale: number): LodLevel {
  if (scale < LOD_ZOOM_THRESHOLDS.LOD_0_MAX) return 0;
  if (scale < LOD_ZOOM_THRESHOLDS.LOD_1_MAX) return 1;
  if (scale < LOD_ZOOM_THRESHOLDS.LOD_2_MAX) return 2;
  if (scale < LOD_ZOOM_THRESHOLDS.LOD_3_MAX) return 3;
  return 4;
}

/** Czy element typu X jest widoczny na danym LOD. */
export function isVisibleAtLod(
  elementKind:
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
    | 'nop_marker',
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
  }
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
  | 'alarms';

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
  'missing-data': 'Braki danych',
  protection: 'Zabezpieczenia',
  der: 'OZE / BESS / FW',
  topology: 'Topologia pracy',
  alarms: 'Alarmy / blokady',
};
