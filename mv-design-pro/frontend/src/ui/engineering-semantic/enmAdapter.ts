import type {
  Bay,
  Branch,
  Bus,
  EnergyNetworkModel,
  Generator,
  GroundingConfig,
  Load,
  Measurement,
  ProtectionAssignment,
  Source,
  Substation,
  Transformer,
} from '../../types/enm';
import { canonicalHash } from './semanticHashPolicy';
import { withSemanticHash } from './projections';
import type {
  BusbarElement,
  CableSegmentElement,
  DataQualityState,
  EarthingContext,
  EngineeringCompleteness,
  EngineeringConnection,
  EngineeringElement,
  EngineeringElementBase,
  EngineeringElementKind,
  EngineeringPort,
  EngineeringQuantity,
  EngineeringRole,
  FunctionalRole,
  GpzModelKind,
  GpzSemanticStructure,
  MvBayElement,
  MvLvStationElement,
  MvLvStationRole,
  MvSwitchgearElement,
  NetworkPosition,
  OverheadSegmentElement,
  PhaseSystem,
  PortRole,
  ProtectionElement,
  ReportEligibilityByKind,
  SourceElement,
  SwitchgearDeviceElement,
  TransformerElement,
  TransformerKind,
  VoltageDomain,
} from './types';
import { normalizeEngineeringQuantity } from './quantity';
import { MV_BAY_ROLE_TO_FUNCTION } from './ontology';

export interface EngineeringSemanticAdapterOptions {
  projectRefId?: string;
  modelId?: string;
  catalogSnapshotRef?: string;
  semanticVersion?: string;
  ontologyVersion?: string;
  ontologyHash?: string;
  roleRegistryHash?: string;
  connectionRuleRegistryHash?: string;
  generatedAt?: string;
}

interface AdapterContext {
  projectRefId: string;
  busByRef: Map<string, Bus>;
  substationByRef: Map<string, Substation>;
  busToSubstationRef: Map<string, string>;
  baysByBusRef: Map<string, Bay[]>;
  bayByRef: Map<string, Bay>;
  transformerByRef: Map<string, Transformer>;
}

const REPORT_ALL_OK: ReportEligibilityByKind = {
  RAPORT_TECHNICZNY: 'RAPORTOWALNY',
  RAPORT_OSD: 'RAPORTOWALNY',
  RAPORT_AUDYTOWY: 'RAPORTOWALNY',
  RAPORT_ZGODNOSCI_ZRODLA: 'NIE_DOTYCZY',
  RAPORT_ZABEZPIECZEN: 'NIE_DOTYCZY',
};

const REPORT_SKETCH: ReportEligibilityByKind = {
  RAPORT_TECHNICZNY: 'NIERAPORTOWALNY_SZKIC',
  RAPORT_OSD: 'NIERAPORTOWALNY_SZKIC',
  RAPORT_AUDYTOWY: 'RAPORTOWALNY_Z_OSTRZEZENIEM',
  RAPORT_ZGODNOSCI_ZRODLA: 'NIE_DOTYCZY',
  RAPORT_ZABEZPIECZEN: 'NIE_DOTYCZY',
};

const REPORT_INCOMPLETE: ReportEligibilityByKind = {
  RAPORT_TECHNICZNY: 'RAPORTOWALNY_Z_OSTRZEZENIEM',
  RAPORT_OSD: 'NIERAPORTOWALNY_BRAK_DANYCH',
  RAPORT_AUDYTOWY: 'RAPORTOWALNY_Z_OSTRZEZENIEM',
  RAPORT_ZGODNOSCI_ZRODLA: 'NIE_DOTYCZY',
  RAPORT_ZABEZPIECZEN: 'NIE_DOTYCZY',
};

export function projectEnmToEngineeringSemanticModel(
  enm: EnergyNetworkModel,
  options: EngineeringSemanticAdapterOptions = {},
) {
  const projectRefId = options.projectRefId ?? 'project-active';
  const context = buildAdapterContext(enm, projectRefId);
  const elements: EngineeringElement[] = [];
  const connections: EngineeringConnection[] = [];
  const earthingContexts = buildEarthingContexts(enm);

  elements.push(...buildGpzAndSwitchgearElements(enm, context));
  elements.push(...enm.substations.filter((substation) => substation.station_type !== 'gpz').map((substation) => mapSubstation(substation, context)));
  elements.push(...enm.buses.map((bus) => mapBus(bus, context)));
  elements.push(...enm.bays.map((bay) => mapBay(bay, context)));

  for (const branch of enm.branches) {
    const branchElement = mapBranch(branch, context);
    elements.push(branchElement);
    connections.push(...connectTwoTerminalElement(
      branch.ref_id,
      `${branch.ref_id}:in`,
      branch.from_bus_ref,
      `${branch.ref_id}:out`,
      branch.to_bus_ref,
      context,
      'SEM-CONNECTION-BRANCH-BUS',
      branch.status === 'open' ? 'ROZLACZONE' : 'POLACZONE',
      branch.ref_id,
    ));
  }

  for (const transformer of enm.transformers) {
    const transformerElement = mapTransformer(transformer, context);
    elements.push(transformerElement);
    connections.push(...connectTwoTerminalElement(
      transformer.ref_id,
      `${transformer.ref_id}:high`,
      transformer.hv_bus_ref,
      `${transformer.ref_id}:low`,
      transformer.lv_bus_ref,
      context,
      'SEM-CONNECTION-TRANSFORMER-SIDE',
      'POLACZONE',
      null,
    ));
  }

  for (const source of enm.sources) {
    elements.push(mapSource(source, context));
    connections.push(connectSinglePortElement(source.ref_id, `${source.ref_id}:ac`, source.bus_ref, context, 'SEM-CONNECTION-SOURCE-BUS'));
  }

  for (const generator of enm.generators) {
    elements.push(mapGenerator(generator, context));
    connections.push(connectSinglePortElement(generator.ref_id, `${generator.ref_id}:ac`, generator.bus_ref, context, 'SEM-CONNECTION-SOURCE-BUS'));
  }

  for (const load of enm.loads) {
    elements.push(mapLoad(load, context));
    connections.push(connectSinglePortElement(load.ref_id, `${load.ref_id}:load`, load.bus_ref, context, 'SEM-CONNECTION-LOAD-BUS'));
  }

  elements.push(...enm.measurements.map((measurement) => mapMeasurement(measurement, context)));
  elements.push(...enm.protection_assignments.map((protection) => mapProtection(protection, context)));

  const usedCatalogMaterializationHash = buildUsedCatalogMaterializationHash(enm);

  return withSemanticHash({
    schemaVersion: 'v12-semantic-v8',
    projectRefId,
    modelId: options.modelId ?? `${enm.header.hash_sha256}:engineering-semantic`,
    enmSnapshotRef: enm.header.hash_sha256,
    catalogSnapshotRef: options.catalogSnapshotRef ?? 'catalog-snapshot-active',
    usedCatalogMaterializationHash,
    semanticVersion: options.semanticVersion ?? 'v8',
    ontologyVersion: options.ontologyVersion ?? 'v8',
    ontologyHash: options.ontologyHash ?? 'ontology-v8',
    roleRegistryHash: options.roleRegistryHash ?? 'role-registry-v8',
    connectionRuleRegistryHash: options.connectionRuleRegistryHash ?? 'connection-rule-registry-v8',
    generatedAt: options.generatedAt ?? '1970-01-01T00:00:00.000Z',
    elements: elements.sort((left, right) => left.refId.localeCompare(right.refId)),
    connections: connections.sort((left, right) => left.connectionId.localeCompare(right.connectionId)),
    physicalTopologyGraph: {
      graphId: `${enm.header.hash_sha256}:physical`,
      elementRefs: elements.map((element) => element.refId).sort(),
      connectionRefs: connections.map((connection) => connection.connectionId).sort(),
    },
    earthingContexts,
  });
}

function buildAdapterContext(enm: EnergyNetworkModel, projectRefId: string): AdapterContext {
  const busToSubstationRef = new Map<string, string>();
  const substationByRef = new Map(enm.substations.map((substation) => [substation.ref_id, substation] as const));
  for (const substation of enm.substations) {
    for (const busRef of substation.bus_refs) {
      busToSubstationRef.set(busRef, substation.ref_id);
    }
  }

  const baysByBusRef = new Map<string, Bay[]>();
  for (const bay of enm.bays) {
    const bayList = baysByBusRef.get(bay.bus_ref) ?? [];
    bayList.push(bay);
    baysByBusRef.set(bay.bus_ref, bayList);
  }

  return {
    projectRefId,
    busByRef: new Map(enm.buses.map((bus) => [bus.ref_id, bus] as const)),
    substationByRef,
    busToSubstationRef,
    baysByBusRef,
    bayByRef: new Map(enm.bays.map((bay) => [bay.ref_id, bay] as const)),
    transformerByRef: new Map(enm.transformers.map((transformer) => [transformer.ref_id, transformer] as const)),
  };
}

function buildGpzAndSwitchgearElements(
  enm: EnergyNetworkModel,
  context: AdapterContext,
): EngineeringElement[] {
  const elements: EngineeringElement[] = [];
  for (const gpz of enm.substations.filter((substation) => substation.station_type === 'gpz')) {
    const busbarSystemRefId = `${gpz.ref_id}:mv-switchgear:busbar-system`;
    const switchgearRefId = `${gpz.ref_id}:mv-switchgear`;
    const bayRefs = enm.bays
      .filter((bay) => bay.substation_ref === gpz.ref_id)
      .map((bay) => bay.ref_id)
      .sort();
    const sources = enm.sources.filter((source) => source.substation_ref === gpz.ref_id || gpz.bus_refs.includes(source.bus_ref));
    const incomingBayRefs = enm.bays
      .filter((bay) => bay.substation_ref === gpz.ref_id && bay.bay_role === 'IN')
      .map((bay) => bay.ref_id)
      .sort();
    const outgoingBayRefs = enm.bays
      .filter((bay) => bay.substation_ref === gpz.ref_id && (bay.bay_role === 'OUT' || bay.bay_role === 'FEEDER'))
      .map((bay) => bay.ref_id)
      .sort();
    const couplerBayRefs = enm.bays
      .filter((bay) => bay.substation_ref === gpz.ref_id && bay.bay_role === 'COUPLER')
      .map((bay) => bay.ref_id)
      .sort();
    const measurementBayRefs = enm.bays
      .filter((bay) => bay.substation_ref === gpz.ref_id && bay.bay_role === 'MEASUREMENT')
      .map((bay) => bay.ref_id)
      .sort();
    const sourceBayRefs = enm.bays
      .filter((bay) => bay.substation_ref === gpz.ref_id && bay.bay_role === 'OZE')
      .map((bay) => bay.ref_id)
      .sort();
    const modelKind: GpzModelKind = gpz.transformer_refs.length > 0
      ? 'PELNY_WN_TRANSFORMATOR_SN'
      : 'UPROSZCZONY_PARAMETRY_NA_SZYNIE_SN';
    const supplyShortCircuitModelRefId = sources.find((source) =>
      source.sk3_mva != null || source.ik3_ka != null || source.r_ohm != null || source.x_ohm != null,
    )?.ref_id ?? null;
    const structure: GpzSemanticStructure = {
      gpzRefId: gpz.ref_id,
      modelKind,
      supplyNodeRefId: sources[0]?.ref_id ?? `${gpz.ref_id}:supply`,
      supplyShortCircuitModelRefId,
      hvMvTransformers: [...gpz.transformer_refs].sort(),
      mvSwitchgearRefId: switchgearRefId,
      busbarSystemRefId,
      busbarSectionRefs: [...gpz.bus_refs].sort(),
      incomingBayRefs,
      outgoingBayRefs,
      couplerBayRefs,
      measurementBayRefs,
      sourceBayRefs,
      groundingModelRefId: null,
    };

    elements.push({
      ...baseElement(gpz.ref_id, 'GPZ', 'GPZ_SUPPLY_NODE', 'NOT_APPLICABLE', inferVoltageDomainForSubstation(gpz, context), context, {
        parentRefId: null,
        containerRefId: gpz.ref_id,
        switchgearRefId,
      }),
      structure,
    });

    elements.push({
      ...baseElement(switchgearRefId, 'MV_SWITCHGEAR', 'MV_SWITCHGEAR', 'NOT_APPLICABLE', 'SN', context, {
        parentRefId: gpz.ref_id,
        containerRefId: gpz.ref_id,
        switchgearRefId,
      }),
      gpzRefId: gpz.ref_id,
      busbarSystemRefId,
      busbarSectionRefs: [...gpz.bus_refs].sort(),
      bayRefs,
    } satisfies MvSwitchgearElement);
  }
  return elements;
}

function mapSubstation(substation: Substation, context: AdapterContext): MvLvStationElement {
  const stationRole = mapStationRole(substation.station_type);
  const transformerBayRefs = Array.from(context.bayByRef.values())
    .filter((bay) => bay.substation_ref === substation.ref_id && bay.bay_role === 'TR')
    .map((bay) => bay.ref_id)
    .sort();
  const outgoingBayRefs = Array.from(context.bayByRef.values())
    .filter((bay) => bay.substation_ref === substation.ref_id && (bay.bay_role === 'OUT' || bay.bay_role === 'FEEDER'))
    .map((bay) => bay.ref_id)
    .sort();
  const branchBayRefs = Array.from(context.bayByRef.values())
    .filter((bay) => bay.substation_ref === substation.ref_id && bay.bay_role === 'OZE')
    .map((bay) => bay.ref_id)
    .sort();
  const elementKind = substation.station_type === 'switching' || substation.station_type === 'sectional'
    ? 'MV_SWITCHING_STATION'
    : substation.station_type === 'branch'
      ? 'BRANCH_POINT_SN'
      : 'MV_LV_STATION';

  return {
    ...baseElement(substation.ref_id, elementKind, elementKind === 'MV_SWITCHING_STATION' ? 'MV_SWITCHGEAR' : 'MV_LV_TRANSFORMER', 'NOT_APPLICABLE', inferVoltageDomainForSubstation(substation, context), context, {
      parentRefId: null,
      containerRefId: substation.ref_id,
      stationRefId: substation.ref_id,
    }),
    stationRole,
    mvSide: {
      incomingBayRefs: Array.from(context.bayByRef.values())
        .filter((bay) => bay.substation_ref === substation.ref_id && bay.bay_role === 'IN')
        .map((bay) => bay.ref_id)
        .sort(),
      outgoingBayRefs,
      branchBayRefs,
      transformerBayRefs,
      internalBusbarRefId: substation.bus_refs[0] ?? null,
    },
    transformerRefs: [...substation.transformer_refs].sort(),
    lvSide: {
      lvSwitchboardRefId: null,
      lvBusbarRefId: inferLvBusbar(substation, context),
      feederRefs: [],
      loadRefs: [],
      sourceRefs: [],
    },
  };
}

function mapBus(bus: Bus, context: AdapterContext): BusbarElement {
  const voltageDomain = voltageDomainFromKv(bus.voltage_kv);
  return {
    ...baseElement(bus.ref_id, 'BUSBAR_SECTION', busbarRole(voltageDomain), 'NOT_APPLICABLE', voltageDomain, context, {
      parentRefId: context.busToSubstationRef.get(bus.ref_id) ?? null,
      containerRefId: context.busToSubstationRef.get(bus.ref_id) ?? null,
      busbarSectionRefId: bus.ref_id,
      switchgearRefId: context.busToSubstationRef.has(bus.ref_id)
        ? `${context.busToSubstationRef.get(bus.ref_id)}:mv-switchgear`
        : null,
    }),
    nominalVoltageKv: bus.voltage_kv,
    ports: [busbarPort(bus.ref_id, voltageDomain, bus.voltage_kv)],
  };
}

function mapBay(bay: Bay, context: AdapterContext): MvBayElement {
  const engineeringRole = mapBayRole(bay.bay_role);
  const bayFunction = MV_BAY_ROLE_TO_FUNCTION[engineeringRole] ?? 'REZERWOWE';
  const voltageKv = context.busByRef.get(bay.bus_ref)?.voltage_kv ?? 15;
  const voltageDomain = voltageDomainFromKv(voltageKv);
  const outgoingPortRole = bayFunction === 'TRANSFORMATOROWE'
    ? 'BAY_SN_TRANSFORMER'
    : bayFunction === 'SPRZEGLOWE'
      ? 'BAY_COUPLER_A'
      : 'BAY_SN_OUT';
  const ports = [
    engineeringPort(`${bay.ref_id}:bus`, bay.ref_id, 'BAY_SN_IN', voltageDomain, voltageKv, 'STRONA_SZYN'),
  ];
  const mayHaveOutgoing = bayFunction !== 'POMIAROWE' && bayFunction !== 'REZERWOWE';
  if (mayHaveOutgoing) {
    ports.push(engineeringPort(`${bay.ref_id}:out`, bay.ref_id, outgoingPortRole, voltageDomain, voltageKv, 'STRONA_LINII'));
  }

  return {
    ...baseElement(bay.ref_id, 'MV_BAY', engineeringRole, 'NOT_APPLICABLE', voltageDomain, context, {
      parentRefId: bay.substation_ref,
      containerRefId: bay.substation_ref,
      switchgearRefId: `${bay.substation_ref}:mv-switchgear`,
      busbarSectionRefId: bay.bus_ref,
      bayRefId: bay.ref_id,
    }),
    ports,
    connectedBusbarSectionRefId: bay.bus_ref,
    bayFunction,
    bayInternalArrangement: {
      arrangementType: bay.equipment_refs.length > 0 ? 'PROJEKTOWANY_RECZNIE' : 'FUNKCJONALNY_UPROSZCZONY',
      arrangementConfidence: bay.equipment_refs.length > 0 ? 'SZABLON_PROJEKTOWY' : 'FUNKCJONALNY_BEZ_UKLADU_PRODUCENTA',
      source: bay.equipment_refs.length > 0 ? 'REKA_PROJEKTANTA' : 'SZABLON',
      devices: bay.equipment_refs.map((deviceRefId, index) => ({
        deviceRefId,
        role: index === 0 ? 'CIRCUIT_BREAKER' : 'BUSBAR_DISCONNECTOR',
        pathOrder: index,
      })),
      primaryPath: bay.equipment_refs,
      secondaryCircuits: bay.protection_ref ? [bay.protection_ref] : [],
    },
    mainSwitchingDeviceRefId: bay.equipment_refs[0] ?? null,
    currentTransformerRefs: [],
    voltageTransformerRefs: [],
    protectionRelayRefs: bay.protection_ref ? [bay.protection_ref] : [],
    automationControllerRefs: [],
    outgoingPortRefId: mayHaveOutgoing ? `${bay.ref_id}:out` : null,
  };
}

function mapBranch(branch: Branch, context: AdapterContext): CableSegmentElement | OverheadSegmentElement | SwitchgearDeviceElement {
  const fromBus = context.busByRef.get(branch.from_bus_ref);
  const voltageKv = fromBus?.voltage_kv ?? null;
  const voltageDomain = voltageDomainFromKv(voltageKv);
  const completeness = completenessFromCatalog(branch.catalog_ref ?? null, branch.materialized_params ?? null);
  const positionOverrides: Partial<NetworkPosition> = {
    parentRefId: null,
    containerRefId: context.busToSubstationRef.get(branch.from_bus_ref) ?? null,
    feederRefId: branch.ref_id,
  };
  const ports = [
    engineeringPort(`${branch.ref_id}:in`, branch.ref_id, 'SEGMENT_SN_IN', voltageDomain, voltageKv, 'WEJSCIE'),
    engineeringPort(`${branch.ref_id}:out`, branch.ref_id, 'SEGMENT_SN_OUT', voltageDomain, voltageKv, 'WYJSCIE'),
  ];

  if (branch.type === 'line_overhead') {
    return {
      ...baseElement(branch.ref_id, 'MV_OVERHEAD_SEGMENT', 'MV_OVERHEAD_SEGMENT', 'NOT_APPLICABLE', voltageDomain, context, positionOverrides, completeness),
      ports,
      fromPortRefId: `${branch.ref_id}:in`,
      toPortRefId: `${branch.ref_id}:out`,
      lengthKm: quantity(branch.length_km, 'km', completeness === 'MODEL_TECHNICZNY_PELNY' ? 'KATALOG' : 'REKA_PROJEKTANTA'),
      materializationRefId: materializationRef(branch),
    } satisfies OverheadSegmentElement;
  }

  if (branch.type === 'cable') {
    return {
      ...baseElement(branch.ref_id, voltageDomain === 'NN' ? 'LV_CABLE_SEGMENT' : 'MV_CABLE_SEGMENT', 'MV_CABLE_SEGMENT', 'NOT_APPLICABLE', voltageDomain, context, positionOverrides, completeness),
      ports,
      fromPortRefId: `${branch.ref_id}:in`,
      toPortRefId: `${branch.ref_id}:out`,
      lengthKm: quantity(branch.length_km, 'km', completeness === 'MODEL_TECHNICZNY_PELNY' ? 'KATALOG' : 'REKA_PROJEKTANTA'),
      impedancePositiveRefId: hasPositiveImpedance(branch) ? `${branch.ref_id}:z1` : null,
      impedanceZeroRefId: branch.r0_ohm_per_km != null || branch.x0_ohm_per_km != null ? `${branch.ref_id}:z0` : null,
      capacitanceToEarthRefId: branch.b0_siemens_per_km != null || branch.b_siemens_per_km != null ? `${branch.ref_id}:c0` : null,
      thermalRatingRefId: branch.rating ? `${branch.ref_id}:thermal` : null,
      materializationRefId: materializationRef(branch),
    } satisfies CableSegmentElement;
  }

  return {
    ...baseElement(branch.ref_id, 'SWITCHGEAR_DEVICE', mapSwitchRole(branch.type), 'NOT_APPLICABLE', voltageDomain, context, positionOverrides, completeness),
    ports,
    switchingDeviceKind: branch.type === 'breaker' || branch.type === 'bus_coupler'
      ? 'WYLACZNIK'
      : branch.type === 'disconnector'
        ? 'ODLACZNIK'
        : branch.type === 'fuse'
          ? 'BEZPIECZNIK'
          : 'ROZLACZNIK',
    switchingPosition: branch.status === 'open' ? 'OTWARTY' : 'ZAMKNIETY',
  } satisfies SwitchgearDeviceElement;
}

function mapTransformer(transformer: Transformer, context: AdapterContext): TransformerElement {
  const transformerKind = transformerKindFromVoltages(transformer.uhv_kv, transformer.ulv_kv);
  const completeness = completenessFromCatalog(transformer.catalog_ref ?? null, transformer.materialized_params ?? null);
  const highDomain = voltageDomainFromKv(transformer.uhv_kv);
  const lowDomain = voltageDomainFromKv(transformer.ulv_kv);
  return {
    ...baseElement(transformer.ref_id, 'TRANSFORMER', transformerKind === 'SN_NN' ? 'MV_LV_TRANSFORMER' : 'HV_MV_TRANSFORMATION_NODE', transformerKind === 'SN_NN' ? 'TRANSFORMS_MV_TO_LV' : 'TRANSFORMS_HV_TO_MV', highDomain, context, {
      parentRefId: context.busToSubstationRef.get(transformer.hv_bus_ref) ?? null,
      containerRefId: context.busToSubstationRef.get(transformer.hv_bus_ref) ?? null,
    }, completeness),
    ports: [
      engineeringPort(`${transformer.ref_id}:high`, transformer.ref_id, 'TRANSFORMER_HIGH', highDomain, transformer.uhv_kv, 'STRONA_TRANSFORMATORA'),
      engineeringPort(`${transformer.ref_id}:low`, transformer.ref_id, 'TRANSFORMER_LOW', lowDomain, transformer.ulv_kv, 'STRONA_TRANSFORMATORA'),
    ],
    transformerKind,
    highSide: {
      sideId: `${transformer.ref_id}:high-side`,
      ownerRefId: transformer.ref_id,
      labelPl: highDomain === 'WN' ? 'Strona WN' : 'Strona SN',
      sideRole: highDomain === 'WN' ? 'STRONA_WN' : 'STRONA_SN',
      voltageDomain: highDomain,
      nominalVoltageKv: transformer.uhv_kv,
      phaseSystem: 'ABC',
      portRefs: [`${transformer.ref_id}:high`],
      terminalRefs: [],
      earthingContextRefId: groundingContextId(transformer.ref_id, 'high', transformer.hv_neutral),
    },
    lowSide: {
      sideId: `${transformer.ref_id}:low-side`,
      ownerRefId: transformer.ref_id,
      labelPl: lowDomain === 'NN' ? 'Strona nN' : 'Strona SN',
      sideRole: lowDomain === 'NN' ? 'STRONA_NN' : 'STRONA_SN',
      voltageDomain: lowDomain,
      nominalVoltageKv: transformer.ulv_kv,
      phaseSystem: lowDomain === 'NN' ? 'ABCN' : 'ABC',
      portRefs: [`${transformer.ref_id}:low`],
      terminalRefs: [],
      earthingContextRefId: groundingContextId(transformer.ref_id, 'low', transformer.lv_neutral),
    },
    ratedPower: quantity(transformer.sn_mva, 'MW', completeness === 'MODEL_TECHNICZNY_PELNY' ? 'KATALOG' : 'REKA_PROJEKTANTA'),
    voltageRatio: `${transformer.uhv_kv}/${transformer.ulv_kv} kV`,
    vectorGroup: transformer.vector_group ?? 'NIEZNANA',
    shortCircuitVoltagePercent: transformer.uk_percent,
    zeroSequenceModelRefId: transformer.hv_neutral || transformer.lv_neutral ? `${transformer.ref_id}:z0` : null,
  };
}

function mapSource(source: Source, context: AdapterContext): SourceElement {
  const bus = context.busByRef.get(source.bus_ref);
  const domain = voltageDomainFromKv(bus?.voltage_kv ?? null);
  return {
    ...baseElement(source.ref_id, 'SOURCE', 'GPZ_SUPPLY_NODE', 'NOT_APPLICABLE', domain, context, {
      parentRefId: source.substation_ref ?? context.busToSubstationRef.get(source.bus_ref) ?? null,
      containerRefId: source.substation_ref ?? context.busToSubstationRef.get(source.bus_ref) ?? null,
    }, completenessFromCatalog(source.catalog_ref ?? null, source.materialized_params ?? null, true)),
    ports: [engineeringPort(`${source.ref_id}:ac`, source.ref_id, 'SOURCE_AC', domain, bus?.voltage_kv ?? null, 'STRONA_ZRODLA')],
    sourceTechnology: 'SYSTEM',
    connectionPathRefs: [source.bus_ref],
  };
}

function mapGenerator(generator: Generator, context: AdapterContext): SourceElement {
  const bus = context.busByRef.get(generator.bus_ref);
  const sourceTechnology = generator.gen_type === 'bess' ? 'BESS' : generator.gen_type?.includes('wind') || generator.gen_type?.startsWith('fw_') ? 'WIND' : 'PV';
  const engineeringRole = sourceTechnology === 'BESS' ? 'BESS_CONVERTER' : sourceTechnology === 'WIND' ? 'WIND_SOURCE' : 'PV_INVERTER';
  return {
    ...baseElement(generator.ref_id, 'SOURCE', engineeringRole, 'NOT_APPLICABLE', voltageDomainFromKv(bus?.voltage_kv ?? null), context, {
      parentRefId: generator.station_ref ?? context.busToSubstationRef.get(generator.bus_ref) ?? null,
      containerRefId: generator.station_ref ?? context.busToSubstationRef.get(generator.bus_ref) ?? null,
    }, completenessFromCatalog(generator.catalog_ref ?? null, generator.materialized_params ?? null, true)),
    ports: [
      engineeringPort(`${generator.ref_id}:ac`, generator.ref_id, 'SOURCE_AC', voltageDomainFromKv(bus?.voltage_kv ?? null), bus?.voltage_kv ?? null, 'STRONA_ZRODLA'),
    ],
    sourceTechnology,
    connectionPathRefs: [generator.bus_ref, generator.blocking_transformer_ref, generator.station_ref].filter((ref): ref is string => Boolean(ref)),
  };
}

function mapLoad(load: Load, context: AdapterContext): EngineeringElement {
  const bus = context.busByRef.get(load.bus_ref);
  return {
    ...baseElement(load.ref_id, 'LV_LOAD', 'LV_LOAD_NODE', 'NOT_APPLICABLE', voltageDomainFromKv(bus?.voltage_kv ?? null), context, {
      parentRefId: context.busToSubstationRef.get(load.bus_ref) ?? null,
      containerRefId: context.busToSubstationRef.get(load.bus_ref) ?? null,
    }, completenessFromCatalog(load.catalog_ref ?? null, load.materialized_params ?? null, true)),
    ports: [
      engineeringPort(`${load.ref_id}:load`, load.ref_id, 'LV_FEEDER_OUT', voltageDomainFromKv(bus?.voltage_kv ?? null), bus?.voltage_kv ?? null, 'STRONA_LINII'),
    ],
    loadModelRefId: load.model,
  };
}

function mapMeasurement(measurement: Measurement, context: AdapterContext): EngineeringElement {
  const bus = context.busByRef.get(measurement.bus_ref);
  return {
    ...baseElement(measurement.ref_id, 'MEASUREMENT', measurement.measurement_type === 'CT' ? 'CURRENT_TRANSFORMER' : 'VOLTAGE_TRANSFORMER', 'NOT_APPLICABLE', 'POMIAR', context, {
      parentRefId: measurement.bay_ref ?? context.busToSubstationRef.get(measurement.bus_ref) ?? null,
      containerRefId: measurement.bay_ref ?? context.busToSubstationRef.get(measurement.bus_ref) ?? null,
      bayRefId: measurement.bay_ref ?? null,
    }, completenessFromCatalog(measurement.catalog_ref ?? null, measurement.materialized_params ?? null, true)),
    ports: [
      engineeringPort(`${measurement.ref_id}:measurement`, measurement.ref_id, 'MEASUREMENT_INPUT', 'POMIAR', bus?.voltage_kv ?? null, 'NIE_DOTYCZY'),
    ],
    measuredElementRefs: [measurement.bus_ref],
    channelRefs: [`${measurement.ref_id}:channel`],
  };
}

function mapProtection(protection: ProtectionAssignment, context: AdapterContext): ProtectionElement {
  return {
    ...baseElement(protection.ref_id, 'PROTECTION_RELAY', 'PROTECTION_RELAY', 'PROTECTS_ELEMENT', 'LOGIKA', context, {
      parentRefId: protection.breaker_ref,
      containerRefId: protection.breaker_ref,
    }, completenessFromCatalog(protection.catalog_ref ?? null, protection.materialized_params ?? null, true)),
    ports: [
      engineeringPort(`${protection.ref_id}:logic`, protection.ref_id, 'LOGIC_LINK', 'LOGIKA', null, 'NIE_DOTYCZY', ['TOR_LOGICZNY']),
    ],
    protectedElementRefs: [protection.breaker_ref],
    measurementInputRefs: [protection.ct_ref, protection.vt_ref].filter((ref): ref is string => Boolean(ref)),
    tripTargetDeviceRefs: [protection.breaker_ref],
    functionRefs: protection.settings.map((setting) => setting.function_type),
    settingGroupRefs: [`${protection.ref_id}:settings`],
    coordinationStatusRefId: null,
  };
}

function baseElement<
  Kind extends EngineeringElementKind,
  Role extends EngineeringRole,
>(
  refId: string,
  elementKind: Kind,
  engineeringRole: Role,
  functionalRole: FunctionalRole,
  voltageDomain: VoltageDomain,
  context: AdapterContext,
  positionOverrides: Partial<NetworkPosition> = {},
  completeness: EngineeringCompleteness = 'MODEL_TECHNICZNY_PELNY',
): EngineeringElementBase & { elementKind: Kind; engineeringRole: Role } {
  return {
    refId,
    elementKind,
    engineeringRole,
    functionalRole,
    networkPosition: networkPosition(context, positionOverrides),
    voltageDomain,
    completeness,
    reportEligibility: reportEligibilityForCompleteness(completeness),
    dataQualityState: dataQualityForCompleteness(completeness),
    ports: [],
    terminals: [],
  };
}

function networkPosition(context: AdapterContext, overrides: Partial<NetworkPosition>): NetworkPosition {
  return {
    projectRefId: context.projectRefId,
    parentRefId: null,
    containerRefId: null,
    voltageLevelRefId: null,
    switchgearRefId: null,
    busbarSectionRefId: null,
    bayRefId: null,
    feederRefId: null,
    branchRefId: null,
    stationRefId: null,
    orderIndex: null,
    ...overrides,
  };
}

function busbarPort(ownerRefId: string, domain: VoltageDomain, nominalVoltageKv: number | null): EngineeringPort {
  return engineeringPort(`${ownerRefId}:busbar`, ownerRefId, domain === 'NN' ? 'BUSBAR_NN' : domain === 'WN' ? 'BUSBAR_WN' : 'BUSBAR_SN', domain, nominalVoltageKv, 'STRONA_SZYN');
}

function engineeringPort(
  portId: string,
  ownerRefId: string,
  role: PortRole,
  voltageDomain: VoltageDomain,
  nominalVoltageKv: number | null,
  connectionSide: EngineeringPort['connectionSide'],
  requiredConnectionKinds: EngineeringPort['requiredConnectionKinds'] = ['TOR_MOCY'],
): EngineeringPort {
  return {
    portId,
    ownerRefId,
    role,
    voltageDomain,
    nominalVoltageKv,
    phaseSystem: phaseSystemForDomain(voltageDomain),
    connectionSide,
    minConnections: 0,
    maxConnections: role.startsWith('BUSBAR') ? 999 : 1,
    connectionPolicyRef: `${role}:policy`,
    requiredConnectionKinds,
    forbiddenConnectionKinds: [],
  };
}

function connectTwoTerminalElement(
  elementRefId: string,
  firstPortId: string,
  firstBusRef: string,
  secondPortId: string,
  secondBusRef: string,
  context: AdapterContext,
  ruleRef: string,
  normalState: EngineeringConnection['normalState'],
  switchingDeviceRefId: string | null,
): EngineeringConnection[] {
  const firstBus = context.busByRef.get(firstBusRef);
  const secondBus = context.busByRef.get(secondBusRef);
  return [
    connection(`${elementRefId}:conn:from`, `${firstBusRef}:busbar`, firstPortId, voltageDomainFromKv(firstBus?.voltage_kv ?? null), ruleRef, normalState, switchingDeviceRefId),
    connection(`${elementRefId}:conn:to`, secondPortId, `${secondBusRef}:busbar`, voltageDomainFromKv(secondBus?.voltage_kv ?? null), ruleRef, normalState, switchingDeviceRefId),
  ];
}

function connectSinglePortElement(
  elementRefId: string,
  elementPortId: string,
  busRef: string,
  context: AdapterContext,
  ruleRef: string,
): EngineeringConnection {
  const bus = context.busByRef.get(busRef);
  return connection(`${elementRefId}:conn:bus`, elementPortId, `${busRef}:busbar`, voltageDomainFromKv(bus?.voltage_kv ?? null), ruleRef, 'POLACZONE', null);
}

function connection(
  connectionId: string,
  fromPortId: string,
  toPortId: string,
  voltageDomain: VoltageDomain,
  ruleRef: string,
  normalState: EngineeringConnection['normalState'],
  switchingDeviceRefId: string | null,
): EngineeringConnection {
  return {
    connectionId,
    fromPortId,
    toPortId,
    orientation: 'BEZKIERUNKOWE',
    connectionKind: 'TOR_MOCY',
    voltageDomain,
    normalState,
    switchingDeviceRefId,
    validatedByRuleRefs: [ruleRef],
  };
}

function buildEarthingContexts(enm: EnergyNetworkModel): EarthingContext[] {
  const contexts: EarthingContext[] = [];
  for (const bus of enm.buses) {
    if (!bus.grounding) continue;
    contexts.push({
      earthingContextRefId: groundingContextId(bus.ref_id, 'bus', bus.grounding) ?? `${bus.ref_id}:earthing`,
      voltageDomain: voltageDomainFromKv(bus.voltage_kv),
      voltageLevelRefId: `${bus.voltage_kv}:kv`,
      neutralPointRefId: `${bus.ref_id}:neutral`,
      earthingMode: mapEarthingMode(bus.grounding),
      resistorRefId: bus.grounding.type === 'resistor_grounded' ? `${bus.ref_id}:resistor` : null,
      petersenCoilRefId: bus.grounding.type === 'petersen_coil' ? `${bus.ref_id}:petersen` : null,
      relatedTransformerRefs: [],
      relatedBusbarSectionRefs: [bus.ref_id],
      relatedLineSegmentRefs: enm.branches
        .filter((branch) => branch.from_bus_ref === bus.ref_id || branch.to_bus_ref === bus.ref_id)
        .map((branch) => branch.ref_id)
        .sort(),
      totalCapacitiveCurrentA: null,
      residualEarthFaultCurrentA: null,
      qualityState: 'CZESCIOWA',
    });
  }
  return contexts.sort((left, right) => left.earthingContextRefId.localeCompare(right.earthingContextRefId));
}

function buildUsedCatalogMaterializationHash(enm: EnergyNetworkModel): string {
  const records: unknown[] = [];
  const collect = (record: { ref_id: string; catalog_ref?: string | null; catalog_namespace?: string | null; materialized_params?: Record<string, unknown> | null }) => {
    if (!record.catalog_ref && !record.materialized_params) return;
    records.push({
      elementRefId: record.ref_id,
      catalogRef: record.catalog_ref ?? null,
      catalogNamespace: record.catalog_namespace ?? null,
      materializedParams: record.materialized_params ?? null,
    });
  };
  enm.branches.forEach(collect);
  enm.transformers.forEach(collect);
  enm.sources.forEach(collect);
  enm.loads.forEach(collect);
  enm.generators.forEach(collect);
  enm.measurements.forEach(collect);
  enm.protection_assignments.forEach(collect);
  return canonicalHash({ records }, 'v12-materialization-v1', { prefix: 'mat' });
}

function reportEligibilityForCompleteness(completeness: EngineeringCompleteness): ReportEligibilityByKind {
  if (completeness === 'MODEL_TECHNICZNY_PELNY') return REPORT_ALL_OK;
  if (completeness === 'SZKIC_LOGICZNY') return REPORT_SKETCH;
  return REPORT_INCOMPLETE;
}

function dataQualityForCompleteness(completeness: EngineeringCompleteness): DataQualityState {
  if (completeness === 'MODEL_TECHNICZNY_PELNY') return 'PELNA';
  if (completeness === 'SZKIC_LOGICZNY') return 'BRAK';
  return 'CZESCIOWA';
}

function completenessFromCatalog(
  catalogRef: string | null,
  materializedParams: Record<string, unknown> | null | undefined,
  allowPartial = false,
): EngineeringCompleteness {
  if (catalogRef && materializedParams) return 'MODEL_TECHNICZNY_PELNY';
  if (catalogRef || allowPartial) return 'MODEL_TECHNICZNY_NIEPELNY';
  return 'SZKIC_LOGICZNY';
}

function voltageDomainFromKv(voltageKv: number | null): VoltageDomain {
  if (voltageKv == null) return 'SN';
  if (voltageKv >= 30) return 'WN';
  if (voltageKv >= 1) return 'SN';
  return 'NN';
}

function phaseSystemForDomain(domain: VoltageDomain): PhaseSystem {
  if (domain === 'DC') return 'DC_PLUS_MINUS';
  if (domain === 'STEROWANIE' || domain === 'LOGIKA') return 'SYGNAL';
  if (domain === 'NN') return 'ABCN';
  return 'ABC';
}

function inferVoltageDomainForSubstation(substation: Substation, context: AdapterContext): VoltageDomain {
  const voltages = substation.bus_refs
    .map((busRef) => context.busByRef.get(busRef)?.voltage_kv)
    .filter((voltage): voltage is number => typeof voltage === 'number');
  return voltageDomainFromKv(Math.max(...voltages, 15));
}

function busbarRole(domain: VoltageDomain): BusbarElement['engineeringRole'] {
  if (domain === 'WN') return 'BUSBAR_SYSTEM';
  if (domain === 'NN') return 'LV_BUSBAR';
  return 'BUSBAR_SECTION';
}

function mapBayRole(role: Bay['bay_role']): MvBayElement['engineeringRole'] {
  switch (role) {
    case 'IN':
      return 'INCOMING_SUPPLY_BAY';
    case 'TR':
      return 'TRANSFORMER_BAY';
    case 'COUPLER':
      return 'COUPLER_BAY';
    case 'MEASUREMENT':
      return 'MEASUREMENT_BAY';
    case 'OZE':
      return 'SOURCE_CONNECTION_BAY';
    case 'OUT':
    case 'FEEDER':
    default:
      return 'LINE_FEEDER_BAY';
  }
}

function mapSwitchRole(type: Branch['type']): SwitchgearDeviceElement['engineeringRole'] {
  if (type === 'breaker' || type === 'bus_coupler') return 'CIRCUIT_BREAKER';
  if (type === 'disconnector') return 'LINE_DISCONNECTOR';
  if (type === 'fuse') return 'LOAD_BREAK_SWITCH';
  return 'LOAD_BREAK_SWITCH';
}

function mapStationRole(stationType: Substation['station_type']): MvLvStationRole {
  switch (stationType) {
    case 'terminal':
      return 'STACJA_KONCOWA';
    case 'branch':
      return 'STACJA_ODGALEZNA';
    case 'sectional':
      return 'STACJA_SEKCYJNA';
    case 'switching':
      return 'STACJA_ROZLACZNIKOWA';
    default:
      return 'STACJA_PRZELOTOWA';
  }
}

function transformerKindFromVoltages(highKv: number, lowKv: number): TransformerKind {
  if (highKv >= 30 && lowKv >= 1) return 'WN_SN';
  if (highKv >= 1 && lowKv < 1) return 'SN_NN';
  return 'POTRZEB_WLASNYCH';
}

function inferLvBusbar(substation: Substation, context: AdapterContext): string | null {
  return substation.bus_refs.find((busRef) => (context.busByRef.get(busRef)?.voltage_kv ?? 99) < 1) ?? null;
}

function quantity(value: number, unit: string, source: EngineeringQuantity['source']): EngineeringQuantity {
  return normalizeEngineeringQuantity({
    value,
    unit,
    source,
    qualityState: 'PELNA',
    normalizationPrecision: 9,
  });
}

function materializationRef(record: { ref_id: string; catalog_ref?: string | null; materialized_params?: Record<string, unknown> | null }): string | null {
  if (!record.catalog_ref && !record.materialized_params) return null;
  return `${record.ref_id}:materialization`;
}

function hasPositiveImpedance(branch: Branch): boolean {
  return 'r_ohm_per_km' in branch || 'x_ohm_per_km' in branch;
}

function mapEarthingMode(grounding: GroundingConfig): EarthingContext['earthingMode'] {
  switch (grounding.type) {
    case 'directly_grounded':
      return 'BEZPOSREDNIO_UZIEMIONY';
    case 'resistor_grounded':
      return 'REZYSTOR';
    case 'petersen_coil':
      return 'CEWKA_PETERSENA';
    case 'isolated':
    default:
      return 'IZOLOWANY';
  }
}

function groundingContextId(ownerRefId: string, side: string, grounding: GroundingConfig | null | undefined): string | null {
  return grounding ? `${ownerRefId}:earthing:${side}` : null;
}
