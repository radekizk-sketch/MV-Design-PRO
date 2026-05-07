/**
 * Dialog tworzenia nowego zakresu obliczeń.
 */

import { useCallback, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import type { StudyCase, StudyCaseConfig, CreateStudyCaseRequest } from './types';
import { CONFIG_FIELD_LABELS, DEFAULT_STUDY_CASE_CONFIG } from './types';
import { useStudyCasesStore } from './store';

interface CreateCaseDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (studyCase: StudyCase) => void;
}

export function CreateCaseDialog({
  projectId,
  isOpen,
  onClose,
  onCreated,
}: CreateCaseDialogProps) {
  const { createCase, isCreating, error, clearError } = useStudyCasesStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [setActive, setSetActive] = useState(true);
  const [useDefaultConfig, setUseDefaultConfig] = useState(true);
  const [config, setConfig] = useState<StudyCaseConfig>(DEFAULT_STUDY_CASE_CONFIG);

  const resetForm = useCallback(() => {
    setName('');
    setDescription('');
    setSetActive(true);
    setUseDefaultConfig(true);
    setConfig(DEFAULT_STUDY_CASE_CONFIG);
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      clearError();

      const request: CreateStudyCaseRequest = {
        project_id: projectId,
        name: name.trim(),
        description: description.trim(),
        config: useDefaultConfig ? undefined : config,
        set_active: setActive,
      };

      const newCase = await createCase(request);
      onCreated?.(newCase);
      onClose();
      resetForm();
    },
    [
      projectId,
      name,
      description,
      setActive,
      useDefaultConfig,
      config,
      createCase,
      onCreated,
      onClose,
      clearError,
      resetForm,
    ],
  );

  const handleConfigChange = useCallback(
    (field: keyof StudyCaseConfig, value: number | boolean) => {
      setConfig((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleClose = useCallback(() => {
    if (isCreating) return;
    onClose();
  }, [isCreating, onClose]);

  if (!isOpen) return null;

  const canSubmit = name.trim().length > 0 && !isCreating;

  const dialog = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Nowy zakres obliczeń</h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="study-case-name" className="mb-1 block text-sm font-medium text-gray-700">
                Nazwa zakresu *
              </label>
              <input
                id="study-case-name"
                data-testid="study-case-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="np. Zakres podstawowy"
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                required
                autoFocus
                aria-invalid={!name.trim()}
              />
              {!name.trim() && (
                <p className="mt-1 text-xs text-red-600">Nazwa zakresu jest wymagana.</p>
              )}
            </div>

            <div>
              <label htmlFor="study-case-description" className="mb-1 block text-sm font-medium text-gray-700">
                Opis
              </label>
              <textarea
                id="study-case-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcjonalny opis zakresu..."
                rows={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="setActive"
                checked={setActive}
                onChange={(e) => setSetActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="setActive" className="ml-2 text-sm text-gray-700">
                Ustaw jako aktywny zakres
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="useDefaultConfig"
                checked={useDefaultConfig}
                onChange={(e) => setUseDefaultConfig(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="useDefaultConfig" className="ml-2 text-sm text-gray-700">
                Użyj domyślnej konfiguracji
              </label>
            </div>

            {!useDefaultConfig && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h3 className="mb-3 text-sm font-medium text-gray-700">Konfiguracja obliczeń</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <ConfigField
                      label={CONFIG_FIELD_LABELS.c_factor_max}
                      value={config.c_factor_max}
                      onChange={(v) => handleConfigChange('c_factor_max', v)}
                      step={0.01}
                    />
                    <ConfigField
                      label={CONFIG_FIELD_LABELS.c_factor_min}
                      value={config.c_factor_min}
                      onChange={(v) => handleConfigChange('c_factor_min', v)}
                      step={0.01}
                    />
                  </div>

                  <ConfigField
                    label={CONFIG_FIELD_LABELS.base_mva}
                    value={config.base_mva}
                    onChange={(v) => handleConfigChange('base_mva', v)}
                    step={1}
                  />

                  <ConfigCheckbox
                    label={CONFIG_FIELD_LABELS.include_motor_contribution}
                    checked={config.include_motor_contribution}
                    onChange={(v) => handleConfigChange('include_motor_contribution', v)}
                  />

                  <ConfigCheckbox
                    label={CONFIG_FIELD_LABELS.include_inverter_contribution}
                    checked={config.include_inverter_contribution}
                    onChange={(v) => handleConfigChange('include_inverter_contribution', v)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              disabled={isCreating}
            >
              Anuluj
            </button>
            <button
              type="submit"
              data-testid="study-case-submit"
              disabled={!canSubmit}
              className={clsx(
                'rounded-md px-4 py-2 text-sm font-medium',
                canSubmit
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'cursor-not-allowed bg-gray-200 text-gray-500',
              )}
            >
              {isCreating ? 'Tworzenie...' : 'Utwórz zakres'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}

interface ConfigFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}

function ConfigField({ label, value, onChange, step = 1 }: ConfigFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number.parseFloat(e.target.value) || 0)}
        step={step}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

interface ConfigCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function ConfigCheckbox({ label, checked, onChange }: ConfigCheckboxProps) {
  return (
    <div className="flex items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <label className="ml-2 text-sm text-gray-600">{label}</label>
    </div>
  );
}

export default CreateCaseDialog;
