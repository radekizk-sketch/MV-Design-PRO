import { describe, expect, it } from 'vitest';

import {
  PROJECT_CALCULATION_TEMPLATE_BLOCKS,
  PROJECT_CALCULATION_TEMPLATE_SOURCE,
  getCalculationTemplateBlocksForStep,
  getCalculationTemplateCoverageReport,
  summarizeCalculationTemplateBlocks,
} from '../calculationTemplateContract';
import { STATION_WIZARD_STEPS, type StationWizardStepId } from '../stationWizardContract';

describe('project calculation template contract', () => {
  it('opisuje źródłowy skoroszyt jako inspirację workflow, a nie silnik obliczeń UI', () => {
    expect(PROJECT_CALCULATION_TEMPLATE_SOURCE.workbook).toBe(
      'obliczenia do projektów v3 MT880.xlsx',
    );
    expect(PROJECT_CALCULATION_TEMPLATE_SOURCE.role).toMatch(/MT880 jest modelem licznika/);
  });

  it('mapuje kluczowe bloki skoroszytu na kroki kreatora stacji', () => {
    expect(PROJECT_CALCULATION_TEMPLATE_BLOCKS.map((block) => block.id)).toEqual(expect.arrayContaining([
      'mv_cable_selection',
      'short_circuit_and_apparatus',
      'ct_vt_metering',
      'power_quality_analyzer_circuit',
      'transformer_lv_losses',
      'station_earthing',
      'der_inverter_balance',
      'engineering_report',
    ]));
  });

  it('każdy blok ma dane wejściowe, powiązania katalogowe i dowody backendowe', () => {
    for (const block of PROJECT_CALCULATION_TEMPLATE_BLOCKS) {
      expect(block.requiredInputs.length, block.id).toBeGreaterThanOrEqual(4);
      expect(block.catalogBindings.length, block.id).toBeGreaterThanOrEqual(3);
      expect(block.backendProofs.length, block.id).toBeGreaterThanOrEqual(3);
      expect(block.backendComputationOnly, block.id).toBe(true);
    }
  });

  it('nie odwołuje się do nieistniejących kroków kreatora', () => {
    const validSteps = new Set<StationWizardStepId>(STATION_WIZARD_STEPS.map((step) => step.id));
    for (const block of PROJECT_CALCULATION_TEMPLATE_BLOCKS) {
      for (const stepId of block.stepIds) {
        expect(validSteps.has(stepId), `${block.id} -> ${stepId}`).toBe(true);
      }
    }
  });

  it('pokrywa każdy krok kreatora bez tworzenia pustego panelu projektowego', () => {
    const coverage = getCalculationTemplateCoverageReport();
    for (const step of STATION_WIZARD_STEPS) {
      expect(coverage[step.id] ?? 0, step.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('zwraca właściwy pakiet dla kabla, przekładników, analizatora, uziemienia i DER', () => {
    expect(getCalculationTemplateBlocksForStep('cable').map((block) => block.id)).toContain(
      'mv_cable_selection',
    );
    expect(getCalculationTemplateBlocksForStep('ct').map((block) => block.id)).toContain(
      'ct_vt_metering',
    );
    expect(getCalculationTemplateBlocksForStep('pq').map((block) => block.id)).toContain(
      'power_quality_analyzer_circuit',
    );
    expect(getCalculationTemplateBlocksForStep('earthing').map((block) => block.id)).toContain(
      'station_earthing',
    );
    expect(getCalculationTemplateBlocksForStep('sources').map((block) => block.id)).toContain(
      'der_inverter_balance',
    );
  });

  it('oddziela obwody licznika od obwodów analizatora jakości energii', () => {
    const metering = PROJECT_CALCULATION_TEMPLATE_BLOCKS.find(
      (block) => block.id === 'ct_vt_metering',
    );
    const analyzer = PROJECT_CALCULATION_TEMPLATE_BLOCKS.find(
      (block) => block.id === 'power_quality_analyzer_circuit',
    );
    expect(metering?.requiredInputs.join(' ')).not.toMatch(/analizator/i);
    expect(analyzer?.requiredInputs.join(' ')).toMatch(/analizator jakości energii klasy A/i);
    expect(analyzer?.backendProofs.join(' ')).toMatch(/rdzenia CT analizatora/i);
  });

  it('buduje zbiorczą metrykę pakietu danych, katalogów i dowodów', () => {
    const summary = summarizeCalculationTemplateBlocks();
    expect(summary.blockCount).toBe(PROJECT_CALCULATION_TEMPLATE_BLOCKS.length);
    expect(summary.inputCount).toBeGreaterThan(20);
    expect(summary.catalogBindingCount).toBeGreaterThan(15);
    expect(summary.backendProofCount).toBeGreaterThan(20);
    expect(summary.sourceSheetCount).toBeGreaterThan(8);
  });
});
