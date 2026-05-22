/**
 * LayerTogglePanel tests — pure component dla 13 warstw SLD.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LayerTogglePanel } from '../LayerTogglePanel';
import {
  LAYER_IDS,
  createInitialLayerState,
  setLayerVisibility,
} from '../layerToggle';
import type { LodLevel } from '../LodPolicy';

const LOD2: LodLevel = 2;

describe('LayerTogglePanel — render', () => {
  it('renders header "Warstwy (14)"', () => {
    render(
      <LayerTogglePanel
        state={createInitialLayerState()}
        currentLod={LOD2}
        onToggleLayer={vi.fn()}
      />,
    );
    expect(screen.getByText(/Warstwy \(14\)/)).toBeInTheDocument();
  });

  it('renders LOD badge', () => {
    render(
      <LayerTogglePanel
        state={createInitialLayerState()}
        currentLod={LOD2}
        onToggleLayer={vi.fn()}
      />,
    );
    expect(screen.getByText('LOD 2')).toBeInTheDocument();
  });

  it('renders all 13 layer rows', () => {
    render(
      <LayerTogglePanel
        state={createInitialLayerState()}
        currentLod={LOD2}
        onToggleLayer={vi.fn()}
      />,
    );
    for (const id of LAYER_IDS) {
      expect(screen.getByTestId(`sld-layer-toggle-${id}`)).toBeInTheDocument();
    }
  });

  it('reset button rendered when onResetAll provided', () => {
    render(
      <LayerTogglePanel
        state={createInitialLayerState()}
        currentLod={LOD2}
        onToggleLayer={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );
    expect(screen.getByTestId('sld-layer-toggle-reset')).toBeInTheDocument();
  });

  it('reset button NOT rendered when onResetAll omitted', () => {
    render(
      <LayerTogglePanel
        state={createInitialLayerState()}
        currentLod={LOD2}
        onToggleLayer={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('sld-layer-toggle-reset')).toBeNull();
  });
});

describe('LayerTogglePanel — interactions', () => {
  it('calls onToggleLayer with layer id when checkbox clicked', () => {
    const onToggle = vi.fn();
    render(
      <LayerTogglePanel
        state={createInitialLayerState()}
        currentLod={LOD2}
        onToggleLayer={onToggle}
      />,
    );
    const checkbox = screen
      .getByTestId('sld-layer-toggle-power')
      .querySelector('input')!;
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith('power');
  });

  it('calls onResetAll when reset clicked', () => {
    const onResetAll = vi.fn();
    render(
      <LayerTogglePanel
        state={createInitialLayerState()}
        currentLod={LOD2}
        onToggleLayer={vi.fn()}
        onResetAll={onResetAll}
      />,
    );
    fireEvent.click(screen.getByTestId('sld-layer-toggle-reset'));
    expect(onResetAll).toHaveBeenCalledOnce();
  });
});

describe('LayerTogglePanel — visibility states', () => {
  it('checkbox checked when layer visible by LOD default', () => {
    render(
      <LayerTogglePanel
        state={createInitialLayerState()}
        currentLod={LOD2}
        onToggleLayer={vi.fn()}
      />,
    );
    // power layer is visible from LOD 0
    const powerCheckbox = screen
      .getByTestId('sld-layer-toggle-power')
      .querySelector('input')! as HTMLInputElement;
    expect(powerCheckbox.checked).toBe(true);
  });

  it('checkbox unchecked when layer hidden by LOD default', () => {
    render(
      <LayerTogglePanel
        state={createInitialLayerState()}
        currentLod={LOD2}
        onToggleLayer={vi.fn()}
      />,
    );
    // ports visible only from LOD 4
    const portsCheckbox = screen
      .getByTestId('sld-layer-toggle-ports')
      .querySelector('input')! as HTMLInputElement;
    expect(portsCheckbox.checked).toBe(false);
  });

  it('overridden marker (✱) shown when layer explicitly set', () => {
    const state = setLayerVisibility(createInitialLayerState(), 'power', false);
    render(
      <LayerTogglePanel
        state={state}
        currentLod={LOD2}
        onToggleLayer={vi.fn()}
      />,
    );
    const row = screen.getByTestId('sld-layer-toggle-power');
    expect(row.textContent).toContain('✱');
  });

  it('no overridden marker for default layer', () => {
    render(
      <LayerTogglePanel
        state={createInitialLayerState()}
        currentLod={LOD2}
        onToggleLayer={vi.fn()}
      />,
    );
    const row = screen.getByTestId('sld-layer-toggle-power');
    expect(row.textContent).not.toContain('✱');
  });
});
