/**
 * ProtectionModal — edytor zabezpieczenia powiązanego z wyłącznikiem.
 *
 * CATALOG-FIRST:
 * - Tryb STANDARDOWY: wybór typu zabezpieczenia z katalogu (catalog_ref)
 *   + topologia (breaker_ref, ct_ref, vt_ref) + typ + status.
 *   Brak pól nastaw/progów/krzywych — pochodzą z katalogu.
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

export type ProtectionDeviceType =
  | 'overcurrent'
  | 'earth_fault'
  | 'directional_overcurrent'
  | 'distance'
  | 'differential'
  | 'custom';

export interface ProtectionFormData {
  ref_id: string;
  name: string;
  breaker_ref: string;
  ct_ref: string;
  vt_ref: string;
  device_type: ProtectionDeviceType;
  is_enabled: boolean;
  catalog_ref: string;
  parameter_source: 'CATALOG' | 'OVERRIDE';
  overrides: OverrideEntry[];
}

interface ProtectionModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<ProtectionFormData>;
  breakerOptions: Array<{ ref_id: string; name: string }>;
  ctOptions: Array<{ ref_id: string; name: string; ratio: string }>;
  vtOptions: Array<{ ref_id: string; name: string }>;
  catalogEntries?: CatalogEntry[];
  catalogPreviewData?: Record<string, { name: string; manufacturer?: string; sections: CatalogPreviewSection[] }>;
  onSubmit: (data: ProtectionFormData) => void;
  onCancel: () => void;
}

interface FieldError {
  field: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const CT_REQUIRED_TYPES = new Set<ProtectionDeviceType>([
  'overcurrent', 'earth_fault', 'directional_overcurrent',
]);

function validateForm(data: ProtectionFormData): FieldError[] {
  const errors: FieldError[] = [];

  if (!data.ref_id.trim()) {
    errors.push({ field: 'ref_id', message: 'Identyfikator jest wymagany' });
  }
  if (!data.name.trim()) {
    errors.push({ field: 'name', message: 'Nazwa jest wymagana' });
  }
  if (!data.breaker_ref) {
    errors.push({ field: 'breaker_ref', message: 'Wyłącznik jest wymagany' });
  }
  if (CT_REQUIRED_TYPES.has(data.device_type) && !data.ct_ref) {
    errors.push({ field: 'ct_ref', message: `Zabezpieczenie typu '${DEVICE_TYPE_LABELS[data.device_type]}' wymaga przekladnika pradowego` });
  }
  if (!data.catalog_ref) {
    errors.push({ field: 'catalog_ref', message: 'Wybór typu z katalogu jest wymagany' });
  }

  return errors;
}

const DEVICE_TYPE_LABELS: Record<ProtectionDeviceType, string> = {
  overcurrent: 'Nadprądowe',
  earth_fault: 'Ziemnozwarciowe',
  directional_overcurrent: 'Kierunkowe nadprądowe',
  distance: 'Odległościowe',
  differential: 'Różnicowe',
  custom: 'Niestandardowe',
};

const DEFAULT_DATA: ProtectionFormData = {
  ref_id: '',
  name: '',
  breaker_ref: '',
  ct_ref: '',
  vt_ref: '',
  device_type: 'overcurrent',
  is_enabled: true,
  catalog_ref: '',
  parameter_source: 'CATALOG',
  overrides: [],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProtectionModal({
  isOpen,
  mode,
  initialData,
  breakerOptions,
  ctOptions,
  vtOptions,
  catalogEntries = [],
  catalogPreviewData = {},
  onSubmit,
  onCancel,
}: ProtectionModalProps) {
  const [formData, setFormData] = useState<ProtectionFormData>({ ...DEFAULT_DATA, ...initialData });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [isExpertMode, setIsExpertMode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({ ...DEFAULT_DATA, ...initialData });
      setErrors([]);
      setIsExpertMode(false);
    }
  }, [isOpen, initialData]);

  const handleChange = useCallback((field: keyof ProtectionFormData, value: unknown) => {
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
            {mode === 'create' ? 'Nowe zabezpieczenie' : 'Edycja zabezpieczenia'}
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
              {getError('ref_id') && <p className="mt-1 text-xs text-red-600">{getError('ref_id')}</p>}
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
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Typ zabezpieczenia</label>
            <select
              value={formData.device_type}
              onChange={(e) => handleChange('device_type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              {Object.entries(DEVICE_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Wyłącznik</label>
              <select
                value={formData.breaker_ref}
                onChange={(e) => handleChange('breaker_ref', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md text-sm ${
                  getError('breaker_ref') ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">— wybierz —</option>
                {breakerOptions.map((b) => (
                  <option key={b.ref_id} value={b.ref_id}>{b.name}</option>
                ))}
              </select>
              {getError('breaker_ref') && <p className="mt-1 text-xs text-red-600">{getError('breaker_ref')}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Przekładnik CT
                {CT_REQUIRED_TYPES.has(formData.device_type) && <span className="text-red-500"> *</span>}
              </label>
              <select
                value={formData.ct_ref}
                onChange={(e) => handleChange('ct_ref', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md text-sm ${
                  getError('ct_ref') ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">— brak —</option>
                {ctOptions.map((ct) => (
                  <option key={ct.ref_id} value={ct.ref_id}>
                    {ct.name} ({ct.ratio})
                  </option>
                ))}
              </select>
              {getError('ct_ref') && <p className="mt-1 text-xs text-red-600">{getError('ct_ref')}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Przekladnik napieciowy</label>
              <select
                value={formData.vt_ref}
                onChange={(e) => handleChange('vt_ref', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">— brak —</option>
                {vtOptions.map((vt) => (
                  <option key={vt.ref_id} value={vt.ref_id}>{vt.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* === SEKCJA B: Dobór z katalogu === */}
          <div className="border-t border-gray-200 pt-4">
            <CatalogPicker
              label="Typ zabezpieczenia z katalogu"
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

          {/* Aktywne */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_enabled}
              onChange={(e) => handleChange('is_enabled', e.target.checked)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <label className="text-sm text-gray-700">Zabezpieczenie aktywne</label>
          </div>
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
            {mode === 'create' ? 'Przypisz' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
}
