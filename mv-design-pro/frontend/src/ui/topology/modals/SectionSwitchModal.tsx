/**
 * SectionSwitchModal — dialog "Wstaw łącznik sekcyjny".
 *
 * Mapuje się na operację domenową:
 *   insert_section_switch_sn
 *
 * Umożliwia wstawienie łącznika sekcyjnego na odcinku
 * magistrali SN z wyborem rodzaju, stanu i pozycji.
 * Walidacja inline + komunikaty PL.
 * Brak fizyki — wyłącznie formularz prezentacyjny.
 */

import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SwitchKind = 'ROZLACZNIK' | 'WYLACZNIK' | 'ODLACZNIK';

export type SwitchState = 'CLOSED' | 'OPEN';

export interface SectionSwitchFormData {
  ref_id: string;
  name: string;
  switch_kind: SwitchKind;
  switch_state: SwitchState;
  segment_ref: string;
  position_on_segment: number;
  catalog_ref: string | null;
}

interface SectionSwitchModalProps {
  isOpen: boolean;
  segmentRef: string;
  segmentLabel: string;
  onSubmit: (data: SectionSwitchFormData) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FieldError {
  field: string;
  message: string;
}

function validateForm(data: SectionSwitchFormData): FieldError[] {
  const errors: FieldError[] = [];

  if (!data.ref_id.trim()) {
    errors.push({ field: 'ref_id', message: 'Identyfikator jest wymagany' });
  }

  if (!data.name.trim()) {
    errors.push({ field: 'name', message: 'Nazwa jest wymagana' });
  }

  if (data.position_on_segment <= 0 || data.position_on_segment >= 1) {
    errors.push({
      field: 'position_on_segment',
      message: 'Pozycja musi być w zakresie (0, 1) — bez krańców',
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const SWITCH_KIND_LABELS: Record<SwitchKind, string> = {
  ROZLACZNIK: 'Rozłącznik',
  WYLACZNIK: 'Wyłącznik mocy',
  ODLACZNIK: 'Odłącznik',
};

const SWITCH_STATE_LABELS: Record<SwitchState, string> = {
  CLOSED: 'Zamknięty',
  OPEN: 'Otwarty',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SectionSwitchModal({
  isOpen,
  segmentRef,
  segmentLabel,
  onSubmit,
  onCancel,
}: SectionSwitchModalProps) {
  const [formData, setFormData] = useState<SectionSwitchFormData>({
    ref_id: '',
    name: '',
    switch_kind: 'ROZLACZNIK',
    switch_state: 'CLOSED',
    segment_ref: segmentRef,
    position_on_segment: 0.5,
    catalog_ref: null,
  });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setFormData({
        ref_id: '',
        name: '',
        switch_kind: 'ROZLACZNIK',
        switch_state: 'CLOSED',
        segment_ref: segmentRef,
        position_on_segment: 0.5,
        catalog_ref: null,
      });
      setErrors([]);
      setTouched(new Set());
    }
  }, [isOpen, segmentRef]);

  const handleChange = useCallback((field: keyof SectionSwitchFormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => new Set(prev).add(field));
  }, []);

  const handleSubmit = useCallback(() => {
    const validationErrors = validateForm(formData);
    setErrors(validationErrors);
    if (validationErrors.length === 0) {
      onSubmit(formData);
    }
  }, [formData, onSubmit]);

  const getFieldError = (field: string): string | undefined => {
    if (!touched.has(field) && errors.length === 0) return undefined;
    return errors.find((e) => e.field === field)?.message;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Wstaw łącznik sekcyjny
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* === SEKCJA: Odcinek === */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Odcinek
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Odcinek docelowy
              </label>
              <input
                type="text"
                value={segmentLabel}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-100"
              />
              <p className="mt-1 text-xs text-gray-500">
                Referencja: {segmentRef}
              </p>
            </div>
          </div>

          {/* === SEKCJA: Parametry łącznika === */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Parametry łącznika
            </h3>

            {/* Identyfikator */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Identyfikator (ref_id)
              </label>
              <input
                type="text"
                value={formData.ref_id}
                onChange={(e) => handleChange('ref_id', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md text-sm ${
                  getFieldError('ref_id') ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="np. SW-001"
              />
              {getFieldError('ref_id') && (
                <p className="mt-1 text-xs text-sygnal-blokada">{getFieldError('ref_id')}</p>
              )}
            </div>

            {/* Nazwa */}
            <div className="mb-3">
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
                placeholder="np. Łącznik sekcyjny S1"
              />
              {getFieldError('name') && (
                <p className="mt-1 text-xs text-sygnal-blokada">{getFieldError('name')}</p>
              )}
            </div>

            {/* Rodzaj łącznika */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rodzaj łącznika
              </label>
              <select
                value={formData.switch_kind}
                onChange={(e) => handleChange('switch_kind', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                {Object.entries(SWITCH_KIND_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Stan początkowy */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stan początkowy
              </label>
              <select
                value={formData.switch_state}
                onChange={(e) => handleChange('switch_state', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                {Object.entries(SWITCH_STATE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* === SEKCJA: Pozycja na odcinku === */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Pozycja na odcinku
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pozycja (0 &ndash; 1)
              </label>
              <input
                type="range"
                min="0.01"
                max="0.99"
                step="0.01"
                value={formData.position_on_segment}
                onChange={(e) =>
                  handleChange('position_on_segment', parseFloat(e.target.value))
                }
                className="w-full"
              />
              <input
                type="number"
                value={formData.position_on_segment}
                onChange={(e) =>
                  handleChange('position_on_segment', parseFloat(e.target.value) || 0)
                }
                step="0.01"
                min="0.01"
                max="0.99"
                className={`mt-2 w-full px-3 py-2 border rounded-md text-sm ${
                  getFieldError('position_on_segment') ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {getFieldError('position_on_segment') && (
                <p className="mt-1 text-xs text-sygnal-blokada">
                  {getFieldError('position_on_segment')}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                0 = początek odcinka, 1 = koniec odcinka
              </p>
            </div>
          </div>

          {/* === SEKCJA: Powiązanie z katalogiem === */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Powiązanie z katalogiem
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pozycja katalogowa
              </label>
              <input
                type="text"
                value={formData.catalog_ref ?? ''}
                onChange={(e) =>
                  handleChange('catalog_ref', e.target.value.trim() || null)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="Wskaż pozycję katalogową"
              />
            </div>
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
            Zastosuj
          </button>
        </div>
      </div>
    </div>
  );
}
