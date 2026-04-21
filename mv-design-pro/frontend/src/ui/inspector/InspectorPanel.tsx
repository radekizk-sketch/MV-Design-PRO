import { useCallback, useEffect, useMemo, useState } from 'react';

import { PropertyGrid } from './PropertyGrid';
import type {
  BranchResultData,
  BusResultData,
  InspectorSection,
  ShortCircuitResultData,
} from './types';
import { FLAG_LABELS, INSPECTOR_SECTION_LABELS } from './types';
import { navigateToProof } from '../navigation';
import { useSelectionStore } from '../selection';
import { useExecutionRunsStore } from '../study-cases/runStore';

type InspectorTab =
  | 'overview'
  | 'parameters'
  | 'results'
  | 'contributions'
  | 'limits'
  | 'proof';

const TAB_LABELS: Record<InspectorTab, string> = {
  overview: 'Przegląd',
  parameters: 'Parametry',
  results: 'Wyniki',
  contributions: 'Kontrybutorzy',
  limits: 'Limity',
  proof: 'Dowód obliczeń',
};

const AVAILABLE_TABS: Record<string, InspectorTab[]> = {
  bus: ['overview', 'parameters', 'results', 'contributions', 'limits', 'proof'],
  branch: ['overview', 'parameters', 'results', 'contributions', 'limits'],
  short_circuit: ['overview', 'parameters', 'results', 'contributions', 'limits', 'proof'],
  default: ['overview', 'parameters', 'results'],
};

type InspectorResultRow =
  | { type: 'bus'; data: BusResultData }
  | { type: 'branch'; data: BranchResultData }
  | { type: 'short_circuit'; data: ShortCircuitResultData };

interface InspectorPanelProps {
  selectedRow?: InspectorResultRow | null;
  onClose?: () => void;
  className?: string;
}

interface InspectorPanelConnectedProps {
  resultData?: InspectorResultRow | null;
  onClose?: () => void;
  className?: string;
}

function formatNumber(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatFlags(flags: string[]): string {
  if (flags.length === 0) return 'Brak';
  return flags.map((flag) => FLAG_LABELS[flag] ?? flag).join(', ');
}

function formatLimitStatus(status: 'OK' | 'WARNING' | 'VIOLATION'): string {
  switch (status) {
    case 'OK':
      return 'W normie';
    case 'WARNING':
      return 'Ostrzeżenie';
    case 'VIOLATION':
      return 'Przekroczenie';
  }
}

function buildBusOverviewSections(data: BusResultData): InspectorSection[] {
  return [
    {
      id: 'identification',
      label: INSPECTOR_SECTION_LABELS.identification,
      fields: [
        { key: 'name', label: 'Nazwa', value: data.name },
        { key: 'bus_id', label: 'Identyfikator węzła', value: data.bus_id },
        { key: 'type', label: 'Typ', value: 'Szyna' },
      ],
    },
    {
      id: 'key_values',
      label: 'Kluczowe wartości',
      fields: [
        { key: 'u_kv', label: 'Napięcie', value: data.u_kv, unit: 'kV', source: 'calculated' },
        { key: 'u_pu', label: 'Napięcie (p.u.)', value: data.u_pu, unit: 'pu', source: 'calculated' },
        { key: 'angle_deg', label: 'Kąt fazowy', value: data.angle_deg, unit: '°', source: 'calculated' },
      ],
    },
  ];
}

function buildBranchOverviewSections(data: BranchResultData): InspectorSection[] {
  return [
    {
      id: 'identification',
      label: INSPECTOR_SECTION_LABELS.identification,
      fields: [
        { key: 'name', label: 'Nazwa', value: data.name },
        { key: 'branch_id', label: 'Identyfikator gałęzi', value: data.branch_id },
        { key: 'type', label: 'Typ', value: 'Gałąź' },
      ],
    },
    {
      id: 'key_values',
      label: 'Kluczowe wartości',
      fields: [
        { key: 'i_a', label: 'Prąd', value: data.i_a, unit: 'A', source: 'calculated' },
        { key: 'loading_pct', label: 'Obciążenie', value: data.loading_pct, unit: '%', source: 'calculated' },
        { key: 's_mva', label: 'Moc pozorna', value: data.s_mva, unit: 'MVA', source: 'calculated' },
      ],
    },
  ];
}

function buildShortCircuitOverviewSections(data: ShortCircuitResultData): InspectorSection[] {
  return [
    {
      id: 'identification',
      label: INSPECTOR_SECTION_LABELS.identification,
      fields: [
        { key: 'target_name', label: 'Węzeł zwarcia', value: data.target_name ?? data.target_id },
        { key: 'target_id', label: 'Identyfikator węzła', value: data.target_id },
        { key: 'fault_type', label: 'Rodzaj zwarcia', value: data.fault_type ?? '—' },
      ],
    },
    {
      id: 'key_values',
      label: 'Kluczowe wartości',
      fields: [
        { key: 'ikss_ka', label: "Ik''", value: data.ikss_ka, unit: 'kA', source: 'calculated', highlight: 'primary' },
        { key: 'ip_ka', label: 'ip', value: data.ip_ka, unit: 'kA', source: 'calculated' },
        { key: 'sk_mva', label: "Sk''", value: data.sk_mva, unit: 'MVA', source: 'calculated' },
      ],
    },
  ];
}

function buildBusParametersSections(data: BusResultData): InspectorSection[] {
  return [
    {
      id: 'electrical',
      label: INSPECTOR_SECTION_LABELS.electrical,
      fields: [
        { key: 'un_kv', label: 'Napięcie znamionowe', value: data.un_kv, unit: 'kV' },
        { key: 'v_min', label: 'Limit dolny napięcia', value: '0.90 pu' },
        { key: 'v_max', label: 'Limit górny napięcia', value: '1.10 pu' },
      ],
    },
  ];
}

function buildBranchParametersSections(data: BranchResultData): InspectorSection[] {
  return [
    {
      id: 'topology',
      label: INSPECTOR_SECTION_LABELS.topology,
      fields: [
        { key: 'from_bus', label: 'Od węzła', value: data.from_bus },
        { key: 'to_bus', label: 'Do węzła', value: data.to_bus },
      ],
    },
  ];
}

function buildShortCircuitParametersSections(data: ShortCircuitResultData): InspectorSection[] {
  return [
    {
      id: 'fault_config',
      label: 'Konfiguracja zwarcia',
      fields: [
        { key: 'fault_type', label: 'Rodzaj zwarcia', value: data.fault_type ?? '—' },
        { key: 'standard', label: 'Norma', value: 'IEC 60909' },
      ],
    },
  ];
}

function buildBusResultsSections(data: BusResultData): InspectorSection[] {
  return [
    {
      id: 'results',
      label: INSPECTOR_SECTION_LABELS.results,
      fields: [
        { key: 'u_kv', label: 'Napięcie', value: data.u_kv, unit: 'kV', source: 'calculated' },
        { key: 'u_pu', label: 'Napięcie (p.u.)', value: data.u_pu, unit: 'pu', source: 'calculated' },
        { key: 'angle_deg', label: 'Kąt fazowy', value: data.angle_deg, unit: '°', source: 'calculated' },
      ],
    },
    {
      id: 'flags',
      label: INSPECTOR_SECTION_LABELS.flags,
      fields: [{ key: 'flags', label: 'Flagi', value: formatFlags(data.flags) }],
    },
  ];
}

function buildBranchResultsSections(data: BranchResultData): InspectorSection[] {
  return [
    {
      id: 'power_flow',
      label: INSPECTOR_SECTION_LABELS.power_flow,
      fields: [
        { key: 'i_a', label: 'Prąd', value: data.i_a, unit: 'A', source: 'calculated' },
        { key: 'p_mw', label: 'Moc czynna', value: data.p_mw, unit: 'MW', source: 'calculated' },
        { key: 'q_mvar', label: 'Moc bierna', value: data.q_mvar, unit: 'Mvar', source: 'calculated' },
        { key: 's_mva', label: 'Moc pozorna', value: data.s_mva, unit: 'MVA', source: 'calculated' },
        { key: 'loading_pct', label: 'Obciążenie', value: data.loading_pct, unit: '%', source: 'calculated' },
      ],
    },
    {
      id: 'flags',
      label: INSPECTOR_SECTION_LABELS.flags,
      fields: [{ key: 'flags', label: 'Flagi', value: formatFlags(data.flags) }],
    },
  ];
}

function buildShortCircuitResultsSections(data: ShortCircuitResultData): InspectorSection[] {
  return [
    {
      id: 'short_circuit',
      label: INSPECTOR_SECTION_LABELS.short_circuit,
      fields: [
        { key: 'ikss_ka', label: "Ik''", value: data.ikss_ka, unit: 'kA', source: 'calculated', highlight: 'primary' },
        { key: 'ip_ka', label: 'ip', value: data.ip_ka, unit: 'kA', source: 'calculated' },
        { key: 'ith_ka', label: 'Ith', value: data.ith_ka, unit: 'kA', source: 'calculated' },
        { key: 'sk_mva', label: "Sk''", value: data.sk_mva, unit: 'MVA', source: 'calculated' },
      ],
    },
  ];
}

function buildBusLimitsSections(data: BusResultData): InspectorSection[] {
  const uPu = data.u_pu ?? 0;
  const status = uPu >= 0.95 && uPu <= 1.05 ? 'OK' : uPu >= 0.9 && uPu <= 1.1 ? 'WARNING' : 'VIOLATION';

  return [
    {
      id: 'voltage_limits',
      label: 'Limity napięciowe',
      fields: [
        { key: 'v_limit_check', label: 'Napięcie [p.u.]', value: formatNumber(uPu, 4), highlight: status === 'VIOLATION' ? 'error' : status === 'WARNING' ? 'warning' : undefined },
        { key: 'v_min', label: 'Limit dolny', value: '0.90 pu' },
        { key: 'v_max', label: 'Limit górny', value: '1.10 pu' },
        { key: 'v_status', label: 'Status', value: formatLimitStatus(status) },
      ],
    },
  ];
}

function buildBranchLimitsSections(data: BranchResultData): InspectorSection[] {
  const loading = data.loading_pct ?? 0;
  const status = loading <= 80 ? 'OK' : loading <= 100 ? 'WARNING' : 'VIOLATION';

  return [
    {
      id: 'thermal_limits',
      label: 'Limity termiczne',
      fields: [
        { key: 'loading_check', label: 'Obciążenie [%]', value: formatNumber(loading, 1), highlight: status === 'VIOLATION' ? 'error' : status === 'WARNING' ? 'warning' : undefined },
        { key: 'i_max', label: 'Limit termiczny', value: '100% (prąd znamionowy)' },
        { key: 'loading_status', label: 'Status', value: formatLimitStatus(status) },
      ],
    },
  ];
}

function EmptyTabState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4" data-testid="inspector-empty-tab">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-sm text-slate-600">{description}</div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function ContributionsTabContent() {
  return (
    <EmptyTabState
      title="Niedostępne w tym widoku"
      description="Szczegółowe wkłady nie są dostępne w tym widoku."
    />
  );
}

function LimitsNoDataContent() {
  return (
    <EmptyTabState
      title="Brak danych"
      description="Brak danych limitowych dla tego elementu w aktualnym widoku wyników."
    />
  );
}

function ProofTabContent() {
  const activeRunId = useExecutionRunsStore((state) => state.activeRunId);

  const handleOpenProof = useCallback(() => {
    if (!activeRunId) {
      return;
    }
    navigateToProof({ runId: activeRunId });
  }, [activeRunId]);

  return (
    <EmptyTabState
      title={activeRunId ? 'Otwórz wywód obliczeń' : 'Niedostępny w tym widoku'}
      description="Wywód obliczeń jest dostępny w dedykowanej zakładce „Wywód”."
      action={(
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Aby przejść dalej, załaduj pakietu wywodu dla aktywnego uruchomienia.
          </p>
          <button
            type="button"
            data-testid="open-proof-trace-proof"
            onClick={handleOpenProof}
            disabled={!activeRunId}
            className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
          >
            Otwórz wywód obliczeń
          </button>
          {!activeRunId ? (
            <div
              className="text-xs text-slate-500"
              data-testid="open-proof-trace-blocked-proof"
            >
              Brak aktywnego uruchomienia.
            </div>
          ) : null}
        </div>
      )}
    />
  );
}

function TabContent({
  tab,
  selectedRow,
}: {
  tab: InspectorTab;
  selectedRow: InspectorResultRow | null;
}) {
  const sections = useMemo<InspectorSection[]>(() => {
    if (!selectedRow) return [];

    switch (tab) {
      case 'overview':
        switch (selectedRow.type) {
          case 'bus':
            return buildBusOverviewSections(selectedRow.data);
          case 'branch':
            return buildBranchOverviewSections(selectedRow.data);
          case 'short_circuit':
            return buildShortCircuitOverviewSections(selectedRow.data);
        }
        return [];
      case 'parameters':
        switch (selectedRow.type) {
          case 'bus':
            return buildBusParametersSections(selectedRow.data);
          case 'branch':
            return buildBranchParametersSections(selectedRow.data);
          case 'short_circuit':
            return buildShortCircuitParametersSections(selectedRow.data);
        }
        return [];
      case 'results':
        switch (selectedRow.type) {
          case 'bus':
            return buildBusResultsSections(selectedRow.data);
          case 'branch':
            return buildBranchResultsSections(selectedRow.data);
          case 'short_circuit':
            return buildShortCircuitResultsSections(selectedRow.data);
        }
        return [];
      case 'limits':
        switch (selectedRow.type) {
          case 'bus':
            return buildBusLimitsSections(selectedRow.data);
          case 'branch':
            return buildBranchLimitsSections(selectedRow.data);
          case 'short_circuit':
            return [];
        }
        return [];
      case 'contributions':
      case 'proof':
        return [];
    }
  }, [selectedRow, tab]);

  if (tab === 'contributions') {
    return <ContributionsTabContent />;
  }

  if (tab === 'proof') {
    return <ProofTabContent />;
  }

  if (tab === 'limits' && selectedRow?.type === 'short_circuit') {
    return <LimitsNoDataContent />;
  }

  if (sections.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-500">
        Brak danych dla tej zakładki.
      </div>
    );
  }

  return <PropertyGrid sections={sections} />;
}

export function InspectorPanel({
  selectedRow,
  onClose,
  className = '',
}: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('overview');

  const availableTabs = useMemo<InspectorTab[]>(() => {
    if (!selectedRow) return AVAILABLE_TABS.default;
    return AVAILABLE_TABS[selectedRow.type] ?? AVAILABLE_TABS.default;
  }, [selectedRow]);

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] ?? 'overview');
    }
  }, [activeTab, availableTabs]);

  const title = useMemo(() => {
    if (!selectedRow) return 'Właściwości';

    switch (selectedRow.type) {
      case 'bus':
        return `Szyna: ${selectedRow.data.name}`;
      case 'branch':
        return `Gałąź: ${selectedRow.data.name}`;
      case 'short_circuit':
        return `Zwarcie: ${selectedRow.data.target_name ?? selectedRow.data.target_id}`;
    }
  }, [selectedRow]);

  const selectionId = useMemo(() => {
    if (!selectedRow) return null;

    switch (selectedRow.type) {
      case 'bus':
        return selectedRow.data.bus_id;
      case 'branch':
        return selectedRow.data.branch_id;
      case 'short_circuit':
        return selectedRow.data.target_id;
    }
  }, [selectedRow]);

  if (!selectedRow) {
    return (
      <div
        className={`rounded border border-slate-200 bg-white p-4 ${className}`}
        data-testid="inspector-panel-empty"
      >
        <p className="text-sm text-slate-500">
          Wybierz element w tabeli, aby zobaczyć szczegóły.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded border border-slate-200 bg-white ${className}`}
      data-selection-id={selectionId}
      data-testid="inspector-panel"
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Inspektor elementu
          </p>
          <h3 className="text-sm font-semibold text-slate-800" data-testid="inspector-title">
            {title}
          </h3>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Zamknij panel właściwości"
            data-testid="inspector-close-button"
          >
            ×
          </button>
        ) : null}
      </div>

      <div className="border-b border-slate-200 px-2 pt-2" data-testid="inspector-tabs">
        <div className="flex flex-wrap gap-1">
          {(['overview', 'parameters', 'results', 'contributions', 'limits', 'proof'] as InspectorTab[]).map((tab) => {
            const isAvailable = availableTabs.includes(tab);
            const isActive = activeTab === tab;

            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  if (isAvailable) {
                    setActiveTab(tab);
                  }
                }}
                disabled={!isAvailable}
                className={`px-2 py-1.5 text-xs font-medium rounded-t transition-colors ${
                  isActive
                    ? 'bg-white text-blue-600 border-t border-l border-r border-slate-200 -mb-px'
                    : isAvailable
                      ? 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                      : 'text-slate-300 cursor-not-allowed'
                }`}
                title={!isAvailable ? 'Niedostępne dla tego typu elementu' : undefined}
                data-testid={`tab-${tab}`}
              >
                {TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-b border-slate-100 bg-green-50 px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-green-700">
          <span>Tryb wyników — tylko do odczytu</span>
        </div>
      </div>

      <div className="p-0" data-testid="inspector-content">
        <TabContent tab={activeTab} selectedRow={selectedRow} />
      </div>
    </div>
  );
}

export function InspectorPanelConnected({
  resultData,
  onClose,
  className = '',
}: InspectorPanelConnectedProps) {
  const selectElement = useSelectionStore((state) => state.selectElement);

  const handleClose = useCallback(() => {
    selectElement(null);
    onClose?.();
  }, [onClose, selectElement]);

  return (
    <InspectorPanel
      selectedRow={resultData}
      onClose={handleClose}
      className={className}
    />
  );
}

export default InspectorPanel;
