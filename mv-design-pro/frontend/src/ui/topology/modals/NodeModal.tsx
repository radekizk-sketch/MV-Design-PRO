/**
 * NodeModal — edytor węzła (szyny) SN.
 *
 * Tryby: create / edit.
 * Walidacja inline + komunikaty PL.
 * Deterministyczne domyślne wartości.
 */

import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NodeFormData {
  ref_id: string;
  name: string;
  voltage_kv: number;
  phase_system: '3ph';
  zone: string;
  tags: string[];
}

interface NodeModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<NodeFormData>;
  existingRefIds?: string[];
  onSubmit: (data: NodeFormData) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FieldError {
  field: string;
  message: string;
}

function validateForm(data: NodeFormData, mode: 'create' | 'edit', existingRefIds: string[]): FieldError[] {
  const errors: FieldError[] = [];

  if (!data.ref_id.trim()) {
    errors.push({ field: 'ref_id', message: 'Identyfikator jest wymagany' });
  } else if (mode === 'create' && existingRefIds.includes(data.ref_id)) {
    errors.push({ field: 'ref_id', message: 'Identyfikator już istnieje' });
  }

  if (!data.name.trim()) {
    errors.push({ field: 'name', message: 'Nazwa jest wymagana' });
  }

  if (data.voltage_kv <= 0) {
    errors.push({ field: 'voltage_kv', message: 'Napięcie musi być > 0 kV' });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_DATA: NodeFormData = {
  ref_id: '',
  name: '',
  voltage_kv: 15.0,
  phase_system: '3ph',
  zone: '',
  tags: [],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NodeModal({
  isOpen,
  mode,
  initialData,
  existingRefIds = [],
  onSubmit,
  onCancel,
}: NodeModalProps) {
  const [formData, setFormData] = useState<NodeFormData>({ ...DEFAULT_DATA, ...initialData });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setFormData({ ...DEFAULT_DATA, ...initialData });
      setErrors([]);
      setTouched(new Set());
    }
  }, [isOpen, initialData]);

  const handleChange = useCallback((field: keyof NodeFormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => new Set(prev).add(field));
  }, []);

  const handleSubmit = useCallback(() => {
    const validationErrors = validateForm(formData, mode, existingRefIds);
    setErrors(validationErrors);
    if (validationErrors.length === 0) {
      onSubmit(formData);
    }
  }, [formData, mode, existingRefIds, onSubmit]);

  const getFieldError = (field: string): string | undefined => {
    if (!touched.has(field) && errors.length === 0) return undefined;
    return errors.find((e) => e.field === field)?.message;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'create' ? 'Nowy węzeł (szyna)' : 'Edycja węzła'}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Identyfikator */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Identyfikator (ref_id)
            </label>
            <input
              type="text"
              value={formData.ref_id}
              onChange={(e) => handleChange('ref_id', e.target.value)}
              disabled={mode === 'edit'}
              className={`w-full px-3 py-2 border rounded-md text-sm ${
                getFieldError('ref_id') ? 'border-red-500' : 'border-gray-300'
              } ${mode === 'edit' ? 'bg-gray-100' : ''}`}
              placeholder="np. bus_sn_01"
            />
            {getFieldError('ref_id') && (
              <p className="mt-1 text-xs text-sygnal-blokada">{getFieldError('ref_id')}</p>
            )}
          </div>

          {/* Nazwa */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nazwa
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md text-sm ${
                getFieldError('name') ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="np. Szyna główna SN"
            />
            {getFieldError('name') && (
              <p className="mt-1 text-xs text-sygnal-blokada">{getFieldError('name')}</p>
            )}
          </div>

          {/* Napięcie */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Napięcie znamionowe [kV]
            </label>
            <input
              type="number"
              value={formData.voltage_kv}
              onChange={(e) => handleChange('voltage_kv', parseFloat(e.target.value) || 0)}
              step="0.1"
              min="0"
              className={`w-full px-3 py-2 border rounded-md text-sm ${
                getFieldError('voltage_kv') ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {getFieldError('voltage_kv') && (
              <p className="mt-1 text-xs text-sygnal-blokada">{getFieldError('voltage_kv')}</p>
            )}
          </div>

          {/* Strefa */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Strefa (opcjonalnie)
            </label>
            <input
              type="text"
              value={formData.zone}
              onChange={(e) => handleChange('zone', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="np. GPZ, Feeder_1"
            />
          </div>
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
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            {mode === 'create' ? 'Utwórz' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
}
