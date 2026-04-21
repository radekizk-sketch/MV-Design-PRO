import { useMemo } from 'react';
import {
  PROTECTION_STATUS_LABELS,
  type ElementProtectionAssignment,
} from '../protection/element-assignment';
import type { ProtectionFunctionSummary } from '../protection/settings-model';
import { useProtectionReadModel } from '../protection';

const ELEMENT_TYPE_LABELS: Record<string, string> = {
  LineBranch: 'Odcinek liniowy',
  TransformerBranch: 'Transformator',
  Switch: 'Aparat łączeniowy',
  Bus: 'Szyna',
};

const DEVICE_KIND_LABELS: Record<string, string> = {
  RELAY_OVERCURRENT: 'Przekaźnik nadprądowy',
  RELAY_DISTANCE: 'Przekaźnik odległościowy',
  RELAY_DIFFERENTIAL: 'Przekaźnik różnicowy',
  RELAY_EARTH_FAULT: 'Przekaźnik ziemnozwarciowy',
  FUSE: 'Bezpiecznik',
  RECLOSER: 'Reklozer',
  SECTIONALIZER: 'Sekcjonalizer',
  OTHER: 'Inne',
};

function formatComputedValue(functionSummary: ProtectionFunctionSummary): string {
  if (!functionSummary.computed) {
    return '—';
  }
  const value = functionSummary.computed.value.toLocaleString('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return `${value} ${functionSummary.computed.unit}`;
}

function formatTimeDelay(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return `${value.toLocaleString('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} s`;
}

function getElementTypeLabel(elementType: string): string {
  return ELEMENT_TYPE_LABELS[elementType] ?? elementType;
}

function getFunctions(assignment: ElementProtectionAssignment): ProtectionFunctionSummary[] {
  return assignment.settings_summary?.functions ?? [];
}

export function ProtectionSettingsPage() {
  const { data, isLoading, error } = useProtectionReadModel();

  const assignments = useMemo(
    () => [...data.assignments].sort((left, right) => (
      `${left.element_id}:${left.device_id}`.localeCompare(`${right.element_id}:${right.device_id}`)
    )),
    [data.assignments],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">Ładowanie nastaw zabezpieczeń…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="text-sm text-red-600">Błąd: {error}</div>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="h-full overflow-y-auto bg-gray-50">
        <div className="mx-auto max-w-4xl p-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold text-gray-800">Nastawy zabezpieczeń</h1>
            <p className="mt-2 text-sm text-gray-500">
              Bieżący przypadek nie zawiera przypisań ochrony w kanonicznym read modelu.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-800">Nastawy zabezpieczeń</h1>
          <p className="mt-1 text-sm text-gray-500">
            Widok kanonicznego read modelu ochrony dla aktywnego przypadku obliczeniowego.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Element
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Zabezpieczenie
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Funkcja
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  PROJ.
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  OBL.
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Czas
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments.flatMap((assignment) => {
                const functions = getFunctions(assignment);
                const rowFunctions = functions.length > 0 ? functions : [null];

                return rowFunctions.map((functionSummary, index) => (
                  <tr key={`${assignment.element_id}-${assignment.device_id}-${index}`} className="hover:bg-gray-50">
                    {index === 0 && (
                      <td className="px-4 py-3 align-top text-sm text-gray-700" rowSpan={rowFunctions.length}>
                        <div className="font-medium text-gray-900">
                          {getElementTypeLabel(assignment.element_type)}
                        </div>
                        <div className="text-xs text-gray-500">{assignment.element_id}</div>
                      </td>
                    )}
                    {index === 0 && (
                      <td className="px-4 py-3 align-top text-sm text-gray-700" rowSpan={rowFunctions.length}>
                        <div className="font-medium text-gray-900">{assignment.device_name_pl}</div>
                        <div className="text-xs text-gray-500">
                          {DEVICE_KIND_LABELS[assignment.device_kind] ?? assignment.device_kind}
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-gray-800">
                      {functionSummary?.label_pl ?? 'Brak zdefiniowanych funkcji'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {functionSummary?.setpoint.display_pl ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {functionSummary ? formatComputedValue(functionSummary) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {functionSummary ? formatTimeDelay(functionSummary.time_delay_s) : '—'}
                    </td>
                    {index === 0 && (
                      <td className="px-4 py-3 align-top text-sm text-gray-700" rowSpan={rowFunctions.length}>
                        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          {PROTECTION_STATUS_LABELS[assignment.status]}
                        </span>
                      </td>
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
