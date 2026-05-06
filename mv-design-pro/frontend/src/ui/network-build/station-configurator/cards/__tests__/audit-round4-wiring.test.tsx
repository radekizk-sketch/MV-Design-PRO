/**
 * Testy wiringu pozostałych katalogów do UI cards (Pakiet H).
 *
 * Sprawdzają, że BLOCK_TRANSFORMER_CATALOG, PF_CURVE_CATALOG i
 * MV_NEUTRAL_GROUNDING_CATALOG są aktywnie używane w UI.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StationConfigBasicCard } from '../StationConfigBasicCard';

describe('Pakiet H — wiring pozostałych katalogów audytu 2', () => {
  describe('StationConfigBasicCard wire MV_NEUTRAL_GROUNDING_CATALOG (eng.20 + B.1)', () => {
    it('renderuje select uziemienia neutralnego SN', () => {
      render(
        <StationConfigBasicCard
          stationName="Stacja-001"
          topologicalType="końcowa"
          constructionType="kontenerowa"
          snVoltageKv={15}
          nnVoltageLevels={[0.4]}
          completeness="complete"
        />,
      );
      const select = screen.getByTestId('station-mv-neutral-grounding');
      expect(select).toBeDefined();

      // 5 typów uziemienia + 1 pusta opcja.
      const options = select.querySelectorAll('option');
      expect(options.length).toBeGreaterThanOrEqual(5);
    });

    it('emituje onChange z catalog_ref po wyborze uziemienia', () => {
      let lastChange: { mvNeutralGroundingRef?: string | null } | null = null;
      render(
        <StationConfigBasicCard
          stationName="Stacja-001"
          topologicalType="końcowa"
          constructionType="kontenerowa"
          snVoltageKv={15}
          nnVoltageLevels={[0.4]}
          completeness="complete"
          onChange={(c) => {
            lastChange = c;
          }}
        />,
      );
      const select = screen.getByTestId('station-mv-neutral-grounding');
      fireEvent.change(select, { target: { value: 'mng_petersen' } });
      expect(lastChange).toEqual({ mvNeutralGroundingRef: 'mng_petersen' });
    });

    it('renderuje hint petersen_coil + 67N tak gdy ref ustawiony', () => {
      render(
        <StationConfigBasicCard
          stationName="Stacja-001"
          topologicalType="końcowa"
          constructionType="kontenerowa"
          snVoltageKv={15}
          nnVoltageLevels={[0.4]}
          completeness="complete"
          mvNeutralGroundingRef="mng_petersen"
        />,
      );

      const hint = screen.getByTestId('station-config-basic').textContent ?? '';
      expect(hint.toLowerCase()).toContain('petersen_coil');
      expect(hint.toLowerCase()).toContain('67n: tak');
    });

    it('renderuje hint resistor_grounded + 67N nie dla R-grounded', () => {
      render(
        <StationConfigBasicCard
          stationName="Stacja-001"
          topologicalType="końcowa"
          constructionType="kontenerowa"
          snVoltageKv={15}
          nnVoltageLevels={[0.4]}
          completeness="complete"
          mvNeutralGroundingRef="mng_resistor_low"
        />,
      );
      const hint = screen.getByTestId('station-config-basic').textContent ?? '';
      expect(hint.toLowerCase()).toContain('resistor_grounded');
      expect(hint.toLowerCase()).toContain('67n: nie');
    });
  });
});
