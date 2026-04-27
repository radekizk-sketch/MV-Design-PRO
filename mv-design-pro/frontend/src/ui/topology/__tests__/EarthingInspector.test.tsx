/**
 * Tests for EarthingInspector — Pakiet E.
 *
 * Sprawdza renderowanie 5 osobnych elementów uziemienia:
 *   GPZ / Transformer / Busbar / Cable / Petersen
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EarthingInspector } from '../EarthingInspector';
import {
  validatePetersenCoilParams,
  validatePetersenCompensation,
} from '../earthingTypes';
import type {
  BusbarEarthing,
  CableScreenEarthing,
  GpzEarthing,
  PetersenCoil,
  TransformerEarthing,
} from '../earthingTypes';

describe('EarthingInspector — 5 typów uziemienia', () => {
  it('GPZ: renderuje sekcję z X0/R0/C0', () => {
    const data: GpzEarthing = {
      gpz_id: 'GPZ_1',
      mode: 'petersen',
      x0_ohm: 12.5,
      r0_ohm: 0.5,
      c0_uf: 1.2,
    };
    render(<EarthingInspector entity={{ kind: 'gpz', data }} />);
    expect(screen.getByTestId('earthing-inspector')).toHaveAttribute('data-earthing-kind', 'gpz');
    expect(screen.getByTestId('earthing-gpz-section')).toBeInTheDocument();
    expect(screen.getByTestId('gpz-mode').textContent).toMatch(/Petersen/);
    expect(screen.getByTestId('gpz-x0').textContent).toMatch(/12\.500.*Ω/);
  });

  it('Transformer: renderuje sekcję z R_E/X_E', () => {
    const data: TransformerEarthing = {
      transformer_id: 'TRA_1',
      ln_grounded: true,
      r_e_ohm: 1.5,
      x_e_ohm: 0,
    };
    render(<EarthingInspector entity={{ kind: 'transformer', data }} />);
    expect(screen.getByTestId('earthing-transformer-section')).toBeInTheDocument();
    expect(screen.getByTestId('trafo-ln-grounded').textContent).toMatch(/Uziemiony/);
    expect(screen.getByTestId('trafo-re').textContent).toMatch(/1\.500/);
  });

  it('Busbar: renderuje tryb pracy sieci', () => {
    const data: BusbarEarthing = {
      busbar_id: 'BUS_1',
      mode: 'isolated',
    };
    render(<EarthingInspector entity={{ kind: 'busbar', data }} />);
    expect(screen.getByTestId('earthing-busbar-section')).toBeInTheDocument();
    expect(screen.getByTestId('bus-mode').textContent).toMatch(/izolowana/);
  });

  it('Cable screen: renderuje tryb uziemienia ekranu', () => {
    const data: CableScreenEarthing = {
      cable_id: 'CAB_1',
      mode: 'cross_bonded',
      r_screen_ohm: 0.05,
    };
    render(<EarthingInspector entity={{ kind: 'cable_screen', data }} />);
    expect(screen.getByTestId('earthing-cable-section')).toBeInTheDocument();
    expect(screen.getByTestId('cable-mode').textContent).toMatch(/Cross-bonded/);
  });

  it('Petersen: renderuje L/R_par/kompensacja', () => {
    const data: PetersenCoil = {
      coil_id: 'PET_1',
      l_h: 0.5,
      r_par_ohm: 100,
      compensation_percent: 95,
      control_mode: 'auto',
    };
    render(<EarthingInspector entity={{ kind: 'petersen', data }} />);
    expect(screen.getByTestId('earthing-petersen-section')).toBeInTheDocument();
    expect(screen.getByTestId('petersen-compensation').textContent).toMatch(/95\.0/);
    expect(screen.getByTestId('petersen-control-mode').textContent).toMatch(/Automatyczny/);
    expect(screen.queryByTestId('petersen-error')).not.toBeInTheDocument();
  });

  it('Petersen z naruszeniem kompensacji → pokazuje błąd', () => {
    const data: PetersenCoil = {
      coil_id: 'PET_BAD',
      l_h: 0.5,
      compensation_percent: 30, // poniżej 50%
      control_mode: 'manual',
    };
    render(<EarthingInspector entity={{ kind: 'petersen', data }} />);
    expect(screen.getByTestId('petersen-error').textContent).toMatch(/niedokompensowanie/);
  });

  it('przycisk Edytuj → wywołuje callback', () => {
    const data: GpzEarthing = { gpz_id: 'GPZ_1', mode: 'isolated' };
    const onEdit = vi.fn();
    render(<EarthingInspector entity={{ kind: 'gpz', data }} onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId('earthing-edit-button'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('brak onEdit → przycisk Edytuj nie rendered', () => {
    const data: GpzEarthing = { gpz_id: 'GPZ_1', mode: 'isolated' };
    render(<EarthingInspector entity={{ kind: 'gpz', data }} />);
    expect(screen.queryByTestId('earthing-edit-button')).not.toBeInTheDocument();
  });
});

describe('validatePetersenCompensation', () => {
  it('zakres 50–110 → null', () => {
    expect(validatePetersenCompensation(50)).toBeNull();
    expect(validatePetersenCompensation(95)).toBeNull();
    expect(validatePetersenCompensation(110)).toBeNull();
  });

  it('< 50 → niedokompensowanie', () => {
    expect(validatePetersenCompensation(30)).toMatch(/niedokompensowanie/);
  });

  it('> 110 → przekompensowanie', () => {
    expect(validatePetersenCompensation(120)).toMatch(/przekompensowanie/);
  });

  it('NaN → błąd', () => {
    expect(validatePetersenCompensation(NaN)).toMatch(/liczbą/);
  });
});

describe('validatePetersenCoilParams', () => {
  it('poprawna cewka → null', () => {
    const c: PetersenCoil = {
      coil_id: 'P',
      l_h: 0.5,
      r_par_ohm: 100,
      compensation_percent: 95,
      control_mode: 'auto',
    };
    expect(validatePetersenCoilParams(c)).toBeNull();
  });

  it('L ≤ 0 → błąd', () => {
    const c: PetersenCoil = {
      coil_id: 'P',
      l_h: 0,
      compensation_percent: 95,
      control_mode: 'manual',
    };
    expect(validatePetersenCoilParams(c)).toMatch(/Indukcyjność/);
  });

  it('R_par < 0 → błąd', () => {
    const c: PetersenCoil = {
      coil_id: 'P',
      l_h: 0.5,
      r_par_ohm: -1,
      compensation_percent: 95,
      control_mode: 'manual',
    };
    expect(validatePetersenCoilParams(c)).toMatch(/Rezystancja/);
  });
});
