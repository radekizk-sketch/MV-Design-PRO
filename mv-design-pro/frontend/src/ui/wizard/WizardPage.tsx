/**
 * WizardPage — Kreator budowy sieci SN/nN z ENM
 *
 * Kreator krok po kroku (K1-K10) prowadzący użytkownika
 * przez proces budowy kompletnej sieci średniego napięcia.
 * Proces zaczyna się od GPZ — punkt zasilania (K2) jest kluczowy.
 *
 * Każdy krok edytuje EnergyNetworkModel (ENM) — autosave via PUT.
 * Integracja: wizardStateMachine (gate logic) + kanoniczny preview SLD.
 *
 * BINDING: Etykiety po polsku, brak kodów projektowych.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type {
  EnergyNetworkModel,
  OverheadLine,
  Cable,
  SwitchBranch,
  Transformer,
  Source,
  Load,
  Generator,
  GroundingConfig,
  ValidationResult,
} from '../../types/enm';
import { computeWizardState, getStepStatusColor, getOverallStatusLabel } from './wizardStateMachine';
import type { WizardState } from './wizardStateMachine';
import { useWizardStore } from './useWizardStore';
import { formatPolishValue } from '../shared/formatPolishValue';
import type { WizardIssueApi } from './useWizardStore';
import { useSnapshotStore } from '../topology/snapshotStore';
import { TypePicker } from '../catalog/TypePicker';
import type { TypeCategory } from '../catalog/types';
import { formatGeneratorTypeShortLabelPl } from '../shared/generatorTypeLabels';
import {
  resolveWizardSurfaceStepId,
  type WizardSurfaceStepId,
} from '../../types/fixActionSurface';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const AUTOSAVE_DEBOUNCE_MS = 500;

interface WizardStep {
  id: string;
  number: number;
  title: string;
  description: string;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 'K1', number: 1, title: 'Parametry modelu', description: 'Nazwa projektu, częstotliwość, opis' },
  { id: 'K2', number: 2, title: 'Punkt zasilania (GPZ)', description: 'Szyna główna SN + sieć zasilająca — początek budowy' },
  { id: 'K3', number: 3, title: 'Struktura szyn i sekcji', description: 'Sekcjonowanie szyn, sprzęgła' },
  { id: 'K4', number: 4, title: 'Gałęzie (linie / kable)', description: 'Parametry linii: R, X, długość' },
  { id: 'K5', number: 5, title: 'Transformatory', description: 'Dane znamionowe: Sn, uk%, Pk' },
  { id: 'K6', number: 6, title: 'Odbiory i generacja', description: 'Odbiorniki (P, Q) i źródła OZE' },
  { id: 'K7', number: 7, title: 'Uziemienia i składowe zerowe', description: 'Przegląd kompletności Z0' },
  { id: 'K8', number: 8, title: 'Walidacja', description: 'Sprawdzenie gotowości obliczeń' },
  { id: 'K9', number: 9, title: 'Schemat jednokreskowy', description: 'Podgląd SLD z referencjami ENM' },
  { id: 'K10', number: 10, title: 'Uruchom analizy', description: 'Zwarcia 3F, rozpływ mocy' },
];

const WIZARD_STEP_INDEX_BY_SURFACE_ID: Record<WizardSurfaceStepId, number> = {
  'parametry-modelu': 0,
  'punkt-zasilania-gpz': 1,
  'struktura-szyn-i-sekcji': 2,
  'galezie-linie-kable': 3,
  transformatory: 4,
  'odbiorniki-i-zrodla': 5,
  'uziemienia-i-skladowe-zerowe': 6,
  walidacja: 7,
  'schemat-jednokreskowy': 8,
  'uruchomienie-analiz': 9,
};

function resolveWizardIssueStepId(
  issue: Pick<WizardIssueApi, 'wizard_step_id' | 'wizard_step_hint'>,
): WizardSurfaceStepId | null {
  return issue.wizard_step_id ?? resolveWizardSurfaceStepId(issue.wizard_step_hint ?? null);
}

function getWizardStepByIssue(
  issue: Pick<WizardIssueApi, 'wizard_step_id' | 'wizard_step_hint'>,
): WizardStep | null {
  const surfaceStepId = resolveWizardIssueStepId(issue);
  if (!surfaceStepId) {
    return null;
  }
  const stepIndex = WIZARD_STEP_INDEX_BY_SURFACE_ID[surfaceStepId];
  return WIZARD_STEPS[stepIndex] ?? null;
}

function getWizardStepLabelByIssue(
  issue: Pick<WizardIssueApi, 'wizard_step_id' | 'wizard_step_hint'>,
): string | null {
  const step = getWizardStepByIssue(issue);
  return step ? `Krok ${step.number}: ${step.title}` : null;
}

function createDefaultENM(): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0', name: '', description: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      revision: 0, hash_sha256: '', defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: [], branches: [], transformers: [], sources: [], loads: [], generators: [], substations: [], bays: [], junctions: [], corridors: [], measurements: [], protection_assignments: [],
  };
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function getCaseId(): string {
  const match = window.location.hash.match(/caseId=([^&]+)/);
  return match?.[1] ?? 'default';
}

async function fetchENM(caseId: string): Promise<EnergyNetworkModel> {
  const r = await fetch(`${API_BASE}/api/cases/${caseId}/enm`);
  if (!r.ok) throw new Error(`GET ENM: ${r.status}`);
  return r.json();
}

async function saveENM(caseId: string, enm: EnergyNetworkModel): Promise<EnergyNetworkModel> {
  const r = await fetch(`${API_BASE}/api/cases/${caseId}/enm`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(enm),
  });
  if (!r.ok) throw new Error(`PUT ENM: ${r.status}`);
  return r.json();
}

async function validateENM(caseId: string): Promise<ValidationResult> {
  const r = await fetch(`${API_BASE}/api/cases/${caseId}/enm/validate`);
  if (!r.ok) throw new Error(`Validate: ${r.status}`);
  return r.json();
}

async function runShortCircuit(caseId: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${API_BASE}/api/cases/${caseId}/runs/short-circuit`, { method: 'POST' });
  if (!r.ok) throw new Error(`Run SC: ${r.status}`);
  return r.json();
}

async function runPowerFlow(caseId: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${API_BASE}/api/cases/${caseId}/runs/power-flow`, { method: 'POST' });
  if (!r.ok) throw new Error(`Run PF: ${r.status}`);
  return r.json();
}

// ---------------------------------------------------------------------------
// Reusable UI components — Industrial Grade
// ---------------------------------------------------------------------------

function FieldRow({ label, children, unit }: { label: string; children: React.ReactNode; unit?: string }) {
  return (
    <div className="wizard-field-row">
      <label className="wizard-field-label">{label}{unit && <span className="text-chrome-400 font-normal ml-1">[{unit}]</span>}</label>
      <div className="wizard-field-value">{children}</div>
    </div>
  );
}

function Input({ value, onChange, type = 'text', placeholder }: {
  value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="ind-input" />
  );
}

function Select({ value, onChange, children }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="ind-select">
      {children}
    </select>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-sm font-semibold text-ind-800 mb-3 mt-4 first:mt-0">{children}</h4>;
}

function HelpText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-chrome-400 mb-3">{children}</p>;
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-6 w-6 items-center justify-center rounded-ind text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Usuń">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="ind-btn text-ind-600 bg-ind-50 hover:bg-ind-100 border border-ind-200 mt-3">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Step content components (K1-K10)
// ---------------------------------------------------------------------------

type StepProps = { enm: EnergyNetworkModel; onChange: (e: EnergyNetworkModel) => void };

function StepK1({ enm, onChange }: StepProps) {
  const VOLTAGE_OPTIONS = [6, 10, 15, 20, 30];
  const NETWORK_TYPES = [
    { value: 'promieniowy', label: 'Promieniowy' },
    { value: 'pierścieniowy', label: 'Pierścieniowy' },
    { value: 'mieszany', label: 'Mieszany' },
  ];

  const headerMeta = (((enm.header as unknown) as Record<string, unknown>).meta ?? {}) as Record<string, unknown>;
  const voltageSn = (headerMeta.voltage_sn_kv as number) ?? 15;
  const networkType = (headerMeta.network_type as string) ?? 'promieniowy';

  const updateHeaderMeta = (key: string, value: unknown) => {
    const newMeta = { ...headerMeta, [key]: value };
    const newHeader = { ...enm.header, meta: newMeta } as typeof enm.header;
    let newEnm = { ...enm, header: newHeader };

    // When voltage changes, propagate to source bus
    if (key === 'voltage_sn_kv' && typeof value === 'number') {
      const sourceBusIdx = newEnm.buses.findIndex((b) => b.tags.includes('source'));
      if (sourceBusIdx >= 0) {
        const buses = [...newEnm.buses];
        buses[sourceBusIdx] = { ...buses[sourceBusIdx], voltage_kv: value };
        newEnm = { ...newEnm, buses };
      }
    }

    onChange(newEnm);
  };

  return (
    <div>
      <SectionTitle>Informacje o projekcie</SectionTitle>
      <FieldRow label="Nazwa projektu">
        <Input value={enm.header.name} onChange={(v) => onChange({ ...enm, header: { ...enm.header, name: v } })} placeholder="np. GPZ Centrum" />
      </FieldRow>
      <FieldRow label="Opis">
        <Input value={enm.header.description ?? ''} onChange={(v) => onChange({ ...enm, header: { ...enm.header, description: v || null } })} placeholder="Opcjonalny opis projektu" />
      </FieldRow>

      <SectionTitle>Parametry systemu</SectionTitle>
      <FieldRow label="Napięcie znamionowe SN" unit="kV">
        <Select value={String(voltageSn)} onChange={(v) => updateHeaderMeta('voltage_sn_kv', Number(v))}>
          {VOLTAGE_OPTIONS.map((kv) => (
            <option key={kv} value={String(kv)}>{kv} kV</option>
          ))}
        </Select>
      </FieldRow>
      <HelpText>Napięcie zostanie automatycznie ustawione na szynie źródłowej GPZ.</HelpText>

      <FieldRow label="Układ sieci">
        <Select value={networkType} onChange={(v) => updateHeaderMeta('network_type', v)}>
          {NETWORK_TYPES.map((nt) => (
            <option key={nt.value} value={nt.value}>{nt.label}</option>
          ))}
        </Select>
      </FieldRow>

      <FieldRow label="Częstotliwość" unit="Hz">
        <Input type="number" value={enm.header.defaults.frequency_hz} onChange={(v) => onChange({ ...enm, header: { ...enm.header, defaults: { ...enm.header.defaults, frequency_hz: Number(v) || 50 } } })} />
      </FieldRow>
    </div>
  );
}

function StepK2({ enm, onChange }: StepProps) {
  const bus = enm.buses.find((b) => b.tags.includes('source'));
  const src = enm.sources[0];

  const updateBus = (patch: Partial<{ name: string; voltage_kv: number }>) => {
    const busRef = bus?.ref_id ?? 'bus_sn_main';
    const buses = [...enm.buses];
    const bi = buses.findIndex((b) => b.ref_id === busRef);
    if (bi < 0) {
      buses.push({ id: crypto.randomUUID(), ref_id: busRef, name: patch.name ?? 'Szyna główna SN', tags: ['source'], meta: {}, voltage_kv: patch.voltage_kv ?? 15, phase_system: '3ph' });
    } else {
      buses[bi] = { ...buses[bi], ...patch };
    }
    onChange({ ...enm, buses });
  };

  const updateSrc = (patch: Partial<Source>) => {
    const busRef = bus?.ref_id ?? 'bus_sn_main';
    const srcRef = src?.ref_id ?? 'source_grid';
    const sources = [...enm.sources];
    const si = sources.findIndex((s) => s.ref_id === srcRef);
    if (si < 0) {
      sources.push({ id: crypto.randomUUID(), ref_id: srcRef, name: 'Sieć zasilająca', tags: [], meta: {}, bus_ref: busRef, model: 'short_circuit_power', sk3_mva: 250, rx_ratio: 0.1, c_max: 1.1, c_min: 1.0, ...patch });
    } else {
      sources[si] = { ...sources[si], ...patch };
    }
    onChange({ ...enm, sources });
  };

  const model = src?.model ?? 'short_circuit_power';

  return (
    <div>
      <div className="mb-4 p-3 bg-ind-50 border border-ind-200 rounded-md">
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4 text-ind-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          <span className="text-sm font-semibold text-ind-800">Punkt zasilania GPZ</span>
        </div>
        <p className="text-xs text-ind-600">Szyna główna SN, parametry sieci zasilającej i współczynniki napięciowe IEC 60909.</p>
      </div>

      <SectionTitle>Szyna źródłowa</SectionTitle>
      <FieldRow label="Nazwa szyny"><Input value={bus?.name ?? 'Szyna główna SN'} onChange={(v) => updateBus({ name: v })} /></FieldRow>
      <FieldRow label="Napięcie znamionowe" unit="kV"><Input type="number" value={bus?.voltage_kv ?? 15} onChange={(v) => updateBus({ voltage_kv: Number(v) || 15 })} /></FieldRow>

      <SectionTitle>Źródło zasilania</SectionTitle>
      <FieldRow label="Model">
        <Select value={model} onChange={(v) => updateSrc({ model: v as Source['model'] })}>
          <option value="short_circuit_power">Moc zwarciowa Sk&#34;</option>
          <option value="thevenin">Impedancja Thevenin (R, X)</option>
          <option value="external_grid">Sieć zewnętrzna</option>
        </Select>
      </FieldRow>

      {(model === 'short_circuit_power' || model === 'external_grid') && (
        <>
          <FieldRow label="Sk&#34;" unit="MVA"><Input type="number" value={src?.sk3_mva ?? 250} onChange={(v) => updateSrc({ sk3_mva: Number(v) || 0 })} /></FieldRow>
          <FieldRow label="R/X"><Input type="number" value={src?.rx_ratio ?? 0.1} onChange={(v) => updateSrc({ rx_ratio: Number(v) || 0.1 })} /></FieldRow>
        </>
      )}

      {model === 'thevenin' && (
        <>
          <FieldRow label="R" unit="&Omega;"><Input type="number" value={src?.r_ohm ?? 0} onChange={(v) => updateSrc({ r_ohm: Number(v) || 0 })} /></FieldRow>
          <FieldRow label="X" unit="&Omega;"><Input type="number" value={src?.x_ohm ?? 0} onChange={(v) => updateSrc({ x_ohm: Number(v) || 0 })} /></FieldRow>
        </>
      )}

      <SectionTitle>Współczynniki napięciowe IEC 60909</SectionTitle>
      <HelpText>Współczynniki c_max i c_min korygują napięcie przed obliczeniem prądów zwarciowych.</HelpText>
      <FieldRow label="c_max"><Input type="number" value={src?.c_max ?? 1.1} onChange={(v) => updateSrc({ c_max: Number(v) || 1.1 })} /></FieldRow>
      <FieldRow label="c_min"><Input type="number" value={src?.c_min ?? 1.0} onChange={(v) => updateSrc({ c_min: Number(v) || 1.0 })} /></FieldRow>

      <SectionTitle>Składowa zerowa źródła (Z0)</SectionTitle>
      <HelpText>Wymagana do obliczeń zwarć doziemnych (1F). Podaj stosunek Z0/Z1 lub bezpośrednio R0, X0.</HelpText>
      <FieldRow label="Z0/Z1"><Input type="number" value={src?.z0_z1_ratio ?? ''} onChange={(v) => updateSrc({ z0_z1_ratio: v ? Number(v) : null })} placeholder="np. 1.0" /></FieldRow>
      <FieldRow label="R0" unit="&Omega;"><Input type="number" value={src?.r0_ohm ?? ''} onChange={(v) => updateSrc({ r0_ohm: v ? Number(v) : null })} placeholder="opcjonalne" /></FieldRow>
      <FieldRow label="X0" unit="&Omega;"><Input type="number" value={src?.x0_ohm ?? ''} onChange={(v) => updateSrc({ x0_ohm: v ? Number(v) : null })} placeholder="opcjonalne" /></FieldRow>
    </div>
  );
}

function StepK3({ enm, onChange }: StepProps) {
  const sourceBus = enm.buses.find((b) => b.tags.includes('source'));
  const extra = enm.buses.filter((b) => !b.tags.includes('source'));
  const couplers = enm.branches.filter((b): b is SwitchBranch => b.type === 'bus_coupler');
  const allRefs = enm.buses.map((b) => b.ref_id);

  const addBusSN = () => {
    const n = extra.filter((b) => !b.tags.includes('nn')).length + 1;
    onChange({ ...enm, buses: [...enm.buses, { id: crypto.randomUUID(), ref_id: `bus_sn_${Date.now()}`, name: `Szyna SN sekcja ${n}`, tags: [], meta: {}, voltage_kv: sourceBus?.voltage_kv ?? 15, phase_system: '3ph' }] });
  };
  const addBusNN = () => {
    const n = extra.filter((b) => b.tags.includes('nn')).length + 1;
    onChange({ ...enm, buses: [...enm.buses, { id: crypto.randomUUID(), ref_id: `bus_nn_${Date.now()}`, name: `Szyna nN ${n}`, tags: ['nn'], meta: {}, voltage_kv: 0.4, phase_system: '3ph' }] });
  };
  const updBus = (ref: string, p: Partial<{ name: string; voltage_kv: number; zone: string | null }>) =>
    onChange({ ...enm, buses: enm.buses.map((b) => b.ref_id === ref ? { ...b, ...p } : b) });
  const rmBus = (ref: string) => onChange({
    ...enm,
    buses: enm.buses.filter((b) => b.ref_id !== ref),
    branches: enm.branches.filter((br) => br.from_bus_ref !== ref && br.to_bus_ref !== ref),
  });

  const addCoupler = () => {
    if (allRefs.length < 2) return;
    const c: SwitchBranch = {
      id: crypto.randomUUID(), ref_id: `coupler_${Date.now()}`, name: `Sprzęgło ${couplers.length + 1}`,
      tags: [], meta: {}, type: 'bus_coupler',
      from_bus_ref: allRefs[0], to_bus_ref: allRefs[1] ?? allRefs[0], status: 'open',
    };
    onChange({ ...enm, branches: [...enm.branches, c] });
  };
  const updCoupler = (ref: string, p: Partial<SwitchBranch>) =>
    onChange({ ...enm, branches: enm.branches.map((b) => b.ref_id === ref ? { ...b, ...p } as typeof b : b) });
  const rmCoupler = (ref: string) =>
    onChange({ ...enm, branches: enm.branches.filter((b) => b.ref_id !== ref) });

  return (
    <div>
      <HelpText>Szyny zborcze SN i nN. Każda szyna to jedna sekcja rozdzielnicy. Sprzęgło łączy dwie sekcje (NO = normalnie otwarte).</HelpText>

      {/* Source bus — read-only */}
      {sourceBus && (
        <div className="wizard-card flex items-center mb-2 bg-ind-50 border-ind-200">
          <span className="flex-1 text-sm font-medium text-ind-800">{sourceBus.name}</span>
          <span className="ind-badge ind-badge-ok text-[10px] mr-2">GPZ</span>
          <span className="text-xs text-chrome-400">{sourceBus.voltage_kv} kV</span>
        </div>
      )}

      <SectionTitle>Szyny dodatkowe</SectionTitle>
      <div className="space-y-2">
        {extra.map((b) => (
          <div key={b.ref_id} className="wizard-card">
            <div className="wizard-card-header">
              <span className="text-sm font-semibold text-ind-800">{b.name}</span>
              <div className="flex items-center gap-1">
                {b.tags.includes('nn') && <span className="ind-badge ind-badge-info text-[10px]">nN</span>}
                <RemoveButton onClick={() => rmBus(b.ref_id)} />
              </div>
            </div>
            <FieldRow label="Nazwa"><Input value={b.name} onChange={(v) => updBus(b.ref_id, { name: v })} /></FieldRow>
            <FieldRow label="Napięcie" unit="kV"><Input type="number" value={b.voltage_kv} onChange={(v) => updBus(b.ref_id, { voltage_kv: Number(v) || 0.4 })} /></FieldRow>
            <FieldRow label="Strefa (opcjonalnie)"><Input value={b.zone ?? ''} onChange={(v) => updBus(b.ref_id, { zone: v || null })} placeholder="np. Sekcja A" /></FieldRow>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <AddButton onClick={addBusSN} label="Dodaj szynę SN" />
        <AddButton onClick={addBusNN} label="Dodaj szynę nN (0,4 kV)" />
      </div>

      {/* Bus couplers */}
      <SectionTitle>Sprzęgła (łączniki międzysystemowe)</SectionTitle>
      <div className="space-y-2">
        {couplers.map((c) => (
          <div key={c.ref_id} className="wizard-card">
            <div className="wizard-card-header">
              <span className="text-sm font-semibold text-ind-800">{c.name}</span>
              <div className="flex items-center gap-1">
                <span className={clsx('ind-badge text-[10px]', c.status === 'closed' ? 'ind-badge-ok' : 'ind-badge-warn')}>
                  {c.status === 'closed' ? 'Zamknięty' : 'Otwarty'}
                </span>
                <RemoveButton onClick={() => rmCoupler(c.ref_id)} />
              </div>
            </div>
            <FieldRow label="Z szyny"><Select value={c.from_bus_ref} onChange={(v) => updCoupler(c.ref_id, { from_bus_ref: v })}>{allRefs.map((r) => <option key={r} value={r}>{enm.buses.find((b) => b.ref_id === r)?.name ?? r}</option>)}</Select></FieldRow>
            <FieldRow label="Do szyny"><Select value={c.to_bus_ref} onChange={(v) => updCoupler(c.ref_id, { to_bus_ref: v })}>{allRefs.map((r) => <option key={r} value={r}>{enm.buses.find((b) => b.ref_id === r)?.name ?? r}</option>)}</Select></FieldRow>
            <FieldRow label="Stan">
              <Select value={c.status} onChange={(v) => updCoupler(c.ref_id, { status: v as 'closed' | 'open' })}>
                <option value="open">Otwarty (NO)</option>
                <option value="closed">Zamknięty (NC)</option>
              </Select>
            </FieldRow>
          </div>
        ))}
      </div>
      {allRefs.length >= 2 && <AddButton onClick={addCoupler} label="Dodaj sprzęgło" />}
      {allRefs.length < 2 && <HelpText>Dodaj co najmniej 2 szyny, aby móc utworzyć sprzęgło.</HelpText>}
    </div>
  );
}

function StepK4({ enm, onChange }: StepProps) {
  const lines = enm.branches.filter((b): b is OverheadLine | Cable => b.type === 'line_overhead' || b.type === 'cable');
  const refs = enm.buses.map((b) => b.ref_id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<TypeCategory>('LINE');
  const [pickerTargetRef, setPickerTargetRef] = useState<string | null>(null);
  const [expandedZ0, setExpandedZ0] = useState<Record<string, boolean>>({});
  const [expandedRating, setExpandedRating] = useState<Record<string, boolean>>({});

  const add = (branchType: 'line_overhead' | 'cable') => {
    const n = lines.length + 1;
    const isLine = branchType === 'line_overhead';
    const nl = { id: crypto.randomUUID(), ref_id: `${isLine ? 'line' : 'cable'}_${Date.now()}`, name: isLine ? `Linia L${n}` : `Kabel K${n}`, tags: [] as string[], meta: {}, type: branchType, from_bus_ref: refs[0] ?? '', to_bus_ref: refs[1] ?? refs[0] ?? '', status: 'closed' as const, length_km: 1, r_ohm_per_km: 0, x_ohm_per_km: 0 };
    onChange({ ...enm, branches: [...enm.branches, nl as OverheadLine | Cable] });
  };
  const upd = (ref: string, p: Record<string, unknown>) => onChange({ ...enm, branches: enm.branches.map((b) => (b.ref_id === ref ? ({ ...b, ...p }) as typeof b : b)) });
  const rm = (ref: string) => onChange({ ...enm, branches: enm.branches.filter((b) => b.ref_id !== ref) });

  const openPicker = (branchRefId: string, branchType: string) => { setPickerTargetRef(branchRefId); setPickerCategory(branchType === 'cable' ? 'CABLE' : 'LINE'); setPickerOpen(true); };
  const handleTypeSelected = (typeId: string, typeName: string) => { if (!pickerTargetRef) return; upd(pickerTargetRef, { catalog_ref: typeId, parameter_source: 'CATALOG', name: typeName }); setPickerOpen(false); setPickerTargetRef(null); };
  const catLock = (l: OverheadLine | Cable) => l.catalog_ref ? 'opacity-60 pointer-events-none' : '';

  return (
    <div>
      <HelpText>Linie napowietrzne i kable SN. Wybierz typ z katalogu lub wpisz parametry ręcznie.</HelpText>
      <div className="space-y-3">
        {lines.map((l) => (
          <div key={l.ref_id} className="wizard-card">
            <div className="wizard-card-header">
              <span className="text-sm font-semibold text-ind-800">{l.name}</span>
              <div className="flex items-center gap-1">
                {l.catalog_ref ? <span className="ind-badge ind-badge-ok text-[10px]">Katalog</span> : <span className="ind-badge ind-badge-warn text-[10px]">Brak typu</span>}
                <RemoveButton onClick={() => rm(l.ref_id)} />
              </div>
            </div>
            <FieldRow label="Typ z katalogu">
              <div className="flex items-center gap-2">
                <span className="text-sm text-chrome-600 flex-1 truncate">{l.catalog_ref ? l.name : 'Nie wybrano'}</span>
                <button onClick={() => openPicker(l.ref_id, l.type)} className="ind-btn text-ind-600 bg-ind-50 hover:bg-ind-100 border border-ind-200 text-[11px] whitespace-nowrap">{l.catalog_ref ? 'Zmień typ' : 'Wybierz z katalogu'}</button>
                {l.catalog_ref && <button onClick={() => upd(l.ref_id, { catalog_ref: null, parameter_source: null })} className="ind-btn text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 text-[11px]">Wyczyść</button>}
              </div>
            </FieldRow>
            <FieldRow label="Rodzaj"><Select value={l.type} onChange={(v) => upd(l.ref_id, { type: v })}><option value="line_overhead">Linia napowietrzna</option><option value="cable">Kabel</option></Select></FieldRow>
            {l.type === 'cable' && <FieldRow label="Izolacja"><Select value={(l as Cable).insulation ?? 'XLPE'} onChange={(v) => upd(l.ref_id, { insulation: v })}><option value="XLPE">XLPE</option><option value="PVC">PVC</option><option value="PAPER">Papierowa</option></Select></FieldRow>}
            <FieldRow label="Nazwa"><Input value={l.name} onChange={(v) => upd(l.ref_id, { name: v })} /></FieldRow>
            <FieldRow label="Z szyny"><Select value={l.from_bus_ref} onChange={(v) => upd(l.ref_id, { from_bus_ref: v })}>{refs.map((r) => <option key={r} value={r}>{r}</option>)}</Select></FieldRow>
            <FieldRow label="Do szyny"><Select value={l.to_bus_ref} onChange={(v) => upd(l.ref_id, { to_bus_ref: v })}>{refs.map((r) => <option key={r} value={r}>{r}</option>)}</Select></FieldRow>
            <FieldRow label="Długość" unit="km"><Input type="number" value={l.length_km} onChange={(v) => upd(l.ref_id, { length_km: Number(v) || 0 })} /></FieldRow>
            <div className={catLock(l)}>
              {l.catalog_ref && <div className="text-[10px] text-ind-500 mb-1 mt-2 font-medium">Parametry z katalogu (tylko odczyt)</div>}
              <FieldRow label="R1" unit="&Omega;/km"><Input type="number" value={l.r_ohm_per_km} onChange={(v) => upd(l.ref_id, { r_ohm_per_km: Number(v) || 0 })} /></FieldRow>
              <FieldRow label="X1" unit="&Omega;/km"><Input type="number" value={l.x_ohm_per_km} onChange={(v) => upd(l.ref_id, { x_ohm_per_km: Number(v) || 0 })} /></FieldRow>
              <FieldRow label="B1" unit="S/km"><Input type="number" value={l.b_siemens_per_km ?? ''} onChange={(v) => upd(l.ref_id, { b_siemens_per_km: v ? Number(v) : null })} placeholder="susceptancja" /></FieldRow>
            </div>
            <button onClick={() => setExpandedRating((s) => ({ ...s, [l.ref_id]: !s[l.ref_id] }))} className="text-[11px] text-ind-600 hover:underline mt-2">{expandedRating[l.ref_id] ? '\u25BE' : '\u25B8'} Obciążalność i wytrzymałość</button>
            {expandedRating[l.ref_id] && <div className={catLock(l)}>
              <FieldRow label="In" unit="A"><Input type="number" value={l.rating?.in_a ?? ''} onChange={(v) => upd(l.ref_id, { rating: { ...l.rating, in_a: v ? Number(v) : null } })} placeholder="obciążalność" /></FieldRow>
              <FieldRow label="Ith" unit="kA"><Input type="number" value={l.rating?.ith_ka ?? ''} onChange={(v) => upd(l.ref_id, { rating: { ...l.rating, ith_ka: v ? Number(v) : null } })} /></FieldRow>
              <FieldRow label="Idyn" unit="kA"><Input type="number" value={l.rating?.idyn_ka ?? ''} onChange={(v) => upd(l.ref_id, { rating: { ...l.rating, idyn_ka: v ? Number(v) : null } })} /></FieldRow>
            </div>}
            <button onClick={() => setExpandedZ0((s) => ({ ...s, [l.ref_id]: !s[l.ref_id] }))} className="text-[11px] text-ind-600 hover:underline mt-1">{expandedZ0[l.ref_id] ? '\u25BE' : '\u25B8'} Składowa zerowa (Z0)</button>
            {expandedZ0[l.ref_id] && <div className={catLock(l)}>
              <FieldRow label="R0" unit="&Omega;/km"><Input type="number" value={l.r0_ohm_per_km ?? ''} onChange={(v) => upd(l.ref_id, { r0_ohm_per_km: v ? Number(v) : null })} /></FieldRow>
              <FieldRow label="X0" unit="&Omega;/km"><Input type="number" value={l.x0_ohm_per_km ?? ''} onChange={(v) => upd(l.ref_id, { x0_ohm_per_km: v ? Number(v) : null })} /></FieldRow>
              <FieldRow label="B0" unit="S/km"><Input type="number" value={l.b0_siemens_per_km ?? ''} onChange={(v) => upd(l.ref_id, { b0_siemens_per_km: v ? Number(v) : null })} /></FieldRow>
            </div>}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3"><AddButton onClick={() => add('line_overhead')} label="Dodaj linię" /><AddButton onClick={() => add('cable')} label="Dodaj kabel" /></div>
      <TypePicker category={pickerCategory} currentTypeId={lines.find((l) => l.ref_id === pickerTargetRef)?.catalog_ref ?? null} onSelectType={handleTypeSelected} onClose={() => { setPickerOpen(false); setPickerTargetRef(null); }} isOpen={pickerOpen} />
    </div>
  );
}

function StepK5({ enm, onChange }: StepProps) {
  const refs = enm.buses.map((b) => b.ref_id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargetRef, setPickerTargetRef] = useState<string | null>(null);
  const [expandedTap, setExpandedTap] = useState<Record<string, boolean>>({});

  const VECTOR_GROUPS = ['Dyn5', 'Dyn11', 'Yyn0', 'Yzn5', 'Dzn0'];

  const add = () => {
    const n = enm.transformers.length + 1;
    const t: Transformer = { id: crypto.randomUUID(), ref_id: `trafo_T${n}`, name: `Transformator T${n}`, tags: [], meta: {}, hv_bus_ref: refs[0] ?? '', lv_bus_ref: refs[1] ?? refs[0] ?? '', sn_mva: 0, uhv_kv: 0, ulv_kv: 0, uk_percent: 0, pk_kw: 0 };
    onChange({ ...enm, transformers: [...enm.transformers, t] });
  };
  const upd = (ref: string, p: Partial<Transformer>) => onChange({ ...enm, transformers: enm.transformers.map((t) => t.ref_id === ref ? { ...t, ...p } : t) });
  const rm = (ref: string) => onChange({ ...enm, transformers: enm.transformers.filter((t) => t.ref_id !== ref) });

  const handleTypeSelected = (typeId: string, typeName: string) => {
    if (!pickerTargetRef) return;
    upd(pickerTargetRef, {
      catalog_ref: typeId,
      parameter_source: 'CATALOG',
      name: typeName,
    });
    setPickerOpen(false);
    setPickerTargetRef(null);
  };

  const hasTapChanger = (t: Transformer) => t.tap_min != null || t.tap_max != null || t.tap_position != null || t.tap_step_percent != null;

  return (
    <div>
      <HelpText>Dodaj transformatory SN/nN. Wybierz typ z katalogu — dane znamionowe zostaną wypełnione automatycznie.</HelpText>
      <div className="space-y-3">
        {enm.transformers.map((t) => (
          <div key={t.ref_id} className="wizard-card">
            <div className="wizard-card-header">
              <span className="text-sm font-semibold text-ind-800">{t.name}</span>
              <div className="flex items-center gap-1">
                {t.catalog_ref ? (
                  <span className="ind-badge ind-badge-ok text-[10px]">Katalog</span>
                ) : (
                  <span className="ind-badge ind-badge-warn text-[10px]">Brak typu</span>
                )}
                <RemoveButton onClick={() => rm(t.ref_id)} />
              </div>
            </div>

            {/* Typ z katalogu */}
            <FieldRow label="Typ z katalogu">
              <div className="flex items-center gap-2">
                <span className="text-sm text-chrome-600 flex-1 truncate">
                  {t.catalog_ref ? t.name : 'Nie wybrano'}
                </span>
                <button
                  onClick={() => { setPickerTargetRef(t.ref_id); setPickerOpen(true); }}
                  className="ind-btn text-ind-600 bg-ind-50 hover:bg-ind-100 border border-ind-200 text-[11px] whitespace-nowrap"
                >
                  {t.catalog_ref ? 'Zmień typ' : 'Wybierz z katalogu'}
                </button>
                {t.catalog_ref && (
                  <button
                    onClick={() => upd(t.ref_id, { catalog_ref: null, parameter_source: null })}
                    className="ind-btn text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 text-[11px]"
                  >
                    Wyczyść
                  </button>
                )}
              </div>
            </FieldRow>

            <FieldRow label="Szyna GN"><Select value={t.hv_bus_ref} onChange={(v) => upd(t.ref_id, { hv_bus_ref: v })}>{refs.map((r) => <option key={r} value={r}>{r}</option>)}</Select></FieldRow>
            <FieldRow label="Szyna DN"><Select value={t.lv_bus_ref} onChange={(v) => upd(t.ref_id, { lv_bus_ref: v })}>{refs.map((r) => <option key={r} value={r}>{r}</option>)}</Select></FieldRow>

            {/* Grupa polaczen */}
            <FieldRow label="Grupa połączeń">
              <Select value={t.vector_group ?? ''} onChange={(v) => upd(t.ref_id, { vector_group: v || null })}>
                <option value="">Nie określono</option>
                {VECTOR_GROUPS.map((vg) => <option key={vg} value={vg}>{vg}</option>)}
              </Select>
            </FieldRow>

            {/* Dane znamionowe — read-only gdy z katalogu */}
            <div className={t.catalog_ref ? 'opacity-60 pointer-events-none' : ''}>
              {t.catalog_ref && (
                <div className="text-[10px] text-ind-500 mb-1 mt-2 font-medium">Dane znamionowe z katalogu (tylko odczyt)</div>
              )}
              <FieldRow label="Sn" unit="MVA"><Input type="number" value={t.sn_mva} onChange={(v) => upd(t.ref_id, { sn_mva: Number(v) || 0 })} /></FieldRow>
              <FieldRow label="UGN" unit="kV"><Input type="number" value={t.uhv_kv} onChange={(v) => upd(t.ref_id, { uhv_kv: Number(v) || 0 })} /></FieldRow>
              <FieldRow label="UDN" unit="kV"><Input type="number" value={t.ulv_kv} onChange={(v) => upd(t.ref_id, { ulv_kv: Number(v) || 0 })} /></FieldRow>
              <FieldRow label="uk" unit="%"><Input type="number" value={t.uk_percent} onChange={(v) => upd(t.ref_id, { uk_percent: Number(v) || 0 })} /></FieldRow>
              <FieldRow label="Pk" unit="kW"><Input type="number" value={t.pk_kw} onChange={(v) => upd(t.ref_id, { pk_kw: Number(v) || 0 })} /></FieldRow>
              <FieldRow label="P0 (straty jałowe)" unit="kW"><Input type="number" value={t.p0_kw ?? ''} onChange={(v) => upd(t.ref_id, { p0_kw: v ? Number(v) : null })} placeholder="opcjonalne" /></FieldRow>
              <FieldRow label="I0 (prąd jałowy)" unit="%"><Input type="number" value={t.i0_percent ?? ''} onChange={(v) => upd(t.ref_id, { i0_percent: v ? Number(v) : null })} placeholder="opcjonalne" /></FieldRow>
            </div>

            {/* Przełącznik zaczepów */}
            <button onClick={() => setExpandedTap((s) => ({ ...s, [t.ref_id]: !s[t.ref_id] }))} className="text-[11px] text-ind-600 hover:underline mt-2">
              {expandedTap[t.ref_id] ? '\u25BE' : '\u25B8'} Przełącznik zaczepów
              {hasTapChanger(t) && <span className="ind-badge ind-badge-ok text-[10px] ml-2">Skonfigurowany</span>}
            </button>
            {expandedTap[t.ref_id] && (
              <div className="mt-1">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={hasTapChanger(t)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        upd(t.ref_id, { tap_position: 0, tap_min: -5, tap_max: 5, tap_step_percent: 2.5 });
                      } else {
                        upd(t.ref_id, { tap_position: null, tap_min: null, tap_max: null, tap_step_percent: null });
                      }
                    }}
                    className="rounded border-chrome-300"
                  />
                  <span className="text-xs text-chrome-600">Posiada podobciążeniowy przełącznik zaczepów</span>
                </div>
                {hasTapChanger(t) && (
                  <>
                    <FieldRow label="Aktualna pozycja"><Input type="number" value={t.tap_position ?? 0} onChange={(v) => upd(t.ref_id, { tap_position: v !== '' ? Number(v) : null })} /></FieldRow>
                    <FieldRow label="Zakres min"><Input type="number" value={t.tap_min ?? -5} onChange={(v) => upd(t.ref_id, { tap_min: v !== '' ? Number(v) : null })} /></FieldRow>
                    <FieldRow label="Zakres max"><Input type="number" value={t.tap_max ?? 5} onChange={(v) => upd(t.ref_id, { tap_max: v !== '' ? Number(v) : null })} /></FieldRow>
                    <FieldRow label="Krok zaczepów" unit="%"><Input type="number" value={t.tap_step_percent ?? 2.5} onChange={(v) => upd(t.ref_id, { tap_step_percent: v !== '' ? Number(v) : null })} /></FieldRow>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <AddButton onClick={add} label="Dodaj transformator" />

      {/* TypePicker modal */}
      <TypePicker
        category={'TRANSFORMER' as TypeCategory}
        currentTypeId={enm.transformers.find((t) => t.ref_id === pickerTargetRef)?.catalog_ref ?? null}
        onSelectType={handleTypeSelected}
        onClose={() => { setPickerOpen(false); setPickerTargetRef(null); }}
        isOpen={pickerOpen}
      />
    </div>
  );
}

function StepK6({ enm, onChange }: StepProps) {
  const refs = enm.buses.map((b) => b.ref_id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargetRef, setPickerTargetRef] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<'load' | 'generator'>('load');
  const [expandedLimits, setExpandedLimits] = useState<Record<string, boolean>>({});

  // --- cos phi helper (UI convenience, not physics) ---
  const computeCosPhi = (p: number, q: number): number => {
    if (p === 0 && q === 0) return 1;
    return Math.cos(Math.atan2(q, p));
  };
  const qFromCosPhi = (p: number, cosPhi: number): number => {
    if (cosPhi <= 0 || cosPhi > 1) return 0;
    return p * Math.tan(Math.acos(cosPhi));
  };

  // --- Loads ---
  const addLoad = () => {
    const n = enm.loads.length + 1;
    onChange({ ...enm, loads: [...enm.loads, { id: crypto.randomUUID(), ref_id: `load_${n}`, name: `Odbiór ${n}`, tags: [], meta: {}, bus_ref: refs[refs.length - 1] ?? '', p_mw: 1, q_mvar: 0.3, model: 'pq' as const }] });
  };
  const updLoad = (ref: string, p: Partial<Load>) => onChange({ ...enm, loads: enm.loads.map((l) => l.ref_id === ref ? { ...l, ...p } : l) });
  const rmLoad = (ref: string) => onChange({ ...enm, loads: enm.loads.filter((l) => l.ref_id !== ref) });

  // --- Zrodla przeksztaltnikowe i synchroniczne ---
  const addGen = (genType: Generator['gen_type']) => {
    const n = enm.generators.length + 1;
    const labels: Record<string, string> = {
      pv_inverter: 'PV',
      wind_inverter: 'FW legacy',
      fw_pmsg: 'FW PMSG',
      fw_dfig: 'FW DFIG',
      fw_scig: 'FW SCIG',
      bess: 'BESS',
      synchronous: 'Generator synchroniczny',
    };
    const label = labels[genType ?? ''] ?? 'Generator';
    const gen: Generator = { id: crypto.randomUUID(), ref_id: `gen_${Date.now()}`, name: `${label} ${n}`, tags: [], meta: {}, bus_ref: refs[refs.length - 1] ?? '', p_mw: 0.5, q_mvar: 0, gen_type: genType ?? 'pv_inverter', connection_variant: genType === 'synchronous' ? null : 'nn_side' };
    onChange({ ...enm, generators: [...enm.generators, gen] });
  };
  const updGen = (ref: string, p: Partial<Generator>) => onChange({ ...enm, generators: enm.generators.map((g) => g.ref_id === ref ? { ...g, ...p } : g) });
  const rmGen = (ref: string) => onChange({ ...enm, generators: enm.generators.filter((g) => g.ref_id !== ref) });

  const getGeneratorCatalogCategory = (generator: Generator | undefined): TypeCategory | null => {
    switch (generator?.gen_type) {
      case 'bess':
        return 'BESS_INVERTER';
      case 'wind_inverter':
      case 'fw_pmsg':
      case 'fw_dfig':
      case 'fw_scig':
        return 'CONVERTER';
      case 'synchronous':
        return null;
      case undefined:
      case 'pv_inverter':
      default:
        return 'PV_INVERTER';
    }
  };

  const handleTypeSelected = (typeId: string, typeName: string) => {
    if (!pickerTargetRef) return;
    if (pickerTarget === 'load') {
      updLoad(pickerTargetRef, { catalog_ref: typeId, parameter_source: 'CATALOG', name: typeName });
    } else {
      updGen(pickerTargetRef, { catalog_ref: typeId, parameter_source: 'CATALOG', name: typeName });
    }
    setPickerOpen(false);
    setPickerTargetRef(null);
  };

  const GEN_TYPES: { value: NonNullable<Generator['gen_type']>; label: string }[] = [
    { value: 'pv_inverter', label: 'Zrodlo przeksztaltnikowe PV' },
    { value: 'fw_pmsg', label: 'Farma wiatrowa PMSG' },
    { value: 'fw_dfig', label: 'Farma wiatrowa DFIG' },
    { value: 'fw_scig', label: 'Farma wiatrowa SCIG' },
    { value: 'bess', label: 'Zrodlo przeksztaltnikowe BESS' },
    { value: 'synchronous', label: 'Generator synchroniczny' },
  ];

  const selectedGenerator = pickerTarget === 'generator'
    ? enm.generators.find((g) => g.ref_id === pickerTargetRef)
    : undefined;
  const pickerCategory: TypeCategory | null = pickerTarget === 'generator'
    ? getGeneratorCatalogCategory(selectedGenerator)
    : 'LOAD';

  return (
    <div>
      <SectionTitle>Odbiory</SectionTitle>
      <HelpText>Dodaj odbiorniki mocy. Opcjonalnie wybierz typ z katalogu — parametry mocy zostaną wypełnione automatycznie.</HelpText>
      <div className="space-y-3">
        {enm.loads.map((ld) => (
          <div key={ld.ref_id} className="wizard-card">
            <div className="wizard-card-header">
              <span className="text-sm font-semibold text-ind-800">{ld.name}</span>
              <RemoveButton onClick={() => rmLoad(ld.ref_id)} />
            </div>
            <FieldRow label="Typ z katalogu">
              <div className="flex items-center gap-2">
                <span className="text-sm text-chrome-600 flex-1 truncate">{ld.catalog_ref ? ld.name : 'Nie wybrano'}</span>
                <button onClick={() => { setPickerTargetRef(ld.ref_id); setPickerTarget('load'); setPickerOpen(true); }} className="ind-btn text-ind-600 bg-ind-50 hover:bg-ind-100 border border-ind-200 text-[11px] whitespace-nowrap">{ld.catalog_ref ? 'Zmień typ' : 'Wybierz z katalogu'}</button>
              </div>
            </FieldRow>
            <FieldRow label="Nazwa"><Input value={ld.name} onChange={(v) => updLoad(ld.ref_id, { name: v })} /></FieldRow>
            <FieldRow label="Szyna"><Select value={ld.bus_ref} onChange={(v) => updLoad(ld.ref_id, { bus_ref: v })}>{refs.map((r) => <option key={r} value={r}>{r}</option>)}</Select></FieldRow>
            <FieldRow label="P" unit="MW"><Input type="number" value={ld.p_mw} onChange={(v) => updLoad(ld.ref_id, { p_mw: Number(v) || 0 })} /></FieldRow>
            <FieldRow label="Q" unit="Mvar"><Input type="number" value={ld.q_mvar} onChange={(v) => updLoad(ld.ref_id, { q_mvar: Number(v) || 0 })} /></FieldRow>
            <FieldRow label="cos phi">
              <div className="flex items-center gap-2">
                <Input type="number" value={Number(computeCosPhi(ld.p_mw, ld.q_mvar).toFixed(4))} onChange={(v) => {
                  const cp = Number(v);
                  if (cp > 0 && cp <= 1) {
                    updLoad(ld.ref_id, { q_mvar: Number(qFromCosPhi(ld.p_mw, cp).toFixed(4)) });
                  }
                }} />
                <span className="text-[10px] text-chrome-400 whitespace-nowrap">Zmiana przelicza Q</span>
              </div>
            </FieldRow>
            <FieldRow label="Liczba identycznych">
              <Input type="number" value={ld.quantity ?? 1} onChange={(v) => updLoad(ld.ref_id, { quantity: Number(v) >= 1 ? Math.round(Number(v)) : 1 })} placeholder="1" />
            </FieldRow>
            <FieldRow label="Model">
              <Select value={ld.model} onChange={(v) => updLoad(ld.ref_id, { model: v as 'pq' | 'zip' })}>
                <option value="pq">Stała moc (PQ)</option>
                <option value="zip">Model ZIP</option>
              </Select>
            </FieldRow>
          </div>
        ))}
      </div>
      <AddButton onClick={addLoad} label="Dodaj odbiór" />

      <SectionTitle>Zrodla przeksztaltnikowe i synchroniczne</SectionTitle>
      <HelpText>Dodaj zrodla PV, FW, BESS i generatory synchroniczne. Dla kazdego zrodla okresl wariant przylaczenia do sieci SN.</HelpText>
      <div className="space-y-3">
        {enm.generators.map((g) => (
          <div key={g.ref_id} className="wizard-card">
            <div className="wizard-card-header">
              <span className="text-sm font-semibold text-ind-800">{g.name}</span>
              <div className="flex items-center gap-1">
                {g.gen_type && <span className="ind-badge ind-badge-info text-[10px]">{formatGeneratorTypeShortLabelPl(g.gen_type)}</span>}
                <RemoveButton onClick={() => rmGen(g.ref_id)} />
              </div>
            </div>
            <FieldRow label="Typ z katalogu">
              <div className="flex items-center gap-2">
                <span className="text-sm text-chrome-600 flex-1 truncate">{g.catalog_ref ? g.name : 'Nie wybrano'}</span>
                <button
                  onClick={() => {
                    if (!getGeneratorCatalogCategory(g)) {
                      return;
                    }
                    setPickerTargetRef(g.ref_id);
                    setPickerTarget('generator');
                    setPickerOpen(true);
                  }}
                  disabled={!getGeneratorCatalogCategory(g)}
                  className="ind-btn text-ind-600 bg-ind-50 hover:bg-ind-100 border border-ind-200 text-[11px] whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {g.catalog_ref ? 'Zmień typ' : 'Wybierz z katalogu'}
                </button>
                {g.catalog_ref && (
                  <button
                    onClick={() => updGen(g.ref_id, { catalog_ref: null, parameter_source: null })}
                    className="ind-btn text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 text-[11px]"
                  >
                    Wyczyść
                  </button>
                )}
              </div>
            </FieldRow>
            <FieldRow label="Nazwa"><Input value={g.name} onChange={(v) => updGen(g.ref_id, { name: v })} /></FieldRow>
            <FieldRow label="Typ">
              <Select value={g.gen_type ?? 'pv_inverter'} onChange={(v) => updGen(g.ref_id, { gen_type: v as Generator['gen_type'] })}>
                {GEN_TYPES.map((gt) => <option key={gt.value} value={gt.value}>{gt.label}</option>)}
              </Select>
            </FieldRow>
            <FieldRow label="Szyna"><Select value={g.bus_ref} onChange={(v) => updGen(g.ref_id, { bus_ref: v })}>{refs.map((r) => <option key={r} value={r}>{r}</option>)}</Select></FieldRow>
            <FieldRow label="P" unit="MW"><Input type="number" value={g.p_mw} onChange={(v) => updGen(g.ref_id, { p_mw: Number(v) || 0 })} /></FieldRow>
            <FieldRow label="Q" unit="Mvar"><Input type="number" value={g.q_mvar ?? 0} onChange={(v) => updGen(g.ref_id, { q_mvar: Number(v) || 0 })} /></FieldRow>
            {g.gen_type !== 'synchronous' && (
              <FieldRow label="Wariant przyłączenia">
                <Select value={g.connection_variant ?? ''} onChange={(v) => updGen(g.ref_id, { connection_variant: (v || null) as Generator['connection_variant'] })}>
                  <option value="">Nie określono</option>
                  <option value="nn_side">Po stronie nN (przez trafo stacji)</option>
                  <option value="block_transformer">Transformator blokowy do SN</option>
                </Select>
              </FieldRow>
            )}
            {g.gen_type !== 'synchronous' && (
              <FieldRow label="Liczba równoległych"><Input type="number" value={g.n_parallel ?? 1} onChange={(v) => updGen(g.ref_id, { n_parallel: Number(v) || 1 })} /></FieldRow>
            )}

            {/* Limity mocy — collapsible */}
            <button onClick={() => setExpandedLimits((s) => ({ ...s, [g.ref_id]: !s[g.ref_id] }))} className="text-[11px] text-ind-600 hover:underline mt-2">
              {expandedLimits[g.ref_id] ? '\u25BE' : '\u25B8'} Limity mocy (P, Q)
              {g.limits && (g.limits.p_min_mw != null || g.limits.p_max_mw != null || g.limits.q_min_mvar != null || g.limits.q_max_mvar != null) && (
                <span className="ind-badge ind-badge-ok text-[10px] ml-2">Skonfigurowane</span>
              )}
            </button>
            {expandedLimits[g.ref_id] && (
              <div className="mt-1">
                <FieldRow label="P_min" unit="MW"><Input type="number" value={g.limits?.p_min_mw ?? ''} onChange={(v) => updGen(g.ref_id, { limits: { ...g.limits, p_min_mw: v !== '' ? Number(v) : null } })} placeholder="opcjonalne" /></FieldRow>
                <FieldRow label="P_max" unit="MW"><Input type="number" value={g.limits?.p_max_mw ?? ''} onChange={(v) => updGen(g.ref_id, { limits: { ...g.limits, p_max_mw: v !== '' ? Number(v) : null } })} placeholder="opcjonalne" /></FieldRow>
                <FieldRow label="Q_min" unit="Mvar"><Input type="number" value={g.limits?.q_min_mvar ?? ''} onChange={(v) => updGen(g.ref_id, { limits: { ...g.limits, q_min_mvar: v !== '' ? Number(v) : null } })} placeholder="opcjonalne" /></FieldRow>
                <FieldRow label="Q_max" unit="Mvar"><Input type="number" value={g.limits?.q_max_mvar ?? ''} onChange={(v) => updGen(g.ref_id, { limits: { ...g.limits, q_max_mvar: v !== '' ? Number(v) : null } })} placeholder="opcjonalne" /></FieldRow>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3 flex-wrap">
        {GEN_TYPES.map((gt) => (
          <AddButton key={gt.value} onClick={() => addGen(gt.value)} label={`Dodaj ${gt.label}`} />
        ))}
      </div>

      {/* TypePicker modal */}
      {pickerCategory ? (
        <TypePicker
          category={pickerCategory}
          currentTypeId={
            pickerTarget === 'generator'
              ? (selectedGenerator?.catalog_ref ?? null)
              : (enm.loads.find((l) => l.ref_id === pickerTargetRef)?.catalog_ref ?? null)
          }
          onSelectType={handleTypeSelected}
          onClose={() => { setPickerOpen(false); setPickerTargetRef(null); }}
          isOpen={pickerOpen}
        />
      ) : null}
    </div>
  );
}

function StepK7({ enm, onChange }: StepProps) {
  const noZ0 = enm.branches.filter((b): b is OverheadLine | Cable => (b.type === 'line_overhead' || b.type === 'cable') && b.r0_ohm_per_km == null && b.x0_ohm_per_km == null);
  const srcNoZ0 = enm.sources.filter((s) => s.r0_ohm == null && s.x0_ohm == null && s.z0_z1_ratio == null);
  const [expandedGrounding, setExpandedGrounding] = useState<Record<string, boolean>>({});

  const GROUNDING_TYPES: { value: NonNullable<GroundingConfig['type']>; label: string }[] = [
    { value: 'isolated', label: 'Izolowany' },
    { value: 'petersen_coil', label: 'Cewka Petersena' },
    { value: 'directly_grounded', label: 'Bezpośrednio uziemiony' },
    { value: 'resistor_grounded', label: 'Uziemiony przez rezystor' },
  ];

  const sourceBus = enm.buses.find((b) => b.tags.includes('source'));

  const updBusGrounding = (busRef: string, grounding: GroundingConfig | null) => {
    onChange({ ...enm, buses: enm.buses.map((b) => b.ref_id === busRef ? { ...b, grounding } : b) });
  };

  // Compute Z0 status label for summary table
  const getZ0Status = (elementType: string, element: OverheadLine | Cable | Source): string => {
    if (elementType === 'branch') {
      const br = element as OverheadLine | Cable;
      return (br.r0_ohm_per_km != null || br.x0_ohm_per_km != null) ? 'Kompletne' : 'Brak';
    }
    const src = element as Source;
    return (src.r0_ohm != null || src.x0_ohm != null || src.z0_z1_ratio != null) ? 'Kompletne' : 'Brak';
  };

  return (
    <div>
      <HelpText>Przegląd kompletności składowej zerowej (Z0) i konfiguracji uziemienia. Elementy bez Z0 ograniczają analizy zwarć doziemnych.</HelpText>

      {/* Grounding configuration for source bus */}
      <SectionTitle>Konfiguracja uziemienia punktu neutralnego</SectionTitle>
      <HelpText>Typ uziemienia punktu gwiazdowego sieci SN wpływa na prądy zwarć doziemnych.</HelpText>

      {sourceBus && (
        <div className="wizard-card mb-3">
          <div className="wizard-card-header">
            <span className="text-sm font-semibold text-ind-800">{sourceBus.name}</span>
            <span className="ind-badge ind-badge-ok text-[10px]">Szyna źródłowa</span>
          </div>
          <FieldRow label="Typ uziemienia">
            <Select value={sourceBus.grounding?.type ?? 'isolated'} onChange={(v) => {
              const gType = v as GroundingConfig['type'];
              const prev = sourceBus.grounding;
              updBusGrounding(sourceBus.ref_id, { type: gType, r_ohm: prev?.r_ohm ?? null, x_ohm: prev?.x_ohm ?? null });
            }}>
              {GROUNDING_TYPES.map((gt) => <option key={gt.value} value={gt.value}>{gt.label}</option>)}
            </Select>
          </FieldRow>
          {(sourceBus.grounding?.type === 'resistor_grounded' || sourceBus.grounding?.type === 'petersen_coil') && (
            <>
              <FieldRow label="R" unit="&Omega;">
                <Input type="number" value={sourceBus.grounding?.r_ohm ?? ''} onChange={(v) => updBusGrounding(sourceBus.ref_id, { ...sourceBus.grounding!, r_ohm: v !== '' ? Number(v) : null })} placeholder="opcjonalne" />
              </FieldRow>
              <FieldRow label="X" unit="&Omega;">
                <Input type="number" value={sourceBus.grounding?.x_ohm ?? ''} onChange={(v) => updBusGrounding(sourceBus.ref_id, { ...sourceBus.grounding!, x_ohm: v !== '' ? Number(v) : null })} placeholder="opcjonalne" />
              </FieldRow>
            </>
          )}
        </div>
      )}

      {/* Other buses grounding — collapsible */}
      {enm.buses.filter((b) => !b.tags.includes('source')).length > 0 && (
        <>
          <button onClick={() => setExpandedGrounding((s) => ({ ...s, __other_buses: !s.__other_buses }))} className="text-[11px] text-ind-600 hover:underline mt-2 mb-2">
            {expandedGrounding.__other_buses ? '\u25BE' : '\u25B8'} Uziemienie pozostałych szyn ({enm.buses.filter((b) => !b.tags.includes('source')).length})
          </button>
          {expandedGrounding.__other_buses && (
            <div className="space-y-2 mb-3">
              {enm.buses.filter((b) => !b.tags.includes('source')).map((bus) => (
                <div key={bus.ref_id} className="wizard-card">
                  <div className="wizard-card-header">
                    <span className="text-sm font-semibold text-ind-800">{bus.name}</span>
                    <span className="text-xs text-chrome-400">{bus.voltage_kv} kV</span>
                  </div>
                  <FieldRow label="Typ uziemienia">
                    <Select value={bus.grounding?.type ?? 'isolated'} onChange={(v) => {
                      const gType = v as GroundingConfig['type'];
                      const prev = bus.grounding;
                      updBusGrounding(bus.ref_id, { type: gType, r_ohm: prev?.r_ohm ?? null, x_ohm: prev?.x_ohm ?? null });
                    }}>
                      {GROUNDING_TYPES.map((gt) => <option key={gt.value} value={gt.value}>{gt.label}</option>)}
                    </Select>
                  </FieldRow>
                  {(bus.grounding?.type === 'resistor_grounded' || bus.grounding?.type === 'petersen_coil') && (
                    <>
                      <FieldRow label="R" unit="&Omega;"><Input type="number" value={bus.grounding?.r_ohm ?? ''} onChange={(v) => updBusGrounding(bus.ref_id, { ...bus.grounding!, r_ohm: v !== '' ? Number(v) : null })} placeholder="opcjonalne" /></FieldRow>
                      <FieldRow label="X" unit="&Omega;"><Input type="number" value={bus.grounding?.x_ohm ?? ''} onChange={(v) => updBusGrounding(bus.ref_id, { ...bus.grounding!, x_ohm: v !== '' ? Number(v) : null })} placeholder="opcjonalne" /></FieldRow>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Z0 status warnings */}
      <SectionTitle>Status składowej zerowej (Z0)</SectionTitle>
      {noZ0.length > 0 && (
        <div className="mb-3 p-3 bg-status-warn-light border border-amber-200 rounded-md text-sm">
          <span className="font-semibold text-amber-800">Gałęzie bez Z0:</span>{' '}
          <span className="text-amber-700">{noZ0.map((l) => l.ref_id).join(', ')}</span>
        </div>
      )}
      {srcNoZ0.length > 0 && (
        <div className="mb-3 p-3 bg-status-warn-light border border-amber-200 rounded-md text-sm">
          <span className="font-semibold text-amber-800">Źródła bez Z0:</span>{' '}
          <span className="text-amber-700">{srcNoZ0.map((s) => s.ref_id).join(', ')}</span>
        </div>
      )}
      {noZ0.length === 0 && srcNoZ0.length === 0 && (
        <div className="mb-3 p-3 bg-status-ok-light border border-emerald-200 rounded-md text-sm text-emerald-800 font-medium">
          Wszystkie elementy mają kompletne składowe zerowe.
        </div>
      )}

      {/* Summary table */}
      <SectionTitle>Podsumowanie — uziemienie i Z0</SectionTitle>
      <div className="overflow-hidden rounded-md border border-chrome-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-chrome-50 border-b border-chrome-200">
              <th className="text-left px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Element</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Z0 Status</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Typ uziemienia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-chrome-100">
            {/* Buses */}
            {enm.buses.map((bus) => (
              <tr key={bus.ref_id} className="hover:bg-chrome-50">
                <td className="px-3 py-2 font-mono text-xs text-chrome-600">{bus.name}</td>
                <td className="px-3 py-2 text-xs text-chrome-400">—</td>
                <td className="px-3 py-2">
                  <span className={clsx('ind-badge text-[10px]', bus.grounding ? 'ind-badge-ok' : 'ind-badge-warn')}>
                    {bus.grounding ? GROUNDING_TYPES.find((gt) => gt.value === bus.grounding!.type)?.label ?? bus.grounding.type : 'Izolowany'}
                  </span>
                </td>
              </tr>
            ))}
            {/* Branches */}
            {enm.branches.filter((b): b is OverheadLine | Cable => b.type === 'line_overhead' || b.type === 'cable').map((br) => (
              <tr key={br.ref_id} className="hover:bg-chrome-50">
                <td className="px-3 py-2 font-mono text-xs text-chrome-600">{br.name}</td>
                <td className="px-3 py-2">
                  <span className={clsx('ind-badge text-[10px]', getZ0Status('branch', br) === 'Kompletne' ? 'ind-badge-ok' : 'ind-badge-warn')}>
                    {getZ0Status('branch', br)}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-chrome-400">—</td>
              </tr>
            ))}
            {/* Sources */}
            {enm.sources.map((src) => (
              <tr key={src.ref_id} className="hover:bg-chrome-50">
                <td className="px-3 py-2 font-mono text-xs text-chrome-600">{src.name}</td>
                <td className="px-3 py-2">
                  <span className={clsx('ind-badge text-[10px]', getZ0Status('source', src as unknown as Source) === 'Kompletne' ? 'ind-badge-ok' : 'ind-badge-warn')}>
                    {getZ0Status('source', src as unknown as Source)}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-chrome-400">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StepK8({ validation, onGoToStep }: { validation: ValidationResult | null; onGoToStep: (s: number) => void }) {
  if (!validation) return <div className="text-sm text-chrome-400">Ładowanie walidacji...</div>;
  return (
    <div>
      {/* Dostępność analiz */}
      <div className="mb-4 flex gap-3 flex-wrap">
        {(['short_circuit_3f', 'short_circuit_1f', 'load_flow'] as const).map((k) => {
          const labels: Record<string, string> = { short_circuit_3f: 'Zwarcie 3F', short_circuit_1f: 'Zwarcie 1F', load_flow: 'Rozpływ mocy' };
          const ok = validation.analysis_available[k];
          return (
            <div key={k} className={clsx('px-3 py-2 rounded-md text-sm font-medium', ok ? 'bg-status-ok-light text-emerald-800' : 'bg-status-error-light text-red-800')}>
              {labels[k]}: {ok ? 'dostępne' : 'niedostępne'}
            </div>
          );
        })}
      </div>

      {validation.issues.length === 0 && (
        <div className="p-4 bg-status-ok-light border border-emerald-200 rounded-md text-sm font-semibold text-emerald-800">
          Model sieci jest kompletny i gotowy do obliczeń.
        </div>
      )}

      {validation.issues.length > 0 && (
        <div className="overflow-hidden rounded-md border border-chrome-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-chrome-50 border-b border-chrome-200">
                <th className="text-left px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Kod</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Priorytet</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Opis</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Akcja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-chrome-100">
              {validation.issues.map((i, idx) => (
                <tr key={idx} className="hover:bg-chrome-50">
                  <td className="px-3 py-2 font-mono text-xs text-chrome-600">{i.code}</td>
                  <td className="px-3 py-2">
                    <span className={clsx('ind-badge', i.severity === 'BLOCKER' ? 'ind-badge-error' : i.severity === 'WARNING' ? 'ind-badge-warn' : 'ind-badge-info')}>
                      {i.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-chrome-700">{i.message_pl}</td>
                  <td className="px-3 py-2">
                    {(() => {
                      const step = getWizardStepByIssue(i);
                      if (!step) {
                        return null;
                      }
                      return (
                        <button onClick={() => onGoToStep(step.number - 1)} className="ind-btn text-ind-600 bg-ind-50 hover:bg-ind-100 border border-ind-200 text-[11px]">
                          {getWizardStepLabelByIssue(i)}
                        </button>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StepK9({ enm }: { enm: EnergyNetworkModel }) {
  return (
    <div>
      <HelpText>Podglad schematu jednokreskowego (SLD) renderowanego przez ten sam kanoniczny pipeline co aktywny widok produktu.</HelpText>
      <div className="mt-3 flex gap-3 text-xs text-chrome-400">
        <span>{enm.buses.length} szyn</span>
        <span className="text-chrome-200">|</span>
        <span>{enm.branches.length + enm.transformers.length} gałęzi</span>
        <span className="text-chrome-200">|</span>
        <span>{enm.sources.length} źródeł</span>
        <span className="text-chrome-200">|</span>
        <span>{enm.loads.length} odbiorów</span>
      </div>
      <div className="mt-2 text-xs text-chrome-300">
        Pełny edytor SLD dostępny w widoku <a href="#sld" className="text-ind-500 hover:text-ind-700 underline">Schemat</a>
      </div>
    </div>
  );
}

function StepK10({ validation, wizardState, runResult, isRunning, onRun, onRunPF, pfResult, isPFRunning }: {
  validation: ValidationResult | null; wizardState: WizardState | null;
  runResult: Record<string, unknown> | null; isRunning: boolean; onRun: () => void;
  pfResult: Record<string, unknown> | null; isPFRunning: boolean; onRunPF: () => void;
}) {
  const canRun = validation?.status !== 'FAIL';
  const scResults = (runResult as { results?: Array<Record<string, unknown>> })?.results ?? [];
  const pfBuses = (pfResult as { bus_results?: Array<Record<string, unknown>> })?.bus_results ?? [];
  const pfBranches = (pfResult as { branch_results?: Array<Record<string, unknown>> })?.branch_results ?? [];
  const rm = wizardState?.readinessMatrix;

  const analysisItems = [
    { key: 'sc3f', label: 'Zwarcie 3F', ready: rm?.shortCircuit3F },
    { key: 'sc1f', label: 'Zwarcie 1F', ready: rm?.shortCircuit1F },
    { key: 'lf', label: 'Rozpływ mocy', ready: rm?.loadFlow },
  ];

  return (
    <div>
      {/* Macierz gotowości */}
      <SectionTitle>Macierz gotowości analiz</SectionTitle>
      <div className="mb-4 flex gap-3 flex-wrap">
        {analysisItems.map(({ key, label, ready }) => {
          const ok = ready?.available ?? false;
          return (
            <div key={key} data-testid={`readiness-${key}`} className={clsx('p-3 rounded-md min-w-[180px]', ok ? 'bg-status-ok-light border border-emerald-200' : 'bg-status-error-light border border-red-200')}>
              <div className="text-sm font-medium mb-1">{label}: {ok ? <span className="text-emerald-700">dostępne</span> : <span className="text-red-700">niedostępne</span>}</div>
              {!ok && ready && ready.missingRequirements.length > 0 && (
                <ul className="ml-4 text-[11px] text-chrome-500 list-disc">
                  {ready.missingRequirements.map((req, i) => <li key={i}>{req}</li>)}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Statystyki elementów */}
      {wizardState && (
        <div className="mb-4 p-3 bg-chrome-50 rounded-md flex gap-4 flex-wrap text-xs text-chrome-500">
          <span>Szyny: <span className="font-semibold text-chrome-700">{wizardState.elementCounts.buses}</span></span>
          <span>Źródła: <span className="font-semibold text-chrome-700">{wizardState.elementCounts.sources}</span></span>
          <span>Transformatory: <span className="font-semibold text-chrome-700">{wizardState.elementCounts.transformers}</span></span>
          <span>Gałęzie: <span className="font-semibold text-chrome-700">{wizardState.elementCounts.branches}</span></span>
          <span>Odbiory: <span className="font-semibold text-chrome-700">{wizardState.elementCounts.loads}</span></span>
          <span>Generatory: <span className="font-semibold text-chrome-700">{wizardState.elementCounts.generators}</span></span>
        </div>
      )}

      {!canRun && (
        <div className="mb-4 p-3 bg-status-error-light border border-red-200 rounded-md text-sm text-red-800">
          Model sieci zawiera blokery — obliczenia zablokowane. Wróć do K8.
        </div>
      )}

      {/* Run buttons */}
      <div className="flex gap-3 flex-wrap">
        <button data-testid="run-sc-btn" onClick={onRun} disabled={!canRun || isRunning} className="ind-btn-calculate text-sm px-6 py-2">
          {isRunning ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Obliczanie zwarć...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
              Uruchom zwarcia 3F
            </>
          )}
        </button>

        <button data-testid="run-pf-btn" onClick={onRunPF} disabled={!canRun || isPFRunning} className="ind-btn-calculate text-sm px-6 py-2">
          {isPFRunning ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Obliczanie rozpływu...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
              Uruchom rozpływ mocy
            </>
          )}
        </button>
      </div>

      {/* SC Results */}
      {scResults.length > 0 && (
        <div className="mt-4" data-testid="sc-results">
          <SectionTitle>Wyniki zwarć 3F</SectionTitle>
          <div className="overflow-hidden rounded-md border border-chrome-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-chrome-50 border-b border-chrome-200">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Węzeł</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Ik&quot; [A]</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Ip [A]</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Ith [A]</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Sk&quot; [MVA]</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-chrome-100">
                {scResults.map((r, i) => (
                  <tr key={i} className="hover:bg-chrome-50">
                    <td className="px-3 py-2 font-mono text-xs text-chrome-600">{String(r.fault_node_id ?? '').slice(0, 12)}...</td>
                    <td className="px-3 py-2 text-right font-mono">{formatPolishValue(r.ikss_a as number | null | undefined, { decimals: 1 })}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatPolishValue(r.ip_a as number | null | undefined, { decimals: 1 })}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatPolishValue(r.ith_a as number | null | undefined, { decimals: 1 })}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatPolishValue(r.sk_mva as number | null | undefined, { decimals: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PF Bus Results */}
      {pfBuses.length > 0 && (
        <div className="mt-4" data-testid="pf-bus-results">
          <SectionTitle>Rozpływ mocy — napięcia węzłowe</SectionTitle>
          <div className="overflow-hidden rounded-md border border-chrome-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-chrome-50 border-b border-chrome-200">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Szyna</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">U [kV]</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">U [p.u.]</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">P [MW]</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Q [Mvar]</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-chrome-100">
                {pfBuses.map((r, i) => (
                  <tr key={i} className="hover:bg-chrome-50">
                    <td className="px-3 py-2 font-mono text-xs text-chrome-600">{String(r.bus_id ?? r.bus_ref ?? '').slice(0, 16)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatPolishValue(r.v_kv as number | null | undefined, { decimals: 3 })}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatPolishValue(r.v_pu as number | null | undefined, { decimals: 4 })}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatPolishValue(r.p_mw as number | null | undefined, { decimals: 3 })}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatPolishValue(r.q_mvar as number | null | undefined, { decimals: 3 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PF Branch Results */}
      {pfBranches.length > 0 && (
        <div className="mt-4" data-testid="pf-branch-results">
          <SectionTitle>Rozpływ mocy — przepływy gałęziowe</SectionTitle>
          <div className="overflow-hidden rounded-md border border-chrome-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-chrome-50 border-b border-chrome-200">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Gałąź</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">P_from [MW]</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Q_from [Mvar]</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">I [A]</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-chrome-500 uppercase tracking-wider">Straty [kW]</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-chrome-100">
                {pfBranches.map((r, i) => (
                  <tr key={i} className="hover:bg-chrome-50">
                    <td className="px-3 py-2 font-mono text-xs text-chrome-600">{String(r.branch_id ?? r.branch_ref ?? '').slice(0, 16)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatPolishValue(r.p_from_mw as number | null | undefined, { decimals: 3 })}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatPolishValue(r.q_from_mvar as number | null | undefined, { decimals: 3 })}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatPolishValue((r.i_a ?? r.i_from_a) as number | null | undefined, { decimals: 1 })}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatPolishValue(r.losses_kw as number | null | undefined, { decimals: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step sidebar indicator
// ---------------------------------------------------------------------------

function StepIndicator({ step, isActive, stepState, onClick }: { step: WizardStep; isActive: boolean; stepState?: WizardState['steps'][number]; onClick: () => void }) {
  const statusColor = stepState ? getStepStatusColor(stepState.status) : '#6b7280';
  const isComplete = stepState?.status === 'complete';
  const hasBlockers = stepState?.issues.some(i => i.severity === 'BLOCKER') ?? false;
  const hasWarnings = (stepState?.issues.length ?? 0) > 0 && !hasBlockers;

  return (
    <button
      onClick={onClick}
      data-testid={`wizard-step-${step.id}`}
      className={clsx(
        'flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-left transition-colors',
        isActive
          ? 'bg-ind-50 border-2 border-ind-500'
          : 'border border-chrome-200 hover:bg-chrome-50 hover:border-chrome-300',
      )}
    >
      {/* Step number circle */}
      <span
        className={clsx(
          'flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 transition-colors',
          isActive ? 'bg-ind-600 text-white' : isComplete ? 'bg-status-ok text-white' : 'bg-chrome-300 text-white',
        )}
        style={!isActive && !isComplete ? { backgroundColor: statusColor } : undefined}
      >
        {isComplete ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          step.number
        )}
      </span>

      {/* Step label + progress */}
      <div className="flex-1 min-w-0">
        <span className={clsx('text-sm truncate block', isActive ? 'font-semibold text-ind-800' : 'font-medium text-chrome-700')}>
          {step.title}
        </span>
        {stepState && stepState.completionPercent > 0 && stepState.completionPercent < 100 && (
          <div className="mt-1 h-1 bg-chrome-200 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${stepState.completionPercent}%`, backgroundColor: statusColor }} />
          </div>
        )}
      </div>

      {/* Issue count badge */}
      {hasBlockers && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-status-error text-white text-[10px] font-bold">
          {stepState?.issues.length}
        </span>
      )}
      {hasWarnings && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-status-warn text-white text-[10px] font-bold">
          {stepState?.issues.length}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Blocker banner
// ---------------------------------------------------------------------------

function BlockerBanner({ issues }: { issues: WizardIssueApi[] }) {
  const blockers = issues.filter(i => i.severity === 'BLOCKER');
  if (blockers.length === 0) return null;
  return (
    <div data-testid="wizard-blocker-banner" className="mb-4 p-3 bg-status-error-light border border-red-200 rounded-md">
      <div className="text-sm font-semibold text-red-800 mb-1.5 flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        Przejście do następnego kroku jest zablokowane:
      </div>
      <ul className="ml-6 text-xs text-red-700 list-disc space-y-0.5">
        {blockers.map((b, i) => (
          <li key={i}>
            {b.message_pl}
            {getWizardStepLabelByIssue(b) ? ` (${getWizardStepLabelByIssue(b)})` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main WizardPage
// ---------------------------------------------------------------------------

export function WizardPage() {
  const [currentStep, setCurrentStep] = useState(() => {
    const m = window.location.hash.match(/\/k(\d+)/i);
    return m ? Math.min(Math.max(Number(m[1]) - 1, 0), 9) : 0;
  });
  const [enm, setEnm] = useState<EnergyNetworkModel>(createDefaultENM);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [pfResult, setPfResult] = useState<Record<string, unknown> | null>(null);
  const [isPFRunning, setIsPFRunning] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caseId = getCaseId();

  // Wizard store (Zustand)
  const wizardStore = useWizardStore();
  const refreshSnapshot = useSnapshotStore((s) => s.refreshFromBackend);

  // Wizard state machine — deterministic
  const wizardState = useMemo<WizardState>(() => computeWizardState(enm), [enm]);

  useEffect(() => { wizardStore.recomputeFromEnm(enm); }, [enm]);
  useEffect(() => { wizardStore.setCurrentStep(currentStep); }, [currentStep]);

  // Load ENM on mount
  useEffect(() => {
    fetchENM(caseId).then((loaded) => {
      setEnm(loaded);
      wizardStore.fetchWizardState(caseId).catch(() => {});
    }).catch(() => {});
  }, [caseId]);

  useEffect(() => { validateENM(caseId).then(setValidation).catch(() => {}); }, [caseId, enm.header.revision]);

  // Autosave
  const handleChange = useCallback((newEnm: EnergyNetworkModel) => {
    setEnm(newEnm);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSaveStatus('saving');
      saveENM(caseId, newEnm).then((saved) => {
        setEnm(saved);
        setSaveStatus('saved');
        validateENM(caseId).then(setValidation).catch(() => {});
        refreshSnapshot(caseId).catch(() => {});
        window.dispatchEvent(new CustomEvent('model-updated', {
          detail: { revision: saved.header.revision, source: 'wizard' },
        }));
      }).catch(() => setSaveStatus('error'));
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [caseId, refreshSnapshot]);

  // Deep-link update
  useEffect(() => {
    const sid = WIZARD_STEPS[currentStep].id.toLowerCase();
    const base = window.location.hash.split('?')[0].split('/')[0];
    window.history.replaceState(null, '', `${base}/${sid}${window.location.search}`);
  }, [currentStep]);

  const handleRun = useCallback(async () => {
    setIsRunning(true); setRunResult(null);
    try { setRunResult(await runShortCircuit(caseId)); } catch (e) { setRunResult({ error: String(e) }); } finally { setIsRunning(false); }
  }, [caseId]);

  const handleRunPF = useCallback(async () => {
    setIsPFRunning(true); setPfResult(null);
    try { setPfResult(await runPowerFlow(caseId)); } catch (e) { setPfResult({ error: String(e) }); } finally { setIsPFRunning(false); }
  }, [caseId]);

  const handleNext = useCallback(async () => {
    if (currentStep >= 9) return;
    const nextIdx = currentStep + 1;
    const allowed = await wizardStore.checkCanProceed(caseId, currentStep, nextIdx);
    if (allowed) {
      setCurrentStep(nextIdx);
    }
  }, [currentStep, caseId, wizardStore]);

  const step = WIZARD_STEPS[currentStep];
  const overallLabel = getOverallStatusLabel(wizardState.overallStatus);
  const overallColor = wizardState.overallStatus === 'ready' ? 'bg-status-ok' : wizardState.overallStatus === 'blocked' ? 'bg-status-error' : wizardState.overallStatus === 'incomplete' ? 'bg-status-warn' : 'bg-chrome-300';
  const canGoForward = wizardStore.canProceed && currentStep < 9;

  return (
    <div data-testid="wizard-page" className="flex h-full font-sans">
      {/* Sidebar — kroków kreatora */}
      <div className="w-wizard-sidebar border-r border-chrome-200 bg-white flex flex-col overflow-hidden">
        {/* Header */}
        <div className="ind-panel-header justify-between">
          <span>Konfiguracja sieci</span>
          <div
            data-testid="wizard-gate"
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-ind text-[10px] font-semibold"
          >
            <span className={clsx('w-2 h-2 rounded-full', overallColor)} />
            <span className="text-chrome-500">{overallLabel}</span>
          </div>
        </div>

        {/* Steps list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {WIZARD_STEPS.map((s, i) => {
            const stepState = wizardState.steps.find(ws => ws.stepId === s.id);
            return <StepIndicator key={s.id} step={s} isActive={i === currentStep} stepState={stepState} onClick={() => setCurrentStep(i)} />;
          })}
        </div>

        {/* Save status */}
        {saveStatus && (
          <div className={clsx('px-3 py-2 text-[11px] border-t border-chrome-200', saveStatus === 'saved' ? 'text-status-ok' : saveStatus === 'error' ? 'text-status-error' : 'text-chrome-400')}>
            {saveStatus === 'saved' ? 'Zapisano automatycznie' : saveStatus === 'saving' ? 'Zapisywanie...' : 'Błąd zapisu'}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto bg-canvas-bg">
        <div className="max-w-2xl mx-auto px-6 py-6">
          {/* Step header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-ind-600 text-white text-sm font-bold">
                {step.number}
              </span>
              <h2 className="text-lg font-bold text-ind-900">{step.title}</h2>
            </div>
            <p className="text-sm text-chrome-400 ml-11">{step.description}</p>
          </div>

          {/* Blocker banner */}
          <BlockerBanner issues={wizardStore.transitionBlockers} />

          {/* Step content */}
          {step.id === 'K1' && <StepK1 enm={enm} onChange={handleChange} />}
          {step.id === 'K2' && <StepK2 enm={enm} onChange={handleChange} />}
          {step.id === 'K3' && <StepK3 enm={enm} onChange={handleChange} />}
          {step.id === 'K4' && <StepK4 enm={enm} onChange={handleChange} />}
          {step.id === 'K5' && <StepK5 enm={enm} onChange={handleChange} />}
          {step.id === 'K6' && <StepK6 enm={enm} onChange={handleChange} />}
          {step.id === 'K7' && <StepK7 enm={enm} onChange={handleChange} />}
          {step.id === 'K8' && <StepK8 validation={validation} onGoToStep={setCurrentStep} />}
          {step.id === 'K9' && <StepK9 enm={enm} />}
          {step.id === 'K10' && <StepK10 validation={validation} wizardState={wizardState} runResult={runResult} isRunning={isRunning} onRun={handleRun} pfResult={pfResult} isPFRunning={isPFRunning} onRunPF={handleRunPF} />}

          {/* Navigation buttons */}
          <div className="flex justify-between mt-8 pt-4 border-t border-chrome-200">
            <button
              onClick={() => setCurrentStep((p) => Math.max(0, p - 1))}
              disabled={currentStep === 0}
              className={clsx(
                'ind-btn border',
                currentStep === 0
                  ? 'text-chrome-300 bg-chrome-50 border-chrome-100 cursor-not-allowed'
                  : 'text-chrome-600 bg-white border-chrome-200 hover:bg-chrome-50'
              )}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Wstecz
            </button>
            <button
              data-testid="wizard-next-btn"
              onClick={handleNext}
              disabled={!canGoForward}
              className="ind-btn-action"
            >
              {currentStep === 9 ? 'Zakończ' : 'Dalej'}
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
