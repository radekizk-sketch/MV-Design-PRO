/**
 * EnmTree — Drzewo modelu ENM (v4.2).
 *
 * Hierarchiczny widok elementów sieci ENM:
 * Bus, Branch (Line/Cable), Transformer, Switch, Source, Load.
 *
 * Operuje na ENM, NIE na canvasie SLD.
 * Klik → highlight w SLD (ref_id).
 *
 * CANONICAL: Polski nazwy i komunikaty.
 */

import { useMemo } from 'react';
import { useEnmInspectorStore } from './store';
import type { DiagnosticIssue } from './types';

interface EnmElement {
  id: string;
  name: string;
  type: string;
  voltage_level?: number;
  from_node_id?: string;
  to_node_id?: string;
}

interface EnmTreeProps {
  buses: EnmElement[];
  lines: EnmElement[];
  cables: EnmElement[];
  transformers: EnmElement[];
  switches: EnmElement[];
  sources: EnmElement[];
  loads: EnmElement[];
  issues?: DiagnosticIssue[];
  onSelectElement?: (elementId: string, elementType: string) => void;
}

interface CategoryNode {
  id: string;
  label: string;
  icon: string;
  elements: EnmElement[];
  elementType: string;
}

export function EnmTree({
  buses,
  lines,
  cables,
  transformers,
  switches,
  sources,
  loads,
  issues = [],
  onSelectElement,
}: EnmTreeProps) {
  const {
    selectedElementId,
    expandedNodes,
    searchQuery,
    setSelectedElementId,
    toggleNode,
  } = useEnmInspectorStore();

  // Build issue lookup: elementId -> issue count
  const issueMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const issue of issues) {
      for (const ref of issue.affected_refs) {
        map.set(ref, (map.get(ref) || 0) + 1);
      }
    }
    return map;
  }, [issues]);

  // Build category tree
  const categories: CategoryNode[] = useMemo(
    () => [
      { id: 'cat-buses', label: `Szyny (${buses.length})`, icon: 'B', elements: buses, elementType: 'Bus' },
      { id: 'cat-lines', label: `Linie (${lines.length})`, icon: 'L', elements: lines, elementType: 'LineBranch' },
      { id: 'cat-cables', label: `Kable (${cables.length})`, icon: 'K', elements: cables, elementType: 'LineBranch' },
      { id: 'cat-transformers', label: `Transformatory (${transformers.length})`, icon: 'T', elements: transformers, elementType: 'TransformerBranch' },
      { id: 'cat-switches', label: `Łączniki (${switches.length})`, icon: 'S', elements: switches, elementType: 'Switch' },
      { id: 'cat-sources', label: `Zasilanie GPZ (${sources.length})`, icon: 'Z', elements: sources, elementType: 'Source' },
      { id: 'cat-loads', label: `Obciążenia (${loads.length})`, icon: 'O', elements: loads, elementType: 'Load' },
    ],
    [buses, lines, cables, transformers, switches, sources, loads],
  );

  // Filter elements by search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        elements: cat.elements.filter(
          (el) =>
            el.name.toLowerCase().includes(q) ||
            el.id.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.elements.length > 0);
  }, [categories, searchQuery]);

  const handleElementClick = (elementId: string, elementType: string) => {
    setSelectedElementId(elementId);
    onSelectElement?.(elementId, elementType);
  };

  const totalElements =
    buses.length +
    lines.length +
    cables.length +
    transformers.length +
    switches.length +
    sources.length +
    loads.length;

  return (
    <div className="flex flex-col h-full" data-testid="enm-tree">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          Model sieci ENM
        </h3>
        <span className="text-xs text-slate-500">
          {totalElements} elementów
        </span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-100">
        <input
          type="text"
          placeholder="Szukaj elementu..."
          className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={searchQuery}
          onChange={(e) => useEnmInspectorStore.getState().setSearchQuery(e.target.value)}
          data-testid="enm-tree-search"
        />
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {filteredCategories.map((cat) => (
          <div key={cat.id} data-testid={`enm-tree-category-${cat.id}`}>
            {/* Category header */}
            <button
              className="flex items-center w-full px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded"
              onClick={() => toggleNode(cat.id)}
              data-testid={`enm-tree-toggle-${cat.id}`}
            >
              <span className="mr-1 text-slate-400">
                {expandedNodes.has(cat.id) ? '▼' : '▶'}
              </span>
              <span className="mr-1 font-mono text-slate-400 w-4 text-center">
                {cat.icon}
              </span>
              {cat.label}
            </button>

            {/* Elements */}
            {expandedNodes.has(cat.id) && (
              <div className="ml-4">
                {cat.elements.map((el) => {
                  const isSelected = selectedElementId === el.id;
                  const issueCount = issueMap.get(el.id) || 0;
                  return (
                    <button
                      key={el.id}
                      className={`flex items-center justify-between w-full px-2 py-0.5 text-xs rounded cursor-pointer ${
                        isSelected
                          ? 'bg-blue-100 text-blue-800'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                      onClick={() => handleElementClick(el.id, cat.elementType)}
                      title={`${el.name} (${el.id.slice(0, 8)}...)`}
                      data-testid={`enm-tree-element-${el.id}`}
                    >
                      <span className="truncate">
                        {el.name || el.id.slice(0, 12)}
                      </span>
                      <span className="flex items-center gap-1">
                        {el.voltage_level != null && el.voltage_level > 0 && (
                          <span className="text-slate-400">
                            {el.voltage_level} kV
                          </span>
                        )}
                        {issueCount > 0 && (
                          <span className="inline-flex items-center justify-center w-4 h-4 text-xs bg-rose-100 text-rose-700 rounded-full">
                            {issueCount}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {filteredCategories.length === 0 && (
          <div className="px-3 py-4 text-xs text-slate-400 text-center">
            {searchQuery
              ? 'Nie znaleziono elementów'
              : 'Model sieci jest pusty'}
          </div>
        )}
      </div>
    </div>
  );
}
