/**
 * K30-71 — SldDetailDrawer: prawy panel detail z tab interface.
 *
 * Goal: klikalna konfiguracja stacji z rozdzielnicą + TR.
 *
 * Opens when station/bay/apparatus clicked w SLD canvas. Show kategorię
 * tabs zależnie od element kind:
 *
 * STATION:
 *   - Rozdzielnica SN (bay-column overview)
 *   - Transformator (vector group, rated kVA, voltage levels)
 *   - Strona nN (LV bus + odpływy)
 *   - DER (PV/BESS/FW configurable)
 *
 * BAY:
 *   - Apparatus stack (DS/CB/ES states)
 *   - Protection (ANSI 50/51/67 settings)
 *
 * APPARATUS:
 *   - Settings + state telemetry
 *
 * DER:
 *   - 6 tabs (Typ / Moc / Punkt / Inverter / NC RfG / Protection)
 */

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';

export type SldDetailKind = 'station' | 'bay' | 'apparatus' | 'der' | 'cable_run' | null;

export interface SldDetailDrawerData {
  /** Element kind — determines which tab set to show. */
  readonly kind: SldDetailKind;
  /** Element id (ref_id). */
  readonly elementId: string | null;
  /** Display label (np. "S08 SN" / "Q01" / "PV-1"). */
  readonly label?: string;
  /** Voltage level [kV]. */
  readonly voltageKv?: number | null;
  /** Station code (for breadcrumb). */
  readonly stationCode?: string | null;
  /** Voltage tint stroke color (CSS color string). */
  readonly accentColor?: string;
  /** K30-78: pre-filled DER kind when drawer opened via drag-drop. */
  readonly derKind?: 'PV' | 'BESS' | 'FW';
  /** K30-78: pre-filled connection variant when drawer opened via drag-drop. */
  readonly derConnectionVariant?: 'nn_side' | 'sn_side' | 'dedicated';
  /** K30-79: real transformer spec from ENM snapshot (gdy kind='station'). */
  readonly transformerSpec?: {
    readonly vectorGroup: string | null;
    readonly snMva: number | null;
    readonly uhvKv: number | null;
    readonly ulvKv: number | null;
    readonly ukPercent: number | null;
  } | null;
  /** K30-80: bay list dla rozdzielnica tab (kind='station'). */
  readonly baysSpec?: ReadonlyArray<{
    readonly id: string;
    readonly name: string | null;
    readonly bayRole: string | null;
    readonly bayNumber: string | null;
    readonly feederShortName: string | null;
  }>;
  /** K30-81: nN side spec dla "Strona nN" tab. */
  readonly nnSpec?: {
    readonly busVoltageKv: number | null;
    readonly loads: ReadonlyArray<{
      readonly id: string;
      readonly name: string | null;
      readonly pKw: number | null;
      readonly qKvar: number | null;
    }>;
  } | null;
  /** K30-82: lista istniejących DERs na stacji (kind='station' der tab). */
  readonly existingDers?: ReadonlyArray<{
    readonly id: string;
    readonly kind: 'PV' | 'BESS' | 'FW' | null;
    readonly name: string | null;
    readonly pMw: number | null;
  }>;
  /** K30-83: bay apparatus list (kind='bay' apparatus tab). */
  readonly apparatusSpec?: ReadonlyArray<{
    readonly id: string;
    readonly kind: 'CB' | 'DS' | 'ES' | 'CT' | 'VT' | 'OTHER';
    readonly label: string;
    readonly state: 'closed' | 'open' | 'unknown' | null;
  }>;
  /** K30-84: live metrics chips (z LF/SC overlay payload) — wyświetlane w
   *  header drawer pod label. Każdy chip ma label, value (już sformatowane)
   *  i opcjonalny color (np. severity badge). */
  readonly liveMetrics?: ReadonlyArray<{
    readonly label: string;
    readonly value: string;
    readonly color?: string;
  }>;
  /** K30-95: alarm severity badge w drawer header. Lowercase per
   *  StationOnRunRenderer (warning/important/critical). */
  readonly alarmSeverity?: 'warning' | 'important' | 'critical' | null;
  /** K30-89: cable run spec dla cable_run drawer kind. */
  readonly cableRunSpec?: {
    readonly runKind: 'main_trunk' | 'branch' | 'ring' | 'loop' | null;
    readonly segmentCount: number | null;
    readonly stationCount: number | null;
    readonly lengthKm: number | null;
    readonly segmentKind: 'cable_sn' | 'overhead_line_sn' | null;
    /** K30-93: max loading % across segments (z lfDerivedMetrics). */
    readonly maxLoadingPct?: number | null;
    /** K30-93: max voltage drop ΔU % (deviation pomiędzy stacjami końcowymi). */
    readonly maxVoltageDropPct?: number | null;
  } | null;
}

export interface SldDetailDrawerProps {
  readonly open: boolean;
  readonly data: SldDetailDrawerData | null;
  readonly onClose: () => void;
  /** Width [px]. Default 360. */
  readonly width?: number;
  /** K30-87: optional save handler — gdy podany, renderuje "Zapisz" CTA w
   *  footer. Brak handler → footer ukryty. */
  readonly onSave?: () => void;
  /** K30-91: optional "Otwórz pełny widok" handler — gdy podany, renderuje
   *  CTA w drawer toolbar (sub-header pod tabs). Typowo dla station/bay
   *  otwiera drill-down (StationInternalView / pole edit). */
  readonly onOpenFullView?: () => void;
}

const STATION_TABS = [
  { id: 'rozdzielnica', label: 'Rozdzielnica SN' },
  { id: 'transformator', label: 'Transformator' },
  { id: 'nn', label: 'Strona nN' },
  { id: 'der', label: 'DER (PV/BESS/FW)' },
] as const;

const BAY_TABS = [
  { id: 'apparatus', label: 'Aparatura' },
  { id: 'protection', label: 'Zabezpieczenia' },
] as const;

const APPARATUS_TABS = [
  { id: 'state', label: 'Stan + telemetria' },
  { id: 'settings', label: 'Nastawy' },
] as const;

const DER_TABS = [
  { id: 'typ', label: 'Typ' },
  { id: 'moc', label: 'Moc znamionowa' },
  { id: 'punkt', label: 'Punkt podłączenia' },
  { id: 'inverter', label: 'Inverter' },
  { id: 'rfg', label: 'NC RfG' },
  { id: 'protection', label: 'Zabezpieczenia DER' },
] as const;

const CABLE_RUN_TABS = [
  { id: 'trasa', label: 'Trasa' },
  { id: 'parametry', label: 'Parametry' },
  { id: 'spadek', label: 'Spadek napięcia' },
] as const;

function tabsForKind(kind: SldDetailKind): readonly { id: string; label: string }[] {
  if (kind === 'station') return STATION_TABS;
  if (kind === 'bay') return BAY_TABS;
  if (kind === 'apparatus') return APPARATUS_TABS;
  if (kind === 'der') return DER_TABS;
  if (kind === 'cable_run') return CABLE_RUN_TABS;
  return [];
}

export function SldDetailDrawer(props: SldDetailDrawerProps): JSX.Element | null {
  const { open, data, onClose, width = 360, onSave, onOpenFullView } = props;
  const tabs = tabsForKind(data?.kind ?? null);
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.id ?? '');
  // K30-96: auto-focus close button when drawer opens (ARIA dialog pattern)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open || !data) return;
    lastFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
    closeButtonRef.current?.focus();
    return () => {
      lastFocusedRef.current?.focus?.();
    };
  }, [open, data?.elementId]);

  // K30-88: Escape key closes drawer
  // K30-90: ArrowLeft/ArrowRight navigate tabs
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (tabs.length < 2) return;
      // Skip if input/textarea/select focused
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const currentIdx = tabs.findIndex((t) => t.id === activeTab);
      if (e.key === 'ArrowRight' && currentIdx >= 0) {
        e.preventDefault();
        const nextIdx = (currentIdx + 1) % tabs.length;
        setActiveTab(tabs[nextIdx].id);
      } else if (e.key === 'ArrowLeft' && currentIdx >= 0) {
        e.preventDefault();
        const prevIdx = (currentIdx - 1 + tabs.length) % tabs.length;
        setActiveTab(tabs[prevIdx].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, tabs, activeTab]);

  if (!open || !data || data.kind === null || tabs.length === 0) return null;

  // Reset active tab when data.kind changes
  const currentTab = tabs.find((t) => t.id === activeTab) ? activeTab : tabs[0].id;

  const accent = data.accentColor ?? '#7EC8FF';

  return (
    <div
      role="dialog"
      aria-label={`Detal: ${data.label ?? data.elementId ?? 'element'}`}
      data-testid="sld-v2-detail-drawer"
      data-element-kind={data.kind}
      data-element-id={data.elementId ?? ''}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width,
        background: '#0A0E14',
        borderLeft: `2px solid ${accent}`,
        boxShadow: '-4px 0 12px rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        color: '#DDF7FF',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #2A3441',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div data-testid="sld-v2-detail-drawer-kind" style={{ fontSize: 9, color: '#7E8790', textTransform: 'uppercase', letterSpacing: 1 }}>
            {kindLabel(data.kind)}
          </div>
          <div data-testid="sld-v2-detail-drawer-label" style={{ fontSize: 16, fontWeight: 800, color: accent, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{data.label ?? data.elementId ?? 'Element'}</span>
            {data.alarmSeverity && (
              <span
                data-testid="sld-v2-detail-drawer-alarm-badge"
                data-severity={data.alarmSeverity}
                style={{
                  background: data.alarmSeverity === 'critical' ? '#F25F5F'
                    : data.alarmSeverity === 'important' ? '#FF9500'
                    : '#FFD166',
                  color: '#0A0E14',
                  padding: '1px 6px',
                  borderRadius: 8,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  animation: data.alarmSeverity === 'critical' ? 'sld-drawer-alarm-pulse 1s infinite' : undefined,
                }}
              >
                ⚠ {data.alarmSeverity}
              </span>
            )}
          </div>
          {data.stationCode && data.kind !== 'station' && (
            <div data-testid="sld-v2-detail-drawer-breadcrumb" style={{ fontSize: 10, color: '#88BBDD', marginTop: 2 }}>
              ↑ Stacja {data.stationCode}
            </div>
          )}
          {data.liveMetrics && data.liveMetrics.length > 0 && (
            <div
              data-testid="sld-v2-detail-drawer-live-metrics"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}
            >
              {data.liveMetrics.map((m, i) => (
                <span
                  key={`${m.label}-${i}`}
                  data-testid={`sld-v2-detail-drawer-metric-${m.label}`}
                  style={{
                    background: '#171B20',
                    border: `1px solid ${m.color ?? '#5A6878'}`,
                    color: m.color ?? '#DDF7FF',
                    padding: '2px 6px',
                    borderRadius: 2,
                    fontSize: 9,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                  }}
                >
                  {m.label}={m.value}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          ref={closeButtonRef}
          data-testid="sld-v2-detail-drawer-close"
          onClick={onClose}
          aria-label="Zamknij panel"
          style={{
            background: 'transparent',
            border: '1px solid #5A6878',
            color: '#DDF7FF',
            width: 28,
            height: 28,
            borderRadius: 3,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          ×
        </button>
      </div>

      {/* Tabs (K30-94: ARIA tablist + tab + tabpanel) */}
      <div
        role="tablist"
        aria-label={`Karty ${kindLabel(data.kind)}`}
        data-testid="sld-v2-detail-drawer-tabs"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0,
          padding: '8px 12px 0',
          borderBottom: '1px solid #2A3441',
        }}
      >
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <button
              type="button"
              role="tab"
              key={tab.id}
              id={`sld-v2-detail-drawer-tab-button-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`sld-v2-detail-drawer-tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              data-testid={`sld-v2-detail-drawer-tab-${tab.id}`}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: isActive ? accent : 'transparent',
                color: isActive ? '#0A0E14' : '#88BBDD',
                border: 'none',
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 700,
                borderRadius: '3px 3px 0 0',
                marginRight: 2,
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* K30-91: action toolbar pod tabs (gdy onOpenFullView podany) */}
      {onOpenFullView && (
        <div
          data-testid="sld-v2-detail-drawer-actions"
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid #2A3441',
            display: 'flex',
            gap: 6,
            background: '#0E1218',
          }}
        >
          <button
            type="button"
            data-testid="sld-v2-detail-drawer-open-full-view"
            onClick={onOpenFullView}
            style={{
              background: 'transparent',
              border: `1px solid ${accent}`,
              color: accent,
              padding: '4px 10px',
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ⇱ Otwórz pełny widok
          </button>
        </div>
      )}

      {/* Tab content (K30-94: ARIA tabpanel) */}
      <div
        role="tabpanel"
        id={`sld-v2-detail-drawer-tabpanel-${currentTab}`}
        aria-labelledby={`sld-v2-detail-drawer-tab-button-${currentTab}`}
        data-testid={`sld-v2-detail-drawer-content-${currentTab}`}
        style={{
          flex: 1,
          padding: 16,
          overflowY: 'auto',
          fontSize: 11,
        }}
      >
        <TabContent kind={data.kind} tab={currentTab} data={data} />
      </div>

      {/* K30-87: footer with Save/Cancel CTA (gdy onSave podany) */}
      {onSave && (
        <div
          data-testid="sld-v2-detail-drawer-footer"
          style={{
            padding: '10px 16px',
            borderTop: '1px solid #2A3441',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            background: '#0E1218',
          }}
        >
          <button
            type="button"
            data-testid="sld-v2-detail-drawer-cancel"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #5A6878',
              color: '#DDF7FF',
              padding: '6px 12px',
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Anuluj
          </button>
          <button
            type="button"
            data-testid="sld-v2-detail-drawer-save"
            onClick={onSave}
            style={{
              background: accent,
              border: `1px solid ${accent}`,
              color: '#0A0E14',
              padding: '6px 14px',
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Zapisz
          </button>
        </div>
      )}
    </div>
  );
}

function kindLabel(kind: SldDetailKind): string {
  switch (kind) {
    case 'station': return 'Stacja SN/nN';
    case 'bay': return 'Pole';
    case 'apparatus': return 'Aparat';
    case 'der': return 'Źródło rozproszone (DER)';
    case 'cable_run': return 'Ciąg kablowy';
    default: return '—';
  }
}

interface TabContentProps {
  readonly kind: SldDetailKind;
  readonly tab: string;
  readonly data: SldDetailDrawerData;
}

function TabContent({ kind, tab, data }: TabContentProps): JSX.Element {
  return (
    <div data-testid={`sld-v2-detail-drawer-tab-content-${tab}`}>
      <div style={{ color: '#7E8790', fontStyle: 'italic', marginBottom: 12 }}>
        Element: {data.elementId ?? '—'}
      </div>
      <PlaceholderTabBody
        kind={kind}
        tab={tab}
        voltageKv={data.voltageKv ?? null}
        derKind={data.derKind}
        derConnectionVariant={data.derConnectionVariant}
        transformerSpec={data.transformerSpec ?? null}
        baysSpec={data.baysSpec}
        nnSpec={data.nnSpec ?? null}
        existingDers={data.existingDers}
        apparatusSpec={data.apparatusSpec}
        cableRunSpec={data.cableRunSpec ?? null}
      />
    </div>
  );
}

function PlaceholderTabBody({
  kind,
  tab,
  voltageKv,
  derKind,
  derConnectionVariant,
  transformerSpec,
  baysSpec,
  nnSpec,
  existingDers,
  apparatusSpec,
  cableRunSpec,
}: {
  kind: SldDetailKind;
  tab: string;
  voltageKv: number | null;
  derKind?: 'PV' | 'BESS' | 'FW';
  derConnectionVariant?: 'nn_side' | 'sn_side' | 'dedicated';
  transformerSpec?: {
    readonly vectorGroup: string | null;
    readonly snMva: number | null;
    readonly uhvKv: number | null;
    readonly ulvKv: number | null;
    readonly ukPercent: number | null;
  } | null;
  baysSpec?: ReadonlyArray<{
    readonly id: string;
    readonly name: string | null;
    readonly bayRole: string | null;
    readonly bayNumber: string | null;
    readonly feederShortName: string | null;
  }>;
  nnSpec?: {
    readonly busVoltageKv: number | null;
    readonly loads: ReadonlyArray<{
      readonly id: string;
      readonly name: string | null;
      readonly pKw: number | null;
      readonly qKvar: number | null;
    }>;
  } | null;
  existingDers?: ReadonlyArray<{
    readonly id: string;
    readonly kind: 'PV' | 'BESS' | 'FW' | null;
    readonly name: string | null;
    readonly pMw: number | null;
  }>;
  apparatusSpec?: ReadonlyArray<{
    readonly id: string;
    readonly kind: 'CB' | 'DS' | 'ES' | 'CT' | 'VT' | 'OTHER';
    readonly label: string;
    readonly state: 'closed' | 'open' | 'unknown' | null;
  }>;
  cableRunSpec?: {
    readonly runKind: 'main_trunk' | 'branch' | 'ring' | 'loop' | null;
    readonly segmentCount: number | null;
    readonly stationCount: number | null;
    readonly lengthKm: number | null;
    readonly segmentKind: 'cable_sn' | 'overhead_line_sn' | null;
    readonly maxLoadingPct?: number | null;
    readonly maxVoltageDropPct?: number | null;
  } | null;
}): JSX.Element {
  // Tab-specific scaffolding — actual editor forms wired w K30-72+
  if (kind === 'station' && tab === 'transformator') {
    const fmt = (v: number | null | undefined, unit: string) =>
      v != null ? `${v} ${unit}` : '—';
    const fmtKva = (mva: number | null | undefined) =>
      mva != null ? `${(mva * 1000).toFixed(0)} kVA` : '—';
    return (
      <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
        <dt style={{ color: '#7E8790' }}>Vector group</dt>
        <dd data-testid="drawer-tr-vector-group" style={{ color: '#FFD166', fontFamily: 'monospace' }}>
          {transformerSpec?.vectorGroup ?? '—'}
        </dd>
        <dt style={{ color: '#7E8790' }}>Rated power</dt>
        <dd data-testid="drawer-tr-rated-kva" style={{ color: '#DDF7FF', fontFamily: 'monospace' }}>
          {fmtKva(transformerSpec?.snMva)}
        </dd>
        <dt style={{ color: '#7E8790' }}>U_HV / U_LV</dt>
        <dd data-testid="drawer-tr-voltages" style={{ color: '#DDF7FF', fontFamily: 'monospace' }}>
          {transformerSpec?.uhvKv != null && transformerSpec?.ulvKv != null
            ? `${transformerSpec.uhvKv} / ${transformerSpec.ulvKv} kV`
            : voltageKv != null ? `${voltageKv} / 0.4 kV` : '—'}
        </dd>
        <dt style={{ color: '#7E8790' }}>u_k%</dt>
        <dd style={{ color: '#DDF7FF', fontFamily: 'monospace' }}>
          {fmt(transformerSpec?.ukPercent, '%')}
        </dd>
      </dl>
    );
  }
  if (kind === 'der' && tab === 'typ') {
    return (
      <div data-testid="drawer-der-type-selector">
        <label style={{ display: 'block', marginBottom: 6, color: '#7E8790' }}>Typ DER</label>
        <select
          data-testid="drawer-der-type-select"
          defaultValue={derKind ?? 'PV'}
          style={{
            background: '#171B20',
            color: '#DDF7FF',
            border: '1px solid #5A6878',
            padding: 6,
            borderRadius: 3,
            width: '100%',
            fontSize: 11,
          }}
        >
          <option value="PV">PV (fotowoltaika)</option>
          <option value="BESS">BESS (magazyn energii)</option>
          <option value="FW">FW (farma wiatrowa)</option>
        </select>
      </div>
    );
  }
  if (kind === 'der' && tab === 'inverter') {
    const options = derKind === 'BESS'
      ? ['BESS-INV-50KW', 'BESS-INV-100KW', 'BESS-INV-250KW']
      : derKind === 'FW'
      ? ['FW-CONV-2MW-PMSG', 'FW-CONV-3MW-DFIG', 'FW-CONV-5MW-PMSG']
      : ['PV-INV-50KW-04KV', 'PV-INV-100KW-04KV', 'PV-INV-250KW-04KV'];
    return (
      <div data-testid="drawer-der-inverter">
        <label style={{ display: 'block', marginBottom: 6, color: '#7E8790', fontSize: 10, fontWeight: 700 }}>
          Falownik z katalogu
        </label>
        <select
          data-testid="drawer-der-inverter-select"
          defaultValue={options[0]}
          style={{
            background: '#171B20',
            color: '#DDF7FF',
            border: '1px solid #5A6878',
            padding: 6,
            borderRadius: 3,
            width: '100%',
            fontSize: 11,
            fontFamily: 'monospace',
          }}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <div style={{ marginTop: 8, fontSize: 9, color: '#7E8790' }}>
          Katalog typu inverter dla {derKind ?? 'DER'} (immutable per Catalog Binding Rule).
        </div>
      </div>
    );
  }
  if (kind === 'der' && tab === 'moc') {
    const presets = derKind === 'BESS'
      ? [50, 100, 250, 500, 1000]
      : derKind === 'FW'
      ? [2000, 3000, 5000, 8000, 10000]
      : [10, 50, 100, 250, 500];
    return (
      <div data-testid="drawer-der-power">
        <label style={{ display: 'block', marginBottom: 6, color: '#7E8790', fontSize: 10, fontWeight: 700 }}>
          Moc znamionowa [kW]
        </label>
        <input
          type="number"
          min={0}
          step={10}
          defaultValue={derKind === 'BESS' ? 200 : derKind === 'FW' ? 3000 : 100}
          data-testid="drawer-der-power-input"
          style={{
            background: '#171B20',
            color: '#FFD166',
            border: '1px solid #5A6878',
            padding: 6,
            borderRadius: 3,
            width: '100%',
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: 700,
          }}
        />
        <div style={{ marginTop: 8, fontSize: 9, color: '#7E8790' }}>Typowe rozmiary {derKind ?? 'DER'}:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {presets.map((kw) => (
            <span
              key={kw}
              data-testid={`drawer-der-power-preset-${kw}`}
              style={{
                background: '#171B20',
                color: '#88BBDD',
                border: '1px solid #5A6878',
                padding: '2px 6px',
                borderRadius: 2,
                fontSize: 10,
                fontFamily: 'monospace',
              }}
            >
              {kw} kW
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (kind === 'der' && tab === 'punkt') {
    const variantDefault = derConnectionVariant ?? 'nn_side';
    return (
      <div data-testid="drawer-der-connection-variant">
        <label style={{ display: 'block', marginBottom: 6, color: '#7E8790' }}>Punkt podłączenia</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { value: 'nn_side', label: 'Strona nN (po transformatorze SN/nN)' },
            { value: 'sn_side', label: 'Strona SN (przez dedykowane pole)' },
            { value: 'dedicated', label: 'Dedykowane przyłącze (osobna linia)' },
          ].map((opt) => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#DDF7FF' }}>
              <input
                type="radio"
                name="der-connection-variant"
                value={opt.value}
                data-testid={`drawer-der-connection-${opt.value}`}
                defaultChecked={opt.value === variantDefault}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (kind === 'der' && tab === 'protection') {
    return (
      <div data-testid="drawer-der-protection">
        <div style={{ fontSize: 10, color: '#7E8790', marginBottom: 6, fontWeight: 700 }}>
          Funkcje zabezpieczeniowe DER (PN-EN 50549-2 / IEC 60255)
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {[
            { code: '27', name: 'Podnapięciowe (U<)', defaultEnabled: true, setpoint: '0.85 Un' },
            { code: '59', name: 'Nadnapięciowe (U>)', defaultEnabled: true, setpoint: '1.15 Un' },
            { code: '81U', name: 'Podczęstotliwościowe (f<)', defaultEnabled: true, setpoint: '47.5 Hz' },
            { code: '81O', name: 'Nadczęstotliwościowe (f>)', defaultEnabled: true, setpoint: '51.5 Hz' },
            { code: '78', name: 'Anti-islanding (ROCOF/ROCOPP)', defaultEnabled: true, setpoint: '1 Hz/s' },
            { code: '32R', name: 'Zwrotno-mocowe (P_rev)', defaultEnabled: false, setpoint: '-5% Sn' },
          ].map((p) => (
            <li
              key={p.code}
              data-testid={`drawer-der-protection-${p.code}`}
              style={{
                background: '#171B20',
                border: '1px solid #2A3441',
                borderRadius: 3,
                padding: '5px 8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 10,
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#DDF7FF', cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked={p.defaultEnabled} />
                <span style={{ color: '#FFD166', fontFamily: 'monospace', fontWeight: 700 }}>[{p.code}]</span>
                <span>{p.name}</span>
              </label>
              <span style={{ color: '#88BBDD', fontFamily: 'monospace' }}>{p.setpoint}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (kind === 'der' && tab === 'rfg') {
    return (
      <div data-testid="drawer-der-rfg">
        <label style={{ display: 'block', marginBottom: 6, color: '#7E8790' }}>NC RfG typ</label>
        <div data-testid="drawer-der-rfg-types" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['A', 'B', 'C', 'D'].map((t) => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#DDF7FF' }}>
              <input type="radio" name="rfg-type" value={t} defaultChecked={t === 'A'} />
              {`Typ ${t}`}
            </label>
          ))}
        </div>
        <div style={{ marginTop: 12, color: '#7E8790', fontSize: 10 }}>
          Grid code: PN-EN 50549 / IEEE 1547 / IEC 61400-21 (FW)
        </div>
      </div>
    );
  }
  if (kind === 'bay' && tab === 'protection') {
    return (
      <div data-testid="drawer-bay-protection">
        <div style={{ fontSize: 10, color: '#7E8790', marginBottom: 6, fontWeight: 700 }}>
          Zabezpieczenia pola (PN-EN 60255)
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { code: '50', name: 'I≫ zwarciowe', tier: 'pierwotne' },
            { code: '51', name: 'I> zwłoczne', tier: 'pierwotne' },
            { code: '67', name: 'Kierunkowe', tier: 'rezerwa' },
            { code: '50N/51N', name: 'Zwarcie do ziemi', tier: 'pierwotne' },
            { code: '79', name: 'Auto-reclose (SPZ)', tier: 'opcjonalne' },
          ].map((p) => (
            <li
              key={p.code}
              data-testid={`drawer-bay-protection-${p.code.replace('/', '-')}`}
              style={{
                background: '#171B20',
                border: '1px solid #2A3441',
                borderRadius: 3,
                padding: '5px 8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 10,
              }}
            >
              <div>
                <span style={{ color: '#FFD166', fontFamily: 'monospace', fontWeight: 700 }}>[{p.code}]</span>
                <span style={{ color: '#DDF7FF', marginLeft: 6 }}>{p.name}</span>
              </div>
              <span style={{ color: '#88BBDD', fontFamily: 'monospace', fontSize: 9 }}>{p.tier}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (kind === 'cable_run' && tab === 'trasa') {
    const runKindLabel: Record<string, string> = {
      main_trunk: 'ciąg główny',
      branch: 'odgałęzienie',
      ring: 'pętla',
      loop: 'mufowany',
    };
    const segmentKindLabel: Record<string, string> = {
      cable_sn: 'kablowy SN',
      overhead_line_sn: 'napowietrzny SN',
    };
    return (
      <div data-testid="drawer-cable-trasa">
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
          <dt style={{ color: '#7E8790' }}>Typ ciągu</dt>
          <dd data-testid="drawer-cable-run-kind" style={{ color: '#DDF7FF', fontFamily: 'monospace' }}>
            {cableRunSpec?.runKind ? (runKindLabel[cableRunSpec.runKind] ?? cableRunSpec.runKind) : 'kablowy SN'}
          </dd>
          <dt style={{ color: '#7E8790' }}>Wykonanie</dt>
          <dd style={{ color: '#DDF7FF', fontFamily: 'monospace' }}>
            {cableRunSpec?.segmentKind ? (segmentKindLabel[cableRunSpec.segmentKind] ?? cableRunSpec.segmentKind) : '—'}
          </dd>
          <dt style={{ color: '#7E8790' }}>Długość</dt>
          <dd data-testid="drawer-cable-length" style={{ color: '#FFD166', fontFamily: 'monospace' }}>
            {cableRunSpec?.lengthKm != null ? `${cableRunSpec.lengthKm.toFixed(2)} km` : '—'}
          </dd>
          <dt style={{ color: '#7E8790' }}>Liczba segmentów</dt>
          <dd data-testid="drawer-cable-segment-count" style={{ color: '#DDF7FF', fontFamily: 'monospace' }}>
            {cableRunSpec?.segmentCount ?? '—'}
          </dd>
          <dt style={{ color: '#7E8790' }}>Liczba stacji</dt>
          <dd data-testid="drawer-cable-station-count" style={{ color: '#DDF7FF', fontFamily: 'monospace' }}>
            {cableRunSpec?.stationCount ?? '—'}
          </dd>
        </dl>
      </div>
    );
  }
  if (kind === 'cable_run' && tab === 'parametry') {
    return (
      <div data-testid="drawer-cable-parametry">
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
          <dt style={{ color: '#7E8790' }}>Typ kabla</dt>
          <dd style={{ color: '#DDF7FF', fontFamily: 'monospace' }}>XRUHKXS 1×120</dd>
          <dt style={{ color: '#7E8790' }}>Przekrój żyły</dt>
          <dd style={{ color: '#DDF7FF', fontFamily: 'monospace' }}>120 mm²</dd>
          <dt style={{ color: '#7E8790' }}>Materiał</dt>
          <dd style={{ color: '#DDF7FF', fontFamily: 'monospace' }}>Al</dd>
          <dt style={{ color: '#7E8790' }}>Ampacity I_max</dt>
          <dd style={{ color: '#FFD166', fontFamily: 'monospace' }}>270 A</dd>
          <dt style={{ color: '#7E8790' }}>Norma</dt>
          <dd style={{ color: '#88BBDD', fontFamily: 'monospace', fontSize: 10 }}>PN-HD 620 S2</dd>
        </dl>
      </div>
    );
  }
  if (kind === 'cable_run' && tab === 'spadek') {
    const loading = cableRunSpec?.maxLoadingPct;
    const vdrop = cableRunSpec?.maxVoltageDropPct;
    const loadingColor = loading == null
      ? '#7E8790'
      : loading >= 95 ? '#F25F5F'
      : loading >= 75 ? '#FFD166'
      : '#13C45A';
    const vdropColor = vdrop == null
      ? '#7E8790'
      : Math.abs(vdrop) >= 8 ? '#F25F5F'
      : Math.abs(vdrop) >= 5 ? '#FFD166'
      : '#13C45A';
    return (
      <div data-testid="drawer-cable-spadek">
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
          <dt style={{ color: '#7E8790' }}>ΔU max [%]</dt>
          <dd data-testid="drawer-cable-vdrop-total" style={{ color: vdropColor, fontFamily: 'monospace', fontWeight: 700 }}>
            {vdrop != null ? `${vdrop.toFixed(2)} %` : '—'}
          </dd>
          <dt style={{ color: '#7E8790' }}>Loading max [%]</dt>
          <dd data-testid="drawer-cable-loading" style={{ color: loadingColor, fontFamily: 'monospace', fontWeight: 700 }}>
            {loading != null ? `${loading.toFixed(1)} %` : '—'}
          </dd>
          <dt style={{ color: '#7E8790' }}>Klasa zgodności</dt>
          <dd style={{ color: '#88BBDD', fontFamily: 'monospace', fontSize: 10 }}>
            PN-EN 50160 (±10%)
          </dd>
        </dl>
        {(loading == null && vdrop == null) && (
          <div style={{ marginTop: 8, fontSize: 9, color: '#7E8790', fontStyle: 'italic' }}>
            Wartości z LF overlay payload (load_flow analysis). Uruchom analizę Power Flow.
          </div>
        )}
      </div>
    );
  }
  if (kind === 'apparatus' && tab === 'state') {
    return (
      <div data-testid="drawer-apparatus-state">
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
          <dt style={{ color: '#7E8790' }}>Stan aktualny</dt>
          <dd data-testid="drawer-apparatus-actual-state" style={{ color: '#13C45A', fontFamily: 'monospace', fontWeight: 700 }}>zamknięty</dd>
          <dt style={{ color: '#7E8790' }}>Tryb sterowania</dt>
          <dd style={{ color: '#DDF7FF', fontFamily: 'monospace' }}>LOKALNY</dd>
          <dt style={{ color: '#7E8790' }}>Komunikacja</dt>
          <dd style={{ color: '#13C45A', fontFamily: 'monospace' }}>OK</dd>
          <dt style={{ color: '#7E8790' }}>Blokada operacyjna</dt>
          <dd style={{ color: '#DDF7FF', fontFamily: 'monospace' }}>brak</dd>
          <dt style={{ color: '#7E8790' }}>Ostatnia zmiana</dt>
          <dd style={{ color: '#88BBDD', fontFamily: 'monospace', fontSize: 10 }}>—</dd>
        </dl>
      </div>
    );
  }
  if (kind === 'apparatus' && tab === 'settings') {
    return (
      <div data-testid="drawer-apparatus-settings">
        <div style={{ fontSize: 10, color: '#7E8790', marginBottom: 6, fontWeight: 700 }}>
          Nastawy (IEC 60255 / ANSI)
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { code: '50', name: 'Nadprądowe zwarciowe (I≫)', setpoint: '8.0 × In', delay: '0.05 s' },
            { code: '51', name: 'Nadprądowe zwłoczne (I>)', setpoint: '1.5 × In', delay: '1.2 s' },
            { code: '67', name: 'Kierunkowe nadprądowe', setpoint: 'auto', delay: '0.4 s' },
          ].map((p) => (
            <li
              key={p.code}
              data-testid={`drawer-apparatus-setting-${p.code}`}
              style={{
                background: '#171B20',
                border: '1px solid #2A3441',
                borderRadius: 3,
                padding: '6px 8px',
                fontSize: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#FFD166', fontFamily: 'monospace', fontWeight: 700 }}>[{p.code}]</span>
                <span style={{ color: '#88BBDD', fontFamily: 'monospace' }}>{p.delay}</span>
              </div>
              <div style={{ color: '#DDF7FF', marginTop: 2 }}>{p.name}</div>
              <div style={{ color: '#88BBDD', fontFamily: 'monospace', marginTop: 2 }}>I_set = {p.setpoint}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (kind === 'bay' && tab === 'apparatus') {
    const stateLabel: Record<string, string> = {
      closed: 'zamknięty',
      open: 'otwarty',
      unknown: 'nieznany',
    };
    const stateColor: Record<string, string> = {
      closed: '#13C45A',
      open: '#F25F5F',
      unknown: '#7E8790',
    };
    if (!apparatusSpec || apparatusSpec.length === 0) {
      return (
        <div data-testid="drawer-bay-apparatus-empty" style={{ color: '#7E8790', fontStyle: 'italic', fontSize: 10 }}>
          Brak zdefiniowanych aparatów w polu. Skonfiguruj wyposażenie via E-11.
        </div>
      );
    }
    return (
      <div data-testid="drawer-bay-apparatus">
        <div style={{ fontSize: 10, color: '#7E8790', marginBottom: 6, fontWeight: 700 }}>
          Aparatura ({apparatusSpec.length})
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {apparatusSpec.map((app) => {
            const stateKey = app.state ?? 'unknown';
            return (
              <li
                key={app.id}
                data-testid={`drawer-bay-app-${app.id}`}
                style={{
                  background: '#171B20',
                  border: '1px solid #2A3441',
                  borderRadius: 3,
                  padding: '6px 8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 11,
                }}
              >
                <div>
                  <span style={{ color: '#FFD166', fontWeight: 700, fontFamily: 'monospace' }}>
                    [{app.kind}]
                  </span>
                  <span style={{ color: '#DDF7FF', marginLeft: 6 }}>{app.label}</span>
                </div>
                <span
                  data-testid={`drawer-bay-app-${app.id}-state`}
                  style={{ color: stateColor[stateKey], fontFamily: 'monospace', fontSize: 10, fontWeight: 700 }}
                >
                  {stateLabel[stateKey]}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  if (kind === 'station' && tab === 'der') {
    const totalMw = (existingDers ?? []).reduce((sum, d) => sum + (d.pMw ?? 0), 0);
    const colorFor = (k: 'PV' | 'BESS' | 'FW' | null) =>
      k === 'PV' ? '#FFD166' : k === 'BESS' ? '#7DD3FC' : k === 'FW' ? '#7EE0B5' : '#7E8790';
    return (
      <div data-testid="drawer-station-der">
        <div style={{ fontSize: 10, color: '#7E8790', marginBottom: 6, fontWeight: 700 }}>
          DER na stacji ({(existingDers ?? []).length})
          {totalMw > 0 && (
            <span data-testid="drawer-station-der-total" style={{ marginLeft: 8, color: '#FFD166' }}>
              Σ {totalMw.toFixed(2)} MW
            </span>
          )}
        </div>
        {existingDers && existingDers.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {existingDers.map((der) => (
              <li
                key={der.id}
                data-testid={`drawer-station-der-${der.id}`}
                style={{
                  background: '#171B20',
                  border: `1px solid ${colorFor(der.kind)}40`,
                  borderRadius: 3,
                  padding: '6px 8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 11,
                }}
              >
                <div>
                  <span style={{ color: colorFor(der.kind), fontWeight: 700 }}>{der.kind ?? 'DER'}</span>
                  <span style={{ color: '#DDF7FF', marginLeft: 6 }}>{der.name ?? der.id}</span>
                </div>
                <span style={{ color: '#88BBDD', fontFamily: 'monospace', fontSize: 10 }}>
                  {der.pMw != null ? `${der.pMw.toFixed(2)} MW` : '—'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div data-testid="drawer-station-der-empty" style={{ color: '#7E8790', fontStyle: 'italic', fontSize: 10 }}>
            Brak DERs. Użyj palety u góry (▸ DODAJ DER), by dodać PV/BESS/FW.
          </div>
        )}
      </div>
    );
  }
  if (kind === 'station' && tab === 'nn') {
    return (
      <div data-testid="drawer-nn-side">
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 12 }}>
          <dt style={{ color: '#7E8790' }}>Szyna nN U</dt>
          <dd data-testid="drawer-nn-bus-voltage" style={{ color: '#FFD166', fontFamily: 'monospace' }}>
            {nnSpec?.busVoltageKv != null ? `${nnSpec.busVoltageKv} kV` : '0.4 kV (default)'}
          </dd>
          <dt style={{ color: '#7E8790' }}>Liczba odpływów</dt>
          <dd data-testid="drawer-nn-loads-count" style={{ color: '#DDF7FF', fontFamily: 'monospace' }}>
            {nnSpec?.loads?.length ?? 0}
          </dd>
        </dl>
        {nnSpec?.loads && nnSpec.loads.length > 0 ? (
          <>
            <div style={{ fontSize: 10, color: '#7E8790', marginBottom: 6, fontWeight: 700 }}>
              Odpływy nN
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {nnSpec.loads.map((load) => (
                <li
                  key={load.id}
                  data-testid={`drawer-nn-load-${load.id}`}
                  style={{
                    background: '#171B20',
                    border: '1px solid #2A3441',
                    borderRadius: 3,
                    padding: '6px 8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: '#DDF7FF' }}>{load.name ?? load.id}</span>
                  <span style={{ color: '#88BBDD', fontFamily: 'monospace' }}>
                    {load.pKw != null ? `${load.pKw.toFixed(1)} kW` : '—'}
                    {load.qKvar != null ? ` / ${load.qKvar.toFixed(1)} kvar` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div data-testid="drawer-nn-no-loads" style={{ color: '#7E8790', fontStyle: 'italic', fontSize: 10 }}>
            Brak zdefiniowanych odpływów nN.
          </div>
        )}
      </div>
    );
  }
  if (kind === 'station' && tab === 'rozdzielnica') {
    if (!baysSpec || baysSpec.length === 0) {
      return (
        <div data-testid="drawer-rozdzielnica-empty" style={{ color: '#7E8790', fontStyle: 'italic' }}>
          Brak pól SN — dodaj pole via E-11 lub menu kontekstowe stacji.
        </div>
      );
    }
    const roleLabel: Record<string, string> = {
      IN: 'Pole dopływowe',
      OUT: 'Pole odpływowe',
      TR: 'Pole transformatorowe',
      COUPLER: 'Łącznik sekcyjny',
      FEEDER: 'Pole zasilające',
      MEASUREMENT: 'Pole pomiarowe',
      OZE: 'Pole OZE',
    };
    return (
      <div data-testid="drawer-rozdzielnica-bays">
        <div style={{ fontSize: 10, color: '#7E8790', marginBottom: 6, fontWeight: 700 }}>
          Pola SN ({baysSpec.length})
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {baysSpec.map((bay) => (
            <li
              key={bay.id}
              data-testid={`drawer-rozdzielnica-bay-${bay.id}`}
              style={{
                background: '#171B20',
                border: '1px solid #2A3441',
                borderRadius: 3,
                padding: '6px 8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ color: '#DDF7FF', fontWeight: 600, fontSize: 11 }}>
                  {bay.bayNumber ? `Q${bay.bayNumber}` : (bay.feederShortName ?? bay.name ?? bay.id)}
                </div>
                <div style={{ color: '#88BBDD', fontSize: 9 }}>
                  {bay.bayRole ? (roleLabel[bay.bayRole] ?? bay.bayRole) : 'Pole'}
                  {bay.feederShortName && bay.bayNumber ? ` · ${bay.feederShortName}` : ''}
                </div>
              </div>
              <div style={{ fontSize: 9, color: '#7E8790', fontFamily: 'monospace' }}>{bay.bayRole ?? '—'}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div style={{ color: '#7E8790' }} data-testid={`drawer-placeholder-${kind}-${tab}`}>
      [{tab}] — Form scaffolding (K30-72+ wire to backend POST).
    </div>
  );
}
