import type { EnergyNetworkModel } from '../../../types/enm';

type Context = Record<string, unknown> | undefined;
type LegacyBay = EnergyNetworkModel['bays'][number];
type LegacyBus = EnergyNetworkModel['buses'][number];
type LegacyStation = EnergyNetworkModel['substations'][number];
type NnSourceFieldKind = 'PV' | 'BESS' | 'FW' | 'AGREGAT' | 'UPS';
type FieldSpecRecord = {
  field_ref?: unknown;
  ref_id?: unknown;
  name?: unknown;
  bay_role?: unknown;
  bus_ref?: unknown;
  meta?: unknown;
};

export interface ResolvedBusOption {
  ref_id: string;
  name: string;
  voltage_kv: number;
}

export interface ResolvedFieldOption {
  ref_id: string;
  name: string;
  kind: string;
  bus_ref: string;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function findStation(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null | undefined,
): LegacyStation | null {
  if (!snapshot || !stationRef) {
    return null;
  }

  return snapshot.substations.find(
    (station) => station.ref_id === stationRef || station.id === stationRef,
  ) ?? null;
}

function normalizeStationRef(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null | undefined,
): string | null {
  const directRef = readString(stationRef);
  if (!directRef) {
    return null;
  }

  return findStation(snapshot, directRef)?.ref_id ?? directRef;
}

function stationRefMatches(
  snapshot: EnergyNetworkModel | null,
  candidateRef: string | null | undefined,
  requestedRef: string | null | undefined,
): boolean {
  const requested = readString(requestedRef);
  if (!requested) {
    return true;
  }

  const candidate = readString(candidateRef);
  if (candidate === requested) {
    return true;
  }

  const station = findStation(snapshot, requested);
  if (!station) {
    return false;
  }

  return candidate === station.ref_id || candidate === station.id;
}

function findBus(
  snapshot: EnergyNetworkModel | null,
  busRef: string | null | undefined,
): LegacyBus | null {
  if (!snapshot || !busRef) {
    return null;
  }

  return snapshot.buses.find((bus) => bus.ref_id === busRef || bus.id === busRef) ?? null;
}

function findBay(
  snapshot: EnergyNetworkModel | null,
  bayRef: string | null | undefined,
): LegacyBay | null {
  if (!snapshot || !bayRef) {
    return null;
  }

  return snapshot.bays.find((bay) => bay.ref_id === bayRef || bay.id === bayRef) ?? null;
}

function findStationRefByBus(
  snapshot: EnergyNetworkModel | null,
  busRef: string | null | undefined,
): string | null {
  if (!snapshot || !busRef) {
    return null;
  }

  const bus = findBus(snapshot, busRef);
  const acceptableRefs = new Set<string>([busRef]);
  if (bus?.ref_id) {
    acceptableRefs.add(bus.ref_id);
  }
  if (bus?.id) {
    acceptableRefs.add(bus.id);
  }

  return snapshot.substations.find((station) =>
    station.bus_refs.some((stationBusRef) => acceptableRefs.has(stationBusRef)),
  )?.ref_id ?? null;
}

function isLowVoltageBus(bus: LegacyBus | null): bus is LegacyBus {
  return Boolean(
    bus
      && typeof bus.voltage_kv === 'number'
      && Number.isFinite(bus.voltage_kv)
      && bus.voltage_kv > 0
      && bus.voltage_kv < 1,
  );
}

function isMediumVoltageBus(bus: LegacyBus | null): bus is LegacyBus {
  return Boolean(
    bus
      && typeof bus.voltage_kv === 'number'
      && Number.isFinite(bus.voltage_kv)
      && bus.voltage_kv >= 1,
  );
}

function readFeederRole(bay: LegacyBay): string {
  const meta = (bay as { meta?: { feeder_role?: unknown } | null }).meta;
  return readString(meta?.feeder_role).toUpperCase();
}

function mapLegacySourceFieldKind(bay: LegacyBay): NnSourceFieldKind | null {
  const feederRole = readFeederRole(bay);
  switch (feederRole) {
    case 'ZRODLO_NN_PV':
      return 'PV';
    case 'ZRODLO_NN_BESS':
      return 'BESS';
    case 'ZRODLO_NN_FW':
      return 'FW';
    case 'ZRODLO_NN_AGREGAT':
      return 'AGREGAT';
    case 'ZRODLO_NN_UPS':
      return 'UPS';
    default:
      break;
  }

  const bayRole = readString((bay as { bay_role?: unknown }).bay_role).toUpperCase();
  if (bayRole === 'OZE') {
    return 'PV';
  }

  return null;
}

function classifyLegacyNnField(
  snapshot: EnergyNetworkModel | null,
  bay: LegacyBay,
): Pick<ResolvedFieldOption, 'kind'> | null {
  const bus = findBus(snapshot, bay.bus_ref);
  if (!isLowVoltageBus(bus)) {
    return null;
  }

  const feederRole = readFeederRole(bay);
  const bayRole = readString((bay as { bay_role?: unknown }).bay_role).toUpperCase();
  const sourceFieldKind = mapLegacySourceFieldKind(bay);

  if (feederRole === 'ODPLYW_NN' || bayRole === 'FEEDER') {
    return { kind: 'ODPLYW_NN' };
  }

  if (sourceFieldKind || feederRole.startsWith('ZRODLO_') || bayRole === 'SOURCE' || bayRole === 'OZE') {
    return { kind: sourceFieldKind ?? 'ZRODLO_NN' };
  }

  return null;
}

function listSubstationFieldSpecs(station: LegacyStation, metaKey: string): FieldSpecRecord[] {
  const meta = asRecord((station as { meta?: unknown }).meta);
  const rawSpecs = meta?.[metaKey];
  if (!Array.isArray(rawSpecs)) return [];
  return rawSpecs.filter((spec): spec is FieldSpecRecord => asRecord(spec) !== null);
}

function classifyCanonicalNnField(
  snapshot: EnergyNetworkModel | null,
  spec: FieldSpecRecord,
): Pick<ResolvedFieldOption, 'kind'> | null {
  const bus = findBus(snapshot, readString(spec.bus_ref));
  if (!isLowVoltageBus(bus)) {
    return null;
  }

  const meta = asRecord(spec.meta);
  const bayRole = readString(spec.bay_role).toUpperCase();
  const feederRole = readString(meta?.feeder_role).toUpperCase();
  const sourceFieldKind = readString(meta?.source_field_kind).toUpperCase();

  if (bayRole === 'FEEDER' || feederRole === 'ODPLYW_NN') {
    return { kind: 'ODPLYW_NN' };
  }

  if (bayRole === 'OZE' || bayRole === 'SOURCE' || sourceFieldKind) {
    switch (sourceFieldKind) {
      case 'BESS':
        return { kind: 'BESS' };
      case 'FW':
      case 'WIND':
        return { kind: 'FW' };
      case 'AGREGAT':
        return { kind: 'AGREGAT' };
      case 'UPS':
        return { kind: 'UPS' };
      case 'PV':
      default:
        return { kind: 'PV' };
    }
  }

  return null;
}

function listLegacyNnFields(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null | undefined,
  busNnRef: string | null | undefined,
  fieldType: 'FEEDER' | 'SOURCE',
): ResolvedFieldOption[] {
  if (!snapshot) {
    return [];
  }

  const candidates = snapshot.bays.reduce<Array<ResolvedFieldOption & { station_ref: string | null }>>(
    (result, bay) => {
      const classified = classifyLegacyNnField(snapshot, bay);
      if (!classified) {
        return result;
      }

      const isFeeder = classified.kind === 'ODPLYW_NN';
      if ((fieldType === 'FEEDER' && !isFeeder) || (fieldType === 'SOURCE' && isFeeder)) {
        return result;
      }

      result.push({
        ref_id: bay.ref_id,
        name: bay.name,
        kind: classified.kind,
        bus_ref: bay.bus_ref ?? '',
        station_ref: bay.substation_ref ?? null,
      });

      return result;
    },
    [],
  );

  const canonicalCandidates = snapshot.substations.flatMap((station) =>
    listSubstationFieldSpecs(station, 'nn_field_specs')
      .map<ResolvedFieldOption & { station_ref: string | null } | null>((spec) => {
        const classified = classifyCanonicalNnField(snapshot, spec);
        if (!classified) return null;

        const isFeeder = classified.kind === 'ODPLYW_NN';
        if ((fieldType === 'FEEDER' && !isFeeder) || (fieldType === 'SOURCE' && isFeeder)) {
          return null;
        }

        const refId = readString(spec.field_ref) || readString(spec.ref_id);
        const busRef = readString(spec.bus_ref);
        if (!refId || !busRef) return null;

        return {
          ref_id: refId,
          name: readString(spec.name) || (isFeeder ? 'Odpływ nN' : 'Pole źródłowe nN'),
          kind: classified.kind,
          bus_ref: busRef,
          station_ref: station.ref_id ?? station.id ?? null,
        };
      })
      .filter((record): record is ResolvedFieldOption & { station_ref: string | null } => record !== null),
  );

  const byRef = new Map<string, ResolvedFieldOption & { station_ref: string | null }>();
  for (const record of [...candidates, ...canonicalCandidates]) {
    byRef.set(record.ref_id, record);
  }

  return [...byRef.values()]
    .filter((record) => stationRefMatches(snapshot, record.station_ref, stationRef))
    .filter((record) => !busNnRef || record.bus_ref === busNnRef)
    .map(({ station_ref: _stationRef, ...record }) => record)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function resolveStationRef(
  context: Context,
  snapshot: EnergyNetworkModel | null,
): string | null {
  const directStationRef = readString(context?.station_ref) || readString(context?.substation_ref);
  if (directStationRef) {
    return normalizeStationRef(snapshot, directStationRef);
  }

  const directFieldRef = readString(context?.field_ref)
    || readString(context?.bay_ref)
    || readString(context?.existing_field_ref)
    || readString(context?.feeder_ref);
  const directField = findBay(snapshot, directFieldRef);
  if (directField?.substation_ref) {
    return normalizeStationRef(snapshot, directField.substation_ref);
  }

  const directBusRef = readString(context?.bus_nn_ref) || readString(context?.bus_ref);
  if (directBusRef) {
    return findStationRefByBus(snapshot, directBusRef);
  }

  const elementRef = readString(context?.element_ref);
  if (elementRef) {
    const bay = findBay(snapshot, elementRef);
    if (bay?.substation_ref) {
      return normalizeStationRef(snapshot, bay.substation_ref);
    }

    const sourceStationRef = snapshot?.sources.find(
      (source) => source.ref_id === elementRef || source.id === elementRef,
    )?.substation_ref;
    if (sourceStationRef) {
      return normalizeStationRef(snapshot, sourceStationRef);
    }

    const generatorStationRef = snapshot?.generators.find(
      (generator) => generator.ref_id === elementRef || generator.id === elementRef,
    )?.station_ref;
    if (generatorStationRef) {
      return normalizeStationRef(snapshot, generatorStationRef);
    }

    const loadBusRef = snapshot?.loads.find(
      (load) => load.ref_id === elementRef || load.id === elementRef,
    )?.bus_ref;
    if (loadBusRef) {
      return findStationRefByBus(snapshot, loadBusRef);
    }

    const transformerRef = snapshot?.transformers.find(
      (transformer) => transformer.ref_id === elementRef || transformer.id === elementRef,
    )?.ref_id;
    if (transformerRef) {
      return snapshot?.substations.find(
        (station) => station.transformer_refs.includes(transformerRef),
      )?.ref_id ?? null;
    }

    if (findBus(snapshot, elementRef)) {
      return findStationRefByBus(snapshot, elementRef);
    }
  }

  if ((snapshot?.substations.length ?? 0) === 1) {
    return snapshot?.substations[0]?.ref_id ?? null;
  }

  const nonGpzStations = snapshot?.substations.filter(
    (station) => readString(station.station_type).toLowerCase() !== 'gpz',
  ) ?? [];
  const nonGpzStationsWithNnBus = nonGpzStations.filter((station) =>
    station.bus_refs
      .map((busRef) => findBus(snapshot, busRef))
      .some((bus) => isLowVoltageBus(bus)),
  );
  if (nonGpzStationsWithNnBus.length === 1) {
    return nonGpzStationsWithNnBus[0]?.ref_id ?? null;
  }
  if (nonGpzStations.length === 1) {
    return nonGpzStations[0]?.ref_id ?? null;
  }

  return null;
}

export function resolveBusNnRef(
  context: Context,
  snapshot: EnergyNetworkModel | null,
): string | null {
  const directBusRef = readString(context?.bus_nn_ref) || readString(context?.bus_ref);
  if (directBusRef) {
    return directBusRef;
  }

  const directFieldRef = readString(context?.field_ref)
    || readString(context?.bay_ref)
    || readString(context?.existing_field_ref)
    || readString(context?.feeder_ref);
  const directField = findBay(snapshot, directFieldRef);
  if (directField?.bus_ref) {
    return directField.bus_ref;
  }

  const elementRef = readString(context?.element_ref);
  if (elementRef) {
    const bay = findBay(snapshot, elementRef);
    if (bay?.bus_ref) {
      return bay.bus_ref;
    }

    const busRef = findBus(snapshot, elementRef)?.ref_id;
    if (busRef) {
      return busRef;
    }

    const loadBusRef = snapshot?.loads.find(
      (load) => load.ref_id === elementRef || load.id === elementRef,
    )?.bus_ref;
    if (loadBusRef) {
      return loadBusRef;
    }

    const generatorBusRef = snapshot?.generators.find(
      (generator) => generator.ref_id === elementRef || generator.id === elementRef,
    )?.bus_ref;
    if (generatorBusRef) {
      return generatorBusRef;
    }

    const transformerLvBusRef = snapshot?.transformers.find(
      (transformer) => transformer.ref_id === elementRef || transformer.id === elementRef,
    )?.lv_bus_ref;
    if (transformerLvBusRef) {
      return transformerLvBusRef;
    }
  }

  const stationRef = resolveStationRef(context, snapshot);
  const station = findStation(snapshot, stationRef);
  if (!station) {
    return null;
  }

  return station.bus_refs
    .map((refId) => findBus(snapshot, refId))
    .find((bus) => isLowVoltageBus(bus))
    ?.ref_id ?? null;
}

export function resolveBusSnRef(
  context: Context,
  snapshot: EnergyNetworkModel | null,
): string | null {
  const directBusRef = readString(context?.bus_ref);
  if (directBusRef) {
    const bus = findBus(snapshot, directBusRef);
    return isMediumVoltageBus(bus) ? bus.ref_id : null;
  }

  const fieldRef = readString(context?.field_ref) || readString(context?.bay_ref);
  if (fieldRef) {
    const bay = findBay(snapshot, fieldRef);
    const bus = findBus(snapshot, bay?.bus_ref);
    if (isMediumVoltageBus(bus)) {
      return bus.ref_id;
    }
  }

  const stationRef = resolveStationRef(context, snapshot);
  const station = findStation(snapshot, stationRef);
  if (!station) {
    return null;
  }

  return station.bus_refs
    .map((refId) => findBus(snapshot, refId))
    .find((bus) => isMediumVoltageBus(bus))
    ?.ref_id ?? null;
}

export function stationLabel(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null | undefined,
): string {
  return findStation(snapshot, stationRef)?.name ?? stationRef ?? '-';
}

export function listNnBusOptions(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null | undefined,
): ResolvedBusOption[] {
  const station = findStation(snapshot, stationRef);
  if (!station || !snapshot) {
    return [];
  }

  return station.bus_refs
    .map((refId) => findBus(snapshot, refId))
    .filter((bus): bus is LegacyBus => isLowVoltageBus(bus))
    .map((bus) => ({
      ref_id: bus.ref_id,
      name: bus.name,
      voltage_kv: bus.voltage_kv,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function listSnBusOptions(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null | undefined,
): ResolvedBusOption[] {
  const station = findStation(snapshot, stationRef);
  if (!station || !snapshot) {
    return [];
  }

  return station.bus_refs
    .map((refId) => findBus(snapshot, refId))
    .filter((bus): bus is LegacyBus => isMediumVoltageBus(bus))
    .map((bus) => ({
      ref_id: bus.ref_id,
      name: bus.name,
      voltage_kv: bus.voltage_kv,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function listNnFeederOptions(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null | undefined,
  busNnRef: string | null | undefined,
): ResolvedFieldOption[] {
  return listLegacyNnFields(snapshot, stationRef, busNnRef, 'FEEDER');
}

export function listNnSourceFieldOptions(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null | undefined,
  busNnRef: string | null | undefined,
): ResolvedFieldOption[] {
  return listLegacyNnFields(snapshot, stationRef, busNnRef, 'SOURCE');
}
