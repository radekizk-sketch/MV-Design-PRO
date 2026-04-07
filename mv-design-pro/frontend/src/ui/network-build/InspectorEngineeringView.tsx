/**
 * InspectorEngineeringView — Inspektor inżynierski pogrupowany domenowo.
 *
 * Wyświetla pełne dane wybranego elementu sieci w sekcjach:
 * 1. Identyfikacja (ref_id, nazwa, typ elementu, stacja nadrzędna)
 * 2. Parametry elektryczne (napięcie, impedancja, moc, prąd)
 * 3. Topologia (szyna od, szyna do, magistrala, odgałęzienie)
 * 4. Katalog (pozycja katalogowa, source=catalog/override)
 * 5. Eksploatacja (stan łącznika, NOP, w eksploatacji)
 * 6. Gotowość (blokery/ostrzeżenia dotyczące tego elementu)
 * 7. Operacje (przyciski akcji kontekstowych)
 *
 * REUŻYCIE: snapshotStore + selectionStore.
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import { useSnapshotStore } from '../topology/snapshotStore';
import { useSelectionStore } from '../selection';
import { useNetworkBuildStore } from './networkBuildStore';
import { useAppStateStore } from '../app-state';
import { ROUTES } from '../navigation';
import type { EnergyNetworkModel, ReadinessInfo, Branch, LogicalViewsV1 } from '../../types/enm';
import type { CanonicalOpName } from '../../types/domainOps';

// =============================================================================
// Types
// =============================================================================

interface PropertyField {
  key: string;
  label: string;
  value: string | number | boolean | null;
  unit?: string;
  source?: 'instance' | 'catalog' | 'calculated';
}

interface PropertySection {
  id: string;
  label: string;
  fields: PropertyField[];
}

interface QuickAction {
  id: string;
  label: string;
  op: CanonicalOpName;
  context?: Record<string, unknown>;
  variant?: 'primary' | 'secondary' | 'danger';
}

type OverviewTone = 'slate' | 'amber' | 'emerald' | 'blue';

// =============================================================================
// Element type labels
// =============================================================================

const ELEMENT_TYPE_LABELS: Record<string, string> = {
  bus: 'Szyna',
  branch: 'Gałąź',
  line_overhead: 'Linia napowietrzna',
  cable: 'Kabel SN',
  transformer: 'Transformator',
  source: 'Źródło zasilania',
  load: 'Obciążenie',
  switch: 'Łącznik',
  breaker: 'Wyłącznik',
  disconnector: 'Odłącznik',
  fuse: 'Bezpiecznik',
  bus_coupler: 'Sprzęgło szynowe',
  substation: 'Stacja',
  bay: 'Pole',
  generator: 'Generator',
  pv_inverter: 'Falownik PV',
  bess_inverter: 'Falownik BESS',
  wind_inverter: 'Falownik wiatrowy',
  synchronous: 'Generator synchroniczny',
  genset: 'Agregat',
  ups: 'UPS',
  ct: 'Przekładnik prądowy',
  vt: 'Przekładnik napięciowy',
  relay: 'Zabezpieczenie',
  branch_pole: 'Słup rozgałęźny SN',
  zksn: 'ZKSN SN',
};

// =============================================================================
// Helpers: branch type guard
// =============================================================================

function isLineCable(b: Branch): b is Branch & { type: 'line_overhead' | 'cable' } {
  return b.type === 'line_overhead' || b.type === 'cable';
}

// =============================================================================
// Helpers: build sections from ENM element
// =============================================================================

function findParentStation(
  elementId: string,
  snapshot: EnergyNetworkModel,
): string | null {
  // Check bays for equipment_refs
  const bay = snapshot.bays?.find((b) => b.equipment_refs?.includes(elementId));
  if (bay) {
    const station = snapshot.substations?.find((s) => s.id === bay.substation_ref);
    return station?.name ?? null;
  }
  // Check transformer_refs
  const trStation = snapshot.substations?.find((s) =>
    s.transformer_refs?.includes(elementId),
  );
  if (trStation) return trStation.name;
  // Check generator station_ref
  const gen = snapshot.generators?.find((g) => g.ref_id === elementId);
  if (gen?.station_ref) {
    const station = snapshot.substations?.find((s) => s.id === gen.station_ref);
    return station?.name ?? null;
  }
  // Check by bus_ref for loads/generators
  const load = snapshot.loads?.find((l) => l.ref_id === elementId);
  const busRef = load?.bus_ref ?? gen?.bus_ref;
  if (busRef) {
    const station = snapshot.substations?.find((s) => s.bus_refs?.includes(busRef));
    return station?.name ?? null;
  }
  // Check branches by bus refs
  const branch = snapshot.branches?.find((b) => b.ref_id === elementId);
  if (branch) {
    const fromStation = snapshot.substations?.find((s) =>
      s.bus_refs?.includes(branch.from_bus_ref),
    );
    if (fromStation) return fromStation.name;
  }
  return null;
}

function buildSectionsForElement(
  elementId: string,
  snapshot: EnergyNetworkModel | null,
  readiness: ReadinessInfo | null,
  logicalViews?: LogicalViewsV1 | null,
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  if (!snapshot) return { sections: [], elementType: '', elementName: '', actions: [] };

  const sections: PropertySection[] = [];
  const actions: QuickAction[] = [];
  let elementType = '';
  let elementName = '';

  // Try to find in buses
  const bus = snapshot.buses?.find((b) => b.ref_id === elementId);
  if (bus) {
    elementType = 'bus';
    elementName = bus.name;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Identyfikator', value: bus.ref_id },
        { key: 'name', label: 'Nazwa', value: bus.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS.bus },
      ],
    });
    sections.push({
      id: 'electrical', label: 'Parametry elektryczne', fields: [
        { key: 'voltage_kv', label: 'Napięcie znamionowe', value: bus.voltage_kv, unit: 'kV' },
      ],
    });
    actions.push({ id: 'add_trunk', label: 'Dodaj magistralę', op: 'continue_trunk_segment_sn', context: { terminalId: bus.ref_id }, variant: 'primary' });
    actions.push({ id: 'add_branch', label: 'Dodaj odgałęzienie', op: 'start_branch_segment_sn', context: { from_bus_ref: bus.ref_id } });
  }

  // Try branches
  const branch = snapshot.branches?.find((b) => b.ref_id === elementId);
  if (branch) {
    elementType = branch.type;
    elementName = branch.name;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Identyfikator', value: branch.ref_id },
        { key: 'name', label: 'Nazwa', value: branch.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS[branch.type] ?? branch.type },
        { key: 'status', label: 'Stan', value: branch.status },
      ],
    });
    // Parent station and role context
    const branchParent = findParentStation(elementId, snapshot);
    if (branchParent) {
      sections[sections.length - 1].fields.push(
        { key: 'parent_station', label: 'Stacja nadrzędna', value: branchParent },
      );
    }
    // Role context from logical views
    if (logicalViews) {
      let roleLabel = '—';
      const isTrunk = logicalViews.trunks?.some((t) => t.segments?.includes(elementId));
      const isBranch = logicalViews.branches?.some((br) => br.segments?.includes(elementId));
      const isSecondary = logicalViews.secondary_connectors?.some((sc) => sc.segment_ref === elementId);
      if (isTrunk) roleLabel = 'Magistrala';
      else if (isBranch) roleLabel = 'Odgałęzienie';
      else if (isSecondary) roleLabel = 'Połączenie pierścieniowe';
      sections[sections.length - 1].fields.push(
        { key: 'role', label: 'Rola w sieci', value: roleLabel },
      );
    }
    sections.push({
      id: 'topology', label: 'Topologia', fields: [
        { key: 'from_bus', label: 'Szyna początkowa', value: branch.from_bus_ref },
        { key: 'to_bus', label: 'Szyna końcowa', value: branch.to_bus_ref },
      ],
    });
    if (isLineCable(branch)) {
      sections.push({
        id: 'electrical', label: 'Parametry elektryczne', fields: [
          { key: 'length_km', label: 'Długość', value: branch.length_km, unit: 'km' },
          { key: 'r_ohm', label: 'Rezystancja R\'', value: branch.r_ohm_per_km, unit: 'Ω/km', source: 'catalog' },
          { key: 'x_ohm', label: 'Reaktancja X\'', value: branch.x_ohm_per_km, unit: 'Ω/km', source: 'catalog' },
          { key: 'rating', label: 'Obciążalność długotrwała', value: branch.rating?.in_a ?? null, unit: 'A', source: 'catalog' },
        ],
      });
    }
    sections.push({
      id: 'catalog', label: 'Katalog', fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: branch.catalog_ref ?? '—' },
      ],
    });
    actions.push({ id: 'assign_catalog', label: 'Przypisz katalog', op: 'assign_catalog_to_element', context: { element_ref: branch.ref_id } });
    if (isLineCable(branch)) {
      actions.push({ id: 'insert_station', label: 'Wstaw stację', op: 'insert_station_on_segment_sn', context: { segment_ref: branch.ref_id } });
      if (branch.type === 'line_overhead') {
        actions.push({ id: 'insert_branch_pole', label: 'Wstaw słup rozgałęźny', op: 'insert_branch_pole_on_segment_sn', context: { segment_ref: branch.ref_id } });
      }
      if (branch.type === 'cable') {
        actions.push({ id: 'insert_zksn', label: 'Wstaw ZKSN', op: 'insert_zksn_on_segment_sn', context: { segment_ref: branch.ref_id } });
      }
      actions.push({ id: 'insert_switch', label: 'Wstaw łącznik', op: 'insert_section_switch_sn', context: { segmentRef: branch.ref_id, segmentLabel: branch.name } });
    }
  }

  // Try branch points
  const branchPoint = snapshot.branch_points?.find((bp) => bp.ref_id === elementId);
  if (branchPoint) {
    elementType = branchPoint.branch_point_type;
    elementName = branchPoint.name;
    sections.push({
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'ref_id', label: 'Identyfikator', value: branchPoint.ref_id },
        { key: 'name', label: 'Nazwa', value: branchPoint.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS[branchPoint.branch_point_type] ?? branchPoint.branch_point_type },
      ],
    });
    sections.push({
      id: 'topology',
      label: 'Topologia',
      fields: [
        { key: 'parent_segment_id', label: 'Segment nadrzędny', value: branchPoint.parent_segment_id },
        { key: 'main_in', label: 'Port MAIN_IN', value: branchPoint.ports?.MAIN_IN ?? '—' },
        { key: 'main_out', label: 'Port MAIN_OUT', value: branchPoint.ports?.MAIN_OUT ?? '—' },
        { key: 'branch_ports', label: 'Porty BRANCH', value: branchPoint.ports?.BRANCH?.join(', ') ?? '—' },
      ],
    });
    sections.push({
      id: 'catalog',
      label: 'Katalog',
      fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: branchPoint.catalog_ref ?? '—' },
      ],
    });
    const defaultPort = branchPoint.branch_point_type === 'branch_pole' ? 'BRANCH' : 'BRANCH_1';
    actions.push({ id: 'add_branch', label: 'Dodaj odgałęzienie', op: 'start_branch_segment_sn', context: { from_ref: `${branchPoint.ref_id}.${defaultPort}` } });
  }

  // Try transformers
  const transformer = snapshot.transformers?.find((t) => t.ref_id === elementId);
  if (transformer) {
    elementType = 'transformer';
    elementName = transformer.name;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Identyfikator', value: transformer.ref_id },
        { key: 'name', label: 'Nazwa', value: transformer.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS.transformer },
      ],
    });
    sections.push({
      id: 'topology', label: 'Topologia', fields: [
        { key: 'hv_bus', label: 'Szyna GN (SN)', value: transformer.hv_bus_ref },
        { key: 'lv_bus', label: 'Szyna DN (nN)', value: transformer.lv_bus_ref },
      ],
    });
    sections.push({
      id: 'electrical', label: 'Parametry elektryczne', fields: [
        { key: 'sn_mva', label: 'Moc znamionowa', value: transformer.sn_mva, unit: 'MVA', source: 'catalog' },
        { key: 'uk_percent', label: 'Napięcie zwarcia uk', value: transformer.uk_percent, unit: '%', source: 'catalog' },
        { key: 'pk_kw', label: 'Straty zwarciowe Pk', value: transformer.pk_kw, unit: 'kW', source: 'catalog' },
        { key: 'tap_position', label: 'Pozycja zaczepu', value: transformer.tap_position ?? 0 },
        { key: 'vector_group', label: 'Grupa wektorowa', value: transformer.vector_group ?? '—', source: 'catalog' },
      ],
    });
    sections.push({
      id: 'catalog', label: 'Katalog', fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: transformer.catalog_ref ?? '—' },
      ],
    });
    actions.push({ id: 'assign_catalog', label: 'Przypisz katalog', op: 'assign_catalog_to_element', context: { element_ref: transformer.ref_id } });
    actions.push({ id: 'edit', label: 'Edytuj parametry', op: 'update_element_parameters', context: { element_ref: transformer.ref_id } });
  }

  // Try sources
  const source = snapshot.sources?.find((s) => s.ref_id === elementId);
  if (source) {
    elementType = 'source';
    elementName = source.name;
    const sourceBus = snapshot.buses?.find((b) => b.ref_id === source.bus_ref);
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Identyfikator', value: source.ref_id },
        { key: 'name', label: 'Nazwa', value: source.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS.source },
        { key: 'model', label: 'Model', value: source.model },
      ],
    });
    sections.push({
      id: 'electrical', label: 'Parametry sieci', fields: [
        { key: 'bus_voltage_kv', label: 'Napięcie szyny', value: sourceBus?.voltage_kv ?? null, unit: 'kV' },
        { key: 'sk3_mva', label: 'Moc zwarciowa Sk₃', value: source.sk3_mva ?? null, unit: 'MVA' },
        { key: 'rx_ratio', label: 'Stosunek R/X', value: source.rx_ratio ?? null },
        { key: 'r_ohm', label: 'Rezystancja R', value: source.r_ohm ?? null, unit: 'Ω' },
        { key: 'x_ohm', label: 'Reaktancja X', value: source.x_ohm ?? null, unit: 'Ω' },
      ],
    });
    actions.push({ id: 'edit', label: 'Edytuj parametry', op: 'update_element_parameters', context: { element_ref: source.ref_id } });
  }

  // Try substations
  const station = snapshot.substations?.find((s) => s.id === elementId);
  if (station) {
    elementType = 'substation';
    elementName = station.name;
    const stationBays = (snapshot.bays ?? []).filter((b) => b.substation_ref === station.id);
    const stationTransformers = (snapshot.transformers ?? []).filter((t) =>
      station.transformer_refs.includes(t.ref_id),
    );
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'id', label: 'Identyfikator', value: station.id },
        { key: 'name', label: 'Nazwa', value: station.name },
        { key: 'station_type', label: 'Typ stacji', value: station.station_type },
      ],
    });
    sections.push({
      id: 'structure', label: 'Struktura', fields: [
        { key: 'bay_count', label: 'Pola SN', value: stationBays.length, source: 'calculated' },
        { key: 'transformer_count', label: 'Transformatory', value: stationTransformers.length, source: 'calculated' },
        { key: 'bus_count', label: 'Szyny', value: station.bus_refs.length, source: 'calculated' },
      ],
    });
    actions.push({ id: 'add_transformer', label: 'Dodaj transformator', op: 'add_transformer_sn_nn', context: { station_ref: station.id }, variant: 'primary' });
    actions.push({ id: 'add_pv', label: 'Dodaj PV', op: 'add_pv_inverter_nn', context: { station_ref: station.id } });
    actions.push({ id: 'add_bess', label: 'Dodaj BESS', op: 'add_bess_inverter_nn', context: { station_ref: station.id } });
  }

  // Try generators (PV/BESS)
  const generator = snapshot.generators?.find((g) => g.ref_id === elementId);
  if (generator) {
    elementType = generator.gen_type ?? 'generator';
    elementName = generator.name;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Identyfikator', value: generator.ref_id },
        { key: 'name', label: 'Nazwa', value: generator.name },
        { key: 'gen_type', label: 'Typ', value: ELEMENT_TYPE_LABELS[generator.gen_type ?? ''] ?? generator.gen_type ?? '—' },
      ],
    });
    sections.push({
      id: 'electrical', label: 'Parametry elektryczne', fields: [
        { key: 'p_mw', label: 'Moc czynna', value: generator.p_mw, unit: 'MW' },
        { key: 'q_mvar', label: 'Moc bierna', value: generator.q_mvar ?? null, unit: 'Mvar' },
        { key: 'connection_variant', label: 'Wariant przyłączenia', value: generator.connection_variant ?? '—' },
      ],
    });
    sections.push({
      id: 'catalog', label: 'Katalog', fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: generator.catalog_ref ?? '—' },
      ],
    });
    actions.push({ id: 'assign_catalog', label: 'Przypisz katalog', op: 'assign_catalog_to_element', context: { element_ref: generator.ref_id } });
    actions.push({ id: 'edit', label: 'Edytuj parametry', op: 'update_element_parameters', context: { element_ref: generator.ref_id } });
  }

  // Try loads
  const load = snapshot.loads?.find((l) => l.ref_id === elementId);
  if (load) {
    elementType = 'load';
    elementName = load.name;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Identyfikator', value: load.ref_id },
        { key: 'name', label: 'Nazwa', value: load.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS.load },
      ],
    });
    sections.push({
      id: 'electrical', label: 'Parametry elektryczne', fields: [
        { key: 'p_mw', label: 'Moc czynna', value: load.p_mw, unit: 'MW' },
        { key: 'q_mvar', label: 'Moc bierna', value: load.q_mvar, unit: 'Mvar' },
      ],
    });
    actions.push({ id: 'edit', label: 'Edytuj parametry', op: 'update_element_parameters', context: { element_ref: load.ref_id } });
  }

  // Readiness section — blockers/warnings for this element
  const elementBlockers = (readiness?.blockers ?? []).filter((b) => b.element_ref === elementId);
  const elementWarnings = (readiness?.warnings ?? []).filter((w) => w.element_ref === elementId);
  if (elementBlockers.length > 0 || elementWarnings.length > 0) {
    sections.push({
      id: 'readiness', label: 'Gotowość', fields: [
        ...elementBlockers.map((b, i) => ({
          key: `blocker_${i}`,
          label: 'Blokada',
          value: b.message_pl,
        })),
        ...elementWarnings.map((w, i) => ({
          key: `warning_${i}`,
          label: 'Ostrzeżenie',
          value: w.message_pl,
        })),
      ],
    });
  }

  return { sections, elementType, elementName, actions };
}

// =============================================================================
// Component
// =============================================================================

export interface InspectorEngineeringViewProps {
  className?: string;
}

export function InspectorEngineeringView({ className }: InspectorEngineeringViewProps) {
  const selectedElements = useSelectionStore((s) => s.selectedElements);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const logicalViews = useSnapshotStore((s) => s.logicalViews);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const activeMode = useAppStateStore((s) => s.activeMode);
  const resultStatus = useAppStateStore((s) => s.activeCaseResultStatus);
  const toggleIssuePanel = useAppStateStore((s) => s.toggleIssuePanel);

  const elementId = selectedElements.length > 0 ? selectedElements[0].id : null;

  const { sections, elementType, elementName, actions } = useMemo(
    () => buildSectionsForElement(elementId ?? '', snapshot, readiness, logicalViews),
    [elementId, snapshot, readiness, logicalViews],
  );

  const readinessSummary = useMemo(() => {
    if (!elementId) {
      return { blockers: 0, warnings: 0 };
    }

    return {
      blockers: (readiness?.blockers ?? []).filter((item) => item.element_ref === elementId).length,
      warnings: (readiness?.warnings ?? []).filter((item) => item.element_ref === elementId).length,
    };
  }, [elementId, readiness]);

  const catalogRef = useMemo(() => {
    for (const section of sections) {
      const field = section.fields.find((item) => item.key === 'catalog_ref');
      if (field) {
        return field.value;
      }
    }

    return null;
  }, [sections]);

  const parentContext = useMemo(() => {
    for (const section of sections) {
      const stationField = section.fields.find((item) => item.key === 'parent_station');
      if (stationField?.value) {
        return stationField.value;
      }

      const roleField = section.fields.find((item) => item.key === 'role');
      if (roleField?.value) {
        return roleField.value;
      }
    }

    return null;
  }, [sections]);

  const overviewItems = useMemo(
    () => [
      {
        label: 'Katalog',
        value: catalogRef && catalogRef !== '—' ? 'przypisany' : 'wymaga uzupelnienia',
        tone: catalogRef && catalogRef !== '—' ? 'blue' : 'amber',
      },
      {
        label: 'Gotowosc',
        value:
          readinessSummary.blockers > 0
            ? `${readinessSummary.blockers} blokerow`
            : readinessSummary.warnings > 0
              ? `${readinessSummary.warnings} ostrzezen`
              : 'bez zastrzezen',
        tone:
          readinessSummary.blockers > 0
            ? 'amber'
            : readinessSummary.warnings > 0
              ? 'blue'
              : 'emerald',
      },
      {
        label: 'Wyniki',
        value:
          resultStatus === 'FRESH'
            ? 'aktualne'
            : resultStatus === 'OUTDATED'
              ? 'wymagaja odswiezenia'
              : 'brak',
        tone:
          resultStatus === 'FRESH'
            ? 'emerald'
            : resultStatus === 'OUTDATED'
              ? 'amber'
              : 'slate',
      },
      {
        label: 'Kontekst',
        value: parentContext ? String(parentContext) : 'bez nadrzednego kontekstu',
        tone: 'slate',
      },
    ] as Array<{ label: string; value: string; tone: OverviewTone }>,
    [catalogRef, parentContext, readinessSummary.blockers, readinessSummary.warnings, resultStatus],
  );

  const handleAction = useCallback(
    (action: QuickAction) => {
      openOperationForm(action.op, action.context);
    },
    [openOperationForm],
  );

  const handleOpenResults = useCallback(() => {
    window.location.hash = ROUTES.RESULTS.hash;
  }, []);

  const handleOpenIssues = useCallback(() => {
    toggleIssuePanel(true);
  }, [toggleIssuePanel]);

  if (!elementId || sections.length === 0) {
    return (
      <div className={clsx('flex flex-col h-full', className)} data-testid="inspector-engineering">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-xs text-gray-500">Zaznacz element na SLD</p>
            <p className="text-[10px] text-gray-400 mt-1">
              aby zobaczyć szczegóły inżynierskie
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('flex flex-col h-full', className)} data-testid="inspector-engineering">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
          <h3 className="text-sm font-semibold text-gray-800 truncate">{elementName}</h3>
        </div>
        <p className="text-[10px] text-gray-500 mt-0.5">
          {ELEMENT_TYPE_LABELS[elementType] ?? elementType} &middot; {elementId}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-gray-100 px-4 py-3">
        {overviewItems.map((item) => (
          <OverviewBadge
            key={item.label}
            label={item.label}
            value={item.value}
            tone={item.tone}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-100 px-4 py-2">
        {readinessSummary.blockers > 0 && (
          <button
            type="button"
            onClick={handleOpenIssues}
            className="rounded bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
          >
            Pokaz problemy
          </button>
        )}
        {resultStatus !== 'NONE' && (
          <button
            type="button"
            onClick={handleOpenResults}
            className="rounded bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-200"
          >
            Wyniki elementu
          </button>
        )}
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        {sections.map((section) => (
          <SectionBlock key={section.id} section={section} />
        ))}

        {/* Quick actions */}
        {actions.length > 0 && activeMode === 'MODEL_EDIT' && (
          <div className="px-4 py-3 border-t border-gray-200">
            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Operacje
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => handleAction(action)}
                  className={clsx(
                    'px-2.5 py-1 text-[10px] font-medium rounded transition-colors',
                    action.variant === 'primary'
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : action.variant === 'danger'
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                  )}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: OverviewTone;
}) {
  const toneClasses: Record<OverviewTone, string> = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
  };

  return (
    <div className={clsx('rounded border px-2.5 py-2', toneClasses[tone])}>
      <div className="text-[9px] font-semibold uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-[11px] font-medium">{value}</div>
    </div>
  );
}

// =============================================================================
// SectionBlock
// =============================================================================

function SectionBlock({ section }: { section: PropertySection }) {
  return (
    <div className="border-b border-gray-100">
      <div className="px-4 py-2">
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          {section.label}
        </h4>
        <div className="space-y-1">
          {section.fields.map((field) => (
            <div key={field.key} className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-gray-500 flex-shrink-0">{field.label}</span>
              <span
                className={clsx(
                  'text-[11px] font-medium text-right truncate max-w-[55%]',
                  field.source === 'catalog' ? 'text-blue-700' : 'text-gray-800',
                  field.source === 'calculated' ? 'text-green-700 italic' : '',
                  field.label === 'Blokada' ? 'text-red-600 font-normal' : '',
                  field.label === 'Ostrzeżenie' ? 'text-amber-600 font-normal' : '',
                )}
                title={String(field.value ?? '—')}
              >
                {formatValue(field.value)}
                {field.unit && <span className="text-gray-400 ml-0.5">{field.unit}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie';
  if (typeof value === 'number') {
    return value.toLocaleString('pl-PL', { maximumFractionDigits: 4 });
  }
  return String(value);
}
