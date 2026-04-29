import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { fetchSourceSystemTypes, getCatalogErrorMessage } from '../../../catalog/api';
import type { SourceSystemCatalogType } from '../../../catalog/types';
import type {
  GpzGroundingType,
  ManualSourceShortCircuitMode,
} from '../catalogPayload';

export interface GridSourceFormData {
  source_name: string;
  sn_voltage_kv: number | null;
  sk3_mva: number | null;
  rx_ratio: number | null;
  short_circuit_mode: ManualSourceShortCircuitMode;
  r_ohm: number | null;
  x_ohm: number | null;
  notes: string;
  catalog_ref: string | null;
  gpz_section_name: string;
  gpz_line_field_name: string;
  sections_count: number;
  manual_mode: boolean;
  zero_sequence_enabled: boolean;
  r0_ohm: number | null;
  x0_ohm: number | null;
  z0_z1_ratio: number | null;
  grounding_type: GpzGroundingType;
  grounding_r_ohm: number | null;
  grounding_x_ohm: number | null;
}

export interface GridSourceEditorProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<GridSourceFormData>;
  onSubmit: (data: GridSourceFormData) => void;
  onCancel: () => void;
}

interface FieldError {
  field: string;
  message: string;
}

const DEFAULT_DATA: GridSourceFormData = {
  source_name: '',
  sn_voltage_kv: null,
  sk3_mva: null,
  rx_ratio: null,
  short_circuit_mode: 'SHORT_CIRCUIT_POWER',
  r_ohm: null,
  x_ohm: null,
  notes: '',
  catalog_ref: null,
  gpz_section_name: '',
  gpz_line_field_name: '',
  sections_count: 1,
  manual_mode: false,
  zero_sequence_enabled: false,
  r0_ohm: null,
  x0_ohm: null,
  z0_z1_ratio: null,
  grounding_type: 'isolated',
  grounding_r_ohm: null,
  grounding_x_ohm: null,
};

const SOURCE_CATALOG_UNAVAILABLE_MESSAGE =
  'Katalog systemów SN jest niedostępny. Włączono ręczną definicję parametrów GPZ; uzupełnij napięcie, Sk3 i R/X.';

const SOURCE_CATALOG_EMPTY_MESSAGE =
  'Brak pozycji katalogowych systemów SN. Włączono ręczną definicję parametrów GPZ; uzupełnij napięcie, Sk3 i R/X.';

function mergeInitialData(initialData?: Partial<GridSourceFormData>): GridSourceFormData {
  const merged = {
    ...DEFAULT_DATA,
    ...initialData,
  };

  return {
    ...merged,
    sections_count: Math.max(1, Math.min(4, Math.trunc(merged.sections_count || 1))),
  };
}

function catalogToFormData(
  catalogItem: SourceSystemCatalogType,
  previous: GridSourceFormData,
): GridSourceFormData {
  return {
    ...previous,
    catalog_ref: catalogItem.id,
    sn_voltage_kv: catalogItem.voltage_rating_kv,
    sk3_mva: catalogItem.sk3_mva,
    rx_ratio: catalogItem.rx_ratio ?? null,
    short_circuit_mode: 'SHORT_CIRCUIT_POWER',
  };
}

function asNullableNumber(rawValue: string): number | null {
  return rawValue.trim() ? Number(rawValue) : null;
}

function validateForm(data: GridSourceFormData): FieldError[] {
  const errors: FieldError[] = [];
  const sourceDescriptor = data.manual_mode
    ? 'ręcznej umowy równoważnej GPZ'
    : 'wybranego katalogu systemowego';

  if (!data.source_name.trim()) {
    errors.push({ field: 'source_name', message: 'Nazwa źródła jest wymagana.' });
  }

  if (!data.manual_mode && !data.catalog_ref?.trim()) {
    errors.push({ field: 'catalog_ref', message: 'Pozycja katalogowa jest wymagana.' });
  }

  if (data.sn_voltage_kv === null || data.sn_voltage_kv <= 0) {
    errors.push({
      field: 'sn_voltage_kv',
      message: `Napięcie SN musi pochodzić z ${sourceDescriptor}.`,
    });
  }

  if (!Number.isInteger(data.sections_count) || data.sections_count < 1 || data.sections_count > 4) {
    errors.push({
      field: 'sections_count',
      message: 'Liczba sekcji GPZ musi mieścić się w zakresie 1-4.',
    });
  }

  if (data.gpz_section_name.trim().length > 0 && data.gpz_section_name.trim().length < 3) {
    errors.push({
      field: 'gpz_section_name',
      message: 'Nazwa sekcji GPZ musi mieć co najmniej 3 znaki.',
    });
  }

  if (data.gpz_line_field_name.trim().length > 0 && data.gpz_line_field_name.trim().length < 3) {
    errors.push({
      field: 'gpz_line_field_name',
      message: 'Nazwa pola liniowego GPZ musi mieć co najmniej 3 znaki.',
    });
  }

  if (data.manual_mode) {
    if (data.short_circuit_mode === 'IMPEDANCE') {
      if (data.r_ohm === null || data.r_ohm < 0) {
        errors.push({
          field: 'r_ohm',
          message: 'W trybie impedancyjnym rezystancja R musi być nieujemna.',
        });
      }
      if (data.x_ohm === null || data.x_ohm <= 0) {
        errors.push({
          field: 'x_ohm',
          message: 'W trybie impedancyjnym reaktancja X musi być dodatnia.',
        });
      }
    } else {
      if (data.sk3_mva === null || data.sk3_mva <= 0) {
        errors.push({
          field: 'sk3_mva',
          message: 'Moc zwarciowa Sk3 musi być dodatnia.',
        });
      }
      if (data.rx_ratio === null || data.rx_ratio < 0) {
        errors.push({
          field: 'rx_ratio',
          message: 'Stosunek R/X musi być nieujemny.',
        });
      }
    }
  } else {
    if (data.sk3_mva === null || data.sk3_mva <= 0) {
      errors.push({
        field: 'sk3_mva',
        message: `Moc zwarciowa Sk3 musi pochodzić z ${sourceDescriptor}.`,
      });
    }
    if (data.rx_ratio === null || data.rx_ratio < 0) {
      errors.push({
        field: 'rx_ratio',
        message: `Stosunek R/X musi pochodzić z ${sourceDescriptor}.`,
      });
    }
  }

  if (data.zero_sequence_enabled) {
    if (data.r0_ohm !== null && data.r0_ohm < 0) {
      errors.push({
        field: 'r0_ohm',
        message: 'R0 nie może być ujemne.',
      });
    }
    if (data.x0_ohm !== null && data.x0_ohm <= 0) {
      errors.push({
        field: 'x0_ohm',
        message: 'X0 musi być dodatnie.',
      });
    }
    if (data.z0_z1_ratio !== null && data.z0_z1_ratio <= 0) {
      errors.push({
        field: 'z0_z1_ratio',
        message: 'Z0/Z1 musi być dodatnie.',
      });
    }
  }

  if (data.grounding_type === 'resistor_grounded') {
    if (data.grounding_r_ohm === null || data.grounding_r_ohm <= 0) {
      errors.push({
        field: 'grounding_r_ohm',
        message: 'Uziemienie rezystorowe wymaga dodatniej rezystancji R.',
      });
    }
  }

  if (data.grounding_type === 'petersen_coil') {
    if (data.grounding_x_ohm === null || data.grounding_x_ohm <= 0) {
      errors.push({
        field: 'grounding_x_ohm',
        message: 'Cewka Petersena wymaga dodatniej reaktancji X.',
      });
    }
  }

  return errors;
}

export function GridSourceEditor({
  isOpen,
  mode,
  initialData,
  onSubmit,
  onCancel,
}: GridSourceEditorProps) {
  const [formData, setFormData] = useState<GridSourceFormData>(mergeInitialData(initialData));
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [catalogItems, setCatalogItems] = useState<SourceSystemCatalogType[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setFormData(mergeInitialData(initialData));
    setErrors([]);
    setTouched(new Set());
  }, [initialData, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError(null);

    fetchSourceSystemTypes()
      .then((items) => {
        if (cancelled) {
          return;
        }
        setCatalogItems(items);
        if (items.length === 0) {
          setCatalogError(SOURCE_CATALOG_EMPTY_MESSAGE);
          setFormData((previous) => ({
            ...previous,
            manual_mode: true,
            catalog_ref: null,
          }));
        }
        setCatalogLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setCatalogItems([]);
        const reason = getCatalogErrorMessage(error) || SOURCE_CATALOG_UNAVAILABLE_MESSAGE;
        setCatalogError(
          `${reason} Włączono ręczną definicję parametrów GPZ; uzupełnij napięcie, Sk3 i R/X.`,
        );
        setFormData((previous) => ({
          ...previous,
          manual_mode: true,
          catalog_ref: null,
        }));
        setCatalogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const selectedCatalog = useMemo(
    () => catalogItems.find((item) => item.id === formData.catalog_ref) ?? null,
    [catalogItems, formData.catalog_ref],
  );
  const catalogModeUnavailable = Boolean(catalogError) && catalogItems.length === 0;

  useEffect(() => {
    if (!selectedCatalog || formData.manual_mode) {
      return;
    }

    setFormData((previous) => {
      if (
        previous.catalog_ref === selectedCatalog.id &&
        previous.sn_voltage_kv === selectedCatalog.voltage_rating_kv &&
        previous.sk3_mva === selectedCatalog.sk3_mva &&
        previous.rx_ratio === (selectedCatalog.rx_ratio ?? null)
      ) {
        return previous;
      }

      return catalogToFormData(selectedCatalog, previous);
    });
  }, [formData.manual_mode, selectedCatalog]);

  const handleChange = useCallback((field: keyof GridSourceFormData, value: unknown) => {
    setFormData((previous) => ({ ...previous, [field]: value as never }));
    setTouched((previous) => new Set(previous).add(field));
  }, []);

  const handleNumericChange = useCallback(
    (field: keyof GridSourceFormData) =>
      (event: ChangeEvent<HTMLInputElement>) => {
        handleChange(field, asNullableNumber(event.target.value));
      },
    [handleChange],
  );

  const handleCatalogChange = useCallback(
    (catalogRef: string) => {
      const selected = catalogItems.find((item) => item.id === catalogRef) ?? null;
      setTouched((previous) => {
        const next = new Set(previous);
        next.add('catalog_ref');
        next.add('sn_voltage_kv');
        next.add('sk3_mva');
        next.add('rx_ratio');
        return next;
      });

      if (!selected) {
        setFormData((previous) => ({
          ...previous,
          catalog_ref: null,
          sn_voltage_kv: null,
          sk3_mva: null,
          rx_ratio: null,
        }));
        return;
      }

      setFormData((previous) => catalogToFormData(selected, previous));
    },
    [catalogItems],
  );

  const handleModeChange = useCallback(
    (manualMode: boolean) => {
      setTouched((previous) => {
        const next = new Set(previous);
        next.add('catalog_ref');
        next.add('sn_voltage_kv');
        next.add('sk3_mva');
        next.add('rx_ratio');
        next.add('r_ohm');
        next.add('x_ohm');
        return next;
      });

      setFormData((previous) => ({
        ...previous,
        manual_mode: manualMode,
        catalog_ref: manualMode ? null : previous.catalog_ref,
        ...(manualMode || selectedCatalog === null
          ? {}
          : {
              sn_voltage_kv: selectedCatalog.voltage_rating_kv,
              sk3_mva: selectedCatalog.sk3_mva,
              rx_ratio: selectedCatalog.rx_ratio ?? null,
              short_circuit_mode: 'SHORT_CIRCUIT_POWER' as const,
            }),
      }));
    },
    [selectedCatalog],
  );

  const handleSubmit = useCallback(() => {
    const validationErrors = validateForm(formData);
    setErrors(validationErrors);
    if (validationErrors.length === 0) {
      onSubmit(formData);
    }
  }, [formData, onSubmit]);

  const getFieldError = (field: string): string | undefined => {
    if (!touched.has(field) && errors.length === 0) {
      return undefined;
    }
    return errors.find((entry) => entry.field === field)?.message;
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="grid-source-editor-panel h-full min-h-0 bg-[#071018]"
      data-testid="grid-source-editor-shell"
    >
      <div
        role="dialog"
        aria-labelledby="grid-source-editor-title"
        className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0d1724] text-scada-text"
        data-testid="grid-source-editor-dialog"
      >
        <div className="gpz-editor-header shrink-0 border-b border-scada-border bg-[#0a141f] px-5 py-3.5">
          <h2 id="grid-source-editor-title" className="text-[15px] font-semibold text-scada-text">
            {mode === 'create' ? 'Parametry źródła GPZ' : 'Edycja źródła GPZ'}
          </h2>
        </div>

        <div className="gpz-editor-body min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Dane wymagane
            </h3>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nazwa źródła</label>
                <input
                  type="text"
                  value={formData.source_name}
                  onChange={(event) => handleChange('source_name', event.target.value)}
                  className={`w-full rounded-md border px-3 py-2 text-sm ${
                    getFieldError('source_name') ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Nazwa źródła zasilania"
                />
                {getFieldError('source_name') && (
                  <p className="mt-1 text-xs text-red-600">{getFieldError('source_name')}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Liczba sekcji GPZ</label>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={formData.sections_count}
                  onChange={(event) =>
                    handleChange(
                      'sections_count',
                      Math.max(1, Math.min(4, Math.trunc(Number(event.target.value || 1)))),
                    )
                  }
                  className={`w-full rounded-md border px-3 py-2 text-sm ${
                    getFieldError('sections_count') ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {getFieldError('sections_count') && (
                  <p className="mt-1 text-xs text-red-600">{getFieldError('sections_count')}</p>
                )}
              </div>
            </div>
          </section>

          <section className="border-t border-gray-200 pt-3">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Sekcja GPZ i pole liniowe
            </h3>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Bazowa nazwa sekcji GPZ</label>
                <input
                  type="text"
                  value={formData.gpz_section_name}
                  onChange={(event) => handleChange('gpz_section_name', event.target.value)}
                  className={`w-full rounded-md border px-3 py-2 text-sm ${
                    getFieldError('gpz_section_name') ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Nazwa sekcji GPZ"
                />
                {getFieldError('gpz_section_name') && (
                  <p className="mt-1 text-xs text-red-600">{getFieldError('gpz_section_name')}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Bazowa nazwa pola liniowego GPZ
                </label>
                <input
                  type="text"
                  value={formData.gpz_line_field_name}
                  onChange={(event) => handleChange('gpz_line_field_name', event.target.value)}
                  className={`w-full rounded-md border px-3 py-2 text-sm ${
                    getFieldError('gpz_line_field_name') ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Nazwa pola liniowego GPZ"
                />
                {getFieldError('gpz_line_field_name') && (
                  <p className="mt-1 text-xs text-red-600">{getFieldError('gpz_line_field_name')}</p>
                )}
              </div>
            </div>

            <p className="mt-2 text-xs text-gray-500">
              Formularz buduje jawne `gpz_sections`. Dla wielu sekcji nazwy są numerowane
              deterministycznie od lewej do prawej.
            </p>
          </section>

          <section className="border-t border-gray-200 pt-3">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Tryb definicji technicznej
            </h3>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleModeChange(false)}
                disabled={catalogModeUnavailable}
                className={`rounded-sm border px-3 py-2 text-sm font-medium transition-colors ${
                  !formData.manual_mode
                    ? 'border-cyan-500/70 bg-cyan-500/15 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                    : 'border-scada-border bg-[#0a141f] text-scada-muted hover:border-cyan-500/45 hover:text-scada-text'
                } disabled:cursor-not-allowed disabled:border-scada-border disabled:bg-[#101827] disabled:text-scada-muted/60`}
              >
                Katalog
              </button>
              <button
                type="button"
                onClick={() => handleModeChange(true)}
                className={`rounded-sm border px-3 py-2 text-sm font-medium transition-colors ${
                  formData.manual_mode
                    ? 'border-amber-400/70 bg-amber-400/12 text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                    : 'border-scada-border bg-[#0a141f] text-scada-muted hover:border-amber-400/45 hover:text-scada-text'
                }`}
              >
                Umowa równoważna ręczna
              </button>
            </div>
          </section>

          <section className="border-t border-gray-200 pt-3">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Pozycja katalogowa systemu SN
            </label>
            <select
              value={formData.catalog_ref ?? ''}
              onChange={(event) => handleCatalogChange(event.target.value)}
              disabled={formData.manual_mode || catalogLoading}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                getFieldError('catalog_ref') ? 'border-red-500' : 'border-gray-300'
              } disabled:bg-gray-100`}
            >
              <option value="">
                {catalogLoading ? 'Ładowanie katalogu...' : '— wybierz pozycję katalogową —'}
              </option>
              {catalogItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.voltage_rating_kv} kV, Sk3 {item.sk3_mva} MVA)
                </option>
              ))}
            </select>
            {catalogError && (
              <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {catalogError}
              </p>
            )}
            {getFieldError('catalog_ref') && (
              <p className="mt-1 text-xs text-red-600">{getFieldError('catalog_ref')}</p>
            )}
          </section>

          <section className="border-t border-gray-200 pt-3">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Parametry zwarciowe
            </h3>

            <div className="mb-3 grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Napięcie SN [kV]</label>
                <input
                  type="number"
                  value={formData.sn_voltage_kv ?? ''}
                  onChange={handleNumericChange('sn_voltage_kv')}
                  disabled={!formData.manual_mode}
                  className={`w-full rounded-md border px-3 py-2 text-sm ${
                    getFieldError('sn_voltage_kv') ? 'border-red-500' : 'border-gray-300'
                  } ${!formData.manual_mode ? 'bg-gray-100 text-gray-500' : ''}`}
                />
                {getFieldError('sn_voltage_kv') && (
                  <p className="mt-1 text-xs text-red-600">{getFieldError('sn_voltage_kv')}</p>
                )}
              </div>

              {formData.manual_mode && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Tryb ręczny</label>
                  <select
                    value={formData.short_circuit_mode}
                    onChange={(event) =>
                      handleChange(
                        'short_circuit_mode',
                        event.target.value === 'IMPEDANCE' ? 'IMPEDANCE' : 'SHORT_CIRCUIT_POWER',
                      )
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="SHORT_CIRCUIT_POWER">Moc zwarciowa + R/X</option>
                    <option value="IMPEDANCE">Impedancja R + X</option>
                  </select>
                </div>
              )}
            </div>

            {formData.manual_mode && formData.short_circuit_mode === 'IMPEDANCE' ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">R [ohm]</label>
                  <input
                    type="number"
                    value={formData.r_ohm ?? ''}
                    onChange={handleNumericChange('r_ohm')}
                    className={`w-full rounded-md border px-3 py-2 text-sm ${
                      getFieldError('r_ohm') ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {getFieldError('r_ohm') && (
                    <p className="mt-1 text-xs text-red-600">{getFieldError('r_ohm')}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">X [ohm]</label>
                  <input
                    type="number"
                    value={formData.x_ohm ?? ''}
                    onChange={handleNumericChange('x_ohm')}
                    className={`w-full rounded-md border px-3 py-2 text-sm ${
                      getFieldError('x_ohm') ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {getFieldError('x_ohm') && (
                    <p className="mt-1 text-xs text-red-600">{getFieldError('x_ohm')}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Sk3 [MVA]</label>
                  <input
                    type="number"
                    value={formData.sk3_mva ?? ''}
                    onChange={handleNumericChange('sk3_mva')}
                    disabled={!formData.manual_mode}
                    className={`w-full rounded-md border px-3 py-2 text-sm ${
                      getFieldError('sk3_mva') ? 'border-red-500' : 'border-gray-300'
                    } ${!formData.manual_mode ? 'bg-gray-100 text-gray-500' : ''}`}
                  />
                  {getFieldError('sk3_mva') && (
                    <p className="mt-1 text-xs text-red-600">{getFieldError('sk3_mva')}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">R/X</label>
                  <input
                    type="number"
                    value={formData.rx_ratio ?? ''}
                    onChange={handleNumericChange('rx_ratio')}
                    disabled={!formData.manual_mode}
                    className={`w-full rounded-md border px-3 py-2 text-sm ${
                      getFieldError('rx_ratio') ? 'border-red-500' : 'border-gray-300'
                    } ${!formData.manual_mode ? 'bg-gray-100 text-gray-500' : ''}`}
                  />
                  {getFieldError('rx_ratio') && (
                    <p className="mt-1 text-xs text-red-600">{getFieldError('rx_ratio')}</p>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="border-t border-gray-200 pt-3">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Składowa zerowa
            </h3>

            <label className="mb-3 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={formData.zero_sequence_enabled}
                onChange={(event) => handleChange('zero_sequence_enabled', event.target.checked)}
              />
              Definiuj parametry składowej zerowej
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">R0 [ohm]</label>
                <input
                  type="number"
                  value={formData.r0_ohm ?? ''}
                  onChange={handleNumericChange('r0_ohm')}
                  disabled={!formData.zero_sequence_enabled}
                  className={`w-full rounded-md border px-3 py-2 text-sm ${
                    getFieldError('r0_ohm') ? 'border-red-500' : 'border-gray-300'
                  } ${!formData.zero_sequence_enabled ? 'bg-gray-100 text-gray-500' : ''}`}
                />
                {getFieldError('r0_ohm') && (
                  <p className="mt-1 text-xs text-red-600">{getFieldError('r0_ohm')}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">X0 [ohm]</label>
                <input
                  type="number"
                  value={formData.x0_ohm ?? ''}
                  onChange={handleNumericChange('x0_ohm')}
                  disabled={!formData.zero_sequence_enabled}
                  className={`w-full rounded-md border px-3 py-2 text-sm ${
                    getFieldError('x0_ohm') ? 'border-red-500' : 'border-gray-300'
                  } ${!formData.zero_sequence_enabled ? 'bg-gray-100 text-gray-500' : ''}`}
                />
                {getFieldError('x0_ohm') && (
                  <p className="mt-1 text-xs text-red-600">{getFieldError('x0_ohm')}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Z0/Z1</label>
                <input
                  type="number"
                  value={formData.z0_z1_ratio ?? ''}
                  onChange={handleNumericChange('z0_z1_ratio')}
                  disabled={!formData.zero_sequence_enabled}
                  className={`w-full rounded-md border px-3 py-2 text-sm ${
                    getFieldError('z0_z1_ratio') ? 'border-red-500' : 'border-gray-300'
                  } ${!formData.zero_sequence_enabled ? 'bg-gray-100 text-gray-500' : ''}`}
                />
                {getFieldError('z0_z1_ratio') && (
                  <p className="mt-1 text-xs text-red-600">{getFieldError('z0_z1_ratio')}</p>
                )}
              </div>
            </div>
          </section>

          <section className="border-t border-gray-200 pt-3">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Uziemienie punktu neutralnego
            </h3>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Typ uziemienia</label>
                <select
                  value={formData.grounding_type}
                  onChange={(event) =>
                    handleChange('grounding_type', event.target.value as GpzGroundingType)
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="isolated">Izolowany</option>
                  <option value="petersen_coil">Cewka Petersena</option>
                  <option value="directly_grounded">Bezpośrednio uziemiony</option>
                  <option value="resistor_grounded">Przez rezystor</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">R uziemienia [ohm]</label>
                <input
                  type="number"
                  value={formData.grounding_r_ohm ?? ''}
                  onChange={handleNumericChange('grounding_r_ohm')}
                  disabled={formData.grounding_type !== 'resistor_grounded'}
                  className={`w-full rounded-md border px-3 py-2 text-sm ${
                    getFieldError('grounding_r_ohm') ? 'border-red-500' : 'border-gray-300'
                  } ${formData.grounding_type !== 'resistor_grounded' ? 'bg-gray-100 text-gray-500' : ''}`}
                />
                {getFieldError('grounding_r_ohm') && (
                  <p className="mt-1 text-xs text-red-600">{getFieldError('grounding_r_ohm')}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">X cewki [ohm]</label>
                <input
                  type="number"
                  value={formData.grounding_x_ohm ?? ''}
                  onChange={handleNumericChange('grounding_x_ohm')}
                  disabled={formData.grounding_type !== 'petersen_coil'}
                  className={`w-full rounded-md border px-3 py-2 text-sm ${
                    getFieldError('grounding_x_ohm') ? 'border-red-500' : 'border-gray-300'
                  } ${formData.grounding_type !== 'petersen_coil' ? 'bg-gray-100 text-gray-500' : ''}`}
                />
                {getFieldError('grounding_x_ohm') && (
                  <p className="mt-1 text-xs text-red-600">{getFieldError('grounding_x_ohm')}</p>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="gpz-editor-footer flex shrink-0 justify-end gap-3 border-t border-scada-border bg-[#0a141f] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-sm border border-scada-border bg-[#101827] px-4 py-2 text-sm font-medium text-scada-muted transition-colors hover:border-cyan-500/45 hover:text-scada-text"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-sm border border-cyan-500/70 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(34,211,238,0.12)] transition-colors hover:bg-cyan-500/30"
          >
            {mode === 'create' ? 'Dodaj źródło GPZ' : 'Zapisz źródło GPZ'}
          </button>
        </div>
      </div>
    </div>
  );
}
