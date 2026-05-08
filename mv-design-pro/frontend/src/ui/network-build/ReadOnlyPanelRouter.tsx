import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useAppStateStore } from '../app-state';
import { MathRenderer } from '../proof';
import { downloadAnalysisTraceExport } from '../proof/traceExportApi';
import { useReadinessLiveStore } from '../engineering-readiness/readinessLiveStore';
import { buildFieldReadModelSummaries, type FieldReadModelSummary } from '../field/fieldReadModelSelectors';
import { useFieldReadModel } from '../field/useFieldReadModel';
import { useProtectionReadModel } from '../protection/useProtectionReadModel';
import { ResultsExport } from '../results-inspector/ResultsExport';
import { useResultsInspectorStore } from '../results-inspector/store';
import type { ResultsInspectorTab, TraceStep, TraceValue } from '../results-inspector/types';
import { notify } from '../notifications/store';
import { navigateToProof, navigateToResults } from '../navigation/routes';
import { useSelectionStore } from '../selection';
import { useSnapshotStore } from '../topology/snapshotStore';
import type { ElementType, SelectedElement } from '../types';
import { useActiveInspectorPanel, useNetworkBuildStore } from './networkBuildStore';
import { RunHistoryPanel } from '../study-cases/RunHistoryPanel';
import { useExecutionRunsStore } from '../study-cases/runStore';
import {
  collectRefs,
  filterBranchRows,
  filterBusRows,
  filterShortCircuitRows,
  filterTrace,
  issueMatches,
  resolveElementName,
} from './readOnlyPanelShared';

type InspectorTab =
  | 'results'
  | 'trace'
  | 'readiness'
  | 'report'
  | 'history'
  | 'topology'
  | 'secondary_links'
  | 'coordination'
  | 'field_measurements'
  | 'field_control'
  | 'field_protection'
  | 'field_source_contributions'
  | 'field_earth_fault'
  | 'field_work_safety'
  | 'field_compare';
type ReportTab = Exclude<ResultsInspectorTab, 'TRACE'>;

const TAB_LABELS: Record<InspectorTab, string> = {
  results: 'Wyniki',
  trace: 'Wywód',
  readiness: 'Gotowość',
  report: 'Raport',
  history: 'Historia',
  topology: 'Topologia',
  secondary_links: 'Powiazania wtorne',
  coordination: 'Koordynacja',
  field_measurements: 'Pomiary pola',
  field_control: 'Sterowanie lacznikami',
  field_protection: 'Zabezpieczenie pola',
  field_source_contributions: 'Wklady zrodel',
  field_earth_fault: 'Tor ziemnozwarciowy',
  field_work_safety: 'Bezpieczenstwo do pracy',
  field_compare: 'Porownanie pol',
};

const REPORT_TAB_LABELS: Record<ReportTab, string> = {
  BUSES: 'Szyny',
  BRANCHES: 'Gałęzie',
  SHORT_CIRCUIT: 'Zwarcia',
};

const SEVERITY_LABELS: Record<string, string> = {
  BLOCKER: 'Blokujący',
  IMPORTANT: 'Istotny',
  INFO: 'Informacyjny',
};

const READINESS_STATUS_LABELS: Record<'OK' | 'WARN' | 'FAIL', string> = {
  OK: 'Gotowy',
  WARN: 'Gotowy warunkowo',
  FAIL: 'Niegotowy',
};

const TYPE_LABELS: Partial<Record<ElementType, string>> = {
  Source: 'Źródło SN',
  Bus: 'Szyna SN',
  Station: 'Stacja SN/nN',
  BaySN: 'Pole SN',
  Switch: 'Łącznik SN',
  TransformerBranch: 'Transformator',
  LineBranch: 'Odcinek SN',
  BusNN: 'Szyna nN',
  FeederNN: 'Odpływ nN',
  SourceFieldNN: 'Pole źródłowe nN',
  PVInverter: 'Falownik PV',
  BESSInverter: 'Falownik BESS',
  Genset: 'Agregat',
  UPS: 'UPS',
  Load: 'Obciążenie',
  LoadNN: 'Obciążenie nN',
  Relay: 'Zabezpieczenie',
  Measurement: 'Pomiar',
  NOP: 'NOP',
  EnergyStorage: 'Magazyn energii',
};

function formatNumber(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function formatTraceValue(value: TraceValue | unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object' && value && 'value' in (value as TraceValue)) {
    const tv = value as TraceValue;
    const text = formatTraceValue(tv.value);
    return tv.unit ? `${text} ${tv.unit}` : text;
  }
  if (typeof value === 'number') return formatNumber(value, 4);
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie';
  return String(value);
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600"><div className="font-medium text-slate-900">{title}</div><div className="mt-1">{text}</div></div>;
}

function TabButton({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={clsx('rounded-full px-3 py-1 text-xs font-medium transition-colors', active ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50')}>{children}</button>;
}

function KeyValueList({ rows }: { rows: Array<{ label: string; value: string }> }) {
  if (rows.length === 0) {
    return <Empty title="Brak danych" text="Nie znaleziono danych odczytowych dla tej sekcji." />;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {rows.map((row) => (
        <div key={`${row.label}-${row.value}`} className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0">
          <span className="font-medium text-slate-500">{row.label}</span>
          <span className="text-right text-slate-900">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function formatList(values: readonly string[]): string {
  if (values.length === 0) {
    return '-';
  }
  return values.join(', ');
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

function formatMeasurementSideLabel(side: string | null | undefined): string {
  switch (side) {
    case 'pole':
      return 'Pole';
    case 'strona_szyn':
      return 'Strona szyn';
    case 'strona_odplywu':
      return 'Strona odplywu';
    case 'strona_lewa':
      return 'Strona lewa';
    case 'strona_prawa':
      return 'Strona prawa';
    default:
      return side ?? '-';
  }
}

function TraceCard({ step, index }: { step: TraceStep; index: number }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Krok {step.step ?? index + 1}</div>
          <div className="text-sm font-semibold text-slate-900">{step.title ?? 'Wywód obliczeniowy'}</div>
        </div>
        {step.element_id && <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">{step.element_id}</span>}
      </div>
      {step.formula_latex && <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"><MathRenderer latex={step.formula_latex} block className="text-slate-800" /></div>}
      {step.inputs && Object.keys(step.inputs).length > 0 && <div className="mt-3 text-xs text-slate-700">{Object.entries(step.inputs).map(([key, value]) => <div key={key} className="flex justify-between gap-3 border-b border-slate-100 py-1.5"><span className="font-medium text-slate-500">{key}</span><span className="text-right">{formatTraceValue(value)}</span></div>)}</div>}
      {step.substitution && <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"><MathRenderer latex={step.substitution} block className="text-slate-800" /></div>}
      {step.result && Object.keys(step.result).length > 0 && <div className="mt-3 text-xs text-slate-700">{Object.entries(step.result).map(([key, value]) => <div key={key} className="flex justify-between gap-3 border-b border-slate-100 py-1.5"><span className="font-medium text-slate-500">{key}</span><span className="text-right">{formatTraceValue(value)}</span></div>)}</div>}
      {step.notes && <div className="mt-3 text-xs text-slate-600">{step.notes}</div>}
    </article>
  );
}

export function ReadOnlyPanelRouter() {
  const activePanel = useActiveInspectorPanel();
  const closePanel = useNetworkBuildStore((state) => state.closeInspectorPanel);
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeProjectName = useAppStateStore((state) => state.activeProjectName);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const selectElement = useSelectionStore((state) => state.selectElement);
  const centerSldOnElement = useSelectionStore((state) => state.centerSldOnElement);
  const runHistoryCaseId = useExecutionRunsStore((state) => state.activeStudyCaseId);
  const activeRunId = useExecutionRunsStore((state) => state.activeRunId);
  const runs = useExecutionRunsStore((state) => state.runs);
  const isLoadingRuns = useExecutionRunsStore((state) => state.isLoadingRuns);
  const setRunHistoryCaseId = useExecutionRunsStore((state) => state.setActiveStudyCaseId);
  const setActiveRun = useExecutionRunsStore((state) => state.setActiveRun);
  const readinessIssues = useReadinessLiveStore((state) => state.issues);
  const readinessStatus = useReadinessLiveStore((state) => state.status);
  const readinessReady = useReadinessLiveStore((state) => state.ready);
  const readinessLoading = useReadinessLiveStore((state) => state.loading);
  const readinessError = useReadinessLiveStore((state) => state.error);
  const refreshReadiness = useReadinessLiveStore((state) => state.refresh);
  const fieldReadModel = useFieldReadModel();
  const protectionReadModel = useProtectionReadModel();
  const selectedRunId = useResultsInspectorStore((state) => state.selectedRunId);
  const resultsIndex = useResultsInspectorStore((state) => state.resultsIndex);
  const busResults = useResultsInspectorStore((state) => state.busResults);
  const branchResults = useResultsInspectorStore((state) => state.branchResults);
  const shortCircuitResults = useResultsInspectorStore((state) => state.shortCircuitResults);
  const extendedTrace = useResultsInspectorStore((state) => state.extendedTrace);
  const isLoadingIndex = useResultsInspectorStore((state) => state.isLoadingIndex);
  const isLoadingBuses = useResultsInspectorStore((state) => state.isLoadingBuses);
  const isLoadingBranches = useResultsInspectorStore((state) => state.isLoadingBranches);
  const isLoadingShortCircuit = useResultsInspectorStore((state) => state.isLoadingShortCircuit);
  const isLoadingTrace = useResultsInspectorStore((state) => state.isLoadingTrace);
  const selectRun = useResultsInspectorStore((state) => state.selectRun);
  const loadBusResults = useResultsInspectorStore((state) => state.loadBusResults);
  const loadBranchResults = useResultsInspectorStore((state) => state.loadBranchResults);
  const loadShortCircuitResults = useResultsInspectorStore((state) => state.loadShortCircuitResults);
  const loadExtendedTrace = useResultsInspectorStore((state) => state.loadExtendedTrace);

  const [activeTab, setActiveTab] = useState<InspectorTab>('results');
  const [reportTab, setReportTab] = useState<ReportTab>('BUSES');

  const fieldRecords = useMemo(
    () => buildFieldReadModelSummaries(fieldReadModel.data.fields, snapshot),
    [fieldReadModel.data.fields, snapshot],
  );
  const relatedFieldRecords = useMemo<FieldReadModelSummary[]>(() => {
    if (!activePanel) return [];
    return fieldRecords.filter((record) => (
      record.ref_id === activePanel.elementId
      || record.id === activePanel.elementId
      || record.linked_refs.includes(activePanel.elementId)
      || (
        activePanel.elementType === 'Station'
        && (record.station_ref === activePanel.elementId)
      )
    ));
  }, [activePanel, fieldRecords]);
  const selectedFieldRecord = relatedFieldRecords[0] ?? null;

  useEffect(() => { if (activePanel) setActiveTab(activePanel.kind); }, [activePanel]);
  useEffect(() => { if (activeRunId && selectedRunId !== activeRunId) void selectRun(activeRunId); }, [activeRunId, selectRun, selectedRunId]);
  useEffect(() => {
    if (activeCaseId && runHistoryCaseId !== activeCaseId) {
      setRunHistoryCaseId(activeCaseId);
    }
  }, [activeCaseId, runHistoryCaseId, setRunHistoryCaseId]);
  useEffect(() => {
    if (!activeRunId || selectedRunId !== activeRunId || !resultsIndex) return;
    if (!busResults && !isLoadingBuses) void loadBusResults();
    if (!branchResults && !isLoadingBranches) void loadBranchResults();
    if (!shortCircuitResults && !isLoadingShortCircuit) void loadShortCircuitResults();
    if (!extendedTrace && !isLoadingTrace) void loadExtendedTrace();
  }, [activeRunId, branchResults, busResults, extendedTrace, isLoadingBuses, isLoadingBranches, isLoadingShortCircuit, isLoadingTrace, loadBranchResults, loadBusResults, loadExtendedTrace, loadShortCircuitResults, resultsIndex, selectedRunId, shortCircuitResults]);
  useEffect(() => {
    if (activeCaseId) {
      void refreshReadiness(activeCaseId);
    }
  }, [activeCaseId, refreshReadiness]);

  const refs = useMemo(
    () => activePanel
      ? collectRefs(snapshot, activePanel.elementId, activePanel.elementType, selectedFieldRecord, fieldRecords)
      : new Set<string>(),
    [activePanel, fieldRecords, selectedFieldRecord, snapshot],
  );
  const elementName = useMemo(
    () => activePanel
      ? resolveElementName(snapshot, activePanel.elementId, activePanel.elementType, selectedFieldRecord)
      : '',
    [activePanel, selectedFieldRecord, snapshot],
  );
  const matchedBusRows = useMemo(() => filterBusRows(busResults?.rows ?? [], refs), [busResults, refs]);
  const matchedBranchRows = useMemo(() => filterBranchRows(branchResults?.rows ?? [], refs), [branchResults, refs]);
  const matchedShortCircuitRows = useMemo(() => filterShortCircuitRows(shortCircuitResults?.rows ?? [], refs), [refs, shortCircuitResults]);
  const filteredTrace = useMemo(() => filterTrace(extendedTrace?.white_box_trace, refs), [extendedTrace, refs]);
  const filteredIssues = useMemo(
    () => readinessIssues.filter((issue) => !activePanel || issueMatches(issue, refs)),
    [activePanel, readinessIssues, refs],
  );
  const protectionAssignments = useMemo(() => {
    const byDevice = new Map<string, { device_name_pl: string; status: string; element_id: string }>();
    for (const ref of refs) {
      for (const assignment of protectionReadModel.assignmentsByElement.get(ref) ?? []) {
        byDevice.set(`${assignment.device_id}:${assignment.element_id}`, {
          device_name_pl: assignment.device_name_pl,
          status: assignment.status,
          element_id: assignment.element_id,
        });
      }
    }
    return [...byDevice.values()].sort((left, right) => left.device_name_pl.localeCompare(right.device_name_pl));
  }, [protectionReadModel.assignmentsByElement, refs]);
  const protectionDiagnostics = useMemo(() => {
    const results = [...refs].flatMap(
      (ref) => protectionReadModel.diagnosticsByElement.get(ref)?.results ?? [],
    );
    return results.sort((left, right) => left.code.localeCompare(right.code));
  }, [protectionReadModel.diagnosticsByElement, refs]);
  const protectionSummaries = useMemo(() => {
    const summaries = [...refs].flatMap((ref) => {
      const summary = protectionReadModel.summariesByElement.get(ref);
      return summary ? [summary] : [];
    });
    return summaries.sort((left, right) => left.element_name.localeCompare(right.element_name));
  }, [protectionReadModel.summariesByElement, refs]);
  const topologyRows = useMemo(() => {
    if (!activePanel) return [] as Array<{ label: string; value: string }>;

    const rows: Array<{ label: string; value: string }> = [
      { label: 'Typ elementu', value: TYPE_LABELS[activePanel.elementType] ?? activePanel.elementType },
      { label: 'Ref elementu', value: activePanel.elementId },
    ];

    const station = snapshot?.substations.find((item) => item.ref_id === activePanel.elementId || item.id === activePanel.elementId) ?? null;
    const branch = snapshot?.branches.find((item) => item.ref_id === activePanel.elementId || item.id === activePanel.elementId) ?? null;
    const bus = snapshot?.buses.find((item) => item.ref_id === activePanel.elementId || item.id === activePanel.elementId) ?? null;
    const transformer = snapshot?.transformers.find((item) => item.ref_id === activePanel.elementId || item.id === activePanel.elementId) ?? null;
    const source = snapshot?.sources.find((item) => item.ref_id === activePanel.elementId || item.id === activePanel.elementId) ?? null;
    const generator = snapshot?.generators.find((item) => item.ref_id === activePanel.elementId || item.id === activePanel.elementId) ?? null;
    const branchPoint = snapshot?.branch_points?.find((item) => item.ref_id === activePanel.elementId || item.id === activePanel.elementId) ?? null;

    if (selectedFieldRecord) {
      const baseModel = selectedFieldRecord.fieldItem.canonical_model.base_model;
      rows.push(
        { label: 'Pole kanoniczne', value: selectedFieldRecord.name },
        { label: 'Rola pola', value: selectedFieldRecord.bay_role_label },
        { label: 'Stacja', value: selectedFieldRecord.station_name },
        { label: 'Szyna', value: selectedFieldRecord.bus_name },
      );
      if (baseModel.gpz_section_id) {
        rows.push({ label: 'Sekcja GPZ', value: baseModel.gpz_section_id });
      }
      rows.push(
        { label: 'Aparaty pierwotne', value: String(baseModel.primary_devices.length) },
        {
          label: 'Rodzaje aparatow',
          value: formatList(uniqueStrings(baseModel.primary_devices.map((device) => device.kind))),
        },
      );
    }

    if (station) {
      rows.push(
        { label: 'Typ stacji', value: station.station_type },
        { label: 'Szyny stacji', value: formatList(station.bus_refs) },
        { label: 'Transformatory stacji', value: formatList(station.transformer_refs) },
      );
    }
    if (branch) {
      rows.push(
        { label: 'Poczatek galezi', value: branch.from_bus_ref },
        { label: 'Koniec galezi', value: branch.to_bus_ref },
        { label: 'Typ galezi', value: branch.type },
      );
    }
    if (bus) {
      rows.push({ label: 'Napiecie szyny', value: `${formatNumber(bus.voltage_kv, 3)} kV` });
    }
    if (transformer) {
      rows.push(
        { label: 'Szyna HV', value: transformer.hv_bus_ref },
        { label: 'Szyna LV', value: transformer.lv_bus_ref },
        { label: 'Moc transformatora', value: `${formatNumber(transformer.sn_mva, 3)} MVA` },
      );
    }
    if (source) {
      rows.push(
        { label: 'Szyna zasilania', value: source.bus_ref },
        { label: 'Model zrodla', value: source.model },
      );
    }
    if (generator) {
      rows.push(
        { label: 'Szyna generatora', value: generator.bus_ref },
        { label: 'Typ generatora', value: generator.gen_type ?? '-' },
        { label: 'Wariant przylaczenia', value: generator.connection_variant ?? '-' },
      );
    }
    if (branchPoint) {
      rows.push(
        { label: 'Typ punktu rozgaleznego', value: branchPoint.branch_point_type },
        { label: 'Port glowny IN', value: branchPoint.ports.MAIN_IN },
        { label: 'Port glowny OUT', value: branchPoint.ports.MAIN_OUT },
        { label: 'Porty boczne', value: formatList(branchPoint.ports.BRANCH ?? []) },
      );
    }

    return rows;
  }, [activePanel, selectedFieldRecord, snapshot]);
  const secondaryRows = useMemo(() => {
    if (relatedFieldRecords.length === 0) return [] as Array<{ label: string; value: string }>;

    return relatedFieldRecords.flatMap((record) => {
      const baseModel = record.fieldItem.canonical_model.base_model;
      const unitValues = baseModel.secondary_units.map((unit) => (
        `${unit.unit_kind}: ${unit.unit_ref}`
      ));
      const ctRefs = baseModel.measurement_chain?.ct_refs ?? [];
      const vtRefs = baseModel.measurement_chain?.vt_refs ?? [];
      return [
        { label: `Pole ${record.name}`, value: record.bay_role_label },
        { label: 'Architektura wtórna', value: baseModel.secondary_architecture.type },
        { label: 'Dostawca pomiarow', value: baseModel.secondary_architecture.measurement_provider },
        { label: 'Jednostki wtórne', value: formatList(unitValues) },
        { label: 'Przekladniki pradowe', value: formatList(ctRefs) },
        { label: 'Przekladniki napieciowe', value: formatList(vtRefs) },
        { label: 'Zabezpieczenie', value: baseModel.protection_config?.unit_ref ?? '-' },
      ];
    });
  }, [relatedFieldRecords]);
  const coordinationRows = useMemo(() => {
    const rows: Array<{ label: string; value: string }> = [];
    if (selectedFieldRecord) {
      const protectionConfig = selectedFieldRecord.fieldItem.canonical_model.base_model.protection_config;
      if (protectionConfig) {
        rows.push(
          { label: 'Jednostka ochronna', value: protectionConfig.unit_ref },
          { label: 'Tryb nastaw', value: protectionConfig.settings_mode },
          {
            label: 'Funkcje aktywne',
            value: formatList(
              protectionConfig.functions
                .filter((item) => item.enabled)
                .map((item) => item.code),
            ),
          },
        );
        if (protectionConfig.spz) {
          rows.push(
            { label: 'SPZ', value: protectionConfig.spz.state },
            { label: 'Wyłącznik SPZ', value: protectionConfig.spz.bound_breaker_ref },
          );
        }
      }
    }
    if (protectionAssignments.length > 0) {
      rows.push({
        label: 'Przypisania ochrony',
        value: formatList(
          protectionAssignments.map((assignment) => `${assignment.device_name_pl} (${assignment.status})`),
        ),
      });
    }
    if (protectionSummaries.length > 0) {
      rows.push({
        label: 'Weryfikacja ochrony',
        value: formatList(
          protectionSummaries.map((summary) => `${summary.element_name}: ${summary.verification_reason ?? 'brak uwag'}`),
        ),
      });
    }
    return rows;
  }, [protectionAssignments, protectionSummaries, selectedFieldRecord]);
  const fieldMeasurementRows = useMemo(() => {
    if (!selectedFieldRecord) {
      return [] as Array<{ label: string; value: string }>;
    }

    const chain = selectedFieldRecord.fieldItem.canonical_model.base_model.measurement_chain;
    if (!chain) {
      return [];
    }

    const measurementSetLabels = chain.measurement_sets.map((set) => {
      const values = set.values;
      return [
        formatMeasurementSideLabel(set.side),
        `Ia ${formatNumber(values.ia_a, 2)} A`,
        `Ib ${formatNumber(values.ib_a, 2)} A`,
        `Ic ${formatNumber(values.ic_a, 2)} A`,
        `3I0 ${formatNumber(values.zero_sequence_current_a, 2)} A`,
        `3U0 ${formatNumber(values.zero_sequence_voltage_kv, 3)} kV`,
      ].join(' | ');
    });

    return [
      { label: 'Pole', value: selectedFieldRecord.name },
      { label: 'Rola pola', value: selectedFieldRecord.bay_role_label },
      { label: 'Lancuch pomiarowy', value: chain.chain_ref },
      { label: 'Topologia toru', value: chain.topology },
      { label: 'Przekladniki pradowe', value: formatList(chain.ct_refs) },
      { label: 'Przekladniki napieciowe', value: formatList(chain.vt_refs) },
      { label: 'Zrodlo 3I0', value: chain.zero_sequence_current_source },
      { label: 'Zrodlo 3U0', value: chain.zero_sequence_voltage_source },
      { label: 'Uzywa 3I0', value: chain.uses_3i0 ? 'Tak' : 'Nie' },
      { label: 'Uzywa 3U0', value: chain.uses_3u0 ? 'Tak' : 'Nie' },
      { label: 'Zestawy pomiarowe', value: String(chain.measurement_sets.length) },
      ...(measurementSetLabels.length > 0
        ? measurementSetLabels.map((value, index) => ({
            label: `Pomiar ${index + 1}`,
            value,
          }))
        : [{ label: 'Pomiar bieżący', value: 'Brak zestawów pomiarowych w read-modelu pola' }]),
    ];
  }, [selectedFieldRecord]);
  const fieldControlRows = useMemo(() => {
    if (!selectedFieldRecord) {
      return [] as Array<{ label: string; value: string }>;
    }

    const { base_model: baseModel, runtime_state: runtimeState } = selectedFieldRecord.fieldItem.canonical_model;
    const activeInterlocks = baseModel.interlocks.entries.filter((entry) => entry.active);
    const controllableDevices = baseModel.primary_devices.filter((device) => device.is_controllable);

    return [
      { label: 'Dostepnosc sterowania', value: runtimeState?.control_availability ?? '-' },
      { label: 'Lacznosc wtórna', value: runtimeState?.secondary_communication_status ?? '-' },
      { label: 'Ostatnia aktualizacja', value: runtimeState?.last_good_update_at ?? '-' },
      { label: 'Aparaty sterowalne', value: formatList(baseModel.control_surface.controllable_device_refs) },
      { label: 'Potwierdzenie otwarcia', value: baseModel.control_surface.open_requires_confirmation ? 'Tak' : 'Nie' },
      { label: 'Potwierdzenie zamkniecia', value: baseModel.control_surface.close_requires_confirmation ? 'Tak' : 'Nie' },
      { label: 'KAS', value: baseModel.control_surface.kas_available ? 'Dostepny' : 'Niedostepny' },
      { label: 'Transfer lokalne/zdalne', value: baseModel.control_surface.local_remote_transfer_supported ? 'Obslugiwany' : 'Nieobslugiwany' },
      {
        label: 'Ostatnie polecenie',
        value: runtimeState?.pending_command
          ? `${runtimeState.pending_command.command} -> ${runtimeState.pending_command.state}`
          : 'Brak aktywnego polecenia',
      },
      {
        label: 'Powod odrzucenia',
        value: runtimeState?.pending_command?.rejected_reason ?? '-',
      },
      { label: 'Aktywne blokady', value: formatList(activeInterlocks.map((entry) => `${entry.code}: ${entry.reason}`)) },
      {
        label: 'Stany aparatow',
        value: formatList(
          controllableDevices.map((device) => `${device.device_ref}: ${device.switch_state?.actual_state ?? 'brak stanu'}`),
        ),
      },
    ];
  }, [selectedFieldRecord]);
  const fieldProtectionRows = useMemo(() => {
    if (!selectedFieldRecord) {
      return [] as Array<{ label: string; value: string }>;
    }

    const protectionConfig = selectedFieldRecord.fieldItem.canonical_model.base_model.protection_config;
    if (!protectionConfig) {
      return [];
    }

    const functionLabels = protectionConfig.functions.map((item) => (
      `${item.code}: ${item.enabled ? 'wlaczona' : 'wylaczona'}${item.blocked ? ', blokada' : ''}${item.tripped ? ', wyzwolona' : ''}`
    ));

    return [
      { label: 'Jednostka ochronna', value: protectionConfig.unit_ref },
      { label: 'Producent', value: protectionConfig.manufacturer ?? '-' },
      { label: 'Model', value: protectionConfig.model ?? '-' },
      { label: 'Tryb nastaw', value: protectionConfig.settings_mode },
      { label: 'Funkcje ochronne', value: formatList(functionLabels) },
      { label: 'Wejscia przekladnika pradowego', value: protectionConfig.measurement_inputs.uses_ct ? 'Tak' : 'Nie' },
      { label: 'Wejscia przekladnika napieciowego', value: protectionConfig.measurement_inputs.uses_vt ? 'Tak' : 'Nie' },
      { label: 'Wejscia 3I0', value: protectionConfig.measurement_inputs.uses_3i0 ? 'Tak' : 'Nie' },
      { label: 'Wejscia 3U0', value: protectionConfig.measurement_inputs.uses_3u0 ? 'Tak' : 'Nie' },
      { label: 'SPZ', value: protectionConfig.spz?.state ?? 'Brak SPZ' },
      { label: 'Alarmy aktywne', value: String(protectionConfig.alarms.filter((alarm) => alarm.active).length) },
      { label: 'Zdarzenia', value: String(protectionConfig.events.length) },
      { label: 'Rejestrator zaklocen', value: protectionConfig.disturbance_recorder.available ? 'Dostepny' : 'Brak' },
      { label: 'Trendy', value: protectionConfig.trends.available ? formatList(protectionConfig.trends.channels) : 'Brak' },
    ];
  }, [selectedFieldRecord]);
  const fieldSourceContributionRows = useMemo(() => {
    if (!selectedFieldRecord) {
      return [] as Array<{ label: string; value: string }>;
    }

    const projectResults = selectedFieldRecord.fieldItem.project_results;
    if (!projectResults) {
      return [];
    }

    return [
      { label: 'Identyfikator obliczenia', value: projectResults.run_ref },
      { label: 'Stan wynikow', value: projectResults.result_state },
      {
        label: 'Wklady w zwarciu',
        value: formatList(
          projectResults.source_contributions_sc.map((item) => `${item.source_kind} ${item.source_ref}`),
        ),
      },
      {
        label: 'Wklady w rozplywie',
        value: formatList(
          projectResults.source_contributions_pf.map((item) => `${item.source_kind} ${item.source_ref}`),
        ),
      },
      {
        label: 'Powiazanie z wywodem',
        value: projectResults.proof_binding.proof_ref,
      },
    ];
  }, [selectedFieldRecord]);
  const fieldEarthFaultRows = useMemo(() => {
    if (!selectedFieldRecord) {
      return [] as Array<{ label: string; value: string }>;
    }

    const earthFaultPath = selectedFieldRecord.fieldItem.project_results?.earth_fault_path;
    if (!earthFaultPath) {
      return [];
    }

    return [
      { label: 'Tryb uziemienia', value: earthFaultPath.neutral_grounding_mode },
      { label: 'Zrodlo 3I0', value: earthFaultPath.zero_sequence_current_source },
      { label: 'Zrodlo 3U0', value: earthFaultPath.zero_sequence_voltage_source },
      { label: 'Droga zamkniecia', value: formatList(earthFaultPath.closure_path_elements) },
      { label: 'Wklad transformatora', value: earthFaultPath.transformer_contribution_ref ?? '-' },
      { label: 'Urzadzenie uziemiajace', value: earthFaultPath.grounding_device_ref ?? '-' },
    ];
  }, [selectedFieldRecord]);
  const fieldSafetyRows = useMemo(() => {
    if (!selectedFieldRecord) {
      return [] as Array<{ label: string; value: string }>;
    }

    const safety = selectedFieldRecord.fieldItem.canonical_model.runtime_state?.energization_and_safety;
    if (!safety) {
      return [];
    }

    return [
      { label: 'Zasilanie od strony szyn', value: safety.energized_from_bus_side ? 'Tak' : 'Nie' },
      { label: 'Zasilanie od strony odplywu', value: safety.energized_from_feeder_side ? 'Tak' : 'Nie' },
      { label: 'Pole uziemione', value: safety.grounded ? 'Tak' : 'Nie' },
      { label: 'Widoczna przerwa', value: safety.visible_isolation_gap ? 'Tak' : 'Nie' },
      { label: 'Bezpieczne do pracy', value: safety.safe_to_work ? 'Tak' : 'Nie' },
      { label: 'Powod braku bezpieczenstwa', value: safety.unsafe_reason_pl ?? '-' },
    ];
  }, [selectedFieldRecord]);
  const fieldCompareRows = useMemo(() => {
    if (!selectedFieldRecord) {
      return [] as Array<{ label: string; value: string }>;
    }

    const siblings = fieldRecords
      .filter((record) => record.station_ref === selectedFieldRecord.station_ref && record.ref_id !== selectedFieldRecord.ref_id)
      .slice(0, 4);

    if (siblings.length === 0) {
      return [];
    }

    return siblings.map((record) => {
      const baseModel = record.fieldItem.canonical_model.base_model;
      const runtimeState = record.fieldItem.canonical_model.runtime_state;
      const resultState = record.fieldItem.project_results?.result_state ?? 'brak';
      return {
        label: record.name,
        value: [
          record.bay_role_label,
          `${baseModel.primary_devices.length} aparatow`,
          `${baseModel.measurement_chain?.ct_refs.length ?? 0} CT`,
          `${baseModel.measurement_chain?.vt_refs.length ?? 0} VT`,
          `sterowanie ${runtimeState?.control_availability ?? '-'}`,
          `wynik ${resultState}`,
        ].join(' | '),
      };
    });
  }, [fieldRecords, selectedFieldRecord]);
  const runHeader = resultsIndex?.run_header ?? {
    run_id: activeRunId ?? 'brak',
    project_id: activeProjectId ?? 'brak',
    case_id: activeCaseId ?? 'brak',
    snapshot_id: null,
    created_at: new Date().toISOString(),
    status: 'UNKNOWN',
    result_state: 'NONE',
    solver_kind: 'UNKNOWN',
    input_hash: '—',
  };

  const locate = useCallback(() => {
    if (!activePanel) return;
    const selected: SelectedElement = { id: activePanel.elementId, name: elementName, type: activePanel.elementType };
    selectElement(selected);
    centerSldOnElement(activePanel.elementId);
  }, [activePanel, centerSldOnElement, elementName, selectElement]);
  const openResults = useCallback(() => {
    if (selectedRunId) {
      navigateToResults({ runId: selectedRunId });
    }
  }, [selectedRunId]);
  const openTrace = useCallback(() => {
    if (selectedRunId) {
      navigateToProof({ runId: selectedRunId });
    }
  }, [selectedRunId]);
  const exportJsonl = useCallback(async () => {
    if (!selectedRunId) {
      notify('Brak aktywnego uruchomienia do eksportu wywodu.', 'warning');
      return;
    }
    try {
      await downloadAnalysisTraceExport(selectedRunId, 'jsonl', { projectId: activeProjectId });
      notify('Pobrano wywód JSONL.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Nie udało się pobrać wywodu JSONL.', 'error');
    }
  }, [activeProjectId, selectedRunId]);
  const exportPdf = useCallback(async () => {
    if (!selectedRunId) {
      notify('Brak aktywnego uruchomienia do eksportu wywodu.', 'warning');
      return;
    }
    try {
      await downloadAnalysisTraceExport(selectedRunId, 'pdf', { projectId: activeProjectId });
      notify('Pobrano wywód PDF.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Nie udało się pobrać wywodu PDF.', 'error');
    }
  }, [activeProjectId, selectedRunId]);
  const canOpenRunArtifacts = Boolean(selectedRunId);
  const blockedRunArtifactsTitle = canOpenRunArtifacts ? undefined : 'Brak aktywnego uruchomienia do otwarcia.';
  const handleSelectHistoryRun = useCallback((runId: string) => {
    setActiveRun(runId);
    void selectRun(runId);
    setActiveTab('results');
  }, [selectRun, setActiveRun]);

  if (!activePanel) return null;

  const loading = isLoadingIndex || isLoadingBuses || isLoadingBranches || isLoadingShortCircuit || isLoadingTrace || readinessLoading || isLoadingRuns;

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Panel odczytowy</div>
            <div className="text-sm font-semibold text-slate-900">{TAB_LABELS[activePanel.kind]}</div>
            <div className="mt-0.5 text-xs text-slate-500">{TYPE_LABELS[activePanel.elementType] ?? activePanel.elementType}: {elementName}</div>
          </div>
          <button type="button" onClick={closePanel} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">Zamknij</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(TAB_LABELS) as InspectorTab[]).map((tab) => <TabButton key={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)}>{TAB_LABELS[tab]}</TabButton>)}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        {loading && <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">Ładowanie danych odczytowych dla wybranego elementu.</div>}

        {activeTab === 'results' && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Wyniki powiązane z elementem</div>
              <div className="text-xs text-slate-500">Obliczenia: {activeCaseName ?? activeCaseId ?? 'brak'} • Projekt: {activeProjectName ?? activeProjectId ?? 'brak'}</div>
            </div>
            {matchedBusRows.length === 0 && matchedBranchRows.length === 0 && matchedShortCircuitRows.length === 0 ? (
              <Empty title="Brak dopasowanych wyników" text="W aktywnym uruchomieniu nie znaleziono wyników dla tego elementu." />
            ) : (
              <div className="space-y-3">
                {matchedBusRows.map((row) => <div key={row.bus_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-900">{row.name}</div><div className="text-[11px] font-mono text-slate-500">{row.bus_id}</div></div><span className={clsx('rounded-full border px-2 py-0.5 text-[11px] font-medium', row.u_pu && row.u_pu >= 0.95 && row.u_pu <= 1.05 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700')}>Węzeł</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700"><div>Un: {formatNumber(row.un_kv, 1)} kV</div><div>U: {formatNumber(row.u_kv, 3)} kV</div><div>U: {formatNumber(row.u_pu, 4)} pu</div><div>Kąt: {formatNumber(row.angle_deg, 2)}°</div></div></div>)}
                {matchedBranchRows.map((row) => <div key={row.branch_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-900">{row.name}</div><div className="text-[11px] font-mono text-slate-500">{row.branch_id}</div></div><span className={clsx('rounded-full border px-2 py-0.5 text-[11px] font-medium', row.loading_pct && row.loading_pct > 100 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-blue-200 bg-blue-50 text-blue-700')}>Gałąź</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700"><div>Z: {row.from_bus}</div><div>Do: {row.to_bus}</div><div>I: {formatNumber(row.i_a, 1)} A</div><div>Obciążenie: {formatNumber(row.loading_pct, 1)} %</div></div></div>)}
                {matchedShortCircuitRows.map((row) => <div key={row.target_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-900">{row.target_name ?? row.target_id}</div><div className="text-[11px] font-mono text-slate-500">{row.target_id}</div></div><span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">Zwarcie</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700"><div>Ik'': {formatNumber(row.ikss_ka, 3)} kA</div><div>ip: {formatNumber(row.ip_ka, 3)} kA</div><div>Ith: {formatNumber(row.ith_ka, 3)} kA</div><div>Sk: {formatNumber(row.sk_mva, 1)} MVA</div></div></div>)}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={locate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Pokaż na schemacie</button>
              <button type="button" onClick={openResults} disabled={!canOpenRunArtifacts} title={blockedRunArtifactsTitle} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:bg-slate-300">Otwórz pełne wyniki</button>
            </div>
          </div>
        )}

        {activeTab === 'trace' && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Wywód szczegółowy</div>
              <div className="text-xs text-slate-500">Pokazane są tylko kroki powiązane z elementem.</div>
            </div>
            {filteredTrace.length === 0 ? <Empty title="Brak wywodu dla elementu" text="Aktywny ślad nie zawiera kroków powiązanych z tym elementem." /> : <div className="space-y-3">{filteredTrace.map((step, index) => <TraceCard key={step.key ?? `${step.step ?? index}-${index}`} step={step} index={index} />)}</div>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={locate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Pokaż na schemacie</button>
              <button type="button" onClick={openTrace} disabled={!canOpenRunArtifacts} title={blockedRunArtifactsTitle} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:bg-slate-300">Otwórz pełny wywód</button>
              <button type="button" onClick={() => void exportJsonl()} disabled={!canOpenRunArtifacts} title={blockedRunArtifactsTitle} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-slate-100">Eksportuj JSONL wywodu</button>
              <button type="button" onClick={() => void exportPdf()} disabled={!canOpenRunArtifacts} title={blockedRunArtifactsTitle} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-slate-100">Eksportuj PDF wywodu</button>
            </div>
          </div>
        )}

        {activeTab === 'readiness' && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Gotowość elementu</div>
              <div className="text-xs text-slate-500">
                {readinessReady || filteredIssues.length > 0 || readinessError || readinessLoading
                  ? `Status: ${READINESS_STATUS_LABELS[readinessStatus] ?? readinessStatus} • Braki: ${filteredIssues.length}`
                  : 'Brak danych gotowości'}
              </div>
            </div>
            {readinessError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{readinessError}</div>}
            {filteredIssues.length === 0 ? <Empty title="Brak blokad dla tego elementu" text="W raporcie gotowości nie znaleziono problemów powiązanych z aktywnym elementem." /> : <div className="space-y-3">{filteredIssues.map((issue) => <div key={issue.code} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-900">{issue.message_pl}</div><div className="text-xs text-slate-500">Kod: {issue.code} • Krok: {issue.wizard_step_hint}</div></div><span className={clsx('rounded-full border px-2 py-0.5 text-[11px] font-medium', issue.severity === 'BLOCKER' ? 'border-rose-200 bg-rose-50 text-rose-700' : issue.severity === 'IMPORTANT' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-blue-200 bg-blue-50 text-blue-700')}>{SEVERITY_LABELS[issue.severity] ?? issue.severity}</span></div>{issue.suggested_fix && <div className="mt-2 text-sm text-slate-700">{issue.suggested_fix}</div>}<div className="mt-3"><button type="button" onClick={locate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Pokaż na schemacie</button></div></div>)}</div>}
          </div>
        )}

        {activeTab === 'topology' && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Topologia elementu</div>
              <div className="text-xs text-slate-500">Panel pokazuje powiazania topologiczne i referencje kanoniczne bez przebudowy geometrii SLD.</div>
            </div>
            <KeyValueList rows={topologyRows} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={locate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Pokaz na schemacie</button>
              <button type="button" onClick={() => setActiveTab('results')} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800">Przejdz do wynikow</button>
            </div>
          </div>
        )}

        {activeTab === 'secondary_links' && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Powiazania wtorne</div>
              <div className="text-xs text-slate-500">Widok pokazuje architekture wtórna, tory pomiarowe i przypisane jednostki zabezpieczeniowo-sterownicze.</div>
            </div>
            <KeyValueList rows={secondaryRows} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={locate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Pokaz na schemacie</button>
              <button type="button" onClick={() => setActiveTab('coordination')} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800">Otworz koordynacje</button>
            </div>
          </div>
        )}

        {activeTab === 'coordination' && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Koordynacja zabezpieczen</div>
              <div className="text-xs text-slate-500">Panel laczy kontrakt pola, przypisania ochrony i diagnostyke read-model bez lokalnych adapterow wynikowych.</div>
            </div>
            <KeyValueList rows={coordinationRows} />
            {protectionDiagnostics.length > 0 && (
              <div className="space-y-3">
                {protectionDiagnostics.map((diagnostic) => (
                  <div key={`${diagnostic.element_id}-${diagnostic.code}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{diagnostic.message_pl}</div>
                        <div className="text-xs text-slate-500">Kod: {diagnostic.code} | Element: {diagnostic.element_id}</div>
                      </div>
                      <span className={clsx(
                        'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                        diagnostic.severity === 'ERROR'
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : diagnostic.severity === 'WARN'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-blue-200 bg-blue-50 text-blue-700',
                      )}>
                        {diagnostic.severity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {coordinationRows.length === 0 && protectionDiagnostics.length === 0 && (
              <Empty title="Brak danych koordynacyjnych" text="Dla wybranego elementu nie znaleziono przypisan ochrony ani diagnostyki read-model." />
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={locate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Pokaz na schemacie</button>
              <button type="button" onClick={() => setActiveTab('secondary_links')} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800">Powiazania wtorne</button>
            </div>
          </div>
        )}

        {activeTab === 'field_measurements' && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Pomiary pola</div>
              <div className="text-xs text-slate-500">Kanoniczny widok toru pomiarowego pola z jawnymi zrodlami 3I0 i 3U0.</div>
            </div>
            {fieldMeasurementRows.length === 0 ? (
              <Empty title="Brak toru pomiarowego" text="Wybrane pole nie ma kompletnego kontraktu pomiarowego w read-modelu." />
            ) : (
              <KeyValueList rows={fieldMeasurementRows} />
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={locate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Pokaz na schemacie</button>
              <button type="button" onClick={() => setActiveTab('field_source_contributions')} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800">Wklady zrodel</button>
            </div>
          </div>
        )}

        {activeTab === 'field_control' && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Sterowanie lacznikami</div>
              <div className="text-xs text-slate-500">Widok pokazuje gotowosc sterowania, blokady i cykl zycia ostatniego polecenia pola.</div>
            </div>
            {fieldControlRows.length === 0 ? (
              <Empty title="Brak danych sterowania" text="Wybrane pole nie ma kompletnego runtime sterowania w kanonicznym modelu." />
            ) : (
              <KeyValueList rows={fieldControlRows} />
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={locate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Pokaz na schemacie</button>
              <button type="button" onClick={() => setActiveTab('field_work_safety')} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800">Bezpieczenstwo do pracy</button>
            </div>
          </div>
        )}

        {activeTab === 'field_protection' && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Zabezpieczenie pola</div>
              <div className="text-xs text-slate-500">Pelny surface ochrony pola oparty o wspolny protection read-model i kontrakt pola.</div>
            </div>
            {fieldProtectionRows.length === 0 ? (
              <Empty title="Brak danych zabezpieczeniowych" text="Dla wybranego pola nie znaleziono konfiguracji ochrony w kanonicznym modelu." />
            ) : (
              <KeyValueList rows={fieldProtectionRows} />
            )}
            {protectionDiagnostics.length > 0 && (
              <div className="space-y-3">
                {protectionDiagnostics.map((diagnostic) => (
                  <div key={`field-protection-${diagnostic.element_id}-${diagnostic.code}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-sm font-semibold text-slate-900">{diagnostic.message_pl}</div>
                    <div className="mt-1 text-xs text-slate-500">Kod: {diagnostic.code} | Element: {diagnostic.element_id}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={locate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Pokaz na schemacie</button>
              <button type="button" onClick={() => setActiveTab('coordination')} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800">Koordynacja</button>
            </div>
          </div>
        )}

        {activeTab === 'field_source_contributions' && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Wklady zrodel</div>
              <div className="text-xs text-slate-500">Jedyny kanoniczny widok wkładow zrodel w zwarciu i rozplywie dla pola.</div>
            </div>
            {fieldSourceContributionRows.length === 0 ? (
              <Empty title="Brak wynikow pola" text="Wybrane pole nie ma jeszcze przypietych wynikow projektowych lub wkładow zrodel." />
            ) : (
              <KeyValueList rows={fieldSourceContributionRows} />
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={openResults} disabled={!canOpenRunArtifacts} title={blockedRunArtifactsTitle} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:bg-slate-300">Otworz pelne wyniki</button>
              <button type="button" onClick={() => setActiveTab('field_earth_fault')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Tor ziemnozwarciowy</button>
            </div>
          </div>
        )}

        {activeTab === 'field_earth_fault' && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Tor ziemnozwarciowy</div>
              <div className="text-xs text-slate-500">Jawny kontrakt toru ziemnozwarciowego zrodel 3I0 i 3U0 dla pola.</div>
            </div>
            {fieldEarthFaultRows.length === 0 ? (
              <Empty title="Brak toru ziemnozwarciowego" text="Wybrane pole nie ma przypietego toru ziemnozwarciowego w wynikach projektowych." />
            ) : (
              <KeyValueList rows={fieldEarthFaultRows} />
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={locate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Pokaz na schemacie</button>
              <button type="button" onClick={() => setActiveTab('field_source_contributions')} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800">Wklady zrodel</button>
            </div>
          </div>
        )}

        {activeTab === 'field_work_safety' && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Bezpieczenstwo do pracy</div>
              <div className="text-xs text-slate-500">Widok energizacji, uziemienia i bezpieczenstwa do pracy bez mieszania runtime z geometria.</div>
            </div>
            {fieldSafetyRows.length === 0 ? (
              <Empty title="Brak danych bezpieczenstwa" text="Wybrane pole nie ma kompletnego runtime energizacji i bezpieczenstwa do pracy." />
            ) : (
              <KeyValueList rows={fieldSafetyRows} />
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={locate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Pokaz na schemacie</button>
              <button type="button" onClick={() => setActiveTab('field_control')} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800">Sterowanie polem</button>
            </div>
          </div>
        )}

        {activeTab === 'field_compare' && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Porownanie pol</div>
              <div className="text-xs text-slate-500">Zestawienie bieżącego pola z innymi polami tej samej stacji bez lokalnej przebudowy modelu.</div>
            </div>
            {fieldCompareRows.length === 0 ? (
              <Empty title="Brak pol do porownania" text="Dla wybranego pola nie znaleziono innych pol tej samej stacji w kanonicznym read-modelu." />
            ) : (
              <KeyValueList rows={fieldCompareRows} />
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={locate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Pokaz na schemacie</button>
              <button type="button" onClick={() => setActiveTab('topology')} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800">Topologia pola</button>
            </div>
          </div>
        )}

        {activeTab === 'report' && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Raport końcowy i eksporty uruchomienia</div>
              <div className="text-xs text-slate-500">
                Generator raportu końcowego jest kanoniczną ścieżką raportową dla aktywnego uruchomienia.
                Pomocnicze artefakty uruchomienia pozostają dostępne podrzędnie dla diagnostyki i śladu.
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap gap-2">{(Object.keys(REPORT_TAB_LABELS) as ReportTab[]).map((tab) => <TabButton key={tab} active={reportTab === tab} onClick={() => setReportTab(tab)}>{REPORT_TAB_LABELS[tab]}</TabButton>)}</div>
            </div>
            <ResultsExport exportData={{ activeTab: reportTab, busRows: matchedBusRows, branchRows: matchedBranchRows, shortCircuitRows: matchedShortCircuitRows, runHeader, projectName: activeProjectName ?? undefined, caseName: activeCaseName ?? undefined }} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={locate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Pokaż na schemacie</button>
              <button type="button" onClick={openResults} disabled={!canOpenRunArtifacts} title={blockedRunArtifactsTitle} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:bg-slate-300">Otwórz pełny widok wyników uruchomienia</button>
              <button type="button" onClick={openTrace} disabled={!canOpenRunArtifacts} title={blockedRunArtifactsTitle} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-slate-100">Otwórz pełny wywód obliczenia</button>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Historia obliczeń</div>
              <div className="text-xs text-slate-500">
                Obliczenia: {activeCaseName ?? activeCaseId ?? 'brak'} - wybierz przebieg, aby otworzyć jego wyniki dla aktywnego elementu.
              </div>
            </div>
            {runs.length === 0 ? (
              <Empty
                title="Brak historii obliczeń"
                text="Nie znaleziono przebiegów dla aktywnego zakresu obliczeń. Wykonaj analizę, aby zobaczyć historię."
              />
            ) : (
              <RunHistoryPanel
                selectedRunId={selectedRunId ?? activeRunId}
                onSelectRun={handleSelectHistoryRun}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={locate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Pokaż na schemacie</button>
              <button type="button" onClick={() => setActiveTab('results')} disabled={!canOpenRunArtifacts} title={blockedRunArtifactsTitle} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:bg-slate-300">Przejdź do wyników</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReadOnlyPanelRouter;
