import { describe, expect, it } from 'vitest';

import {
  formatGeneratorTypeLabelPl,
  formatGeneratorTypeShortLabelPl,
} from '../generatorTypeLabels';

describe('generatorTypeLabels', () => {
  it('formats precise FW generator technologies without collapsing to legacy FW', () => {
    expect(formatGeneratorTypeLabelPl('fw_pmsg')).toBe('Farma wiatrowa PMSG');
    expect(formatGeneratorTypeLabelPl('fw_dfig')).toBe('Farma wiatrowa DFIG');
    expect(formatGeneratorTypeLabelPl('fw_scig')).toBe('Farma wiatrowa SCIG');

    expect(formatGeneratorTypeShortLabelPl('fw_pmsg')).toBe('PMSG');
    expect(formatGeneratorTypeShortLabelPl('fw_dfig')).toBe('DFIG');
    expect(formatGeneratorTypeShortLabelPl('fw_scig')).toBe('SCIG');
  });

  it('nazywa źródła przekształtnikowe po polsku z pełnymi znakami (etykieta pierwszego planu, m.in. ekran dynamiki)', () => {
    expect(formatGeneratorTypeLabelPl('pv_inverter')).toBe('Źródło przekształtnikowe PV');
    expect(formatGeneratorTypeLabelPl('bess')).toBe('Źródło przekształtnikowe BESS');
    expect(formatGeneratorTypeLabelPl('wind_inverter')).toBe('Źródło przekształtnikowe FW');
  });
});
