/**
 * MeasurementModal — edytor przekładnika prądowego (CT) lub napięciowego (VT).
 *
 * CATALOG-FIRST:
 * - Tryb STANDARDOWY: wybór typu z katalogu (catalog_ref)
 *   + topologia (bus_ref) + typ przekładnika + połączenie + przeznaczenie.
 *   Brak pól przekładni/klasy/obciążenia — pochodzą z katalogu.
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

export type MeasurementType = 'CT' | 'VT';
export type ConnectionType = 'star' | 'delta' | 'single_phase';
export type PurposeType = 'protection' | 'metering' | 'combined';

export interface MeasurementFormData {
  ref_id: string;
  name: string;
  measurement_type: MeasurementType;
  bus_ref: string;
  connection: ConnectionType;
  purpose: PurposeType;
  catalog_ref: string;
  parameter_source: 'CATALOG' | 'OVERRIDE';
  overrides: OverrideEntry[];
}

interface MeasurementModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<MeasurementFormData>;
  busOptions: Array<{ ref_id: string; name: string; voltage_kv: number }>;
  catalogEntries?: CatalogEntry[];
  catalogPreviewData?: Record<string, { name: string; manufacturer?: string; sections: CatalogPreviewSection[] }>;
  onSubmit: (data: MeasurementFormData) => void;
  onCancel: () => void;
}

interface FieldError {
  field: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Labels & Defaults
// ---------------------------------------------------------------------------

const MEASUREMENT_TYPE_LABELS: Record<MeasurementType, string> = {
  CT: 'Przekładnik prądowy (CT)',
  VT: 'Przekładnik napięciowy (VT)',
};

const CONNECTION_LABELS: Record<ConnectionType, string> = {
  star: 'Gwiazda',
  delta: 'Trójkąt',
  single_phase: 'Jednofazowe',
};

const PURPOSE_LABELS: Record<PurposeType, string> = {
  protection: 'Zabezpieczeniowy',
  metering: 'Pomiarowy',
  combined: 'Kombinowany',
};

const DEFAULT_DATA: MeasurementFormData = {
  ref_id: '',
  name: '',
  measurement_type: 'CT',
  bus_ref: '',
  connection: 'star',
  purpose: 'protection',
  catalog_ref: '',
  parameter_source: 'CATALOG',
  overrides: [],
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateForm(data: MeasurementFormData): FieldError[] {
  const errors: FieldError[] = [];

  if (!data.ref_id.trim()) {
    errors.push({ field: 'ref_id', message: 'Identyfikator jest wymagany' });
  }
  if (!data.name.trim()) {
    errors.push({ field: 'name', message: 'Nazwa jest wymagana' });
  }
  if (!data.bus_ref) {
    errors.push({ field: 'bus_ref', message: 'Szyna jest wymagana' });
  }
  if (!data.catalog_ref) {
    errors.push({ field: 'catalog_ref', message: 'Wybór typu z katalogu jest wymagany' });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MeasurementModal({
  isOpen,
  mode,
  initialData,
  busOptions,
  catalogEntries = [],
  catalogPreviewData = {},
  onSubmit,
  onCancel,
}: MeasurementModalProps) {
  const [formData, setFormData] = useState<MeasurementFormData>({ ...DEFAULT_DATA, ...initialData });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [isExpertMode, setIsExpertMode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({ ...DEFAULT_DATA, ...initialData });
      setErrors([]);
      setIsExpertMode(false);
    }
  }, [isOpen, initialData]);

  const handleChange = useCallback((field: keyof MeasurementFormData, value: unknown) => {
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'create' ? 'Nowy przekładnik' : 'Edycja przekładnika'}
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Typ przekładnika</label>
            <select
              value={formData.measurement_type}
              onChange={(e) => handleChange('measurement_type', e.target.value)}
              disabled={mode === 'edit'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              {Object.entries(MEASUREMENT_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Szyna</label>
            <select
              value={formData.bus_ref}
              onChange={(e) => handleChange('bus_ref', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md text-sm ${
                getError('bus_ref') ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">— wybierz —</option>
              {busOptions.map((b) => (
                <option key={b.ref_id} value={b.ref_id}>
                  {b.name} ({b.voltage_kv} kV)
                </option>
              ))}
            </select>
            {getError('bus_ref') && <p className="mt-1 text-xs text-sygnal-blokada">{getError('bus_ref')}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Połączenie</label>
              <select
                value={formData.connection}
                onChange={(e) => handleChange('connection', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                {Object.entries(CONNECTION_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Przeznaczenie</label>
              <select
                value={formData.purpose}
                onChange={(e) => handleChange('purpose', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                {Object.entries(PURPOSE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* === SEKCJA B: Dobór z katalogu === */}
          <div className="border-t border-gray-200 pt-4">
            <CatalogPicker
              label={formData.measurement_type === 'CT' ? 'Typ CT z katalogu' : 'Typ VT z katalogu'}
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
