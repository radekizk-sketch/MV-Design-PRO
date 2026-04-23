/**
 * Router formularzy operacji domenowych.
 *
 * Renderuje aktywny formularz na podstawie aktywnego surface'u kanonicznego
 * i montuje go w prawym panelu jako alternatywę dla inspektora.
 */

import React from 'react';
import { clsx } from 'clsx';

import { useActiveOperationForm } from './networkBuildStore';
import { AddConverterSourceForm } from './forms/AddConverterSourceForm';
import { AddDispatchableSourceForm } from './forms/AddDispatchableSourceForm';
import { AddGridSourceForm } from './forms/AddGridSourceForm';
import { AddMeasurementForm } from './forms/AddMeasurementForm';
import { AddNnLoadForm } from './forms/AddNnLoadForm';
import { AddNnOutgoingFieldForm } from './forms/AddNnOutgoingFieldForm';
import { AddRelayForm } from './forms/AddRelayForm';
import { AddSnBayForm } from './forms/AddSnBayForm';
import { AddTransformerForm } from './forms/AddTransformerForm';
import { AssignCatalogForm } from './forms/AssignCatalogForm';
import { ChooseSnSegmentFamilyForm } from './forms/ChooseSnSegmentFamilyForm';
import { ConnectRingForm } from './forms/ConnectRingForm';
import { ContinueTrunkForm } from './forms/ContinueTrunkForm';
import { InsertBranchPoleForm } from './forms/InsertBranchPoleForm';
import { InsertSectionSwitchForm } from './forms/InsertSectionSwitchForm';
import { InsertStationForm } from './forms/InsertStationForm';
import { InsertZksnForm } from './forms/InsertZksnForm';
import { StartBranchForm } from './forms/StartBranchForm';
import { UpdateElementParametersForm } from './forms/UpdateElementParametersForm';
import { useNetworkBuildStore } from './networkBuildStore';
import type { ActiveOperationForm } from './internal/legacySurfaceTypes';

type SupportedOperationForm = Exclude<ActiveOperationForm, null>['op'];
type RoutedOperationForm = Exclude<SupportedOperationForm, 'refresh_snapshot'>;

const FORM_COMPONENT_BY_OPERATION: Record<RoutedOperationForm, React.ReactNode> = {
  add_grid_source_sn: <AddGridSourceForm />,
  add_sn_bay: <AddSnBayForm />,
  continue_trunk_segment_sn: <ContinueTrunkForm />,
  insert_station_on_segment_sn: <InsertStationForm />,
  insert_branch_pole_on_segment_sn: <InsertBranchPoleForm />,
  insert_zksn_on_segment_sn: <InsertZksnForm />,
  start_branch_segment_sn: <StartBranchForm />,
  connect_secondary_ring_sn: <ConnectRingForm />,
  set_normal_open_point: <ConnectRingForm />,
  insert_section_switch_sn: <InsertSectionSwitchForm />,
  add_transformer_sn_nn: <AddTransformerForm />,
  add_nn_outgoing_field: <AddNnOutgoingFieldForm />,
  add_converter_source: <AddConverterSourceForm />,
  add_genset_nn: <AddDispatchableSourceForm />,
  add_ups_nn: <AddDispatchableSourceForm />,
  add_nn_load: <AddNnLoadForm />,
  add_ct: <AddMeasurementForm />,
  add_vt: <AddMeasurementForm />,
  add_relay: <AddRelayForm />,
  assign_catalog_to_element: <AssignCatalogForm />,
  update_element_parameters: <UpdateElementParametersForm />,
};

export function supportsOperationForm(op: string): op is RoutedOperationForm {
  return op in FORM_COMPONENT_BY_OPERATION;
}

function assertSupportedOperation(op: string): asserts op is RoutedOperationForm {
  if (!supportsOperationForm(op)) {
    throw new Error(`Brak formularza dla aktywnej operacji: ${op}`);
  }
}

export interface OperationFormRouterProps {
  className?: string;
}

export function OperationFormRouter({ className }: OperationFormRouterProps) {
  const activeForm = useActiveOperationForm();
  const activeScreenCode = useNetworkBuildStore((state) => state.activeSurface?.screenCode ?? null);

  if (!activeForm) {
    return null;
  }

  const operation = activeForm.op as string;
  assertSupportedOperation(operation);

  if (operation === 'continue_trunk_segment_sn' && activeScreenCode === 'E-06') {
    return (
      <div className={clsx('h-full', className)} data-testid="operation-form-router">
        <ChooseSnSegmentFamilyForm />
      </div>
    );
  }

  return (
    <div className={clsx('h-full', className)} data-testid="operation-form-router">
      {FORM_COMPONENT_BY_OPERATION[operation]}
    </div>
  );
}

export default OperationFormRouter;
