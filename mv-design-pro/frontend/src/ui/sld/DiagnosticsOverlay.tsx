import { useCallback, useMemo } from 'react';

import type { ElementType, SelectedElement } from '../types';
import { useFilteredSanityChecks } from '../protection';
import {
  type DiagnosticsSeverityFilter,
  type ElementDiagnostics,
  SANITY_CHECK_CODE_LABELS_PL,
  SEVERITY_COLORS,
  SEVERITY_LABELS_PL,
} from '../protection';
import type { AnySldSymbol, Position } from '../sld-editor/types';
import { DiagnosticsLegend } from './DiagnosticsLegend';
import { buildOverlayPositionMaps } from './overlayUtils';
import type { ViewportState } from './types';

const MARKER_SIZE = 20;
const MARKER_OFFSET_X = 35;
const MARKER_OFFSET_Y = -15;

interface DiagnosticsMarkerProps {
  diagnostics: ElementDiagnostics;
  position: Position;
  isSelected: boolean;
  hasFocusPulse: boolean;
  onMarkerClick: (elementId: string, elementType: ElementType, elementName: string) => void;
}

function DiagnosticsMarker({
  diagnostics,
  position,
  isSelected,
  hasFocusPulse,
  onMarkerClick,
}: DiagnosticsMarkerProps) {
  const severity = diagnostics.max_severity;
  const colors = SEVERITY_COLORS[severity];
  const severityLabel = SEVERITY_LABELS_PL[severity];

  const tooltipContent = useMemo(() => {
    const lines: string[] = [];

    if (diagnostics.error_count > 0) {
      lines.push(`Błędy: ${diagnostics.error_count}`);
    }
    if (diagnostics.warn_count > 0) {
      lines.push(`Ostrzeżenia: ${diagnostics.warn_count}`);
    }
    if (diagnostics.info_count > 0) {
      lines.push(`Informacje: ${diagnostics.info_count}`);
    }

    for (const result of diagnostics.results.slice(0, 3)) {
      lines.push(`- ${SANITY_CHECK_CODE_LABELS_PL[result.code] || result.code}`);
    }

    if (diagnostics.results.length > 3) {
      lines.push(`... i ${diagnostics.results.length - 3} więcej`);
    }

    return lines.join('\n');
  }, [diagnostics]);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onMarkerClick(diagnostics.element_id, diagnostics.element_type, diagnostics.element_id);
    },
    [diagnostics.element_id, diagnostics.element_type, onMarkerClick],
  );

  const icon = severity === 'ERROR' ? '!' : severity === 'WARN' ? '?' : 'i';

  return (
    <div
      data-testid={`sld-diagnostics-marker-${diagnostics.element_id}-${diagnostics.results[0]?.code || 'multi'}`}
      className={`
        absolute z-30 cursor-pointer rounded-full border-2 shadow-md transition-all duration-150
        hover:scale-110 hover:shadow-lg ${colors.marker} ${colors.border} text-white
        ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
        ${hasFocusPulse ? 'animate-pulse ring-4 ring-blue-500 ring-opacity-75' : ''}
      `}
      style={{
        left: `${position.x + MARKER_OFFSET_X}px`,
        top: `${position.y + MARKER_OFFSET_Y}px`,
        width: `${MARKER_SIZE}px`,
        height: `${MARKER_SIZE}px`,
        transform: 'translate(-50%, -50%)',
      }}
      title={`${severityLabel}\n${tooltipContent}`}
      onClick={handleClick}
      role="button"
      aria-label={`Diagnostyka: ${diagnostics.error_count} błędów, ${diagnostics.warn_count} ostrzeżeń`}
      data-focus-pulse={hasFocusPulse ? 'true' : undefined}
    >
      <span className="flex h-full w-full items-center justify-center text-xs font-bold">{icon}</span>
      {diagnostics.results.length > 1 && (
        <span className="absolute -right-1 -top-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full border bg-white px-0.5 text-xs font-semibold text-slate-700">
          {diagnostics.results.length}
        </span>
      )}
    </div>
  );
}

export interface DiagnosticsOverlayProps {
  symbols: AnySldSymbol[];
  viewport: ViewportState;
  selectedElementId?: string | null;
  focusPulseElementId?: string | null;
  visible: boolean;
  filter: DiagnosticsSeverityFilter;
  onMarkerClick: (element: SelectedElement) => void;
  projectId?: string | null | undefined;
  diagramId?: string | null | undefined;
  showLegend?: boolean;
}

export function DiagnosticsOverlay({
  symbols,
  viewport,
  selectedElementId,
  focusPulseElementId,
  visible,
  filter,
  onMarkerClick,
  projectId,
  diagramId,
  showLegend = true,
}: DiagnosticsOverlayProps) {
  const { filteredByElement, errorCount, warnCount, infoCount, hasResults } = useFilteredSanityChecks(
    projectId,
    diagramId,
    filter,
  );

  const { nodePositions, branchPositions } = useMemo(
    () => buildOverlayPositionMaps(symbols, viewport),
    [symbols, viewport],
  );

  const markers = useMemo(() => {
    if (!visible || !hasResults) {
      return [];
    }

    const result: Array<{
      diagnostics: ElementDiagnostics;
      position: Position;
      isSelected: boolean;
      hasFocusPulse: boolean;
    }> = [];

    for (const diagnostics of filteredByElement.values()) {
      let position = nodePositions.get(diagnostics.element_id);
      if (!position) {
        position = branchPositions.get(diagnostics.element_id);
      }

      if (!position) {
        for (const symbol of symbols) {
          if (symbol.id === diagnostics.element_id || symbol.elementId === diagnostics.element_id) {
            position = {
              x: symbol.position.x * viewport.zoom + viewport.offsetX,
              y: symbol.position.y * viewport.zoom + viewport.offsetY,
            };
            break;
          }
        }
      }

      if (!position) {
        continue;
      }

      result.push({
        diagnostics,
        position,
        isSelected: selectedElementId === diagnostics.element_id,
        hasFocusPulse: focusPulseElementId === diagnostics.element_id,
      });
    }

    result.sort((left, right) => {
      const leftOrder = left.diagnostics.max_severity === 'ERROR' ? 0 : left.diagnostics.max_severity === 'WARN' ? 1 : 2;
      const rightOrder = right.diagnostics.max_severity === 'ERROR' ? 0 : right.diagnostics.max_severity === 'WARN' ? 1 : 2;
      return leftOrder - rightOrder;
    });

    return result;
  }, [
    branchPositions,
    filteredByElement,
    focusPulseElementId,
    hasResults,
    nodePositions,
    selectedElementId,
    symbols,
    viewport,
    visible,
  ]);

  const handleMarkerClick = useCallback(
    (elementId: string, elementType: ElementType, elementName: string) => {
      onMarkerClick({
        id: elementId,
        type: elementType,
        name: elementName,
      });
    },
    [onMarkerClick],
  );

  if (!visible) {
    return null;
  }

  const hasMappedMarkers = markers.length > 0;

  return (
    <div data-testid="sld-diagnostics-overlay" className="pointer-events-none absolute inset-0 overflow-hidden">
      {!hasResults && (
        <div
          data-testid="sld-diagnostics-overlay-empty-state"
          className="absolute left-3 top-3 rounded-lg border border-slate-300 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm"
        >
          Brak diagnostyki do wyświetlenia dla aktywnego widoku.
        </div>
      )}

      {hasResults && !hasMappedMarkers && (
        <div
          data-testid="sld-diagnostics-overlay-unmapped-state"
          className="absolute left-3 top-3 rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow-sm"
        >
          nie udało się powiązać markerów z geometrią schematu
        </div>
      )}

      {markers.map(({ diagnostics, position, isSelected, hasFocusPulse }) => (
        <DiagnosticsMarker
          key={diagnostics.element_id}
          diagnostics={diagnostics}
          position={position}
          isSelected={isSelected}
          hasFocusPulse={hasFocusPulse}
          onMarkerClick={handleMarkerClick}
        />
      ))}

      {showLegend && hasResults && (
        <DiagnosticsLegend
          errorCount={errorCount}
          warnCount={warnCount}
          infoCount={infoCount}
          filter={filter}
        />
      )}
    </div>
  );
}

export default DiagnosticsOverlay;
