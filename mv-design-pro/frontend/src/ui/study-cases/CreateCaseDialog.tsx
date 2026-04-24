/**
 * Create Case Dialog Component — P10 FULL MAX
 *
 * Dialog for creating a new study case.
 * Polish UI throughout.
 */

import { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import type { StudyCaseConfig, CreateStudyCaseRequest } from './types';
import { CONFIG_FIELD_LABELS, DEFAULT_STUDY_CASE_CONFIG } from './types';
import { useStudyCasesStore } from './store';

// =============================================================================
// Component Props
// =============================================================================

interface CreateCaseDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (caseId: string) => void;
}

// =============================================================================
// Component
// =============================================================================

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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      clearError();

      const request: CreateStudyCaseRequest = {
        project_id: projectId,
        name: name.trim(),
        description: description.trim(),
        config: useDefaultConfig ? undefined : config,
        set_active: setActive,
      };

      try {
        const newCase = await createCase(request);
        onCreated?.(newCase.id);
        onClose();
        // Reset form
        setName('');
        setDescription('');
        setSetActive(true);
        setUseDefaultConfig(true);
        setConfig(DEFAULT_STUDY_CASE_CONFIG);
      } catch (err) {
        // Display error in UI; store may also handle it
        if (!useStudyCasesStore.getState().error) {
          console.error('Błąd tworzenia przypadku:', err);
        }
      }
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
    ]
  );

  const handleConfigChange = useCallback(
    (field: keyof StudyCaseConfig, value: number | boolean) => {
      setConfig((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
          Nowy zakres obliczen
          </h2>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Error message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nazwa przypadku *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="np. Wariant podstawowy"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Opis
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcjonalny opis przypadku..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Set active checkbox */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="setActive"
                checked={setActive}
                onChange={(e) => setSetActive(e.target.checked)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="setActive" className="ml-2 text-sm text-gray-700">
                Ustaw jako aktywny zakres
              </label>
            </div>

            {/* Use default config checkbox */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="useDefaultConfig"
                checked={useDefaultConfig}
                onChange={(e) => setUseDefaultConfig(e.target.checked)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="useDefaultConfig" className="ml-2 text-sm text-gray-700">
                Użyj domyślnej konfiguracji
              </label>
            </div>

            {/* Custom config section */}
            {!useDefaultConfig && (
              <div className="border border-gray-200 rounded-lg p-4 mt-4 bg-gray-50">
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Konfiguracja obliczeń
                </h3>
                <div className="space-y-3">
                  {/* C-factors */}
                  <div className="grid grid-cols-2 gap-3">
                    <ConfigField
                      label={CONFIG_FIELD_LABELS.c_factor_max}
                      value={config.c_factor_max}
                      onChange={(v) => handleConfigChange('c_factor_max', v)}
                      type="number"
                      step={0.01}
                    />
                    <ConfigField
                      label={CONFIG_FIELD_LABELS.c_factor_min}
                      value={config.c_factor_min}
                      onChange={(v) => handleConfigChange('c_factor_min', v)}
                      type="number"
                      step={0.01}
                    />
                  </div>

                  {/* Base MVA */}
                  <ConfigField
                    label={CONFIG_FIELD_LABELS.base_mva}
                    value={config.base_mva}
                    onChange={(v) => handleConfigChange('base_mva', v)}
                    type="number"
                    step={1}
                  />

                  {/* Motor contribution */}
                  <ConfigCheckbox
                    label={CONFIG_FIELD_LABELS.include_motor_contribution}
                    checked={config.include_motor_contribution}
                    onChange={(v) => handleConfigChange('include_motor_contribution', v)}
                  />

                  {/* Inverter contribution */}
                  <ConfigCheckbox
                    label={CONFIG_FIELD_LABELS.include_inverter_contribution}
                    checked={config.include_inverter_contribution}
                    onChange={(v) => handleConfigChange('include_inverter_contribution', v)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              disabled={isCreating}
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isCreating}
              className={clsx(
                'px-4 py-2 text-sm font-medium rounded-md',
                name.trim() && !isCreating
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              )}
            >
            {isCreating ? 'Tworzenie...' : 'Utworz zakres'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

interface ConfigFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  type?: 'number';
  step?: number;
}

function ConfigField({ label, value, onChange, step = 1 }: ConfigFieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step={step}
        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
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
        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
      />
      <label className="ml-2 text-sm text-gray-600">{label}</label>
    </div>
  );
}

export default CreateCaseDialog;
