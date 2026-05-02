/**
 * TrunkContinueModal — dialog "Kontynuuj magistralę".
 *
 * Mapuje się na operację domenową: continue_trunk_segment_sn.
 * Dodaje kolejny odcinek do istniejącej magistrali SN.
 * Tryby: create / edit.
 * Walidacja inline + komunikaty PL.
 * Brak fizyki — wyłącznie formularz prezentacyjny.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CatalogPicker, type CatalogEntry } from './CatalogPicker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SegmentKind = 'KABEL_SN' | 'LINIA_NAPOWIETRZNA';
export type GeometryMode = 'ODCINEK_PROSTY' | 'ZALAMANIE' | 'RASTER';
export type Direction = 'N' | 'E' | 'S' | 'W';

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
  cableCatalogEntries?: CatalogEntry[];
  lineCatalogEntries?: CatalogEntry[];
  catalogLoading?: boolean;
  catalogLoadError?: string | null;
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

  if (!data.catalog_ref) {
    errors.push({ field: 'catalog_ref', message: 'Wybór typu z katalogu jest wymagany' });
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
};

function engineeringTrunkLabel(trunkId: string): string {
  if (!trunkId.trim()) {
    return 'Pierwszy odcinek magistrali SN';
  }

  const indexedMatch = trunkId.match(/(?:corridor|trunk|magistrala)[_-]?(\d+)/i);
  if (indexedMatch?.[1]) {
    return `Magistrala SN ${Number(indexedMatch[1])}`;
  }

  return 'Magistrala SN';
}

function engineeringPortLabel(portId: string): string {
  const normalized = portId.trim().toLowerCase();
  if (!normalized) return 'zacisk pola SN';
  if (normalized.includes('branch')) return 'zacisk odgałęźny SN';
  if (normalized.includes('out')) return 'zacisk wyjściowy pola SN';
  if (normalized.includes('in')) return 'zacisk wejściowy pola SN';
  return 'zacisk pola SN';
}

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
  cableCatalogEntries = [],
  lineCatalogEntries = [],
  catalogLoading = false,
  catalogLoadError = null,
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
    setFormData((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'segment_kind' ? { catalog_ref: null } : {}),
    }));
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

  const activeCatalogEntries = useMemo(
    () => (formData.segment_kind === 'LINIA_NAPOWIETRZNA' ? lineCatalogEntries : cableCatalogEntries),
    [cableCatalogEntries, formData.segment_kind, lineCatalogEntries],
  );

  if (!isOpen) return null;
  const terminalDisplayName = terminalName || terminalId;
  const trunkDisplayName = engineeringTrunkLabel(trunkId);
  const terminalPortDisplayName = engineeringPortLabel(terminalPortId);
  const sectionTitleClass =
    'mb-3 font-mono-eng text-[11px] font-bold uppercase tracking-[0.22em] text-[#19e6ff]';
  const labelClass =
    'mb-1 block font-mono-eng text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8eb1cf]';
  const inputClass =
    'w-full border border-[#28425f] bg-[#07111c] px-3 py-2 font-mono-eng text-sm text-[#e6f4ff] outline-none focus:border-[#04d6ff]';
  const readOnlyInputClass = `${inputClass} text-[#8fb3d1]`;
  const selectClass = `${inputClass} disabled:border-[#22364e] disabled:bg-[#050c14] disabled:text-[#607d99]`;
  const sectionDividerClass = 'border-t border-[#17314c] pt-4';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#010711]/75 backdrop-blur-sm">
      <div className="mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto border border-[#24405d] bg-[#07111c] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        {/* Header */}
        <div className="border-b border-[#17314c] bg-[#081522] px-6 py-4">
          <h2 className="font-mono-eng text-lg font-semibold text-white">
            {mode === 'create' ? 'Połącz zacisk pola SN z odcinkiem' : 'Edycja odcinka magistrali'}
          </h2>
          <p className="mt-1 font-mono-eng text-xs text-[#8eb1cf]">
            {trunkDisplayName} &middot; Zacisk: {terminalDisplayName}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <h3 className={sectionTitleClass}>Kontekst pola</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Magistrala</label>
                <input
                  type="text"
                  value={trunkDisplayName}
                  readOnly={true}
                  className={readOnlyInputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Zacisk źródłowy</label>
                <input
                  type="text"
                  value={terminalDisplayName}
                  readOnly={true}
                  className={readOnlyInputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Rola zacisku</label>
                <input
                  type="text"
                  value={terminalPortDisplayName}
                  readOnly={true}
                  className={readOnlyInputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Napięcie odniesienia</label>
                <input
                  type="text"
                  value={terminalVoltageLabel}
                  readOnly={true}
                  className={readOnlyInputClass}
                />
              </div>
            </div>
          </div>

          {submitDisabledReason && (
            <div className="border border-[#a16207] bg-[#241806] px-3 py-2 text-xs text-[#ffc46b]">
              {submitDisabledReason}
            </div>
          )}

          {/* === SEKCJA: Dane wymagane === */}
          <div>
            <h3 className={sectionTitleClass}>Dane wymagane</h3>

            {/* Rodzaj odcinka */}
            <div className="mb-3">
              <label className={labelClass}>Rodzaj odcinka</label>
              <select
                value={formData.segment_kind}
                onChange={(e) => handleChange('segment_kind', e.target.value)}
                disabled={lockSegmentKind}
                className={`${selectClass} ${
                  getFieldError('segment_kind') ? 'border-[#ff4d4d]' : ''
                }`}
              >
                {Object.entries(SEGMENT_KIND_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
              {getFieldError('segment_kind') && (
                <p className="mt-1 text-xs text-[#ff6b6b]">{getFieldError('segment_kind')}</p>
              )}
              {lockSegmentKind && (
                <p className="mt-1 text-xs text-[#607d99]">
                  Rodzina odcinka została ustalona w poprzednim kroku i nie jest tutaj zmieniana.
                </p>
              )}
            </div>

            {/* Długość */}
            <div>
              <label className={labelClass}>Długość [m]</label>
              <input
                type="number"
                value={formData.length_m}
                onChange={(e) => handleChange('length_m', parseFloat(e.target.value) || 0)}
                step="1"
                min="0"
                className={`${inputClass} ${
                  getFieldError('length_m') ? 'border-[#ff4d4d]' : ''
                }`}
                placeholder="np. 350"
              />
              {getFieldError('length_m') && (
                <p className="mt-1 text-xs text-[#ff6b6b]">{getFieldError('length_m')}</p>
              )}
            </div>
          </div>

          {/* === SEKCJA: Katalog === */}
          <div className={sectionDividerClass}>
            <h3 className={sectionTitleClass}>Katalog</h3>

            {catalogLoading ? (
              <div className="border border-[#174c75] bg-[#071b2b] px-3 py-2 text-xs text-[#a8c7e2]">
                Ładowanie katalogu kabli i linii SN...
              </div>
            ) : activeCatalogEntries.length > 0 ? (
              <CatalogPicker
                label={
                  formData.segment_kind === 'LINIA_NAPOWIETRZNA'
                    ? 'Typ linii z katalogu'
                    : 'Typ kabla z katalogu'
                }
                entries={activeCatalogEntries}
                selectedId={formData.catalog_ref ?? ''}
                onChange={(id) => handleChange('catalog_ref', id || null)}
                required
                error={getFieldError('catalog_ref')}
                placeholder="Wyszukaj typ w katalogu SN"
              />
            ) : (
              <div className="border border-[#a16207] bg-[#241806] px-3 py-2 text-xs text-[#ffc46b]">
                {catalogLoadError ?? 'Brak pozycji katalogowych dla wybranego rodzaju odcinka.'}
              </div>
            )}

            {/* Info badge */}
            <div className="flex items-start gap-2 border border-[#174c75] bg-[#071b2b] px-3 py-2">
              <span className="mt-0.5 text-sm font-bold text-[#19e6ff]">i</span>
              <p className="text-xs text-[#a8c7e2]">
                Wybór katalogu jest wymagany przed utworzeniem odcinka.
              </p>
            </div>
          </div>

          {/* === SEKCJA: Geometria (opcjonalnie) === */}
          <div className={sectionDividerClass}>
            <h3 className={sectionTitleClass}>Geometria</h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Kierunek prowadzenia */}
              <div>
                <label className={labelClass}>Kierunek prowadzenia</label>
                <select
                  value={formData.geometry_mode}
                  onChange={(e) => handleChange('geometry_mode', e.target.value)}
                  className={selectClass}
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
                <label className={labelClass}>Kierunek</label>
                <select
                  value={formData.direction}
                  onChange={(e) => handleChange('direction', e.target.value)}
                  className={selectClass}
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
          <div className={sectionDividerClass}>
            <h3 className={sectionTitleClass}>Uwagi</h3>

            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
              placeholder="Dodatkowe informacje..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-[#17314c] bg-[#050c14] px-6 py-4">
          <button
            onClick={onCancel}
            className="border border-[#28425f] bg-[#07111c] px-4 py-2 text-sm font-medium text-[#b7d3ed] hover:border-[#42617e] hover:bg-[#0a1826]"
          >
            Anuluj
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitDisabled}
            className="border border-[#1e6bff] bg-[#2864e8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3474ff] disabled:cursor-not-allowed disabled:border-[#22364e] disabled:bg-[#0b1623] disabled:text-[#607d99]"
          >
            {mode === 'create' ? 'Dodaj odcinek' : 'Zapisz zmiany'}
          </button>
        </div>
      </div>
    </div>
  );
}
