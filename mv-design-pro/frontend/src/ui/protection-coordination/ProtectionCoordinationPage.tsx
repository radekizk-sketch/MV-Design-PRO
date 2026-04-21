/**
 * FIX-12B — Protection Coordination Page
 *
 * Main page for protection coordination analysis with Canonical parity UX.
 *
 * FEATURES:
 * - Device management (add, remove, clone, apply template)
 * - Context selector (StudyCase/Snapshot/Run)
 * - Run coordination analysis
 * - View results (sensitivity, selectivity, overload)
 * - TCC chart visualization (log-log)
 * - WHITE BOX trace
 *
 * CANONICAL ALIGNMENT:
 * - 100% Polish labels
 * - READ-ONLY relative to solver results
 * - No physics calculations in frontend
 */

import { useState, useCallback, useMemo } from 'react';
import type {
  ProtectionDevice,
  CoordinationResult,
  FaultCurrentData,
  OperatingCurrentData,
  AnalysisStatus,
  DeviceTemplate,
} from './types';
import {
  LABELS,
  DEFAULT_STAGE_51,
  DEFAULT_CONFIG,
  DEVICE_TEMPLATES,
} from './types';
import { runCoordinationAnalysis, getCoordinationResult } from './api';
import { ProtectionSettingsEditor } from './ProtectionSettingsEditor';
import {
  VerdictBadge,
  SensitivityTable,
  SelectivityTable,
  OverloadTable,
  SummaryCard,
} from './ResultsTables';
import { TccChartFromResult } from './TccChart';
import { TracePanel } from './TracePanel';
import { TccInterpretationPanel } from './TccInterpretationPanel';

// =============================================================================
// Types
// =============================================================================

type TabId = 'summary' | 'sensitivity' | 'selectivity' | 'overload' | 'tcc' | 'trace';

interface PageState {
  devices: ProtectionDevice[];
  faultCurrents: FaultCurrentData[];
  operatingCurrents: OperatingCurrentData[];
  result: CoordinationResult | null;
  status: AnalysisStatus;
  error: string | null;
  activeTab: TabId;
  editingDeviceId: string | null;
  showTemplates: boolean;
}

// =============================================================================
// Context Selector Component
// =============================================================================

interface ContextSelectorProps {
  projectId: string;
  caseId: string | null;
  snapshotId: string | null;
  onProjectChange?: (id: string) => void;
  onCaseChange?: (id: string | null) => void;
  onSnapshotChange?: (id: string | null) => void;
}

function ContextSelector({
  projectId,
  caseId,
  snapshotId,
}: ContextSelectorProps) {
  const labels = LABELS.context;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">{labels.project}:</span>
        <span className="font-medium text-slate-900">{projectId || labels.noContext}</span>
      </div>
      <div className="h-4 w-px bg-slate-200" />
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">{labels.studyCase}:</span>
        <span className="font-medium text-slate-900">{caseId || labels.selectCase}</span>
      </div>
      <div className="h-4 w-px bg-slate-200" />
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">{labels.snapshot}:</span>
        <span className="font-medium text-slate-900">{snapshotId || labels.selectSnapshot}</span>
      </div>
    </div>
  );
}

// =============================================================================
// Device List Panel Component
// =============================================================================

interface DeviceListPanelProps {
  devices: ProtectionDevice[];
  editingDeviceId: string | null;
  onAddDevice: () => void;
  onRemoveDevice: (id: string) => void;
  onCloneDevice: (id: string) => void;
  onSelectDevice: (id: string | null) => void;
  onShowTemplates: () => void;
}

function DeviceListPanel({
  devices,
  editingDeviceId,
  onAddDevice,
  onRemoveDevice,
  onCloneDevice,
  onSelectDevice,
  onShowTemplates,
}: DeviceListPanelProps) {
  const labels = LABELS.devices;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold text-slate-900">{labels.title}</h2>
        <div className="flex gap-2">
          <button
            onClick={onShowTemplates}
            className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
            title={labels.applyTemplate}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
          <button
            onClick={onAddDevice}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
          >
            {labels.add}
          </button>
        </div>
      </div>

      {/* Device list */}
      <div className="max-h-[400px] overflow-y-auto p-2">
        {devices.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            {labels.noDevices}
          </div>
        ) : (
          <div className="space-y-1">
            {devices.map((device) => (
              <div
                key={device.id}
                className={`group flex items-center justify-between rounded p-2 transition-colors ${
                  editingDeviceId === device.id
                    ? 'bg-blue-50 ring-1 ring-blue-200'
                    : 'hover:bg-slate-50'
                }`}
              >
                <button
                  className="flex-1 text-left"
                  onClick={() => onSelectDevice(device.id)}
                >
                  <p className="font-medium text-slate-900">{device.name}</p>
                  <p className="text-xs text-slate-500">
                    {LABELS.deviceTypes[device.device_type]} | {device.location_element_id}
                  </p>
                </button>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloneDevice(device.id);
                    }}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                    title={labels.clone}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveDevice(device.id);
                    }}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                    title={labels.remove}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Template Selector Modal
// =============================================================================

interface TemplateSelectorProps {
  templates: DeviceTemplate[];
  onSelect: (template: DeviceTemplate) => void;
  onClose: () => void;
}

function TemplateSelector({ templates, onSelect, onClose }: TemplateSelectorProps) {
  const labels = LABELS.templates;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-900">{labels.title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-4">
          {templates.length === 0 ? (
            <p className="text-center text-slate-500">{labels.noTemplates}</p>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => onSelect(template)}
                  className="w-full rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
                >
                  <p className="font-medium text-slate-900">{template.name}</p>
                  <p className="text-sm text-slate-500">{template.description_pl}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {LABELS.deviceTypes[template.device_type]}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Summary Tab Component
// =============================================================================

interface SummaryTabProps {
  result: CoordinationResult;
}

function SummaryTab({ result }: SummaryTabProps) {
  const { summary } = result;
  const labels = LABELS.summary;

  return (
    <div className="space-y-6">
      {/* Overall Verdict */}
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{labels.title}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {LABELS.verdictVerbose[result.overall_verdict]}
            </p>
          </div>
          <VerdictBadge verdict={result.overall_verdict} size="md" />
        </div>
        <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
          <div className="flex justify-between rounded bg-slate-50 px-3 py-2">
            <span className="text-slate-600">{labels.totalDevices}</span>
            <span className="font-medium text-slate-900">{summary.total_devices}</span>
          </div>
          <div className="flex justify-between rounded bg-slate-50 px-3 py-2">
            <span className="text-slate-600">{labels.totalChecks}</span>
            <span className="font-medium text-slate-900">{summary.total_checks}</span>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title={LABELS.checks.sensitivity.title}
          passCount={summary.sensitivity.pass}
          marginalCount={summary.sensitivity.marginal}
          failCount={summary.sensitivity.fail}
        />
        <SummaryCard
          title={LABELS.checks.selectivity.title}
          passCount={summary.selectivity.pass}
          marginalCount={summary.selectivity.marginal}
          failCount={summary.selectivity.fail}
        />
        <SummaryCard
          title={LABELS.checks.overload.title}
          passCount={summary.overload.pass}
          marginalCount={summary.overload.marginal}
          failCount={summary.overload.fail}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Tab Navigation Component
// =============================================================================

interface TabNavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  result: CoordinationResult | null;
}

function TabNavigation({ activeTab, onTabChange, result }: TabNavigationProps) {
  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'summary', label: LABELS.tabs.summary },
    {
      id: 'sensitivity',
      label: LABELS.tabs.sensitivity,
      count: result?.sensitivity_checks.length,
    },
    {
      id: 'selectivity',
      label: LABELS.tabs.selectivity,
      count: result?.selectivity_checks.length,
    },
    {
      id: 'overload',
      label: LABELS.tabs.overload,
      count: result?.overload_checks.length,
    },
    { id: 'tcc', label: LABELS.tabs.tcc },
    { id: 'trace', label: LABELS.tabs.trace, count: result?.trace_steps.length },
  ];

  return (
    <div className="flex gap-1 rounded-lg bg-slate-100 p-1" data-testid="tab-navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'bg-white text-slate-900 shadow'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          data-testid={`tab-${tab.id}`}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="rounded-full bg-slate-200 px-1.5 text-xs">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export function ProtectionCoordinationPage() {
  // Demo project context
  const projectId = 'demo-project';
  const caseId = 'case-001';
  const snapshotId = 'snapshot-001';

  const [state, setState] = useState<PageState>({
    devices: [],
    faultCurrents: [],
    operatingCurrents: [],
    result: null,
    status: 'IDLE',
    error: null,
    activeTab: 'summary',
    editingDeviceId: null,
    showTemplates: false,
  });

  // Add new device
  const handleAddDevice = useCallback(() => {
    const newDevice: ProtectionDevice = {
      id: crypto.randomUUID(),
      name: `Zabezpieczenie ${state.devices.length + 1}`,
      device_type: 'RELAY',
      location_element_id: `bus_${state.devices.length + 1}`,
      settings: {
        stage_51: { ...DEFAULT_STAGE_51 },
      },
    };

    // Demo fault/operating currents
    const newFault: FaultCurrentData = {
      location_id: newDevice.location_element_id,
      ik_max_3f_a: 5000 + Math.random() * 3000,
      ik_min_3f_a: 2000 + Math.random() * 1000,
    };

    const newOperating: OperatingCurrentData = {
      location_id: newDevice.location_element_id,
      i_operating_a: 200 + Math.random() * 200,
    };

    setState((prev) => ({
      ...prev,
      devices: [...prev.devices, newDevice],
      faultCurrents: [...prev.faultCurrents, newFault],
      operatingCurrents: [...prev.operatingCurrents, newOperating],
      editingDeviceId: newDevice.id,
    }));
  }, [state.devices.length]);

  // Clone device
  const handleCloneDevice = useCallback((deviceId: string) => {
    setState((prev) => {
      const sourceDevice = prev.devices.find((d) => d.id === deviceId);
      if (!sourceDevice) return prev;

      const clonedDevice: ProtectionDevice = {
        ...sourceDevice,
        id: crypto.randomUUID(),
        name: `${sourceDevice.name} (kopia)`,
        location_element_id: `${sourceDevice.location_element_id}_copy`,
      };

      const sourceFault = prev.faultCurrents.find(
        (f) => f.location_id === sourceDevice.location_element_id
      );
      const sourceOperating = prev.operatingCurrents.find(
        (o) => o.location_id === sourceDevice.location_element_id
      );

      return {
        ...prev,
        devices: [...prev.devices, clonedDevice],
        faultCurrents: sourceFault
          ? [...prev.faultCurrents, { ...sourceFault, location_id: clonedDevice.location_element_id }]
          : prev.faultCurrents,
        operatingCurrents: sourceOperating
          ? [...prev.operatingCurrents, { ...sourceOperating, location_id: clonedDevice.location_element_id }]
          : prev.operatingCurrents,
        editingDeviceId: clonedDevice.id,
      };
    });
  }, []);

  // Apply template
  const handleApplyTemplate = useCallback((template: DeviceTemplate) => {
    const newDevice: ProtectionDevice = {
      id: crypto.randomUUID(),
      name: template.name,
      device_type: template.device_type,
      location_element_id: `bus_${state.devices.length + 1}`,
      settings: JSON.parse(JSON.stringify(template.settings)),
    };

    const newFault: FaultCurrentData = {
      location_id: newDevice.location_element_id,
      ik_max_3f_a: 5000 + Math.random() * 3000,
      ik_min_3f_a: 2000 + Math.random() * 1000,
    };

    const newOperating: OperatingCurrentData = {
      location_id: newDevice.location_element_id,
      i_operating_a: 200 + Math.random() * 200,
    };

    setState((prev) => ({
      ...prev,
      devices: [...prev.devices, newDevice],
      faultCurrents: [...prev.faultCurrents, newFault],
      operatingCurrents: [...prev.operatingCurrents, newOperating],
      editingDeviceId: newDevice.id,
      showTemplates: false,
    }));
  }, [state.devices.length]);

  // Remove device
  const handleRemoveDevice = useCallback((deviceId: string) => {
    setState((prev) => {
      const device = prev.devices.find((d) => d.id === deviceId);
      if (!device) return prev;

      return {
        ...prev,
        devices: prev.devices.filter((d) => d.id !== deviceId),
        faultCurrents: prev.faultCurrents.filter(
          (f) => f.location_id !== device.location_element_id
        ),
        operatingCurrents: prev.operatingCurrents.filter(
          (o) => o.location_id !== device.location_element_id
        ),
        editingDeviceId: prev.editingDeviceId === deviceId ? null : prev.editingDeviceId,
      };
    });
  }, []);

  // Update device
  const handleDeviceChange = useCallback((device: ProtectionDevice) => {
    setState((prev) => ({
      ...prev,
      devices: prev.devices.map((d) => (d.id === device.id ? device : d)),
      editingDeviceId: null,
    }));
  }, []);

  // Run analysis
  const handleRunAnalysis = useCallback(async () => {
    if (state.devices.length === 0) {
      setState((prev) => ({
        ...prev,
        error: LABELS.validation.minOneDevice,
      }));
      return;
    }

    setState((prev) => ({ ...prev, status: 'RUNNING', error: null }));

    try {
      const summary = await runCoordinationAnalysis(projectId, {
        devices: state.devices,
        fault_currents: state.faultCurrents,
        operating_currents: state.operatingCurrents,
        config: DEFAULT_CONFIG,
      });

      const result = await getCoordinationResult(summary.run_id);

      setState((prev) => ({
        ...prev,
        result,
        status: 'SUCCESS',
        activeTab: 'summary',
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: 'ERROR',
        error: err instanceof Error ? err.message : LABELS.status.error,
      }));
    }
  }, [state.devices, state.faultCurrents, state.operatingCurrents]);

  // Get editing device
  const editingDevice = useMemo(
    () =>
      state.editingDeviceId
        ? state.devices.find((d) => d.id === state.editingDeviceId)
        : null,
    [state.editingDeviceId, state.devices]
  );

  // Status indicator
  const statusText = useMemo(() => {
    switch (state.status) {
      case 'IDLE':
        return LABELS.status.idle;
      case 'RUNNING':
        return LABELS.status.running;
      case 'SUCCESS':
        return LABELS.status.success;
      case 'ERROR':
        return LABELS.status.error;
      default:
        return '';
    }
  }, [state.status]);

  return (
    <div className="min-h-screen bg-slate-50 p-6" data-testid="protection-coordination-page">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">{LABELS.title}</h1>
          <p className="text-slate-600">{LABELS.subtitle}</p>
        </div>

        {/* Context Selector */}
        <div className="mb-6">
          <ContextSelector
            projectId={projectId}
            caseId={caseId}
            snapshotId={snapshotId}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Panel - Devices */}
          <div className="space-y-4">
            <DeviceListPanel
              devices={state.devices}
              editingDeviceId={state.editingDeviceId}
              onAddDevice={handleAddDevice}
              onRemoveDevice={handleRemoveDevice}
              onCloneDevice={handleCloneDevice}
              onSelectDevice={(id) =>
                setState((prev) => ({ ...prev, editingDeviceId: id }))
              }
              onShowTemplates={() =>
                setState((prev) => ({ ...prev, showTemplates: true }))
              }
            />

            {/* Run Analysis Button */}
            <button
              onClick={handleRunAnalysis}
              disabled={state.status === 'RUNNING' || state.devices.length === 0}
              className="w-full rounded bg-emerald-600 px-4 py-3 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="run-analysis-button"
            >
              {state.status === 'RUNNING' ? LABELS.status.running : LABELS.actions.runAnalysis}
            </button>

            {/* Status */}
            {state.status !== 'IDLE' && (
              <div
                className={`rounded p-3 text-sm ${
                  state.status === 'ERROR'
                    ? 'border border-rose-200 bg-rose-50 text-rose-700'
                    : state.status === 'SUCCESS'
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border border-blue-200 bg-blue-50 text-blue-700'
                }`}
              >
                {state.error || statusText}
              </div>
            )}
          </div>

          {/* Right Panel - Editor or Results */}
          <div className="lg:col-span-2">
            {editingDevice ? (
              <ProtectionSettingsEditor
                device={editingDevice}
                onChange={handleDeviceChange}
                onCancel={() =>
                  setState((prev) => ({ ...prev, editingDeviceId: null }))
                }
              />
            ) : state.result ? (
              <div className="space-y-4">
                {/* Tabs */}
                <TabNavigation
                  activeTab={state.activeTab}
                  onTabChange={(tab) =>
                    setState((prev) => ({ ...prev, activeTab: tab }))
                  }
                  result={state.result}
                />

                {/* Tab Content */}
                {state.activeTab === 'summary' && (
                  <SummaryTab result={state.result} />
                )}
                {state.activeTab === 'sensitivity' && (
                  <SensitivityTable
                    checks={state.result.sensitivity_checks}
                    devices={state.devices}
                    onRowClick={(deviceId) =>
                      setState((prev) => ({ ...prev, editingDeviceId: deviceId }))
                    }
                  />
                )}
                {state.activeTab === 'selectivity' && (
                  <SelectivityTable
                    checks={state.result.selectivity_checks}
                    devices={state.devices}
                  />
                )}
                {state.activeTab === 'overload' && (
                  <OverloadTable
                    checks={state.result.overload_checks}
                    devices={state.devices}
                    onRowClick={(deviceId) =>
                      setState((prev) => ({ ...prev, editingDeviceId: deviceId }))
                    }
                  />
                )}
                {state.activeTab === 'tcc' && (
                  <div className="space-y-4">
                    {/* UI-04: TCC Interpretation Panel (obok wykresu) */}
                    <div className="flex flex-col xl:flex-row gap-4">
                      <div className="flex-1 min-w-0">
                        <TccChartFromResult
                          result={state.result}
                          devices={state.devices}
                          onDeviceClick={(deviceId) =>
                            setState((prev) => ({ ...prev, editingDeviceId: deviceId }))
                          }
                          height={500}
                        />
                      </div>
                      <div className="xl:w-96 flex-shrink-0">
                        <TccInterpretationPanel
                          selectivityChecks={state.result.selectivity_checks}
                          devices={state.devices}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {state.activeTab === 'trace' && (
                  <TracePanel
                    traceSteps={state.result.trace_steps}
                    runId={state.result.run_id}
                    createdAt={state.result.created_at}
                  />
                )}
              </div>
            ) : (
              <div className="flex h-96 items-center justify-center rounded-lg border border-slate-200 bg-white">
                <div className="text-center">
                  <svg
                    className="mx-auto h-12 w-12 text-slate-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="mt-2 text-slate-500">{LABELS.devices.selectToEdit}</p>
                  <p className="text-sm text-slate-400">
                    {LABELS.validation.minOneDevice}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Template Selector Modal */}
        {state.showTemplates && (
          <TemplateSelector
            templates={DEVICE_TEMPLATES}
            onSelect={handleApplyTemplate}
            onClose={() => setState((prev) => ({ ...prev, showTemplates: false }))}
          />
        )}
      </div>
    </div>
  );
}

export default ProtectionCoordinationPage;
