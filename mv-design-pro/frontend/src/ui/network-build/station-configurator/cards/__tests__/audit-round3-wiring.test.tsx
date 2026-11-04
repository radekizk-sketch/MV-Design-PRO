/**
 * Testy wiringu katalogów stacji do kart konfiguratora (Pakiet G).
 *
 * Sprawdzają, że katalogi przełączników zaczepów, wkładek SN i przekładników
 * napięciowych są rzeczywiście używane w kartach, a nie tylko zdefiniowane, oraz że
 * wybór w karcie wychodzi do wywołującego z identyfikatorem pola modelu (karta
 * JEDNA-SCIEZKA-EDYCJI: wybór zapisuje operacja modelu sieci, nie zapisana konfiguracja
 * stacji). Kryterium wytrzymałości aparatury nie żyje w tej karcie — weryfikację
 * aparatów pola prowadzi ekran wyników zwarciowych.
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { StationConfigTransformerCard } from '../StationConfigTransformerCard';
import { StationConfigBaysCard } from '../StationConfigBaysCard';
import { StationConfigProtectionCard } from '../StationConfigProtectionCard';
import type { HvFuseItem } from '../../../station-der/katalogi-stacji-api';
import type { TapChangerCatalogType } from '../../../../catalog/types';

// Karta FAB-L: katalog z backendu — kształt 1:1 z `katalogi_stacji.py::TapChangerItem.to_dict`
// (karta JEDNA-SCIEZKA-EDYCJI: karta transformatora czyta `GET /api/v1/catalog/konfiguracja-stacji/tap-changers`
// przez `fetchTapChangers`, typ `TapChangerCatalogType`), nie statyk modułowy.
const TAP_CHANGER_FIXTURES: readonly TapChangerCatalogType[] = [
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

// Karta FAB-M: katalog WYŁĄCZNIE ze snapshotu katalogów stacji — kształt 1:1 z backendu
// (`katalogi_stacji.py::HvFuseItem.to_dict`), nie statyk modułowy. Pozycje i
// zdanie proweniencji (`pasmo_brak_powod_pl`) skopiowane z realnego backendu
// (`POWOD_BRAK_PASMA_WKLADKI_PL`), nie wymyślone na potrzeby testu.
const POWOD_BRAK_PASMA_PL =
  'Pasmo topikowe (krzywa przedłukowa i krzywa wyłączania) odczytuje się z karty '
  + 'katalogowej producenta wg IEC 60282-1. Ta pozycja katalogowa nie niesie punktów '
  + 'pasma, więc czasu zadziałania nie wyznaczono — nie zastąpiono go żadnym '
  + 'przybliżeniem.';
const HV_FUSE_FIXTURES: readonly HvFuseItem[] = [
  {
    id: 'fuse_15kv_50a_full', catalog_namespace: 'hv_fuse', catalog_version: '2026-08-14',
    label_pl: 'Bezpiecznik SN 15 kV / 50 A · full-range · pole transformatorowe',
    nominal_voltage_kv: 15, nominal_current_a: 50, class: 'full_range',
    application: 'transformer', pasmo_tcc: null,
    pasmo_brak_powod_pl: POWOD_BRAK_PASMA_PL,
    pasmo_brak_etykieta_pl: 'pasmo wymaga karty producenta',
  },
  {
    id: 'fuse_20kv_25a_gp', catalog_namespace: 'hv_fuse', catalog_version: '2026-08-14',
    label_pl: 'Bezpiecznik SN 20 kV / 25 A · general-purpose · pole odpływowe',
    nominal_voltage_kv: 20, nominal_current_a: 25, class: 'general_purpose',
    application: 'feeder', pasmo_tcc: null,
    pasmo_brak_powod_pl: POWOD_BRAK_PASMA_PL,
    pasmo_brak_etykieta_pl: 'pasmo wymaga karty producenta',
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

  describe('BaysCard wire eng.17 (snapshot katalogów stacji, karta FAB-M)', () => {
    it('renderuje kolumnę "HV fuse" w tabeli pól', () => {
      render(
        <StationConfigBaysCard
          bays={[
            {
              bayId: 'b1',
              designation: 'POLE-01',
              bayRole: 'TR',
              hasEquipment: true,
              hasProtection: true,
              hasMeasurements: true,
              statusPl: 'kompletne',
              hvFuseCatalogRef: 'fuse_15kv_50a_full',
            },
          ]}
          hvFuses={HV_FUSE_FIXTURES}
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
              bayRole: 'TR',
              hasEquipment: true,
              hasProtection: true,
              hasMeasurements: true,
              statusPl: 'kompletne',
              hvFuseCatalogRef: 'fuse_15kv_50a_full',
            },
          ]}
          hvFuses={HV_FUSE_FIXTURES}
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
              bayRole: 'IN',
              hasEquipment: true,
              hasProtection: true,
              hasMeasurements: true,
              statusPl: 'kompletne',
              hvFuseCatalogRef: null,
            },
          ]}
          hvFuses={HV_FUSE_FIXTURES}
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
              bayRole: 'IN',
              hasEquipment: true,
              hasProtection: true,
              hasMeasurements: true,
              statusPl: 'kompletne',
              hvFuseCatalogRef: null,
            },
          ]}
          hvFuses={HV_FUSE_FIXTURES}
        />,
      );
      const fuseCell = screen.getByTestId('bay-fuse-b2');
      expect(fuseCell.textContent).toContain('—');
    });
  });

  describe('BaysCard — wybór wkładki zapisem modelu (karta JEDNA-SCIEZKA-EDYCJI)', () => {
    const pole = (maBezpieczniki: boolean) => ({
      bayId: 'bay/pole-01',
      designation: 'POLE-01',
      bayRole: 'TR' as const,
      hasEquipment: true,
      hasProtection: false,
      hasMeasurements: false,
      statusPl: 'kompletne' as const,
      hvFuseCatalogRef: null,
      maBezpieczniki,
    });

    it('pole z bezpiecznikami: wybór i rezygnacja wychodzą z identyfikatorem pola', () => {
      const wybory: Array<[string, string | null]> = [];
      render(
        <StationConfigBaysCard
          bays={[pole(true)]}
          hvFuses={HV_FUSE_FIXTURES}
          onChangeHvFuse={(bayId, fuseId) => wybory.push([bayId, fuseId])}
        />,
      );
      const select = screen.getByTestId('bay-fuse-select-bay/pole-01');
      fireEvent.change(select, { target: { value: 'fuse_15kv_50a_full' } });
      fireEvent.change(select, { target: { value: '' } });
      expect(wybory).toEqual([
        ['bay/pole-01', 'fuse_15kv_50a_full'],
        ['bay/pole-01', null],
      ]);
    });

    it('pole bez bezpieczników nie oferuje wyboru wkładki i nazywa powód', () => {
      render(
        <StationConfigBaysCard
          bays={[pole(false)]}
          hvFuses={HV_FUSE_FIXTURES}
          onChangeHvFuse={() => undefined}
        />,
      );
      expect(screen.queryByTestId('bay-fuse-select-bay/pole-01')).toBeNull();
      expect(screen.getByTestId('bay-fuse-brak-bezpiecznikow-bay/pole-01').textContent).toBe(
        'pole bez bezpieczników',
      );
    });
  });

  describe('ProtectionCard wire eng.20', () => {
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
        if (url.endsWith('/_uziemienie-sn')) {
          // Atrapa ODCZYTU MODELU backendu (karta UX-04/POLE-ZU): sieć SN pól stacji
          // skompensowana — zespół uziemiający z dławikiem gaszącym w sekcji pola.
          const body = JSON.parse(String(init?.body ?? '{}')) as { pola?: string[] };
          return {
            ok: true,
            status: 200,
            json: async () => ({
              station_id: 'st-1',
              sekcje: [],
              przyczyna_braku: null,
              pola: (body.pola ?? []).map((oznaczenie) => ({
                oznaczenie,
                typ_punktu_neutralnego: 'petersen_coil',
                przyczyna_braku: null,
              })),
            }),
          } as Response;
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
              bayRef: 'bay/pole-01',
              bayDesignation: 'POLE-01',
              typePl: 'SIEMENS 7SJ85',
              functionsPl: ['50/51', '67N'],
              settingsCount: 4,
              enabled: true,
              vtCatalogRef: 'vt_20kv_100v_05_arteche', // realny typ katalogu, F_v 1,2
            },
          ]}
          kontekstUziemienia={{ projectId: 'proj-1', stationId: 'st-1', rewizja: 1 }}
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

    it('wybór typu VT wychodzi z identyfikatorem pola modelu i pełnym typem z katalogu', async () => {
      const wybory: Array<[string, string | null]> = [];
      render(
        <StationConfigProtectionCard
          relays={[
            {
              relayId: 'r1',
              bayRef: 'bay/pole-01',
              bayDesignation: 'POLE-01',
              typePl: 'SIEMENS 7SJ85',
              functionsPl: ['50/51'],
              settingsCount: 4,
              enabled: true,
              vtCatalogRef: null,
            },
          ]}
          onChangeVt={(bayRef, typ) => wybory.push([bayRef, typ?.id ?? null])}
        />,
      );
      const select = (await screen.findByTestId('relay-vt-select-r1')) as HTMLSelectElement;
      await waitFor(() => expect(select.options.length).toBe(1 + TYPY_VT.length));
      fireEvent.change(select, { target: { value: 'vt_20kv_fz_100_3_05_3p_siemens' } });
      fireEvent.change(select, { target: { value: '' } });
      expect(wybory).toEqual([
        ['bay/pole-01', 'vt_20kv_fz_100_3_05_3p_siemens'],
        ['bay/pole-01', null],
      ]);
    });

    it('walidacja VT OK gdy U_th=1.9 dla sieci skompensowanej', async () => {
      render(
        <StationConfigProtectionCard
          relays={[
            {
              relayId: 'r1',
              bayRef: 'bay/pole-01',
              bayDesignation: 'POLE-01',
              typePl: 'SIEMENS 7SJ85',
              functionsPl: ['67N'],
              settingsCount: 4,
              enabled: true,
              vtCatalogRef: 'vt_20kv_fz_100_3_05_3p_siemens', // realny typ, F_v 1,9
            },
          ]}
          kontekstUziemienia={{ projectId: 'proj-1', stationId: 'st-1', rewizja: 1 }}
        />,
      );

      await waitFor(() =>
        expect(screen.getByTestId('vt-validation-POLE-01').getAttribute('data-vt-ok')).toBe('true'),
      );
    });
  });
});
