/**
 * SLD Diagnostic Results Layer (PR-SLD-06)
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § B: Results as Overlay (never modifies model)
 * - sld_rules.md § C.2: RESULT_VIEW mode
 * - ui_canonical_parity.md: Canonical-like presentation
 *
 * FEATURES:
 * - Wyswietla wartosci bezposrednio na schemacie SLD
 * - Etykiety przy szynie: U = ... kV, dU = ... %
 * - Etykiety przy liniach/trafo: I = ... A, Obciazenie = ... %
 * - Statusy sprawdzen: OK / Wymaga korekty
 *
 * RULES:
 * - READ-ONLY: Brak mutacji modelu
 * - Warstwa overlay (pointer-events-none)
 * - Deterministyczne pozycjonowanie etykiet
 * - Kolory: czarny/grafit (bez alarmowych czerwony/zielony)
 */

import { useMemo } from 'react';
import type { AnySldSymbol, Position } from '../sld-editor/types';
import type { ViewportState } from './types';
import { useResultsInspectorStore } from '../results-inspector/store';
import { buildOverlayPositionMaps } from './overlayUtils';
import { useSldModeStore } from './sldModeStore';

// =============================================================================
// Types
// =============================================================================

/**
 * Dane diagnostyczne dla szyny (Bus).
 */
interface BusDiagnosticData {
  nodeId: string;
  position: Position;
  voltage_kv?: number;
  voltage_delta_pct?: number;
  status?: 'OK' | 'WYMAGA_KOREKTY';
}

/**
 * Dane diagnostyczne dla galezi (Line/Transformer).
 */
interface BranchDiagnosticData {
  branchId: string;
  position: Position;
  current_a?: number;
  loading_pct?: number;
  status?: 'OK' | 'WYMAGA_KOREKTY';
}

// =============================================================================
// Formatters (deterministic)
// =============================================================================

/**
 * Formatuj napiecie w kV.
 */
function formatVoltageKv(value: number | undefined): string {
  if (value === undefined) return '';
  return `U = ${value.toFixed(2)} kV`;
}

/**
 * Formatuj odchylke napiecia w %.
 */
function formatVoltageDelta(value: number | undefined): string {
  if (value === undefined) return '';
  const sign = value >= 0 ? '+' : '';
  return `\u0394U = ${sign}${value.toFixed(2)} %`;
}

/**
 * Formatuj prad w A.
 */
function formatCurrentA(value: number | undefined): string {
  if (value === undefined) return '';
  return `I = ${value.toFixed(1)} A`;
}

/**
 * Formatuj obciazenie w %.
 */
function formatLoadingPct(value: number | undefined): string {
  if (value === undefined) return '';
  return `Obciazenie = ${value.toFixed(1)} %`;
}

/**
 * Formatuj status sprawdzenia.
 */
function formatStatus(status: 'OK' | 'WYMAGA_KOREKTY' | undefined): string {
  if (status === undefined) return '';
  return status === 'OK' ? 'OK' : 'Wymaga korekty';
}

// =============================================================================
// Bus Label Component
// =============================================================================

interface BusLabelProps {
  nodeId: string;
  position: Position;
  voltage_kv?: number;
  voltage_delta_pct?: number;
  status?: 'OK' | 'WYMAGA_KOREKTY';
}

/**
 * Etykieta diagnostyczna dla szyny (Bus).
 *
 * Pozycjonowanie deterministyczne:
 * - Srodek symbolu szyny
 * - Offset staly: -32px (nad symbolem)
 */
function BusLabel({
  nodeId,
  position,
  voltage_kv,
  voltage_delta_pct,
  status,
}: BusLabelProps) {
  const hasVoltage = voltage_kv !== undefined;
  const hasDelta = voltage_delta_pct !== undefined;
  const hasStatus = status !== undefined;

  if (!hasVoltage && !hasDelta && !hasStatus) return null;

  // Staly offset dla etykiety szyny (deterministyczny)
  const LABEL_OFFSET_Y = -32;

  return (
    <div
      data-testid={`sld-diag-bus-${nodeId}`}
      className="pointer-events-none absolute z-10"
      style={{
        left: `${position.x}px`,
        top: `${position.y + LABEL_OFFSET_Y}px`,
        transform: 'translateX(-50%)',
      }}
    >
      <div className="rounded border border-gray-400 bg-white px-2 py-1 text-xs font-mono text-gray-800 shadow-sm">
        {hasVoltage && (
          <div className="whitespace-nowrap">{formatVoltageKv(voltage_kv)}</div>
        )}
        {hasDelta && (
          <div className="whitespace-nowrap text-gray-600">
            {formatVoltageDelta(voltage_delta_pct)}
          </div>
        )}
        {hasStatus && (
          <div
            className={`whitespace-nowrap font-medium ${
              status === 'OK' ? 'text-gray-700' : 'text-gray-900'
            }`}
          >
            {formatStatus(status)}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Branch Label Component
// =============================================================================

interface BranchLabelProps {
  branchId: string;
  position: Position;
  current_a?: number;
  loading_pct?: number;
  status?: 'OK' | 'WYMAGA_KOREKTY';
}

/**
 * Etykieta diagnostyczna dla galezi (Line/Transformer).
 *
 * Pozycjonowanie deterministyczne:
 * - Srodek geometrii polaczenia
 * - Offset staly: 0 (na srodku)
 */
function BranchLabel({
  branchId,
  position,
  current_a,
  loading_pct,
  status,
}: BranchLabelProps) {
  const hasCurrent = current_a !== undefined;
  const hasLoading = loading_pct !== undefined;
  const hasStatus = status !== undefined;

  if (!hasCurrent && !hasLoading && !hasStatus) return null;

  return (
    <div
      data-testid={`sld-diag-branch-${branchId}`}
      className="pointer-events-none absolute z-10"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="rounded border border-gray-400 bg-white px-2 py-1 text-xs font-mono text-gray-800 shadow-sm">
        {hasCurrent && (
          <div className="whitespace-nowrap">{formatCurrentA(current_a)}</div>
        )}
        {hasLoading && (
          <div className="whitespace-nowrap text-gray-600">
            {formatLoadingPct(loading_pct)}
          </div>
        )}
        {hasStatus && (
          <div
            className={`whitespace-nowrap font-medium ${
              status === 'OK' ? 'text-gray-700' : 'text-gray-900'
            }`}
          >
            {formatStatus(status)}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Diagnostic Results Layer Container
// =============================================================================

export interface DiagnosticResultsLayerProps {
  /** SLD symbols for position mapping */
  symbols: AnySldSymbol[];

  /** Current viewport state */
  viewport: ViewportState;

  /** Force visibility (overrides store) */
  visible?: boolean;
}

/**
 * Warstwa diagnostyczna wynikow na schemacie SLD.
 *
 * RULES (PR-SLD-06):
 * - 100% READ-ONLY
 * - NIE modyfikuje modelu
 * - NIE wplywa na auto-layout ani routing
 * - Deterministyczne pozycjonowanie etykiet
 * - Kolory: czarny/grafit (bez alarmowych)
 */
export function DiagnosticResultsLayer({
  symbols,
  viewport,
  visible,
}: DiagnosticResultsLayerProps) {
  // Get visibility from store or props
  const diagnosticLayerVisible = useSldModeStore((s) => s.diagnosticLayerVisible);
  const isVisible = visible !== undefined ? visible : diagnosticLayerVisible;

  // Get results data from store
  const { sldOverlay } = useResultsInspectorStore();

  // Build position maps from symbols (deterministic)
  const { nodePositions, branchPositions } = useMemo(
    () => buildOverlayPositionMaps(symbols, viewport),
    [symbols, viewport]
  );

  // Build bus diagnostic data
  const busLabels = useMemo((): BusDiagnosticData[] => {
    if (!sldOverlay || !isVisible) return [];

    const results: BusDiagnosticData[] = [];
    for (const node of sldOverlay.nodes) {
      const position = nodePositions.get(node.node_id);
      if (!position) continue;

      // Oblicz odchylke napiecia (zakladamy nominalne 20 kV dla SN)
      let voltage_delta_pct: number | undefined;
      if (node.u_kv !== undefined) {
        // Prosty przyklad - w rzeczywistosci potrzebna nominalna z modelu
        const nominalKv = 20.0;
        voltage_delta_pct = ((node.u_kv - nominalKv) / nominalKv) * 100;
      }

      // Okresl status na podstawie odchylki
      let status: 'OK' | 'WYMAGA_KOREKTY' | undefined;
      if (voltage_delta_pct !== undefined) {
        // +/-5% to typowy zakres dopuszczalny
        status = Math.abs(voltage_delta_pct) <= 5 ? 'OK' : 'WYMAGA_KOREKTY';
      }

      results.push({
        nodeId: node.node_id,
        position,
        voltage_kv: node.u_kv,
        voltage_delta_pct,
        status,
      });
    }
    return results;
  }, [sldOverlay, nodePositions, isVisible]);

  // Build branch diagnostic data
  const branchLabels = useMemo((): BranchDiagnosticData[] => {
    if (!sldOverlay || !isVisible) return [];

    const results: BranchDiagnosticData[] = [];
    for (const branch of sldOverlay.branches) {
      const position = branchPositions.get(branch.branch_id);
      if (!position) continue;

      // Okresl status na podstawie obciazenia
      let status: 'OK' | 'WYMAGA_KOREKTY' | undefined;
      if (branch.loading_pct !== undefined) {
        // 100% to granica dopuszczalnego obciazenia
        status = branch.loading_pct <= 100 ? 'OK' : 'WYMAGA_KOREKTY';
      }

      results.push({
        branchId: branch.branch_id,
        position,
        current_a: branch.i_a,
        loading_pct: branch.loading_pct,
        status,
      });
    }
    return results;
  }, [sldOverlay, branchPositions, isVisible]);

  // Don't render if not visible or no data
  if (!isVisible) return null;

  // Render even without data (for testing empty state)
  const hasData = busLabels.length > 0 || branchLabels.length > 0;

  return (
    <div
      data-testid="sld-diagnostic-results-layer"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Info badge when no data */}
      {!hasData && (
        <div
          data-testid="sld-diag-no-data"
          className="absolute left-2 top-2 z-20 rounded border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-gray-600"
        >
          Brak danych wynikow
        </div>
      )}

      {/* Bus labels */}
      {busLabels.map((label) => (
        <BusLabel
          key={label.nodeId}
          nodeId={label.nodeId}
          position={label.position}
          voltage_kv={label.voltage_kv}
          voltage_delta_pct={label.voltage_delta_pct}
          status={label.status}
        />
      ))}

      {/* Branch labels */}
      {branchLabels.map((label) => (
        <BranchLabel
          key={label.branchId}
          branchId={label.branchId}
          position={label.position}
          current_a={label.current_a}
          loading_pct={label.loading_pct}
          status={label.status}
        />
      ))}

      {/* Mode indicator */}
      <div
        data-testid="sld-diag-mode-indicator"
        className="absolute right-2 top-2 z-20 rounded border border-gray-400 bg-gray-800 px-2 py-1 text-xs font-medium text-white"
      >
        Tryb: WYNIKI
      </div>
    </div>
  );
}

// =============================================================================
// Exports
// =============================================================================

export type { BusDiagnosticData, BranchDiagnosticData };
