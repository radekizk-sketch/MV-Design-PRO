import { describe, expect, it } from 'vitest';
import {
  OPERATION_FORM_REGISTRY,
  resolveOperationForm,
  listOperationsWithForm,
  listOperationsWithoutForm,
} from '../operationFormRegistry';
import { CANONICAL_OPERATION_NAMES } from '../../../types/domainOps';

describe('OPERATION_FORM_REGISTRY', () => {
  it('zawiera wpis dla każdej CanonicalOpName', () => {
    for (const opName of CANONICAL_OPERATION_NAMES) {
      expect(OPERATION_FORM_REGISTRY).toHaveProperty(opName);
    }
  });

  it('operacje główne mają formularz', () => {
    expect(OPERATION_FORM_REGISTRY.add_grid_source_sn).toBeTruthy();
    expect(OPERATION_FORM_REGISTRY.add_sn_bay).toBeTruthy();
    expect(OPERATION_FORM_REGISTRY.continue_trunk_segment_sn).toBeTruthy();
    expect(OPERATION_FORM_REGISTRY.insert_station_on_segment_sn).toBeTruthy();
    expect(OPERATION_FORM_REGISTRY.add_converter_source).toBeTruthy();
  });

  it('operacje instant (delete/refresh) nie mają formularza', () => {
    expect(OPERATION_FORM_REGISTRY.delete_element).toBeNull();
    expect(OPERATION_FORM_REGISTRY.refresh_snapshot).toBeNull();
  });

  it('append_station używa tego samego formularza co insert', () => {
    expect(OPERATION_FORM_REGISTRY.append_station_on_endpoint).toBe(
      OPERATION_FORM_REGISTRY.insert_station_on_segment_sn,
    );
  });

  it('add_ct i add_vt używają wspólnego AddMeasurementForm', () => {
    expect(OPERATION_FORM_REGISTRY.add_ct).toBe(OPERATION_FORM_REGISTRY.add_vt);
  });

  it('add_genset_nn i add_ups_nn używają wspólnego AddDispatchableSourceForm', () => {
    expect(OPERATION_FORM_REGISTRY.add_genset_nn).toBe(OPERATION_FORM_REGISTRY.add_ups_nn);
  });

  it('connect_secondary_ring_sn i set_normal_open_point używają ConnectRingForm', () => {
    expect(OPERATION_FORM_REGISTRY.connect_secondary_ring_sn).toBe(
      OPERATION_FORM_REGISTRY.set_normal_open_point,
    );
  });
});

describe('resolveOperationForm', () => {
  it('zwraca component dla operacji z formularzem', () => {
    const component = resolveOperationForm('add_grid_source_sn');
    expect(component).toBeTruthy();
  });

  it('zwraca null dla operacji bez formularza', () => {
    expect(resolveOperationForm('delete_element')).toBeNull();
    expect(resolveOperationForm('refresh_snapshot')).toBeNull();
  });
});

describe('listOperationsWithForm', () => {
  it('zwraca tylko operacje z formularzem', () => {
    const list = listOperationsWithForm();
    expect(list).toContain('add_grid_source_sn');
    expect(list).toContain('add_sn_bay');
    expect(list).not.toContain('delete_element');
    expect(list).not.toContain('refresh_snapshot');
  });
});

describe('listOperationsWithoutForm', () => {
  it('zwraca tylko operacje instant', () => {
    const list = listOperationsWithoutForm();
    expect(list).toContain('delete_element');
    expect(list).toContain('refresh_snapshot');
    expect(list).not.toContain('add_grid_source_sn');
  });
});
