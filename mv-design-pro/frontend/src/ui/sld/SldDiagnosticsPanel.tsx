/**
 * SLD Diagnostics Panel — Professional Topology Diagnostics
 *
 * CANONICAL/Canonical-grade panel diagnostyczny schematu.
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Panel diagnostyczny jak w CANONICAL
 * - sld_rules.md: Diagnostyka topologii i naruszeń
 *
 * FEATURES:
 * - Lista naruszeń z podziałem na severity
 * - Klik → focus na elemencie w SLD
 * - Filtrowanie po severity
 * - Statystyki naruszeń
 * - Profesjonalny, spokojny design
 *
 * 100% POLISH UI
 */

import { useCallback, useMemo, useState } from 'react';
import {
  type ProtectionSanityCheckResult,
  type DiagnosticsSeverityFilter,
  type SanityCheckSeverity,
  SEVERITY_LABELS_PL,
  SEVERITY_COLORS,
  SEVERITY_FILTER_LABELS_PL,
  SANITY_CHECK_CODE_LABELS_PL,
  matchesSeverityFilter,
} from '../protection';
import { useSanityChecks } from '../protection';
import type { SelectedElement, ElementType } from '../types';

// =============================================================================
// CANONICAL-grade panel styling tokens
// =============================================================================

const PANEL_STYLE = {
  width: 360,
  headerBg: 'bg-slate-800',
  headerText: 'text-slate-100',
  bodyBg: 'bg-slate-50',
  sectionHeaderBg: 'bg-slate-100',
  itemHoverBg: 'hover:bg-slate-100',
  itemSelectedBg: 'bg-blue-50',
  borderColor: 'border-slate-200',
  accentColor: 'text-slate-600',
} as const;

// =============================================================================
// Element type labels (Polish)
// =============================================================================

const ELEMENT_TYPE_LABELS_PL: Record<ElementType, string> = {
  // Istniejące typy SN (A–L)
  Bus: 'Szyna',
  LineBranch: 'Linia',
  TransformerBranch: 'Transformator',
  Switch: 'Łącznik',
  Source: 'Źródło',
  Load: 'Odbiór',
  Generator: 'Generator',
  Measurement: 'Pomiar',
  ProtectionAssignment: 'Zabezpieczenie',
  // Nowe typy infrastruktury SN
  Terminal: 'Terminal',
  PortBranch: 'Port',
  Station: 'Stacja',
  BranchPole: 'Slup rozgalezny',
  ZKSN: 'ZKSN',
  BaySN: 'Pole SN',
  Relay: 'Przekaźnik',
  SecondaryLink: 'Połączenie wtórne',
  NOP: 'Punkt normalnie otwarty',
  // Typy nN (M–O, R–AP)
  BusNN: 'Szyna nN',
  MainBreakerNN: 'Wyłącznik główny nN',
  FeederNN: 'Odpływ nN',
  SegmentNN: 'Segment nN',
  LoadNN: 'Odbiór nN',
  SwitchboardNN: 'Rozdzielnica nN',
  SourceFieldNN: 'Pole źródłowe nN',
  // Źródła nN (V–Z)
  PVInverter: 'Falownik PV',
  BESSInverter: 'Falownik BESS',
  EnergyStorage: 'Magazyn energii',
  Genset: 'Agregat prądotwórczy',
  UPS: 'UPS',
  // Pomiary i zabezpieczenia nN (AA–AE)
  EnergyMeter: 'Licznik energii',
  PowerQualityMeter: 'Miernik jakości',
  SurgeArresterNN: 'Ogranicznik przepięć',
  Earthing: 'Uziemienie',
  MeasurementNN: 'Pomiar nN',
  // Infrastruktura szyn nN (AF–AR)
  AuxBus: 'Szyna pomocnicza',
  ConnectionPoint: 'Punkt przyłączenia',
  SwitchNN: 'Łącznik nN',
  ProtectionNN: 'Zabezpieczenie nN',
  SourceController: 'Sterownik źródła',
  InternalJunction: 'Węzeł wewnętrzny',
  CableJointNN: 'Złącze kablowe',
  FaultCurrentLimiter: 'Ogr. prądu zwarciowego',
  FilterCompensator: 'Filtr/kompensator',
  TelecontrolDevice: 'Urządzenie telesterowania',
  BusSectionNN: 'Sekcja szyn nN',
  BusCouplerNN: 'Sprzęgło szyn nN',
  ReserveLink: 'Łącznik rezerwowy',
  // Parametry logiczne źródeł (AS–AZ)
  SourceDisconnect: 'Odłącznik źródła',
  PowerLimit: 'Ograniczenie mocy',
  WorkProfile: 'Profil pracy',
  OperatingMode: 'Tryb pracy',
  ConnectionConstraints: 'Warunki przyłączenia',
  MeteringBlock: 'Układ pomiarowy',
  SyncPoint: 'Punkt synchronizacji',
  DescriptiveElement: 'Element opisowy',
};

// =============================================================================
// Component: DiagnosticsItem
// =============================================================================

interface DiagnosticsItemProps {
  result: ProtectionSanityCheckResult;
  isSelected: boolean;
  onClick: () => void;
}

function DiagnosticsItem({ result, isSelected, onClick }: DiagnosticsItemProps) {
  const colors = SEVERITY_COLORS[result.severity];
  const codeLabel = SANITY_CHECK_CODE_LABELS_PL[result.code] || result.code;
  const typeLabel = ELEMENT_TYPE_LABELS_PL[result.element_type] || result.element_type;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full text-left px-3 py-2.5 border-b ${PANEL_STYLE.borderColor}
        transition-colors duration-100
        ${isSelected ? PANEL_STYLE.itemSelectedBg : PANEL_STYLE.itemHoverBg}
        focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400
      `}
      data-testid={`diagnostics-item-${result.element_id}-${result.code}`}
    >
      {/* Header: Severity badge + element info */}
      <div className="flex items-start gap-2 mb-1">
        <span
          className={`
            flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide
            ${colors.bg} ${colors.text}
          `}
        >
          {SEVERITY_LABELS_PL[result.severity]}
        </span>
        <span className="text-xs text-slate-500 truncate">
          {typeLabel}: <span className="font-medium text-slate-700">{result.element_id}</span>
        </span>
      </div>

      {/* Message */}
      <p className="text-sm text-slate-700 leading-snug">
        {codeLabel}
      </p>

      {/* Function info (if present) */}
      {result.function_ansi && (
        <p className="mt-1 text-xs text-slate-500">
          Funkcja: <span className="font-mono">{result.function_ansi}</span>
          {result.function_code && <span className="ml-1">({result.function_code})</span>}
        </p>
      )}
    </button>
  );
}

// =============================================================================
// Component: SeveritySection
// =============================================================================

interface SeveritySectionProps {
  severity: SanityCheckSeverity;
  results: ProtectionSanityCheckResult[];
  selectedElementId: string | null;
  onItemClick: (result: ProtectionSanityCheckResult) => void;
  defaultExpanded?: boolean;
}

function SeveritySection({
  severity,
  results,
  selectedElementId,
  onItemClick,
  defaultExpanded = true,
}: SeveritySectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const colors = SEVERITY_COLORS[severity];
  const count = results.length;

  if (count === 0) return null;

  return (
    <div data-testid={`diagnostics-section-${severity.toLowerCase()}`}>
      {/* Section header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`
          w-full flex items-center justify-between px-3 py-2
          ${PANEL_STYLE.sectionHeaderBg} ${PANEL_STYLE.borderColor} border-b
          transition-colors hover:bg-slate-200
        `}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${colors.marker}`} />
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            {SEVERITY_LABELS_PL[severity]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${colors.text}`}>
            {count}
          </span>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Items */}
      {expanded && (
        <div>
          {results.map((result, idx) => (
            <DiagnosticsItem
              key={`${result.element_id}-${result.code}-${idx}`}
              result={result}
              isSelected={selectedElementId === result.element_id}
              onClick={() => onItemClick(result)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Component: DiagnosticsStats
// =============================================================================

interface DiagnosticsStatsProps {
  errorCount: number;
  warnCount: number;
  infoCount: number;
}

function DiagnosticsStats({ errorCount, warnCount, infoCount }: DiagnosticsStatsProps) {
  return (
    <div className="flex items-center gap-4 px-3 py-2 bg-white border-b border-slate-200">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${SEVERITY_COLORS.ERROR.marker}`} />
        <span className="text-xs font-medium text-slate-600">
          {errorCount} {errorCount === 1 ? 'błąd' : 'błędów'}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${SEVERITY_COLORS.WARN.marker}`} />
        <span className="text-xs font-medium text-slate-600">
          {warnCount} {warnCount === 1 ? 'ostrzeżenie' : 'ostrzeżeń'}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${SEVERITY_COLORS.INFO.marker}`} />
        <span className="text-xs font-medium text-slate-600">
          {infoCount} {infoCount === 1 ? 'informacja' : 'informacji'}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Component: EmptyDiagnostics
// =============================================================================

function EmptyDiagnostics() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-16 h-16 mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-emerald-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h4 className="text-sm font-semibold text-slate-700 mb-1">Brak naruszeń</h4>
      <p className="text-xs text-slate-500 max-w-[200px]">
        Schemat nie zawiera wykrytych problemów topologicznych ani nieprawidłowych nastaw.
      </p>
    </div>
  );
}

// =============================================================================
// Main Component: SldDiagnosticsPanel
// =============================================================================

export interface SldDiagnosticsPanelProps {
  /** Project ID for fetching diagnostics */
  projectId: string;
  /** Diagram ID for fetching diagnostics */
  diagramId: string;
  /** Currently selected element ID */
  selectedElementId?: string | null;
  /** Callback when element is clicked (for navigation) */
  onElementClick?: (element: SelectedElement) => void;
  /** Additional CSS classes */
  className?: string;
  /** Callback to close panel */
  onClose?: () => void;
}

export function SldDiagnosticsPanel({
  projectId,
  diagramId,
  selectedElementId,
  onElementClick,
  className = '',
  onClose,
}: SldDiagnosticsPanelProps) {
  const [filter, setFilter] = useState<DiagnosticsSeverityFilter>('ALL');

  // Fetch diagnostics data
  const { results, hasResults, isLoading } = useSanityChecks(projectId, diagramId);

  // Filter and group results by severity
  const { errors, warnings, infos, filteredCount, totalCount } = useMemo(() => {
    if (!results || results.length === 0) {
      return { errors: [], warnings: [], infos: [], filteredCount: 0, totalCount: 0 };
    }

    const filtered = results.filter(r => matchesSeverityFilter(r.severity, filter));

    const errors = filtered.filter(r => r.severity === 'ERROR');
    const warnings = filtered.filter(r => r.severity === 'WARN');
    const infos = filtered.filter(r => r.severity === 'INFO');

    // Sort each group by element_id for determinism
    [errors, warnings, infos].forEach(arr => {
      arr.sort((a, b) => a.element_id.localeCompare(b.element_id));
    });

    return {
      errors,
      warnings,
      infos,
      filteredCount: filtered.length,
      totalCount: results.length,
    };
  }, [results, filter]);

  // Stats
  const errorCount = results?.filter(r => r.severity === 'ERROR').length ?? 0;
  const warnCount = results?.filter(r => r.severity === 'WARN').length ?? 0;
  const infoCount = results?.filter(r => r.severity === 'INFO').length ?? 0;

  // Handle item click
  const handleItemClick = useCallback(
    (result: ProtectionSanityCheckResult) => {
      if (onElementClick) {
        onElementClick({
          id: result.element_id,
          type: result.element_type,
          name: result.element_id,
        });
      }
    },
    [onElementClick]
  );

  // Handle filter change
  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setFilter(e.target.value as DiagnosticsSeverityFilter);
    },
    []
  );

  return (
    <div
      className={`flex flex-col h-full bg-white border-l ${PANEL_STYLE.borderColor} ${className}`}
      style={{ width: PANEL_STYLE.width, minWidth: PANEL_STYLE.width }}
      data-testid="sld-diagnostics-panel"
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${PANEL_STYLE.headerBg}`}>
        <div className="min-w-0 flex-1">
          <h3 className={`text-sm font-semibold ${PANEL_STYLE.headerText}`}>
            Diagnostyka schematu
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Analiza topologii i nastaw
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-2 rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
            aria-label="Zamknij panel diagnostyki"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Stats bar */}
      {hasResults && (
        <DiagnosticsStats
          errorCount={errorCount}
          warnCount={warnCount}
          infoCount={infoCount}
        />
      )}

      {/* Filter bar */}
      {hasResults && (
        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
          <label className="text-xs text-slate-500">
            Filtr:
          </label>
          <select
            value={filter}
            onChange={handleFilterChange}
            className="text-xs px-2 py-1 border border-slate-300 rounded bg-white
                       hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            data-testid="diagnostics-filter-select"
          >
            {Object.entries(SEVERITY_FILTER_LABELS_PL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">
            {filteredCount} z {totalCount}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto" data-testid="diagnostics-content">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <svg
              className="w-6 h-6 animate-spin text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="ml-2 text-sm text-slate-500">Ładowanie...</span>
          </div>
        ) : !hasResults || filteredCount === 0 ? (
          <EmptyDiagnostics />
        ) : (
          <>
            <SeveritySection
              severity="ERROR"
              results={errors}
              selectedElementId={selectedElementId ?? null}
              onItemClick={handleItemClick}
              defaultExpanded={true}
            />
            <SeveritySection
              severity="WARN"
              results={warnings}
              selectedElementId={selectedElementId ?? null}
              onItemClick={handleItemClick}
              defaultExpanded={true}
            />
            <SeveritySection
              severity="INFO"
              results={infos}
              selectedElementId={selectedElementId ?? null}
              onItemClick={handleItemClick}
              defaultExpanded={false}
            />
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
        <span>Kliknij, aby przejść do elementu</span>
        <span className="font-mono">v1.0</span>
      </div>
    </div>
  );
}

export default SldDiagnosticsPanel;
