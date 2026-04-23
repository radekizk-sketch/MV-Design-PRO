/**
 * CaseConfigPage — Strona konfiguracji parametrow przypadku obliczeniowego.
 *
 * Umozliwia konfiguracje:
 * - Typ analizy (zwarcia 3F, zwarcia 1F, rozplyw mocy, zabezpieczenia)
 * - Parametry obliczen (standard IEC, metoda, c-factor)
 * - Opcje solvera
 *
 * CANONICAL: brak fizyki, pure configuration UI.
 * BINDING: Polish labels, brak codenames.
 */

import { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { useAppStateStore } from '../app-state';
import type { AnalysisType } from '../app-state/store';

// =============================================================================
// Types
// =============================================================================

interface CaseConfigFormData {
  analysisType: AnalysisType;
  standardVersion: string;
  cFactor: 'max' | 'min';
  method: string;
  voltageRegulation: boolean;
  maxIterations: number;
  convergenceTolerance: number;
}

const DEFAULT_CONFIG: CaseConfigFormData = {
  analysisType: 'SHORT_CIRCUIT',
  standardVersion: 'IEC_60909_2016',
  cFactor: 'max',
  method: 'NR',
  voltageRegulation: false,
  maxIterations: 100,
  convergenceTolerance: 0.0001,
};

// =============================================================================
// Analysis Type Options
// =============================================================================

const ANALYSIS_TYPE_OPTIONS: Array<{
  value: AnalysisType;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    value: 'SHORT_CIRCUIT',
    label: 'Zwarcia (IEC 60909)',
    description: 'Obliczenia pradow zwarciowych wg normy IEC 60909',
    icon: 'SC',
  },
  {
    value: 'LOAD_FLOW',
    label: 'Rozplyw mocy',
    description: 'Obliczenia rozplywu mocy — napiecija, prady, straty',
    icon: 'LF',
  },
  {
    value: 'PROTECTION',
    label: 'Zabezpieczenia',
    description: 'Analiza koordynacji zabezpieczen nadpradowych',
    icon: 'PR',
  },
];

const METHOD_OPTIONS = [
  { value: 'NR', label: 'Newton-Raphson' },
  { value: 'GS', label: 'Gauss-Seidel' },
  { value: 'FD', label: 'Fast Decoupled' },
];

// =============================================================================
// Component
// =============================================================================

export function CaseConfigPage() {
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const setActiveAnalysisType = useAppStateStore((state) => state.setActiveAnalysisType);

  const [config, setConfig] = useState<CaseConfigFormData>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);

  const handleAnalysisTypeChange = useCallback((value: AnalysisType) => {
    setConfig((prev) => ({ ...prev, analysisType: value }));
    setActiveAnalysisType(value);
    setSaved(false);
  }, [setActiveAnalysisType]);

  const handleFieldChange = useCallback(
    <K extends keyof CaseConfigFormData>(key: K, value: CaseConfigFormData[K]) => {
      setConfig((prev) => ({ ...prev, [key]: value }));
      setSaved(false);
    },
    [],
  );

  const handleSave = useCallback(() => {
    // Configuration save would dispatch to backend via study case API
    setSaved(true);
  }, []);

  if (!activeCaseId) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">[CFG]</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            Brak aktywnego przypadku
          </h2>
          <p className="text-sm text-gray-500">
            Wybierz lub utworz zakres obliczen, aby skonfigurowac warunki analizy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h1 className="text-2xl font-semibold text-gray-800">
          Warunki obliczen
          </h1>
          <p className="text-sm text-gray-500 mt-1">
          Zakres obliczen: <span className="font-medium text-gray-700">{activeCaseName ?? activeCaseId}</span>
          </p>
        </div>

        {/* Analysis Type Selection */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
            Typ analizy
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {ANALYSIS_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleAnalysisTypeChange(option.value)}
                className={clsx(
                  'flex flex-col items-center p-4 rounded-lg border-2 transition-all',
                  config.analysisType === option.value
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300',
                )}
              >
                <span className="text-lg font-bold text-gray-600 mb-2">[{option.icon}]</span>
                <span className="text-sm font-medium text-gray-800">{option.label}</span>
                <span className="text-xs text-gray-500 mt-1 text-center">{option.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Short Circuit Parameters */}
        {config.analysisType === 'SHORT_CIRCUIT' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
              Parametry obliczen zwarciowych
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Standard obliczeniowy
                </label>
                <select
                  value={config.standardVersion}
                  onChange={(e) => handleFieldChange('standardVersion', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="IEC_60909_2016">IEC 60909:2016</option>
                  <option value="IEC_60909_2001">IEC 60909:2001</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Wspolczynnik napieciowy c
                </label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="max"
                      checked={config.cFactor === 'max'}
                      onChange={() => handleFieldChange('cFactor', 'max')}
                      className="text-blue-600"
                    />
                    <span className="text-sm">c_max (prady maksymalne)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="min"
                      checked={config.cFactor === 'min'}
                      onChange={() => handleFieldChange('cFactor', 'min')}
                      className="text-blue-600"
                    />
                    <span className="text-sm">c_min (prady minimalne)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Power Flow Parameters */}
        {config.analysisType === 'LOAD_FLOW' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
              Parametry rozplywu mocy
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Metoda obliczeniowa
                </label>
                <select
                  value={config.method}
                  onChange={(e) => handleFieldChange('method', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  {METHOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Maks. iteracji
                </label>
                <input
                  type="number"
                  value={config.maxIterations}
                  onChange={(e) => handleFieldChange('maxIterations', parseInt(e.target.value) || 100)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  min={1}
                  max={1000}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Tolerancja zbieznosci
                </label>
                <input
                  type="number"
                  value={config.convergenceTolerance}
                  onChange={(e) => handleFieldChange('convergenceTolerance', parseFloat(e.target.value) || 0.0001)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  step={0.0001}
                  min={0.000001}
                  max={1}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.voltageRegulation}
                  onChange={(e) => handleFieldChange('voltageRegulation', e.target.checked)}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label className="text-sm text-gray-700">
                  Regulacja napieciowa (zaczepy transformatorow)
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Protection Parameters */}
        {config.analysisType === 'PROTECTION' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
              Parametry analizy zabezpieczen
            </h2>
            <p className="text-sm text-gray-500">
              Analiza zabezpieczen wymaga wczesniejszego wykonania obliczen zwarciowych.
              Nastawy zabezpieczen konfiguruje sie w widoku Nastawy zabezpieczen.
            </p>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end gap-3">
          {saved && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              Zapisano konfiguracje
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            Zapisz konfiguracje
          </button>
        </div>
      </div>
    </div>
  );
}
