/**
 * MassReviewPanel — Panel kontroli technicznej układu.
 *
 * Zawiera zakładki: Katalogi do przypisania / Transformatory / Łączniki / OZE.
 * Każda zakładka renderuje specjalizowaną tabelę z możliwością nawigacji i edycji.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { MissingCatalogReview } from './MissingCatalogReview';
import { TransformerReview } from './TransformerReview';
import { SwitchReview } from './SwitchReview';
import { OzeReview } from './OzeReview';
import { ReadinessBlockersReview } from './ReadinessBlockersReview';
import { IncompleteStationsReview } from './IncompleteStationsReview';
import { useSnapshotStore } from '../../topology/snapshotStore';

// =============================================================================
// Types
// =============================================================================

export type ReviewTab = 'catalog' | 'transformers' | 'switches' | 'oze' | 'readiness' | 'stations';

interface TabDef {
  id: ReviewTab;
  label: string;
  description: string;
}

const TABS: readonly TabDef[] = [
  { id: 'catalog', label: 'Katalogi', description: 'Powiązanie aparatury i odcinków z katalogami technicznymi' },
  { id: 'transformers', label: 'Transformatory', description: 'Parametry transformatorów SN/nN' },
  { id: 'switches', label: 'Łączniki', description: 'Stany łączników, NOP, konfiguracja' },
  { id: 'oze', label: 'PV/BESS/FW', description: 'Układy przyłączeniowe i magazyny energii' },
  { id: 'readiness', label: 'Kontrola', description: 'Zagadnienia konfiguracji przed analizą' },
  { id: 'stations', label: 'Stacje', description: 'Zakres konfiguracji stacji SN/nN' },
] as const;

// =============================================================================
// Component
// =============================================================================

export interface MassReviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: ReviewTab;
  className?: string;
}

export function MassReviewPanel({ isOpen, onClose, initialTab = 'catalog', className }: MassReviewPanelProps) {
  const [activeTab, setActiveTab] = useState<ReviewTab>(initialTab);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);

  const counts = useMemo(() => {
    if (!snapshot) return { catalog: 0, transformers: 0, switches: 0, oze: 0, readiness: 0, stations: 0 };

    let missingCatalog = 0;
    for (const b of snapshot.branches ?? []) {
      if ((b.type === 'line_overhead' || b.type === 'cable') && !b.catalog_ref) missingCatalog++;
    }
    for (const t of snapshot.transformers ?? []) { if (!t.catalog_ref) missingCatalog++; }
    for (const g of snapshot.generators ?? []) { if (!g.catalog_ref) missingCatalog++; }
    for (const l of snapshot.loads ?? []) { if (!l.catalog_ref) missingCatalog++; }

    const switchTypes = ['switch', 'breaker', 'bus_coupler', 'disconnector', 'fuse'];
    const mvLvStationCount = (snapshot.substations ?? []).filter((station) =>
      String(station.station_type ?? '').toLowerCase() !== 'gpz',
    ).length;

    return {
      catalog: missingCatalog,
      transformers: snapshot.transformers?.length ?? 0,
      switches: (snapshot.branches ?? []).filter(
        (b) => switchTypes.includes(b.type),
      ).length,
      oze: snapshot.generators?.length ?? 0,
      readiness: readiness?.blockers?.length ?? 0,
      stations: mvLvStationCount,
    };
  }, [snapshot, readiness]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className={clsx(
          'bg-white rounded-lg shadow-2xl flex flex-col',
          'w-[900px] max-w-[95vw] h-[600px] max-h-[85vh]',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Kontrola techniczna układu"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Kontrola techniczna układu</h3>
            <p className="text-[10px] text-gray-500">
              Sprawdzenie katalogów, transformatorów, łączników, OZE i zakresu stacji.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            aria-label="Zamknij"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0 px-4 border-b border-gray-200 bg-gray-50/50">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 text-[11px] border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-700 font-medium bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              )}
              title={tab.description}
            >
              {tab.label}
              {counts[tab.id] > 0 && (
                <span
                  className={clsx(
                    'px-1.5 py-0.5 rounded-full text-[9px] font-medium',
                    tab.id === 'catalog' && counts.catalog > 0
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-500',
                  )}
                >
                  {counts[tab.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'catalog' && <MissingCatalogReview />}
          {activeTab === 'transformers' && <TransformerReview />}
          {activeTab === 'switches' && <SwitchReview />}
          {activeTab === 'oze' && <OzeReview />}
          {activeTab === 'readiness' && <ReadinessBlockersReview />}
          {activeTab === 'stations' && <IncompleteStationsReview />}
        </div>
      </div>
    </div>
  );
}
