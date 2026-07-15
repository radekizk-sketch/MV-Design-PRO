import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeSwitch, AdvancementGate } from '../ModeSwitch';
import type { AdvancementMode } from '../modeModel';
import { SHELL_STRINGS } from '../strings';
import { useShellStore } from '../useShellStore';
import { useAppStateStore } from '../../../ui/app-state';

describe('ModeSwitch — trzy tryby zaawansowania', () => {
  it('renderuje trzy tryby z etykietami §5 i zgłasza zmianę', () => {
    const onChange = vi.fn();
    render(<ModeSwitch mode="basic" onChange={onChange} />);
    expect(screen.getByRole('button', { name: SHELL_STRINGS.modeBasic })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SHELL_STRINGS.modeExtended })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SHELL_STRINGS.modeExpert })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: SHELL_STRINGS.modeExpert }));
    expect(onChange).toHaveBeenCalledWith('expert');
  });

  it('aktywny tryb ma aria-pressed=true', () => {
    render(<ModeSwitch mode="extended" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: SHELL_STRINGS.modeExtended })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

function GateHarness() {
  const [mode, setMode] = useState<AdvancementMode>('extended');
  return (
    <div>
      <button type="button" onClick={() => setMode('basic')}>
        ustaw-podstawowy
      </button>
      <button type="button" onClick={() => setMode('extended')}>
        ustaw-rozszerzony
      </button>
      <AdvancementGate minMode="extended" currentMode={mode} testId="brama">
        <input data-testid="pole-w-bramie" defaultValue="" />
      </AdvancementGate>
    </div>
  );
}

describe('AdvancementGate — progresywne odsłanianie', () => {
  it('ukrywa element poniżej minimalnego trybu (bez usuwania z drzewa)', () => {
    render(<AdvancementGate minMode="expert" currentMode="basic" testId="brama" />);
    expect(screen.getByTestId('brama')).toHaveAttribute('hidden');
  });

  it('odsłania element w trybie ≥ minimalnego', () => {
    render(<AdvancementGate minMode="extended" currentMode="expert" testId="brama" />);
    expect(screen.getByTestId('brama')).not.toHaveAttribute('hidden');
  });

  it('zachowuje stan wewnętrzny dziecka przy ukryciu/odsłonięciu (bez remount)', () => {
    render(<GateHarness />);
    const input = screen.getByTestId('pole-w-bramie') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'wartość-testowa' } });

    fireEvent.click(screen.getByText('ustaw-podstawowy'));
    expect(screen.getByTestId('brama')).toHaveAttribute('hidden');

    fireEvent.click(screen.getByText('ustaw-rozszerzony'));
    expect(screen.getByTestId('brama')).not.toHaveAttribute('hidden');
    // Ten sam węzeł DOM, wartość zachowana → brak remountu.
    expect((screen.getByTestId('pole-w-bramie') as HTMLInputElement).value).toBe('wartość-testowa');
  });
});

describe('Tryb nie zmienia store danych', () => {
  beforeEach(() => {
    useShellStore.setState({ advancementMode: 'basic' });
  });

  it('zmiana trybu zaawansowania nie modyfikuje app-state', () => {
    const before = useAppStateStore.getState();
    const snapshot = {
      activeProjectId: before.activeProjectId,
      activeCaseId: before.activeCaseId,
      activeCaseResultStatus: before.activeCaseResultStatus,
      activeArea: before.activeArea,
    };

    useShellStore.getState().setAdvancementMode('expert');
    expect(useShellStore.getState().advancementMode).toBe('expert');

    const after = useAppStateStore.getState();
    expect(after.activeProjectId).toBe(snapshot.activeProjectId);
    expect(after.activeCaseId).toBe(snapshot.activeCaseId);
    expect(after.activeCaseResultStatus).toBe(snapshot.activeCaseResultStatus);
    expect(after.activeArea).toBe(snapshot.activeArea);
  });
});
