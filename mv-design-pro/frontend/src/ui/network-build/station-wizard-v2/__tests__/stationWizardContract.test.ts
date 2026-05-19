/**
 * Kontrakt Kreatora Stacji KOMPLETNY — executable specification.
 *
 * Testy zapewniają że 17-krokowy workflow z bundle KWranPTV pozostaje
 * stabilny i kompletny. Każda zmiana `STATION_WIZARD_STEPS` wymaga
 * świadomej aktualizacji testu (regression boundary).
 */
import { describe, expect, it } from 'vitest';

import {
  STATION_WIZARD_STEPS,
  STATION_WIZARD_GROUPS,
  EXPERT_AUDIT_COVERAGE,
  getStationWizardStep,
  getStepsInGroup,
  getNextStep,
  getPrevStep,
  type StationWizardStepId,
  type StationWizardGroup,
} from '../stationWizardContract';

describe('STATION_WIZARD_STEPS — kontrakt 17 kroków', () => {
  it('zawiera dokładnie 17 kroków (per Kreator KOMPLETNY z bundle)', () => {
    expect(STATION_WIZARD_STEPS).toHaveLength(17);
  });

  it('kanoniczna kolejność: SN → Pomiary → Stacja → OZE → Ochrona → Infrastr. → Gotowość', () => {
    const expectedIds: StationWizardStepId[] = [
      'cable', 'switchgear', 'bays', 'apparatus',
      'ct', 'vt', 'meters',
      'trafo', 'earthing', 'nn',
      'sources', 'pq',
      'protection', 'ncrfg',
      'infra', 'network',
      'readiness',
    ];
    expect(STATION_WIZARD_STEPS.map((s) => s.id)).toEqual(expectedIds);
  });

  it('numeracja `n` jest 1-indeksowana i sekwencyjna', () => {
    STATION_WIZARD_STEPS.forEach((step, idx) => {
      expect(step.n).toBe(idx + 1);
    });
  });

  it('każdy krok ma polską etykietę (label)', () => {
    for (const step of STATION_WIZARD_STEPS) {
      expect(step.label, `Krok ${step.id} musi mieć polską etykietę`).toBeTruthy();
      // Etykieta nie może być pusta lub czysto angielska.
      expect(step.label.length).toBeGreaterThan(2);
    }
  });

  it('każdy krok ma polski podpis (sub)', () => {
    for (const step of STATION_WIZARD_STEPS) {
      expect(step.sub, `Krok ${step.id} musi mieć polski podpis`).toBeTruthy();
    }
  });

  it('każdy krok ma przypisaną grupę', () => {
    for (const step of STATION_WIZARD_STEPS) {
      expect(STATION_WIZARD_GROUPS).toContain(step.group);
    }
  });

  it('identyfikatory id są unikalne', () => {
    const ids = STATION_WIZARD_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('grupa SN ma 4 kroki (cable + switchgear + bays + apparatus)', () => {
    const sn = getStepsInGroup('SN');
    expect(sn.map((s) => s.id)).toEqual(['cable', 'switchgear', 'bays', 'apparatus']);
  });

  it('grupa Pomiary ma 3 kroki (ct + vt + meters)', () => {
    const pomiary = getStepsInGroup('Pomiary');
    expect(pomiary.map((s) => s.id)).toEqual(['ct', 'vt', 'meters']);
  });

  it('grupa Stacja ma 3 kroki (trafo + earthing + nn)', () => {
    const stacja = getStepsInGroup('Stacja');
    expect(stacja.map((s) => s.id)).toEqual(['trafo', 'earthing', 'nn']);
  });

  it('grupa OZE ma 2 kroki (sources + pq)', () => {
    const oze = getStepsInGroup('OZE');
    expect(oze.map((s) => s.id)).toEqual(['sources', 'pq']);
  });

  it('grupa Ochrona ma 2 kroki (protection + ncrfg)', () => {
    const ochrona = getStepsInGroup('Ochrona');
    expect(ochrona.map((s) => s.id)).toEqual(['protection', 'ncrfg']);
  });

  it('grupa Infrastr. ma 2 kroki (infra + network)', () => {
    const infra = getStepsInGroup('Infrastr.');
    expect(infra.map((s) => s.id)).toEqual(['infra', 'network']);
  });

  it('grupa Gotowość ma 1 krok finalny (readiness)', () => {
    const gotowosc = getStepsInGroup('Gotowość');
    expect(gotowosc.map((s) => s.id)).toEqual(['readiness']);
  });

  it('7 grup × kroków = 17 (suma per grupa)', () => {
    const total = STATION_WIZARD_GROUPS.reduce(
      (sum, g) => sum + getStepsInGroup(g).length,
      0,
    );
    expect(total).toBe(17);
  });

  it('STATION_WIZARD_GROUPS ma 7 grup w kanonicznej kolejności', () => {
    expect(STATION_WIZARD_GROUPS).toEqual([
      'SN', 'Pomiary', 'Stacja', 'OZE', 'Ochrona', 'Infrastr.', 'Gotowość',
    ]);
  });
});

describe('Step navigation helpers', () => {
  it('getStationWizardStep zwraca poprawną definicję per id', () => {
    expect(getStationWizardStep('cable').n).toBe(1);
    expect(getStationWizardStep('readiness').n).toBe(17);
    expect(getStationWizardStep('protection').group).toBe('Ochrona');
  });

  it('getStationWizardStep rzuca błąd dla nieznanego id', () => {
    expect(() => getStationWizardStep('unknown' as StationWizardStepId)).toThrow(
      /Unknown station wizard step id/,
    );
  });

  it('getNextStep zwraca kolejny krok lub null dla ostatniego', () => {
    expect(getNextStep('cable')).toBe('switchgear');
    expect(getNextStep('apparatus')).toBe('ct');
    expect(getNextStep('readiness')).toBeNull();
  });

  it('getPrevStep zwraca poprzedni krok lub null dla pierwszego', () => {
    expect(getPrevStep('switchgear')).toBe('cable');
    expect(getPrevStep('readiness')).toBe('network');
    expect(getPrevStep('cable')).toBeNull();
  });

  it('navigacja next→prev jest symetryczna dla każdego kroku', () => {
    for (const step of STATION_WIZARD_STEPS) {
      const next = getNextStep(step.id);
      if (next !== null) {
        expect(getPrevStep(next)).toBe(step.id);
      }
    }
  });
});

describe('Expert audit coverage — 69 uwag z 6 ekspertów', () => {
  it('6 ekspertów objętych mapowaniem', () => {
    const experts = Object.keys(EXPERT_AUDIT_COVERAGE);
    expect(experts).toHaveLength(6);
  });

  it('każdy ekspert ma przypisany ≥ 1 krok', () => {
    for (const [expert, steps] of Object.entries(EXPERT_AUDIT_COVERAGE)) {
      expect(steps.length, `Ekspert ${expert} musi mieć ≥ 1 krok`).toBeGreaterThan(0);
    }
  });

  it('mapowanie referencuje tylko istniejące step IDs', () => {
    const validIds = new Set(STATION_WIZARD_STEPS.map((s) => s.id));
    for (const [expert, steps] of Object.entries(EXPERT_AUDIT_COVERAGE)) {
      for (const stepId of steps) {
        expect(
          validIds.has(stepId),
          `Ekspert ${expert} referencuje nieznany step "${stepId}"`,
        ).toBe(true);
      }
    }
  });

  it('SN steps (cable/switchgear/bays/apparatus) są pokryte przez ≥ 1 eksperta', () => {
    const snIds: StationWizardStepId[] = ['cable', 'switchgear', 'bays', 'apparatus'];
    const allCoveredSteps = new Set(
      Object.values(EXPERT_AUDIT_COVERAGE).flat(),
    );
    for (const id of snIds) {
      expect(
        allCoveredSteps.has(id),
        `Krok SN "${id}" musi być pokryty przez przynajmniej jednego eksperta`,
      ).toBe(true);
    }
  });

  it('Pomiary steps (ct/vt) są pokryte przez Projektanta zabezpieczeń', () => {
    expect(EXPERT_AUDIT_COVERAGE.PROJEKTANT_ZABEZPIECZEN).toContain('ct');
    expect(EXPERT_AUDIT_COVERAGE.PROJEKTANT_ZABEZPIECZEN).toContain('vt');
  });

  it('Stacja steps (trafo/earthing) są pokryte przez Projektanta stacji', () => {
    expect(EXPERT_AUDIT_COVERAGE.PROJEKTANT_STACJI).toContain('trafo');
    expect(EXPERT_AUDIT_COVERAGE.PROJEKTANT_STACJI).toContain('earthing');
  });

  it('OZE/NC RfG są pokryte przez Projektanta OZE + Profesora energetyki', () => {
    expect(EXPERT_AUDIT_COVERAGE.PROJEKTANT_OZE).toContain('sources');
    expect(EXPERT_AUDIT_COVERAGE.PROJEKTANT_OZE).toContain('ncrfg');
    expect(EXPERT_AUDIT_COVERAGE.PROFESOR_ENERGETYKI).toContain('ncrfg');
  });
});

describe('Step icons — symbol per krok (mapping dla TechnicalIcon)', () => {
  it('każdy krok ma symbol/emoji', () => {
    for (const step of STATION_WIZARD_STEPS) {
      expect(step.icon, `Krok ${step.id} musi mieć icon`).toBeTruthy();
    }
  });

  it('icon ‘✓’ przypisany tylko do finalnego kroku readiness', () => {
    const checkIcon = STATION_WIZARD_STEPS.filter((s) => s.icon === '✓');
    expect(checkIcon).toHaveLength(1);
    expect(checkIcon[0].id).toBe('readiness');
  });
});

describe('Backward compatibility — vs istniejące komponenty', () => {
  it('TypeScript typeguard StationWizardStepId obejmuje wszystkie ids', () => {
    // Compile-time check via type narrowing.
    const ids: StationWizardStepId[] = STATION_WIZARD_STEPS.map((s) => s.id);
    expect(ids).toHaveLength(17);
  });

  it('StationWizardGroup typeguard obejmuje wszystkie 7 grup', () => {
    const groups: StationWizardGroup[] = [...STATION_WIZARD_GROUPS];
    expect(groups).toHaveLength(7);
  });
});
