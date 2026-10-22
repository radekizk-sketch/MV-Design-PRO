import type { EnergyNetworkModel } from '../../../types/enm';
import { stationPublicIdentity } from '../../shared/publicTechnicalLabels';
import { szynyStacji } from '../../shared/szynyStacji';
import { czyPoleNn, napieciaSzyn, pola } from '../../shared/polaStacji';
import { stationRefOfTransformer } from '../../shared/transformatoryStacji';
import { powyzejPasmaNn, wPasmieNn } from '../../../ui2/model/pasmaNapieciowe';

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

  // SZYNY-STACJI-LUSTRO: przynależność szyny do stacji z jednego lustra `szynyStacji`
  // (szyny główne, zaciski pól SN, końce aparatów pól nN); pierwsza stacja modelu wygrywa.
  return snapshot.substations.find((station) => {
    const szyny = szynyStacji(snapshot, station);
    return [...acceptableRefs].some((ref) => szyny.has(ref));
  })?.ref_id ?? null;
}

function isLowVoltageBus(bus: LegacyBus | null): bus is LegacyBus {
  return Boolean(bus && typeof bus.voltage_kv === 'number' && wPasmieNn(bus.voltage_kv));
}

function isMediumVoltageBus(bus: LegacyBus | null): bus is LegacyBus {
  return Boolean(bus && typeof bus.voltage_kv === 'number' && powyzejPasmaNn(bus.voltage_kv));
}

function readFeederRole(bay: LegacyBay): string {
  return readString(bay.meta?.feeder_role).toUpperCase();
}

/** Technologia źródła z jawnego rodzaju pola źródłowego (`meta.source_field_kind`). */
function sourceKindFromFieldKind(bay: LegacyBay): NnSourceFieldKind | null {
  switch (readString(bay.meta?.source_field_kind).toUpperCase()) {
    case 'PV':
      return 'PV';
    case 'BESS':
      return 'BESS';
    case 'FW':
    case 'WIND':
      return 'FW';
    case 'AGREGAT':
      return 'AGREGAT';
    case 'UPS':
      return 'UPS';
    default:
      return null;
  }
}

/** Technologia źródła z roli odpływu nN (`meta.feeder_role` = `ZRODLO_NN_<technologia>`). */
function sourceKindFromFeederRole(bay: LegacyBay): NnSourceFieldKind | null {
  switch (readFeederRole(bay)) {
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
      return null;
  }
}

/**
 * Rodzaj pola nN (karta W5-B: JEDEN klasyfikator rekordu `bays`; dawniej dwa — dla rekordów
 * `bays` i dla listy pól nN w `meta` stacji — z różnym pierwszeństwem danych). Pole nN = szyna
 * pola w paśmie nN (`czyPoleNn`). Odpływ: rola `FEEDER` albo `meta.feeder_role === 'ODPLYW_NN'`.
 * Pole źródła: rola `OZE`, rola odpływu `ZRODLO_*` albo jawny `meta.source_field_kind`;
 * technologia z `source_field_kind`, potem z roli odpływu, a pole roli `OZE` bez technologii
 * jest polem PV (ta sama reguła co rysunek, `fieldRoleFromBayRole`: `OZE` → pole PV); rola
 * `ZRODLO_*` bez znanej technologii — rodzaj ogólny `ZRODLO_NN`.
 */
function classifyNnField(
  snapshot: EnergyNetworkModel,
  bay: LegacyBay,
  napiecia: ReturnType<typeof napieciaSzyn>,
): Pick<ResolvedFieldOption, 'kind'> | null {
  if (!czyPoleNn(snapshot, bay, napiecia)) {
    return null;
  }

  const feederRole = readFeederRole(bay);
  if (feederRole === 'ODPLYW_NN' || bay.bay_role === 'FEEDER') {
    return { kind: 'ODPLYW_NN' };
  }

  const zadeklarowanyRodzaj = sourceKindFromFieldKind(bay);
  if (zadeklarowanyRodzaj || feederRole.startsWith('ZRODLO_') || bay.bay_role === 'OZE') {
    return {
      kind: zadeklarowanyRodzaj
        ?? sourceKindFromFeederRole(bay)
        ?? (bay.bay_role === 'OZE' ? 'PV' : 'ZRODLO_NN'),
    };
  }

  return null;
}

function listNnFields(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null | undefined,
  busNnRef: string | null | undefined,
  fieldType: 'FEEDER' | 'SOURCE',
): ResolvedFieldOption[] {
  if (!snapshot) {
    return [];
  }

  const napiecia = napieciaSzyn(snapshot);
  const byRef = new Map<string, ResolvedFieldOption & { station_ref: string | null }>();
  for (const bay of pola(snapshot)) {
    const classified = classifyNnField(snapshot, bay, napiecia);
    if (!classified) continue;
    const isFeeder = classified.kind === 'ODPLYW_NN';
    if ((fieldType === 'FEEDER' && !isFeeder) || (fieldType === 'SOURCE' && isFeeder)) continue;
    byRef.set(bay.ref_id, {
      ref_id: bay.ref_id,
      name: bay.name,
      kind: classified.kind,
      bus_ref: bay.bus_ref,
      station_ref: bay.substation_ref ?? null,
    });
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
      // SZYNY-STACJI-LUSTRO: stacja transformatora z JEDNEJ reguły „transformatory stacji”.
      return stationRefOfTransformer(snapshot, transformerRef);
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

  const fieldRef = readString(context?.field_ref)
    || readString(context?.bay_ref)
    || readString(context?.existing_field_ref);
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
  const station = findStation(snapshot, stationRef);
  if (!snapshot || !station) {
    return stationRef ?? '-';
  }
  return stationPublicIdentity(snapshot, station).displayName;
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

/**
 * WSZYSTKIE szyny nN modelu (niezależnie od stacji) — dla operacji, które
 * łączą DWIE ISTNIEJĄCE szyny (`add_nn_switch_device`), gdzie szyna docelowa
 * bywa poza `station.bus_refs` (np. szyna utworzona przez `add_nn_cable_segment`
 * jako `to_bus_ref` nie jest dopisywana do rejestru stacji — P0.1). Lista
 * płaska jest UCZCIWA (każdy wpis to realna szyna modelu), nie ograniczona
 * przez rejestr, którego operacja i tak nie sprawdza.
 */
export function listAllNnBusOptions(
  snapshot: EnergyNetworkModel | null,
  wyklucz?: string | null,
): ResolvedBusOption[] {
  if (!snapshot) return [];
  return snapshot.buses
    .filter((bus): bus is LegacyBus => isLowVoltageBus(bus) && bus.ref_id !== wyklucz)
    .map((bus) => ({ ref_id: bus.ref_id, name: bus.name, voltage_kv: bus.voltage_kv }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Odbiór nN modelu jako pozycja wyboru (kreator „Wyłącznik różnicowoprądowy nN"). */
export interface ResolvedNnLoadOption {
  ref_id: string;
  name: string;
  bus_ref: string;
  bus_name: string;
  /** Wyłącznik różnicowoprądowy już wstawiony w tor tego odbioru (`add_nn_rcd` znakuje
   *  gałąź `meta.device_role = 'RCD'` + `meta.load_ref`) — `null`, gdy brak. */
  rcd_name: string | null;
}

function nazwaRcdOdbioru(snapshot: EnergyNetworkModel, loadRef: string): string | null {
  const rcd = snapshot.branches.find((branch) => {
    const meta = asRecord(branch.meta);
    return meta !== null && meta.device_role === 'RCD' && meta.load_ref === loadRef;
  });
  return rcd ? rcd.name || rcd.ref_id : null;
}

/**
 * WSZYSTKIE odbiory modelu przyłączone do szyny w paśmie nN — tor zasilania instalacji
 * odbiorczej, w który operacja `add_nn_rcd` wstawia wyłącznik różnicowoprądowy (backend
 * odmawia dla odbioru spoza pasma nN kodem `nn.rcd_not_nn_band`, więc lista nie oferuje
 * pozycji, których zapis i tak by odrzucono). Kolejność: nazwa, potem ref (deterministyczna).
 */
export function listNnLoadOptions(snapshot: EnergyNetworkModel | null): ResolvedNnLoadOption[] {
  if (!snapshot) return [];
  const opcje: ResolvedNnLoadOption[] = [];
  for (const load of snapshot.loads ?? []) {
    const bus = findBus(snapshot, load.bus_ref);
    if (!isLowVoltageBus(bus)) continue;
    opcje.push({
      ref_id: load.ref_id,
      name: load.name || load.ref_id,
      bus_ref: bus.ref_id,
      bus_name: bus.name || bus.ref_id,
      rcd_name: nazwaRcdOdbioru(snapshot, load.ref_id),
    });
  }
  return opcje.sort(
    (left, right) => left.name.localeCompare(right.name) || left.ref_id.localeCompare(right.ref_id),
  );
}

/**
 * Odbiór nN wskazany kontekstem otwarcia kreatora RCD: jawne `load_ref` (menu odbioru),
 * albo `element_ref`/`focus_ref`/`elementId` będący refem odbioru nN (akcja naprawcza
 * `nn.brak_rcd`, zaznaczenie). Gdy kontekst wskazuje SZYNĘ nN, odbiór jest rozstrzygnięty
 * wyłącznie wtedy, gdy na tej szynie jest DOKŁADNIE jeden odbiór nN — przy kilku kreator
 * nie zgaduje i zostawia wybór projektantowi.
 */
export function resolveNnLoadRef(
  context: Context,
  snapshot: EnergyNetworkModel | null,
): string | null {
  const opcje = listNnLoadOptions(snapshot);
  const kandydaci = [
    readString(context?.load_ref),
    readString(context?.element_ref),
    readString(context?.focus_ref),
    readString(context?.elementId),
    readString(context?.bus_nn_ref),
  ].filter((ref) => ref.length > 0);
  for (const ref of kandydaci) {
    if (opcje.some((opcja) => opcja.ref_id === ref)) return ref;
  }
  for (const ref of kandydaci) {
    const naSzynie = opcje.filter((opcja) => opcja.bus_ref === ref);
    if (naSzynie.length === 1) return naSzynie[0].ref_id;
  }
  return null;
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
  return listNnFields(snapshot, stationRef, busNnRef, 'FEEDER');
}

export function listNnSourceFieldOptions(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null | undefined,
  busNnRef: string | null | undefined,
): ResolvedFieldOption[] {
  return listNnFields(snapshot, stationRef, busNnRef, 'SOURCE');
}
