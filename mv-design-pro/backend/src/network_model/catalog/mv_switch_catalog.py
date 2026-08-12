"""
Katalog aparatury laczeniowej SN — dane znamionowe i laczeniowe.

ZRODLA DANYCH:
- Wylaczniki ABB VD4: ABB VD4 katalog 1VCP000015 (12/17.5/24 kV)
- Wylaczniki Siemens 3AH5: Siemens 3AH5 karta katalogowa (12/17.5/24 kV)
- Wylaczniki Eaton W-VACi: Eaton katalog ETN008001EN
- Rozlaczniki ABB NAL: ABB NAL katalog 1VCL100001
- Rozlaczniki Schneider RM6/SM6: Schneider katalog LVPED304049
- Odlaczniki ABB OJS: ABB OJS karta katalogowa
- Reklozery ABB REC615: ABB product guide 1MRS756379
- Reklozery NOJA OSP: NOJA Power OSP katalog DP-0035
- Reklozery Schneider ADVC: Schneider ADVC U20 karta katalogowa
- Bezpieczniki ETI VV: ETI VV topikowy katalog
- Aparatura generyczna: PN-EN 62271-100:2021 / PN-EN 62271-102:2018

KONWENCJE:
- un_kv [kV] — znamionowe napiecie pracy (12.0 dla SN 15 kV, 17.5 dla SN 20 kV, 24.0 dla SN 20 kV)
- in_a [A] — prad znamionowy ciaglej pracy
- ik_ka [kA] — znamionowy prad zwarciowy laczeniowy (wylaczniki, reklozery)
- icw_ka [kA] — prad wytrzymywany krotkotrwale 1s
- medium — srodek gaszacy (SF6, VACUUM, AIR)
- u_m_kv [kV] — napiecie najwyzsze urzadzenia U_m wg IEC 62271-1 (karta
  UM-ICU-KATALOG). Dla calej aparatury SN identyczne z un_kv — rodzina
  "12/17,5/24 kV" JEST napieciem najwyzszym urzadzenia z definicji normy.
  ``None`` wylacznie tam, gdzie prad znamionowy pozycji nie wystepuje w
  zrodle producenta (patrz niespojnosci nizej).
- i_cu_ka [kA] — znamionowa zdolnosc wylaczalna zwarciowa I_cu wg
  IEC 62271-100. WYLACZNIE dla aparatow zdolnych wylaczac prady zwarciowe
  (CIRCUIT_BREAKER, RECLOSER, FUSE). Dla LOAD_SWITCH/DISCONNECTOR/
  EARTH_SWITCH pole jest ZAWSZE None — te rodzaje aparatury NIE MAJA
  zdolnosci wylaczania zwarc z definicji normy (rozlacznik/odlacznik/
  uziemnik), a nie brakuje im danej. Generator equipment_proof zwraca dla
  nich werdykt NIE_DOTYCZY, nigdy pozorny FAIL.

TYPY APARATURY:
- CIRCUIT_BREAKER — wylacznik (zwarcia i obciazeniowy)
- DISCONNECTOR — odlacznik (bez obciazenia)
- LOAD_SWITCH — rozlacznik (obciazeniowy, bez zwarciowy)
- FUSE — bezpiecznik topikowy
- RECLOSER — reklozer (automatyczne ponowne zalaczenie)
- EARTH_SWITCH — uziemnik

METADATA:
- Aparatura z deklaracją producenta: ZWERYFIKOWANY / PRODUKCYJNY_V1
- Aparatura generyczna (bez producenta): CZESCIOWO_ZWERYFIKOWANY / REFERENCYJNY_V1

TYPOSZEREG PRZEMYSLOWY (36 rekordow):
  CIRCUIT_BREAKER: 12 rekordow (ABB/Siemens/Eaton, 12+17.5+24 kV)
  LOAD_SWITCH:      7 rekordow (ABB/Schneider, 12+17.5+24 kV)
  DISCONNECTOR:     4 rekordy  (ABB + generyczny)
  RECLOSER:         4 rekordy  (ABB/NOJA/Schneider)
  FUSE:             7 rekordow (ETI, 12+17.5 kV, 16-200A)
  EARTH_SWITCH:     2 rekordy  (generyczne)
"""

from collections import Counter
from typing import Any

# =============================================================================
# WYLACZNIKI SN (CIRCUIT_BREAKER) — prozniowe i SF6
# Zrodlo: ABB VD4 katalog / Siemens 3AH5 / Eaton W-VACi
# =============================================================================

SWITCH_CIRCUIT_BREAKERS: list[dict[str, Any]] = [
    # --- ABB VD4 12 kV ---
    {
        "id": "sw-cb-abb-vd4-12kv-630a",
        "name": "ABB VD4 12 kV 630 A",
        "params": {
            "equipment_kind": "CIRCUIT_BREAKER",
            "manufacturer": "ABB",
            "un_kv": 12.0,
            "in_a": 630.0,
            "ik_ka": 20.0,
            "icw_ka": 20.0,
            "medium": "VACUUM",
            "u_m_kv": 12.0,
            "i_cu_ka": 20.0,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB VD4 katalog 1VCP000015 / TK 521_VD4_40kA_E (Ur=12kV, Isc=20kA @ 630A)",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-cb-abb-vd4-12kv-1250a",
        "name": "ABB VD4 12 kV 1250 A",
        "params": {
            "equipment_kind": "CIRCUIT_BREAKER",
            "manufacturer": "ABB",
            "un_kv": 12.0,
            "in_a": 1250.0,
            "ik_ka": 25.0,
            "icw_ka": 25.0,
            "medium": "VACUUM",
            "u_m_kv": 12.0,
            "i_cu_ka": 25.0,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB VD4 katalog 1VCP000015 / TK 521_VD4_40kA_E (Ur=12kV, Isc=25kA @ 1250A)",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-cb-abb-vd4-12kv-2500a",
        "name": "ABB VD4 12 kV 2500 A",
        "params": {
            "equipment_kind": "CIRCUIT_BREAKER",
            "manufacturer": "ABB",
            "un_kv": 12.0,
            "in_a": 2500.0,
            "ik_ka": 40.0,
            "icw_ka": 40.0,
            "medium": "VACUUM",
            "u_m_kv": 12.0,
            "i_cu_ka": 40.0,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB VD4 katalog 1VCP000015 / TK 521_VD4_40kA_E (Ur=12kV, Isc=40kA @ 2500A, VD4 12.25.40 p275)",
            "contract_version": "2.0",
        },
    },
    # --- ABB VD4 17.5 kV ---
    {
        "id": "sw-cb-abb-vd4-17kv-630a",
        "name": "ABB VD4 17.5 kV 630 A",
        "params": {
            "equipment_kind": "CIRCUIT_BREAKER",
            "manufacturer": "ABB",
            "un_kv": 17.5,
            "in_a": 630.0,
            "ik_ka": 20.0,
            "icw_ka": 20.0,
            "medium": "VACUUM",
            "u_m_kv": 17.5,
            "i_cu_ka": 20.0,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB VD4 katalog 1VCP000015 / TK 521_VD4_40kA_E (Ur=17.5kV, Isc=20kA @ 630A)",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-cb-abb-vd4-17kv-1250a",
        "name": "ABB VD4 17.5 kV 1250 A",
        "params": {
            "equipment_kind": "CIRCUIT_BREAKER",
            "manufacturer": "ABB",
            "un_kv": 17.5,
            "in_a": 1250.0,
            "ik_ka": 25.0,
            "icw_ka": 25.0,
            "medium": "VACUUM",
            "u_m_kv": 17.5,
            "i_cu_ka": 25.0,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB VD4 katalog 1VCP000015 / TK 521_VD4_40kA_E (Ur=17.5kV, Isc=25kA @ 1250A)",
            "contract_version": "2.0",
        },
    },
    # --- ABB VD4 24 kV ---
    {
        "id": "sw-cb-abb-vd4-24kv-630a",
        "name": "ABB VD4 24 kV 630 A",
        "params": {
            "equipment_kind": "CIRCUIT_BREAKER",
            "manufacturer": "ABB",
            "un_kv": 24.0,
            "in_a": 630.0,
            "ik_ka": 20.0,
            "icw_ka": 20.0,
            "medium": "VACUUM",
            "u_m_kv": 24.0,
            "i_cu_ka": 20.0,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB VD4 katalog 1VCP000015 / TK 521_VD4_40kA_E (Ur=24kV, Isc=20kA @ 630A)",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-cb-abb-vd4-24kv-1250a",
        "name": "ABB VD4 24 kV 1250 A",
        "params": {
            "equipment_kind": "CIRCUIT_BREAKER",
            "manufacturer": "ABB",
            "un_kv": 24.0,
            "in_a": 1250.0,
            "ik_ka": 25.0,
            "icw_ka": 25.0,
            "medium": "VACUUM",
            "u_m_kv": 24.0,
            "i_cu_ka": 25.0,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB VD4 katalog 1VCP000015 / TK 521_VD4_40kA_E (Ur=24kV, Isc=25kA @ 1250A)",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-cb-abb-vd4-24kv-2000a",
        "name": "ABB VD4 24 kV 2000 A",
        "params": {
            "equipment_kind": "CIRCUIT_BREAKER",
            "manufacturer": "ABB",
            "un_kv": 24.0,
            "in_a": 2000.0,
            "ik_ka": 25.0,
            "icw_ka": 25.0,
            "medium": "VACUUM",
            "u_m_kv": 24.0,
            "i_cu_ka": 25.0,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB VD4 katalog 1VCP000015 / KOREKTA: TK 521_VD4_40kA_E str.16/21 — VD4 24kV max Isc=25kA (31.5kA niedostepne przy 24kV, bylo zawyzone)",
            "contract_version": "2.0",
        },
    },
    # --- Siemens 3AH5 ---
    {
        "id": "sw-cb-siemens-3ah5-12kv-630a",
        "name": "Siemens 3AH5 12 kV 630 A",
        "params": {
            "equipment_kind": "CIRCUIT_BREAKER",
            "manufacturer": "Siemens",
            "un_kv": 12.0,
            "in_a": 630.0,
            "ik_ka": 25.0,
            "icw_ka": 25.0,
            "medium": "VACUUM",
            "u_m_kv": None,
            "i_cu_ka": None,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "Siemens 3AH5 karta katalogowa",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-cb-siemens-3ah5-17kv-1250a",
        "name": "Siemens 3AH5 17.5 kV 1250 A",
        "params": {
            "equipment_kind": "CIRCUIT_BREAKER",
            "manufacturer": "Siemens",
            "un_kv": 17.5,
            "in_a": 1250.0,
            "ik_ka": 25.0,
            "icw_ka": 25.0,
            "medium": "VACUUM",
            "u_m_kv": 17.5,
            "i_cu_ka": 25.0,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "Siemens 3AH5 karta katalogowa / Siemens 3AH5 katalog HG 11.05 (2017) str.13 (Ur=17.5kV, Isc=25kA @ 1250A)",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-cb-siemens-3ah5-24kv-630a",
        "name": "Siemens 3AH5 24 kV 630 A",
        "params": {
            "equipment_kind": "CIRCUIT_BREAKER",
            "manufacturer": "Siemens",
            "un_kv": 24.0,
            "in_a": 630.0,
            "ik_ka": 20.0,
            "icw_ka": 20.0,
            "medium": "VACUUM",
            "u_m_kv": None,
            "i_cu_ka": None,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "Siemens 3AH5 karta katalogowa",
            "contract_version": "2.0",
        },
    },
    # --- Eaton W-VACi ---
    {
        "id": "sw-cb-eaton-w-vaci-12kv-630a",
        "name": "Eaton W-VACi 12 kV 630 A",
        "params": {
            "equipment_kind": "CIRCUIT_BREAKER",
            "manufacturer": "Eaton",
            "un_kv": 12.0,
            "in_a": 630.0,
            "ik_ka": 25.0,
            "icw_ka": 25.0,
            "medium": "VACUUM",
            "u_m_kv": 12.0,
            "i_cu_ka": 25.0,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "Eaton W-VACi katalog ETN008001EN / KOREKTA: Eaton W-VACi Product Guide str.10 — 20kA niedostepne przy 12kV (opcje 25/26,3/31,5/40/50kA); przyjeto 25kA (wariant B, min. dla 630A)",
            "contract_version": "2.0",
        },
    },
]


# =============================================================================
# ROZLACZNIKI SN (LOAD_SWITCH) — SF6 i prozniowe
# Zrodlo: ABB NAL katalog / Schneider RM6/SM6 katalog
# =============================================================================

SWITCH_LOAD_SWITCHES: list[dict[str, Any]] = [
    # --- ABB NAL 12 kV ---
    {
        "id": "sw-ls-abb-nal-12kv-400a",
        "name": "ABB NAL 12 kV 400 A",
        "params": {
            "equipment_kind": "LOAD_SWITCH",
            "manufacturer": "ABB",
            "un_kv": 12.0,
            "in_a": 400.0,
            "ik_ka": 0.0,
            "icw_ka": 16.0,
            "medium": "SF6",
            "u_m_kv": 12.0,
            "i_cu_ka": None,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB NAL katalog 1VCL100001 str.9 tabela I (Un=12kV; rozlacznik bez Isc — brak zdolnosci wylaczania z definicji urzadzenia)",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-ls-abb-nal-12kv-630a",
        "name": "ABB NAL 12 kV 630 A",
        "params": {
            "equipment_kind": "LOAD_SWITCH",
            "manufacturer": "ABB",
            "un_kv": 12.0,
            "in_a": 630.0,
            "ik_ka": 0.0,
            "icw_ka": 20.0,
            "medium": "SF6",
            "u_m_kv": 12.0,
            "i_cu_ka": None,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB NAL katalog 1VCL100001 str.9 tabela I (Un=12kV; rozlacznik bez Isc)",
            "contract_version": "2.0",
        },
    },
    # --- ABB NAL 24 kV ---
    {
        "id": "sw-ls-abb-nal-24kv-400a",
        "name": "ABB NAL 24 kV 400 A",
        "params": {
            "equipment_kind": "LOAD_SWITCH",
            "manufacturer": "ABB",
            "un_kv": 24.0,
            "in_a": 400.0,
            "ik_ka": 0.0,
            "icw_ka": 16.0,
            "medium": "SF6",
            "u_m_kv": 24.0,
            "i_cu_ka": None,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB NAL katalog 1VCL100001 str.9 tabela I (Un=24kV; rozlacznik bez Isc)",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-ls-abb-nal-24kv-630a",
        "name": "ABB NAL 24 kV 630 A",
        "params": {
            "equipment_kind": "LOAD_SWITCH",
            "manufacturer": "ABB",
            "un_kv": 24.0,
            "in_a": 630.0,
            "ik_ka": 0.0,
            "icw_ka": 20.0,
            "medium": "SF6",
            "u_m_kv": 24.0,
            "i_cu_ka": None,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB NAL katalog 1VCL100001 str.9 tabela I (Un=24kV; rozlacznik bez Isc)",
            "contract_version": "2.0",
        },
    },
    # --- Schneider RM6 12 kV ---
    {
        "id": "sw-ls-schneider-rm6-12kv-630a",
        "name": "Schneider RM6 12 kV 630 A",
        "params": {
            "equipment_kind": "LOAD_SWITCH",
            "manufacturer": "Schneider Electric",
            "un_kv": 12.0,
            "in_a": 630.0,
            "ik_ka": 0.0,
            "icw_ka": 20.0,
            "medium": "SF6",
            "u_m_kv": 12.0,
            "i_cu_ka": None,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "Schneider RM6 katalog LVPED304049",
            "contract_version": "2.0",
        },
    },
    # --- Schneider RM6 17.5 kV ---
    {
        "id": "sw-ls-schneider-rm6-17kv-400a",
        "name": "Schneider RM6 17.5 kV 400 A",
        "params": {
            "equipment_kind": "LOAD_SWITCH",
            "manufacturer": "Schneider Electric",
            "un_kv": 17.5,
            "in_a": 400.0,
            "ik_ka": 0.0,
            "icw_ka": 16.0,
            "medium": "SF6",
            "u_m_kv": 17.5,
            "i_cu_ka": None,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "Schneider RM6 katalog LVPED304049",
            "contract_version": "2.0",
        },
    },
    # --- Schneider SM6 24 kV ---
    {
        "id": "sw-ls-schneider-sm6-24kv-630a",
        "name": "Schneider SM6 24 kV 630 A",
        "params": {
            "equipment_kind": "LOAD_SWITCH",
            "manufacturer": "Schneider Electric",
            "un_kv": 24.0,
            "in_a": 630.0,
            "ik_ka": 0.0,
            "icw_ka": 20.0,
            "medium": "SF6",
            "u_m_kv": 24.0,
            "i_cu_ka": None,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "Schneider SM6 MCC katalog",
            "contract_version": "2.0",
        },
    },
]


# =============================================================================
# ODLACZNIKI SN (DISCONNECTOR)
# Zrodlo: ABB OJS karta katalogowa / PN-EN 62271-102:2018
# =============================================================================

SWITCH_DISCONNECTORS: list[dict[str, Any]] = [
    {
        "id": "sw-ds-abb-ojs-12kv-630a",
        "name": "ABB OJS 12 kV 630 A",
        "params": {
            "equipment_kind": "DISCONNECTOR",
            "manufacturer": "ABB",
            "un_kv": 12.0,
            "in_a": 630.0,
            "ik_ka": 0.0,
            "icw_ka": 20.0,
            "medium": "AIR",
            "u_m_kv": 12.0,
            "i_cu_ka": None,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB OJS karta katalogowa",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-ds-abb-ojs-17kv-630a",
        "name": "ABB OJS 17.5 kV 630 A",
        "params": {
            "equipment_kind": "DISCONNECTOR",
            "manufacturer": "ABB",
            "un_kv": 17.5,
            "in_a": 630.0,
            "ik_ka": 0.0,
            "icw_ka": 20.0,
            "medium": "AIR",
            "u_m_kv": 17.5,
            "i_cu_ka": None,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB OJS karta katalogowa",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-ds-abb-ojs-24kv-630a",
        "name": "ABB OJS 24 kV 630 A",
        "params": {
            "equipment_kind": "DISCONNECTOR",
            "manufacturer": "ABB",
            "un_kv": 24.0,
            "in_a": 630.0,
            "ik_ka": 0.0,
            "icw_ka": 20.0,
            "medium": "AIR",
            "u_m_kv": 24.0,
            "i_cu_ka": None,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB OJS karta katalogowa",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-ds-generic-slupowy-17kv-400a",
        "name": "Odlacznik slupowy 17.5 kV 400 A",
        "params": {
            "equipment_kind": "DISCONNECTOR",
            "manufacturer": "Elpo",
            "un_kv": 17.5,
            "in_a": 400.0,
            "ik_ka": 0.0,
            "icw_ka": 12.5,
            "medium": "AIR",
            "u_m_kv": 17.5,
            "i_cu_ka": None,
            "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "PN-EN 62271-102:2018 / parametry typowe odlacznikow slupowych",
            "contract_version": "2.0",
        },
    },
]


# =============================================================================
# REKLOZERY SN (RECLOSER)
# Zrodlo: ABB REC615 / NOJA OSP / Schneider ADVC
# =============================================================================

SWITCH_RECLOSERS: list[dict[str, Any]] = [
    {
        "id": "sw-rec-abb-rec615-17kv-630a",
        "name": "ABB REC615 17.5 kV 630 A",
        "params": {
            "equipment_kind": "RECLOSER",
            "manufacturer": "ABB",
            "un_kv": 17.5,
            "in_a": 630.0,
            "ik_ka": 12.5,
            "icw_ka": 12.5,
            "medium": "VACUUM",
            "u_m_kv": 17.5,
            "i_cu_ka": 12.5,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB REC615 product guide 1MRS756379",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-rec-abb-rec615-24kv-630a",
        "name": "ABB REC615 24 kV 630 A",
        "params": {
            "equipment_kind": "RECLOSER",
            "manufacturer": "ABB",
            "un_kv": 24.0,
            "in_a": 630.0,
            "ik_ka": 12.5,
            "icw_ka": 12.5,
            "medium": "VACUUM",
            "u_m_kv": 24.0,
            "i_cu_ka": 12.5,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ABB REC615 product guide 1MRS756379",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-rec-noja-osp-15kv-630a",
        "name": "NOJA Power OSP 15 kV 630 A",
        "params": {
            "equipment_kind": "RECLOSER",
            "manufacturer": "NOJA Power",
            "un_kv": 15.0,
            "in_a": 630.0,
            "ik_ka": 12.5,
            "icw_ka": 12.5,
            "medium": "VACUUM",
            "u_m_kv": 15.0,
            "i_cu_ka": 12.5,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "NOJA Power OSP katalog DP-0035",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-rec-schneider-u20-17kv-400a",
        "name": "Schneider ADVC U20 17.5 kV 400 A",
        "params": {
            "equipment_kind": "RECLOSER",
            "manufacturer": "Schneider Electric",
            "un_kv": 17.5,
            "in_a": 400.0,
            "ik_ka": 8.0,
            "icw_ka": 8.0,
            "medium": "VACUUM",
            "u_m_kv": 17.5,
            "i_cu_ka": 8.0,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "Schneider ADVC U20 karta katalogowa",
            "contract_version": "2.0",
        },
    },
]


# =============================================================================
# BEZPIECZNIKI SN (FUSE) — ETI VV topikowe
# Zrodlo: ETI VV topikowy katalog (12 kV i 17.5 kV)
# =============================================================================

SWITCH_FUSES: list[dict[str, Any]] = [
    {
        "id": "sw-fuse-eti-vv-12kv-16a",
        "name": "ETI VV 12 kV 16 A",
        "params": {
            "equipment_kind": "FUSE",
            "manufacturer": "ETI",
            "un_kv": 12.0,
            "in_a": 16.0,
            "ik_ka": 31.5,
            "icw_ka": 0.0,
            "medium": None,
            "u_m_kv": 12.0,
            "i_cu_ka": 31.5,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ETI VV topikowy katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-fuse-eti-vv-12kv-40a",
        "name": "ETI VV 12 kV 40 A",
        "params": {
            "equipment_kind": "FUSE",
            "manufacturer": "ETI",
            "un_kv": 12.0,
            "in_a": 40.0,
            "ik_ka": 31.5,
            "icw_ka": 0.0,
            "medium": None,
            "u_m_kv": 12.0,
            "i_cu_ka": 31.5,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ETI VV topikowy katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-fuse-eti-vv-12kv-63a",
        "name": "ETI VV 12 kV 63 A",
        "params": {
            "equipment_kind": "FUSE",
            "manufacturer": "ETI",
            "un_kv": 12.0,
            "in_a": 63.0,
            "ik_ka": 31.5,
            "icw_ka": 0.0,
            "medium": None,
            "u_m_kv": 12.0,
            "i_cu_ka": 31.5,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ETI VV topikowy katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-fuse-eti-vv-12kv-100a",
        "name": "ETI VV 12 kV 100 A",
        "params": {
            "equipment_kind": "FUSE",
            "manufacturer": "ETI",
            "un_kv": 12.0,
            "in_a": 100.0,
            "ik_ka": 31.5,
            "icw_ka": 0.0,
            "medium": None,
            "u_m_kv": 12.0,
            "i_cu_ka": 31.5,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ETI VV topikowy katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-fuse-eti-vv-12kv-200a",
        "name": "ETI VV 12 kV 200 A",
        "params": {
            "equipment_kind": "FUSE",
            "manufacturer": "ETI",
            "un_kv": 12.0,
            "in_a": 200.0,
            "ik_ka": 31.5,
            "icw_ka": 0.0,
            "medium": None,
            "u_m_kv": 12.0,
            "i_cu_ka": 31.5,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ETI VV topikowy katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-fuse-eti-vv-17kv-63a",
        "name": "ETI VV 17.5 kV 63 A",
        "params": {
            "equipment_kind": "FUSE",
            "manufacturer": "ETI",
            "un_kv": 17.5,
            "in_a": 63.0,
            "ik_ka": 31.5,
            "icw_ka": 0.0,
            "medium": None,
            "u_m_kv": 17.5,
            "i_cu_ka": 31.5,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ETI VV topikowy katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-fuse-eti-vv-17kv-100a",
        "name": "ETI VV 17.5 kV 100 A",
        "params": {
            "equipment_kind": "FUSE",
            "manufacturer": "ETI",
            "un_kv": 17.5,
            "in_a": 100.0,
            "ik_ka": 31.5,
            "icw_ka": 0.0,
            "medium": None,
            "u_m_kv": 17.5,
            "i_cu_ka": 31.5,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "ETI VV topikowy katalog",
            "contract_version": "2.0",
        },
    },
]


# =============================================================================
# UZIEMNIKI SN (EARTH_SWITCH)
# Zrodlo: PN-EN 62271-102:2018 / parametry typowe
# =============================================================================

SWITCH_EARTH_SWITCHES: list[dict[str, Any]] = [
    {
        "id": "sw-es-generic-12kv",
        "name": "Uziemnik 12 kV",
        "params": {
            "equipment_kind": "EARTH_SWITCH",
            "manufacturer": None,
            "un_kv": 12.0,
            "in_a": 0.0,
            "ik_ka": 0.0,
            "icw_ka": 20.0,
            "medium": None,
            "u_m_kv": 12.0,
            "i_cu_ka": None,
            "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "PN-EN 62271-102:2018 / parametry typowe",
            "contract_version": "2.0",
        },
    },
    {
        "id": "sw-es-generic-17kv",
        "name": "Uziemnik 17.5 kV",
        "params": {
            "equipment_kind": "EARTH_SWITCH",
            "manufacturer": None,
            "un_kv": 17.5,
            "in_a": 0.0,
            "ik_ka": 0.0,
            "icw_ka": 20.0,
            "medium": None,
            "u_m_kv": 17.5,
            "i_cu_ka": None,
            "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "PN-EN 62271-102:2018 / parametry typowe",
            "contract_version": "2.0",
        },
    },
]


# =============================================================================
# FUNKCJE DOSTEPU
# =============================================================================


def get_all_switch_equipment_types() -> list[dict[str, Any]]:
    """Zwraca wszystkie typy aparatury laczeniowej w katalogu (48 rekordow po K30-22)."""
    return (
        SWITCH_CIRCUIT_BREAKERS
        + SWITCH_LOAD_SWITCHES
        + SWITCH_DISCONNECTORS
        + SWITCH_RECLOSERS
        + SWITCH_FUSES
        + SWITCH_EARTH_SWITCHES
        + SWITCH_POLISH_PTPIRE  # K30-22 Polish ZPUE + Elektrometal expansion
    )


def get_circuit_breakers() -> list[dict[str, Any]]:
    """Zwraca wylaczniki."""
    return SWITCH_CIRCUIT_BREAKERS


def get_reclosers() -> list[dict[str, Any]]:
    """Zwraca reklozery."""
    return SWITCH_RECLOSERS


def _collect_quality_counts(all_types: list[dict[str, Any]]) -> dict[str, Any]:
    verification_counts = Counter(
        str(item["params"].get("verification_status", "")).strip() for item in all_types
    )
    catalog_counts = Counter(
        str(item["params"].get("catalog_status", "")).strip() for item in all_types
    )
    manufacturers = sorted(
        {
            str(item["params"].get("manufacturer")).strip()
            for item in all_types
            if item["params"].get("manufacturer")
        }
    )
    return {
        "statusy_weryfikacji": sorted(status for status in verification_counts if status),
        "statusy_katalogowe": sorted(status for status in catalog_counts if status),
        "liczba_zweryfikowanych": verification_counts.get("ZWERYFIKOWANY", 0),
        "liczba_czesciowo_zweryfikowanych": verification_counts.get(
            "CZESCIOWO_ZWERYFIKOWANY",
            0,
        ),
        "liczba_nieweryfikowanych": verification_counts.get("NIEWERYFIKOWANY", 0),
        "liczba_referencyjnych": verification_counts.get("REFERENCYJNY", 0),
        "producenci": manufacturers,
    }


def get_switch_catalog_statistics() -> dict[str, Any]:
    """Zwraca statystyki katalogu aparatury laczeniowej."""
    from collections import Counter as _Counter

    all_types = get_all_switch_equipment_types()
    kinds = sorted({t["params"]["equipment_kind"] for t in all_types})
    quality = _collect_quality_counts(all_types)
    # K30-22: count by equipment_kind across COMPLETE list (incl. Polish PTPiRE)
    by_kind = _Counter(t["params"]["equipment_kind"] for t in all_types)

    return {
        "liczba_aparatury_ogolem": len(all_types),
        "liczba_wylacznikow": by_kind.get("CIRCUIT_BREAKER", 0),
        "liczba_rozlacznikow": by_kind.get("LOAD_SWITCH", 0),
        "liczba_odlacznikow": by_kind.get("DISCONNECTOR", 0),
        "liczba_reklozerow": by_kind.get("RECLOSER", 0),
        "liczba_bezpiecznikow": by_kind.get("FUSE", 0),
        "liczba_uziemnikow": by_kind.get("EARTH_SWITCH", 0),
        "rodzaje": kinds,
        **quality,
    }


# =============================================================================
# K30-22: POLSCY PRODUCENCI ZPUE WLOSZCZOWA + ELEKTROMETAL
# =============================================================================
#
# ZPUE Wloszczowa — rodzina Rotoblok (CB SF6) + lacznik NAL.
# Elektrometal — rodzina E2 Alpha (CB vacuum, fuse-switch).
# Wszystkie pozycje zgodne z PTPiREE WiPWC referencje.


def _polish_switch(
    item_id: str,
    name: str,
    manufacturer: str,
    equipment_kind: str,
    un_kv: float,
    in_a: float,
    ik_ka: float,
    medium: str,
    source: str,
) -> dict[str, Any]:
    # UM-ICU-KATALOG: U_m aparatu SN = Ur z karty katalogowej (rodzina napieciowa
    # "12/17,5/24 kV" JEST napieciem najwyzszym urzadzenia wg IEC 62271-1) —
    # identycznosc obowiazujaca dla calej aparatury SN, nie tylko marek z kart
    # zrodlowych tej karty. I_cu (zdolnosc wylaczalna) dotyczy WYLACZNIE
    # wylacznikow (equipment_kind == CIRCUIT_BREAKER) — rozlaczniki i odlaczniki
    # nie maja tej zdolnosci z definicji normy, wiec pole zostaje None
    # (NIE_DOTYCZY), nie zero i nie kopia icw_ka.
    i_cu_ka = ik_ka if equipment_kind == "CIRCUIT_BREAKER" else None
    return {
        "id": item_id,
        "name": name,
        "params": {
            "equipment_kind": equipment_kind,
            "manufacturer": manufacturer,
            "un_kv": un_kv,
            "in_a": in_a,
            "ik_ka": ik_ka,
            "icw_ka": ik_ka,
            "medium": medium,
            "u_m_kv": un_kv,
            "i_cu_ka": i_cu_ka,
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": source,
            "contract_version": "2.0",
            "ptpire_certified": True,
        },
    }


SWITCH_POLISH_PTPIRE: list[dict[str, Any]] = [
    # ZPUE Wloszczowa Rotoblok — wylaczniki SF6
    _polish_switch(
        "sw-cb-zpue-rotoblok-12kv-630a",
        "ZPUE Rotoblok 12 kV 630 A (SF6)",
        "ZPUE Włoszczowa",
        "CIRCUIT_BREAKER",
        un_kv=12.0,
        in_a=630.0,
        ik_ka=16.0,
        medium="SF6",
        source="ZPUE Włoszczowa Rotoblok katalog 2024 / PTPiREE WiPWC",
    ),
    _polish_switch(
        "sw-cb-zpue-rotoblok-12kv-1250a",
        "ZPUE Rotoblok 12 kV 1250 A (SF6)",
        "ZPUE Włoszczowa",
        "CIRCUIT_BREAKER",
        un_kv=12.0,
        in_a=1250.0,
        ik_ka=20.0,
        medium="SF6",
        source="ZPUE Włoszczowa Rotoblok katalog 2024 / PTPiREE WiPWC",
    ),
    _polish_switch(
        "sw-cb-zpue-rotoblok-24kv-630a",
        "ZPUE Rotoblok 24 kV 630 A (SF6)",
        "ZPUE Włoszczowa",
        "CIRCUIT_BREAKER",
        un_kv=24.0,
        in_a=630.0,
        ik_ka=16.0,
        medium="SF6",
        source="ZPUE Włoszczowa Rotoblok katalog 2024 / PTPiREE WiPWC",
    ),
    _polish_switch(
        "sw-cb-zpue-rotoblok-24kv-1250a",
        "ZPUE Rotoblok 24 kV 1250 A (SF6)",
        "ZPUE Włoszczowa",
        "CIRCUIT_BREAKER",
        un_kv=24.0,
        in_a=1250.0,
        ik_ka=20.0,
        medium="SF6",
        source="ZPUE Włoszczowa Rotoblok katalog 2024 / PTPiREE WiPWC",
    ),
    # ZPUE NAL — laczniki SF6
    _polish_switch(
        "sw-ls-zpue-nal-12kv-630a",
        "ZPUE NAL 12 kV 630 A (lacznik SF6)",
        "ZPUE Włoszczowa",
        "LOAD_SWITCH",
        un_kv=12.0,
        in_a=630.0,
        ik_ka=16.0,
        medium="SF6",
        source="ZPUE Włoszczowa NAL katalog 2024 / PTPiREE WiPWC",
    ),
    _polish_switch(
        "sw-ls-zpue-nal-24kv-630a",
        "ZPUE NAL 24 kV 630 A (lacznik SF6)",
        "ZPUE Włoszczowa",
        "LOAD_SWITCH",
        un_kv=24.0,
        in_a=630.0,
        ik_ka=16.0,
        medium="SF6",
        source="ZPUE Włoszczowa NAL katalog 2024 / PTPiREE WiPWC",
    ),
    # Elektrometal E2 Alpha — wylaczniki vacuum
    _polish_switch(
        "sw-cb-elektrometal-e2alpha-12kv-630a",
        "Elektrometal E2 Alpha 12 kV 630 A (vacuum)",
        "Elektrometal",
        "CIRCUIT_BREAKER",
        un_kv=12.0,
        in_a=630.0,
        ik_ka=20.0,
        medium="VACUUM",
        source="Elektrometal E2 Alpha katalog 2024 / PTPiREE WiPWC",
    ),
    _polish_switch(
        "sw-cb-elektrometal-e2alpha-12kv-1250a",
        "Elektrometal E2 Alpha 12 kV 1250 A (vacuum)",
        "Elektrometal",
        "CIRCUIT_BREAKER",
        un_kv=12.0,
        in_a=1250.0,
        ik_ka=25.0,
        medium="VACUUM",
        source="Elektrometal E2 Alpha katalog 2024 / PTPiREE WiPWC",
    ),
    _polish_switch(
        "sw-cb-elektrometal-e2alpha-24kv-630a",
        "Elektrometal E2 Alpha 24 kV 630 A (vacuum)",
        "Elektrometal",
        "CIRCUIT_BREAKER",
        un_kv=24.0,
        in_a=630.0,
        ik_ka=20.0,
        medium="VACUUM",
        source="Elektrometal E2 Alpha katalog 2024 / PTPiREE WiPWC",
    ),
    _polish_switch(
        "sw-cb-elektrometal-e2alpha-24kv-2000a",
        "Elektrometal E2 Alpha 24 kV 2000 A (vacuum)",
        "Elektrometal",
        "CIRCUIT_BREAKER",
        un_kv=24.0,
        in_a=2000.0,
        ik_ka=31.5,
        medium="VACUUM",
        source="Elektrometal E2 Alpha katalog 2024 / PTPiREE WiPWC",
    ),
    # Elektrometal odlaczniki
    _polish_switch(
        "sw-ds-elektrometal-12kv-630a",
        "Elektrometal odlacznik 12 kV 630 A",
        "Elektrometal",
        "DISCONNECTOR",
        un_kv=12.0,
        in_a=630.0,
        ik_ka=16.0,
        medium="AIR",
        source="Elektrometal odlaczniki SN katalog 2024",
    ),
    _polish_switch(
        "sw-ds-elektrometal-24kv-1250a",
        "Elektrometal odlacznik 24 kV 1250 A",
        "Elektrometal",
        "DISCONNECTOR",
        un_kv=24.0,
        in_a=1250.0,
        ik_ka=20.0,
        medium="AIR",
        source="Elektrometal odlaczniki SN katalog 2024",
    ),
]
