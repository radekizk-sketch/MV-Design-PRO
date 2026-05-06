/**
 * Testy wiringu katalogów drugiego audytu do UI cards (Pakiet G).
 *
 * Sprawdzają, że nowe katalogi (TAP_CHANGER / HV_FUSE / DEVICE_WITHSTAND /
 * BESS_OPERATION_MODE) są rzeczywiście używane w UI, a nie tylko zdefiniowane.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StationConfigTransformerCard } from '../StationConfigTransformerCard';
import { StationConfigBaysCard } from '../StationConfigBaysCard';
import { StationConfigProtectionCard } from '../StationConfigProtectionCard';

describe('Pakiet G — wiring katalogów do UI cards', () => {
  describe('TransformerCard wire eng.13 (TAP_CHANGER_CATALOG)', () => {
    it('renderuje select przełącznika zaczepów dla pól 110/SN', () => {
      render(
        <StationConfigTransformerCard
          transformers={[
            {
              transformerId: 'tr1',
              designation: 'TR1',
              snMva: 25,
              uhvKv: 110,
              ulvKv: 15,
              statusForSc: 'gotowe',
              statusForPf: 'gotowe',
              statusForAsymmetry: 'gotowe',
            },
          ]}
          availableLvVoltages={[15]}
        />,
      );

      // Select przełącznika zaczepów obecny.
      const select = screen.getByTestId('tr-tap-changer-tr1');
      expect(select).toBeDefined();

      // Lista opcji zawiera OLTC 110/SN z katalogu TAP_CHANGER.
      const options = select.querySelectorAll('option');
      expect(options.length).toBeGreaterThan(1); // pusta opcja + co najmniej 1 OLTC 110/SN
      const labels = Array.from(options).map((o) => o.textContent ?? '');
      expect(labels.some((l) => l.includes('OLTC 110/SN'))).toBe(true);
    });

    it('po wyborze tap-changer pokazuje szczegóły z katalogu', () => {
      let lastChange: { tapChangerCatalogRef: string | null } | null = null;
      render(
        <StationConfigTransformerCard
          transformers={[
            {
              transformerId: 'tr1',
              designation: 'TR1',
              snMva: 25,
              uhvKv: 110,
              ulvKv: 15,
              tapChangerCatalogRef: 'tc_oltc_110sn_19_125',
              statusForSc: 'gotowe',
              statusForPf: 'gotowe',
              statusForAsymmetry: 'gotowe',
            },
          ]}
          availableLvVoltages={[15]}
          onChange={(_id, changes) => {
            lastChange = changes as never;
          }}
        />,
      );

      // Szczegóły OLTC widoczne (19 zaczepów, AVR).
      expect(screen.getAllByText(/19 zaczepów/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/AVR/).length).toBeGreaterThan(0);
      // Przy dispatchu onChange zwraca tapChangerCatalogRef.
      const select = screen.getByTestId('tr-tap-changer-tr1');
      fireEvent.change(select, { target: { value: 'tc_oltc_110sn_17_125' } });
      expect(lastChange).toEqual({ tapChangerCatalogRef: 'tc_oltc_110sn_17_125' });
    });
  });

  describe('BaysCard wire eng.17 (HV_FUSE_CATALOG)', () => {
    it('renderuje kolumnę "HV fuse" w tabeli pól', () => {
      render(
        <StationConfigBaysCard
          bays={[
            {
              bayId: 'b1',
              designation: 'POLE-01',
              bayTypePl: 'transformatorowe',
              hasEquipment: true,
              hasProtection: true,
              hasMeasurements: true,
              statusPl: 'kompletne',
              hvFuseCatalogRef: 'fuse_15kv_50a_full',
            },
          ]}
        />,
      );

      // Kolumna fuse renderuje napięcie/prąd/klasę z katalogu.
      const fuseCell = screen.getByTestId('bay-fuse-b1');
      expect(fuseCell.textContent).toContain('15kV/50A');
      expect(fuseCell.textContent?.toLowerCase()).toContain('full-range');
    });

    it('pokazuje dash gdy brak fuse w polu', () => {
      render(
        <StationConfigBaysCard
          bays={[
            {
              bayId: 'b2',
              designation: 'POLE-02',
              bayTypePl: 'liniowe wejściowe',
              hasEquipment: true,
              hasProtection: true,
              hasMeasurements: true,
              statusPl: 'kompletne',
              hvFuseCatalogRef: null,
            },
          ]}
        />,
      );
      const fuseCell = screen.getByTestId('bay-fuse-b2');
      expect(fuseCell.textContent).toContain('—');
    });
  });

  describe('ProtectionCard wire eng.18 + eng.20', () => {
    it('renderuje walidację VT vs typ uziemienia (eng.20)', () => {
      render(
        <StationConfigProtectionCard
          relays={[
            {
              relayId: 'r1',
              bayDesignation: 'POLE-01',
              typePl: 'SIEMENS 7SJ85',
              functionsPl: ['50/51', '67N'],
              settingsCount: 4,
              selectivityStatus: 'kompletna',
              vtCatalogRef: 'vt_15kv_100v_05', // klasa pomiarowa, U_th=1.2
            },
          ]}
          automation={[]}
          interlocksConfigured={true}
          mvNeutralGroundingType="petersen_coil"
        />,
      );

      // Walidacja VT widoczna.
      const validationSection = screen.getByTestId('vt-grounding-validation');
      expect(validationSection).toBeDefined();
      // Powinno być NOK ponieważ VT 1.2 nie pasuje do petersen_coil (wymaga 1.9).
      const validation = screen.getByTestId('vt-validation-POLE-01');
      expect(validation.getAttribute('data-vt-ok')).toBe('false');
      expect(validation.textContent?.toLowerCase()).toContain('petersena');
    });

    it('renderuje walidację I_dyn / I_th aparatury (eng.18)', () => {
      render(
        <StationConfigProtectionCard
          relays={[]}
          automation={[]}
          interlocksConfigured={true}
          deviceWithstandRows={[
            {
              bayDesignation: 'POLE-01',
              deviceCatalogRef: 'wstd_breaker_vacuum_15_25',
              i_peak_calculated_ka: 70, // przekroczone (limit 63)
              i_thermal_calculated_ka: 20,
              t_clearing_s: 1.0,
            },
          ]}
        />,
      );

      const validation = screen.getByTestId('withstand-POLE-01');
      expect(validation.getAttribute('data-withstand-ok')).toBe('false');
      expect(validation.textContent).toContain('I_dyn');
    });

    it('walidacja VT OK gdy U_th=1.9 dla sieci skompensowanej', () => {
      render(
        <StationConfigProtectionCard
          relays={[
            {
              relayId: 'r1',
              bayDesignation: 'POLE-01',
              typePl: 'SIEMENS 7SJ85',
              functionsPl: ['67N'],
              settingsCount: 4,
              selectivityStatus: 'kompletna',
              vtCatalogRef: 'vt_15kv_100v_3p', // U_th=1.9
            },
          ]}
          automation={[]}
          interlocksConfigured={true}
          mvNeutralGroundingType="petersen_coil"
        />,
      );

      const validation = screen.getByTestId('vt-validation-POLE-01');
      expect(validation.getAttribute('data-vt-ok')).toBe('true');
    });
  });
});
