/**
 * Testy zakładki „Diagnostyka modelu" w przestrzeni Model (karta KD-4, L-8).
 *
 * ROZSTRZYGNIĘCIE KARTY: inspektor modelu ENM to zdolność diagnostyczna —
 * wchodzi do powłoki jako zakładka trybu EKSPERCKIEGO, bez flagi środowiskowej
 * (dotąd żył wyłącznie na trasie mostu za flagą domyślnie OFF, czyli był
 * praktycznie nieosiągalny). Kliki natywne, Zero-Debt pkt 5.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../szablony', () => ({
  PrzegladarkaSzablonow: () => <div data-testid="atrapa-przegladarka" />,
}));

vi.mock('../../../../ui/sld/v3/canvas/SldCanvasV3Workspace', () => ({
  SldCanvasV3Workspace: () => <div data-testid="atrapa-schemat" />,
}));

vi.mock('../../../../ui/network-build/station-templates', () => ({
  StationTemplateWizard: () => <div data-testid="atrapa-kreator-szablonu" />,
}));

vi.mock('../../../../ui/enm-inspector', () => ({
  EnmInspectorPage: () => <div data-testid="atrapa-inspektor-enm" />,
}));

import { useShellStore } from '../../../shell/useShellStore';
import { ModelWarsztat } from '../ModelWarsztat';

beforeEach(() => {
  useShellStore.setState({ advancementMode: 'basic' });
});

afterEach(() => cleanup());

describe('L-8 — diagnostyka modelu jako zakładka trybu eksperckiego', () => {
  it('TRYB PODSTAWOWY: zakładki diagnostyki nie ma (narzędzie nie zaśmieca toru pracy)', () => {
    render(<ModelWarsztat />);
    expect(screen.queryByTestId('mvd-model-zakladka-diagnostyka')).toBeNull();
  });

  it('TRYB EKSPERCKI: zakładka jest i otwiera inspektor modelu (bez flagi środowiskowej)', async () => {
    const user = userEvent.setup();
    useShellStore.setState({ advancementMode: 'expert' });
    render(<ModelWarsztat />);

    await user.click(screen.getByTestId('mvd-model-zakladka-diagnostyka'));
    expect(screen.getByTestId('atrapa-inspektor-enm')).toBeTruthy();
  });

  it('WYJŚCIE Z TRYBU przy otwartej diagnostyce nie zostawia pustego panelu', async () => {
    const user = userEvent.setup();
    useShellStore.setState({ advancementMode: 'expert' });
    const { rerender } = render(<ModelWarsztat />);
    await user.click(screen.getByTestId('mvd-model-zakladka-diagnostyka'));

    act(() => useShellStore.setState({ advancementMode: 'basic' }));
    rerender(<ModelWarsztat />);

    expect(screen.queryByTestId('atrapa-inspektor-enm')).toBeNull();
    expect(screen.getByTestId('atrapa-schemat')).toBeTruthy();
  });
});
