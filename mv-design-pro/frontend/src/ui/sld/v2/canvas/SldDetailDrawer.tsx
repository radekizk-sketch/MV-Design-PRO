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
import { useState } from 'react';

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
}

export interface SldDetailDrawerProps {
  readonly open: boolean;
  readonly data: SldDetailDrawerData | null;
  readonly onClose: () => void;
  /** Width [px]. Default 360. */
  readonly width?: number;
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

function tabsForKind(kind: SldDetailKind): readonly { id: string; label: string }[] {
  if (kind === 'station') return STATION_TABS;
  if (kind === 'bay') return BAY_TABS;
  if (kind === 'apparatus') return APPARATUS_TABS;
  if (kind === 'der') return DER_TABS;
  return [];
}

export function SldDetailDrawer(props: SldDetailDrawerProps): JSX.Element | null {
  const { open, data, onClose, width = 360 } = props;
  const tabs = tabsForKind(data?.kind ?? null);
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.id ?? '');

  if (!open || !data || data.kind === null || tabs.length === 0) return null;

  // Reset active tab when data.kind changes
  const currentTab = tabs.find((t) => t.id === activeTab) ? activeTab : tabs[0].id;

  const accent = data.accentColor ?? '#7EC8FF';

  return (
    <div
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
          <div data-testid="sld-v2-detail-drawer-label" style={{ fontSize: 16, fontWeight: 800, color: accent, marginTop: 2 }}>
            {data.label ?? data.elementId ?? 'Element'}
          </div>
          {data.stationCode && data.kind !== 'station' && (
            <div data-testid="sld-v2-detail-drawer-breadcrumb" style={{ fontSize: 10, color: '#88BBDD', marginTop: 2 }}>
              ↑ Stacja {data.stationCode}
            </div>
          )}
        </div>
        <button
          type="button"
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

      {/* Tabs */}
      <div
        data-testid="sld-v2-detail-drawer-tabs"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0,
          padding: '8px 12px 0',
          borderBottom: '1px solid #2A3441',
        }}
      >
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            data-testid={`sld-v2-detail-drawer-tab-${tab.id}`}
            data-active={currentTab === tab.id ? 'true' : 'false'}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: currentTab === tab.id ? accent : 'transparent',
              color: currentTab === tab.id ? '#0A0E14' : '#88BBDD',
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
        ))}
      </div>

      {/* Tab content */}
      <div
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
  return (
    <div style={{ color: '#7E8790' }} data-testid={`drawer-placeholder-${kind}-${tab}`}>
      [{tab}] — Form scaffolding (K30-72+ wire to backend POST).
    </div>
  );
}
