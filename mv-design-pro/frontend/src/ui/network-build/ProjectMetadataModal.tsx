/**
 * ProjectMetadataModal — Modal metadanych projektu.
 *
 * Wyświetla i umożliwia edycję: nazwa projektu, opis, numer umowy/zlecenia,
 * projektant, data, lokalizacja, wersja, uwagi.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';

// =============================================================================
// Types
// =============================================================================

export interface ProjectMetadata {
  projectName: string;
  description: string;
  contractNumber: string;
  designer: string;
  createdDate: string;
  modifiedDate: string;
  location: string;
  version: string;
  notes: string;
  voltageLevel: string;
  networkType: string;
}

export interface ProjectMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata?: Partial<ProjectMetadata>;
  onSave?: (metadata: ProjectMetadata) => void | Promise<void>;
}

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_METADATA: ProjectMetadata = {
  projectName: '',
  description: '',
  contractNumber: '',
  designer: '',
  createdDate: new Date().toISOString().split('T')[0],
  modifiedDate: new Date().toISOString().split('T')[0],
  location: '',
  version: '1.0',
  notes: '',
  voltageLevel: '15 kV',
  networkType: 'Promieniowa z rezerwą',
};

// =============================================================================
// Component
// =============================================================================

export function ProjectMetadataModal({
  isOpen,
  onClose,
  metadata,
  onSave,
}: ProjectMetadataModalProps) {
  const [form, setForm] = useState<ProjectMetadata>({ ...DEFAULT_METADATA, ...metadata });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const projectNameValid = form.projectName.trim().length > 0;

  useEffect(() => {
    if (isOpen) {
      setForm({ ...DEFAULT_METADATA, ...metadata });
      setSaveError(null);
      requestAnimationFrame(() => {
        nameInputRef.current?.focus();
      });
    }
  }, [isOpen, metadata]);

  const handleChange = useCallback(
    (field: keyof ProjectMetadata, value: string) => {
      setSaveError(null);
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!form.projectName.trim()) {
      nameInputRef.current?.focus();
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave?.(form);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Nie udało się zapisać metadanych projektu.');
    } finally {
      setSaving(false);
    }
  }, [form, onSave, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[560px] max-w-[95vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Metadane projektu"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">Metadane projektu</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-400"
            aria-label="Zamknij"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Identyfikacja */}
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Identyfikacja
            </legend>
            <Field
              label="Nazwa projektu"
              value={form.projectName}
              onChange={(v) => handleChange('projectName', v)}
              placeholder="np. Sieć SN Gmina Przykład"
              required
              inputRef={nameInputRef}
              error={!projectNameValid ? 'Nazwa projektu jest wymagana.' : undefined}
              dataTestId="project-metadata-name"
            />
            <Field
              label="Opis"
              value={form.description}
              onChange={(v) => handleChange('description', v)}
              placeholder="Krótki opis zakresu projektu"
              multiline
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Numer umowy / zlecenia"
                value={form.contractNumber}
                onChange={(v) => handleChange('contractNumber', v)}
                placeholder="np. ZL/2026/001"
              />
              <Field
                label="Projektant"
                value={form.designer}
                onChange={(v) => handleChange('designer', v)}
                placeholder="Imię i nazwisko"
              />
            </div>
          </fieldset>

          {/* Parametry sieci */}
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Parametry sieci
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Poziom napięcia"
                value={form.voltageLevel}
                onChange={(v) => handleChange('voltageLevel', v)}
                placeholder="np. 15 kV"
              />
              <Field
                label="Typ sieci"
                value={form.networkType}
                onChange={(v) => handleChange('networkType', v)}
                placeholder="np. Promieniowa z rezerwą"
              />
            </div>
            <Field
              label="Lokalizacja"
              value={form.location}
              onChange={(v) => handleChange('location', v)}
              placeholder="Obszar / gmina / powiat"
            />
          </fieldset>

          {/* Wersjonowanie */}
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Wersjonowanie
            </legend>
            <div className="grid grid-cols-3 gap-3">
              <Field
                label="Wersja"
                value={form.version}
                onChange={(v) => handleChange('version', v)}
                placeholder="1.0"
              />
              <Field
                label="Data utworzenia"
                value={form.createdDate}
                onChange={(v) => handleChange('createdDate', v)}
                type="date"
              />
              <Field
                label="Data modyfikacji"
                value={form.modifiedDate}
                onChange={(v) => handleChange('modifiedDate', v)}
                type="date"
              />
            </div>
          </fieldset>

          {/* Uwagi */}
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Uwagi
            </legend>
            <Field
              label="Uwagi dodatkowe"
              value={form.notes}
              onChange={(v) => handleChange('notes', v)}
              placeholder="Dodatkowe informacje, założenia projektowe..."
              multiline
              rows={3}
            />
          </fieldset>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          {saveError ? (
            <div
              className="mr-auto max-w-[320px] text-[11px] leading-snug text-red-700"
              role="alert"
              data-testid="project-metadata-save-error"
            >
              {saveError}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!projectNameValid || saving}
            className="px-4 py-1.5 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            data-testid="project-metadata-save"
          >
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Field helper
// =============================================================================

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  multiline,
  rows = 2,
  inputRef,
  error,
  dataTestId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  inputRef?: React.Ref<HTMLInputElement>;
  error?: string;
  dataTestId?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] text-gray-500 mb-0.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={clsx(
            'w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded',
            'focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100',
            'placeholder:text-gray-300 resize-none',
          )}
        />
      ) : (
        <input
          ref={inputRef}
          type={type}
          autoFocus={Boolean(inputRef)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          data-testid={dataTestId}
          className={clsx(
            'w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded',
            'focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100',
            'placeholder:text-gray-300',
          )}
        />
      )}
      {error && <div className="mt-1 text-[10px] text-red-600">{error}</div>}
    </div>
  );
}
