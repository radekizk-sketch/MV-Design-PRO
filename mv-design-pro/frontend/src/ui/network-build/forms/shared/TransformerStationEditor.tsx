import { useCallback, useEffect, useMemo, useState } from 'react';
import { CatalogPicker, type CatalogEntry } from '../../../topology/modals/CatalogPicker';
import {
  CatalogPreview,
  type CatalogPreviewSection,
} from '../../../topology/modals/CatalogPreview';
import { ExpertOverrides, type OverrideEntry } from '../../../topology/modals/ExpertOverrides';

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

export interface TransformerStationEditorProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  embedded?: boolean;
  hideHeader?: boolean;
  initialData?: Partial<TransformerStationFormData>;
  busOptions: Array<{ ref_id: string; name: string; voltage_kv: number }>;
  catalogEntries?: CatalogEntry[];
  catalogPreviewData?: Record<
    string,
    { name: string; manufacturer?: string; sections: CatalogPreviewSection[] }
  >;
  onSubmit: (data: TransformerStationFormData) => void;
  onCancel: () => void;
}

interface FieldError {
  field: string;
  message: string;
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

export function TransformerStationEditor({
  isOpen,
  mode,
  embedded = false,
  hideHeader = false,
  initialData,
  busOptions,
  catalogEntries = [],
  catalogPreviewData = {},
  onSubmit,
  onCancel,
}: TransformerStationEditorProps) {
  const [formData, setFormData] = useState<TransformerStationFormData>({
    ...DEFAULT_DATA,
    ...initialData,
  });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [isExpertMode, setIsExpertMode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({ ...DEFAULT_DATA, ...initialData });
      setErrors([]);
      setIsExpertMode(false);
    }
  }, [initialData, isOpen]);

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
  }, [formData, isExpertMode, onSubmit]);

  const getError = (field: string): string | undefined =>
    errors.find((error) => error.field === field)?.message;

  const previewData = useMemo(
    () => (formData.catalog_ref ? catalogPreviewData[formData.catalog_ref] : null),
    [catalogPreviewData, formData.catalog_ref],
  );

  const expertAvailableKeys = useMemo(() => {
    if (!previewData) return [];
    return previewData.sections.flatMap((section) =>
      section.params.map((param) => ({
        key: param.label,
        label: param.label,
        catalogValue: param.value,
        unit: param.unit,
      })),
    );
  }, [previewData]);

  if (!isOpen) {
    return null;
  }

  const content = (
    <>
      {!hideHeader && (
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'create'
              ? 'Nowa stacja transformatorowa'
              : 'Edycja stacji transformatorowej'}
          </h2>
        </div>
      )}

      <div className="space-y-4 px-6 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Identyfikator</label>
            <input
              type="text"
              value={formData.ref_id}
              onChange={(event) => handleChange('ref_id', event.target.value)}
              disabled={mode === 'edit'}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                getError('ref_id') ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {getError('ref_id') && (
              <p className="mt-1 text-xs text-red-600">{getError('ref_id')}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nazwa</label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => handleChange('name', event.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                getError('name') ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {getError('name') && <p className="mt-1 text-xs text-red-600">{getError('name')}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Szyna strony górnej (GN)
            </label>
            <select
              value={formData.hv_bus_ref}
              onChange={(event) => handleChange('hv_bus_ref', event.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                getError('hv_bus_ref') ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">— wybierz —</option>
              {busOptions.map((bus) => (
                <option key={bus.ref_id} value={bus.ref_id}>
                  {bus.name} ({bus.voltage_kv} kV)
                </option>
              ))}
            </select>
            {getError('hv_bus_ref') && (
              <p className="mt-1 text-xs text-red-600">{getError('hv_bus_ref')}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Szyna strony dolnej (DN)
            </label>
            <select
              value={formData.lv_bus_ref}
              onChange={(event) => handleChange('lv_bus_ref', event.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                getError('lv_bus_ref') ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">— wybierz —</option>
              {busOptions.map((bus) => (
                <option key={bus.ref_id} value={bus.ref_id}>
                  {bus.name} ({bus.voltage_kv} kV)
                </option>
              ))}
            </select>
            {getError('lv_bus_ref') && (
              <p className="mt-1 text-xs text-red-600">{getError('lv_bus_ref')}</p>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Pozycja zaczepu</label>
          <input
            type="number"
            value={formData.tap_position}
            onChange={(event) => handleChange('tap_position', parseInt(event.target.value, 10) || 0)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

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

        {previewData && (
          <CatalogPreview
            typeName={previewData.name}
            manufacturer={previewData.manufacturer}
            sections={previewData.sections}
          />
        )}

        {formData.catalog_ref && (
          <ExpertOverrides
            isExpertMode={isExpertMode}
            onToggleExpert={setIsExpertMode}
            overrides={formData.overrides}
            onOverridesChange={(overrides) => handleChange('overrides', overrides)}
            availableKeys={expertAvailableKeys}
          />
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
        <button
          onClick={onCancel}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Anuluj
        </button>
        <button
          onClick={handleSubmit}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {mode === 'create' ? 'Dodaj' : 'Zapisz'}
        </button>
      </div>
    </>
  );

  if (embedded) {
    return <div className="rounded-lg border border-slate-200 bg-white">{content}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl">
        {content}
      </div>
    </div>
  );
}
