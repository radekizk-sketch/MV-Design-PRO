/**
 * PVInverterModal — modal dodawania/edycji falownika PV w rozdzielni nN.
 *
 * BINDING:
 * - 100% PL etykiety, brak anglicyzmów w UI.
 * - Brak domyślnych wartości liczbowych.
 * - Każde pole wymagane jest jawnie oznaczone.
 * - Walidacja blokuje „Zastosuj" bez wymaganych pól.
 *
 * FAZA 2 — Standard modali „Układy nN / Falowniki".
 */

import { useCallback, useEffect, useState } from 'react';
import { CatalogPicker, type CatalogEntry } from './CatalogPicker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PVControlMode = 'STALY_COS_PHI' | 'Q_OD_U' | 'P_OD_U' | 'WYLACZONE';
export type PVMeasurementPoint = 'UTWORZ_NOWY' | 'UZYJ_ISTNIEJACEGO' | 'BRAK';
export type SourcePlacement = 'NEW_FIELD' | 'EXISTING_FIELD';
export type NNSwitchKind = 'WYLACZNIK' | 'ROZLACZNIK' | 'BEZPIECZNIK';
export type NNSwitchState = 'OTWARTY' | 'ZAMKNIETY';

export interface PVInverterFormData {
  // Osadzenie
  placement: SourcePlacement;
  existing_field_ref: string | null;
  // Nowe pole przyłączeniowe (gdy NEW_FIELD)
  new_field_switch_kind: NNSwitchKind | null;
  new_field_switch_state: NNSwitchState | null;
  new_field_switch_catalog_ref: string | null;
  new_field_voltage_nn_kv: number | null;
  new_field_name: string | null;
  // Falownik PV
  catalog_item_id: string | null;
  rated_power_ac_kw: number | null;
  max_power_kw: number | null;
  control_mode: PVControlMode | null;
  cos_phi: number | null;
  generation_limit_pmax_kw: number | null;
  generation_limit_q_kvar: number | null;
  disconnect_required: boolean;
  measurement_point: PVMeasurementPoint | null;
  existing_measurement_ref: string | null;
  source_name: string | null;
  work_profile_ref: string | null;
}

interface PVInverterModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<PVInverterFormData>;
  fieldOptions: Array<{ ref_id: string; name: string; kind: string }>;
  catalogEntries?: CatalogEntry[];
  switchCatalogEntries?: CatalogEntry[];
  measurementOptions?: Array<{ ref_id: string; name: string }>;
  onSubmit: (data: PVInverterFormData) => void;
  onCancel: () => void;
}

interface FieldError {
  field: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const PLACEMENT_LABELS: Record<SourcePlacement, string> = {
  NEW_FIELD: 'Utwórz nowe pole przyłączeniowe',
  EXISTING_FIELD: 'Użyj istniejącego pola',
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

const CONTROL_MODE_LABELS: Record<PVControlMode, string> = {
  STALY_COS_PHI: 'Stały cos φ',
  Q_OD_U: 'Q(U)',
  P_OD_U: 'P(U)',
  WYLACZONE: 'Wyłączone',
};

const MEASUREMENT_LABELS: Record<PVMeasurementPoint, string> = {
  UTWORZ_NOWY: 'Utwórz nowy punkt pomiaru',
  UZYJ_ISTNIEJACEGO: 'Użyj istniejącego',
  BRAK: 'Brak',
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateForm(data: PVInverterFormData): FieldError[] {
  const errors: FieldError[] = [];

  if (data.placement === 'EXISTING_FIELD' && !data.existing_field_ref) {
    errors.push({ field: 'existing_field_ref', message: 'Wybór pola jest wymagany' });
  }
  if (data.placement === 'NEW_FIELD') {
    if (!data.new_field_switch_kind) {
      errors.push({ field: 'new_field_switch_kind', message: 'Rodzaj aparatu jest wymagany' });
    }
    if (!data.new_field_switch_state) {
      errors.push({ field: 'new_field_switch_state', message: 'Stan normalny aparatu jest wymagany' });
    }
    if (data.new_field_voltage_nn_kv === null || data.new_field_voltage_nn_kv <= 0) {
      errors.push({ field: 'new_field_voltage_nn_kv', message: 'Napięcie nN (kV) musi być > 0' });
    }
  }

  if (!data.catalog_item_id) {
    errors.push({ field: 'catalog_item_id', message: 'Katalog falownika PV jest wymagany' });
  }
  if (data.rated_power_ac_kw === null || data.rated_power_ac_kw <= 0) {
    errors.push({ field: 'rated_power_ac_kw', message: 'Moc znamionowa AC (kW) musi być > 0' });
  }
  if (data.max_power_kw === null || data.max_power_kw <= 0) {
    errors.push({ field: 'max_power_kw', message: 'Moc maksymalna (kW) musi być > 0' });
  }
  if (data.rated_power_ac_kw !== null && data.max_power_kw !== null && data.max_power_kw < data.rated_power_ac_kw) {
    errors.push({ field: 'max_power_kw', message: 'Moc maksymalna musi być >= moc znamionowa' });
  }
  if (!data.control_mode) {
    errors.push({ field: 'control_mode', message: 'Tryb regulacji jest wymagany' });
  }
  if (data.control_mode === 'STALY_COS_PHI' && (data.cos_phi === null || data.cos_phi <= 0 || data.cos_phi > 1)) {
    errors.push({ field: 'cos_phi', message: 'Cos φ musi być w zakresie (0, 1]' });
  }
  if (data.measurement_point === 'UZYJ_ISTNIEJACEGO' && !data.existing_measurement_ref) {
    errors.push({ field: 'existing_measurement_ref', message: 'Wybór punktu pomiaru jest wymagany' });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EMPTY_FORM: PVInverterFormData = {
  placement: 'NEW_FIELD',
  existing_field_ref: null,
  new_field_switch_kind: null,
  new_field_switch_state: null,
  new_field_switch_catalog_ref: null,
  new_field_voltage_nn_kv: null,
  new_field_name: null,
  catalog_item_id: null,
  rated_power_ac_kw: null,
  max_power_kw: null,
  control_mode: null,
  cos_phi: null,
  generation_limit_pmax_kw: null,
  generation_limit_q_kvar: null,
  disconnect_required: true,
  measurement_point: null,
  existing_measurement_ref: null,
  source_name: null,
  work_profile_ref: null,
};

export function PVInverterModal({
  isOpen,
  mode,
  initialData,
  fieldOptions = [],
  catalogEntries = [],
  switchCatalogEntries = [],
  measurementOptions = [],
  onSubmit,
  onCancel,
}: PVInverterModalProps) {
  const [form, setForm] = useState<PVInverterFormData>({ ...EMPTY_FORM, ...initialData });
  const [errors, setErrors] = useState<FieldError[]>([]);

  useEffect(() => {
    if (isOpen) {
      setForm({ ...EMPTY_FORM, ...initialData });
      setErrors([]);
    }
  }, [isOpen, initialData]);

  const set = useCallback(<K extends keyof PVInverterFormData>(key: K, val: PVInverterFormData[K]) => {
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
  const showCosPhi = form.control_mode === 'STALY_COS_PHI';
  const showMeasurementRef = form.measurement_point === 'UZYJ_ISTNIEJACEGO';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'create' ? 'Dodaj falownik PV' : 'Edycja falownika PV'}
          </h2>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* === SEKCJA A: Sposób osadzenia === */}
          <fieldset className="border border-gray-200 rounded-md p-4">
            <legend className="text-sm font-semibold text-gray-700 px-2">Osadzenie w rozdzielni nN</legend>
            <div className="space-y-3">
              {(Object.entries(PLACEMENT_LABELS) as [SourcePlacement, string][]).map(([val, label]) => (
                <label key={val} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="placement"
                    value={val}
                    checked={form.placement === val}
                    onChange={() => set('placement', val)}
                  />
                  {label}
                </label>
              ))}

              {!isNewField && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Istniejące pole przyłączeniowe</label>
                  <select
                    value={form.existing_field_ref ?? ''}
                    onChange={(e) => set('existing_field_ref', e.target.value || null)}
                    className={`w-full px-3 py-2 border rounded-md text-sm ${getError('existing_field_ref') ? 'border-red-500' : 'border-gray-300'}`}
                  >
                    <option value="">— wybierz —</option>
                    {fieldOptions.map((f) => (
                      <option key={f.ref_id} value={f.ref_id}>{f.name} ({f.kind})</option>
                    ))}
                  </select>
                  {getError('existing_field_ref') && <p className="mt-1 text-xs text-red-600">{getError('existing_field_ref')}</p>}
                </div>
              )}

              {isNewField && (
                <div className="space-y-3 pl-4 border-l-2 border-blue-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Aparat łączeniowy pola *</label>
                      <select
                        value={form.new_field_switch_kind ?? ''}
                        onChange={(e) => set('new_field_switch_kind', (e.target.value || null) as NNSwitchKind | null)}
                        className={`w-full px-3 py-2 border rounded-md text-sm ${getError('new_field_switch_kind') ? 'border-red-500' : 'border-gray-300'}`}
                      >
                        <option value="">— wybierz —</option>
                        {(Object.entries(SWITCH_KIND_LABELS) as [NNSwitchKind, string][]).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                      {getError('new_field_switch_kind') && <p className="mt-1 text-xs text-red-600">{getError('new_field_switch_kind')}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Stan normalny aparatu *</label>
                      <select
                        value={form.new_field_switch_state ?? ''}
                        onChange={(e) => set('new_field_switch_state', (e.target.value || null) as NNSwitchState | null)}
                        className={`w-full px-3 py-2 border rounded-md text-sm ${getError('new_field_switch_state') ? 'border-red-500' : 'border-gray-300'}`}
                      >
                        <option value="">— wybierz —</option>
                        {(Object.entries(SWITCH_STATE_LABELS) as [NNSwitchState, string][]).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                      {getError('new_field_switch_state') && <p className="mt-1 text-xs text-red-600">{getError('new_field_switch_state')}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Napięcie nN (kV) *</label>
                      <input
                        type="number"
                        value={form.new_field_voltage_nn_kv ?? ''}
                        onChange={(e) => set('new_field_voltage_nn_kv', e.target.value ? parseFloat(e.target.value) : null)}
                        step="any"
                        className={`w-full px-3 py-2 border rounded-md text-sm ${getError('new_field_voltage_nn_kv') ? 'border-red-500' : 'border-gray-300'}`}
                        placeholder="np. 0.4"
                      />
                      {getError('new_field_voltage_nn_kv') && <p className="mt-1 text-xs text-red-600">{getError('new_field_voltage_nn_kv')}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa pola</label>
                      <input
                        type="text"
                        value={form.new_field_name ?? ''}
                        onChange={(e) => set('new_field_name', e.target.value || null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                  </div>
                  <CatalogPicker
                    label="Katalog aparatu"
                    entries={switchCatalogEntries}
                    selectedId={form.new_field_switch_catalog_ref ?? ''}
                    onChange={(id) => set('new_field_switch_catalog_ref', id || null)}
                  />
                </div>
              )}
            </div>
          </fieldset>

          {/* === SEKCJA B: Parametry falownika PV === */}
          <fieldset className="border border-gray-200 rounded-md p-4">
            <legend className="text-sm font-semibold text-gray-700 px-2">Falownik PV — parametry</legend>
            <div className="space-y-3">
              <CatalogPicker
                label="Falownik PV: katalog *"
                entries={catalogEntries}
                selectedId={form.catalog_item_id ?? ''}
                onChange={(id) => set('catalog_item_id', id || null)}
                required
                error={getError('catalog_item_id')}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Moc znamionowa AC (kW) *</label>
                  <input
                    type="number"
                    value={form.rated_power_ac_kw ?? ''}
                    onChange={(e) => set('rated_power_ac_kw', e.target.value ? parseFloat(e.target.value) : null)}
                    step="any"
                    className={`w-full px-3 py-2 border rounded-md text-sm ${getError('rated_power_ac_kw') ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {getError('rated_power_ac_kw') && <p className="mt-1 text-xs text-red-600">{getError('rated_power_ac_kw')}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Moc maksymalna (kW) *</label>
                  <input
                    type="number"
                    value={form.max_power_kw ?? ''}
                    onChange={(e) => set('max_power_kw', e.target.value ? parseFloat(e.target.value) : null)}
                    step="any"
                    className={`w-full px-3 py-2 border rounded-md text-sm ${getError('max_power_kw') ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {getError('max_power_kw') && <p className="mt-1 text-xs text-red-600">{getError('max_power_kw')}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tryb regulacji *</label>
                <select
                  value={form.control_mode ?? ''}
                  onChange={(e) => set('control_mode', (e.target.value || null) as PVControlMode | null)}
                  className={`w-full px-3 py-2 border rounded-md text-sm ${getError('control_mode') ? 'border-red-500' : 'border-gray-300'}`}
                >
                  <option value="">— wybierz —</option>
                  {(Object.entries(CONTROL_MODE_LABELS) as [PVControlMode, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                {getError('control_mode') && <p className="mt-1 text-xs text-red-600">{getError('control_mode')}</p>}
              </div>

              {showCosPhi && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cos φ *</label>
                  <input
                    type="number"
                    value={form.cos_phi ?? ''}
                    onChange={(e) => set('cos_phi', e.target.value ? parseFloat(e.target.value) : null)}
                    step="0.01"
                    min="0"
                    max="1"
                    className={`w-full px-3 py-2 border rounded-md text-sm ${getError('cos_phi') ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {getError('cos_phi') && <p className="mt-1 text-xs text-red-600">{getError('cos_phi')}</p>}
                </div>
              )}
            </div>
          </fieldset>

          {/* === SEKCJA C: Ograniczenia generacji === */}
          <fieldset className="border border-gray-200 rounded-md p-4">
            <legend className="text-sm font-semibold text-gray-700 px-2">Ograniczenia generacji</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Limit Pmax (kW)</label>
                <input
                  type="number"
                  value={form.generation_limit_pmax_kw ?? ''}
                  onChange={(e) => set('generation_limit_pmax_kw', e.target.value ? parseFloat(e.target.value) : null)}
                  step="any"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Limit Q (kvar)</label>
                <input
                  type="number"
                  value={form.generation_limit_q_kvar ?? ''}
                  onChange={(e) => set('generation_limit_q_kvar', e.target.value ? parseFloat(e.target.value) : null)}
                  step="any"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
          </fieldset>

          {/* === SEKCJA D: Pomiar i przyłączenie === */}
          <fieldset className="border border-gray-200 rounded-md p-4">
            <legend className="text-sm font-semibold text-gray-700 px-2">Pomiar i przyłączenie</legend>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Punkt pomiaru energii</label>
                <select
                  value={form.measurement_point ?? ''}
                  onChange={(e) => set('measurement_point', (e.target.value || null) as PVMeasurementPoint | null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">— wybierz —</option>
                  {(Object.entries(MEASUREMENT_LABELS) as [PVMeasurementPoint, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              {showMeasurementRef && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Istniejący punkt pomiaru</label>
                  <select
                    value={form.existing_measurement_ref ?? ''}
                    onChange={(e) => set('existing_measurement_ref', e.target.value || null)}
                    className={`w-full px-3 py-2 border rounded-md text-sm ${getError('existing_measurement_ref') ? 'border-red-500' : 'border-gray-300'}`}
                  >
                    <option value="">— wybierz —</option>
                    {measurementOptions.map((m) => (
                      <option key={m.ref_id} value={m.ref_id}>{m.name}</option>
                    ))}
                  </select>
                  {getError('existing_measurement_ref') && <p className="mt-1 text-xs text-red-600">{getError('existing_measurement_ref')}</p>}
                </div>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.disconnect_required}
                  onChange={(e) => set('disconnect_required', e.target.checked)}
                />
                Wymóg aparatu odłączającego
              </label>
            </div>
          </fieldset>

          {/* === SEKCJA E: Opcjonalne === */}
          <fieldset className="border border-gray-200 rounded-md p-4">
            <legend className="text-sm font-semibold text-gray-700 px-2">Dane opcjonalne</legend>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa źródła</label>
              <input
                type="text"
                value={form.source_name ?? ''}
                onChange={(e) => set('source_name', e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </fieldset>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Anuluj
          </button>
          <button
            onClick={handleSubmit}
            disabled={errors.length > 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {mode === 'create' ? 'Dodaj falownik PV' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
}
