/**
 * FIX-12B — Types and Labels Tests
 *
 * Tests for Polish labels and type mappings.
 */

import { describe, it, expect } from 'vitest';
import {
  LABELS,
  VERDICT_STYLES,
  DEFAULT_CONFIG,
  DEFAULT_CURVE_SETTINGS,
  DEFAULT_STAGE_51,
  DEVICE_TEMPLATES,
} from '../types';

describe('Protection Coordination Types', () => {
  describe('LABELS', () => {
    it('should have title defined', () => {
      expect(LABELS.title).toBe('Koordynacja zabezpieczeń nadprądowych');
    });

    it('should have all required sections', () => {
      expect(LABELS.devices).toBeDefined();
      expect(LABELS.settings).toBeDefined();
      expect(LABELS.checks).toBeDefined();
      expect(LABELS.tcc).toBeDefined();
      expect(LABELS.trace).toBeDefined();
      expect(LABELS.verdict).toBeDefined();
      expect(LABELS.deviceTypes).toBeDefined();
      expect(LABELS.curveTypes).toBeDefined();
      expect(LABELS.actions).toBeDefined();
      expect(LABELS.status).toBeDefined();
      expect(LABELS.tabs).toBeDefined();
    });

    it('should have Canonical-style verdict labels', () => {
      expect(LABELS.verdict.PASS).toBe('Zgodne');
      expect(LABELS.verdict.MARGINAL).toBe('Na granicy dopuszczalności');
      expect(LABELS.verdict.FAIL).toBe('Wymaga korekty');
      expect(LABELS.verdict.ERROR).toBe('Wystąpił błąd');
    });

    it('should have verbose verdict labels', () => {
      expect(LABELS.verdictVerbose.PASS).toBe('Koordynacja prawidłowa, wszystkie kryteria spełnione.');
      expect(LABELS.verdictVerbose.MARGINAL).toBe('Koordynacja z niskim marginesem. Zalecana weryfikacja parametrów.');
      expect(LABELS.verdictVerbose.FAIL).toBe('Brak prawidłowej koordynacji. Wymagana korekta nastaw.');
      expect(LABELS.verdictVerbose.ERROR).toBe('Wystąpił błąd podczas analizy. Sprawdź dane wejściowe.');
    });

    it('should have all device types in Polish', () => {
      expect(LABELS.deviceTypes.RELAY).toBe('Przekaźnik nadprądowy');
      expect(LABELS.deviceTypes.FUSE).toBe('Bezpiecznik');
      expect(LABELS.deviceTypes.RECLOSER).toBe('Wyłącznik samoczynny');
      expect(LABELS.deviceTypes.CIRCUIT_BREAKER).toBe('Wyłącznik z wyzwalaczem');
    });

    it('should have all curve types in Polish', () => {
      expect(LABELS.curveTypes.SI).toBe('Normalna odwrotna (SI)');
      expect(LABELS.curveTypes.VI).toBe('Bardzo odwrotna (VI)');
      expect(LABELS.curveTypes.EI).toBe('Ekstremalnie odwrotna (EI)');
      expect(LABELS.curveTypes.LTI).toBe('Długoczasowa odwrotna (LTI)');
      expect(LABELS.curveTypes.DT).toBe('Czas niezależny (DT)');
      expect(LABELS.curveTypes.MI).toBe('Umiarkowanie odwrotna (MI)');
      expect(LABELS.curveTypes.STI).toBe('Krótkoczasowa odwrotna (STI)');
    });

    it('should have all tab labels', () => {
      expect(LABELS.tabs.summary).toBe('Podsumowanie');
      expect(LABELS.tabs.sensitivity).toBe('Czułość');
      expect(LABELS.tabs.selectivity).toBe('Selektywność');
      expect(LABELS.tabs.overload).toBe('Przeciążalność');
      expect(LABELS.tabs.tcc).toBe('Wykres TCC');
      expect(LABELS.tabs.trace).toBe('Ślad obliczeń');
    });

    it('should NOT contain project codenames (forbidden)', () => {
      const allLabels = JSON.stringify(LABELS);
      const forbiddenCodenames = ['P7', 'P11', 'P14', 'P15', 'P17', 'P20', 'FIX-']; // no-codenames-ignore

      for (const codename of forbiddenCodenames) {
        expect(allLabels).not.toContain(codename);
      }
    });

    it('should have context labels for StudyCase/Snapshot/Run', () => {
      expect(LABELS.context.project).toBe('Projekt');
      expect(LABELS.context.studyCase).toBe('Przypadek obliczeniowy');
      expect(LABELS.context.snapshot).toBe('Migawka sieci');
      expect(LABELS.context.run).toBe('Przebieg analizy');
    });

    it('should have validation messages in Polish', () => {
      expect(LABELS.validation.pickupPositive).toBe('Prąd rozruchowy musi być dodatni');
      expect(LABELS.validation.tmsRange).toBe('TMS musi być w zakresie 0.05-10.0');
      expect(LABELS.validation.timePositive).toBe('Czas musi być dodatni');
      expect(LABELS.validation.minOneDevice).toBe('Dodaj przynajmniej jedno urządzenie');
    });
  });

  describe('VERDICT_STYLES', () => {
    it('should have styles for all verdicts', () => {
      expect(VERDICT_STYLES.PASS).toBeDefined();
      expect(VERDICT_STYLES.MARGINAL).toBeDefined();
      expect(VERDICT_STYLES.FAIL).toBeDefined();
      expect(VERDICT_STYLES.ERROR).toBeDefined();
    });

    it('should have proper Tailwind classes', () => {
      // PASS = emerald
      expect(VERDICT_STYLES.PASS.bg).toContain('emerald');
      expect(VERDICT_STYLES.PASS.text).toContain('emerald');

      // MARGINAL = amber
      expect(VERDICT_STYLES.MARGINAL.bg).toContain('amber');
      expect(VERDICT_STYLES.MARGINAL.text).toContain('amber');

      // FAIL = orange
      expect(VERDICT_STYLES.FAIL.bg).toContain('orange');
      expect(VERDICT_STYLES.FAIL.text).toContain('orange');

      // ERROR = slate
      expect(VERDICT_STYLES.ERROR.bg).toContain('slate');
      expect(VERDICT_STYLES.ERROR.text).toContain('slate');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have sensible default values', () => {
      expect(DEFAULT_CONFIG.breaker_time_s).toBe(0.05);
      expect(DEFAULT_CONFIG.relay_overtravel_s).toBe(0.05);
      expect(DEFAULT_CONFIG.safety_factor_s).toBe(0.1);
      expect(DEFAULT_CONFIG.sensitivity_margin_pass).toBe(1.5);
      expect(DEFAULT_CONFIG.sensitivity_margin_marginal).toBe(1.2);
      expect(DEFAULT_CONFIG.overload_margin_pass).toBe(1.2);
      expect(DEFAULT_CONFIG.overload_margin_marginal).toBe(1.1);
    });

    it('should have positive values', () => {
      expect(DEFAULT_CONFIG.breaker_time_s).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.relay_overtravel_s).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.safety_factor_s).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.sensitivity_margin_pass).toBeGreaterThan(1);
      expect(DEFAULT_CONFIG.overload_margin_pass).toBeGreaterThan(1);
    });
  });

  describe('DEFAULT_CURVE_SETTINGS', () => {
    it('should have IEC standard as default', () => {
      expect(DEFAULT_CURVE_SETTINGS.standard).toBe('IEC');
    });

    it('should have SI as default variant', () => {
      expect(DEFAULT_CURVE_SETTINGS.variant).toBe('SI');
    });

    it('should have valid TMS range', () => {
      expect(DEFAULT_CURVE_SETTINGS.time_multiplier).toBeGreaterThanOrEqual(0.05);
      expect(DEFAULT_CURVE_SETTINGS.time_multiplier).toBeLessThanOrEqual(10);
    });

    it('should have positive pickup current', () => {
      expect(DEFAULT_CURVE_SETTINGS.pickup_current_a).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_STAGE_51', () => {
    it('should be enabled by default', () => {
      expect(DEFAULT_STAGE_51.enabled).toBe(true);
    });

    it('should not be directional by default', () => {
      expect(DEFAULT_STAGE_51.directional).toBe(false);
    });

    it('should have curve settings', () => {
      expect(DEFAULT_STAGE_51.curve_settings).toBeDefined();
    });
  });

  describe('DEVICE_TEMPLATES', () => {
    it('should have at least one template', () => {
      expect(DEVICE_TEMPLATES.length).toBeGreaterThan(0);
    });

    it('should have unique IDs', () => {
      const ids = DEVICE_TEMPLATES.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have Polish descriptions', () => {
      for (const template of DEVICE_TEMPLATES) {
        expect(template.description_pl).toBeDefined();
        expect(template.description_pl.length).toBeGreaterThan(0);
      }
    });

    it('should have valid device types', () => {
      const validTypes = ['RELAY', 'FUSE', 'RECLOSER', 'CIRCUIT_BREAKER'];
      for (const template of DEVICE_TEMPLATES) {
        expect(validTypes).toContain(template.device_type);
      }
    });

    it('should have valid settings', () => {
      for (const template of DEVICE_TEMPLATES) {
        expect(template.settings).toBeDefined();
        expect(template.settings.stage_51).toBeDefined();
      }
    });

    it('should NOT contain project codenames', () => {
      const allTemplates = JSON.stringify(DEVICE_TEMPLATES);
      const forbiddenCodenames = ['P7', 'P11', 'P14', 'P15', 'P17', 'P20', 'FIX-']; // no-codenames-ignore

      for (const codename of forbiddenCodenames) {
        expect(allTemplates).not.toContain(codename);
      }
    });
  });
});
