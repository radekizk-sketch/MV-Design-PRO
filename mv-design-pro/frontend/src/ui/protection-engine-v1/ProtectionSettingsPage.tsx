/**
 * ProtectionSettingsPage â€” Nastawy zabezpieczen nadpradowych.
 *
 * Wyswietla liste zabezpieczen z mozliwoscia konfiguracji nastaw:
 * - I> (pierwszy stopien nadpradowy)
 * - I>> (drugi stopien nadpradowy / zwarciowy)
 * - t1, t2 (czasy zadziaĹ‚ania)
 * - Typ krzywej (DT, IEC SI/VI/EI/LI)
 *
 * CANONICAL: brak fizyki, pure configuration/display UI.
 * BINDING: Polish labels, brak codenames.
 */

import { useMemo } from 'react';
import { useSnapshotStore } from '../topology/snapshotStore';
import type { ProtectionAssignment, ProtectionSetting } from '../../types/enm';

// =============================================================================
// Helpers
// =============================================================================

const FUNCTION_LABELS: Record<string, string> = {
  overcurrent_50: 'I>> (zwarciowy)',
  overcurrent_51: 'I> (nadpradowy)',
  earth_fault_50N: 'Ie>> (doziemny zwarciowy)',
  earth_fault_51N: 'Ie> (doziemny nadpradowy)',
  directional_67: '67 (kierunkowy)',
  directional_67N: '67N (kierunkowy doziemny)',
};

const CURVE_LABELS: Record<string, string> = {
  DT: 'Czas staly (DT)',
  IEC_SI: 'IEC Standard Inverse (SI)',
  IEC_VI: 'IEC Very Inverse (VI)',
  IEC_EI: 'IEC Extremely Inverse (EI)',
  IEC_LI: 'IEC Long Time Inverse (LI)',
};

function formatSetting(setting: ProtectionSetting): {
  functionLabel: string;
  threshold: string;
  timeDelay: string;
  curveLabel: string;
} {
  return {
    functionLabel: FUNCTION_LABELS[setting.function_type] ?? setting.function_type,
    threshold: setting.threshold_a != null ? `${setting.threshold_a.toFixed(1)} A` : 'â€”',
    timeDelay: setting.time_delay_s != null ? `${setting.time_delay_s.toFixed(2)} s` : 'â€”',
    curveLabel: setting.curve_type ? (CURVE_LABELS[setting.curve_type] ?? setting.curve_type) : 'â€”',
  };
}

// =============================================================================
// Component
// =============================================================================

export function ProtectionSettingsPage() {
  const snapshot = useSnapshotStore((state) => state.snapshot);

  const assignments: ProtectionAssignment[] = useMemo(() => {
    if (!snapshot) return [];
    return [...(snapshot.protection_assignments ?? [])].sort((a, b) =>
      a.ref_id.localeCompare(b.ref_id),
    );
  }, [snapshot]);

  if (!snapshot) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">[SET]</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            Brak modelu sieci
          </h2>
          <p className="text-sm text-gray-500">
            Zaladuj lub utworz model sieci, aby skonfigurowac nastawy zabezpieczen.
          </p>
        </div>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="h-full overflow-y-auto bg-gray-50">
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h1 className="text-2xl font-semibold text-gray-800 mb-2">
              Nastawy zabezpieczen
            </h1>
            <p className="text-sm text-gray-500">
              Model nie zawiera zabezpieczen. Dodaj zabezpieczenia w edytorze sieci
              lub w module rozdzielnic.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h1 className="text-2xl font-semibold text-gray-800">
            Nastawy zabezpieczen
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Konfiguracja nastaw zabezpieczen nadpradowych I{'>'}/I{'>>'}. Liczba zabezpieczen: {assignments.length}
          </p>
        </div>

        {/* Protection Assignments Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Zabezpieczenie
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Wylacznik
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Typ
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Funkcja
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Prog (A)
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Czas (s)
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Krzywa
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments.map((assignment) => {
                const settings = assignment.settings ?? [];
                if (settings.length === 0) {
                  return (
                    <tr key={assignment.ref_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {assignment.name}
                        <div className="text-xs text-gray-400 font-mono">{assignment.ref_id}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                        {assignment.breaker_ref}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {assignment.device_type}
                      </td>
                      <td colSpan={4} className="px-4 py-3 text-sm text-gray-400 italic">
                        Brak zdefiniowanych nastaw
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-1 text-xs rounded bg-amber-100 text-amber-700">
                          {assignment.is_enabled ? 'Aktywny' : 'Nieaktywny'}
                        </span>
                      </td>
                    </tr>
                  );
                }

                return settings.map((setting, idx) => {
                  const { functionLabel, threshold, timeDelay, curveLabel } = formatSetting(setting);
                  return (
                    <tr
                      key={`${assignment.ref_id}-${idx}`}
                      className="hover:bg-gray-50"
                    >
                      {idx === 0 && (
                        <>
                          <td
                            className="px-4 py-3 text-sm font-medium text-gray-900"
                            rowSpan={settings.length}
                          >
                            {assignment.name}
                            <div className="text-xs text-gray-400 font-mono">{assignment.ref_id}</div>
                          </td>
                          <td
                            className="px-4 py-3 text-sm text-gray-600 font-mono"
                            rowSpan={settings.length}
                          >
                            {assignment.breaker_ref}
                          </td>
                          <td
                            className="px-4 py-3 text-sm text-gray-600"
                            rowSpan={settings.length}
                          >
                            {assignment.device_type}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {functionLabel}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right font-mono">
                        {threshold}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right font-mono">
                        {timeDelay}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {curveLabel}
                      </td>
                      {idx === 0 && (
                        <td
                          className="px-4 py-3 text-center"
                          rowSpan={settings.length}
                        >
                          <span
                            className={`px-2 py-1 text-xs rounded ${
                              assignment.is_enabled
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {assignment.is_enabled ? 'Aktywny' : 'Nieaktywny'}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
