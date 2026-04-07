/**
 * Project Tree Component (PF-style Drzewo Projektu)
 *
 * CANONICAL ALIGNMENT:
 * - powerfactory_ui_parity.md Â§ A: Project Tree structure
 * - wizard_screens.md Â§ 1: Navigation paradigm
 * - sld_rules.md Â§ G.1: SLD â†” Wizard synchronization
 *
 * Structure:
 * - Projekt
 *   - SieÄ‡
 *     - Szyny
 *     - Linie
 *     - Kable
 *     - Transformatory
 *     - ĹÄ…czniki
 *     - ĹąrĂłdĹ‚a
 *     - Odbiory
 *   - Katalog typĂłw (read-only)
 *     - Typy linii
 *     - Typy kabli
 *     - Typy transformatorĂłw
 *     - Typy aparatury
 *   - Przypadki obliczeniowe
 *   - Wyniki
 */

import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import type { TreeNode, TreeNodeType, ElementType, OperatingMode, ResultStatus } from '../types';
import type { RunHistoryItem } from '../comparison/types';
import { useSelectionStore } from '../selection/store';
import { useTreeSelection } from '../selection/hooks';
import { TreeEtapSymbolIcon } from './TreeEtapSymbolIcon';
import { getTreeSymbol, getResultStatusTooltip } from './treeSymbolMap';
import { useCatalogTreeNodes, extractMissingCounts } from './useCatalogTreeNodes';
import type { CatalogMissingCounts } from './useCatalogTreeNodes';

// ============================================================================
// Tree Node Labels (Polish)
// ============================================================================

const TREE_NODE_LABELS: Record<TreeNodeType, string> = {
  PROJECT: 'Projekt',
  NETWORK: 'SieÄ‡',
  STATION: 'Stacja',          // FIX-05: Station label (or from station name)
  VOLTAGE_LEVEL: 'Poziom napiÄ™cia',  // FIX-05: Voltage level label
  BUSES: 'Szyny',
  LINES: 'Linie',
  CABLES: 'Kable',
  TRANSFORMERS: 'Transformatory',
  SWITCHES: 'ĹÄ…czniki',
  SOURCES: 'ĹąrĂłdĹ‚a',
  LOADS: 'Odbiory',
  TYPE_CATALOG: 'Katalog typĂłw',
  LINE_TYPES: 'Typy linii',
  CABLE_TYPES: 'Typy kabli',
  TRANSFORMER_TYPES: 'Typy transformatorĂłw',
  SWITCH_EQUIPMENT_TYPES: 'Typy aparatury',
  CASES: 'Przypadki obliczeniowe',
  STUDY_CASE: '',  // P10: Label from case name
  RESULTS: 'Wyniki',
  RUN_ITEM: '',  // P11c: Label from run metadata
  PROTECTION_RESULTS: 'Zabezpieczenia',  // P15c: Protection results
  PROTECTION_RUNS: 'Runy zabezpieczeĹ„',  // P15c: Protection runs
  PROTECTION_COMPARISONS: 'PorĂłwnania A/B',  // P15c: Protection comparisons
  POWER_FLOW_RESULTS: 'RozpĹ‚yw mocy',  // P20b: Power flow results
  POWER_FLOW_RUNS: 'RozpĹ‚ywy',  // P20b: Power flow runs
  GENERATORS: 'Generatory / OZE',  // PR-9: Generators category
  MEASUREMENTS: 'PrzekĹ‚adniki',  // PR-9: Measurement transformers (CT/VT)
  PROTECTION_ASSIGNMENTS: 'Zabezpieczenia',  // PR-9: Protection assignments
  SHORT_CIRCUIT_RESULTS: 'Zwarcia',  // SC results category
  SHORT_CIRCUIT_RUNS: 'Runy zwarciowe',  // SC runs subcategory
  ELEMENT: '',
};

// ============================================================================
// Element Type Mapping
// ============================================================================

const TREE_NODE_TO_ELEMENT_TYPE: Partial<Record<TreeNodeType, ElementType>> = {
  BUSES: 'Bus',
  LINES: 'LineBranch',
  CABLES: 'LineBranch',
  TRANSFORMERS: 'TransformerBranch',
  SWITCHES: 'Switch',
  SOURCES: 'Source',
  LOADS: 'Load',
  GENERATORS: 'Generator',
  MEASUREMENTS: 'Measurement',
  PROTECTION_ASSIGNMENTS: 'ProtectionAssignment',
};

// ============================================================================
// Props
// ============================================================================

interface NetworkElement {
  id: string;
  name: string;
  element_type: string;
  in_service?: boolean;
  branch_type?: 'LINE' | 'CABLE';
  voltage_kv?: number;
}

// P10: Study case item for tree
interface StudyCaseItem {
  id: string;
  name: string;
  result_status: 'NONE' | 'FRESH' | 'OUTDATED';
  is_active: boolean;
}

/** Typ topologii sieci */
type TopologyType = 'radialny' | 'pierĹ›cieniowy';

/** Akcja menu kontekstowego elementu */
interface ElementContextAction {
  id: string;
  label: string;
}

/** DomyĹ›lne akcje menu kontekstowego (Polish) */
const ELEMENT_CONTEXT_ACTIONS: ElementContextAction[] = [
  { id: 'show-on-sld', label: 'PokaĹĽ na schemacie' },
  { id: 'show-properties', label: 'PokaĹĽ wĹ‚aĹ›ciwoĹ›ci' },
  { id: 'go-to-wizard-step', label: 'Pokaz kontekst edycji' },
];

interface ProjectTreeProps {
  projectName?: string;
  elements: {
    buses: NetworkElement[];
    lines: NetworkElement[];
    cables: NetworkElement[];
    transformers: NetworkElement[];
    switches: NetworkElement[];
    sources: NetworkElement[];
    loads: NetworkElement[];
    generators?: NetworkElement[];
    measurements?: NetworkElement[];
    protection_assignments?: NetworkElement[];
  };
  typeCounts?: {
    lineTypes: number;
    cableTypes: number;
    transformerTypes: number;
    switchEquipmentTypes: number;
  };
  /** Readiness blockers z snapshotStore â€” do wyliczenia statusĂłw katalogowych */
  readinessBlockers?: Array<{
    code: string;
    element_ref: string | null;
    message_pl: string;
  }>;
  // P10: Study cases list
  studyCases?: StudyCaseItem[];
  // P11c: Run history list (for Results Browser)
  runHistory?: RunHistoryItem[];
  resultsCount?: number;
  /** Typ topologii sieci: radialny lub pierĹ›cieniowy */
  topologyType?: TopologyType;
  /** Readiness status: gotowy/niegotowy */
  readinessStatus?: 'OK' | 'WARN' | 'FAIL';
  onNodeClick?: (node: TreeNode) => void;
  onCategoryClick?: (nodeType: TreeNodeType, elementType?: ElementType) => void;
  /** Callback: otwĂłrz przeglÄ…darkÄ™ katalogowÄ… na danej zakĹ‚adce */
  onCatalogBrowse?: (treeNodeType: TreeNodeType) => void;
  // P10: Study case callbacks
  onStudyCaseClick?: (caseId: string) => void;
  onStudyCaseActivate?: (caseId: string) => void;
  // P11c: Run click callback
  onRunClick?: (runId: string) => void;
  /** Callback: akcja menu kontekstowego elementu */
  onElementContextAction?: (elementId: string, actionId: string) => void;
}

// ============================================================================
// Component
// ============================================================================

// ============================================================================
// Search/Filter helper â€” recursively filters tree nodes by query
// ============================================================================

function filterTreeNode(node: TreeNode, query: string): TreeNode | null {
  const lowerQuery = query.toLowerCase();
  const labelMatches = node.label.toLowerCase().includes(lowerQuery);

  if (node.children && node.children.length > 0) {
    const filteredChildren = node.children
      .map((child) => filterTreeNode(child, query))
      .filter((child): child is TreeNode => child !== null);

    if (filteredChildren.length > 0 || labelMatches) {
      return {
        ...node,
        children: filteredChildren.length > 0 ? filteredChildren : node.children,
        expanded: filteredChildren.length > 0 ? true : node.expanded,
      };
    }
  }

  return labelMatches ? node : null;
}

// ============================================================================
// Voltage level grouping helper
// ============================================================================

function getVoltageLevelLabel(voltageKv: number): string {
  if (voltageKv >= 1) {
    return `SN ${voltageKv} kV`;
  }
  return `nN ${voltageKv} kV`;
}

function groupBusesByVoltage(
  buses: NetworkElement[],
  buildElementNodes: (items: NetworkElement[], elementType: ElementType) => TreeNode[]
): TreeNode[] {
  // Collect distinct voltage levels (deterministic ordering by voltage DESC)
  const voltageLevels = new Map<number, NetworkElement[]>();
  for (const bus of buses) {
    const kv = bus.voltage_kv ?? 0;
    if (!voltageLevels.has(kv)) {
      voltageLevels.set(kv, []);
    }
    voltageLevels.get(kv)!.push(bus);
  }

  // If only one voltage level (or none), no grouping needed
  if (voltageLevels.size <= 1) {
    return buildElementNodes(buses, 'Bus');
  }

  // Sort voltage levels DESC for deterministic ordering
  const sortedLevels = [...voltageLevels.entries()].sort((a, b) => b[0] - a[0]);

  return sortedLevels.map(([voltageKv, levelBuses]) => ({
    id: `voltage-level-${voltageKv}`,
    label: getVoltageLevelLabel(voltageKv),
    nodeType: 'VOLTAGE_LEVEL' as TreeNodeType,
    voltageLevelKv: voltageKv,
    count: levelBuses.length,
    children: buildElementNodes(levelBuses, 'Bus'),
  }));
}

// ============================================================================
// Element count summary helper
// ============================================================================

function computeTotalElementCount(elements: ProjectTreeProps['elements']): number {
  return (
    elements.buses.length +
    elements.lines.length +
    elements.cables.length +
    elements.transformers.length +
    elements.switches.length +
    elements.sources.length +
    elements.loads.length +
    (elements.generators ?? []).length +
    (elements.measurements ?? []).length +
    (elements.protection_assignments ?? []).length
  );
}

// ============================================================================
// SC run filter helper
// ============================================================================

function isShortCircuitRun(solverKind: string): boolean {
  return solverKind === 'short_circuit_sn' || solverKind === 'SC';
}

// ============================================================================
// Component
// ============================================================================

export function ProjectTree({
  projectName = 'Nowy projekt',
  elements,
  typeCounts = { lineTypes: 0, cableTypes: 0, transformerTypes: 0, switchEquipmentTypes: 0 },
  readinessBlockers = [],
  studyCases = [],
  runHistory = [],
  resultsCount: _resultsCount = 0,
  topologyType,
  readinessStatus,
  onNodeClick,
  onCategoryClick,
  onCatalogBrowse,
  onStudyCaseClick,
  onStudyCaseActivate,
  onRunClick,
  onElementContextAction,
}: ProjectTreeProps) {
  const { treeExpandedNodes, expandTreeNode, collapseTreeNode } = useSelectionStore();
  const { selectedElement, handleTreeClick } = useTreeSelection();
  const mode = useSelectionStore((state) => state.mode);

  // Enhancement 1: Search/filter state
  const [searchQuery, setSearchQuery] = useState('');

  // Enhancement 6: Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    elementId: string;
    elementType: ElementType;
    elementName: string;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu]);

  // Enhancement 5: Element count summary
  const totalElementCount = useMemo(() => computeTotalElementCount(elements), [elements]);

  // Wylicz statusy katalogowe z readiness blockers (zero zgadywania)
  const catalogMissing: CatalogMissingCounts = useMemo(
    () =>
      extractMissingCounts(readinessBlockers, {
        lines: elements.lines.map((e) => ({ ref_id: e.id, type: 'line_overhead' })),
        cables: elements.cables.map((e) => ({ ref_id: e.id, type: 'cable' })),
        transformers: elements.transformers.map((e) => ({ ref_id: e.id })),
        switches: elements.switches.map((e) => ({ ref_id: e.id })),
      }),
    [readinessBlockers, elements]
  );

  // Buduj podwÄ™zĹ‚y TYPE_CATALOG z rejestru (deterministyczne)
  const catalogTreeNodes = useCatalogTreeNodes(typeCounts, catalogMissing);

  // Build tree structure
  const tree = useMemo((): TreeNode => {
    const buildElementNodes = (
      items: NetworkElement[],
      elementType: ElementType
    ): TreeNode[] => {
      // Sort by name, then by id for deterministic ordering
      const sorted = [...items].sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name, 'pl');
        return nameCompare !== 0 ? nameCompare : a.id.localeCompare(b.id);
      });

      return sorted.map((item) => ({
        id: `element-${item.id}`,
        label: item.name,
        nodeType: 'ELEMENT' as TreeNodeType,
        elementType,
        elementId: item.id,
        inService: item.in_service,
      }));
    };

    // P10: Build study case nodes
    const buildStudyCaseNodes = (cases: StudyCaseItem[]): TreeNode[] => {
      // Sort by name, active case first
      const sorted = [...cases].sort((a, b) => {
        if (a.is_active !== b.is_active) {
          return a.is_active ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'pl');
      });

      return sorted.map((caseItem) => ({
        id: `study-case-${caseItem.id}`,
        label: caseItem.name,
        nodeType: 'STUDY_CASE' as TreeNodeType,
        studyCaseId: caseItem.id,
        isActive: caseItem.is_active,
        resultStatus: caseItem.result_status,
      }));
    };

    // P11c: Build run history nodes
    const buildRunNodes = (runs: RunHistoryItem[]): TreeNode[] => {
      // Sort by created_at DESC (newest first) - deterministic
      const sorted = [...runs].sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      return sorted.map((run) => {
        // Format label: "Solver [Case] - Date"
        const date = new Date(run.created_at).toLocaleDateString('pl-PL', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        const solverLabel = run.solver_kind === 'PF' ? 'RozpĹ‚yw' : isShortCircuitRun(run.solver_kind) ? 'Zwarcie' : run.solver_kind;
        const label = `${solverLabel} [${run.case_name}] â€” ${date}`;

        return {
          id: `run-${run.run_id}`,
          label,
          nodeType: 'RUN_ITEM' as TreeNodeType,
          runId: run.run_id,
          caseId: run.case_id,
          solverKind: run.solver_kind,
          createdAt: run.created_at,
          resultStatus: run.result_state,
        };
      });
    };

    // Enhancement 4: SC run filter
    const scRuns = runHistory.filter((r) => isShortCircuitRun(r.solver_kind));
    const pfRuns = runHistory.filter(
      (r) => r.solver_kind === 'PF' || r.solver_kind === 'power_flow'
    );
    const protectionRuns = runHistory.filter(
      (r) => r.solver_kind === 'protection' || r.solver_kind === 'protection_analysis'
    );
    const otherRuns = runHistory.filter(
      (r) =>
        !isShortCircuitRun(r.solver_kind) &&
        r.solver_kind !== 'protection' &&
        r.solver_kind !== 'protection_analysis' &&
        r.solver_kind !== 'PF' &&
        r.solver_kind !== 'power_flow'
    );

    // Enhancement 2: Voltage level grouping for buses
    const busChildren = groupBusesByVoltage(elements.buses, buildElementNodes);

    return {
      id: 'project',
      label: projectName,
      nodeType: 'PROJECT',
      expanded: true,
      children: [
        {
          id: 'network',
          label: TREE_NODE_LABELS.NETWORK,
          nodeType: 'NETWORK',
          children: [
            {
              id: 'buses',
              label: TREE_NODE_LABELS.BUSES,
              nodeType: 'BUSES',
              count: elements.buses.length,
              children: busChildren,
            },
            {
              id: 'lines',
              label: TREE_NODE_LABELS.LINES,
              nodeType: 'LINES',
              count: elements.lines.length,
              children: buildElementNodes(elements.lines, 'LineBranch'),
            },
            {
              id: 'cables',
              label: TREE_NODE_LABELS.CABLES,
              nodeType: 'CABLES',
              count: elements.cables.length,
              children: buildElementNodes(elements.cables, 'LineBranch'),
            },
            {
              id: 'transformers',
              label: TREE_NODE_LABELS.TRANSFORMERS,
              nodeType: 'TRANSFORMERS',
              count: elements.transformers.length,
              children: buildElementNodes(elements.transformers, 'TransformerBranch'),
            },
            {
              id: 'switches',
              label: TREE_NODE_LABELS.SWITCHES,
              nodeType: 'SWITCHES',
              count: elements.switches.length,
              children: buildElementNodes(elements.switches, 'Switch'),
            },
            {
              id: 'sources',
              label: TREE_NODE_LABELS.SOURCES,
              nodeType: 'SOURCES',
              count: elements.sources.length,
              children: buildElementNodes(elements.sources, 'Source'),
            },
            {
              id: 'loads',
              label: TREE_NODE_LABELS.LOADS,
              nodeType: 'LOADS',
              count: elements.loads.length,
              children: buildElementNodes(elements.loads, 'Load'),
            },
            {
              id: 'generators',
              label: TREE_NODE_LABELS.GENERATORS,
              nodeType: 'GENERATORS',
              count: (elements.generators ?? []).length,
              children: buildElementNodes(elements.generators ?? [], 'Generator'),
            },
            {
              id: 'measurements',
              label: TREE_NODE_LABELS.MEASUREMENTS,
              nodeType: 'MEASUREMENTS',
              count: (elements.measurements ?? []).length,
              children: buildElementNodes(elements.measurements ?? [], 'Measurement'),
            },
            {
              id: 'protection-assignments',
              label: TREE_NODE_LABELS.PROTECTION_ASSIGNMENTS,
              nodeType: 'PROTECTION_ASSIGNMENTS',
              count: (elements.protection_assignments ?? []).length,
              children: buildElementNodes(
                elements.protection_assignments ?? [],
                'ProtectionAssignment'
              ),
            },
          ],
        },
        {
          id: 'type-catalog',
          label: TREE_NODE_LABELS.TYPE_CATALOG,
          nodeType: 'TYPE_CATALOG',
          children: catalogTreeNodes,
        },
        {
          id: 'cases',
          label: TREE_NODE_LABELS.CASES,
          nodeType: 'CASES',
          count: studyCases.length,
          children: buildStudyCaseNodes(studyCases),
        },
        {
          id: 'results',
          label: TREE_NODE_LABELS.RESULTS,
          nodeType: 'RESULTS',
          count: runHistory.length,
          children: [
            // P20b: Power flow results subcategory
            {
              id: 'power-flow-results',
              label: TREE_NODE_LABELS.POWER_FLOW_RESULTS,
              nodeType: 'POWER_FLOW_RESULTS',
              count: pfRuns.length,
              children: buildRunNodes(pfRuns),
            },
            // Enhancement 4: Short circuit results subcategory
            {
              id: 'short-circuit-results',
              label: TREE_NODE_LABELS.SHORT_CIRCUIT_RESULTS,
              nodeType: 'SHORT_CIRCUIT_RESULTS',
              count: scRuns.length,
              children: [
                {
                  id: 'short-circuit-runs',
                  label: TREE_NODE_LABELS.SHORT_CIRCUIT_RUNS,
                  nodeType: 'SHORT_CIRCUIT_RUNS',
                  count: scRuns.length,
                  children: buildRunNodes(scRuns),
                },
              ],
            },
            // P15c: Protection results subcategory
            {
              id: 'protection-results',
              label: TREE_NODE_LABELS.PROTECTION_RESULTS,
              nodeType: 'PROTECTION_RESULTS',
              children: [
                {
                  id: 'protection-runs',
                  label: TREE_NODE_LABELS.PROTECTION_RUNS,
                  nodeType: 'PROTECTION_RUNS',
                  count: protectionRuns.length,
                  children: buildRunNodes(protectionRuns),
                },
                {
                  id: 'protection-comparisons',
                  label: TREE_NODE_LABELS.PROTECTION_COMPARISONS,
                  nodeType: 'PROTECTION_COMPARISONS',
                  count: 0, // TODO: Add comparison history
                  children: [],
                },
              ],
            },
            // Other runs at top level - excluding PF, SC, and protection
            ...buildRunNodes(otherRuns),
          ],
        },
      ],
    };
  }, [projectName, elements, catalogTreeNodes, studyCases, runHistory]);

  // Enhancement 1: Apply search filter to tree
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;
    const result = filterTreeNode(tree, searchQuery.trim());
    return result ?? { ...tree, children: [] };
  }, [tree, searchQuery]);

  // Handle node toggle
  const handleToggle = useCallback(
    (nodeId: string) => {
      if (treeExpandedNodes.has(nodeId)) {
        collapseTreeNode(nodeId);
      } else {
        expandTreeNode(nodeId);
      }
    },
    [treeExpandedNodes, expandTreeNode, collapseTreeNode]
  );

  // Handle node click
  const handleNodeClick = useCallback(
    (node: TreeNode) => {
      if (node.nodeType === 'ELEMENT' && node.elementId && node.elementType) {
        // Select element
        handleTreeClick(node.elementId, node.elementType, node.label);
      } else if (node.nodeType === 'STUDY_CASE' && node.studyCaseId) {
        // P10: Study case click
        onStudyCaseClick?.(node.studyCaseId);
      } else if (node.nodeType === 'RUN_ITEM' && node.runId) {
        // Single canonical results handoff: delegate to parent router only.
        onRunClick?.(node.runId);
      } else if (
        node.nodeType === 'LINE_TYPES' ||
        node.nodeType === 'CABLE_TYPES' ||
        node.nodeType === 'TRANSFORMER_TYPES' ||
        node.nodeType === 'SWITCH_EQUIPMENT_TYPES'
      ) {
        // Catalog type node click â€” otwĂłrz przeglÄ…darkÄ™ katalogowÄ…
        onCatalogBrowse?.(node.nodeType);
      } else if (TREE_NODE_TO_ELEMENT_TYPE[node.nodeType]) {
        // Category click - open Data Manager
        onCategoryClick?.(node.nodeType, TREE_NODE_TO_ELEMENT_TYPE[node.nodeType]);
      } else {
        // Other node click
        onNodeClick?.(node);
        onCategoryClick?.(node.nodeType);
      }
    },
    [handleTreeClick, onNodeClick, onCategoryClick, onCatalogBrowse, onStudyCaseClick, onRunClick]
  );

  // P10: Handle study case double-click (activate)
  const handleNodeDoubleClick = useCallback(
    (node: TreeNode) => {
      if (node.nodeType === 'STUDY_CASE' && node.studyCaseId && !node.isActive) {
        onStudyCaseActivate?.(node.studyCaseId);
      }
    },
    [onStudyCaseActivate]
  );

  // Enhancement 6: Handle context menu
  const handleContextMenu = useCallback(
    (node: TreeNode, event: React.MouseEvent) => {
      if (node.nodeType === 'ELEMENT' && node.elementId && node.elementType) {
        event.preventDefault();
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          elementId: node.elementId,
          elementType: node.elementType,
          elementName: node.label,
        });
      }
    },
    []
  );

  const handleContextMenuAction = useCallback(
    (actionId: string) => {
      if (contextMenu) {
        onElementContextAction?.(contextMenu.elementId, actionId);
        setContextMenu(null);
      }
    },
    [contextMenu, onElementContextAction]
  );

  // Enhancement 5: Readiness badge label
  const readinessLabel = useMemo(() => {
    if (!readinessStatus) return null;
    switch (readinessStatus) {
      case 'OK':
        return 'Gotowy';
      case 'WARN':
        return 'OstrzeĹĽenia';
      case 'FAIL':
        return 'Niegotowy';
      default:
        return null;
    }
  }, [readinessStatus]);

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg shadow-sm h-full flex flex-col"
      data-testid="project-tree"
    >
      {/* Header with element count summary (Enhancement 5) */}
      <div
        className="bg-gray-50 border-b border-gray-200 px-4 py-3"
        data-testid="project-tree-header"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">DRZEWO PROJEKTU</h2>
          <div className="flex items-center gap-2" data-testid="project-tree-summary">
            <span
              className="text-[10px] text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded"
              data-testid="project-tree-element-count"
              title={`ĹÄ…czna liczba elementĂłw: ${totalElementCount}`}
            >
              {totalElementCount} elem.
            </span>
            {readinessLabel && (
              <span
                className={clsx(
                  'text-[10px] px-1.5 py-0.5 rounded',
                  readinessStatus === 'OK' && 'bg-green-100 text-green-700',
                  readinessStatus === 'WARN' && 'bg-amber-100 text-amber-700',
                  readinessStatus === 'FAIL' && 'bg-red-100 text-red-700'
                )}
                data-testid="project-tree-readiness"
              >
                {readinessLabel}
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-0.5" data-testid="project-tree-mode">
          {getModeLabel(mode)}
        </p>
      </div>

      {/* Enhancement 1: Search/filter bar */}
      <div className="px-3 py-2 border-b border-gray-100" data-testid="project-tree-search">
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="6.5" cy="6.5" r="5" />
            <path d="M10.5 10.5 L14.5 14.5" />
          </svg>
          <input
            type="text"
            className={clsx(
              'w-full pl-7 pr-7 py-1.5 text-xs border border-gray-200 rounded',
              'bg-white text-gray-700 placeholder-gray-400',
              'focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400'
            )}
            placeholder="Filtruj elementy..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="project-tree-search-input"
            aria-label="Filtruj drzewo projektu"
          />
          {searchQuery && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setSearchQuery('')}
              data-testid="project-tree-search-clear"
              aria-label="WyczyĹ›Ä‡ filtr"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3 L9 9 M9 3 L3 9" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto p-2" data-testid="project-tree-content">
        <TreeNodeComponent
          node={filteredTree}
          level={0}
          expandedNodes={treeExpandedNodes}
          selectedElementId={selectedElement?.id ?? null}
          topologyType={topologyType}
          onToggle={handleToggle}
          onClick={handleNodeClick}
          onDoubleClick={handleNodeDoubleClick}
          onContextMenu={handleContextMenu}
        />
      </div>

      {/* Enhancement 6: Context menu overlay */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className={clsx(
            'fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px]'
          )}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          data-testid="project-tree-context-menu"
          role="menu"
          aria-label="Menu kontekstowe elementu"
        >
          <div className="px-3 py-1.5 text-[10px] text-gray-400 font-medium border-b border-gray-100 truncate">
            {contextMenu.elementName}
          </div>
          {ELEMENT_CONTEXT_ACTIONS.map((action) => (
            <button
              key={action.id}
              className={clsx(
                'w-full text-left px-3 py-1.5 text-xs text-gray-700',
                'hover:bg-blue-50 hover:text-blue-700 transition-colors'
              )}
              onClick={() => handleContextMenuAction(action.id)}
              data-testid={`context-menu-action-${action.id}`}
              role="menuitem"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tree Node Component
// ============================================================================

interface TreeNodeComponentProps {
  node: TreeNode;
  level: number;
  expandedNodes: Set<string>;
  selectedElementId: string | null;
  /** Enhancement 7: Topology type for NETWORK node badge */
  topologyType?: TopologyType;
  onToggle: (nodeId: string) => void;
  onClick: (node: TreeNode) => void;
  onDoubleClick: (node: TreeNode) => void;
  onContextMenu: (node: TreeNode, event: React.MouseEvent) => void;
}

// P10: Status colors for study cases and run items
const RESULT_STATUS_COLORS: Record<ResultStatus, string> = {
  NONE: 'text-gray-400',
  FRESH: 'text-green-600',
  OUTDATED: 'text-amber-500',
};

function TreeNodeComponent({
  node,
  level,
  expandedNodes,
  selectedElementId,
  topologyType,
  onToggle,
  onClick,
  onDoubleClick,
  onContextMenu,
}: TreeNodeComponentProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id) || node.expanded;
  const isSelected = node.elementId === selectedElementId;
  const isElement = node.nodeType === 'ELEMENT';
  const isStudyCase = node.nodeType === 'STUDY_CASE';
  const isRunItem = node.nodeType === 'RUN_ITEM'; // P11c
  const isStation = node.nodeType === 'STATION'; // FIX-05
  const isVoltageLevel = node.nodeType === 'VOLTAGE_LEVEL'; // FIX-05
  const isNetwork = node.nodeType === 'NETWORK'; // Enhancement 7

  // Enhancement 3: Service status for ELEMENT nodes
  const isOutOfService = isElement && node.inService === false;

  // Get symbol definition from map
  const symbolDef = getTreeSymbol(node.nodeType);

  // FIX-05: Station and VoltageLevel use node.label (dynamic name)
  const label = isElement || isStudyCase || isRunItem || isStation || isVoltageLevel
    ? node.label
    : TREE_NODE_LABELS[node.nodeType];

  // Get status color class for study cases and run items
  const statusColorClass = (isStudyCase || isRunItem) && node.resultStatus
    ? RESULT_STATUS_COLORS[node.resultStatus]
    : 'text-gray-600';

  // PROJECT_TREE_PARITY_V1: Deterministic data-testid for E2E testing
  const getTestId = (): string => {
    if (isElement && node.elementId) {
      return `tree-node-element-${node.elementId}`;
    }
    if (isStudyCase && node.studyCaseId) {
      return `tree-node-case-${node.studyCaseId}`;
    }
    if (isRunItem && node.runId) {
      return `tree-node-run-${node.runId}`;
    }
    // FIX-05: Station test ID
    if (isStation && node.stationId) {
      return `tree-node-station-${node.stationId}`;
    }
    return `tree-node-${node.id}`;
  };

  return (
    <div data-testid={`tree-node-container-${node.id}`}>
      {/* Node row */}
      <div
        data-testid={getTestId()}
        data-node-type={node.nodeType}
        data-node-id={node.id}
        data-expanded={isExpanded}
        data-selected={isSelected}
        data-in-service={isElement ? (node.inService !== false) : undefined}
        className={clsx(
          'flex items-center py-1 px-2 rounded cursor-pointer',
          'hover:bg-gray-100 transition-colors',
          isSelected && 'bg-blue-100 hover:bg-blue-100',
          // P10: Active study case highlighting
          isStudyCase && node.isActive && 'bg-blue-50 hover:bg-blue-100',
          !isElement && !isStudyCase && !isRunItem && 'font-medium',
          // Enhancement 3: Out-of-service visual indicator
          isOutOfService && 'opacity-50'
        )}
        style={{ paddingLeft: `${level * 16 + 4}px` }}
        onClick={() => onClick(node)}
        onDoubleClick={() => onDoubleClick(node)}
        onContextMenu={(e) => onContextMenu(node, e)}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 mr-1 flex-shrink-0"
            data-testid={`tree-toggle-${node.id}`}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'ZwiĹ„ wÄ™zeĹ‚' : 'RozwiĹ„ wÄ™zeĹ‚'}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              {isExpanded ? (
                <path d="M2 4 L5 7 L8 4" />
              ) : (
                <path d="M4 2 L7 5 L4 8" />
              )}
            </svg>
          </button>
        ) : (
          <span className="w-4 h-4 mr-1 flex-shrink-0" aria-hidden="true" />
        )}

        {/* P10: Active case indicator */}
        {isStudyCase && node.isActive && (
          <span
            className="w-2 h-2 bg-blue-500 rounded-full mr-1 flex-shrink-0"
            title="Aktywny przypadek"
            aria-label="Aktywny przypadek"
          />
        )}

        {/* ETAP Symbol Icon */}
        <span
          className={clsx('mr-2 flex-shrink-0', statusColorClass)}
          title={(isStudyCase || isRunItem) ? getResultStatusTooltip(node.resultStatus) : symbolDef.ariaLabel}
        >
          <TreeEtapSymbolIcon
            symbolId={symbolDef.symbolId}
            size={14}
            title={symbolDef.ariaLabel}
          />
        </span>

        {/* Label */}
        <span
          className={clsx(
            'text-xs flex-1 truncate',
            (isElement || isRunItem) ? 'text-gray-700' : 'text-gray-900',
            isStudyCase && node.isActive && 'font-medium',
            // Enhancement 3: Dashed underline for out-of-service elements
            isOutOfService && 'line-through decoration-dashed'
          )}
        >
          {label}
        </span>

        {/* Enhancement 3: Out-of-service badge */}
        {isOutOfService && (
          <span
            className="ml-1 text-[9px] text-gray-400 flex-shrink-0"
            data-testid={`tree-node-out-of-service-${node.elementId}`}
            title="Element wyĹ‚Ä…czony z eksploatacji"
          >
            wyĹ‚.
          </span>
        )}

        {/* P10: Active badge for study case */}
        {isStudyCase && node.isActive && (
          <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded">
            aktywny
          </span>
        )}

        {/* Enhancement 7: Topology summary badge for NETWORK node */}
        {isNetwork && topologyType && (
          <span
            className={clsx(
              'ml-2 px-1.5 py-0.5 text-[10px] rounded flex-shrink-0',
              topologyType === 'radialny'
                ? 'bg-gray-100 text-gray-600'
                : 'bg-indigo-100 text-indigo-700'
            )}
            data-testid="project-tree-topology-badge"
            title={`Typ topologii: ${topologyType}`}
          >
            {topologyType}
          </span>
        )}

        {/* Count badge */}
        {node.count !== undefined && (
          <span className="text-xs text-gray-400 ml-2">({node.count})</span>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div data-testid={`tree-children-${node.id}`} role="group">
          {node.children!.map((child) => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              level={level + 1}
              expandedNodes={expandedNodes}
              selectedElementId={selectedElementId}
              topologyType={topologyType}
              onToggle={onToggle}
              onClick={onClick}
              onDoubleClick={onDoubleClick}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getModeLabel(mode: OperatingMode): string {
  switch (mode) {
    case 'MODEL_EDIT':
      return 'Tryb: Edycja modelu';
    case 'CASE_CONFIG':
      return 'Tryb: Konfiguracja przypadku';
    case 'RESULT_VIEW':
      return 'Tryb: Wyniki (tylko odczyt)';
    default:
      return mode;
  }
}

export default ProjectTree;
