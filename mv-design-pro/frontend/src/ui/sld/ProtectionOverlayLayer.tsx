/**
 * ProtectionOverlayLayer — PR-SLD-09
 *
 * Warstwa nakladkowa z nastawami zabezpieczen i stanem weryfikacji.
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § B: Warstwa nakladkowa jako osobna warstwa (nie modyfikuje modelu)
 * - ui_canonical_parity.md: Prezentacja nastaw zabezpieczen
 *
 * CECHY:
 * - Etykiety nastaw nadpradowych (I>, I>>, czas)
 * - Stan weryfikacji kryterium
 * - Przekladnik (jesli dostepny)
 * - Deterministyczne pozycjonowanie
 *
 * ZASADY:
 * - 100% READ-ONLY
 * - Brak edycji, brak formularzy
 * - Neutralne kolory (bez czerwieni/zieleni alarmowej)
 * - 100% POLISH UI
 */

import React, { useMemo, useCallback } from 'react';
import type { AnySldSymbol, Position } from '../sld-editor/types';
import type { ViewportState } from './types';
import type { ElementType, SelectedElement } from '../types';
import { buildOverlayPositionMaps } from './overlayUtils';
import {
  useAllProtectionSummaries,
  type ProtectionSummary,
  VERIFICATION_STATUS_LABELS_PL,
  VERIFICATION_STATUS_COLORS,
} from './protection';

// =============================================================================
// STALE
// =============================================================================

/**
 * Offset etykiety od pozycji elementu.
 */
const LABEL_OFFSET_X = 45;
const LABEL_OFFSET_Y = -20;

/**
 * Maksymalna szerokosc etykiety.
 */
const LABEL_MAX_WIDTH = 180;

// =============================================================================
// KOMPONENT ProtectionLabel
// =============================================================================

interface ProtectionLabelProps {
  /** Dane zabezpieczenia */
  summary: ProtectionSummary;

  /** Pozycja na ekranie */
  position: Position;

  /** Czy element jest zaznaczony */
  isSelected: boolean;

  /** Callback przy kliknieciu */
  onLabelClick: (elementId: string, elementType: ElementType, elementName: string) => void;
}

/**
 * Formatuje prog pradowy.
 */
function formatPickup(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pl-PL', { maximumFractionDigits: 0 });
}

/**
 * Formatuje czas.
 */
function formatTime(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value === 0) return 'bezzwl.';
  return `${value.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} s`;
}

/**
 * Etykieta zabezpieczenia przy elemencie.
 */
function ProtectionLabel({
  summary,
  position,
  isSelected,
  onLabelClick,
}: ProtectionLabelProps) {
  const statusColors = VERIFICATION_STATUS_COLORS[summary.verification_status];
  const statusLabel = VERIFICATION_STATUS_LABELS_PL[summary.verification_status];

  // Buduj linie etykiety
  const lines = useMemo(() => {
    const result: string[] = [];

    // Linia 1: I> (nastawa czasowa)
    if (summary.overcurrent?.time_overcurrent) {
      const oc = summary.overcurrent.time_overcurrent;
      const pickup = formatPickup(oc.pickup_a);
      const time = formatTime(oc.trip_time_s);
      const charShort = oc.characteristic === 'DT' ? '' : ` (${oc.characteristic})`;
      result.push(`I>: ${pickup} A / ${time}${charShort}`);
    }

    // Linia 2: I>> (nastawa bezzwloczna)
    if (summary.overcurrent?.instant_overcurrent) {
      const oc = summary.overcurrent.instant_overcurrent;
      const pickup = formatPickup(oc.pickup_a);
      const time = formatTime(oc.trip_time_s);
      result.push(`I>>: ${pickup} A / ${time}`);
    }

    // Linia 3: Przekladnik (jesli istnieje)
    if (summary.ct) {
      result.push(`CT: ${summary.ct.label}`);
    }

    return result;
  }, [summary]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onLabelClick(summary.element_id, summary.element_type, summary.element_name);
    },
    [summary, onLabelClick]
  );

  // Nie renderuj jesli brak danych
  if (!summary.has_complete_data && summary.verification_status === 'BRAK_DANYCH') {
    // Pokaz minimalna etykiete z informacja o braku danych
    return (
      <div
        data-testid={`sld-protection-label-${summary.element_id}`}
        className={`
          absolute z-30 cursor-pointer
          rounded border px-2 py-1 shadow-sm
          transition-all duration-150
          hover:shadow-md
          ${statusColors.bg} ${statusColors.border}
          ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
        `}
        style={{
          left: `${position.x + LABEL_OFFSET_X}px`,
          top: `${position.y + LABEL_OFFSET_Y}px`,
          maxWidth: `${LABEL_MAX_WIDTH}px`,
        }}
        onClick={handleClick}
        role="button"
        aria-label={`Zabezpieczenie: ${summary.element_name}`}
      >
        <div className={`text-[10px] ${statusColors.text}`}>
          {statusLabel}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`sld-protection-label-${summary.element_id}`}
      className={`
        absolute z-30 cursor-pointer
        rounded border px-2 py-1.5 shadow-sm
        transition-all duration-150
        hover:shadow-md
        bg-white border-slate-300
        ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
      `}
      style={{
        left: `${position.x + LABEL_OFFSET_X}px`,
        top: `${position.y + LABEL_OFFSET_Y}px`,
        maxWidth: `${LABEL_MAX_WIDTH}px`,
      }}
      onClick={handleClick}
      role="button"
      aria-label={`Zabezpieczenie: ${summary.element_name}`}
    >
      {/* Nastawy */}
      <div className="space-y-0.5">
        {lines.map((line, idx) => (
          <div
            key={idx}
            className="text-[10px] font-mono text-slate-700 whitespace-nowrap"
          >
            {line}
          </div>
        ))}
      </div>

      {/* Stan weryfikacji */}
      <div
        className={`
          mt-1 pt-1 border-t border-slate-200
          flex items-center gap-1
          text-[9px] ${statusColors.text}
        `}
      >
        {/* Ikona stanu */}
        <span className={statusColors.icon}>
          {summary.verification_status === 'SPELNIONE' ? 'OK' : summary.verification_status === 'NIESPELNIONE' ? '!' : '?'}
        </span>
        <span>{statusLabel}</span>
        {summary.margin_pct !== null && summary.margin_pct !== undefined && (
          <span className="ml-1 text-slate-500">
            ({summary.margin_pct > 0 ? '+' : ''}{summary.margin_pct}%)
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// KOMPONENT ProtectionOverlayLayer
// =============================================================================

export interface ProtectionOverlayLayerProps {
  /** Symbole SLD */
  symbols: AnySldSymbol[];

  /** Stan viewportu */
  viewport: ViewportState;

  /** ID zaznaczonego elementu */
  selectedElementId?: string | null;

  /** Czy warstwa widoczna */
  visible: boolean;

  /** Callback przy kliknieciu etykiety */
  onLabelClick: (element: SelectedElement) => void;
}

/**
 * Warstwa nakladkowa z nastawami zabezpieczen.
 *
 * WIAZANIE:
 * - 100% READ-ONLY
 * - Deterministyczne pozycjonowanie
 * - Neutralne kolory
 */
export function ProtectionOverlayLayer({
  symbols,
  viewport,
  selectedElementId,
  visible,
  onLabelClick,
}: ProtectionOverlayLayerProps) {
  // Pobierz wszystkie dane zabezpieczen
  const protectionSummaries = useAllProtectionSummaries();

  // Zbuduj mapy pozycji
  const { nodePositions, branchPositions } = useMemo(
    () => buildOverlayPositionMaps(symbols, viewport),
    [symbols, viewport]
  );

  // Zbuduj dane etykiet
  const labels = useMemo(() => {
    if (!visible) return [];

    const result: Array<{
      summary: ProtectionSummary;
      position: Position;
      isSelected: boolean;
    }> = [];

    for (const summary of protectionSummaries.values()) {
      // Znajdz pozycje elementu
      let position: Position | undefined;

      // Probuj pozycje wezlow
      position = nodePositions.get(summary.element_id);

      // Probuj pozycje galezi
      if (!position) {
        position = branchPositions.get(summary.element_id);
      }

      // Probuj bezposrednio z symboli
      if (!position) {
        for (const symbol of symbols) {
          if (
            symbol.elementId === summary.element_id ||
            symbol.id === summary.element_id
          ) {
            position = {
              x: symbol.position.x * viewport.zoom + viewport.offsetX,
              y: symbol.position.y * viewport.zoom + viewport.offsetY,
            };
            break;
          }
        }
      }

      if (position) {
        result.push({
          summary,
          position,
          isSelected: selectedElementId === summary.element_id,
        });
      }
    }

    // Sortuj deterministycznie po element_id
    result.sort((a, b) => a.summary.element_id.localeCompare(b.summary.element_id));

    return result;
  }, [visible, protectionSummaries, nodePositions, branchPositions, symbols, viewport, selectedElementId]);

  // Obsluga klikniecia etykiety
  const handleLabelClick = useCallback(
    (elementId: string, elementType: ElementType, elementName: string) => {
      onLabelClick({
        id: elementId,
        type: elementType,
        name: elementName,
      });
    },
    [onLabelClick]
  );

  // Nie renderuj jesli niewidoczny
  if (!visible) return null;

  return (
    <div
      data-testid="sld-protection-overlay"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Etykiety (pointer-events-auto dla klikniecia) */}
      {labels.map(({ summary, position, isSelected }) => (
        <ProtectionLabel
          key={summary.element_id}
          summary={summary}
          position={position}
          isSelected={isSelected}
          onLabelClick={handleLabelClick}
        />
      ))}

      {/* Legenda */}
      {labels.length > 0 && (
        <ProtectionLegend />
      )}
    </div>
  );
}

// =============================================================================
// KOMPONENT ProtectionLegend
// =============================================================================

/**
 * Legenda widoku zabezpieczen.
 */
function ProtectionLegend() {
  return (
    <div
      data-testid="sld-protection-legend"
      className="pointer-events-auto absolute bottom-4 left-4 bg-white rounded border border-slate-200 px-3 py-2 shadow-sm"
    >
      <div className="text-[10px] font-medium text-slate-600 mb-1.5">
        Widok zabezpieczen
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-[9px]">
          <span className={`${VERIFICATION_STATUS_COLORS.SPELNIONE.icon}`}>OK</span>
          <span className="text-slate-600">{VERIFICATION_STATUS_LABELS_PL.SPELNIONE}</span>
        </div>
        <div className="flex items-center gap-2 text-[9px]">
          <span className={`${VERIFICATION_STATUS_COLORS.NIESPELNIONE.icon}`}>!</span>
          <span className="text-slate-600">{VERIFICATION_STATUS_LABELS_PL.NIESPELNIONE}</span>
        </div>
        <div className="flex items-center gap-2 text-[9px]">
          <span className={`${VERIFICATION_STATUS_COLORS.BRAK_DANYCH.icon}`}>?</span>
          <span className="text-slate-600">{VERIFICATION_STATUS_LABELS_PL.BRAK_DANYCH}</span>
        </div>
      </div>
    </div>
  );
}

export default ProtectionOverlayLayer;
