import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useModalController } from '../ModalController';

describe('ModalController write-flow', () => {
  it('submits operation and closes modal on success', async () => {
    const onDomainOpComplete = vi.fn(async () => true);
    const { result } = renderHook(() => useModalController(onDomainOpComplete));

    act(() => {
      result.current.dispatch('add_grid_source_sn', 'src-1', 'Source', {
        catalog_binding: {
          namespace: 'ZRODLO_SN',
          name: 'GPZ 15 kV',
        },
      });
    });

    expect(result.current.state.isOpen).toBe(true);

    await act(async () => {
      await result.current.handleSubmit({ voltage_kv: 15 });
    });

    expect(onDomainOpComplete).toHaveBeenCalledWith(
      'add_grid_source_sn',
      'src-1',
      {
        catalog_binding: {
          namespace: 'ZRODLO_SN',
          name: 'GPZ 15 kV',
        },
        voltage_kv: 15,
      },
    );
    expect(result.current.state.isOpen).toBe(false);
  });

  it('keeps modal open on failed write operation', async () => {
    const onDomainOpComplete = vi.fn(async () => false);
    const { result } = renderHook(() => useModalController(onDomainOpComplete));

    act(() => {
      result.current.dispatch('add_grid_source_sn', 'src-1', 'Source', {
        catalog_binding: {
          namespace: 'ZRODLO_SN',
          name: 'GPZ 15 kV',
        },
      });
    });

    await act(async () => {
      await result.current.handleSubmit({ voltage_kv: 15 });
    });

    expect(onDomainOpComplete).toHaveBeenCalledTimes(1);
    expect(result.current.state.isOpen).toBe(true);
    expect(result.current.state.canonicalOp).toBe('add_grid_source_sn');
  });

  it('dopuszcza topologiczne dodanie GPZ bez jawnego catalog_binding', async () => {
    const onDomainOpComplete = vi.fn(async () => true);
    const { result } = renderHook(() => useModalController(onDomainOpComplete));

    act(() => {
      result.current.dispatch('add_grid_source_sn', 'src-1', 'Source');
    });

    await act(async () => {
      await result.current.handleSubmit({ voltage_kv: 15 });
    });

    expect(onDomainOpComplete).toHaveBeenCalledWith(
      'add_grid_source_sn',
      'src-1',
      {
        voltage_kv: 15,
      },
    );
    expect(result.current.state.isOpen).toBe(false);
  });

  it('zachowuje jawny kontekst kanonicznego zrodla przeksztaltnikowego', async () => {
    const onDomainOpComplete = vi.fn(async () => true);
    const { result } = renderHook(() => useModalController(onDomainOpComplete));

    act(() => {
      result.current.dispatch('add_converter_source', 'st-1', 'Station', {
        source_technology: 'PV',
        connection_variant: 'nn_side',
        catalog_binding: {
          namespace: 'ZRODLO_NN_PV',
          name: 'Falownik PV 250 kW',
        },
      });
    });

    expect(result.current.state.canonicalOp).toBe('add_converter_source');
    expect(result.current.state.initialFormData).toMatchObject({
      source_technology: 'PV',
      connection_variant: 'nn_side',
      catalog_binding: {
        namespace: 'ZRODLO_NN_PV',
        name: 'Falownik PV 250 kW',
      },
    });

    await act(async () => {
      await result.current.handleSubmit({ p_kw: 250 });
    });

    expect(onDomainOpComplete).toHaveBeenCalledWith(
      'add_converter_source',
      'st-1',
      {
        source_technology: 'PV',
        connection_variant: 'nn_side',
        catalog_binding: {
          namespace: 'ZRODLO_NN_PV',
          name: 'Falownik PV 250 kW',
        },
        p_kw: 250,
      },
    );
    expect(result.current.state.isOpen).toBe(false);
  });

  it('blokuje add_converter_source bez jawnego catalog_binding', async () => {
    const onDomainOpComplete = vi.fn(async () => true);
    const { result } = renderHook(() => useModalController(onDomainOpComplete));

    act(() => {
      result.current.dispatch('add_converter_source', 'st-1', 'Station', {
        source_technology: 'BESS',
        connection_variant: 'nn_side',
      });
    });

    await act(async () => {
      await result.current.handleSubmit({ p_kw: 500, e_kwh: 1000 });
    });

    expect(onDomainOpComplete).not.toHaveBeenCalled();
    expect(result.current.state.isOpen).toBe(true);
    expect(result.current.state.canonicalOp).toBe('add_converter_source');
  });

  it('zachowuje jawny kontekst kanonicznego zrodla przeksztaltnikowego', async () => {
    const onDomainOpComplete = vi.fn(async () => true);
    const { result } = renderHook(() => useModalController(onDomainOpComplete));

    act(() => {
      result.current.dispatch('add_converter_source', 'st-1', 'Station', {
        source_technology: 'PV',
        connection_variant: 'nn_side',
        catalog_binding: {
          namespace: 'ZRODLO_NN_PV',
          name: 'Falownik PV 250 kW',
        },
      });
    });

    expect(result.current.state.canonicalOp).toBe('add_converter_source');
    expect(result.current.state.initialFormData).toMatchObject({
      source_technology: 'PV',
      connection_variant: 'nn_side',
      catalog_binding: {
        namespace: 'ZRODLO_NN_PV',
        name: 'Falownik PV 250 kW',
      },
    });

    await act(async () => {
      await result.current.handleSubmit({ p_kw: 250 });
    });

    expect(onDomainOpComplete).toHaveBeenCalledWith(
      'add_converter_source',
      'st-1',
      {
        source_technology: 'PV',
        connection_variant: 'nn_side',
        catalog_binding: {
          namespace: 'ZRODLO_NN_PV',
          name: 'Falownik PV 250 kW',
        },
        p_kw: 250,
      },
    );
    expect(result.current.state.isOpen).toBe(false);
  });

  it('blokuje add_converter_source bez jawnego catalog_binding', async () => {
    const onDomainOpComplete = vi.fn(async () => true);
    const { result } = renderHook(() => useModalController(onDomainOpComplete));

    act(() => {
      result.current.dispatch('add_converter_source', 'st-1', 'Station', {
        source_technology: 'BESS',
        connection_variant: 'nn_side',
      });
    });

    await act(async () => {
      await result.current.handleSubmit({ p_kw: 500, e_kwh: 1000 });
    });

    expect(onDomainOpComplete).not.toHaveBeenCalled();
    expect(result.current.state.isOpen).toBe(true);
    expect(result.current.state.canonicalOp).toBe('add_converter_source');
  });

  it('zachowuje jawny kontekst kanonicznego zrodla przeksztaltnikowego', async () => {
    const onDomainOpComplete = vi.fn(async () => true);
    const { result } = renderHook(() => useModalController(onDomainOpComplete));

    act(() => {
      result.current.dispatch('add_converter_source', 'st-1', 'Station', {
        source_technology: 'PV',
        connection_variant: 'nn_side',
        catalog_binding: {
          namespace: 'ZRODLO_NN_PV',
          name: 'Falownik PV 250 kW',
        },
      });
    });

    expect(result.current.state.canonicalOp).toBe('add_converter_source');
    expect(result.current.state.initialFormData).toMatchObject({
      source_technology: 'PV',
      connection_variant: 'nn_side',
      catalog_binding: {
        namespace: 'ZRODLO_NN_PV',
        name: 'Falownik PV 250 kW',
      },
    });

    await act(async () => {
      await result.current.handleSubmit({ p_kw: 250 });
    });

    expect(onDomainOpComplete).toHaveBeenCalledWith(
      'add_converter_source',
      'st-1',
      {
        source_technology: 'PV',
        connection_variant: 'nn_side',
        catalog_binding: {
          namespace: 'ZRODLO_NN_PV',
          name: 'Falownik PV 250 kW',
        },
        p_kw: 250,
      },
    );
    expect(result.current.state.isOpen).toBe(false);
  });

  it('blokuje add_converter_source bez jawnego catalog_binding', async () => {
    const onDomainOpComplete = vi.fn(async () => true);
    const { result } = renderHook(() => useModalController(onDomainOpComplete));

    act(() => {
      result.current.dispatch('add_converter_source', 'st-1', 'Station', {
        source_technology: 'BESS',
        connection_variant: 'nn_side',
      });
    });

    await act(async () => {
      await result.current.handleSubmit({ p_kw: 500, e_kwh: 1000 });
    });

    expect(onDomainOpComplete).not.toHaveBeenCalled();
    expect(result.current.state.isOpen).toBe(true);
    expect(result.current.state.canonicalOp).toBe('add_converter_source');
  });
});
