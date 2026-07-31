import { useCallback, useMemo } from 'react';
import { clsx } from 'clsx';

import {
  useNetworkBuildStore,
  useNetworkBuildDerived,
} from './networkBuildStore';
import type {
  OzeSourceSummary,
  StationSummary,
  TransformerSummary,
  LoadSummary,
  ConfiguredGridSourceSnField,
  GridSourceSnFieldCandidate,
} from './networkBuildStore';
import type { BranchViewV1, TerminalRef, TrunkViewV1 } from '../../types/enm';
import { buildConverterSourceOperationContext } from '../shared/converterSourceContext';
import { formatGeneratorTypeShortLabelPl } from '../shared/generatorTypeLabels';
import { formatStationTypeShortLabelPl } from '../shared/stationTypeLabels';
import {
  buildControlDeviceOptions,
  measurementCountsForField,
} from '../field/fieldControlSelectors';
import { useFieldReadModel } from '../field/useFieldReadModel';
import { useSnapshotStore } from '../topology/snapshotStore';
import {
  resolveBranchSourceContext,
  resolveBranchSourceRef,
} from './operationContextResolvers';

type StatusLevel = 'done' | 'partial' | 'empty' | 'error';

const mutedTextClass = 'text-scada-text';
const primaryTextClass = 'text-scada-text';
const rowHoverClass = 'hover:bg-scada-surface';
const sectionBorderClass = 'border-scada-border';

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
      className={clsx(
        'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors border-b bg-scada-bg',
        rowHoverClass,
        sectionBorderClass,
      )}
      data-testid={scopedTestId(`process-section-${id}`, testIdScope)}
      data-collapsed={collapsed}
    >
      {collapsed ? <IconChevronRight className={mutedTextClass} /> : <IconChevronDown className={mutedTextClass} />}
      <StatusDot level={status} />
      <span className={clsx('flex-1 text-xs font-semibold uppercase tracking-wider', primaryTextClass)}>{label}</span>
      {badge && (
        <span className="rounded border border-scada-border-strong bg-scada-bg px-1.5 py-0.5 text-[10px] text-sygnal-info-tusz">{badge}</span>
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
        'w-full text-left px-3 py-1.5 text-[11px] rounded-ind transition-colors border',
        variant === 'primary'
          ? 'border-sygnal-info bg-sygnal-info-tlo text-scada-text hover:bg-sygnal-info-tlo disabled:border-scada-border disabled:bg-scada-bg disabled:text-scada-muted'
          : 'border-scada-border bg-scada-bg text-sygnal-info-tusz hover:border-sygnal-info hover:bg-scada-surface hover:text-scada-text disabled:border-scada-border disabled:text-scada-muted disabled:hover:bg-scada-bg',
      )}
      data-testid={testId ? scopedTestId(testId, testIdScope) : undefined}
    >
      {label}
    </button>
  );
}

function safeTestToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function portRoleLabel(portId?: string | null): string {
  const normalized = (portId ?? '').toLowerCase();
  if (normalized.includes('branch')) return 'zacisk odgałęźny';
  if (normalized.includes('start') || normalized.includes('in') || normalized.includes('upstream')) {
    return 'zacisk wejściowy';
  }
  if (normalized.includes('end') || normalized.includes('out') || normalized.includes('downstream')) {
    return 'zacisk wyjściowy';
  }
  return 'zacisk techniczny';
}

function openPortLabel(
  terminal: TerminalRef,
  field: ConfiguredGridSourceSnField | null,
): string {
  const owner = field?.name?.trim() || 'obiekt sieci SN';
  return `${owner} · ${portRoleLabel(terminal.port_id)} · SN`;
}

function branchSourceLabel(segment: BranchViewV1): string {
  return `${portRoleLabel(segment.from_port_id)} obiektu źródłowego`;
}

function SourceSection({ sourceCount, testIdScope }: { sourceCount: number; testIdScope?: string }) {
  const openForm = useNetworkBuildStore((state) => state.openOperationForm);

  const handleAddSource = useCallback(() => {
    openForm('add_grid_source_sn');
  }, [openForm]);

  if (sourceCount === 0) {
    return (
      <div className="px-3 py-2">
        <p className={clsx('mb-2 text-[11px]', mutedTextClass)}>
          Rozpocznij od GPZ z sekcjami i polami liniowymi, dopiero potem wyprowadź ciąg główny.
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
      <div className={clsx('flex items-center gap-2 text-[11px]', primaryTextClass)}>
        <StatusDot level="done" />
        <span>GPZ skonfigurowany ({sourceCount})</span>
      </div>
      <ActionButton
        label="Edytuj GPZ"
        onClick={handleAddSource}
        testId="btn-edit-source"
        testIdScope={testIdScope}
      />
    </div>
  );
}

function SnFieldSection({
  sourceCount,
  configuredFieldCount,
  hasMaterializedNetwork,
  gridSourceStationRef,
  unconfiguredFields,
  testIdScope,
}: {
  sourceCount: number;
  configuredFieldCount: number;
  hasMaterializedNetwork: boolean;
  gridSourceStationRef: string | null;
  unconfiguredFields: GridSourceSnFieldCandidate[];
  testIdScope?: string;
}) {
  const openForm = useNetworkBuildStore((state) => state.openOperationForm);
  const firstUnconfiguredField = unconfiguredFields[0] ?? null;
  const hasConfiguredFields = configuredFieldCount > 0 || hasMaterializedNetwork;

  const handleConfigureField = useCallback(() => {
    openForm('add_sn_bay', {
      station_ref: gridSourceStationRef ?? undefined,
      bus_ref: firstUnconfiguredField?.bus_ref,
      existing_field_ref: firstUnconfiguredField?.ref_id,
      field_name: firstUnconfiguredField?.name,
      gpz_section_id: firstUnconfiguredField?.gpz_section_id ?? undefined,
      bay_role: 'OUT',
    });
  }, [firstUnconfiguredField, gridSourceStationRef, openForm]);

  if (sourceCount === 0) {
    return (
      <div className="px-3 py-2">
        <p className={clsx('text-[11px]', mutedTextClass)}>Pole SN konfigurujesz dopiero po utworzeniu GPZ.</p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 space-y-2">
      {hasConfiguredFields ? (
        <div className={clsx('flex items-center gap-2 text-[11px]', primaryTextClass)}>
          <StatusDot level="done" />
          <span>
            {configuredFieldCount > 0
              ? `${configuredFieldCount === 1 ? 'Pole SN skonfigurowane' : 'Pola SN skonfigurowane'} (${configuredFieldCount})`
              : 'Pola SN obecne w układzie'}
          </span>
        </div>
      ) : (
        <p className={clsx('text-[11px]', mutedTextClass)}>
          Skonfiguruj pole odpływowe SN z aparaturą. Magistrala będzie wyprowadzona z jego zacisku wyjściowego.
        </p>
      )}
      {firstUnconfiguredField && (
        <p className={clsx('text-[11px]', primaryTextClass)}>
          Wolne pole GPZ do rozbudowy: {firstUnconfiguredField.name}
        </p>
      )}
      <ActionButton
        label={hasConfiguredFields ? '+ Dodaj pole SN z katalogu' : 'Skonfiguruj pole SN'}
        onClick={handleConfigureField}
        variant={hasConfiguredFields ? 'secondary' : 'primary'}
        testId="btn-configure-sn-field"
        testIdScope={testIdScope}
      />
    </div>
  );
}

function TrunksSection({
  trunks,
  openTerminals,
  sourceCount,
  configuredFieldCount,
  configuredFields,
  fallbackSegmentCount,
  testIdScope,
}: {
  trunks: TrunkViewV1[];
  openTerminals: TerminalRef[];
  sourceCount: number;
  configuredFieldCount: number;
  configuredFields: ConfiguredGridSourceSnField[];
  fallbackSegmentCount: number;
  testIdScope?: string;
}) {
  const openForm = useNetworkBuildStore((state) => state.openOperationForm);
  const firstOpenTerminal = openTerminals[0] ?? null;
  const firstConfiguredField = configuredFields[0] ?? null;
  const fieldForTerminal = useCallback(
    (terminal: TerminalRef | null) =>
      terminal
        ? configuredFields.find((field) => field.ref_id === terminal.element_id) ?? null
        : null,
    [configuredFields],
  );

  const handleContinueTrunk = useCallback(
    (terminal: TerminalRef | null) => {
      const matchingField = fieldForTerminal(terminal);
      const terminalName = terminal
        ? openPortLabel(terminal, matchingField)
        : firstConfiguredField?.name;
      openForm('continue_trunk_segment_sn', {
        ...(terminal
          ? {
              terminal_id: terminal.element_id,
              port_id: terminal.port_id,
              trunk_id: terminal.trunk_id,
              field_ref: matchingField?.ref_id,
              terminal_name: terminalName,
            }
          : {
              field_ref: firstConfiguredField?.ref_id,
              terminal_id: firstConfiguredField?.ref_id,
              terminal_name: terminalName,
            }),
        terminal_voltage_label: 'SN',
      });
    },
    [fieldForTerminal, firstConfiguredField, openForm],
  );

  const handleInsertStation = useCallback(
    (trunk: TrunkViewV1) => {
      const firstSegmentId = trunk.segments[0];
      if (!firstSegmentId) return;

      openForm('insert_station_on_segment_sn', {
        segment_id: firstSegmentId,
        segment_ref: firstSegmentId,
        corridor_ref: trunk.corridor_ref,
        position_on_segment: 0.5,
      });
    },
    [openForm],
  );

  return (
    <div className="px-3 py-2 space-y-2">
      {trunks.length === 0 ? (
        <div className="space-y-2">
          {fallbackSegmentCount > 0 ? (
            <p className={clsx('text-[11px]', mutedTextClass)}>
              W układzie jest {fallbackSegmentCount} odcinków SN. Szczegóły ciągów i terminali otwórz z drzewa schematu albo karty odcinka.
            </p>
          ) : (
          <p className={clsx('text-[11px]', mutedTextClass)}>
            {sourceCount === 0
              ? 'Magistralę SN można wyprowadzić dopiero po utworzeniu GPZ.'
              : configuredFieldCount === 0
                ? 'Najpierw skonfiguruj pole SN GPZ. Dopiero z jego zacisku wyjściowego wyprowadzisz magistralę.'
                : 'Pole SN jest skonfigurowane. Połącz jego zacisk wyjściowy z zaciskiem wejściowym pierwszego obiektu sieciowego.'}
          </p>
          )}
          {fallbackSegmentCount === 0 && sourceCount > 0 && configuredFieldCount > 0 && (
            <ActionButton
              label={firstOpenTerminal || firstConfiguredField ? 'Połącz zacisk pola SN' : 'Wybierz wolne pole liniowe GPZ'}
              onClick={() => {
                if (firstOpenTerminal || firstConfiguredField) {
                  handleContinueTrunk(firstOpenTerminal);
                }
              }}
              variant="primary"
              testId="btn-start-trunk"
              testIdScope={testIdScope}
              disabled={!firstOpenTerminal && !firstConfiguredField}
            />
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {trunks.map((trunk, index) => (
            <div
              key={trunk.corridor_ref}
              className={clsx('flex items-center gap-2 text-[11px] py-1 px-2 rounded', primaryTextClass, rowHoverClass)}
            >
              <span className="font-medium">M{index + 1}</span>
              <span className={mutedTextClass}>{trunk.segments.length} segm.</span>
              {trunk.no_point_ref && <span className="text-eng-amber text-[10px]">NOP</span>}
              <button
                type="button"
                onClick={() => handleInsertStation(trunk)}
                disabled={trunk.segments.length === 0}
                className="ml-auto text-[10px] text-sygnal-info-tusz hover:text-scada-text"
              >
                Podziel odcinek i wstaw stację
              </button>
            </div>
          ))}
        </div>
      )}

      {openTerminals.length > 0 && (
        <div className="space-y-1 border-t border-scada-border pt-2">
          <p className={clsx('text-[10px] font-medium uppercase', mutedTextClass)}>Wolne zaciski układu sieci</p>
          {openTerminals.map((terminal) => (
            <button
              key={`${terminal.element_id}-${terminal.port_id}`}
              type="button"
              onClick={() => handleContinueTrunk(terminal)}
              className="w-full rounded px-2 py-1 text-left text-[11px] text-sygnal-info-tusz hover:bg-scada-surface"
              data-testid={scopedTestId(`btn-connect-port-${safeTestToken(terminal.element_id)}-${safeTestToken(terminal.port_id)}`, testIdScope)}
            >
              <span className="block font-medium">Połącz zacisk</span>
              <span className={clsx('block text-[10px]', mutedTextClass)}>
                {openPortLabel(terminal, fieldForTerminal(terminal))}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-scada-border pt-2">
        <p className={clsx('text-[10px]', mutedTextClass)}>
          ZKSN i słup rozgałęźny dodawaj na końcu odcinka albo przez świadomy podział odcinka z podglądem skutków topologicznych.
        </p>
        <p className={clsx('mt-1 text-[10px] font-semibold', mutedTextClass)}>
          Nigdy bez wskazania segmentu.
        </p>
      </div>
    </div>
  );
}

function StationsSection({ stations }: { stations: StationSummary[] }) {
  const openForm = useNetworkBuildStore((state) => state.openOperationForm);
  const snapshot = useSnapshotStore((state) => state.snapshot);

  const branchContextForStation = useCallback(
    (stationId: string): Record<string, unknown> | null => {
      const fromRef = resolveBranchSourceRef(snapshot, stationId, stationId, null);
      if (!fromRef) return null;

      const sourceContext = resolveBranchSourceContext(snapshot, fromRef);
      if (!sourceContext.sourceBusRef) return null;

      return {
        from_ref: fromRef,
        station_ref: stationId,
        source_bus_ref: sourceContext.sourceBusRef,
        source_type_label: sourceContext.sourceType,
        source_name: sourceContext.sourceName,
        source_voltage_label: sourceContext.voltageLabel,
        source_port_label: sourceContext.portLabel,
      };
    },
    [snapshot],
  );

  const handleStartBranch = useCallback(
    (stationId: string) => {
      const context = branchContextForStation(stationId);
      if (!context) return;
      openForm('start_branch_segment_sn', context);
    },
    [branchContextForStation, openForm],
  );

  return (
    <div className="px-3 py-2 space-y-2">
      {stations.length === 0 ? (
        <p className={clsx('text-[11px]', mutedTextClass)}>
          Nie wstawiono jeszcze stacji. Połącz głowicę odpływową pola GPZ z odcinkiem SN, potem zakończ odcinek stacją z portem wejściowym.
        </p>
      ) : (
        <div className="space-y-1">
          {stations.map((station) => {
            const branchContext = station.freeBranchPorts > 0
              ? branchContextForStation(station.id)
              : null;
            return (
              <div
                key={station.id}
                className={clsx('flex items-center gap-2 text-[11px] py-1 px-2 rounded', primaryTextClass, rowHoverClass)}
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
                    disabled={!branchContext}
                    onClick={() => handleStartBranch(station.id)}
                    className="text-[10px] text-sygnal-info-tusz hover:text-scada-text disabled:cursor-not-allowed disabled:text-scada-muted"
                    title={branchContext ? 'Rozpocznij odgałęzienie z pola liniowego stacji' : 'Najpierw wybierz wolne pole liniowe stacji'}
                  >
                    [Pole liniowe]
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BranchesSection({ branches }: { branches: BranchViewV1[] }) {
  return (
    <div className="px-3 py-2 space-y-2">
      {branches.length === 0 ? (
        <p className={clsx('text-[11px]', mutedTextClass)}>Nie wstawiono jeszcze odgałęzień.</p>
      ) : (
        <div className="space-y-1">
          {branches.map((branch, index) => (
            <div
              key={`${branch.from_element_id}-${index}`}
              className={clsx('flex items-center gap-2 text-[11px] py-1 px-2 rounded', primaryTextClass, rowHoverClass)}
            >
              <span className="font-medium">O{index + 1}</span>
              <span className={mutedTextClass}>{branchSourceLabel(branch)}</span>
              <span className="text-scada-muted">{branch.segments.length} segm.</span>
            </div>
          ))}
        </div>
      )}
      <p className={clsx('text-[10px]', mutedTextClass)}>
        Nowe odgałęzienie rozpocznij z wolnego zacisku odgałęźnego pola, ZKSN albo słupa rozgałęźnego.
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
  loads,
  stations,
  testIdScope,
}: {
  transformers: TransformerSummary[];
  loads: LoadSummary[];
  stations: StationSummary[];
  testIdScope?: string;
}) {
  const openForm = useNetworkBuildStore((state) => state.openOperationForm);
  const stationForNn = stations.find((station) => station.hasNnPart) ?? stations[0] ?? null;
  const stationRefForNn = stationForNn?.id ?? null;

  const handleAddTransformer = useCallback(() => {
    openForm('add_transformer_sn_nn');
  }, [openForm]);

  const handleAddNnFeeder = useCallback(() => {
    if (!stationRefForNn) return;
    openForm('add_nn_outgoing_field', {
      station_ref: stationRefForNn,
      field_role: 'FEEDER',
    });
  }, [openForm, stationRefForNn]);

  const handleAddNnLoad = useCallback(() => {
    if (!stationRefForNn) return;
    openForm('add_nn_load', { station_ref: stationRefForNn });
  }, [openForm, stationRefForNn]);

  return (
    <div className="px-3 py-2 space-y-2">
      {transformers.length === 0 ? (
        <p className={clsx('text-[11px]', mutedTextClass)}>Nie wstawiono jeszcze transformatorów SN/nN.</p>
      ) : (
        <div className="space-y-1">
          {transformers.map((transformer) => (
            <div
              key={transformer.id}
              className={clsx('flex items-center gap-2 text-[11px] py-1 px-2 rounded', primaryTextClass, rowHoverClass)}
            >
              <span className="truncate flex-1">{transformer.name}</span>
              <span className="text-scada-muted">{transformer.snKva} kVA</span>
              {transformer.catalogRef ? (
                <span className="text-[10px] text-eng-green">KAT</span>
              ) : (
                <span className="text-[10px] text-eng-amber">RĘCZ</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-scada-border pt-2">
        <div className={clsx('mb-1 text-[10px] font-semibold uppercase tracking-wider', mutedTextClass)}>
          Odbiory nN
        </div>
        {loads.length === 0 ? (
          <p className={clsx('text-[11px]', mutedTextClass)}>Nie dodano jeszcze odbiorów nN.</p>
        ) : (
          <div className="space-y-1">
            {loads.map((load) => (
              <div
                key={load.id}
                className={clsx('flex items-center gap-2 rounded px-2 py-1 text-[11px]', primaryTextClass, rowHoverClass)}
              >
                <span className="truncate flex-1">{load.name}</span>
                <span className="text-scada-muted">{load.pKw.toFixed(1)} kW</span>
                {load.catalogRef ? (
                  <span className="text-[10px] text-eng-green">KAT</span>
                ) : (
                  <span className="text-[10px] text-eng-amber">RĘCZ</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ActionButton
        label="+ Dodaj transformator"
        onClick={handleAddTransformer}
        testId="btn-add-transformer"
        testIdScope={testIdScope}
      />
      <ActionButton
        label="+ Dodaj odpływ nN"
        onClick={handleAddNnFeeder}
        testId="btn-add-nn-feeder"
        testIdScope={testIdScope}
        disabled={!stationForNn?.hasNnPart}
      />
      <ActionButton
        label="+ Dodaj odbiór nN"
        onClick={handleAddNnLoad}
        variant={stationForNn?.hasNnPart ? 'primary' : 'secondary'}
        testId="btn-add-nn-load"
        testIdScope={testIdScope}
        disabled={!stationForNn?.hasNnPart}
      />
    </div>
  );
}

function OzeSection({
  sources,
  stations,
  testIdScope,
}: {
  sources: OzeSourceSummary[];
  stations: StationSummary[];
  testIdScope?: string;
}) {
  const openForm = useNetworkBuildStore((state) => state.openOperationForm);
  const stationForNn = stations.find((station) => station.hasNnPart) ?? null;
  const stationRefForNn = stationForNn?.id ?? null;

  const buildContext = useCallback(
    (technology: 'PV' | 'BESS' | 'FW') => ({
      ...buildConverterSourceOperationContext(technology),
      ...(stationRefForNn ? { station_ref: stationRefForNn } : {}),
    }),
    [stationRefForNn],
  );

  const handleAddPV = useCallback(() => {
    openForm('add_converter_source', buildContext('PV'));
  }, [buildContext, openForm]);

  const handleAddBESS = useCallback(() => {
    openForm('add_converter_source', buildContext('BESS'));
  }, [buildContext, openForm]);

  const handleAddFW = useCallback(() => {
    openForm('add_converter_source', buildContext('FW'));
  }, [buildContext, openForm]);

  return (
    <div className="px-3 py-2 space-y-2">
      {sources.length === 0 ? (
        <p className={clsx('text-[11px]', mutedTextClass)}>Nie dodano jeszcze układów PV/BESS/FW.</p>
      ) : (
        <div className="space-y-1">
          {sources.map((source, index) => (
            <div
              key={`${source.id}:${index}`}
              className={clsx('flex items-center gap-2 text-[11px] py-1 px-2 rounded', primaryTextClass, rowHoverClass)}
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
              <span className="text-scada-muted">{(source.pMw * 1000).toFixed(0)} kW</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <ActionButton
          label="+ PV"
          onClick={handleAddPV}
          testId="btn-add-pv"
          testIdScope={testIdScope}
          disabled={!stationForNn}
        />
        <ActionButton
          label="+ BESS"
          onClick={handleAddBESS}
          testId="btn-add-bess"
          testIdScope={testIdScope}
          disabled={!stationForNn}
        />
        <ActionButton
          label="+ FW"
          onClick={handleAddFW}
          testId="btn-add-fw"
          testIdScope={testIdScope}
          disabled={!stationForNn}
        />
      </div>
    </div>
  );
}

function ProtectionSection({ testIdScope }: { testIdScope?: string }) {
  const openForm = useNetworkBuildStore((state) => state.openOperationForm);
  const fieldReadModel = useFieldReadModel();

  const candidate = useMemo(() => {
    const fields = fieldReadModel.data.fields;
    return fields.find((item) => buildControlDeviceOptions(item).length > 0) ?? fields[0] ?? null;
  }, [fieldReadModel.data.fields]);

  const measurements = measurementCountsForField(candidate);
  const deviceOptions = useMemo(() => buildControlDeviceOptions(candidate), [candidate]);
  const breakerRef = deviceOptions[0]?.ref_id ?? '';
  const fieldRef = candidate?.bay_ref ?? '';
  const hasRelay = Boolean(candidate?.canonical_model.base_model.protection_config);
  const context = {
    bay_ref: fieldRef,
    field_ref: fieldRef,
    breaker_ref: breakerRef,
  };

  const missingReason = !fieldRef
    ? 'Najpierw utwórz pole SN z aparatem wykonawczym.'
    : !breakerRef
      ? 'Pole SN nie ma aparatu wykonawczego.'
      : measurements.ct === 0
        ? 'Najpierw dodaj przekładnik prądowy CT do tego pola.'
        : '';

  return (
    <div className="px-3 py-2 space-y-2">
      {fieldRef ? (
        <div className={clsx('space-y-1 text-[11px]', primaryTextClass)}>
          <div className="flex items-center gap-2">
            <StatusDot level={hasRelay ? 'done' : measurements.ct > 0 ? 'partial' : 'empty'} />
            <span className="font-medium truncate">{candidate?.bay_name ?? fieldRef}</span>
          </div>
          <div className={clsx('grid grid-cols-3 gap-1 text-[10px]', mutedTextClass)}>
            <span>CT: {measurements.ct}</span>
            <span>VT: {measurements.vt}</span>
            <span>{hasRelay ? 'Zabezp.: 1' : 'Zabezp.: nie dobrano'}</span>
          </div>
        </div>
      ) : (
        <p className={clsx('text-[11px]', mutedTextClass)}>
          Zabezpieczenia dobierasz dopiero po utworzeniu pola SN z aparatem wykonawczym.
        </p>
      )}

      <ActionButton
        label="+ Dodaj CT do pola"
        onClick={() => openForm('add_ct', context)}
        testId="btn-add-field-ct"
        testIdScope={testIdScope}
        disabled={!fieldRef}
      />
      <ActionButton
        label="+ Dodaj VT do pola"
        onClick={() => openForm('add_vt', context)}
        testId="btn-add-field-vt"
        testIdScope={testIdScope}
        disabled={!fieldRef}
      />
      <ActionButton
        label="+ Dobierz zabezpieczenie wywodu"
        onClick={() => openForm('add_relay', context)}
        variant={measurements.ct > 0 && breakerRef ? 'primary' : 'secondary'}
        testId="btn-add-field-relay"
        testIdScope={testIdScope}
        disabled={!fieldRef || !breakerRef || measurements.ct === 0}
      />
      {missingReason && (
        <p className="text-[10px] text-eng-amber">{missingReason}</p>
      )}
    </div>
  );
}

function CalculationControlSection({
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
        <span className={clsx('text-xs font-semibold', isReady ? 'text-eng-green' : primaryTextClass)}>
          {isReady ? 'Układ dopuszczony do analizy' : `${blockersByCategory.total} zagadnień technicznych`}
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
  const fieldReadModel = useFieldReadModel();
  const snapshot = useSnapshotStore((state) => state.snapshot);

  const {
    blockersByCategory,
    branchCount,
    buildPhaseLabel,
    configuredGpzSnFieldCount,
    configuredGpzSnFields,
    generatorCount,
    gridSourceStationRef,
    isReady,
    loadCount,
    loadSummaries,
    logicalViews,
    openTerminals,
    ozeSourceSummaries,
    ringCandidates,
    sourceCount,
    stationCount,
    stationSummaries,
    snFieldCount,
    snSectionCount,
    transformerCount,
    transformerSummaries,
    trunkSegmentCount,
    unconfiguredGpzSnFields,
  } = useNetworkBuildDerived();

  const trunks = (logicalViews?.trunks ?? []).filter(
    (trunk) => (trunk.segments?.length ?? 0) > 0,
  );
  const branches = logicalViews?.branches ?? [];
  const protectionStats = useMemo(() => {
    let withCt = 0;
    let withRelay = 0;

    for (const item of fieldReadModel.data.fields) {
      const counts = measurementCountsForField(item);
      if (counts.ct > 0) withCt += 1;
      if (item.canonical_model.base_model.protection_config) withRelay += 1;
    }

    return {
      fields: fieldReadModel.data.fields.length,
      withCt,
      withRelay,
    };
  }, [fieldReadModel.data.fields]);
  const snapshotSnFieldCount = snapshot?.bays?.length ?? 0;
  const effectiveConfiguredSnFieldCount = Math.max(
    configuredGpzSnFieldCount ?? 0,
    snFieldCount ?? 0,
    snapshotSnFieldCount,
  );
  const hasSnFieldInventory = effectiveConfiguredSnFieldCount > 0 || snSectionCount > 0 || stationCount > 0;

  const isSectionCollapsed = useCallback(
    (id: string) => collapsedSections.has(id),
    [collapsedSections],
  );

  const sourceStatus: StatusLevel = sourceCount > 0 ? 'done' : 'empty';
  const snFieldStatus: StatusLevel = hasSnFieldInventory ? 'done' : sourceCount > 0 ? 'partial' : 'empty';
  const trunkStatus: StatusLevel = snSectionCount > 0 ? 'done' : (configuredGpzSnFieldCount ?? 0) > 0 ? 'partial' : 'empty';
  const stationStatus: StatusLevel = stationCount > 0 ? 'done' : trunkSegmentCount > 0 ? 'partial' : 'empty';
  const branchStatus: StatusLevel = branchCount > 0 ? 'done' : 'empty';
  const sectioningStatus: StatusLevel = logicalViews?.secondary_connectors?.length ? 'done' : 'empty';
  const transformerStatus: StatusLevel = transformerCount > 0 ? 'done' : stationCount > 0 ? 'partial' : 'empty';
  const ozeStatus: StatusLevel = generatorCount > 0 ? 'done' : 'empty';
  const protectionStatus: StatusLevel =
    protectionStats.withRelay > 0
      ? 'done'
      : protectionStats.withCt > 0 || protectionStats.fields > 0
        ? 'partial'
        : 'empty';
  const readinessStatus: StatusLevel = isReady ? 'done' : blockersByCategory.total > 0 ? 'error' : 'partial';

  return (
    <div
      className={clsx('flex flex-col h-full overflow-hidden', className)}
      data-testid={scopedTestId('process-panel', testIdScope)}
    >
      <div className="border-b border-scada-border bg-scada-bg px-3 py-2">
        <p className="font-mono-eng text-[10px] font-semibold uppercase tracking-[0.22em] text-scada-text">
          Prowadzony edytor SLD
        </p>
        <p className="mt-1 text-[11px] font-semibold text-scada-text">{buildPhaseLabel}</p>
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
          id="sn-fields"
          label="Pola SN"
          status={snFieldStatus}
          badge={effectiveConfiguredSnFieldCount > 0 ? `${effectiveConfiguredSnFieldCount}` : undefined}
          collapsed={isSectionCollapsed('sn-fields')}
          onToggle={() => toggleSection('sn-fields')}
          testIdScope={testIdScope}
        />
        {!isSectionCollapsed('sn-fields') && (
          <SnFieldSection
            sourceCount={sourceCount}
            configuredFieldCount={effectiveConfiguredSnFieldCount}
            hasMaterializedNetwork={hasSnFieldInventory}
            gridSourceStationRef={gridSourceStationRef}
            unconfiguredFields={unconfiguredGpzSnFields}
            testIdScope={testIdScope}
          />
        )}

        <SectionHeader
          id="trunks"
          label="Magistrala SN"
          status={trunkStatus}
          badge={snSectionCount > 0 ? `${snSectionCount}` : undefined}
          collapsed={isSectionCollapsed('trunks')}
          onToggle={() => toggleSection('trunks')}
          testIdScope={testIdScope}
        />
        {!isSectionCollapsed('trunks') && (
          <TrunksSection
            trunks={trunks}
            openTerminals={openTerminals}
            sourceCount={sourceCount}
            configuredFieldCount={configuredGpzSnFieldCount}
            configuredFields={configuredGpzSnFields}
            fallbackSegmentCount={snSectionCount}
            testIdScope={testIdScope}
          />
        )}

        <SectionHeader
          id="stations"
          label="Stacje SN/nN"
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
          badge={
            transformerCount > 0 || loadCount > 0
              ? `${transformerCount} TR / ${loadCount} odb.`
              : undefined
          }
          collapsed={isSectionCollapsed('transformers')}
          onToggle={() => toggleSection('transformers')}
          testIdScope={testIdScope}
        />
        {!isSectionCollapsed('transformers') && (
          <TransformersSection
            transformers={transformerSummaries}
            loads={loadSummaries}
            stations={stationSummaries}
            testIdScope={testIdScope}
          />
        )}

        <SectionHeader
          id="oze"
          label="OZE / BESS"
          status={ozeStatus}
          badge={generatorCount > 0 ? `${generatorCount}` : undefined}
          collapsed={isSectionCollapsed('oze')}
          onToggle={() => toggleSection('oze')}
          testIdScope={testIdScope}
        />
        {!isSectionCollapsed('oze') && (
          <OzeSection
            sources={ozeSourceSummaries}
            stations={stationSummaries}
            testIdScope={testIdScope}
          />
        )}

        <SectionHeader
          id="protection"
          label="Pomiary i zabezpieczenia"
          status={protectionStatus}
          badge={protectionStats.withRelay > 0 ? `${protectionStats.withRelay}` : undefined}
          collapsed={isSectionCollapsed('protection')}
          onToggle={() => toggleSection('protection')}
          testIdScope={testIdScope}
        />
        {!isSectionCollapsed('protection') && (
          <ProtectionSection testIdScope={testIdScope} />
        )}

        <SectionHeader
          id="readiness"
          label="Zakres obliczeń"
          status={readinessStatus}
          collapsed={isSectionCollapsed('readiness')}
          onToggle={() => toggleSection('readiness')}
          testIdScope={testIdScope}
        />
        {!isSectionCollapsed('readiness') && (
          <CalculationControlSection isReady={isReady} blockersByCategory={blockersByCategory} />
        )}
      </div>
    </div>
  );
}

export default ProcessPanel;
