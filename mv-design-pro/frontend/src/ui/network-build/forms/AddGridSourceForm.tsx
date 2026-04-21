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

type GpzSection = {
  order: number;
  name: string;
  line_field_name: string;
};

function withIndexedSuffix(base: string, index: number, total: number, fallback: string): string {
  const normalized = base.trim() || fallback;
  return total <= 1 ? normalized : `${normalized} ${index + 1}`;
}

function buildGpzSections(data: GridSourceFormData): GpzSection[] {
  const count = Math.max(1, Math.trunc(data.sections_count || 1));
  return Array.from({ length: count }, (_, index) => ({
    order: index,
    name: withIndexedSuffix(data.gpz_section_name, index, count, 'Sekcja GPZ'),
    line_field_name: withIndexedSuffix(data.gpz_line_field_name, index, count, 'Pole liniowe GPZ'),
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
    short_circuit_mode: data.short_circuit_mode,
    gpz_sections: buildGpzSections(data),
    zero_sequence: buildZeroSequence(data),
    grounding: buildGrounding(data),
    catalog_binding: catalogBinding ?? undefined,
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

export function AddGridSourceForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const [formError, setFormError] = useState<string | null>(null);

  const initialData = useMemo<Partial<GridSourceFormData>>(() => {
    if (!context) {
      return {};
    }

    return {
      source_name: (context.source_name as string) ?? '',
      sn_voltage_kv: (context.sn_voltage_kv as number) ?? (context.voltage_kv as number) ?? null,
      sk3_mva: (context.sk3_mva as number) ?? null,
      rx_ratio: (context.rx_ratio as number) ?? null,
      catalog_ref:
        catalogRefFromInput(context.catalog_ref) ?? catalogRefFromInput(context.catalog_binding),
      sections_count: (context.sections_count as number) ?? 1,
      gpz_section_name: (context.gpz_section_name as string) ?? '',
      gpz_line_field_name: (context.gpz_line_field_name as string) ?? '',
    };
  }, [context]);

  const handleSubmit = useCallback(
    async (data: GridSourceFormData) => {
      if (!activeCaseId) {
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

      closeForm();
    },
    [activeCaseId, closeForm, executeDomainOperation],
  );

  return (
    <div className="h-full overflow-y-auto" data-testid="add-grid-source-form">
      {formError && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600">
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
