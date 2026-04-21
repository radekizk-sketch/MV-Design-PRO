/**
 * FIX-12B — Protection Settings Editor Component
 *
 * Editor for protection device settings with full curve support.
 *
 * CANONICAL ALIGNMENT:
 * - 100% Polish labels
 * - READ-ONLY relative to solver results (edits only settings)
 * - No physics calculations
 * - IEC 60255 and IEEE C37.112 curve standards
 */

import { useState, useCallback } from 'react';
import type {
  ProtectionDevice,
  StageSettings,
  DeviceType,
  CurveVariant,
  CurveStandard,
} from './types';
import { LABELS, DEFAULT_CURVE_SETTINGS, DEFAULT_STAGE_51 } from './types';

// =============================================================================
// Types
// =============================================================================

interface ProtectionSettingsEditorProps {
  device: ProtectionDevice;
  onChange: (device: ProtectionDevice) => void;
  onCancel: () => void;
}

// =============================================================================
// Curve Options by Standard
// =============================================================================

const IEC_CURVE_OPTIONS: { value: CurveVariant; label: string }[] = [
  { value: 'SI', label: LABELS.curveTypes.SI },
  { value: 'VI', label: LABELS.curveTypes.VI },
  { value: 'EI', label: LABELS.curveTypes.EI },
  { value: 'LTI', label: LABELS.curveTypes.LTI },
  { value: 'DT', label: LABELS.curveTypes.DT },
];

const IEEE_CURVE_OPTIONS: { value: CurveVariant; label: string }[] = [
  { value: 'MI', label: LABELS.curveTypes.MI },
  { value: 'VI', label: LABELS.curveTypes.VI },
  { value: 'EI', label: LABELS.curveTypes.EI },
  { value: 'STI', label: LABELS.curveTypes.STI },
  { value: 'DT', label: LABELS.curveTypes.DT },
];

const CURVE_STANDARD_OPTIONS: { value: CurveStandard; label: string }[] = [
  { value: 'IEC', label: LABELS.curveStandards.IEC },
  { value: 'IEEE', label: LABELS.curveStandards.IEEE },
];

const DEVICE_TYPE_OPTIONS: { value: DeviceType; label: string }[] = [
  { value: 'RELAY', label: LABELS.deviceTypes.RELAY },
  { value: 'FUSE', label: LABELS.deviceTypes.FUSE },
  { value: 'RECLOSER', label: LABELS.deviceTypes.RECLOSER },
  { value: 'CIRCUIT_BREAKER', label: LABELS.deviceTypes.CIRCUIT_BREAKER },
];

// =============================================================================
// Validation Helpers
// =============================================================================

function validatePickupCurrent(value: number): string | null {
  if (value <= 0) return LABELS.validation.pickupPositive;
  return null;
}

function validateTms(value: number): string | null {
  if (value < 0.05 || value > 10) return LABELS.validation.tmsRange;
  return null;
}

function validateTime(value: number | undefined): string | null {
  if (value !== undefined && value < 0) return LABELS.validation.timePositive;
  return null;
}

// =============================================================================
// Stage Settings Editor
// =============================================================================

interface StageEditorProps {
  label: string;
  stage: StageSettings | undefined;
  onChange: (stage: StageSettings | undefined) => void;
  showCurve?: boolean;
}

function StageEditor({ label, stage, onChange, showCurve = true }: StageEditorProps) {
  const isEnabled = stage?.enabled ?? false;
  const curveStandard = stage?.curve_settings?.standard ?? 'IEC';
  const curveOptions = curveStandard === 'IEEE' ? IEEE_CURVE_OPTIONS : IEC_CURVE_OPTIONS;

  const handleToggle = () => {
    if (isEnabled) {
      onChange(undefined);
    } else {
      onChange({
        ...DEFAULT_STAGE_51,
        enabled: true,
      });
    }
  };

  const handlePickupChange = (value: number) => {
    if (!stage) return;
    onChange({
      ...stage,
      pickup_current_a: value,
      curve_settings: stage.curve_settings
        ? { ...stage.curve_settings, pickup_current_a: value }
        : undefined,
    });
  };

  const handleStandardChange = (standard: CurveStandard) => {
    if (!stage) return;
    // Reset variant to first available for new standard
    const defaultVariant = standard === 'IEEE' ? 'MI' : 'SI';
    onChange({
      ...stage,
      curve_settings: {
        ...(stage.curve_settings || DEFAULT_CURVE_SETTINGS),
        standard,
        variant: defaultVariant as CurveVariant,
      },
    });
  };

  const handleTmsChange = (value: number) => {
    if (!stage?.curve_settings) return;
    onChange({
      ...stage,
      curve_settings: { ...stage.curve_settings, time_multiplier: value },
    });
  };

  const handleCurveTypeChange = (variant: CurveVariant) => {
    if (!stage) return;
    onChange({
      ...stage,
      curve_settings: {
        ...(stage.curve_settings || DEFAULT_CURVE_SETTINGS),
        variant,
      },
    });
  };

  const handleTimeChange = (value: number | undefined) => {
    if (!stage) return;
    onChange({
      ...stage,
      time_s: value,
    });
  };

  const handleDirectionalChange = (directional: boolean) => {
    if (!stage) return;
    onChange({
      ...stage,
      directional,
    });
  };

  // Validation errors
  const pickupError = stage ? validatePickupCurrent(stage.pickup_current_a) : null;
  const tmsError = stage?.curve_settings ? validateTms(stage.curve_settings.time_multiplier) : null;
  const timeError = validateTime(stage?.time_s);

  return (
    <div className="rounded-lg border border-slate-200 p-4" data-testid={`stage-editor-${label}`}>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="font-medium text-slate-700">{label}</span>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={handleToggle}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-slate-600">{LABELS.settings.enabled}</span>
        </label>
      </div>

      {/* Settings (only when enabled) */}
      {isEnabled && stage && (
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Pickup Current */}
          <div>
            <label className="mb-1 block text-sm text-slate-600">
              {LABELS.settings.pickup}
            </label>
            <input
              type="number"
              value={stage.pickup_current_a}
              onChange={(e) => handlePickupChange(Number(e.target.value))}
              min={1}
              step={10}
              className={`w-full rounded border px-3 py-2 text-sm ${
                pickupError
                  ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                  : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'
              }`}
            />
            {pickupError && (
              <p className="mt-1 text-xs text-rose-600">{pickupError}</p>
            )}
          </div>

          {/* Curve Settings (for time-inverse stages) */}
          {showCurve && stage.curve_settings && (
            <>
              {/* Curve Standard */}
              <div>
                <label className="mb-1 block text-sm text-slate-600">
                  {LABELS.settings.standard}
                </label>
                <select
                  value={stage.curve_settings.standard}
                  onChange={(e) => handleStandardChange(e.target.value as CurveStandard)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  {CURVE_STANDARD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Curve Type */}
              <div>
                <label className="mb-1 block text-sm text-slate-600">
                  {LABELS.settings.curve}
                </label>
                <select
                  value={stage.curve_settings.variant}
                  onChange={(e) => handleCurveTypeChange(e.target.value as CurveVariant)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  {curveOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time Multiplier (TMS/TD) */}
              <div>
                <label className="mb-1 block text-sm text-slate-600">
                  {curveStandard === 'IEEE' ? 'TD (nastawa czasowa)' : LABELS.settings.tms}
                </label>
                <input
                  type="number"
                  value={stage.curve_settings.time_multiplier}
                  onChange={(e) => handleTmsChange(Number(e.target.value))}
                  min={0.05}
                  max={10}
                  step={0.05}
                  className={`w-full rounded border px-3 py-2 text-sm ${
                    tmsError
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                      : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                />
                {tmsError && (
                  <p className="mt-1 text-xs text-rose-600">{tmsError}</p>
                )}
              </div>
            </>
          )}

          {/* Definite Time (for DT curves or instantaneous stages) */}
          {(!showCurve || stage.curve_settings?.variant === 'DT') && (
            <div>
              <label className="mb-1 block text-sm text-slate-600">
                {LABELS.settings.time}
              </label>
              <input
                type="number"
                value={stage.time_s ?? 0}
                onChange={(e) =>
                  handleTimeChange(e.target.value ? Number(e.target.value) : undefined)
                }
                min={0}
                step={0.01}
                className={`w-full rounded border px-3 py-2 text-sm ${
                  timeError
                    ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                    : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'
                }`}
              />
              {timeError && (
                <p className="mt-1 text-xs text-rose-600">{timeError}</p>
              )}
            </div>
          )}

          {/* Directional (placeholder) */}
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={stage.directional}
                onChange={(e) => handleDirectionalChange(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                disabled
              />
              <span>{LABELS.settings.directional}</span>
              <span className="text-xs text-slate-400">(niedostępne)</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Editor Component
// =============================================================================

export function ProtectionSettingsEditor({
  device,
  onChange,
  onCancel,
}: ProtectionSettingsEditorProps) {
  const [localDevice, setLocalDevice] = useState<ProtectionDevice>({ ...device });

  const handleSave = useCallback(() => {
    onChange(localDevice);
  }, [localDevice, onChange]);

  const updateDevice = useCallback((updates: Partial<ProtectionDevice>) => {
    setLocalDevice((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateSettings = useCallback(
    (
      key: keyof ProtectionDevice['settings'],
      value: StageSettings | undefined
    ) => {
      setLocalDevice((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          [key]: value,
        },
      }));
    },
    []
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6" data-testid="protection-settings-editor">
      <h3 className="mb-4 text-lg font-semibold text-slate-900">
        {LABELS.settings.title}
      </h3>

      {/* Device Info */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {/* Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {LABELS.devices.name}
          </label>
          <input
            type="text"
            value={localDevice.name}
            onChange={(e) => updateDevice({ name: e.target.value })}
            className="w-full rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        {/* Device Type */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {LABELS.devices.type}
          </label>
          <select
            value={localDevice.device_type}
            onChange={(e) => updateDevice({ device_type: e.target.value as DeviceType })}
            className="w-full rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
          >
            {DEVICE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Location */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {LABELS.devices.location}
          </label>
          <input
            type="text"
            value={localDevice.location_element_id}
            onChange={(e) => updateDevice({ location_element_id: e.target.value })}
            className="w-full rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        {/* Manufacturer */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {LABELS.settings.manufacturer}
          </label>
          <input
            type="text"
            value={localDevice.manufacturer ?? ''}
            onChange={(e) => updateDevice({ manufacturer: e.target.value || undefined })}
            className="w-full rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
            placeholder="np. ABB, Siemens, SEL"
          />
        </div>

        {/* Model */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {LABELS.settings.model}
          </label>
          <input
            type="text"
            value={localDevice.model ?? ''}
            onChange={(e) => updateDevice({ model: e.target.value || undefined })}
            className="w-full rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
            placeholder="np. REF615, SEL-751"
          />
        </div>

        {/* CT Ratio */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {LABELS.settings.ctRatio}
          </label>
          <input
            type="text"
            value={localDevice.ct_ratio ?? ''}
            onChange={(e) => updateDevice({ ct_ratio: e.target.value || undefined })}
            className="w-full rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
            placeholder="np. 400/5, 800/1"
          />
        </div>
      </div>

      {/* Protection Stages */}
      <div className="mb-6 space-y-4">
        <h4 className="font-medium text-slate-800">Stopnie zabezpieczenia</h4>

        {/* Phase Overcurrent */}
        <StageEditor
          label={LABELS.settings.stage51}
          stage={localDevice.settings.stage_51}
          onChange={(stage) =>
            updateSettings('stage_51', stage || DEFAULT_STAGE_51)
          }
          showCurve={true}
        />

        <StageEditor
          label={LABELS.settings.stage50}
          stage={localDevice.settings.stage_50}
          onChange={(stage) => updateSettings('stage_50', stage)}
          showCurve={false}
        />

        <StageEditor
          label={LABELS.settings.stage50high}
          stage={localDevice.settings.stage_50_high}
          onChange={(stage) => updateSettings('stage_50_high', stage)}
          showCurve={false}
        />

        {/* Earth Fault */}
        <div className="mt-4 border-t border-slate-200 pt-4">
          <h4 className="mb-3 text-sm font-medium text-slate-600">
            Zabezpieczenie ziemnozwarciowe
          </h4>

          <div className="space-y-4">
            <StageEditor
              label={LABELS.settings.stage51n}
              stage={localDevice.settings.stage_51n}
              onChange={(stage) => updateSettings('stage_51n', stage)}
              showCurve={true}
            />

            <StageEditor
              label={LABELS.settings.stage50n}
              stage={localDevice.settings.stage_50n}
              onChange={(stage) => updateSettings('stage_50n', stage)}
              showCurve={false}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="rounded px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          {LABELS.actions.cancel}
        </button>
        <button
          onClick={handleSave}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {LABELS.actions.save}
        </button>
      </div>
    </div>
  );
}

export default ProtectionSettingsEditor;
