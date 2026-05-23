/**
 * OsdDataForm — formularz danych OSD dla wniosku przyłączeniowego.
 *
 * Edytuje wszystkie pola SldTitleBlockData wymagane przez operatorów
 * dystrybucyjnych (PSE / Energa / Tauron / Enea / PGE). Po wypełnieniu
 * dane trafiają do title block na SLD i do raportu OSD (PDF/DOCX).
 *
 * 4 sekcje:
 *  1. Operator OSD (preset selector dla 5 polskich operatorów)
 *  2. Projekt (nr rysunku, lokalizacja, inwestor, faza, status, data)
 *  3. Projektant + Sprawdzający (imię + uprawnienia SEP D/E)
 *  4. Skalowanie i format (skala, A0-A3, arkusz X z Y)
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import type { SldTitleBlockData } from '../sld/v2/canvas/SldTitleBlock';

type OsdOperatorKey = 'PSE' | 'ENEA' | 'ENERGA' | 'TAURON' | 'PGE' | 'INNY';

const OSD_OPERATORS: Readonly<Record<OsdOperatorKey, { label: string; full: string }>> = {
  PSE: { label: 'PSE', full: 'Polskie Sieci Elektroenergetyczne S.A.' },
  ENEA: { label: 'Enea', full: 'Enea Operator Sp. z o.o.' },
  ENERGA: { label: 'Energa', full: 'Energa-Operator S.A.' },
  TAURON: { label: 'Tauron', full: 'Tauron Dystrybucja S.A.' },
  PGE: { label: 'PGE', full: 'PGE Dystrybucja S.A.' },
  INNY: { label: 'Inny', full: '' },
};

const PROJECT_PHASE_LABELS: Readonly<Record<NonNullable<SldTitleBlockData['phase']>, string>> = {
  PB: 'PB — Projekt budowlany',
  PW: 'PW — Projekt wykonawczy',
  PR: 'PR — Projekt rozbudowy',
  PK: 'PK — Projekt koncepcyjny',
};

const STATUS_LABELS: Readonly<Record<NonNullable<SldTitleBlockData['status']>, string>> = {
  DRAFT: 'Szkic (DRAFT)',
  AUDIT: 'Do audytu (AUDIT)',
  RELEASED: 'Wydany (RELEASED)',
  ARCHIVED: 'Archiwum (ARCHIVED)',
};

export interface OsdDataFormProps {
  readonly isOpen: boolean;
  readonly data?: Partial<SldTitleBlockData>;
  readonly onClose: () => void;
  readonly onSave?: (data: SldTitleBlockData) => void | Promise<void>;
}

export function OsdDataForm({ isOpen, data, onClose, onSave }: OsdDataFormProps): JSX.Element | null {
  const [form, setForm] = useState<SldTitleBlockData>(data ?? {});
  const [operatorKey, setOperatorKey] = useState<OsdOperatorKey>('INNY');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setForm(data ?? {});
      setSaveError(null);
      // Pre-select operator from osdOperator field if matches
      const op = (data?.osdOperator ?? '').toUpperCase();
      const match = (Object.keys(OSD_OPERATORS) as OsdOperatorKey[]).find((k) =>
        op.includes(k),
      );
      setOperatorKey(match ?? 'INNY');
    }
  }, [isOpen, data]);

  const handleChange = useCallback(<K extends keyof SldTitleBlockData>(field: K, value: SldTitleBlockData[K]) => {
    setSaveError(null);
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleOperatorChange = useCallback((key: OsdOperatorKey) => {
    setOperatorKey(key);
    if (key !== 'INNY') {
      const full = OSD_OPERATORS[key].full;
      setForm((prev) => ({ ...prev, osdOperator: full }));
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave?.(form);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Nie udało się zapisać danych OSD.');
    } finally {
      setSaving(false);
    }
  }, [form, onClose, onSave]);

  if (!isOpen) return null;

  const inputClass = clsx(
    'w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded',
    'focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100',
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      data-testid="osd-data-form"
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[640px] max-w-[95vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Dane wniosku OSD"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Dane OSD — wniosek przyłączeniowy</h3>
            <p className="text-[10px] text-gray-500">
              Wymagane przez operatora dystrybucyjnego. Dane trafiają do title block SLD i raportu OSD.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-400"
            aria-label="Zamknij"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* SEKCJA 1: Operator OSD */}
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Operator dystrybucyjny
            </legend>
            <div>
              <label className="block text-[11px] text-gray-500 mb-0.5">
                Operator OSD <span className="text-red-500">*</span>
                <span className="ml-1 cursor-help text-blue-400" title="PSE = Krajowy operator przesyłowy. Reszta = OSD dystrybucji.">
                  ⓘ
                </span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(OSD_OPERATORS) as [OsdOperatorKey, { label: string }][]).map(([key, { label }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleOperatorChange(key)}
                    className={clsx(
                      'px-3 py-1.5 text-[11px] rounded border',
                      operatorKey === key
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                    )}
                    data-testid={`osd-operator-${key}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-0.5">
                Pełna nazwa operatora
              </label>
              <input
                type="text"
                value={form.osdOperator ?? ''}
                onChange={(e) => handleChange('osdOperator', e.target.value)}
                className={inputClass}
                placeholder="np. PGE Dystrybucja S.A."
                disabled={operatorKey !== 'INNY'}
                data-testid="osd-operator-full"
              />
            </div>
          </fieldset>

          {/* SEKCJA 2: Projekt */}
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Projekt
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Numer rysunku</label>
                <input
                  type="text"
                  value={form.drawingNumber ?? ''}
                  onChange={(e) => handleChange('drawingNumber', e.target.value)}
                  className={inputClass}
                  placeholder="np. SLD-15kV-001"
                  data-testid="osd-drawing-number"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Rewizja</label>
                <input
                  type="text"
                  value={form.revision ?? ''}
                  onChange={(e) => handleChange('revision', e.target.value)}
                  className={inputClass}
                  placeholder="R00, R01, R02..."
                  data-testid="osd-revision"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-0.5">
                Inwestor
                <span className="ml-1 cursor-help text-blue-400" title="Podmiot zlecający projekt - wymagane przez OSD.">ⓘ</span>
              </label>
              <input
                type="text"
                value={form.investor ?? ''}
                onChange={(e) => handleChange('investor', e.target.value)}
                className={inputClass}
                placeholder="np. Spółka deweloperska Sp. z o.o."
                data-testid="osd-investor"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-0.5">Lokalizacja</label>
              <input
                type="text"
                value={form.location ?? ''}
                onChange={(e) => handleChange('location', e.target.value)}
                className={inputClass}
                placeholder="ulica, gmina, działka nr"
                data-testid="osd-location"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">
                  Faza projektu
                  <span className="ml-1 cursor-help text-blue-400" title="PB - budowlany, PW - wykonawczy, PR - rozbudowy, PK - koncepcyjny">ⓘ</span>
                </label>
                <select
                  value={form.phase ?? ''}
                  onChange={(e) => handleChange('phase', (e.target.value || undefined) as SldTitleBlockData['phase'])}
                  className={inputClass}
                  data-testid="osd-phase"
                >
                  <option value="">— wybierz —</option>
                  {Object.entries(PROJECT_PHASE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Status</label>
                <select
                  value={form.status ?? ''}
                  onChange={(e) => handleChange('status', (e.target.value || undefined) as SldTitleBlockData['status'])}
                  className={inputClass}
                  data-testid="osd-status"
                >
                  <option value="">— wybierz —</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-0.5">Data wydania</label>
              <input
                type="date"
                value={form.issueDate ?? ''}
                onChange={(e) => handleChange('issueDate', e.target.value)}
                className={inputClass}
                data-testid="osd-issue-date"
              />
            </div>
          </fieldset>

          {/* SEKCJA 3: Projektant + Sprawdzający */}
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Projektant i sprawdzający
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">
                  Projektant
                  <span className="ml-1 cursor-help text-blue-400" title="Imię i nazwisko projektanta odpowiedzialnego.">ⓘ</span>
                </label>
                <input
                  type="text"
                  value={form.designer ?? ''}
                  onChange={(e) => handleChange('designer', e.target.value)}
                  className={inputClass}
                  placeholder="Imię Nazwisko"
                  data-testid="osd-designer"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">
                  Uprawnienia SEP D
                  <span className="ml-1 cursor-help text-blue-400" title="Numer uprawnień SEP D (dozór E) - kategoria 1 (urządzenia, instalacje, sieci do 1 kV) lub kategoria E (powyżej 1 kV).">ⓘ</span>
                </label>
                <input
                  type="text"
                  value={form.designerQualification ?? ''}
                  onChange={(e) => handleChange('designerQualification', e.target.value)}
                  className={inputClass}
                  placeholder="np. SEP D nr 12345"
                  data-testid="osd-designer-qual"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Sprawdzający</label>
                <input
                  type="text"
                  value={form.approver ?? ''}
                  onChange={(e) => handleChange('approver', e.target.value)}
                  className={inputClass}
                  placeholder="Imię Nazwisko"
                  data-testid="osd-approver"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">
                  Uprawnienia SEP E
                  <span className="ml-1 cursor-help text-blue-400" title="Numer uprawnień SEP E (eksploatacja E).">ⓘ</span>
                </label>
                <input
                  type="text"
                  value={form.approverQualification ?? ''}
                  onChange={(e) => handleChange('approverQualification', e.target.value)}
                  className={inputClass}
                  placeholder="np. SEP E nr 67890"
                  data-testid="osd-approver-qual"
                />
              </div>
            </div>
          </fieldset>

          {/* SEKCJA 4: Skalowanie i format */}
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Format wydruku
            </legend>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Format</label>
                <select
                  value={form.sheetFormat ?? 'A3'}
                  onChange={(e) => handleChange('sheetFormat', e.target.value)}
                  className={inputClass}
                  data-testid="osd-format"
                >
                  <option value="A4">A4 (210×297)</option>
                  <option value="A3">A3 (297×420)</option>
                  <option value="A2">A2 (420×594)</option>
                  <option value="A1">A1 (594×841)</option>
                  <option value="A0">A0 (841×1189)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Skala</label>
                <input
                  type="text"
                  value={form.scale ?? ''}
                  onChange={(e) => handleChange('scale', e.target.value)}
                  className={inputClass}
                  placeholder="1:1000"
                  data-testid="osd-scale"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Arkusz</label>
                <input
                  type="text"
                  value={form.sheetNumber ?? ''}
                  onChange={(e) => handleChange('sheetNumber', e.target.value)}
                  className={inputClass}
                  placeholder="1/3"
                  data-testid="osd-sheet-number"
                />
              </div>
            </div>
          </fieldset>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          {saveError && (
            <div
              className="mr-auto max-w-[400px] text-[11px] leading-snug text-red-700"
              role="alert"
              data-testid="osd-save-error"
            >
              {saveError}
            </div>
          )}
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
            disabled={saving}
            className="px-4 py-1.5 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:cursor-not-allowed disabled:bg-gray-300"
            data-testid="osd-save"
          >
            {saving ? 'Zapisywanie...' : 'Zapisz dane OSD'}
          </button>
        </div>
      </div>
    </div>
  );
}
