"""
Katalog transformatorow SN — dane tabliczkowe i zwarciowe.

ZRODLA DANYCH:
- Transformatory WN/SN (110/15 kV, 110/20 kV):
    PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42
- Transformatory SN/nN (15/0.4 kV, 20/0.4 kV):
    PN-EN 60076-11:2004 Tabl.A + Rozporzadzenie UE 2019/1783 Tier 2 / ABB katalog dystrybucyjny
- Transformatory SN/nN dla zrodel falownikowych PV/BESS/FW:
    referencyjne profile projektowe 15/0.5-6.3 kV oraz 20/0.5-6.3 kV

KONWENCJE:
- rated_power_mva [MVA] — moc znamionowa
- voltage_hv_kv [kV] — napiecie strony gornej (WN lub SN)
- voltage_lv_kv [kV] — napiecie strony dolnej (SN lub nN)
- uk_percent [%] — napiecie zwarcia
- pk_kw [kW] — straty obciazeniowe (miedziane)
- i0_percent [%] — prad jalowy
- p0_kw [kW] — straty biegu jalowego (zelazne)
- vector_group — grupa polaczen (Yd11, Dyn11, Yd5, etc.)

GRUPY POLACZEN:
- Yd11: gwiazda-trojkat, przesun. 330 stopni (-30) — typowy WN/SN
- Dyn11: trojkat-gwiazda z N, przesun. 330 stopni — typowy SN/nN
- YNd11: gwiazda uziemiona-trojkat, przesun. 330 stopni — z uziemieniem

METADATA:
- verification_status: ZWERYFIKOWANY — parametry z kart katalogowych lub norm IEC
- catalog_status: PRODUKCYJNY_V1 — gotowy do uzycia w obliczeniach produkcyjnych
- source_reference: zrodlo danych (norma + katalog producenta)
- contract_version: "2.0" — zamrozony kontrakt katalogu

TYPOSZEREG PRZEMYSLOWY:
  WN/SN (110/15 kV): 10, 16, 25, 40, 63 MVA Yd11  — 5 mocy
  WN/SN (110/20 kV): 10, 16, 25, 40, 63 MVA Yd11  — 5 mocy
  SN/nN (15/0.4 kV): 63, 100, 160, 250, 400, 630, 1000, 1250, 1600, 2000, 2500 kVA Dyn11  — 11 mocy
  SN/nN (15/0.4 kV): 630, 1000 kVA Yd11  — 2 mocy specjalne
  SN/nN (20/0.4 kV): 63, 100, 160, 250, 400, 630, 1000, 1250, 1600 kVA Dyn11  — 9 mocy
  SN/nN (20/0.4 kV): 630, 1000 kVA Yd11  — 2 mocy specjalne
  SN/nN PV/BESS/FW: 15/0.5-6.3 kV i 20/0.5-6.3 kV - 142 rekordy referencyjne
  Razem: 176 rekordow
"""

from typing import Any

# =============================================================================
# TRANSFORMATORY WN/SN (110/15 kV) — Yd11
# Zrodlo: PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42
# =============================================================================

TRANSFORMER_WN_SN_110_15: list[dict[str, Any]] = [
    {
        "id": "tr-wn-sn-110-15-10mva-yd11",
        "name": "TR 110/15 kV 10 MVA Yd11",
        "params": {
            "rated_power_mva": 10.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 15.0,
            "uk_percent": 10.0,
            "pk_kw": 60.0,
            "i0_percent": 0.5,
            "p0_kw": 13.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-wn-sn-110-15-16mva-yd11",
        "name": "TR 110/15 kV 16 MVA Yd11",
        "params": {
            "rated_power_mva": 16.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 15.0,
            "uk_percent": 10.5,
            "pk_kw": 85.0,
            "i0_percent": 0.4,
            "p0_kw": 18.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-wn-sn-110-15-25mva-yd11",
        "name": "TR 110/15 kV 25 MVA Yd11",
        "params": {
            "rated_power_mva": 25.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 15.0,
            "uk_percent": 11.0,
            "pk_kw": 120.0,
            "i0_percent": 0.35,
            "p0_kw": 25.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-wn-sn-110-15-40mva-yd11",
        "name": "TR 110/15 kV 40 MVA Yd11",
        "params": {
            "rated_power_mva": 40.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 15.0,
            "uk_percent": 11.5,
            "pk_kw": 175.0,
            "i0_percent": 0.3,
            "p0_kw": 35.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN/ONAF",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-wn-sn-110-15-63mva-yd11",
        "name": "TR 110/15 kV 63 MVA Yd11",
        "params": {
            "rated_power_mva": 63.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 15.0,
            "uk_percent": 12.0,
            "pk_kw": 260.0,
            "i0_percent": 0.25,
            "p0_kw": 50.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAF",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42",
            "contract_version": "2.0",
        },
    },
]


# =============================================================================
# TRANSFORMATORY WN/SN (110/20 kV) — Yd11
# Zrodlo: PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42
# =============================================================================

TRANSFORMER_WN_SN_110_20: list[dict[str, Any]] = [
    {
        "id": "tr-wn-sn-110-20-10mva-yd11",
        "name": "TR 110/20 kV 10 MVA Yd11",
        "params": {
            "rated_power_mva": 10.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 20.0,
            "uk_percent": 10.0,
            "pk_kw": 60.0,
            "i0_percent": 0.5,
            "p0_kw": 13.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-wn-sn-110-20-16mva-yd11",
        "name": "TR 110/20 kV 16 MVA Yd11",
        "params": {
            "rated_power_mva": 16.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 20.0,
            "uk_percent": 10.5,
            "pk_kw": 85.0,
            "i0_percent": 0.4,
            "p0_kw": 18.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-wn-sn-110-20-25mva-yd11",
        "name": "TR 110/20 kV 25 MVA Yd11",
        "params": {
            "rated_power_mva": 25.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 20.0,
            "uk_percent": 11.0,
            "pk_kw": 120.0,
            "i0_percent": 0.35,
            "p0_kw": 25.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-wn-sn-110-20-40mva-yd11",
        "name": "TR 110/20 kV 40 MVA Yd11",
        "params": {
            "rated_power_mva": 40.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 20.0,
            "uk_percent": 11.5,
            "pk_kw": 175.0,
            "i0_percent": 0.3,
            "p0_kw": 35.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN/ONAF",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-wn-sn-110-20-63mva-yd11",
        "name": "TR 110/20 kV 63 MVA Yd11",
        "params": {
            "rated_power_mva": 63.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 20.0,
            "uk_percent": 12.0,
            "pk_kw": 260.0,
            "i0_percent": 0.25,
            "p0_kw": 50.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAF",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42",
            "contract_version": "2.0",
        },
    },
]


# =============================================================================
# TRANSFORMATORY SN/nN (15/0.4 kV) — Dyn11
# Zrodlo: PN-EN 60076-11:2004 Tabl.A + Rozporzadzenie UE 2019/1783 Tier 2
#         ABB katalog dystrybucyjny RESIBLOC / Trafo Zywiec
# Obejmuje pelny typoszereg: 63, 100, 160, 250, 400, 630, 1000, 1250, 1600, 2000, 2500 kVA
# =============================================================================

TRANSFORMER_SN_NN_15_04_DYN11: list[dict[str, Any]] = [
    {
        "id": "tr-sn-nn-15-04-63kva-dyn11",
        "name": "TR 15/0.4 kV 63 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.063,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.0,
            "pk_kw": 1.35,
            "i0_percent": 2.8,
            "p0_kw": 0.20,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-15-04-100kva-dyn11",
        "name": "TR 15/0.4 kV 100 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.100,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.0,
            "pk_kw": 2.15,
            "i0_percent": 2.5,
            "p0_kw": 0.30,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-15-04-160kva-dyn11",
        "name": "TR 15/0.4 kV 160 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.160,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.0,
            "pk_kw": 3.10,
            "i0_percent": 2.3,
            "p0_kw": 0.46,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-15-04-250kva-dyn11",
        "name": "TR 15/0.4 kV 250 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.250,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.5,
            "pk_kw": 4.20,
            "i0_percent": 2.0,
            "p0_kw": 0.61,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-15-04-400kva-dyn11",
        "name": "TR 15/0.4 kV 400 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.400,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.5,
            "pk_kw": 5.75,
            "i0_percent": 1.8,
            "p0_kw": 0.93,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-15-04-630kva-dyn11",
        "name": "TR 15/0.4 kV 630 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.630,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 5.0,
            "pk_kw": 8.00,
            "i0_percent": 1.5,
            "p0_kw": 1.30,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-15-04-1000kva-dyn11",
        "name": "TR 15/0.4 kV 1000 kVA Dyn11",
        "params": {
            "rated_power_mva": 1.000,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 11.00,
            "i0_percent": 1.2,
            "p0_kw": 1.70,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-15-04-1250kva-dyn11",
        "name": "TR 15/0.4 kV 1250 kVA Dyn11",
        "params": {
            "rated_power_mva": 1.250,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 13.50,
            "i0_percent": 1.0,
            "p0_kw": 2.10,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A + UE 2019/1783 Tier 2 / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-15-04-1600kva-dyn11",
        "name": "TR 15/0.4 kV 1600 kVA Dyn11",
        "params": {
            "rated_power_mva": 1.600,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 17.00,
            "i0_percent": 0.9,
            "p0_kw": 2.50,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A + UE 2019/1783 Tier 2 / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-15-04-2000kva-dyn11",
        "name": "TR 15/0.4 kV 2000 kVA Dyn11",
        "params": {
            "rated_power_mva": 2.000,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 21.00,
            "i0_percent": 0.8,
            "p0_kw": 3.00,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN/ONAF",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A + UE 2019/1783 Tier 2 / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-15-04-2500kva-dyn11",
        "name": "TR 15/0.4 kV 2500 kVA Dyn11",
        "params": {
            "rated_power_mva": 2.500,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 26.00,
            "i0_percent": 0.7,
            "p0_kw": 3.70,
            "vector_group": "Dyn11",
            "cooling_class": "ONAF",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A + UE 2019/1783 Tier 2 / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
]


# =============================================================================
# TRANSFORMATORY SN/nN (20/0.4 kV) — Dyn11
# Zrodlo: PN-EN 60076-11:2004 / Trafo Zywiec / ABB katalog dystrybucyjny
# Obejmuje pelny typoszereg: 63, 100, 160, 250, 400, 630, 1000, 1250, 1600 kVA
# =============================================================================

TRANSFORMER_SN_NN_20_04_DYN11: list[dict[str, Any]] = [
    {
        "id": "tr-sn-nn-20-04-63kva-dyn11",
        "name": "TR 20/0.4 kV 63 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.063,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.0,
            "pk_kw": 1.35,
            "i0_percent": 2.8,
            "p0_kw": 0.20,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "Trafo Zywiec",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / Trafo Zywiec katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-20-04-100kva-dyn11",
        "name": "TR 20/0.4 kV 100 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.100,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.0,
            "pk_kw": 2.15,
            "i0_percent": 2.5,
            "p0_kw": 0.30,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-20-04-160kva-dyn11",
        "name": "TR 20/0.4 kV 160 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.160,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.0,
            "pk_kw": 3.10,
            "i0_percent": 2.3,
            "p0_kw": 0.46,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "Trafo Zywiec",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / Trafo Zywiec katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-20-04-250kva-dyn11",
        "name": "TR 20/0.4 kV 250 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.250,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.5,
            "pk_kw": 4.20,
            "i0_percent": 2.0,
            "p0_kw": 0.61,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-20-04-400kva-dyn11",
        "name": "TR 20/0.4 kV 400 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.400,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.5,
            "pk_kw": 5.75,
            "i0_percent": 1.8,
            "p0_kw": 0.93,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-20-04-630kva-dyn11",
        "name": "TR 20/0.4 kV 630 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.630,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 5.0,
            "pk_kw": 8.00,
            "i0_percent": 1.5,
            "p0_kw": 1.30,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-20-04-1000kva-dyn11",
        "name": "TR 20/0.4 kV 1000 kVA Dyn11",
        "params": {
            "rated_power_mva": 1.000,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 11.00,
            "i0_percent": 1.2,
            "p0_kw": 1.70,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-20-04-1250kva-dyn11",
        "name": "TR 20/0.4 kV 1250 kVA Dyn11",
        "params": {
            "rated_power_mva": 1.250,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 13.50,
            "i0_percent": 1.0,
            "p0_kw": 2.10,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A + UE 2019/1783 Tier 2 / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-20-04-1600kva-dyn11",
        "name": "TR 20/0.4 kV 1600 kVA Dyn11",
        "params": {
            "rated_power_mva": 1.600,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 17.00,
            "i0_percent": 0.9,
            "p0_kw": 2.50,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN/ONAF",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A + UE 2019/1783 Tier 2 / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
]


# =============================================================================
# TRANSFORMATORY SN/nN — Yd11 (specjalne, wyzsze moce, bez punktu neutralnego)
# Zrodlo: PN-EN 60076-11:2004 / ABB katalog dystrybucyjny
# =============================================================================

TRANSFORMER_SN_NN_15_04_YD11: list[dict[str, Any]] = [
    {
        "id": "tr-sn-nn-15-04-630kva-yd11",
        "name": "TR 15/0.4 kV 630 kVA Yd11",
        "params": {
            "rated_power_mva": 0.630,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 5.0,
            "pk_kw": 8.00,
            "i0_percent": 1.5,
            "p0_kw": 1.30,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-15-04-1000kva-yd11",
        "name": "TR 15/0.4 kV 1000 kVA Yd11",
        "params": {
            "rated_power_mva": 1.000,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 11.00,
            "i0_percent": 1.2,
            "p0_kw": 1.70,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
]


TRANSFORMER_SN_NN_20_04_YD11: list[dict[str, Any]] = [
    {
        "id": "tr-sn-nn-20-04-630kva-yd11",
        "name": "TR 20/0.4 kV 630 kVA Yd11",
        "params": {
            "rated_power_mva": 0.630,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 5.0,
            "pk_kw": 8.00,
            "i0_percent": 1.5,
            "p0_kw": 1.30,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
    {
        "id": "tr-sn-nn-20-04-1000kva-yd11",
        "name": "TR 20/0.4 kV 1000 kVA Yd11",
        "params": {
            "rated_power_mva": 1.000,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 11.00,
            "i0_percent": 1.2,
            "p0_kw": 1.70,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": "PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog",
            "contract_version": "2.0",
        },
    },
]


# =============================================================================
# TRANSFORMATORY SN/nN DLA ZRODEL FALOWNIKOWYCH PV / BESS / FW
# =============================================================================

_INVERTER_LV_VOLTAGES_KV = (0.5, 0.69, 0.8, 1.0, 3.15, 6.0, 6.3)
_INVERTER_TR_POWER_MVA_LOW_LV = (0.5, 0.63, 0.8, 1.0, 1.25, 1.6, 2.0, 2.5, 3.15, 4.0, 5.0)
_INVERTER_TR_POWER_MVA_MEDIUM_LV = (1.0, 1.6, 2.5, 3.15, 4.0, 5.0, 6.3, 8.0, 10.0)


def _catalog_token(value: float) -> str:
    text = f"{value:g}".replace(".", "p")
    return text


def _kva_label(power_mva: float) -> str:
    kva = power_mva * 1000
    return f"{int(kva)} kVA" if kva < 1000 else f"{power_mva:g} MVA"


def _estimate_inverter_transformer_params(power_mva: float) -> dict[str, float]:
    if power_mva <= 0.63:
        return {"uk_percent": 5.0, "pk_kw_per_mva": 12.7, "p0_kw_per_mva": 2.1, "i0_percent": 1.5}
    if power_mva <= 1.6:
        return {"uk_percent": 6.0, "pk_kw_per_mva": 11.0, "p0_kw_per_mva": 1.7, "i0_percent": 1.2}
    if power_mva <= 3.15:
        return {"uk_percent": 6.0, "pk_kw_per_mva": 10.5, "p0_kw_per_mva": 1.5, "i0_percent": 1.0}
    if power_mva <= 6.3:
        return {"uk_percent": 7.0, "pk_kw_per_mva": 9.5, "p0_kw_per_mva": 1.2, "i0_percent": 0.8}
    return {"uk_percent": 8.0, "pk_kw_per_mva": 8.8, "p0_kw_per_mva": 1.0, "i0_percent": 0.7}


def _build_inverter_transformer_types(sn_voltage_kv: float, lv_voltage_kv: float) -> list[dict[str, Any]]:
    power_ratings = (
        _INVERTER_TR_POWER_MVA_LOW_LV
        if lv_voltage_kv <= 1.0
        else _INVERTER_TR_POWER_MVA_MEDIUM_LV
    )
    records: list[dict[str, Any]] = []
    sn_token = _catalog_token(sn_voltage_kv)
    lv_token = _catalog_token(lv_voltage_kv)
    for power_mva in power_ratings:
        power_token = _catalog_token(power_mva)
        params = _estimate_inverter_transformer_params(power_mva)
        records.append(
            {
                "id": f"tr-sn-nn-{sn_token}-{lv_token}-{power_token}mva-dyn11-inverter",
                "name": (
                    f"TR {sn_voltage_kv:g}/{lv_voltage_kv:g} kV "
                    f"{_kva_label(power_mva)} Dyn11 PV/BESS/FW"
                ),
                "params": {
                    "rated_power_mva": power_mva,
                    "voltage_hv_kv": sn_voltage_kv,
                    "voltage_lv_kv": lv_voltage_kv,
                    "uk_percent": params["uk_percent"],
                    "pk_kw": round(power_mva * params["pk_kw_per_mva"], 2),
                    "i0_percent": params["i0_percent"],
                    "p0_kw": round(power_mva * params["p0_kw_per_mva"], 2),
                    "vector_group": "Dyn11",
                    "cooling_class": "ONAN/ONAF" if power_mva >= 2.0 else "ONAN",
                    "tap_min": -2,
                    "tap_max": 2,
                    "tap_step_percent": 2.5,
                    "manufacturer": "MV-DESIGN-PRO reference",
                    "standard": "PN-EN 60076-11 / IEC 60076-16",
                    "verification_status": "REFERENCYJNY",
                    "catalog_status": "REFERENCYJNY_V1",
                    "source_reference": (
                        "Referencyjny typoszereg transformatorow blokowych "
                        "dla falownikow PV/BESS/FW"
                    ),
                    "contract_version": "2.0",
                    "verification_note": (
                        "Profil referencyjny do doboru wariantowego; parametry strat "
                        "i uk% wymagaja potwierdzenia karta producenta w projekcie wykonawczym."
                    ),
                },
            }
        )
    return records


TRANSFORMER_SN_NN_INVERTER_BLOCK: list[dict[str, Any]] = [
    record
    for _sn_voltage in (15.0, 20.0)
    for _lv_voltage in _INVERTER_LV_VOLTAGES_KV
    for record in _build_inverter_transformer_types(_sn_voltage, _lv_voltage)
]


# =============================================================================
# FUNKCJE DOSTEPU
# =============================================================================


def get_all_transformer_types() -> list[dict[str, Any]]:
    """Zwraca wszystkie typy transformatorow w katalogu."""
    return (
        TRANSFORMER_WN_SN_110_15
        + TRANSFORMER_WN_SN_110_20
        + TRANSFORMER_SN_NN_15_04_DYN11
        + TRANSFORMER_SN_NN_20_04_DYN11
        + TRANSFORMER_SN_NN_15_04_YD11
        + TRANSFORMER_SN_NN_20_04_YD11
        + TRANSFORMER_SN_NN_INVERTER_BLOCK
        + TRANSFORMER_POLISH_PTPIRE  # K30-18 Polish manufacturer expansion
    )


def get_wn_sn_transformer_types() -> list[dict[str, Any]]:
    """Zwraca transformatory WN/SN (110/15 kV i 110/20 kV)."""
    return TRANSFORMER_WN_SN_110_15 + TRANSFORMER_WN_SN_110_20


def get_sn_nn_transformer_types() -> list[dict[str, Any]]:
    """Zwraca transformatory SN/nN dystrybucyjne i falownikowe PV/BESS/FW."""
    return (
        TRANSFORMER_SN_NN_15_04_DYN11
        + TRANSFORMER_SN_NN_20_04_DYN11
        + TRANSFORMER_SN_NN_15_04_YD11
        + TRANSFORMER_SN_NN_20_04_YD11
        + TRANSFORMER_SN_NN_INVERTER_BLOCK
        + TRANSFORMER_POLISH_PTPIRE  # K30-18 Polish manufacturer expansion (SN/nN)
    )


def get_transformer_catalog_statistics() -> dict[str, Any]:
    """Zwraca statystyki katalogu transformatorow."""
    all_types = get_all_transformer_types()
    wn_sn = get_wn_sn_transformer_types()
    sn_nn = get_sn_nn_transformer_types()

    vector_groups = sorted({t["params"]["vector_group"] for t in all_types})
    power_ratings = sorted({t["params"]["rated_power_mva"] for t in all_types})

    return {
        "liczba_transformatorow_ogolem": len(all_types),
        "liczba_wn_sn": len(wn_sn),
        "liczba_sn_nn": len(sn_nn),
        "statusy_weryfikacji": sorted({t["params"]["verification_status"] for t in all_types}),
        "statusy_katalogowe": sorted({t["params"]["catalog_status"] for t in all_types}),
        "grupy_polaczen": vector_groups,
        "moce_znamionowe_mva": power_ratings,
        "producenci": ["ZREW Transformatory", "ABB", "Trafo Zywiec", "MV-DESIGN-PRO reference"],
        "napiecia_wn_sn": ["110/15 kV", "110/20 kV"],
        "napiecia_sn_nn": [
            "15/0.4 kV",
            "20/0.4 kV",
            "15/0.5-6.3 kV PV/BESS/FW",
            "20/0.5-6.3 kV PV/BESS/FW",
        ],
    }


def get_transformer_catalog_quality_summary() -> dict[str, Any]:
    """Zwraca jawne metadane jakosci dla katalogu transformatorow."""
    all_types = get_all_transformer_types()
    verified = sum(
        1 for item in all_types if item["params"]["verification_status"] == "ZWERYFIKOWANY"
    )
    unverified = sum(
        1 for item in all_types if item["params"]["verification_status"] == "NIEWERYFIKOWANY"
    )

    return {
        "liczba_transformatorow_ogolem": len(all_types),
        "liczba_zweryfikowanych": verified,
        "liczba_nieweryfikowanych": unverified,
        "statusy_weryfikacji": sorted({t["params"]["verification_status"] for t in all_types}),
        "statusy_katalogowe": sorted({t["params"]["catalog_status"] for t in all_types}),
        "contract_version": "2.0",
    }


# =============================================================================
# K30-18: TRANSFORMATORY SN/NN — POLSCY PRODUCENCI Z PTPiRE RECEPTKAMI
# =============================================================================
#
# Dane producentów polskich:
# - WZL Kędzierzyn-Koźle: rodzina TPMnR (Transformator Przemysłowy MnR),
#   typoszereg 250-1600 kVA Dyn11, hermetyzowany olejowy zgodny z PTPiRE.
# - ZPUE Trafo Włoszczowa: transformatory hermetyczne TZH/TZE 100-2500 kVA
# - Energen Polska: transformatory hermetycznym suchymi (TONr, TRn)
# - Trafocomp: pełen typoszereg
#
# Wszystkie zgodne z PN-EN 60076-1 oraz Rozporzadzeniem UE 2019/1783 (Tier 2).

def _polish_transformer(
    item_id: str,
    name: str,
    manufacturer: str,
    rated_kva: int,
    uk_percent: float,
    pk_kw: float,
    p0_kw: float,
    i0_percent: float,
    *,
    voltage_hv_kv: float = 15.0,
    voltage_lv_kv: float = 0.4,
    vector_group: str = "Dyn11",
    series: str = "",
    source_reference: str = "Karta katalogowa producenta / PTPiRE",
) -> dict[str, Any]:
    return {
        "id": item_id,
        "name": name,
        "params": {
            "rated_power_mva": rated_kva / 1000.0,
            "voltage_hv_kv": voltage_hv_kv,
            "voltage_lv_kv": voltage_lv_kv,
            "uk_percent": uk_percent,
            "pk_kw": pk_kw,
            "i0_percent": i0_percent,
            "p0_kw": p0_kw,
            "vector_group": vector_group,
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": manufacturer,
            "series": series,
            "standard": "PN-EN 60076-11:2004 + EU 2019/1783 Tier 2",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": source_reference,
            "contract_version": "2.0",
            "ptpire_certified": True,
        },
    }


TRANSFORMER_POLISH_PTPIRE: list[dict[str, Any]] = [
    # WZL Kedzierzyn-Kozle — rodzina TPMnR (Transformator Przemyslowy MnR)
    _polish_transformer(
        "wzl-tpmnr-250-15-04",
        "WZL TPMnR 250 kVA 15/0.4 kV Dyn11",
        "WZL Kędzierzyn-Koźle",
        rated_kva=250, uk_percent=4.0, pk_kw=3.25, p0_kw=0.43, i0_percent=2.0,
        series="TPMnR",
        source_reference="WZL Kędzierzyn-Koźle katalog TPMnR 2024 / Rozp. UE 2019/1783 Tier 2",
    ),
    _polish_transformer(
        "wzl-tpmnr-400-15-04",
        "WZL TPMnR 400 kVA 15/0.4 kV Dyn11",
        "WZL Kędzierzyn-Koźle",
        rated_kva=400, uk_percent=4.0, pk_kw=4.6, p0_kw=0.61, i0_percent=1.6,
        series="TPMnR",
        source_reference="WZL Kędzierzyn-Koźle katalog TPMnR 2024 / Rozp. UE 2019/1783 Tier 2",
    ),
    _polish_transformer(
        "wzl-tpmnr-630-15-04",
        "WZL TPMnR 630 kVA 15/0.4 kV Dyn11",
        "WZL Kędzierzyn-Koźle",
        rated_kva=630, uk_percent=4.0, pk_kw=6.3, p0_kw=0.85, i0_percent=1.3,
        series="TPMnR",
        source_reference="WZL Kędzierzyn-Koźle katalog TPMnR 2024 / Rozp. UE 2019/1783 Tier 2",
    ),
    _polish_transformer(
        "wzl-tpmnr-1000-15-04",
        "WZL TPMnR 1000 kVA 15/0.4 kV Dyn11",
        "WZL Kędzierzyn-Koźle",
        rated_kva=1000, uk_percent=6.0, pk_kw=9.0, p0_kw=1.25, i0_percent=1.1,
        series="TPMnR",
        source_reference="WZL Kędzierzyn-Koźle katalog TPMnR 2024 / Rozp. UE 2019/1783 Tier 2",
    ),
    _polish_transformer(
        "wzl-tpmnr-1600-15-04",
        "WZL TPMnR 1600 kVA 15/0.4 kV Dyn11",
        "WZL Kędzierzyn-Koźle",
        rated_kva=1600, uk_percent=6.0, pk_kw=13.5, p0_kw=1.85, i0_percent=0.9,
        series="TPMnR",
        source_reference="WZL Kędzierzyn-Koźle katalog TPMnR 2024 / Rozp. UE 2019/1783 Tier 2",
    ),
    # ZPUE Trafo Wloszczowa — TZH/TZE hermetyczne
    _polish_transformer(
        "zpue-tzh-100-15-04",
        "ZPUE TZH 100 kVA 15/0.4 kV Dyn11 (hermetyczny)",
        "ZPUE Trafo Włoszczowa",
        rated_kva=100, uk_percent=4.0, pk_kw=1.75, p0_kw=0.21, i0_percent=2.5,
        series="TZH",
        source_reference="ZPUE Trafo katalog TZH/TZE 2024 / PTPiRE WiPWC",
    ),
    _polish_transformer(
        "zpue-tzh-250-15-04",
        "ZPUE TZH 250 kVA 15/0.4 kV Dyn11 (hermetyczny)",
        "ZPUE Trafo Włoszczowa",
        rated_kva=250, uk_percent=4.0, pk_kw=3.10, p0_kw=0.40, i0_percent=2.0,
        series="TZH",
        source_reference="ZPUE Trafo katalog TZH/TZE 2024 / PTPiRE WiPWC",
    ),
    _polish_transformer(
        "zpue-tzh-400-15-04",
        "ZPUE TZH 400 kVA 15/0.4 kV Dyn11 (hermetyczny)",
        "ZPUE Trafo Włoszczowa",
        rated_kva=400, uk_percent=4.0, pk_kw=4.40, p0_kw=0.59, i0_percent=1.6,
        series="TZH",
        source_reference="ZPUE Trafo katalog TZH/TZE 2024 / PTPiRE WiPWC",
    ),
    _polish_transformer(
        "zpue-tzh-630-15-04",
        "ZPUE TZH 630 kVA 15/0.4 kV Dyn11 (hermetyczny)",
        "ZPUE Trafo Włoszczowa",
        rated_kva=630, uk_percent=4.0, pk_kw=6.10, p0_kw=0.81, i0_percent=1.3,
        series="TZH",
        source_reference="ZPUE Trafo katalog TZH/TZE 2024 / PTPiRE WiPWC",
    ),
    _polish_transformer(
        "zpue-tzh-1000-15-04",
        "ZPUE TZH 1000 kVA 15/0.4 kV Dyn11 (hermetyczny)",
        "ZPUE Trafo Włoszczowa",
        rated_kva=1000, uk_percent=6.0, pk_kw=8.70, p0_kw=1.20, i0_percent=1.1,
        series="TZH",
        source_reference="ZPUE Trafo katalog TZH/TZE 2024 / PTPiRE WiPWC",
    ),
    # Energen Polska — TONr suche zywiczne
    _polish_transformer(
        "energen-tonr-630-15-04",
        "Energen TONr 630 kVA 15/0.4 kV Dyn11 (suchy)",
        "Energen Polska",
        rated_kva=630, uk_percent=6.0, pk_kw=6.50, p0_kw=1.20, i0_percent=1.4,
        series="TONr",
        source_reference="Energen Polska katalog TONr 2024 / IEC 60076-11",
    ),
    _polish_transformer(
        "energen-tonr-1000-15-04",
        "Energen TONr 1000 kVA 15/0.4 kV Dyn11 (suchy)",
        "Energen Polska",
        rated_kva=1000, uk_percent=6.0, pk_kw=9.40, p0_kw=1.70, i0_percent=1.2,
        series="TONr",
        source_reference="Energen Polska katalog TONr 2024 / IEC 60076-11",
    ),
    _polish_transformer(
        "energen-tonr-1600-15-04",
        "Energen TONr 1600 kVA 15/0.4 kV Dyn11 (suchy)",
        "Energen Polska",
        rated_kva=1600, uk_percent=6.0, pk_kw=13.0, p0_kw=2.40, i0_percent=1.0,
        series="TONr",
        source_reference="Energen Polska katalog TONr 2024 / IEC 60076-11",
    ),
    # Trafocomp - typowe rozmiary
    _polish_transformer(
        "trafocomp-t-160-15-04",
        "Trafocomp T 160 kVA 15/0.4 kV Dyn11",
        "Trafocomp",
        rated_kva=160, uk_percent=4.0, pk_kw=2.4, p0_kw=0.30, i0_percent=2.3,
        series="T",
        source_reference="Trafocomp katalog 2024",
    ),
    _polish_transformer(
        "trafocomp-t-400-15-04",
        "Trafocomp T 400 kVA 15/0.4 kV Dyn11",
        "Trafocomp",
        rated_kva=400, uk_percent=4.0, pk_kw=4.5, p0_kw=0.60, i0_percent=1.6,
        series="T",
        source_reference="Trafocomp katalog 2024",
    ),
    _polish_transformer(
        "trafocomp-t-1000-15-04",
        "Trafocomp T 1000 kVA 15/0.4 kV Dyn11",
        "Trafocomp",
        rated_kva=1000, uk_percent=6.0, pk_kw=9.0, p0_kw=1.25, i0_percent=1.1,
        series="T",
        source_reference="Trafocomp katalog 2024",
    ),
]
