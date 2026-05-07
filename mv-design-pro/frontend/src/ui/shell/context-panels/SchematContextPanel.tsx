import { useMemo } from 'react';
import { clsx } from 'clsx';

import { useAppStateStore } from '../../app-state/store';
import { useNetworkBuildDerived } from '../../network-build/networkBuildStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useSelectionStore } from '../../selection';

type RowState = 'ok' | 'warn' | 'danger' | 'group';

interface TreeRowSpec {
  id: string;
  label: string;
  meta?: string;
  state: RowState;
  indent?: number;
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
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const selectedElementId = useSelectionStore((s) => s.selectedElements[0]?.id ?? null);
  const { blockersByCategory, isReady } = useNetworkBuildDerived();

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
    () => buildTreeSections(snapshot as SnapshotRecord | null, blockerRefs),
    [blockerRefs, snapshot],
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
            setActiveWorkMode('TP');
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
              {!snapshot ? '1' : blockerCount > 0 ? '△' : '◎'}
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
            onClick={() => setActiveArea('WYNIKI_ANALIZY')}
            className="text-[10px] text-cyan-300 hover:text-cyan-100"
          >
            Pokaż wszystkie
          </button>
        </div>
        {blockers.length > 0 ? (
          <div className="space-y-1">
            {blockers.slice(0, 4).map((blocker) => (
              <div key={blocker.id} className="flex items-center gap-2 text-[10px] text-scada-muted">
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
        {sections.length > 0 ? (
          sections.map((section) => (
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
                {section.rows.map((row) => (
                  <TreeRow
                    key={row.id}
                    label={row.label}
                    meta={row.meta}
                    state={row.state}
                    indent={row.indent}
                    selected={selectedElementId === row.id}
                  />
                ))}
              </div>
            </div>
          ))
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
        <div className="grid h-9 min-w-10 place-items-center rounded-sm border border-scada-border bg-[#0a141d] px-2 font-mono text-[10px] text-scada-muted">
          {elementCount}
        </div>
      </div>
    </div>
  );
}

function buildTreeSections(snapshot: SnapshotRecord | null, blockerRefs: Set<string>): TreeSectionSpec[] {
  if (!snapshot) return [];

  const sections = [
    buildSection('GPZ i źródła', getCollection(snapshot, 'sources'), 'Źródło zasilania', blockerRefs),
    buildSection('Szyny SN', getCollection(snapshot, 'buses'), 'Szyna', blockerRefs, (item) => formatVoltage(item)),
    buildSection('Pola SN', getCollection(snapshot, 'bays'), 'Pole', blockerRefs, (item) => formatBayRole(item)),
    buildSection('Odcinki SN', getCollection(snapshot, 'branches'), 'Odcinek', blockerRefs, (item) => formatBranchMeta(item)),
    buildSection('Stacje SN/nN', getCollection(snapshot, 'substations'), 'Stacja', blockerRefs, (item) => formatStationType(item)),
    buildSection('Transformatory', getCollection(snapshot, 'transformers'), 'Transformator', blockerRefs, (item) => formatTransformerMeta(item)),
    buildSection('Źródła i magazyny', getCollection(snapshot, 'generators'), 'Źródło', blockerRefs, (item) => formatGeneratorMeta(item)),
    buildSection('Odbiory nN', getCollection(snapshot, 'loads'), 'Odbiór', blockerRefs, (item) => formatLoadMeta(item)),
  ];

  return sections.filter((section): section is TreeSectionSpec => section !== null);
}

function buildSection(
  title: string,
  items: SnapshotRecord[],
  fallbackLabel: string,
  blockerRefs: Set<string>,
  meta?: (item: SnapshotRecord) => string | undefined,
): TreeSectionSpec | null {
  if (items.length === 0) return null;

  return {
    title,
    badge: String(items.length),
    rows: items.map((item, index) => {
      const id = getRef(item) || `${title}:${index}`;
      return {
        id,
        label: getDisplayName(item, fallbackLabel),
        meta: meta?.(item),
        state: blockerRefs.has(id) ? 'warn' : 'ok',
        indent: 1,
      };
    }),
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

function getDisplayName(item: SnapshotRecord, fallback: string): string {
  const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : null;
  const ref = getRef(item);
  return name ?? (ref || fallback);
}

function formatVoltage(item: SnapshotRecord): string | undefined {
  return typeof item.voltage_kv === 'number' ? `${item.voltage_kv} kV` : undefined;
}

function formatBayRole(item: SnapshotRecord): string | undefined {
  return typeof item.bay_role === 'string' ? item.bay_role : undefined;
}

function formatBranchMeta(item: SnapshotRecord): string | undefined {
  const parts: string[] = [];
  if (typeof item.type === 'string') parts.push(item.type);
  if (typeof item.length_km === 'number') parts.push(`${item.length_km.toFixed(2)} km`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
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
  label,
  meta,
  state,
  indent = 0,
  selected = false,
}: {
  label: string;
  meta?: string;
  state: RowState;
  indent?: number;
  selected?: boolean;
}) {
  return (
    <div
      className={clsx(
        'group flex h-6 items-center gap-1.5 rounded-sm border border-transparent px-1.5 text-[10px]',
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
    </div>
  );
}

function StateDot({ state }: { state: RowState }) {
  if (state === 'warn') return <span className="text-amber-400">△</span>;
  if (state === 'danger') return <span className="text-rose-400">△</span>;
  if (state === 'group') return <span className="text-scada-muted">•</span>;
  return <span className="text-emerald-400">◎</span>;
}

function ChevronDown() {
  return (
    <svg className="h-3 w-3 shrink-0 text-scada-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
