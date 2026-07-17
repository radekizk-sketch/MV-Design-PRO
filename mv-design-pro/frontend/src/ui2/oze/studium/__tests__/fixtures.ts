/*
 * Fixtures kreatora studium przyłączenia (karta P35). Reużywają 1:1 kształtów
 * z fixtures sąsiednich okien OZE (zdolność/obszar/krzywe) — te same serializery
 * backendu. Dodają wyłącznie listę konwerterów z rodzajami PV/BESS/WIND (do testu
 * filtrowania po rodzaju) oraz katalog NC RfG z progami klas (do testu klasy).
 * Deterministyczne, bez losowości.
 */

import type {
  OdpowiedzKatalogNcRfg,
  RekordKonwertera,
  WidokDokumentuStudium,
} from '../../api';

export { przebiegFixture, snapshotFixture, widokObszaruFixture } from '../../obszar/__tests__/fixtures';
export { widokZdolnosciFixture } from '../../zdolnosc/__tests__/fixtures';
export { widokPokryciaFixture, widokPokryteFixture } from '../../krzywe/__tests__/fixtures';

/** Katalog konwerterów z trzema rodzajami (PV/BESS/WIND) — do testu filtra rodzaju. */
export function rekordyStudiumFixture(): RekordKonwertera[] {
  return [
    {
      id: 'conv-pv-2mw',
      name: 'Falownik PV 2 MW / 0.69 kV',
      kind: 'PV',
      un_kv: 0.69,
      sn_mva: 2.0,
      pmax_mw: 2.0,
      qmin_mvar: -0.8,
      qmax_mvar: 0.8,
      cosphi_min: 0.9,
      cosphi_max: 1.0,
      e_kwh: null,
      control_mode: 'Q_OF_U',
      pq_curve: [
        [0.0, -0.8, 0.8],
        [1.0, -0.8, 0.8],
        [2.0, -0.5, 0.5],
      ],
    },
    {
      id: 'conv-pv-1mw',
      name: 'Falownik PV 1 MW / 0.4 kV',
      kind: 'PV',
      un_kv: 0.4,
      sn_mva: 1.0,
      pmax_mw: 1.0,
      qmin_mvar: -0.4,
      qmax_mvar: 0.4,
      cosphi_min: 0.9,
      cosphi_max: 1.0,
      e_kwh: null,
      control_mode: null,
    },
    {
      id: 'conv-bess-1mw',
      name: 'Falownik BESS 1 MW / 1 MWh',
      kind: 'BESS',
      un_kv: 0.69,
      sn_mva: 1.0,
      pmax_mw: 1.0,
      qmin_mvar: -0.6,
      qmax_mvar: 0.6,
      cosphi_min: 0.8,
      cosphi_max: 1.0,
      e_kwh: 1000.0,
      control_mode: 'Q_OF_U',
    },
    {
      id: 'conv-wind-3mw',
      name: 'Przekształtnik farmy wiatrowej 3 MW / 0.69 kV',
      kind: 'WIND',
      un_kv: 0.69,
      sn_mva: 3.0,
      pmax_mw: 3.0,
      qmin_mvar: -1.2,
      qmax_mvar: 1.2,
      cosphi_min: 0.9,
      cosphi_max: 1.0,
      e_kwh: null,
      control_mode: null,
    },
  ];
}

/** Katalog NC RfG z progami klas (operator PSE) — do testu mapowania klasy modułu. */
export function katalogStudiumFixture(): OdpowiedzKatalogNcRfg {
  return {
    operators: [
      {
        operator_id: 'pse',
        operator_name_pl: 'PSE — Polskie Sieci Elektroenergetyczne',
        module_types: [
          { id: 'A', threshold_kw_min: 0, threshold_kw_max: 50, voltage_kv_max: null, description_pl: 'Moduł typu A' },
          { id: 'B', threshold_kw_min: 50, threshold_kw_max: 1000, voltage_kv_max: null, description_pl: 'Moduł typu B' },
          { id: 'C', threshold_kw_min: 1000, threshold_kw_max: 50000, voltage_kv_max: null, description_pl: 'Moduł typu C' },
          { id: 'D', threshold_kw_min: 50000, threshold_kw_max: null, voltage_kv_max: null, description_pl: 'Moduł typu D' },
        ],
      },
      {
        operator_id: 'pge',
        operator_name_pl: 'PGE Dystrybucja',
        module_types: [],
      },
    ],
  };
}

/**
 * Widok dokumentu studium 1:1 z `build_dokument_studium_view` (jeden wariant,
 * wszystkie fazy policzone). Wartości spójne z `ustawGotowyRozplyw` w teście
 * (run_id `lf-run`, typ `conv-pv-2mw`, operator `pse`, węzeł `bus-a`).
 */
export function widokDokumentuFixture(): WidokDokumentuStudium {
  return {
    kontrakt: 'DokumentStudiumPrzylaczeniowegoV1',
    tytul: 'Dokument studium przyłączeniowego OZE',
    identyfikacja: {
      projekt: 'Projekt testowy',
      przypadek: 'Wariant bazowy',
      wnioskodawca: null,
      adres_przylaczenia: null,
    },
    zalozenia: {
      typ_katalogowy: {
        id: 'conv-pv-2mw',
        nazwa: 'Falownik PV 2 MW / 0.69 kV',
        kind: 'PV',
        pmax_mw: 2.0,
        sn_mva: 2.0,
      },
      operator: { id: 'pse', nazwa: 'PSE — Polskie Sieci Elektroenergetyczne' },
      przebieg_bazowy: { run_id: 'lf-run', snapshot_hash: 'snap-abc' },
      liczba_wariantow: 1,
    },
    warianty: [
      {
        bus_ref: 'bus-a',
        nazwa_wezla: 'Szyna A',
        napiecie_kv: 15,
        zdolnosc: {
          status: 'ok',
          max_moc_mw: 1.5,
          ograniczenie_pl: 'Kryterium napięciowe — węzeł „Szyna A”.',
          komunikat_bledu: null,
        },
        obszar_pq: {
          status: 'ok',
          pasmo_q_pl: '-1,00 … 1,00 Mvar',
          liczba_wierzcholkow: 3,
          komunikat_bledu: null,
        },
        pokrycie_pq: {
          status: 'ok',
          pokryty: false,
          werdykt_pl: 'Niepokryte',
          opis_pl: 'Pokryto 2 z 3 punktów krzywej.',
          komunikat_bledu: null,
        },
        klasa_nc_rfg: { klasa: 'C', opis_pl: 'Moduł typu C' },
        odcisk_sekcji_sha256: 'sekcja-bus-a',
      },
    ],
    podsumowanie: [
      {
        bus_ref: 'bus-a',
        nazwa_wezla: 'Szyna A',
        max_moc_mw: 1.5,
        klasa: 'C',
        pokrycie_pl: 'Niepokryte',
        pasmo_q_pl: '-1,00 … 1,00 Mvar',
      },
    ],
    zalozenia_pl: [
      'Dokument zestawia gotowe wyniki obliczeń — nie przelicza żadnej wielkości.',
      'Sekwencja per wariant: zdolność przyłączeniowa → obszar pracy P–Q → pokrycie wymagań P–Q.',
    ],
    odciski_sekcji_sha256: {
      'bus-a': 'sekcja-bus-a',
      zalozenia: 'odcisk-zalozenia',
      podsumowanie: 'odcisk-podsumowanie',
    },
    input_hash: 'input-hash-1',
  };
}

/**
 * Widok dokumentu z uczciwym błędem jednej fazy wariantu (obszar P–Q) — pozostałe
 * fazy policzone. Do testu sekcji błędów wariantów.
 */
export function widokDokumentuZBledemFixture(): WidokDokumentuStudium {
  const bazowy = widokDokumentuFixture();
  const wariant = bazowy.warianty[0];
  return {
    ...bazowy,
    warianty: [
      {
        ...wariant,
        obszar_pq: {
          status: 'blad',
          pasmo_q_pl: null,
          liczba_wierzcholkow: null,
          komunikat_bledu: 'Węzeł spoza wyników rozpływu mocy.',
        },
      },
    ],
    podsumowanie: [
      {
        ...bazowy.podsumowanie[0],
        pasmo_q_pl: null,
      },
    ],
  };
}
