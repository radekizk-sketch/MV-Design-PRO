/**
 * SldVisualModes — Toolbar trybów wizualnych SLD.
 *
 * Przełączanie filtrów warstwowych: Wszystko / Gotowość / Źródła / nN / Zabezpieczenia.
 * Tryb szkieletowy (widok szkieletowy).
 *
 * ARCHITEKTURA V12:
 * - Stan przechowywany w `useSldLayerFiltersStore` (Zustand) — JEDNO źródło prawdy.
 * - CustomEvent 'sld:visual-filter-change' USUNIĘTY — był martwym kodem (brak konsumentów).
 * - Canvas czyta stan bezpośrednio ze sklepu.
 * - 100% PL etykiety.
 */

import { useCallback, useEffect } from 'react';
import { clsx } from 'clsx';
import {
  useSldLayerFiltersStore,
  SLD_LAYER_FILTER_LABELS_PL,
  SLD_LAYER_FILTER_DESCRIPTIONS_PL,
  SLD_LAYER_FILTERS,
  type SldLayerFilter,
} from '../sld/sldLayerFiltersStore';

// =============================================================================
// Ikony per filtr
// =============================================================================

const FILTER_ICONS: Record<SldLayerFilter, JSX.Element> = {
  WSZYSTKO: (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  TYLKO_GOTOWOSC: (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  TYLKO_ZRODLA: (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  TYLKO_NN: (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  ),
  TYLKO_ZABEZPIECZENIA: (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
};

const SKELETON_ICON = (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
  </svg>
);

function CanvasToolButton({
  label,
  active = false,
  children,
}: {
  label: string;
  active?: boolean;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        'grid h-7 w-7 place-items-center rounded-sm border text-scada-muted transition-colors',
        active
          ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200'
          : 'border-scada-border bg-[#08121a] hover:border-cyan-500/55 hover:text-scada-text',
      )}
    >
      {children}
    </button>
  );
}

const ICON_HAND = (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 11V7.5a1.5 1.5 0 113 0V11m0-3.5a1.5 1.5 0 113 0V11m0-2.5a1.5 1.5 0 113 0V12m0-1.5a1.5 1.5 0 113 0V14a6 6 0 01-6 6h-1.5A6.5 6.5 0 014 13.5V12a1.5 1.5 0 013 0v1" />
  </svg>
);

const ICON_POINTER = (
  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M5 3l12.5 8.2-6.1 1.1 3.8 6.7-2.7 1.5-3.8-6.6-4 4.6L5 3z" />
  </svg>
);

const ICON_ZOOM = (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2M10.8 18a7.2 7.2 0 100-14.4 7.2 7.2 0 000 14.4z" />
  </svg>
);

const ICON_ZOOM_IN = (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2M10.8 18a7.2 7.2 0 100-14.4 7.2 7.2 0 000 14.4zM10.8 7.7v6.2M7.7 10.8h6.2" />
  </svg>
);

const ICON_FIT = (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);

// =============================================================================
// Komponent
// =============================================================================

export interface SldVisualModesProps {
  className?: string;
}

export function SldVisualModes({ className }: SldVisualModesProps) {
  const { layerFilter, skeletonView, setLayerFilter, toggleSkeletonView } =
    useSldLayerFiltersStore();

  const handleFilterChange = useCallback(
    (filter: SldLayerFilter) => {
      setLayerFilter(filter);
    },
    [setLayerFilter],
  );

  // Skróty klawiaturowe
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key === 'g') {
        e.preventDefault();
        handleFilterChange(layerFilter === 'TYLKO_GOTOWOSC' ? 'WSZYSTKO' : 'TYLKO_GOTOWOSC');
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        handleFilterChange(layerFilter === 'TYLKO_ZRODLA' ? 'WSZYSTKO' : 'TYLKO_ZRODLA');
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [layerFilter, handleFilterChange]);

  const isFilterActive = layerFilter !== 'WSZYSTKO';

  return (
    <div
      className={clsx(
        'flex items-center gap-1',
        className,
      )}
      data-testid="sld-visual-modes"
      role="toolbar"
      aria-label="Filtry warstwowe SLD"
    >
      <div className="flex items-center gap-1 border-r border-scada-border pr-2">
        <CanvasToolButton label="Panoramuj schemat">{ICON_HAND}</CanvasToolButton>
        <CanvasToolButton label="Wybierz element" active>{ICON_POINTER}</CanvasToolButton>
        <CanvasToolButton label="Powiększ obszar">{ICON_ZOOM}</CanvasToolButton>
        <CanvasToolButton label="Powiększ">{ICON_ZOOM_IN}</CanvasToolButton>
        <CanvasToolButton label="Dopasuj widok">{ICON_FIT}</CanvasToolButton>
      </div>

      {/* Filtry warstwowe */}
      {SLD_LAYER_FILTERS.map((filter) => {
        const isActive = layerFilter === filter;
        return (
          <button
            key={filter}
            type="button"
            onClick={() => handleFilterChange(filter)}
            title={`${SLD_LAYER_FILTER_LABELS_PL[filter]}\n${SLD_LAYER_FILTER_DESCRIPTIONS_PL[filter]}`}
            className={clsx(
              'flex h-7 items-center gap-1.5 rounded-sm border px-2 text-[11px] transition-colors',
              isActive
                ? 'border-cyan-500/55 bg-cyan-500/12 text-cyan-200 shadow-sm shadow-cyan-950/20'
                : 'border-scada-border bg-[#08121a] text-scada-muted hover:border-cyan-500/55 hover:text-scada-text',
            )}
            aria-pressed={isActive}
            data-testid={`layer-filter-btn-${filter.toLowerCase()}`}
          >
            {FILTER_ICONS[filter]}
            <span className="hidden lg:inline">{SLD_LAYER_FILTER_LABELS_PL[filter]}</span>
          </button>
        );
      })}

      {/* Separator */}
      <div className="mx-0.5 h-4 w-px bg-scada-border" />

      {/* Widok szkieletowy */}
      <button
        type="button"
        onClick={() => toggleSkeletonView()}
        title="Widok szkieletowy — pokaż tylko główne magistrale, stacje i GPZ"
        className={clsx(
          'flex h-7 items-center gap-1.5 rounded-sm border px-2 text-[11px] transition-colors',
          skeletonView
            ? 'border-cyan-500/55 bg-cyan-500/12 text-cyan-200 shadow-sm shadow-cyan-950/20'
            : 'border-scada-border bg-[#08121a] text-scada-muted hover:border-cyan-500/55 hover:text-scada-text',
        )}
        aria-pressed={skeletonView}
        data-testid="skeleton-view-btn"
      >
        {SKELETON_ICON}
        <span className="hidden lg:inline">Szkielet</span>
      </button>

      {/* Wskaźnik aktywnego filtra */}
      {(isFilterActive || skeletonView) && (
        <div className="ml-1 flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          {skeletonView && !isFilterActive
            ? 'Szkielet'
            : skeletonView
              ? 'Szkielet + filtr'
              : 'Filtr aktywny'}
        </div>
      )}
    </div>
  );
}
