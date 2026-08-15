/**
 * Protection Case Configuration Panel — P14c
 *
 * Panel konfiguracji zabezpieczeń dla przypadku obliczeniowego.
 * - wybór szablonu nastaw z biblioteki
 * - podgląd manifestu biblioteki
 * - formularz nastaw (tylko wartości, bez fizyki)
 * - oznaczenie zgodności z biblioteką
 *
 * Tryby:
 * - MODEL_EDIT: RO
 * - CASE_CONFIG: edycja dozwolona
 * - RESULT_VIEW: RO
 */

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import type { ProtectionSettingTemplate } from '../protection/types';
import { fetchProtectionTypesByCategory } from '../protection/api';
import { exportProtectionLibrary } from '../protection/api';
import type { ProtectionConfig, UpdateProtectionConfigRequest } from './api';
import { getProtectionConfig, updateProtectionConfig } from './api';
import { PREFIKS_URZADZENIA_KOORDYNACJI } from '../protection-coordination/nastawyPrzypadku';

// =============================================================================
// Types
// =============================================================================

interface ProtectionCaseConfigPanelProps {
  caseId: string;
  isReadOnly: boolean; // true for MODEL_EDIT and RESULT_VIEW
  onConfigUpdated?: () => void;
}

interface SettingFieldValue {
  value: number | string;
  unit?: string;
}

// =============================================================================
// Component
// =============================================================================

export function ProtectionCaseConfigPanel({
  caseId,
  isReadOnly,
  onConfigUpdated,
}: ProtectionCaseConfigPanelProps) {
  // State
  const [templates, setTemplates] = useState<ProtectionSettingTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ProtectionSettingTemplate | null>(null);
  const [config, setConfig] = useState<ProtectionConfig | null>(null);
  const [overrides, setOverrides] = useState<Record<string, SettingFieldValue>>({});
  const [libraryFingerprint, setLibraryFingerprint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load templates from catalog
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const data = await fetchProtectionTypesByCategory('TEMPLATE');
        setTemplates(data as ProtectionSettingTemplate[]);
      } catch (err) {
        console.error('Failed to load templates:', err);
        setError('Nie udało się załadować szablonów');
      }
    };
    loadTemplates();
  }, []);

  // Load protection config for case
  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true);
      try {
        const data = await getProtectionConfig(caseId);
        setConfig(data);
        // K5-B: słownik overrides jest WSPÓŁDZIELONY z wykonawcą nastaw E-28
        // (wpisy `coordination_device:*`). PUT wysyła całość, więc panel musi
        // trzymać pełny słownik także bez szablonu — inaczej zapis szablonu
        // kasowałby urządzenia koordynacji.
        setOverrides((data.overrides || {}) as Record<string, SettingFieldValue>);
        if (data.template_ref) {
          setSelectedTemplateId(data.template_ref);
        }
      } catch (err) {
        console.error('Failed to load protection config:', err);
        setError('Nie udało się załadować konfiguracji');
      } finally {
        setIsLoading(false);
      }
    };
    loadConfig();
  }, [caseId]);

  // Load library fingerprint
  useEffect(() => {
    const loadLibraryFingerprint = async () => {
      try {
        const exportData = await exportProtectionLibrary();
        setLibraryFingerprint(exportData.manifest.fingerprint);
      } catch (err) {
        console.error('Failed to load library fingerprint:', err);
      }
    };
    loadLibraryFingerprint();
  }, []);

  // Update selected template when selectedTemplateId changes
  useEffect(() => {
    if (selectedTemplateId) {
      const template = templates.find((t) => t.id === selectedTemplateId);
      setSelectedTemplate(template || null);
    } else {
      setSelectedTemplate(null);
    }
  }, [selectedTemplateId, templates]);

  // Save configuration
  const handleSave = useCallback(async () => {
    if (!selectedTemplateId) {
      setError('Wybierz szablon nastaw');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Get current library export for manifest
      const exportData = await exportProtectionLibrary();

      const request: UpdateProtectionConfigRequest = {
        template_ref: selectedTemplateId,
        template_fingerprint: exportData.manifest.fingerprint,
        library_manifest_ref: {
          library_id: exportData.manifest.library_id,
          revision: exportData.manifest.revision,
          vendor: exportData.manifest.vendor,
          series: exportData.manifest.series,
        },
        overrides,
      };

      await updateProtectionConfig(caseId, request);
      onConfigUpdated?.();
    } catch (err) {
      console.error('Failed to save protection config:', err);
      setError('Nie udało się zapisać konfiguracji');
    } finally {
      setIsSaving(false);
    }
  }, [caseId, selectedTemplateId, overrides, onConfigUpdated]);

  // Handle template selection
  const handleTemplateChange = useCallback(
    (templateId: string) => {
      if (isReadOnly) return;
      setSelectedTemplateId(templateId);
      // Reset nadpisań PÓL przy zmianie szablonu — wpisy urządzeń koordynacji
      // (`coordination_device:*`, K5-B) należą do INNEGO konsumenta i muszą
      // przetrwać (PUT wysyła cały słownik).
      setOverrides((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(([klucz]) =>
            klucz.startsWith(PREFIKS_URZADZENIA_KOORDYNACJI)
          )
        )
      );
    },
    [isReadOnly]
  );

  // Handle setting field value change
  const handleFieldChange = useCallback(
    (fieldName: string, value: string) => {
      if (isReadOnly) return;
      setOverrides((prev) => ({
        ...prev,
        [fieldName]: {
          value: parseFloat(value) || value,
          unit: selectedTemplate?.setting_fields?.find((f) => f.name === fieldName)?.unit,
        },
      }));
    },
    [isReadOnly, selectedTemplate]
  );

  // Check if library is consistent
  const isLibraryConsistent =
    config?.template_fingerprint && libraryFingerprint
      ? config.template_fingerprint === libraryFingerprint
      : true;

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500">
        Ładowanie konfiguracji zabezpieczeń...
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 bg-white border border-gray-200 rounded">
      <h3 className="text-lg font-semibold text-gray-900">Zabezpieczenia</h3>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Template selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Szablon nastaw
        </label>
        <select
          value={selectedTemplateId || ''}
          onChange={(e) => handleTemplateChange(e.target.value)}
          disabled={isReadOnly || isSaving}
          className={clsx(
            'w-full px-3 py-2 border rounded',
            isReadOnly || isSaving
              ? 'bg-gray-100 cursor-not-allowed'
              : 'bg-white border-gray-300 hover:border-gray-400'
          )}
        >
          <option value="">-- Wybierz szablon --</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name_pl}
            </option>
          ))}
        </select>
      </div>

      {/* Library consistency indicator */}
      {config?.template_ref && (
        <div
          className={clsx(
            'p-2 rounded text-sm',
            isLibraryConsistent
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          )}
        >
          {isLibraryConsistent ? 'Zgodne z biblioteka' : 'Biblioteka zmieniona'}
        </div>
      )}

      {/* Library manifest info */}
      {config?.library_manifest_ref && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded text-sm space-y-1">
          <div className="font-medium text-gray-700">Manifest biblioteki:</div>
          <div className="text-gray-600">
            Vendor: {config.library_manifest_ref.vendor || 'N/A'}
          </div>
          <div className="text-gray-600">
            Series: {config.library_manifest_ref.series || 'N/A'}
          </div>
          <div className="text-gray-600">
            Revision: {config.library_manifest_ref.revision || 'N/A'}
          </div>
        </div>
      )}

      {/* Setting fields form */}
      {selectedTemplate && selectedTemplate.setting_fields && (
        <div className="space-y-3">
          <div className="font-medium text-gray-700">Nastawy:</div>
          {selectedTemplate.setting_fields.map((field) => {
            const fieldValue = overrides[field.name]?.value || '';
            return (
              <div key={field.name}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.name}
                  {field.unit && <span className="text-gray-500 ml-1">[{field.unit}]</span>}
                </label>
                <input
                  type="number"
                  value={fieldValue}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  disabled={isReadOnly || isSaving}
                  min={field.min}
                  max={field.max}
                  step="any"
                  className={clsx(
                    'w-full px-3 py-2 border rounded',
                    isReadOnly || isSaving
                      ? 'bg-gray-100 cursor-not-allowed'
                      : 'bg-white border-gray-300 hover:border-gray-400'
                  )}
                  placeholder={`Min: ${field.min || 'N/A'}, Max: ${field.max || 'N/A'}`}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Save button */}
      {!isReadOnly && (
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={isSaving || !selectedTemplateId}
            className={clsx(
              'px-4 py-2 rounded font-medium',
              isSaving || !selectedTemplateId
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}
          >
            {isSaving ? 'Zapisywanie...' : 'Zapisz konfigurację'}
          </button>
        </div>
      )}
    </div>
  );
}
