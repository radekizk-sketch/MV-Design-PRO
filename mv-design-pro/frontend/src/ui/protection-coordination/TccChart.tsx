/**
 * FIX-12B — TCC Chart Component for Coordination Analysis
 *
 * Wrapper around TimeCurrentChart with coordination-specific features:
 * - Log-log visualization of protection curves
 * - Fault current markers
 * - Operating current markers
 * - Selectivity margin visualization
 *
 * CANONICAL ALIGNMENT:
 * - 100% Polish labels
 * - READ-ONLY (no physics calculations)
 * - Data from backend only
 */

import { useMemo, useState, useCallback } from 'react';
import { TimeCurrentChart } from '../protection-curves/TimeCurrentChart';
import type {
  ProtectionCurve,
  FaultMarker as ChartFaultMarker,
  TimeCurrentChartConfig,
} from '../protection-curves/types';
import type {
  TCCCurve,
  FaultMarker,
  CoordinationResult,
  ProtectionDevice,
  SelectivityCheck,
} from './types';
import { LABELS, VERDICT_STYLES, maPodstawePrzekaznikowa } from './types';

// =============================================================================
// Types
// =============================================================================

/** Globalny werdykt selektywności dla widoku TCC */
export type TccSelectivityVerdict = 'OK' | 'NA_GRANICY' | 'NIE_OK';

interface TccChartProps {
  /** TCC curves from backend */
  curves: TCCCurve[];
  /** Fault current markers */
  faultMarkers: FaultMarker[];
  /** Operating current markers (optional) */
  operatingCurrents?: { location: string; current_a: number }[];
  /** Selected device ID (for highlighting) */
  selectedDeviceId?: string | null;
  /** Device click handler */
  onDeviceClick?: (deviceId: string) => void;
  /** Chart height */
  height?: number;
  /** Show legend */
  showLegend?: boolean;
  /** Available devices for name lookup */
  devices?: ProtectionDevice[];
  /** Selectivity checks for assessment (UI-04) */
  selectivityChecks?: SelectivityCheck[];
}

interface ChartControlsProps {
  config: TimeCurrentChartConfig;
  onConfigChange: (config: TimeCurrentChartConfig) => void;
}

// =============================================================================
// Selectivity Assessment Logic (UI-04)
// =============================================================================

/**
 * Agreguje werdykty z SelectivityCheck[] do jednego globalnego werdyktu dla TCC.
 *
 * Logika:
 * - OK: wszystkie sprawdzenia PASS
 * - NIE_OK: przynajmniej jedno sprawdzenie FAIL
 * - NA_GRANICY: przynajmniej jedno MARGINAL (i żadne FAIL), lub ERROR
 */
function aggregateSelectivityVerdict(checks: SelectivityCheck[]): TccSelectivityVerdict {
  if (checks.length === 0) {
    return 'OK'; // Brak sprawdzeń = brak problemów
  }

  let hasError = false;
  let hasFail = false;
  let hasMarginal = false;

  for (const check of checks) {
    if (check.verdict === 'FAIL') {
      hasFail = true;
    } else if (check.verdict === 'MARGINAL') {
      hasMarginal = true;
    } else if (check.verdict === 'ERROR') {
      hasError = true;
    }
  }

  if (hasFail) {
    return 'NIE_OK';
  }

  if (hasMarginal || hasError) {
    return 'NA_GRANICY';
  }

  return 'OK';
}

/**
 * Zwraca teksty interpretacji dla werdyktu selektywności TCC (UI-04).
 * Nazewnictwo normowe: "pole odpływowe", "pole zasilające", "selektywność czasowa".
 */
function getSelectivityAssessmentTexts(verdict: TccSelectivityVerdict): {
  status: string;
  dlaczego: string;
  coDalej: string;
} {
  switch (verdict) {
    case 'OK':
      return {
        status: 'OK',
        dlaczego:
          'Selektywność zapewniona: zabezpieczenie w polu odpływowym działa wcześniej niż zabezpieczenie w polu zasilającym w całym analizowanym zakresie.',
        coDalej: 'Brak wymaganych działań.',
      };
    case 'NA_GRANICY':
      return {
        status: 'NA GRANICY',
        dlaczego:
          'Rezerwa selektywności jest niewielka: krzywe czasowo-prądowe są zbliżone w części analizowanego zakresu.',
        coDalej:
          'Zwiększ rezerwę selektywności: skoryguj nastawy czasowe (Δt) i/lub charakterystykę zabezpieczenia w polu zasilającym, zachowując wymagania ochrony odpływu.',
      };
    case 'NIE_OK':
      return {
        status: 'NIE OK',
        dlaczego:
          'Brak selektywności: w analizowanym zakresie możliwe jest zadziałanie zabezpieczenia w polu zasilającym przed zabezpieczeniem w polu odpływowym (przecięcie lub brak jednoznacznej separacji krzywych).',
        coDalej:
          'Przywróć selektywność: skoryguj nastawy prądowe/czasowe lub zmień charakterystykę zabezpieczenia w polu zasilającym; w obecnym stanie możliwe jest niepożądane wyłączenie zasilania.',
      };
  }
}

// =============================================================================
// Selectivity Assessment Component (UI-04)
// =============================================================================

interface SelectivityAssessmentProps {
  selectivityChecks: SelectivityCheck[];
}

/**
 * SelectivityAssessment — Ocena selektywności zabezpieczeń dla wykresu TCC
 *
 * Wyświetla blok tekstowy pod wykresem z:
 * - WERDYKT (OK / NA GRANICY / NIE OK)
 * - DLACZEGO (1-2 zdania, inżyniersko)
 * - CO DALEJ (konkretne zalecenie operacyjne)
 *
 * UI-only, deterministyczne, bez nowych obliczeń.
 */
function SelectivityAssessment({ selectivityChecks }: SelectivityAssessmentProps) {
  const verdict = aggregateSelectivityVerdict(selectivityChecks);
  const texts = getSelectivityAssessmentTexts(verdict);

  // Mapowanie werdyktu TCC na style badge
  const badgeStyle = (() => {
    switch (verdict) {
      case 'OK':
        return VERDICT_STYLES.PASS;
      case 'NA_GRANICY':
        return VERDICT_STYLES.MARGINAL;
      case 'NIE_OK':
        return VERDICT_STYLES.FAIL;
    }
  })();

  return (
    <div
      className="border-t border-slate-200 bg-slate-50 p-4"
      data-testid="selectivity-assessment"
    >
      <div className="space-y-3">
        {/* Nagłówek z werdyktem */}
        <div className="flex items-center gap-3">
          <h4 className="font-semibold text-slate-900">
            Ocena selektywności zabezpieczeń
          </h4>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${badgeStyle.bg} ${badgeStyle.text}`}
            data-testid={`tcc-verdict-${verdict.toLowerCase().replace(/ /g, '-')}`}
          >
            {texts.status}
          </span>
        </div>

        {/* DLACZEGO */}
        <div>
          <p className="text-sm font-medium text-slate-700">Dlaczego:</p>
          <p className="text-sm text-slate-600">{texts.dlaczego}</p>
        </div>

        {/* CO DALEJ */}
        <div>
          <p className="text-sm font-medium text-slate-700">Co dalej:</p>
          <p className="text-sm text-slate-600">{texts.coDalej}</p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Chart Controls Component
// =============================================================================

function ChartControls({ config, onConfigChange }: ChartControlsProps) {
  const labels = LABELS.tcc;

  const handleZoomIn = useCallback(() => {
    onConfigChange({
      ...config,
      currentRange: [
        config.currentRange[0] * 2,
        config.currentRange[1] / 2,
      ],
      timeRange: [
        config.timeRange[0] * 2,
        config.timeRange[1] / 2,
      ],
    });
  }, [config, onConfigChange]);

  const handleZoomOut = useCallback(() => {
    onConfigChange({
      ...config,
      currentRange: [
        Math.max(1, config.currentRange[0] / 2),
        Math.min(100000, config.currentRange[1] * 2),
      ],
      timeRange: [
        Math.max(0.001, config.timeRange[0] / 2),
        Math.min(1000, config.timeRange[1] * 2),
      ],
    });
  }, [config, onConfigChange]);

  const handleReset = useCallback(() => {
    onConfigChange({
      ...config,
      currentRange: [10, 10000],
      timeRange: [0.01, 100],
    });
  }, [config, onConfigChange]);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleZoomIn}
        className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
        title={labels.zoomIn}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"
          />
        </svg>
      </button>
      <button
        onClick={handleZoomOut}
        className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
        title={labels.zoomOut}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
          />
        </svg>
      </button>
      <button
        onClick={handleReset}
        className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
        title={labels.resetView}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
    </div>
  );
}

// =============================================================================
// Legend Component
// =============================================================================

interface LegendProps {
  curves: TCCCurve[];
  selectedDeviceId?: string | null;
  onDeviceClick?: (deviceId: string) => void;
  devices?: ProtectionDevice[];
}

function Legend({ curves, selectedDeviceId, onDeviceClick, devices }: LegendProps) {
  const getDeviceName = (deviceId: string, deviceName: string): string => {
    const device = devices?.find((d) => d.id === deviceId);
    return device?.name ?? deviceName;
  };

  return (
    <div className="flex flex-wrap gap-3 p-3 border-t border-slate-200">
      {curves.map((curve) => (
        <button
          key={curve.device_id}
          onClick={() => onDeviceClick?.(curve.device_id)}
          title={curve.powod_pl ?? undefined}
          className={`flex items-center gap-2 rounded px-2 py-1 text-sm transition-colors ${
            selectedDeviceId === curve.device_id
              ? 'bg-slate-100 ring-2 ring-blue-500'
              : 'hover:bg-slate-50'
          }`}
        >
          <div
            className="h-3 w-6 rounded"
            style={{ backgroundColor: curve.color }}
          />
          <span className="text-slate-700">
            {getDeviceName(curve.device_id, curve.device_name)}
          </span>
          <span className="text-xs text-slate-400">
            ({maPodstawePrzekaznikowa(curve)
              ? curve.curve_type
              : LABELS.brakCharakterystyki})
          </span>
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Marker List Component
// =============================================================================

interface MarkerListProps {
  faultMarkers: FaultMarker[];
  operatingCurrents?: { location: string; current_a: number }[];
}

function MarkerList({ faultMarkers, operatingCurrents }: MarkerListProps) {
  const labels = LABELS.tcc;

  if (faultMarkers.length === 0 && (!operatingCurrents || operatingCurrents.length === 0)) {
    return null;
  }

  return (
    <div className="border-t border-slate-200 p-3">
      <div className="flex flex-wrap gap-4 text-sm">
        {/* Fault markers */}
        {faultMarkers.length > 0 && (
          <div>
            <span className="font-medium text-slate-700">{labels.faultCurrent}:</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {faultMarkers.map((marker) => (
                <span
                  key={marker.id}
                  className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-rose-700"
                >
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  {marker.label_pl}: {marker.current_a.toFixed(0)} A
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Operating currents */}
        {operatingCurrents && operatingCurrents.length > 0 && (
          <div>
            <span className="font-medium text-slate-700">{labels.operatingCurrent}:</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {operatingCurrents.map((oc, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-blue-700"
                >
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  {oc.location}: {oc.current_a.toFixed(0)} A
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main TCC Chart Component
// =============================================================================

export function TccChart({
  curves,
  faultMarkers,
  operatingCurrents,
  selectedDeviceId,
  onDeviceClick,
  height = 500,
  showLegend = true,
  devices,
  selectivityChecks = [],
}: TccChartProps) {
  const labels = LABELS.tcc;

  // Chart configuration state
  const [config, setConfig] = useState<TimeCurrentChartConfig>({
    currentRange: [10, 10000],
    timeRange: [0.01, 100],
    showGrid: true,
    showFaultMarkers: true,
    height,
  });

  // Convert TCC curves to chart format.
  // Karta N-D5-FUSE: pozycja BEZ podstawy przekaznikowej (bezpiecznik topikowy
  // bez pasma z karty katalogowej) nie trafia na wykres — nie ma czego rysowac.
  // Wczesniej `curve_type.startsWith('IEC') ? 'IEC' : 'IEEE'` przypisalby jej
  // po cichu norme IEEE. Pozycja nie znika jednak z ekranu: legenda pokazuje ja
  // jawnie z powodem braku (patrz `Legend`).
  const chartCurves: ProtectionCurve[] = useMemo(() => {
    return curves.filter(maPodstawePrzekaznikowa).map((curve) => ({
      id: curve.device_id,
      name_pl: devices?.find((d) => d.id === curve.device_id)?.name ?? curve.device_name,
      standard: (curve.curve_type.startsWith('IEC') ? 'IEC' : 'IEEE') as 'IEC' | 'IEEE',
      curve_type: (curve.curve_type.split('_')[1] || 'SI') as ProtectionCurve['curve_type'],
      pickup_current_a: curve.pickup_current_a,
      time_multiplier: curve.time_multiplier,
      color: curve.color,
      enabled: true,
      points: curve.points.map((p) => ({
        current_a: p.current_a,
        current_multiple: p.current_multiple,
        time_s: p.time_s,
      })),
    }));
  }, [curves, devices]);

  // Convert fault markers to chart format
  const chartFaultMarkers: ChartFaultMarker[] = useMemo(() => {
    return faultMarkers.map((m) => ({
      id: m.id,
      label_pl: m.label_pl,
      current_a: m.current_a,
      fault_type: m.fault_type,
      location: m.location,
    }));
  }, [faultMarkers]);

  // Handle curve click
  const handleCurveClick = useCallback(
    (curveId: string) => {
      onDeviceClick?.(curveId);
    },
    [onDeviceClick]
  );

  // Empty state
  if (curves.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-slate-200 bg-white"
        style={{ height }}
        data-testid="tcc-chart-empty"
      >
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 text-slate-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
            />
          </svg>
          <p className="mt-2 text-slate-500">{labels.noData}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white" data-testid="tcc-chart">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="font-semibold text-slate-900">{labels.title}</h3>
          <p className="text-sm text-slate-500">{labels.subtitle}</p>
        </div>
        <ChartControls config={config} onConfigChange={setConfig} />
      </div>

      {/* Chart */}
      <div className="p-4">
        <TimeCurrentChart
          curves={chartCurves}
          faultMarkers={chartFaultMarkers}
          config={config}
          selectedCurveId={selectedDeviceId}
          onCurveClick={handleCurveClick}
        />
      </div>

      {/* Legend */}
      {showLegend && (
        <Legend
          curves={curves}
          selectedDeviceId={selectedDeviceId}
          onDeviceClick={onDeviceClick}
          devices={devices}
        />
      )}

      {/* Marker list */}
      <MarkerList faultMarkers={faultMarkers} operatingCurrents={operatingCurrents} />

      {/* Selectivity Assessment (UI-04) */}
      {selectivityChecks.length > 0 && (
        <SelectivityAssessment selectivityChecks={selectivityChecks} />
      )}
    </div>
  );
}

// =============================================================================
// Convenience Component for CoordinationResult
// =============================================================================

interface TccChartFromResultProps {
  result: CoordinationResult;
  devices: ProtectionDevice[];
  selectedDeviceId?: string | null;
  onDeviceClick?: (deviceId: string) => void;
  height?: number;
}

export function TccChartFromResult({
  result,
  devices,
  selectedDeviceId,
  onDeviceClick,
  height = 500,
}: TccChartFromResultProps) {
  return (
    <TccChart
      curves={result.tcc_curves}
      faultMarkers={result.fault_markers}
      devices={devices}
      selectedDeviceId={selectedDeviceId}
      onDeviceClick={onDeviceClick}
      height={height}
      showLegend={true}
      selectivityChecks={result.selectivity_checks}
    />
  );
}
