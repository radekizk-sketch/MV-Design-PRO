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
import { KreatorKompensatoraSn } from '../../ui2/kreatory/kompensator';
import { KreatorOdgalezienia } from '../../ui2/kreatory/odgalezienie';
import { KreatorOgranicznikaSn } from '../../ui2/kreatory/ogranicznik';
import { KreatorLacznikaSekcyjnego } from '../../ui2/kreatory/lacznik';
import { KreatorMagistralaSn } from '../../ui2/kreatory/magistrala';
import { KreatorOdbioruNn } from '../../ui2/kreatory/odbior';
import { KreatorPierscienia } from '../../ui2/kreatory/pierscien';
import { KreatorPolaSn } from '../../ui2/kreatory/pole';
import { KreatorSlupaOdgaleznego } from '../../ui2/kreatory/slup-odgalezny';
import { KreatorStacjiSnNn } from '../../ui2/kreatory/stacja';
import { KreatorTransformatoraSnNn } from '../../ui2/kreatory/transformator';
import { KreatorZksn } from '../../ui2/kreatory/zksn';
import { KreatorZrodloDyspozycyjne } from '../../ui2/kreatory/zrodlo-dyspozycyjne';
import { KreatorZrodloZasilania } from '../../ui2/kreatory/zrodlo';
import { KreatorZrodlaOze } from '../../ui2/kreatory/zrodlo-oze';
import { KreatorEdycjiParametrow } from '../../ui2/kreatory/edycja-parametrow';
import { KreatorPolaNn } from '../../ui2/kreatory/pole-nn';
import { KreatorPomiaru } from '../../ui2/kreatory/pomiar';
import { KreatorPrzekaznika } from '../../ui2/kreatory/przekaznik';
import { KreatorPrzypisaniaKatalogu } from '../../ui2/kreatory/przypisanie-katalogu';

/**
 * Mapowanie CanonicalOpName → React component formularza.
 * `null` znaczy "operacja nie ma formularza" (np. delete_element, refresh_snapshot).
 */
export const OPERATION_FORM_REGISTRY: Readonly<Record<CanonicalOpName, ComponentType | null>> = {
  add_grid_source_sn: KreatorZrodloZasilania,
  add_sn_bay: KreatorPolaSn,
  continue_trunk_segment_sn: KreatorMagistralaSn,
  insert_station_on_segment_sn: KreatorStacjiSnNn,
  append_station_on_endpoint: KreatorStacjiSnNn,
  insert_branch_pole_on_segment_sn: KreatorSlupaOdgaleznego,
  insert_zksn_on_segment_sn: KreatorZksn,
  start_branch_segment_sn: KreatorOdgalezienia,
  insert_section_switch_sn: KreatorLacznikaSekcyjnego,
  connect_secondary_ring_sn: KreatorPierscienia,
  set_normal_open_point: KreatorPierscienia,
  add_transformer_sn_nn: KreatorTransformatoraSnNn,
  assign_catalog_to_element: KreatorPrzypisaniaKatalogu,
  update_element_parameters: KreatorEdycjiParametrow,
  add_nn_outgoing_field: KreatorPolaNn,
  add_converter_source: KreatorZrodlaOze,
  add_genset_nn: KreatorZrodloDyspozycyjne,
  add_ups_nn: KreatorZrodloDyspozycyjne,
  add_shunt_compensator_sn: KreatorKompensatoraSn,
  add_surge_arrester_sn: KreatorOgranicznikaSn,
  add_nn_load: KreatorOdbioruNn,
  add_ct: KreatorPomiaru,
  add_vt: KreatorPomiaru,
  add_relay: KreatorPrzekaznika,
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
