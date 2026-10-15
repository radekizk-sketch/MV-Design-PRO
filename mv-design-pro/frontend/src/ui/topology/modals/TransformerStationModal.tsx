/**
 * TransformerStationModal — edytor stacji transformatorowej SN/nn.
 *
 * CATALOG-FIRST:
 * - Tryb STANDARDOWY: wybór typu transformatora z katalogu (catalog_ref)
 *   + topologia (HV/LV bus refs) + pozycja zaczepu.
 *   Brak pól Sn/Uk/Pk/P0/I0/grupy wektorowej — pochodzą z katalogu.
 * - Tryb EKSPERT: overrides[] z audytem.
 * - Podgląd katalogowy READ-ONLY.
 *
 * BINDING: PL labels, no codenames.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CatalogPicker, type CatalogEntry } from './CatalogPicker';
import { CatalogPreview, type CatalogPreviewSection } from './CatalogPreview';
import { ExpertOverrides, type OverrideEntry } from './ExpertOverrides';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransformerStationFormData {
  ref_id: string;
  name: string;
  hv_bus_ref: string;
  lv_bus_ref: string;
  tap_position: number;
  catalog_ref: string;
  parameter_source: 'CATALOG' | 'OVERRIDE';
  overrides: OverrideEntry[];
}

interface TransformerStationModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<TransformerStationFormData>;
  busOptions: Array<{ ref_id: string; name: string; voltage_kv: number }>;
  catalogEntries?: CatalogEntry[];
  catalogPreviewData?: Record<string, { name: string; manufacturer?: string; sections: CatalogPreviewSection[] }>;
  onSubmit: (data: TransformerStationFormData) => void;
  onCancel: () => void;
}

interface FieldError {
  field: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateForm(data: TransformerStationFormData): FieldError[] {
  const errors: FieldError[] = [];

  if (!data.ref_id.trim()) {
    errors.push({ field: 'ref_id', message: 'Identyfikator jest wymagany' });
  }
  if (!data.name.trim()) {
    errors.push({ field: 'name', message: 'Nazwa jest wymagana' });
  }
  if (!data.hv_bus_ref) {
    errors.push({ field: 'hv_bus_ref', message: 'Szyna strony GN jest wymagana' });
  }
  if (!data.lv_bus_ref) {
    errors.push({ field: 'lv_bus_ref', message: 'Szyna strony DN jest wymagana' });
  }
  if (data.hv_bus_ref && data.lv_bus_ref && data.hv_bus_ref === data.lv_bus_ref) {
    errors.push({ field: 'lv_bus_ref', message: 'Szyny GN i DN muszą być różne' });
  }
  if (!data.catalog_ref) {
    errors.push({ field: 'catalog_ref', message: 'Wybór typu z katalogu jest wymagany' });
  }

  return errors;
}

const DEFAULT_DATA: TransformerStationFormData = {
  ref_id: '',
  name: '',
  hv_bus_ref: '',
  lv_bus_ref: '',
  tap_position: 0,
  catalog_ref: '',
  parameter_source: 'CATALOG',
  overrides: [],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransformerStationModal({
  isOpen,
  mode,
  initialData,
  busOptions,
  catalogEntries = [],
  catalogPreviewData = {},
  onSubmit,
  onCancel,
}: TransformerStationModalProps) {
  const [formData, setFormData] = useState<TransformerStationFormData>({ ...DEFAULT_DATA, ...initialData });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [isExpertMode, setIsExpertMode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({ ...DEFAULT_DATA, ...initialData });
      setErrors([]);
      setIsExpertMode(false);
    }
  }, [isOpen, initialData]);

  const handleChange = useCallback((field: keyof TransformerStationFormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    const validationErrors = validateForm(formData);
    setErrors(validationErrors);
    if (validationErrors.length === 0) {
      onSubmit({
        ...formData,
        parameter_source: isExpertMode && formData.overrides.length > 0 ? 'OVERRIDE' : 'CATALOG',
      });
    }
  }, [formData, onSubmit, isExpertMode]);

  const getError = (field: string): string | undefined =>
    errors.find((e) => e.field === field)?.message;

  const previewData = useMemo(
    () => (formData.catalog_ref ? catalogPreviewData[formData.catalog_ref] : null),
    [formData.catalog_ref, catalogPreviewData],
  );

  const expertAvailableKeys = useMemo(() => {
    if (!previewData) return [];
    return previewData.sections.flatMap((s) =>
      s.params.map((p) => ({
        key: p.label,
        label: p.label,
        catalogValue: p.value,
        unit: p.unit,
      })),
    );
  }, [previewData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'create' ? 'Nowa stacja transformatorowa' : 'Edycja stacji transformatorowej'}
          </h2>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* === SEKCJA A: Tożsamość i topologia === */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Identyfikator</label>
              <input
                type="text"
                value={formData.ref_id}
                onChange={(e) => handleChange('ref_id', e.target.value)}
                disabled={mode === 'edit'}
                className={`w-full px-3 py-2 border rounded-md text-sm ${
                  getError('ref_id') ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {getError('ref_id') && <p className="mt-1 text-xs text-sygnal-blokada">{getError('ref_id')}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md text-sm ${
                  getError('name') ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {getError('name') && <p className="mt-1 text-xs text-sygnal-blokada">{getError('name')}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Szyna strony górnej (GN)
              </label>
              <select
                value={formData.hv_bus_ref}
                onChange={(e) => handleChange('hv_bus_ref', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md text-sm ${
                  getError('hv_bus_ref') ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">— wybierz —</option>
                {busOptions.map((b) => (
                  <option key={b.ref_id} value={b.ref_id}>
                    {b.name} ({b.voltage_kv} kV)
                  </option>
                ))}
              </select>
              {getError('hv_bus_ref') && <p className="mt-1 text-xs text-sygnal-blokada">{getError('hv_bus_ref')}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Szyna strony dolnej (DN)
              </label>
              <select
                value={formData.lv_bus_ref}
                onChange={(e) => handleChange('lv_bus_ref', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md text-sm ${
                  getError('lv_bus_ref') ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">— wybierz —</option>
                {busOptions.map((b) => (
                  <option key={b.ref_id} value={b.ref_id}>
                    {b.name} ({b.voltage_kv} kV)
                  </option>
                ))}
              </select>
              {getError('lv_bus_ref') && <p className="mt-1 text-xs text-sygnal-blokada">{getError('lv_bus_ref')}</p>}
            </div>
          </div>

          {/* Pozycja zaczepu — parametr operacyjny, nie fizyka */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pozycja zaczepu</label>
            <input
              type="number"
              value={formData.tap_position}
              onChange={(e) => handleChange('tap_position', parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>

          {/* === SEKCJA B: Dobór z katalogu === */}
          <div className="border-t border-gray-200 pt-4">
            <CatalogPicker
              label="Typ transformatora z katalogu"
              entries={catalogEntries}
              selectedId={formData.catalog_ref}
              onChange={(id) => handleChange('catalog_ref', id)}
              required
              error={getError('catalog_ref')}
            />
          </div>

          {/* === SEKCJA C: Podgląd katalogowy READ-ONLY === */}
          {previewData && (
            <CatalogPreview
              typeName={previewData.name}
              manufacturer={previewData.manufacturer}
              sections={previewData.sections}
            />
          )}

          {/* === SEKCJA D: EKSPERT overrides === */}
          {formData.catalog_ref && (
            <ExpertOverrides
              isExpertMode={isExpertMode}
              onToggleExpert={setIsExpertMode}
              overrides={formData.overrides}
              onOverridesChange={(o) => handleChange('overrides', o)}
              availableKeys={expertAvailableKeys}
            />
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Anuluj
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            {mode === 'create' ? 'Dodaj' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
}
