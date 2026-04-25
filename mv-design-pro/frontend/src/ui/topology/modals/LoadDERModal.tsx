/**
 * LoadDERModal — edytor odbiorów (Load) i źródeł rozproszonych (DER/OZE).
 *
 * CATALOG-FIRST:
 * - Tryb STANDARDOWY: wybór typu z katalogu (catalog_ref)
 *   + topologia (bus_ref) + rodzaj + typ generatora + liczba sztuk.
 *   Brak pól P/Q/cos_phi/limitów — pochodzą z katalogu.
 * - Tryb EKSPERT: overrides[] z audytem.
 * - PV/BESS: jawne pole quantity (liczba inwerterów/modułów).
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

export type ElementKind = 'load' | 'generator';
export type LoadModel = 'pq' | 'zip';
export type GenType = 'synchronous' | 'pv_inverter' | 'wind_inverter' | 'fw_pmsg' | 'fw_dfig' | 'fw_scig' | 'bess';

export interface LoadDERFormData {
  ref_id: string;
  name: string;
  element_kind: ElementKind;
  bus_ref: string;
  load_model: LoadModel;
  gen_type: GenType;
  catalog_ref: string;
  quantity: number;
  parameter_source: 'CATALOG' | 'OVERRIDE';
  overrides: OverrideEntry[];
}

interface LoadDERModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<LoadDERFormData>;
  busOptions: Array<{ ref_id: string; name: string; voltage_kv: number }>;
  catalogEntries?: CatalogEntry[];
  catalogPreviewData?: Record<string, { name: string; manufacturer?: string; sections: CatalogPreviewSection[] }>;
  onSubmit: (data: LoadDERFormData) => void;
  onCancel: () => void;
}

interface FieldError {
  field: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Labels & Defaults
// ---------------------------------------------------------------------------

const ELEMENT_KIND_LABELS: Record<ElementKind, string> = {
  load: 'Odbiór',
  generator: 'Generator / OZE',
};

const LOAD_MODEL_LABELS: Record<LoadModel, string> = {
  pq: 'PQ (stała moc)',
  zip: 'ZIP (wielomianowy)',
};

const GEN_TYPE_LABELS: Record<GenType, string> = {
  synchronous: 'Synchroniczny',
  pv_inverter: 'Falownik PV',
  wind_inverter: 'Falownik wiatrowy',
  fw_pmsg: 'Farma wiatrowa PMSG',
  fw_dfig: 'Farma wiatrowa DFIG',
  fw_scig: 'Farma wiatrowa SCIG',
  bess: 'Magazyn energii (BESS)',
};

const QUANTITY_GEN_TYPES = new Set<GenType>([
  'pv_inverter',
  'wind_inverter',
  'fw_pmsg',
  'fw_dfig',
  'fw_scig',
  'bess',
]);

const DEFAULT_DATA: LoadDERFormData = {
  ref_id: '',
  name: '',
  element_kind: 'load',
  bus_ref: '',
  load_model: 'pq',
  gen_type: 'pv_inverter',
  catalog_ref: '',
  quantity: 1,
  parameter_source: 'CATALOG',
  overrides: [],
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateForm(data: LoadDERFormData): FieldError[] {
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

  if (data.element_kind === 'generator' && QUANTITY_GEN_TYPES.has(data.gen_type)) {
    if (data.quantity < 1) {
      errors.push({ field: 'quantity', message: 'Liczba sztuk musi wynosić co najmniej 1' });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoadDERModal({
  isOpen,
  mode,
  initialData,
  busOptions,
  catalogEntries = [],
  catalogPreviewData = {},
  onSubmit,
  onCancel,
}: LoadDERModalProps) {
  const [formData, setFormData] = useState<LoadDERFormData>({ ...DEFAULT_DATA, ...initialData });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [isExpertMode, setIsExpertMode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({ ...DEFAULT_DATA, ...initialData });
      setErrors([]);
      setIsExpertMode(false);
    }
  }, [isOpen, initialData]);

  const handleChange = useCallback((field: keyof LoadDERFormData, value: unknown) => {
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

  const isLoad = formData.element_kind === 'load';
  const isGen = formData.element_kind === 'generator';
  const showQuantity = isGen && QUANTITY_GEN_TYPES.has(formData.gen_type);

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
            {mode === 'create'
              ? (isLoad ? 'Nowy odbiór' : 'Nowy generator / OZE')
              : (isLoad ? 'Edycja odbioru' : 'Edycja generatora / OZE')}
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
              {getError('name') && <p className="mt-1 text-xs text-red-600">{getError('name')}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rodzaj</label>
            <select
              value={formData.element_kind}
              onChange={(e) => handleChange('element_kind', e.target.value)}
              disabled={mode === 'edit'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              {Object.entries(ELEMENT_KIND_LABELS).map(([val, label]) => (
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
            {getError('bus_ref') && <p className="mt-1 text-xs text-red-600">{getError('bus_ref')}</p>}
          </div>

          {/* Load model (topological/operational property) */}
          {isLoad && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model odbioru</label>
              <select
                value={formData.load_model}
                onChange={(e) => handleChange('load_model', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                {Object.entries(LOAD_MODEL_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Generator type */}
          {isGen && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Typ generatora</label>
              <select
                value={formData.gen_type}
                onChange={(e) => handleChange('gen_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                {Object.entries(GEN_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Quantity for PV/BESS/Wind */}
          {showQuantity && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Liczba sztuk (inwerterów/modułów)
              </label>
              <input
                type="number"
                value={formData.quantity}
                onChange={(e) => handleChange('quantity', parseInt(e.target.value, 10) || 1)}
                min="1"
                step="1"
                className={`w-full px-3 py-2 border rounded-md text-sm ${
                  getError('quantity') ? 'border-red-500' : 'border-gray-300'
                }`}
                data-testid="quantity-input"
              />
              {getError('quantity') && <p className="mt-1 text-xs text-red-600">{getError('quantity')}</p>}
            </div>
          )}

          {/* === SEKCJA B: Dobór z katalogu === */}
          <div className="border-t border-gray-200 pt-4">
            <CatalogPicker
              label={isLoad ? 'Typ odbioru z katalogu' : 'Typ generatora/inwertera z katalogu'}
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
