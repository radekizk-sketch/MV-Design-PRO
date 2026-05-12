import { useMemo, useState } from 'react';
import { clsx } from 'clsx';

import { useAppStateStore } from '../../app-state/store';
import { useNetworkBuildDerived, useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useSelectionStore } from '../../selection';
import type { ElementType } from '../../types';
import type { EntityTypeCode, WorkspaceSurfaceCode } from '../../workspace/types';

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

export function SchematContextPanel() {
  const setActiveArea = useAppStateStore((s) => s.setActiveArea);
  const setActiveWorkMode = useAppStateStore((s) => s.setActiveWorkMode);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const selectedElementId = useSelectionStore((s) => s.selectedElements[0]?.id ?? null);
  const { blockersByCategory, isReady } = useNetworkBuildDerived();
  const [treeQuery, setTreeQuery] = useState('');

  const blockers = useMemo(() => {
    const readinessBlockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
    return readinessBlockers.map((blocker, index) => {
      const record = blocker as Record<string, unknown>;
      return {
        id: String(record.id ?? record.code ?? record.element_ref ?? index),
        label: String(record.message_pl ?? record.message ?? record.label ?? record.code ?? 'Blokada modelu'),
        refs: collectIssueRefs(record),
      };
    });
  }, [readiness]);

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
  const blockerCount = blockers.length || (blockersByCategory?.total ?? 0);
  const readinessPercent = snapshot ? (isReady ? 100 : Math.max(0, Math.min(99, 100 - blockerCount * 12))) : 0;
  const nextActionLabel = !snapshot
    ? 'Dodaj GPZ jako pierwszy element modelu'
    : blockerCount > 0
      ? `${blockerCount} ${blockerCount === 1 ? 'element wymaga' : 'elementów wymaga'} uzupełnienia danych`
      : 'Brak aktywnych blokad modelu';
  const nextActionButtonLabel = snapshot ? 'Pokaż' : 'Buduj';

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

  const openReadiness = () => {
    openRouteSurface('E-04', {
      entityType: 'analysis_case',
      entityRef: null,
      subjectKind: 'analysis_case',
      subjectRef: null,
      tabId: blockerCount > 0 ? 'braki' : 'gotowosc',
      titlePl: blockerCount > 0 ? 'Braki danych modelu' : 'Gotowość obliczeń',
      route: 'analysis',
      openMode: 'replace_right_panel',
      supportsMiniSld: false,
    });
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
          onClick={() => {
            if (!snapshot) {
              setActiveArea('MODEL_SIECI');
              return;
            }
            openReadiness();
          }}
          className={clsx(
            'mt-2 flex w-full items-center justify-between rounded-sm border px-2 py-1.5 text-left text-[10px]',
            !snapshot
              ? 'border-cyan-500/45 bg-cyan-500/10 text-cyan-100'
              : blockerCount > 0
                ? 'border-amber-500/45 bg-amber-500/10 text-amber-100'
                : 'border-emerald-500/30 bg-emerald-500/8 text-emerald-200',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className={!snapshot ? 'text-cyan-300' : blockerCount > 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {!snapshot ? '1' : blockerCount > 0 ? '△' : '●'}
            </span>
            <span className="truncate">{nextActionLabel}</span>
          </span>
          <span className="text-cyan-300">{nextActionButtonLabel}</span>
        </button>
      </div>

      <div className="shrink-0 border-b border-scada-border px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-semibold text-scada-muted">Gotowość schematu</span>
          <span className="font-mono text-scada-text">{snapshot ? `${readinessPercent}%` : '—'}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#162536]">
          <div
            className={clsx('h-full', isReady ? 'bg-emerald-400' : 'bg-amber-400')}
            style={{ width: `${readinessPercent}%` }}
          />
        </div>
      </div>

      <div className="shrink-0 border-b border-scada-border px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className={clsx('font-semibold', blockerCount > 0 ? 'text-rose-400' : 'text-scada-muted')}>
            Blokery ({blockerCount})
          </span>
          <button
            type="button"
            data-testid="schemat-action-show-result-layers"
            onClick={openReadiness}
            className="text-[10px] text-cyan-300 hover:text-cyan-100"
          >
            Pokaż wszystkie
          </button>
        </div>
        {blockers.length > 0 ? (
          <div className="space-y-1">
            {blockers.slice(0, 4).map((blocker, index) => (
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
            {snapshot
              ? 'Brak blokad w aktualnym stanie modelu.'
              : 'Brak modelu do sprawdzenia. Najpierw przejdź do budowy GPZ.'}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        <input
          data-testid="project-tree-search-input"
          value={treeQuery}
          onChange={(event) => setTreeQuery(event.target.value)}
          className="mb-2 h-7 w-full rounded-sm border border-scada-border bg-[#07111f] px-2 text-[10px] text-scada-text outline-none focus:border-cyan-500"
          placeholder="Szukaj obiektu"
          aria-label="Szukaj w drzewie modelu"
        />
        {sections.length > 0 ? (
          <div data-testid="project-tree">
            {sections.map((section) => (
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
                  {section.rows.map((row, index) => (
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
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-sm border border-scada-border bg-[#0a141d] p-3 text-[11px] leading-snug text-scada-muted">
            {!snapshot && <span className="mb-2 block font-semibold text-scada-text">Start pustej kanwy</span>}
            {snapshot ? (
              'Aktualna wersja modelu nie zawiera elementów schematu do pokazania w drzewie.'
            ) : (
              <div className="space-y-1">
                <div>1. Wybierz albo utwórz zakres obliczeń.</div>
                <div>2. Dodaj GPZ z parametrami zwarciowymi.</div>
                <div>3. Wyprowadź magistralę SN, stacje i OZE/BESS.</div>
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
          <span>{snapshot ? 'Dodaj element' : 'Przejdź do budowy GPZ'}</span>
        </button>
        <button
          type="button"
          data-testid="left-panel-mode-readiness"
          onClick={openReadiness}
          className="h-9 rounded-sm border border-scada-border bg-[#0a141d] px-2 text-[10px] text-cyan-300 hover:border-cyan-500/55 hover:text-scada-text"
        >
          Gotowość
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
  if (title.includes('Szyny')) return 3;
  return 4;
}

function buildTreeSections(snapshot: SnapshotRecord | null, blockerRefs: Set<string>): TreeSectionSpec[] {
  if (!snapshot) return [];

  const sections = [
    buildSection('GPZ i źródła', getCollection(snapshot, 'sources'), 'Źródło zasilania', blockerRefs, sourceTarget, undefined),
    buildSection('Szyny SN', getCollection(snapshot, 'buses'), 'Szyna', blockerRefs, busTarget, (item) => formatVoltage(item)),
    buildSection('Pola SN', getCollection(snapshot, 'bays'), 'Pole', blockerRefs, bayTarget, (item) => formatBayRole(item)),
    buildSection('Odcinki SN', getCollection(snapshot, 'branches'), 'Odcinek', blockerRefs, branchTarget, (item) => formatBranchMeta(item)),
    buildSection('Stacje SN/nN', getCollection(snapshot, 'substations'), 'Stacja', blockerRefs, stationTarget, (item) => formatStationType(item)),
    buildSection('Transformatory', getCollection(snapshot, 'transformers'), 'Transformator', blockerRefs, transformerTarget, (item) => formatTransformerMeta(item)),
    buildSection('Źródła i magazyny', getCollection(snapshot, 'generators'), 'Źródło', blockerRefs, generatorTarget, (item) => formatGeneratorMeta(item)),
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
): TreeSectionSpec | null {
  if (items.length === 0) return null;

  return {
    title,
    badge: String(items.length),
    rows: items.map((item, index) => {
      const id = getRef(item) || `${title}:${index}`;
      const label = getDisplayName(item, fallbackLabel);
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

function busTarget(_item: SnapshotRecord, label: string): NavigatorTarget {
  return {
    elementType: 'Bus',
    surfaceCode: 'E-10',
    entityType: 'gpz_section',
    titlePl: label || 'Szyna SN',
    tabId: 'szyny-sn',
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

function transformerTarget(_item: SnapshotRecord, label: string): NavigatorTarget {
  return {
    elementType: 'TransformerBranch',
    surfaceCode: 'E-18',
    entityType: 'station',
    titlePl: label || 'Transformator',
    tabId: 'transformator',
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

function getRef(item: SnapshotRecord): string {
  return String(item.ref_id ?? item.id ?? '');
}

function getDisplayName(item: SnapshotRecord, fallbackLabel: string): string {
  const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : null;
  const ref = getRef(item);
  return name ?? (ref || fallbackLabel);
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function formatVoltage(item: SnapshotRecord): string | undefined {
  return typeof item.voltage_kv === 'number' ? `${item.voltage_kv} kV` : undefined;
}

function formatBayRole(item: SnapshotRecord): string | undefined {
  return typeof item.bay_role === 'string' ? item.bay_role : undefined;
}

function formatBranchMeta(item: SnapshotRecord): string | undefined {
  const parts: string[] = [];
  parts.push(readBranchCatalogLabel(item) ?? branchTypeLabel(item.type));
  if (typeof item.length_km === 'number') parts.push(`${item.length_km.toFixed(2)} km`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function branchTypeLabel(value: unknown): string {
  switch (value) {
    case 'line_overhead':
      return 'linia napowietrzna SN';
    case 'cable':
      return 'brak typu katalogowego';
    default:
      return 'odcinek SN';
  }
}

function readBranchCatalogLabel(item: SnapshotRecord): string | null {
  const direct = item.catalog_ref;
  if (typeof direct === 'string' && direct.trim()) {
    return formatCatalogTypeLabel(direct);
  }
  const binding = item.catalog_binding;
  if (isRecord(binding)) {
    const catalogItemId = binding.catalog_item_id;
    if (typeof catalogItemId === 'string' && catalogItemId.trim()) {
      return formatCatalogTypeLabel(catalogItemId);
    }
  }
  return null;
}

function formatCatalogTypeLabel(raw: string): string {
  const value = raw.trim();
  if (!value) return 'brak typu katalogowego';
  if (/^[A-Z0-9ĄĆĘŁŃÓŚŹŻ\s/.-]+$/.test(value) && /\d/.test(value)) {
    return value.replace(/\s+/g, ' ');
  }
  return value
    .replace(/^cable[-_]/i, '')
    .replace(/^line[-_]/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b([a-ząćęłńóśźż])/g, (match) => match.toUpperCase());
}

function formatStationType(item: SnapshotRecord): string | undefined {
  return typeof item.station_type === 'string' ? item.station_type : undefined;
}

function formatTransformerMeta(item: SnapshotRecord): string | undefined {
  return typeof item.sn_mva === 'number' ? `${item.sn_mva} MVA` : undefined;
}

function formatGeneratorMeta(item: SnapshotRecord): string | undefined {
  const parts: string[] = [];
  if (typeof item.gen_type === 'string') parts.push(item.gen_type);
  if (typeof item.p_mw === 'number') parts.push(`${item.p_mw} MW`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function formatLoadMeta(item: SnapshotRecord): string | undefined {
  return typeof item.p_mw === 'number' ? `${item.p_mw} MW` : undefined;
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
      {meta && <span className="font-mono text-[10px] text-scada-muted">{meta}</span>}
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
