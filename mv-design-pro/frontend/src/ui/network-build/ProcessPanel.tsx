/**
 * ProcessPanel — Lewy panel procesowy budowy sieci SN.
 *
 * Zastępuje ProjectTree w trybie MODEL_EDIT.
 * 8 sekcji odpowiadających etapom procesu inżynierskiego:
 * 1. Źródło zasilania (GPZ)
 * 2. Magistrale
 * 3. Stacje
 * 4. Odgałęzienia
 * 5. Sekcjonowanie i ringi
 * 6. Transformatory i nN
 * 7. Źródła OZE / BESS
 * 8. Gotowość do analizy
 *
 * DETERMINIZM: Ten sam snapshot → ten sam widok panelu.
 * BINDING: 100% PL etykiety.
 */

import { useCallback } from 'react';
import { clsx } from 'clsx';
import {
  useNetworkBuildStore,
  useNetworkBuildDerived,
} from './networkBuildStore';
import { useSelectionStore } from '../selection';
import type {
  StationSummary,
  TransformerSummary,
  OzeSourceSummary,
  AvailableBranchPort,
  RingCandidate,
} from './networkBuildStore';
import type { TerminalRef, TrunkViewV1, BranchViewV1 } from '../../types/enm';

// =============================================================================
// Icons (inline SVG)
// =============================================================================

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={clsx('w-3.5 h-3.5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg className={clsx('w-3.5 h-3.5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

// =============================================================================
// Status Indicator
// =============================================================================

type StatusLevel = 'done' | 'partial' | 'empty' | 'error';

function StatusDot({ level }: { level: StatusLevel }) {
  const colors: Record<StatusLevel, string> = {
    done: 'bg-eng-green',
    partial: 'bg-eng-amber',
    empty: 'bg-chrome-300',
    error: 'bg-eng-red',
  };
  return (
    <span
      className={clsx('inline-block w-2.5 h-2.5 rounded-full flex-shrink-0', colors[level])}
      aria-hidden="true"
    />
  );
}

// =============================================================================
// Section Header
// =============================================================================

interface SectionHeaderProps {
  id: string;
  label: string;
  status: StatusLevel;
  badge?: string;
  collapsed: boolean;
  onToggle: () => void;
}

function SectionHeader({ id, label, status, badge, collapsed, onToggle }: SectionHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-chrome-50 transition-colors border-b border-chrome-100"
      data-testid={`process-section-${id}`}
      data-collapsed={collapsed}
    >
      {collapsed ? <IconChevronRight className="text-chrome-400" /> : <IconChevronDown className="text-chrome-400" />}
      <StatusDot level={status} />
      <span className="flex-1 text-xs font-semibold text-chrome-700 uppercase tracking-wider">{label}</span>
      {badge && (
        <span className="text-[10px] text-chrome-500 bg-chrome-100 px-1.5 py-0.5 rounded-full">{badge}</span>
      )}
    </button>
  );
}

// =============================================================================
// Action Button (wewnątrz sekcji)
// =============================================================================

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  testId?: string;
  disabled?: boolean;
}

function ActionButton({ label, onClick, variant = 'secondary', testId, disabled }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'w-full text-left px-3 py-1.5 text-[11px] rounded-ind transition-colors',
        variant === 'primary'
          ? 'bg-ind-600 text-white hover:bg-ind-700 disabled:bg-chrome-300'
          : 'text-ind-700 hover:bg-ind-50 disabled:text-chrome-400 disabled:hover:bg-transparent',
      )}
      data-testid={testId}
    >
      {label}
    </button>
  );
}

// =============================================================================
// Section 1: Źródło zasilania
// =============================================================================

function SourceSection({ sourceCount }: { sourceCount: number }) {
  const openForm = useNetworkBuildStore((s) => s.openOperationForm);

  const handleAddSource = useCallback(() => {
    openForm('add_grid_source_sn');
  }, [openForm]);

  if (sourceCount === 0) {
    return (
      <div className="px-3 py-2">
        <p className="text-[11px] text-chrome-500 mb-2">Brak zdefiniowanego źródła zasilania.</p>
        <ActionButton
          label="+ Dodaj źródło GPZ"
          onClick={handleAddSource}
          variant="primary"
          testId="btn-add-gpz"
        />
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 text-[11px] text-chrome-700">
        <StatusDot level="done" />
        <span>Źródło zdefiniowane ({sourceCount})</span>
      </div>
      <ActionButton
        label="Edytuj źródło"
        onClick={handleAddSource}
        testId="btn-edit-source"
      />
    </div>
  );
}

// =============================================================================
// Section 2: Magistrale
// =============================================================================

function TrunksSection({
  trunks,
  openTerminals,
}: {
  trunks: TrunkViewV1[];
  openTerminals: TerminalRef[];
}) {
  const openForm = useNetworkBuildStore((s) => s.openOperationForm);
  const defaultSegmentRef = trunks[0]?.segments[trunks[0].segments.length - 1] ?? '';

  const handleContinueTrunk = useCallback(
    (terminal: TerminalRef) => {
      openForm('continue_trunk_segment_sn', {
        fromTerminalId: terminal.element_id,
        trunkId: terminal.trunk_id,
        portId: terminal.port_id,
        terminalLabel: terminal.element_id,
      });
    },
    [openForm],
  );

  const handleInsertStation = useCallback(
    (segmentRef: string) => {
      openForm('insert_station_on_segment_sn', {
        segmentRef,
        segmentLabel: segmentRef,
        insertRatio: 0.5,
      });
    },
    [openForm],
  );

  const handleInsertBranchPole = useCallback((segmentRef: string) => {
    openForm('insert_branch_pole_on_segment_sn', {
      segment_ref: segmentRef,
      segment_id: segmentRef,
    });
  }, [openForm]);

  const handleInsertZksn = useCallback((segmentRef: string) => {
    openForm('insert_zksn_on_segment_sn', {
      segment_ref: segmentRef,
      segment_id: segmentRef,
    });
  }, [openForm]);

  return (
    <div className="px-3 py-2 space-y-2">
      {trunks.length === 0 ? (
        <p className="text-[11px] text-chrome-500">Brak magistral. Dodaj pierwszy segment po zdefiniowaniu źródła.</p>
      ) : (
        <div className="space-y-1">
          {trunks.map((trunk, i) => (
            <div
              key={trunk.corridor_ref}
              className="flex items-center gap-2 text-[11px] text-chrome-700 py-1 px-2 rounded hover:bg-chrome-50"
            >
              <span className="font-medium">M{i + 1}</span>
              <span className="text-chrome-500">{trunk.segments.length} segm.</span>
              {trunk.no_point_ref && (
                <span className="text-eng-amber text-[10px]">NOP</span>
              )}
              <button
                type="button"
                onClick={() => handleInsertStation(trunk.segments[trunk.segments.length - 1] ?? trunk.corridor_ref)}
                className="ml-auto text-[10px] text-ind-600 hover:text-ind-800"
              >
                [Wstaw stację]
              </button>
            </div>
          ))}
        </div>
      )}

      {openTerminals.length > 0 && (
        <div className="border-t border-chrome-100 pt-2 space-y-1">
          <p className="text-[10px] text-chrome-500 font-medium uppercase">Otwarte końce</p>
          {openTerminals.map((t) => (
            <button
              key={`${t.element_id}-${t.port_id}`}
              type="button"
              onClick={() => handleContinueTrunk(t)}
              className="w-full text-left text-[11px] text-ind-700 hover:bg-ind-50 px-2 py-1 rounded"
              data-testid={`btn-continue-${t.element_id}`}
            >
              Kontynuuj z {t.element_id}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-chrome-100 pt-2 space-y-1">
        <p className="text-[10px] text-chrome-500 font-medium uppercase">Wstaw obiekt w odcinek SN</p>
        <ActionButton
          label="+ Wstaw stację"
          onClick={() => handleInsertStation(defaultSegmentRef)}
          testId="btn-insert-object-station"
          disabled={!defaultSegmentRef}
        />
        <ActionButton
          label="+ Wstaw słup rozgałęźny"
          onClick={() => handleInsertBranchPole(defaultSegmentRef)}
          testId="btn-insert-object-branch-pole"
          disabled={!defaultSegmentRef}
        />
        <ActionButton
          label="+ Wstaw ZKSN"
          onClick={() => handleInsertZksn(defaultSegmentRef)}
          testId="btn-insert-object-zksn"
          disabled={!defaultSegmentRef}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Section 3: Stacje
// =============================================================================

function StationsSection({
  stations,
  availableBranchPorts,
  defaultSegmentRef,
}: {
  stations: StationSummary[];
  availableBranchPorts: AvailableBranchPort[];
  defaultSegmentRef: string | null;
}) {
  const openForm = useNetworkBuildStore((s) => s.openOperationForm);

  const handleInsertStation = useCallback(() => {
    if (!defaultSegmentRef) {
      return;
    }

    openForm('insert_station_on_segment_sn', {
      segmentRef: defaultSegmentRef,
      segmentLabel: defaultSegmentRef,
      insertRatio: 0.5,
    });
  }, [defaultSegmentRef, openForm]);

  const handleStartBranch = useCallback(
    (stationId: string) => {
      const availablePort = availableBranchPorts.find((port) => port.stationId === stationId);
      if (!availablePort) {
        return;
      }

      openForm('start_branch_segment_sn', {
        fromRef: `${availablePort.stationId}.BRANCH`,
        from_bus_ref: availablePort.busRef,
        sourceLabel: `${availablePort.stationName} / pole ${availablePort.bayRole}`,
        stationId,
      });
    },
    [availableBranchPorts, openForm],
  );

  return (
    <div className="px-3 py-2 space-y-2">
      {stations.length === 0 ? (
        <p className="text-[11px] text-chrome-500">Brak stacji. Wstaw stację w segment magistrali.</p>
      ) : (
        <div className="space-y-1">
          {stations.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 text-[11px] text-chrome-700 py-1 px-2 rounded hover:bg-chrome-50"
            >
              <span className={clsx(
                'text-[10px] font-bold px-1 rounded',
                s.readinessOk ? 'bg-eng-green/20 text-eng-green' : 'bg-eng-amber/20 text-eng-amber',
              )}>
                {s.stationType.toUpperCase()}
              </span>
              <span className="flex-1 truncate">{s.name}</span>
              {s.hasTransformer && <span className="text-[10px] text-chrome-400">TR</span>}
              {s.freeBranchPorts > 0 && (
                <button
                  type="button"
                  onClick={() => handleStartBranch(s.id)}
                  className="text-[10px] text-ind-600 hover:text-ind-800"
                >
                  [Odg.]
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <ActionButton
        label="+ Wstaw stację w segment"
        onClick={handleInsertStation}
        testId="btn-insert-station"
        disabled={!defaultSegmentRef}
      />
    </div>
  );
}

// =============================================================================
// Section 4: Odgałęzienia
// =============================================================================

function BranchesSection({
  branches,
  availableBranchPorts,
}: {
  branches: BranchViewV1[];
  availableBranchPorts: AvailableBranchPort[];
}) {
  const openForm = useNetworkBuildStore((s) => s.openOperationForm);

  const handleStartBranch = useCallback(() => {
    const fallbackPort = availableBranchPorts[0];
    if (!fallbackPort) {
      return;
    }

    openForm('start_branch_segment_sn', {
      fromRef: `${fallbackPort.stationId}.BRANCH`,
      from_bus_ref: fallbackPort.busRef,
      sourceLabel: `${fallbackPort.stationName} / pole ${fallbackPort.bayRole}`,
      stationId: fallbackPort.stationId,
    });
  }, [availableBranchPorts, openForm]);

  return (
    <div className="px-3 py-2 space-y-2">
      {branches.length === 0 ? (
        <p className="text-[11px] text-chrome-500">Brak odgałęzień.</p>
      ) : (
        <div className="space-y-1">
          {branches.map((b, i) => (
            <div
              key={b.from_element_id + '-' + i}
              className="flex items-center gap-2 text-[11px] text-chrome-700 py-1 px-2 rounded hover:bg-chrome-50"
            >
              <span className="font-medium">O{i + 1}</span>
              <span className="text-chrome-500">z {b.from_element_id}</span>
              <span className="text-chrome-400">{b.segments.length} segm.</span>
            </div>
          ))}
        </div>
      )}

      <ActionButton
        label="+ Rozpocznij odgałęzienie"
        onClick={handleStartBranch}
        testId="btn-start-branch"
        disabled={availableBranchPorts.length === 0}
      />
    </div>
  );
}

// =============================================================================
// Section 5: Sekcjonowanie i ringi
// =============================================================================

function SectioningSection({
  ringCandidates,
  defaultSegmentRef,
  selectedSwitchRef,
  selectedSwitchName,
}: {
  ringCandidates: RingCandidate[];
  defaultSegmentRef: string | null;
  selectedSwitchRef: string | null;
  selectedSwitchName: string | null;
}) {
  const openForm = useNetworkBuildStore((s) => s.openOperationForm);
  const firstRingCandidate = ringCandidates[0] ?? null;

  const handleInsertSwitch = useCallback(() => {
    if (!defaultSegmentRef) {
      return;
    }

    openForm('insert_section_switch_sn', {
      segmentRef: defaultSegmentRef,
      segment_ref: defaultSegmentRef,
      segmentLabel: defaultSegmentRef,
    });
  }, [defaultSegmentRef, openForm]);

  const handleConnectRing = useCallback(() => {
    if (!firstRingCandidate) {
      return;
    }

    openForm('connect_secondary_ring_sn', {
      terminalA_id: firstRingCandidate.terminalA.element_id,
      terminalAId: firstRingCandidate.terminalA.element_id,
      terminalA_label: firstRingCandidate.terminalA.element_id,
      terminalB_id: firstRingCandidate.terminalB.element_id,
      terminalBId: firstRingCandidate.terminalB.element_id,
      terminalB_label: firstRingCandidate.terminalB.element_id,
    });
  }, [firstRingCandidate, openForm]);

  const handleSetNop = useCallback(() => {
    if (!selectedSwitchRef) {
      return;
    }

    openForm('set_normal_open_point', {
      switch_ref: selectedSwitchRef,
      switch_label: selectedSwitchName ?? selectedSwitchRef,
      ring_label: 'Aktywny pierscien SN',
    });
  }, [openForm, selectedSwitchName, selectedSwitchRef]);

  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
        W tym etapie produkcyjnym aktywne jest sekcjonowanie. Ring i NOP pozostają wygaszone
        do osobnego domknięcia architektonicznego.
      </div>
      <ActionButton
        label="+ Wstaw łącznik sekcyjny"
        onClick={handleInsertSwitch}
        testId="btn-insert-switch"
        disabled={!defaultSegmentRef}
      />
      <ActionButton
        label={`+ Domknij pierścień${ringCandidates.length > 0 ? ` (${ringCandidates.length} kandydatow)` : ''}`}
        onClick={handleConnectRing}
        testId="btn-connect-ring"
        disabled={true}
      />
      <ActionButton
        label="Ustaw punkt normalnie otwarty (NOP)"
        onClick={handleSetNop}
        testId="btn-set-nop"
        disabled={true}
      />
    </div>
  );
}

// =============================================================================
// Section 6: Transformatory i nN
// =============================================================================

function TransformersSection({ transformers }: { transformers: TransformerSummary[] }) {
  const openForm = useNetworkBuildStore((s) => s.openOperationForm);

  const handleAddTransformer = useCallback(() => {
    openForm('add_transformer_sn_nn');
  }, [openForm]);

  return (
    <div className="px-3 py-2 space-y-2">
      {transformers.length === 0 ? (
        <p className="text-[11px] text-chrome-500">Brak transformatorów SN/nN.</p>
      ) : (
        <div className="space-y-1">
          {transformers.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 text-[11px] text-chrome-700 py-1 px-2 rounded hover:bg-chrome-50"
            >
              <span className="truncate flex-1">{t.name}</span>
              <span className="text-chrome-400">{t.snKva} kVA</span>
              {t.catalogRef ? (
                <span className="text-[10px] text-eng-green">KAT</span>
              ) : (
                <span className="text-[10px] text-eng-amber">RĘCZ</span>
              )}
            </div>
          ))}
        </div>
      )}

      <ActionButton
        label="+ Dodaj transformator"
        onClick={handleAddTransformer}
        testId="btn-add-transformer"
      />
    </div>
  );
}

// =============================================================================
// Section 7: Źródła OZE / BESS
// =============================================================================

function OzeSection({ sources }: { sources: OzeSourceSummary[] }) {
  const openForm = useNetworkBuildStore((s) => s.openOperationForm);

  const handleAddPV = useCallback(() => {
    openForm('add_pv_inverter_nn');
  }, [openForm]);

  const handleAddBESS = useCallback(() => {
    openForm('add_bess_inverter_nn');
  }, [openForm]);

  return (
    <div className="px-3 py-2 space-y-2">
      {sources.length === 0 ? (
        <p className="text-[11px] text-chrome-500">Brak źródeł OZE/BESS.</p>
      ) : (
        <div className="space-y-1">
          {sources.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 text-[11px] text-chrome-700 py-1 px-2 rounded hover:bg-chrome-50"
            >
              <span className={clsx(
                'text-[10px] font-bold px-1 rounded',
                s.hasTransformer ? 'bg-eng-green/20 text-eng-green' : 'bg-eng-red/20 text-eng-red',
              )}>
                {s.genType === 'pv_inverter' ? 'PV' : s.genType === 'bess' ? 'BESS' : 'GEN'}
              </span>
              <span className="truncate flex-1">{s.name}</span>
              <span className="text-chrome-400">{(s.pMw * 1000).toFixed(0)} kW</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <ActionButton label="+ PV" onClick={handleAddPV} testId="btn-add-pv" />
        <ActionButton label="+ BESS" onClick={handleAddBESS} testId="btn-add-bess" />
      </div>
    </div>
  );
}

// =============================================================================
// Section 8: Gotowość do analizy
// =============================================================================

function ReadinessSection({
  isReady,
  blockersByCategory,
}: {
  isReady: boolean;
  blockersByCategory: { topologia: number; katalogi: number; eksploatacja: number; analiza: number; total: number };
}) {
  return (
    <div className="px-3 py-2 space-y-2">
      <div className="flex items-center gap-2">
        <StatusDot level={isReady ? 'done' : blockersByCategory.total > 0 ? 'error' : 'partial'} />
        <span className={clsx(
          'text-xs font-semibold',
          isReady ? 'text-eng-green' : 'text-chrome-700',
        )}>
          {isReady ? 'Gotowy do analizy' : `${blockersByCategory.total} blokad`}
        </span>
      </div>

      {!isReady && blockersByCategory.total > 0 && (
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          {blockersByCategory.topologia > 0 && (
            <span className="text-eng-red">Topologia: {blockersByCategory.topologia}</span>
          )}
          {blockersByCategory.katalogi > 0 && (
            <span className="text-eng-red">Katalogi: {blockersByCategory.katalogi}</span>
          )}
          {blockersByCategory.eksploatacja > 0 && (
            <span className="text-eng-red">Eksploatacja: {blockersByCategory.eksploatacja}</span>
          )}
          {blockersByCategory.analiza > 0 && (
            <span className="text-eng-red">Analiza: {blockersByCategory.analiza}</span>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ProcessPanel (Main Component)
// =============================================================================

export interface ProcessPanelProps {
  className?: string;
}

export function ProcessPanel({ className }: ProcessPanelProps) {
  const collapsedSections = useNetworkBuildStore((s) => s.collapsedSections);
  const toggleSection = useNetworkBuildStore((s) => s.toggleSection);
  const selectedElement = useSelectionStore((s) => s.selectedElements[0] ?? null);

  const {
    buildPhaseLabel: phaseLabel,
    logicalViews,
    openTerminals,
    ringCandidates,
    availableBranchPorts,
    stationSummaries,
    transformerSummaries,
    ozeSourceSummaries,
    blockersByCategory,
    sourceCount,
    trunkCount,
    branchCount,
    stationCount,
    transformerCount,
    generatorCount,
    isReady,
  } = useNetworkBuildDerived();

  const trunks = logicalViews?.trunks ?? [];
  const branches = logicalViews?.branches ?? [];
  const defaultSegmentRef = trunks[0]?.segments[trunks[0].segments.length - 1] ?? null;

  const isSectionCollapsed = useCallback(
    (id: string) => collapsedSections.has(id),
    [collapsedSections],
  );

  const sourceStatus: StatusLevel = sourceCount > 0 ? 'done' : 'empty';
  const trunkStatus: StatusLevel = trunkCount > 0 ? 'done' : sourceCount > 0 ? 'partial' : 'empty';
  const stationStatus: StatusLevel = stationCount > 0 ? 'done' : trunkCount > 0 ? 'partial' : 'empty';
  const branchStatus: StatusLevel = branchCount > 0 ? 'done' : 'empty';
  const sectioningStatus: StatusLevel = 'empty'; // TODO: derive from snapshot switch/ring data
  const transformerStatus: StatusLevel = transformerCount > 0 ? 'done' : stationCount > 0 ? 'partial' : 'empty';
  const ozeStatus: StatusLevel = generatorCount > 0 ? 'done' : 'empty';
  const readinessStatus: StatusLevel = isReady ? 'done' : blockersByCategory.total > 0 ? 'error' : 'partial';
  const selectedSwitchRef = selectedElement?.type === 'Switch' ? selectedElement.id : null;
  const selectedSwitchName = selectedElement?.type === 'Switch' ? selectedElement.name : null;

  return (
    <div
      className={clsx('flex flex-col h-full overflow-hidden', className)}
      data-testid="process-panel"
    >
      {/* Phase banner */}
      <div className="px-3 py-2 bg-ind-50 border-b border-ind-200">
        <p className="text-[11px] font-semibold text-ind-800">{phaseLabel}</p>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {/* 1. Źródło zasilania */}
        <SectionHeader
          id="source"
          label="Źródło zasilania"
          status={sourceStatus}
          badge={sourceCount > 0 ? `${sourceCount}` : undefined}
          collapsed={isSectionCollapsed('source')}
          onToggle={() => toggleSection('source')}
        />
        {!isSectionCollapsed('source') && <SourceSection sourceCount={sourceCount} />}

        {/* 2. Magistrale */}
        <SectionHeader
          id="trunks"
          label="Magistrale"
          status={trunkStatus}
          badge={trunkCount > 0 ? `${trunkCount}` : undefined}
          collapsed={isSectionCollapsed('trunks')}
          onToggle={() => toggleSection('trunks')}
        />
        {!isSectionCollapsed('trunks') && (
          <TrunksSection trunks={trunks} openTerminals={openTerminals} />
        )}

        {/* 3. Stacje */}
        <SectionHeader
          id="stations"
          label="Stacje"
          status={stationStatus}
          badge={stationCount > 0 ? `${stationCount}` : undefined}
          collapsed={isSectionCollapsed('stations')}
          onToggle={() => toggleSection('stations')}
        />
        {!isSectionCollapsed('stations') && (
          <StationsSection
            stations={stationSummaries}
            availableBranchPorts={availableBranchPorts}
            defaultSegmentRef={defaultSegmentRef}
          />
        )}

        {/* 4. Odgałęzienia */}
        <SectionHeader
          id="branches"
          label="Odgałęzienia"
          status={branchStatus}
          badge={branchCount > 0 ? `${branchCount}` : undefined}
          collapsed={isSectionCollapsed('branches')}
          onToggle={() => toggleSection('branches')}
        />
        {!isSectionCollapsed('branches') && (
          <BranchesSection branches={branches} availableBranchPorts={availableBranchPorts} />
        )}

        {/* 5. Sekcjonowanie i ringi */}
        <SectionHeader
          id="sectioning"
          label="Sekcjonowanie i ringi"
          status={sectioningStatus}
          collapsed={isSectionCollapsed('sectioning')}
          onToggle={() => toggleSection('sectioning')}
        />
        {!isSectionCollapsed('sectioning') && (
          <SectioningSection
            ringCandidates={ringCandidates}
            defaultSegmentRef={defaultSegmentRef}
            selectedSwitchRef={selectedSwitchRef}
            selectedSwitchName={selectedSwitchName}
          />
        )}

        {/* 6. Transformatory i nN */}
        <SectionHeader
          id="transformers"
          label="Transformatory i nN"
          status={transformerStatus}
          badge={transformerCount > 0 ? `${transformerCount}` : undefined}
          collapsed={isSectionCollapsed('transformers')}
          onToggle={() => toggleSection('transformers')}
        />
        {!isSectionCollapsed('transformers') && (
          <TransformersSection transformers={transformerSummaries} />
        )}

        {/* 7. Źródła OZE / BESS */}
        <SectionHeader
          id="oze"
          label="Źródła OZE / BESS"
          status={ozeStatus}
          badge={generatorCount > 0 ? `${generatorCount}` : undefined}
          collapsed={isSectionCollapsed('oze')}
          onToggle={() => toggleSection('oze')}
        />
        {!isSectionCollapsed('oze') && <OzeSection sources={ozeSourceSummaries} />}

        {/* 8. Gotowość do analizy */}
        <SectionHeader
          id="readiness"
          label="Gotowość do analizy"
          status={readinessStatus}
          collapsed={isSectionCollapsed('readiness')}
          onToggle={() => toggleSection('readiness')}
        />
        {!isSectionCollapsed('readiness') && (
          <ReadinessSection isReady={isReady} blockersByCategory={blockersByCategory} />
        )}
      </div>
    </div>
  );
}

export default ProcessPanel;
