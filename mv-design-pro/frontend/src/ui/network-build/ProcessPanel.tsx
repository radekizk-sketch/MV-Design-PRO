import { useCallback } from 'react';
import { clsx } from 'clsx';

import {
  useNetworkBuildStore,
  useNetworkBuildDerived,
} from './networkBuildStore';
import type {
  OzeSourceSummary,
  StationSummary,
  TransformerSummary,
} from './networkBuildStore';
import type { BranchViewV1, TerminalRef, TrunkViewV1 } from '../../types/enm';
import { buildConverterSourceOperationContext } from '../shared/converterSourceContext';
import { formatGeneratorTypeShortLabelPl } from '../shared/generatorTypeLabels';
import { formatStationTypeShortLabelPl } from '../shared/stationTypeLabels';

type StatusLevel = 'done' | 'partial' | 'empty' | 'error';

function scopedTestId(testId: string, scope?: string): string {
  return scope ? `${scope}-${testId}` : testId;
}

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

function StatusDot({ level }: { level: StatusLevel }) {
  const colors: Record<StatusLevel, string> = {
    done: 'bg-eng-green',
    partial: 'bg-eng-amber',
    empty: 'bg-chrome-300',
    error: 'bg-eng-red',
  };

  return <span className={clsx('inline-block w-2.5 h-2.5 rounded-full flex-shrink-0', colors[level])} aria-hidden="true" />;
}

interface SectionHeaderProps {
  id: string;
  label: string;
  status: StatusLevel;
  badge?: string;
  collapsed: boolean;
  onToggle: () => void;
  testIdScope?: string;
}

function SectionHeader({ id, label, status, badge, collapsed, onToggle, testIdScope }: SectionHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-chrome-50 transition-colors border-b border-chrome-100"
      data-testid={scopedTestId(`process-section-${id}`, testIdScope)}
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

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  testId?: string;
  testIdScope?: string;
  disabled?: boolean;
}

function ActionButton({ label, onClick, variant = 'secondary', testId, testIdScope, disabled }: ActionButtonProps) {
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
      data-testid={testId ? scopedTestId(testId, testIdScope) : undefined}
    >
      {label}
    </button>
  );
}

function SourceSection({ sourceCount, testIdScope }: { sourceCount: number; testIdScope?: string }) {
  const openForm = useNetworkBuildStore((state) => state.openOperationForm);

  const handleAddSource = useCallback(() => {
    openForm('add_grid_source_sn');
  }, [openForm]);

  if (sourceCount === 0) {
    return (
      <div className="px-3 py-2">
        <p className="text-[11px] text-chrome-500 mb-2">
          Brak GPZ. Najpierw utworz GPZ z sekcjami i polami liniowymi, dopiero potem wyprowadz ciag glowny.
        </p>
        <ActionButton
          label="+ Dodaj GPZ"
          onClick={handleAddSource}
          variant="primary"
          testId="btn-add-gpz"
          testIdScope={testIdScope}
        />
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 text-[11px] text-chrome-700">
        <StatusDot level="done" />
        <span>GPZ zdefiniowany ({sourceCount})</span>
      </div>
      <ActionButton
        label="Edytuj GPZ i pola SN"
        onClick={handleAddSource}
        testId="btn-edit-source"
        testIdScope={testIdScope}
      />
    </div>
  );
}

function TrunksSection({
  trunks,
  openTerminals,
  testIdScope,
}: {
  trunks: TrunkViewV1[];
  openTerminals: TerminalRef[];
  testIdScope?: string;
}) {
  const openForm = useNetworkBuildStore((state) => state.openOperationForm);

  const handleContinueTrunk = useCallback(
    (terminal: TerminalRef) => {
      openForm('continue_trunk_segment_sn', {
        terminal_id: terminal.element_id,
        port_id: terminal.port_id,
        trunk_id: terminal.trunk_id,
      });
    },
    [openForm],
  );

  const handleInsertStation = useCallback(
    (trunkId: string) => {
      openForm('insert_station_on_segment_sn', { trunk_id: trunkId });
    },
    [openForm],
  );

  return (
    <div className="px-3 py-2 space-y-2">
      {trunks.length === 0 ? (
        <p className="text-[11px] text-chrome-500">
          Brak magistral. Po dodaniu GPZ utworz pole liniowe GPZ i dopiero z tego pola wyprowadz pierwszy odcinek.
        </p>
      ) : (
        <div className="space-y-1">
          {trunks.map((trunk, index) => (
            <div
              key={trunk.corridor_ref}
              className="flex items-center gap-2 text-[11px] text-chrome-700 py-1 px-2 rounded hover:bg-chrome-50"
            >
              <span className="font-medium">M{index + 1}</span>
              <span className="text-chrome-500">{trunk.segments.length} segm.</span>
              {trunk.no_point_ref && <span className="text-eng-amber text-[10px]">NOP</span>}
              <button
                type="button"
                onClick={() => handleInsertStation(trunk.corridor_ref)}
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
          {openTerminals.map((terminal) => (
            <button
              key={`${terminal.element_id}-${terminal.port_id}`}
              type="button"
              onClick={() => handleContinueTrunk(terminal)}
              className="w-full text-left text-[11px] text-ind-700 hover:bg-ind-50 px-2 py-1 rounded"
              data-testid={scopedTestId(`btn-continue-${terminal.element_id}`, testIdScope)}
            >
              Kontynuuj z {terminal.element_id}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-chrome-100 pt-2">
        <p className="text-[10px] text-chrome-500">
          ZKSN i slup rozgalezny wstawiaj z menu odcinka SN albo z karty magistrali, nigdy bez wskazania segmentu.
        </p>
      </div>
    </div>
  );
}

function StationsSection({ stations }: { stations: StationSummary[] }) {
  const openForm = useNetworkBuildStore((state) => state.openOperationForm);

  const handleStartBranch = useCallback(
    (stationId: string) => {
      openForm('start_branch_segment_sn', { from_station_id: stationId });
    },
    [openForm],
  );

  return (
    <div className="px-3 py-2 space-y-2">
      {stations.length === 0 ? (
        <p className="text-[11px] text-chrome-500">
          Brak stacji. Najpierw wyprowadz odcinek z pola GPZ, potem wstaw stacje w segment.
        </p>
      ) : (
        <div className="space-y-1">
          {stations.map((station) => (
            <div
              key={station.id}
              className="flex items-center gap-2 text-[11px] text-chrome-700 py-1 px-2 rounded hover:bg-chrome-50"
            >
              <span
                className={clsx(
                  'text-[10px] font-bold px-1 rounded',
                  station.readinessOk ? 'bg-eng-green/20 text-eng-green' : 'bg-eng-amber/20 text-eng-amber',
                )}
              >
                {formatStationTypeShortLabelPl(station.stationType)}
              </span>
              <span className="flex-1 truncate">{station.name}</span>
              {station.hasTransformer && <span className="text-[10px] text-chrome-400">TR</span>}
              {station.freeBranchPorts > 0 && (
                <button
                  type="button"
                  onClick={() => handleStartBranch(station.id)}
                  className="text-[10px] text-ind-600 hover:text-ind-800"
                >
                  [Odg.]
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BranchesSection({ branches }: { branches: BranchViewV1[] }) {
  return (
    <div className="px-3 py-2 space-y-2">
      {branches.length === 0 ? (
        <p className="text-[11px] text-chrome-500">Brak odgałęzień.</p>
      ) : (
        <div className="space-y-1">
          {branches.map((branch, index) => (
            <div
              key={`${branch.from_element_id}-${index}`}
              className="flex items-center gap-2 text-[11px] text-chrome-700 py-1 px-2 rounded hover:bg-chrome-50"
            >
              <span className="font-medium">O{index + 1}</span>
              <span className="text-chrome-500">z {branch.from_element_id}</span>
              <span className="text-chrome-400">{branch.segments.length} segm.</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-chrome-500">
        Nowe odgalezienie rozpocznij z portu BRANCH_OUT pola, ZKSN albo slupa rozgaleznego.
      </p>
    </div>
  );
}

function SectioningSection({
  ringCandidateCount,
  testIdScope,
}: {
  ringCandidateCount: number;
  testIdScope?: string;
}) {
  const openForm = useNetworkBuildStore((state) => state.openOperationForm);

  const handleInsertSwitch = useCallback(() => {
    openForm('insert_section_switch_sn');
  }, [openForm]);

  const handleConnectRing = useCallback(() => {
    openForm('connect_secondary_ring_sn');
  }, [openForm]);

  const handleSetNop = useCallback(() => {
    openForm('set_normal_open_point');
  }, [openForm]);

  return (
    <div className="px-3 py-2 space-y-1.5">
      <ActionButton
        label="+ Wstaw łącznik sekcyjny"
        onClick={handleInsertSwitch}
        testId="btn-insert-switch"
        testIdScope={testIdScope}
      />
      <ActionButton
        label={`+ Domknij pierścień${ringCandidateCount > 0 ? ` (${ringCandidateCount} kandydatów)` : ''}`}
        onClick={handleConnectRing}
        testId="btn-connect-ring"
        testIdScope={testIdScope}
        disabled={ringCandidateCount === 0}
      />
      <ActionButton
        label="Ustaw punkt normalnie otwarty (NOP)"
        onClick={handleSetNop}
        testId="btn-set-nop"
        testIdScope={testIdScope}
      />
    </div>
  );
}

function TransformersSection({
  transformers,
  testIdScope,
}: {
  transformers: TransformerSummary[];
  testIdScope?: string;
}) {
  const openForm = useNetworkBuildStore((state) => state.openOperationForm);

  const handleAddTransformer = useCallback(() => {
    openForm('add_transformer_sn_nn');
  }, [openForm]);

  return (
    <div className="px-3 py-2 space-y-2">
      {transformers.length === 0 ? (
        <p className="text-[11px] text-chrome-500">Brak transformatorów SN/nN.</p>
      ) : (
        <div className="space-y-1">
          {transformers.map((transformer) => (
            <div
              key={transformer.id}
              className="flex items-center gap-2 text-[11px] text-chrome-700 py-1 px-2 rounded hover:bg-chrome-50"
            >
              <span className="truncate flex-1">{transformer.name}</span>
              <span className="text-chrome-400">{transformer.snKva} kVA</span>
              {transformer.catalogRef ? (
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
        testIdScope={testIdScope}
      />
    </div>
  );
}

function OzeSection({ sources, testIdScope }: { sources: OzeSourceSummary[]; testIdScope?: string }) {
  const openForm = useNetworkBuildStore((state) => state.openOperationForm);

  const handleAddPV = useCallback(() => {
    openForm('add_converter_source', buildConverterSourceOperationContext('PV'));
  }, [openForm]);

  const handleAddBESS = useCallback(() => {
    openForm('add_converter_source', buildConverterSourceOperationContext('BESS'));
  }, [openForm]);

  const handleAddFW = useCallback(() => {
    openForm('add_converter_source', buildConverterSourceOperationContext('FW'));
  }, [openForm]);

  return (
    <div className="px-3 py-2 space-y-2">
      {sources.length === 0 ? (
        <p className="text-[11px] text-chrome-500">Brak źródeł OZE/BESS.</p>
      ) : (
        <div className="space-y-1">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex items-center gap-2 text-[11px] text-chrome-700 py-1 px-2 rounded hover:bg-chrome-50"
            >
              <span
                className={clsx(
                  'text-[10px] font-bold px-1 rounded',
                  source.hasTransformer ? 'bg-eng-green/20 text-eng-green' : 'bg-eng-red/20 text-eng-red',
                )}
              >
                {formatGeneratorTypeShortLabelPl(source.genType)}
              </span>
              <span className="truncate flex-1">{source.name}</span>
              <span className="text-chrome-400">{(source.pMw * 1000).toFixed(0)} kW</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <ActionButton label="+ PV" onClick={handleAddPV} testId="btn-add-pv" testIdScope={testIdScope} />
        <ActionButton label="+ BESS" onClick={handleAddBESS} testId="btn-add-bess" testIdScope={testIdScope} />
        <ActionButton label="+ FW" onClick={handleAddFW} testId="btn-add-fw" testIdScope={testIdScope} />
      </div>
    </div>
  );
}

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
        <span className={clsx('text-xs font-semibold', isReady ? 'text-eng-green' : 'text-chrome-700')}>
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

export interface ProcessPanelProps {
  className?: string;
  testIdScope?: string;
}

export function ProcessPanel({ className, testIdScope }: ProcessPanelProps) {
  const collapsedSections = useNetworkBuildStore((state) => state.collapsedSections);
  const toggleSection = useNetworkBuildStore((state) => state.toggleSection);

  const {
    blockersByCategory,
    branchCount,
    buildPhaseLabel,
    generatorCount,
    isReady,
    logicalViews,
    openTerminals,
    ozeSourceSummaries,
    ringCandidates,
    sourceCount,
    stationCount,
    stationSummaries,
    transformerCount,
    transformerSummaries,
    trunkCount,
  } = useNetworkBuildDerived();

  const trunks = logicalViews?.trunks ?? [];
  const branches = logicalViews?.branches ?? [];

  const isSectionCollapsed = useCallback(
    (id: string) => collapsedSections.has(id),
    [collapsedSections],
  );

  const sourceStatus: StatusLevel = sourceCount > 0 ? 'done' : 'empty';
  const trunkStatus: StatusLevel = trunkCount > 0 ? 'done' : sourceCount > 0 ? 'partial' : 'empty';
  const stationStatus: StatusLevel = stationCount > 0 ? 'done' : trunkCount > 0 ? 'partial' : 'empty';
  const branchStatus: StatusLevel = branchCount > 0 ? 'done' : 'empty';
  const sectioningStatus: StatusLevel = logicalViews?.secondary_connectors?.length ? 'done' : 'empty';
  const transformerStatus: StatusLevel = transformerCount > 0 ? 'done' : stationCount > 0 ? 'partial' : 'empty';
  const ozeStatus: StatusLevel = generatorCount > 0 ? 'done' : 'empty';
  const readinessStatus: StatusLevel = isReady ? 'done' : blockersByCategory.total > 0 ? 'error' : 'partial';

  return (
    <div
      className={clsx('flex flex-col h-full overflow-hidden', className)}
      data-testid={scopedTestId('process-panel', testIdScope)}
    >
      <div className="px-3 py-2 bg-ind-50 border-b border-ind-200">
        <p className="text-[11px] font-semibold text-ind-800">{buildPhaseLabel}</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <SectionHeader
          id="source"
          label="Źródło zasilania"
          status={sourceStatus}
          badge={sourceCount > 0 ? `${sourceCount}` : undefined}
          collapsed={isSectionCollapsed('source')}
          onToggle={() => toggleSection('source')}
          testIdScope={testIdScope}
        />
        {!isSectionCollapsed('source') && (
          <SourceSection sourceCount={sourceCount} testIdScope={testIdScope} />
        )}

        <SectionHeader
          id="trunks"
          label="Magistrale"
          status={trunkStatus}
          badge={trunkCount > 0 ? `${trunkCount}` : undefined}
          collapsed={isSectionCollapsed('trunks')}
          onToggle={() => toggleSection('trunks')}
          testIdScope={testIdScope}
        />
        {!isSectionCollapsed('trunks') && (
          <TrunksSection trunks={trunks} openTerminals={openTerminals} testIdScope={testIdScope} />
        )}

        <SectionHeader
          id="stations"
          label="Stacje"
          status={stationStatus}
          badge={stationCount > 0 ? `${stationCount}` : undefined}
          collapsed={isSectionCollapsed('stations')}
          onToggle={() => toggleSection('stations')}
          testIdScope={testIdScope}
        />
        {!isSectionCollapsed('stations') && <StationsSection stations={stationSummaries} />}

        <SectionHeader
          id="branches"
          label="Odgałęzienia"
          status={branchStatus}
          badge={branchCount > 0 ? `${branchCount}` : undefined}
          collapsed={isSectionCollapsed('branches')}
          onToggle={() => toggleSection('branches')}
          testIdScope={testIdScope}
        />
        {!isSectionCollapsed('branches') && <BranchesSection branches={branches} />}

        <SectionHeader
          id="sectioning"
          label="Sekcjonowanie i ringi"
          status={sectioningStatus}
          collapsed={isSectionCollapsed('sectioning')}
          onToggle={() => toggleSection('sectioning')}
          testIdScope={testIdScope}
        />
        {!isSectionCollapsed('sectioning') && (
          <SectioningSection ringCandidateCount={ringCandidates.length} testIdScope={testIdScope} />
        )}

        <SectionHeader
          id="transformers"
          label="Transformatory i nN"
          status={transformerStatus}
          badge={transformerCount > 0 ? `${transformerCount}` : undefined}
          collapsed={isSectionCollapsed('transformers')}
          onToggle={() => toggleSection('transformers')}
          testIdScope={testIdScope}
        />
        {!isSectionCollapsed('transformers') && (
          <TransformersSection transformers={transformerSummaries} testIdScope={testIdScope} />
        )}

        <SectionHeader
          id="oze"
          label="Źródła OZE / BESS"
          status={ozeStatus}
          badge={generatorCount > 0 ? `${generatorCount}` : undefined}
          collapsed={isSectionCollapsed('oze')}
          onToggle={() => toggleSection('oze')}
          testIdScope={testIdScope}
        />
        {!isSectionCollapsed('oze') && (
          <OzeSection sources={ozeSourceSummaries} testIdScope={testIdScope} />
        )}

        <SectionHeader
          id="readiness"
          label="Gotowość do analizy"
          status={readinessStatus}
          collapsed={isSectionCollapsed('readiness')}
          onToggle={() => toggleSection('readiness')}
          testIdScope={testIdScope}
        />
        {!isSectionCollapsed('readiness') && (
          <ReadinessSection isReady={isReady} blockersByCategory={blockersByCategory} />
        )}
      </div>
    </div>
  );
}

export default ProcessPanel;
