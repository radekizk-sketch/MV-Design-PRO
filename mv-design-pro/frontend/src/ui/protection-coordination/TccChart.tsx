/**
 * Wykres TCC koordynacji zabezpieczeń (E-28) — krzywe złożone urządzeń z modelu.
 *
 * Każda krzywa to czas najszybszego pobudzonego stopnia urządzenia policzony w backendzie
 * (rdzeń IEC 60255) w siatce prądów; ekran rysuje punkty, legendę z nazwą charakterystyki
 * i opisem stopni oraz znaczniki prądów zwarciowych. Odstępy czasowe par pokazuje panel
 * interpretacji obok wykresu (liczby backendu, bez werdyktu — P-06); dawny baner
 * „SELEKTYWNOŚĆ ZAPEWNIONA / BRAK SELEKTYWNOŚCI" skasowany. ZERO fizyki w UI.
 */

import { useMemo, useState, useCallback } from 'react';
import { TimeCurrentChart } from '../protection-curves/TimeCurrentChart';
import type {
  KrzywaWykresuTcc,
  FaultMarker as ChartFaultMarker,
  TimeCurrentChartConfig,
} from '../protection-curves/types';
import type {
  TCCCurve,
  FaultMarker,
  CoordinationResult,
  CoordinationDevice,
} from './types';
import { LABELS, maPodstawePrzekaznikowa } from './types';
import { useNazwaObiektu, type NazwaObiektu } from '../../ui2/wyniki/wzorzec/useNazwaObiektu';

/**
 * Etykieta znacznika prądu zwarciowego z NAZWĄ miejsca zwarcia (karta #145).
 *
 * Analizator koordynacji składa `label_pl` z identyfikatorem miejsca w nawiasie
 * (`Ik"max 3F (<location>)`). Ekran podstawia w tym nawiasie nazwę elementu z modelu —
 * zamienia DOKŁADNIE wartość pola `location` rekordu, nie zgaduje wzorca tekstu.
 */
export function etykietaZnacznikaZwarcia(marker: FaultMarker, nazwa: NazwaObiektu): string {
  if (marker.location === '') return marker.label_pl;
  return marker.label_pl.split(`(${marker.location})`).join(`(${nazwa(marker.location)})`);
}

// =============================================================================
// Types
// =============================================================================

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
  /** Urządzenia wyniku (nazwy z modelu) */
  devices?: CoordinationDevice[];
}

interface ChartControlsProps {
  config: TimeCurrentChartConfig;
  onConfigChange: (config: TimeCurrentChartConfig) => void;
}

// =============================================================================
// Nazwy charakterystyk
// =============================================================================

/**
 * Polska nazwa charakterystyki czasowo-prądowej z PEŁNEGO kodu nastawy modelu
 * (`DT`, `IEC_SI` … `IEEE_EI` — słownik = `KrzywaNastawy` backendu). Karta #145: kod krzywej
 * nie jest tekstem legendy; kod spoza słownika nazwany jawnie jako nierozpoznany.
 */
export function nazwaCharakterystykiPL(kod: string): string {
  return Object.prototype.hasOwnProperty.call(LABELS.curveTypes, kod)
    ? LABELS.curveTypes[kod as keyof typeof LABELS.curveTypes]
    : LABELS.charakterystykaNierozpoznana;
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
  devices?: CoordinationDevice[];
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
          title={curve.powod_pl ?? curve.opis_pl ?? undefined}
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
              ? nazwaCharakterystykiPL(curve.curve_type)
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
  const nazwaObiektu = useNazwaObiektu();

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
                  {etykietaZnacznikaZwarcia(marker, nazwaObiektu)}: {marker.current_a.toFixed(0)} A
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
                  {nazwaObiektu(oc.location)}: {oc.current_a.toFixed(0)} A
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
}: TccChartProps) {
  const labels = LABELS.tcc;
  const nazwaObiektu = useNazwaObiektu();

  // Chart configuration state
  const [config, setConfig] = useState<TimeCurrentChartConfig>({
    currentRange: [10, 10000],
    timeRange: [0.01, 100],
    showGrid: true,
    showFaultMarkers: true,
    height,
  });

  // Krzywe na wykres: wyłącznie punkty z backendu, nazwa i kolor.
  // Karta N-D5-FUSE: pozycja BEZ podstawy przekaźnikowej (bezpiecznik topikowy bez pasma
  // z karty katalogowej) nie trafia na wykres — nie ma czego rysować; legenda pokazuje ją
  // jawnie z powodem braku (patrz `Legend`).
  const chartCurves: KrzywaWykresuTcc[] = useMemo(() => {
    return curves.filter(maPodstawePrzekaznikowa).map((curve) => ({
      id: curve.device_id,
      name_pl: devices?.find((d) => d.id === curve.device_id)?.name ?? curve.device_name,
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
      label_pl: etykietaZnacznikaZwarcia(m, nazwaObiektu),
      current_a: m.current_a,
      fault_type: m.fault_type,
      location: m.location,
    }));
  }, [faultMarkers, nazwaObiektu]);

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
    </div>
  );
}

// =============================================================================
// Convenience Component for CoordinationResult
// =============================================================================

interface TccChartFromResultProps {
  result: CoordinationResult;
  devices: CoordinationDevice[];
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
    />
  );
}
