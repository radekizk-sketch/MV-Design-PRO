/**
 * SLD v2 HierarchyTree — kanoniczna struktura hierarchiczna (PR-5).
 *
 * Adapter ENM → struktura hierarchiczna inżyniera SN:
 *   GPZ → Sekcja → Pole → Aparat
 *   Pole → Ciąg → Stacja → DER
 *
 * Zastępuje generyczny `topologyAdapterV2.ts` (V1 graph approach).
 */

import type { PortKind } from '../core/ports';

/* ---------------------------------------------------------------------------
   Typy hierarchii
   --------------------------------------------------------------------------- */

export interface Hierarchy {
  /** GPZ — zwykle 1 w projekcie. */
  readonly gpz: readonly Gpz[];
  /** Ciągi liniowe wychodzące z pól GPZ. */
  readonly cableRuns: readonly CableRun[];
  /** Przyłączenia DER (PV/BESS/FW). */
  readonly derAttachments: readonly DerAttachment[];
}

export interface Gpz {
  readonly id: string;
  readonly name: string;
  readonly voltageHighKv: number;
  readonly voltageLowKv: number;
  readonly scShortCircuitMva: number | null;
  readonly sections: readonly Section[];
}

export interface Section {
  readonly id: string;
  readonly number: number;
  readonly busVoltageKv: number;
  readonly shortCircuitCurrentKa: number | null;
  readonly bays: readonly Bay[];
}

export interface Bay {
  readonly id: string;
  readonly designation: string;
  readonly bayRole: 'IN' | 'OUT' | 'TR' | 'COUPLER' | 'FEEDER' | 'MEASUREMENT' | 'OZE';
  readonly templateRef: string | null;
  readonly devices: readonly Device[];
  readonly externalPortKinds: readonly PortKind[];
}

export interface Device {
  readonly id: string;
  readonly kind:
    | 'CB'
    | 'DS_BUS'
    | 'DS_LINE'
    | 'ES'
    | 'CT'
    | 'VT'
    | 'FUSE'
    | 'SURGE_ARRESTER'
    | 'CABLE_HEAD'
    | 'TRANSFORMER_DEVICE';
  readonly designationQ: string;
  readonly state: 'closed' | 'open' | 'unknown' | 'fault';
  readonly positionInBay: number;
  readonly placement:
    | 'UPSTREAM'
    | 'MIDSTREAM'
    | 'DOWNSTREAM'
    | 'OFF_PATH'
    | 'GROUND_BRANCH';
}

export interface CableRun {
  readonly id: string;
  readonly name: string | null;
  readonly runKind: 'main_trunk' | 'branch' | 'ring' | 'loop';
  readonly startingBayId: string;
  readonly startingPortId: string;
  readonly segments: readonly RunSegment[];
  readonly stations: readonly StationOnRun[];
  readonly nopStationId: string | null;
  readonly parentRunId: string | null;
  readonly branchOriginStationId: string | null;
}

export interface RunSegment {
  readonly id: string;
  readonly kind: 'cable_sn' | 'overhead_line_sn';
  readonly catalogRef: string | null;
  readonly lengthKm: number;
  readonly fromPortId: string;
  readonly toPortId: string;
  readonly orderInRun: number;
}

export interface StationOnRun {
  readonly id: string;
  readonly name: string;
  readonly templateName: string | null;
  /** Wnioskowany typ topologiczny z portów (PR-4 classifyStationTopology). */
  readonly topologicalType: 'końcowa' | 'przelotowa' | 'odgałęźna' | 'sekcyjna';
  readonly nnVoltageLevels: readonly number[];
  readonly externalPortIds: readonly string[];
  readonly orderInRun: number;
}

export interface DerAttachment {
  readonly id: string;
  readonly kind: 'PV' | 'BESS' | 'FW';
  readonly name: string;
  readonly attachmentPortId: string;
  readonly parentStationId: string | null;
  readonly hasBlockTransformer: boolean;
  readonly nominalPowerKw: number | null;
}

/* ---------------------------------------------------------------------------
   Adapter z ENM (typed input)
   --------------------------------------------------------------------------- */

export interface EnmInputForHierarchy {
  readonly substations: ReadonlyArray<{
    ref_id: string;
    name: string;
    station_type: string;
    bus_refs: readonly string[];
    gpz_sections?: readonly EnmGpzSection[];
    nn_voltage_levels?: readonly number[];
    external_ports?: readonly EnmPort[];
  }>;
  readonly bays: ReadonlyArray<{
    ref_id: string;
    name: string;
    bay_role: 'IN' | 'OUT' | 'TR' | 'COUPLER' | 'FEEDER' | 'MEASUREMENT' | 'OZE';
    substation_ref: string;
    bus_ref: string;
    bay_template_ref?: string | null;
    ports?: readonly EnmPort[];
  }>;
  readonly buses: ReadonlyArray<{
    ref_id: string;
    voltage_kv: number;
    name: string;
  }>;
  readonly sources: ReadonlyArray<{
    ref_id: string;
    bus_ref: string;
    sk3_mva?: number | null;
  }>;
  readonly line_runs?: ReadonlyArray<{
    id: string;
    name?: string | null;
    run_kind: 'main_trunk' | 'branch' | 'ring' | 'loop';
    starting_bay_ref: string;
    starting_port_ref: string;
    segments: readonly { segment_ref: string; order: number }[];
    stations: readonly { substation_ref: string; order: number }[];
    nop_station_ref?: string | null;
    parent_run_ref?: string | null;
    branch_origin_station_ref?: string | null;
  }>;
  readonly generators: ReadonlyArray<{
    ref_id: string;
    name: string;
    bus_ref: string;
    p_mw?: number | null;
    gen_type: string;
    station_ref?: string | null;
    blocking_transformer_ref?: string | null;
  }>;
}

export interface EnmGpzSection {
  section_id: string;
  order: number;
  name?: string | null;
  bus_ref: string;
}

export interface EnmPort {
  id: string;
  kind: PortKind;
  nominal_voltage_kv: number;
  bay_ref: string | null;
  substation_ref: string;
  occupied_by: string | null;
}

/* ---------------------------------------------------------------------------
   Builder funkcyjny: ENM → Hierarchy
   --------------------------------------------------------------------------- */

/**
 * Buduje strukturę hierarchiczną z ENM input.
 *
 * Deterministyczny: dla danego ENM input → identyczny output (sortowanie po IDs).
 */
export function buildHierarchy(enm: EnmInputForHierarchy): Hierarchy {
  // 1. Znajdź GPZ (substations z station_type === 'gpz')
  const gpzSubstations = enm.substations.filter((s) => s.station_type === 'gpz');

  // 2. Buduj GPZ z sekcjami
  const gpz: Gpz[] = [];
  const busVoltageMap = new Map<string, number>();
  for (const bus of enm.buses) {
    busVoltageMap.set(bus.ref_id, bus.voltage_kv);
  }

  for (const gpzSub of gpzSubstations) {
    const sections: Section[] = [];
    const enmSections = gpzSub.gpz_sections ?? [];
    const sortedEnmSections = [...enmSections].sort((a, b) => a.order - b.order);

    for (const enmSection of sortedEnmSections) {
      const sectionBays = enm.bays
        .filter(
          (b) =>
            b.substation_ref === gpzSub.ref_id &&
            b.bus_ref === enmSection.bus_ref,
        )
        .sort((a, b) => a.ref_id.localeCompare(b.ref_id));

      const bays: Bay[] = sectionBays.map((b) => ({
        id: b.ref_id,
        designation: b.name,
        bayRole: b.bay_role,
        templateRef: b.bay_template_ref ?? null,
        devices: [], // wypełnia BayTemplate registry w PR-5 osobnym etapem
        externalPortKinds: (b.ports ?? []).map((p) => p.kind),
      }));

      sections.push({
        id: enmSection.section_id,
        number: enmSection.order + 1,
        busVoltageKv: busVoltageMap.get(enmSection.bus_ref) ?? 15.0,
        shortCircuitCurrentKa: null,
        bays,
      });
    }

    // Jeżeli GPZ nie ma jawnych sekcji, traktuj wszystkie bays GPZ jako 1 sekcję
    if (sections.length === 0) {
      const allGpzBays = enm.bays
        .filter((b) => b.substation_ref === gpzSub.ref_id)
        .sort((a, b) => a.ref_id.localeCompare(b.ref_id));

      if (allGpzBays.length > 0) {
        const firstBus = allGpzBays[0].bus_ref;
        sections.push({
          id: `${gpzSub.ref_id}:section_default`,
          number: 1,
          busVoltageKv: busVoltageMap.get(firstBus) ?? 15.0,
          shortCircuitCurrentKa: null,
          bays: allGpzBays.map((b) => ({
            id: b.ref_id,
            designation: b.name,
            bayRole: b.bay_role,
            templateRef: b.bay_template_ref ?? null,
            devices: [],
            externalPortKinds: (b.ports ?? []).map((p) => p.kind),
          })),
        });
      }
    }

    // SC param z source przyłączonego do GPZ (jeżeli istnieje)
    const gpzSource = enm.sources.find(
      (s) => s.bus_ref && gpzSub.bus_refs.includes(s.bus_ref),
    );

    gpz.push({
      id: gpzSub.ref_id,
      name: gpzSub.name,
      voltageHighKv: 110.0,
      voltageLowKv: sections[0]?.busVoltageKv ?? 15.0,
      scShortCircuitMva: gpzSource?.sk3_mva ?? null,
      sections,
    });
  }

  // 3. Buduj CableRuns z line_runs (jeżeli istnieją w ENM)
  const cableRuns: CableRun[] = [];
  const enmLineRuns = enm.line_runs ?? [];
  const sortedRuns = [...enmLineRuns].sort((a, b) => a.id.localeCompare(b.id));

  for (const lr of sortedRuns) {
    const stations: StationOnRun[] = lr.stations.map((s) => {
      const sub = enm.substations.find((ss) => ss.ref_id === s.substation_ref);
      const externalPortKinds = (sub?.external_ports ?? []).map((p) => p.kind);
      // Wnioskowanie typu topologicznego z portów (PR-4)
      const snInputs = externalPortKinds.filter((k) => k === 'sn_input').length;
      const snOutputs = externalPortKinds.filter((k) => k === 'sn_output').length;
      const snBranches = externalPortKinds.filter((k) => k === 'sn_branch').length;
      const snCouplers = externalPortKinds.filter((k) => k === 'sn_coupler').length;
      let topologicalType: StationOnRun['topologicalType'] = 'końcowa';
      if (snInputs >= 2 && snCouplers >= 1) topologicalType = 'sekcyjna';
      else if (snInputs >= 1 && snOutputs >= 1 && snBranches >= 1) topologicalType = 'odgałęźna';
      else if (snInputs >= 1 && snOutputs >= 1) topologicalType = 'przelotowa';

      return {
        id: s.substation_ref,
        name: sub?.name ?? s.substation_ref,
        templateName: null,
        topologicalType,
        nnVoltageLevels: sub?.nn_voltage_levels ?? [],
        externalPortIds: (sub?.external_ports ?? []).map((p) => p.id),
        orderInRun: s.order,
      };
    });

    cableRuns.push({
      id: lr.id,
      name: lr.name ?? null,
      runKind: lr.run_kind,
      startingBayId: lr.starting_bay_ref,
      startingPortId: lr.starting_port_ref,
      segments: [], // wypełniana z OverheadLine/Cable z lr.segments[].segment_ref
      stations,
      nopStationId: lr.nop_station_ref ?? null,
      parentRunId: lr.parent_run_ref ?? null,
      branchOriginStationId: lr.branch_origin_station_ref ?? null,
    });
  }

  // 4. Buduj DerAttachments z generators
  const derAttachments: DerAttachment[] = [];
  const sortedGenerators = [...enm.generators].sort((a, b) => a.ref_id.localeCompare(b.ref_id));

  for (const gen of sortedGenerators) {
    let kind: DerAttachment['kind'] | null = null;
    if (gen.gen_type === 'pv_inverter') kind = 'PV';
    else if (gen.gen_type === 'bess') kind = 'BESS';
    else if (
      gen.gen_type === 'wind_inverter'
      || gen.gen_type === 'fw_pmsg'
      || gen.gen_type === 'fw_dfig'
      || gen.gen_type === 'fw_scig'
    ) {
      kind = 'FW';
    }
    if (kind === null) continue;

    derAttachments.push({
      id: gen.ref_id,
      kind,
      name: gen.name,
      attachmentPortId: gen.bus_ref, // uproszczenie; pełna logika via PortResolver w PR-5
      parentStationId: gen.station_ref ?? null,
      hasBlockTransformer: gen.blocking_transformer_ref !== null && gen.blocking_transformer_ref !== undefined,
      nominalPowerKw: gen.p_mw !== null && gen.p_mw !== undefined ? gen.p_mw * 1000 : null,
    });
  }

  return { gpz, cableRuns, derAttachments };
}
