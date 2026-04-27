/**
 * Testy modułu poziomów szczegółowości SLD (LOD) — V12 § 5.7
 *
 * Weryfikuje:
 * - getLodBand(zoom) jest deterministyczna (ten sam input → ten sam wynik)
 * - Klasy widoczności elementów per pasmo są stałe
 * - shouldShowTechnicalLabels / shouldShowStateBadges działają prawidłowo
 * - Elementy SZKIELET są zawsze widoczne w każdym paśmie
 * - Żadna z funkcji nie modyfikuje modelu
 */

import { describe, it, expect } from 'vitest';
import {
  getLodBand,
  getElementImportance,
  isElementVisibleAtLod,
  shouldShowTechnicalLabels,
  shouldShowStateBadges,
  LOD_BANDS,
} from '../sldDetailLevel';

describe('getLodBand', () => {
  it('zwraca PRZEGLAD dla zoom < 0.5', () => {
    expect(getLodBand(0)).toBe('PRZEGLAD');
    expect(getLodBand(0.1)).toBe('PRZEGLAD');
    expect(getLodBand(0.499)).toBe('PRZEGLAD');
  });

  it('zwraca GLOWNE_POLA dla zoom 0.5–0.99', () => {
    expect(getLodBand(0.5)).toBe('GLOWNE_POLA');
    expect(getLodBand(0.75)).toBe('GLOWNE_POLA');
    expect(getLodBand(0.999)).toBe('GLOWNE_POLA');
  });

  it('zwraca SZCZEGOLY dla zoom 1.0–1.49', () => {
    expect(getLodBand(1.0)).toBe('SZCZEGOLY');
    expect(getLodBand(1.2)).toBe('SZCZEGOLY');
    expect(getLodBand(1.499)).toBe('SZCZEGOLY');
  });

  it('zwraca PELNY dla zoom >= 1.5', () => {
    expect(getLodBand(1.5)).toBe('PELNY');
    expect(getLodBand(2.0)).toBe('PELNY');
    expect(getLodBand(3.0)).toBe('PELNY');
  });

  it('jest deterministyczna — ten sam zoom → ten sam wynik', () => {
    const zoom = 0.85;
    expect(getLodBand(zoom)).toBe(getLodBand(zoom));
    expect(getLodBand(zoom)).toBe(getLodBand(zoom));
  });

  it('obsługuje wartości brzegowe (NaN, Infinity, ujemne) bez wyjątku', () => {
    expect(() => getLodBand(NaN)).not.toThrow();
    expect(() => getLodBand(-1)).not.toThrow();
    expect(getLodBand(Infinity)).toBe('PELNY');
  });

  it('tabela LOD_BANDS jest posortowana rosnąco i nie ma luk', () => {
    let lastMax = 0;
    for (const range of LOD_BANDS) {
      expect(range.zoomMin).toBeCloseTo(lastMax);
      lastMax = range.zoomMaxExclusive === Infinity ? Infinity : range.zoomMaxExclusive;
    }
    expect(lastMax).toBe(Infinity);
  });
});

describe('getElementImportance', () => {
  it('Bus ma klasę SZKIELET', () => {
    expect(getElementImportance('Bus')).toBe('SZKIELET');
  });

  it('Station ma klasę SZKIELET', () => {
    expect(getElementImportance('Station')).toBe('SZKIELET');
  });

  it('Source ma klasę SZKIELET', () => {
    expect(getElementImportance('Source')).toBe('SZKIELET');
  });

  it('ZKSN ma klasę SZKIELET', () => {
    expect(getElementImportance('ZKSN')).toBe('SZKIELET');
  });

  it('BranchPole ma klasę SZKIELET', () => {
    expect(getElementImportance('BranchPole')).toBe('SZKIELET');
  });

  it('TransformerBranch ma klasę GLOWNY', () => {
    expect(getElementImportance('TransformerBranch')).toBe('GLOWNY');
  });

  it('Load ma klasę GLOWNY', () => {
    expect(getElementImportance('Load')).toBe('GLOWNY');
  });

  it('Switch ma klasę SZCZEGOL', () => {
    expect(getElementImportance('Switch')).toBe('SZCZEGOL');
  });

  it('Earthing ma klasę OPIS', () => {
    expect(getElementImportance('Earthing')).toBe('OPIS');
  });
});

describe('isElementVisibleAtLod', () => {
  it('SZKIELET jest widoczny we wszystkich pasmach', () => {
    const szkieletTypes = ['Bus', 'Station', 'ZKSN', 'BranchPole', 'Source'] as const;
    for (const band of ['PRZEGLAD', 'GLOWNE_POLA', 'SZCZEGOLY', 'PELNY'] as const) {
      for (const t of szkieletTypes) {
        expect(isElementVisibleAtLod(t, band)).toBe(true);
      }
    }
  });

  it('GLOWNY jest niewidoczny w PRZEGLAD, widoczny w pozostałych', () => {
    expect(isElementVisibleAtLod('TransformerBranch', 'PRZEGLAD')).toBe(false);
    expect(isElementVisibleAtLod('TransformerBranch', 'GLOWNE_POLA')).toBe(true);
    expect(isElementVisibleAtLod('TransformerBranch', 'SZCZEGOLY')).toBe(true);
    expect(isElementVisibleAtLod('TransformerBranch', 'PELNY')).toBe(true);
  });

  it('SZCZEGOL widoczny tylko w SZCZEGOLY i PELNY', () => {
    expect(isElementVisibleAtLod('Switch', 'PRZEGLAD')).toBe(false);
    expect(isElementVisibleAtLod('Switch', 'GLOWNE_POLA')).toBe(false);
    expect(isElementVisibleAtLod('Switch', 'SZCZEGOLY')).toBe(true);
    expect(isElementVisibleAtLod('Switch', 'PELNY')).toBe(true);
  });

  it('OPIS widoczny tylko w PELNY', () => {
    expect(isElementVisibleAtLod('Earthing', 'PRZEGLAD')).toBe(false);
    expect(isElementVisibleAtLod('Earthing', 'GLOWNE_POLA')).toBe(false);
    expect(isElementVisibleAtLod('Earthing', 'SZCZEGOLY')).toBe(false);
    expect(isElementVisibleAtLod('Earthing', 'PELNY')).toBe(true);
  });
});

describe('shouldShowTechnicalLabels', () => {
  it('true tylko dla PELNY', () => {
    expect(shouldShowTechnicalLabels('PRZEGLAD')).toBe(false);
    expect(shouldShowTechnicalLabels('GLOWNE_POLA')).toBe(false);
    expect(shouldShowTechnicalLabels('SZCZEGOLY')).toBe(false);
    expect(shouldShowTechnicalLabels('PELNY')).toBe(true);
  });
});

describe('shouldShowStateBadges', () => {
  it('true dla SZCZEGOLY i PELNY', () => {
    expect(shouldShowStateBadges('PRZEGLAD')).toBe(false);
    expect(shouldShowStateBadges('GLOWNE_POLA')).toBe(false);
    expect(shouldShowStateBadges('SZCZEGOLY')).toBe(true);
    expect(shouldShowStateBadges('PELNY')).toBe(true);
  });
});

describe('Geometria niezmieniona przez LOD', () => {
  it('getLodBand nie przyjmuje symboli — nie może modyfikować ich pozycji', () => {
    // LOD jest czystą funkcją zoom→band, nie ma dostępu do symboli
    const result = getLodBand(0.8);
    expect(typeof result).toBe('string');
    // Potwierdzamy, że rezultat to nazwa pasma, nie obiekt z pozycjami
    expect(['PRZEGLAD', 'GLOWNE_POLA', 'SZCZEGOLY', 'PELNY']).toContain(result);
  });
});
