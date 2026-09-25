"""Sieć wzorcowa G16 — bieg czasowy RMS (karta W6-3B).

PO CO OSOBNA SIEĆ. Rejestr wzorcowy nie miał ANI JEDNEJ sieci z blokiem
`Generator.dynamika`, więc rodzina solverów `DYNAMICS` nie miała na czym być
liczona. Dopisanie bloków dynamiki do istniejącego budowniczego zmieniłoby hash
modelu, na którym stoją złote wyniki rozpływu i zwarć — dlatego to NOWA sieć,
nie modyfikacja cudzej.

CO SIEĆ ĆWICZY (iloczyn cech, nie jeden przykład). Każdy element widoku sieci,
który adapter dynamiki musi odwzorować, jest tu obecny:

* transformator 110/15 kV z zaczepem POZA znamionowym i grupą połączeń Dyn11
  (przekładnia ZESPOLONA: moduł ≠ 1 i kąt ≠ 0 równocześnie);
* kabel z niezerową susceptancją poprzeczną (gałąź pi z admitancją poprzeczną);
* linia napowietrzna (druga klasa gałęzi podłużnej);
* łącznik ZAMKNIĘTY (sprzęgło szyn — wchodzi do macierzy jako gałąź) i łącznik
  OTWARTY (nie wchodzi wcale);
* kabel POZA RUCHEM (`status: open`, równoległy do czynnego — topologia zasilona
  bez zmian, a gałąź musi wypaść z macierzy po OBU stronach tak samo);
* bateria kondensatorów ZAŁĄCZONA (odsprzęg poprzeczny w węźle) i WYŁĄCZONA
  (`status: open` — nie wchodzi do macierzy po żadnej ze stron);
* odbiór o stałej mocy na szynie BEZ wytwórcy i odbiór na szynie Z wytwórcą
  (dwa różne podziały mocy węzła między urządzenie a odbiór);
* dwa wytwórcy różnych rodzin: maszyna synchroniczna (8 stanów) i przekształtnik
  nadążny GFL (parametry z profilu typowego normy — proweniencja DEKLARACJA).

KLASA WYROCZNI. `REGRESSION_ONLY`: ta sieć nie ma rozwiązania zamkniętego (dwie
maszyny, odbiory o stałej mocy, transformator z przesunięciem fazowym).
Wyrocznie ANALITYCZNE rdzenia dynamiki żyją na układzie maszyna–szyna sztywna
(`tests/network_model/dynamika/uklady.py`) i to one dowodzą fizyki; ta sieć
dowodzi, że ŚCIEŻKA UŻYTKOWNIKA — migawka → rozpływ → bieg czasowy → kontrakt
wyniku — działa na sieci o pełnym zestawie elementów.
"""

from __future__ import annotations

from typing import Any

from tests.catalog_test_helpers import gpz_source_record

#: Proweniencja bloków: maszyna z karty producenta, przekształtnik z profilu
#: typowego normy — DWIE różne wartości osi proweniencji w jednej sieci, żeby
#: ich obecność w założeniach wyniku była sprawdzalna.
_PROWENIENCJA_MASZYNY: dict[str, Any] = {
    "zrodlo": "karta_producenta",
    "odniesienie": "Karta katalogowa maszyny synchronicznej 10 MVA, wyd. 2026-01",
    "data": "2026-01-01",
}
_PROWENIENCJA_FALOWNIKA: dict[str, Any] = {
    "zrodlo": "profil_typowy_normy",
    "odniesienie": "IEEE 1547-2018 §5-8; Rozporządzenie (UE) 2016/631 (NC RfG) art. 13-21",
    "data": None,
}

#: Maszyna synchroniczna 6. rzędu — komplet pól kontraktu `MaszynaSynchroniczna`
#: (zero pól opcjonalnych pominiętych „dla zwięzłości": brak pola jest brakiem
#: danej wejściowej, nie skrótem zapisu).
MASZYNA_SYNCHRONICZNA: dict[str, Any] = {
    "rodzina": "synchroniczna",
    "proweniencja": _PROWENIENCJA_MASZYNY,
    "s_n_mva": 10.0,
    "h_s": 3.0,
    "d_pu": 1.0,
    "xd_pu": 1.8,
    "xq_pu": 1.7,
    "xd_prim_pu": 0.3,
    "xq_prim_pu": 0.4,
    "xd_bis_pu": 0.2,
    "xq_bis_pu": 0.25,
    "td0_prim_s": 6.0,
    "tq0_prim_s": 0.5,
    "td0_bis_s": 0.03,
    "tq0_bis_s": 0.05,
    "xl_pu": 0.15,
    "nasycenie_s10": 0.1,
    "nasycenie_s12": 0.3,
    "ra_pu": 0.003,
}

#: Przekształtnik nadążny (grid-following) — komplet pól kontraktu `PrzeksztaltnikGFL`.
PRZEKSZTALTNIK_GFL: dict[str, Any] = {
    "rodzina": "przeksztaltnikowa_gfl",
    "proweniencja": _PROWENIENCJA_FALOWNIKA,
    "s_n_mva": 2.0,
    "i_max_pu": 1.2,
    "priorytet_ogranicznika": "bierna",
    "pll_kp": 50.0,
    "pll_ki": 500.0,
    "reg_pradu_kp": 1.0,
    "reg_pradu_ki": 100.0,
    "k_frt": 2.0,
    "prog_frt_pu": 0.9,
    "tp_s": 0.02,
    "tiq_s": 0.02,
    "p_odbudowa_pu_na_s": 1.0,
    "p_odbudowa_opoznienie_s": 0.1,
    "droop_p_f_pu": 0.04,
    "martwa_strefa_f_hz": 0.02,
    "droop_q_u_pu": 0.05,
    "martwa_strefa_u_pu": 0.01,
    "u_min_ciagle_pu": 0.85,
    "u_max_ciagle_pu": 1.1,
}


def build_dynamika_rms_enm() -> dict[str, Any]:
    """Migawka ENM sieci G16 — słownik walidujący się jako `EnergyNetworkModel`."""
    return {
        "header": {
            "name": "G16 — sieć wzorcowa biegu czasowego RMS",
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "6a1d0000-0000-4000-8000-000000000001",
                "ref_id": "b-110",
                "name": "Szyna 110 kV (GPZ)",
                "tags": [],
                "meta": {},
                "voltage_kv": 110.0,
                "phase_system": "3ph",
            },
            {
                "id": "6a1d0000-0000-4000-8000-000000000002",
                "ref_id": "b-sn-a",
                "name": "Rozdzielnica SN — sekcja A",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            },
            {
                "id": "6a1d0000-0000-4000-8000-000000000003",
                "ref_id": "b-sn-b",
                "name": "Rozdzielnica SN — sekcja B",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            },
            {
                "id": "6a1d0000-0000-4000-8000-000000000004",
                "ref_id": "b-odplyw",
                "name": "Szyna odpływowa",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            },
            {
                "id": "6a1d0000-0000-4000-8000-000000000005",
                "ref_id": "b-oze",
                "name": "Szyna przyłączenia OZE",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            },
        ],
        "branches": [
            {
                "id": "6a1d0000-0000-4000-8000-000000000011",
                "ref_id": "spr-szyn",
                "name": "Sprzęgło szyn SN",
                "tags": [],
                "meta": {},
                "type": "bus_coupler",
                "from_bus_ref": "b-sn-a",
                "to_bus_ref": "b-sn-b",
                "status": "closed",
                "catalog_ref": "LACZNIK_SN_TEST",
                "parameter_source": "OVERRIDE",
            },
            {
                "id": "6a1d0000-0000-4000-8000-000000000012",
                "ref_id": "odl-rezerwa",
                "name": "Odłącznik rezerwowy (otwarty)",
                "tags": [],
                "meta": {},
                "type": "disconnector",
                "from_bus_ref": "b-sn-a",
                "to_bus_ref": "b-odplyw",
                "status": "open",
                "catalog_ref": "LACZNIK_SN_TEST",
                "parameter_source": "OVERRIDE",
            },
            {
                "id": "6a1d0000-0000-4000-8000-000000000013",
                "ref_id": "kab-odplyw",
                "name": "Kabel odpływowy",
                "tags": [],
                "meta": {},
                "type": "cable",
                "from_bus_ref": "b-sn-b",
                "to_bus_ref": "b-odplyw",
                "status": "closed",
                "length_km": 2.5,
                "r_ohm_per_km": 0.2,
                "x_ohm_per_km": 0.1,
                "b_siemens_per_km": 6.0e-5,
                "catalog_ref": "KABEL_SN_TEST",
                "parameter_source": "OVERRIDE",
            },
            {
                "id": "6a1d0000-0000-4000-8000-000000000015",
                "ref_id": "kab-rezerwa",
                "name": "Kabel rezerwowy (poza ruchem)",
                "tags": [],
                "meta": {},
                "type": "cable",
                "from_bus_ref": "b-sn-b",
                "to_bus_ref": "b-odplyw",
                "status": "open",
                "length_km": 2.5,
                "r_ohm_per_km": 0.2,
                "x_ohm_per_km": 0.1,
                "b_siemens_per_km": 6.0e-5,
                "catalog_ref": "KABEL_SN_TEST",
                "parameter_source": "OVERRIDE",
            },
            {
                "id": "6a1d0000-0000-4000-8000-000000000014",
                "ref_id": "lin-oze",
                "name": "Linia napowietrzna do OZE",
                "tags": [],
                "meta": {},
                "type": "line_overhead",
                "from_bus_ref": "b-odplyw",
                "to_bus_ref": "b-oze",
                "status": "closed",
                "length_km": 4.0,
                "r_ohm_per_km": 0.3,
                "x_ohm_per_km": 0.35,
                "b_siemens_per_km": 3.0e-6,
                "catalog_ref": "LINIA_SN_TEST",
                "parameter_source": "OVERRIDE",
            },
        ],
        "transformers": [
            {
                "id": "6a1d0000-0000-4000-8000-000000000021",
                "ref_id": "tr-gpz",
                "name": "Transformator GPZ 110/15 kV",
                "tags": [],
                "meta": {},
                "hv_bus_ref": "b-110",
                "lv_bus_ref": "b-sn-a",
                "sn_mva": 25.0,
                "uhv_kv": 110.0,
                "ulv_kv": 16.5,
                "uk_percent": 11.0,
                "pk_kw": 120.0,
                "vector_group": "Dyn11",
                "tap_position": 2,
                "tap_min": -8,
                "tap_max": 8,
                "tap_step_percent": 1.5,
                "catalog_ref": "TR_110_15_TEST",
                "parameter_source": "OVERRIDE",
            }
        ],
        "sources": [
            {
                "id": "6a1d0000-0000-4000-8000-000000000031",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="zrodlo-110",
                    name="Sieć nadrzędna 110 kV",
                    bus_ref="b-110",
                    voltage_kv=110.0,
                    sk3_mva=2500.0,
                    rx_ratio=0.10,
                ),
            }
        ],
        "loads": [
            {
                "id": "6a1d0000-0000-4000-8000-000000000041",
                "ref_id": "odb-odplyw",
                "name": "Odbiór odpływu",
                "tags": [],
                "meta": {},
                "bus_ref": "b-odplyw",
                "p_mw": 3.0,
                "q_mvar": 0.8,
                "catalog_ref": "ODBIOR_SN_TEST",
                "parameter_source": "OVERRIDE",
            },
            {
                "id": "6a1d0000-0000-4000-8000-000000000042",
                "ref_id": "odb-potrzeby",
                "name": "Potrzeby własne przy maszynie",
                "tags": [],
                "meta": {},
                "bus_ref": "b-sn-b",
                "p_mw": 0.4,
                "q_mvar": 0.1,
                "catalog_ref": "ODBIOR_SN_TEST",
                "parameter_source": "OVERRIDE",
            },
        ],
        "generators": [
            {
                "id": "6a1d0000-0000-4000-8000-000000000051",
                "ref_id": "gen-synchroniczny",
                "name": "Maszyna synchroniczna 10 MVA",
                "tags": [],
                "meta": {},
                "bus_ref": "b-sn-b",
                "p_mw": 5.0,
                "q_mvar": 1.0,
                "gen_type": "synchronous",
                "dynamika": MASZYNA_SYNCHRONICZNA,
            },
            {
                "id": "6a1d0000-0000-4000-8000-000000000052",
                "ref_id": "gen-pv",
                "name": "Instalacja PV 2 MVA",
                "tags": [],
                "meta": {},
                "bus_ref": "b-oze",
                "p_mw": 1.6,
                "q_mvar": 0.0,
                "gen_type": "pv_inverter",
                "connection_variant": "DEDICATED_MV_CONNECTION",
                "dynamika": PRZEKSZTALTNIK_GFL,
            },
        ],
        "switches": [],
        "shunt_capacitors": [
            {
                "id": "6a1d0000-0000-4000-8000-000000000061",
                "ref_id": "bat-kompensacja",
                "name": "Bateria kondensatorów sekcji A",
                "tags": [],
                "meta": {},
                "bus_ref": "b-sn-a",
                "rated_mvar": 2.0,
                "rated_kv": 15.0,
                "status": "closed",
                "catalog_ref": "KOMPENSATOR_SN_TEST",
                "parameter_source": "OVERRIDE",
            },
            {
                "id": "6a1d0000-0000-4000-8000-000000000062",
                "ref_id": "bat-wylaczona",
                "name": "Bateria kondensatorów sekcji B (wyłączona)",
                "tags": [],
                "meta": {},
                "bus_ref": "b-sn-b",
                "rated_mvar": 1.5,
                "rated_kv": 15.0,
                "status": "open",
                "catalog_ref": "KOMPENSATOR_SN_TEST",
                "parameter_source": "OVERRIDE",
            },
        ],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


__all__ = [
    "MASZYNA_SYNCHRONICZNA",
    "PRZEKSZTALTNIK_GFL",
    "build_dynamika_rms_enm",
]
