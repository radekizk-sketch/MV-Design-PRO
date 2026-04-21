import type { EnergyNetworkModel } from '../../types/enm';
import type { FieldReadModelSummary } from '../field/fieldReadModelSelectors';
import type { BranchResultRow, BusResultRow, ShortCircuitRow, TraceStep } from '../results-inspector/types';
import type { ElementType, ReadinessIssue } from '../types';
import { findOperationalBus } from '../shared/enmVisibility';

function addRef(target: Set<string>, value: string | null | undefined) {
  if (value && value.trim()) {
    target.add(value);
  }
}

export function resolveElementName(
  snapshot: EnergyNetworkModel | null,
  elementId: string,
  elementType: ElementType,
  fieldRecord?: FieldReadModelSummary | null,
): string {
  if (!snapshot) return elementId;
  if ((elementType === 'BaySN' || elementType === 'FeederNN' || elementType === 'SourceFieldNN') && fieldRecord) {
    return fieldRecord.name;
  }
  if (elementType === 'Station') {
    return snapshot.substations.find((item) => item.ref_id === elementId || item.id === elementId)?.name ?? elementId;
  }
  return (
    snapshot.branches.find((item) => item.ref_id === elementId || item.id === elementId)?.name
    ?? findOperationalBus(snapshot, elementId)?.name
    ?? snapshot.sources.find((item) => item.ref_id === elementId || item.id === elementId)?.name
    ?? snapshot.transformers.find((item) => item.ref_id === elementId || item.id === elementId)?.name
    ?? snapshot.generators.find((item) => item.ref_id === elementId || item.id === elementId)?.name
    ?? snapshot.loads.find((item) => item.ref_id === elementId || item.id === elementId)?.name
    ?? snapshot.bays.find((item) => item.ref_id === elementId || item.id === elementId)?.name
    ?? snapshot.branch_points?.find((item) => item.ref_id === elementId || item.id === elementId)?.name
    ?? elementId
  );
}

export function collectRefs(
  snapshot: EnergyNetworkModel | null,
  elementId: string,
  elementType: ElementType,
  fieldRecord?: FieldReadModelSummary | null,
  fieldRecords: readonly FieldReadModelSummary[] = [],
): Set<string> {
  const refs = new Set<string>();
  addRef(refs, elementId);
  if (!snapshot) return refs;

  const station = snapshot.substations.find((item) => item.ref_id === elementId || item.id === elementId);
  const branch = snapshot.branches.find((item) => item.ref_id === elementId || item.id === elementId);
  const bus = findOperationalBus(snapshot, elementId);
  const transformer = snapshot.transformers.find((item) => item.ref_id === elementId || item.id === elementId);
  const source = snapshot.sources.find((item) => item.ref_id === elementId || item.id === elementId);
  const generator = snapshot.generators.find((item) => item.ref_id === elementId || item.id === elementId);
  const load = snapshot.loads.find((item) => item.ref_id === elementId || item.id === elementId);
  const bay = snapshot.bays.find((item) => item.ref_id === elementId || item.id === elementId);
  const branchPoint = snapshot.branch_points?.find((item) => item.ref_id === elementId || item.id === elementId);

  if (elementType === 'Station' && station) {
    addRef(refs, station.ref_id);
    addRef(refs, station.id);
    station.bus_refs.forEach((ref) => addRef(refs, ref));
    station.transformer_refs.forEach((ref) => addRef(refs, ref));
    if (fieldRecords.length > 0) {
      fieldRecords
        .filter((record) => record.station_ref === station.ref_id || record.station_ref === station.id)
        .forEach((record) => {
          addRef(refs, record.id);
          addRef(refs, record.ref_id);
          addRef(refs, record.bus_ref);
          record.linked_refs.forEach((ref) => addRef(refs, ref));
        });
    }
    snapshot.bays
      .filter((item) => item.substation_ref === station.id || item.substation_ref === station.ref_id)
      .forEach((item) => {
        addRef(refs, item.id);
        addRef(refs, item.ref_id);
        addRef(refs, item.bus_ref);
        item.equipment_refs.forEach((ref) => addRef(refs, ref));
      });
    snapshot.generators
      .filter((item) => item.station_ref === station.id || item.station_ref === station.ref_id)
      .forEach((item) => {
        addRef(refs, item.ref_id);
        addRef(refs, item.bus_ref);
      });
  }

  if ((elementType === 'LineBranch' || elementType === 'Switch' || elementType === 'SwitchNN') && branch) {
    addRef(refs, branch.ref_id);
    addRef(refs, branch.from_bus_ref);
    addRef(refs, branch.to_bus_ref);
  }

  if ((elementType === 'Bus' || elementType === 'BusNN') && bus) {
    addRef(refs, bus.ref_id);
    addRef(refs, bus.id);
  }

  if (elementType === 'TransformerBranch' && transformer) {
    addRef(refs, transformer.ref_id);
    addRef(refs, transformer.hv_bus_ref);
    addRef(refs, transformer.lv_bus_ref);
  }

  if (elementType === 'Source' && source) {
    addRef(refs, source.ref_id);
    addRef(refs, source.bus_ref);
  }

  if (
    (elementType === 'Generator'
      || elementType === 'PVInverter'
      || elementType === 'BESSInverter'
      || elementType === 'Genset'
      || elementType === 'UPS'
      || elementType === 'EnergyStorage')
    && generator
  ) {
    addRef(refs, generator.ref_id);
    addRef(refs, generator.bus_ref);
    addRef(refs, generator.station_ref);
  }

  if ((elementType === 'Load' || elementType === 'LoadNN') && load) {
    addRef(refs, load.ref_id);
    addRef(refs, load.bus_ref);
  }

  if ((elementType === 'BaySN' || elementType === 'FeederNN' || elementType === 'SourceFieldNN') && fieldRecord) {
    addRef(refs, fieldRecord.ref_id);
    addRef(refs, fieldRecord.id);
    addRef(refs, fieldRecord.station_ref);
    addRef(refs, fieldRecord.bus_ref);
    fieldRecord.linked_refs.forEach((ref) => addRef(refs, ref));
  } else if ((elementType === 'BaySN' || elementType === 'FeederNN' || elementType === 'SourceFieldNN') && bay) {
    addRef(refs, bay.ref_id);
    addRef(refs, bay.id);
    addRef(refs, bay.bus_ref);
    bay.equipment_refs.forEach((ref) => addRef(refs, ref));
  }

  if (branchPoint) {
    addRef(refs, branchPoint.ref_id);
    addRef(refs, branchPoint.id);
    addRef(refs, branchPoint.bus_ref);
    addRef(refs, branchPoint.ports?.MAIN_IN);
    addRef(refs, branchPoint.ports?.MAIN_OUT);
    branchPoint.ports?.BRANCH?.forEach((ref) => addRef(refs, ref));
  }

  return refs;
}

export function stepMatches(step: TraceStep, refs: Set<string>): boolean {
  if (refs.size === 0) return true;
  return Boolean(
    (step.element_id && refs.has(step.element_id))
    || (step.target_id && refs.has(step.target_id))
    || (step.primary_element_ref && refs.has(step.primary_element_ref))
    || step.selection_refs?.some((ref) => refs.has(ref))
    || step.related_elements?.some((item) => refs.has(item.element_ref))
    || (step.catalog_context_entry && refs.has(step.catalog_context_entry.element_id))
  );
}

export function issueMatches(issue: ReadinessIssue, refs: Set<string>): boolean {
  if (refs.size === 0) return true;
  return Boolean(issue.element_ref && refs.has(issue.element_ref))
    || Boolean(issue.element_refs?.some((ref) => refs.has(ref)));
}

export function filterTrace(trace: TraceStep[] | null | undefined, refs: Set<string>): TraceStep[] {
  const steps = trace ?? [];
  if (refs.size === 0) return steps;
  return steps.filter((step) => stepMatches(step, refs));
}

export function filterBusRows(rows: BusResultRow[], refs: Set<string>): BusResultRow[] {
  if (refs.size === 0) return rows;
  return rows.filter((row) => refs.has(row.bus_id) || refs.has(row.element_id ?? ''));
}

export function filterBranchRows(rows: BranchResultRow[], refs: Set<string>): BranchResultRow[] {
  if (refs.size === 0) return rows;
  return rows.filter((row) => (
    refs.has(row.branch_id)
    || refs.has(row.element_id ?? '')
    || refs.has(row.from_bus)
    || refs.has(row.to_bus)
  ));
}

export function filterShortCircuitRows(rows: ShortCircuitRow[], refs: Set<string>): ShortCircuitRow[] {
  if (refs.size === 0) return rows;
  return rows.filter((row) => refs.has(row.target_id) || refs.has(row.element_id ?? ''));
}
