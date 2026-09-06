/**
 * Testy wiringu pozostałych katalogów do UI cards (Pakiet H).
 *
 * Sprawdzają, że katalog uziemienia neutralnego SN jest aktywnie używany w UI.
 * Karta FAB-L: `MV_NEUTRAL_GROUNDING_CATALOG` przestał być blokiem statycznym
 * w `catalogs.ts` — karta czyta go dziś ze snapshotu audytu 2
 * (`useAudit2CatalogSnapshot`), więc fikstura poniżej podaje go jako PARAMETR,
 * kształtem 1:1 z backendowym `to_dict()`.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StationConfigBasicCard } from '../StationConfigBasicCard';
import type { MvNeutralGroundingItem } from '../../../station-der/audit2-api';

// Karta FAB-L: katalog WYŁĄCZNIE ze snapshotu audytu 2 — kształt 1:1 z backendu
// (`audit2_catalogs.py::MV_NEUTRAL_GROUNDING_CATALOG`, 5 wariantów), nie statyk
// modułowy. Identyfikatory REALNE (`mng_petersen`, `mng_resistor_low`, …).
const MV_NEUTRAL_GROUNDING_FIXTURES: readonly MvNeutralGroundingItem[] = [
  {
    id: 'mng_isolated', catalog_namespace: 'mv_neutral_grounding', catalog_version: '2026-08-14',
    grounding_type: 'isolated', label_pl: 'Sieć izolowana (bez uziemienia neutralnego)',
    description_pl: 'Punkt neutralny transformatora 110/SN nie jest uziemiony.',
    r_ohm: null, x_ohm: null,
  },
  {
    id: 'mng_petersen', catalog_namespace: 'mv_neutral_grounding', catalog_version: '2026-08-14',
    grounding_type: 'petersen_coil', label_pl: 'Sieć skompensowana (cewka Petersena PCK)',
    description_pl: 'Punkt neutralny uziemiony przez dławik kompensacyjny.',
    r_ohm: null, x_ohm: null,
  },
  {
    id: 'mng_resistor_low', catalog_namespace: 'mv_neutral_grounding', catalog_version: '2026-08-14',
    grounding_type: 'resistor_grounded', label_pl: 'Sieć uziemiona przez rezystor — niski (R≈7 Ω)',
    description_pl: 'Punkt neutralny uziemiony przez rezystor 7 Ω.',
    r_ohm: 7, x_ohm: null,
  },
  {
    id: 'mng_resistor_medium', catalog_namespace: 'mv_neutral_grounding', catalog_version: '2026-08-14',
    grounding_type: 'resistor_grounded', label_pl: 'Sieć uziemiona przez rezystor — średni (R≈40 Ω)',
    description_pl: 'Punkt neutralny uziemiony przez rezystor 40 Ω.',
    r_ohm: 40, x_ohm: null,
  },
  {
    id: 'mng_directly', catalog_namespace: 'mv_neutral_grounding', catalog_version: '2026-08-14',
    grounding_type: 'directly_grounded', label_pl: 'Sieć uziemiona bezpośrednio (Z=0)',
    description_pl: 'Punkt neutralny uziemiony bezpośrednio.',
    r_ohm: null, x_ohm: null,
  },
];

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
          mvNeutralGroundings={MV_NEUTRAL_GROUNDING_FIXTURES}
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
          mvNeutralGroundings={MV_NEUTRAL_GROUNDING_FIXTURES}
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
          mvNeutralGroundings={MV_NEUTRAL_GROUNDING_FIXTURES}
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
          mvNeutralGroundings={MV_NEUTRAL_GROUNDING_FIXTURES}
        />,
      );
      const hint = screen.getByTestId('station-config-basic').textContent ?? '';
      expect(hint.toLowerCase()).toContain('resistor_grounded');
      expect(hint.toLowerCase()).toContain('67n: nie');
    });
  });
});
