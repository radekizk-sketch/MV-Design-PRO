/**
 * Tests for AutomationPanel — Pakiet G.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AutomationPanel } from '../AutomationPanel';
import type { AutomationConfig } from '../automationTypes';

const SAMPLE_SPZ: AutomationConfig = {
  kind: 'SPZ',
  device_id: 'BR_1',
  enabled: true,
  cycles: [
    { cycle_no: 1, dead_time_s: 0.3, reclaim_time_s: 60 },
    { cycle_no: 2, dead_time_s: 5, reclaim_time_s: 60 },
  ],
};

const SAMPLE_SZR: AutomationConfig = {
  kind: 'SZR',
  device_id: 'BR_2',
  enabled: true,
  backup_priority: 1,
  delay_s: 0.5,
  sync_check_required: true,
};

const SAMPLE_SCO: AutomationConfig = {
  kind: 'SCO',
  device_id: 'BR_3',
  enabled: true,
  stages: [
    { stage_no: 1, freq_threshold_hz: 49.5, shed_percent: 10, delay_s: 0.2 },
    { stage_no: 2, freq_threshold_hz: 49.0, shed_percent: 15, delay_s: 0.2 },
  ],
};

const SAMPLE_FDIR: AutomationConfig = {
  kind: 'FDIR',
  device_id: 'BR_4',
  enabled: true,
  detection_zones: ['ZONE_A'],
  sequence: [
    { step_no: 1, phase: 'detection', action_description_pl: 'Wykryj zwarcie', max_duration_s: 0.5 },
    { step_no: 2, phase: 'isolation', action_description_pl: 'Izoluj', max_duration_s: 1 },
  ],
};

describe('AutomationPanel — UI automatyki', () => {
  it('renderuje 4 zakładki SPZ/SZR/SCO/FDIR', () => {
    render(<AutomationPanel configs={[]} editable />);
    expect(screen.getByTestId('automation-tab-SPZ')).toBeInTheDocument();
    expect(screen.getByTestId('automation-tab-SZR')).toBeInTheDocument();
    expect(screen.getByTestId('automation-tab-SCO')).toBeInTheDocument();
    expect(screen.getByTestId('automation-tab-FDIR')).toBeInTheDocument();
  });

  it('domyślna aktywna zakładka to SPZ', () => {
    render(<AutomationPanel configs={[SAMPLE_SPZ]} editable />);
    expect(screen.getByTestId('automation-content-SPZ')).toBeInTheDocument();
    expect(screen.getByTestId('spz-view-BR_1')).toBeInTheDocument();
  });

  it('przełączanie zakładek pokazuje właściwy view', () => {
    render(
      <AutomationPanel
        configs={[SAMPLE_SPZ, SAMPLE_SZR, SAMPLE_SCO, SAMPLE_FDIR]}
        editable
      />,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('automation-tab-SZR'));
    });
    expect(screen.getByTestId('szr-view-BR_2')).toBeInTheDocument();
    expect(screen.queryByTestId('spz-view-BR_1')).not.toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId('automation-tab-FDIR'));
    });
    expect(screen.getByTestId('fdir-view-BR_4')).toBeInTheDocument();
  });

  it('SPZ view: cykle widoczne', () => {
    render(<AutomationPanel configs={[SAMPLE_SPZ]} editable />);
    expect(screen.getByTestId('spz-cycle-BR_1-1')).toBeInTheDocument();
    expect(screen.getByTestId('spz-cycle-BR_1-2')).toBeInTheDocument();
  });

  it('SCO view: stopnie widoczne (3 kolumny)', () => {
    render(<AutomationPanel configs={[SAMPLE_SCO]} editable />);
    act(() => {
      fireEvent.click(screen.getByTestId('automation-tab-SCO'));
    });
    expect(screen.getByTestId('sco-stage-BR_3-1').textContent).toMatch(/49\.50/);
    expect(screen.getByTestId('sco-stage-BR_3-2').textContent).toMatch(/49\.00/);
  });

  it('FDIR view: kroki sekwencji w kolejności', () => {
    render(<AutomationPanel configs={[SAMPLE_FDIR]} editable />);
    act(() => {
      fireEvent.click(screen.getByTestId('automation-tab-FDIR'));
    });
    expect(screen.getByTestId('fdir-step-BR_4-1').textContent).toMatch(/Detekcja/);
    expect(screen.getByTestId('fdir-step-BR_4-2').textContent).toMatch(/Izolacja/);
  });

  it('editable=false → pokazuje read-only badge', () => {
    render(<AutomationPanel configs={[SAMPLE_SPZ]} editable={false} />);
    expect(screen.getByTestId('automation-readonly-badge')).toBeInTheDocument();
  });

  it('editable=true → brak read-only badge', () => {
    render(<AutomationPanel configs={[SAMPLE_SPZ]} editable />);
    expect(screen.queryByTestId('automation-readonly-badge')).not.toBeInTheDocument();
  });

  it('errors count widoczny gdy konfig nieprawidłowa', () => {
    const bad: AutomationConfig = {
      kind: 'SPZ',
      device_id: 'BR_X',
      enabled: true,
      cycles: [], // 0 cykli → błąd
    };
    render(<AutomationPanel configs={[bad]} editable />);
    expect(screen.getByTestId('automation-errors-count').textContent).toMatch(/1 błędów/);
  });

  it('pusta lista konfigów dla aktywnej zakładki → empty state', () => {
    render(<AutomationPanel configs={[SAMPLE_SZR]} editable />);
    expect(screen.getByTestId('automation-empty')).toBeInTheDocument();
  });

  it('determinizm: sortuje po device_id ASC', () => {
    const configs: AutomationConfig[] = [
      { ...SAMPLE_SPZ, device_id: 'BR_C' },
      { ...SAMPLE_SPZ, device_id: 'BR_A' },
      { ...SAMPLE_SPZ, device_id: 'BR_B' },
    ];
    const { container } = render(<AutomationPanel configs={configs} editable />);
    const views = container.querySelectorAll('[data-testid^="spz-view-"]');
    const ids = Array.from(views).map((v) => v.getAttribute('data-testid'));
    expect(ids).toEqual(['spz-view-BR_A', 'spz-view-BR_B', 'spz-view-BR_C']);
  });
});
