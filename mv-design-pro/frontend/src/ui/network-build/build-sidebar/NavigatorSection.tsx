/**
 * NavigatorSection — drzewo modelu z badge statusu (PR-13).
 *
 * Brief 2 §4 sekcja 1: Projekt > GPZ > Rozdzielnia SN > Sekcja > Pola SN > Ciągi >
 * Odgałęzienia > Stacje > PV/FV > BESS > FW > Odbiory > Braki danych.
 */

import { POLISH_STATUS_LABEL } from '../../shared/formatPolishValue';

export type NavBadgeStatus = 'kompletne' | 'brak-danych' | 'wynik-czesciowy' | 'blad' | 'nie-dotyczy';

export interface NavTreeNode {
  readonly id: string;
  readonly labelPl: string;
  readonly badge?: NavBadgeStatus;
  readonly count?: number;
  readonly children?: readonly NavTreeNode[];
}

export interface NavigatorSectionProps {
  readonly nodes: readonly NavTreeNode[];
  readonly selectedId?: string | null;
  readonly onSelect?: (id: string) => void;
}

const BADGE_LABEL: Record<NavBadgeStatus, string> = {
  kompletne: 'kompletne',
  'brak-danych': 'brak danych',
  'wynik-czesciowy': 'wynik częściowy',
  blad: 'błąd',
  'nie-dotyczy': 'nie dotyczy',
};

const BADGE_CLASS: Record<NavBadgeStatus, string> = {
  kompletne: 'text-status-ok',
  'brak-danych': 'text-status-error',
  'wynik-czesciowy': 'text-status-warn',
  blad: 'text-scada-alarm',
  'nie-dotyczy': 'text-scada-muted',
};

function NodeRow(props: {
  node: NavTreeNode;
  depth: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}): JSX.Element {
  const { node, depth, selectedId, onSelect } = props;
  const isSelected = selectedId === node.id;
  return (
    <>
      <button
        type="button"
        data-testid={`nav-node-${node.id}`}
        data-selected={isSelected}
        onClick={() => onSelect?.(node.id)}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        className={
          'flex w-full items-center justify-between gap-2 py-1 pr-2 text-left text-xs transition-colors '
          + (isSelected
            ? 'bg-scada-active text-scada-text'
            : 'text-scada-text hover:bg-scada-hover-nav')
        }
      >
        <span className="truncate flex-1">
          {node.labelPl}
          {node.count !== undefined && (
            <span className="ml-1 text-scada-muted">({node.count})</span>
          )}
        </span>
        {node.badge && (
          <span
            data-testid={`nav-badge-${node.id}`}
            className={`shrink-0 text-[10px] ${BADGE_CLASS[node.badge]}`}
            title={BADGE_LABEL[node.badge]}
          >
            ●
          </span>
        )}
      </button>
      {node.children && node.children.map((child, index) => (
        <NodeRow
          key={`${child.id}:${index}`}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

export function NavigatorSection(props: NavigatorSectionProps): JSX.Element {
  const { nodes, selectedId, onSelect } = props;
  return (
    <div data-testid="navigator-section" className="flex flex-col py-1">
      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Nawigator modelu
      </div>
      {nodes.length === 0 ? (
        <div className="px-3 py-2 text-xs italic text-scada-muted">
          Pusty projekt — pierwsza czynność: Wstaw główny punkt zasilania.
        </div>
      ) : (
        nodes.map((n, index) => (
          <NodeRow key={`${n.id}:${index}`} node={n} depth={0} selectedId={selectedId} onSelect={onSelect} />
        ))
      )}
    </div>
  );
}

// Reuse POLISH_STATUS_LABEL aby wyciszyć unused import jeśli nie używamy
void POLISH_STATUS_LABEL;
