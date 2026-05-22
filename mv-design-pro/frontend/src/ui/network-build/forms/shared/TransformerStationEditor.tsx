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

export type TransformerStationBusSelectionMode = 'existing-buses' | 'station-sides';

export interface TransformerStationEditorProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  embedded?: boolean;
  hideHeader?: boolean;
  busSelectionMode?: TransformerStationBusSelectionMode;
  stationSideLabels?: {
    high: string;
    low: string;
  };
  submitLabel?: string;
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
  busSelectionMode = 'existing-buses',
  stationSideLabels = {
    high: 'Strona SN wyznaczana z odcinka magistrali',
    low: 'Strona nN tworzona za transformatorem',
  },
  submitLabel,
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
        <div className="border-b border-[#24405d] px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            {mode === 'create'
              ? 'Nowa stacja transformatorowa'
              : 'Edycja stacji transformatorowej'}
          </h2>
        </div>
      )}

      <div className="space-y-4 px-6 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#a8c7e2]">Identyfikator</label>
            <input
              type="text"
              value={formData.ref_id}
              onChange={(event) => handleChange('ref_id', event.target.value)}
              disabled={mode === 'edit'}
              className={`w-full rounded-md border bg-[#07111c] px-3 py-2 text-sm text-[#e6f4ff] outline-none ${
                getError('ref_id') ? 'border-red-500' : 'border-[#28425f]'
              }`}
            />
            {getError('ref_id') && (
              <p className="mt-1 text-xs text-[#ff9a9a]">{getError('ref_id')}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#a8c7e2]">Nazwa</label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => handleChange('name', event.target.value)}
              className={`w-full rounded-md border bg-[#07111c] px-3 py-2 text-sm text-[#e6f4ff] outline-none ${
                getError('name') ? 'border-red-500' : 'border-[#28425f]'
              }`}
            />
            {getError('name') && <p className="mt-1 text-xs text-[#ff9a9a]">{getError('name')}</p>}
          </div>
        </div>

        {busSelectionMode === 'station-sides' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-[#14532d] bg-[#061f18] px-3 py-2">
              <div className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.12em] text-[#17f7a8]">
                Strona SN
              </div>
              <div className="mt-1 text-sm font-medium text-[#d9ffe9]">
                {stationSideLabels.high}
              </div>
            </div>
            <div className="border border-[#164e63] bg-[#061826] px-3 py-2">
              <div className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.12em] text-[#19e6ff]">
                Strona nN
              </div>
              <div className="mt-1 text-sm font-medium text-[#d7ecff]">
                {stationSideLabels.low}
              </div>
            </div>
          </div>
        )}

        <div className={`grid grid-cols-2 gap-4 ${busSelectionMode === 'station-sides' ? 'hidden' : ''}`}>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#a8c7e2]">
              Szyna strony górnej (GN)
            </label>
            <select
              value={formData.hv_bus_ref}
              onChange={(event) => handleChange('hv_bus_ref', event.target.value)}
              className={`w-full rounded-md border bg-[#07111c] px-3 py-2 text-sm text-[#e6f4ff] outline-none ${
                getError('hv_bus_ref') ? 'border-red-500' : 'border-[#28425f]'
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
              <p className="mt-1 text-xs text-[#ff9a9a]">{getError('hv_bus_ref')}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#a8c7e2]">
              Szyna strony dolnej (DN)
            </label>
            <select
              value={formData.lv_bus_ref}
              onChange={(event) => handleChange('lv_bus_ref', event.target.value)}
              className={`w-full rounded-md border bg-[#07111c] px-3 py-2 text-sm text-[#e6f4ff] outline-none ${
                getError('lv_bus_ref') ? 'border-red-500' : 'border-[#28425f]'
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
              <p className="mt-1 text-xs text-[#ff9a9a]">{getError('lv_bus_ref')}</p>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#a8c7e2]">Pozycja zaczepu</label>
          <input
            type="number"
            value={formData.tap_position}
            onChange={(event) => handleChange('tap_position', parseInt(event.target.value, 10) || 0)}
            className="w-full rounded-md border border-[#28425f] bg-[#07111c] px-3 py-2 text-sm text-[#e6f4ff] outline-none focus:border-[#04d6ff]"
          />
        </div>

        <div className="border-t border-[#24405d] pt-4">
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

      <div className="flex justify-end gap-3 border-t border-[#24405d] px-6 py-4">
        <button
          onClick={onCancel}
          className="rounded-md border border-[#28425f] bg-[#07111c] px-4 py-2 text-sm font-medium text-[#c7dff6] hover:border-[#3a668f]"
        >
          Anuluj
        </button>
        <button
          onClick={handleSubmit}
          data-testid="transformer-station-submit"
          className="rounded-md bg-[#2563eb] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8]"
        >
          {submitLabel ?? (mode === 'create' ? 'Dodaj' : 'Zapisz')}
        </button>
      </div>
    </>
  );

  if (embedded) {
    return <div className="border border-[#24405d] bg-[#081522]">{content}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#010711]/75 backdrop-blur-sm">
      <div className="mx-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-[#24405d] bg-[#07111c] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        {content}
      </div>
    </div>
  );
}
