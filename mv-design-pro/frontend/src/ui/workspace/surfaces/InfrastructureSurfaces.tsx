/**
 * Surface'y infrastruktury sieciowej (Etap 4):
 *  - ZksnSurface (E-14): Złącze kablowe SN
 *  - BranchPoleSurface (E-15): Słup rozgałęźny
 *  - BranchSurface (E-16): Odgałęzienie
 *  - NopSurface (E-17): Punkt normalnie otwarty
 *
 * Każdy surface ma minimalny ale kompletny konfigurator z polskimi etykietami,
 * polami danych technicznych i hint'em o kolejnych etapach roadmapy.
 */

import { useMemo, useState } from 'react';

import { useSnapshotStore } from '../../topology/snapshotStore';
import { MISSING_DASH } from '../../shared/formatPolishValue';
import type { WorkspaceSurfaceDescriptor } from '../types';

interface SurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

// =============================================================================
// E-14 — ZK SN (Złącze kablowe SN)
// =============================================================================

interface ZksnData {
  designation: string;
  catalogId: string;
  manholeType: 'wnetrzowa' | 'zewnetrzna' | 'kanal';
  cableEntries: number;
  hasMeasurement: boolean;
  apparatusKind: 'rozlacznik' | 'odlacznik' | 'wylacznik' | 'brak';
}

const ZKSN_CATALOG = [
  { id: '__missing__', label: '— wybierz —' },
  { id: 'zksn-3w-rozl', label: 'ZK SN 3-portowe · rozłącznik · 24 kV' },
  { id: 'zksn-4w-rozl', label: 'ZK SN 4-portowe · rozłącznik · 24 kV' },
  { id: 'zksn-5w-wyl', label: 'ZK SN 5-portowe · wyłącznik z napędem · 24 kV' },
];

export function ZksnSurface({ surface }: SurfaceProps): JSX.Element {
  const ref = surface.entityRef ?? null;
  const [data, setData] = useState<ZksnData>({
    designation: '',
    catalogId: '__missing__',
    manholeType: 'zewnetrzna',
    cableEntries: 3,
    hasMeasurement: false,
    apparatusKind: 'rozlacznik',
  });

  return (
    <div data-testid="zksn-surface" className="flex h-full w-full flex-col p-4">
      <SurfaceHeader code="E-14" title="Złącze kablowe SN" subtitle={ref ?? 'ZK SN niewybrane'} />
      <div className="flex-1 space-y-3 overflow-auto p-4">
        <Field label="Oznaczenie" required value={data.designation} onChange={(v) => setData((d) => ({ ...d, designation: v }))} placeholder="np. ZK-12" />
        <SelectField
          label="Katalog"
          required
          value={data.catalogId}
          onChange={(v) => setData((d) => ({ ...d, catalogId: v }))}
          options={ZKSN_CATALOG}
        />
        <SelectField
          label="Typ konstrukcji"
          value={data.manholeType}
          onChange={(v) => setData((d) => ({ ...d, manholeType: v as ZksnData['manholeType'] }))}
          options={[
            { id: 'wnetrzowa', label: 'Wnętrzowa' },
            { id: 'zewnetrzna', label: 'Zewnętrzna (kontenerowa)' },
            { id: 'kanal', label: 'W kanale' },
          ]}
        />
        <NumberField
          label="Liczba wejść kablowych"
          unit="szt."
          value={data.cableEntries}
          onChange={(v) => setData((d) => ({ ...d, cableEntries: v ?? 3 }))}
        />
        <SelectField
          label="Aparat sekcjonujący"
          value={data.apparatusKind}
          onChange={(v) => setData((d) => ({ ...d, apparatusKind: v as ZksnData['apparatusKind'] }))}
          options={[
            { id: 'brak', label: 'Brak (przelot)' },
            { id: 'rozlacznik', label: 'Rozłącznik' },
            { id: 'odlacznik', label: 'Odłącznik' },
            { id: 'wylacznik', label: 'Wyłącznik' },
          ]}
        />
        <CheckboxField
          label="Pomiar prądu/napięcia"
          checked={data.hasMeasurement}
          onChange={(v) => setData((d) => ({ ...d, hasMeasurement: v }))}
        />
      </div>
    </div>
  );
}

// =============================================================================
// E-15 — Słup rozgałęźny
// =============================================================================

interface BranchPoleData {
  designation: string;
  poleType: 'krancowy' | 'naroznik' | 'rozgalezny' | 'odporowy' | 'przelotowy';
  hasSwitch: boolean;
  hasSurgeArrester: boolean;
  groundingType: 'naturalne' | 'sztuczne' | 'pomocnicze';
}

export function BranchPoleSurface({ surface }: SurfaceProps): JSX.Element {
  const ref = surface.entityRef ?? null;
  const [data, setData] = useState<BranchPoleData>({
    designation: '',
    poleType: 'rozgalezny',
    hasSwitch: false,
    hasSurgeArrester: true,
    groundingType: 'sztuczne',
  });
  return (
    <div data-testid="branch-pole-surface" className="flex h-full w-full flex-col p-4">
      <SurfaceHeader code="E-15" title="Słup linii napowietrznej SN" subtitle={ref ?? 'Słup niewybrany'} />
      <div className="flex-1 space-y-3 overflow-auto p-4">
        <Field label="Oznaczenie" required value={data.designation} onChange={(v) => setData((d) => ({ ...d, designation: v }))} placeholder="np. S-12" />
        <SelectField
          label="Typ słupa"
          required
          value={data.poleType}
          onChange={(v) => setData((d) => ({ ...d, poleType: v as BranchPoleData['poleType'] }))}
          options={[
            { id: 'przelotowy', label: 'Przelotowy' },
            { id: 'rozgalezny', label: 'Rozgałęźny' },
            { id: 'naroznik', label: 'Narożnikowy' },
            { id: 'odporowy', label: 'Odporowy' },
            { id: 'krancowy', label: 'Krańcowy' },
          ]}
        />
        <CheckboxField
          label="Łącznik na słupie (rozłącznik / odłącznik)"
          checked={data.hasSwitch}
          onChange={(v) => setData((d) => ({ ...d, hasSwitch: v }))}
        />
        <CheckboxField
          label="Ogranicznik przepięć (OPN)"
          checked={data.hasSurgeArrester}
          onChange={(v) => setData((d) => ({ ...d, hasSurgeArrester: v }))}
        />
        <SelectField
          label="Uziemienie"
          value={data.groundingType}
          onChange={(v) =>
            setData((d) => ({ ...d, groundingType: v as BranchPoleData['groundingType'] }))
          }
          options={[
            { id: 'naturalne', label: 'Naturalne' },
            { id: 'sztuczne', label: 'Sztuczne' },
            { id: 'pomocnicze', label: 'Pomocnicze' },
          ]}
        />
      </div>
    </div>
  );
}

// =============================================================================
// E-16 — Odgałęzienie
// =============================================================================

export function BranchSurface({ surface }: SurfaceProps): JSX.Element {
  const ref = surface.entityRef ?? null;
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const branchInfo = useMemo(() => {
    if (!snapshot || !ref) return { name: ref ?? 'Odgałęzienie niewybrane', stationsCount: 0, lengthM: null as number | null };
    return { name: ref, stationsCount: 0, lengthM: null };
  }, [snapshot, ref]);
  return (
    <div data-testid="branch-surface" className="flex h-full w-full flex-col p-4">
      <SurfaceHeader code="E-16" title="Odgałęzienie" subtitle={branchInfo.name} />
      <div className="flex-1 space-y-3 overflow-auto p-4">
        <p className="rounded border border-scada-border bg-scada-surface p-3 text-sm text-scada-muted">
          Odgałęzienie podporządkowane ciągowi głównemu. Konfiguracja odgałęzienia
          obejmuje: punkt startowy (pole SN/stacja/słup/ZK SN), rodzinę odcinka
          (kabel/linia), endpointy oraz obiekty na odgałęzieniu.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <KeyValue label="Liczba stacji" value={`${branchInfo.stationsCount}`} />
          <KeyValue label="Długość całkowita" value={branchInfo.lengthM !== null ? `${branchInfo.lengthM} m` : MISSING_DASH} />
          <KeyValue label="Status" value="W trakcie konfiguracji" />
          <KeyValue label="Wyniki" value={MISSING_DASH} />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// E-17 — NOP (Punkt normalnie otwarty)
// =============================================================================

interface NopData {
  designation: string;
  apparatusRef: string;
  isNormallyOpen: boolean;
  switchableUnderLoad: boolean;
  remoteControl: boolean;
}

export function NopSurface({ surface }: SurfaceProps): JSX.Element {
  const ref = surface.entityRef ?? null;
  const [data, setData] = useState<NopData>({
    designation: '',
    apparatusRef: '',
    isNormallyOpen: true,
    switchableUnderLoad: true,
    remoteControl: false,
  });
  return (
    <div data-testid="nop-surface" className="flex h-full w-full flex-col p-4">
      <SurfaceHeader code="E-17" title="Punkt normalnie otwarty" subtitle={ref ?? 'NOP niewybrany'} />
      <div className="flex-1 space-y-3 overflow-auto p-4">
        <Field
          label="Oznaczenie NOP"
          required
          value={data.designation}
          onChange={(v) => setData((d) => ({ ...d, designation: v }))}
          placeholder="np. NOP-W-01"
        />
        <Field
          label="Aparat realizujący NOP"
          value={data.apparatusRef}
          onChange={(v) => setData((d) => ({ ...d, apparatusRef: v }))}
          placeholder="ID aparatu z modelu sieci"
        />
        <CheckboxField
          label="Stan normalny: otwarty"
          checked={data.isNormallyOpen}
          onChange={(v) => setData((d) => ({ ...d, isNormallyOpen: v }))}
        />
        <CheckboxField
          label="Możliwość przełączania pod obciążeniem"
          checked={data.switchableUnderLoad}
          onChange={(v) => setData((d) => ({ ...d, switchableUnderLoad: v }))}
        />
        <CheckboxField
          label="Sterowanie zdalne (SCADA)"
          checked={data.remoteControl}
          onChange={(v) => setData((d) => ({ ...d, remoteControl: v }))}
        />
        <p className="rounded border border-scada-border bg-scada-surface p-3 text-[11px] text-scada-muted">
          NOP modeluje rozcięcie elektryczne pierścienia SN. Operacja domenowa
          set_normal_open_point (panel ENM) ustawia / zmienia stan łącznika.
          Pełna integracja z układem pracy sieci (E-05) — Etap 6 roadmapy.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Wspólne komponenty pomocnicze
// =============================================================================

function SurfaceHeader({ code, title, subtitle }: { code: string; title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
        {code} · {title}
      </div>
      <h2 className="mt-1 text-base font-semibold text-scada-text">{subtitle}</h2>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-scada-border bg-scada-surface p-2">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-scada-muted">{label}</div>
      <div className="mt-1 text-sm font-medium text-scada-text">{value}</div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

function Field({ label, value, onChange, placeholder, required }: FieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-sm text-scada-text placeholder:text-scada-muted focus:border-scada-sn focus:outline-none"
      />
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  unit?: string;
  value: number | null;
  onChange: (value: number | null) => void;
}

function NumberField({ label, unit, value, onChange }: NumberFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-scada-muted">
        {label}
        {unit && <span> [{unit}]</span>}
      </label>
      <input
        type="number"
        value={value === null ? '' : value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(null);
            return;
          }
          const num = Number(raw);
          onChange(Number.isNaN(num) ? null : num);
        }}
        className="w-full rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-sm text-scada-text focus:border-scada-sn focus:outline-none"
      />
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
  required?: boolean;
}

function SelectField({ label, value, onChange, options, required }: SelectFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-sm text-scada-text focus:border-scada-sn focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function CheckboxField({ label, checked, onChange }: CheckboxFieldProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-scada-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-scada-border bg-scada-surface text-scada-sn focus:ring-scada-sn"
      />
      {label}
    </label>
  );
}
