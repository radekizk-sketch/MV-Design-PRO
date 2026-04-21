/**
 * ModalController — zarządza otwieraniem/zamykaniem modali z menu kontekstowego SLD.
 *
 * Pipeline:
 *   contextMenu → onOperation → ModalController.dispatch(canonicalOp, elementId) → open modal
 *
 * INVARIANTS:
 * - Jeden modal otwarty w danym momencie
 * - Po zatwierdzeniu: executeDomainOp → nowy Snapshot → odświeżenie SLD
 * - Po anulowaniu: zamknięcie bez efektu
 * - 100% etykiety PL
 */

import React, { useState, useCallback } from 'react';
import { getOperationSurfaceByOp } from '../topology/modals/operationSurfaceRegistry';
import { notify } from '../notifications/store';
import type { ElementType } from '../types';
import { requiresCatalog } from '../context-menu/catalogGate';
import { assertCanonicalOpName, canonicalOperationInput } from '../../types/domainOps';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModalControllerState {
  isOpen: boolean;
  canonicalOp: string | null;
  elementId: string | null;
  elementType: ElementType | null;
  modalComponentName: string | null;
  labelPl: string | null;
  /** Dane wstrzyknięte z bramki katalogowej (catalog_binding, catalog_ref) */
  initialFormData: Record<string, unknown>;
}

const CLOSED_STATE: ModalControllerState = {
  isOpen: false,
  canonicalOp: null,
  elementId: null,
  elementType: null,
  modalComponentName: null,
  labelPl: null,
  initialFormData: {},
};

function normalizeModalDispatch(
  canonicalOp: string,
  initialFormData?: Record<string, unknown>,
): { canonicalOp: string; initialFormData: Record<string, unknown> } {
  const normalized = canonicalOperationInput(assertCanonicalOpName(canonicalOp), initialFormData);
  return {
    canonicalOp: normalized.canonicalOp,
    initialFormData: normalized.context ?? {},
  };
}

function requiresCatalogBinding(canonicalOp: string | null): boolean {
  if (!canonicalOp) {
    return false;
  }
  return canonicalOp === 'add_converter_source' || requiresCatalog(canonicalOp);
}

/**
 * Polish labels for domain operation results.
 */
const OP_RESULT_LABELS: Record<string, string> = {
  update_element_parameters: 'Parametry elementu zaktualizowane',
  assign_catalog_to_element: 'Typ z katalogu przypisany',
  continue_trunk_segment_sn: 'Odcinek magistrali SN dodany',
  insert_station_on_segment_sn: 'Stacja SN/nN wstawiona',
  start_branch_segment_sn: 'Odgałęzienie SN dodane',
  insert_section_switch_sn: 'Łącznik sekcyjny wstawiony',
  connect_secondary_ring_sn: 'Pierścień wtórny połączony',
  set_normal_open_point: 'Punkt normalnie otwarty ustawiony',
  add_nn_outgoing_field: 'Odpływ nN dodany',
  add_nn_load: 'Odbiór nN dodany',
  add_converter_source: 'Źródło przekształtnikowe dodane',
  add_genset_nn: 'Agregat dodany',
  add_ups_nn: 'UPS dodany',
  add_relay: 'Zabezpieczenie dodane',
  add_grid_source_sn: 'Źródło SN dodane',
  add_measurement: 'Przekładnik dodany',
  add_transformer_sn_nn: 'Transformator SN/nN dodany',
  add_sn_bay: 'Pole SN dodane',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ModalControllerProps {
  onDomainOpComplete?: (
    canonicalOp: string,
    elementId: string,
    formData: Record<string, unknown>,
  ) => Promise<boolean> | boolean;
}

/**
 * useModalController — hook managing modal lifecycle for SLD context menu.
 */
export function useModalController(
  onDomainOpComplete?: (
    canonicalOp: string,
    elementId: string,
    formData: Record<string, unknown>,
  ) => Promise<boolean> | boolean,
) {
  const [state, setState] = useState<ModalControllerState>(CLOSED_STATE);

  /**
   * Dispatch a modal open request from context menu.
   * Looks up the canonical operation in the modal registry.
   * If found, opens the modal. If not, shows a notification.
   */
  const dispatch = useCallback(
    (
      canonicalOp: string,
      elementId: string,
      elementType: ElementType,
      initialFormData?: Record<string, unknown>,
    ) => {
      const normalized = normalizeModalDispatch(canonicalOp, initialFormData);
      const entry = getOperationSurfaceByOp(normalized.canonicalOp);
      if (entry) {
        setState({
          isOpen: true,
          canonicalOp: normalized.canonicalOp,
          elementId,
          elementType,
          modalComponentName: entry.componentName,
          labelPl: entry.labelPl,
          initialFormData: normalized.initialFormData,
        });
      } else {
        // Operation recognized but no modal — show notification
        const label = OP_RESULT_LABELS[normalized.canonicalOp] ?? normalized.canonicalOp;
        notify(`${label} — ${elementType} (${elementId})`, 'info');
      }
    },
    [],
  );

  /**
   * Close the modal without applying changes.
   */
  const close = useCallback(() => {
    setState(CLOSED_STATE);
  }, []);

  /**
   * Handle modal submit — domain operation completed.
   */
  const handleSubmit = useCallback(
    async (formData: Record<string, unknown>) => {
      if (!state.canonicalOp || !state.elementId) {
        setState(CLOSED_STATE);
        return;
      }

      const label = OP_RESULT_LABELS[state.canonicalOp] ?? state.canonicalOp;

      // Merge initialFormData (np. catalog_binding z bramki katalogowej)
      // z danymi formularza — formData nadpisuje initialFormData
      const mergedData = { ...state.initialFormData, ...formData };
      const missingCatalogBinding =
        requiresCatalogBinding(state.canonicalOp) && !mergedData.catalog_binding;

      if (missingCatalogBinding) {
        notify('Ta operacja wymaga jawnego wyboru typu z katalogu przed zapisem.', 'warning');
        return;
      }

      if (!onDomainOpComplete) {
        notify(label, 'success');
        setState(CLOSED_STATE);
        return;
      }

      const ok = await onDomainOpComplete(
        state.canonicalOp,
        state.elementId,
        mergedData,
      );
      if (ok) {
        notify(label, 'success');
        setState(CLOSED_STATE);
      } else {
        notify('Operacja nie została wykonana. Sprawdź dane i spróbuj ponownie.', 'error');
      }
    },
    [state.canonicalOp, state.elementId, state.initialFormData, onDomainOpComplete],
  );

  return { state, dispatch, close, handleSubmit };
}

// ---------------------------------------------------------------------------
// Operation-specific form field definitions (Polish labels, SI units)
// ---------------------------------------------------------------------------

interface ModalFormField {
  key: string;
  label: string;
  type: 'number' | 'text' | 'select';
  unit?: string;
  defaultValue: unknown;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  step?: number;
}

/**
 * Formularz per operacja — tylko pola które inżynier MUSI wypełnić.
 * Parametry elektryczne (R, X, B, Imax) przychodzą z katalogu automatycznie.
 */
const OPERATION_FORMS: Record<string, ModalFormField[]> = {
  continue_trunk_segment_sn: [
    { key: 'dlugosc_m', label: 'Długość', type: 'number', unit: 'm', defaultValue: null, min: 1, step: 1 },
    { key: 'rodzaj', label: 'Rodzaj', type: 'select', defaultValue: 'KABEL', options: [
      { value: 'KABEL', label: 'Kabel' },
      { value: 'LINIA', label: 'Linia napowietrzna' },
    ]},
  ],
  start_branch_segment_sn: [
    { key: 'dlugosc_m', label: 'Długość', type: 'number', unit: 'm', defaultValue: null, min: 1, step: 1 },
    { key: 'rodzaj', label: 'Rodzaj', type: 'select', defaultValue: 'KABEL', options: [
      { value: 'KABEL', label: 'Kabel' },
      { value: 'LINIA', label: 'Linia napowietrzna' },
    ]},
  ],
  insert_station_on_segment_sn: [
    { key: 'station_name', label: 'Nazwa stacji', type: 'text', defaultValue: '' },
  ],
  add_transformer_sn_nn: [
    { key: 'station_name', label: 'Nazwa stacji', type: 'text', defaultValue: '' },
  ],
  insert_section_switch_sn: [
    { key: 'switch_kind', label: 'Rodzaj', type: 'select', defaultValue: 'ROZLACZNIK', options: [
      { value: 'ROZLACZNIK', label: 'Rozłącznik' },
      { value: 'WYLACZNIK', label: 'Wyłącznik' },
      { value: 'ODLACZNIK', label: 'Odłącznik' },
    ]},
  ],
  add_grid_source_sn: [
    { key: 'sn_mva', label: 'Moc zwarciowa', type: 'number', unit: 'MVA', defaultValue: null, min: 1, step: 10 },
    { key: 'rx_ratio', label: 'R/X', type: 'number', defaultValue: null, min: 0.01, step: 0.01 },
  ],
  add_nn_load: [
    { key: 'p_kw', label: 'Moc czynna', type: 'number', unit: 'kW', defaultValue: null, min: 0, step: 1 },
    { key: 'cos_phi', label: 'cos φ', type: 'number', defaultValue: null, min: 0.1, step: 0.01 },
  ],
};

/**
 * ModalOverlay — renders the currently active modal with operation-specific form fields.
 *
 * Formularz jest generowany na podstawie typu operacji (OPERATION_FORMS).
 * Parametry z katalogu (catalog_binding) są pokazane read-only jeśli obecne.
 * Inżynier wypełnia tylko brakujące dane (długość, moc, cos φ).
 */
const CONVERTER_OPERATION_FORMS: Record<'PV' | 'BESS' | 'FW', ModalFormField[]> = {
  PV: [
    { key: 'p_kw', label: 'Moc szczytowa', type: 'number', unit: 'kWp', defaultValue: null, min: 0, step: 1 },
  ],
  BESS: [
    { key: 'p_kw', label: 'Moc', type: 'number', unit: 'kW', defaultValue: null, min: 0, step: 1 },
    { key: 'e_kwh', label: 'Pojemność', type: 'number', unit: 'kWh', defaultValue: null, min: 0, step: 10 },
  ],
  FW: [
    { key: 'p_kw', label: 'Moc znamionowa', type: 'number', unit: 'kW', defaultValue: null, min: 0, step: 1 },
  ],
};

function normalizeConverterTechnology(value: unknown): 'PV' | 'BESS' | 'FW' | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'PV' || normalized === 'BESS' || normalized === 'FW') {
    return normalized;
  }
  return null;
}

function getOperationFormFields(
  canonicalOp: string | null,
  initialFormData: Record<string, unknown>,
): ModalFormField[] {
  if (canonicalOp === 'add_converter_source') {
    const technology = normalizeConverterTechnology(initialFormData.source_technology) ?? 'PV';
    return CONVERTER_OPERATION_FORMS[technology];
  }
  return OPERATION_FORMS[canonicalOp ?? ''] ?? [];
}

export const ModalOverlay: React.FC<{
  state: ModalControllerState;
  onClose: () => void;
  onSubmit?: (formData: Record<string, unknown>) => void | Promise<void>;
}> = ({ state, onClose, onSubmit }) => {
  // Local form state — initialized from OPERATION_FORMS defaults
  const [formValues, setFormValues] = React.useState<Record<string, unknown>>({});

  // Reset form values when modal opens with new operation
  React.useEffect(() => {
    if (state.isOpen && state.canonicalOp) {
      const fields = getOperationFormFields(state.canonicalOp, state.initialFormData);
      const defaults: Record<string, unknown> = {};
      for (const field of fields) {
        defaults[field.key] = field.defaultValue;
      }
      setFormValues(defaults);
    }
  }, [state.isOpen, state.canonicalOp, state.initialFormData]);

  if (!state.isOpen || !state.labelPl) return null;

  const fields = getOperationFormFields(state.canonicalOp, state.initialFormData);
  const catalogBinding = state.initialFormData.catalog_binding as
    | { name?: string; namespace?: string }
    | undefined;
  const catalogBindingMissing =
    requiresCatalogBinding(state.canonicalOp) && !catalogBinding;

  const handleFieldChange = (key: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleFormSubmit = () => {
    if (onSubmit) {
      void onSubmit(formValues);
    } else {
      onClose();
    }
  };

  return (
    <div
      data-testid="modal-controller-overlay"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-lg mx-4"
        data-testid="modal-controller-content"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {state.labelPl}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            title="Zamknij"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Katalog — read-only info jeśli wybrany */}
          {catalogBinding && (
            <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3">
              <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
                Typ z katalogu
              </div>
              <div className="text-sm font-medium text-blue-900">
                {catalogBinding.name ?? 'Wybrany'}
              </div>
            </div>
          )}
          {catalogBindingMissing && (
            <div
              className="bg-rose-50 border border-rose-200 rounded-md px-4 py-3 text-sm text-rose-700"
              data-testid="modal-catalog-required-warning"
            >
              Ta operacja wymaga wcześniejszego wyboru typu z katalogu. Zamknij formularz i wybierz katalog
              w bramce katalog-first.
            </div>
          )}

          {/* Element info */}
          <div className="text-xs text-gray-500 flex gap-4">
            <span>
              Element: <span className="font-mono font-medium text-gray-700">{state.elementType}</span>
            </span>
            <span>
              ID: <span className="font-mono text-gray-700">{state.elementId}</span>
            </span>
          </div>

          {/* Operation-specific form fields */}
          {fields.length > 0 ? (
            <div className="space-y-3">
              {fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                    {field.unit && (
                      <span className="text-gray-400 font-normal ml-1">[{field.unit}]</span>
                    )}
                  </label>
                  {field.type === 'select' && field.options ? (
                    <select
                      value={String(formValues[field.key] ?? field.defaultValue)}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                      data-testid={`modal-field-${field.key}`}
                    >
                      {field.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : field.type === 'number' ? (
                    <input
                      type="number"
                      value={(formValues[field.key] ?? field.defaultValue ?? '') as string | number}
                      onChange={(e) => {
                        const raw = e.target.value;
                        handleFieldChange(field.key, raw.trim() ? parseFloat(raw) : null);
                      }}
                      min={field.min}
                      step={field.step}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                      data-testid={`modal-field-${field.key}`}
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(formValues[field.key] ?? '')}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                      data-testid={`modal-field-${field.key}`}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Fallback — operacja bez dedykowanych pól */
            <div className="text-sm text-gray-500 py-2">
              Operacja: <span className="font-mono">{state.canonicalOp}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleFormSubmit}
            disabled={catalogBindingMissing}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            data-testid="modal-submit-btn"
          >
            Zastosuj
          </button>
        </div>
      </div>
    </div>
  );
};
