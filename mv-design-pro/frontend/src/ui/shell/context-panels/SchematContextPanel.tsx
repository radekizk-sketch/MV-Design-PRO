import { useMemo, useState } from 'react';
import { clsx } from 'clsx';

import { useAppStateStore } from '../../app-state/store';
import { useNetworkBuildDerived, useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useSelectionStore } from '../../selection';
import { formatLengthKm } from '../../shared/formatPolishValue';
import { sanitizePublicReadinessMessage } from '../../shared/publicReadinessMessage';
import { navigateToAnalysis } from '../../navigation/routes';
import type { ElementType } from '../../types';
import {
  ANALYSIS_SURFACE_SCREEN_CODE,
  type EntityTypeCode,
  type WorkspaceSurfaceCode,
} from '../../workspace/types';

type RowState = 'ok' | 'warn' | 'danger' | 'group';

interface NavigatorTarget {
  elementType: ElementType;
  surfaceCode: WorkspaceSurfaceCode;
  entityType: EntityTypeCode | null;
  titlePl: string;
  tabId?: string | null;
  payload?: Record<string, unknown>;
}

interface TreeRowSpec {
  id: string;
  label: string;
  meta?: string;
  state: RowState;
  indent?: number;
  target: NavigatorTarget;
}

interface TreeSectionSpec {
  title: string;
  badge: string;
  rows: TreeRowSpec[];
}

type SnapshotRecord = Record<string, unknown>;

const COLLECTIONS = [
  'sources',
  'buses',
  'bays',
  'branches',
  'substations',
  'transformers',
  'generators',
  'loads',
] as const;

const DEFAULT_VISIBLE_TREE_ROWS = 18;

function visibleTreeRowsLimit(title: string): number {
  if (title === 'GPZ i źródła') return 8;
  if (title === 'Pola GPZ') return 16;
  if (title === 'Stacje SN/nN') return 24;
  if (title === 'Magistrale i odcinki SN') return 18;
  if (title === 'Układy PV/BESS/FW') return 12;
  if (title === 'Odbiory nN') return 8;
  return DEFAULT_VISIBLE_TREE_ROWS;
}

function slugForTestId(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function SchematContextPanel() {
  const setActiveArea = useAppStateStore((s) => s.setActiveArea);
  const setActiveWorkMode = useAppStateStore((s) => s.setActiveWorkMode);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const selectedElementId = useSelectionStore((s) => s.selectedElements[0]?.id ?? null);
  const {
    blockersByCategory,
    configuredGpzSnFields = [],
    openTerminals = [],
  } = useNetworkBuildDerived();
  const [treeQuery, setTreeQuery] = useState('');

  const blockers = useMemo(() => {
    const readinessBlockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
    return readinessBlockers.map((blocker, index) => {
      const record = blocker as Record<string, unknown>;
      const message = String(record.message_pl ?? record.message ?? record.label ?? record.code ?? 'Zagadnienie techniczne');
      return {
        id: String(record.id ?? record.code ?? record.element_ref ?? index),
        label: sanitizePublicReadinessMessage(message, snapshot),
        refs: collectIssueRefs(record),
      };
    });
  }, [readiness, snapshot]);

  const blockerRefs = useMemo(() => {
    const refs = new Set<string>();
    for (const blocker of blockers) {
      for (const ref of blocker.refs) refs.add(ref);
    }
    return refs;
  }, [blockers]);

  const sections = useMemo(
    () => filterTreeSections(buildTreeSections(snapshot as SnapshotRecord | null, blockerRefs), treeQuery),
    [blockerRefs, snapshot, treeQuery],
  );

  const elementCount = useMemo(
    () => COLLECTIONS.reduce((sum, key) => sum + getCollection(snapshot as SnapshotRecord | null, key).length, 0),
    [snapshot],
  );
  const blockerCount = blockers.length || (readiness ? 0 : (blockersByCategory?.total ?? 0));
  const hasNetworkTopology = elementCount > 0;
  const visibleBlockers = hasNetworkTopology ? blockers : [];
  const visibleBlockerCount = hasNetworkTopology ? blockerCount : 0;
  const designGuidance = useMemo(() => {
    const model = snapshot as SnapshotRecord | null;
    const sources = getCollection(model, 'sources');
    const gpzBays = getCollection(model, 'bays').filter(isGpzScopedRecord);
    const branches = getCollection(model, 'branches');
    const lineBranches = branches.filter((item) => !isSwitchgearBranchRecord(item));
    const snLineBranches = lineBranches.filter(hasPositiveLineLength);
    const fieldStations = getCollection(model, 'substations').filter((item) => !isGpzSubstationRecord(item));
    const hasGpz = sources.length > 0 || gpzBays.length > 0;
    const firstOpenTerminal = openTerminals[0] ?? null;
    const firstConfiguredField = configuredGpzSnFields[0] ?? null;
    const fieldForTerminal = firstOpenTerminal
      ? configuredGpzSnFields.find((field) => field.ref_id === firstOpenTerminal.element_id) ?? null
      : null;

    if (!hasNetworkTopology) {
      return {
        label: 'Wybierz wariant GPZ z katalogu',
        buttonLabel: 'Rozpocznij',
        stageLabel: 'wybór GPZ',
        sectionTitle: 'Pierwszy układ sieci',
        detail: 'Rozpocznij od kompletnego wariantu GPZ z rozdzielnią SN, sekcjami szyn i polami liniowymi.',
        indicator: '1',
        tone: 'start' as const,
        target: null,
      };
    }

    if (hasGpz && snLineBranches.length === 0) {
      const bay = gpzBays[0] ?? null;
      const bayRef =
        firstOpenTerminal?.element_id
        ?? firstConfiguredField?.ref_id
        ?? (bay ? getRef(bay) : null);
      const bayLabel =
        fieldForTerminal?.name
        ?? firstConfiguredField?.name
        ?? (bay ? getDisplayName(bay, 'Pole liniowe GPZ', 1) : 'Pole liniowe GPZ');
      return {
        label: 'Wyprowadź magistralę SN z pola GPZ',
        buttonLabel: 'Wyprowadź odcinek',
        stageLabel: 'ciąg SN',
        sectionTitle: 'Następny krok projektowy',
        detail: 'GPZ jest utworzony. Teraz wybierz pole liniowe i wyprowadź z jego zacisku pierwszy odcinek magistrali SN.',
        indicator: '2',
        tone: 'next' as const,
        target: bayRef
          ? {
            ref: bayRef,
            label: bayLabel,
            elementType: 'BaySN' as ElementType,
            surfaceCode: 'E-11' as WorkspaceSurfaceCode,
            entityType: 'sn_bay' as EntityTypeCode,
            tabId: 'identyfikacja',
            titlePl: bayLabel,
            operation: 'continue_trunk_segment_sn' as const,
            operationContext: {
              ...(firstOpenTerminal
                ? {
                  field_ref: fieldForTerminal?.ref_id,
                  terminal_id: firstOpenTerminal.element_id,
                  port_id: firstOpenTerminal.port_id,
                  trunk_id: firstOpenTerminal.trunk_id,
                }
                : {
                  field_ref: bayRef,
                  terminal_id: bayRef,
                }),
              terminal_name: bayLabel,
              terminal_voltage_label: 'SN',
            },
          }
          : null,
      };
    }

    if (snLineBranches.length > 0 && fieldStations.length === 0) {
      const segment = snLineBranches[0];
      const segmentRef = getRef(segment);
      const segmentLabel = getDisplayName(segment, 'Odcinek SN', 1);
      return {
        label: 'Osadź stację SN/nN na odcinku',
        buttonLabel: 'Otwórz odcinek',
        stageLabel: 'stacje',
        sectionTitle: 'Następny krok projektowy',
        detail: 'Magistrala jest wyprowadzona. Wstaw stację jako węzeł ciągu SN, a nie jako luźny obiekt na kanwie.',
        indicator: '3',
        tone: 'next' as const,
        target: segmentRef
          ? {
            ref: segmentRef,
            label: segmentLabel,
            elementType: 'LineBranch' as ElementType,
            surfaceCode: 'E-12' as WorkspaceSurfaceCode,
            entityType: 'segment' as EntityTypeCode,
            tabId: 'kabel-sn',
            titlePl: segmentLabel,
          }
          : null,
      };
    }

    if (visibleBlockerCount > 0) {
      return {
        label: `Konfiguracja układu: ${visibleBlockerCount} ${visibleBlockerCount === 1 ? 'zagadnienie' : 'zagadnień'}`,
        buttonLabel: 'Pokaż',
        stageLabel: 'w konfiguracji',
        sectionTitle: `Konfiguracja układu (${visibleBlockerCount})`,
        detail: 'Przejdź przez wskazane zagadnienia techniczne przed analizą.',
        indicator: '△',
        tone: 'warn' as const,
        target: null,
      };
    }

    return {
      label: 'Układ dopuszczony do analizy',
      buttonLabel: 'Analiza',
      stageLabel: 'do analizy',
      sectionTitle: 'Przegląd techniczny',
      detail: 'Układ skonfigurowany do obliczeń.',
      indicator: '●',
      tone: 'ready' as const,
      target: null,
    };
  }, [configuredGpzSnFields, hasNetworkTopology, openTerminals, snapshot, visibleBlockerCount]);
  const treeIsFiltered = treeQuery.trim().length > 0;
  const nextActionLabel = designGuidance.label;
  const nextActionButtonLabel = designGuidance.buttonLabel;

  const handleTreeSelect = (row: TreeRowSpec) => {
    selectElement({ id: row.id, type: row.target.elementType, name: row.label });
    centerSldOnElement(row.id);
    openRouteSurface(row.target.surfaceCode, {
      entityRef: row.id,
      entityType: row.target.entityType,
      subjectKind: 'entity',
      subjectRef: row.id,
      tabId: row.target.tabId,
      titlePl: row.target.titlePl,
      route: row.target.surfaceCode === 'E-04' ? 'analysis' : 'sld',
      openMode: 'replace_right_panel',
      supportsMiniSld: true,
      payload: {
        source: 'model_navigator',
        label: row.label,
        ...(row.target.payload ?? {}),
      },
    });
  };

  const openTechnicalReview = () => {
    openRouteSurface('E-04', {
      entityType: 'analysis_case',
      entityRef: null,
      subjectKind: 'analysis_case',
      subjectRef: null,
      tabId: 'kontrola',
      titlePl: 'Konfiguracja techniczna układu',
      route: 'analysis',
      openMode: 'replace_right_panel',
      supportsMiniSld: false,
    });
  };

  const openAnalysisWorkspace = () => {
    setActiveArea('WYNIKI_ANALIZY');
    navigateToAnalysis({ caseId: activeCaseId, runId: activeRunId });
    openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
      entityType: 'analysis_run',
      entityRef: activeRunId ?? null,
      subjectKind: 'analysis_case',
      subjectRef: activeCaseId ?? null,
      tabId: 'results',
      titlePl: 'Analiza sieciowa i obliczenia',
      route: 'analysis',
      openMode: 'replace_right_panel',
      supportsMiniSld: true,
    });
  };

  const openNextAction = () => {
    if (!hasNetworkTopology) {
      setActiveArea('MODEL_SIECI');
      return;
    }

    if (designGuidance.target) {
      selectElement({
        id: designGuidance.target.ref,
        type: designGuidance.target.elementType,
        name: designGuidance.target.label,
      });
      centerSldOnElement(designGuidance.target.ref);
      const operation = 'operation' in designGuidance.target
        ? designGuidance.target.operation
        : null;
      if (operation) {
        openOperationForm(operation, {
          element_ref: designGuidance.target.ref,
          element_type: designGuidance.target.elementType,
          ...designGuidance.target.operationContext,
        });
        return;
      }
      openRouteSurface(designGuidance.target.surfaceCode, {
        entityRef: designGuidance.target.ref,
        entityType: designGuidance.target.entityType,
        subjectKind: 'entity',
        subjectRef: designGuidance.target.ref,
        tabId: designGuidance.target.tabId,
        titlePl: designGuidance.target.titlePl,
        route: 'sld',
        openMode: 'replace_right_panel',
        supportsMiniSld: true,
        payload: {
          source: 'next_design_action',
          label: designGuidance.target.label,
        },
      });
      return;
    }

    if (designGuidance.tone === 'ready') {
      openAnalysisWorkspace();
      return;
    }

    openTechnicalReview();
  };

  return (
    <div
      data-testid="schemat-context-panel"
      className="flex h-full flex-col overflow-hidden bg-[#0b1720] text-[11px]"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-scada-border px-3">
        <button
          type="button"
          data-testid="schemat-action-show-topology"
          onClick={() => setActiveWorkMode('TE')}
          className="flex min-w-0 items-center gap-2 text-left text-scada-text"
        >
          <ChevronDown />
          <span className="truncate text-[13px] font-semibold">Schemat i topologia</span>
        </button>
        <ChevronDown />
      </div>

      <div className="shrink-0 border-b border-scada-border px-3 py-2">
        <div className="flex items-center justify-between text-[11px] text-scada-muted">
          <span>Następna akcja</span>
          <span className="grid h-4 w-4 place-items-center rounded-full border border-scada-border text-[9px]">i</span>
        </div>
        <button
          type="button"
          data-testid="schemat-action-show-normal-open-points"
          onClick={openNextAction}
          className={clsx(
            'mt-2 flex w-full items-center justify-between rounded-sm border px-2 py-1.5 text-left text-[10px]',
            designGuidance.tone === 'start'
              ? 'border-cyan-500/45 bg-cyan-500/10 text-cyan-100'
              : designGuidance.tone === 'warn'
                ? 'border-amber-500/45 bg-amber-500/10 text-amber-100'
                : designGuidance.tone === 'next'
                  ? 'border-cyan-500/45 bg-cyan-500/10 text-cyan-100'
                  : 'border-emerald-500/30 bg-emerald-500/8 text-emerald-200',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className={designGuidance.tone === 'warn' ? 'text-amber-400' : designGuidance.tone === 'ready' ? 'text-emerald-400' : 'text-cyan-300'}>
              {designGuidance.indicator}
            </span>
            <span className="truncate">{nextActionLabel}</span>
          </span>
          <span className="text-cyan-300">{nextActionButtonLabel}</span>
        </button>
      </div>

      <div className="shrink-0 border-b border-scada-border px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-semibold text-scada-muted">Etap układu</span>
          <span className="font-mono text-scada-text">{designGuidance.stageLabel}</span>
        </div>
      </div>

      <div className="shrink-0 border-b border-scada-border px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className={clsx('font-semibold', visibleBlockerCount > 0 ? 'text-amber-300' : 'text-scada-muted')}>
            {!hasNetworkTopology
              ? designGuidance.sectionTitle
              : visibleBlockerCount > 0
                ? designGuidance.sectionTitle
                : designGuidance.sectionTitle}
          </span>
          {hasNetworkTopology && designGuidance.tone === 'warn' && (
            <button
              type="button"
              data-testid="schemat-action-show-result-layers"
              onClick={openTechnicalReview}
              className="text-[10px] text-cyan-300 hover:text-cyan-100"
            >
              Pokaż
            </button>
          )}
        </div>
        {visibleBlockers.length > 0 ? (
          <div className="space-y-1">
            {visibleBlockers.slice(0, 4).map((blocker, index) => (
              <div
                key={`${blocker.id}:${blocker.refs.join('|')}:${index}`}
                className="flex items-center gap-2 text-[10px] text-scada-muted"
              >
                <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                <span className="truncate">{blocker.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-scada-muted">
            {hasNetworkTopology
              ? designGuidance.detail
              : designGuidance.detail}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        <input
          data-testid="project-tree-search-input"
          value={treeQuery}
          onChange={(event) => setTreeQuery(event.target.value)}
          className="mb-2 h-7 w-full rounded-sm border border-scada-border bg-[#07111f] px-2 text-[10px] text-scada-text outline-none focus:border-cyan-500"
          placeholder="Szukaj układu"
          aria-label="Szukaj w układzie sieci"
        />
        {sections.length > 0 ? (
          <div data-testid="project-tree">
            {sections.map((section) => {
              const visibleLimit = treeIsFiltered ? section.rows.length : visibleTreeRowsLimit(section.title);
              const visibleRows = section.rows.slice(0, visibleLimit);
              const hiddenRowsCount = section.rows.length - visibleRows.length;
              return (
                <div key={section.title} className="mb-1">
                  <div className="flex h-7 items-center gap-1.5 rounded-sm px-1.5 text-scada-text">
                    <ChevronDown />
                    <span className="min-w-0 flex-1 truncate font-semibold">{section.title}</span>
                    <StateDot state="ok" />
                    <span className="rounded-sm border border-scada-border bg-[#101d28] px-1.5 font-mono text-[10px] text-scada-muted">
                      {section.badge}
                    </span>
                  </div>
                  <div className="ml-2 border-l border-scada-border/80">
                    {visibleRows.map((row, index) => (
                      <TreeRow
                        key={`${row.id}:${index}`}
                        id={row.id}
                        label={row.label}
                        meta={row.meta}
                        state={row.state}
                        indent={row.indent}
                        selected={selectedElementId === row.id}
                        onSelect={() => handleTreeSelect(row)}
                      />
                    ))}
                    {hiddenRowsCount > 0 && (
                      <div
                        className="ml-3 mt-1 rounded-sm border border-scada-border/70 bg-[#07111f] px-2 py-1 text-[10px] text-scada-muted"
                        data-testid={`model-tree-overflow-${slugForTestId(section.title)}`}
                      >
                        {hiddenRowsCount} pozycji dostępnych przez wyszukiwarkę albo kartę układu.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-sm border border-scada-border bg-[#0a141d] p-3 text-[11px] leading-snug text-scada-muted">
            {!snapshot && <span className="mb-2 block font-semibold text-scada-text">Start pustej kanwy</span>}
            {snapshot ? (
              'Rozpocznij konfigurację od kompletnego wariantu GPZ z rozdzielnią SN i wyprowadzeniami.'
            ) : (
              <div className="space-y-1">
                <div>1. Wybierz albo utwórz zakres obliczeń.</div>
                <div>2. Dodaj GPZ z parametrami zwarciowymi.</div>
                <div>3. Wyprowadź magistralę SN, stacje i układy PV/BESS/FW.</div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex h-12 shrink-0 items-center gap-2 border-t border-scada-border p-2">
        <button
          type="button"
          data-testid="schemat-action-go-model"
          onClick={() => setActiveArea('MODEL_SIECI')}
          className="flex h-9 flex-1 items-center gap-2 rounded-sm border border-scada-border bg-[#0a141d] px-2 text-scada-muted hover:border-cyan-500/55 hover:text-scada-text"
        >
          <span className="text-lg leading-none">+</span>
          <span>{hasNetworkTopology ? 'Dodaj układ' : 'Przejdź do budowy GPZ'}</span>
        </button>
        <button
          type="button"
          data-testid="left-panel-mode-readiness"
          onClick={openTechnicalReview}
          className="h-9 rounded-sm border border-scada-border bg-[#0a141d] px-2 text-[10px] text-cyan-300 hover:border-cyan-500/55 hover:text-scada-text"
        >
          Konfiguracja
        </button>
        <div className="grid h-9 min-w-10 place-items-center rounded-sm border border-scada-border bg-[#0a141d] px-2 font-mono text-[10px] text-scada-muted">
          {elementCount}
        </div>
      </div>
    </div>
  );
}

function filterTreeSections(sections: TreeSectionSpec[], query: string): TreeSectionSpec[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return sections;
  return sections
    .map((section) => ({
      ...section,
      rows: section.rows.filter((row) =>
        `${row.label} ${row.meta ?? ''} ${row.id}`.toLowerCase().includes(normalized),
      ),
    }))
    .filter((section) => section.rows.length > 0)
    .sort((left, right) => treeSearchPriority(left.title) - treeSearchPriority(right.title));
}

function treeSearchPriority(title: string): number {
  if (title.includes('Odcinki')) return 0;
  if (title.includes('Stacje')) return 1;
  if (title.includes('Pola')) return 2;
  if (title.includes('Aparatura')) return 3;
  if (title.includes('Szyny')) return 4;
  return 4;
}

function buildTreeSections(snapshot: SnapshotRecord | null, blockerRefs: Set<string>): TreeSectionSpec[] {
  if (!snapshot) return [];

  const branches = getCollection(snapshot, 'branches');
  const lineBranches = branches.filter((item) => !isSwitchgearBranchRecord(item));
  const gpzBays = getCollection(snapshot, 'bays').filter(isGpzScopedRecord);
  const fieldStations = getCollection(snapshot, 'substations').filter((item) => !isGpzSubstationRecord(item));
  const sections = [
    buildSection('GPZ i zasilanie', getCollection(snapshot, 'sources'), 'Układ zasilania GPZ', blockerRefs, sourceTarget, undefined),
    buildSection('Pola GPZ', gpzBays, 'Pole GPZ', blockerRefs, bayTarget, (item) => formatBayRole(item)),
    buildSection('Stacje SN/nN', fieldStations, 'Stacja', blockerRefs, stationTarget, (item) => formatStationType(item), formatStationTreeLabel),
    buildSection('Magistrale i odcinki SN', lineBranches, 'Odcinek', blockerRefs, branchTarget, (item) => formatBranchMeta(item)),
    buildSection('Układy PV/BESS/FW', getCollection(snapshot, 'generators'), 'Układ', blockerRefs, generatorTarget, (item) => formatGeneratorMeta(item, snapshot)),
    buildSection('Odbiory nN', getCollection(snapshot, 'loads'), 'Odbiór', blockerRefs, loadTarget, (item) => formatLoadMeta(item)),
  ];

  return sections.filter((section): section is TreeSectionSpec => section !== null);
}

function buildSection(
  title: string,
  items: SnapshotRecord[],
  fallbackLabel: string,
  blockerRefs: Set<string>,
  target: (item: SnapshotRecord, label: string) => NavigatorTarget,
  meta?: (item: SnapshotRecord) => string | undefined,
  labelFactory?: (item: SnapshotRecord, index: number, fallbackLabel: string) => string,
): TreeSectionSpec | null {
  if (items.length === 0) return null;

  return {
    title,
    badge: String(items.length),
    rows: items.map((item, index) => {
      const id = getRef(item) || `${title}:${index}`;
      const label = labelFactory?.(item, index, fallbackLabel)
        ?? (target === generatorTarget
          ? formatGeneratorTreeLabel(item, index, items)
          : getDisplayName(item, fallbackLabel, index + 1));
      return {
        id,
        label,
        meta: meta?.(item),
        state: blockerRefs.has(id) ? 'warn' : 'ok',
        indent: 1,
        target: target(item, label),
      };
    }),
  };
}

function sourceTarget(_item: SnapshotRecord, label: string): NavigatorTarget {
  return {
    elementType: 'Source',
    surfaceCode: 'E-10',
    entityType: 'gpz',
    titlePl: label || 'Główny punkt zasilający',
    tabId: 'uproszczony',
  };
}

function bayTarget(_item: SnapshotRecord, label: string): NavigatorTarget {
  return {
    elementType: 'BaySN',
    surfaceCode: 'E-11',
    entityType: 'sn_bay',
    titlePl: label || 'Pole SN',
    tabId: 'identyfikacja',
  };
}

function branchTarget(_item: SnapshotRecord, label: string): NavigatorTarget {
  return {
    elementType: 'LineBranch',
    surfaceCode: 'E-12',
    entityType: 'segment',
    titlePl: label || 'Odcinek SN',
    tabId: 'kabel-sn',
  };
}

function stationTarget(_item: SnapshotRecord, label: string): NavigatorTarget {
  return {
    elementType: 'Station',
    surfaceCode: 'E-13',
    entityType: 'station',
    titlePl: label || 'Stacja SN/nN',
    tabId: 'topologia',
  };
}

function generatorTarget(item: SnapshotRecord, label: string): NavigatorTarget {
  const kind = `${asText(item.gen_type)} ${asText(item.type)} ${asText(item.source_type)} ${asText(item.kind)} ${label}`.toLowerCase();
  if (kind.includes('bess') || kind.includes('pcs') || kind.includes('magazyn')) {
    return {
      elementType: 'BESSInverter',
      surfaceCode: 'E-22',
      entityType: 'bess_source',
      titlePl: label || 'Magazyn energii',
      tabId: 'identyfikacja',
      payload: { sourceRole: 'BESS_CONVERTER' },
    };
  }
  if (kind.includes('fw') || kind.includes('wind') || kind.includes('wiatr') || kind.includes('turb')) {
    return {
      elementType: 'Generator',
      surfaceCode: 'E-23',
      entityType: 'fw_source',
      titlePl: label || 'Farma wiatrowa',
      tabId: 'identyfikacja',
      payload: { sourceRole: 'WIND_SOURCE' },
    };
  }
  return {
    elementType: 'PVInverter',
    surfaceCode: 'E-21',
    entityType: 'pv_source',
    titlePl: label || 'Falownik PV',
    tabId: 'identyfikacja',
    payload: { sourceRole: 'PV_INVERTER' },
  };
}

function loadTarget(_item: SnapshotRecord, label: string): NavigatorTarget {
  return {
    elementType: 'LoadNN',
    surfaceCode: 'E-19',
    entityType: 'station_lv_side',
    titlePl: label || 'Odbiór nN',
    tabId: 'odplywy',
  };
}

function getCollection(snapshot: SnapshotRecord | null, key: string): SnapshotRecord[] {
  const value = snapshot?.[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is SnapshotRecord {
  return Boolean(value) && typeof value === 'object';
}

function isSwitchgearBranchRecord(item: SnapshotRecord): boolean {
  return ['switch', 'breaker', 'bus_coupler', 'disconnector', 'fuse'].includes(asText(item.type));
}

function hasPositiveLineLength(item: SnapshotRecord): boolean {
  const raw = item.length_km ?? item.lengthKm ?? item.length;
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) && value > 0;
}

function isGpzScopedRecord(item: SnapshotRecord): boolean {
  const ref = getRef(item);
  const substationRef = asText(item.substation_ref);
  return ref.startsWith('gpz/') || substationRef.startsWith('gpz/');
}

function isGpzSubstationRecord(item: SnapshotRecord): boolean {
  const ref = getRef(item);
  const type = asText(item.station_type).toLowerCase();
  return ref.startsWith('gpz/') || type.includes('gpz');
}

function getRef(item: SnapshotRecord): string {
  return String(item.ref_id ?? item.id ?? '');
}

function getDisplayName(item: SnapshotRecord, fallbackLabel: string, ordinal: number): string {
  const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : null;
  if (name && !containsTechnicalReference(name)) return name;
  return `${fallbackLabel} ${String(ordinal).padStart(2, '0')}`;
}

function containsTechnicalReference(value: string): boolean {
  return /\/(?:segment|station|source|bay|bus|branch)\b/i.test(value)
    || /\b(?:do\s+punktu|za\s+punktem)\s+rozga/i.test(value)
    || /\b(?:seg|gpz|stn|bay|bus|src)\/[a-z0-9/_#-]{12,}/i.test(value)
    || /\b[0-9a-f]{24,}\b/i.test(value)
    || /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(value);
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function formatBayRole(item: SnapshotRecord): string | undefined {
  const role = asText(item.bay_role).toUpperCase();
  switch (role) {
    case 'IN':
    case 'INCOMING':
    case 'DOPLYW':
    case 'DOPŁYW':
      return 'pole dopływowe';
    case 'OUT':
    case 'OUTGOING':
    case 'ODPLYW':
    case 'ODPŁYW':
      return 'pole odpływowe';
    case 'TR':
    case 'TRANSFORMER':
      return 'pole transformatorowe';
    case 'COUPLER':
    case 'SECTION':
    case 'SEKCJA':
      return 'sprzęgło / pole sekcyjne';
    case 'METERING':
    case 'POMIAR':
      return 'pole pomiarowe';
    case 'SOURCE':
    case 'OZE':
      return 'pole przyłączeniowe';
    default:
      return role ? 'pole SN' : undefined;
  }
}

function formatBranchMeta(item: SnapshotRecord): string | undefined {
  const parts: string[] = [];
  parts.push(readBranchCatalogLabel(item) ?? branchTypeLabel(item.type));
  if (typeof item.length_km === 'number') parts.push(formatLengthKm(item.length_km, { decimals: 2 }));
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function branchTypeLabel(value: unknown): string {
  switch (value) {
    case 'line_overhead':
      return 'linia napowietrzna SN';
    case 'cable':
      return 'kabel SN';
    default:
      return 'odcinek SN';
  }
}

function readBranchCatalogLabel(item: SnapshotRecord): string | null {
  const catalogData = readBranchCatalogData(item);
  for (const key of ['trade_name', 'type_designation', 'type_label', 'catalog_label', 'display_name', 'designation', 'name']) {
    const raw = catalogData?.[key];
    if (typeof raw === 'string' && raw.trim()) {
      return formatCatalogTypeLabel(raw, catalogData);
    }
  }
  const direct = item.catalog_ref;
  if (typeof direct === 'string' && direct.trim()) {
    return formatCatalogTypeLabel(direct, catalogData);
  }
  const binding = item.catalog_binding;
  if (isRecord(binding)) {
    const catalogItemId = binding.catalog_item_id;
    if (typeof catalogItemId === 'string' && catalogItemId.trim()) {
      return formatCatalogTypeLabel(catalogItemId, catalogData);
    }
  }
  return null;
}

function readBranchCatalogData(item: SnapshotRecord): SnapshotRecord | null {
  const materialized = isRecord(item.materialized_params)
    ? { ...item.materialized_params }
    : {};
  for (const key of [
    'return_conductor_cross_section_mm2',
    'return_conductor_material',
    'return_conductor_r_ohm_per_km_20c',
    'return_conductor_jth_1s_a_per_mm2',
    'return_conductor_ith_1s_a',
    'cross_section_mm2',
    'number_of_cores',
    'conductor_material',
  ]) {
    const value = item[key];
    if (value !== null && value !== undefined) materialized[key] = value;
  }
  return Object.keys(materialized).length > 0 ? materialized : null;
}

function formatCatalogTypeLabel(raw: string, catalogData?: SnapshotRecord | null): string {
  const value = raw.trim();
  const overheadLineLabel = formatOverheadLineCatalogLabel(value);
  if (overheadLineLabel) return overheadLineLabel;
  const canonicalCable = value.match(/^cable-base-(xlpe|epr)-(al|cu)-([13])c-(\d+)$/i);
  if (canonicalCable) {
    const [, insulation, conductor, cores, section] = canonicalCable;
    const phaseSet = cores === '1' ? `3×1×${section}` : `3×${section}`;
    return `Kabel SN ${insulation.toUpperCase()} ${conductor.toLowerCase() === 'cu' ? 'Cu' : 'Al'} ${phaseSet} mm²`;
  }
  if (!value) return 'typ katalogowy nieokreślony';
  if (/^[A-Z0-9ĄĆĘŁŃÓŚŹŻ\s/.-]+$/.test(value) && /\d/.test(value)) {
    return formatSingleCoreMvCableCircuitLabel(value.replace(/\s+/g, ' '), catalogData);
  }
  const normalized = value
    .replace(/^cable[-_]/i, '')
    .replace(/^line[-_]/i, '')
    .replace(/^enea[-_\s]+operator[-_\s]+/i, '')
    .replace(/^tfk[-_]/i, '')
    .replace(/^nkt[-_]/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const label = normalized.replace(/^base\s+al\s+st\b/i, 'Al/St');
  const publicLabel = label
    .replace(/\b(na2xs2y|n2xs2y|yakxs|xruhakxs|yky|haknft|afl|al|st|cu)\b/gi, (match) => match.toUpperCase())
    .replace(/\b1c\s+(\d+)\b/gi, '1x$1')
    .replace(/\b(\d+)x(\d+)\b/gi, (_match, cores: string, section: string) => `${cores}x${section}`)
    .replace(/\b([a-ząćęłńóśźż])/g, (match) => match.toUpperCase());
  return formatSingleCoreMvCableCircuitLabel(publicLabel, catalogData);
}

function formatOverheadLineCatalogLabel(raw: string): string | null {
  const value = raw.trim();
  const match = value.match(/^line[-_\s]+base[-_\s]+(al[-_\s]*st|afl(?:[-_\s]*6)?|al|cu|st)[-_\s]+(\d{2,4})$/i)
    ?? value.match(/^base\s+(al[-\s]*st|afl(?:[-\s]*6)?|al|cu|st)\s*(\d{2,4})$/i);
  if (!match) return null;
  const materialRaw = match[1].replace(/[-_\s]+/g, '').toLowerCase();
  const material = materialRaw === 'alst'
    ? 'Al/St'
    : materialRaw.startsWith('afl')
      ? 'AFL-6'
      : materialRaw === 'al'
        ? 'Al'
        : materialRaw === 'cu'
          ? 'Cu'
          : 'St';
  return `Linia napowietrzna ${material} ${match[2]} mm²`;
}

function formatSingleCoreMvCableCircuitLabel(raw: string, catalogData?: SnapshotRecord | null): string {
  const value = addReturnConductorSection(stripCableOwnerPrefix(raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b([13])\s*[xX×]\s*([13])\s*[xX×]\s*(\d{2,4})/g, '$1×$2×$3')
    .replace(/\b([13])\s*[xX×]\s*(\d{2,4})(\s*\/\s*\d{1,3})?/g, (_match, count: string, section: string, screen: string | undefined) => {
      const normalizedScreen = screen ? screen.replace(/\s+/g, '') : '';
      return `${count}×${section}${normalizedScreen}`;
    })), catalogData);
  if (!value) return raw;
  if (/^3\s*[x×]\s+/i.test(value) || /\b3\s*[x×]\s*(?:1\s*[x×]\s*)?\d{2,4}\b/i.test(value)) {
    return value;
  }
  if (
    /\b1×\d{2,4}(?:\s*\/\s*\d{1,3})?\b/i.test(value)
    && /\b(?:Kabel\s+SN|NA2XS2Y|N2XS2Y|XRUHAKXS|YHAKXS|YHKXS|YAKXS)\b/i.test(value)
  ) {
    const withUnit = /\bmm(?:2|²)\b/i.test(value)
      ? value
      : value.replace(/(\b1×\d{2,4}(?:\s*\/\s*\d{1,3})?)(?!\s*mm)/i, '$1 mm²');
    return `3 × ${withUnit}`;
  }
  return value;
}

function stripCableOwnerPrefix(raw: string): string {
  return raw
    .replace(/^\s*ENEA\s+OPERATOR\s+STANDARD\s*[-–—]?\s*/i, '')
    .replace(/^\s*ENEA\s+OPERATOR\s*[-–—]?\s*/i, '')
    .replace(/^\s*TELE[-\s]?FONIKA\s+KABLE\s*[-–—]?\s*/i, '')
    .replace(/^\s*TFK\s+STANDARD\s*[-–—]?\s*/i, '')
    .replace(/^\s*NKT\s+STANDARD\s*[-–—]?\s*/i, '')
    .trim();
}

function addReturnConductorSection(raw: string, catalogData?: SnapshotRecord | null): string {
  const screenSection = readReturnConductorSection(catalogData);
  if (!screenSection) return raw;
  return raw.replace(
    /\b1×(\d{2,4})(?!\s*\/)(\s*mm(?:2|²))?\b/i,
    (_match, phaseSection: string, unit: string | undefined) => `1×${phaseSection}/${screenSection}${unit ?? ''}`,
  );
}

function readReturnConductorSection(catalogData?: SnapshotRecord | null): string | null {
  const raw = catalogData?.return_conductor_cross_section_mm2;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value.toLocaleString('pl-PL', { maximumFractionDigits: 0 });
}
function formatStationType(item: SnapshotRecord): string | undefined {
  const type = asText(item.station_type).toLowerCase();
  if (type.includes('gpz')) return 'GPZ';
  if (type.includes('inline') || type.includes('przelot')) return 'stacja przelotowa';
  if (type.includes('terminal') || type.includes('konc') || type.includes('końc')) return 'stacja końcowa';
  if (type.includes('section') || type.includes('sekcj')) return 'stacja sekcyjna';
  if (type.includes('branch') || type.includes('rozgal') || type.includes('rozgał')) return 'stacja rozgałęźna';
  if (type.includes('consumer') || type.includes('odbior')) return 'stacja odbiorcza';
  if (type.includes('rmu') || type.includes('mv_lv') || type.includes('sn')) return 'stacja SN/nN';
  return type ? 'stacja elektroenergetyczna' : undefined;
}

function formatStationTreeLabel(item: SnapshotRecord, index: number, fallbackLabel: string): string {
  const code = asText(item.station_code) || asText(item.code);
  if (code.trim()) return code.trim().toUpperCase();
  const name = asText(item.name).trim();
  if (name && !/^stacja\s+(inline|terminal|sectional|branch)$/i.test(name) && !containsTechnicalReference(name)) {
    return name;
  }
  if (fallbackLabel === 'Stacja') return `S${String(index + 1).padStart(2, '0')}`;
  return `${fallbackLabel} ${String(index + 1).padStart(2, '0')}`;
}

function formatGeneratorMeta(item: SnapshotRecord, snapshot?: SnapshotRecord | null): string | undefined {
  const parts: string[] = [];
  const kind = formatGeneratorKind(item);
  if (kind) parts.push(kind);
  const stationLabel = snapshot ? generatorStationLabel(item, snapshot) : '';
  if (stationLabel) parts.push(stationLabel);
  if (typeof item.p_mw === 'number') parts.push(formatPowerMw(item.p_mw));
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function generatorStationLabel(item: SnapshotRecord, snapshot: SnapshotRecord): string {
  const stationRef = generatorStationRef(item);
  if (!stationRef) return '';
  const stations = getCollection(snapshot, 'substations').filter((station) => !isGpzSubstationRecord(station));
  const index = stations.findIndex((station) => getRef(station) === stationRef || asText(station.id) === stationRef);
  if (index < 0) return '';
  return formatStationTreeLabel(stations[index], index, 'Stacja');
}

function formatGeneratorTreeLabel(item: SnapshotRecord, index: number, generators: SnapshotRecord[]): string {
  const kind = formatGeneratorShortKind(item);
  const key = generatorGroupKey(item);
  const group = generators.filter((generator) => generatorGroupKey(generator) === key);
  const groupIndex = Math.max(0, group.findIndex((generator) => getRef(generator) === getRef(item))) + 1;
  const suffix = group.length > 1 ? ` · układ ${groupIndex}` : '';
  const publicSuffix = suffix.replace(/\u00c2\u00b7/g, '·').replace(/\u0139\u201a/g, 'ł');
  return `${kind} ${String(index + 1).padStart(2, '0')}${publicSuffix}`;
}

function generatorGroupKey(item: SnapshotRecord): string {
  return [
    formatGeneratorShortKind(item),
    generatorStationRef(item) || asText(item.bus_ref) || getRef(item),
  ].join('|');
}

function generatorStationRef(item: SnapshotRecord): string {
  if (asText(item.station_ref)) return asText(item.station_ref);
  if (asText(item.substation_ref)) return asText(item.substation_ref);
  const meta = item.meta;
  if (isRecord(meta) && asText(meta.station_ref)) return asText(meta.station_ref);
  return '';
}

function formatGeneratorShortKind(item: SnapshotRecord): string {
  const kind = `${asText(item.gen_type)} ${asText(item.type)} ${asText(item.source_type)} ${asText(item.kind)} ${asText(item.name)}`.toLowerCase();
  if (kind.includes('bess') || kind.includes('pcs') || kind.includes('battery') || kind.includes('magazyn')) return 'BESS';
  if (kind.includes('wind') || kind.includes('fw') || kind.includes('wiatr') || kind.includes('turb')) return 'FW';
  if (kind.includes('pv') || kind.includes('solar') || kind.includes('fotowolta')) return 'PV';
  return 'OZE';
}

function formatGeneratorKind(item: SnapshotRecord): string | null {
  const kind = `${asText(item.gen_type)} ${asText(item.type)} ${asText(item.source_type)} ${asText(item.kind)}`.toLowerCase();
  if (kind.includes('bess') || kind.includes('pcs') || kind.includes('battery')) return 'magazyn energii';
  if (kind.includes('wind') || kind.includes('fw') || kind.includes('wiatr')) return 'układ farmy wiatrowej';
  if (kind.includes('pv') || kind.includes('solar') || kind.includes('inverter')) return 'falownik PV';
  return kind.trim() ? 'układ PV/BESS/FW' : null;
}

function formatLoadMeta(item: SnapshotRecord): string | undefined {
  return typeof item.p_mw === 'number' ? formatPowerMw(item.p_mw) : undefined;
}

function formatPowerMw(value: number): string {
  return `${value.toLocaleString('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).replace(/\u00A0/g, ' ').replace(/\u202F/g, ' ')} MW`;
}

function collectIssueRefs(record: Record<string, unknown>): string[] {
  const refs = new Set<string>();
  for (const key of ['element_ref', 'elementRef', 'ref_id', 'refId']) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) refs.add(value);
  }
  const list = record.element_refs ?? record.elementRefs;
  if (Array.isArray(list)) {
    for (const value of list) {
      if (typeof value === 'string' && value.length > 0) refs.add(value);
    }
  }
  return Array.from(refs);
}

function TreeRow({
  id,
  label,
  meta,
  state,
  indent = 0,
  selected = false,
  onSelect,
}: {
  id: string;
  label: string;
  meta?: string;
  state: RowState;
  indent?: number;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`model-tree-row-${id}`}
      onClick={onSelect}
      className={clsx(
        'group flex h-6 w-full items-center gap-1.5 rounded-sm border border-transparent px-1.5 text-left text-[10px]',
        selected
          ? 'border-cyan-500/55 bg-cyan-500/12 text-cyan-100'
          : 'text-scada-muted hover:bg-scada-active/60 hover:text-scada-text',
      )}
      style={{ paddingLeft: `${6 + indent * 12}px` }}
    >
      <span className="h-px w-2 bg-scada-border" />
      <span className="grid h-3 w-3 place-items-center rounded-full border border-scada-border text-[7px]">⊙</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta && <span className="shrink-0 text-scada-muted" aria-hidden="true"> · </span>}
      {meta && <span className="max-w-[48%] truncate font-mono text-[10px] text-scada-muted">{meta}</span>}
      <StateDot state={state} />
      {selected && <span className="text-scada-muted">⋮</span>}
    </button>
  );
}

function StateDot({ state }: { state: RowState }) {
  if (state === 'warn') return <span className="text-amber-400">△</span>;
  if (state === 'danger') return <span className="text-rose-400">△</span>;
  if (state === 'group') return <span className="text-scada-muted">•</span>;
  return <span className="text-emerald-400">●</span>;
}

function ChevronDown() {
  return (
    <svg className="h-3 w-3 shrink-0 text-scada-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
