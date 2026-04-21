/**
 * PowerDistributionPage — Architektura rozdzialu mocy.
 *
 * Produkcyjna strona kreatora pol i aparatow rozdzielnic SN/nN.
 *
 * CANONICAL ALIGNMENT:
 * - fieldDeviceContracts.ts: FieldV1, DeviceV1, BayTemplate
 * - bayRenderer.ts: computeBayLayout() (CANONICAL-grade geometry)
 * - switchgearConfig.ts: REQUIRED_DEVICES
 * - sldCanonicalStyle.ts: CANONICAL visual style system
 *
 * ARCHITECTURE:
 * - APPLICATION / PRESENTATION LAYER: no physics, no model mutation.
 * - Integrates with existing bayRenderer for production-grade SVG output.
 * - Uses Zustand store for state management.
 * - All labels 100% POLISH.
 *
 * FEATURES:
 * - Interactive SVG bay visualization (CANONICAL-grade).
 * - Field (bay) creation from canonical templates.
 * - Device management within fields.
 * - Real-time validation (missing required devices).
 * - Station type selection (TRUNK_LEAF/TRUNK_INLINE/TRUNK_BRANCH/LOCAL_SECTIONAL).
 * - Integrated device inspector panel.
 */

import React, { useCallback, useMemo } from 'react';
import { CanonicalFieldRenderer } from '../field/CanonicalFieldRenderer';
import {
  usePowerDistributionStore,
  useStation,
  useSelectedFieldId,
  useSelectedDeviceId,
} from './store';
import { SN_TEMPLATES, NN_TEMPLATES, BAY_TEMPLATES } from './bayTemplates';
import {
  FIELD_ROLE_LABELS_PL,
  DEVICE_TYPE_LABELS_PL,
  EMBEDDING_ROLE_LABELS_PL,
  ELECTRICAL_ROLE_LABELS_PL,
  POWER_PATH_POSITION_LABELS_PL,
} from './types';
import type { BayTemplate } from './types';
import type { FieldRoleV1, EmbeddingRoleV1 } from '../sld/core/fieldDeviceContracts';
import { EmbeddingRoleV1 as ER } from '../sld/core/fieldDeviceContracts';

// =============================================================================
// FIELD TEMPLATE SELECTOR
// =============================================================================

const FieldTemplateSelector: React.FC<{
  onSelect: (fieldRole: FieldRoleV1) => void;
}> = ({ onSelect }) => {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Pola SN (srednie napiecie)
        </h4>
        <div className="grid grid-cols-1 gap-1">
          {SN_TEMPLATES.map((t: BayTemplate) => (
            <button
              key={t.fieldRole}
              onClick={() => onSelect(t.fieldRole)}
              className="flex items-start gap-2 px-3 py-2 text-left text-sm bg-white border border-slate-200 rounded hover:border-blue-400 hover:bg-blue-50 transition-colors"
              data-testid={`add-field-${t.fieldRole}`}
            >
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-100 text-blue-700 text-xs font-bold flex-shrink-0 mt-0.5">
                +
              </span>
              <div className="min-w-0">
                <div className="font-medium text-slate-800 text-xs">{t.labelPl}</div>
                <div className="text-[10px] text-slate-500 leading-tight">{t.descriptionPl}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Pola nN (niskie napiecie)
        </h4>
        <div className="grid grid-cols-1 gap-1">
          {NN_TEMPLATES.map((t: BayTemplate) => (
            <button
              key={t.fieldRole}
              onClick={() => onSelect(t.fieldRole)}
              className="flex items-start gap-2 px-3 py-2 text-left text-sm bg-white border border-slate-200 rounded hover:border-amber-400 hover:bg-amber-50 transition-colors"
              data-testid={`add-field-${t.fieldRole}`}
            >
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-100 text-amber-700 text-xs font-bold flex-shrink-0 mt-0.5">
                +
              </span>
              <div className="min-w-0">
                <div className="font-medium text-slate-800 text-xs">{t.labelPl}</div>
                <div className="text-[10px] text-slate-500 leading-tight">{t.descriptionPl}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// FIELD LIST
// =============================================================================

const FieldList: React.FC = () => {
  const station = useStation();
  const selectedFieldId = useSelectedFieldId();
  const selectField = usePowerDistributionStore((s) => s.selectField);
  const removeField = usePowerDistributionStore((s) => s.removeField);
  const validateFields = usePowerDistributionStore((s) => s.validateFields);

  const validationResults = useMemo(() => validateFields(), [validateFields, station.fields]);

  if (station.fields.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-sm text-slate-400">
        Brak pol. Dodaj pole z panelu szablonow.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {station.fields.map((field) => {
        const isSelected = field.fieldId === selectedFieldId;
        const validation = validationResults.find((v) => v.fieldId === field.fieldId);
        const isValid = validation?.isValid ?? true;

        return (
          <div
            key={field.fieldId}
            className={`
              flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors
              ${isSelected ? 'bg-blue-50 border border-blue-300' : 'bg-white border border-slate-200 hover:bg-slate-50'}
            `}
            onClick={() => selectField(field.fieldId)}
            data-testid={`field-row-${field.fieldId}`}
          >
            {/* Status indicator */}
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${isValid ? 'bg-emerald-500' : 'bg-amber-500'}`}
              title={validation?.messagePl}
            />

            {/* Field info */}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-700 truncate">
                {FIELD_ROLE_LABELS_PL[field.fieldRole]}
              </div>
              <div className="text-[10px] text-slate-400">
                {field.fieldId} | {field.devices.length} aparatow
              </div>
            </div>

            {/* Remove button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeField(field.fieldId);
              }}
              className="text-slate-400 hover:text-red-500 transition-colors text-xs"
              title="Usun pole"
              data-testid={`remove-field-${field.fieldId}`}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
};

// =============================================================================
// DEVICE INSPECTOR
// =============================================================================

const DeviceInspector: React.FC = () => {
  const station = useStation();
  const selectedFieldId = useSelectedFieldId();
  const selectedDeviceId = useSelectedDeviceId();
  const selectDevice = usePowerDistributionStore((s) => s.selectDevice);
  const removeDevice = usePowerDistributionStore((s) => s.removeDevice);
  const addDevice = usePowerDistributionStore((s) => s.addDevice);
  const validateFields = usePowerDistributionStore((s) => s.validateFields);

  const selectedField = station.fields.find((f) => f.fieldId === selectedFieldId);

  const validation = useMemo(() => {
    if (!selectedFieldId) return null;
    return validateFields().find((v) => v.fieldId === selectedFieldId) ?? null;
  }, [validateFields, selectedFieldId, station.fields]);

  const template = selectedField ? BAY_TEMPLATES.get(selectedField.fieldRole) : null;

  const handleAddOptionalDevice = useCallback(
    (deviceType: string) => {
      if (!selectedFieldId || !template) return;
      const templateDev = template.devices.find((d) => d.deviceType === deviceType);
      if (!templateDev) return;

      addDevice(selectedFieldId, {
        deviceType: templateDev.deviceType,
        electricalRole: templateDev.electricalRole,
        powerPathPosition: templateDev.powerPathPosition,
      });
    },
    [selectedFieldId, template, addDevice],
  );

  if (!selectedField) {
    return (
      <div className="px-3 py-6 text-center text-sm text-slate-400">
        Wybierz pole, aby wyswietlic aparaty
      </div>
    );
  }

  // Find optional devices from template that are not yet present
  const presentTypes = new Set(selectedField.devices.map((d) => d.deviceType));
  const optionalDevices = template?.devices.filter(
    (d) => !d.required && !presentTypes.has(d.deviceType),
  ) ?? [];

  return (
    <div className="space-y-3">
      {/* Field header */}
      <div className="px-3 py-2 bg-blue-50 rounded border border-blue-200">
        <div className="text-xs font-semibold text-blue-800">
          {FIELD_ROLE_LABELS_PL[selectedField.fieldRole]}
        </div>
        <div className="text-[10px] text-blue-600">{selectedField.fieldId}</div>
      </div>

      {/* Validation status */}
      {validation && !validation.isValid && (
        <div className="px-3 py-2 bg-amber-50 rounded border border-amber-200">
          <div className="text-[10px] font-medium text-amber-800">Brak wymaganych aparatow:</div>
          <div className="text-[10px] text-amber-700">
            {validation.missingDevices.map((dt) => DEVICE_TYPE_LABELS_PL[dt]).join(', ')}
          </div>
        </div>
      )}

      {/* Device list */}
      <div className="space-y-1">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
          Aparaty ({selectedField.devices.length})
        </h4>

        {selectedField.devices.map((device) => {
          const isDevSelected = device.deviceId === selectedDeviceId;

          return (
            <div
              key={device.deviceId}
              className={`
                flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors
                ${isDevSelected ? 'bg-amber-50 border border-amber-300' : 'bg-white border border-slate-200 hover:bg-slate-50'}
              `}
              onClick={() => selectDevice(device.deviceId)}
              data-testid={`device-row-${device.deviceId}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-700">
                  {DEVICE_TYPE_LABELS_PL[device.deviceType]}
                </div>
                <div className="text-[10px] text-slate-400">
                  {ELECTRICAL_ROLE_LABELS_PL[device.electricalRole]} |{' '}
                  {POWER_PATH_POSITION_LABELS_PL[device.powerPathPosition]}
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeDevice(selectedField.fieldId, device.deviceId);
                }}
                className="text-slate-400 hover:text-red-500 transition-colors text-xs"
                title="Usun aparat"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {/* Add optional devices */}
      {optionalDevices.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            Dodaj opcjonalne
          </h4>
          {optionalDevices.map((d) => (
            <button
              key={d.deviceType}
              onClick={() => handleAddOptionalDevice(d.deviceType)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs bg-white border border-dashed border-slate-300 rounded hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
            >
              <span className="text-emerald-600 font-bold">+</span>
              <span className="text-slate-600">{d.labelPl}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// STATION CONFIG HEADER
// =============================================================================

const StationConfigHeader: React.FC = () => {
  const station = useStation();
  const setStationName = usePowerDistributionStore((s) => s.setStationName);
  const setEmbeddingRole = usePowerDistributionStore((s) => s.setEmbeddingRole);
  const resetStation = usePowerDistributionStore((s) => s.resetStation);

  const embeddingRoles: EmbeddingRoleV1[] = [
    ER.TRUNK_LEAF,
    ER.TRUNK_INLINE,
    ER.TRUNK_BRANCH,
    ER.LOCAL_SECTIONAL,
  ];

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border-b border-slate-200">
      {/* Station name */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-500">Nazwa stacji:</label>
        <input
          type="text"
          value={station.stationName}
          onChange={(e) => setStationName(e.target.value)}
          className="px-2 py-1 text-sm border border-slate-300 rounded focus:border-blue-500 focus:outline-none w-48"
          data-testid="station-name-input"
        />
      </div>

      {/* Embedding role selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-500">Typ stacji:</label>
        <select
          value={station.embeddingRole}
          onChange={(e) => setEmbeddingRole(e.target.value as EmbeddingRoleV1)}
          className="px-2 py-1 text-sm border border-slate-300 rounded focus:border-blue-500 focus:outline-none"
          data-testid="embedding-role-select"
        >
          {embeddingRoles.map((role) => (
            <option key={role} value={role}>
              {EMBEDDING_ROLE_LABELS_PL[role]}
            </option>
          ))}
        </select>
      </div>

      {/* Reset */}
      <div className="flex-1" />
      <button
        onClick={resetStation}
        className="px-3 py-1 text-xs text-slate-500 hover:text-red-600 border border-slate-300 rounded hover:border-red-300 transition-colors"
        data-testid="reset-station-btn"
      >
        Resetuj stacje
      </button>
    </div>
  );
};

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

export function PowerDistributionPage(): JSX.Element {
  const station = useStation();
  const selectedFieldId = useSelectedFieldId();
  const selectedDeviceId = useSelectedDeviceId();
  const addFieldFromTemplate = usePowerDistributionStore((s) => s.addFieldFromTemplate);
  const selectField = usePowerDistributionStore((s) => s.selectField);
  const selectDevice = usePowerDistributionStore((s) => s.selectDevice);

  const handleFieldClick = useCallback(
    (fieldId: string) => selectField(fieldId),
    [selectField],
  );

  const handleDeviceClick = useCallback(
    (deviceId: string) => selectDevice(deviceId),
    [selectDevice],
  );

  return (
    <div className="flex flex-col h-full" data-testid="power-distribution-page">
      {/* Header bar */}
      <StationConfigHeader />

      {/* Main content: 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Field templates + field list */}
        <div className="w-72 flex flex-col border-r border-slate-200 bg-slate-50">
          {/* Field list */}
          <div className="flex-none border-b border-slate-200">
            <div className="px-3 py-2 bg-slate-100 border-b border-slate-200">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Pola rozdzielcze ({station.fields.length})
              </h3>
            </div>
            <div className="p-2 max-h-52 overflow-y-auto">
              <FieldList />
            </div>
          </div>

          {/* Template selector */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-3 py-2 bg-slate-100 border-b border-slate-200">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Dodaj pole
              </h3>
            </div>
            <div className="p-2">
              <FieldTemplateSelector onSelect={addFieldFromTemplate} />
            </div>
          </div>
        </div>

        {/* Center: SVG bay renderer */}
        <div className="flex-1 flex items-center justify-center p-4 bg-white overflow-auto">
          <CanonicalFieldRenderer
            config={station}
            renderContext="widok_pelny"
            width={Math.max(600, station.fields.length * 100 + 200)}
            height={420}
            selectedFieldId={selectedFieldId}
            selectedDeviceId={selectedDeviceId}
            onFieldClick={handleFieldClick}
            onDeviceClick={handleDeviceClick}
          />
        </div>

        {/* Right panel: Device inspector */}
        <div className="w-64 border-l border-slate-200 bg-slate-50 overflow-y-auto">
          <div className="px-3 py-2 bg-slate-100 border-b border-slate-200">
            <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Inspektor aparatow
            </h3>
          </div>
          <div className="p-2">
            <DeviceInspector />
          </div>
        </div>
      </div>
    </div>
  );
}
