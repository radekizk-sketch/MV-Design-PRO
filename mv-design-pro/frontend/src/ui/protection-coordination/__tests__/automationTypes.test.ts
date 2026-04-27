/**
 * Tests for automationTypes — walidatory SPZ/SZR/SCO/FDIR (Pakiet G).
 */

import { describe, expect, it } from 'vitest';

import {
  AUTOMATION_LABELS_PL,
  validateAutomation,
  validateFdir,
  validateSco,
  validateSpz,
  validateSzr,
} from '../automationTypes';
import type {
  FdirConfig,
  ScoConfig,
  SpzConfig,
  SzrConfig,
} from '../automationTypes';

describe('automationTypes — etykiety i walidatory', () => {
  it('AUTOMATION_LABELS_PL: 4 wpisy w PL (NIE „AAR")', () => {
    expect(AUTOMATION_LABELS_PL.SPZ).toMatch(/Samoczynne Ponowne Załączenie/);
    expect(AUTOMATION_LABELS_PL.SZR).toMatch(/Samoczynne Załączenie Rezerwy/);
    expect(AUTOMATION_LABELS_PL.SCO).toMatch(/Częstotliwościowe Odciążenie/);
    expect(AUTOMATION_LABELS_PL.FDIR).toMatch(/Lokalizacja/);
    // Negative: NIE używamy „AAR"
    for (const label of Object.values(AUTOMATION_LABELS_PL)) {
      expect(label).not.toMatch(/\bAAR\b/);
    }
  });

  describe('validateSpz', () => {
    const okCfg: SpzConfig = {
      kind: 'SPZ',
      device_id: 'BR_1',
      enabled: true,
      cycles: [
        { cycle_no: 1, dead_time_s: 0.3, reclaim_time_s: 60 },
        { cycle_no: 2, dead_time_s: 5, reclaim_time_s: 60 },
      ],
    };

    it('poprawna konfiguracja → null', () => {
      expect(validateSpz(okCfg)).toBeNull();
    });

    it('0 cykli → błąd', () => {
      expect(validateSpz({ ...okCfg, cycles: [] })).toMatch(/przynajmniej 1/);
    });

    it('> 3 cykle → błąd', () => {
      const cycles = [1, 2, 3, 4].map((n) => ({
        cycle_no: n,
        dead_time_s: 1,
        reclaim_time_s: 60,
      }));
      expect(validateSpz({ ...okCfg, cycles })).toMatch(/max 3/);
    });

    it('numeracja cykli niezgodna → błąd', () => {
      const cycles = [{ cycle_no: 2, dead_time_s: 1, reclaim_time_s: 60 }];
      expect(validateSpz({ ...okCfg, cycles })).toMatch(/cycle_no=2.*1/);
    });

    it('dead_time_s ≤ 0 → błąd', () => {
      const cycles = [{ cycle_no: 1, dead_time_s: 0, reclaim_time_s: 60 }];
      expect(validateSpz({ ...okCfg, cycles })).toMatch(/dead_time/);
    });
  });

  describe('validateSzr', () => {
    it('poprawna → null', () => {
      const cfg: SzrConfig = {
        kind: 'SZR',
        device_id: 'BR_2',
        enabled: true,
        backup_priority: 1,
        delay_s: 0.5,
        sync_check_required: true,
      };
      expect(validateSzr(cfg)).toBeNull();
    });

    it('priorytet 0 → błąd', () => {
      const cfg: SzrConfig = {
        kind: 'SZR',
        device_id: 'BR_2',
        enabled: true,
        backup_priority: 0,
        delay_s: 0.5,
        sync_check_required: false,
      };
      expect(validateSzr(cfg)).toMatch(/backup_priority/);
    });

    it('opóźnienie ujemne → błąd', () => {
      const cfg: SzrConfig = {
        kind: 'SZR',
        device_id: 'BR_2',
        enabled: true,
        backup_priority: 1,
        delay_s: -1,
        sync_check_required: true,
      };
      expect(validateSzr(cfg)).toMatch(/delay_s/);
    });
  });

  describe('validateSco', () => {
    const okCfg: ScoConfig = {
      kind: 'SCO',
      device_id: 'BR_3',
      enabled: true,
      stages: [
        { stage_no: 1, freq_threshold_hz: 49.5, shed_percent: 10, delay_s: 0.2 },
        { stage_no: 2, freq_threshold_hz: 49.0, shed_percent: 15, delay_s: 0.2 },
        { stage_no: 3, freq_threshold_hz: 48.5, shed_percent: 20, delay_s: 0.2 },
      ],
    };

    it('poprawne stopnie → null', () => {
      expect(validateSco(okCfg)).toBeNull();
    });

    it('próg poza zakresem → błąd', () => {
      const stages = [{ stage_no: 1, freq_threshold_hz: 51, shed_percent: 10, delay_s: 0 }];
      expect(validateSco({ ...okCfg, stages })).toMatch(/spoza/);
    });

    it('shed_percent > 100 → błąd', () => {
      const stages = [{ stage_no: 1, freq_threshold_hz: 49, shed_percent: 150, delay_s: 0 }];
      expect(validateSco({ ...okCfg, stages })).toMatch(/shed_percent/);
    });

    it('progi nie malejące → błąd', () => {
      const stages = [
        { stage_no: 1, freq_threshold_hz: 49.0, shed_percent: 10, delay_s: 0 },
        { stage_no: 2, freq_threshold_hz: 49.5, shed_percent: 10, delay_s: 0 }, // wyższy niż poprzedni
      ];
      expect(validateSco({ ...okCfg, stages })).toMatch(/malejąco/);
    });
  });

  describe('validateFdir', () => {
    const okCfg: FdirConfig = {
      kind: 'FDIR',
      device_id: 'BR_4',
      enabled: true,
      detection_zones: ['ZONE_A'],
      sequence: [
        { step_no: 1, phase: 'detection', action_description_pl: 'Wykryj zwarcie', max_duration_s: 0.5 },
        { step_no: 2, phase: 'isolation', action_description_pl: 'Izoluj sekcję', max_duration_s: 1 },
        { step_no: 3, phase: 'restoration', action_description_pl: 'Przywróć zasilanie', max_duration_s: 5 },
      ],
    };

    it('poprawna sekwencja → null', () => {
      expect(validateFdir(okCfg)).toBeNull();
    });

    it('pusta sekwencja → błąd', () => {
      expect(validateFdir({ ...okCfg, sequence: [] })).toMatch(/przynajmniej 1/);
    });

    it('faza w niepoprawnej kolejności (restoration przed isolation) → błąd', () => {
      const seq = [
        { step_no: 1, phase: 'restoration' as const, action_description_pl: 'X', max_duration_s: 1 },
        { step_no: 2, phase: 'isolation' as const, action_description_pl: 'Y', max_duration_s: 1 },
      ];
      expect(validateFdir({ ...okCfg, sequence: seq })).toMatch(/przed/);
    });
  });

  describe('validateAutomation (dispatcher)', () => {
    it('dispatch po kind', () => {
      const spz: SpzConfig = {
        kind: 'SPZ',
        device_id: 'X',
        enabled: true,
        cycles: [{ cycle_no: 1, dead_time_s: 1, reclaim_time_s: 60 }],
      };
      expect(validateAutomation(spz)).toBeNull();
    });
  });
});
