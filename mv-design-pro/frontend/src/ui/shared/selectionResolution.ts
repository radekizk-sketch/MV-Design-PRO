import type { Branch, EnergyNetworkModel, Generator } from '../../types/enm';
import type { ElementType, SelectedElement } from '../types';
import { findOperationalBus, isOperationalBus, isTerrainSnSegment } from './enmVisibility';
import { segmentPublicIdentity, stationPublicIdentity } from './publicTechnicalLabels';

function matchByRef<T extends { ref_id: string; id: string; name: string }>(
  items: T[] | undefined,
  refOrId: string,
): T | null {
  return items?.find((item) => item.ref_id === refOrId || item.id === refOrId) ?? null;
}

function resolveGeneratorElementType(generator: Generator): ElementType {
  switch (generator.gen_type) {
    case 'pv_inverter':
      return 'PVInverter';
    case 'bess':
      return 'BESSInverter';
    case 'wind_inverter':
    case 'fw_pmsg':
    case 'fw_dfig':
    case 'fw_scig':
      return 'Generator';
    case 'synchronous':
      return 'Genset';
    default:
      return 'Generator';
  }
}

function isLowVoltageBusRef(snapshot: EnergyNetworkModel | null, busRef: string | null | undefined): boolean {
  if (!snapshot || typeof busRef !== 'string' || !busRef.trim()) {
    return false;
  }

  const bus = findOperationalBus(snapshot, busRef);
  return Boolean(bus && typeof bus.voltage_kv === 'number' && bus.voltage_kv > 0 && bus.voltage_kv < 1);
}

function stationScopedElementLabel(path: string, fallbackType: ElementType): string {
  const normalized = path.toLowerCase();
  const deviceCode = path.match(/(?:^|\/)(q\d+|t\d+|tr\d+)$/i)?.[1]?.toUpperCase() ?? null;
  const suffix = deviceCode ? ` ${deviceCode}` : '';
  const hasPvPath = normalized === 'pv' || normalized.startsWith('pv/') || normalized.includes('/pv/');
  const hasBessPath = normalized === 'bess' || normalized.startsWith('bess/') || normalized.includes('/bess/');
  const hasWindPath = normalized === 'fw'
    || normalized.startsWith('fw/')
    || normalized.includes('/fw/')
    || normalized === 'wind'
    || normalized.startsWith('wind/')
    || normalized.includes('/wind/');

  if (hasPvPath && normalized.includes('nn-breaker')) {
    return `Wyłącznik nN źródła PV${suffix}`;
  }
  if (hasBessPath && normalized.includes('nn-breaker')) {
    return `Wyłącznik nN magazynu BESS${suffix}`;
  }
  if (hasWindPath && normalized.includes('nn-breaker')) {
    return `Wyłącznik nN farmy wiatrowej${suffix}`;
  }
  if (hasPvPath) {
    return `Układ PV stacji${suffix}`;
  }
  if (hasBessPath) {
    return `Układ BESS stacji${suffix}`;
  }
  if (hasWindPath) {
    return `Układ farmy wiatrowej${suffix}`;
  }
  if (normalized.includes('breaker')) {
    return `Wyłącznik stacji${suffix}`;
  }
  if (normalized.includes('fuse')) {
    return `Bezpiecznik stacji${suffix}`;
  }
  if (normalized.includes('switch')) {
    return `Aparat łączeniowy stacji${suffix}`;
  }
  if (normalized.includes('load')) {
    return `Odbiór nN stacji${suffix}`;
  }

  switch (fallbackType) {
    case 'PVInverter':
      return `Falownik PV${suffix}`;
    case 'BESSInverter':
      return `Falownik BESS${suffix}`;
    case 'Generator':
      return `Źródło wytwórcze${suffix}`;
    case 'LoadNN':
    case 'Load':
      return `Odbiór stacji${suffix}`;
    case 'Switch':
      return `Aparat łączeniowy stacji${suffix}`;
    default:
      return `Element stacji${suffix}`;
  }
}

function resolveStationScopedElementFromSnapshot(
  snapshot: EnergyNetworkModel | null,
  refOrId: string,
  fallbackType: ElementType,
): SelectedElement | null {
  if (!snapshot) {
    return null;
  }

  const stations = [...(snapshot.substations ?? [])].sort((left, right) =>
    Math.max(String(right.ref_id ?? '').length, String(right.id ?? '').length)
    - Math.max(String(left.ref_id ?? '').length, String(left.id ?? '').length),
  );

  for (const station of stations) {
    const prefixes = [station.ref_id, station.id]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      // Dzieci GPZ żyją w przestrzeni RÓWNOLEGŁEJ do refu stacji
      // (`gpz/⟨skrót⟩/bay/…`, `…/transformer/…` obok `gpz/⟨skrót⟩/substation`)
      // — dopasowujemy też po BAZIE przestrzeni nazw. Bez tego selekcja
      // aparatów pól GPZ ginęła w kanonikalizacji (ref spoza kolekcji
      // kanonicznych ⇒ null ⇒ zdjęcie selekcji tuż po kliknięciu).
      .flatMap((value) =>
        value.endsWith('/substation') ? [value, value.slice(0, -'/substation'.length)] : [value],
      );
    const prefix = prefixes.find((value) => refOrId !== value && refOrId.startsWith(`${value}/`));
    if (!prefix) {
      continue;
    }

    const stationIdentity = stationPublicIdentity(snapshot, station);
    const scopedPath = refOrId.slice(prefix.length).replace(/^\/+/, '');
    return {
      id: refOrId,
      type: fallbackType,
      name: `${stationIdentity.displayName} - ${stationScopedElementLabel(scopedPath, fallbackType)}`,
    };
  }

  return null;
}

export function resolveElementTypeFromSnapshot(
  snapshot: EnergyNetworkModel | null,
  refOrId: string | null | undefined,
): ElementType | null {
  if (!snapshot || typeof refOrId !== 'string' || !refOrId.trim()) {
    return null;
  }

  const normalizedRef = refOrId.trim();

  if (findOperationalBus(snapshot, normalizedRef)) {
    return 'Bus';
  }

  const branch = matchByRef(snapshot.branches, normalizedRef);
  if (branch) {
    return branch.type === 'cable' || branch.type === 'line_overhead' ? 'LineBranch' : 'Switch';
  }

  if (matchByRef(snapshot.transformers, normalizedRef)) {
    return 'TransformerBranch';
  }

  if (matchByRef(snapshot.sources, normalizedRef)) {
    return 'Source';
  }

  const load = matchByRef(snapshot.loads, normalizedRef);
  if (load) {
    return isLowVoltageBusRef(snapshot, load.bus_ref) ? 'LoadNN' : 'Load';
  }

  const generator = matchByRef(snapshot.generators, normalizedRef);
  if (generator) {
    return resolveGeneratorElementType(generator);
  }

  if (matchByRef(snapshot.substations, normalizedRef)) {
    return 'Station';
  }

  const bay = matchByRef(snapshot.bays, normalizedRef);
  if (bay) {
    return isLowVoltageBusRef(snapshot, bay.bus_ref) ? 'FeederNN' : 'BaySN';
  }

  const branchPoint = matchByRef(snapshot.branch_points ?? [], normalizedRef);
  if (branchPoint) {
    return branchPoint.branch_point_type === 'zksn' ? 'ZKSN' : 'BranchPole';
  }

  if (matchByRef(snapshot.corridors, normalizedRef)) {
    return 'LineBranch';
  }

  const junction = matchByRef(snapshot.junctions, normalizedRef);
  if (junction) {
    return junction.junction_type === 'NO_point' ? 'NOP' : 'Terminal';
  }

  const measurement = matchByRef(snapshot.measurements, normalizedRef);
  if (measurement) {
    return isLowVoltageBusRef(snapshot, measurement.bus_ref) ? 'MeasurementNN' : 'Measurement';
  }

  if (matchByRef(snapshot.protection_assignments, normalizedRef)) {
    return 'ProtectionAssignment';
  }

  return null;
}

export function resolveSelectedElementFromSnapshot(
  snapshot: EnergyNetworkModel | null,
  refOrId: string | null | undefined,
  fallbackName?: string | null,
  fallbackType: ElementType = 'DescriptiveElement',
): SelectedElement | null {
  if (typeof refOrId !== 'string' || !refOrId.trim()) {
    return null;
  }

  const normalizedRef = refOrId.trim();
  const stationScoped = resolveStationScopedElementFromSnapshot(snapshot, normalizedRef, fallbackType);
  if (stationScoped) {
    return stationScoped;
  }

  const elementType = resolveElementTypeFromSnapshot(snapshot, normalizedRef);
  if (!elementType) {
    if (snapshot) {
      return null;
    }
    return {
      id: normalizedRef,
      type: fallbackType,
      name: fallbackName?.trim() || normalizedRef,
    };
  }

  const collections: Array<Array<{ ref_id: string; id: string; name: string }>> = [
    snapshot?.buses ?? [],
    snapshot?.branches ?? [],
    snapshot?.transformers ?? [],
    snapshot?.sources ?? [],
    snapshot?.loads ?? [],
    snapshot?.generators ?? [],
    snapshot?.bays ?? [],
    snapshot?.junctions ?? [],
    snapshot?.corridors ?? [],
    snapshot?.measurements ?? [],
    snapshot?.protection_assignments ?? [],
    snapshot?.branch_points ?? [],
  ];

  const substation = matchByRef(snapshot?.substations ?? [], normalizedRef);
  if (substation) {
    return {
      id: normalizedRef,
      type: elementType,
      name: stationPublicIdentity(snapshot as EnergyNetworkModel, substation).displayName,
    };
  }

  const branch = matchByRef(snapshot?.branches ?? [], normalizedRef) as Branch | null;
  if (branch) {
    return {
      id: normalizedRef,
      type: elementType,
      name: isTerrainSnSegment(branch)
        ? segmentPublicIdentity(snapshot as EnergyNetworkModel, branch).displayName
        : branch.name?.trim() || fallbackName?.trim() || normalizedRef,
    };
  }

  for (const collection of collections) {
    const entry = matchByRef(collection, normalizedRef);
    if (entry) {
      return {
        id: normalizedRef,
        type: elementType,
        name: entry.name?.trim() || fallbackName?.trim() || normalizedRef,
      };
    }
  }

  return {
    id: normalizedRef,
    type: elementType,
    name: fallbackName?.trim() || normalizedRef,
  };
}

export function canonicalizeSelectedElement(
  snapshot: EnergyNetworkModel | null,
  element: SelectedElement | null,
): SelectedElement | null {
  if (!element) {
    return null;
  }

  if (element.type === 'Bus' && snapshot) {
    const rawBus = (snapshot.buses ?? []).find(
      (entry) => entry.ref_id === element.id || entry.id === element.id,
    );
    if (rawBus && !isOperationalBus(rawBus)) {
      return null;
    }
  }

  const resolved = resolveSelectedElementFromSnapshot(snapshot, element.id, element.name, element.type);
  if (!resolved) {
    return null;
  }

  return {
    ...resolved,
    ...(element.semanticElementKind ? { semanticElementKind: element.semanticElementKind } : {}),
    ...(element.semanticEngineeringRole ? { semanticEngineeringRole: element.semanticEngineeringRole } : {}),
    ...(element.semanticHash ? { semanticHash: element.semanticHash } : {}),
  };
}
