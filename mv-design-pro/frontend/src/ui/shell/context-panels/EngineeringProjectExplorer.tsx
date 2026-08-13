/**
 * EngineeringProjectExplorer — zunifikowana lewa karta inżynierska.
 *
 * Konsoliduje funkcje:
 *   - ProcessPanel (37 KB, etapy budowy GPZ→Pola→Stacje)
 *   - SchematContextPanel (drzewo hierarchii)
 *
 * Struktura:
 *   1. Sticky header — projectName (sanitized) + readiness %
 *   2. Drill-down tree: GPZ → Sekcje SN → Pola → Stacje → Odcinki → DER
 *   3. Inline readiness blockers (top 5)
 *   4. Footer — licznik elementów + przycisk "Dodaj element"
 */
import { useMemo, useState, useCallback } from 'react';
import { clsx } from 'clsx';

import { useAppStateStore } from '../../app-state';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useSelectionStore } from '../../selection';
import { isTerrainSnSegment } from '../../shared/enmVisibility';
import { projectDisplayName } from '../displayHelpers';
import type { ElementType, SelectedElement } from '../../types';

interface ExplorerNode {
  readonly id: string;
  readonly label: string;
  readonly type: ElementType;
  readonly children?: readonly ExplorerNode[];
  readonly metaPl?: string;
}

export function EngineeringProjectExplorer(): JSX.Element {
  const projectName = useAppStateStore((s) => s.activeProjectName);
  const projectId = useAppStateStore((s) => s.activeProjectId);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const selectedElement = useSelectionStore((s) => s.selectedElement);

  const displayName = projectDisplayName(projectName, projectId);
  // Stan konfiguracji układu obliczony z readiness snapshotu.
  const isReady = isSnapshotReady(snapshot);
  const buildPhaseLabel = computeBuildPhaseLabel(snapshot);
  const readinessTone = isReady ? 'success' : 'warning';
  const configurationStateLabel = isReady ? 'Do analizy' : 'W konfiguracji';

  // Buduj drzewo z snapshot (lub pusty stan jeśli brak).
  const tree = useMemo(() => buildExplorerTree(snapshot), [snapshot]);

  // Liczniki elementów per type (z snapshot).
  const counts = useMemo(() => countElementsFromSnapshot(snapshot), [snapshot]);

  // Lista blockerów gotowości (top 5 — z derived).
  const blockers = useMemo(() => extractReadinessBlockers(snapshot), [snapshot]);

  const handleElementClick = useCallback(
    (node: ExplorerNode) => {
      const target: SelectedElement = {
        id: node.id,
        type: node.type,
        name: node.label,
      };
      selectElement(target);
    },
    [selectElement],
  );

  return (
    <nav
      data-testid="engineering-project-explorer"
      data-project-id={projectId ?? ''}
      aria-label="Eksplorator projektu inżynierski"
      className="flex h-full flex-col overflow-hidden border-r border-scada-border bg-scada-panel"
    >
      {/* Sticky header */}
      <header
        data-testid="explorer-header"
        className="shrink-0 border-b border-scada-border bg-scada-surface px-3 py-2"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
              Projekt
            </div>
            <div className="truncate text-[12px] font-semibold text-scada-text" title={displayName}>
              {displayName}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] uppercase tracking-wider text-scada-muted">Stan układu</div>
            <div className={clsx(
              'text-sm font-bold',
              readinessTone === 'success' ? 'text-emerald-300' : 'text-amber-300',
            )}>
              {configurationStateLabel}
            </div>
          </div>
        </div>
        <div className="mt-1 text-[10px] text-scada-muted">
          Etap projektu: <span className="text-scada-text">{buildPhaseLabel ?? '—'}</span>
        </div>
      </header>

      {/* Drill-down tree */}
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {tree.length === 0 ? (
          <EmptyExplorerHint />
        ) : (
          <ul role="tree" className="space-y-0.5">
            {tree.map((node) => (
              <TreeBranch
                key={node.id}
                node={node}
                onSelect={handleElementClick}
                selectedId={selectedElement?.id ?? null}
                depth={0}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Zagadnienia konfiguracji układu (top 5) */}
      {blockers.length > 0 && (
        <section
          data-testid="explorer-blockers"
          className="shrink-0 border-t border-amber-500/30 bg-amber-500/5 px-3 py-2"
        >
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
            <span aria-hidden>!</span>
            <span>Zagadnienia konfiguracji ({blockers.length})</span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {blockers.slice(0, 5).map((b) => (
              <li key={b.id} className="truncate text-[10px] text-amber-100" title={b.message}>
                - {b.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Footer */}
      <footer
        data-testid="explorer-footer"
        className="flex shrink-0 items-center justify-between border-t border-scada-border bg-scada-surface px-3 py-1.5"
      >
        <span className="text-[10px] text-scada-muted">
          {counts.total} elementów
        </span>
        <button
          type="button"
          data-testid="explorer-add-element"
          className="rounded border border-sygnal-info/31 bg-sygnal-info-tlo/6 px-2 py-0.5 text-[10px] font-medium text-sygnal-info-tusz hover:bg-sygnal-info-tlo/13"
        >
          + Dodaj układ
        </button>
      </footer>
    </nav>
  );
}

function TreeBranch(props: {
  readonly node: ExplorerNode;
  readonly onSelect: (node: ExplorerNode) => void;
  readonly selectedId: string | null;
  readonly depth: number;
}): JSX.Element {
  const { node, onSelect, selectedId, depth } = props;
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = node.id === selectedId;

  return (
    <li role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
      <div
        data-testid={`tree-item-${node.id}`}
        data-element-type={node.type}
        data-selected={isSelected ? 'true' : 'false'}
        className={clsx(
          'flex items-center gap-1 rounded px-1 py-0.5 text-[11px] transition-colors',
          isSelected
            ? 'bg-sygnal-info-tlo/13 text-sygnal-info-tusz'
            : 'text-scada-text hover:bg-scada-bg-hover',
        )}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Zwiń' : 'Rozwiń'}
            className="shrink-0 text-scada-muted hover:text-scada-text"
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-3 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onSelect(node)}
          className="min-w-0 flex-1 truncate text-left"
          title={node.metaPl ? `${node.label} — ${node.metaPl}` : node.label}
        >
          {node.label}
        </button>
        {node.metaPl && (
          <span className="shrink-0 text-[9px] text-scada-muted">{node.metaPl}</span>
        )}
      </div>
      {expanded && hasChildren && (
        <ul role="group" className="space-y-0.5">
          {node.children!.map((child) => (
            <TreeBranch
              key={child.id}
              node={child}
              onSelect={onSelect}
              selectedId={selectedId}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function EmptyExplorerHint(): JSX.Element {
  return (
    <div
      data-testid="explorer-empty"
      className="rounded border border-dashed border-scada-border bg-scada-bg p-3 text-center"
    >
      <div className="text-[11px] font-semibold text-scada-text">Rozpocznij układ sieci</div>
      <p className="mt-1 text-[10px] leading-relaxed text-scada-muted">
        Zacznij od menu kontekstowego na kanwie SLD: wstaw GPZ, dodaj sekcję
        rozdzielni i pola SN.
      </p>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function isSnapshotReady(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const readiness = (snapshot as Record<string, unknown>).readiness;
  if (!readiness || typeof readiness !== 'object') return false;
  const ready = (readiness as Record<string, unknown>).ready;
  return ready === true;
}

function computeBuildPhaseLabel(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== 'object') return 'Wstaw GPZ';
  const root = snapshot as Record<string, unknown>;
  const sources = Array.isArray(root.sources) ? root.sources.length : 0;
  const branches = Array.isArray(root.branches) ? root.branches.length : 0;
  const substations = Array.isArray(root.substations) ? root.substations.length : 0;
  if (sources === 0) return 'Wstaw GPZ';
  if (branches === 0) return 'Wyprowadź odcinek';
  if (substations === 0) return 'Zakończ stacją';
  return 'Rozszerzanie sieci';
}

interface SnapshotEntity {
  readonly ref_id?: string;
  readonly id?: string;
  readonly name?: string;
}

function buildExplorerTree(snapshot: unknown): readonly ExplorerNode[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const root = snapshot as Record<string, unknown>;
  const tree: ExplorerNode[] = [];

  // GPZ (sources w snapshot)
  const sources = Array.isArray(root.sources) ? (root.sources as SnapshotEntity[]) : [];
  const gpzSources = sources.filter((s) => Boolean(s.ref_id || s.id));
  if (gpzSources.length > 0) {
    tree.push({
      id: 'group-gpz',
      label: `Główny Punkt Zasilający (${gpzSources.length})`,
      type: 'Source',
      children: gpzSources.map((s) => ({
        id: s.ref_id ?? s.id ?? '',
        label: s.name ?? s.ref_id ?? 'GPZ',
        type: 'Source' as ElementType,
      })),
    });
  }

  // Stations
  const substations = Array.isArray(root.substations) ? (root.substations as SnapshotEntity[]) : [];
  if (substations.length > 0) {
    tree.push({
      id: 'group-stations',
      label: `Stacje SN/nN (${substations.length})`,
      type: 'Station',
      children: substations.map((s) => ({
        id: s.ref_id ?? s.id ?? '',
        label: s.name ?? s.ref_id ?? 'Stacja',
        type: 'Station' as ElementType,
      })),
    });
  }

  // Branches (odcinki)
  const branches = Array.isArray(root.branches)
    ? (root.branches as SnapshotEntity[]).filter(isTerrainSnSegment)
    : [];
  if (branches.length > 0) {
    tree.push({
      id: 'group-branches',
      label: `Odcinki SN (${branches.length})`,
      type: 'LineBranch',
      children: branches.slice(0, 20).map((b) => ({
        id: b.ref_id ?? b.id ?? '',
        label: b.name ?? b.ref_id ?? 'Odcinek',
        type: 'LineBranch' as ElementType,
      })),
    });
  }

  // DERs (generators)
  const generators = Array.isArray(root.generators) ? (root.generators as SnapshotEntity[]) : [];
  if (generators.length > 0) {
    tree.push({
      id: 'group-der',
      label: `Źródła OZE (${generators.length})`,
      type: 'Generator',
      children: generators.map((g) => ({
        id: g.ref_id ?? g.id ?? '',
        label: g.name ?? g.ref_id ?? 'DER',
        type: 'Generator' as ElementType,
      })),
    });
  }

  return tree;
}

interface ElementCounts {
  readonly total: number;
  readonly buses: number;
  readonly branches: number;
  readonly stations: number;
  readonly sources: number;
  readonly generators: number;
}

function countElementsFromSnapshot(snapshot: unknown): ElementCounts {
  if (!snapshot || typeof snapshot !== 'object') {
    return { total: 0, buses: 0, branches: 0, stations: 0, sources: 0, generators: 0 };
  }
  const root = snapshot as Record<string, unknown>;
  const cnt = (key: string): number => {
    const v = root[key];
    return Array.isArray(v) ? v.length : 0;
  };
  const buses = cnt('buses');
  const branches = cnt('branches');
  const stations = cnt('substations');
  const sources = cnt('sources');
  const generators = cnt('generators');
  return {
    total: buses + branches + stations + sources + generators,
    buses, branches, stations, sources, generators,
  };
}

interface Blocker {
  readonly id: string;
  readonly message: string;
}

function extractReadinessBlockers(snapshot: unknown): readonly Blocker[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const root = snapshot as Record<string, unknown>;
  const readiness = root.readiness;
  if (!readiness || typeof readiness !== 'object') return [];
  const blockers = (readiness as Record<string, unknown>).blockers;
  if (!Array.isArray(blockers)) return [];
  return blockers.slice(0, 10).map((b, i) => {
    if (typeof b === 'string') {
      return { id: `blocker-${i}`, message: b };
    }
    if (b && typeof b === 'object') {
      const bo = b as Record<string, unknown>;
      const msg = (bo.message_pl as string) ?? (bo.message as string) ?? (bo.code as string) ?? 'Zagadnienie konfiguracji';
      return { id: `blocker-${i}`, message: String(msg) };
    }
    return { id: `blocker-${i}`, message: 'Zagadnienie konfiguracji' };
  });
}
