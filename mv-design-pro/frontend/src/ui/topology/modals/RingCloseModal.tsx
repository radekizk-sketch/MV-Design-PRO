/**
 * RingCloseModal — dialog "Domknij pierścień + Ustaw NOP".
 *
 * Mapuje się na operacje domenowe:
 *   connect_secondary_ring_sn + set_normal_open_point.
 *
 * Łączy dwa zaciski zamykając pętlę pierścieniową SN
 * i wymusza ustawienie punktu normalnie otwartego (NOP).
 * Walidacja inline + komunikaty PL.
 * Brak fizyki — wyłącznie formularz prezentacyjny.
 */

import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RingSegmentKind = 'KABEL_SN' | 'LINIA_NAPOWIETRZNA';

export interface RingCloseFormData {
  a_label: string;
  b_label: string;
  segment_kind: RingSegmentKind;
  length_m: number;
  nop_required: boolean;
  nop_element: string | null;
  catalog_ref: string | null;
}

interface TerminalRef {
  id: string;
  label: string;
}

interface RingCloseModalProps {
  isOpen: boolean;
  terminalA: TerminalRef;
  terminalB: TerminalRef;
  onSubmit: (data: RingCloseFormData) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FieldError {
  field: string;
  message: string;
}

function validateForm(
  data: RingCloseFormData,
  terminalA: TerminalRef,
  terminalB: TerminalRef,
): FieldError[] {
  const errors: FieldError[] = [];

  if (!terminalA.id) {
    errors.push({ field: 'a_label', message: 'Zacisk A jest wymagany' });
  }
  if (!terminalB.id) {
    errors.push({ field: 'b_label', message: 'Zacisk B jest wymagany' });
  }

  if (!data.segment_kind) {
    errors.push({ field: 'segment_kind', message: 'Rodzaj połączenia jest wymagany' });
  }

  if (data.length_m <= 0) {
    errors.push({ field: 'length_m', message: 'Długość musi być > 0 m' });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const SEGMENT_KIND_LABELS: Record<RingSegmentKind, string> = {
  KABEL_SN: 'Kabel SN',
  LINIA_NAPOWIETRZNA: 'Linia napowietrzna',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RingCloseModal({
  isOpen,
  terminalA,
  terminalB,
  onSubmit,
  onCancel,
}: RingCloseModalProps) {
  const [formData, setFormData] = useState<RingCloseFormData>({
    a_label: terminalA.label,
    b_label: terminalB.label,
    segment_kind: 'KABEL_SN',
    length_m: 0,
    nop_required: true,
    nop_element: null,
    catalog_ref: null,
  });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setFormData({
        a_label: terminalA.label,
        b_label: terminalB.label,
        segment_kind: 'KABEL_SN',
        length_m: 0,
        nop_required: true,
        nop_element: null,
        catalog_ref: null,
      });
      setErrors([]);
      setTouched(new Set());
    }
  }, [isOpen, terminalA, terminalB]);

  const handleChange = useCallback((field: keyof RingCloseFormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => new Set(prev).add(field));
  }, []);

  const handleSubmit = useCallback(() => {
    const validationErrors = validateForm(formData, terminalA, terminalB);
    setErrors(validationErrors);
    if (validationErrors.length === 0) {
      onSubmit(formData);
    }
  }, [formData, terminalA, terminalB, onSubmit]);

  const getFieldError = (field: string): string | undefined => {
    if (!touched.has(field) && errors.length === 0) return undefined;
    return errors.find((e) => e.field === field)?.message;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#010711]/75 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto border border-[#24405d] bg-[#07111c] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#17314c] bg-[#081522]">
          <h2 className="text-lg font-semibold text-white">
            Domknij pierścień i ustaw NOP
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* === SEKCJA: Punkty końcowe pierścienia === */}
          <div>
            <h3 className="text-sm font-semibold text-[#8eb1cf] uppercase tracking-wide mb-3">
              Zaciski zamykanego pierścienia
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Zacisk A — tylko odczyt */}
              <div>
                <label className="block text-sm font-medium text-[#8eb1cf] mb-1">
                  Zacisk A
                </label>
                <input
                  type="text"
                  value={formData.a_label}
                  disabled
                  className="w-full px-3 py-2 border border-[#28425f] bg-[#050c14] text-sm text-[#8fb3d1]"
                />
                {getFieldError('a_label') && (
                  <p className="mt-1 text-xs text-red-600">{getFieldError('a_label')}</p>
                )}
              </div>

              {/* Zacisk B — tylko odczyt */}
              <div>
                <label className="block text-sm font-medium text-[#8eb1cf] mb-1">
                  Zacisk B
                </label>
                <input
                  type="text"
                  value={formData.b_label}
                  disabled
                  className="w-full px-3 py-2 border border-[#28425f] bg-[#050c14] text-sm text-[#8fb3d1]"
                />
                {getFieldError('b_label') && (
                  <p className="mt-1 text-xs text-red-600">{getFieldError('b_label')}</p>
                )}
              </div>
            </div>
          </div>

          {/* === SEKCJA: Parametry połączenia === */}
          <div className="border-t border-[#17314c] pt-4">
            <h3 className="text-sm font-semibold text-[#8eb1cf] uppercase tracking-wide mb-3">
              Parametry połączenia
            </h3>

            {/* Rodzaj połączenia */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-[#8eb1cf] mb-1">
                Rodzaj połączenia
              </label>
              <select
                value={formData.segment_kind}
                onChange={(e) => handleChange('segment_kind', e.target.value)}
                className={`w-full px-3 py-2 border bg-[#07111c] text-sm text-[#e6f4ff] outline-none ${
                  getFieldError('segment_kind') ? 'border-red-500' : 'border-[#28425f]'
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
            </div>

            {/* Długość */}
            <div>
              <label className="block text-sm font-medium text-[#8eb1cf] mb-1">
                Długość [m]
              </label>
              <input
                type="number"
                value={formData.length_m}
                onChange={(e) => handleChange('length_m', parseFloat(e.target.value) || 0)}
                step="1"
                min="0"
                className={`w-full px-3 py-2 border bg-[#07111c] text-sm text-[#e6f4ff] outline-none ${
                  getFieldError('length_m') ? 'border-red-500' : 'border-[#28425f]'
                }`}
                placeholder="np. 200"
              />
              {getFieldError('length_m') && (
                <p className="mt-1 text-xs text-red-600">{getFieldError('length_m')}</p>
              )}
            </div>
          </div>

          {/* === SEKCJA: Punkt normalnie otwarty === */}
          <div className="border-t border-[#17314c] pt-4">
            <h3 className="text-sm font-semibold text-[#8eb1cf] uppercase tracking-wide mb-3">
              Punkt normalnie otwarty
            </h3>

            {/* Warning badge */}
            <div className="flex items-start gap-2 border border-[#a16207] bg-[#241806] px-3 py-2 mb-3">
              <span className="mt-0.5 text-[#ffc46b] text-sm font-bold">!</span>
              <p className="text-xs text-[#ffc46b]">
                Po zamknięciu pierścienia wymagane jest ustawienie NOP
              </p>
            </div>

            {/* NOP required — locked checkbox */}
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={formData.nop_required}
                disabled
                className="h-4 w-4 cursor-not-allowed"
              />
              <label className="text-sm text-[#d7ecff]">
                Ustaw punkt normalnie otwarty
              </label>
              <span className="text-xs text-[#8eb1cf]">(wymagane)</span>
            </div>

            {/* NOP element */}
            <div>
              <label className="block text-sm font-medium text-[#8eb1cf] mb-1">
                Element NOP
              </label>
              <input
                type="text"
                value={formData.nop_element ?? ''}
                onChange={(e) =>
                  handleChange('nop_element', e.target.value.trim() || null)
                }
                className="w-full px-3 py-2 border border-[#28425f] bg-[#07111c] text-sm text-[#e6f4ff] outline-none"
                placeholder="zostanie ustalony po utworzeniu pierścienia"
              />
              <p className="mt-1 text-xs text-[#8eb1cf]">
                Identyfikator elementu NOP — wyświetlany po zamknięciu pierścienia
              </p>
            </div>
          </div>

          {/* === SEKCJA: Katalog === */}
          <div className="border-t border-[#17314c] pt-4">
            <h3 className="text-sm font-semibold text-[#8eb1cf] uppercase tracking-wide mb-3">
              Katalog
            </h3>

            <div>
              <label className="block text-sm font-medium text-[#8eb1cf] mb-1">
                Pozycja katalogowa
              </label>
              <input
                type="text"
                value={formData.catalog_ref ?? ''}
                onChange={(e) =>
                  handleChange('catalog_ref', e.target.value.trim() || null)
                }
                className="w-full px-3 py-2 border border-[#28425f] bg-[#07111c] text-sm text-[#e6f4ff] outline-none"
                placeholder="Wskaż pozycję katalogową"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#17314c] flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-[#b9d4ea] bg-[#091521] border border-[#2a4562] hover:border-[#4b6b89]"
          >
            Anuluj
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-[#075071] border border-[#04d6ff] hover:bg-[#0a678d]"
          >
            Zatwierdź
          </button>
        </div>
      </div>
    </div>
  );
}
