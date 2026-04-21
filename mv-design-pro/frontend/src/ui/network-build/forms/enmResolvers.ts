import type { EnergyNetworkModel } from '../../../types/enm';

type Context = Record<string, unknown> | undefined;
type LegacyBay = EnergyNetworkModel['bays'][number];
type LegacyBus = EnergyNetworkModel['buses'][number];
type LegacyStation = EnergyNetworkModel['substations'][number];
type NnSourceFieldKind = 'PV' | 'BESS' | 'FW' | 'AGREGAT' | 'UPS';

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

  return candidates
    .filter((record) => !stationRef || record.station_ref === stationRef)
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
    return directStationRef;
  }

  const directFieldRef = readString(context?.field_ref)
    || readString(context?.bay_ref)
    || readString(context?.existing_field_ref)
    || readString(context?.feeder_ref);
  const directField = findBay(snapshot, directFieldRef);
  if (directField?.substation_ref) {
    return directField.substation_ref;
  }

  const directBusRef = readString(context?.bus_nn_ref) || readString(context?.bus_ref);
  if (directBusRef) {
    return findStationRefByBus(snapshot, directBusRef);
  }

  const elementRef = readString(context?.element_ref);
  if (elementRef) {
    const bay = findBay(snapshot, elementRef);
    if (bay?.substation_ref) {
      return bay.substation_ref;
    }

    const sourceStationRef = snapshot?.sources.find(
      (source) => source.ref_id === elementRef || source.id === elementRef,
    )?.substation_ref;
    if (sourceStationRef) {
      return sourceStationRef;
    }

    const generatorStationRef = snapshot?.generators.find(
      (generator) => generator.ref_id === elementRef || generator.id === elementRef,
    )?.station_ref;
    if (generatorStationRef) {
      return generatorStationRef;
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
