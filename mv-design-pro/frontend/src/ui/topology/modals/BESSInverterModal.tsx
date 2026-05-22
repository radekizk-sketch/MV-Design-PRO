/**
 * BESSInverterModal — modal dodawania/edycji falownika BESS w rozdzielni nN.
 *
 * BINDING: 100% PL etykiety, brak domyślnych wartości liczbowych.
 * FAZA 2 — Standard modali „Układy nN / Falowniki".
 */

import { useCallback, useEffect, useState } from 'react';
import { CatalogPicker, type CatalogEntry } from './CatalogPicker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BESSOperationMode = 'TYLKO_GENERACJA' | 'TYLKO_MAGAZYNOWANIE' | 'DWUKIERUNKOWY' | 'WYLACZONE';
export type BESSControlStrategy = 'STALA_MOC' | 'PROFIL' | 'REGULACJA_NAPIECIA' | 'REGULACJA_MOCY_BIERNEJ';
export type SourcePlacement = 'NEW_FIELD' | 'EXISTING_FIELD';
export type NNSwitchKind = 'WYLACZNIK' | 'ROZLACZNIK' | 'BEZPIECZNIK';
export type NNSwitchState = 'OTWARTY' | 'ZAMKNIETY';

export interface BESSInverterFormData {
  // Osadzenie
  placement: SourcePlacement;
  existing_field_ref: string | null;
  // Nowe pole przyłączeniowe (gdy NEW_FIELD)
  new_field_switch_kind: NNSwitchKind | null;
  new_field_switch_state: NNSwitchState | null;
  new_field_switch_catalog_ref: string | null;
  new_field_voltage_nn_kv: number | null;
  new_field_name: string | null;
  // Falownik BESS
  inverter_catalog_id: string | null;
  storage_catalog_id: string | null;
  usable_capacity_kwh: number | null;
  charge_power_kw: number | null;
  discharge_power_kw: number | null;
  operation_mode: BESSOperationMode | null;
  control_strategy: BESSControlStrategy | null;
  soc_min_percent: number | null;
  soc_max_percent: number | null;
  source_name: string | null;
  time_profile_ref: string | null;
}

interface BESSInverterModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<BESSInverterFormData>;
  fieldOptions: Array<{ ref_id: string; name: string; kind: string }>;
  inverterCatalogEntries?: CatalogEntry[];
  storageCatalogEntries?: CatalogEntry[];
  switchCatalogEntries?: CatalogEntry[];
  onSubmit: (data: BESSInverterFormData) => void;
  onCancel: () => void;
}

interface FieldError { field: string; message: string; }

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const OPERATION_MODE_LABELS: Record<BESSOperationMode, string> = {
  TYLKO_GENERACJA: 'Tylko generacja',
  TYLKO_MAGAZYNOWANIE: 'Tylko magazynowanie',
  DWUKIERUNKOWY: 'Dwukierunkowy',
  WYLACZONE: 'Wyłączone',
};

const CONTROL_STRATEGY_LABELS: Record<BESSControlStrategy, string> = {
  STALA_MOC: 'Stała moc',
  PROFIL: 'Profil',
  REGULACJA_NAPIECIA: 'Regulacja napięcia',
  REGULACJA_MOCY_BIERNEJ: 'Regulacja mocy biernej',
};

const SWITCH_KIND_LABELS: Record<NNSwitchKind, string> = {
  WYLACZNIK: 'Wyłącznik',
  ROZLACZNIK: 'Rozłącznik',
  BEZPIECZNIK: 'Bezpiecznik',
};

const SWITCH_STATE_LABELS: Record<NNSwitchState, string> = {
  OTWARTY: 'Otwarty',
  ZAMKNIETY: 'Zamknięty',
};

const PLACEMENT_LABELS: Record<SourcePlacement, string> = {
  NEW_FIELD: 'Utwórz nowe pole przyłączeniowe',
  EXISTING_FIELD: 'Użyj istniejącego pola',
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateForm(data: BESSInverterFormData): FieldError[] {
  const errors: FieldError[] = [];
  if (data.placement === 'EXISTING_FIELD' && !data.existing_field_ref) {
    errors.push({ field: 'existing_field_ref', message: 'Wybór pola jest wymagany' });
  }
  if (data.placement === 'NEW_FIELD') {
    if (!data.new_field_switch_kind) errors.push({ field: 'new_field_switch_kind', message: 'Rodzaj aparatu jest wymagany' });
    if (!data.new_field_switch_state) errors.push({ field: 'new_field_switch_state', message: 'Stan normalny aparatu jest wymagany' });
    if (data.new_field_voltage_nn_kv === null || data.new_field_voltage_nn_kv <= 0)
      errors.push({ field: 'new_field_voltage_nn_kv', message: 'Napięcie nN (kV) musi być > 0' });
  }
  if (!data.inverter_catalog_id) errors.push({ field: 'inverter_catalog_id', message: 'Katalog falownika BESS jest wymagany' });
  if (!data.storage_catalog_id) errors.push({ field: 'storage_catalog_id', message: 'Katalog magazynu energii jest wymagany' });
  if (data.usable_capacity_kwh === null || data.usable_capacity_kwh <= 0)
    errors.push({ field: 'usable_capacity_kwh', message: 'Pojemność użyteczna (kWh) musi być > 0' });
  if (data.charge_power_kw === null || data.charge_power_kw <= 0)
    errors.push({ field: 'charge_power_kw', message: 'Moc ładowania (kW) musi być > 0' });
  if (data.discharge_power_kw === null || data.discharge_power_kw <= 0)
    errors.push({ field: 'discharge_power_kw', message: 'Moc rozładowania (kW) musi być > 0' });
  if (!data.operation_mode) errors.push({ field: 'operation_mode', message: 'Tryb pracy jest wymagany' });
  if (!data.control_strategy) errors.push({ field: 'control_strategy', message: 'Strategia sterowania jest wymagana' });
  if (data.soc_min_percent === null || data.soc_min_percent < 0 || data.soc_min_percent > 100)
    errors.push({ field: 'soc_min_percent', message: 'SOC min musi być w zakresie 0-100%' });
  if (data.soc_max_percent === null || data.soc_max_percent < 0 || data.soc_max_percent > 100)
    errors.push({ field: 'soc_max_percent', message: 'SOC max musi być w zakresie 0-100%' });
  if (data.soc_min_percent !== null && data.soc_max_percent !== null && data.soc_min_percent >= data.soc_max_percent)
    errors.push({ field: 'soc_max_percent', message: 'SOC max musi być > SOC min' });
  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EMPTY_FORM: BESSInverterFormData = {
  placement: 'NEW_FIELD', existing_field_ref: null,
  new_field_switch_kind: null, new_field_switch_state: null,
  new_field_switch_catalog_ref: null, new_field_voltage_nn_kv: null, new_field_name: null,
  inverter_catalog_id: null, storage_catalog_id: null,
  usable_capacity_kwh: null, charge_power_kw: null, discharge_power_kw: null,
  operation_mode: null, control_strategy: null,
  soc_min_percent: null, soc_max_percent: null,
  source_name: null, time_profile_ref: null,
};

export function BESSInverterModal({
  isOpen, mode, initialData, fieldOptions = [],
  inverterCatalogEntries = [], storageCatalogEntries = [], switchCatalogEntries = [],
  onSubmit, onCancel,
}: BESSInverterModalProps) {
  const [form, setForm] = useState<BESSInverterFormData>({ ...EMPTY_FORM, ...initialData });
  const [errors, setErrors] = useState<FieldError[]>([]);

  useEffect(() => { if (isOpen) { setForm({ ...EMPTY_FORM, ...initialData }); setErrors([]); } }, [isOpen, initialData]);

  const set = useCallback(<K extends keyof BESSInverterFormData>(key: K, val: BESSInverterFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  const getError = (field: string) => errors.find((e) => e.field === field)?.message;

  const handleSubmit = useCallback(() => {
    const errs = validateForm(form);
    setErrors(errs);
    if (errs.length === 0) onSubmit(form);
  }, [form, onSubmit]);

  if (!isOpen) return null;

  const isNewField = form.placement === 'NEW_FIELD';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'create' ? 'Dodaj falownik BESS' : 'Edycja falownika BESS'}
          </h2>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Osadzenie */}
          <fieldset className="border border-gray-200 rounded-md p-4">
            <legend className="text-sm font-semibold text-gray-700 px-2">Osadzenie w rozdzielni nN</legend>
            <div className="space-y-3">
              {(Object.entries(PLACEMENT_LABELS) as [SourcePlacement, string][]).map(([val, label]) => (
                <label key={val} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="placement" value={val} checked={form.placement === val} onChange={() => set('placement', val)} />
                  {label}
                </label>
              ))}
              {!isNewField && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Istniejące pole przyłączeniowe</label>
                  <select value={form.existing_field_ref ?? ''} onChange={(e) => set('existing_field_ref', e.target.value || null)}
                    className={`w-full px-3 py-2 border rounded-md text-sm ${getError('existing_field_ref') ? 'border-red-500' : 'border-gray-300'}`}>
                    <option value="">— wybierz —</option>
                    {fieldOptions.map((f) => (<option key={f.ref_id} value={f.ref_id}>{f.name} ({f.kind})</option>))}
                  </select>
                  {getError('existing_field_ref') && <p className="mt-1 text-xs text-red-600">{getError('existing_field_ref')}</p>}
                </div>
              )}
              {isNewField && (
                <div className="space-y-3 pl-4 border-l-2 border-blue-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Aparat łączeniowy pola *</label>
                      <select value={form.new_field_switch_kind ?? ''} onChange={(e) => set('new_field_switch_kind', (e.target.value || null) as NNSwitchKind | null)}
                        className={`w-full px-3 py-2 border rounded-md text-sm ${getError('new_field_switch_kind') ? 'border-red-500' : 'border-gray-300'}`}>
                        <option value="">— wybierz —</option>
                        {(Object.entries(SWITCH_KIND_LABELS) as [NNSwitchKind, string][]).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                      </select>
                      {getError('new_field_switch_kind') && <p className="mt-1 text-xs text-red-600">{getError('new_field_switch_kind')}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Stan normalny aparatu *</label>
                      <select value={form.new_field_switch_state ?? ''} onChange={(e) => set('new_field_switch_state', (e.target.value || null) as NNSwitchState | null)}
                        className={`w-full px-3 py-2 border rounded-md text-sm ${getError('new_field_switch_state') ? 'border-red-500' : 'border-gray-300'}`}>
                        <option value="">— wybierz —</option>
                        {(Object.entries(SWITCH_STATE_LABELS) as [NNSwitchState, string][]).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                      </select>
                      {getError('new_field_switch_state') && <p className="mt-1 text-xs text-red-600">{getError('new_field_switch_state')}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Napięcie nN (kV) *</label>
                      <input type="number" value={form.new_field_voltage_nn_kv ?? ''} onChange={(e) => set('new_field_voltage_nn_kv', e.target.value ? parseFloat(e.target.value) : null)}
                        step="any" className={`w-full px-3 py-2 border rounded-md text-sm ${getError('new_field_voltage_nn_kv') ? 'border-red-500' : 'border-gray-300'}`} placeholder="np. 0.4" />
                      {getError('new_field_voltage_nn_kv') && <p className="mt-1 text-xs text-red-600">{getError('new_field_voltage_nn_kv')}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa pola</label>
                      <input type="text" value={form.new_field_name ?? ''} onChange={(e) => set('new_field_name', e.target.value || null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                    </div>
                  </div>
                  <CatalogPicker label="Katalog aparatu" entries={switchCatalogEntries} selectedId={form.new_field_switch_catalog_ref ?? ''}
                    onChange={(id) => set('new_field_switch_catalog_ref', id || null)} />
                </div>
              )}
            </div>
          </fieldset>

          {/* Falownik BESS + Magazyn */}
          <fieldset className="border border-gray-200 rounded-md p-4">
            <legend className="text-sm font-semibold text-gray-700 px-2">Falownik BESS i magazyn energii</legend>
            <div className="space-y-3">
              <CatalogPicker label="Falownik BESS: katalog *" entries={inverterCatalogEntries} selectedId={form.inverter_catalog_id ?? ''}
                onChange={(id) => set('inverter_catalog_id', id || null)} required error={getError('inverter_catalog_id')} />
              <CatalogPicker label="Magazyn energii (moduł): katalog *" entries={storageCatalogEntries} selectedId={form.storage_catalog_id ?? ''}
                onChange={(id) => set('storage_catalog_id', id || null)} required error={getError('storage_catalog_id')} />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pojemność użyteczna (kWh) *</label>
                  <input type="number" value={form.usable_capacity_kwh ?? ''} onChange={(e) => set('usable_capacity_kwh', e.target.value ? parseFloat(e.target.value) : null)}
                    step="any" className={`w-full px-3 py-2 border rounded-md text-sm ${getError('usable_capacity_kwh') ? 'border-red-500' : 'border-gray-300'}`} />
                  {getError('usable_capacity_kwh') && <p className="mt-1 text-xs text-red-600">{getError('usable_capacity_kwh')}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Moc ładowania (kW) *</label>
                  <input type="number" value={form.charge_power_kw ?? ''} onChange={(e) => set('charge_power_kw', e.target.value ? parseFloat(e.target.value) : null)}
                    step="any" className={`w-full px-3 py-2 border rounded-md text-sm ${getError('charge_power_kw') ? 'border-red-500' : 'border-gray-300'}`} />
                  {getError('charge_power_kw') && <p className="mt-1 text-xs text-red-600">{getError('charge_power_kw')}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Moc rozładowania (kW) *</label>
                  <input type="number" value={form.discharge_power_kw ?? ''} onChange={(e) => set('discharge_power_kw', e.target.value ? parseFloat(e.target.value) : null)}
                    step="any" className={`w-full px-3 py-2 border rounded-md text-sm ${getError('discharge_power_kw') ? 'border-red-500' : 'border-gray-300'}`} />
                  {getError('discharge_power_kw') && <p className="mt-1 text-xs text-red-600">{getError('discharge_power_kw')}</p>}
                </div>
              </div>
            </div>
          </fieldset>

          {/* Tryb pracy i sterowanie */}
          <fieldset className="border border-gray-200 rounded-md p-4">
            <legend className="text-sm font-semibold text-gray-700 px-2">Tryb pracy i sterowanie</legend>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tryb pracy *</label>
                  <select value={form.operation_mode ?? ''} onChange={(e) => set('operation_mode', (e.target.value || null) as BESSOperationMode | null)}
                    className={`w-full px-3 py-2 border rounded-md text-sm ${getError('operation_mode') ? 'border-red-500' : 'border-gray-300'}`}>
                    <option value="">— wybierz —</option>
                    {(Object.entries(OPERATION_MODE_LABELS) as [BESSOperationMode, string][]).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                  </select>
                  {getError('operation_mode') && <p className="mt-1 text-xs text-red-600">{getError('operation_mode')}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Strategia sterowania *</label>
                  <select value={form.control_strategy ?? ''} onChange={(e) => set('control_strategy', (e.target.value || null) as BESSControlStrategy | null)}
                    className={`w-full px-3 py-2 border rounded-md text-sm ${getError('control_strategy') ? 'border-red-500' : 'border-gray-300'}`}>
                    <option value="">— wybierz —</option>
                    {(Object.entries(CONTROL_STRATEGY_LABELS) as [BESSControlStrategy, string][]).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                  </select>
                  {getError('control_strategy') && <p className="mt-1 text-xs text-red-600">{getError('control_strategy')}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SOC min (%) *</label>
                  <input type="number" value={form.soc_min_percent ?? ''} onChange={(e) => set('soc_min_percent', e.target.value ? parseFloat(e.target.value) : null)}
                    step="1" min="0" max="100" className={`w-full px-3 py-2 border rounded-md text-sm ${getError('soc_min_percent') ? 'border-red-500' : 'border-gray-300'}`} />
                  {getError('soc_min_percent') && <p className="mt-1 text-xs text-red-600">{getError('soc_min_percent')}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SOC max (%) *</label>
                  <input type="number" value={form.soc_max_percent ?? ''} onChange={(e) => set('soc_max_percent', e.target.value ? parseFloat(e.target.value) : null)}
                    step="1" min="0" max="100" className={`w-full px-3 py-2 border rounded-md text-sm ${getError('soc_max_percent') ? 'border-red-500' : 'border-gray-300'}`} />
                  {getError('soc_max_percent') && <p className="mt-1 text-xs text-red-600">{getError('soc_max_percent')}</p>}
                </div>
              </div>
            </div>
          </fieldset>

          {/* Opcjonalne */}
          <fieldset className="border border-gray-200 rounded-md p-4">
            <legend className="text-sm font-semibold text-gray-700 px-2">Dane opcjonalne</legend>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa źródła</label>
              <input type="text" value={form.source_name ?? ''} onChange={(e) => set('source_name', e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
          </fieldset>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Anuluj</button>
          <button onClick={handleSubmit} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
            {mode === 'create' ? 'Dodaj falownik BESS' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
}
