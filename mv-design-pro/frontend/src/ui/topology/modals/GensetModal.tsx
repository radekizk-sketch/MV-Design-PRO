/**
 * GensetModal — modal dodawania/edycji agregatu (zespołu prądotwórczego) w nN.
 *
 * BINDING: 100% PL etykiety, brak domyślnych wartości liczbowych.
 * FAZA 6 — Modale agregat (Y) i UPS (Z).
 */

import { useCallback, useEffect, useState } from 'react';
import { CatalogPicker, type CatalogEntry } from './CatalogPicker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GensetOperationMode = 'PRACA_CIAGLA' | 'PRACA_AWARYJNA' | 'PRACA_SZCZYTOWA' | 'WYLACZONE';
export type GensetFuelType = 'DIESEL' | 'GAZ' | 'BIOPALIWO' | 'INNY';
export type SourcePlacement = 'NEW_FIELD' | 'EXISTING_FIELD';
export type NNSwitchKind = 'WYLACZNIK' | 'ROZLACZNIK' | 'BEZPIECZNIK';
export type NNSwitchState = 'OTWARTY' | 'ZAMKNIETY';

export interface GensetFormData {
  placement: SourcePlacement;
  existing_field_ref: string | null;
  new_field_switch_kind: NNSwitchKind | null;
  new_field_switch_state: NNSwitchState | null;
  new_field_switch_catalog_ref: string | null;
  new_field_voltage_nn_kv: number | null;
  new_field_name: string | null;
  catalog_item_id: string | null;
  rated_power_kw: number | null;
  rated_voltage_kv: number | null;
  power_factor: number | null;
  operation_mode: GensetOperationMode | null;
  fuel_type: GensetFuelType | null;
  source_name: string | null;
}

export interface GensetModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  embedded?: boolean;
  hideHeader?: boolean;
  initialData?: Partial<GensetFormData>;
  fieldOptions: Array<{ ref_id: string; name: string; kind: string }>;
  catalogEntries?: CatalogEntry[];
  switchCatalogEntries?: CatalogEntry[];
  onSubmit: (data: GensetFormData) => void;
  onCancel: () => void;
}

interface FieldError { field: string; message: string; }

const OPERATION_MODE_LABELS: Record<GensetOperationMode, string> = {
  PRACA_CIAGLA: 'Praca ciągła',
  PRACA_AWARYJNA: 'Praca awaryjna',
  PRACA_SZCZYTOWA: 'Praca szczytowa',
  WYLACZONE: 'Wyłączone',
};

const FUEL_TYPE_LABELS: Record<GensetFuelType, string> = {
  DIESEL: 'Diesel',
  GAZ: 'Gaz',
  BIOPALIWO: 'Biopaliwo',
  INNY: 'Inny',
};

const SWITCH_KIND_LABELS: Record<NNSwitchKind, string> = {
  WYLACZNIK: 'Wyłącznik', ROZLACZNIK: 'Rozłącznik', BEZPIECZNIK: 'Bezpiecznik',
};
const SWITCH_STATE_LABELS: Record<NNSwitchState, string> = {
  OTWARTY: 'Otwarty', ZAMKNIETY: 'Zamknięty',
};
const PLACEMENT_LABELS: Record<SourcePlacement, string> = {
  NEW_FIELD: 'Utwórz nowe pole źródłowe', EXISTING_FIELD: 'Użyj istniejącego pola',
};

function validateForm(data: GensetFormData): FieldError[] {
  const errors: FieldError[] = [];
  if (data.placement === 'EXISTING_FIELD' && !data.existing_field_ref)
    errors.push({ field: 'existing_field_ref', message: 'Wybór pola jest wymagany' });
  if (data.placement === 'NEW_FIELD') {
    if (!data.new_field_switch_kind) errors.push({ field: 'new_field_switch_kind', message: 'Rodzaj aparatu jest wymagany' });
    if (!data.new_field_switch_state) errors.push({ field: 'new_field_switch_state', message: 'Stan normalny jest wymagany' });
    if (data.new_field_voltage_nn_kv === null || data.new_field_voltage_nn_kv <= 0)
      errors.push({ field: 'new_field_voltage_nn_kv', message: 'Napięcie nN (kV) musi być > 0' });
  }
  if (!data.catalog_item_id) errors.push({ field: 'catalog_item_id', message: 'Katalog agregatu jest wymagany' });
  if (data.rated_power_kw === null || data.rated_power_kw <= 0)
    errors.push({ field: 'rated_power_kw', message: 'Moc znamionowa (kW) musi być > 0' });
  if (data.rated_voltage_kv === null || data.rated_voltage_kv <= 0)
    errors.push({ field: 'rated_voltage_kv', message: 'Napięcie znamionowe (kV) musi być > 0' });
  if (data.power_factor === null || data.power_factor <= 0 || data.power_factor > 1)
    errors.push({ field: 'power_factor', message: 'Współczynnik mocy musi być w zakresie (0, 1]' });
  if (!data.operation_mode) errors.push({ field: 'operation_mode', message: 'Tryb pracy jest wymagany' });
  return errors;
}

const EMPTY_FORM: GensetFormData = {
  placement: 'NEW_FIELD', existing_field_ref: null,
  new_field_switch_kind: null, new_field_switch_state: null,
  new_field_switch_catalog_ref: null, new_field_voltage_nn_kv: null, new_field_name: null,
  catalog_item_id: null, rated_power_kw: null, rated_voltage_kv: null,
  power_factor: null, operation_mode: null, fuel_type: null, source_name: null,
};

export function GensetModal({
  isOpen, mode, embedded: _embedded = false, hideHeader: _hideHeader = false, initialData, fieldOptions = [],
  catalogEntries = [], switchCatalogEntries: _switchCatalogEntries = [],
  onSubmit, onCancel,
}: GensetModalProps) {
  const [form, setForm] = useState<GensetFormData>({ ...EMPTY_FORM, ...initialData });
  const [errors, setErrors] = useState<FieldError[]>([]);

  useEffect(() => { if (isOpen) { setForm({ ...EMPTY_FORM, ...initialData }); setErrors([]); } }, [isOpen, initialData]);

  const set = useCallback(<K extends keyof GensetFormData>(key: K, val: GensetFormData[K]) => {
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
            {mode === 'create' ? 'Dodaj agregat (zespół prądotwórczy)' : 'Edycja agregatu'}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Istniejące pole</label>
                  <select value={form.existing_field_ref ?? ''} onChange={(e) => set('existing_field_ref', e.target.value || null)}
                    className={`w-full px-3 py-2 border rounded-md text-sm ${getError('existing_field_ref') ? 'border-red-500' : 'border-gray-300'}`}>
                    <option value="">— wybierz —</option>
                    {fieldOptions.map((f) => (<option key={f.ref_id} value={f.ref_id}>{f.name}</option>))}
                  </select>
                  {getError('existing_field_ref') && <p className="mt-1 text-xs text-red-600">{getError('existing_field_ref')}</p>}
                </div>
              )}
              {isNewField && (
                <div className="space-y-3 pl-4 border-l-2 border-blue-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Aparat łączeniowy *</label>
                      <select value={form.new_field_switch_kind ?? ''} onChange={(e) => set('new_field_switch_kind', (e.target.value || null) as NNSwitchKind | null)}
                        className={`w-full px-3 py-2 border rounded-md text-sm ${getError('new_field_switch_kind') ? 'border-red-500' : 'border-gray-300'}`}>
                        <option value="">— wybierz —</option>
                        {(Object.entries(SWITCH_KIND_LABELS) as [NNSwitchKind, string][]).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                      </select>
                      {getError('new_field_switch_kind') && <p className="mt-1 text-xs text-red-600">{getError('new_field_switch_kind')}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Stan normalny *</label>
                      <select value={form.new_field_switch_state ?? ''} onChange={(e) => set('new_field_switch_state', (e.target.value || null) as NNSwitchState | null)}
                        className={`w-full px-3 py-2 border rounded-md text-sm ${getError('new_field_switch_state') ? 'border-red-500' : 'border-gray-300'}`}>
                        <option value="">— wybierz —</option>
                        {(Object.entries(SWITCH_STATE_LABELS) as [NNSwitchState, string][]).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                      </select>
                      {getError('new_field_switch_state') && <p className="mt-1 text-xs text-red-600">{getError('new_field_switch_state')}</p>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Napięcie nN (kV) *</label>
                    <input type="number" value={form.new_field_voltage_nn_kv ?? ''} onChange={(e) => set('new_field_voltage_nn_kv', e.target.value ? parseFloat(e.target.value) : null)}
                      step="any" className={`w-full px-3 py-2 border rounded-md text-sm ${getError('new_field_voltage_nn_kv') ? 'border-red-500' : 'border-gray-300'}`} />
                    {getError('new_field_voltage_nn_kv') && <p className="mt-1 text-xs text-red-600">{getError('new_field_voltage_nn_kv')}</p>}
                  </div>
                </div>
              )}
            </div>
          </fieldset>

          {/* Parametry agregatu */}
          <fieldset className="border border-gray-200 rounded-md p-4">
            <legend className="text-sm font-semibold text-gray-700 px-2">Agregat — parametry</legend>
            <div className="space-y-3">
              <CatalogPicker label="Katalog agregatu *" entries={catalogEntries} selectedId={form.catalog_item_id ?? ''}
                onChange={(id) => set('catalog_item_id', id || null)} required error={getError('catalog_item_id')} />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Moc znamionowa (kW) *</label>
                  <input type="number" value={form.rated_power_kw ?? ''} onChange={(e) => set('rated_power_kw', e.target.value ? parseFloat(e.target.value) : null)}
                    step="any" className={`w-full px-3 py-2 border rounded-md text-sm ${getError('rated_power_kw') ? 'border-red-500' : 'border-gray-300'}`} />
                  {getError('rated_power_kw') && <p className="mt-1 text-xs text-red-600">{getError('rated_power_kw')}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Napięcie znamionowe (kV) *</label>
                  <input type="number" value={form.rated_voltage_kv ?? ''} onChange={(e) => set('rated_voltage_kv', e.target.value ? parseFloat(e.target.value) : null)}
                    step="any" className={`w-full px-3 py-2 border rounded-md text-sm ${getError('rated_voltage_kv') ? 'border-red-500' : 'border-gray-300'}`} />
                  {getError('rated_voltage_kv') && <p className="mt-1 text-xs text-red-600">{getError('rated_voltage_kv')}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Współczynnik mocy *</label>
                  <input type="number" value={form.power_factor ?? ''} onChange={(e) => set('power_factor', e.target.value ? parseFloat(e.target.value) : null)}
                    step="0.01" min="0" max="1" className={`w-full px-3 py-2 border rounded-md text-sm ${getError('power_factor') ? 'border-red-500' : 'border-gray-300'}`} />
                  {getError('power_factor') && <p className="mt-1 text-xs text-red-600">{getError('power_factor')}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tryb pracy *</label>
                  <select value={form.operation_mode ?? ''} onChange={(e) => set('operation_mode', (e.target.value || null) as GensetOperationMode | null)}
                    className={`w-full px-3 py-2 border rounded-md text-sm ${getError('operation_mode') ? 'border-red-500' : 'border-gray-300'}`}>
                    <option value="">— wybierz —</option>
                    {(Object.entries(OPERATION_MODE_LABELS) as [GensetOperationMode, string][]).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                  </select>
                  {getError('operation_mode') && <p className="mt-1 text-xs text-red-600">{getError('operation_mode')}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rodzaj paliwa</label>
                  <select value={form.fuel_type ?? ''} onChange={(e) => set('fuel_type', (e.target.value || null) as GensetFuelType | null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                    <option value="">— brak —</option>
                    {(Object.entries(FUEL_TYPE_LABELS) as [GensetFuelType, string][]).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                  </select>
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
            {mode === 'create' ? 'Dodaj agregat' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
}
