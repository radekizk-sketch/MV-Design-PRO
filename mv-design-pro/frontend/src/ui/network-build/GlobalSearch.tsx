/**
 * GlobalSearch — Wyszukiwarka globalna (Ctrl+K).
 *
 * Command palette wyszukująca elementy ENM po nazwie, oznaczeniu i typie.
 * Wynik → nawigacja do elementu na SLD + zaznaczenie w drzewie.
 * Max 20 wyników, grouping po kategoriach.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { useSnapshotStore } from '../topology/snapshotStore';
import { formatGeneratorTypeShortLabelPl } from '../shared/generatorTypeLabels';
import { formatStationTypeLabelPl } from '../shared/stationTypeLabels';
import { stationPublicIdentity } from '../shared/publicTechnicalLabels';
import { useSelectionStore } from '../selection';

// =============================================================================
// Types
// =============================================================================

interface SearchResult {
  id: string;
  name: string;
  category: SearchCategory;
  categoryLabel: string;
  elementType: string;
  detail: string;
}

type SearchCategory = 'sources' | 'buses' | 'branches' | 'transformers' | 'stations' | 'generators' | 'loads';

const CATEGORY_LABELS: Record<SearchCategory, string> = {
  sources: 'Zasilanie GPZ',
  buses: 'Szyny',
  branches: 'Odcinki SN',
  transformers: 'Transformatory',
  stations: 'Stacje',
  generators: 'Układy PV/BESS/FW',
  loads: 'Odbiory',
};

const CATEGORY_ORDER: SearchCategory[] = [
  'sources', 'stations', 'transformers', 'branches', 'generators', 'loads', 'buses',
];

// =============================================================================
// Component
// =============================================================================

export interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Build search results
  const results = useMemo<SearchResult[]>(() => {
    if (!snapshot || !query.trim()) return [];
    const q = query.toLowerCase();
    const all: SearchResult[] = [];
    const stationByRef = new Map<string, NonNullable<typeof snapshot.substations>[number]>();
    for (const station of snapshot.substations ?? []) {
      stationByRef.set(station.id, station);
      stationByRef.set(station.ref_id, station);
    }
    const generatorGroupKey = (generator: NonNullable<typeof snapshot.generators>[number]) => {
      const sourceKind = formatGeneratorTypeShortLabelPl(generator.gen_type);
      return `${sourceKind}|${generator.station_ref ?? generator.bus_ref ?? generator.ref_id}`;
    };
    const generatorGroupTotals = new Map<string, number>();
    for (const generator of snapshot.generators ?? []) {
      const key = generatorGroupKey(generator);
      generatorGroupTotals.set(key, (generatorGroupTotals.get(key) ?? 0) + 1);
    }
    const generatorGroupSeen = new Map<string, number>();

    // Sources
    for (const s of snapshot.sources ?? []) {
      if (s.name.toLowerCase().includes(q) || s.ref_id.toLowerCase().includes(q)) {
        all.push({
          id: s.ref_id,
          name: s.name,
          category: 'sources',
          categoryLabel: CATEGORY_LABELS.sources,
          elementType: 'Source',
          detail: `Model: ${s.model}`,
        });
      }
    }

    // Buses
    for (const b of snapshot.buses ?? []) {
      if (b.name.toLowerCase().includes(q) || b.ref_id.toLowerCase().includes(q)) {
        all.push({
          id: b.ref_id,
          name: b.name,
          category: 'buses',
          categoryLabel: CATEGORY_LABELS.buses,
          elementType: 'Bus',
          detail: `${b.voltage_kv} kV`,
        });
      }
    }

    // Branches
    for (const b of snapshot.branches ?? []) {
      if (b.name.toLowerCase().includes(q) || b.ref_id.toLowerCase().includes(q)) {
        all.push({
          id: b.ref_id,
          name: b.name,
          category: 'branches',
          categoryLabel: CATEGORY_LABELS.branches,
          elementType: 'LineBranch',
          detail: b.type,
        });
      }
    }

    // Transformers
    for (const t of snapshot.transformers ?? []) {
      if (t.name.toLowerCase().includes(q) || t.ref_id.toLowerCase().includes(q)) {
        all.push({
          id: t.ref_id,
          name: t.name,
          category: 'transformers',
          categoryLabel: CATEGORY_LABELS.transformers,
          elementType: 'TransformerBranch',
          detail: `${t.sn_mva} MVA, uk=${t.uk_percent}%`,
        });
      }
    }

    // Substations
    for (const s of snapshot.substations ?? []) {
      if (s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)) {
        all.push({
          id: s.id,
          name: s.name,
          category: 'stations',
          categoryLabel: CATEGORY_LABELS.stations,
          elementType: 'Station',
          detail: `Typ: ${formatStationTypeLabelPl(s.station_type)}`,
        });
      }
    }

    // Generators
    for (const g of snapshot.generators ?? []) {
      if (g.name.toLowerCase().includes(q) || g.ref_id.toLowerCase().includes(q)) {
        const sourceKind = formatGeneratorTypeShortLabelPl(g.gen_type);
        const station = g.station_ref ? stationByRef.get(g.station_ref) : null;
        const stationIdentity = station ? stationPublicIdentity(snapshot, station) : null;
        const groupKey = generatorGroupKey(g);
        const groupIndex = (generatorGroupSeen.get(groupKey) ?? 0) + 1;
        generatorGroupSeen.set(groupKey, groupIndex);
        const groupTotal = generatorGroupTotals.get(groupKey) ?? 1;
        const sourceName = stationIdentity
          ? `${sourceKind} · ${stationIdentity.code}${groupTotal > 1 ? ` · układ ${groupIndex}` : ''}`
          : g.name;
        all.push({
          id: g.ref_id,
          name: sourceName,
          category: 'generators',
          categoryLabel: CATEGORY_LABELS.generators,
          elementType: 'Generator',
          detail: stationIdentity
            ? `${stationIdentity.displayName}, ${g.p_mw} MW`
            : `${g.p_mw} MW, ${sourceKind}`,
        });
      }
    }

    // Loads
    for (const l of snapshot.loads ?? []) {
      if (l.name.toLowerCase().includes(q) || l.ref_id.toLowerCase().includes(q)) {
        all.push({
          id: l.ref_id,
          name: l.name,
          category: 'loads',
          categoryLabel: CATEGORY_LABELS.loads,
          elementType: 'Load',
          detail: `P=${l.p_mw} MW, Q=${l.q_mvar} Mvar`,
        });
      }
    }

    // Sort by category order, limit to 20
    all.sort((a, b) => {
      const catA = CATEGORY_ORDER.indexOf(a.category);
      const catB = CATEGORY_ORDER.indexOf(b.category);
      if (catA !== catB) return catA - catB;
      return a.name.localeCompare(b.name, 'pl');
    });

    return all.slice(0, 20);
  }, [snapshot, query]);

  // Group results by category
  const groupedResults = useMemo(() => {
    const groups: Array<{ category: SearchCategory; label: string; items: SearchResult[] }> = [];
    let currentCategory: SearchCategory | null = null;

    for (const r of results) {
      if (r.category !== currentCategory) {
        currentCategory = r.category;
        groups.push({ category: r.category, label: r.categoryLabel, items: [] });
      }
      groups[groups.length - 1].items.push(r);
    }

    return groups;
  }, [results]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      selectElement({
        id: result.id,
        type: result.elementType as 'Bus' | 'LineBranch' | 'TransformerBranch' | 'Source' | 'Load' | 'Station' | 'Generator',
        name: result.name,
      });
      window.dispatchEvent(
        new CustomEvent('sld:center-on-element', { detail: { elementId: result.id } }),
      );
      onClose();
    },
    [selectElement, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    },
    [onClose, results, selectedIndex, handleSelect],
  );

  if (!isOpen) return null;

  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" data-testid="global-search">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative bg-white rounded-lg shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        role="dialog"
        aria-label="Wyszukiwarka układu"
        data-testid="global-search-modal"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Szukaj układu sieci... (oznaczenie, nazwa, typ)"
            className="flex-1 text-sm outline-none placeholder:text-gray-400"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-100 text-gray-500 rounded border border-gray-200">
            Esc
          </kbd>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Zamknij"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {query.trim() && results.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-500">Nie znaleziono układów</p>
              <p className="text-[10px] text-gray-400 mt-1">Spróbuj innej frazy</p>
            </div>
          )}

          {!query.trim() && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-500">Wpisz nazwę, oznaczenie albo typ układu</p>
              <p className="text-[10px] text-gray-400 mt-1">
                Szukaj szyn, odcinków, stacji, transformatorów i układów PV/BESS/FW
              </p>
            </div>
          )}

          {groupedResults.map((group) => (
            <div key={group.category}>
              <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  {group.label}
                </span>
              </div>
              {group.items.map((item) => {
                flatIndex++;
                const idx = flatIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    className={clsx(
                      'w-full text-left px-4 py-2 flex items-center gap-3 transition-colors',
                      selectedIndex === idx
                        ? 'bg-blue-50'
                        : 'hover:bg-gray-50',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{item.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {item.detail}
                      </p>
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                      Enter
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-4 text-[10px] text-gray-400">
            <span>{results.length} wyników</span>
            <span>↑↓ nawigacja</span>
            <span>Enter wybierz</span>
            <span>Esc zamknij</span>
          </div>
        )}
      </div>
    </div>
  );
}
