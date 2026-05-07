import { useCallback, useMemo, useState } from 'react';

import { useAppStateStore } from '../../app-state';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { validateCatalogFirst } from './catalogFirstRules';
import {
  catalogRefFromInput,
  normalizeCatalogBinding,
  type GpzGroundingType,
} from './catalogPayload';
import {
  GridSourceEditor,
  type GridSourceFormData,
} from './shared/GridSourceEditor';
import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';
import { navigateToSld } from '../../navigation/routes';

type GpzSection = {
  order: number;
  name: string;
  line_field_name: string;
  line_fields_count: number;
  line_field_names: string[];
};

function withIndexedSuffix(base: string, index: number, total: number, fallback: string): string {
  const normalized = base.trim() || fallback;
  return total <= 1 ? normalized : `${normalized} ${index + 1}`;
}

function buildGpzSections(data: GridSourceFormData): GpzSection[] {
  const count = Math.max(1, Math.trunc(data.sections_count || 1));
  const lineFieldsPerSection = Math.max(
    1,
    Math.min(12, Math.trunc(data.line_fields_per_section || 1)),
  );
  return Array.from({ length: count }, (_, index) => ({
    order: index,
    name: withIndexedSuffix(data.gpz_section_name, index, count, 'Sekcja GPZ'),
    line_field_name: data.gpz_line_field_name.trim() || 'Pole liniowe GPZ',
    line_fields_count: lineFieldsPerSection,
    line_field_names: Array.from(
      { length: lineFieldsPerSection },
      (_unused, fieldIndex) => withIndexedSuffix(
        data.gpz_line_field_name,
        fieldIndex,
        lineFieldsPerSection,
        'Pole liniowe GPZ',
      ),
    ),
  }));
}

function buildZeroSequence(data: GridSourceFormData) {
  return {
    enabled: data.zero_sequence_enabled,
    ...(data.zero_sequence_enabled
      ? {
          r0_ohm: data.r0_ohm,
          x0_ohm: data.x0_ohm,
          z0_z1_ratio: data.z0_z1_ratio,
        }
      : {}),
  };
}

function buildGrounding(data: GridSourceFormData) {
  const groundingType = data.grounding_type === 'solid_grounded'
    ? 'directly_grounded'
    : data.grounding_type;

  const grounding: {
    type: GpzGroundingType | 'directly_grounded';
    r_ohm?: number | null;
    x_ohm?: number | null;
  } = {
    type: groundingType,
  };

  if (groundingType === 'resistor_grounded') {
    grounding.r_ohm = data.grounding_r_ohm;
  }

  if (groundingType === 'petersen_coil') {
    grounding.x_ohm = data.grounding_x_ohm;
  }

  return grounding;
}

function buildManualEquivalent(data: GridSourceFormData) {
  const common = {
    voltage_kv: data.sn_voltage_kv,
    short_circuit_mode: data.short_circuit_mode,
  };

  if (data.short_circuit_mode === 'IMPEDANCE') {
    return {
      ...common,
      r_ohm: data.r_ohm,
      x_ohm: data.x_ohm,
      ...(data.zero_sequence_enabled
        ? {
            r0_ohm: data.r0_ohm,
            x0_ohm: data.x0_ohm,
            z0_z1_ratio: data.z0_z1_ratio,
          }
        : {}),
    };
  }

  return {
    ...common,
    sk3_mva: data.sk3_mva,
    rx_ratio: data.rx_ratio,
  };
}

function buildGridSourcePayload(data: GridSourceFormData) {
  const catalogBinding = data.manual_mode
    ? undefined
    : normalizeCatalogBinding(data.catalog_ref, 'ZRODLO_SN');

  const payload: Record<string, unknown> = {
    source_name: data.source_name,
    voltage_kv: data.sn_voltage_kv,
    sections_count: Math.max(1, Math.trunc(data.sections_count || 1)),
    line_fields_per_section: Math.max(
      1,
      Math.min(12, Math.trunc(data.line_fields_per_section || 1)),
    ),
    short_circuit_mode: data.short_circuit_mode,
    gpz_sections: buildGpzSections(data),
    zero_sequence: buildZeroSequence(data),
    grounding: buildGrounding(data),
    catalog_binding: catalogBinding ?? undefined,
    gpz_line_field_apparatus: data.gpz_line_field_apparatus_catalog_ref
      ? {
          apparatus_kind: data.gpz_line_field_apparatus_kind,
          catalog_binding: normalizeCatalogBinding(
            data.gpz_line_field_apparatus_catalog_ref,
            'APARAT_SN',
          ),
        }
      : undefined,
  };

  if (data.short_circuit_mode === 'IMPEDANCE') {
    payload.r_ohm = data.r_ohm;
    payload.x_ohm = data.x_ohm;
  } else {
    payload.sk3_mva = data.sk3_mva;
    payload.rx_ratio = data.rx_ratio;
  }

  if (data.manual_mode) {
    payload.manual_equivalent = buildManualEquivalent(data);
    payload.source_mode = 'EKSPERCKI_RECZNY';
    payload.parameter_source = 'MANUAL_EQUIVALENT';
    payload.catalog_binding = undefined;
  }

  return payload;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function AddGridSourceForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const collapseSurfaceStackTo = useNetworkBuildStore((state) => state.collapseSurfaceStackTo);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const [formError, setFormError] = useState<string | null>(null);

  const initialData = useMemo<Partial<GridSourceFormData>>(() => {
    if (!context) {
      return {};
    }

    const initial: Partial<GridSourceFormData> = {};
    const sourceName = readString(context.source_name);
    const voltageKv = readNumber(context.sn_voltage_kv) ?? readNumber(context.voltage_kv);
    const sk3Mva = readNumber(context.sk3_mva);
    const rxRatio = readNumber(context.rx_ratio);
    const catalogRef =
      catalogRefFromInput(context.catalog_ref) ?? catalogRefFromInput(context.catalog_binding);
    const sectionsCount = readNumber(context.sections_count);
    const lineFieldsPerSection =
      readNumber(context.line_fields_per_section)
      ?? readNumber(context.gpz_line_fields_per_section);
    const sectionName = readString(context.gpz_section_name);
    const lineFieldName = readString(context.gpz_line_field_name);

    if (sourceName) initial.source_name = sourceName;
    if (voltageKv !== null) initial.sn_voltage_kv = voltageKv;
    if (sk3Mva !== null) initial.sk3_mva = sk3Mva;
    if (rxRatio !== null) initial.rx_ratio = rxRatio;
    if (catalogRef) initial.catalog_ref = catalogRef;
    if (sectionsCount !== null) initial.sections_count = sectionsCount;
    if (lineFieldsPerSection !== null) initial.line_fields_per_section = lineFieldsPerSection;
    if (sectionName) initial.gpz_section_name = sectionName;
    if (lineFieldName) initial.gpz_line_field_name = lineFieldName;

    return initial;
  }, [context]);

  const handleSubmit = useCallback(
    async (data: GridSourceFormData) => {
      if (!activeCaseId) {
        setFormError('Wybierz aktywny zakres obliczeń przed zapisem GPZ.');
        return;
      }

      const payload = buildGridSourcePayload(data);
      const validationError = validateCatalogFirst('add_grid_source_sn', payload);
      if (validationError) {
        setFormError(validationError);
        return;
      }

      setFormError(null);
      const result = await executeDomainOperation(activeCaseId, 'add_grid_source_sn', payload);

      if (
        typeof result === 'object'
        && result !== null
        && 'error' in result
        && typeof result.error === 'string'
        && result.error.trim()
      ) {
        setFormError(result.error);
        return;
      }

      collapseSurfaceStackTo(null);
      closeForm();
      navigateToSld();
    },
    [activeCaseId, closeForm, collapseSurfaceStackTo, executeDomainOperation],
  );

  return (
    <div className="h-full overflow-y-auto" data-testid="add-grid-source-form">
      {formError && (
        <p className="border-b border-[#4a1c2a] bg-[#210711] px-4 py-2 font-mono-eng text-xs text-[#ff6b85]">
          {formError}
        </p>
      )}
      <GridSourceEditor
        isOpen={true}
        mode="create"
        initialData={initialData}
        onSubmit={handleSubmit}
        onCancel={closeForm}
      />
    </div>
  );
}
