import { describe, expect, it } from 'vitest';

import { AREA_DEFINITIONS, AREA_IDS, AREA_REGISTRY } from '../areaRegistry';
import { hasTechnicalIcon } from '../../icons/technicalIconRegistry';

describe('area-registry - kanon obszarów roboczych', () => {
  it('ma dziewięć obszarów w stałej kolejności', () => {
    expect(AREA_DEFINITIONS).toHaveLength(9);
    expect(AREA_IDS).toEqual([
      'MODEL_SIECI',
      'SCHEMAT_TOPOLOGIA',
      'STUDIA_OBLICZENIOWE',
      'WYNIKI_ANALIZY',
      'ZABEZPIECZENIA_AUTOMATYKA',
      'ZRODLA_PRZYLACZENIA',
      'KATALOGI_TECHNICZNE',
      'RAPORTY_UZASADNIENIA',
      'HISTORIA_AUDYT',
    ]);
  });

  it('każdy obszar ma pełną nazwę, krótką nazwę, ikonę, skrót, tooltip i test id', () => {
    for (const area of AREA_DEFINITIONS) {
      expect(area.labelFull).toBeTruthy();
      expect(area.labelShort).toBeTruthy();
      expect(area.description).toBeTruthy();
      expect(area.shortcut).toMatch(/^Ctrl\+[1-9]$/);
      expect(area.tooltip).toContain(area.labelFull);
      expect(area.testId).toBe(`nav-area-${area.id}`);
      expect(hasTechnicalIcon(area.icon)).toBe(true);
      expect(AREA_REGISTRY[area.id]).toBe(area);
    }
  });
});
