/**
 * Testy wiringu katalogów drugiego audytu do UI cards (Pakiet G).
 *
 * Sprawdzają, że nowe katalogi (TAP_CHANGER / HV_FUSE / DEVICE_WITHSTAND /
 * BESS_OPERATION_MODE) są rzeczywiście używane w UI, a nie tylko zdefiniowane.
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { StationConfigTransformerCard } from '../StationConfigTransformerCard';
import { StationConfigBaysCard } from '../StationConfigBaysCard';
import { StationConfigProtectionCard } from '../StationConfigProtectionCard';
import type { TapChangerItem } from '../../../station-der/audit2-api';

// Karta FAB-L: katalog WYŁĄCZNIE ze snapshotu audytu 2 — kształt 1:1 z backendu
// (`audit2_catalogs.py::TapChangerItem.to_dict`), nie statyk modułowy.
const TAP_CHANGER_FIXTURES: readonly TapChangerItem[] = [
  {
    id: 'tc_oltc_110sn_19_125', catalog_namespace: 'tap_changer', catalog_version: '2026-08-14',
    label_pl: 'OLTC 110/SN 19 zaczepów', type: 'oltc', neutral_position: 0, tap_count: 19,
    step_percent: 1.25, range_percent: 11.25, regulated_side: 'hv', supports_avr: true,
    applicable_to: ['transformer_110_15', 'transformer_110_20'],
  },
  {
    id: 'tc_oltc_110sn_17_125', catalog_namespace: 'tap_changer', catalog_version: '2026-08-14',
    label_pl: 'OLTC 110/SN 17 zaczepów', type: 'oltc', neutral_position: 0, tap_count: 17,
    step_percent: 1.25, range_percent: 10.0, regulated_side: 'hv', supports_avr: true,
    applicable_to: ['transformer_110_15', 'transformer_110_20'],
  },
];

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
          tapChangers={TAP_CHANGER_FIXTURES}
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
          tapChangers={TAP_CHANGER_FIXTURES}
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

    // Karta K-O: pozycja bez pasma topikowego pokazuje UCZCIWY STAN, a nie pustkę
    // ani liczby wzięte z głowy. Wzorzec backendowy `BRAK_PASMA_BEZPIECZNIKA`.
    it('pokazuje jawny stan "pasmo wymaga karty producenta" dla wybranej wkładki', () => {
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

      const stan = screen.getByTestId('bay-fuse-brak-pasma-b1');
      expect(stan.textContent).toBe('pasmo wymaga karty producenta');
      // Powód po polsku jest dostępny bez zgadywania (tooltip), z odesłaniem do normy.
      expect(stan.getAttribute('title')).toContain('IEC 60282-1');
    });

    it('nie pokazuje stanu braku pasma, gdy pole nie ma wkładki', () => {
      render(
        <StationConfigBaysCard
          bays={[
            {
              bayId: 'b9',
              designation: 'POLE-09',
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
      expect(screen.queryByTestId('bay-fuse-brak-pasma-b9')).toBeNull();
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
    // Od V12K-257 karta NIE MA wlasnego katalogu VT ani wlasnej reguly: typy pobiera
    // z `/api/catalog/vt-types`, werdykt z `/validate-vt-grounding`. Test podstawia
    // obie odpowiedzi, zeby sprawdzic, co karta z nimi robi.
    const TYPY_VT = [
      { id: 'vt_20kv_100v_05_arteche', name: 'VT 20 kV / 100 V kl. 0.5', rated_voltage_factor: 1.2 },
      {
        id: 'vt_20kv_fz_100_3_05_3p_siemens',
        name: 'VT 20 kV/√3 kl. 0,5/3P',
        rated_voltage_factor: 1.9,
      },
    ];
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/api/catalog/vt-types')) {
          return { ok: true, status: 200, json: async () => TYPY_VT } as Response;
        }
        if (url.includes('/validate-vt-grounding')) {
          // Atrapa REGULY backendu: prog 1,9 dla sieci kompensowanej (V12K-256).
          const body = JSON.parse(String(init?.body ?? '{}')) as { voltage_factor?: number };
          const ok = Number(body.voltage_factor) >= 1.9;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok,
              message_pl: ok
                ? ''
                : 'Siec skompensowana (Petersena) wymaga VT (faza-ziemia) z U_th >= 1.9.',
            }),
          } as Response;
        }
        if (url.endsWith('/device-withstand')) {
          // KATALOG APARATURY Z BACKENDU (K7-B) — front nie ma juz wlasnej kopii.
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                id: 'wstd_breaker_vacuum_15_25',
                label_pl: 'Wyłącznik próżniowy 15 kV',
                device_type: 'breaker_vacuum_15',
                nominal_voltage_kv: 15,
                nominal_current_a: 1250,
                i_dyn_ka: 63,
                i_th_1s_ka: 25,
                i_th_duration_s: 1,
              },
            ],
          } as Response;
        }
        if (url.includes('/validate-device-withstand')) {
          // Atrapa RACHUNKU backendu (K7-B): od tej karty kryterium IEC 60909
          // nie zyje juz we froncie — ekran pyta o werdykt.
          const body = JSON.parse(String(init?.body ?? '{}')) as {
            i_peak_calculated_ka?: number;
          };
          const iDynOk = Number(body.i_peak_calculated_ka) <= 63;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: iDynOk,
              i_dyn_ok: iDynOk,
              i_th_ok: true,
              message_pl: iDynOk
                ? 'OK: aparatura wytrzymała.'
                : 'BLOKER: I_dyn 70,0 kA > 63,0 kA (limit) — przekroczenie '
                  + 'wytrzymałości dynamicznej.',
              utilization_dyn_percent: 0,
              utilization_th_percent: 0,
            }),
          } as Response;
        }
        throw new Error(`nieoczekiwane zapytanie: ${url}`);
      }) as unknown as typeof fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it('renderuje walidację VT vs typ uziemienia (eng.20)', async () => {
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
              vtCatalogRef: 'vt_20kv_100v_05_arteche', // realny typ katalogu, F_v 1,2
            },
          ]}
          automation={[]}
          interlocksConfigured={true}
          mvNeutralGroundingType="petersen_coil"
        />,
      );

      // Walidacja VT widoczna.
      expect(screen.getByTestId('vt-grounding-validation')).toBeDefined();
      // Werdykt NOK, bo F_v 1,2 nie wystarcza w sieci kompensowanej — i to BACKEND
      // tak mowi; karta pokazuje jego komunikat.
      const validation = await screen.findByTestId('vt-validation-POLE-01');
      expect(validation.getAttribute('data-vt-ok')).toBe('false');
      expect(validation.textContent?.toLowerCase()).toContain('petersena');
    });

    it('renderuje walidację I_dyn / I_th aparatury (eng.18) — werdykt z backendu', async () => {
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

      const validation = await screen.findByTestId('withstand-POLE-01');
      expect(validation.getAttribute('data-withstand-ok')).toBe('false');
      expect(validation.textContent).toContain('I_dyn');
    });

    it('walidacja VT OK gdy U_th=1.9 dla sieci skompensowanej', async () => {
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
              vtCatalogRef: 'vt_20kv_fz_100_3_05_3p_siemens', // realny typ, F_v 1,9
            },
          ]}
          automation={[]}
          interlocksConfigured={true}
          mvNeutralGroundingType="petersen_coil"
        />,
      );

      await waitFor(() =>
        expect(screen.getByTestId('vt-validation-POLE-01').getAttribute('data-vt-ok')).toBe('true'),
      );
    });
  });
});
