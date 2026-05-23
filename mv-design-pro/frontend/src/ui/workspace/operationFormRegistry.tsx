/**
 * operationFormRegistry — mapowanie CanonicalOpName → React component formularza.
 *
 * Wyekstraktowany z WorkspaceSurfaceRouter.tsx (Etap 11 decompose - architektoniczne).
 * Eliminacja monolitu: switch z 22 case → declarative registry table.
 *
 * Zalety vs switch:
 *  - Dodanie nowej operacji = 1 wpis w tabeli (nie modyfikacja switch)
 *  - Single Source of Truth dla mapowania op → form
 *  - Testowalne (operationFormRegistry as data)
 *  - Type-safe przez Record<CanonicalOpName, ComponentType>
 */

import type { ComponentType, ReactNode } from 'react';
import type { CanonicalOpName } from '../../types/domainOps';
import { AddConverterSourceForm } from '../network-build/forms/AddConverterSourceForm';
import { AddDispatchableSourceForm } from '../network-build/forms/AddDispatchableSourceForm';
import { AddGridSourceForm } from '../network-build/forms/AddGridSourceForm';
import { AddMeasurementForm } from '../network-build/forms/AddMeasurementForm';
import { AddNnLoadForm } from '../network-build/forms/AddNnLoadForm';
import { AddNnOutgoingFieldForm } from '../network-build/forms/AddNnOutgoingFieldForm';
import { AddRelayForm } from '../network-build/forms/AddRelayForm';
import { AddSnBayForm } from '../network-build/forms/AddSnBayForm';
import { AddTransformerForm } from '../network-build/forms/AddTransformerForm';
import { AssignCatalogForm } from '../network-build/forms/AssignCatalogForm';
import { ConnectRingForm } from '../network-build/forms/ConnectRingForm';
import { ContinueTrunkForm } from '../network-build/forms/ContinueTrunkForm';
import { InsertBranchPoleForm } from '../network-build/forms/InsertBranchPoleForm';
import { InsertSectionSwitchForm } from '../network-build/forms/InsertSectionSwitchForm';
import { InsertStationForm } from '../network-build/forms/InsertStationForm';
import { InsertZksnForm } from '../network-build/forms/InsertZksnForm';
import { StartBranchForm } from '../network-build/forms/StartBranchForm';
import { UpdateElementParametersForm } from '../network-build/forms/UpdateElementParametersForm';

/**
 * Mapowanie CanonicalOpName → React component formularza.
 * `null` znaczy "operacja nie ma formularza" (np. delete_element, refresh_snapshot).
 */
export const OPERATION_FORM_REGISTRY: Readonly<Record<CanonicalOpName, ComponentType | null>> = {
  add_grid_source_sn: AddGridSourceForm,
  add_sn_bay: AddSnBayForm,
  continue_trunk_segment_sn: ContinueTrunkForm,
  insert_station_on_segment_sn: InsertStationForm,
  append_station_on_endpoint: InsertStationForm,
  insert_branch_pole_on_segment_sn: InsertBranchPoleForm,
  insert_zksn_on_segment_sn: InsertZksnForm,
  start_branch_segment_sn: StartBranchForm,
  insert_section_switch_sn: InsertSectionSwitchForm,
  connect_secondary_ring_sn: ConnectRingForm,
  set_normal_open_point: ConnectRingForm,
  add_transformer_sn_nn: AddTransformerForm,
  assign_catalog_to_element: AssignCatalogForm,
  update_element_parameters: UpdateElementParametersForm,
  add_nn_outgoing_field: AddNnOutgoingFieldForm,
  add_converter_source: AddConverterSourceForm,
  add_genset_nn: AddDispatchableSourceForm,
  add_ups_nn: AddDispatchableSourceForm,
  add_nn_load: AddNnLoadForm,
  add_ct: AddMeasurementForm,
  add_vt: AddMeasurementForm,
  add_relay: AddRelayForm,
  // Operacje bez formularza (delete, refresh, GPZ sections CRUD)
  delete_element: null,
  refresh_snapshot: null,
  add_gpz_section: null,
  update_gpz_section: null,
  delete_gpz_section: null,
};

/**
 * Pobiera React component formularza dla operacji.
 * Zwraca null gdy operacja nie ma formularza (delete, refresh).
 */
export function resolveOperationForm(opName: CanonicalOpName): ComponentType | null {
  return OPERATION_FORM_REGISTRY[opName] ?? null;
}

/**
 * Renderuje formularz operacji jako React node.
 * Zwraca null gdy operacja nie ma formularza.
 */
export function renderOperationForm(opName: CanonicalOpName): ReactNode {
  const Component = resolveOperationForm(opName);
  if (!Component) return null;
  return <Component />;
}

/**
 * Lista wszystkich operacji wymagających formularza (do walidacji UX).
 */
export function listOperationsWithForm(): readonly CanonicalOpName[] {
  return (Object.entries(OPERATION_FORM_REGISTRY) as [CanonicalOpName, ComponentType | null][])
    .filter(([, component]) => component !== null)
    .map(([name]) => name);
}

/**
 * Lista operacji BEZ formularza (instant ops).
 */
export function listOperationsWithoutForm(): readonly CanonicalOpName[] {
  return (Object.entries(OPERATION_FORM_REGISTRY) as [CanonicalOpName, ComponentType | null][])
    .filter(([, component]) => component === null)
    .map(([name]) => name);
}
