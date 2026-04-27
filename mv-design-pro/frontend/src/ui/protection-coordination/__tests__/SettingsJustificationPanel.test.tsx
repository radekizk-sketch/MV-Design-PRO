/**
 * Tests for SettingsJustificationPanel — 4 valid states (Pakiet G).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SettingsJustificationPanel } from '../SettingsJustificationPanel';
import type { JustificationState } from '../SettingsJustificationPanel';

describe('SettingsJustificationPanel — 4 stany A/B/C/D', () => {
  it('A) fresh_trace: pokazuje wzór + dane + margines', () => {
    const state: JustificationState = {
      kind: 'fresh_trace',
      trace_id: 'TR_001',
      formula_latex: '$$ I_> = k \\cdot I_{n} $$',
      computed_at: '2026-04-27T10:00:00Z',
      margin_percent: 25.4,
    };
    render(
      <SettingsJustificationPanel
        device_id="BR_1"
        setting_label_pl="Próg I>"
        setting_value_display="450 A"
        state={state}
      />,
    );
    expect(screen.getByTestId('settings-justification-panel')).toHaveAttribute(
      'data-state-kind',
      'fresh_trace',
    );
    expect(screen.getByTestId('just-state-fresh')).toBeInTheDocument();
    expect(screen.getByTestId('just-formula').textContent).toMatch(/I_>.*I_/);
    expect(screen.getByTestId('just-margin').textContent).toMatch(/25\.4/);
  });

  it('B) outdated_trace: banner ostrzegawczy + przycisk Przelicz', () => {
    const onRecalculate = vi.fn();
    const state: JustificationState = {
      kind: 'outdated_trace',
      trace_id: 'TR_001',
      computed_at: '2026-04-20T10:00:00Z',
      on_recalculate: onRecalculate,
    };
    render(
      <SettingsJustificationPanel
        device_id="BR_1"
        setting_label_pl="Próg I>"
        setting_value_display="450 A"
        state={state}
      />,
    );
    expect(screen.getByTestId('just-state-outdated')).toBeInTheDocument();
    expect(screen.getByTestId('just-outdated-content').textContent).toMatch(
      /Wyniki nieaktualne/,
    );
    fireEvent.click(screen.getByTestId('just-recalculate'));
    expect(onRecalculate).toHaveBeenCalled();
  });

  it('C) manual: pokazuje set_by + brak uzasadnienia obliczeniowego', () => {
    const state: JustificationState = {
      kind: 'manual',
      set_by: 'jan.kowalski',
      set_at: '2026-04-25T15:00:00Z',
      reason: 'Decyzja dyspozytora po zdarzeniu',
    };
    render(
      <SettingsJustificationPanel
        device_id="BR_1"
        setting_label_pl="Próg I>"
        setting_value_display="500 A"
        state={state}
      />,
    );
    expect(screen.getByTestId('just-state-manual')).toBeInTheDocument();
    expect(screen.getByTestId('just-manual-content').textContent).toMatch(/jan\.kowalski/);
    expect(screen.getByTestId('just-manual-content').textContent).toMatch(
      /Brak uzasadnienia obliczeniowego/,
    );
    expect(screen.getByTestId('just-manual-reason').textContent).toMatch(/dyspozytora/);
  });

  it('C) manual bez powodu — sekcja powodu nie rendered', () => {
    const state: JustificationState = {
      kind: 'manual',
      set_by: 'op.1',
      set_at: '2026-04-25',
    };
    render(
      <SettingsJustificationPanel
        device_id="BR_1"
        setting_label_pl="Tms"
        setting_value_display="0.5 s"
        state={state}
      />,
    );
    expect(screen.queryByTestId('just-manual-reason')).not.toBeInTheDocument();
  });

  it('D) empty: pokazuje empty state + przycisk Konfiguruj', () => {
    const onConfigure = vi.fn();
    const state: JustificationState = {
      kind: 'empty',
      on_configure: onConfigure,
    };
    render(
      <SettingsJustificationPanel
        device_id="BR_1"
        setting_label_pl="Próg I>"
        setting_value_display="—"
        state={state}
      />,
    );
    expect(screen.getByTestId('just-state-empty')).toBeInTheDocument();
    expect(screen.getByTestId('just-empty-content').textContent).toMatch(
      /Brak nastawy/,
    );
    fireEvent.click(screen.getByTestId('just-configure'));
    expect(onConfigure).toHaveBeenCalled();
  });

  it('D) empty bez on_configure — przycisk nie rendered', () => {
    render(
      <SettingsJustificationPanel
        device_id="BR_1"
        setting_label_pl="Próg I>"
        setting_value_display="—"
        state={{ kind: 'empty' }}
      />,
    );
    expect(screen.queryByTestId('just-configure')).not.toBeInTheDocument();
  });

  it('data-state-kind attribute matches state kind', () => {
    const states: JustificationState[] = [
      { kind: 'manual', set_by: 'a', set_at: 'b' },
      { kind: 'empty' },
    ];
    for (const state of states) {
      const { unmount } = render(
        <SettingsJustificationPanel
          device_id="BR_1"
          setting_label_pl="X"
          setting_value_display="Y"
          state={state}
        />,
      );
      expect(screen.getByTestId('settings-justification-panel')).toHaveAttribute(
        'data-state-kind',
        state.kind,
      );
      unmount();
    }
  });
});
