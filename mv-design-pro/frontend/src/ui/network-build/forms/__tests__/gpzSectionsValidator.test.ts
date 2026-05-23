import { describe, expect, it } from 'vitest';
import {
  validateGpzSections,
  summarizeGpzSections,
  type GpzSectionsConfig,
  type GpzSection,
} from '../gpzSectionsValidator';

function makeSection(ref: string, label: string, bayRoles: GpzSection['bays'][0]['role'][]): GpzSection {
  return {
    ref,
    label,
    ratedVoltageKv: 15,
    ratedCurrentA: 1250,
    bays: bayRoles.map((role, i) => ({
      ref: `${ref}-bay-${i}`,
      role,
      isInUse: true,
    })),
  };
}

const validConfig: GpzSectionsConfig = {
  sections: [
    makeSection('s1', 'Sekcja A', ['IN', 'OUT', 'OUT', 'TR']),
    makeSection('s2', 'Sekcja B', ['IN', 'OUT', 'OUT', 'TR']),
  ],
  voltageKv: 15,
  couplerBays: 1,
};

describe('validateGpzSections — count', () => {
  it('valid config → isValid=true', () => {
    const r = validateGpzSections(validConfig);
    expect(r.isValid).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it('0 sekcji → invalid', () => {
    const r = validateGpzSections({ ...validConfig, sections: [] });
    expect(r.isValid).toBe(false);
    expect(r.issues[0]).toContain('min 1');
  });

  it('5 sekcji → invalid', () => {
    const sections = Array.from({ length: 5 }, (_, i) =>
      makeSection(`s${i}`, `S${i}`, ['IN', 'OUT']),
    );
    const r = validateGpzSections({ ...validConfig, sections });
    expect(r.isValid).toBe(false);
    expect(r.issues[0]).toContain('max 4');
  });
});

describe('validateGpzSections — sekcja', () => {
  it('1 pole w sekcji → issue', () => {
    const r = validateGpzSections({
      ...validConfig,
      sections: [makeSection('s1', 'A', ['IN'])],
    });
    expect(r.perSectionIssues.s1?.some((i) => i.includes('min 2'))).toBe(true);
  });

  it('>16 pól w sekcji → issue', () => {
    const r = validateGpzSections({
      ...validConfig,
      sections: [
        makeSection(
          's1',
          'A',
          Array(20).fill('OUT' as const),
        ),
      ],
    });
    expect(r.perSectionIssues.s1?.some((i) => i.includes('max 16'))).toBe(true);
  });

  it('brak dopływu (IN/TR) → issue', () => {
    const r = validateGpzSections({
      ...validConfig,
      sections: [makeSection('s1', 'A', ['OUT', 'OUT', 'OUT'])],
    });
    expect(r.perSectionIssues.s1?.some((i) => i.includes('dopływowego'))).toBe(true);
  });

  it('napięcie sekcji != napięcie GPZ → issue', () => {
    const section = makeSection('s1', 'A', ['IN', 'OUT']);
    section.ratedVoltageKv = 20;
    const r = validateGpzSections({
      ...validConfig,
      sections: [section],
    });
    expect(r.perSectionIssues.s1?.some((i) => i.includes('napięcie'))).toBe(true);
  });
});

describe('validateGpzSections — sprzęgła', () => {
  it('2 sekcje wymagają 1 sprzęgła', () => {
    const r = validateGpzSections({ ...validConfig, couplerBays: 0 });
    expect(r.warnings.some((w) => w.includes('sprzęgieł'))).toBe(true);
  });

  it('4 sekcje wymagają 3 sprzęgieł', () => {
    const sections = Array.from({ length: 4 }, (_, i) =>
      makeSection(`s${i}`, `S${i}`, ['IN', 'OUT', 'TR']),
    );
    const r = validateGpzSections({ ...validConfig, sections, couplerBays: 3 });
    expect(r.warnings.filter((w) => w.includes('sprzęgieł'))).toHaveLength(0);
  });
});

describe('validateGpzSections — current consistency', () => {
  it('duża różnica prądów sekcji → warning', () => {
    const sections = [
      { ...makeSection('s1', 'A', ['IN', 'OUT']), ratedCurrentA: 100 },
      { ...makeSection('s2', 'B', ['IN', 'OUT']), ratedCurrentA: 1000 },
    ];
    const r = validateGpzSections({ ...validConfig, sections });
    expect(r.warnings.some((w) => w.includes('różnica prądów'))).toBe(true);
  });
});

describe('summarizeGpzSections', () => {
  it('zlicza total bays + breakdown per rola', () => {
    const summary = summarizeGpzSections(validConfig);
    expect(summary.totalSections).toBe(2);
    expect(summary.totalBays).toBe(8);
    expect(summary.bayBreakdown.IN).toBe(2);
    expect(summary.bayBreakdown.OUT).toBe(4);
    expect(summary.bayBreakdown.TR).toBe(2);
  });
});
