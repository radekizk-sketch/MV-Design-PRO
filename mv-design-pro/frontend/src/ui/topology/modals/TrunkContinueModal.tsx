/**
 * TrunkContinueModal — dialog "Kontynuuj magistralę".
 *
 * Mapuje się na operację domenową: continue_trunk_segment_sn.
 * Dodaje kolejny odcinek do istniejącej magistrali SN.
 * Tryby: create / edit.
 * Walidacja inline + komunikaty PL.
 * Brak fizyki — wyłącznie formularz prezentacyjny.
 */

import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SegmentKind = 'KABEL_SN' | 'LINIA_NAPOWIETRZNA';
export type GeometryMode = 'ODCINEK_PROSTY' | 'ZALAMANIE' | 'RASTER';
export type Direction = 'N' | 'E' | 'S' | 'W' | 'NE' | 'SE' | 'SW' | 'NW';

export interface TrunkContinueFormData {
  segment_kind: SegmentKind;
  length_m: number;
  catalog_ref: string | null;
  notes: string;
  geometry_mode: GeometryMode;
  direction: Direction;
}

interface TrunkContinueModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  trunkId: string;
  terminalId: string;
  terminalPortId?: string;
  terminalName?: string;
  terminalVoltageLabel?: string;
  initialData?: Partial<TrunkContinueFormData>;
  submitDisabled?: boolean;
  submitDisabledReason?: string | null;
  onSubmit: (data: TrunkContinueFormData) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FieldError {
  field: string;
  message: string;
}

function validateForm(data: TrunkContinueFormData): FieldError[] {
  const errors: FieldError[] = [];

  if (!data.segment_kind) {
    errors.push({ field: 'segment_kind', message: 'Rodzaj odcinka jest wymagany' });
  }

  if (data.length_m <= 0) {
    errors.push({ field: 'length_m', message: 'Długość musi być > 0 m' });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_DATA: TrunkContinueFormData = {
  segment_kind: 'KABEL_SN',
  length_m: 0,
  catalog_ref: null,
  notes: '',
  geometry_mode: 'ODCINEK_PROSTY',
  direction: 'E',
};

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const SEGMENT_KIND_LABELS: Record<SegmentKind, string> = {
  KABEL_SN: 'Kabel SN',
  LINIA_NAPOWIETRZNA: 'Linia napowietrzna',
};

const GEOMETRY_MODE_LABELS: Record<GeometryMode, string> = {
  ODCINEK_PROSTY: 'Odcinek prosty',
  ZALAMANIE: 'Załamanie',
  RASTER: 'Raster',
};

const DIRECTION_LABELS: Record<Direction, string> = {
  N: 'Północ (N)',
  E: 'Wschód (E)',
  S: 'Południe (S)',
  W: 'Zachód (W)',
  NE: 'Północny-wschód (NE)',
  SE: 'Południowy-wschód (SE)',
  SW: 'Południowy-zachód (SW)',
  NW: 'Północny-zachód (NW)',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TrunkContinueModal({
  isOpen,
  mode,
  trunkId,
  terminalId,
  terminalPortId = '',
  terminalName = '',
  terminalVoltageLabel = '',
  initialData,
  submitDisabled = false,
  submitDisabledReason = null,
  onSubmit,
  onCancel,
}: TrunkContinueModalProps) {
  const [formData, setFormData] = useState<TrunkContinueFormData>({
    ...DEFAULT_DATA,
    ...initialData,
  });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const lockSegmentKind = Boolean(initialData?.segment_kind);

  useEffect(() => {
    if (isOpen) {
      setFormData({ ...DEFAULT_DATA, ...initialData });
      setErrors([]);
      setTouched(new Set());
    }
  }, [isOpen, initialData]);

  const handleChange = useCallback((field: keyof TrunkContinueFormData, value: unknown) => {
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
            {mode === 'create' ? 'Kontynuuj magistrale z terminala pola' : 'Edycja odcinka magistrali'}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Magistrala: {trunkId || 'pierwszy odcinek'} &middot; Terminal pola: {terminalId}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Kontekst pola
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Magistrala</label>
                <input
                  type="text"
                  value={trunkId}
                  readOnly={true}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-50 text-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Terminal pola</label>
                <input
                  type="text"
                  value={terminalId}
                  readOnly={true}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-50 text-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Port terminala</label>
                <input
                  type="text"
                  value={terminalPortId}
                  readOnly={true}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-50 text-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Napiecie odniesienia</label>
                <input
                  type="text"
                  value={terminalVoltageLabel}
                  readOnly={true}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-50 text-gray-700"
                />
              </div>
            </div>
            {terminalName && (
              <p className="mt-2 text-xs text-gray-500">Pole startowe: {terminalName}</p>
            )}
          </div>

          {submitDisabledReason && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {submitDisabledReason}
            </div>
          )}

          {/* === SEKCJA: Dane wymagane === */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Dane wymagane
            </h3>

            {/* Rodzaj odcinka */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rodzaj odcinka
              </label>
              <select
                value={formData.segment_kind}
                onChange={(e) => handleChange('segment_kind', e.target.value)}
                disabled={lockSegmentKind}
                className={`w-full px-3 py-2 border rounded-md text-sm ${
                  getFieldError('segment_kind') ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                {Object.entries(SEGMENT_KIND_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
              {getFieldError('segment_kind') && (
                <p className="mt-1 text-xs text-red-600">{getFieldError('segment_kind')}</p>
              )}
              {lockSegmentKind && (
                <p className="mt-1 text-xs text-gray-500">
                  Rodzina odcinka zostala ustalona w kroku E-06 i nie jest tutaj zmieniana.
                </p>
              )}
            </div>

            {/* Długość */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Długość [m]
              </label>
              <input
                type="number"
                value={formData.length_m}
                onChange={(e) => handleChange('length_m', parseFloat(e.target.value) || 0)}
                step="1"
                min="0"
                className={`w-full px-3 py-2 border rounded-md text-sm ${
                  getFieldError('length_m') ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="np. 350"
              />
              {getFieldError('length_m') && (
                <p className="mt-1 text-xs text-red-600">{getFieldError('length_m')}</p>
              )}
            </div>
          </div>

          {/* === SEKCJA: Katalog === */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Katalog
            </h3>

            <div className="mb-3">
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

            {/* Info badge */}
            <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2">
              <span className="mt-0.5 text-blue-500 text-sm font-bold">i</span>
              <p className="text-xs text-blue-700">
                Wybór katalogu jest wymagany przed utworzeniem odcinka.
              </p>
            </div>
          </div>

          {/* === SEKCJA: Geometria (opcjonalnie) === */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Geometria
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Kierunek prowadzenia */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kierunek prowadzenia
                </label>
                <select
                  value={formData.geometry_mode}
                  onChange={(e) => handleChange('geometry_mode', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  {Object.entries(GEOMETRY_MODE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Kierunek */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kierunek
                </label>
                <select
                  value={formData.direction}
                  onChange={(e) => handleChange('direction', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  {Object.entries(DIRECTION_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* === SEKCJA: Uwagi === */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Uwagi
            </h3>

            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none"
              placeholder="Dodatkowe informacje..."
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
            disabled={submitDisabled}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            {mode === 'create' ? 'Dodaj odcinek' : 'Zapisz zmiany'}
          </button>
        </div>
      </div>
    </div>
  );
}
