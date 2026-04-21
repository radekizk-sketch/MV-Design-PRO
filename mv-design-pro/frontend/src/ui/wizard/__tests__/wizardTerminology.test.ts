import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('WizardPage terminology', () => {
  const wizardPagePath = join(__dirname, '..', 'WizardPage.tsx');
  const source = readFileSync(wizardPagePath, 'utf-8');

  it('uses canonical labels for converter and synchronous sources', () => {
    expect(source).not.toContain('Generators (OZE)');
    expect(source).not.toContain("wind_inverter: 'Wiatr'");
    expect(source).not.toContain("synchronous: 'Gen. synchr.'");
    expect(source).toContain("wind_inverter: 'FW'");
    expect(source).toContain("synchronous: 'Generator synchroniczny'");
  });
});
