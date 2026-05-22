/**
 * trunkOriginResolver — resolver punktu wyprowadzenia odcinka SN.
 *
 * Pierwszy plaster integracji command-busu projektowego: na podstawie
 * snapshotu, kontekstu operacji albo etykiety źródła wybranej przez UI
 * ustala kanoniczny `TrunkOriginKind` używany przez `validateTrunkSegmentOrigin`
 * (semanticValidator). Resolver NIE wykonuje fizyki, NIE mutuje modelu.
 *
 * Reguły inżynierskie (skrót, pełny opis: STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD §1–§4):
 *  - ZKSN ma wyłącznie pola kablowe → źródłem zawsze pole liniowe kablowe ZKSN.
 *  - Słup rozgałęźny jest węzłem linii napowietrznej → źródło zawsze 'slup'.
 *  - Pola SN w stacji domyślnie są kablowe (zdecydowana większość ENEA OP);
 *    jawne pole napowietrzne wymaga znacznika w meta lub kontekście.
 *  - GPZ ma pola liniowe SN (kablowe lub napowietrzne) jako wyprowadzenia.
 *
 * @public
 */

import type { EnergyNetworkModel } from '../../types/enm';
import type { TrunkOriginKind } from './semanticValidator';

type SnapshotLike = EnergyNetworkModel | null | undefined;
type OperationContext = Record<string, unknown> | null | undefined;

/** Tag wskazujący, że pole jest jawnie wystawione pod wyprowadzenie napowietrzne. */
const OVERHEAD_BAY_HINTS: readonly string[] = [
  'pole_liniowe_napowietrzne',
  'pole_napowietrzne',
  'overhead_bay',
  'overhead_line_bay',
  'line_overhead',
];

function asTrimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isOverheadBaySignal(value: unknown): boolean {
  const text = asTrimmed(value)?.toLowerCase();
  if (!text) return false;
  return OVERHEAD_BAY_HINTS.some((hint) => text.includes(hint));
}

function isGpzStationRef(snapshot: SnapshotLike, stationRef: string | null): boolean {
  if (!snapshot || !stationRef) return false;
  const station = snapshot.substations?.find(
    (candidate) => candidate.ref_id === stationRef || candidate.id === stationRef,
  );
  return station ? String(station.station_type ?? '').toLowerCase() === 'gpz' : false;
}

function isOverheadBayByMeta(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object') return false;
  const record = meta as Record<string, unknown>;
  return (
    isOverheadBaySignal(record.bay_kind)
    || isOverheadBaySignal(record.field_kind)
    || isOverheadBaySignal(record.sn_field_kind)
    || isOverheadBaySignal(record.line_type)
    || isOverheadBaySignal(record.feeder_type)
    || isOverheadBaySignal(record.outgoing_type)
  );
}

/**
 * Resolver wyłącznie po stronie kontekstu operacji.
 *
 * Wykorzystywany w sytuacjach, gdy snapshot nie zawiera pełnych informacji
 * o polu (np. start odgałęzienia, kontekst z UI bez dostępu do bay.meta).
 */
export function resolveOriginKindFromContext(
  context: OperationContext,
): TrunkOriginKind | null {
  if (!context) return null;
  const sourceType = asTrimmed(context.source_type_label) ?? asTrimmed(context.sourceType);
  if (sourceType) {
    const normalized = sourceType.toLowerCase();
    if (normalized.includes('zksn')) return 'pole_liniowe_kablowe_zksn';
    if (normalized.includes('słup') || normalized.includes('slup') || normalized.includes('branch_pole')) {
      return 'slup';
    }
    if (normalized.includes('przejście k/n') || normalized.includes('przejscie k/n') || normalized.includes('przejście kn')) {
      return 'przejscie_kablowo_napowietrzne';
    }
    if (normalized.includes('gpz')) {
      return isOverheadBaySignal(context.bay_kind)
        ? 'pole_liniowe_napowietrzne_gpz'
        : 'pole_liniowe_kablowe_gpz';
    }
    if (normalized.includes('stacj') || normalized.includes('pole')) {
      return isOverheadBaySignal(context.bay_kind)
        ? 'pole_liniowe_napowietrzne_stacja'
        : 'pole_liniowe_kablowe_stacja';
    }
  }
  return null;
}

/**
 * Resolver pełny: snapshot + kontekst.
 *
 *  - Najpierw szuka branch_point (ZKSN, słup rozgałęźny) po `from_ref` lub `terminal_id`.
 *  - Następnie szuka pola SN (bay) i wnioskuje pole kablowe vs napowietrzne.
 *  - Jeżeli nie da się rozstrzygnąć — zwraca null (forma powinna pozwolić
 *    użytkownikowi domknąć kontekst albo polegać na innym guard).
 */
export function resolveTrunkOriginKind(
  snapshot: SnapshotLike,
  context: OperationContext,
): TrunkOriginKind | null {
  const fromContext = resolveOriginKindFromContext(context);
  if (fromContext) return fromContext;

  if (!snapshot || !context) return null;

  const fromRef = asTrimmed(context.from_ref);
  const refSeed = fromRef && fromRef.includes('.') ? fromRef.split('.', 2)[0] : fromRef;
  const candidateRefs = [
    refSeed,
    asTrimmed(context.field_ref),
    asTrimmed(context.terminal_id),
    asTrimmed(context.from_terminal_id),
    asTrimmed(context.element_ref),
  ].filter((value): value is string => Boolean(value));

  for (const ref of candidateRefs) {
    const branchPoint = snapshot.branch_points?.find(
      (candidate) => candidate.ref_id === ref || candidate.id === ref,
    );
    if (branchPoint) {
      if (branchPoint.branch_point_type === 'zksn') return 'pole_liniowe_kablowe_zksn';
      if (branchPoint.branch_point_type === 'branch_pole') return 'slup';
    }
  }

  for (const ref of candidateRefs) {
    const bay = snapshot.bays?.find(
      (candidate) => candidate.ref_id === ref || candidate.id === ref,
    );
    if (!bay) continue;
    const overheadByMeta = isOverheadBayByMeta(bay.meta);
    const stationRef = bay.substation_ref ?? null;
    if (isGpzStationRef(snapshot, stationRef)) {
      return overheadByMeta ? 'pole_liniowe_napowietrzne_gpz' : 'pole_liniowe_kablowe_gpz';
    }
    return overheadByMeta ? 'pole_liniowe_napowietrzne_stacja' : 'pole_liniowe_kablowe_stacja';
  }

  // Stacja jako element selekcji (UI: BaySN→bay nie znalezione, ale element_type=Station).
  const stationRef = asTrimmed(context.station_ref) ?? asTrimmed(context.element_ref);
  if (stationRef) {
    if (isGpzStationRef(snapshot, stationRef)) {
      return isOverheadBaySignal(context.bay_kind)
        ? 'pole_liniowe_napowietrzne_gpz'
        : 'pole_liniowe_kablowe_gpz';
    }
    const station = snapshot.substations?.find(
      (candidate) => candidate.ref_id === stationRef || candidate.id === stationRef,
    );
    if (station) {
      return isOverheadBaySignal(context.bay_kind)
        ? 'pole_liniowe_napowietrzne_stacja'
        : 'pole_liniowe_kablowe_stacja';
    }
  }

  return null;
}
