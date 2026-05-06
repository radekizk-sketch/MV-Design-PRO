/**
 * Readiness aggregation Station ↔ DER (Faza F).
 *
 * Funkcje pure agregujące macierz gotowości obliczeń (DerReadinessMatrix)
 * + globalne dane stacji do jednolitego widoku w E-04, E-25/E-37, E-36.
 *
 * Zasada: nie wykonujemy fizyki — patrzymy na obecność `catalog_refs` /
 * `profile_refs` / `pcc_ref` i mapujemy na status osi.
 */

import {
  EMPTY_DER_READINESS,
  type DerReadinessMatrix,
  type ReadinessAxisStatus,
  type StationDerConnection,
} from './types';

export interface AggregatedReadinessAxis {
  readonly axis: keyof DerReadinessMatrix;
  readonly label_pl: string;
  readonly status: ReadinessAxisStatus;
  readonly blockers: ReadonlyArray<{
    readonly code: string;
    readonly message_pl: string;
    readonly object_ref: string;
    readonly target_screen: string;
    readonly target_tab: string;
  }>;
}

/** Polskie etykiety osi macierzy. */
export const READINESS_AXIS_LABELS_PL: Record<keyof DerReadinessMatrix, string> = {
  sc_3f: 'Zwarcie 3-fazowe (SC3F)',
  sc_1f: 'Zwarcie 1-fazowe doziemne (SC1F)',
  sc_2f: 'Zwarcie 2-fazowe (SC2F)',
  sc_2fg: 'Zwarcie 2-fazowe z ziemią (SC2FG)',
  vdrop: 'Spadek napięcia (VDROP)',
  q_u: 'Regulacja Q(U)',
  equipment: 'Dowód aparatury',
  protection: 'Zabezpieczenia',
  protection_selectivity: 'Selektywność zabezpieczeń',
  frt: 'FRT / LVRT',
  hvrt: 'HVRT',
  nc_rfg: 'Zgodność przyłączeniowa (NC RfG)',
  report_osd: 'Raport OSD',
  report_technical: 'Raport techniczny',
};

/**
 * Wylicza macierz readiness dla DER na podstawie obecności catalog_refs
 * i profile_refs. Brak danych → 'blocked', częściowy → 'partial', kompletny
 * → 'ready'. Reguły:
 *
 *  - SC3F/SC1F/SC2F/SC2FG: wymagają device_catalog_ref + pcc_ref.
 *  - VDROP: device_catalog_ref + pcc_ref + nominal_power_kw.
 *  - Q_U: nc_rfg_profile_ref.
 *  - EQUIPMENT: device_catalog_ref + (transformer_catalog_ref jeśli
 *    dedicated_transformer).
 *  - PROTECTION: protection_catalog_ref + ct_catalog_ref + vt_catalog_ref.
 *  - PROTECTION_SELECTIVITY: protection + ≥1 inny DER w tej samej stacji
 *    (analiza par; tu domyślnie partial gdy jeden DER, ready gdy multi).
 *  - FRT: nc_rfg_profile_ref + lvrt_curve_ref.
 *  - HVRT: nc_rfg_profile_ref + hvrt_curve_ref.
 *  - NC_RFG: nc_rfg_profile_ref + lvrt_curve_ref + hvrt_curve_ref.
 *  - REPORT_OSD/TECHNICAL: pełna kompletność (wszystkie powyższe ≥ partial).
 */
export function computeDerReadinessMatrix(
  der: StationDerConnection,
  context?: { readonly otherDersInStation?: number },
): DerReadinessMatrix {
  const otherDers = context?.otherDersInStation ?? 0;
  const hasDevice = der.catalogs.device_catalog_ref !== null;
  const hasPcc = der.pcc_ref !== null;
  const hasNcRfg = der.profiles.nc_rfg_profile_ref !== null;
  const hasLvrt = der.profiles.lvrt_curve_ref !== null;
  const hasHvrt = der.profiles.hvrt_curve_ref !== null;
  const hasProtection = der.catalogs.protection_catalog_ref !== null;
  const hasCtVt =
    der.catalogs.ct_catalog_ref !== null && der.catalogs.vt_catalog_ref !== null;
  const hasPower = der.nominal_power_kw !== null;
  const requiresDedicatedTrafo = der.connection_side === 'dedicated_transformer';
  const hasDedicatedTrafo = der.catalogs.transformer_catalog_ref !== null;

  // Krótkie helpery.
  const allOk = (...flags: boolean[]) =>
    flags.every(Boolean) ? ('ready' as const) : ('blocked' as const);
  const partialOk = (full: boolean, any: boolean): ReadinessAxisStatus =>
    full ? 'ready' : any ? 'partial' : 'blocked';

  const sc = allOk(hasDevice, hasPcc);
  const vdrop = partialOk(hasDevice && hasPcc && hasPower, hasDevice || hasPcc);
  const q_u = hasNcRfg ? 'ready' : 'blocked';
  const equipment = (() => {
    if (!hasDevice) return 'blocked' as const;
    if (requiresDedicatedTrafo && !hasDedicatedTrafo) return 'partial' as const;
    return 'ready' as const;
  })();
  const protectionStatus = partialOk(hasProtection && hasCtVt, hasProtection || hasCtVt);
  const protectionSelectivity: ReadinessAxisStatus = (() => {
    if (!hasProtection) return 'blocked';
    if (otherDers === 0) return 'partial'; // tylko jeden DER — selektywność wewnętrzna
    return 'ready';
  })();
  const frt = allOk(hasNcRfg, hasLvrt);
  const hvrt = allOk(hasNcRfg, hasHvrt);
  const nc_rfg = allOk(hasNcRfg, hasLvrt, hasHvrt);

  const reportInputsOk =
    sc === 'ready' && vdrop !== 'blocked' && nc_rfg === 'ready' && equipment === 'ready';
  const report: ReadinessAxisStatus = reportInputsOk
    ? 'ready'
    : (sc === 'ready' || nc_rfg === 'ready')
      ? 'partial'
      : 'blocked';

  return {
    sc_3f: sc,
    sc_1f: sc,
    sc_2f: sc,
    sc_2fg: sc,
    vdrop,
    q_u,
    equipment,
    protection: protectionStatus,
    protection_selectivity: protectionSelectivity,
    frt,
    hvrt,
    nc_rfg,
    report_osd: report,
    report_technical: report,
  };
}

/**
 * Buduje listę osi readiness z polskimi etykietami i blokerami per oś.
 * Używana przez E-04 ModelGapsSurface i Karta 10 E-13.
 */
export function buildAggregatedReadiness(
  der: StationDerConnection,
  context?: { readonly otherDersInStation?: number },
): readonly AggregatedReadinessAxis[] {
  const matrix = computeDerReadinessMatrix(der, context);
  const axes = Object.keys(READINESS_AXIS_LABELS_PL) as (keyof DerReadinessMatrix)[];
  return axes.map((axis) => ({
    axis,
    label_pl: READINESS_AXIS_LABELS_PL[axis],
    status: matrix[axis],
    blockers: buildBlockersForAxis(axis, der, matrix[axis]),
  }));
}

interface MutableBlocker {
  code: string;
  message_pl: string;
  object_ref: string;
  target_screen: string;
  target_tab: string;
}

function buildBlockersForAxis(
  axis: keyof DerReadinessMatrix,
  der: StationDerConnection,
  status: ReadinessAxisStatus,
): AggregatedReadinessAxis['blockers'] {
  if (status === 'ready' || status === 'not_applicable' || status === 'no_module') return [];
  const blockers: MutableBlocker[] = [];

  switch (axis) {
    case 'sc_3f':
    case 'sc_1f':
    case 'sc_2f':
    case 'sc_2fg':
      if (!der.catalogs.device_catalog_ref) {
        blockers.push({
          code: 'der.device_catalog.missing',
          message_pl: 'Brak katalogu urządzenia (falownik / PCS / turbina).',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'inverters',
        });
      }
      if (!der.pcc_ref) {
        blockers.push({
          code: 'der.pcc.missing',
          message_pl: 'Brak punktu przyłączenia PCC.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'topology',
        });
      }
      break;
    case 'vdrop':
      if (der.nominal_power_kw === null) {
        blockers.push({
          code: 'der.power.missing',
          message_pl: 'Brak mocy znamionowej (z katalogu urządzenia).',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'inverters',
        });
      }
      break;
    case 'q_u':
      if (!der.profiles.nc_rfg_profile_ref) {
        blockers.push({
          code: 'der.nc_rfg.missing',
          message_pl: 'Brak profilu NC RfG operatora.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'ncrfg',
        });
      }
      break;
    case 'equipment':
      if (!der.catalogs.device_catalog_ref) {
        blockers.push({
          code: 'der.device_catalog.missing',
          message_pl: 'Brak katalogu urządzenia.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'inverters',
        });
      }
      if (
        der.connection_side === 'dedicated_transformer' &&
        !der.catalogs.transformer_catalog_ref
      ) {
        blockers.push({
          code: 'der.dedicated_trafo.missing',
          message_pl: 'Brak transformatora dedykowanego (z katalogu).',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'topology',
        });
      }
      break;
    case 'protection':
    case 'protection_selectivity':
      if (!der.catalogs.protection_catalog_ref) {
        blockers.push({
          code: 'der.protection.missing',
          message_pl: 'Brak zabezpieczenia z katalogu.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'topology',
        });
      }
      if (!der.catalogs.ct_catalog_ref || !der.catalogs.vt_catalog_ref) {
        blockers.push({
          code: 'der.ct_vt.missing',
          message_pl: 'Brak przekładników CT/VT z katalogu.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'topology',
        });
      }
      break;
    case 'frt':
      if (!der.profiles.nc_rfg_profile_ref) {
        blockers.push({
          code: 'der.nc_rfg.missing',
          message_pl: 'Brak profilu NC RfG (LVRT wymaga operatora).',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'ncrfg',
        });
      }
      if (!der.profiles.lvrt_curve_ref) {
        blockers.push({
          code: 'der.lvrt.missing',
          message_pl: 'Brak krzywej LVRT z katalogu.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'frt-hvrt',
        });
      }
      break;
    case 'hvrt':
      if (!der.profiles.hvrt_curve_ref) {
        blockers.push({
          code: 'der.hvrt.missing',
          message_pl: 'Brak krzywej HVRT z katalogu.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'frt-hvrt',
        });
      }
      break;
    case 'nc_rfg':
      if (!der.profiles.nc_rfg_profile_ref) {
        blockers.push({
          code: 'der.nc_rfg.missing',
          message_pl: 'Brak profilu NC RfG operatora.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'ncrfg',
        });
      }
      break;
    case 'report_osd':
    case 'report_technical':
      blockers.push({
        code: 'der.report.upstream_missing',
        message_pl:
          'Raport zablokowany przez braki w wcześniejszych obliczeniach (SC/VDROP/NC RfG/EQUIPMENT).',
        object_ref: der.id,
        target_screen: 'E-04',
        target_tab: 'list',
      });
      break;
  }
  return blockers;
}

function derKindToScreen(kind: 'PV' | 'BESS' | 'FW'): string {
  switch (kind) {
    case 'PV':
      return 'E-21';
    case 'BESS':
      return 'E-22';
    case 'FW':
      return 'E-23';
  }
}

/** Pomocnicza ekstrakcja "ready"/"partial" do badge'ów. */
export function summarizeReadiness(matrix: DerReadinessMatrix): {
  readonly ready: number;
  readonly partial: number;
  readonly blocked: number;
  readonly total: number;
} {
  const axes = Object.values(matrix);
  return {
    ready: axes.filter((s) => s === 'ready').length,
    partial: axes.filter((s) => s === 'partial').length,
    blocked: axes.filter((s) => s === 'blocked').length,
    total: axes.length,
  };
}

/** Pomocnicza projekcja na pełen empty matrix. */
export function emptyReadinessMatrix(): DerReadinessMatrix {
  return { ...EMPTY_DER_READINESS };
}
