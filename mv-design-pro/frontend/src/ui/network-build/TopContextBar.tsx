/**
 * TopContextBar — Pasek kontekstowy nad SLD.
 *
 * Wyświetla: nazwa projektu + aktywny case + faza budowy + szybkie akcje.
 * Zapewnia szybki dostęp do przeglądów masowych, katalogu, wyszukiwania.
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo } from 'react';
import { clsx } from 'clsx';
import { useNetworkBuildDerived } from './networkBuildStore';
import { useAppStateStore, useCanCalculate } from '../app-state';
import { useSnapshotStore } from '../topology/snapshotStore';

// =============================================================================
// Types
// =============================================================================

export interface TopContextBarProps {
  className?: string;
  projectName?: string;
  caseName?: string;
  onOpenGlobalSearch?: () => void;
  onOpenCatalogBrowser?: () => void;
  onOpenMassReview?: () => void;
  onOpenProjectMetadata?: () => void;
  onOpenSnapshotHistory?: () => void;
  onRunAnalysis?: () => void;
  onOpenResults?: () => void;
  onToggleIssuePanel?: () => void;
  issuePanelOpen?: boolean;
}

// =============================================================================
// Phase indicator colors
// =============================================================================

const PHASE_COLORS: Record<string, string> = {
  NO_SOURCE: 'bg-red-100 text-red-700 border-red-200',
  HAS_SOURCE: 'bg-amber-100 text-amber-700 border-amber-200',
  HAS_TRUNKS: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  HAS_STATIONS: 'bg-blue-100 text-blue-700 border-blue-200',
  READY: 'bg-green-100 text-green-700 border-green-200',
};

const PHASE_DOTS: Record<string, string> = {
  NO_SOURCE: 'bg-red-500',
  HAS_SOURCE: 'bg-amber-500',
  HAS_TRUNKS: 'bg-yellow-500',
  HAS_STATIONS: 'bg-blue-500',
  READY: 'bg-green-500',
};

// =============================================================================
// Component
// =============================================================================

export function TopContextBar({
  className,
  projectName,
  caseName,
  onOpenGlobalSearch,
  onOpenCatalogBrowser,
  onOpenMassReview,
  onOpenProjectMetadata,
  onOpenSnapshotHistory,
  onRunAnalysis,
  onOpenResults,
  onToggleIssuePanel,
  issuePanelOpen = false,
}: TopContextBarProps) {
  const { buildPhase, buildPhaseLabel: phaseLabel, blockersByCategory, isReady } =
    useNetworkBuildDerived();
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const resultStatus = useAppStateStore((s) => s.activeCaseResultStatus);
  const { allowed: canRunAnalysis, reason: calculateBlockedReason } = useCanCalculate();

  const stats = useMemo(() => {
    if (!snapshot) return null;
    return {
      buses: snapshot.buses?.length ?? 0,
      branches: snapshot.branches?.length ?? 0,
      transformers: snapshot.transformers?.length ?? 0,
      generators: snapshot.generators?.length ?? 0,
      loads: snapshot.loads?.length ?? 0,
      stations: snapshot.substations?.length ?? 0,
    };
  }, [snapshot]);

  return (
    <div
      className={clsx(
        'flex items-center gap-3 px-3 py-1.5 bg-white border-b border-gray-200',
        'text-[11px] select-none',
        className,
      )}
      data-testid="top-context-bar"
    >
      {/* Project info */}
      <div className="flex items-center gap-2 min-w-0">
        {projectName && (
          <button
            type="button"
            onClick={onOpenProjectMetadata}
            className="font-semibold text-gray-800 truncate max-w-[160px] hover:text-blue-600 transition-colors"
            title="Edytuj metadane projektu"
          >
            {projectName}
          </button>
        )}
        {caseName && (
          <>
            <span className="text-gray-300">/</span>
            <span className="text-gray-500 truncate max-w-[120px]">{caseName}</span>
          </>
        )}
      </div>

      {/* Separator */}
      <div className="w-px h-4 bg-gray-200" />

      {/* Build phase badge */}
      <div
        className={clsx(
          'flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium',
          PHASE_COLORS[buildPhase] ?? 'bg-gray-100 text-gray-600 border-gray-200',
        )}
      >
        <span
          className={clsx(
            'w-1.5 h-1.5 rounded-full',
            PHASE_DOTS[buildPhase] ?? 'bg-gray-400',
            buildPhase === 'READY' && 'animate-none',
            buildPhase !== 'READY' && 'animate-pulse',
          )}
        />
        {phaseLabel}
      </div>

      {/* Blockers summary */}
      {blockersByCategory.total > 0 && (
        <div className="flex items-center gap-1 text-[10px]">
          <span className="text-red-600 font-medium">
            {blockersByCategory.total} {blockersByCategory.total === 1 ? 'bloker' : 'blokerów'}
          </span>
          <span className="text-gray-400">
            (T:{blockersByCategory.topologia} K:{blockersByCategory.katalogi} E:{blockersByCategory.eksploatacja})
          </span>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="hidden xl:flex items-center gap-2 text-[10px] text-gray-400">
          <span>{stats.buses} szyn</span>
          <span className="text-gray-200">·</span>
          <span>{stats.branches} gałęzi</span>
          <span className="text-gray-200">·</span>
          <span>{stats.stations} stacji</span>
          <span className="text-gray-200">·</span>
          <span>{stats.transformers} trafo</span>
          {stats.generators > 0 && (
            <>
              <span className="text-gray-200">·</span>
              <span>{stats.generators} OZE</span>
            </>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Quick actions */}
      <div className="flex items-center gap-1">
        {/* Search */}
        <button
          type="button"
          onClick={onToggleIssuePanel}
          className={clsx(
            'flex items-center gap-1 px-2 py-1 rounded transition-colors',
            issuePanelOpen
              ? 'bg-amber-100 text-amber-800'
              : 'text-gray-500 hover:bg-gray-100',
          )}
          title="Pokaz panel problemow i diagnostyki"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 4.5h.008v.008H12v-.008z" />
          </svg>
          <span className="hidden sm:inline">Problemy</span>
          {(blockersByCategory.total > 0 || issuePanelOpen) && (
            <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] font-semibold">
              {blockersByCategory.total}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onRunAnalysis}
          disabled={!onRunAnalysis || !canRunAnalysis}
          className={clsx(
            'flex items-center gap-1 px-2 py-1 rounded transition-colors',
            onRunAnalysis && canRunAnalysis
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'cursor-not-allowed bg-slate-100 text-slate-400',
          )}
          title={calculateBlockedReason ?? 'Uruchom analize dla aktywnego przypadku'}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
          <span className="hidden sm:inline">Oblicz</span>
        </button>

        <button
          type="button"
          onClick={onOpenResults}
          disabled={!onOpenResults || resultStatus === 'NONE'}
          className={clsx(
            'flex items-center gap-1 px-2 py-1 rounded transition-colors',
            onOpenResults && resultStatus !== 'NONE'
              ? 'text-gray-600 hover:bg-gray-100'
              : 'cursor-not-allowed text-gray-300',
          )}
          title={resultStatus === 'NONE' ? 'Brak wynikow dla aktywnego przypadku' : 'Otworz kanoniczna przestrzen wynikow'}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <span className="hidden sm:inline">Wyniki</span>
        </button>

        <button
          type="button"
          onClick={onOpenGlobalSearch}
          className="flex items-center gap-1 px-2 py-1 rounded text-gray-500 hover:bg-gray-100 transition-colors"
          title="Szukaj elementu (Ctrl+K)"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="hidden sm:inline">Szukaj</span>
          <kbd className="hidden sm:inline px-1 py-0.5 text-[9px] font-mono bg-gray-100 border border-gray-200 rounded">
            ⌘K
          </kbd>
        </button>

        {/* Catalog */}
        <button
          type="button"
          onClick={onOpenCatalogBrowser}
          className="flex items-center gap-1 px-2 py-1 rounded text-gray-500 hover:bg-gray-100 transition-colors"
          title="Przeglądarka katalogów"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <span className="hidden sm:inline">Katalogi</span>
        </button>

        {/* Mass review */}
        <button
          type="button"
          onClick={onOpenMassReview}
          className="flex items-center gap-1 px-2 py-1 rounded text-gray-500 hover:bg-gray-100 transition-colors"
          title="Przeglądy masowe"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12h-7.5m8.625 0h7.5m-8.625 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125" />
          </svg>
          <span className="hidden sm:inline">Przeglądy</span>
        </button>

        {/* History */}
        <button
          type="button"
          onClick={onOpenSnapshotHistory}
          className="flex items-center gap-1 px-2 py-1 rounded text-gray-500 hover:bg-gray-100 transition-colors"
          title="Historia zmian"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="hidden sm:inline">Historia</span>
        </button>

        {/* Readiness indicator */}
        {isReady && (
          <div className="ml-1 flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 rounded text-[10px] text-green-700 font-medium">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Gotowy
          </div>
        )}
      </div>
    </div>
  );
}
