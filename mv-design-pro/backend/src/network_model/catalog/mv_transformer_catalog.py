"""
Katalog transformatorow SN — dane tabliczkowe i zwarciowe.

ZRODLA DANYCH:
- Transformatory WN/SN (110/15 kV, 110/20 kV):
    PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42
- Transformatory SN/nN (15/0.4 kV, 20/0.4 kV):
    PN-EN 60076-11:2004 Tabl.A + Rozporzadzenie UE 2019/1783 Tier 2 / ABB katalog dystrybucyjny

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
  Razem: 34 rekordy
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
# FUNKCJE DOSTEPU
# =============================================================================


def get_all_transformer_types() -> list[dict[str, Any]]:
    """Zwraca wszystkie typy transformatorow w katalogu (34 rekordy)."""
    return (
        TRANSFORMER_WN_SN_110_15
        + TRANSFORMER_WN_SN_110_20
        + TRANSFORMER_SN_NN_15_04_DYN11
        + TRANSFORMER_SN_NN_20_04_DYN11
        + TRANSFORMER_SN_NN_15_04_YD11
        + TRANSFORMER_SN_NN_20_04_YD11
    )


def get_wn_sn_transformer_types() -> list[dict[str, Any]]:
    """Zwraca transformatory WN/SN (110/15 kV i 110/20 kV)."""
    return TRANSFORMER_WN_SN_110_15 + TRANSFORMER_WN_SN_110_20


def get_sn_nn_transformer_types() -> list[dict[str, Any]]:
    """Zwraca transformatory SN/nN (15/0.4 kV i 20/0.4 kV)."""
    return (
        TRANSFORMER_SN_NN_15_04_DYN11
        + TRANSFORMER_SN_NN_20_04_DYN11
        + TRANSFORMER_SN_NN_15_04_YD11
        + TRANSFORMER_SN_NN_20_04_YD11
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
        "producenci": ["ZREW Transformatory", "ABB", "Trafo Zywiec"],
        "napiecia_wn_sn": ["110/15 kV", "110/20 kV"],
        "napiecia_sn_nn": ["15/0.4 kV", "20/0.4 kV"],
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
