/**
 * E2 AUTO-LAYOUT — layout model (the INPUT to the layout engine).
 *
 * E2 is a LAYOUT LAYER: it turns a read-only network MODEL (buses, transformers, bays) into
 * deterministic GEOMETRY that a thin renderer draws with the E0 canon symbols. It does NOT touch
 * the frozen solver/core, and it does NOT render. The canon presets G1–G9 are the VALIDATION
 * target: their companion (solver result) is adapted into a StationModel here.
 *
 * Voltage BANDS are the backbone (Sugiyama adapted to SLD): distinct un_kv → horizontal tiers,
 * transformers span ADJACENT tiers vertically. The model is intentionally minimal — the simplest
 * thing a station SLD needs, not a general graph library.
 */
import type { SldOzeArchetypeCompanion } from '../companions/ozeTypes';

/** A busbar at one voltage. */
export interface StationBus {
  readonly id: string;
  readonly unKv: number;
}

/** A block transformer spanning two buses (HV → LV). */
export interface StationTransformer {
  readonly id: string;
  readonly hvBus: string;
  readonly lvBus: string;
}

export type BayRole = 'line' | 'metering' | 'source' | 'transformer';
export type SourceKind = 'IBG' | 'SYNCHRONOUS' | 'ASYNCHRONOUS';

/** A bay (pole) sitting on a busbar. A `transformer` bay is the HV-side pole of a block
 *  transformer (the LV source sits on the LV bus as its own `source` bay). */
export interface StationBay {
  readonly id: string;
  readonly busId: string;
  readonly role: BayRole;
  readonly label: string;
  readonly sourceKind?: SourceKind;
  /** For a `transformer` bay: the LV bus it drops to (links to a StationTransformer). */
  readonly toBus?: string;
}

/** The full read-only station model the engine lays out. */
export interface StationModel {
  readonly id: string;
  readonly mainBus: string; // the connection (PCC) busbar — the highest tier
  readonly buses: readonly StationBus[];
  readonly transformers: readonly StationTransformer[];
  readonly bays: readonly StationBay[];
}

/** Deterministic ordering rank for bays within a busbar (line → metering → transformer → source). */
export const BAY_ROLE_RANK: Readonly<Record<BayRole, number>> = {
  line: 0,
  metering: 1,
  transformer: 2,
  source: 3,
};

/**
 * Adapt a FROZEN-solver companion into a StationModel (read-only). Buses come from the
 * voltage-flow result; the PCC bus is the main (highest) tier; every other bus is reached
 * through a block transformer from the PCC. Source fields on the PCC stay as `source` bays; a
 * source on a LOWER bus becomes a `transformer` bay (HV pole) on the PCC + a `source` bay on the
 * LV bus. A synthetic `metering` bay represents the always-present billing bay (the boundary).
 */
export function companionToStationModel(companion: SldOzeArchetypeCompanion): StationModel {
  const mainBus = companion.pcc_bus_ref;
  const buses: StationBus[] = Object.values(companion.voltage_flow.buses)
    .map((b) => ({ id: b.bus_ref, unKv: b.un_kv }))
    .sort((a, b) => b.unKv - a.unKv || a.id.localeCompare(b.id));

  const transformers: StationTransformer[] = [];
  const bays: StationBay[] = [];

  // Line (connection) bay + the synthetic metering bay sit on the PCC.
  const connection = companion.fields.find((f) => f.role === 'connection');
  bays.push({
    id: connection?.field_id ?? `${companion.archetype}/line`,
    busId: mainBus,
    role: 'line',
    label: 'Pole liniowe',
  });
  bays.push({ id: `${companion.archetype}/metering`, busId: mainBus, role: 'metering', label: 'Pole pomiarowe' });

  const lvBusesWithSource = new Set<string>();
  for (const f of companion.fields.filter((f) => f.role === 'source')) {
    const onBus = f.on_bus_ref;
    bays.push({ id: f.field_id, busId: onBus, role: 'source', label: f.kind, sourceKind: f.source_kind });
    if (onBus !== mainBus) lvBusesWithSource.add(onBus);
  }
  // ONE block transformer (HV pole on the PCC) per LOWER busbar that carries sources.
  for (const lvBus of [...lvBusesWithSource].sort()) {
    transformers.push({ id: `tr/${lvBus}`, hvBus: mainBus, lvBus });
    bays.push({ id: `tr-pole/${lvBus}`, busId: mainBus, role: 'transformer', label: 'Pole trafo', toBus: lvBus });
  }

  return { id: companion.archetype, mainBus, buses, transformers, bays };
}
